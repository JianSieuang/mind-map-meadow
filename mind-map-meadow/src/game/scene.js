import Phaser from "phaser";
import { MAP_CONFIG, KEY_CONTROLS, ASSET_REGISTRY, CHARACTER_ASSETS, UI_ASSETS, DEPTH } from "./config";
import { renderBuilding, updateBuilding, destroyBuildingSprite, refreshAttachments, updateAttachmentsPerFrame, normalizeBuilding, refreshTint } from "./buildings";
import { createTextLayer, removeTextLayer } from "./textLayer";
import { BOTTOM_MARGIN, TOP_MARGIN, createGround, createPlacementGrid, createZoneOverlay, drawZone } from "./ground";
import {
    beginGroundPress,
    cancelWalk,
    createRecentreButton,
    edgeScroll,
    endGroundPress,
    followPlayer,
    positionRecentreButton,
    stepWalk,
    updateGroundPress,
    updateGroundPrompt,
} from "./controls";
import { createMinimap, panFromMinimap, updateMinimap } from "./minimap";
import { coinBurst, createSleepOverlay, flashSprite, mergeEffect, popSprite, resizeSleepOverlay, showSleepOverlay, updateSleepOverlay, zoneExpandPop } from "./fx";
import {
    abandonDrag,
    beginDrag,
    beginPlacement,
    cancelDrag,
    confirmPlacement,
    createFootprintMarker,
    endDrag,
    finishPlacement,
    rejectDrop,
    updateDrag,
    updatePlacement,
} from "./placement";

export class MeadowScene extends Phaser.Scene {
    constructor(socket, onBuildingInspect, onMapClick, onPlacementEnd) {
        super("MeadowScene");
        this.socket = socket;
        this.onBuildingInspect = onBuildingInspect;
        this.onMapClick = onMapClick;
        this.onPlacementEnd = onPlacementEnd;
        this.isReady = false;
        this.isVisiting = false;
        this.zone = null;
        this.sleepy = false;
        this.placement = null;
        this.dragState = null;
        this.pendingDrop = null;
        this.pressedSprite = null;
        this.groundPress = null;
        this.walkTarget = null;
        this.sleepAtMs = null; // when the town falls asleep, on this browser's clock
        this.lastBuilderRev = 0;
        this.payloadRevs = new WeakMap(); // builder.placed / builder.zone -> the rev that carried them
    }

    preload() {
        Object.entries(ASSET_REGISTRY).forEach(([key, asset]) => {
            try {
                const assetUrl = new URL(`../assets/${asset.path}`, import.meta.url).href;
                this.load.image(`${key.toLowerCase()}_asset`, assetUrl);
            } catch (err) {
                console.error(`❌ [Asset Preloader Failure] Could not load nested target file mapping at ${asset.path}:`, err.message);
            }
        });
        Object.entries(UI_ASSETS).forEach(([key, path]) => {
            this.load.image(key, new URL(`../assets/${path}`, import.meta.url).href);
        });

        this.load.image("player_character", CHARACTER_ASSETS.player);
        this.load.image("ai_companion_character", CHARACTER_ASSETS.aiCompanion);
    }

    create() {
        const scene = this;
        window.buildingsGroup = scene.add.group();

        // Fallback texture for any building whose asset_key isn't in ASSET_REGISTRY (or
        // whose image failed to load), so a bad row still shows up instead of being invisible.
        if (!scene.textures.exists("library_asset")) {
            const placeholder = scene.add.graphics();
            placeholder.fillStyle(0x5a3b6e, 1);
            placeholder.fillRoundedRect(0, 0, 48, 48, 8);
            placeholder.lineStyle(2, 0x2b1e1a, 1);
            placeholder.strokeRoundedRect(1, 1, 46, 46, 8);
            placeholder.generateTexture("library_asset", 48, 48);
            placeholder.destroy();
        }

        scene.activeGroundPrompt = null;
        scene.currentSelectedBuilding = null;
        createTextLayer(scene);

        scene.physics.world.setBounds(0, 0, MAP_CONFIG.WIDTH, MAP_CONFIG.HEIGHT);
        scene.cameras.main.setBounds(0, -TOP_MARGIN, MAP_CONFIG.WIDTH, MAP_CONFIG.HEIGHT + TOP_MARGIN + BOTTOM_MARGIN);

        createMinimap(scene);

        // ── Ground, placement grid, zone overlay, sleepy overlay ──
        createGround(scene);
        createPlacementGrid(scene);
        createZoneOverlay(scene);
        createFootprintMarker(scene);
        createSleepOverlay(scene);
        // A short threshold keeps a shaky tap a tap rather than a move; fingers shake more than mice.
        scene.input.dragDistanceThreshold = scene.sys.game.device.input.touch ? 10 : 6;

        // ── Visiting a friend's meadow: swap the rendered buildings for a
        // read-only snapshot of theirs, and block the ground "add task" prompt.
        // Leaving just re-requests our own init_state, which renders normally again.
        scene.enterVisitMode = (buildings, onInspect) => {
            finishPlacement(scene, false);
            cancelDrag(scene);
            scene.clearPendingDrop();
            scene.isVisiting = true;
            scene.clearAllBuildings();
            scene.clearActiveMenu();
            scene.clearGroundPrompt();
            drawZone(scene);
            showSleepOverlay(scene, false);
            (buildings || []).forEach((b) => scene.safeRenderBuilding(b, onInspect, { readOnly: true }));
        };

        scene.exitVisitMode = () => {
            scene.clearAllBuildings();
            scene.clearActiveMenu();
            scene.isVisiting = false;
            if (scene.isFreeLook) followPlayer(scene);
            drawZone(scene);
            showSleepOverlay(scene, scene.sleepy);
            scene.socket.emit("request_init_state");
        };

        scene.gridHighlight = scene.add.rectangle(0, 0, MAP_CONFIG.TILE_SIZE, MAP_CONFIG.TILE_SIZE, 0xffd65a, 0.2);
        scene.gridHighlight.setStrokeStyle(2, 0xffd65a).setVisible(false).setDepth(DEPTH.ZONE_LINE);
        scene.minimapCamera.ignore(scene.gridHighlight);

        window.inputKeys = scene.input.keyboard.addKeys({
            up: Phaser.Input.Keyboard.KeyCodes[KEY_CONTROLS.UP],
            down: Phaser.Input.Keyboard.KeyCodes[KEY_CONTROLS.DOWN],
            left: Phaser.Input.Keyboard.KeyCodes[KEY_CONTROLS.LEFT],
            right: Phaser.Input.Keyboard.KeyCodes[KEY_CONTROLS.RIGHT],
        });

        // 24x32 characters: the collision body is just the feet, so the head can overlap what's behind.
        window.player = scene.add.image(400, 300, "player_character");
        scene.physics.add.existing(window.player);
        window.player.body.setSize(16, 10);
        window.player.body.setOffset(4, 22);
        window.player.body.setCollideWorldBounds(true);

        window.aiCompanion = scene.add.image(500, 350, "ai_companion_character");

        // Oversized blips so player/AI stay visible once shrunk down by the minimap's zoom
        scene.playerBlip = scene.add.circle(window.player.x, window.player.y, 70, 0x60a5fa).setStrokeStyle(14, 0xffffff, 0.95).setDepth(10001);
        scene.cameras.main.ignore(scene.playerBlip);

        scene.aiBlip = scene.add.circle(window.aiCompanion.x, window.aiCompanion.y, 60, 0xf87171).setStrokeStyle(14, 0xffffff, 0.95).setDepth(10001);
        scene.cameras.main.ignore(scene.aiBlip);

        scene.physics.add.collider(window.player, window.buildingsGroup);
        scene.cameras.main.startFollow(window.player, true, 0.1, 0.1);
        createRecentreButton(scene);

        scene.clearActiveMenu = () => {
            const selected = scene.currentSelectedBuilding;
            scene.currentSelectedBuilding = null;
            if (selected && selected.active) refreshTint(scene, selected);
        };

        scene.clearGroundPrompt = () => {
            if (scene.activeGroundPrompt) {
                scene.activeGroundPrompt.destroy(true);
                scene.activeGroundPrompt = null;
            }
            scene.gridHighlight.setVisible(false);
        };

        // Render one building, isolating failures so a single bad row can't abort the
        // whole init_state loop (which would leave the meadow looking empty).
        const safeRenderBuilding = (b, onInspect, options) => {
            try {
                return renderBuilding(scene, b, onInspect, window.buildingsGroup, options);
            } catch (err) {
                console.error("❌ [Building Render Failed]:", b && b.id, err);
                return null;
            }
        };
        scene.safeRenderBuilding = safeRenderBuilding;

        scene.findBuildingSprite = (id) => window.buildingsGroup.getChildren().find((child) => child.getData("id") === id) || null;

        scene.clearAllBuildings = () => {
            [...window.buildingsGroup.getChildren()].forEach((child) => destroyBuildingSprite(scene, child));
        };

        // Add a new building or apply new data to the one already on screen, by id.
        scene.upsertBuilding = (raw) => {
            const existing = scene.findBuildingSprite(raw.id);
            try {
                if (existing) updateBuilding(scene, existing, raw);
                else return safeRenderBuilding(raw, scene.onBuildingInspect);
            } catch (err) {
                console.error("❌ [Building Update Failed]:", raw && raw.id, err);
            }
            return existing;
        };

        // ── A dropped building stays where it was dropped until the server answers ──
        scene.holdPendingDrop = (sprite) => {
            scene.clearPendingDrop();
            const id = sprite.getData("id");
            scene.pendingDrop = {
                id,
                timer: scene.time.delayedCall(3000, () => scene.revertPendingDrop()),
            };
        };
        scene.clearPendingDrop = () => {
            if (scene.pendingDrop) scene.pendingDrop.timer.remove(false);
            scene.pendingDrop = null;
        };
        scene.revertPendingDrop = () => {
            const pending = scene.pendingDrop;
            if (!pending) return;
            scene.clearPendingDrop();
            const sprite = scene.findBuildingSprite(pending.id);
            if (sprite) rejectDrop(scene, sprite);
        };
        scene.abandonDrag = () => abandonDrag(scene);

        // Network Socket Protocol Hook Channels.
        // Every handler is a named function removed by reference on shutdown/destroy —
        // the socket is shared with App.jsx, so never call socket.off(event) without a handler.
        // builder_state can arrive out of order: a payload older than the last one applied is dropped,
        // or a just-placed building would vanish. A new connection starts over (the old socket can't
        // deliver anything now, and a restarted server's clock is its own). App.jsx pushes the same
        // arrays into syncBuildings/setZone from a React effect, so they're remembered by identity.
        const acceptBuilder = (builder) => {
            if (typeof builder.rev !== "number") return true;
            if (builder.rev < scene.lastBuilderRev) return false;
            scene.lastBuilderRev = builder.rev;
            if (builder.placed) scene.payloadRevs.set(builder.placed, builder.rev);
            if (builder.zone) scene.payloadRevs.set(builder.zone, builder.rev);
            return true;
        };

        const applyBuilder = (builder) => {
            const untilSleep = Date.parse(builder.sleepyAt) - Date.parse(builder.serverNow);
            scene.sleepAtMs = Number.isFinite(untilSleep) ? Date.now() + Math.max(0, untilSleep) : null;
            if (builder.zone) scene.setZone(builder.zone);
            if (typeof builder.sleepy === "boolean") scene.setSleepy(builder.sleepy);
        };

        const onInitState = (state) => {
            if (!state) return;
            // A reconnect while touring a friend's meadow shouldn't swap their buildings
            // out for ours; leaving the visit re-requests init_state anyway.
            if (scene.isVisiting) return;
            if (state.player) window.player.setPosition(state.player.x, state.player.y);
            if (state.ai) window.aiCompanion.setPosition(state.ai.x, state.ai.y);
            cancelWalk(scene);
            scene.clearGroundPrompt();
            if (state.builder && !acceptBuilder(state.builder)) return; // a newer builder_state already landed
            if (state.builder) applyBuilder(state.builder);
            scene.syncBuildings(state.buildings || (state.builder && state.builder.placed) || []);
        };

        const onBuilderState = (builder) => {
            if (!builder || scene.isVisiting || !acceptBuilder(builder)) return;
            applyBuilder(builder);
            if (builder.placed) scene.syncBuildings(builder.placed);
        };

        const onStateUpdate = (state) => {
            if (state && state.ai) window.aiCompanion.setPosition(state.ai.x, state.ai.y);
        };

        // Savings-goal milestone: swap to the new stage texture and celebrate.
        const onBuildingUpdated = (data) => {
            if (scene.isVisiting) return; // friend's map on screen; leaving re-requests init_state
            const match = scene.findBuildingSprite(data.id);
            if (!match) return;
            updateBuilding(scene, match, { ...match.getData("building"), metadata: data.metadata || {} });
            flashSprite(scene, match);
            popSprite(scene, match);
        };

        const onBuildingRemoved = (data) => {
            if (scene.isVisiting) return; // friend's map on screen; leaving re-requests init_state
            const match = scene.findBuildingSprite(data.id);
            if (match) destroyBuildingSprite(scene, match);
        };

        // Works whichever arrives first, this or the builder_state that carries the same change.
        const onMergeDone = (data) => {
            if (scene.isVisiting || !data || !data.building) return;
            const retired = scene.findBuildingSprite(data.retiredId);
            if (retired) destroyBuildingSprite(scene, retired);
            const sprite = scene.upsertBuilding(data.building);
            if (sprite) mergeEffect(scene, sprite, normalizeBuilding(data.building).footprint);
        };

        const onCoinsCollected = (data) => {
            if (scene.isVisiting || !data) return;
            (data.items || []).forEach((item) => {
                if (!item.coins) return;
                const sprite = scene.findBuildingSprite(item.id);
                if (sprite) coinBurst(scene, sprite.x, sprite.y - sprite.height + 22, item.coins);
            });
        };

        const onZoneExpanded = (data) => {
            if (scene.isVisiting || !data || !data.zone) return;
            // builder_state may have landed first with the fuller zone (it knows the next step).
            if (!scene.zone || scene.zone.step === undefined || scene.zone.step < data.step) scene.setZone({ ...data.zone, step: data.step });
            zoneExpandPop(scene, data.zone);
        };

        const onBuilderError = () => {
            if (scene.isVisiting) return;
            scene.revertPendingDrop();
        };

        // Ask for the world snapshot on every (re)connect: a server restart or network blip
        // gives us a fresh server-side socket that has never sent us init_state.
        const requestInitState = () => {
            scene.lastBuilderRev = 0;
            scene.socket.emit("request_init_state");
        };

        const socketHandlers = {
            init_state: onInitState,
            builder_state: onBuilderState,
            state_update: onStateUpdate,
            building_updated: onBuildingUpdated,
            building_removed: onBuildingRemoved,
            merge_done: onMergeDone,
            coins_collected: onCoinsCollected,
            zone_expanded: onZoneExpanded,
            builder_error: onBuilderError,
            connect: requestInitState,
        };
        Object.entries(socketHandlers).forEach(([event, handler]) => scene.socket.on(event, handler));

        const onEscape = (event) => {
            if (event.key !== "Escape") return;
            if (scene.placement) finishPlacement(scene, false);
            if (scene.dragState) cancelDrag(scene);
            scene.clearGroundPrompt();
        };
        window.addEventListener("keydown", onEscape);

        // The canvas tracks its parent (Scale.RESIZE). Phaser resizes the main camera itself; App
        // re-places the minimap and the zone overlay is in world space, so only the full-screen
        // sleepy overlay and the right-pinned recentre button need telling.
        const onResize = (gameSize) => {
            resizeSleepOverlay(scene, gameSize.width, gameSize.height);
            positionRecentreButton(scene);
        };
        scene.scale.on("resize", onResize);

        let socketHandlersRemoved = false;
        const removeSocketHandlers = () => {
            if (socketHandlersRemoved) return;
            socketHandlersRemoved = true;
            Object.entries(socketHandlers).forEach(([event, handler]) => scene.socket.off(event, handler));
            window.removeEventListener("keydown", onEscape);
            scene.scale.off("resize", onResize);
            scene.activeGroundPrompt = null;
            removeTextLayer(scene); // the prompt and any floating text live in it
            scene.isReady = false;
        };
        scene.events.once("shutdown", removeSocketHandlers);
        scene.events.once("destroy", removeSocketHandlers);

        // Storage grows between server updates, so bubbles are re-checked on a slow beat.
        scene.time.addEvent({
            delay: 2000,
            loop: true,
            callback: () => window.buildingsGroup.getChildren().forEach((child) => refreshAttachments(scene, child)),
        });

        scene.input.on("dragstart", (pointer, gameObject) => {
            if (gameObject === scene.minimapDragZone) return;
            beginDrag(scene, pointer, gameObject);
        });

        scene.input.on("drag", (pointer, gameObject) => {
            if (gameObject === scene.minimapDragZone) {
                panFromMinimap(scene, pointer);
                return;
            }
            updateDrag(scene, pointer);
        });

        scene.input.on("dragend", (pointer, gameObject) => {
            if (gameObject === scene.minimapDragZone) return;
            endDrag(scene, pointer);
        });

        scene.input.on("pointermove", (pointer) => {
            if (scene.placement) scene.placement.tracksPointer = true;
            updateGroundPress(scene, pointer);
        });

        scene.input.on("pointerup", (pointer) => {
            if (scene.placement && scene.placement.armed) {
                scene.placement.armed = false;
                confirmPlacement(scene, pointer);
            }
            endGroundPress(scene, pointer, true);
        });

        // Released over a HUD element: the pan ends, but it was never a tap on the ground.
        scene.input.on("pointerupoutside", (pointer) => endGroundPress(scene, pointer, false));

        scene.input.on("pointerdown", (pointer, localObjects) => {
            if (localObjects.some((obj) => obj.getData("isUiElement"))) return;
            scene.pressedSprite = null;
            if (scene.placement) {
                scene.placement.armed = true;
                return;
            }
            if (scene.dragState) return;
            if (localObjects.length === 0) beginGroundPress(scene, pointer);
        });

        // Anything App sent before the scene finished loading.
        scene.isReady = true;
        drawZone(scene);
        showSleepOverlay(scene, scene.sleepy && !scene.isVisiting);

        // Every listener above is registered, so it's safe to ask now. If the socket isn't
        // connected yet, the "connect" handler above sends the request once it is (no
        // separate buffered emit, so we never get two snapshots on first load).
        if (scene.socket.connected) requestInitState();
    }

    update(time, delta) {
        if (!window.player || !window.player.body) return;
        let moved = false;
        const keyboardActive = this.input.keyboard.isActive();
        if (keyboardActive) {
            window.player.body.setVelocity(0);
            if (window.inputKeys.left.isDown) {
                window.player.body.setVelocityX(-MAP_CONFIG.PLAYER_SPEED);
                moved = true;
            }
            if (window.inputKeys.right.isDown) {
                window.player.body.setVelocityX(MAP_CONFIG.PLAYER_SPEED);
                moved = true;
            }
            if (window.inputKeys.up.isDown) {
                window.player.body.setVelocityY(-MAP_CONFIG.PLAYER_SPEED);
                moved = true;
            }
            if (window.inputKeys.down.isDown) {
                window.player.body.setVelocityY(MAP_CONFIG.PLAYER_SPEED);
                moved = true;
            }
        }
        if (moved) {
            // Keys take over from a walk, return the camera, and dismiss the "Create New Task" prompt.
            this.walkTarget = null;
            if (this.isFreeLook) followPlayer(this);
            if (this.activeGroundPrompt) this.clearGroundPrompt();
        } else if (!keyboardActive) {
            cancelWalk(this); // a form opened: App froze the controls and stopped the player
        } else {
            moved = stepWalk(this, delta);
        }
        if (moved) this.socket.emit("player_move", { x: window.player.x, y: window.player.y });

        updateGroundPrompt(this);

        window.buildingsGroup.getChildren().forEach((child) => updateAttachmentsPerFrame(this, child, time));

        updateMinimap(this);

        // Buildings set their own depth (footprint front edge) whenever they move. Characters
        // sort by their feet, 16px below their centre.
        window.player.setDepth(window.player.y + 16);
        window.aiCompanion.setDepth(window.aiCompanion.y + 16);

        if (edgeScroll(this, delta) && this.dragState) updateDrag(this, this.input.activePointer);
        updatePlacement(this);
        updateSleepOverlay(this, delta);
    }

    // ── API called by App.jsx. Safe to call before create() has run. ──

    // True for an array or object from a builder payload older than the last one the scene applied.
    isStalePayload(payload) {
        const rev = this.payloadRevs.get(payload);
        return rev !== undefined && rev < this.lastBuilderRev;
    }

    // placed: builder.placed (or init_state.buildings). Diffs by id: adds, updates and removes in
    // place, so nothing flickers. Ignored while a friend's meadow is on screen or before create()
    // (the scene pulls its own init_state once it's ready).
    syncBuildings(placed) {
        if (!this.isReady || this.isVisiting || !Array.isArray(placed) || this.isStalePayload(placed)) return;
        const incoming = placed.filter((b) => b && (b.state === undefined || b.state === "placed"));
        const ids = new Set(incoming.map((b) => b.id));
        [...window.buildingsGroup.getChildren()].forEach((child) => {
            if (!ids.has(child.getData("id"))) destroyBuildingSprite(this, child);
        });
        incoming.forEach((b) => this.upsertBuilding(b));
    }

    // zone: { step, x, y, w, h, next: { x, y, w, h, ... } | null }, in tiles. Kept if sent before create().
    setZone(zone) {
        if (zone && this.isStalePayload(zone)) return;
        const key = zone ? JSON.stringify([zone.x, zone.y, zone.w, zone.h, zone.next || null]) : "";
        const unchanged = key === this.zoneKey;
        this.zone = zone || null;
        this.zoneKey = key;
        if (this.isReady && !unchanged) drawZone(this);
    }

    setSleepy(sleepy) {
        const next = !!sleepy;
        if (next === this.sleepy) return;
        this.sleepy = next;
        if (!this.isReady) return;
        if (!this.isVisiting) showSleepOverlay(this, next);
        window.buildingsGroup.getChildren().forEach((child) => refreshAttachments(this, child));
    }

    // { buildingId, footprint, mode: "place"|"purchase", assetKey? }. assetKey draws the sprite in the
    // ghost (without it, only the footprint square shows). Returns false if it can't start right now.
    beginPlacement(options) {
        if (!this.isReady) return false;
        return beginPlacement(this, options);
    }

    cancelPlacement() {
        if (this.isReady) finishPlacement(this, false);
    }
}

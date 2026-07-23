import Phaser from "phaser";
import { MAP_CONFIG, KEY_CONTROLS, ASSET_REGISTRY, MINIMAP_CONFIG } from "./config";
import { renderBuilding } from "./buildings";

export class MeadowScene extends Phaser.Scene {
    constructor(socket, onBuildingInspect, onMapClick) {
        super("MeadowScene");
        this.socket = socket;
        this.onBuildingInspect = onBuildingInspect;
        this.onMapClick = onMapClick;
    }

    preload() {
        Object.entries(ASSET_REGISTRY).forEach(([key, asset]) => {
            try {
                const assetUrl = new URL(`../assets/${asset.path}`, import.meta.url).href;
                this.load.image(`${key.toLowerCase()}_asset`, assetUrl);
                console.log(`📦 [Asset Preloader] Dynamic registry linkage verified for: ${key}`);
            } catch (err) {
                console.error(`❌ [Asset Preloader Failure] Could not load nested target file mapping at ${asset.path}:`, err.message);
            }
        });
    }

    create() {
        const scene = this;
        window.buildingsGroup = scene.add.group();

        // Fallback texture for any building whose asset_key isn't in ASSET_REGISTRY (or
        // whose image failed to load) — without this, renderBuilding() falls back to a
        // "library_asset" key that was never actually loaded, leaving the sprite invisible.
        if (!scene.textures.exists("library_asset")) {
            const placeholder = scene.add.graphics();
            placeholder.fillStyle(0x8b5cf6, 1);
            placeholder.fillRoundedRect(0, 0, 48, 48, 8);
            placeholder.lineStyle(2, 0xffffff, 0.8);
            placeholder.strokeRoundedRect(0, 0, 48, 48, 8);
            placeholder.generateTexture("library_asset", 48, 48);
            placeholder.destroy();
        }

        scene.activeMenuUI = null;
        scene.activeGroundPrompt = null;
        scene.currentSelectedBuilding = null;

        scene.physics.world.setBounds(0, 0, MAP_CONFIG.WIDTH, MAP_CONFIG.HEIGHT);
        scene.cameras.main.setBounds(0, 0, MAP_CONFIG.WIDTH, MAP_CONFIG.HEIGHT);

        // ── Minimap camera: a second camera zoomed out to show the whole world ──
        scene.minimapZoom = Math.min(MINIMAP_CONFIG.WIDTH / MAP_CONFIG.WIDTH, MINIMAP_CONFIG.HEIGHT / MAP_CONFIG.HEIGHT);
        scene.minimapCamera = scene.cameras.add(MINIMAP_CONFIG.MARGIN_LEFT, MINIMAP_CONFIG.MARGIN_TOP, MINIMAP_CONFIG.WIDTH, MINIMAP_CONFIG.HEIGHT);
        scene.minimapCamera.setZoom(scene.minimapZoom);
        scene.minimapCamera.centerOn(MAP_CONFIG.WIDTH / 2, MAP_CONFIG.HEIGHT / 2);
        scene.minimapCamera.setBackgroundColor(0x0f2818);
        scene.minimapCamera.setName("minimap");

        // HUD-style panel behind/around the minimap viewport: drop shadow + rounded backing +
        // accent border. The camera viewport itself stays rectangular, but padding the backing
        // panel out a few px on every side lets its rounded corners peek around it, which reads
        // as a rounded minimap without needing a geometry mask on the camera.
        const padX = 7;
        const padTop = 7;
        const padBottom = 24; // extra room at the bottom for the label badge
        scene.minimapFrame = scene.add.graphics().setScrollFactor(0).setDepth(9997);
        scene.minimapFrame.fillStyle(0x000000, 0.35);
        scene.minimapFrame.fillRoundedRect(MINIMAP_CONFIG.MARGIN_LEFT - padX + 2, MINIMAP_CONFIG.MARGIN_TOP - padTop + 3, MINIMAP_CONFIG.WIDTH + padX * 2, MINIMAP_CONFIG.HEIGHT + padTop + padBottom, 14);
        scene.minimapFrame.fillStyle(0x141a1e, 0.95);
        scene.minimapFrame.fillRoundedRect(MINIMAP_CONFIG.MARGIN_LEFT - padX, MINIMAP_CONFIG.MARGIN_TOP - padTop, MINIMAP_CONFIG.WIDTH + padX * 2, MINIMAP_CONFIG.HEIGHT + padTop + padBottom, 14);
        scene.minimapFrame.lineStyle(2, 0xf1c40f, 0.85);
        scene.minimapFrame.strokeRoundedRect(MINIMAP_CONFIG.MARGIN_LEFT - padX, MINIMAP_CONFIG.MARGIN_TOP - padTop, MINIMAP_CONFIG.WIDTH + padX * 2, MINIMAP_CONFIG.HEIGHT + padTop + padBottom, 14);
        scene.minimapCamera.ignore(scene.minimapFrame);

        scene.minimapLabelBadge = scene.add
            .rectangle(MINIMAP_CONFIG.MARGIN_LEFT + MINIMAP_CONFIG.WIDTH / 2, MINIMAP_CONFIG.MARGIN_TOP + MINIMAP_CONFIG.HEIGHT + 10, MINIMAP_CONFIG.WIDTH - 20, 16, 0xf1c40f, 0.95)
            .setScrollFactor(0)
            .setDepth(9998);
        scene.minimapCamera.ignore(scene.minimapLabelBadge);

        scene.minimapLabel = scene.add
            .text(MINIMAP_CONFIG.MARGIN_LEFT + MINIMAP_CONFIG.WIDTH / 2, MINIMAP_CONFIG.MARGIN_TOP + MINIMAP_CONFIG.HEIGHT + 10, "🗺 MEADOW MAP", {
                fontSize: "9px",
                fontFamily: "sans-serif",
                fontWeight: "bold",
                color: "#1e1e24",
            })
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(9999);
        scene.minimapCamera.ignore(scene.minimapLabel);

        // Rectangle showing the main camera's visible viewport, drawn only on the minimap
        scene.minimapViewportRect = scene.add.rectangle(0, 0, 10, 10).setStrokeStyle(1, 0xffffff, 0.85).setFillStyle(0, 0).setDepth(9999);
        scene.cameras.main.ignore(scene.minimapViewportRect);

        // Invisible drag-to-pan zone sitting exactly over the minimap's fixed screen rect.
        // Dragging it pans the main camera around the world without moving the player;
        // pressing a movement key afterward snaps the camera back to following the player.
        scene.isFreeLook = false;
        scene.minimapDragZone = scene.add
            .zone(MINIMAP_CONFIG.MARGIN_LEFT + MINIMAP_CONFIG.WIDTH / 2, MINIMAP_CONFIG.MARGIN_TOP + MINIMAP_CONFIG.HEIGHT / 2, MINIMAP_CONFIG.WIDTH, MINIMAP_CONFIG.HEIGHT)
            .setScrollFactor(0)
            .setInteractive({ draggable: true, useHandCursor: true });
        scene.minimapDragZone.setData("isUiElement", true);
        scene.input.setDraggable(scene.minimapDragZone);

        scene.minimapDragZone.on("pointerdown", () => {
            scene.isFreeLook = true;
            scene.cameras.main.stopFollow();
        });

        scene.minimapVisible = false;

        // When closed, the drag zone is fully disabled so that screen corner behaves like
        // normal grass again (clickable for task creation) instead of an inert dead spot.
        scene.toggleMinimap = (visible) => {
            scene.minimapVisible = visible;
            scene.minimapCamera.setVisible(visible);
            scene.minimapFrame.setVisible(visible);
            scene.minimapLabelBadge.setVisible(visible);
            scene.minimapLabel.setVisible(visible);
            if (visible) {
                scene.minimapDragZone.setInteractive({ draggable: true, useHandCursor: true });
                scene.input.setDraggable(scene.minimapDragZone, true);
            } else {
                scene.minimapDragZone.disableInteractive();
                scene.input.setDraggable(scene.minimapDragZone, false);
            }
        };
        scene.toggleMinimap(false);

        const graphics = scene.add.graphics();
        graphics.lineStyle(1, 0x2c7a4d, 0.8);
        for (let x = 0; x < MAP_CONFIG.WIDTH; x += MAP_CONFIG.TILE_SIZE) {
            graphics.moveTo(x, 0);
            graphics.lineTo(x, MAP_CONFIG.HEIGHT);
        }
        for (let y = 0; y < MAP_CONFIG.HEIGHT; y += MAP_CONFIG.TILE_SIZE) {
            graphics.moveTo(0, y);
            graphics.lineTo(MAP_CONFIG.WIDTH, y);
        }
        graphics.strokePath();
        scene.minimapCamera.ignore(graphics);

        scene.gridHighlight = scene.add.rectangle(0, 0, MAP_CONFIG.TILE_SIZE, MAP_CONFIG.TILE_SIZE, 0xf1c40f, 0.2);
        scene.gridHighlight.setStrokeStyle(2, 0xf1c40f).setVisible(false);
        scene.minimapCamera.ignore(scene.gridHighlight);

        window.inputKeys = scene.input.keyboard.addKeys({
            up: Phaser.Input.Keyboard.KeyCodes[KEY_CONTROLS.UP],
            down: Phaser.Input.Keyboard.KeyCodes[KEY_CONTROLS.DOWN],
            left: Phaser.Input.Keyboard.KeyCodes[KEY_CONTROLS.LEFT],
            right: Phaser.Input.Keyboard.KeyCodes[KEY_CONTROLS.RIGHT],
        });

        window.player = scene.add.rectangle(400, 300, 32, 48, 0x2980b9);
        scene.physics.add.existing(window.player);
        window.player.body.setCollideWorldBounds(true);

        window.aiCompanion = scene.add.circle(500, 350, 20, 0xe74c3c);

        // Oversized blips so player/AI stay visible once shrunk down by the minimap's zoom
        scene.playerBlip = scene.add.circle(window.player.x, window.player.y, 70, 0x60a5fa).setStrokeStyle(14, 0xffffff, 0.95).setDepth(10001);
        scene.cameras.main.ignore(scene.playerBlip);

        scene.aiBlip = scene.add.circle(window.aiCompanion.x, window.aiCompanion.y, 60, 0xf87171).setStrokeStyle(14, 0xffffff, 0.95).setDepth(10001);
        scene.cameras.main.ignore(scene.aiBlip);

        scene.physics.add.collider(window.player, window.buildingsGroup);
        scene.cameras.main.startFollow(window.player, true, 0.1, 0.1);

        scene.clearActiveMenu = () => {
            if (scene.activeMenuUI) {
                scene.activeMenuUI.destroy(true);
                scene.activeMenuUI = null;
            }
            if (scene.currentSelectedBuilding) {
                scene.currentSelectedBuilding.clearTint();
                scene.currentSelectedBuilding = null;
            }
        };

        scene.clearGroundPrompt = () => {
            if (scene.activeGroundPrompt) {
                scene.activeGroundPrompt.destroy(true);
                scene.activeGroundPrompt = null;
            }
        };

        // Network Socket Protocol Hook Channels
        scene.socket.on("init_state", (state) => {
            window.player.setPosition(state.player.x, state.player.y);
            window.aiCompanion.setPosition(state.ai.x, state.ai.y);
            window.buildingsGroup.getChildren().forEach((child) => {
                const blip = child.getData("minimapBlip");
                if (blip) blip.destroy();
            });
            window.buildingsGroup.clear(true, true);
            scene.clearActiveMenu();
            scene.clearGroundPrompt();
            scene.gridHighlight.setVisible(false);
            if (state.buildings) {
                state.buildings.forEach((b) => renderBuilding(scene, b, scene.onBuildingInspect, window.buildingsGroup, scene.socket));
            }
        });

        scene.socket.on("state_update", (state) => {
            window.aiCompanion.setPosition(state.ai.x, state.ai.y);
        });

        scene.socket.on("building_spawned", (buildingData) => {
            renderBuilding(scene, buildingData, scene.onBuildingInspect, window.buildingsGroup, scene.socket);
        });

        scene.socket.on("building_moved", (data) => {
            const match = window.buildingsGroup.getChildren().find((child) => child.getData("id") === data.id);
            if (match) {
                match.setPosition(data.x, data.y + 24);
                if (match.body) match.body.updateFromGameObject();
            }
        });

        scene.socket.on("building_removed", (data) => {
            const match = window.buildingsGroup.getChildren().find((child) => child.getData("id") === data.id);
            if (match) {
                if (scene.currentSelectedBuilding === match) scene.clearActiveMenu();
                const blip = match.getData("minimapBlip");
                if (blip) blip.destroy();
                match.destroy();
            }
        });

        // Ask the server for the world snapshot now that every listener above is registered.
        // Socket.IO buffers this emit if the connection handshake hasn't finished yet, so
        // this is safe regardless of whether the socket or the asset preload finished first.
        scene.socket.emit("request_init_state");

        scene.input.on("drag", (pointer, gameObject, dragX, dragY) => {
            if (gameObject === scene.minimapDragZone) {
                const localX = pointer.x - MINIMAP_CONFIG.MARGIN_LEFT;
                const localY = pointer.y - MINIMAP_CONFIG.MARGIN_TOP;
                const worldX = MAP_CONFIG.WIDTH / 2 + (localX - MINIMAP_CONFIG.WIDTH / 2) / scene.minimapZoom;
                const worldY = MAP_CONFIG.HEIGHT / 2 + (localY - MINIMAP_CONFIG.HEIGHT / 2) / scene.minimapZoom;
                scene.cameras.main.centerOn(worldX, worldY);
                return;
            }

            const cellIndexX = Math.floor(dragX / MAP_CONFIG.TILE_SIZE);
            const cellIndexY = Math.floor((dragY - 24) / MAP_CONFIG.TILE_SIZE);
            const snappedGridX = cellIndexX * MAP_CONFIG.TILE_SIZE + 24;
            const snappedGridY = cellIndexY * MAP_CONFIG.TILE_SIZE + 24;

            gameObject.x = snappedGridX;
            gameObject.y = snappedGridY + 24;
            scene.gridHighlight.setPosition(snappedGridX, snappedGridY).setVisible(true);

            if (scene.activeMenuUI && scene.currentSelectedBuilding === gameObject) {
                scene.activeMenuUI.setPosition(gameObject.x, gameObject.y + 22);
            }
        });

        scene.input.on("dragend", (pointer, gameObject) => {
            if (gameObject === scene.minimapDragZone) return;
            if (gameObject.body) gameObject.body.updateFromGameObject();
            gameObject.setAlpha(1.0);
            scene.input.setDraggable(gameObject, false);
            scene.gridHighlight.setVisible(false);
            scene.socket.emit("move_building", { id: gameObject.getData("id"), x: gameObject.x, y: gameObject.y - 24 });
            scene.clearActiveMenu();
        });

        scene.input.on("pointerdown", (pointer, localObjects) => {
            if (localObjects.some((obj) => obj.getData("isUiElement"))) return;
            if (localObjects.length === 0) {
                scene.clearActiveMenu();
                scene.clearGroundPrompt();

                const targetCellX = Math.floor(pointer.worldX / MAP_CONFIG.TILE_SIZE);
                const targetCellY = Math.floor(pointer.worldY / MAP_CONFIG.TILE_SIZE);
                const snapTargetX = targetCellX * MAP_CONFIG.TILE_SIZE + 24;
                const snapTargetY = targetCellY * MAP_CONFIG.TILE_SIZE + 24;

                scene.gridHighlight.setPosition(snapTargetX, snapTargetY).setVisible(true);
                scene.activeGroundPrompt = scene.add.container(snapTargetX, snapTargetY + 46);
                scene.activeGroundPrompt.setData("isUiElement", true);

                const promptGfx = scene.add.graphics();
                promptGfx.fillStyle(0x059669, 0.95);
                promptGfx.lineStyle(1.5, 0xffffff, 1);
                promptGfx.fillRoundedRect(-80, -16, 160, 32, 10);
                promptGfx.strokeRoundedRect(-80, -16, 160, 32, 10);

                const promptText = scene.add.text(0, 0, "➕ Create New Task", { fontSize: "11px", fontFamily: "sans-serif", fontWeight: "bold", color: "#ffffff" }).setOrigin(0.5);
                const hitZone = scene.add.zone(0, 0, 160, 32).setInteractive({ useHandCursor: true });
                hitZone.setData("isUiElement", true);

                scene.activeGroundPrompt.add([promptGfx, promptText, hitZone]);
                scene.minimapCamera.ignore(scene.activeGroundPrompt);
                hitZone.on("pointerdown", (p, lx, ly, event) => {
                    event.stopPropagation();
                    scene.onMapClick();
                    scene.clearGroundPrompt();
                    scene.gridHighlight.setVisible(false);
                });
            }
        });
    }

    update() {
        let moved = false;
        if (!this.input.keyboard.isActive()) return;
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
        if (moved) {
            this.socket.emit("player_move", { x: window.player.x, y: window.player.y });
            if (this.isFreeLook) {
                this.isFreeLook = false;
                this.cameras.main.startFollow(window.player, true, 0.1, 0.1);
            }
        }

        // Keep minimap blips and viewport indicator in sync with the world every frame
        if (this.playerBlip) this.playerBlip.setPosition(window.player.x, window.player.y);
        if (this.aiBlip) this.aiBlip.setPosition(window.aiCompanion.x, window.aiCompanion.y);

        window.buildingsGroup.getChildren().forEach((child) => {
            const blip = child.getData("minimapBlip");
            if (blip) blip.setPosition(child.x, child.y - 24);
        });

        if (this.minimapViewportRect) {
            const view = this.cameras.main.worldView;
            this.minimapViewportRect.setPosition(view.centerX, view.centerY);
            this.minimapViewportRect.setSize(view.width, view.height);
        }

        this.children.each((child) => {
            if (child.texture && child.texture.key.endsWith("_asset")) {
                child.setDepth(child.y);
            } else if (child === window.player) {
                child.setDepth(child.y + 24);
            } else if (child === window.aiCompanion) {
                child.setDepth(child.y + 20);
            }
        });
    }
}

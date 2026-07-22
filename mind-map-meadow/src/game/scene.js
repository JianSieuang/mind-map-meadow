import Phaser from "phaser";
import { MAP_CONFIG, KEY_CONTROLS, ASSET_REGISTRY } from "./config";
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

        scene.activeMenuUI = null;
        scene.activeGroundPrompt = null;
        scene.currentSelectedBuilding = null;

        scene.physics.world.setBounds(0, 0, MAP_CONFIG.WIDTH, MAP_CONFIG.HEIGHT);
        scene.cameras.main.setBounds(0, 0, MAP_CONFIG.WIDTH, MAP_CONFIG.HEIGHT);

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

        scene.gridHighlight = scene.add.rectangle(0, 0, MAP_CONFIG.TILE_SIZE, MAP_CONFIG.TILE_SIZE, 0xf1c40f, 0.2);
        scene.gridHighlight.setStrokeStyle(2, 0xf1c40f).setVisible(false);

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

        scene.input.on("drag", (pointer, gameObject, dragX, dragY) => {
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
        if (moved) this.socket.emit("player_move", { x: window.player.x, y: window.player.y });

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

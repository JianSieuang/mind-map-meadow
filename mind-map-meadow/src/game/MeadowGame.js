import Phaser from "phaser";

export const keyControls = { UP: "W", DOWN: "S", LEFT: "A", RIGHT: "D" };

export const initPhaser = (parentEl, socket, onBuildingInspect, onMapClick) => {
    const MAP_WIDTH = 3360;
    const MAP_HEIGHT = 2400;

    const config = {
        type: Phaser.AUTO,
        width: parentEl.clientWidth || 1200,
        height: parentEl.clientHeight || 800,
        parent: parentEl,
        backgroundColor: "#348a58",
        physics: {
            default: "arcade",
            arcade: { debug: false },
        },
        scene: {
            preload() {},
            create() {
                const scene = this;
                window.buildingsGroup = scene.add.group(); // Set global engine scope window reference safely

                scene.activeMenuUI = null;
                scene.activeGroundPrompt = null;
                scene.currentSelectedBuilding = null;

                scene.physics.world.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);
                scene.cameras.main.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);

                // Draw background grid landscape
                const graphics = scene.add.graphics();
                graphics.lineStyle(1, 0x2c7a4d, 0.8);
                for (let x = 0; x < MAP_WIDTH; x += 48) {
                    graphics.moveTo(x, 0);
                    graphics.lineTo(x, MAP_HEIGHT);
                }
                for (let y = 0; y < MAP_HEIGHT; y += 48) {
                    graphics.moveTo(0, y);
                    graphics.lineTo(MAP_WIDTH, y);
                }
                graphics.strokePath();

                // Highlight square overlay marker framework
                scene.gridHighlight = scene.add.rectangle(0, 0, 48, 48, 0xf1c40f, 0.2);
                scene.gridHighlight.setStrokeStyle(2, 0xf1c40f);
                scene.gridHighlight.setVisible(false);

                window.inputKeys = scene.input.keyboard.addKeys({
                    up: Phaser.Input.Keyboard.KeyCodes[keyControls.UP],
                    down: Phaser.Input.Keyboard.KeyCodes[keyControls.DOWN],
                    left: Phaser.Input.Keyboard.KeyCodes[keyControls.LEFT],
                    right: Phaser.Input.Keyboard.KeyCodes[keyControls.RIGHT],
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
                        scene.currentSelectedBuilding.setStrokeStyle(2, 0xffffff);
                        scene.currentSelectedBuilding = null;
                    }
                };

                scene.clearGroundPrompt = () => {
                    if (scene.activeGroundPrompt) {
                        scene.activeGroundPrompt.destroy(true);
                        scene.activeGroundPrompt = null;
                    }
                };

                // Socket Event Listeners
                socket.on("init_state", (state) => {
                    window.player.setPosition(state.player.x, state.player.y);
                    window.aiCompanion.setPosition(state.ai.x, state.ai.y);
                    window.buildingsGroup.clear(true, true);
                    scene.clearActiveMenu();
                    scene.clearGroundPrompt();
                    scene.gridHighlight.setVisible(false);
                    if (state.buildings) {
                        state.buildings.forEach((b) => renderBuilding(scene, b, onBuildingInspect, window.buildingsGroup, socket));
                    }
                });

                socket.on("state_update", (state) => {
                    window.aiCompanion.setPosition(state.ai.x, state.ai.y);
                });

                socket.on("building_spawned", (buildingData) => {
                    renderBuilding(scene, buildingData, onBuildingInspect, window.buildingsGroup, socket);
                });

                socket.on("building_moved", (data) => {
                    const match = window.buildingsGroup.getChildren().find((child) => child.getData("id") === data.id);
                    if (match) {
                        match.setPosition(data.x, data.y);
                        if (match.body) match.body.updateFromGameObject();
                    }
                });

                // Snap element steps inside discrete cells while dragging
                scene.input.on("drag", (pointer, gameObject, dragX, dragY) => {
                    const cellIndexX = Math.floor(dragX / 48);
                    const cellIndexY = Math.floor(dragY / 48);
                    const snappedGridX = cellIndexX * 48 + 24;
                    const snappedGridY = cellIndexY * 48 + 24;

                    gameObject.x = snappedGridX;
                    gameObject.y = snappedGridY;
                    scene.gridHighlight.setPosition(snappedGridX, snappedGridY);

                    if (scene.activeMenuUI && scene.currentSelectedBuilding === gameObject) {
                        scene.activeMenuUI.setPosition(gameObject.x, gameObject.y + 46);
                    }
                });

                scene.input.on("dragend", (pointer, gameObject) => {
                    if (gameObject.body) gameObject.body.updateFromGameObject();
                    gameObject.setAlpha(1.0);
                    scene.input.setDraggable(gameObject, false);
                    scene.gridHighlight.setVisible(false);

                    socket.emit("move_building", {
                        id: gameObject.getData("id"),
                        x: gameObject.x,
                        y: gameObject.y,
                    });
                    scene.clearActiveMenu();
                });

                // Empty Map Ground Pointer Down Handler
                scene.input.on("pointerdown", (pointer, localObjects) => {
                    if (localObjects.some((obj) => obj.getData("isUiElement"))) return;

                    if (localObjects.length === 0) {
                        scene.clearActiveMenu();
                        scene.clearGroundPrompt();

                        const targetCellX = Math.floor(pointer.worldX / 48);
                        const targetCellY = Math.floor(pointer.worldY / 48);
                        const snapTargetX = targetCellX * 48 + 24;
                        const snapTargetY = targetCellY * 48 + 24;

                        scene.gridHighlight.setPosition(snapTargetX, snapTargetY).setVisible(true);

                        // --- DESIGN UPGRADE: Sleek Rounded Emerald Task Prompt Pill ---
                        scene.activeGroundPrompt = scene.add.container(snapTargetX, snapTargetY + 46);
                        scene.activeGroundPrompt.setData("isUiElement", true);

                        const promptGfx = scene.add.graphics();
                        promptGfx.fillStyle(0x059669, 0.95); // Emerald Green 600
                        promptGfx.lineStyle(1.5, 0xffffff, 1);
                        promptGfx.fillRoundedRect(-80, -16, 160, 32, 10);
                        promptGfx.strokeRoundedRect(-80, -16, 160, 32, 10);
                        promptGfx.setData("isUiElement", true);

                        const promptText = scene.add
                            .text(0, 0, "➕ Create New Task", {
                                fontSize: "11px",
                                fontFamily: "sans-serif",
                                fontWeight: "bold",
                                color: "#ffffff",
                            })
                            .setOrigin(0.5);

                        // Invisible interaction zone block mapped over the rounded shape boundaries
                        const hitZone = scene.add.zone(0, 0, 160, 32).setInteractive({ useHandCursor: true });
                        hitZone.setData("isUiElement", true);

                        scene.activeGroundPrompt.add([promptGfx, promptText, hitZone]);

                        hitZone.on("pointerdown", (p, lx, ly, event) => {
                            event.stopPropagation();
                            onMapClick();
                            scene.clearGroundPrompt();
                            scene.gridHighlight.setVisible(false);
                        });
                    }
                });
            },
            update() {
                let moved = false;
                const speed = 280;
                if (!this.input.keyboard.isActive()) return;

                window.player.body.setVelocity(0);

                if (window.inputKeys.left.isDown) {
                    window.player.body.setVelocityX(-speed);
                    moved = true;
                }
                if (window.inputKeys.right.isDown) {
                    window.player.body.setVelocityX(speed);
                    moved = true;
                }
                if (window.inputKeys.up.isDown) {
                    window.player.body.setVelocityY(-speed);
                    moved = true;
                }
                if (window.inputKeys.down.isDown) {
                    window.player.body.setVelocityY(speed);
                    moved = true;
                }

                if (moved) socket.emit("player_move", { x: window.player.x, y: window.player.y });
            },
        },
    };

    return new Phaser.Game(config);
};

function renderBuilding(scene, b, onInspect, group, socket) {
    const visualBox = scene.add.rectangle(b.x, b.y, 48, 48, 0x1e5631);
    visualBox.setStrokeStyle(2, 0xffffff);
    visualBox.setData("id", b.id);

    scene.physics.add.existing(visualBox, true);
    visualBox.setInteractive({ useHandCursor: true });

    visualBox.on("pointerdown", (pointer, localX, localY, event) => {
        event.stopPropagation();

        if (scene.clearGroundPrompt) scene.clearGroundPrompt();
        scene.clearActiveMenu();

        scene.currentSelectedBuilding = visualBox;
        visualBox.setStrokeStyle(3, 0xf1c40f);

        onInspect(b.id);

        // --- DESIGN UPGRADE: Unified Rounded Action Submenus ---
        const menuContainer = scene.add.container(visualBox.x, visualBox.y + 46);
        menuContainer.setData("isUiElement", true);

        // Move Button Pill Setup
        const moveGfx = scene.add.graphics();
        moveGfx.fillStyle(0x2563eb, 0.95); // Royal Blue 600
        moveGfx.lineStyle(1, 0xffffff, 1);
        moveGfx.fillRoundedRect(-80, -13, 76, 26, 8);
        moveGfx.strokeRoundedRect(-80, -13, 76, 26, 8);
        const moveText = scene.add.text(-42, 0, "🚚 Move", { fontSize: "11px", fontFamily: "sans-serif", fontWeight: "bold", color: "#fff" }).setOrigin(0.5);
        const moveZone = scene.add.zone(-42, 0, 76, 26).setInteractive({ useHandCursor: true });
        moveZone.setData("isUiElement", true);

        // Cancel Button Pill Setup
        const cancelGfx = scene.add.graphics();
        cancelGfx.fillStyle(0xd97706, 0.95); // Amber/Orange 600
        cancelGfx.lineStyle(1, 0xffffff, 1);
        cancelGfx.fillRoundedRect(4, -13, 76, 26, 8);
        cancelGfx.strokeRoundedRect(4, -13, 76, 26, 8);
        const cancelText = scene.add.text(42, 0, "❌ Close", { fontSize: "11px", fontFamily: "sans-serif", fontWeight: "bold", color: "#fff" }).setOrigin(0.5);
        const cancelZone = scene.add.zone(42, 0, 76, 26).setInteractive({ useHandCursor: true });
        cancelZone.setData("isUiElement", true);

        menuContainer.add([moveGfx, moveText, moveZone, cancelGfx, cancelText, cancelZone]);
        scene.activeMenuUI = menuContainer;

        moveZone.on("pointerdown", (p, lx, ly, btnEvent) => {
            btnEvent.stopPropagation();
            visualBox.setAlpha(0.65);
            scene.gridHighlight.setPosition(visualBox.x, visualBox.y).setVisible(true);

            visualBox.setInteractive({ draggable: true });
            scene.input.setDraggable(visualBox);
            menuContainer.setAlpha(0.2);
        });

        cancelZone.on("pointerdown", (p, lx, ly, btnEvent) => {
            btnEvent.stopPropagation();
            scene.clearActiveMenu();
            scene.gridHighlight.setVisible(false);
        });
    });

    group.add(visualBox);
}

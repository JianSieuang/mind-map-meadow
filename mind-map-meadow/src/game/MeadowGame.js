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
                buildingsGroup = scene.add.group();

                // Bind UI state tracking variables directly to the scene context
                scene.activeMenuUI = null;
                scene.activeGroundPrompt = null;
                scene.currentSelectedBuilding = null;

                scene.physics.world.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);
                scene.cameras.main.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);

                // Draw background landscape grid layout tracking lines
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

                // 1. ADD VISUAL GRID CELL HIGHLIGHT MARKER
                scene.gridHighlight = scene.add.rectangle(0, 0, 48, 48, 0xf1c40f, 0.25);
                scene.gridHighlight.setStrokeStyle(2, 0xf1c40f);
                scene.gridHighlight.setVisible(false);

                inputKeys = scene.input.keyboard.addKeys({
                    up: Phaser.Input.Keyboard.KeyCodes[keyControls.UP],
                    down: Phaser.Input.Keyboard.KeyCodes[keyControls.DOWN],
                    left: Phaser.Input.Keyboard.KeyCodes[keyControls.LEFT],
                    right: Phaser.Input.Keyboard.KeyCodes[keyControls.RIGHT],
                });

                player = scene.add.rectangle(400, 300, 32, 48, 0x2980b9);
                scene.physics.add.existing(player);
                player.body.setCollideWorldBounds(true);

                aiCompanion = scene.add.circle(500, 350, 20, 0xe74c3c);
                scene.physics.add.collider(player, buildingsGroup);

                scene.cameras.main.startFollow(player, true, 0.1, 0.1);

                // Clear function helpers attached to the scene
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

                // Socket Seeding Hooks
                socket.on("init_state", (state) => {
                    player.setPosition(state.player.x, state.player.y);
                    aiCompanion.setPosition(state.ai.x, state.ai.y);
                    buildingsGroup.clear(true, true);
                    scene.clearActiveMenu();
                    scene.clearGroundPrompt();
                    scene.gridHighlight.setVisible(false);
                    if (state.buildings) {
                        state.buildings.forEach((b) => renderBuilding(scene, b, onBuildingInspect, buildingsGroup, socket));
                    }
                });

                socket.on("state_update", (state) => {
                    aiCompanion.setPosition(state.ai.x, state.ai.y);
                });

                socket.on("building_spawned", (buildingData) => {
                    renderBuilding(scene, buildingData, onBuildingInspect, buildingsGroup, socket);
                });

                socket.on("building_moved", (data) => {
                    const match = buildingsGroup.getChildren().find((child) => child.getData("id") === data.id);
                    if (match) {
                        match.setPosition(data.x, data.y);
                        if (match.body) match.body.updateFromGameObject();
                    }
                });

                // 2. DISCRETE GRID CELL SNAP CALCULATOR DURING DRAG
                scene.input.on("drag", (pointer, gameObject, dragX, dragY) => {
                    // Convert pointer location to exact matching discrete grid cell steps
                    const cellIndexX = Math.floor(dragX / 48);
                    const cellIndexY = Math.floor(dragY / 48);

                    const snappedGridX = cellIndexX * 48 + 24;
                    const snappedGridY = cellIndexY * 48 + 24;

                    gameObject.x = snappedGridX;
                    gameObject.y = snappedGridY;

                    // Match highlight frame box to the dragged block grid coordinates
                    scene.gridHighlight.setPosition(snappedGridX, snappedGridY);

                    // Update the layout positions of the context overlay menu targets simultaneously while dragging
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

                // --- MAP GROUND CLICK HANDLER ---
                scene.input.on("pointerdown", (pointer, localObjects) => {
                    if (localObjects.some((obj) => obj.getData("isUiElement"))) return;

                    // If user clicked flat, empty grass meadow area
                    if (localObjects.length === 0) {
                        scene.clearActiveMenu();
                        scene.clearGroundPrompt();

                        // Map out clicked grid cell coordinates
                        const targetCellX = Math.floor(pointer.worldX / 48);
                        const targetCellY = Math.floor(pointer.worldY / 48);
                        const snapTargetX = targetCellX * 48 + 24;
                        const snapTargetY = targetCellY * 48 + 24;

                        // Position highlight frame container
                        scene.gridHighlight.setPosition(snapTargetX, snapTargetY).setVisible(true);

                        // Construct floating prompt anchored beneath the active cell block
                        scene.activeGroundPrompt = scene.add.container(snapTargetX, snapTargetY + 46);
                        scene.activeGroundPrompt.setData("isUiElement", true);

                        const promptBg = scene.add.rectangle(0, 0, 160, 32, 0x2980b9, 0.95).setStrokeStyle(1.5, 0xffffff).setInteractive({ useHandCursor: true });
                        promptBg.setData("isUiElement", true);

                        const promptText = scene.add
                            .text(0, 0, "+ Create New Task", {
                                fontSize: "12px",
                                fontFamily: "sans-serif",
                                fontWeight: "bold",
                                color: "#ffffff",
                            })
                            .setOrigin(0.5);

                        scene.activeGroundPrompt.add([promptBg, promptText]);

                        // Handle prompt clicks
                        promptBg.on("pointerdown", (p, lx, ly, event) => {
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

                player.body.setVelocity(0);

                if (inputKeys.left.isDown) {
                    player.body.setVelocityX(-speed);
                    moved = true;
                }
                if (inputKeys.right.isDown) {
                    player.body.setVelocityX(speed);
                    moved = true;
                }
                if (inputKeys.up.isDown) {
                    player.body.setVelocityY(-speed);
                    moved = true;
                }
                if (inputKeys.down.isDown) {
                    player.body.setVelocityY(speed);
                    moved = true;
                }

                if (moved) socket.emit("player_move", { x: player.x, y: player.y });
            },
        },
    };

    let player, aiCompanion, inputKeys, buildingsGroup;
    return new Phaser.Game(config);
};

function renderBuilding(scene, b, onInspect, group, socket) {
    const visualBox = scene.add.rectangle(b.x, b.y, 48, 48, 0x1e5631);
    visualBox.setStrokeStyle(2, 0xffffff);
    visualBox.setData("id", b.id);

    scene.physics.add.existing(visualBox, true);
    visualBox.setInteractive({ useHandCursor: true });

    // --- SELECTION MENU TRIGGER ON CLICK ---
    visualBox.on("pointerdown", (pointer, localX, localY, event) => {
        event.stopPropagation();

        if (scene.clearGroundPrompt) scene.clearGroundPrompt();
        scene.clearActiveMenu();

        scene.currentSelectedBuilding = visualBox;
        visualBox.setStrokeStyle(3, 0xf1c40f); // Draw golden selection ring

        onInspect(b.id);

        // Instantiate overlay box buttons cleanly using direct scene variable states
        const menuContainer = scene.add.container(visualBox.x, visualBox.y + 46);
        menuContainer.setData("isUiElement", true);

        const moveBtn = scene.add.rectangle(-45, 0, 75, 26, 0x27ae60).setStrokeStyle(1, 0xffffff).setInteractive({ useHandCursor: true });
        moveBtn.setData("isUiElement", true);
        const moveText = scene.add.text(-45, 0, "🚚 Move", { fontSize: "11px", fontFamily: "sans-serif", fontWeight: "bold", color: "#fff" }).setOrigin(0.5);

        const cancelBtn = scene.add.rectangle(45, 0, 75, 26, 0xc0392b).setStrokeStyle(1, 0xffffff).setInteractive({ useHandCursor: true });
        cancelBtn.setData("isUiElement", true);
        const cancelText = scene.add.text(45, 0, "❌ Close", { fontSize: "11px", fontFamily: "sans-serif", fontWeight: "bold", color: "#fff" }).setOrigin(0.5);

        menuContainer.add([moveBtn, moveText, cancelBtn, cancelText]);
        scene.activeMenuUI = menuContainer;

        moveBtn.on("pointerdown", (p, lx, ly, btnEvent) => {
            btnEvent.stopPropagation();
            visualBox.setAlpha(0.65);

            // Display grid highlight boundary area explicitly under the element
            scene.gridHighlight.setPosition(visualBox.x, visualBox.y).setVisible(true);

            visualBox.setInteractive({ draggable: true });
            scene.input.setDraggable(visualBox);

            menuContainer.setAlpha(0.2);
        });

        cancelBtn.on("pointerdown", (p, lx, ly, btnEvent) => {
            btnEvent.stopPropagation();
            scene.clearActiveMenu();
            scene.gridHighlight.setVisible(false);
        });
    });

    group.add(visualBox);
}

import Phaser from "phaser";

// Savings projects swap texture per milestone stage; everything else maps asset_key → texture 1:1.
export function textureForBuilding(scene, b) {
    const assetKey = (b.asset_key || "").toLowerCase();
    const stage = b.metadata?.stage;
    const textureHandle = assetKey === "savings_project" && Number.isInteger(stage) ? `savings_project_${stage}_asset` : `${assetKey}_asset`;
    return scene.textures.exists(textureHandle) ? textureHandle : "library_asset";
}

// Keeps the 48x48 physics footprint anchored to the bottom tile, however tall the art is.
export function alignBuildingBody(sprite) {
    sprite.body.setSize(48, 48);
    sprite.body.setOffset(0, sprite.displayHeight - 48);
}

export function renderBuilding(scene, b, onInspect, group, socket, options = {}) {
    const { readOnly = false } = options;

    const elementSprite = scene.add.sprite(b.x, b.y + 24, textureForBuilding(scene, b));
    elementSprite.setOrigin(0.5, 1.0);
    elementSprite.setData("id", b.id);
    elementSprite.setData("assetKey", b.asset_key);
    elementSprite.setData("metadata", b.metadata || {});

    scene.physics.add.existing(elementSprite, true);
    alignBuildingBody(elementSprite);

    if (b.metadata) {
        if (b.metadata.flipX) elementSprite.setFlipX(b.metadata.flipX);
        if (b.metadata.scale) elementSprite.setScale(b.metadata.scale);
        if (b.metadata.alpha) elementSprite.setAlpha(b.metadata.alpha);
    }

    if (scene.minimapCamera) {
        const blip = scene.add.circle(b.x, b.y, 60, 0xfbbf24).setStrokeStyle(12, 0xffffff, 0.9).setDepth(9998);
        scene.cameras.main.ignore(blip);
        elementSprite.setData("minimapBlip", blip);
    }

    elementSprite.setInteractive({ useHandCursor: true });

    elementSprite.on("pointerdown", (pointer, localX, localY, event) => {
        event.stopPropagation();
        if (scene.clearGroundPrompt) scene.clearGroundPrompt();
        scene.clearActiveMenu();

        scene.currentSelectedBuilding = elementSprite;
        elementSprite.setTint(0xf1c40f);
        onInspect(b.id);

        if (readOnly) return; // view-only tour — no move/close menu, no dragging

        const menuContainer = scene.add.container(elementSprite.x, elementSprite.y + 22);
        menuContainer.setData("isUiElement", true);

        const moveGfx = scene.add.graphics();
        moveGfx.fillStyle(0x2563eb, 0.95);
        moveGfx.lineStyle(1, 0xffffff, 1);
        moveGfx.fillRoundedRect(-80, -13, 76, 26, 8);
        moveGfx.strokeRoundedRect(-80, -13, 76, 26, 8);
        const moveText = scene.add.text(-42, 0, "🚚 Move", { fontSize: "11px", fontFamily: "sans-serif", fontWeight: "bold", color: "#fff" }).setOrigin(0.5);
        const moveZone = scene.add.zone(-42, 0, 76, 26).setInteractive({ useHandCursor: true });
        moveZone.setData("isUiElement", true);

        const cancelGfx = scene.add.graphics();
        cancelGfx.fillStyle(0xd97706, 0.95);
        cancelGfx.lineStyle(1, 0xffffff, 1);
        cancelGfx.fillRoundedRect(4, -13, 76, 26, 8);
        cancelGfx.strokeRoundedRect(4, -13, 76, 26, 8);
        const cancelText = scene.add.text(42, 0, "❌ Close", { fontSize: "11px", fontFamily: "sans-serif", fontWeight: "bold", color: "#fff" }).setOrigin(0.5);
        const cancelZone = scene.add.zone(42, 0, 76, 26).setInteractive({ useHandCursor: true });
        cancelZone.setData("isUiElement", true);

        menuContainer.add([moveGfx, moveText, moveZone, cancelGfx, cancelText, cancelZone]);
        if (scene.minimapCamera) scene.minimapCamera.ignore(menuContainer);
        scene.activeMenuUI = menuContainer;

        moveZone.on("pointerdown", (p, lx, ly, btnEvent) => {
            btnEvent.stopPropagation();
            elementSprite.setAlpha(0.65);
            scene.gridHighlight.setPosition(elementSprite.x, elementSprite.y - 24).setVisible(true);
            elementSprite.setInteractive({ draggable: true });
            scene.input.setDraggable(elementSprite);
            menuContainer.setAlpha(0.2);
        });

        cancelZone.on("pointerdown", (p, lx, ly, btnEvent) => {
            btnEvent.stopPropagation();
            scene.clearActiveMenu();
            scene.gridHighlight.setVisible(false);
        });
    });

    group.add(elementSprite);
}

import Phaser from "phaser";

export function renderBuilding(scene, b, onInspect, group, socket) {
    const textureHandle = `${b.asset_key.toLowerCase()}_asset`;

    const verifiedTexture = scene.textures.exists(textureHandle) ? textureHandle : "library_asset";

    const elementSprite = scene.add.sprite(b.x, b.y + 24, verifiedTexture);
    elementSprite.setOrigin(0.5, 1.0);
    elementSprite.setData("id", b.id);
    elementSprite.setData("assetKey", b.asset_key);

    scene.physics.add.existing(elementSprite, true);
    elementSprite.body.setSize(48, 48);

    const assetHeight = elementSprite.displayHeight;
    const computedOffsetCorrectionY = assetHeight - 48;
    elementSprite.body.setOffset(0, computedOffsetCorrectionY);

    if (b.metadata) {
        if (b.metadata.flipX) elementSprite.setFlipX(b.metadata.flipX);
        if (b.metadata.scale) elementSprite.setScale(b.metadata.scale);
        if (b.metadata.alpha) elementSprite.setAlpha(b.metadata.alpha);
    }

    elementSprite.setInteractive({ useHandCursor: true });

    elementSprite.on("pointerdown", (pointer, localX, localY, event) => {
        event.stopPropagation();
        if (scene.clearGroundPrompt) scene.clearGroundPrompt();
        scene.clearActiveMenu();

        scene.currentSelectedBuilding = elementSprite;
        elementSprite.setTint(0xf1c40f);
        onInspect(b.id);

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

import Phaser from "phaser";
import { DEPTH, LEGACY_ASSET_ALIASES, MAP_CONFIG } from "./config";

const T = MAP_CONFIG.TILE_SIZE;

// One shape for both sources: a Building from builder state (camelCase) and a friend's visit_state
// row (snake_case tile_x/tile_y, with no storage or staffing fields).
export function normalizeBuilding(raw) {
    return {
        ...raw,
        footprint: raw.footprint === 2 ? 2 : 1,
        tileX: raw.tileX ?? raw.tile_x ?? 0,
        tileY: raw.tileY ?? raw.tile_y ?? 0,
        metadata: raw.metadata || {},
        insideZone: raw.insideZone !== false,
        needsWorker: !!raw.needsWorker,
        staffed: !!raw.staffed,
        storedMilli: raw.storedMilli || 0,
        rateMilliPerHour: raw.rateMilliPerHour || 0,
        capMilli: raw.capMilli || 0,
    };
}

// Savings projects swap texture per milestone stage. Unknown keys try their alias and then their
// line + level before falling back to the runtime placeholder, so a bad row is never invisible.
export function textureForBuilding(scene, b) {
    const assetKey = (b.asset_key || "").toLowerCase();
    const candidates = [];
    if (assetKey === "savings_project") {
        const stage = b.metadata?.stage;
        candidates.push(`savings_project_${Number.isInteger(stage) ? stage : 0}`);
    }
    candidates.push(assetKey);
    if (LEGACY_ASSET_ALIASES[assetKey]) candidates.push(LEGACY_ASSET_ALIASES[assetKey]);
    if (b.line && b.level) candidates.push(`${b.line}_${b.level}`);
    const match = candidates.find((key) => scene.textures.exists(`${key}_asset`));
    return match ? `${match}_asset` : "library_asset";
}

// Sprite position for a footprint: bottom-centre of the rectangle, matching the (0.5, 1) origin.
export function footprintAnchor(tileX, tileY, footprint) {
    return { x: tileX * T + (footprint * T) / 2, y: (tileY + footprint) * T };
}

// Static body = the footprint, however tall the art is. reset() re-applies the offset at the
// sprite's position; updateFromGameObject() would resize the body to the whole image.
export function alignBuildingBody(sprite) {
    const size = sprite.getData("building").footprint * T;
    const baseScale = sprite.getData("baseScale") || 1;
    const offsetX = (sprite.width * baseScale - size) / 2;
    const offsetY = sprite.height * baseScale - size;
    sprite.body.setSize(size, size, false);
    sprite.body.setOffset(offsetX, offsetY);
    sprite.body.reset(sprite.x, sprite.y);
}

export function refreshTint(scene, sprite) {
    if (sprite.getData("flashTimer")) return;
    const b = sprite.getData("building");
    if (scene.currentSelectedBuilding === sprite) sprite.setTint(0xffe9a8);
    else if (!b.insideZone) sprite.setTint(0x6f6f86);
    else if (b.needsWorker && !b.staffed) sprite.setTint(0xc4c4ce);
    else sprite.clearTint();
}

// ── Attachments: storage bubble, no-worker icon, sleepy shutter ──
// Same rule as the server and utils/builder.js: growth stops at the cap and when the town falls
// asleep, but storage already above the cap (a Deep Pockets worker moved away) is kept.
function storedNow(scene, sprite) {
    const b = sprite.getData("building");
    const end = Math.min(Date.now(), scene.sleepAtMs ?? Infinity);
    const elapsed = Math.max(0, end - sprite.getData("syncedAt"));
    const grown = b.storedMilli + (b.rateMilliPerHour * elapsed) / 3_600_000;
    return Math.max(b.storedMilli, b.capMilli ? Math.min(b.capMilli, grown) : grown);
}

function attachmentBaseY(sprite) {
    return Math.max(sprite.y - sprite.height + 14, 26);
}

function refreshBubble(scene, sprite) {
    const b = sprite.getData("building");
    let bubble = sprite.getData("bubble");
    const stored = storedNow(scene, sprite);
    const show = !sprite.getData("readOnly") && !sprite.getData("dragging") && stored >= 1000 && Date.now() >= (sprite.getData("collectHoldUntil") || 0);
    if (!show) {
        if (bubble) bubble.setVisible(false);
        return;
    }
    if (!bubble) {
        if (!scene.textures.exists("ui_coin_bubble_1")) return;
        bubble = scene.add.image(0, 0, "ui_coin_bubble_1").setOrigin(0.5, 1).setDepth(DEPTH.BUBBLE + sprite.y);
        scene.minimapCamera.ignore(bubble);
        // Bigger than the 24px art so it's an easy tap on a phone.
        bubble.setInteractive({ hitArea: new Phaser.Geom.Rectangle(-8, -8, 40, 40), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
        bubble.setData("isUiElement", true);
        bubble.on("pointerdown", (pointer, localX, localY, event) => {
            event.stopPropagation();
            if (scene.placement || scene.isVisiting) return;
            const live = sprite.getData("building");
            scene.socket.emit("collect", { buildingId: live.id });
            sprite.setData("collectHoldUntil", Date.now() + 3000);
            bubble.setVisible(false);
        });
        sprite.setData("bubble", bubble);
    }
    bubble.setData("full", b.capMilli > 0 && stored >= b.capMilli);
    bubble.setVisible(true);
    if (bubble.input) bubble.input.enabled = !scene.placement;
}

function setAttachment(scene, sprite, dataKey, textureKey, wanted) {
    let img = sprite.getData(dataKey);
    if (!wanted || !scene.textures.exists(textureKey)) {
        if (img) {
            img.destroy();
            sprite.setData(dataKey, null);
        }
        return null;
    }
    if (img && img.texture.key !== textureKey) img.setTexture(textureKey);
    if (!img) {
        img = scene.add.image(0, 0, textureKey).setOrigin(0.5, 1);
        scene.minimapCamera.ignore(img);
        sprite.setData(dataKey, img);
    }
    return img;
}

export function refreshAttachments(scene, sprite) {
    const b = sprite.getData("building");
    const dragging = !!sprite.getData("dragging");
    refreshBubble(scene, sprite);

    const noWorker = setAttachment(scene, sprite, "noWorkerIcon", "ui_no_worker", b.needsWorker && !b.staffed && b.insideZone && !dragging);
    if (noWorker) noWorker.setPosition(sprite.x - 26, attachmentBaseY(sprite)).setDepth(DEPTH.BUBBLE + sprite.y);

    // Lv1 producers are open yards and stalls with no door to shut, so they get a hanging sign.
    const sleepyHere = !!scene.sleepy && !scene.isVisiting && b.needsWorker && !dragging;
    const closedTexture = b.level === 1 ? "ui_closed_sign" : "ui_shutter";
    if (sprite.getData("shutter") && sprite.getData("shutter").texture.key !== closedTexture) setAttachment(scene, sprite, "shutter", closedTexture, false);
    const shutter = setAttachment(scene, sprite, "shutter", closedTexture, sleepyHere);
    if (shutter) shutter.setPosition(sprite.x, sprite.y - (b.level === 1 ? 26 : 10)).setDepth(sprite.y + 0.5);
}

// Runs every frame: minimap blip follows the sprite, bubbles bob, the coin spins.
export function updateAttachmentsPerFrame(scene, sprite, time) {
    const blip = sprite.getData("minimapBlip");
    const b = sprite.getData("building");
    if (blip) blip.setPosition(sprite.x, sprite.y - (b.footprint * T) / 2);

    const bubble = sprite.getData("bubble");
    if (bubble && bubble.visible) {
        const phase = time / 320 + b.id;
        bubble.setPosition(sprite.x, attachmentBaseY(sprite) + Math.round(Math.sin(phase) * 2));
        const spin = Math.floor(time / 420 + b.id) % 2 === 0;
        const key = bubble.getData("full") ? "ui_storage_full" : spin ? "ui_coin_bubble_1" : "ui_coin_bubble_2";
        if (bubble.texture.key !== key && scene.textures.exists(key)) bubble.setTexture(key);
    }
}

export function moveSpriteToTile(scene, sprite) {
    const b = sprite.getData("building");
    const { x, y } = footprintAnchor(b.tileX, b.tileY, b.footprint);
    scene.tweens.killTweensOf(sprite);
    sprite.setScale(sprite.getData("baseScale") || 1);
    sprite.setPosition(x, y);
    sprite.setDepth(y);
    alignBuildingBody(sprite);
}

// Apply fresh server data to an existing sprite. A sprite being dragged, or waiting for the server
// to answer a drop, keeps its on-screen position until that resolves.
export function updateBuilding(scene, sprite, raw) {
    const b = normalizeBuilding(raw);
    const prev = sprite.getData("building");
    sprite.setData("building", b);
    sprite.setData("syncedAt", Date.now());

    const texture = textureForBuilding(scene, b);
    const textureChanged = sprite.texture.key !== texture;
    if (textureChanged) sprite.setTexture(texture);

    const pending = scene.pendingDrop && scene.pendingDrop.id === b.id ? scene.pendingDrop : null;
    const tileChanged = prev.tileX !== b.tileX || prev.tileY !== b.tileY || prev.footprint !== b.footprint;
    const held = !!sprite.getData("dragging") || (pending && !tileChanged);
    if (pending && tileChanged) scene.clearPendingDrop();

    if (!held && (tileChanged || textureChanged)) moveSpriteToTile(scene, sprite);
    else if (textureChanged) alignBuildingBody(sprite);

    refreshTint(scene, sprite);
    refreshAttachments(scene, sprite);
}

export function destroyBuildingSprite(scene, sprite) {
    if (scene.currentSelectedBuilding === sprite) scene.currentSelectedBuilding = null;
    if (scene.pendingDrop && scene.pendingDrop.id === sprite.getData("id")) scene.clearPendingDrop();
    if (scene.dragState && scene.dragState.sprite === sprite) scene.abandonDrag();
    if (scene.pressedSprite === sprite) scene.pressedSprite = null;
    const flash = sprite.getData("flashTimer");
    if (flash) flash.remove(false);
    ["minimapBlip", "bubble", "noWorkerIcon", "shutter"].forEach((key) => {
        const obj = sprite.getData(key);
        if (obj) obj.destroy();
    });
    scene.tweens.killTweensOf(sprite);
    sprite.destroy();
}

export function renderBuilding(scene, raw, onInspect, group, options = {}) {
    const { readOnly = false } = options;
    const b = normalizeBuilding(raw);
    const { x, y } = footprintAnchor(b.tileX, b.tileY, b.footprint);

    const elementSprite = scene.add.sprite(x, y, textureForBuilding(scene, b));
    elementSprite.setOrigin(0.5, 1.0);
    elementSprite.setDepth(y);
    elementSprite.setData("id", b.id);
    elementSprite.setData("building", b);
    elementSprite.setData("readOnly", readOnly);
    elementSprite.setData("syncedAt", Date.now());

    if (b.metadata.flipX) elementSprite.setFlipX(b.metadata.flipX);
    if (b.metadata.alpha) elementSprite.setAlpha(b.metadata.alpha);
    // New art is drawn to its footprint; only render-only legacy rows may carry a custom scale.
    const baseScale = b.kind === "legacy" && b.metadata.scale ? b.metadata.scale : 1;
    elementSprite.setScale(baseScale);
    elementSprite.setData("baseScale", baseScale); // resting scale, so effect tweens always return to it

    scene.physics.add.existing(elementSprite, true);
    alignBuildingBody(elementSprite);

    if (scene.minimapCamera) {
        const blip = scene.add.circle(x, y - (b.footprint * T) / 2, 60, 0xfbbf24).setStrokeStyle(12, 0xffffff, 0.9).setDepth(9998).setScale(scene.minimapBlipScale);
        scene.cameras.main.ignore(blip);
        elementSprite.setData("minimapBlip", blip);
    }

    // Pixel-perfect so clicks on transparent corners and drop shadows reach whatever is behind.
    elementSprite.setInteractive({ pixelPerfect: true, alphaTolerance: 100, useHandCursor: true });
    if (!readOnly) scene.input.setDraggable(elementSprite);
    if (scene.placement) elementSprite.input.enabled = false;

    // A tap is a press and release with no drag in between; dragstart clears pressedSprite.
    elementSprite.on("pointerdown", (pointer, localX, localY, event) => {
        event.stopPropagation();
        if (scene.clearGroundPrompt) scene.clearGroundPrompt();
        scene.pressedSprite = elementSprite;
    });
    elementSprite.on("pointerup", () => {
        if (scene.pressedSprite !== elementSprite) return;
        scene.pressedSprite = null;
        scene.clearActiveMenu();
        scene.currentSelectedBuilding = elementSprite;
        refreshTint(scene, elementSprite);
        const live = elementSprite.getData("building");
        onInspect(live.id, live);
    });

    group.add(elementSprite);
    refreshTint(scene, elementSprite);
    refreshAttachments(scene, elementSprite);
    return elementSprite;
}

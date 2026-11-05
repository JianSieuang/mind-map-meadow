import { DEPTH, MAP_CONFIG } from "./config";
import { footprintAnchor, moveSpriteToTile, refreshAttachments, refreshTint, textureForBuilding } from "./buildings";
import { flashSprite } from "./fx";

const T = MAP_CONFIG.TILE_SIZE;
const COLS = MAP_CONFIG.WIDTH / T;
const ROWS = MAP_CONFIG.HEIGHT / T;

const COLOR = {
    valid: { fill: 0x7cbf5a, line: 0xa8d672, tint: 0xd8f0b8 },
    invalid: { fill: 0xd2493f, line: 0xef7a62, tint: 0xef7a62 },
    merge: { fill: 0xffd65a, line: 0xffd65a, tint: 0xffe08a },
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function footprintsOverlap(ax, ay, afp, bx, by, bfp) {
    return ax < bx + bfp && bx < ax + afp && ay < by + bfp && by < ay + afp;
}

function placedBuildings(scene) {
    return window.buildingsGroup.getChildren().map((sprite) => sprite.getData("building"));
}

// Client copy of contract §5.2. Used for the ghost colour and to avoid sending hopeless requests;
// the server decides for real.
export function isSpotValid(scene, tileX, tileY, footprint, excludeId = null) {
    if (tileX < 0 || tileY < 0 || tileX + footprint > COLS || tileY + footprint > ROWS) return false;
    const zone = scene.zone;
    if (zone && (tileX < zone.x || tileY < zone.y || tileX + footprint > zone.x + zone.w || tileY + footprint > zone.y + zone.h)) return false;
    return !placedBuildings(scene).some((b) => b.id !== excludeId && footprintsOverlap(tileX, tileY, footprint, b.tileX, b.tileY, b.footprint));
}

// The free spot nearest the player, so the ghost starts somewhere useful on a touch screen with no hover.
function nearestFreeSpot(scene, footprint) {
    const zone = scene.zone || { x: 0, y: 0, w: COLS, h: ROWS };
    const px = window.player.x / T - footprint / 2;
    const py = (window.player.y + 16) / T;
    let best = null;
    let bestDistance = Infinity;
    for (let y = zone.y; y <= zone.y + zone.h - footprint; y++) {
        for (let x = zone.x; x <= zone.x + zone.w - footprint; x++) {
            const distance = (x - px) ** 2 + (y - py) ** 2;
            if (distance < bestDistance && isSpotValid(scene, x, y, footprint)) {
                best = { x, y };
                bestDistance = distance;
            }
        }
    }
    return best || { x: zone.x, y: zone.y };
}

function pointerWorld(scene, pointer) {
    return scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
}

function pointerTile(scene, pointer, footprint) {
    const world = pointerWorld(scene, pointer);
    return {
        x: clamp(Math.round(world.x / T - footprint / 2), 0, COLS - footprint),
        y: clamp(Math.round(world.y / T - footprint / 2), 0, ROWS - footprint),
    };
}

export function createFootprintMarker(scene) {
    scene.footprintMarker = scene.add.rectangle(0, 0, T, T, 0xffffff, 0.3).setOrigin(0, 0).setDepth(DEPTH.MARKER).setVisible(false);
    scene.minimapCamera.ignore(scene.footprintMarker);
}

function showMarker(scene, tileX, tileY, footprint, style) {
    scene.footprintMarker
        .setPosition(tileX * T, tileY * T)
        .setSize(footprint * T, footprint * T)
        .setFillStyle(style.fill, 0.32)
        .setStrokeStyle(2, style.line, 1)
        .setVisible(true);
}

function setBuildingsEnabled(scene, enabled) {
    window.buildingsGroup.getChildren().forEach((sprite) => {
        if (sprite.input) sprite.input.enabled = enabled;
        const bubble = sprite.getData("bubble");
        if (bubble && bubble.input) bubble.input.enabled = enabled;
    });
}

// ── Placement ghost: scene.beginPlacement / scene.cancelPlacement ──
export function beginPlacement(scene, { buildingId, footprint, mode, assetKey }) {
    if (scene.isVisiting) return false;
    if (scene.placement) finishPlacement(scene, false);
    scene.clearGroundPrompt();
    scene.clearActiveMenu();

    const fp = footprint === 2 ? 2 : footprint === 1 ? 1 : mode === "purchase" ? 1 : 2;
    const spot = nearestFreeSpot(scene, fp);
    let ghost = null;
    if (assetKey) {
        const texture = textureForBuilding(scene, { asset_key: assetKey, metadata: {} });
        if (texture !== "library_asset") {
            ghost = scene.add.image(0, 0, texture).setOrigin(0.5, 1).setAlpha(0.75).setDepth(DEPTH.GHOST);
            scene.minimapCamera.ignore(ghost);
        }
    }
    scene.placement = { buildingId, footprint: fp, mode, assetKey, ghost, tileX: spot.x, tileY: spot.y, valid: false, tracksPointer: false, armed: false };
    scene.placementGrid.setVisible(true);
    setBuildingsEnabled(scene, false);
    renderGhost(scene);
    return true;
}

function renderGhost(scene) {
    const placement = scene.placement;
    placement.valid = isSpotValid(scene, placement.tileX, placement.tileY, placement.footprint);
    const style = placement.valid ? COLOR.valid : COLOR.invalid;
    showMarker(scene, placement.tileX, placement.tileY, placement.footprint, style);
    if (placement.ghost) {
        const { x, y } = footprintAnchor(placement.tileX, placement.tileY, placement.footprint);
        if (!placement.shaking) placement.ghost.setPosition(x, y);
        placement.ghost.setTint(style.tint);
    }
}

// Runs every frame so the ghost also stays under the pointer while WASD scrolls the camera.
export function updatePlacement(scene) {
    const placement = scene.placement;
    if (!placement) return;
    if (placement.tracksPointer) {
        const tile = pointerTile(scene, scene.input.activePointer, placement.footprint);
        placement.tileX = tile.x;
        placement.tileY = tile.y;
    }
    renderGhost(scene);
}

export function confirmPlacement(scene, pointer) {
    const placement = scene.placement;
    if (!placement) return;
    const tile = pointerTile(scene, pointer, placement.footprint);
    placement.tileX = tile.x;
    placement.tileY = tile.y;
    placement.tracksPointer = true;
    renderGhost(scene);

    if (!placement.valid) {
        // Red spot: nothing is sent, the player keeps placing.
        if (placement.ghost && !placement.shaking) {
            placement.shaking = true;
            const { ghost } = placement;
            const x = ghost.x;
            scene.tweens.add({
                targets: ghost,
                x: x + 4,
                duration: 40,
                yoyo: true,
                repeat: 2,
                onComplete: () => {
                    placement.shaking = false;
                },
            });
        }
        return;
    }

    if (placement.mode === "purchase") {
        scene.socket.emit("purchase_building", { assetKey: placement.assetKey, tileX: tile.x, tileY: tile.y });
    } else {
        scene.socket.emit("place_building", { buildingId: placement.buildingId, tileX: tile.x, tileY: tile.y });
    }
    finishPlacement(scene, true);
}

export function finishPlacement(scene, ok) {
    const placement = scene.placement;
    if (!placement) return;
    scene.placement = null;
    if (placement.ghost) {
        scene.tweens.killTweensOf(placement.ghost);
        placement.ghost.destroy();
    }
    scene.footprintMarker.setVisible(false);
    scene.placementGrid.setVisible(false);
    setBuildingsEnabled(scene, true);
    if (scene.onPlacementEnd) scene.onPlacementEnd({ ok });
}

// ── Dragging a placed building: move or merge ──
function isLine(b) {
    return b.kind === "line" || (!!b.line && !!b.level);
}

function isIdentical(a, b) {
    return isLine(a) && isLine(b) && a.line === b.line && a.level === b.level;
}

// The building a drop lands on: the one under the pointer, else the one the footprint covers most.
function dropTargetSprite(scene, state, pointer) {
    const world = pointerWorld(scene, pointer);
    const pointerTileX = Math.floor(world.x / T);
    const pointerTileY = Math.floor(world.y / T);
    const dragged = state.sprite.getData("building");
    let best = null;
    let bestArea = 0;
    for (const sprite of window.buildingsGroup.getChildren()) {
        if (sprite === state.sprite) continue;
        const b = sprite.getData("building");
        if (pointerTileX >= b.tileX && pointerTileX < b.tileX + b.footprint && pointerTileY >= b.tileY && pointerTileY < b.tileY + b.footprint) return sprite;
        if (!footprintsOverlap(state.tileX, state.tileY, dragged.footprint, b.tileX, b.tileY, b.footprint)) continue;
        const w = Math.min(state.tileX + dragged.footprint, b.tileX + b.footprint) - Math.max(state.tileX, b.tileX);
        const h = Math.min(state.tileY + dragged.footprint, b.tileY + b.footprint) - Math.max(state.tileY, b.tileY);
        if (w * h > bestArea) {
            best = sprite;
            bestArea = w * h;
        }
    }
    return best;
}

export function beginDrag(scene, pointer, sprite) {
    const b = sprite.getData("building");
    const world = pointerWorld(scene, pointer);
    scene.pressedSprite = null;
    scene.clearPendingDrop();
    scene.clearGroundPrompt();
    scene.clearActiveMenu();
    scene.tweens.killTweensOf(sprite); // re-grabbed while it was still springing back
    scene.dragState = {
        sprite,
        grabX: world.x - b.tileX * T,
        grabY: world.y - b.tileY * T,
        tileX: b.tileX,
        tileY: b.tileY,
        target: null,
        cancelled: false,
    };
    sprite.setData("dragging", true);
    sprite.setAlpha(0.8);
    sprite.setDepth(DEPTH.GHOST);
    scene.placementGrid.setVisible(true);
    refreshAttachments(scene, sprite);
    updateDrag(scene, pointer);
}

export function updateDrag(scene, pointer) {
    const state = scene.dragState;
    if (!state || state.cancelled) return;
    const { sprite } = state;
    const b = sprite.getData("building");
    const world = pointerWorld(scene, pointer);
    state.tileX = clamp(Math.round((world.x - state.grabX) / T), 0, COLS - b.footprint);
    state.tileY = clamp(Math.round((world.y - state.grabY) / T), 0, ROWS - b.footprint);

    const { x, y } = footprintAnchor(state.tileX, state.tileY, b.footprint);
    sprite.setPosition(x, y);

    const targetSprite = dropTargetSprite(scene, state, pointer);
    if (state.target !== targetSprite) {
        if (state.target && state.target.active) refreshTint(scene, state.target);
        state.target = targetSprite;
    }
    const mergeable = targetSprite && isIdentical(b, targetSprite.getData("building")) && b.level < 3;
    if (mergeable) targetSprite.setTint(COLOR.merge.tint);

    let style = COLOR.invalid;
    if (mergeable) style = COLOR.merge;
    else if (!targetSprite && isSpotValid(scene, state.tileX, state.tileY, b.footprint, b.id)) style = COLOR.valid;
    showMarker(scene, state.tileX, state.tileY, b.footprint, style);
    sprite.setTint(style.tint);
}

function endDragVisuals(scene, state) {
    scene.footprintMarker.setVisible(false);
    scene.placementGrid.setVisible(false);
    if (state.target && state.target.active) refreshTint(scene, state.target);
    state.sprite.setData("dragging", false);
    state.sprite.setAlpha(state.sprite.getData("building").metadata.alpha || 1);
    refreshTint(scene, state.sprite);
}

// Springs a sprite back to the tile the server last confirmed.
export function bounceBack(scene, sprite) {
    const b = sprite.getData("building");
    const { x, y } = footprintAnchor(b.tileX, b.tileY, b.footprint);
    sprite.setDepth(DEPTH.GHOST);
    scene.tweens.killTweensOf(sprite);
    scene.tweens.add({
        targets: sprite,
        x,
        y,
        duration: 220,
        ease: "Back.easeOut",
        onComplete: () => {
            if (!sprite.active) return;
            moveSpriteToTile(scene, sprite);
            refreshTint(scene, sprite);
            refreshAttachments(scene, sprite);
        },
    });
}

// A refused drop says so before it springs back: a red flash and a small shake where it landed.
export function rejectDrop(scene, sprite) {
    flashSprite(scene, sprite, COLOR.invalid.tint, 320);
    sprite.setDepth(DEPTH.GHOST);
    scene.tweens.killTweensOf(sprite);
    scene.tweens.add({
        targets: sprite,
        x: sprite.x + 5,
        duration: 40,
        yoyo: true,
        repeat: 2,
        onComplete: () => {
            if (sprite.active) bounceBack(scene, sprite);
        },
    });
}

export function endDrag(scene, pointer) {
    const state = scene.dragState;
    if (!state) return;
    scene.dragState = null;
    if (state.cancelled) return; // Esc already sprang it back
    const { sprite, tileX, tileY } = state;
    const b = sprite.getData("building");
    const targetSprite = state.target && state.target.active ? state.target : null;
    const target = targetSprite ? targetSprite.getData("building") : null;
    endDragVisuals(scene, state);

    if (target) {
        const held = isIdentical(b, target) && b.level < 3;
        // Line onto line always goes to the server, so a mismatch comes back as an error toast.
        if (isLine(b) && isLine(target)) scene.socket.emit("merge_buildings", { targetId: target.id, sourceId: b.id });
        if (held) scene.holdPendingDrop(sprite);
        else rejectDrop(scene, sprite);
        return;
    }
    if (tileX === b.tileX && tileY === b.tileY) {
        moveSpriteToTile(scene, sprite);
        refreshAttachments(scene, sprite);
        return;
    }
    if (isSpotValid(scene, tileX, tileY, b.footprint, b.id)) {
        scene.socket.emit("move_building", { buildingId: b.id, tileX, tileY });
        sprite.setDepth(sprite.y);
        scene.holdPendingDrop(sprite);
        return;
    }
    rejectDrop(scene, sprite);
}

// Esc while dragging. Phaser still fires dragend on release; endDrag sees the cancelled flag.
export function cancelDrag(scene) {
    const state = scene.dragState;
    if (!state || state.cancelled) return;
    state.cancelled = true;
    endDragVisuals(scene, state);
    bounceBack(scene, state.sprite);
}

// The dragged sprite was destroyed mid-drag (merged or removed from another tab).
export function abandonDrag(scene) {
    const state = scene.dragState;
    if (!state) return;
    scene.dragState = null;
    scene.footprintMarker.setVisible(false);
    scene.placementGrid.setVisible(false);
    if (state.target && state.target.active) refreshTint(scene, state.target);
}

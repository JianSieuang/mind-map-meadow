import { MAP_CONFIG, MINIMAP_CONFIG } from "./config";
import { footprintAnchor } from "./buildings";
import { followPlayer, startFreeLook } from "./controls";
import { TOP_MARGIN } from "./ground";
import { INK, PIXEL_FONT, addLayerElement } from "./textLayer";

// The map panel: a second camera that fits the land you own plus the next plot, not the whole world.
// App.jsx measures the HUD and says where it may sit (scene.placeMinimap); the zoom follows the land.

const T = MAP_CONFIG.TILE_SIZE;
const PAD_X = 7;
const PAD_TOP = 7;
const PAD_BOTTOM = 24; // room for the label
const SHADOW = 3;
const EDGE_TILES = 1; // locked ground kept around the fitted land

const LOCKED_LAND = 0x1f4a2a;
const OPEN_LAND = 0x5a9a4a; // a friend's meadow: we aren't told where their fence is
const ZONE_LINE_PX = 1.25;
const VIEW_LINE_PX = 1.25;
const PIN_INSET_PX = 4;
// The blips are drawn oversized for this zoom (the whole world in the full-size panel).
const BLIP_ZOOM = MINIMAP_CONFIG.WIDTH / MAP_CONFIG.WIDTH;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function growToInclude(box, x, y, w, h) {
    if (!box) return { left: x, top: y, right: x + w, bottom: y + h };
    return { left: Math.min(box.left, x), top: Math.min(box.top, y), right: Math.max(box.right, x + w), bottom: Math.max(box.bottom, y + h) };
}

// World rect to show: the zone and the next plot, grown to fit any building outside them
// (old rows can sit past the fence, and a friend's meadow has only its buildings to go on).
function fitRegion(scene) {
    let box = null;
    if (scene.zone && !scene.isVisiting) {
        [scene.zone, scene.zone.next].forEach((rect) => {
            if (rect) box = growToInclude(box, rect.x * T, rect.y * T, rect.w * T, rect.h * T);
        });
    }
    window.buildingsGroup.getChildren().forEach((sprite) => {
        const b = sprite.getData("building");
        if (!b) return;
        const anchor = footprintAnchor(b.tileX, b.tileY, b.footprint);
        box = growToInclude(box, anchor.x - sprite.displayWidth / 2, anchor.y - sprite.displayHeight, sprite.displayWidth, sprite.displayHeight);
    });
    if (!box) box = growToInclude(null, 3 * T, 2 * T, 16 * T, 12 * T);
    const left = Math.max(box.left - EDGE_TILES * T, 0);
    const top = Math.max(box.top - EDGE_TILES * T, -TOP_MARGIN);
    const right = Math.min(box.right + EDGE_TILES * T, MAP_CONFIG.WIDTH);
    const bottom = Math.min(box.bottom + EDGE_TILES * T, MAP_CONFIG.HEIGHT);
    return { x: left, y: top, w: right - left, h: bottom - top };
}

// Cheap enough for every frame, and it can't miss a zone step, a merge or a visit.
function fitMinimap(scene) {
    const region = fitRegion(scene);
    const panel = scene.minimapPanel;
    const key = [region.x, region.y, region.w, region.h, panel.w, panel.h, scene.isVisiting].join();
    if (key === scene.minimapFitKey) return;
    scene.minimapFitKey = key;

    const zoom = Math.min(panel.w / region.w, panel.h / region.h);
    const centerX = region.x + region.w / 2;
    const centerY = region.y + region.h / 2;
    const halfW = panel.w / 2 / zoom;
    const halfH = panel.h / 2 / zoom;
    scene.minimapView = { centerX, centerY, zoom, left: centerX - halfW, right: centerX + halfW, top: centerY - halfH, bottom: centerY + halfH };

    const cam = scene.minimapCamera;
    cam.setZoom(zoom);
    cam.centerOn(centerX, centerY);
    cam.setBackgroundColor(scene.zone && !scene.isVisiting ? LOCKED_LAND : OPEN_LAND);

    // Everything drawn only for the map keeps its size on screen, whatever the zoom.
    scene.minimapBlipScale = BLIP_ZOOM / zoom;
    if (scene.playerBlip) scene.playerBlip.setScale(scene.minimapBlipScale);
    if (scene.aiBlip) scene.aiBlip.setScale(scene.minimapBlipScale);
    window.buildingsGroup.getChildren().forEach((sprite) => {
        const blip = sprite.getData("minimapBlip");
        if (blip) blip.setScale(scene.minimapBlipScale);
    });
    if (scene.minimapZone) scene.minimapZone.setStrokeStyle(ZONE_LINE_PX / zoom, 0xffd65a, 1);
    scene.minimapViewportRect.setStrokeStyle(VIEW_LINE_PX / zoom, 0xffffff, 0.85);
}

function drawFrame(scene) {
    const { x, y, w, h } = scene.minimapPanel;
    const frameX = x - PAD_X;
    const frameY = y - PAD_TOP;
    const frameW = w + PAD_X * 2;
    const frameH = h + PAD_TOP + PAD_BOTTOM;
    scene.minimapFrame.clear();
    scene.minimapFrame.fillStyle(0x2b1e1a, 1);
    scene.minimapFrame.fillRoundedRect(frameX, frameY + SHADOW, frameW, frameH, 2);
    scene.minimapFrame.fillStyle(0xf6e6c8, 1);
    scene.minimapFrame.fillRoundedRect(frameX, frameY, frameW, frameH, 2);
    scene.minimapFrame.lineStyle(2, 0x2b1e1a, 1);
    scene.minimapFrame.strokeRoundedRect(frameX, frameY, frameW, frameH, 2);
    scene.minimapLabel.style.left = `${frameX}px`;
    scene.minimapLabel.style.top = `${y + h + 2}px`;
    scene.minimapLabel.style.width = `${frameW}px`;
}

// top: the frame's top edge. right/bottom: how far the frame and its shadow may reach; it shrinks
// to stay inside them. Returns the frame's bottom edge in screen pixels.
function placeMinimap(scene, { top = MINIMAP_CONFIG.FRAME_TOP, right = Infinity, bottom = Infinity } = {}) {
    const x = MINIMAP_CONFIG.FRAME_LEFT + PAD_X;
    const y = top + PAD_TOP;
    const roomW = right - x - PAD_X;
    const roomH = Math.max(bottom - y - PAD_BOTTOM - SHADOW, MINIMAP_CONFIG.MIN_HEIGHT);
    const fit = Math.min(1, roomW / MINIMAP_CONFIG.WIDTH, roomH / MINIMAP_CONFIG.HEIGHT);
    const w = Math.round(MINIMAP_CONFIG.WIDTH * fit);
    const h = Math.round(MINIMAP_CONFIG.HEIGHT * fit);
    const panel = scene.minimapPanel;
    if (!panel || panel.x !== x || panel.y !== y || panel.w !== w || panel.h !== h) {
        scene.minimapPanel = { x, y, w, h };
        scene.minimapCamera.setViewport(x, y, w, h);
        drawFrame(scene);
        scene.minimapDragZone.setPosition(x + w / 2, y + h / 2).setSize(w, h);
        scene.minimapFitKey = null; // a resized camera has to be centred again
    }
    return y + h + PAD_BOTTOM + SHADOW;
}

export function createMinimap(scene) {
    scene.minimapCamera = scene.cameras.add(0, 0, MINIMAP_CONFIG.WIDTH, MINIMAP_CONFIG.HEIGHT);
    scene.minimapCamera.setName("minimap");
    // Buildings are draggable now: input through the tiny minimap view must never pick one up.
    scene.minimapCamera.inputEnabled = false;
    scene.minimapBlipScale = 1;

    // The shared panel style behind the minimap viewport, with room at the bottom for the label.
    scene.minimapFrame = scene.add.graphics().setScrollFactor(0).setDepth(9997);
    scene.minimapCamera.ignore(scene.minimapFrame);

    scene.minimapLabel = addLayerElement(scene, "div", {
        textAlign: "center",
        font: `600 14px/18px ${PIXEL_FONT}`,
        color: INK,
    });
    scene.minimapLabel.textContent = "Meadow map";

    // Rectangle showing the main camera's visible viewport, drawn only on the minimap.
    scene.minimapViewportRect = scene.add.rectangle(0, 0, 10, 10).setFillStyle(0, 0).setDepth(9999);
    scene.cameras.main.ignore(scene.minimapViewportRect);

    // Invisible drag-to-pan zone sitting exactly over the minimap's screen rect.
    // Dragging it pans the main camera around the world without moving the player;
    // a movement key, the recentre button or closing the map returns to following the player.
    // Depth keeps it on top of any building that happens to be under the panel.
    scene.isFreeLook = false;
    scene.minimapDragZone = scene.add
        .zone(0, 0, MINIMAP_CONFIG.WIDTH, MINIMAP_CONFIG.HEIGHT)
        .setScrollFactor(0)
        .setDepth(9999)
        .setInteractive({ draggable: true, useHandCursor: true });
    scene.minimapDragZone.setData("isUiElement", true);
    scene.input.setDraggable(scene.minimapDragZone);
    scene.minimapDragZone.on("pointerdown", () => startFreeLook(scene));

    scene.placeMinimap = (layout) => placeMinimap(scene, layout);
    placeMinimap(scene);

    scene.minimapVisible = false;

    // When closed, the drag zone is fully disabled so that screen corner behaves like
    // normal grass again (clickable for task creation) instead of an inert dead spot.
    scene.toggleMinimap = (visible) => {
        scene.minimapVisible = visible;
        scene.minimapCamera.setVisible(visible);
        scene.minimapFrame.setVisible(visible);
        scene.minimapLabel.style.display = visible ? "block" : "none";
        if (visible) {
            scene.minimapDragZone.setInteractive({ draggable: true, useHandCursor: true });
            scene.input.setDraggable(scene.minimapDragZone, true);
        } else {
            scene.minimapDragZone.disableInteractive();
            scene.input.setDraggable(scene.minimapDragZone, false);
            if (scene.isFreeLook) followPlayer(scene);
        }
    };
    scene.toggleMinimap(false);
}

// A press inside the panel, held and moved: centre the main camera on that spot of the map.
export function panFromMinimap(scene, pointer) {
    const panel = scene.minimapPanel;
    const view = scene.minimapView;
    if (!view) return;
    const cam = scene.cameras.main;
    cam.centerOn(view.centerX + (pointer.x - panel.x - panel.w / 2) / view.zoom, view.centerY + (pointer.y - panel.y - panel.h / 2) / view.zoom);
    cam.setScroll(cam.clampX(cam.scrollX), cam.clampY(cam.scrollY));
}

// Someone off the edge of the fitted land stays on the map, pinned to the side they went off.
function pinBlip(view, blip, x, y) {
    const inset = PIN_INSET_PX / view.zoom;
    blip.setPosition(clamp(x, view.left + inset, view.right - inset), clamp(y, view.top + inset, view.bottom - inset));
}

// Runs every frame while the map is open.
export function updateMinimap(scene) {
    if (!scene.minimapVisible) return;
    fitMinimap(scene);
    const view = scene.minimapView;
    pinBlip(view, scene.playerBlip, window.player.x, window.player.y);
    pinBlip(view, scene.aiBlip, window.aiCompanion.x, window.aiCompanion.y);

    // Clipped to the panel: on a big screen the main view is larger than the fitted land,
    // and an outline past the panel's edge would simply vanish.
    const main = scene.cameras.main.worldView;
    const inset = VIEW_LINE_PX / 2 / view.zoom;
    const left = Math.max(main.x, view.left + inset);
    const top = Math.max(main.y, view.top + inset);
    const right = Math.min(main.right, view.right - inset);
    const bottom = Math.min(main.bottom, view.bottom - inset);
    const onMap = right > left && bottom > top;
    scene.minimapViewportRect.setVisible(onMap);
    if (onMap) {
        scene.minimapViewportRect.setPosition((left + right) / 2, (top + bottom) / 2);
        scene.minimapViewportRect.setSize(right - left, bottom - top);
    }
}

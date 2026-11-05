import { DEPTH, MAP_CONFIG } from "./config";
import { INK, addLayerElement } from "./textLayer";

// Camera and pointer gestures that aren't about a building: panning, recentring, walking to a
// tapped spot, the ground prompt, and scrolling the camera while a building is held at a screen edge.
// A press on empty ground is a tap or a pan; a press on a building is a tap or a building drag
// (Phaser's own drag events, see placement.js). The two never overlap because a press belongs to
// whatever it started on.

const T = MAP_CONFIG.TILE_SIZE;
const FOLLOW_LERP = 0.1;
const FEET_OFFSET = 11; // window.player.y to the middle of its feet collision body
const WALK_STUCK_MS = 300;
const EDGE_BAND = 40;
const EDGE_SPEED = 480; // px per second
// Screen space the React HUD keeps for itself, so the prompt never lands underneath it.
const HUD_TOP = 64;
const HUD_BOTTOM = 96;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// A camera only applies its bounds on its own while following something.
function scrollInsideWorld(cam, x, y) {
    cam.setScroll(cam.clampX(x), cam.clampY(y));
}

// ── Following vs free look ──
export function followPlayer(scene) {
    const cam = scene.cameras.main;
    const { scrollX, scrollY } = cam;
    scene.isFreeLook = false;
    // startFollow snaps; putting the scroll back lets the follow lerp glide there instead.
    cam.startFollow(window.player, true, FOLLOW_LERP, FOLLOW_LERP);
    cam.setScroll(scrollX, scrollY);
    if (scene.recentreButton) scene.recentreButton.setVisible(false);
}

export function startFreeLook(scene) {
    if (scene.isFreeLook) return;
    scene.isFreeLook = true;
    scene.cameras.main.stopFollow();
    if (scene.recentreButton) scene.recentreButton.setVisible(true);
}

// Only there while the camera has left the player. Clear of the icon rail and the bottom bar.
export function positionRecentreButton(scene) {
    if (!scene.recentreButton) return;
    scene.recentreButton.setPosition(scene.scale.width - 38, Math.max(scene.scale.height - 236, 320));
}

export function createRecentreButton(scene) {
    if (!scene.textures.exists("ui_recentre")) return;
    const button = scene.add.image(0, 0, "ui_recentre").setScrollFactor(0).setDepth(DEPTH.SLEEP + 10).setVisible(false);
    button.setInteractive({ useHandCursor: true });
    button.setData("isUiElement", true);
    button.on("pointerdown", (pointer, localX, localY, event) => {
        event.stopPropagation();
        followPlayer(scene);
    });
    scene.minimapCamera.ignore(button);
    scene.recentreButton = button;
    positionRecentreButton(scene);
}

// ── Press on empty ground ──
export function beginGroundPress(scene, pointer) {
    const hadPrompt = !!scene.activeGroundPrompt;
    scene.clearActiveMenu();
    scene.clearGroundPrompt();
    scene.groundPress = { x: pointer.x, y: pointer.y, anchorX: 0, anchorY: 0, panning: false, hadPrompt };
}

export function updateGroundPress(scene, pointer) {
    const press = scene.groundPress;
    if (!press) return;
    const dx = pointer.x - press.x;
    const dy = pointer.y - press.y;
    const cam = scene.cameras.main;
    if (!press.panning) {
        if (Math.hypot(dx, dy) < scene.input.dragDistanceThreshold) return;
        press.panning = true;
        // Anchored here, not at the press, so the map doesn't jump by the threshold.
        press.anchorX = cam.scrollX + dx;
        press.anchorY = cam.scrollY + dy;
        startFreeLook(scene);
    }
    scrollInsideWorld(cam, press.anchorX - dx, press.anchorY - dy);
}

// tapAllowed is false when the release landed outside the canvas (on a HUD element).
export function endGroundPress(scene, pointer, tapAllowed) {
    const press = scene.groundPress;
    if (!press) return;
    scene.groundPress = null;
    // Tapping away from an open prompt only closes it.
    if (press.panning || !tapAllowed || press.hadPrompt || scene.placement || scene.dragState || scene.pendingDrop) return;

    const world = scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    if (world.x < 0 || world.y < 0 || world.x >= MAP_CONFIG.WIDTH || world.y >= MAP_CONFIG.HEIGHT) return;
    const tileCentreX = Math.floor(world.x / T) * T + T / 2;
    const tileCentreY = Math.floor(world.y / T) * T + T / 2;
    // There's nothing to create on a friend's meadow, so a tap there just walks.
    if (scene.isVisiting) walkTo(scene, tileCentreX, tileCentreY);
    else showGroundPrompt(scene, tileCentreX, tileCentreY);
}

// ── Ground prompt: DOM, see textLayer.js. Buttons act on click, i.e. on release, so the task form
// never opens under a finger that's still down. ──
const PROMPT_WIDTH = 144;
const PROMPT_GAP = 4;
const PROMPT_BORDER = 2;

function addPromptButton(panel, label, background, height, onTap) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    Object.assign(button.style, {
        display: "block",
        width: "100%",
        height: `${height}px`,
        padding: "0",
        background,
        color: INK,
        border: `2px solid ${INK}`,
        borderRadius: "2px",
        fontFamily: "inherit",
        fontSize: "14px",
        fontWeight: "700",
        lineHeight: "1",
        cursor: "pointer",
        touchAction: "manipulation",
    });
    button.addEventListener("click", onTap);
    panel.appendChild(button);
}

function showGroundPrompt(scene, tileCentreX, tileCentreY) {
    const rowHeight = scene.sys.game.device.input.touch ? 44 : 34;
    const width = PROMPT_WIDTH;
    const height = rowHeight * 2 + PROMPT_GAP * 3 + PROMPT_BORDER * 2;
    const view = scene.cameras.main.worldView;

    // Below the tile, or above it if that would run under the bottom HUD. Always fully on screen.
    let top = tileCentreY + T / 2 + 8;
    if (top + height > view.bottom - HUD_BOTTOM) top = tileCentreY - T / 2 - 8 - height;
    top = clamp(top, view.y + HUD_TOP, view.bottom - 8 - height);
    const left = clamp(tileCentreX - width / 2, view.x + 8, view.right - 8 - width);

    scene.gridHighlight.setPosition(tileCentreX, tileCentreY).setVisible(true);
    const panel = addLayerElement(scene, "div", {
        boxSizing: "border-box",
        width: `${width}px`,
        height: `${height}px`,
        padding: `${PROMPT_GAP}px`,
        display: "flex",
        flexDirection: "column",
        gap: `${PROMPT_GAP}px`,
        background: "#f6e6c8",
        border: `${PROMPT_BORDER}px solid ${INK}`,
        borderRadius: "2px",
        boxShadow: `0 3px 0 ${INK}`,
        pointerEvents: "auto",
    });
    addPromptButton(panel, "+ New task", "#e0a526", rowHeight, () => {
        scene.clearGroundPrompt();
        scene.onMapClick();
    });
    addPromptButton(panel, "Walk here", "#e8c99a", rowHeight, () => {
        scene.clearGroundPrompt();
        walkTo(scene, tileCentreX, tileCentreY);
    });

    scene.activeGroundPrompt = { panel, left, top, destroy: () => panel.remove() };
    updateGroundPrompt(scene);
}

// Pinned to its spot in the world while the camera finishes settling.
export function updateGroundPrompt(scene) {
    const prompt = scene.activeGroundPrompt;
    if (!prompt) return;
    const cam = scene.cameras.main;
    prompt.panel.style.left = `${Math.round(prompt.left - cam.scrollX)}px`;
    prompt.panel.style.top = `${Math.round(prompt.top - cam.scrollY)}px`;
}

// ── Walking to a spot: a straight line that gives up when something is in the way ──
export function walkTo(scene, x, y) {
    scene.walkTarget = { x, y: y - FEET_OFFSET, best: Infinity, stuckMs: 0 };
    followPlayer(scene);
}

export function cancelWalk(scene) {
    if (!scene.walkTarget) return;
    scene.walkTarget = null;
    if (window.player && window.player.body) window.player.body.setVelocity(0);
}

// Runs once a frame; returns true while the player is walking.
export function stepWalk(scene, delta) {
    const walk = scene.walkTarget;
    if (!walk) return false;
    const dx = walk.x - window.player.x;
    const dy = walk.y - window.player.y;
    const distance = Math.hypot(dx, dy);
    // Less than a frame away (about 7px at 60fps): land exactly on the spot, at any walking speed.
    if (distance <= (MAP_CONFIG.PLAYER_SPEED * delta) / 1000) {
        window.player.body.reset(walk.x, walk.y);
        cancelWalk(scene);
        return false;
    }
    if (distance < walk.best - 0.5) {
        walk.best = distance;
        walk.stuckMs = 0;
    } else {
        walk.stuckMs += delta;
        if (walk.stuckMs > WALK_STUCK_MS) {
            cancelWalk(scene);
            return false;
        }
    }
    window.player.body.setVelocity((dx / distance) * MAP_CONFIG.PLAYER_SPEED, (dy / distance) * MAP_CONFIG.PLAYER_SPEED);
    return true;
}

// ── Holding a building or placement ghost at a screen edge scrolls the map, so a phone can reach
// anywhere while the finger is busy. Returns true if the camera moved. ──
export function edgeScroll(scene, delta) {
    const pointer = scene.input.activePointer;
    const holding = (scene.dragState && !scene.dragState.cancelled) || (scene.placement && scene.placement.armed);
    if (!holding || !pointer.isDown) return false;
    const cam = scene.cameras.main;
    const dirX = pointer.x < EDGE_BAND ? -1 : pointer.x > cam.width - EDGE_BAND ? 1 : 0;
    const dirY = pointer.y < EDGE_BAND ? -1 : pointer.y > cam.height - EDGE_BAND ? 1 : 0;
    if (!dirX && !dirY) return false;
    startFreeLook(scene);
    const step = (EDGE_SPEED * delta) / 1000;
    scrollInsideWorld(cam, cam.scrollX + dirX * step, cam.scrollY + dirY * step);
    return true;
}

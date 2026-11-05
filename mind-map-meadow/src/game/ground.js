import { DEPTH, MAP_CONFIG } from "./config";

const T = MAP_CONFIG.TILE_SIZE;
const COLS = MAP_CONFIG.WIDTH / T;
const ROWS = MAP_CONFIG.HEIGHT / T;

// Tall art on the top rows pokes above y=0, so the camera can scroll a little past the map.
export const TOP_MARGIN = 96;
// Same at the bottom, so the last row can be scrolled clear of the Goals/Log bar.
export const BOTTOM_MARGIN = 192;

const DIM_COLOR = 0x1c1a2e;
const DIM_LOCKED = 0.42;
const DIM_NEXT = 0.26; // the next plot: still locked, but visibly closer than the rest

// Same hash for a given tile on every client and every load, so the ground never reshuffles.
function tileHash(x, y) {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) % 100;
}

// Weighted pick: mostly plain speckled grass, sometimes tufts, rarely flowers or pebbles.
function grassVariant(x, y) {
    const v = tileHash(x, y);
    if (v < 28) return 0;
    if (v < 52) return 1;
    if (v < 74) return 2;
    if (v < 84) return 3;
    if (v < 92) return 4;
    if (v < 95) return 5;
    if (v < 98) return 6;
    return 7;
}

export function createGround(scene) {
    if (!scene.textures.exists("ground_tiles")) return; // falls back to the plain grass background colour
    // Extra rows run under the camera's top and bottom margins, keyed by real row so the map itself is unchanged.
    const rowsAbove = Math.ceil(TOP_MARGIN / T);
    const rowsBelow = Math.ceil(BOTTOM_MARGIN / T);
    const data = [];
    for (let y = -rowsAbove; y < ROWS + rowsBelow; y++) {
        const row = [];
        for (let x = 0; x < COLS; x++) row.push(grassVariant(x, y));
        data.push(row);
    }
    const map = scene.make.tilemap({ data, tileWidth: T, tileHeight: T });
    const tileset = map.addTilesetImage("ground_tiles", "ground_tiles", T, T, 0, 0);
    scene.groundLayer = map.createLayer(0, tileset, 0, -rowsAbove * T).setDepth(DEPTH.GROUND);
    scene.minimapCamera.ignore(scene.groundLayer);
}

// Faint tile lines, shown only while placing or dragging.
export function createPlacementGrid(scene) {
    const grid = scene.add.graphics().setDepth(DEPTH.GRID).setVisible(false);
    grid.lineStyle(1, 0x2b1e1a, 0.16);
    for (let x = 0; x <= MAP_CONFIG.WIDTH; x += T) grid.lineBetween(x, 0, x, MAP_CONFIG.HEIGHT);
    for (let y = 0; y <= MAP_CONFIG.HEIGHT; y += T) grid.lineBetween(0, y, MAP_CONFIG.WIDTH, y);
    scene.minimapCamera.ignore(grid);
    scene.placementGrid = grid;
}

export function createZoneOverlay(scene) {
    scene.zoneDim = scene.add.graphics().setDepth(DEPTH.ZONE_DIM);
    scene.zoneFence = [];
    scene.minimapCamera.ignore(scene.zoneDim);

    // The minimap has no ground layer: it shows the unlocked land as a bright rectangle instead,
    // and the next plot a step brighter than the locked land around it. minimap.js sets the line.
    scene.minimapNext = scene.add.rectangle(0, 0, 10, 10, 0x3f7a3a, 1).setOrigin(0, 0).setDepth(-2).setVisible(false);
    scene.minimapZone = scene.add.rectangle(0, 0, 10, 10, 0x5a9a4a, 1).setOrigin(0, 0).setDepth(-1).setVisible(false);
    scene.cameras.main.ignore([scene.minimapNext, scene.minimapZone]);
}

// Four rectangles around `hole`, inside `outer`; a real hole would need a mask for no visual gain.
function fillAround(gfx, outer, hole) {
    gfx.fillRect(outer.x, outer.y, outer.w, hole.y - outer.y);
    gfx.fillRect(outer.x, hole.y + hole.h, outer.w, outer.y + outer.h - (hole.y + hole.h));
    gfx.fillRect(outer.x, hole.y, hole.x - outer.x, hole.h);
    gfx.fillRect(hole.x + hole.w, hole.y, outer.x + outer.w - (hole.x + hole.w), hole.h);
}

const contains = (outer, inner) => inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;

function fencePiece(scene, key, x, y, originX, originY, depth) {
    if (!scene.textures.exists(key)) return;
    const piece = scene.add.image(x, y, key).setOrigin(originX, originY).setDepth(depth);
    scene.minimapCamera.ignore(piece);
    scene.zoneFence.push(piece);
}

// The rails along the top and bottom sort by ground Y like any other object, so someone standing
// behind the fence is hidden by it. Side runs stay on the ground: they're seen from above.
function drawFence(scene, x, y, w, h) {
    const footOverlap = 4; // the art's feet and shadow sit this far below the line
    for (let px = x; px < x + w; px += T) {
        fencePiece(scene, "ui_zone_fence_h", px, y + footOverlap, 0, 1, y);
        fencePiece(scene, "ui_zone_fence_h", px, y + h + footOverlap, 0, 1, y + h - 1);
    }
    for (let py = y; py < y + h; py += T) {
        fencePiece(scene, "ui_zone_fence_v", x - 6, py, 0, 0, DEPTH.ZONE_LINE);
        fencePiece(scene, "ui_zone_fence_v", x + w - 6, py, 0, 0, DEPTH.ZONE_LINE);
    }
    [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].forEach(([cx, cy]) => {
        fencePiece(scene, "ui_zone_stake", cx - 7, cy + 3, 0, 1, cy);
    });
}

export function drawZone(scene) {
    const zone = scene.zone;
    const show = !!zone && !scene.isVisiting;
    scene.zoneDim.setVisible(show);
    scene.minimapZone.setVisible(show);
    scene.minimapNext.setVisible(show && !!zone.next);
    scene.zoneDim.clear();
    scene.zoneFence.forEach((piece) => piece.destroy());
    scene.zoneFence = [];
    if (!show) return;

    const land = { x: zone.x * T, y: zone.y * T, w: zone.w * T, h: zone.h * T };
    const world = { x: 0, y: -TOP_MARGIN, w: MAP_CONFIG.WIDTH, h: MAP_CONFIG.HEIGHT + TOP_MARGIN + BOTTOM_MARGIN };
    const next = zone.next ? { x: zone.next.x * T, y: zone.next.y * T, w: zone.next.w * T, h: zone.next.h * T } : null;

    if (next && contains(next, land)) {
        scene.zoneDim.fillStyle(DIM_COLOR, DIM_LOCKED);
        fillAround(scene.zoneDim, world, next);
        scene.zoneDim.fillStyle(DIM_COLOR, DIM_NEXT);
        fillAround(scene.zoneDim, next, land);
        // Quiet pegs mark the next plot's corners; the lighter ground does the rest.
        [[next.x, next.y], [next.x + next.w, next.y], [next.x, next.y + next.h], [next.x + next.w, next.y + next.h]].forEach(([cx, cy]) => {
            fencePiece(scene, "ui_zone_peg", cx, cy + 2, 0.5, 1, DEPTH.ZONE_LINE);
        });
    } else {
        scene.zoneDim.fillStyle(DIM_COLOR, DIM_LOCKED);
        fillAround(scene.zoneDim, world, land);
    }

    drawFence(scene, land.x, land.y, land.w, land.h);

    scene.minimapZone.setPosition(land.x, land.y).setSize(land.w, land.h);
    if (next) scene.minimapNext.setPosition(next.x, next.y).setSize(next.w, next.h);
}

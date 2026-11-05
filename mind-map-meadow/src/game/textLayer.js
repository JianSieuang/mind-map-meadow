// All words in the game world are real DOM text in a layer over the canvas, never Phaser text.
// The canvas is backed at CSS size and shown with image-rendering: pixelated, so on a scaled screen
// (125%, 150%, any phone) the browser nearest-neighbour stretches the whole thing: fine for pixel
// art, jagged and blurry for smooth text, and a higher Text `resolution` can't get past it. DOM text
// is drawn at the screen's real resolution, and a web font swaps in by itself once it has loaded.

export const PIXEL_FONT = '"Pixelify Sans", ui-monospace, monospace'; // headings and numbers only
export const INK = "#2b1e1a";

export function createTextLayer(scene) {
    const layer = document.createElement("div");
    Object.assign(layer.style, { position: "absolute", inset: "0", overflow: "hidden", pointerEvents: "none" });
    scene.scale.parent.appendChild(layer);
    scene.textLayer = layer;
}

export function removeTextLayer(scene) {
    if (scene.textLayer) scene.textLayer.remove();
    scene.textLayer = null;
}

export function addLayerElement(scene, tag, style) {
    const el = document.createElement(tag);
    Object.assign(el.style, { position: "absolute", left: "0", top: "0" }, style);
    scene.textLayer.appendChild(el);
    return el;
}

// Whole pixels, so the text never lands between device pixels. (sx, sy) is the element's centre.
export function placeCentred(el, sx, sy) {
    el.style.left = `${Math.round(sx - el.offsetWidth / 2)}px`;
    el.style.top = `${Math.round(sy - el.offsetHeight / 2)}px`;
}

// Builds the installable-app icons from our own House sprite: scaled up pixel-perfect (no
// smoothing) onto a grass square with the outline colour as a border. Node built-ins only.
// Run from mind-map-meadow/:  node scripts/make-app-icons.mjs
import fs from "node:fs";
import zlib from "node:zlib";

const SPRITE = "src/assets/Lines/Homes/Lv2_House.png";
const OUT = "public/icons";

function readPng(file) {
    const buf = fs.readFileSync(file);
    let pos = 8;
    let width, height, colorType, bitDepth, interlace;
    const idat = [];
    while (pos < buf.length) {
        const len = buf.readUInt32BE(pos);
        const type = buf.toString("ascii", pos + 4, pos + 8);
        const data = buf.subarray(pos + 8, pos + 8 + len);
        if (type === "IHDR") {
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            bitDepth = data[8];
            colorType = data[9];
            interlace = data[12];
        } else if (type === "IDAT") idat.push(data);
        pos += 12 + len;
    }
    if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) throw new Error(`unsupported PNG (depth ${bitDepth}, type ${colorType}, interlace ${interlace})`);
    const raw = zlib.inflateSync(Buffer.concat(idat));
    const stride = width * 4;
    const px = Buffer.alloc(height * stride);
    for (let y = 0; y < height; y++) {
        const filter = raw[y * (stride + 1)];
        for (let x = 0; x < stride; x++) {
            const cur = raw[y * (stride + 1) + 1 + x];
            const a = x >= 4 ? px[y * stride + x - 4] : 0;
            const b = y > 0 ? px[(y - 1) * stride + x] : 0;
            const c = x >= 4 && y > 0 ? px[(y - 1) * stride + x - 4] : 0;
            let v;
            if (filter === 0) v = cur;
            else if (filter === 1) v = cur + a;
            else if (filter === 2) v = cur + b;
            else if (filter === 3) v = cur + ((a + b) >> 1);
            else {
                const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
                v = cur + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
            }
            px[y * stride + x] = v & 255;
        }
    }
    return { width, height, px };
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});
function crc32(buf) {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, "ascii");
    data.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
}
function writePng(file, width, height, px) {
    const raw = Buffer.alloc(height * (width * 4 + 1));
    for (let y = 0; y < height; y++) px.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]));
}

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];
const GRASS = hex("#5a9a4a");
const GRASS_DARK = hex("#3f7a3a");
const OUTLINE = hex("#2b1e1a");

// maskable: the art keeps to the middle 80% so a phone's circle or squircle crop never cuts it.
function makeIcon(sprite, size, { maskable }) {
    const px = Buffer.alloc(size * size * 4);
    const border = maskable ? 0 : Math.max(2, Math.round(size / 64));
    for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
            const edge = x < border || y < border || x >= size - border || y >= size - border;
            const checker = (Math.floor(x / (size / 8)) + Math.floor(y / (size / 8))) % 2 === 0;
            px.set(edge ? OUTLINE : checker ? GRASS : GRASS_DARK, (y * size + x) * 4);
        }
    const room = size * (maskable ? 0.62 : 0.78);
    const scale = Math.max(1, Math.floor(Math.min(room / sprite.width, room / sprite.height)));
    const w = sprite.width * scale, h = sprite.height * scale;
    const ox = Math.floor((size - w) / 2), oy = Math.floor((size - h) / 2);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const s = ((Math.floor(y / scale) * sprite.width) + Math.floor(x / scale)) * 4;
            if (sprite.px[s + 3] < 128) continue; // pixel art: on or off, no blending
            px.set([sprite.px[s], sprite.px[s + 1], sprite.px[s + 2], 255], ((oy + y) * size + ox + x) * 4);
        }
    return px;
}

const sprite = readPng(SPRITE);
fs.mkdirSync(OUT, { recursive: true });
for (const [name, size, maskable] of [["icon-192.png", 192, false], ["icon-512.png", 512, false], ["icon-maskable-512.png", 512, true], ["apple-touch-icon.png", 180, true]]) {
    writePng(`${OUT}/${name}`, size, size, makeIcon(sprite, size, { maskable }));
    console.log(`${OUT}/${name}`);
}

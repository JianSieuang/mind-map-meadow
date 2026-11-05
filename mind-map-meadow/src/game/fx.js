import Phaser from "phaser";
import { DEPTH, MAP_CONFIG } from "./config";
import { refreshTint } from "./buildings";
import { INK, PIXEL_FONT, addLayerElement, placeCentred } from "./textLayer";

const T = MAP_CONFIG.TILE_SIZE;

function fxImage(scene, key, x, y) {
    if (!scene.textures.exists(key)) return null;
    const img = scene.add.image(x, y, key).setDepth(DEPTH.FX);
    scene.minimapCamera.ignore(img);
    return img;
}

export function dustPuff(scene, x, y, count = 8, spread = 40) {
    for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
        const puff = fxImage(scene, "ui_dust", x + Math.cos(angle) * 8, y + Math.sin(angle) * 4);
        if (!puff) return;
        puff.setScale(0.6);
        scene.tweens.add({
            targets: puff,
            x: x + Math.cos(angle) * spread,
            y: y + Math.sin(angle) * spread * 0.5 - 6,
            scale: 1.4,
            alpha: 0,
            duration: 420 + Math.random() * 180,
            ease: "Quad.easeOut",
            onComplete: () => puff.destroy(),
        });
    }
}

function sparkles(scene, x, y, count = 6, spread = 48) {
    for (let i = 0; i < count; i++) {
        const s = fxImage(scene, "ui_sparkle", x + Phaser.Math.Between(-spread, spread), y + Phaser.Math.Between(-spread, spread / 2));
        if (!s) return;
        s.setScale(0.2);
        scene.tweens.add({
            targets: s,
            scale: 1.2,
            alpha: { from: 1, to: 0 },
            duration: 360,
            delay: i * 50,
            ease: "Sine.easeOut",
            onComplete: () => s.destroy(),
        });
    }
}

// Rises from a spot in the world, following the camera as it goes.
function floatText(scene, x, y, message, color = "#ffd65a") {
    const label = addLayerElement(scene, "div", {
        font: `600 16px/1 ${PIXEL_FONT}`,
        color,
        whiteSpace: "nowrap",
        textShadow: `-1px 0 ${INK}, 1px 0 ${INK}, 0 -1px ${INK}, 0 1px ${INK}, 1px 2px ${INK}`,
    });
    label.textContent = message;
    const state = { y, alpha: 1 };
    const place = () => {
        const cam = scene.cameras.main;
        placeCentred(label, x - cam.scrollX, state.y - cam.scrollY);
        label.style.opacity = state.alpha;
    };
    place();
    scene.tweens.add({ targets: state, y: y - 26, alpha: 0, duration: 950, ease: "Sine.easeOut", onUpdate: place, onComplete: () => label.remove() });
}

// Squash-free pop from the bottom-centre origin. Always restarts from the resting scale.
export function popSprite(scene, sprite, amount = 1.15) {
    const base = sprite.getData("baseScale") || 1;
    scene.tweens.killTweensOf(sprite);
    sprite.setScale(base * amount);
    scene.tweens.add({ targets: sprite, scaleX: base, scaleY: base, duration: 450, ease: "Back.easeOut" });
}

// Brief colour flash; only the latest flash settles the tint back to the building's state tint.
export function flashSprite(scene, sprite, color = 0xffe08a, ms = 300) {
    const prev = sprite.getData("flashTimer");
    if (prev) prev.remove(false);
    sprite.setTint(color);
    sprite.setData(
        "flashTimer",
        scene.time.delayedCall(ms, () => {
            sprite.setData("flashTimer", null);
            if (sprite.active) refreshTint(scene, sprite);
        }),
    );
}

export function mergeEffect(scene, sprite, footprint) {
    const size = footprint * T;
    dustPuff(scene, sprite.x, sprite.y - size / 3, 10, 56);
    sparkles(scene, sprite.x, sprite.y - sprite.displayHeight / 2, 7, 44);
    flashSprite(scene, sprite, 0xffe08a, 300);
    popSprite(scene, sprite, 1.22);
}

export function coinBurst(scene, x, y, coins) {
    const count = Phaser.Math.Clamp(coins, 1, 8);
    for (let i = 0; i < count; i++) {
        const coin = fxImage(scene, "ui_coin", x, y);
        if (!coin) break;
        const dx = Phaser.Math.Between(-30, 30);
        const rise = Phaser.Math.Between(26, 54);
        scene.tweens.add({
            targets: coin,
            x: x + dx * 0.6,
            y: y - rise,
            duration: 240,
            delay: i * 22,
            ease: "Quad.easeOut",
            onComplete: () =>
                scene.tweens.add({
                    targets: coin,
                    x: x + dx,
                    y: y - rise + 34,
                    alpha: 0,
                    duration: 320,
                    ease: "Quad.easeIn",
                    onComplete: () => coin.destroy(),
                }),
        });
    }
    floatText(scene, x, y - 18, `+${coins}`);
}

// A short gold flash around the new zone border, with dust at its corners.
export function zoneExpandPop(scene, zone) {
    const x = zone.x * T;
    const y = zone.y * T;
    const w = zone.w * T;
    const h = zone.h * T;
    const ring = scene.add.graphics().setDepth(DEPTH.FX);
    ring.lineStyle(6, 0xffd65a, 1);
    ring.strokeRect(x, y, w, h);
    scene.minimapCamera.ignore(ring);
    scene.tweens.add({ targets: ring, alpha: 0, duration: 800, ease: "Quad.easeOut", onComplete: () => ring.destroy() });
    [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].forEach(([cx, cy]) => {
        dustPuff(scene, cx, cy, 6, 36);
        sparkles(scene, cx, cy, 3, 24);
    });
}

// ── Sleepy town: a screen-fixed dim layer plus scrolling rain. Screen-fixed objects are ignored
// by the minimap camera so the rain never lands on the map panel.
export function createSleepOverlay(scene) {
    const cam = scene.cameras.main;
    const dim = scene.add.rectangle(0, 0, cam.width, cam.height, 0x1c1a2e, 0.26).setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH.SLEEP).setVisible(false);
    const objects = [dim];
    let rain = null;
    if (scene.textures.exists("ui_rain")) {
        rain = scene.add.tileSprite(0, 0, cam.width, cam.height, "ui_rain").setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH.SLEEP + 1).setAlpha(0.2).setVisible(false);
        objects.push(rain);
    }
    scene.minimapCamera.ignore(objects);
    scene.sleepOverlay = { dim, rain };
}

export function resizeSleepOverlay(scene, width, height) {
    if (!scene.sleepOverlay) return;
    const { dim, rain } = scene.sleepOverlay;
    dim.setSize(width, height);
    if (rain) rain.setSize(width, height);
}

export function showSleepOverlay(scene, on) {
    if (!scene.sleepOverlay) return;
    const { dim, rain } = scene.sleepOverlay;
    dim.setVisible(on);
    if (rain) rain.setVisible(on);
}

export function updateSleepOverlay(scene, delta) {
    const rain = scene.sleepOverlay && scene.sleepOverlay.rain;
    if (!rain || !rain.visible) return;
    rain.tilePositionY -= delta * 0.32;
    rain.tilePositionX += delta * 0.1;
}

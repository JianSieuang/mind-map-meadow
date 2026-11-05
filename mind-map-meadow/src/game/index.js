import Phaser from "phaser";
import { MeadowScene } from "./scene";

// onPlacementEnd({ ok }) fires once when a scene.beginPlacement() session ends: ok is true when the
// place/purchase event was sent, false when it was cancelled.
export const initPhaser = (parentEl, socket, onBuildingInspect, onMapClick, onPlacementEnd) => {
    const gameScene = new MeadowScene(socket, onBuildingInspect, onMapClick, onPlacementEnd);
    const config = {
        type: Phaser.AUTO,
        parent: parentEl,
        // The canvas follows its parent through window resizes and phone rotation.
        scale: {
            mode: Phaser.Scale.RESIZE,
            width: parentEl.clientWidth || 1200,
            height: parentEl.clientHeight || 800,
        },
        backgroundColor: "#5a9a4a",
        pixelArt: true,
        physics: {
            default: "arcade",
            arcade: { debug: false },
        },
        scene: gameScene,
    };
    const game = new Phaser.Game(config);

    // Scale.RESIZE alone can miss a change: on rotation Phaser refreshes with the old parent size and
    // only then records the new one, so its next size check sees nothing to do and the canvas stays
    // stale. Watching the parent directly covers rotation, window resizes and layout changes.
    game.events.once(Phaser.Core.Events.READY, () => {
        // Finger drags pan the map; the browser must not take them for page scrolling or pull-to-refresh.
        game.canvas.style.touchAction = "none";
        const observer = new ResizeObserver(() => {
            const { scale } = game;
            scale.getParentBounds();
            if (scale.parentSize.width === scale.gameSize.width && scale.parentSize.height === scale.gameSize.height) return;
            scale.refresh();
        });
        observer.observe(parentEl);
        game.events.once(Phaser.Core.Events.DESTROY, () => observer.disconnect());
    });

    return game;
};

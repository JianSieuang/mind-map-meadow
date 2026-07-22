import Phaser from "phaser";
import { MeadowScene } from "./scene";

export const initPhaser = (parentEl, socket, onBuildingInspect, onMapClick) => {
    const gameScene = new MeadowScene(socket, onBuildingInspect, onMapClick);
    const config = {
        type: Phaser.AUTO,
        width: parentEl.clientWidth || 1200,
        height: parentEl.clientHeight || 800,
        parent: parentEl,
        backgroundColor: "#348a58",
        physics: {
            default: "arcade",
            arcade: { debug: false },
        },
        scene: gameScene,
    };
    return new Phaser.Game(config);
};

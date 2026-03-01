import Phaser from "phaser"
import { GameScene } from "../scenes/GameScene"

export const GameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 640,
  height: 570,
  backgroundColor: "#1e1e1e",
  parent: "app",
  scene: [GameScene]
}
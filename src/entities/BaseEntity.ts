// entities/BaseEntity.ts
import Phaser from "phaser"

export abstract class BaseEntity extends Phaser.GameObjects.Sprite {
  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    texture: string
  ) {
    super(scene, x, y, texture)
    scene.add.existing(this)
  }

  abstract update(delta: number): void
}
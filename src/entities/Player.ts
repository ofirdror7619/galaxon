// entities/Player.ts
import { BaseEntity } from "./BaseEntity"

export class Player extends BaseEntity {
  private readonly baseSpeed = 300
  speed = this.baseSpeed
  cursors: Phaser.Types.Input.Keyboard.CursorKeys

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, "player")
    this.setScale(0.5)
    this.cursors = scene.input.keyboard!.createCursorKeys()
  }

  update(delta: number) {
    const dt = delta / 1000

    if (this.cursors.left?.isDown) {
      this.x -= this.speed * dt
    } else if (this.cursors.right?.isDown) {
      this.x += this.speed * dt
    }

    const halfWidth = this.displayWidth / 2
    this.x = Phaser.Math.Clamp(this.x, halfWidth, this.scene.scale.width - halfWidth)
  }

  setSpeedMultiplier(multiplier: number) {
    this.speed = this.baseSpeed * multiplier
  }
}
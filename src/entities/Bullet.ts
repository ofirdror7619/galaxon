import { BaseEntity } from "./BaseEntity"

export class Bullet extends BaseEntity {
  speed = 500

  constructor(scene: Phaser.Scene, x: number, y: number, speedMultiplier = 1) {
    super(scene, x, y, "bullet")
    this.speed *= speedMultiplier
    this.setScale(0.35)
  }

  update(delta: number) {
    const dt = delta / 1000
    this.y -= this.speed * dt

    if (this.y < -this.height) {
      this.destroy()
    }
  }
}

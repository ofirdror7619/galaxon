// entities/Enemy.ts
import { BaseEntity } from "./BaseEntity"

export class Enemy extends BaseEntity {
  speed = 100

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, "enemy")
    this.setScale(0.5)
  }

  update(delta: number) {
    const dt = delta / 1000
    this.y += this.speed * dt
  }
}
import { BaseEntity } from "./BaseEntity"

export type PowerUpType = "L" | "S" | "W"

export class PowerUp extends BaseEntity {
  readonly powerUpType: PowerUpType
  speed = 120

  constructor(scene: Phaser.Scene, x: number, y: number, powerUpType: PowerUpType) {
    const texture = powerUpType === "L"
      ? "powerup-life"
      : powerUpType === "S"
        ? "powerup-speed"
        : "powerup-weapon"
    super(scene, x, y, texture)
    this.powerUpType = powerUpType
    this.setScale(0.35)
  }

  update(delta: number) {
    const dt = delta / 1000
    this.y += this.speed * dt

    if (this.y - this.displayHeight / 2 > this.scene.scale.height) {
      this.destroy()
    }
  }
}

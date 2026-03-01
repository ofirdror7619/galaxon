// systems/SpawnSystem.ts
import Phaser from "phaser"
import { Enemy } from "../entities/Enemy.ts"

export class SpawnSystem {
    private scene: Phaser.Scene
    private timer = 0
    private spawnInterval = 2000
    private enemySpeed = 100

    constructor(scene: Phaser.Scene) {
        this.scene = scene
    }

    update(delta: number) {
        this.timer += delta

        if (this.timer > this.spawnInterval) {
            this.spawnEnemy()
            this.timer = 0
        }
    }

    setScore(score: number) {
        const level = Math.floor(score / 100)
        this.spawnInterval = Math.max(600, 2000 - level * 200)
        this.enemySpeed = 100 + level * 20
    }

    private spawnEnemy() {
        const x = Phaser.Math.Between(20, this.scene.scale.width - 20)
        const enemy = new Enemy(this.scene, x, 0)
        enemy.speed = this.enemySpeed

        const gameScene = this.scene as any
        gameScene.addEntity(enemy)
    }

}
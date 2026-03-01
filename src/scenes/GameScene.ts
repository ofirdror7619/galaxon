// scenes/GameScene.ts
import Phaser from "phaser"
import { Player } from "../entities/Player.ts"
import { Enemy } from "../entities/Enemy.ts"
import { Bullet } from "../entities/Bullet.ts"
import { PowerUp } from "../entities/PowerUp.ts"
import type { PowerUpType } from "../entities/PowerUp.ts"
import { GameState } from "../core/GameState.ts"
import { SpawnSystem } from "../systems/SpawnSystem.ts"
import type { IGameSystem } from "../systems/IGameSystem.ts"
import type { BaseEntity } from "../entities/BaseEntity.ts"

export class GameScene extends Phaser.Scene {
    private systemsList: IGameSystem[] = []
    private spawnSystem!: SpawnSystem
    private gameState = new GameState()
    private player!: Player
    private entities: BaseEntity[] = []
    private readonly panelHeight = 90
    private playAreaHeight = 0
    private livesText!: Phaser.GameObjects.Text
    private scoreText!: Phaser.GameObjects.Text
    private levelText!: Phaser.GameObjects.Text
    private speedBoostText!: Phaser.GameObjects.Text
    private countdownText?: Phaser.GameObjects.Text
    private spaceKey!: Phaser.Input.Keyboard.Key
    private speedBoostResetEvent?: Phaser.Time.TimerEvent
    private weaponBoostResetEvent?: Phaser.Time.TimerEvent
    private speedBoostMultiplier = 1
    private weaponBoostMultiplier = 1
    private readonly baseFireCooldownMs = 220
    private lastShotAt = 0
    private isGameStarted = false
    private readonly dropChance = 0.15
    private readonly lifeDropWeight = 0.2
    private readonly speedDropWeight = 0.55
    private readonly maxActivePowerUps = 3

    constructor() {
        super("game")
    }

    preload() {
        this.load.svg("player", "/player-fighter.svg")
        this.load.svg("enemy", "/enemy-bomb.svg")
        this.load.svg("bullet", "/player-bullet.svg")
        this.load.svg("explosion", "/enemy-explosion.svg")
        this.load.svg("impactExplosion", "/enemy-impact-explosion.svg")
        this.load.svg("powerup-life", "/powerup-life.svg")
        this.load.svg("powerup-speed", "/powerup-speed.svg")
        this.load.svg("powerup-weapon", "/powerup-weapon.svg")
    }

    create() {
        this.gameState = new GameState()
        this.entities = []
        this.systemsList = []
        this.speedBoostResetEvent?.remove(false)
        this.weaponBoostResetEvent?.remove(false)
        this.speedBoostResetEvent = undefined
        this.weaponBoostResetEvent = undefined
        this.speedBoostMultiplier = 1
        this.weaponBoostMultiplier = 1
        this.lastShotAt = -Infinity
        this.isGameStarted = false

        this.playAreaHeight = this.scale.height - this.panelHeight
        this.createControlPanel()

        this.player = new Player(this, 320, 0)
        this.player.y = this.playAreaHeight - this.player.displayHeight / 2 + 1
        this.addEntity(this.player)
        this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)

        this.livesText = this.add.text(24, this.playAreaHeight + 18, "", {
            fontFamily: "Orbitron, monospace",
            fontSize: "22px",
            color: "#e2e8f0"
        })
        this.scoreText = this.add.text(this.scale.width / 2, this.playAreaHeight + 18, "", {
            fontFamily: "Orbitron, monospace",
            fontSize: "22px",
            color: "#e2e8f0"
        }).setOrigin(0.5, 0)
        this.createNewGameButton()
        this.levelText = this.add.text(this.scale.width - 24, this.playAreaHeight + 18, "", {
            fontFamily: "Orbitron, monospace",
            fontSize: "22px",
            color: "#e2e8f0"
        }).setOrigin(1, 0)
        this.speedBoostText = this.add.text(this.scale.width / 2, this.playAreaHeight - 26, "SPEED x2", {
            fontFamily: "Orbitron, monospace",
            fontSize: "28px",
            fontStyle: "bold",
            color: "#22d3ee",
            stroke: "#082f49",
            strokeThickness: 6,
            shadow: {
                color: "#67e8f9",
                offsetX: 0,
                offsetY: 0,
                blur: 12,
                fill: true
            }
        }).setOrigin(0.5, 1)
        this.speedBoostText.setVisible(false)
        this.updateHud()

        this.spawnSystem = new SpawnSystem(this)
        this.systemsList.push(this.spawnSystem)
        this.startGameCountdown()
    }

    update(_time: number, delta: number) {
        if (!this.isGameStarted || this.gameState.isGameOver) {
            return
        }

        this.handleShooting()

        for (const entity of this.entities) {
            if (!entity.active) {
                continue
            }
            entity.update(delta)
        }

        this.spawnSystem.setScore(this.gameState.score)

        for (const system of this.systemsList) {
            system.update(delta)
        }

        this.handleCollisions()
        this.handleGroundHits()
        this.handlePowerUpBounds()
        this.cleanupEntities()
    }

    addEntity(entity: BaseEntity) {
        this.entities.push(entity)
    }

    private handleShooting() {
        if (!this.spaceKey.isDown) {
            return
        }

        const fireCooldown = this.baseFireCooldownMs / this.speedBoostMultiplier

        if (this.time.now - this.lastShotAt < fireCooldown) {
            return
        }

        this.lastShotAt = this.time.now
        const bulletY = this.player.y - this.player.displayHeight / 2
        const bulletSpeedMultiplier = this.speedBoostMultiplier
        const bulletCount = this.weaponBoostMultiplier
        const totalSpread = 24 + Math.max(0, bulletCount - 2) * 8

        if (bulletCount <= 1) {
            this.addEntity(new Bullet(this, this.player.x, bulletY, bulletSpeedMultiplier))
            return
        }

        for (let index = 0; index < bulletCount; index += 1) {
            const ratio = bulletCount === 1 ? 0 : index / (bulletCount - 1)
            const bulletX = this.player.x - totalSpread / 2 + totalSpread * ratio
            this.addEntity(new Bullet(this, bulletX, bulletY, bulletSpeedMultiplier))
        }
    }

    private handleCollisions() {
        const playerBounds = this.getTightBounds(this.player, 0.55)
        const bullets = this.entities.filter((entity): entity is Bullet => entity instanceof Bullet && entity.active)
        const enemies = this.entities.filter((entity): entity is Enemy => entity instanceof Enemy && entity.active)
        const powerUps = this.entities.filter((entity): entity is PowerUp => entity instanceof PowerUp && entity.active)

        for (const bullet of bullets) {
            const bulletBounds = this.getTightBounds(bullet, 0.8)

            for (const enemy of enemies) {
                if (!enemy.active) {
                    continue
                }

                const enemyBounds = this.getTightBounds(enemy, 0.6)
                if (!Phaser.Geom.Intersects.RectangleToRectangle(bulletBounds, enemyBounds)) {
                    continue
                }

                const explosionX = enemy.x
                const explosionY = enemy.y
                bullet.destroy()
                enemy.destroy()
                this.createExplosion(explosionX, explosionY)
                this.trySpawnPowerUp(explosionX, explosionY)
                this.gameState.score += 10
                this.updateHud()
                break
            }
        }

        for (const powerUp of powerUps) {
            const powerUpBounds = this.getTightBounds(powerUp, 0.75)
            if (!Phaser.Geom.Intersects.RectangleToRectangle(playerBounds, powerUpBounds)) {
                continue
            }

            this.applyPowerUp(powerUp.powerUpType)
            powerUp.destroy()
        }

        for (const entity of this.entities) {
            if (!(entity instanceof Enemy) || !entity.active) {
                continue
            }

            const enemyBounds = this.getTightBounds(entity, 0.6)
            if (Phaser.Geom.Intersects.RectangleToRectangle(playerBounds, enemyBounds)) {
                this.createImpactExplosion(entity.x, entity.y)
                entity.destroy()
                this.loseLife()
                if (this.gameState.isGameOver) {
                    break
                }
            }
        }
    }

    private handleGroundHits() {
        for (const entity of this.entities) {
            if (!(entity instanceof Enemy) || !entity.active) {
                continue
            }

            const enemyBottom = entity.y + entity.displayHeight / 2
            if (enemyBottom >= this.playAreaHeight) {
                this.createImpactExplosion(entity.x, this.playAreaHeight - 8)
                entity.destroy()
                this.loseLife()
                if (this.gameState.isGameOver) {
                    break
                }
            }
        }
    }

    private handlePowerUpBounds() {
        for (const entity of this.entities) {
            if (!(entity instanceof PowerUp) || !entity.active) {
                continue
            }

            const powerUpBottom = entity.y + entity.displayHeight / 2
            if (powerUpBottom >= this.playAreaHeight) {
                entity.destroy()
            }
        }
    }

    private loseLife() {
        this.gameState.lives -= 1
        this.updateHud()

        if (this.gameState.lives <= 0) {
            this.gameState.isGameOver = true
            const gameOverText = this.add.text(this.scale.width / 2, this.playAreaHeight / 2, "GAME OVER", {
                fontFamily: "Orbitron, monospace",
                fontSize: "56px",
                fontStyle: "bold",
                color: "#ef4444",
                stroke: "#7f1d1d",
                strokeThickness: 8,
                shadow: {
                    color: "#fca5a5",
                    offsetX: 0,
                    offsetY: 0,
                    blur: 14,
                    fill: true
                }
            }).setOrigin(0.5)

            this.tweens.add({
                targets: gameOverText,
                alpha: 0.35,
                duration: 280,
                yoyo: true,
                repeat: -1
            })
        }
    }

    private createControlPanel() {
        const panelY = this.playAreaHeight
        this.add.rectangle(
            this.scale.width / 2,
            panelY + this.panelHeight / 2,
            this.scale.width,
            this.panelHeight,
            0x0b1220
        )
        this.add.line(0, panelY, 0, 0, this.scale.width, 0, 0x38bdf8).setOrigin(0, 0)
    }

    private createNewGameButton() {
        const button = this.add.text(this.scale.width / 2, this.playAreaHeight + 52, "New Game", {
            fontFamily: "Orbitron, monospace",
            fontSize: "18px",
            color: "#e2e8f0",
            backgroundColor: "#1e293b",
            padding: {
                left: 10,
                right: 10,
                top: 4,
                bottom: 4
            }
        }).setOrigin(0.5, 0)

        button.setInteractive({ useHandCursor: true })
        button.on("pointerover", () => button.setStyle({ backgroundColor: "#334155" }))
        button.on("pointerout", () => button.setStyle({ backgroundColor: "#1e293b" }))
        button.on("pointerdown", () => this.scene.restart())
    }

    private startGameCountdown() {
        let remaining = 3
        this.countdownText = this.add.text(this.scale.width / 2, this.playAreaHeight / 2, "", {
            fontFamily: "Orbitron, monospace",
            fontSize: "46px",
            fontStyle: "bold",
            color: "#22d3ee",
            stroke: "#082f49",
            strokeThickness: 8,
            shadow: {
                color: "#67e8f9",
                offsetX: 0,
                offsetY: 0,
                blur: 14,
                fill: true
            },
            align: "center"
        }).setOrigin(0.5).setDepth(100)

        const updateCountdownText = () => {
            this.countdownText?.setText(`GAME STARTS IN\n${remaining}`)
        }

        updateCountdownText()
        this.tweens.add({
            targets: this.countdownText,
            alpha: 0.35,
            duration: 260,
            yoyo: true,
            repeat: -1
        })

        this.time.addEvent({
            delay: 1000,
            repeat: 2,
            callback: () => {
                remaining -= 1

                if (remaining > 0) {
                    updateCountdownText()
                    return
                }

                if (this.countdownText) {
                    this.tweens.killTweensOf(this.countdownText)
                    this.countdownText.destroy()
                }
                this.countdownText = undefined
                this.isGameStarted = true
            }
        })
    }

    private updateHud() {
        const level = Math.floor(this.gameState.score / 100) + 1
        this.livesText.setText(`LIVES: ${this.gameState.lives}`)
        this.scoreText.setText(`SCORE: ${this.gameState.score}`)
        this.levelText.setText(`LEVEL: ${level}`)
    }

    private createExplosion(x: number, y: number) {
        const explosion = this.add.image(x, y, "explosion")
        explosion.setScale(0.25)
        this.tweens.add({
            targets: explosion,
            scale: 0.55,
            alpha: 0,
            duration: 200,
            onComplete: () => explosion.destroy()
        })
    }

    private createImpactExplosion(x: number, y: number) {
        const explosion = this.add.image(x, y, "impactExplosion")
        explosion.setScale(0.22)
        this.tweens.add({
            targets: explosion,
            scale: 0.5,
            alpha: 0,
            duration: 170,
            onComplete: () => explosion.destroy()
        })
    }

    private trySpawnPowerUp(x: number, y: number) {
        const activePowerUps = this.entities.filter((entity) => entity instanceof PowerUp && entity.active).length
        if (activePowerUps >= this.maxActivePowerUps) {
            return
        }

        if (Math.random() >= this.dropChance) {
            return
        }

        const roll = Math.random()
        const powerUpType: PowerUpType = roll < this.lifeDropWeight
            ? "L"
            : roll < this.lifeDropWeight + this.speedDropWeight
                ? "S"
                : "W"
        this.addEntity(new PowerUp(this, x, y, powerUpType))
    }

    private applyPowerUp(powerUpType: PowerUpType) {
        if (powerUpType === "L") {
            this.gameState.lives += 1
            this.updateHud()
            return
        }

        if (powerUpType === "S") {
            this.speedBoostMultiplier *= 2
            this.player.setSpeedMultiplier(this.speedBoostMultiplier)
            this.showSpeedBoostText()
            this.speedBoostResetEvent?.remove(false)
            this.speedBoostResetEvent = this.time.delayedCall(5000, () => {
                this.speedBoostMultiplier = 1
                this.player.setSpeedMultiplier(1)
                this.hideSpeedBoostText()
                this.speedBoostResetEvent = undefined
            })
            return
        }

        this.weaponBoostMultiplier *= 2
        this.weaponBoostResetEvent?.remove(false)
        this.weaponBoostResetEvent = this.time.delayedCall(8000, () => {
            this.weaponBoostMultiplier = 1
            this.weaponBoostResetEvent = undefined
        })
    }

    private showSpeedBoostText() {
        this.tweens.killTweensOf(this.speedBoostText)
        this.speedBoostText.setText(`SPEED x${this.speedBoostMultiplier}`)
        this.speedBoostText.setAlpha(1)
        this.speedBoostText.setVisible(true)
        this.tweens.add({
            targets: this.speedBoostText,
            alpha: 0.35,
            duration: 220,
            yoyo: true,
            repeat: -1
        })
    }

    private hideSpeedBoostText() {
        this.tweens.killTweensOf(this.speedBoostText)
        this.speedBoostText.setVisible(false)
    }

    private getTightBounds(entity: BaseEntity, scale: number) {
        const bounds = entity.getBounds()
        const width = bounds.width * scale
        const height = bounds.height * scale

        return new Phaser.Geom.Rectangle(
            bounds.centerX - width / 2,
            bounds.centerY - height / 2,
            width,
            height
        )
    }

    private cleanupEntities() {
        this.entities = this.entities.filter((entity) => entity.active)
    }
}
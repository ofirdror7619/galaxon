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
    private readonly panelHeight = 130
    private playAreaHeight = 0
    private livesText!: Phaser.GameObjects.Text
    private scoreText!: Phaser.GameObjects.Text
    private levelText!: Phaser.GameObjects.Text
    private powerUpTimersText!: Phaser.GameObjects.Text
    private speedBoostText!: Phaser.GameObjects.Text
    private pauseButtonText!: Phaser.GameObjects.Text
    private soundButtonText!: Phaser.GameObjects.Text
    private countdownText?: Phaser.GameObjects.Text
    private pauseText?: Phaser.GameObjects.Text
    private starFieldGraphics!: Phaser.GameObjects.Graphics
    private starField: Array<{
        x: number
        y: number
        radius: number
        alpha: number
        speed: number
    }> = []
    private spaceKey!: Phaser.Input.Keyboard.Key
    private speedBoostResetEvent?: Phaser.Time.TimerEvent
    private weaponBoostResetEvent?: Phaser.Time.TimerEvent
    private speedBoostMultiplier = 1
    private weaponBoostMultiplier = 1
    private readonly baseFireCooldownMs = 220
    private lastShotAt = 0
    private isGameStarted = false
    private isPaused = false
    private isSoundOn = true
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
        this.isPaused = false
        this.isSoundOn = true
        this.sound.mute = false
        this.pauseText?.destroy()
        this.pauseText = undefined

        this.playAreaHeight = this.scale.height - this.panelHeight
        this.createSpaceBackdrop()
        this.createGameWindowBorder()
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
        this.createPauseButton()
        this.createSoundButton()
        this.createNewGameButton()
        this.levelText = this.add.text(this.scale.width - 24, this.playAreaHeight + 18, "", {
            fontFamily: "Orbitron, monospace",
            fontSize: "22px",
            color: "#e2e8f0"
        }).setOrigin(1, 0)
        this.powerUpTimersText = this.add.text(this.scale.width / 2, this.playAreaHeight + 88, "", {
            fontFamily: "Orbitron, monospace",
            fontSize: "15px",
            color: "#67e8f9"
        }).setOrigin(0.5, 0)
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
        this.updatePowerUpHud()

        this.spawnSystem = new SpawnSystem(this)
        this.systemsList.push(this.spawnSystem)
        this.startGameCountdown()
    }

    update(_time: number, delta: number) {
        this.updatePowerUpHud()

        if (!this.isGameStarted || this.gameState.isGameOver || this.isPaused) {
            return
        }

        this.updateStarField(delta)

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
        this.playFireSound()
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
                this.playEnemyExplosionSound()
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
        this.playLifeLostExplosionSound()
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

    private createSpaceBackdrop() {
        this.add.rectangle(
            this.scale.width / 2,
            this.playAreaHeight / 2,
            this.scale.width,
            this.playAreaHeight,
            0x020617
        ).setDepth(-100)

        this.starFieldGraphics = this.add.graphics().setDepth(-90)
        this.starField = []

        for (let index = 0; index < 90; index += 1) {
            this.starField.push({
                x: Phaser.Math.Between(8, this.scale.width - 8),
                y: Phaser.Math.Between(0, this.playAreaHeight),
                radius: Phaser.Math.FloatBetween(0.8, 2.1),
                alpha: Phaser.Math.FloatBetween(0.12, 0.28),
                speed: Phaser.Math.FloatBetween(28, 92)
            })
        }

        this.drawStarField()
    }

    private updateStarField(delta: number) {
        const dt = delta / 1000

        for (const star of this.starField) {
            star.y += star.speed * dt

            if (star.y > this.playAreaHeight + 3) {
                star.y = -3
                star.x = Phaser.Math.Between(8, this.scale.width - 8)
            }
        }

        this.drawStarField()
    }

    private drawStarField() {
        this.starFieldGraphics.clear()

        for (const star of this.starField) {
            this.starFieldGraphics.fillStyle(0xe2e8f0, star.alpha)
            this.starFieldGraphics.fillCircle(star.x, star.y, star.radius)
        }
    }

    private createGameWindowBorder() {
        this.add.rectangle(
            this.scale.width / 2,
            this.playAreaHeight / 2,
            this.scale.width - 2,
            this.playAreaHeight - 2
        )
            .setStrokeStyle(3, 0x334155, 0.95)
            .setDepth(40)

        this.add.rectangle(
            this.scale.width / 2,
            this.playAreaHeight / 2,
            this.scale.width - 8,
            this.playAreaHeight - 8
        )
            .setStrokeStyle(1, 0x67e8f9, 0.35)
            .setDepth(40)
    }

    private createNewGameButton() {
        const button = this.add.text(this.scale.width / 2, this.playAreaHeight + 48, "New Game", {
            fontFamily: "Orbitron, monospace",
            fontSize: "18px",
            color: "#e2e8f0",
            align: "center",
            backgroundColor: "#1e293b",
            padding: {
                left: 10,
                right: 10,
                top: 4,
                bottom: 4
            }
        }).setFixedSize(170, 32).setOrigin(0.5, 0)

        button.setInteractive({ useHandCursor: true })
        button.on("pointerover", () => button.setStyle({ backgroundColor: "#334155" }))
        button.on("pointerout", () => button.setStyle({ backgroundColor: "#1e293b" }))
        button.on("pointerdown", () => this.scene.restart())
    }

    private createPauseButton() {
        this.pauseButtonText = this.add.text(this.scale.width / 2 - 165, this.playAreaHeight + 48, "Pause Game", {
            fontFamily: "Orbitron, monospace",
            fontSize: "18px",
            color: "#e2e8f0",
            align: "center",
            backgroundColor: "#1e293b",
            padding: {
                left: 10,
                right: 10,
                top: 4,
                bottom: 4
            }
        }).setFixedSize(170, 32).setOrigin(0.5, 0)

        this.pauseButtonText.setInteractive({ useHandCursor: true })
        this.pauseButtonText.on("pointerover", () => this.pauseButtonText.setStyle({ backgroundColor: "#334155" }))
        this.pauseButtonText.on("pointerout", () => this.pauseButtonText.setStyle({ backgroundColor: "#1e293b" }))
        this.pauseButtonText.on("pointerdown", () => this.togglePause())
    }

    private createSoundButton() {
        this.soundButtonText = this.add.text(this.scale.width / 2 + 165, this.playAreaHeight + 48, "Sound: On", {
            fontFamily: "Orbitron, monospace",
            fontSize: "18px",
            color: "#e2e8f0",
            align: "center",
            backgroundColor: "#1e293b",
            padding: {
                left: 10,
                right: 10,
                top: 4,
                bottom: 4
            }
        }).setFixedSize(170, 32).setOrigin(0.5, 0)

        this.soundButtonText.setInteractive({ useHandCursor: true })
        this.soundButtonText.on("pointerover", () => this.soundButtonText.setStyle({ backgroundColor: "#334155" }))
        this.soundButtonText.on("pointerout", () => this.soundButtonText.setStyle({ backgroundColor: "#1e293b" }))
        this.soundButtonText.on("pointerdown", () => {
            this.isSoundOn = !this.isSoundOn
            this.sound.mute = !this.isSoundOn
            this.soundButtonText.setText(this.isSoundOn ? "Sound: On" : "Sound: Off")
        })
    }

    private togglePause() {
        if (!this.isGameStarted || this.gameState.isGameOver) {
            return
        }

        this.isPaused = !this.isPaused
        this.pauseButtonText.setText(this.isPaused ? "Resume Game" : "Pause Game")

        if (this.isPaused) {
            this.showPauseOverlay()
            return
        }

        this.hidePauseOverlay()
    }

    private showPauseOverlay() {
        if (!this.pauseText) {
            this.pauseText = this.add.text(this.scale.width / 2, this.playAreaHeight / 2, "PAUSE", {
                fontFamily: "Orbitron, monospace",
                fontSize: "56px",
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
                }
            }).setOrigin(0.5).setDepth(100)
        }

        this.pauseText.setVisible(true)
        this.tweens.killTweensOf(this.pauseText)
        this.tweens.add({
            targets: this.pauseText,
            alpha: 0.35,
            duration: 260,
            yoyo: true,
            repeat: -1
        })
    }

    private hidePauseOverlay() {
        if (!this.pauseText) {
            return
        }

        this.tweens.killTweensOf(this.pauseText)
        this.pauseText.setVisible(false)
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
            this.playCountdownBeep(remaining)
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
                this.playGameStartSound()
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

    private updatePowerUpHud() {
        if (!this.powerUpTimersText) {
            return
        }

        this.powerUpTimersText.setY(this.playAreaHeight + 88)

        const activePowerUps: string[] = []

        if (this.speedBoostResetEvent) {
            activePowerUps.push(`S x${this.speedBoostMultiplier} ${this.formatRemainingSeconds(this.speedBoostResetEvent)}`)
        }

        if (this.weaponBoostResetEvent) {
            activePowerUps.push(`W x${this.weaponBoostMultiplier} ${this.formatRemainingSeconds(this.weaponBoostResetEvent)}`)
        }

        this.powerUpTimersText.setText(activePowerUps.length > 0 ? `POWERUPS: ${activePowerUps.join("  |  ")}` : "POWERUPS: -")
    }

    private formatRemainingSeconds(event: Phaser.Time.TimerEvent) {
        const seconds = Math.max(0, Math.ceil(event.getRemaining() / 1000))
        return `${seconds}s`
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
        explosion.setScale(0.3)
        this.tweens.add({
            targets: explosion,
            scale: 0.9,
            alpha: 0,
            duration: 240,
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
            this.playPowerUpSound("L")
            this.gameState.lives += 1
            this.updateHud()
            return
        }

        if (powerUpType === "S") {
            this.playPowerUpSound("S")
            this.speedBoostMultiplier *= 2
            this.player.setSpeedMultiplier(this.speedBoostMultiplier)
            this.showSpeedBoostText()
            this.speedBoostResetEvent?.remove(false)
            this.speedBoostResetEvent = this.time.delayedCall(6000, () => {
                this.speedBoostMultiplier = 1
                this.player.setSpeedMultiplier(1)
                this.hideSpeedBoostText()
                this.speedBoostResetEvent = undefined
                this.updatePowerUpHud()
            })
            this.updatePowerUpHud()
            return
        }

        this.playPowerUpSound("W")
        this.weaponBoostMultiplier *= 2
        this.weaponBoostResetEvent?.remove(false)
        this.weaponBoostResetEvent = this.time.delayedCall(9000, () => {
            this.weaponBoostMultiplier = 1
            this.weaponBoostResetEvent = undefined
            this.updatePowerUpHud()
        })
        this.updatePowerUpHud()
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

    private playFireSound() {
        this.playTone("triangle", 920, 0.02, {
            endFrequency: 540,
            endGain: 0.0001,
            duration: 0.06
        })
        this.playNoiseBurst({
            duration: 0.045,
            startGain: 0.016,
            endGain: 0.0001,
            filterType: "bandpass",
            startFrequency: 1800,
            endFrequency: 950
        })
    }

    private playEnemyExplosionSound() {
        this.playTone("sawtooth", 180, 0.03, {
            endFrequency: 90,
            endGain: 0.0001,
            duration: 0.23
        })
        this.playNoiseBurst({
            duration: 0.22,
            startGain: 0.04,
            endGain: 0.0001,
            filterType: "lowpass",
            startFrequency: 900,
            endFrequency: 260
        })
        this.playTone("triangle", 320, 0.018, {
            endFrequency: 120,
            endGain: 0.0001,
            duration: 0.2
        })
    }

    private playLifeLostExplosionSound() {
        this.playTone("sawtooth", 130, 0.055, {
            endFrequency: 45,
            endGain: 0.0001,
            duration: 0.42
        })
        this.playNoiseBurst({
            duration: 0.35,
            startGain: 0.06,
            endGain: 0.0001,
            filterType: "lowpass",
            startFrequency: 650,
            endFrequency: 140
        })
        this.playTone("triangle", 220, 0.03, {
            endFrequency: 80,
            endGain: 0.0001,
            duration: 0.34
        })
    }

    private playPowerUpSound(powerUpType: PowerUpType) {
        if (powerUpType === "L") {
            this.playTone("sine", 520, 0.03, {
                endFrequency: 860,
                endGain: 0.0001,
                duration: 0.18
            })
            this.playTone("sine", 760, 0.018, {
                endFrequency: 1040,
                endGain: 0.0001,
                duration: 0.16
            })
            return
        }

        if (powerUpType === "S") {
            this.playTone("triangle", 680, 0.026, {
                endFrequency: 1140,
                endGain: 0.0001,
                duration: 0.2
            })
            this.playTone("sine", 900, 0.016, {
                endFrequency: 1360,
                endGain: 0.0001,
                duration: 0.16
            })
            return
        }

        this.playTone("square", 430, 0.035, {
            endFrequency: 930,
            endGain: 0.0001,
            duration: 0.2
        })
        this.playTone("triangle", 540, 0.018, {
            endFrequency: 980,
            endGain: 0.0001,
            duration: 0.16
        })
    }

    private playCountdownBeep(remaining: number) {
        if (remaining <= 0) {
            return
        }

        this.playTone("triangle", 760, 0.022, {
            endFrequency: 720,
            endGain: 0.0001,
            duration: 0.12
        })
    }

    private playGameStartSound() {
        this.playTone("triangle", 2080, 0.022, {
            endFrequency: 1960,
            endGain: 0.0001,
            duration: 0.12
        })
    }

    private playNoiseBurst(options: {
        duration: number
        startGain: number
        endGain: number
        filterType: BiquadFilterType
        startFrequency: number
        endFrequency: number
    }) {
        if (!this.isSoundOn) {
            return
        }

        const context = (this.sound as unknown as { context?: AudioContext }).context
        if (!context) {
            return
        }

        if (context.state === "suspended") {
            void context.resume()
        }

        const sampleRate = context.sampleRate
        const length = Math.max(1, Math.floor(sampleRate * options.duration))
        const buffer = context.createBuffer(1, length, sampleRate)
        const data = buffer.getChannelData(0)

        for (let index = 0; index < length; index += 1) {
            data[index] = Math.random() * 2 - 1
        }

        const source = context.createBufferSource()
        const gain = context.createGain()
        const filter = context.createBiquadFilter()
        filter.type = options.filterType

        const now = context.currentTime
        source.buffer = buffer
        filter.frequency.setValueAtTime(Math.max(20, options.startFrequency), now)
        filter.frequency.exponentialRampToValueAtTime(
            Math.max(20, options.endFrequency),
            now + options.duration
        )

        gain.gain.setValueAtTime(Math.max(0.0001, options.startGain), now)
        gain.gain.exponentialRampToValueAtTime(
            Math.max(0.0001, options.endGain),
            now + options.duration
        )

        source.connect(filter)
        filter.connect(gain)
        gain.connect(context.destination)
        source.start(now)
        source.stop(now + options.duration)
    }

    private playTone(
        type: OscillatorType,
        startFrequency: number,
        startGain: number,
        options: {
            endFrequency: number
            endGain: number
            duration: number
        }
    ) {
        if (!this.isSoundOn) {
            return
        }

        const context = (this.sound as unknown as { context?: AudioContext }).context
        if (!context) {
            return
        }

        if (context.state === "suspended") {
            void context.resume()
        }

        const now = context.currentTime
        const oscillator = context.createOscillator()
        const gain = context.createGain()

        oscillator.type = type
        oscillator.frequency.setValueAtTime(startFrequency, now)
        oscillator.frequency.exponentialRampToValueAtTime(
            Math.max(20, options.endFrequency),
            now + options.duration
        )

        gain.gain.setValueAtTime(Math.max(0.0001, startGain), now)
        gain.gain.exponentialRampToValueAtTime(
            Math.max(0.0001, options.endGain),
            now + options.duration
        )

        oscillator.connect(gain)
        gain.connect(context.destination)
        oscillator.start(now)
        oscillator.stop(now + options.duration)
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
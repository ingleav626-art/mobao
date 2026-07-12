/**
 * @file bridge/settlement-particles
 * @module bridge/settlement-particles
 * @description 结算庆祝粒子效果模块。从 settlement.ts 提取的独立粒子生成逻辑，
 *              包含金币爆发、星星爆发、上升粒子、闪烁粒子等庆祝特效。
 *              所有粒子参数与原实现一致，确保视觉效果不变。
 *
 * @exports playSettlementFinalEffect - 播放结算最终庆祝特效（粒子爆炸+彩带）
 */
import type { WarehouseSceneThis } from "../../../types/warehouse-scene-this"

const CELEBRATION_COLORS = [0xffd700, 0xffec8b, 0xffc125, 0xffdf00, 0xffb90f, 0xfce6a0, 0xffe135]

function getStarColors(isLegendaryHeavy: boolean): number[] {
  return isLegendaryHeavy
    ? [0xffd700, 0xffd700, 0xffd700, 0xffec8b, 0xffec8b, 0xffc125, 0xffdf00]
    : [0xffd700, 0xffec8b, 0xffc125, 0xffdf00, 0xffb90f, 0xfce6a0, 0xffe135, 0xff6b6b, 0x69b4ff, 0x90ee90]
}

function spawnBurstCoinParticles(
  scene: WarehouseSceneThis,
  cx: number,
  cy: number,
  burstDelay: number,
  colors: number[]
): void {
  for (let i = 0; i < 20; i += 1) {
    const angle = (i / 20) * Math.PI * 2 + Math.random() * 0.3
    const speed = 80 + Math.random() * 120
    const radius = 3 + Math.random() * 4
    const color = colors[Math.floor(Math.random() * colors.length)]

    const particle = scene.add.circle(cx, cy, radius, color, 0.95)
    particle.setDepth(100)

    const targetX = cx + Math.cos(angle) * speed
    const targetY = cy + Math.sin(angle) * speed

    scene.tweens.add({
      targets: particle,
      x: targetX,
      y: targetY,
      alpha: { from: 0.95, to: 0 },
      scaleX: { from: 1, to: 0.1 },
      scaleY: { from: 1, to: 0.1 },
      duration: 600 + Math.random() * 400,
      delay: burstDelay,
      ease: "Quad.easeOut",
      onComplete: () => {
        if (particle && !particle.isDestroyed) {
          particle.destroy()
        }
      }
    })
  }
}

function spawnBurstStarParticles(
  scene: WarehouseSceneThis,
  cx: number,
  cy: number,
  burstDelay: number,
  isLegendaryHeavy: boolean,
  starColors: number[]
): void {
  const starCount = isLegendaryHeavy ? 8 : 5
  for (let i = 0; i < starCount; i += 1) {
    const angle = Math.random() * Math.PI * 2
    const speed = 60 + Math.random() * 100
    const starSize = 6 + Math.random() * 8
    const starColor = starColors[Math.floor(Math.random() * starColors.length)]

    const star = scene.add.star(cx, cy, 4, starSize * 0.3, starSize, starColor, 0.9)
    star.setDepth(101)

    const targetX = cx + Math.cos(angle) * speed
    const targetY = cy + Math.sin(angle) * speed

    scene.tweens.add({
      targets: star,
      x: targetX,
      y: targetY,
      alpha: { from: 0.9, to: 0 },
      scaleX: { from: 1, to: 0.2 },
      scaleY: { from: 1, to: 0.2 },
      angle: { from: 0, to: 180 + Math.random() * 180 },
      duration: 500 + Math.random() * 400,
      delay: burstDelay + Math.random() * 60,
      ease: "Quad.easeOut",
      onComplete: () => {
        if (star && !star.isDestroyed) {
          star.destroy()
        }
      }
    })
  }
}

function spawnRisingCircleParticles(
  scene: WarehouseSceneThis,
  gameWidth: number,
  gameHeight: number,
  colors: number[]
): void {
  const riseCount = 40
  for (let i = 0; i < riseCount; i += 1) {
    const x = Math.random() * gameWidth
    const y = gameHeight + 20 + Math.random() * 60
    const radius = 2 + Math.random() * 3
    const color = colors[Math.floor(Math.random() * colors.length)]

    const particle = scene.add.circle(x, y, radius, color, 0.85)
    particle.setDepth(100)

    const targetX = x + (Math.random() - 0.5) * 100
    const targetY = -30 - Math.random() * 80
    const duration = 1200 + Math.random() * 800
    const delay = Math.random() * 600

    scene.tweens.add({
      targets: particle,
      x: targetX,
      y: targetY,
      alpha: { from: 0.85, to: 0 },
      scaleX: { from: 1, to: 0.3 },
      scaleY: { from: 1, to: 0.3 },
      angle: { from: 0, to: (Math.random() - 0.5) * 360 },
      duration,
      delay,
      ease: "Sine.easeOut",
      onComplete: () => {
        if (particle && !particle.isDestroyed) {
          particle.destroy()
        }
      }
    })
  }
}

function spawnRisingStarParticles(
  scene: WarehouseSceneThis,
  gameWidth: number,
  gameHeight: number,
  isLegendaryHeavy: boolean,
  starColors: number[],
  burstCount: number
): void {
  const riseStarCount = isLegendaryHeavy ? 15 : 8
  for (let i = 0; i < riseStarCount; i += 1) {
    const x = Math.random() * gameWidth
    const y = gameHeight + 10 + Math.random() * 50
    const starSize = 5 + Math.random() * 7
    const starColor = starColors[Math.floor(Math.random() * starColors.length)]

    const star = scene.add.star(x, y, 4, starSize * 0.3, starSize, starColor, 0.8)
    star.setDepth(101)

    const targetX = x + (Math.random() - 0.5) * 80
    const targetY = -20 - Math.random() * 60
    const duration = 1000 + Math.random() * 600
    const delay = Math.random() * 500 + burstCount * 150 + 200

    scene.tweens.add({
      targets: star,
      x: targetX,
      y: targetY,
      alpha: { from: 0.8, to: 0 },
      scaleX: { from: 1, to: 0.3 },
      scaleY: { from: 1, to: 0.3 },
      angle: { from: 0, to: (Math.random() - 0.5) * 360 },
      duration,
      delay,
      ease: "Sine.easeOut",
      onComplete: () => {
        if (star && !star.isDestroyed) {
          star.destroy()
        }
      }
    })
  }
}

function spawnSparkleParticles(scene: WarehouseSceneThis, gameWidth: number, gameHeight: number): void {
  const sparkleCount = 15
  for (let i = 0; i < sparkleCount; i += 1) {
    const x = Math.random() * gameWidth
    const y = Math.random() * gameHeight * 0.7
    const size = 4 + Math.random() * 6

    const sparkle = scene.add.star(x, y, 4, size * 0.4, size, 0xffffff, 0)
    sparkle.setDepth(101)

    scene.tweens.add({
      targets: sparkle,
      alpha: { from: 0, to: 1 },
      scaleX: { from: 0.5, to: 1.2 },
      scaleY: { from: 0.5, to: 1.2 },
      duration: 200,
      delay: Math.random() * 800,
      yoyo: true,
      ease: "Quad.easeOut",
      onComplete: () => {
        if (sparkle && !sparkle.isDestroyed) {
          sparkle.destroy()
        }
      }
    })
  }
}

/**
 * 播放结算最终庆祝特效（粒子爆炸+彩带）
 * @param scene - 场景上下文
 * @param winnerProfit - 赢家利润（负数则不播放）
 */
export function playSettlementFinalEffect(scene: WarehouseSceneThis, winnerProfit: number): void {
  if (winnerProfit <= 0) {
    return
  }

  const gameWidth = scene.scale.width
  const gameHeight = scene.scale.height
  const colors = CELEBRATION_COLORS

  const hasLegendaryItems =
    scene.items &&
    scene.items.some(function (it) {
      return it.qualityKey === "legendary"
    })
  const isLegendaryHeavy = hasLegendaryItems || winnerProfit > 500000
  const starColors = getStarColors(isLegendaryHeavy)

  const burstCount = 5
  for (let burst = 0; burst < burstCount; burst += 1) {
    const burstDelay = burst * 150
    const cx = gameWidth * (0.2 + Math.random() * 0.6)
    const cy = gameHeight * (0.3 + Math.random() * 0.4)

    spawnBurstCoinParticles(scene, cx, cy, burstDelay, colors)
    spawnBurstStarParticles(scene, cx, cy, burstDelay, isLegendaryHeavy, starColors)
  }

  spawnRisingCircleParticles(scene, gameWidth, gameHeight, colors)
  spawnRisingStarParticles(scene, gameWidth, gameHeight, isLegendaryHeavy, starColors, burstCount)
  spawnSparkleParticles(scene, gameWidth, gameHeight)
}

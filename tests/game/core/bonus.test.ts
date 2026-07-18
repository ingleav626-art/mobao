import { describe, it, expect } from "vitest"
import {
  calculateBonusBuckets,
  calculateBonusMultiplier,
  calcIdentityFinal,
  type BonusEffect
} from "../../../scripts/game/core/bonus"

function e(id: string, scope: string, condition: string, value: number): BonusEffect {
  return { id, scope: scope as BonusEffect["scope"], condition: condition as BonusEffect["condition"], value }
}

describe("calculateBonusBuckets", () => {
  it("空加成返回各区=1", () => {
    const b = calculateBonusBuckets([], "onGain")
    for (const scope of Object.keys(b)) {
      expect(b[scope as keyof typeof b]).toBe(1)
    }
  })

  it("自身区加算", () => {
    const effects = [e("a", "self", "onGain", 0.5), e("b", "self", "onGain", 0.3)]
    const b = calculateBonusBuckets(effects, "onGain")
    expect(b.self).toBe(1.8)
  })

  it("同 ID 不叠加", () => {
    const effects = [e("a", "self", "onGain", 0.5), e("a", "self", "onGain", 0.3)]
    const b = calculateBonusBuckets(effects, "onGain")
    expect(b.self).toBe(1.5)
  })

  it("condition 不匹配跳过", () => {
    const effects = [e("a", "self", "onGain", 0.5)]
    const b = calculateBonusBuckets(effects, "onLoss")
    expect(b.self).toBe(1)
  })

  it("五区间乘算", () => {
    const effects = [
      e("1", "universal", "onGain", -0.3),
      e("2", "self", "onGain", 0.5),
      e("3", "group", "onGain", 1),
      e("4", "system", "onGain", 0.2)
    ]
    const b = calculateBonusBuckets(effects, "onGain")
    expect(b.universal).toBe(0.7)
    expect(b.self).toBe(1.5)
    expect(b.others).toBe(1)
    expect(b.group).toBe(2)
    expect(b.system).toBe(1.2)
  })

  it("各区保底为 0 不翻负号", () => {
    const effects = [e("a", "self", "onGain", -1.5)]
    const b = calculateBonusBuckets(effects, "onGain")
    expect(b.self).toBe(0)
  })
})

describe("calcIdentityFinal", () => {
  const emptyEffects: BonusEffect[] = []

  it("赢局拍下者 profit=20000 无加成", () => {
    const f = calcIdentityFinal("winner/profit", 20000, emptyEffects)
    expect(f).toBe(20000)
  })

  it("赢局拍下者 profit=20000 + 护符(自身+50%) → 30000", () => {
    const effects = [e("amulet", "self", "onGain", 0.5)]
    const f = calcIdentityFinal("winner/profit", 20000, effects)
    expect(f).toBe(30000)
  })

  it("赢局拍下者 profit=20000 + 护符 + 通用-30% + 群体祝福(+100%)", () => {
    const effects = [
      e("g1", "universal", "onGain", -0.3),
      e("amulet", "self", "onGain", 0.5),
      e("bless", "group", "onGain", 1)
    ]
    // universal=0.7, self=1.5, others=1, group=2, system=1
    // 20000 * 0.7 * 1.5 * 2 = 42000
    const f = calcIdentityFinal("winner/profit", 20000, effects)
    expect(f).toBe(42000)
  })

  it("输局拍下者 loss=-30000 + 厄运(自身-50% onLoss) + 群体诅咒(+200% onLoss)", () => {
    const effects = [
      e("curse_self", "self", "onLoss", -0.5),
      e("curse_group", "group", "onLoss", 2)
    ]
    // self=0.5, group=3.0
    // -30000 * 0.5 * 3.0 = -45000
    const f = calcIdentityFinal("winner/loss", -30000, effects)
    expect(f).toBe(-45000)
  })

  it("赢局非拍下者 ticket: W=20000, base=1000, empty→-1000", () => {
    const f = calcIdentityFinal("nonwinner/ticket", 20000, emptyEffects)
    // 20000 * (-0.05) * 1 = -1000
    expect(f).toBe(-1000)
  })

  it("输局非拍下者 dividend: W=-30000, base=4500, 分红加倍(他人onGain +50%) → 6750", () => {
    const effects = [e("div_double", "others", "onGain", 0.5)]
    const f = calcIdentityFinal("nonwinner/dividend", -30000, effects)
    // base 30000*0.15=4500, others=1.5, final=6750
    expect(f).toBe(6750)
  })

  it("赢局非拍下者 ticket + 门票豁免(自身onLoss -40%)", () => {
    const effects = [e("ticket_exempt", "self", "onLoss", -0.4)]
    const f = calcIdentityFinal("nonwinner/ticket", 20000, effects)
    // 20000*(-0.05)*0.6 = -600
    expect(f).toBe(-600)
  })

  it("[边界] 赢局拍下者 profit=20000 加成总和=-2(自身-1.5+通用-0.5) → 0", () => {
    const effects = [
      e("a", "self", "onGain", -1.5),
      e("b", "universal", "onGain", -0.5)
    ]
    const f = calcIdentityFinal("winner/profit", 20000, effects)
    // self=0, universal=0.5, 20000*0*0.5=0
    expect(f).toBe(0)
  })
})

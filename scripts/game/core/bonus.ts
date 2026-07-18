/**
 * @file core/bonus.ts
 * @module core/bonus
 * @description 加成系统类型定义与纯函数。五乘区架构，支持通用/自身/他人/群体/系统
 *              四身份的结算利润计算。
 *
 * 同 ID 不叠加（多人用同一道具只生效一次）。
 * 各区加算，区间乘算，每个区保底 0（不会被翻为负号）。
 */

export type BonusScope = "self" | "others" | "group" | "universal" | "system"
export type BonusCondition = "onGain" | "onLoss"

export interface BonusEffect {
  id: string
  scope: BonusScope
  condition: BonusCondition
  value: number
}

const SCOPE_ORDER: BonusScope[] = ["universal", "self", "others", "group", "system"]

/**
 * 根据已有加成列表和当前身份条件，计算各乘区乘数
 * 返回五桶值，每个桶 = max(0, 1 + Σ匹配的加成值)，同 ID 去重
 */
export function calculateBonusBuckets(effects: BonusEffect[], condition: BonusCondition): Record<BonusScope, number> {
  const buckets: Record<BonusScope, number[]> = {
    universal: [],
    self: [],
    others: [],
    group: [],
    system: []
  }
  const seen = new Set<string>()

  for (const e of effects) {
    if (e.condition !== condition) continue
    if (seen.has(e.id)) continue
    seen.add(e.id)
    buckets[e.scope].push(e.value)
  }

  const result = {} as Record<BonusScope, number>
  for (const scope of SCOPE_ORDER) {
    const sum = buckets[scope].reduce((a, v) => a + v, 0)
    result[scope] = Math.max(0, 1 + sum)
  }
  return result
}

/**
 * 最终乘数 = 五桶乘积
 */
export function calculateBonusMultiplier(effects: BonusEffect[], condition: BonusCondition): number {
  const buckets = calculateBonusBuckets(effects, condition)
  let multiplier = 1
  for (const scope of SCOPE_ORDER) {
    multiplier *= buckets[scope]
  }
  return multiplier
}

/** 四个身份 */
export type SettlementIdentity = "winner/profit" | "winner/loss" | "nonwinner/ticket" | "nonwinner/dividend"

/** 身份→ baseValue 来源 + baseCoefficient + condition */
export interface IdentityConfig {
  baseValue: (rawProfit: number) => number
  baseCoefficient: number
  condition: BonusCondition
}

export const IDENTITY_CONFIG: Record<SettlementIdentity, IdentityConfig> = {
  "winner/profit": { baseValue: (w) => w, baseCoefficient: 1, condition: "onGain" },
  "winner/loss": { baseValue: (w) => w, baseCoefficient: 1, condition: "onLoss" },
  "nonwinner/ticket": { baseValue: (w) => Math.abs(w), baseCoefficient: -0.05, condition: "onLoss" },
  "nonwinner/dividend": { baseValue: (w) => Math.abs(w), baseCoefficient: 0.15, condition: "onGain" }
}

/**
 * 单身份结算：baseValue × baseCoeff × multiplier
 */
export function calcIdentityFinal(
  identity: SettlementIdentity,
  rawProfit: number,
  effects: BonusEffect[]
): number {
  const cfg = IDENTITY_CONFIG[identity]
  const base = cfg.baseValue(rawProfit)
  const mult = calculateBonusMultiplier(effects, cfg.condition)
  return Math.round(base * cfg.baseCoefficient * mult)
}

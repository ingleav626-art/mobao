/**
 * @file data/skills.ts
 * @module data/skills
 * @description 技能数据定义与使用管理。定义角色主动技能的静态配置（名称、描述、效果、每回合可用次数），
 *              以及 SkillManager 类负责技能的使用、扣减和状态查询。
 *
 * 技能列表（SKILL_DEFS），3个技能：
 *   - skill-outline-scan（拓影侦测）：揭示3件轮廓，对应 scout 角色
 *   - skill-quality-jade（玉脉鉴质）：玉器品质+2，对应 appraiser 角色
 *   - skill-reveal-largest（鉴踪直取）：揭示最大1件全部信息，对应 seeker 角色
 *
 * @exports window.SkillSystem - 技能系统单例（兼容）
 * @exports SKILL_DEFS, SkillManager - 命名导出
 */

import { applyUse, resetEntries, type RevealResult } from "./def-manager-helpers"

// 技能配置：控制每回合可用次数、揭露类型与数量。
export const SKILL_DEFS = [
  {
    id: "skill-outline-scan",
    name: "技能-拓影侦测",
    description: "揭示3件藏品的完整轮廓。",
    maxPerRound: 99,
    execute(context: any) {
      return context.revealOutline({ count: 3 })
    }
  },
  {
    id: "skill-quality-jade",
    name: "技能-玉脉鉴质",
    description: "优先对玉器揭示2件品质格，若不足则补其他品类。",
    maxPerRound: 99,
    execute(context: any) {
      return context.revealQuality({
        count: 2,
        category: "玉器",
        allowCategoryFallback: true
      })
    }
  },
  {
    id: "skill-reveal-largest",
    name: "技能-鉴踪直取",
    description: "直接揭示轮廓最大的1件藏品的所有信息（不是价值最高）。",
    maxPerRound: 99,
    execute(context: any) {
      return context.revealAll({
        count: 1,
        sortStrategy: "largestFirst"
      })
    }
  }
]

interface SkillRuntime {
  id: string
  name: string
  description: string
  maxPerRound: number
  remainingThisRound: number
  execute: (context: any) => { ok: boolean; revealed: number; message?: string }
}

interface SkillState {
  id: string
  name: string
  remainingThisRound: number
  maxPerRound: number
}

export class SkillManager {
  skills: SkillRuntime[]

  constructor() {
    this.skills = SKILL_DEFS.map((skill) => ({
      ...skill,
      remainingThisRound: skill.maxPerRound
    }))
  }

  resetForNewRun(): void {
    resetEntries(
      this.skills,
      (e) => e.maxPerRound,
      (e, v) => {
        e.remainingThisRound = v
      }
    )
  }

  // onNewRound 与 resetForNewRun 行为一致（测试已断言），委托同一实现消除字节级重复。
  onNewRound(): void {
    this.resetForNewRun()
  }

  use(skillId: string, context: any): RevealResult {
    return applyUse(skillId, context, {
      entries: this.skills,
      getRemaining: (e) => e.remainingThisRound,
      setRemaining: (e, v) => {
        e.remainingThisRound = v
      },
      notFoundMessage: () => "技能不存在",
      depletedMessage: (e) => `${e.name} 本回合已用完`
    })
  }

  getSkillState(): SkillState[] {
    return this.skills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      remainingThisRound: skill.remainingThisRound,
      maxPerRound: skill.maxPerRound
    }))
  }
}

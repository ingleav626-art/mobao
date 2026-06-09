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

interface RevealResult {
  ok: boolean
  revealed: number
  message: string
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
    this.skills.forEach((skill) => {
      skill.remainingThisRound = skill.maxPerRound
    })
  }

  onNewRound(): void {
    this.skills.forEach((skill) => {
      skill.remainingThisRound = skill.maxPerRound
    })
  }

  use(skillId: string, context: any): RevealResult {
    const skill = this.skills.find((s) => s.id === skillId)
    if (!skill) {
      return { ok: false, revealed: 0, message: "技能不存在" }
    }

    if (skill.remainingThisRound <= 0) {
      return { ok: false, revealed: 0, message: `${skill.name} 本回合已用完` }
    }

    const revealResult = skill.execute(context)
    if (!revealResult.ok) {
      return { ok: false, revealed: 0, message: revealResult.message || "揭示失败" }
    }

    skill.remainingThisRound -= 1
    return {
      ok: true,
      revealed: revealResult.revealed,
      message: `${skill.name} 生效，揭示 ${revealResult.revealed} 件目标。`
    }
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

// 兼容层：保持 window.SkillSystem 全局变量可用
; (window as any).SkillSystem = {
  SKILL_DEFS,
  SkillManager
}
  // 兼容层：skill-item-manager.ts 直接引用 SKILL_DEFS 全局变量
  ; (window as any).SKILL_DEFS = SKILL_DEFS
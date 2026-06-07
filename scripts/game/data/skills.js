/**
 * @file data/skills.js
 * @module data/skills
 * @description 技能数据定义与使用管理。采用 ES Module 模式，同时挂载到 window.SkillSystem 保持兼容。
 *              定义角色主动技能的静态配置（名称、描述、效果、每回合可用次数），
 *              以及 SkillManager 类负责技能的使用、扣减和状态查询。
 *              与 characters.js 中的 skillId 对应，每个角色绑定一个技能。
 *
 * 技能列表（SKILL_DEFS），3个技能：
 *   - skill-outline-scan（拓影侦测）：揭示3件轮廓，对应 scout 角色
 *   - skill-quality-jade（玉脉鉴质）：玉器品质+2（不足补其他），对应 appraiser 角色
 *   - skill-reveal-largest（鉴踪直取）：揭示最大1件全部信息，对应 seeker 角色
 *
 * SkillManager 类：
 *   - constructor(): 初始化技能列表（每项含 remainingThisRound）
 *   - resetForNewRun(): 重置所有技能的回合使用次数
 *   - onNewRound(): 新回合开始时重置使用次数
 *   - use(skillId, context): 使用技能（扣减次数 + 执行揭示）
 *   - getSkillState(): 获取所有技能的当前状态
 *
 * 技能执行机制：
 *   每个技能的 execute(context) 接受揭示上下文对象，调用 context.revealOutline、
 *   context.revealQuality 或 context.revealAll，返回 { ok, revealed } 结果
 *
 * @exports window.SkillSystem - 技能系统单例（兼容）
 * @exports SKILL_DEFS, SkillManager - 命名导出
 *   关键属性：SKILL_DEFS（技能定义数组）
 *   关键类：SkillManager
 */
// 技能配置：控制每回合可用次数、揭露类型与数量。
export const SKILL_DEFS = [
  {
    id: "skill-outline-scan",
    name: "技能-拓影侦测",
    description: "揭示3件藏品的完整轮廓。",
    maxPerRound: 99,
    execute(context) {
      return context.revealOutline({ count: 3 })
    }
  },
  {
    id: "skill-quality-jade",
    name: "技能-玉脉鉴质",
    description: "优先对玉器揭示2件品质格，若不足则补其他品类。",
    maxPerRound: 99,
    execute(context) {
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
    execute(context) {
      return context.revealAll({
        count: 1,
        sortStrategy: "largestFirst"
      })
    }
  }
]

export class SkillManager {
  constructor() {
    this.skills = SKILL_DEFS.map((skill) => ({
      ...skill,
      remainingThisRound: skill.maxPerRound
    }))
  }

  resetForNewRun() {
    this.skills.forEach((skill) => {
      skill.remainingThisRound = skill.maxPerRound
    })
  }

  onNewRound() {
    this.skills.forEach((skill) => {
      skill.remainingThisRound = skill.maxPerRound
    })
  }

  use(skillId, context) {
    // context 由主场景提供，技能本身只关心"要揭露什么"。
    const skill = this.skills.find((s) => s.id === skillId)
    if (!skill) {
      return { ok: false, message: "技能不存在" }
    }

    if (skill.remainingThisRound <= 0) {
      return { ok: false, message: `${skill.name} 本回合已用完` }
    }

    const revealResult = skill.execute(context)
    if (!revealResult.ok) {
      return revealResult
    }

    skill.remainingThisRound -= 1
    return {
      ...revealResult,
      ok: true,
      message: `${skill.name} 生效，揭示 ${revealResult.revealed} 件目标。`,
      revealed: revealResult.revealed
    }
  }

  getSkillState() {
    return this.skills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      remainingThisRound: skill.remainingThisRound,
      maxPerRound: skill.maxPerRound
    }))
  }
}

// 兼容层：保持 window.SkillSystem 全局变量可用
window.SkillSystem = {
  SKILL_DEFS,
  SkillManager
}
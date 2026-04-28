(function setupSkillSystem(global) {
  // 技能配置：控制每回合可用次数、揭露类型与数量。
  const SKILL_DEFS = [
    {
      id: "skill-outline-scan",
      name: "技能-拓影侦测",
      description: "揭示3件藏品的完整轮廓。",
      maxPerRound: 1,
      execute(context) {
        return context.revealOutline({ count: 3 });
      }
    },
    {
      id: "skill-quality-jade",
      name: "技能-玉脉鉴质",
      description: "优先对玉器揭示2件品质格，若不足则补其他品类。",
      maxPerRound: 1,
      execute(context) {
        return context.revealQuality({
          count: 2,
          category: "玉器",
          allowCategoryFallback: true
        });
      }
    }
  ];

  class SkillManager {
    constructor() {
      this.skills = SKILL_DEFS.map((skill) => ({
        ...skill,
        remainingThisRound: skill.maxPerRound
      }));
    }

    resetForNewRun() {
      this.skills.forEach((skill) => {
        skill.remainingThisRound = skill.maxPerRound;
      });
    }

    onNewRound() {
      this.skills.forEach((skill) => {
        skill.remainingThisRound = skill.maxPerRound;
      });
    }

    use(skillId, context) {
      // context 由主场景提供，技能本身只关心“要揭露什么”。
      const skill = this.skills.find((s) => s.id === skillId);
      if (!skill) {
        return { ok: false, message: "技能不存在" };
      }

      if (skill.remainingThisRound <= 0) {
        return { ok: false, message: `${skill.name} 本回合已用完` };
      }

      const revealResult = skill.execute(context);
      if (!revealResult.ok) {
        return revealResult;
      }

      skill.remainingThisRound -= 1;
      return {
        ...revealResult,
        ok: true,
        message: `${skill.name} 生效，揭示 ${revealResult.revealed} 件目标。`,
        revealed: revealResult.revealed
      };
    }

    getSkillState() {
      return this.skills.map((skill) => ({
        id: skill.id,
        name: skill.name,
        remainingThisRound: skill.remainingThisRound,
        maxPerRound: skill.maxPerRound
      }));
    }
  }

  global.SkillSystem = {
    SKILL_DEFS,
    SkillManager
  };
})(window);

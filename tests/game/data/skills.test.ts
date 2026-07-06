import { describe, it, expect } from "vitest"
import { SKILL_DEFS, SkillManager } from "../../../scripts/game/data/skills"

describe("skills", () => {
  describe("SKILL_DEFS", () => {
    it("包含 3 个技能定义", () => {
      expect(SKILL_DEFS).toHaveLength(3)
    })

    it("每个技能有完整字段", () => {
      for (const def of SKILL_DEFS) {
        expect(typeof def.id).toBe("string")
        expect(typeof def.name).toBe("string")
        expect(typeof def.description).toBe("string")
        expect(typeof def.maxPerRound).toBe("number")
        expect(def.maxPerRound).toBeGreaterThan(0)
        expect(typeof def.execute).toBe("function")
      }
    })

    it("id 唯一", () => {
      const ids = SKILL_DEFS.map((d) => d.id)
      expect(new Set(ids).size).toBe(ids.length)
    })
  })

  describe("SkillManager", () => {
    it("constructor 初始化 remainingThisRound=maxPerRound", () => {
      const mgr = new SkillManager()
      expect(mgr.skills).toHaveLength(SKILL_DEFS.length)
      for (const skill of mgr.skills) {
        expect(skill.remainingThisRound).toBe(skill.maxPerRound)
      }
    })

    it("getSkillState 返回完整快照且为独立对象", () => {
      const mgr = new SkillManager()
      const state = mgr.getSkillState()
      expect(state).toHaveLength(SKILL_DEFS.length)
      expect(state[0]).toHaveProperty("id")
      expect(state[0]).toHaveProperty("name")
      expect(state[0]).toHaveProperty("remainingThisRound")
      expect(state[0]).toHaveProperty("maxPerRound")
      state[0].remainingThisRound = -1
      expect(mgr.skills[0].remainingThisRound).toBe(mgr.skills[0].maxPerRound)
    })

    it("resetForNewRun 重置已消耗技能", () => {
      const mgr = new SkillManager()
      mgr.skills[0].remainingThisRound = 0
      mgr.resetForNewRun()
      expect(mgr.skills[0].remainingThisRound).toBe(mgr.skills[0].maxPerRound)
    })

    it("onNewRound 重置已消耗技能（与 resetForNewRun 行为一致）", () => {
      const mgr = new SkillManager()
      mgr.skills[0].remainingThisRound = 0
      mgr.skills[1].remainingThisRound = 5
      mgr.onNewRound()
      expect(mgr.skills[0].remainingThisRound).toBe(mgr.skills[0].maxPerRound)
      expect(mgr.skills[1].remainingThisRound).toBe(mgr.skills[1].maxPerRound)
    })

    it("use 技能不存在返回失败", () => {
      const mgr = new SkillManager()
      const result = mgr.use("nonexistent", {})
      expect(result.ok).toBe(false)
      expect(result.revealed).toBe(0)
      expect(result.message).toContain("不存在")
    })

    it("use 本回合已用完返回失败且不调用 execute", () => {
      const mgr = new SkillManager()
      mgr.skills[0].remainingThisRound = 0
      let executeCalled = false
      const original = mgr.skills[0].execute
      mgr.skills[0].execute = () => {
        executeCalled = true
        return original({})
      }
      const result = mgr.use(mgr.skills[0].id, {})
      expect(result.ok).toBe(false)
      expect(result.message).toContain("已用完")
      expect(executeCalled).toBe(false)
    })

    it("use execute 失败时不扣减 remainingThisRound", () => {
      const mgr = new SkillManager()
      const skillId = mgr.skills[0].id
      const before = mgr.skills[0].remainingThisRound
      mgr.skills[0].execute = () => ({ ok: false, revealed: 0, message: "无可用目标" })
      const result = mgr.use(skillId, {})
      expect(result.ok).toBe(false)
      expect(mgr.skills[0].remainingThisRound).toBe(before)
    })

    it("use 成功扣减 remainingThisRound 并返回揭示信息", () => {
      const mgr = new SkillManager()
      const skillId = mgr.skills[0].id
      const before = mgr.skills[0].remainingThisRound
      mgr.skills[0].execute = () => ({ ok: true, revealed: 3 })
      const result = mgr.use(skillId, {})
      expect(result.ok).toBe(true)
      expect(result.revealed).toBe(3)
      expect(mgr.skills[0].remainingThisRound).toBe(before - 1)
      expect(result.message).toContain("3")
    })
  })
})

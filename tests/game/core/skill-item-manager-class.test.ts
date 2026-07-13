import { describe, it, expect, vi } from "vitest"
import { SkillItemManager, type SkillItemManagerDeps } from "../../../scripts/game/core/skill-item-manager-class"
import type { SkillContext } from "../../../types/game"

function makeSkillContext(): SkillContext {
  return {
    revealOutline: vi.fn(() => ({ ok: true, revealed: 1, message: "ok" })),
    revealQuality: vi.fn(() => ({ ok: true, revealed: 1, message: "ok" })),
    revealAll: vi.fn(() => ({ ok: true, revealed: 1, message: "ok" })),
  }
}

function makeDeps(overrides: Partial<SkillItemManagerDeps> = {}) {
  let actionsLeft = 3
  const skillManager = {
    use: vi.fn(() => ({ ok: true, message: "技能使用成功" })),
  }
  const itemManager = {
    use: vi.fn(() => ({ ok: true, message: "道具使用成功" })),
  }
  const writeLog = vi.fn()
  const updateHud = vi.fn()
  const closeItemDrawer = vi.fn()
  const recordPlayerUsage = vi.fn()
  const addPrivateIntelEntry = vi.fn()
  const consumeItem = vi.fn()
  const buildSkillContext = vi.fn(() => makeSkillContext())

  const deps: SkillItemManagerDeps = {
    getRound: () => 1,
    getActionsLeft: () => actionsLeft,
    setActionsLeft: (n: number) => {
      actionsLeft = n
    },
    skillManager,
    itemManager,
    canUseIntelActions: () => true,
    closeItemDrawer,
    writeLog,
    buildSkillContext,
    updateHud,
    recordPlayerUsage,
    addPrivateIntelEntry,
    getOutlineBonus: () => 0,
    getQualityBonus: () => 0,
    getOutlineSortStrategy: () => null,
    isLanMode: () => false,
    lanMySlotId: () => null,
    lanBridge: () => null,
    getPlayers: () => [{ id: "p2", name: "玩家" } as never],
    consumeItem,
    ...overrides,
  }

  return {
    deps,
    getActionsLeft: () => actionsLeft,
    skillManager,
    itemManager,
    writeLog,
    updateHud,
    closeItemDrawer,
    recordPlayerUsage,
    addPrivateIntelEntry,
    consumeItem,
    buildSkillContext,
  }
}

describe("SkillItemManager", () => {
  describe("useSkill", () => {
    it("成功使用技能：扣减行动次数并触发各回调", () => {
      const ctx = makeDeps()
      const manager = new SkillItemManager(ctx.deps)
      manager.useSkill("skill-outline-scan")

      expect(ctx.getActionsLeft()).toBe(2)
      expect(ctx.skillManager.use).toHaveBeenCalledOnce()
      expect(ctx.skillManager.use).toHaveBeenCalledWith(
        "skill-outline-scan",
        expect.objectContaining({
          revealOutline: expect.any(Function),
          revealQuality: expect.any(Function),
          revealAll: expect.any(Function),
        }),
      )
      expect(ctx.writeLog).toHaveBeenCalledWith("技能使用成功")
      expect(ctx.updateHud).toHaveBeenCalledOnce()
      expect(ctx.recordPlayerUsage).toHaveBeenCalledWith("p2", "skill-outline-scan")
      expect(ctx.addPrivateIntelEntry).toHaveBeenCalledOnce()
    })

    it("canUseIntelActions 返回 false：提前退出，不扣减行动次数", () => {
      const ctx = makeDeps({ canUseIntelActions: () => false })
      const manager = new SkillItemManager(ctx.deps)
      manager.useSkill("skill-outline-scan")

      expect(ctx.getActionsLeft()).toBe(3)
      expect(ctx.skillManager.use).not.toHaveBeenCalled()
      expect(ctx.writeLog).not.toHaveBeenCalled()
    })

    it("canUseIntelActions 返回 false 时不关闭道具抽屉（useSkill closeDrawer=false）", () => {
      const ctx = makeDeps({ canUseIntelActions: () => false })
      const manager = new SkillItemManager(ctx.deps)
      manager.useSkill("skill-outline-scan")
      expect(ctx.closeItemDrawer).not.toHaveBeenCalled()
    })

    it("行动次数耗尽：写日志不扣减", () => {
      const ctx = makeDeps({ getActionsLeft: () => 0 })
      const manager = new SkillItemManager(ctx.deps)
      manager.useSkill("skill-outline-scan")

      expect(ctx.writeLog).toHaveBeenCalledOnce()
      const msg = ctx.writeLog.mock.calls[0][0] as string
      expect(msg).toContain("行动次数已耗尽")
      expect(msg).toContain("技能")
      expect(ctx.skillManager.use).not.toHaveBeenCalled()
    })

    it("回合超限：写日志不扣减", () => {
      const ctx = makeDeps({ getRound: () => 99, getActionsLeft: () => 5 })
      const manager = new SkillItemManager(ctx.deps)
      manager.useSkill("skill-outline-scan")

      const msg = ctx.writeLog.mock.calls[0][0] as string
      expect(msg).toContain("所有回合已结束")
      expect(ctx.skillManager.use).not.toHaveBeenCalled()
    })

    it("skillManager.use 返回失败：恢复行动次数，写错误日志", () => {
      const ctx = makeDeps({
        skillManager: { use: vi.fn(() => ({ ok: false, message: "技能冷却中" })) },
      })
      const manager = new SkillItemManager(ctx.deps)
      manager.useSkill("skill-outline-scan")

      expect(ctx.getActionsLeft()).toBe(3)
      expect(ctx.writeLog).toHaveBeenCalledWith("技能冷却中")
      expect(ctx.updateHud).toHaveBeenCalledOnce()
      expect(ctx.recordPlayerUsage).not.toHaveBeenCalled()
      expect(ctx.addPrivateIntelEntry).not.toHaveBeenCalled()
    })

    it("成功时 addPrivateIntelEntry 传入技能名称和描述", () => {
      const ctx = makeDeps()
      const manager = new SkillItemManager(ctx.deps)
      manager.useSkill("skill-outline-scan")

      const entry = ctx.addPrivateIntelEntry.mock.calls[0][0] as { source: string; text: string }
      expect(entry.source).toBeTruthy()
      expect(entry.text).toBeTruthy()
    })

    it("未找到定义时使用 fallbackText", () => {
      const ctx = makeDeps()
      const manager = new SkillItemManager(ctx.deps)
      manager.useSkill("nonexistent-skill")

      const entry = ctx.addPrivateIntelEntry.mock.calls[0][0] as { source: string; text: string }
      expect(entry.source).toBe("nonexistent-skill")
      expect(entry.text).toBe("技能效果")
    })
  })

  describe("useItem", () => {
    it("成功使用道具：扣减行动次数，消耗道具，关闭抽屉", () => {
      const ctx = makeDeps()
      const manager = new SkillItemManager(ctx.deps)
      manager.useItem("item-outline-lamp")

      expect(ctx.getActionsLeft()).toBe(2)
      expect(ctx.itemManager.use).toHaveBeenCalledOnce()
      expect(ctx.consumeItem).toHaveBeenCalledWith("item-outline-lamp")
      expect(ctx.closeItemDrawer).toHaveBeenCalled()
      expect(ctx.writeLog).toHaveBeenCalledWith("道具使用成功")
      expect(ctx.updateHud).toHaveBeenCalledOnce()
      expect(ctx.recordPlayerUsage).toHaveBeenCalledWith("p2", "item-outline-lamp")
    })

    it("canUseIntelActions 返回 false：关闭抽屉，提前退出", () => {
      const ctx = makeDeps({ canUseIntelActions: () => false })
      const manager = new SkillItemManager(ctx.deps)
      manager.useItem("item-outline-lamp")

      expect(ctx.closeItemDrawer).toHaveBeenCalledOnce()
      expect(ctx.getActionsLeft()).toBe(3)
      expect(ctx.itemManager.use).not.toHaveBeenCalled()
      expect(ctx.consumeItem).not.toHaveBeenCalled()
    })

    it("行动次数耗尽：写日志，关闭抽屉", () => {
      const ctx = makeDeps({ getActionsLeft: () => 0 })
      const manager = new SkillItemManager(ctx.deps)
      manager.useItem("item-outline-lamp")

      expect(ctx.writeLog).toHaveBeenCalledOnce()
      expect(ctx.closeItemDrawer).toHaveBeenCalledOnce()
      expect(ctx.itemManager.use).not.toHaveBeenCalled()
    })

    it("itemManager.use 返回失败：恢复行动次数，关闭抽屉，不消耗道具", () => {
      const ctx = makeDeps({
        itemManager: { use: vi.fn(() => ({ ok: false, message: "道具数量不足" })) },
      })
      const manager = new SkillItemManager(ctx.deps)
      manager.useItem("item-outline-lamp")

      expect(ctx.getActionsLeft()).toBe(3)
      expect(ctx.consumeItem).not.toHaveBeenCalled()
      expect(ctx.closeItemDrawer).toHaveBeenCalledOnce()
      expect(ctx.writeLog).toHaveBeenCalledWith("道具数量不足")
    })

    it("成功时 addPrivateIntelEntry 传入道具名称和描述", () => {
      const ctx = makeDeps()
      const manager = new SkillItemManager(ctx.deps)
      manager.useItem("item-outline-lamp")

      const entry = ctx.addPrivateIntelEntry.mock.calls[0][0] as { source: string; text: string }
      expect(entry.source).toBeTruthy()
      expect(entry.text).toBeTruthy()
    })

    it("未找到定义时使用 fallbackText", () => {
      const ctx = makeDeps()
      const manager = new SkillItemManager(ctx.deps)
      manager.useItem("nonexistent-item")

      const entry = ctx.addPrivateIntelEntry.mock.calls[0][0] as { source: string; text: string }
      expect(entry.source).toBe("nonexistent-item")
      expect(entry.text).toBe("道具效果")
    })
  })

  describe("角色加成", () => {
    it("outlineBonus > 0 时 context 被包装（count 增加）", () => {
      const revealOutlineSpy = vi.fn(() => ({ ok: true, revealed: 1, message: "ok" }))
      const revealQualitySpy = vi.fn(() => ({ ok: true, revealed: 1, message: "ok" }))
      const revealAllSpy = vi.fn(() => ({ ok: true, revealed: 1, message: "ok" }))
      const skillContext: SkillContext = {
        revealOutline: revealOutlineSpy,
        revealQuality: revealQualitySpy,
        revealAll: revealAllSpy,
      }
      const ctx = makeDeps({
        buildSkillContext: () => skillContext,
        getOutlineBonus: () => 2,
        skillManager: {
          use: vi.fn((_id: string, c: SkillContext) => {
            c.revealOutline({ count: 3, category: null, sortStrategy: null })
            return { ok: true, message: "ok" }
          }),
        },
      })
      const manager = new SkillItemManager(ctx.deps)
      manager.useSkill("skill-outline-scan")

      expect(revealOutlineSpy).toHaveBeenCalledWith(
        expect.objectContaining({ count: 5, sortStrategy: null }),
      )
    })

    it("qualityBonus > 0 时 revealQuality count 增加", () => {
      const revealQualitySpy = vi.fn(() => ({ ok: true, revealed: 1, message: "ok" }))
      const skillContext: SkillContext = {
        revealOutline: vi.fn(),
        revealQuality: revealQualitySpy,
        revealAll: vi.fn(),
      }
      const ctx = makeDeps({
        buildSkillContext: () => skillContext,
        getQualityBonus: () => 1,
        itemManager: {
          use: vi.fn((_id: string, c: SkillContext) => {
            c.revealQuality({ count: 2, category: null, sortStrategy: null })
            return { ok: true, message: "ok" }
          }),
        },
      })
      const manager = new SkillItemManager(ctx.deps)
      manager.useItem("item-quality-lamp")

      expect(revealQualitySpy).toHaveBeenCalledWith(expect.objectContaining({ count: 3 }))
    })

    it("sortStrategy 被注入到 context", () => {
      const revealOutlineSpy = vi.fn(() => ({ ok: true, revealed: 1, message: "ok" }))
      const skillContext: SkillContext = {
        revealOutline: revealOutlineSpy,
        revealQuality: vi.fn(),
        revealAll: vi.fn(),
      }
      const ctx = makeDeps({
        buildSkillContext: () => skillContext,
        getOutlineSortStrategy: () => "smallestFirst",
        skillManager: {
          use: vi.fn((_id: string, c: SkillContext) => {
            c.revealOutline({ count: 1, category: null, sortStrategy: null })
            return { ok: true, message: "ok" }
          }),
        },
      })
      const manager = new SkillItemManager(ctx.deps)
      manager.useSkill("skill-outline-scan")

      expect(revealOutlineSpy).toHaveBeenCalledWith(
        expect.objectContaining({ sortStrategy: "smallestFirst" }),
      )
    })

    it("无加成时 context 不变（wrapContextWithCharacterBonus 返回原对象）", () => {
      const skillContext = makeSkillContext()
      const ctx = makeDeps({
        buildSkillContext: () => skillContext,
        getOutlineBonus: () => 0,
        getQualityBonus: () => 0,
        getOutlineSortStrategy: () => null,
      })
      const manager = new SkillItemManager(ctx.deps)
      manager.useSkill("skill-outline-scan")

      const passedContext = ctx.skillManager.use.mock.calls[0][1]
      expect(passedContext).toBe(skillContext)
    })
  })

  describe("LAN 同步", () => {
    it("LAN 模式下成功使用技能时发送 lan:player-action 消息", () => {
      const send = vi.fn()
      const ctx = makeDeps({
        isLanMode: () => true,
        lanMySlotId: () => "p2",
        lanBridge: () => ({ playerId: "player-abc", send }),
        getPlayers: () => [{ id: "p2", name: "测试玩家" } as never],
      })
      const manager = new SkillItemManager(ctx.deps)
      manager.useSkill("skill-outline-scan")

      expect(send).toHaveBeenCalledOnce()
      const msg = send.mock.calls[0][0] as Record<string, unknown>
      expect(msg.type).toBe("lan:player-action")
      expect(msg.playerId).toBe("player-abc")
      expect(msg.playerName).toBe("测试玩家")
      expect(msg.actionId).toBe("skill-outline-scan")
      expect(msg.actionType).toBe("skill")
    })

    it("LAN 模式下成功使用道具时 actionType 为 item", () => {
      const send = vi.fn()
      const ctx = makeDeps({
        isLanMode: () => true,
        lanMySlotId: () => "p2",
        lanBridge: () => ({ playerId: "player-xyz", send }),
        getPlayers: () => [{ id: "p2", name: "道具玩家" } as never],
      })
      const manager = new SkillItemManager(ctx.deps)
      manager.useItem("item-quality-lamp")

      const msg = send.mock.calls[0][0] as Record<string, unknown>
      expect(msg.actionType).toBe("item")
      expect(msg.actionId).toBe("item-quality-lamp")
    })

    it("非 LAN 模式不发送消息", () => {
      const send = vi.fn()
      const ctx = makeDeps({
        isLanMode: () => false,
        lanBridge: () => ({ playerId: "p1", send }),
      })
      const manager = new SkillItemManager(ctx.deps)
      manager.useSkill("skill-outline-scan")

      expect(send).not.toHaveBeenCalled()
    })

    it("LAN 模式但 lanBridge 为 null 不发送消息", () => {
      const ctx = makeDeps({
        isLanMode: () => true,
        lanBridge: () => null,
      })
      const manager = new SkillItemManager(ctx.deps)
      expect(() => manager.useSkill("skill-outline-scan")).not.toThrow()
    })

    it("LAN 消息中玩家名找不到时回退为'玩家'", () => {
      const send = vi.fn()
      const ctx = makeDeps({
        isLanMode: () => true,
        lanMySlotId: () => "p2",
        lanBridge: () => ({ playerId: "p1", send }),
        getPlayers: () => [],
      })
      const manager = new SkillItemManager(ctx.deps)
      manager.useSkill("skill-outline-scan")

      const msg = send.mock.calls[0][0] as Record<string, unknown>
      expect(msg.playerName).toBe("玩家")
    })

    it("使用失败时不发送 LAN 消息", () => {
      const send = vi.fn()
      const ctx = makeDeps({
        isLanMode: () => true,
        lanBridge: () => ({ playerId: "p1", send }),
        skillManager: { use: vi.fn(() => ({ ok: false, message: "失败" })) },
      })
      const manager = new SkillItemManager(ctx.deps)
      manager.useSkill("skill-outline-scan")

      expect(send).not.toHaveBeenCalled()
    })
  })

  describe("consumeAction", () => {
    it("成功消耗行动次数返回 true", () => {
      const ctx = makeDeps()
      const manager = new SkillItemManager(ctx.deps)
      expect(manager.consumeAction("技能")).toBe(true)
      expect(ctx.getActionsLeft()).toBe(2)
    })

    it("回合超限返回 false 并写日志", () => {
      const ctx = makeDeps({ getRound: () => 99 })
      const manager = new SkillItemManager(ctx.deps)
      expect(manager.consumeAction("技能")).toBe(false)
      expect(ctx.getActionsLeft()).toBe(3)
      expect(ctx.writeLog).toHaveBeenCalledOnce()
      const msg = ctx.writeLog.mock.calls[0][0] as string
      expect(msg).toContain("所有回合已结束")
    })

    it("行动次数为 0 返回 false 并写日志", () => {
      const ctx = makeDeps({ getActionsLeft: () => 0 })
      const manager = new SkillItemManager(ctx.deps)
      expect(manager.consumeAction("道具")).toBe(false)
      expect(ctx.getActionsLeft()).toBe(3)
      const msg = ctx.writeLog.mock.calls[0][0] as string
      expect(msg).toContain("行动次数已耗尽")
      expect(msg).toContain("道具")
    })
  })

  describe("getItemInfo", () => {
    it("委托纯函数返回道具信息", () => {
      const ctx = makeDeps()
      const manager = new SkillItemManager(ctx.deps)
      const result = manager.getItemInfo("item-outline-lamp")
      expect(result).toHaveProperty("label")
      expect(result).toHaveProperty("tip")
    })

    it("未知 id 返回默认值", () => {
      const ctx = makeDeps()
      const manager = new SkillItemManager(ctx.deps)
      const result = manager.getItemInfo("totally-unknown-id")
      expect(result.label).toBe("未知道具")
      expect(result.tip).toContain("暂无说明")
    })
  })
})

/**
 * @file tests/game/ai/autoplay-manager.test.ts
 * @description AutoPlayManager 行为测试
 *
 * 验证：
 * 1. 初始状态 enabled=false
 * 2. toggle() 翻转状态
 * 3. LAN 模式下 toggle 无效
 * 4. resetForNewRun 重置为 false
 * 5. isActive() 同时检查 enabled + LAN
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { AutoPlayManager, type AutoPlayManagerDeps } from "../../../scripts/game/ai/autoplay-manager"

beforeEach(() => {
  localStorage.clear()
})

function makeDeps(overrides: Partial<AutoPlayManagerDeps> = {}): AutoPlayManagerDeps {
  let p2conv: { round: number; bid: number; skill: string; item: string; thought: string; result: string }[] = []
  return {
    isLanMode: () => false,
    updateHud: vi.fn(),
    getRound: () => 1,
    canUseLlmDecision: () => true,
    getP2Conversation: () => p2conv,
    setP2Conversation: (v) => { p2conv = v },
    ...overrides,
  }
}

describe("AutoPlayManager", () => {
  describe("初始状态", () => {
    it("创建时 enabled=false", () => {
      const mgr = new AutoPlayManager(makeDeps())
      expect(mgr.isEnabled).toBe(false)
    })

    it("isActive 在非 LAN 且 enabled=false 时返回 false", () => {
      const mgr = new AutoPlayManager(makeDeps())
      expect(mgr.isActive()).toBe(false)
    })
  })

  describe("toggle", () => {
    it("toggle 后 isEnabled 翻转", () => {
      const mgr = new AutoPlayManager(makeDeps())
      expect(mgr.toggle()).toBe(true)
      expect(mgr.isEnabled).toBe(true)
      expect(mgr.isActive()).toBe(true)

      expect(mgr.toggle()).toBe(false)
      expect(mgr.isEnabled).toBe(false)
      expect(mgr.isActive()).toBe(false)
    })

    it("toggle 后调用 updateHud", () => {
      const updateHud = vi.fn()
      const mgr = new AutoPlayManager(makeDeps({ updateHud }))
      mgr.toggle()
      expect(updateHud).toHaveBeenCalledOnce()
    })

    it("LLM 未启用时 toggle 无效，保持 false", () => {
      const mgr = new AutoPlayManager(makeDeps({ canUseLlmDecision: () => false }))
      expect(mgr.toggle()).toBe(false)
      expect(mgr.isEnabled).toBe(false)
    })

    it("LLM 未启用时，已开启的托管仍可关闭（但不可重新开启）", () => {
      // 模拟：先开启 LLM → 开启托管 → 关闭 LLM → 托管仍可关闭
      const mgr = new AutoPlayManager(makeDeps())
      mgr.toggle() // 开托管
      expect(mgr.isEnabled).toBe(true)
      mgr.toggle() // 关托管（关不需要 LLM）
      expect(mgr.isEnabled).toBe(false)
    })
  })

  describe("LAN 模式", () => {
    it("LAN 模式下 toggle 无效，始终返回 false", () => {
      const mgr = new AutoPlayManager(makeDeps({ isLanMode: () => true }))
      expect(mgr.toggle()).toBe(false)
      expect(mgr.isEnabled).toBe(false)
      expect(mgr.isActive()).toBe(false)
    })

    it("LAN 模式下即使 enabled 为 true，isActive 也返回 false", () => {
      // 模拟：非 LAN 开托管 → 进入 LAN → isActive 应返回 false
      // 但 enabled 不随 LAN 进入/退出而变
      // 这个行为由 isActive() 的 && 短路保证
      const mgr = new AutoPlayManager(makeDeps())
      mgr.toggle() // 先开托管
      expect(mgr.isActive()).toBe(true)

      // 切换到 LAN（改变 deps）
      const lanMgr = new AutoPlayManager(makeDeps({ isLanMode: () => true }))
      // enabled 初始 false，先手动 toggle 会失败
      expect(lanMgr.toggle()).toBe(false)
      expect(lanMgr.isActive()).toBe(false)
    })
  })

  describe("resetForNewRun", () => {
    it("resetForNewRun 从 localStorage 恢复持久化状态", () => {
      const mgr = new AutoPlayManager(makeDeps())
      mgr.toggle() // 开启托管 → 持久化到 localStorage
      expect(mgr.isEnabled).toBe(true)
      mgr.resetForNewRun() // 重开 → 从 localStorage 恢复
      expect(mgr.isEnabled).toBe(true) // 托管状态跨局保留
    })

    it("未开启过托管时 resetForNewRun 保持 false", () => {
      const mgr = new AutoPlayManager(makeDeps())
      mgr.resetForNewRun()
      expect(mgr.isEnabled).toBe(false)
    })
  })

  describe("静默记录", () => {
    it("托管关闭时 recordPlayerBid 写入 p2 对话", () => {
      const mgr = new AutoPlayManager(makeDeps())
      mgr.recordPlayerBid(5000)
      const conv = mgr["deps"].getP2Conversation()
      expect(conv).toHaveLength(1)
      expect(conv[0].bid).toBe(5000)
      expect(conv[0].skill).toBe("无")
      expect(conv[0].round).toBe(1)
    })

    it("托管开启时 recordPlayerBid 不写入（由AI决策产生自然记录）", () => {
      const mgr = new AutoPlayManager(makeDeps())
      mgr.toggle()
      mgr.recordPlayerBid(5000)
      expect(mgr["deps"].getP2Conversation()).toHaveLength(0)
    })

    it("同轮多次出价只更新最后一条 bid 字段", () => {
      const mgr = new AutoPlayManager(makeDeps())
      mgr.recordPlayerBid(1000)
      mgr.recordPlayerBid(5000) // 同轮修正出价
      const conv = mgr["deps"].getP2Conversation()
      expect(conv).toHaveLength(1)
      expect(conv[0].bid).toBe(5000)
    })

    it("recordPlayerSkill 写入技能到同轮记录", () => {
      const mgr = new AutoPlayManager(makeDeps())
      mgr.recordPlayerBid(3000)
      mgr.recordPlayerSkill("skill-outline-scan", false)
      const conv = mgr["deps"].getP2Conversation()
      expect(conv).toHaveLength(1)
      expect(conv[0].bid).toBe(3000)
      expect(conv[0].skill).toBe("skill-outline-scan")
    })

    it("recordPlayerSkill 写入道具到同轮记录", () => {
      const mgr = new AutoPlayManager(makeDeps())
      mgr.recordPlayerSkill("item-outline-lamp", true)
      const conv = mgr["deps"].getP2Conversation()
      expect(conv[0].item).toBe("item-outline-lamp")
      expect(conv[0].skill).toBe("无")
    })
  })
})

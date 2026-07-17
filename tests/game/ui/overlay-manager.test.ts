import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { UiOverlayManager, type UiOverlayManagerDeps } from "../../../scripts/game/ui/overlay-manager"
import { SETTINGS_FIELDS } from "../../../scripts/game/core/constants"

// Mock 外部模块（避免动画/商店/LLM 副作用）
vi.mock("../../../scripts/game/animations", () => ({
  MobaoAnimations: {
    animateOverlayOpen: vi.fn((overlay: HTMLElement) => overlay.classList.remove("hidden")),
    animateOverlayClose: vi.fn((overlay: HTMLElement) => overlay.classList.add("hidden")),
  },
}))

vi.mock("../../../scripts/game/shop/index", () => ({
  MobaoShopPage: {
    init: vi.fn(),
    open: vi.fn(),
    close: vi.fn(),
  },
}))

vi.mock("../../../scripts/game/ai/decision", () => ({
  renderAiThoughtLog: vi.fn(),
}))

vi.mock("../../../scripts/llm/core/llm-manager", () => ({
  LlmManager: {
    listProviders: vi.fn(() => [{ id: "deepseek", name: "DeepSeek" }]),
    getActiveProviderId: vi.fn(() => "deepseek"),
    getProvider: vi.fn(),
    utils: { maskApiKey: vi.fn((key: string) => `****${key.slice(-4)}`) },
  },
}))

vi.mock("../../../scripts/llm/providers/deepseek-provider", () => ({
  DeepSeekProvider: {
    getSettings: vi.fn(() => ({
      apiKey: "test-key-1234",
      model: "test-model",
      endpoint: "https://test.example.com",
      maxTokens: 1000,
      timeoutMs: 30000,
      multiGameMemoryEnabled: false,
      enabled: true,
    })),
    applySettings: vi.fn(),
  },
}))

vi.mock("../../../scripts/game/data/character-system", () => ({
  getActiveCharacter: vi.fn(() => ({
    id: "appraiser",
    name: "鉴定师",
    desc: "精准识宝",
    skillName: "玉脉鉴质",
    skillDesc: "揭示品质",
    passive: { type: "qualityBonus", value: 10, label: "品质加成+10%" },
  })),
}))

vi.mock("../../../scripts/game/data/characters", () => ({
  getCharacterById: vi.fn((id: string) => ({
    id,
    name: `角色${id}`,
    desc: "角色描述",
    skillName: "技能名",
    skillDesc: "技能效果",
    passive: { type: "profitBonus", value: 5, label: "盈利加成+5%" },
  })),
}))

vi.mock("../../../scripts/game/data/items", () => ({
  ITEM_DEFS: [{ id: "item-lamp", name: "探灯", description: "揭示轮廓", initialCount: 3, maxPerRound: 1 }],
}))

vi.mock("../../../scripts/game/data/skills", () => ({
  SKILL_DEFS: [{ id: "skill-appraise", name: "鉴定", description: "揭示品质", maxPerRound: 2 }],
}))

// 抑制 console 日志
vi.spyOn(console, "log").mockImplementation(() => {})
vi.spyOn(console, "error").mockImplementation(() => {})

/** 创建 DOM 元素 */
function makeEl(id: string, tag: string = "div"): HTMLElement {
  const el = document.createElement(tag)
  el.id = id
  el.classList.add("hidden")
  return el
}

/** 创建默认依赖 */
function makeDeps(overrides: Partial<UiOverlayManagerDeps> = {}): UiOverlayManagerDeps {
  const dom: Record<string, HTMLElement | null> = {
    settleOverlay: makeEl("settleOverlay"),
    settleCard: makeEl("settleCard"),
    aiLogicOverlay: makeEl("aiLogicOverlay"),
    aiLogicPanel: makeEl("aiLogicPanel"),
    aiThoughtContent: makeEl("aiThoughtContent"),
    infoPopupOverlay: makeEl("infoPopupOverlay"),
    infoPopupTitle: makeEl("infoPopupTitle"),
    infoPopupContent: makeEl("infoPopupContent"),
    gameConfirmMsg: makeEl("gameConfirmMsg"),
    gameConfirmOverlay: makeEl("gameConfirmOverlay"),
    settingsOverlay: makeEl("settingsOverlay"),
    settingsPanel: makeEl("settingsPanel"),
    settingsStatusText: makeEl("settingsStatusText"),
    bidInput: (() => {
      const el = document.createElement("input")
      el.id = "bidInput"
      el.value = "5000"
      return el
    })(),
    aiMemoryOverlay: makeEl("aiMemoryOverlay"),
    aiMemoryContent: makeEl("aiMemoryContent"),
    settleReflectionStatus: makeEl("settleReflectionStatus"),
    hud: makeEl("hud"),
  }

  // infoPopupOverlay 内部需要 .info-popup-box 子元素
  dom.infoPopupOverlay!.innerHTML = '<div class="info-popup-box"></div>'

  const defaults: UiOverlayManagerDeps = {
    dom,
    players: [
      { id: "human", isHuman: true, name: "玩家" },
      { id: "ai1", isHuman: false, name: "AI1" },
    ],
    getIsLanMode: () => false,
    getLanIsHost: () => false,
    getLanBridge: () => ({ send: vi.fn() }),
    getSettled: () => false,
    getRound: () => 3,
    getRoundTimeLeft: () => 60,
    getActionsLeft: () => 5,
    getRunLogHistory: () => [],
    getAiCharacterAssignments: () => ({
      ai1: { characterId: "appraiser", characterName: "鉴定师", skillName: "鉴定", passive: { label: "盈利加成+5%" } },
    }),
    getAiReflectionState: () => "pending",
    getAiReflectionStateDetail: () => "",
    getAiReflectionTotal: () => 3,
    getAiReflectionCompleted: () => 1,
    getTweens: () => ({ add: vi.fn() }),
    setRound: vi.fn(),
    setRoundTimeLeft: vi.fn(),
    setActionsLeft: vi.fn(),
    renderAiLogicPanel: vi.fn(),
    updateLobbyMoneyDisplay: vi.fn(),
    updateHud: vi.fn(),
    closeBidKeypad: vi.fn(),
    closeItemDrawer: vi.fn(),
    fillLlmSettingsForm: vi.fn(),
    getLlmSettings: () => ({ model: "gpt-4", endpoint: "https://api.test.com", apiKey: "key-1234" }),
    readLlmSettingsForm: () => ({
      apiKey: "key-1234",
      endpoint: "https://api.test.com",
      model: "gpt-4",
      maxTokens: 2000,
      timeoutMs: 60000,
      enabled: true,
      multiGameMemoryEnabled: false,
      reflectionEnabled: false,
      thinkingEnabled: false,
      independentModelEnabled: false,
      independentReflectionEnabled: false,
      contextLength: 5,
      autoSummarizeEnabled: true,
      reflectionScope: "current",
      thinkingParams: "",
    }),
    setLlmSettingsStatus: vi.fn(),
    getLlmProvider: () => ({ id: "deepseek", name: "DeepSeek", saveSettings: vi.fn(), applySettings: vi.fn() }),
    writeLog: vi.fn(),
    pushRunStartContextToAi: vi.fn(),
    toggleRoundPause: vi.fn(),
    ensureAiCrossGameMemory: vi.fn((_playerId: string) => ({
      stats: { totalGames: 5, warehouseValueMax: 8000, warehouseValueMin: 2000, warehouseValueAvg: 5000, winRate: 0.6, avgProfit: 1200, totalCellsMax: 12, totalCellsMin: 4, totalCellsAvg: 8, totalItemsMax: 6, totalItemsMin: 2, totalItemsAvg: 4, legendaryMax: 1, legendaryMin: 0, legendaryAvg: 0.5, rareMax: 2, rareMin: 0, rareAvg: 1 },
      praises: ["精准出价"],
      strategies: ["前期保守"],
      lessons: ["避免盲目竞价"],
    })),
    shouldShowReflectionUI: () => true,
    shouldGenerateSummary: () => false,
    isAiMultiGameMemoryEnabled: () => false,
    proceedToNewRun: vi.fn(),
    proceedToBack: vi.fn(),
    setGameConfirmCallback: vi.fn(),
    setGameCancelCallback: vi.fn(),
  }

  return { ...defaults, ...overrides } as UiOverlayManagerDeps
}

/** 创建 Manager 和依赖 */
function makeManager(overrides: Partial<UiOverlayManagerDeps> = {}) {
  const deps = makeDeps(overrides)
  const manager = new UiOverlayManager(deps)
  return { manager, deps }
}

/** 在 document.body 上创建/获取指定 ID 的元素 */
function ensureDocEl(id: string, tag: string = "div"): HTMLElement {
  let el = document.getElementById(id)
  if (!el) {
    el = document.createElement(tag)
    el.id = id
    document.body.appendChild(el)
  }
  return el
}

describe("UiOverlayManager", () => {
  beforeEach(() => {
    // 清理 document.body
    document.body.innerHTML = ""
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ==================== 弹窗开闭 ====================

  describe("弹窗开闭", () => {
    it("showInfoPopup 设置标题和内容并显示覆盖层", () => {
      const { manager, deps } = makeManager()
      const sourceEl = document.createElement("div")
      sourceEl.innerHTML = "<p>测试内容</p>"
      manager.showInfoPopup("测试标题", sourceEl)
      expect(deps.dom.infoPopupTitle!.textContent).toBe("测试标题")
      expect(deps.dom.infoPopupContent!.innerHTML).toContain("测试内容")
      expect(deps.dom.infoPopupOverlay!.classList.contains("hidden")).toBe(false)
    })

    it("showInfoPopup 无来源元素时清空内容", () => {
      const { manager, deps } = makeManager()
      manager.showInfoPopup("标题", null)
      expect(deps.dom.infoPopupContent!.innerHTML).toBe("")
    })

    it("hideInfoPopup 隐藏信息弹窗", () => {
      const { manager, deps } = makeManager()
      deps.dom.infoPopupOverlay!.classList.remove("hidden")
      manager.hideInfoPopup()
      expect(deps.dom.infoPopupOverlay!.classList.contains("hidden")).toBe(true)
    })

    it("showGameConfirm 设置消息并显示覆盖层", () => {
      const { manager, deps } = makeManager()
      const onConfirm = vi.fn()
      manager.showGameConfirm("确认操作？", onConfirm)
      expect(deps.dom.gameConfirmMsg!.textContent).toBe("确认操作？")
      expect(deps.dom.gameConfirmOverlay!.classList.contains("hidden")).toBe(false)
    })

    it("hideGameConfirm 隐藏覆盖层", () => {
      const { manager, deps } = makeManager()
      manager.showGameConfirm("msg", vi.fn())
      expect(deps.dom.gameConfirmOverlay!.classList.contains("hidden")).toBe(false)
      manager.hideGameConfirm()
      expect(deps.dom.gameConfirmOverlay!.classList.contains("hidden")).toBe(true)
    })

    it("hideSettleOverlay 隐藏结算覆盖层", () => {
      const { manager, deps } = makeManager()
      deps.dom.settleOverlay!.classList.remove("hidden")
      manager.hideSettleOverlay()
      expect(deps.dom.settleOverlay!.classList.contains("hidden")).toBe(true)
    })

    it("hideSettleOverlay 覆盖层不存在时不报错", () => {
      const { manager, deps } = makeManager()
      deps.dom.settleOverlay = null
      expect(() => manager.hideSettleOverlay()).not.toThrow()
    })

    it("showSettleOverlay 设置卡片内容并显示覆盖层", () => {
      const { manager, deps } = makeManager()
      manager.showSettleOverlay("<p>结算结果</p>")
      expect(deps.dom.settleCard!.innerHTML).toContain("结算结果")
      expect(deps.dom.settleOverlay!.classList.contains("hidden")).toBe(false)
    })

    it("openAiLogicPanel 调用 renderAiLogicPanel 并显示覆盖层", () => {
      const { manager, deps } = makeManager()
      manager.openAiLogicPanel()
      expect(deps.renderAiLogicPanel).toHaveBeenCalledOnce()
      expect(deps.dom.aiLogicOverlay!.classList.contains("hidden")).toBe(false)
    })

    it("closeAiLogicPanel 隐藏 AI 逻辑面板", () => {
      const { manager, deps } = makeManager()
      deps.dom.aiLogicOverlay!.classList.remove("hidden")
      manager.closeAiLogicPanel()
      expect(deps.dom.aiLogicOverlay!.classList.contains("hidden")).toBe(true)
    })

    it("openShopOverlay 调用商店 init 和 open", async () => {
      const { manager } = makeManager()
      const shopModule = await import("../../../scripts/game/shop/index")
      manager.openShopOverlay()
      expect(shopModule.MobaoShopPage.init).toHaveBeenCalled()
      expect(shopModule.MobaoShopPage.open).toHaveBeenCalled()
    })

    it("closeShopOverlay 调用商店 close 并更新 HUD", async () => {
      const { manager, deps } = makeManager()
      ensureDocEl("gameArea")
      const shopModule = await import("../../../scripts/game/shop/index")
      manager.closeShopOverlay()
      expect(shopModule.MobaoShopPage.close).toHaveBeenCalled()
      expect(deps.updateLobbyMoneyDisplay).toHaveBeenCalled()
    })
  })

  // ==================== 设置面板 ====================

  describe("设置面板", () => {
    it("isSettingsOverlayOpen 返回覆盖层状态", () => {
      const { manager, deps } = makeManager()
      expect(manager.isSettingsOverlayOpen()).toBe(false)
      deps.dom.settingsOverlay!.classList.remove("hidden")
      expect(manager.isSettingsOverlayOpen()).toBe(true)
    })

    it("settingsInputId 返回正确格式", () => {
      const { manager } = makeManager()
      expect(manager.settingsInputId("roundSeconds")).toBe("setting-roundSeconds")
      expect(manager.settingsInputId("musicVolume")).toBe("setting-musicVolume")
    })

    it("fillSettingsForm 填充输入框值", () => {
      const { manager } = makeManager()
      SETTINGS_FIELDS.forEach((field: string) => {
        const input = document.createElement("input")
        input.id = `setting-${field}`
        document.body.appendChild(input)
      })
      manager.fillSettingsForm({ roundSeconds: 90, musicVolume: 50 })
      const roundSecondsInput = document.getElementById("setting-roundSeconds") as HTMLInputElement
      expect(roundSecondsInput.value).toBe("90")
    })

    it("readSettingsForm 读取输入框值", () => {
      const { manager } = makeManager()
      SETTINGS_FIELDS.forEach((field: string) => {
        const input = document.createElement("input")
        input.id = `setting-${field}`
        input.value = "60"
        document.body.appendChild(input)
      })
      const result = manager.readSettingsForm()
      expect(result.roundSeconds).toBe(60)
    })

    it("setSettingsStatus 设置状态文本", () => {
      const { manager, deps } = makeManager()
      manager.setSettingsStatus("已保存", true)
      expect(deps.dom.settingsStatusText!.textContent).toBe("已保存")
      expect(deps.dom.settingsStatusText!.classList.contains("settings-note-saved")).toBe(true)
    })

    it("setSettingsStatus saved=false 移除保存标记", () => {
      const { manager, deps } = makeManager()
      deps.dom.settingsStatusText!.classList.add("settings-note-saved")
      manager.setSettingsStatus("未保存", false)
      expect(deps.dom.settingsStatusText!.classList.contains("settings-note-saved")).toBe(false)
    })

    it("openSettingsOverlay 调用 closeBidKeypad 和 closeItemDrawer", () => {
      const { manager, deps } = makeManager()
      manager.openSettingsOverlay()
      expect(deps.closeBidKeypad).toHaveBeenCalledOnce()
      expect(deps.closeItemDrawer).toHaveBeenCalledOnce()
    })

    it("openSettingsOverlay 调用 fillLlmSettingsForm", () => {
      const { manager, deps } = makeManager()
      manager.openSettingsOverlay()
      expect(deps.fillLlmSettingsForm).toHaveBeenCalled()
    })

    it("openSettingsOverlay 显示设置覆盖层", () => {
      const { manager, deps } = makeManager()
      manager.openSettingsOverlay()
      expect(deps.dom.settingsOverlay!.classList.contains("hidden")).toBe(false)
    })

    it("openSettingsOverlay 联机模式禁用 LLM 设置组", () => {
      const { manager } = makeManager({ getIsLanMode: () => true })
      const llmGroup = document.createElement("div")
      llmGroup.id = "llmSettingsGroup"
      const input = document.createElement("input")
      llmGroup.appendChild(input)
      document.body.appendChild(llmGroup)
      manager.openSettingsOverlay()
      expect(llmGroup.classList.contains("settings-group-disabled")).toBe(true)
      expect((input as HTMLInputElement).disabled).toBe(true)
    })

    it("closeSettingsOverlay forceClose 直接关闭", () => {
      const { manager, deps } = makeManager()
      manager.openSettingsOverlay()
      manager.closeSettingsOverlay(false, true)
      expect(deps.dom.settingsOverlay!.classList.contains("hidden")).toBe(true)
    })

    it("saveSettingsFromOverlay 保存设置并更新 HUD", () => {
      const { manager, deps } = makeManager()
      // 提供设置输入框
      SETTINGS_FIELDS.forEach((field: string) => {
        const input = document.createElement("input")
        input.id = `setting-${field}`
        input.value = "60"
        document.body.appendChild(input)
      })
      manager.saveSettingsFromOverlay()
      expect(deps.updateHud).toHaveBeenCalled()
      expect(deps.setLlmSettingsStatus).toHaveBeenCalled()
      expect(deps.writeLog).toHaveBeenCalled()
    })
  })

  // ==================== 收藏图鉴（详情弹窗） ====================

  describe("收藏图鉴", () => {
    beforeEach(() => {
      // 创建 playerInfoPopover 元素
      ensureDocEl("playerInfoPopover")
      ensureDocEl("playerInfoPopoverTitle")
      ensureDocEl("playerInfoPopoverContent")
    })

    it("showItemDetailPopup 显示道具详情", () => {
      const { manager } = makeManager()
      manager.showItemDetailPopup("item-lamp", null, 100, 200)
      const titleEl = document.getElementById("playerInfoPopoverTitle")!
      expect(titleEl.textContent).toBe("探灯")
      const contentEl = document.getElementById("playerInfoPopoverContent")!
      expect(contentEl.innerHTML).toContain("探灯")
      expect(contentEl.innerHTML).toContain("揭示轮廓")
    })

    it("showItemDetailPopup 显示技能详情", () => {
      const { manager } = makeManager()
      manager.showItemDetailPopup("skill-appraise", null, 100, 200)
      const titleEl = document.getElementById("playerInfoPopoverTitle")!
      expect(titleEl.textContent).toBe("鉴定")
      const contentEl = document.getElementById("playerInfoPopoverContent")!
      expect(contentEl.innerHTML).toContain("鉴定")
      expect(contentEl.innerHTML).toContain("揭示品质")
    })

    it("showItemDetailPopup 自定义名称优先", () => {
      const { manager } = makeManager()
      manager.showItemDetailPopup("item-lamp", "自定义名称", 100, 200)
      const titleEl = document.getElementById("playerInfoPopoverTitle")!
      expect(titleEl.textContent).toBe("自定义名称")
    })

    it("showItemDetailPopup 未找到道具时不显示", () => {
      const { manager } = makeManager()
      manager.showItemDetailPopup("not-exist", null, 100, 200)
      const titleEl = document.getElementById("playerInfoPopoverTitle")!
      expect(titleEl.textContent).toBe("")
    })

    it("hideItemDetailPopup 隐藏气泡", () => {
      const { manager } = makeManager()
      manager.showItemDetailPopup("item-lamp", null, 100, 200)
      const popover = document.getElementById("playerInfoPopover")!
      expect(popover.classList.contains("hidden")).toBe(false)
      manager.hideItemDetailPopup()
      expect(popover.classList.contains("hidden")).toBe(true)
    })

    it("showCharacterInfoPopup 显示人类玩家角色信息", () => {
      const { manager } = makeManager()
      manager.showCharacterInfoPopup("human", 100, 200)
      const titleEl = document.getElementById("playerInfoPopoverTitle")!
      expect(titleEl.textContent).toBe("鉴定师")
      const contentEl = document.getElementById("playerInfoPopoverContent")!
      expect(contentEl.innerHTML).toContain("鉴定师")
      expect(contentEl.innerHTML).toContain("玉脉鉴质")
    })

    it("showCharacterInfoPopup 显示 AI 玩家角色信息", () => {
      const { manager } = makeManager()
      manager.showCharacterInfoPopup("ai1", 100, 200)
      const titleEl = document.getElementById("playerInfoPopoverTitle")!
      expect(titleEl.textContent).toBe("鉴定师")
      const contentEl = document.getElementById("playerInfoPopoverContent")!
      expect(contentEl.innerHTML).toContain("鉴定师")
      expect(contentEl.innerHTML).toContain("技能")
    })

    it("showCharacterInfoPopup 玩家不存在时不报错", () => {
      const { manager } = makeManager()
      expect(() => manager.showCharacterInfoPopup("not-exist", 100, 200)).not.toThrow()
    })

    it("hideCharacterInfoPopup 隐藏气泡", () => {
      const { manager } = makeManager()
      manager.showCharacterInfoPopup("human", 100, 200)
      manager.hideCharacterInfoPopup()
      const popover = document.getElementById("playerInfoPopover")!
      expect(popover.classList.contains("hidden")).toBe(true)
    })
  })

  // ==================== AI 配置 ====================

  describe("AI配置", () => {
    beforeEach(() => {
      localStorage.clear()
    })

    it("loadAiModelConfigs 无存储时返回默认值", () => {
      const { manager } = makeManager()
      const result = manager.loadAiModelConfigs()
      expect(result).toEqual({ ai1: null, ai2: null, ai3: null })
    })

    it("saveAiModelConfigs 保存到 localStorage", () => {
      const { manager } = makeManager()
      const configs = { ai1: "deepseek", ai2: null, ai3: "openai" }
      manager.saveAiModelConfigs(configs)
      const stored = localStorage.getItem("mobao_ai_model_configs_v1")
      expect(stored).toBeTruthy()
      expect(JSON.parse(stored!)).toEqual(configs)
    })

    it("loadAiModelConfigs 读取已保存的配置", () => {
      const { manager } = makeManager()
      manager.saveAiModelConfigs({ ai1: "deepseek", ai2: null, ai3: null })
      const result = manager.loadAiModelConfigs()
      expect(result.ai1).toBe("deepseek")
    })

    it("openAiModelConfigOverlay 显示配置面板", () => {
      const { manager } = makeManager()
      const overlay = ensureDocEl("aiModelConfigOverlay")
      const content = ensureDocEl("aiModelConfigContent")
      manager.openAiModelConfigOverlay()
      expect(overlay.classList.contains("hidden")).toBe(false)
      expect(content.innerHTML).toContain("AI1")
    })

    it("closeAiModelConfigOverlay 隐藏配置面板", () => {
      const { manager } = makeManager()
      const overlay = ensureDocEl("aiModelConfigOverlay")
      overlay.classList.remove("hidden")
      manager.closeAiModelConfigOverlay()
      expect(overlay.classList.contains("hidden")).toBe(true)
    })

    it("renderAiModelConfigContent 渲染当前默认配置", () => {
      const { manager, deps } = makeManager()
      const content = ensureDocEl("aiModelConfigContent")
      deps.getLlmSettings = () => ({ model: "gpt-4", endpoint: "https://api.test.com/v1", apiKey: "key-123" })
      manager.renderAiModelConfigContent()
      expect(content.innerHTML).toContain("gpt-4")
      expect(content.innerHTML).toContain("已配置")
    })

    it("renderAiModelConfigContent 无 API Key 时显示未配置", () => {
      const { manager, deps } = makeManager()
      const content = ensureDocEl("aiModelConfigContent")
      deps.getLlmSettings = () => ({ model: "gpt-4", endpoint: "https://api.test.com", apiKey: "" })
      manager.renderAiModelConfigContent()
      expect(content.innerHTML).toContain("未配置")
    })

    it("saveAiModelConfigFromForm 保存并关闭", () => {
      const { manager } = makeManager()
      ensureDocEl("aiModelConfigOverlay")
      ;["ai1", "ai2", "ai3"].forEach((aiId) => {
        const select = document.createElement("select")
        select.id = `aiModelProvider-${aiId}`
        const opt = document.createElement("option")
        opt.value = aiId === "ai1" ? "deepseek" : ""
        select.appendChild(opt)
        select.value = opt.value
        document.body.appendChild(select)
      })
      manager.saveAiModelConfigFromForm()
      const stored = localStorage.getItem("mobao_ai_model_configs_v1")
      expect(stored).toBeTruthy()
    })

    it("getAiModelConfig 无 providerId 返回 null", () => {
      const { manager } = makeManager()
      localStorage.setItem("mobao_ai_model_configs_v1", JSON.stringify({ ai1: null, ai2: null, ai3: null }))
      const result = manager.getAiModelConfig(0)
      expect(result).toBeNull()
    })

    it("getAiModelConfig 有 provider 时返回配置", async () => {
      const { manager } = makeManager()
      localStorage.setItem("mobao_ai_model_configs_v1", JSON.stringify({ ai1: "deepseek", ai2: null, ai3: null }))
      const llmManagerModule = await import("../../../scripts/llm/core/llm-manager")
      vi.mocked(llmManagerModule.LlmManager.getProvider).mockReturnValue({
        id: "deepseek",
        name: "DeepSeek",
        loadSettings: () => ({
          apiKey: "key-123",
          endpoint: "https://api.deepseek.com",
          model: "deepseek-chat",
          maxTokens: 4096,
          timeoutMs: 30000,
          thinkingEnabled: false,
        }),
      })
      const result = manager.getAiModelConfig(0)
      expect(result).not.toBeNull()
      expect(result!.apiKey).toBe("key-123")
      expect(result!.model).toBe("deepseek-chat")
    })
  })

  // ==================== LAN 弹窗 ====================

  describe("LAN弹窗", () => {
    it("showLanRestartVoteDialog 创建投票对话框", () => {
      const { manager } = makeManager()
      manager.showLanRestartVoteDialog("主机玩家")
      const dialog = document.getElementById("lanRestartVoteDialog")
      expect(dialog).not.toBeNull()
      expect(dialog!.innerHTML).toContain("主机玩家")
      expect(dialog!.innerHTML).toContain("同意")
      expect(dialog!.innerHTML).toContain("拒绝")
    })

    it("点击同意按钮发送 restart-accept 并移除对话框", () => {
      const sendFn = vi.fn()
      const { manager } = makeManager({ getLanBridge: () => ({ send: sendFn }) })
      manager.showLanRestartVoteDialog("主机")
      const acceptBtn = document.getElementById("lanRestartAccept")!
      acceptBtn.click()
      expect(sendFn).toHaveBeenCalledWith({ type: "game:restart-accept" })
      expect(document.getElementById("lanRestartVoteDialog")).toBeNull()
    })

    it("点击拒绝按钮发送 restart-decline", () => {
      const sendFn = vi.fn()
      const { manager } = makeManager({ getLanBridge: () => ({ send: sendFn }) })
      manager.showLanRestartVoteDialog("主机")
      const declineBtn = document.getElementById("lanRestartDecline")!
      declineBtn.click()
      expect(sendFn).toHaveBeenCalledWith({ type: "game:restart-decline" })
    })

    it("removeLanRestartDialog 移除所有重开对话框", () => {
      const { manager } = makeManager()
      manager.showLanRestartVoteDialog("主机")
      manager.showLanRestartWaitingDialog()
      manager.removeLanRestartDialog()
      expect(document.getElementById("lanRestartVoteDialog")).toBeNull()
      expect(document.getElementById("lanRestartWaitingDialog")).toBeNull()
    })

    it("showLanRestartWaitingDialog 创建等待对话框", () => {
      const { manager } = makeManager()
      manager.showLanRestartWaitingDialog()
      const dialog = document.getElementById("lanRestartWaitingDialog")
      expect(dialog).not.toBeNull()
      expect(dialog!.innerHTML).toContain("已发送重开请求")
    })

    it("showLanRestartWaitingDialog 调用 writeLog", () => {
      const { manager, deps } = makeManager()
      manager.showLanRestartWaitingDialog()
      expect(deps.writeLog).toHaveBeenCalledWith(expect.stringContaining("发送重开请求"))
    })

    it("showLanRestartDeclinedDialog 创建被拒绝对话框", () => {
      const { manager } = makeManager()
      manager.showLanRestartDeclinedDialog("玩家A")
      const dialog = document.getElementById("lanRestartDeclinedDialog")
      expect(dialog).not.toBeNull()
      expect(dialog!.innerHTML).toContain("被拒绝")
      expect(dialog!.innerHTML).toContain("玩家A")
    })

    it("showLanPauseOverlay 非联机模式不创建", () => {
      const { manager } = makeManager({ getIsLanMode: () => false })
      manager.showLanPauseOverlay()
      expect(document.getElementById("lanPauseOverlay")).toBeNull()
    })

    it("showLanPauseOverlay 已结算时不创建", () => {
      const { manager } = makeManager({ getIsLanMode: () => true, getSettled: () => true })
      manager.showLanPauseOverlay()
      expect(document.getElementById("lanPauseOverlay")).toBeNull()
    })

    it("showLanPauseOverlay 主机显示结束暂停按钮", () => {
      const { manager } = makeManager({ getIsLanMode: () => true, getLanIsHost: () => true })
      manager.showLanPauseOverlay()
      const overlay = document.getElementById("lanPauseOverlay")
      expect(overlay).not.toBeNull()
      expect(overlay!.innerHTML).toContain("结束暂停")
      expect(overlay!.innerHTML).toContain("点击下方按钮继续游戏")
    })

    it("showLanPauseOverlay 非主机显示等待提示", () => {
      const { manager } = makeManager({ getIsLanMode: () => true, getLanIsHost: () => false })
      manager.showLanPauseOverlay()
      const overlay = document.getElementById("lanPauseOverlay")
      expect(overlay).not.toBeNull()
      expect(overlay!.innerHTML).toContain("等待主机继续游戏")
      expect(overlay!.innerHTML).not.toContain("结束暂停")
    })

    it("showLanPauseOverlay 已存在时不重复创建", () => {
      const { manager } = makeManager({ getIsLanMode: () => true, getLanIsHost: () => true })
      manager.showLanPauseOverlay()
      manager.showLanPauseOverlay()
      expect(document.querySelectorAll("#lanPauseOverlay")).toHaveLength(1)
    })

    it("hideLanPauseOverlay 移除暂停覆盖层", () => {
      const { manager } = makeManager({ getIsLanMode: () => true, getLanIsHost: () => true })
      manager.showLanPauseOverlay()
      manager.hideLanPauseOverlay()
      expect(document.getElementById("lanPauseOverlay")).toBeNull()
    })
  })

  // ==================== AI 记忆面板 ====================

  describe("AI记忆面板", () => {
    it("openAiMemoryPanel 无 AI 玩家时显示提示", () => {
      const { manager, deps } = makeManager({ players: [{ id: "human", isHuman: true, name: "玩家" }] })
      manager.openAiMemoryPanel()
      expect(deps.dom.aiMemoryContent!.innerHTML).toContain("暂无AI玩家")
      expect(deps.dom.aiMemoryOverlay!.classList.contains("hidden")).toBe(false)
    })

    it("openAiMemoryPanel 有 AI 玩家时渲染记忆内容", () => {
      const { manager, deps } = makeManager()
      manager.openAiMemoryPanel()
      expect(deps.dom.aiMemoryContent!.innerHTML).toContain("AI1")
      expect(deps.dom.aiMemoryContent!.innerHTML).toContain("历史统计")
      expect(deps.dom.aiMemoryContent!.innerHTML).toContain("成功经验")
    })

    it("openAiMemoryPanel 显示仓库价值范围", () => {
      const { manager, deps } = makeManager()
      manager.openAiMemoryPanel()
      expect(deps.dom.aiMemoryContent!.innerHTML).toContain("2000~8000")
    })

    it("closeAiMemoryPanel 隐藏面板", () => {
      const { manager, deps } = makeManager()
      deps.dom.aiMemoryOverlay!.classList.remove("hidden")
      manager.closeAiMemoryPanel()
      expect(deps.dom.aiMemoryOverlay!.classList.contains("hidden")).toBe(true)
    })

    it("openAiMemoryPanel 无记忆数据时显示提示", () => {
      const { manager, deps } = makeManager({
        ensureAiCrossGameMemory: vi.fn(() => ({
          stats: { totalGames: 0, warehouseValueMax: 0, warehouseValueMin: 0, warehouseValueAvg: 0, winRate: 0, avgProfit: 0, totalCellsMax: 0, totalCellsMin: 0, totalCellsAvg: 0, totalItemsMax: 0, totalItemsMin: 0, totalItemsAvg: 0, legendaryMax: 0, legendaryMin: 0, legendaryAvg: 0, rareMax: 0, rareMin: 0, rareAvg: 0 },
          praises: [],
          strategies: [],
          lessons: [],
        })),
      })
      manager.openAiMemoryPanel()
      expect(deps.dom.aiMemoryContent!.innerHTML).toContain("暂无跨局记忆")
    })
  })

  // ==================== AI 反思弹窗 ====================

  describe("AI反思弹窗", () => {
    it("updateReflectionStatusUI pending 状态显示反思中", () => {
      const { manager, deps } = makeManager({
        getAiReflectionState: () => "pending",
        getAiReflectionTotal: () => 3,
        getAiReflectionCompleted: () => 1,
      })
      manager.updateReflectionStatusUI()
      const el = deps.dom.settleReflectionStatus!
      expect(el.classList.contains("is-pending")).toBe(true)
      expect(el.textContent).toContain("反思中")
      expect(el.textContent).toContain("1/3")
    })

    it("updateReflectionStatusUI done 状态显示完成", () => {
      const { manager, deps } = makeManager({ getAiReflectionState: () => "done" })
      manager.updateReflectionStatusUI()
      const el = deps.dom.settleReflectionStatus!
      expect(el.classList.contains("is-done")).toBe(true)
      expect(el.textContent).toContain("完成")
    })

    it("updateReflectionStatusUI timeout 状态显示超时", () => {
      const { manager, deps } = makeManager({
        getAiReflectionState: () => "timeout",
        getAiReflectionStateDetail: () => "网络超时",
      })
      manager.updateReflectionStatusUI()
      const el = deps.dom.settleReflectionStatus!
      expect(el.classList.contains("is-timeout")).toBe(true)
      expect(el.textContent).toContain("超时")
      expect(el.textContent).toContain("网络超时")
    })

    it("updateReflectionStatusUI error 状态显示失败", () => {
      const { manager, deps } = makeManager({
        getAiReflectionState: () => "error",
        getAiReflectionStateDetail: () => "API错误",
      })
      manager.updateReflectionStatusUI()
      const el = deps.dom.settleReflectionStatus!
      expect(el.classList.contains("is-error")).toBe(true)
      expect(el.textContent).toContain("失败")
      expect(el.textContent).toContain("API错误")
    })

    it("updateReflectionStatusUI 不应显示时隐藏", () => {
      const { manager, deps } = makeManager({ shouldShowReflectionUI: () => false })
      manager.updateReflectionStatusUI()
      const el = deps.dom.settleReflectionStatus!
      expect(el.classList.contains("hidden")).toBe(true)
    })

    it("showReflectionPendingDialog 创建对话框", () => {
      const { manager } = makeManager()
      manager.showReflectionPendingDialog()
      const dialog = document.getElementById("reflectionPendingDialog")
      expect(dialog).not.toBeNull()
      expect(dialog!.innerHTML).toContain("反思尚未完成")
      expect(dialog!.innerHTML).toContain("等待完成")
      expect(dialog!.innerHTML).toContain("继续游戏")
    })

    it("showReflectionPendingDialog 点击继续游戏调用 proceedToNewRun", () => {
      const { manager, deps } = makeManager()
      manager.showReflectionPendingDialog()
      const skipBtn = document.getElementById("reflectionDialogSkip")!
      skipBtn.click()
      expect(deps.proceedToNewRun).toHaveBeenCalledOnce()
    })

    it("showReflectionPendingDialog 点击等待完成移除对话框", () => {
      const { manager } = makeManager()
      manager.showReflectionPendingDialog()
      const waitBtn = document.getElementById("reflectionDialogWait")!
      waitBtn.click()
      expect(document.getElementById("reflectionPendingDialog")).toBeNull()
    })

    it("showReflectionPendingDialogForBack 创建直接离开按钮", () => {
      const { manager } = makeManager()
      manager.showReflectionPendingDialogForBack()
      const dialog = document.getElementById("reflectionPendingDialog")
      expect(dialog).not.toBeNull()
      expect(dialog!.innerHTML).toContain("直接离开")
    })

    it("showReflectionPendingDialogForBack 点击直接离开调用 proceedToBack", () => {
      const { manager, deps } = makeManager()
      manager.showReflectionPendingDialogForBack()
      const skipBtn = document.getElementById("reflectionDialogSkip")!
      skipBtn.click()
      expect(deps.proceedToBack).toHaveBeenCalledOnce()
    })

    it("removeReflectionPendingDialog 移除对话框", () => {
      const { manager } = makeManager()
      manager.showReflectionPendingDialog()
      manager.removeReflectionPendingDialog()
      expect(document.getElementById("reflectionPendingDialog")).toBeNull()
    })

    it("shouldGenerateSummary=true 时显示反思并总结", () => {
      const { manager } = makeManager({
        isAiMultiGameMemoryEnabled: () => true,
        shouldGenerateSummary: () => true,
      })
      manager.showReflectionPendingDialog()
      const dialog = document.getElementById("reflectionPendingDialog")!
      expect(dialog.innerHTML).toContain("反思并总结")
    })
  })

  // ==================== 玩家信息气泡定位 ====================

  describe("玩家信息气泡", () => {
    beforeEach(() => {
      ensureDocEl("playerInfoPopover")
      ensureDocEl("playerInfoPopoverTitle")
      ensureDocEl("playerInfoPopoverContent")
    })

    it("showPlayerInfoPopover 显示气泡并设置内容", () => {
      const { manager } = makeManager()
      manager.showPlayerInfoPopover("标题", "<p>内容</p>", 100, 200)
      const popover = document.getElementById("playerInfoPopover")!
      expect(popover.classList.contains("hidden")).toBe(false)
      expect(document.getElementById("playerInfoPopoverTitle")!.textContent).toBe("标题")
      expect(document.getElementById("playerInfoPopoverContent")!.innerHTML).toContain("内容")
    })

    it("hidePlayerInfoPopover 隐藏气泡", () => {
      const { manager } = makeManager()
      manager.showPlayerInfoPopover("标题", "<p>内容</p>", 100, 200)
      manager.hidePlayerInfoPopover()
      const popover = document.getElementById("playerInfoPopover")!
      expect(popover.classList.contains("hidden")).toBe(true)
    })

    it("positionPlayerInfoPopover 设置位置样式", () => {
      const { manager } = makeManager()
      manager.showPlayerInfoPopover("标题", "<p>内容</p>", 500, 500)
      const popover = document.getElementById("playerInfoPopover")!
      expect(popover.style.left).toBeTruthy()
      expect(popover.style.top).toBeTruthy()
    })
  })

  // ════════════════ gameConfirm/Cancel 同步 gameSlice ════════════════
  describe("showGameConfirm / hideGameConfirm 同步 gameSlice", () => {
    it("showGameConfirm 设置消息文本并显示覆盖层", () => {
      const { manager, deps } = makeManager()
      manager.showGameConfirm("确认操作", () => {}, () => {})
      expect(deps.dom.gameConfirmMsg!.textContent).toBe("确认操作")
      expect(deps.dom.gameConfirmOverlay!.classList.contains("hidden")).toBe(false)
    })

    it("hideGameConfirm 隐藏覆盖层", () => {
      const { manager, deps } = makeManager()
      manager.hideGameConfirm()
      expect(deps.dom.gameConfirmOverlay!.classList.contains("hidden")).toBe(true)
    })

    it("多次 show → hide → show 后消息文本正确切换", () => {
      const { manager, deps } = makeManager()
      manager.showGameConfirm("第一次", () => {})
      manager.hideGameConfirm()
      manager.showGameConfirm("第二次", () => {})
      expect(deps.dom.gameConfirmMsg!.textContent).toBe("第二次")
      expect(deps.dom.gameConfirmOverlay!.classList.contains("hidden")).toBe(false)
    })
  })
})

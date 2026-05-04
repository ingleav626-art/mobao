if (!window.MobaoConstants) {
  throw new Error("MobaoConstants not found: 请先加载 scripts/game/constants.js");
}

if (!window.MobaoUtils) {
  throw new Error("MobaoUtils not found: 请先加载 scripts/game/utils.js");
}

if (!window.MobaoSettings) {
  throw new Error("MobaoSettings not found: 请先加载 scripts/game/settings.js");
}

if (!window.MobaoWarehouse) {
  throw new Error("MobaoWarehouse not found: 请先加载 scripts/game/warehouse/index.js");
}

const {
  GRID_COLS,
  GRID_ROWS,
  CELL_SIZE,
  MARGIN,
  CANVAS_NATIVE_HEIGHT,
  MAX_WAREHOUSE_CELLS,
  ARTIFACT_COUNT_RANGE,
  WAREHOUSE_OCCUPANCY_RATIO_RANGE,
  SETTINGS_STORAGE_KEY,
  PLAYER_MONEY_STORAGE_KEY,
  AI_LLM_SWITCH_STORAGE_KEY,
  BATTLE_RECORD_STORAGE_KEY,
  AI_MEMORY_STORAGE_KEY,
  DEFAULT_START_MONEY,
  SETTINGS_FIELDS,
  QUALITY_COLORS,
  QUALITY_ORDER,
  QUALITY_LABELS
} = window.MobaoConstants;

const {
  shuffle,
  delay,
  tweenToPromise,
  clamp,
  roundToStep,
  toCellKey,
  fromCellKey,
  sizeTagToCellCount,
  formatTrackIndex,
  rgbHex,
  trimTrailingZero,
  formatCompactNumber,
  formatBidRevealNumber,
  escapeHtml,
  compactOneLine,
  compactPanelText,
  indentMultiline,
  normalizeActionToken,
  isNoneActionText,
  safeParseJson,
  tryExtractDecisionJson,
  pickFirstDefined,
  createEmptyAiPrivateIntelPool,
  qualityPulseDuration,
  settlementRevealDelayByQuality,
  settlementSearchDurationByQuality
} = window.MobaoUtils;

const {
  defaultGameSettings,
  normalizeSettingsSource,
  normalizeGameSettings,
  loadGameSettings,
  saveGameSettings,
  loadPlayerMoney,
  savePlayerMoney,
  GAME_SETTINGS
} = window.MobaoSettings;

if (!window.ArtifactData) {
  throw new Error("ArtifactData not found: 请先加载 scripts/game/artifacts.js");
}

if (!window.SkillSystem) {
  throw new Error("SkillSystem not found: 请先加载 scripts/game/skills.js");
}

if (!window.ItemSystem) {
  throw new Error("ItemSystem not found: 请先加载 scripts/game/items.js");
}

if (!window.AuctionAI) {
  throw new Error("AuctionAI not found: 请先加载 scripts/game/ai-bidding.js");
}

if (!window.DeepSeekLLM) {
  throw new Error("DeepSeekLLM not found: 请先加载 scripts/llm/deepseek-llm.js");
}

if (!window.MobaoSceneLlm) {
  throw new Error("MobaoSceneLlm not found: 请先加载 scene-llm.js");
}

if (!window.MobaoBattleRecordBridge) {
  throw new Error("MobaoBattleRecordBridge not found: 请先加载 battle-record-bridge.js");
}

if (!window.MobaoSettlementBridge) {
  throw new Error("MobaoSettlementBridge not found: 请先加载 settlement-bridge.js");
}

if (!window.MobaoUi) {
  throw new Error("MobaoUi not found: 请先加载 scripts/game/ui/overlay.js");
}

if (!window.MobaoBidding) {
  throw new Error("MobaoBidding not found: 请先加载 scripts/game/bidding/index.js");
}

const {
  ArtifactManager,
  ARTIFACT_LIBRARY,
  QUALITY_CONFIG,
  toSizeTag,
  estimatePriceByQuality
} = window.ArtifactData;
const { SkillManager, SKILL_DEFS } = window.SkillSystem;
const { ItemManager, ITEM_DEFS } = window.ItemSystem;
const { AuctionAiEngine } = window.AuctionAI;
const {
  DeepSeekClient,
  defaultDeepSeekSettings,
  loadDeepSeekSettings,
  saveDeepSeekSettings,
  normalizeDeepSeekSettings,
  maskApiKey
} = window.DeepSeekLLM || {};
const LLM_SETTINGS = loadDeepSeekSettings ? loadDeepSeekSettings() : {};
window.MobaoLlm = {
  LLM_SETTINGS,
  saveDeepSeekSettings,
  maskApiKey,
  defaultDeepSeekSettings,
  loadDeepSeekSettings
};
const LLM_BRIDGE = window.MobaoSceneLlm.createSceneLlmBridge({
  AI_LLM_SWITCH_STORAGE_KEY,
  LLM_SETTINGS,
  GAME_SETTINGS,
  SKILL_DEFS,
  ITEM_DEFS,
  normalizeDeepSeekSettings,
  maskApiKey,
  saveDeepSeekSettings,
  pickFirstDefined,
  compactOneLine,
  normalizeActionToken,
  isNoneActionText,
  compactPanelText,
  indentMultiline,
  formatBidRevealNumber
});
const BATTLE_RECORD_BRIDGE = window.MobaoBattleRecordBridge.createBattleRecordBridge({
  BATTLE_RECORD_STORAGE_KEY,
  GRID_COLS,
  GRID_ROWS,
  clamp,
  escapeHtml,
  formatBidRevealNumber
});
const SETTLEMENT_BRIDGE = window.MobaoSettlementBridge.createSettlementBridge({
  MARGIN,
  CELL_SIZE,
  delay,
  tweenToPromise,
  settlementRevealDelayByQuality,
  settlementSearchDurationByQuality
});

class WarehouseScene extends Phaser.Scene {
  constructor() {
    super("warehouse");
    this.gridLayer = null;
    this.revealCellLayer = null;
    this.itemLayer = null;
    this.items = [];
    this.revealedCells = [];

    this.artifactManager = new ArtifactManager();
    this.skillManager = new SkillManager();
    this.itemManager = new ItemManager();
    this.syncItemManagerFromShop();
    this.aiEngine = new AuctionAiEngine();
    this.deepSeekTesting = false;

    this.round = 1;
    this.actionsLeft = GAME_SETTINGS.actionsPerRound;
    this.roundTimeLeft = GAME_SETTINGS.roundSeconds;

    this.playerMoney = loadPlayerMoney();
    this.selectedItem = null;
    this.currentBid = 0;
    this.bidLeader = "none";
    this.secondHighestBid = 0;
    this.aiMaxBid = 0;
    this.aiWallets = {};
    this.warehouseTrueValue = 0;
    this.warehouseCellIndex = {};
    this.settled = false;
    this.isLanMode = false;
    this.lanBridge = null;
    this.lanIsHost = false;
    this.lanMySlotId = "p2";
    this.lanIdToSlotId = {};
    this.slotIdToLanId = {};
    this.lanReconnecting = false;
    this.lanLastServerUrl = null;
    this.lanLastRoomCode = null;
    this.lanLastPlayerId = null;
    this.lanReconnectAttempts = 0;
    this.lanMaxReconnectAttempts = 5;

    this.previewOpenTick = 0;
    this.roundTimerId = null;
    this.roundPaused = false;
    this.roundResolving = false;
    this.playerBidSubmitted = false;
    this.playerRoundBid = 0;
    this.useQualityText = GAME_SETTINGS.showQualityText !== false;
    this.isSettlementRevealMode = false;
    this.settlementRevealRunning = false;
    this.settlementRevealSkipRequested = false;
    this.settlementSession = null;
    this.settlementRunToken = 0;
    this.activeSettlementSpinner = null;
    this.moneySettledRunToken = null;

    this.players = [
      { id: "p1", name: "左上AI", avatar: "A1", isHuman: false, isAI: true, isSelf: false },
      { id: "p2", name: "玩家", avatar: "你", isHuman: true, isAI: false, isSelf: true },
      { id: "p3", name: "右上AI", avatar: "A2", isHuman: false, isAI: true, isSelf: false },
      { id: "p4", name: "右下AI", avatar: "A3", isHuman: false, isAI: true, isSelf: false }
    ];

    this.playerRoundHistory = {};
    this.playerUsageHistory = {};
    this.currentRoundUsage = {};
    this.playerHistoryPanels = {};
    this.aiPrivateIntel = {};
    this.aiResourceState = {};
    this.aiRoundEffects = {};
    this.lastAiIntelActions = [];
    this.aiLlmRoundPlans = {};
    this.aiLlmPlayerEnabled = LLM_BRIDGE.loadAiLlmPlayerSwitches(this.players);
    this.aiFoldState = {};
    this.lastAiDecisionTelemetry = null;
    this.llmEverUsedThisRun = false;
    this.aiReflectionState = "idle";
    this.aiConversationByPlayer = {};
    this.aiCrossGameMemory = {};
    this.aiReflectionPending = {};
    this.runSerial = 0;
    this.runLogHistory = [];
    this.currentRunLog = null;
    this.highValuePriceThreshold = null;
    this.battleRecords = BATTLE_RECORD_BRIDGE.loadBattleRecords();
    this.battleRecordReplayActive = false;
    this.battleRecordReplayRecordId = null;
    this.battleRecordLogView = null;
    this.roundBidReadyState = {};
    this.aiRoundDecisionPromise = null;
    this.pendingNextRunAiSummary = "";
    this.llmEverUsedThisRun = false;
    this.aiReflectionState = "idle";
    this.restoreAiMemoryFromStorage();
    this.privateIntelEntries = [];
    this.publicInfoEntries = [];
    this.currentPublicEvent = null;
    this.resetPlayerHistoryState();

    this.dom = {
      hudRound: null,
      hudTimer: null,
      hudMoney: null,
      actionLog: null,
      aiThoughtContent: null,
      openSettingsBtn: null,
      rerollBtn: null,
      nextRoundBtn: null,
      pauseRoundBtn: null,
      aiLogicBtn: null,
      aiLogicOverlay: null,
      aiLogicPanel: null,
      aiLogicCloseBtn: null,
      aiLogicContent: null,
      battleRecordOverlay: null,
      battleRecordPanel: null,
      battleRecordCloseBtn: null,
      battleRecordContent: null,
      itemOutlineBtn: null,
      itemQualityBtn: null,
      itemDrawerToggleBtn: null,
      itemDrawer: null,
      itemDrawerCloseBtn: null,
      itemDrawerList: null,
      skillBtn: null,
      bidInput: null,
      settleBtn: null,
      qualityTextToggle: null,
      gameRoot: null,
      gameConfirmOverlay: null,
      gameConfirmMsg: null,
      gameConfirmCancelBtn: null,
      gameConfirmOkBtn: null,
      infoPopupOverlay: null,
      infoPopupTitle: null,
      infoPopupCloseBtn: null,
      infoPopupContent: null,
      revealHintUp: null,
      revealHintDown: null,
      previewPopover: null,
      previewTitle: null,
      previewCloseBtn: null,
      previewFilterRow: null,
      previewCategorySelect: null,
      previewHint: null,
      previewList: null,
      settleOverlay: null,
      settleCard: null,
      settlementPage: null,
      settleWinnerName: null,
      settleWinnerBid: null,
      settleRevealedValue: null,
      settleWinnerProfit: null,
      settleSelfProfitRow: null,
      settleSelfProfit: null,
      keypadDirectHint: null,
      settleProgressText: null,
      settleBackBtn: null,
      settleReplayBtn: null,
      settleReflectionStatus: null,
      settingsOverlay: null,
      settingsPanel: null,
      settingsScroll: null,
      settingsCloseBtn: null,
      settingsResetBtn: null,
      settingsSaveBtn: null,
      settingsStatusText: null,
      settingLlmEnabled: null,
      settingLlmMultiGameMemoryEnabled: null,
      settingDeepseekApiKey: null,
      settingDeepseekModel: null,
      settingsTestDeepSeekBtn: null,
      settingsLlmStatusText: null,
      clearAiMemoryBtn: null,
      aiMemoryStatusText: null,
      viewAiMemoryBtn: null,
      aiMemoryOverlay: null,
      aiMemoryPanel: null,
      aiMemoryCloseBtn: null,
      aiMemoryContent: null,
      settingLlmReflectionEnabled: null,
      settingLlmThinkingEnabled: null,
      personalPanelScroll: null,
      publicInfoScroll: null
    };

    this.keypadValue = "0";
  }

  create() {
    window.WarehouseScene = WarehouseScene;
    WarehouseScene.instance = this;
    this.initAudio();
    this.cacheDom();
    this.bindDomEvents();
    this.bindLobbyEvents();
    this.initPlayersUI();
    this.initPreviewFilterOptions();
    this.enterLobby();
  }

  initAudio() {
    if (window.AudioManager) {
      AudioManager.init().then(() => {
        AudioManager.preload('ui', ['click']);
        AudioManager.preload('game', ['reveal', 'coinsReveal', 'search', 'countdown']);
        if (window.AudioUI) {
          AudioUI.init();
        }
      });
    }
  }

  cacheDom() {
    this.dom.hudRound = document.getElementById("hudRound");
    this.dom.hudTimer = document.getElementById("hudTimer");
    this.dom.hudMoney = document.getElementById("hudMoney");
    this.dom.actionLog = document.getElementById("actionLog");
    this.dom.aiThoughtContent = document.getElementById("aiThoughtContent");
    this.dom.openSettingsBtn = document.getElementById("openSettingsBtn");
    this.dom.rerollBtn = document.getElementById("rerollBtn");
    this.dom.nextRoundBtn = document.getElementById("nextRoundBtn");
    this.dom.pauseRoundBtn = document.getElementById("pauseRoundBtn");
    this.dom.aiLogicBtn = document.getElementById("aiLogicBtn");
    this.dom.aiLogicOverlay = document.getElementById("aiLogicOverlay");
    this.dom.aiLogicPanel = document.getElementById("aiLogicPanel");
    this.dom.aiLogicCloseBtn = document.getElementById("aiLogicCloseBtn");
    this.dom.aiLogicContent = document.getElementById("aiLogicContent");
    this.dom.battleRecordOverlay = document.getElementById("battleRecordOverlay");
    this.dom.battleRecordPanel = document.getElementById("battleRecordPanel");
    this.dom.battleRecordCloseBtn = document.getElementById("battleRecordCloseBtn");
    this.dom.battleRecordContent = document.getElementById("battleRecordContent");
    this.dom.itemOutlineBtn = document.getElementById("itemOutlineBtn");
    this.dom.itemQualityBtn = document.getElementById("itemQualityBtn");
    this.dom.itemDrawerToggleBtn = document.getElementById("itemDrawerToggleBtn");
    this.dom.itemDrawer = document.getElementById("itemDrawer");
    this.dom.itemDrawerCloseBtn = document.getElementById("itemDrawerCloseBtn");
    this.dom.itemDrawerList = document.getElementById("itemDrawerList");
    this.dom.skillBtn = document.getElementById("skillBtn");
    this.dom.bidInput = document.getElementById("bidInput");
    this.dom.settleBtn = document.getElementById("settleBtn");
    this.dom.qualityTextToggle = document.getElementById("setting-showQualityText");
    this.dom.gameRoot = document.getElementById("game-root");
    this.dom.gameConfirmOverlay = document.getElementById("gameConfirmOverlay");
    this.dom.gameConfirmMsg = document.getElementById("gameConfirmMsg");
    this.dom.gameConfirmCancelBtn = document.getElementById("gameConfirmCancelBtn");
    this.dom.gameConfirmOkBtn = document.getElementById("gameConfirmOkBtn");
    this.dom.infoPopupOverlay = document.getElementById("infoPopupOverlay");
    this.dom.infoPopupTitle = document.getElementById("infoPopupTitle");
    this.dom.infoPopupCloseBtn = document.getElementById("infoPopupCloseBtn");
    this.dom.infoPopupContent = document.getElementById("infoPopupContent");
    this.dom.revealHintUp = document.getElementById("revealHintUp");
    this.dom.revealHintDown = document.getElementById("revealHintDown");

    this.dom.previewPopover = document.getElementById("previewPopover");
    this.dom.previewTitle = document.getElementById("previewTitle");
    this.dom.previewCloseBtn = document.getElementById("previewCloseBtn");
    this.dom.previewFilterRow = document.getElementById("previewFilterRow");
    this.dom.previewCategorySelect = document.getElementById("previewCategorySelect");
    this.dom.previewHint = document.getElementById("previewHint");
    this.dom.previewList = document.getElementById("previewList");

    this.dom.settleOverlay = document.getElementById("settleOverlay");
    this.dom.settleCard = document.getElementById("settleCard");
    this.dom.settlementPage = document.getElementById("settlementPage");
    this.dom.settleWinnerName = document.getElementById("settleWinnerName");
    this.dom.settleWinnerBid = document.getElementById("settleWinnerBid");
    this.dom.settleRevealedValue = document.getElementById("settleRevealedValue");
    this.dom.settleWinnerProfit = document.getElementById("settleWinnerProfit");
    this.dom.settleSelfProfitRow = document.getElementById("settleSelfProfitRow");
    this.dom.settleSelfProfit = document.getElementById("settleSelfProfit");
    this.dom.keypadDirectHint = document.getElementById("keypadDirectHint");
    this.dom.settleProgressText = document.getElementById("settleProgressText");
    this.dom.settleBackBtn = document.getElementById("settleBackBtn");
    this.dom.settleReplayBtn = document.getElementById("settleReplayBtn");
    this.dom.settleReflectionStatus = document.getElementById("settleReflectionStatus");

    this.dom.settingsOverlay = document.getElementById("settingsOverlay");
    this.dom.settingsPanel = document.getElementById("settingsPanel");
    this.dom.settingsScroll = document.getElementById("settingsScroll");
    this.dom.settingsCloseBtn = document.getElementById("settingsCloseBtn");
    this.dom.settingsResetBtn = document.getElementById("settingsResetBtn");
    this.dom.settingsSaveBtn = document.getElementById("settingsSaveBtn");
    this.dom.settingsStatusText = document.getElementById("settingsStatusText");
    this.dom.settingLlmEnabled = document.getElementById("setting-llmEnabled");
    this.dom.settingLlmMultiGameMemoryEnabled = document.getElementById("setting-llmMultiGameMemoryEnabled");
    this.dom.settingDeepseekApiKey = document.getElementById("setting-deepseekApiKey") || document.getElementById("setting-llmApiKey");
    this.dom.settingDeepseekModel = document.getElementById("setting-deepseekModel") || document.getElementById("setting-llmModel");
    this.dom.settingMaxTokens = document.getElementById("setting-maxTokens");
    this.dom.settingsTestDeepSeekBtn = document.getElementById("settingsTestDeepSeekBtn") || document.getElementById("settingsTestLlmBtn");
    this.dom.settingsLlmStatusText = document.getElementById("settingsLlmStatusText");
    this.dom.clearAiMemoryBtn = document.getElementById("clearAiMemoryBtn");
    this.dom.aiMemoryStatusText = document.getElementById("aiMemoryStatusText");
    this.dom.viewAiMemoryBtn = document.getElementById("viewAiMemoryBtn");
    this.dom.aiMemoryOverlay = document.getElementById("aiMemoryOverlay");
    this.dom.aiMemoryPanel = document.getElementById("aiMemoryPanel");
    this.dom.aiMemoryCloseBtn = document.getElementById("aiMemoryCloseBtn");
    this.dom.aiMemoryContent = document.getElementById("aiMemoryContent");
    this.dom.settingLlmReflectionEnabled = document.getElementById("setting-llmReflectionEnabled");
    this.dom.settingLlmThinkingEnabled = document.getElementById("setting-llmThinkingEnabled");

    this.dom.bidKeypad = document.getElementById("bidKeypad");
    this.dom.keypadCloseBtn = document.getElementById("keypadCloseBtn");
    this.dom.keypadScreen = document.getElementById("keypadScreen");

    this.dom.personalPanelScroll = document.getElementById("personalPanelScroll");
    this.dom.publicInfoScroll = document.getElementById("publicInfoScroll");
  }

  bindDomEvents() {
    this.dom.rerollBtn.addEventListener("click", () => {
      if (this.isLanMode) return;
      this.startNewRun();
    });
    this.dom.openSettingsBtn.addEventListener("click", () => {
      this.openSettingsOverlay();
    });
    const gameShopBtn = document.getElementById("gameShopBtn");
    if (gameShopBtn) {
      gameShopBtn.addEventListener("click", () => this.openShopOverlay());
    }
    const backToLobbyBtn = document.getElementById("backToLobbyBtn");
    if (backToLobbyBtn) {
      backToLobbyBtn.addEventListener("click", () => {
        this.stopRoundTimer();
        this.enterLobby();
      });
    }
    this.dom.nextRoundBtn.addEventListener("click", () => this.resolveRoundBids("manual"));
    if (this.dom.pauseRoundBtn) {
      this.dom.pauseRoundBtn.addEventListener("click", () => this.toggleRoundPause());
    }

    this.dom.aiLogicBtn.addEventListener("click", () => this.openAiLogicPanel());
    if (this.dom.aiLogicCloseBtn) {
      this.dom.aiLogicCloseBtn.addEventListener("click", () => this.closeAiLogicPanel());
    }
    if (this.dom.aiLogicOverlay) {
      this.dom.aiLogicOverlay.addEventListener("click", (event) => {
        if (event.target === this.dom.aiLogicOverlay) {
          this.closeAiLogicPanel();
        }
      });
    }
    if (this.dom.battleRecordCloseBtn) {
      this.dom.battleRecordCloseBtn.addEventListener("click", () => this.closeBattleRecordPanel());
    }
    if (this.dom.battleRecordOverlay) {
      this.dom.battleRecordOverlay.addEventListener("click", (event) => {
        if (event.target === this.dom.battleRecordOverlay) {
          this.closeBattleRecordPanel();
        }
      });
    }
    if (this.dom.battleRecordContent) {
      this.dom.battleRecordContent.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
          return;
        }
        const replayButton = target.closest("button[data-record-id]");
        if (replayButton instanceof HTMLButtonElement) {
          const recordId = replayButton.dataset.recordId;
          if (recordId) {
            this.openBattleRecordReplay(recordId);
          }
          return;
        }

        const logButton = target.closest("button[data-record-log-id]");
        if (logButton instanceof HTMLButtonElement) {
          const recordId = logButton.dataset.recordLogId;
          if (recordId) {
            this.openBattleRecordLogs(recordId, 1);
          }
          return;
        }

        if (target.closest("button[data-log-close]")) {
          this.closeBattleRecordLogs();
          return;
        }

        if (target.closest("button[data-log-prev]")) {
          const recordId = this.battleRecordLogView && this.battleRecordLogView.recordId;
          const page = Math.max(1, Math.round(Number((this.battleRecordLogView && this.battleRecordLogView.page) || 1)) - 1);
          if (recordId) {
            this.openBattleRecordLogs(recordId, page);
          }
          return;
        }

        if (target.closest("button[data-log-next]")) {
          const recordId = this.battleRecordLogView && this.battleRecordLogView.recordId;
          const page = Math.max(1, Math.round(Number((this.battleRecordLogView && this.battleRecordLogView.page) || 1)) + 1);
          if (recordId) {
            this.openBattleRecordLogs(recordId, page);
          }
          return;
        }

        const deleteButton = target.closest("button[data-delete-record-id]");
        if (deleteButton instanceof HTMLButtonElement) {
          const recordId = deleteButton.dataset.deleteRecordId;
          if (recordId) {
            this.deleteBattleRecord(recordId);
          }
        }
      });
    }
    if (this.dom.itemOutlineBtn) {
      this.dom.itemOutlineBtn.addEventListener("click", () => this.useItem("item-outline-lamp"));
    }
    if (this.dom.itemQualityBtn) {
      this.dom.itemQualityBtn.addEventListener("click", () => this.useItem("item-quality-needle"));
    }
    if (this.dom.itemDrawerToggleBtn) {
      this.dom.itemDrawerToggleBtn.addEventListener("click", () => this.toggleItemDrawer());
    }
    if (this.dom.itemDrawerCloseBtn) {
      this.dom.itemDrawerCloseBtn.addEventListener("click", () => this.closeItemDrawer());
    }
    if (this.dom.itemDrawerList) {
      this.dom.itemDrawerList.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
          return;
        }
        const button = target.closest("button[data-item-id]");
        if (!(button instanceof HTMLElement)) {
          return;
        }
        const itemId = button.dataset.itemId;
        if (!itemId) {
          return;
        }
        this.useItem(itemId);
        this.closeItemDrawer();
      });
    }

    this.dom.skillBtn.addEventListener("click", () => this.useSkill("skill-outline-scan"));
    this.dom.settleBtn.addEventListener("click", () => this.settleCurrentRun());
    this.dom.settleBackBtn.addEventListener("click", () => {
      this.exitSettlementPage();
      if (this.battleRecordReplayActive) {
        this.battleRecordReplayActive = false;
        this.battleRecordReplayRecordId = null;
        this.enterLobby();
        setTimeout(() => {
          this.openBattleRecordPanel();
          this.writeLog("已返回战绩列表，可继续选择其他战绩回放。");
        }, 100);
        return;
      }
      if (this.isLanMode) {
        this.enterLanRoom();
      } else {
        this.enterLobby();
      }
    });
    this.dom.settleReplayBtn.addEventListener("click", () => {
      if (this.shouldShowReflectionUI() && this.aiReflectionState === "pending") {
        this.showReflectionPendingDialog();
        return;
      }
      if (this.isLanMode) {
        if (this.lanIsHost) {
          const aiCount = this.lanAiPlayers ? this.lanAiPlayers.length : 0;
          const aiPlayers = (this.lanAiPlayers || []).map((ai) => ({
            id: ai.id, name: ai.name, isAI: true, isHost: false, llm: !!ai.llm,
          }));
          this.lanBridge.send({ type: "game:restart-request", aiCount, aiLlmEnabled: this.lanAiLlmEnabled, aiPlayers });
          this.showLanRestartWaitingDialog();
        } else {
          this.writeLog("等待主机发起重开请求...");
        }
      } else {
        this.proceedToNewRun();
      }
    });

    if (this.dom.previewCloseBtn) {
      this.dom.previewCloseBtn.addEventListener("click", () => this.hidePreview());
    }
    this.setupPreviewTouchScroll();
    this.dom.previewCategorySelect.addEventListener("change", () => {
      if (this.selectedItem) {
        this.renderPreviewCandidates(this.selectedItem);
      }
    });

    this.dom.settingsCloseBtn.addEventListener("click", () => this.closeSettingsOverlay(false));
    this.dom.settingsResetBtn.addEventListener("click", () => {
      this.fillSettingsForm(defaultGameSettings());
      this.fillLlmSettingsForm(
        this.getLlmProvider() && typeof this.getLlmProvider().defaultSettings === "function"
          ? this.getLlmProvider().defaultSettings()
          : defaultDeepSeekSettings()
      );
      this.setSettingsStatus("已恢复默认，点击保存后生效。", false);
    });
    this.dom.settingsSaveBtn.addEventListener("click", () => this.saveSettingsFromOverlay());
    if (this.dom.settingsTestDeepSeekBtn) {
      this.dom.settingsTestDeepSeekBtn.addEventListener("click", () => this.testDeepSeekConnectionFromOverlay());
    }
    if (this.dom.clearAiMemoryBtn) {
      this.dom.clearAiMemoryBtn.addEventListener("click", () => {
        this.showGameConfirm("确定要清空所有AI的持久化记忆吗？此操作不可恢复。", () => {
          this.clearAiMemoryStorage();
          if (this.dom.aiMemoryStatusText) {
            this.dom.aiMemoryStatusText.textContent = "已清空";
          }
          this.writeLog("AI持久化记忆已清空。");
        });
      });
    }
    if (this.dom.viewAiMemoryBtn) {
      this.dom.viewAiMemoryBtn.addEventListener("click", () => {
        this.openAiMemoryPanel();
      });
    }
    if (this.dom.aiMemoryCloseBtn) {
      this.dom.aiMemoryCloseBtn.addEventListener("click", () => {
        this.closeAiMemoryPanel();
      });
    }
    if (this.dom.aiMemoryOverlay) {
      this.dom.aiMemoryOverlay.addEventListener("click", (event) => {
        event.stopPropagation();
        if (event.target === this.dom.aiMemoryOverlay) {
          this.closeAiMemoryPanel();
        }
      });
    }
    if (this.dom.aiMemoryPanel) {
      this.dom.aiMemoryPanel.addEventListener("click", (event) => {
        event.stopPropagation();
      });
      this.dom.aiMemoryPanel.addEventListener("touchstart", (event) => {
        event.stopPropagation();
      }, { passive: true });
      this.dom.aiMemoryPanel.addEventListener("touchmove", (event) => {
        event.stopPropagation();
      }, { passive: true });
    }
    this.dom.settingsOverlay.addEventListener("click", (event) => {
      if (this.dom.aiMemoryOverlay && !this.dom.aiMemoryOverlay.classList.contains("hidden")) {
        return;
      }
      if (event.target === this.dom.settingsOverlay) {
        this.closeSettingsOverlay(false);
      }
    });

    this.dom.gameRoot.addEventListener("wheel", (event) => {
      if (!this.dom.gameRoot) {
        return;
      }

      if (this.isSettingsOverlayOpen()) {
        if (this.scrollElementByWheel(this.dom.settingsScroll, event.deltaY)) {
          event.preventDefault();
        } else {
          event.preventDefault();
        }
        return;
      }

      if (
        event.target instanceof HTMLElement &&
        this.dom.previewPopover.contains(event.target) &&
        !this.dom.previewPopover.classList.contains("hidden")
      ) {
        this.scrollElementByWheel(this.dom.previewPopover, event.deltaY);
        event.preventDefault();
        return;
      }

      if (
        !this.dom.previewPopover.classList.contains("hidden") &&
        event.target instanceof HTMLElement &&
        this.dom.gameRoot.contains(event.target) &&
        !this.dom.previewPopover.contains(event.target)
      ) {
        this.hidePreview();
      }

      if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
        if (this.scrollElementByWheel(this.dom.gameRoot, event.deltaY)) {
          event.preventDefault();
        }
      }
    }, { passive: false });

    this.dom.gameRoot.addEventListener("scroll", () => {
      this.refreshRevealScrollHints();
    }, { passive: true });

    let touchStartY = 0;
    let touchStartScrollTop = 0;
    let touchInPreview = false;
    this.dom.gameRoot.addEventListener("touchstart", (e) => {
      touchInPreview = e.target instanceof HTMLElement && this.dom.previewPopover.contains(e.target) && !this.dom.previewPopover.classList.contains("hidden");
      if (touchInPreview) return;
      if (e.touches.length === 1) {
        touchStartY = e.touches[0].clientY;
        touchStartScrollTop = this.dom.gameRoot.scrollTop;
      }
    }, { passive: true });

    this.dom.gameRoot.addEventListener("touchmove", (e) => {
      if (touchInPreview) return;
      if (e.touches.length !== 1) return;
      const dy = touchStartY - e.touches[0].clientY;
      const maxScroll = this.dom.gameRoot.scrollHeight - this.dom.gameRoot.clientHeight;
      if (maxScroll <= 0) return;
      this.dom.gameRoot.scrollTop = Math.max(0, Math.min(touchStartScrollTop + dy, maxScroll));
    }, { passive: true });

    this.dom.gameRoot.addEventListener("pointerdown", (event) => {
      if (!this.settlementRevealRunning || !this.isSettlementPageActive()) {
        return;
      }

      const target = event.target;
      if (target instanceof HTMLElement && this.dom.previewPopover.contains(target)) {
        return;
      }

      const point = this.toWorldPointFromRootEvent(event);
      if (!point) {
        return;
      }

      if (this.isPointOnSettlementLockedItem(point.x, point.y)) {
        return;
      }

      this.settlementRevealSkipRequested = true;
      event.preventDefault();
    });

    this.dom.bidInput.readOnly = true;
    this.dom.bidInput.addEventListener("keydown", (event) => event.preventDefault());
    this.dom.bidInput.addEventListener("click", () => this.openBidKeypad());
    this.dom.bidInput.addEventListener("focus", () => this.openBidKeypad());

    this.dom.keypadCloseBtn.addEventListener("click", () => this.closeBidKeypad());
    this.dom.bidKeypad.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });
    this.dom.bidKeypad.addEventListener("click", (event) => {
      event.stopPropagation();
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const key = target.dataset.key;
      if (!key) {
        return;
      }

      this.handleBidKeyInput(key);
    });

    this.input.keyboard.on("keydown-R", () => {
      if (this.isLanMode) return;
      this.startNewRun();
    });
    this.input.keyboard.on("keydown-N", () => {
      if (this.isLanMode && !this.lanIsHost) return;
      this.resolveRoundBids("manual");
    });
    this.input.keyboard.on("keydown-B", () => this.openBidKeypad());
    this.input.keyboard.on("keydown-P", () => {
      if (this.isLanMode && !this.lanIsHost) return;
      this.toggleRoundPause();
    });

    this.dom.qualityTextToggle.addEventListener("change", () => {
      this.useQualityText = this.dom.qualityTextToggle.checked;
      this.syncAllQualityTextVisibility();
    });

    this.dom.gameConfirmCancelBtn.addEventListener("click", () => this.hideGameConfirm());
    this.dom.gameConfirmOkBtn.addEventListener("click", () => {
      const cb = this._gameConfirmCallback;
      this.hideGameConfirm();
      if (cb) {
        cb();
      }
    });

    this.dom.infoPopupCloseBtn.addEventListener("click", () => this.hideInfoPopup());
    this.dom.infoPopupOverlay.addEventListener("click", (event) => {
      if (event.target === this.dom.infoPopupOverlay) {
        this.hideInfoPopup();
      }
    });

    const personalPanel = document.getElementById("personalPanel");
    if (personalPanel) {
      personalPanel.style.cursor = "pointer";
      personalPanel.addEventListener("click", () => this.showInfoPopup("个人情报区", this.dom.personalPanelScroll));
    }
    const publicPanel = document.getElementById("publicPanel");
    if (publicPanel) {
      publicPanel.style.cursor = "pointer";
      publicPanel.addEventListener("click", () => this.showInfoPopup("公共信息区", this.dom.publicInfoScroll));
    }

    this.input.on("pointerdown", (pointer) => {
      if (!this.settlementRevealRunning || !this.isSettlementPageActive()) {
        return;
      }

      if (this.isPointOnSettlementLockedItem(pointer.x, pointer.y)) {
        return;
      }

      this.settlementRevealSkipRequested = true;
    });

    document.addEventListener("pointerdown", (event) => {
      const target = event.target;
      const targetEl = target instanceof HTMLElement ? target : null;

      if (
        this.settlementRevealRunning &&
        this.isSettlementPageActive() &&
        !(targetEl && this.dom.previewPopover.contains(targetEl)) &&
        !(targetEl && this.dom.gameRoot.contains(targetEl))
      ) {
        this.settlementRevealSkipRequested = true;
      }

      if (
        targetEl &&
        this.isSettingsOverlayOpen() &&
        !this.dom.settingsPanel.contains(targetEl) &&
        targetEl !== this.dom.openSettingsBtn
      ) {
        this.closeSettingsOverlay(false);
      }

      if (!this.dom.previewPopover.classList.contains("hidden") && Date.now() - this.previewOpenTick >= 140) {
        if (targetEl && !this.dom.previewPopover.contains(targetEl)) {
          this.hidePreview();
        }
      }

      if (
        targetEl &&
        !this.dom.bidKeypad.classList.contains("hidden") &&
        !this.dom.bidKeypad.contains(targetEl) &&
        targetEl !== this.dom.bidInput
      ) {
        this.closeBidKeypad();
      }

      if (
        targetEl &&
        this.dom.itemDrawer &&
        !this.dom.itemDrawer.classList.contains("hidden") &&
        !this.dom.itemDrawer.contains(targetEl) &&
        targetEl !== this.dom.itemDrawerToggleBtn
      ) {
        this.closeItemDrawer();
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (!this.isLanMode) return;
      if (document.hidden) {
        this.onLanBackground();
      } else {
        this.onLanForeground();
      }
    });

  }


  startNewRun() {
    this.beginRunTracking();
    this.battleRecordReplayActive = false;
    this.battleRecordReplayRecordId = null;
    this.cancelSettlementReveal();
    this.stopRoundTimer();
    this.exitSettlementPage();
    this.guardWarehouseCapacity();
    this.round = 1;
    this.actionsLeft = GAME_SETTINGS.actionsPerRound;
    this.roundTimeLeft = GAME_SETTINGS.roundSeconds;
    this.roundResolving = false;
    this.playerBidSubmitted = false;
    this.playerRoundBid = 0;
    this.selectedItem = null;
    this.currentBid = 1000;
    this.bidLeader = "none";
    this.aiMaxBid = 0;
    this.warehouseTrueValue = 0;
    this.settled = false;
    this.moneySettledRunToken = this.makeRunToken();
    this.resetPlayerHistoryState();

    this.privateIntelEntries = [];
    this.publicInfoEntries = [];
    this.currentPublicEvent = null;

    this.skillManager.resetForNewRun();
    this.skillManager.onNewRound();
    this.syncItemManagerFromShop();

    this.hidePreview();
    this.closeBidKeypad();
    this.closeItemDrawer();
    this.hideSettleOverlay();
    this.hideRevealScrollHints();
    this.drawUnknownWarehouse();
    this.spawnRandomItems();

    if (window.PublicEventSystem && this.items.length > 0) {
      this.currentPublicEvent = window.PublicEventSystem.pickRandomPublicEvent(
        this.items,
        GRID_COLS,
        GRID_ROWS
      );
      this.publicInfoEntries.push({
        source: this.currentPublicEvent.category,
        text: this.currentPublicEvent.text
      });
    }

    this.setupWarehouseAuction();
    this.rebuildWarehouseCellIndex();
    this.initAiWallets();
    this.initAiIntelSystems();
    this.aiEngine.resetForNewRun({
      startingBid: this.currentBid,
      itemCount: this.items.length
    });
    this.lastAiDecisionTelemetry = null;
    this.llmEverUsedThisRun = false;
    this.aiReflectionState = "idle";
    if (!this.isAiMultiGameMemoryEnabled()) {
      this.resetAiConversations();
    } else {
      this.aiConversationByPlayer = {};
    }
    this.pushRunStartContextToAi();
    this.startRound();
    this.updateHud();
    this.writeLog("新仓库已生成：回合限时开始，可先用道具/技能再提交整仓出价。");
  }

  startRound() {
    this.roundResolving = false;
    this.roundPaused = false;
    this.actionsLeft = GAME_SETTINGS.actionsPerRound;
    this.roundTimeLeft = GAME_SETTINGS.roundSeconds;
    this.playerBidSubmitted = false;
    this.playerRoundBid = 0;
    this.clearCurrentRoundUsage();
    this.resetAiRoundResources();
    this.aiLlmRoundPlans = {};
    this.aiRoundDecisionPromise = null;
    this.resetRoundBidDisplay();
    this.resetRoundBidReadyState();
    this.closeBidKeypad();
    this.dom.bidInput.value = this.round <= 1 ? "" : "0";
    this.dom.bidInput.placeholder = this.round <= 1 ? "点击出价" : "";
    this.syncPauseButton();
    this.startRoundTimer();
    if (!this.isLanMode || this.lanIsHost) {
      this.aiRoundDecisionPromise = this.kickoffAiRoundDecisions();
    }
  }

  startRoundTimer() {
    this.stopRoundTimer();
    this.roundTimerId = window.setInterval(() => {
      if (this.roundResolving || this.settled) {
        this.stopRoundTimer();
        return;
      }

      if (this.roundPaused) {
        return;
      }

      this.roundTimeLeft -= 1;
      this.updateHud();
      if (this.roundTimeLeft === 5 && window.AudioUI) {
        AudioUI.playCountdown();
      }
      if (this.roundTimeLeft <= 0) {
        if (this.isLanMode && this.lanBridge) {
          this.stopRoundTimer();
          this.writeLog("联机模式：回合时间到，等待主机结算");
        } else {
          this.resolveRoundBids("timeout");
        }
      }
    }, 1000);
  }

  stopRoundTimer() {
    if (this.roundTimerId) {
      window.clearInterval(this.roundTimerId);
      this.roundTimerId = null;
    }
  }

  toggleRoundPause() {
    if (this.isLanMode && !this.lanIsHost) return;
    if (this.settled || this.roundResolving) {
      return;
    }

    this.roundPaused = !this.roundPaused;
    if (this.roundPaused) {
      this._pauseSnapshotTimeLeft = this.roundTimeLeft;
    } else if (this._pauseSnapshotTimeLeft != null) {
      this.roundTimeLeft = this._pauseSnapshotTimeLeft;
      this._pauseSnapshotTimeLeft = null;
    }
    this.syncPauseButton();
    this.updateHud();
    if (this.isLanMode) {
      if (this.roundPaused) {
        this.showLanPauseOverlay();
      } else {
        this.hideLanPauseOverlay();
      }
      if (this.lanBridge) {
        this.lanBridge.togglePause(this.roundPaused, this.roundTimeLeft);
      }
    }
    this.writeLog(this.roundPaused ? "回合已暂停：计时冻结，可查看日志与AI面板。" : "回合已继续：计时恢复。");
  }

  syncPauseButton() {
    if (!this.dom.pauseRoundBtn) {
      return;
    }
    const icon = this.roundPaused
      ? '<img src="./assets/images/icons/ui/play-button.svg" alt="" class="btn-icon">'
      : '<img src="./assets/images/icons/ui/pause-button.svg" alt="" class="btn-icon">';
    const text = this.roundPaused ? "继续回合" : "暂停回合";
    this.dom.pauseRoundBtn.innerHTML = `${icon}${text}`;
    this.dom.pauseRoundBtn.classList.toggle("is-paused", this.roundPaused);
  }

  resetRoundBidDisplay() {
    this.players.forEach((player) => {
      const bidEl = document.getElementById(`bid-${player.id}`);
      const cardEl = document.getElementById(`playerCard-${player.id}`);
      if (bidEl) {
        bidEl.textContent = "待公布";
      }
      if (cardEl) {
        cardEl.classList.remove("revealed", "winner", "runner", "bid-pop", "bid-ready");
      }
    });
  }

  resetRoundBidReadyState() {
    this.roundBidReadyState = {};
    this.players.forEach((player) => {
      this.roundBidReadyState[player.id] = false;
      this.setPlayerBidReady(player.id, false);
    });
  }

  openBattleRecordPanel() {
    return BATTLE_RECORD_BRIDGE.methods.openBattleRecordPanel.call(this);
  }

  closeBattleRecordPanel() {
    return BATTLE_RECORD_BRIDGE.methods.closeBattleRecordPanel.call(this);
  }

  buildWarehouseSnapshotForSync() {
    return this.buildWarehouseSnapshotForRecord();
  }

  buildWarehouseSnapshotForRecord() {
    return BATTLE_RECORD_BRIDGE.methods.buildWarehouseSnapshotForRecord.call(this);
  }

  saveBattleRecord(result) {
    return BATTLE_RECORD_BRIDGE.methods.saveBattleRecord.call(this, result);
  }

  renderBattleRecordPanel() {
    return BATTLE_RECORD_BRIDGE.methods.renderBattleRecordPanel.call(this);
  }

  openBattleRecordReplay(recordId) {
    return BATTLE_RECORD_BRIDGE.methods.openBattleRecordReplay.call(this, recordId);
  }

  openBattleRecordLogs(recordId, page = 1) {
    return BATTLE_RECORD_BRIDGE.methods.openBattleRecordLogs.call(this, recordId, page);
  }

  closeBattleRecordLogs() {
    return BATTLE_RECORD_BRIDGE.methods.closeBattleRecordLogs.call(this);
  }

  deleteBattleRecord(recordId) {
    return BATTLE_RECORD_BRIDGE.methods.deleteBattleRecord.call(this, recordId);
  }

  restoreWarehouseFromBattleRecord(record) {
    return BATTLE_RECORD_BRIDGE.methods.restoreWarehouseFromBattleRecord.call(this, record);
  }

  renderBattleRecordLogView() {
    return BATTLE_RECORD_BRIDGE.methods.renderBattleRecordLogView.call(this);
  }

  renderBattleRecordSummary() {
    return BATTLE_RECORD_BRIDGE.methods.renderBattleRecordSummary.call(this);
  }

  renderAiLogicPanel() {
    if (!this.dom.aiLogicContent || !this.aiEngine || typeof this.aiEngine.getLastDecisionLog !== "function") {
      return;
    }

    if (this.lastAiDecisionTelemetry && this.lastAiDecisionTelemetry.mode === "llm") {
      this.renderAiLogicPanelForLlm(this.lastAiDecisionTelemetry);
      return;
    }

    const payload = this.aiEngine.getLastDecisionLog();
    if (!payload || !payload.entries || payload.entries.length === 0) {
      this.dom.aiLogicContent.textContent = "暂无AI出价决策。\n请至少完成一轮出价揭示后查看。";
      return;
    }

    const lines = [];
    const roundText = Number.isFinite(payload.round) ? payload.round : this.round;
    lines.push(`回合 ${roundText} | 当前价 ${formatBidRevealNumber(payload.currentBid || this.currentBid)}`);
    lines.push(`参考盘 ${formatBidRevealNumber(payload.marketReference || this.currentBid)} | 线索率 ${Math.round((payload.clueRate || 0) * 100)}%`);
    lines.push("信心影响：信心越高，AI越愿意贴近心理预期和上限；信心越低，AI越可能观望或回撤。\n");
    lines.push("-");

    payload.entries.forEach((entry) => {
      const parts = entry.confidenceParts || {};
      const overheat = Math.round((entry.overheatRatio || 0) * 100);
      const threshold = Math.round((entry.overheatThreshold || 0) * 100);
      lines.push(`${entry.name || entry.playerId}（${entry.archetype || "未知人格"}）`);
      lines.push(`  最终出价: ${formatBidRevealNumber(entry.finalBid || 0)} | 信心 ${Math.round((entry.confidence || 0) * 100)}%`);
      lines.push(`  私有线索: 线索率 ${Math.round((entry.intelClueRate || 0) * 100)}% | 品质率 ${Math.round((entry.intelQualityRate || 0) * 100)}% | 不确定 ${(entry.intelUncertainty || 0).toFixed(2)} | 波动 ${(entry.intelSpreadRatio || 0).toFixed(2)}`);
      lines.push(`  分布边缘: 上沿 ${(entry.intelUpperEdge || 0).toFixed(2)} | 下沿 ${(entry.intelLowerEdge || 0).toFixed(2)}`);
      lines.push(`  信心拆解: 基础 ${(parts.base || 0).toFixed(2)} + 线索 ${(parts.clue || 0).toFixed(2)} + 品质 ${(parts.quality || 0).toFixed(2)} + 回合 ${(parts.progress || 0).toFixed(2)} + 盘口 ${(parts.market || 0).toFixed(2)} + 工具 ${(parts.tool || 0).toFixed(2)} + 边缘奖励 ${(parts.edgeBonus || 0).toFixed(2)} - 波动惩罚 ${(parts.spreadPenalty || 0).toFixed(2)} - 不确定惩罚 ${(parts.uncertaintyPenalty || 0).toFixed(2)} + 情绪 ${(parts.mood || 0).toFixed(2)}`);
      lines.push(`  估值: ${formatBidRevealNumber(entry.perceivedValue || 0)} | 上限 ${formatBidRevealNumber(entry.hardCap || 0)}`);
      lines.push(`  心理预期: ${formatBidRevealNumber(entry.psychExpectedBid || 0)}（目标 ${formatBidRevealNumber(entry.targetPsychExpected || 0)}）`);
      lines.push(`  超预期: ${overheat}% | 回撤阈值 ${threshold}% | 低信息调整 ${formatBidRevealNumber(entry.floorAdjustAmount || 0)}`);
      lines.push(`  工具影响: ${entry.toolTag || "无"} | 决策加分 ${(entry.toolScoreBoost || 0).toFixed(2)}`);
      lines.push(`  行为: ${entry.actionTag || "常规"}${entry.mistakeTag ? ` | 失误:${entry.mistakeTag}` : ""}${entry.diversifyTag ? ` | 去同质:${entry.diversifyTag}` : ""}`);
      lines.push("-");
    });

    this.dom.aiLogicContent.textContent = lines.join("\n");
  }

  renderAiLogicPanelForLlm(telemetry) {
    return LLM_BRIDGE.methods.renderAiLogicPanelForLlm.call(this, telemetry);
  }

  fillLlmSettingsForm(values) {
    return LLM_BRIDGE.methods.fillLlmSettingsForm.call(this, values);
  }

  readLlmSettingsForm() {
    return LLM_BRIDGE.methods.readLlmSettingsForm.call(this);
  }

  setLlmSettingsStatus(text, state) {
    return LLM_BRIDGE.methods.setLlmSettingsStatus.call(this, text, state);
  }

  async testDeepSeekConnectionFromOverlay() {
    return LLM_BRIDGE.methods.testDeepSeekConnectionFromOverlay.call(this);
  }

  scrollElementByWheel(element, deltaY) {
    if (!element) {
      return false;
    }

    const maxScroll = element.scrollHeight - element.clientHeight;
    if (maxScroll <= 0) {
      return false;
    }

    const before = element.scrollTop;
    element.scrollTop = clamp(element.scrollTop + deltaY, 0, maxScroll);
    return before !== element.scrollTop;
  }

  buildBidHistorySnapshot() {
    const rounds = Array.from({ length: Math.max(0, this.round - 1) }, (_v, idx) => idx + 1);
    return rounds.map((roundNo) => {
      const bids = {};
      this.players.forEach((player) => {
        const records = this.playerRoundHistory[player.id] || [];
        const entry = records.find((record) => record.round === roundNo);
        bids[player.id] = entry ? Math.round(Number(entry.bid) || 0) : 0;
      });
      return {
        round: roundNo,
        bids
      };
    });
  }

  buildPublicEventSnapshot(options = {}) {
    const compact = Boolean(options.compact);
    const viewerId = options.viewerId || "";
    const events = [];

    const pushEventsFromUsage = (usageMap, stageLabelBuilder) => {
      this.players.forEach((player) => {
        if (viewerId && player.id === viewerId) {
          return;
        }
        const list = usageMap[player.id] || [];
        list.forEach((entry) => {
          const stage = stageLabelBuilder(entry.round);
          const actionIds = Array.isArray(entry.actions) ? entry.actions : [];
          actionIds.forEach((actionId) => {
            const def = this.getActionDefById(actionId);
            events.push({
              stage,
              playerId: player.id,
              playerName: player.name,
              actionType: def.type,
              actionName: def.name,
              actionId,
              ...(compact ? {} : { effectText: def.description }),
              resultPublic: false,
              publicResult: null
            });
          });
        });
      });
    };

    pushEventsFromUsage(this.playerUsageHistory, (roundNo) => `第 ${roundNo} 轮出价后`);

    this.players.forEach((player) => {
      if (viewerId && player.id === viewerId) {
        return;
      }
      const actionIds = this.currentRoundUsage[player.id] || [];
      actionIds.forEach((actionId) => {
        const def = this.getActionDefById(actionId);
        events.push({
          stage: `第 ${this.round} 轮出价前`,
          playerId: player.id,
          playerName: player.name,
          actionType: def.type,
          actionName: def.name,
          actionId,
          ...(compact ? {} : { effectText: def.description }),
          resultPublic: false,
          publicResult: null
        });
      });
    });

    if (this.currentPublicEvent) {
      events.push({
        stage: "开局",
        playerId: "system",
        playerName: "系统",
        actionType: "public-event",
        actionName: this.currentPublicEvent.category,
        actionId: this.currentPublicEvent.id,
        ...(compact ? {} : { effectText: this.currentPublicEvent.text }),
        resultPublic: true,
        publicResult: this.currentPublicEvent.text
      });
    }

    return events.slice(-30);
  }

  buildRoundPublicStateTable(viewerId) {
    const bidHistory = this.buildBidHistorySnapshot();
    const bidByRound = new Map(bidHistory.map((entry) => [entry.round, entry.bids || {}]));
    const actionPlayers = this.players.filter((player) => player.id !== viewerId);

    const columns = [
      "round_no",
      "round_stage",
      ...this.players.map((player) => `${player.id}_bid_value`),
      ...actionPlayers.map((player) => `${player.id}_public_action_ids`)
    ];

    const rows = [];
    const maxRound = Math.max(0, this.round);
    for (let roundNo = 1; roundNo <= maxRound; roundNo += 1) {
      const isCurrentRound = roundNo === this.round;
      const stage = isCurrentRound ? "pre_bid_current_round" : "post_bid";
      const roundBidMap = bidByRound.get(roundNo) || {};

      const bidValues = this.players.map((player) => {
        if (isCurrentRound) {
          return null;
        }
        return Math.round(Number(roundBidMap[player.id]) || 0);
      });

      const actionValues = actionPlayers.map((player) => {
        const actionIds = isCurrentRound
          ? (this.currentRoundUsage[player.id] || [])
          : ((this.playerUsageHistory[player.id] || []).find((entry) => entry.round === roundNo)?.actions || []);
        if (!Array.isArray(actionIds) || actionIds.length === 0) {
          return "none";
        }
        return actionIds.join("|");
      });

      rows.push([
        roundNo,
        stage,
        ...bidValues,
        ...actionValues
      ]);
    }

    return {
      columns,
      rows
    };
  }

  buildQualityPriceRangeTableCompact() {
    const columns = ["quality_key", "quality_name", "min_price", "max_price", "avg_price"];
    const rows = Object.keys(QUALITY_CONFIG).map((qualityKey) => {
      const entries = ARTIFACT_LIBRARY.filter((artifact) => artifact.qualityKey === qualityKey);
      const prices = entries
        .map((artifact) => Number(artifact.basePrice) || 0)
        .filter((value) => value > 0);
      const total = prices.reduce((sum, value) => sum + value, 0);
      const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
      const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
      const avgPrice = prices.length > 0 ? Math.round(total / prices.length) : 0;
      return [
        qualityKey,
        QUALITY_CONFIG[qualityKey] ? QUALITY_CONFIG[qualityKey].label : qualityKey,
        minPrice,
        maxPrice,
        avgPrice
      ];
    });

    return { columns, rows };
  }

  buildCatalogSummary(options = {}) {
    const compact = Boolean(options.compact);
    const prices = ARTIFACT_LIBRARY
      .map((entry) => Number(entry.basePrice) || 0)
      .filter((value) => value > 0)
      .sort((a, b) => a - b);
    const minPrice = prices.length > 0 ? prices[0] : 0;
    const maxPrice = prices.length > 0 ? prices[prices.length - 1] : 0;
    const qualityLabels = Object.values(QUALITY_CONFIG).map((entry) => entry.label);

    return {
      totalArtifacts: ARTIFACT_LIBRARY.length,
      qualityRangeText: `参考价值大致 ${minPrice}~${maxPrice}，品质档位：${qualityLabels.join("/")}`,
      ...(compact ? {} : {
        warehouseDefinition: `仓库是隐藏在 ${GRID_COLS}x${GRID_ROWS} 网格中的藏品堆栈；每件藏品都有固定的品质、品类、基础价格和占格尺寸，玩家只能通过出价、公开事件和私有探查去推断整座仓库的真实价值。`
      }),
      specialMechanismHint: "绝品或高价藏品可能为单格高价，也可能为多格组合高价。",
      poolRestrictionHint: "当前对局未设置朝代子集限制。",
      ...(compact
        ? { qualityPriceRangeTable: this.buildQualityPriceRangeTableCompact() }
        : { qualityPriceGuide: this.buildQualityPriceGuide({ compact }) })
    };
  }

  buildQualityPriceGuide(options = {}) {
    const compact = Boolean(options.compact);
    return Object.keys(QUALITY_CONFIG).map((qualityKey) => {
      const entries = ARTIFACT_LIBRARY.filter((artifact) => artifact.qualityKey === qualityKey);
      const prices = entries.map((artifact) => Number(artifact.basePrice) || 0).filter((value) => value > 0);
      const total = prices.reduce((sum, value) => sum + value, 0);
      const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
      const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;

      return {
        qualityKey,
        qualityName: QUALITY_CONFIG[qualityKey] ? QUALITY_CONFIG[qualityKey].label : qualityKey,
        ...(compact ? {} : {
          count: entries.length,
          minPrice,
          maxPrice
        }),
        avgPrice: prices.length > 0 ? Math.round(total / prices.length) : 0
      };
    });
  }

  getActionDefById(actionId) {
    const skill = SKILL_DEFS.find((entry) => entry.id === actionId);
    if (skill) {
      return {
        id: skill.id,
        type: "skill",
        name: skill.name,
        description: skill.description
      };
    }

    const item = ITEM_DEFS.find((entry) => entry.id === actionId);
    if (item) {
      return {
        id: item.id,
        type: "item",
        name: item.name,
        description: item.description
      };
    }

    return {
      id: actionId,
      type: "unknown",
      name: actionId,
      description: "未知动作"
    };
  }

  buildOtherPlayersPublicInfo(viewerId, options = {}) {
    const compact = Boolean(options.compact);
    return this.players
      .filter((player) => player.id !== viewerId)
      .map((player) => {
        const persona = this.aiEngine.personalityMap[player.id] || null;
        const usageNames = [];

        (this.playerUsageHistory[player.id] || []).forEach((entry) => {
          (entry.actions || []).forEach((actionId) => {
            usageNames.push(this.getActionDefById(actionId).name);
          });
        });

        return {
          playerId: player.id,
          playerName: player.name,
          roleName: persona ? persona.archetype : "玩家",
          passiveSkillText: persona
            ? `倾向：激进${persona.aggression.toFixed(2)}，纪律${persona.discipline.toFixed(2)}，跟风${persona.followRate.toFixed(2)}`
            : "未知",
          activeSkillList: compact
            ? SKILL_DEFS.map((entry) => ({ name: entry.name }))
            : SKILL_DEFS.map((entry) => ({
              name: entry.name,
              description: entry.description
            })),
          folded: false,
          publicUsedActions: [...new Set(usageNames)].slice(-10)
        };
      });
  }

  buildAiLlmRoundPayload(player) {
    return LLM_BRIDGE.methods.buildAiLlmRoundPayload.call(this, player);
  }

  buildAiFollowupRoundPayload(player, currentPlan, toolSummary) {
    return LLM_BRIDGE.methods.buildAiFollowupRoundPayload.call(this, player, currentPlan, toolSummary);
  }

  canUseLlmDecision() {
    return LLM_BRIDGE.methods.canUseLlmDecision.call(this);
  }

  isAiLlmEnabledForPlayer(playerId) {
    return LLM_BRIDGE.methods.isAiLlmEnabledForPlayer.call(this, playerId);
  }

  canUseLlmDecisionForPlayer(playerId) {
    return LLM_BRIDGE.methods.canUseLlmDecisionForPlayer.call(this, playerId);
  }

  buildAiDecisionUserPrompt(payload, extraBlocks = [], options = {}) {
    return LLM_BRIDGE.methods.buildAiDecisionUserPrompt.call(this, payload, extraBlocks, options);
  }

  extractAiDecisionObject(content) {
    return LLM_BRIDGE.methods.extractAiDecisionObject.call(this, content);
  }

  resolveActionPick(rawText, type, availableIds) {
    return LLM_BRIDGE.methods.resolveActionPick.call(this, rawText, type, availableIds);
  }

  normalizeAiLlmPlan(playerId, decision, rawContent, options = {}) {
    return LLM_BRIDGE.methods.normalizeAiLlmPlan.call(this, playerId, decision, rawContent, options);
  }

  async requestAiLlmPlan(player, options = {}) {
    return LLM_BRIDGE.methods.requestAiLlmPlan.call(this, player, options);
  }

  buildAiToolResultSummary(result, actionType, actionId) {
    return LLM_BRIDGE.methods.buildAiToolResultSummary.call(this, result, actionType, actionId);
  }

  async requestAiLlmFollowupBid(player, currentPlan, toolSummary) {
    return LLM_BRIDGE.methods.requestAiLlmFollowupBid.call(this, player, currentPlan, toolSummary);
  }

  async requestAiLlmErrorCorrection(player, currentPlan, errorInfo, correctionHistory, previousMessages) {
    return LLM_BRIDGE.methods.requestAiLlmErrorCorrection.call(this, player, currentPlan, errorInfo, correctionHistory, previousMessages);
  }

  async prepareAiLlmRoundPlans() {
    return LLM_BRIDGE.methods.prepareAiLlmRoundPlans.call(this);
  }

  captureAiDecisionTelemetry(roundBids) {
    return LLM_BRIDGE.methods.captureAiDecisionTelemetry.call(this, roundBids);
  }

  useSkill(skillId) {
    if (!this.canUseIntelActions()) {
      return;
    }

    if (!this.consumeAction("技能")) {
      return;
    }

    const result = this.skillManager.use(skillId, this.buildSkillContext());
    if (!result.ok) {
      this.actionsLeft += 1;
      this.writeLog(result.message);
      this.updateHud();
      return;
    }

    this.recordPlayerUsage(this.isLanMode ? this.lanMySlotId : "p2", skillId);
    const skillDef = SKILL_DEFS.find((s) => s.id === skillId);
    this.addPrivateIntelEntry({
      source: skillDef ? skillDef.name : skillId,
      text: skillDef ? skillDef.description : "技能效果"
    });
    this.writeLog(result.message);
    this.updateHud();
    if (this.isLanMode && this.lanBridge) {
      this.lanBridge.send({
        type: "lan:player-action",
        playerId: this.lanBridge.playerId,
        playerName: this.players.find((p) => p.id === (this.lanMySlotId || "p2"))?.name || "玩家",
        actionId: skillId,
        actionType: "skill",
        itemName: skillDef ? skillDef.name : skillId,
      });
    }
  }

  useItem(itemId) {
    if (!this.canUseIntelActions()) {
      this.closeItemDrawer();
      return;
    }

    if (!this.consumeAction("道具")) {
      this.closeItemDrawer();
      return;
    }

    const result = this.itemManager.use(itemId, this.buildSkillContext());
    if (!result.ok) {
      this.actionsLeft += 1;
      this.writeLog(result.message);
      this.updateHud();
      this.closeItemDrawer();
      return;
    }

    if (window.MobaoShopBridge) {
      window.MobaoShopBridge.consumeItem(itemId);
    }

    this.recordPlayerUsage(this.isLanMode ? this.lanMySlotId : "p2", itemId);
    const itemDef = ITEM_DEFS.find((i) => i.id === itemId);
    this.addPrivateIntelEntry({
      source: itemDef ? itemDef.name : itemId,
      text: itemDef ? itemDef.description : "道具效果"
    });
    this.writeLog(result.message);
    this.updateHud();
    this.closeItemDrawer();
    if (this.isLanMode && this.lanBridge) {
      this.lanBridge.send({
        type: "lan:player-action",
        playerId: this.lanBridge.playerId,
        playerName: this.players.find((p) => p.id === (this.lanMySlotId || "p2"))?.name || "玩家",
        actionId: itemId,
        actionType: "item",
        itemName: itemDef ? itemDef.name : itemId,
      });
    }
  }

  consumeAction(actionType) {
    if (this.round > GAME_SETTINGS.maxRounds) {
      this.writeLog("所有回合已结束，请重新随机开局。");
      return false;
    }

    if (this.actionsLeft <= 0) {
      this.writeLog(`本回合行动次数已耗尽，无法继续使用${actionType}。`);
      return false;
    }

    this.actionsLeft -= 1;
    return true;
  }

  getItemInfo(itemId) {
    const map = {
      "skill-outline-scan": {
        label: "技能-拓影侦测",
        tip: "拓影侦测：揭示目标藏品轮廓线索。玩家可见，AI为私有情报。"
      },
      "skill-quality-jade": {
        label: "技能-玉脉鉴质",
        tip: "玉脉鉴质：揭示目标藏品质地线索。玩家可见，AI为私有情报。"
      },
      "item-outline-lamp": {
        label: "探照灯",
        tip: "探照灯：揭示目标轮廓并扩大可判断范围。玩家可见，AI为私有情报。"
      },
      "item-quality-needle": {
        label: "鉴定针",
        tip: "鉴定针：揭示目标品质线索，帮助估值上限判断。玩家可见，AI为私有情报。"
      }
    };
    return map[itemId] || {
      label: "未知道具",
      tip: "未知道具：暂无说明。"
    };
  }

  toWorldPointFromRootEvent(event) {
    if (!this.dom.gameRoot) {
      return null;
    }

    const rect = this.dom.gameRoot.getBoundingClientRect();
    const x = this.dom.gameRoot.scrollLeft + (event.clientX - rect.left);
    const y = this.dom.gameRoot.scrollTop + (event.clientY - rect.top);
    return { x, y };
  }

  markRoundRanking(sorted) {
    const firstId = sorted[0]?.playerId;
    const secondId = sorted[1]?.playerId;

    this.players.forEach((player) => {
      const cardEl = document.getElementById(`playerCard-${player.id}`);
      if (!cardEl) {
        return;
      }

      cardEl.classList.remove("winner", "runner");
      if (player.id === firstId) {
        cardEl.classList.add("winner");
      } else if (player.id === secondId) {
        cardEl.classList.add("runner");
      }
    });
  }

  updateActionAvailability() {
    const lockedIntel = this.settled || this.roundResolving || this.roundPaused || this.playerBidSubmitted || this.roundTimeLeft <= 0;
    if (this.dom.itemOutlineBtn) {
      this.dom.itemOutlineBtn.disabled = lockedIntel;
    }
    if (this.dom.itemQualityBtn) {
      this.dom.itemQualityBtn.disabled = lockedIntel;
    }
    if (this.dom.itemDrawerToggleBtn) {
      this.dom.itemDrawerToggleBtn.disabled = lockedIntel;
      if (lockedIntel) {
        this.closeItemDrawer();
      }
    }

    const lockedBid = this.settled || this.roundResolving || this.roundPaused || this.playerBidSubmitted;
    this.dom.skillBtn.disabled = lockedIntel;
    this.dom.bidInput.disabled = lockedBid;
    if (lockedBid) {
      this.closeBidKeypad();
    }

    this.dom.nextRoundBtn.disabled = this.settled || this.roundResolving || this.roundPaused;
    this.dom.settleBtn.disabled = this.settled || this.roundResolving || this.roundPaused;
    if (this.dom.pauseRoundBtn) {
      this.dom.pauseRoundBtn.disabled = this.settled || this.roundResolving;
      if (this.isLanMode && !this.lanIsHost) {
        this.dom.pauseRoundBtn.style.display = "none";
      } else {
        this.dom.pauseRoundBtn.style.display = "";
      }
    }
    if (this.isLanMode) {
      this.dom.nextRoundBtn.style.display = "none";
      this.dom.settleBtn.style.display = "none";
    } else {
      this.dom.nextRoundBtn.style.display = "";
      this.dom.settleBtn.style.display = "";
    }
  }

  async finishAuction(winner, mode) {
    const winnerPlayer = this.players.find((player) => player.id === winner.playerId);
    const winnerBid = winner.bid;

    this.currentBid = winnerBid;
    this.bidLeader = winner.playerId;
    this.settled = true;
    this.stopRoundTimer();
    const reasonTextMap = {
      direct: "提前拿下",
      final: "最终回合高价胜出",
      manual: "手动结算"
    };

    this.enterSettlementPage(winnerPlayer, winnerBid, reasonTextMap[mode] || "结算");

    const totalValue = this.warehouseTrueValue;
    const winnerProfit = totalValue - winnerBid;

    try {
      await this.revealAllArtifactsForSettlement();
    } catch (revealError) {
      this.writeLog(`揭示藏品时发生异常：${revealError && revealError.message ? revealError.message : "未知错误"}`);
      if (typeof console !== "undefined" && console.error) {
        console.error("revealAllArtifactsForSettlement failed", revealError);
      }
    }

    if (this.isLanMode) {
      const DIVIDEND_RATIO = 0.15;
      const TICKET_RATIO = 0.05;
      const nonWinners = this.players.filter((p) => p.id !== winnerPlayer.id);
      let lanDividendPerPlayer = 0;
      let lanTicketPerPlayer = 0;
      let lanSelfProfit = 0;
      let lanSelfProfitLabel = "自身利润";
      const lanSelfNonWinner = nonWinners.find((p) => p.isSelf);

      if (winnerProfit < 0) {
        lanDividendPerPlayer = Math.round(Math.abs(winnerProfit) * DIVIDEND_RATIO);
        if (lanSelfNonWinner) {
          if (this.lanIsHost) {
            this.playerMoney += lanDividendPerPlayer;
          }
          lanSelfProfit = lanDividendPerPlayer;
          lanSelfProfitLabel = "自身利润（分红）";
          this.writeLog(`分红：拍下者亏损，非拍下者各获得亏损的15%（+${lanDividendPerPlayer}）。`);
        }
        if (this.lanIsHost) {
          nonWinners.forEach((p) => {
            if (!p.isSelf && !p.isAI) {
              const wallet = this.lanHostWallets[p.lanId] || 0;
              this.lanHostWallets[p.lanId] = wallet + lanDividendPerPlayer;
            } else if (p.isAI) {
              const wallet = this.getAiWallet(p.id);
              this.aiWallets[p.id] = wallet + lanDividendPerPlayer;
            }
          });
        }
      } else if (winnerProfit > 0) {
        lanTicketPerPlayer = Math.round(winnerProfit * TICKET_RATIO);
        if (lanSelfNonWinner) {
          if (this.lanIsHost) {
            this.playerMoney -= lanTicketPerPlayer;
          }
          lanSelfProfit = -lanTicketPerPlayer;
          lanSelfProfitLabel = "自身利润（门票）";
          this.writeLog(`门票：拍下者盈利，非拍下者各扣除盈利的5%（-${lanTicketPerPlayer}）。`);
        }
        if (this.lanIsHost) {
          nonWinners.forEach((p) => {
            if (!p.isSelf && !p.isAI) {
              const wallet = this.lanHostWallets[p.lanId] || 0;
              this.lanHostWallets[p.lanId] = Math.max(0, wallet - lanTicketPerPlayer);
            } else if (p.isAI) {
              const wallet = this.getAiWallet(p.id);
              this.aiWallets[p.id] = Math.max(0, wallet - lanTicketPerPlayer);
            }
          });
        }
      }

      this.updateSettlementPanelMetrics(totalValue, winnerProfit);
      if (lanSelfNonWinner) {
        this.showSelfProfit(lanSelfProfit, lanSelfProfitLabel);
      }
      this.setSettlementProgress(`揭示完成：${winnerPlayer.name} 的最终利润 ${winnerProfit >= 0 ? "+" : ""}${winnerProfit}`);
      this.writeLog(`联机结算：${winnerPlayer.name} 以 ${winnerBid} 拿下整仓，利润 ${winnerProfit >= 0 ? "+" : ""}${winnerProfit}。`);

      this.saveBattleRecord({
        mode,
        winnerId: winnerPlayer.id,
        winnerName: winnerPlayer.name,
        winnerBid,
        totalValue,
        winnerProfit,
        playerProfit: winnerPlayer.isSelf ? winnerProfit : lanSelfProfit,
        playerWon: winnerPlayer.isSelf && winnerProfit > 0,
        dividendTicketInfo: winnerPlayer.isSelf ? null : {
          dividendPerPlayer: lanDividendPerPlayer,
          ticketPerPlayer: lanTicketPerPlayer,
          mechanism: lanDividendPerPlayer > 0 ? "dividend" : (lanTicketPerPlayer > 0 ? "ticket" : "none")
        },
        reasonText: "联机结算"
      });
      return;
    }

    const DIVIDEND_RATIO = 0.15;
    const TICKET_RATIO = 0.05;
    const nonWinners = this.players.filter((p) => p.id !== winnerPlayer.id);
    let dividendPerPlayer = 0;
    let ticketPerPlayer = 0;
    let selfProfit = 0;
    let selfProfitLabel = "自身利润";
    const humanNonWinner = nonWinners.find((p) => p.isSelf);

    if (winnerProfit < 0) {
      dividendPerPlayer = Math.round(Math.abs(winnerProfit) * DIVIDEND_RATIO);
      nonWinners.forEach((p) => {
        if (p.isSelf) {
          this.playerMoney += dividendPerPlayer;
        } else {
          const wallet = this.getAiWallet(p.id);
          this.aiWallets[p.id] = wallet + dividendPerPlayer;
        }
      });
      if (humanNonWinner) {
        selfProfit = dividendPerPlayer;
        selfProfitLabel = "自身利润（分红）";
        this.writeLog(`分红：拍下者亏损，非拍下者各获得亏损的15%（+${dividendPerPlayer}）。`);
      }
    } else if (winnerProfit > 0) {
      ticketPerPlayer = Math.round(winnerProfit * TICKET_RATIO);
      nonWinners.forEach((p) => {
        if (p.isSelf) {
          this.playerMoney -= ticketPerPlayer;
        } else {
          const wallet = this.getAiWallet(p.id);
          this.aiWallets[p.id] = Math.max(0, wallet - ticketPerPlayer);
        }
      });
      if (humanNonWinner) {
        selfProfit = -ticketPerPlayer;
        selfProfitLabel = "自身利润（门票）";
        this.writeLog(`门票：拍下者盈利，非拍下者各扣除盈利的5%（-${ticketPerPlayer}）。`);
      }
    }

    this.updateSettlementPanelMetrics(totalValue, winnerProfit);
    if (humanNonWinner) {
      this.showSelfProfit(selfProfit, selfProfitLabel);
    }
    this.setSettlementProgress(`揭示完成：${winnerPlayer.name} 的最终利润 ${winnerProfit >= 0 ? "+" : ""}${winnerProfit}`);
    this.saveBattleRecord({
      mode,
      winnerId: winnerPlayer.id,
      winnerName: winnerPlayer.name,
      winnerBid,
      totalValue,
      winnerProfit,
      playerProfit: winnerPlayer.isSelf ? winnerProfit : selfProfit,
      playerWon: winnerPlayer.isSelf && winnerProfit > 0,
      dividendTicketInfo: winnerPlayer.isSelf ? null : {
        dividendPerPlayer,
        ticketPerPlayer,
        mechanism: dividendPerPlayer > 0 ? "dividend" : (ticketPerPlayer > 0 ? "ticket" : "none")
      },
      reasonText: reasonTextMap[mode] || "结算"
    });

    const dividendTicketInfo = {
      dividendPerPlayer,
      ticketPerPlayer,
      mechanism: dividendPerPlayer > 0 ? "dividend" : (ticketPerPlayer > 0 ? "ticket" : "none")
    };

    this.pushRunSettlementContextToAi({
      winnerName: winnerPlayer.name,
      winnerBid,
      totalValue,
      winnerProfit,
      reasonText: reasonTextMap[mode] || "结算",
      dividendTicketInfo
    });

    const settlementResult = {
      winnerId: winnerPlayer.id,
      winnerName: winnerPlayer.name,
      winnerBid,
      totalValue,
      winnerProfit,
      reasonText: reasonTextMap[mode] || "结算",
      dividendTicketInfo
    };
    const crossGameRecord = this.createCrossGameRecord(settlementResult);
    this.saveCrossGameRecord(crossGameRecord);
    this.triggerAiReflection(crossGameRecord).catch(() => { });

    if (winnerPlayer.isSelf) {
      if (!this.hasAppliedMoneyForRun()) {
        this.playerMoney += winnerProfit;
        savePlayerMoney(this.playerMoney);
        this.markMoneyAppliedForRun();
      }
      this.writeLog(`结算完成：你以 ${winnerBid} 拿下整仓，${winnerProfit >= 0 ? "盈利" : "亏损"} ${Math.abs(winnerProfit)}。`);
    } else {
      savePlayerMoney(this.playerMoney);
      this.writeLog(`结算完成：${winnerPlayer.name} 以 ${winnerBid} 拿下整仓，利润 ${winnerProfit >= 0 ? "+" : ""}${winnerProfit}。`);
    }

    const selfPlayer = this.players.find((p) => p.isSelf);
    if (selfPlayer && window.MobaoAppState) {
      const playerIsWinner = winnerPlayer.isSelf;
      const playerProfit = playerIsWinner ? winnerProfit : selfProfit;
      const playerWon = playerIsWinner && winnerProfit > 0;
      window.MobaoAppState.recordGameFinished(playerWon, playerProfit);
    }

    this.updateHud();
  }

  async revealAllArtifactsForSettlement() {
    return SETTLEMENT_BRIDGE.methods.revealAllArtifactsForSettlement.call(this);
  }

  isSettlementPageActive() {
    return SETTLEMENT_BRIDGE.methods.isSettlementPageActive.call(this);
  }

  async playSettlementRevealStep(item) {
    return SETTLEMENT_BRIDGE.methods.playSettlementRevealStep.call(this, item);
  }

  async playSettlementSearchEffect(item, runToken) {
    return SETTLEMENT_BRIDGE.methods.playSettlementSearchEffect.call(this, item, runToken);
  }

  enterSettlementPage(winnerPlayer, winnerBid, reasonText) {
    return SETTLEMENT_BRIDGE.methods.enterSettlementPage.call(this, winnerPlayer, winnerBid, reasonText);
  }

  exitSettlementPage() {
    return SETTLEMENT_BRIDGE.methods.exitSettlementPage.call(this);
  }

  cancelSettlementReveal() {
    return SETTLEMENT_BRIDGE.methods.cancelSettlementReveal.call(this);
  }

  setSettlementProgress(text) {
    return SETTLEMENT_BRIDGE.methods.setSettlementProgress.call(this, text);
  }

  updateSettlementPanelMetrics(revealedValue, winnerProfit) {
    return SETTLEMENT_BRIDGE.methods.updateSettlementPanelMetrics.call(this, revealedValue, winnerProfit);
  }

  showSelfProfit(selfProfit, label) {
    return SETTLEMENT_BRIDGE.methods.showSelfProfit.call(this, selfProfit, label);
  }

  updateHud() {
    const skillState = this.skillManager.getSkillState();
    const itemState = this.itemManager.getItemState();

    const clueCount = this.items.filter((item) => this.hasAnyInfo(item)).length;
    const occupiedCells = this.items.reduce((sum, item) => sum + item.w * item.h, 0);
    const capacity = GRID_COLS * GRID_ROWS;
    const bidState = this.playerBidSubmitted ? `玩家本轮已出价: ${this.playerRoundBid}` : "玩家本轮未出价";
    const timerClass = this.roundPaused
      ? "round-timer-hot"
      : (this.roundTimeLeft <= 5 ? "round-timer-hot is-danger" : "round-timer-hot");
    const timerText = this.roundPaused ? `已暂停 ${this.roundTimeLeft}s` : `倒计时 ${this.roundTimeLeft}s`;

    const hudRoundText = this.dom.hudRound.querySelector('.hud-text');
    const hudTimerText = this.dom.hudTimer.querySelector('.hud-text');
    const hudMoneyText = this.dom.hudMoney.querySelector('.hud-text');

    if (hudRoundText) hudRoundText.textContent = `第 ${this.round}/${GAME_SETTINGS.maxRounds} 回合`;
    if (hudTimerText) hudTimerText.innerHTML = `<span class="${timerClass}">${timerText}</span>`;
    if (hudMoneyText) hudMoneyText.textContent = this.playerMoney.toLocaleString();
    this.renderItemDrawer();
    this.updateSidePanels(skillState, itemState, clueCount, occupiedCells, capacity, bidState);
    this.updateActionAvailability();
  }

  makeRunToken() {
    return `${Date.now()}-${Math.random().toString(16).slice(2, 9)}`;
  }

  hasAppliedMoneyForRun() {
    if (!this.moneySettledRunToken) {
      return false;
    }
    const raw = window.localStorage.getItem("mobao_money_settled_run");
    return raw === this.moneySettledRunToken;
  }

  markMoneyAppliedForRun() {
    if (!this.moneySettledRunToken) {
      return;
    }
    window.localStorage.setItem("mobao_money_settled_run", this.moneySettledRunToken);
  }

  getLlmSettings() {
    if (window.LlmManager) {
      const provider = window.LlmManager.getProvider();
      if (provider) {
        const settings = provider.loadSettings();
        return settings;
      }
    }
    return LLM_SETTINGS;
  }

  getLlmProvider() {
    if (window.LlmManager) {
      const provider = window.LlmManager.getProvider();
      if (provider) {
        return provider;
      }
    }
    if (window.DeepSeekLLM) {
      return {
        requestChat: (options) => window.DeepSeekProvider.requestChat(options),
        applySettings: (settings) => window.DeepSeekProvider.applySettings(settings)
      };
    }
    return null;
  }
}

Object.assign(WarehouseScene.prototype, window.MobaoWarehouse.WarehouseCoreMixin);
Object.assign(WarehouseScene.prototype, window.MobaoWarehouse.WarehouseRevealMixin);
Object.assign(WarehouseScene.prototype, window.MobaoWarehouse.WarehousePreviewMixin);
Object.assign(WarehouseScene.prototype, window.MobaoAi.WalletMixin);
Object.assign(WarehouseScene.prototype, window.MobaoAi.IntelMixin);
Object.assign(WarehouseScene.prototype, window.MobaoAi.MemoryMixin);
Object.assign(WarehouseScene.prototype, window.MobaoAi.ReflectionMixin);
Object.assign(WarehouseScene.prototype, window.MobaoAi.DecisionMixin);
Object.assign(WarehouseScene.prototype, window.MobaoBidding.BiddingMixin);
Object.assign(WarehouseScene.prototype, window.MobaoUi.OverlayMixin);
Object.assign(WarehouseScene.prototype, window.MobaoUi.PanelsMixin);
Object.assign(WarehouseScene.prototype, window.MobaoUi.HistoryMixin);
Object.assign(WarehouseScene.prototype, window.MobaoLobby.IndexMixin);
Object.assign(WarehouseScene.prototype, window.MobaoLobby.CarouselMixin);
Object.assign(WarehouseScene.prototype, window.MobaoLan.IndexMixin);

const config = {
  type: Phaser.AUTO,
  parent: "game-root",
  width: MARGIN * 2 + GRID_COLS * CELL_SIZE,
  height: MARGIN * 2 + GRID_ROWS * CELL_SIZE,
  backgroundColor: "transparent",
  transparent: true,
  pixelArt: false,
  antialias: true,
  roundPixels: false,
  resolution: Math.min(window.devicePixelRatio || 1, 2),
  input: {
    touch: {
      capture: false
    }
  },
  scene: [WarehouseScene]
};

new Phaser.Game(config);
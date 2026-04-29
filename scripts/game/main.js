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
} = window.DeepSeekLLM;
const LLM_SETTINGS = loadDeepSeekSettings();
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
    this.deepSeekClient = new DeepSeekClient(LLM_SETTINGS);
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

    this.areaTitleText = null;
    this.previewOpenTick = 0;
    this.roundTimerId = null;
    this.roundPaused = false;
    this.roundResolving = false;
    this.playerBidSubmitted = false;
    this.playerRoundBid = 0;
    this.useQualityText = true;
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
      battleRecordBtn: null,
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
      personalPanelScroll: null,
      publicInfoScroll: null
    };

    this.keypadValue = "0";
  }

  create() {
    window.WarehouseScene = WarehouseScene;
    WarehouseScene.instance = this;
    this.cacheDom();
    this.bindDomEvents();
    this.bindLobbyEvents();
    this.initPlayersUI();
    this.initPreviewFilterOptions();
    this.enterLobby();
  }

  cacheDom() {
    this.dom.hudRound = document.getElementById("hudRound");
    this.dom.hudTimer = document.getElementById("hudTimer");
    this.dom.hudMoney = document.getElementById("hudMoney");
    this.dom.actionLog = document.getElementById("actionLog");
    this.dom.aiThoughtContent = document.getElementById("aiThoughtContent");
    this.dom.openSettingsBtn = document.getElementById("openSettingsBtn");
    this.dom.battleRecordBtn = document.getElementById("battleRecordBtn");
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
    this.dom.settingDeepseekApiKey = document.getElementById("setting-deepseekApiKey");
    this.dom.settingDeepseekModel = document.getElementById("setting-deepseekModel");
    this.dom.settingMaxTokens = document.getElementById("setting-maxTokens");
    this.dom.settingsTestDeepSeekBtn = document.getElementById("settingsTestDeepSeekBtn");
    this.dom.settingsLlmStatusText = document.getElementById("settingsLlmStatusText");
    this.dom.clearAiMemoryBtn = document.getElementById("clearAiMemoryBtn");
    this.dom.aiMemoryStatusText = document.getElementById("aiMemoryStatusText");
    this.dom.viewAiMemoryBtn = document.getElementById("viewAiMemoryBtn");
    this.dom.aiMemoryOverlay = document.getElementById("aiMemoryOverlay");
    this.dom.aiMemoryPanel = document.getElementById("aiMemoryPanel");
    this.dom.aiMemoryCloseBtn = document.getElementById("aiMemoryCloseBtn");
    this.dom.aiMemoryContent = document.getElementById("aiMemoryContent");
    this.dom.settingLlmReflectionEnabled = document.getElementById("setting-llmReflectionEnabled");

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
    if (this.dom.battleRecordBtn) {
      this.dom.battleRecordBtn.addEventListener("click", () => this.openBattleRecordPanel());
    }
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
        this.openBattleRecordPanel();
        this.writeLog("已返回战绩列表，可继续选择其他战绩回放。");
        this.updateHud();
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
      this.fillLlmSettingsForm(defaultDeepSeekSettings());
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

  bindLobbyEvents() {
    const soloBtn = document.getElementById("lobbySoloBtn");
    const onlineBtn = document.getElementById("lobbyOnlineBtn");
    const lobbySettingsBtn = document.getElementById("lobbySettingsBtn");
    const lobbyBattleRecordBtn = document.getElementById("lobbyBattleRecordBtn");
    const lobbyShopBtn = document.getElementById("lobbyShopBtn");
    const lobbySoloBackBtn = document.getElementById("lobbySoloBackBtn");
    const lobbySoloShopBtn = document.getElementById("lobbySoloShopBtn");
    const lobbyOnlineBackBtn = document.getElementById("lobbyOnlineBackBtn");
    const lobbyStartGameBtn = document.getElementById("lobbyStartGameBtn");
    const carouselLeftBtn = document.getElementById("carouselLeftBtn");
    const carouselRightBtn = document.getElementById("carouselRightBtn");

    if (soloBtn) {
      soloBtn.addEventListener("click", () => this.showLobbySubPage("soloSetup"));
    }
    if (onlineBtn) {
      onlineBtn.addEventListener("click", () => this.showLobbySubPage("onlinePlaceholder"));
    }
    if (lobbySettingsBtn) {
      lobbySettingsBtn.addEventListener("click", () => this.openSettingsOverlay());
    }
    if (lobbyBattleRecordBtn) {
      lobbyBattleRecordBtn.addEventListener("click", () => this.openBattleRecordPanel());
    }
    if (lobbyShopBtn) {
      lobbyShopBtn.addEventListener("click", () => this.openShopOverlay());
    }
    if (lobbySoloBackBtn) {
      lobbySoloBackBtn.addEventListener("click", () => this.showLobbyMain());
    }
    if (lobbySoloShopBtn) {
      lobbySoloShopBtn.addEventListener("click", () => this.openShopOverlay());
    }
    if (lobbyOnlineBackBtn) {
      lobbyOnlineBackBtn.addEventListener("click", () => this.showLobbyMain());
    }
    if (lobbyStartGameBtn) {
      lobbyStartGameBtn.addEventListener("click", () => this.startSoloGame());
    }
    if (carouselLeftBtn) {
      carouselLeftBtn.addEventListener("click", () => this.carouselScroll(-1));
    }
    if (carouselRightBtn) {
      carouselRightBtn.addEventListener("click", () => this.carouselScroll(1));
    }

    this._carouselOffset = 0;
    this.renderCarousel();
    this.initLanLobby();
  }

  showLobbyMain() {
    const main = document.getElementById("lobbyMain");
    const soloSetup = document.getElementById("lobbySoloSetup");
    const onlinePlaceholder = document.getElementById("lobbyOnlinePlaceholder");
    if (main) main.classList.remove("hidden");
    if (soloSetup) soloSetup.classList.add("hidden");
    if (onlinePlaceholder) onlinePlaceholder.classList.add("hidden");
  }

  showLobbySubPage(page) {
    const main = document.getElementById("lobbyMain");
    const soloSetup = document.getElementById("lobbySoloSetup");
    const onlinePlaceholder = document.getElementById("lobbyOnlinePlaceholder");
    if (main) main.classList.add("hidden");
    if (soloSetup) soloSetup.classList.add("hidden");
    if (onlinePlaceholder) onlinePlaceholder.classList.add("hidden");

    if (page === "soloSetup") {
      if (soloSetup) soloSetup.classList.remove("hidden");
      this.renderCarousel();
      this.renderMapDetail();
      this.updateLobbyMoneyDisplay();
    } else if (page === "onlinePlaceholder") {
      if (onlinePlaceholder) onlinePlaceholder.classList.remove("hidden");
      this.updateLobbyMoneyDisplay();
      const onlineMoney = document.getElementById("lobbyOnlineMoney");
      if (onlineMoney) onlineMoney.textContent = "资金：" + this.playerMoney.toLocaleString();
    }
  }

  renderCarousel() {
    const track = document.getElementById("carouselTrack");
    if (!track || !window.MobaoMapProfiles) {
      return;
    }

    const profiles = window.MobaoMapProfiles.getAllProfiles();
    const selectedId = window.MobaoMapProfiles.getSelectedProfileId();

    track.innerHTML = profiles.map((p) => {
      const isSelected = p.id === selectedId;
      return [
        '<div class="lobby-map-card' + (isSelected ? ' selected' : '') + '" data-map-id="' + p.id + '">',
        '<span class="lobby-map-card-icon">' + p.icon + '</span>',
        '<span class="lobby-map-card-name">' + p.name + '</span>',
        '<span class="lobby-map-card-desc">' + p.desc + '</span>',
        '</div>'
      ].join("");
    }).join("");

    track.querySelectorAll(".lobby-map-card").forEach((card) => {
      card.addEventListener("click", () => {
        const id = card.getAttribute("data-map-id");
        window.MobaoMapProfiles.setSelectedProfileId(id);
        track.querySelectorAll(".lobby-map-card").forEach((c) => c.classList.remove("selected"));
        card.classList.add("selected");
        this.renderMapDetail();
      });
    });

    this._carouselOffset = 0;
    this.updateCarouselPosition();
    this.bindCarouselTouch();
  }

  bindCarouselTouch() {
    const wrap = document.querySelector(".carousel-track-wrap");
    if (!wrap || wrap._touchBound) return;
    wrap._touchBound = true;

    let startX = 0;
    let startY = 0;
    let dragging = false;

    wrap.addEventListener("touchstart", (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      dragging = true;
    }, { passive: true });

    wrap.addEventListener("touchend", (e) => {
      if (!dragging) return;
      dragging = false;
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 30) {
        this.carouselScroll(dx < 0 ? 1 : -1);
      }
    }, { passive: true });
  }

  carouselScroll(direction) {
    const track = document.getElementById("carouselTrack");
    if (!track) return;
    const cards = track.querySelectorAll(".lobby-map-card");
    const maxOffset = Math.max(0, cards.length - 3);
    this._carouselOffset = Math.max(0, Math.min(maxOffset, this._carouselOffset + direction));
    this.updateCarouselPosition();
  }

  updateCarouselPosition() {
    const track = document.getElementById("carouselTrack");
    const leftBtn = document.getElementById("carouselLeftBtn");
    const rightBtn = document.getElementById("carouselRightBtn");
    if (!track) return;

    const cardWidth = 174;
    track.style.transform = 'translateX(' + (-this._carouselOffset * cardWidth) + 'px)';

    const cards = track.querySelectorAll(".lobby-map-card");
    const maxOffset = Math.max(0, cards.length - 3);
    if (leftBtn) leftBtn.disabled = this._carouselOffset <= 0;
    if (rightBtn) rightBtn.disabled = this._carouselOffset >= maxOffset;
  }

  renderMapDetail() {
    const detail = document.getElementById("lobbyMapDetail");
    if (!detail || !window.MobaoMapProfiles) return;

    const profile = window.MobaoMapProfiles.getProfile(
      window.MobaoMapProfiles.getSelectedProfileId()
    );
    if (!profile) return;

    const p = profile.params;
    const qualityLabels = { poor: "粗品", normal: "良品", fine: "精品", rare: "珍品", legendary: "绝品" };
    const toLevel = (v, thresholds) => {
      for (let i = 0; i < thresholds.length; i++) {
        if (v < thresholds[i][0]) return thresholds[i][1];
      }
      return thresholds[thresholds.length - 1][1];
    };
    const totalQ = Object.values(p.qualityWeights || {}).reduce((s, v) => s + v, 0) || 1;
    const highQ = ((p.qualityWeights.fine || 0) + (p.qualityWeights.rare || 0) + (p.qualityWeights.legendary || 0)) / totalQ;
    const lowQ = (p.qualityWeights.poor || 0) / totalQ;
    const takeRatio = p.directTakeRatio || 0.2;
    const rounds = p.maxRounds || 5;

    const qualityLevel = toLevel(highQ, [[0.2, "低"], [0.35, "较低"], [0.5, "中"], [0.65, "较高"], [1, "高"]]);
    const lowLevel = toLevel(lowQ, [[0.15, "低"], [0.25, "较低"], [0.35, "中"], [0.45, "较高"], [1, "高"]]);
    const takeLevel = toLevel(takeRatio, [[0.12, "低"], [0.18, "较低"], [0.25, "中"], [0.35, "较高"], [1, "高"]]);
    const roundLevel = toLevel(rounds, [[4, "少"], [5, "中"], [7, "多"]]);

    const qualityLines = Object.entries(p.qualityWeights || {}).map(([k, v]) => {
      const pct = Math.round((v / totalQ) * 100);
      const lv = toLevel(pct, [[8, "低"], [16, "较低"], [26, "中"], [36, "较高"], [100, "高"]]);
      return '<div class="lobby-map-detail-row"><span class="lobby-map-detail-label">' + (qualityLabels[k] || k) + '</span><span class="lobby-map-detail-value">' + lv + '</span></div>';
    }).join("");

    detail.innerHTML = [
      '<div class="lobby-map-detail-title">' + profile.icon + ' ' + profile.name + '</div>',
      '<div class="lobby-map-detail-row"><span class="lobby-map-detail-label">回合数</span><span class="lobby-map-detail-value">' + roundLevel + '</span></div>',
      '<div class="lobby-map-detail-row"><span class="lobby-map-detail-label">直接拿下</span><span class="lobby-map-detail-value">' + takeLevel + '</span></div>',
      '<div class="lobby-map-detail-row"><span class="lobby-map-detail-label">高品质占比</span><span class="lobby-map-detail-value">' + qualityLevel + '</span></div>',
      '<div class="lobby-map-detail-row"><span class="lobby-map-detail-label">低品质占比</span><span class="lobby-map-detail-value">' + lowLevel + '</span></div>',
      qualityLines,
      '<div class="lobby-map-detail-hint" id="mapDetailHint">↓ 向下滑动查看更多</div>'
    ].join("");

    const hint = document.getElementById("mapDetailHint");
    if (hint) {
      const checkScroll = () => {
        const atBottom = detail.scrollHeight - detail.scrollTop <= detail.clientHeight + 4;
        hint.style.display = atBottom ? "none" : "";
      };
      detail.removeEventListener("scroll", detail._mapDetailScrollHandler);
      detail._mapDetailScrollHandler = checkScroll;
      detail.addEventListener("scroll", checkScroll);
      requestAnimationFrame(checkScroll);
    }
  }

  openShopOverlay() {
    const overlay = document.getElementById("shopOverlay");
    if (!overlay) return;
    overlay.classList.remove("hidden");
    this.renderShopContent();
    this.updateLobbyMoneyDisplay();

    const closeBtn = document.getElementById("shopCloseBtn");
    if (closeBtn && !closeBtn._shopBound) {
      closeBtn._shopBound = true;
      closeBtn.addEventListener("click", () => this.closeShopOverlay());
    }

    overlay.onclick = (e) => {
      if (e.target === overlay) this.closeShopOverlay();
    };
  }

  closeShopOverlay() {
    const overlay = document.getElementById("shopOverlay");
    if (overlay) overlay.classList.add("hidden");
    this.updateLobbyMoneyDisplay();
    if (!document.getElementById("gameArea").classList.contains("hidden")) {
      this.updateHud();
    }
  }

  renderShopContent() {
    const listEl = document.getElementById("shopList");
    const invEl = document.getElementById("shopInventory");
    const moneyEl = document.getElementById("shopMoneyDisplay");
    if (!listEl || !window.MobaoShopBridge) return;

    const money = window.MobaoShopBridge.getPlayerMoney();
    if (moneyEl) moneyEl.textContent = "资金：" + money.toLocaleString();

    const items = window.MobaoShopBridge.SHOP_ITEMS;
    listEl.innerHTML = items.map((si) => {
      const remaining = window.MobaoShopBridge.getRemainingDaily(si.id);
      const owned = window.MobaoShopBridge.getItemCount(si.id);
      const canBuy = remaining > 0 && money >= si.price;
      return [
        '<div class="shop-item">',
        '<span class="shop-item-icon">' + si.icon + '</span>',
        '<div class="shop-item-info">',
        '<span class="shop-item-name">' + si.name + '</span>',
        '<span class="shop-item-desc">' + si.description + '</span>',
        '<span class="shop-item-daily">今日剩余 ' + remaining + '/' + si.maxDaily + ' | 持有 ' + owned + '</span>',
        '</div>',
        '<button class="shop-item-buy" data-shop-item-id="' + si.id + '"' + (canBuy ? '' : ' disabled') + ' type="button">' + si.price.toLocaleString() + '</button>',
        '</div>'
      ].join("");
    }).join("");

    listEl.querySelectorAll(".shop-item-buy").forEach((btn) => {
      btn.addEventListener("click", () => {
        const itemId = btn.getAttribute("data-shop-item-id");
        const result = window.MobaoShopBridge.purchaseItem(itemId);
        if (result.ok) {
          this.playerMoney = result.newMoney;
          this.syncItemManagerFromShop();
          this.renderShopContent();
          this.updateLobbyMoneyDisplay();
        } else {
          alert(result.message);
        }
      });
    });

    if (invEl) {
      const inv = window.MobaoShopBridge.getFullInventory();
      invEl.innerHTML = [
        '<div class="shop-inventory-title">当前库存</div>',
        '<div class="shop-inventory-row"><span>探照灯</span><span>x' + inv.outlineLamp + '</span></div>',
        '<div class="shop-inventory-row"><span>鉴定针</span><span>x' + inv.qualityNeedle + '</span></div>'
      ].join("");
    }
  }

  syncItemManagerFromShop() {
    if (!window.MobaoShopBridge) return;
    const inv = window.MobaoShopBridge.getFullInventory();
    this.itemManager.items.forEach((item) => {
      if (item.id === "item-outline-lamp") {
        item.count = inv.outlineLamp;
      } else if (item.id === "item-quality-needle") {
        item.count = inv.qualityNeedle;
      }
    });
  }

  updateLobbyMoneyDisplay() {
    const money = window.MobaoShopBridge ? window.MobaoShopBridge.getPlayerMoney() : loadPlayerMoney();
    const mainMoney = document.getElementById("lobbyMainMoney");
    const soloMoney = document.getElementById("lobbySoloMoney");
    const text = "资金：" + money.toLocaleString();
    if (mainMoney) mainMoney.textContent = text;
    if (soloMoney) soloMoney.textContent = text;
  }

  cleanupGameScene() {
    this.stopRoundTimer();
    if (this.itemLayer) {
      this.itemLayer.destroy(true);
      this.itemLayer = null;
    }
    if (this.gridLayer) {
      this.gridLayer.destroy();
      this.gridLayer = null;
    }
    if (this.revealCellLayer) {
      this.revealCellLayer.destroy();
      this.revealCellLayer = null;
    }
    if (this.areaTitleText) {
      this.areaTitleText.destroy();
      this.areaTitleText = null;
    }
    if (this.activeSettlementSpinner) {
      this.activeSettlementSpinner.destroy();
      this.activeSettlementSpinner = null;
    }
    this.tweens.killAll();
    this.items = [];
    this.time.removeAllEvents();
  }

  enterLobby() {
    this.cleanupGameScene();
    const lobbyPage = document.getElementById("lobbyPage");
    const gameArea = document.getElementById("gameArea");
    if (lobbyPage) {
      lobbyPage.classList.remove("hidden");
    }
    if (gameArea) {
      gameArea.classList.add("hidden");
    }
    if (this.game && this.game.loop) {
      this.game.loop.sleep();
    }
    this.isLanMode = false;
    this.lanIsHost = false;
    this.lanPlayers = [];
    this.lanAiPlayers = [];
    this.lanHostWallets = {};
    this.lanHostBids = {};
    this.lanAiLlmEnabled = false;
    this.lanIdToSlotId = {};
    this.slotIdToLanId = {};
    this.lanMySlotId = null;
    this.players = [
      { id: "p1", name: "左上AI", avatar: "A1", isHuman: false, isAI: true, isSelf: false },
      { id: "p2", name: "玩家", avatar: "你", isHuman: true, isAI: false, isSelf: true },
      { id: "p3", name: "右上AI", avatar: "A2", isHuman: false, isAI: true, isSelf: false },
      { id: "p4", name: "右下AI", avatar: "A3", isHuman: false, isAI: true, isSelf: false }
    ];
    this.initPlayersUI();
    this.showLobbyMain();
    this.updateLobbyMoneyDisplay();
    window.MobaoAppState.patch({ appMode: "lobby", gameSource: null });
    const connectPanel = document.getElementById("lobbyOnlineConnect");
    const roomPanel = document.getElementById("lobbyOnlineRoom");
    const createPanel = document.getElementById("lobbyOnlineCreatePanel");
    const joinPanel = document.getElementById("lobbyOnlineJoinPanel");
    if (connectPanel) connectPanel.classList.remove("hidden");
    if (roomPanel) roomPanel.classList.add("hidden");
    if (createPanel) createPanel.classList.add("hidden");
    if (joinPanel) joinPanel.classList.add("hidden");
  }

  enterLanRoom() {
    this.cleanupGameScene();
    const lobbyPage = document.getElementById("lobbyPage");
    const gameArea = document.getElementById("gameArea");
    if (lobbyPage) lobbyPage.classList.remove("hidden");
    if (gameArea) gameArea.classList.add("hidden");
    if (this.game && this.game.loop) {
      this.game.loop.sleep();
    }
    const connectPanel = document.getElementById("lobbyOnlineConnect");
    const roomPanel = document.getElementById("lobbyOnlineRoom");
    const createPanel = document.getElementById("lobbyOnlineCreatePanel");
    const joinPanel = document.getElementById("lobbyOnlineJoinPanel");
    if (connectPanel) connectPanel.classList.add("hidden");
    if (roomPanel) roomPanel.classList.remove("hidden");
    if (createPanel) createPanel.classList.add("hidden");
    if (joinPanel) joinPanel.classList.add("hidden");
    this.exitSettlementPage();
    this.updateLobbyMoneyDisplay();
    window.MobaoAppState.patch({ appMode: "lobby", gameSource: null });
  }

  exitLobby() {
    const lobbyPage = document.getElementById("lobbyPage");
    const gameArea = document.getElementById("gameArea");
    if (lobbyPage) {
      lobbyPage.classList.add("hidden");
    }
    if (gameArea) {
      gameArea.classList.remove("hidden");
    }
    if (this.game && this.game.loop) {
      this.game.loop.wake();
    }
  }

  startSoloGame() {
    window.MobaoAppState.patch({ appMode: "game", gameSource: "solo" });
    this.applyMapProfile();
    this.exitLobby();
    this.startNewRun();
  }

  initLanLobby() {
    if (!window.LanBridge) return;

    this.lanBridge = new LanBridge();
    this.isLanMode = false;
    this.lanHostWallets = {};
    this.lanHostBids = {};
    this.lanAiPlayers = [];

    const $ = (id) => document.getElementById(id);
    const bridge = this.lanBridge;

    const serverUrl = $("lobbyOnlineServerUrl");
    const playerName = $("lobbyOnlinePlayerName");
    const statusEl = $("lobbyOnlineStatus");
    const connectBtn = $("lobbyOnlineConnectBtn");
    const serverField = $("lobbyOnlineServerField");
    const createBtn = $("lobbyOnlineCreateBtn");
    const joinBtn = $("lobbyOnlineJoinBtn");
    const connectPanel = $("lobbyOnlineConnect");
    const createPanel = $("lobbyOnlineCreatePanel");
    const joinPanel = $("lobbyOnlineJoinPanel");
    const createBackBtn = $("lobbyCreateBackBtn");
    const createRoomName = $("lobbyCreateRoomName");
    const visibilityToggle = $("lobbyVisibilityToggle");
    const createPasswordField = $("lobbyCreatePasswordField");
    const createPassword = $("lobbyCreatePassword");
    const createConfirmBtn = $("lobbyCreateConfirmBtn");
    const joinBackBtn = $("lobbyJoinBackBtn");
    const joinRefreshBtn = $("lobbyJoinRefreshBtn");
    const joinList = $("lobbyOnlineJoinList");
    const joinPasswordField = $("lobbyJoinPasswordField");
    const joinPassword = $("lobbyJoinPassword");
    const roomPanel = $("lobbyOnlineRoom");
    const roomCodeEl = $("lobbyOnlineRoomCode");
    const copyRoomBtn = $("lobbyCopyRoomBtn");
    const hostBadge = $("lobbyOnlineHostBadge");
    const startBtn = $("lobbyOnlineStartBtn");
    const leaveBtn = $("lobbyOnlineLeaveBtn");
    const slotsContainer = $("lobbyOnlineSlots");

    if (!createBtn || !joinBtn) return;

    const savedName = localStorage.getItem("mobao_lan_name") || "";
    if (playerName) playerName.value = savedName;

    var selectedVisibility = "public";
    var discoveredServers = [];
    var pendingJoinServerIp = null;
    var pendingJoinRoomCode = null;

    const isNative = LanBridge.isNative();

    if (isNative) {
      if (serverField) serverField.classList.add("hidden");
      var toggleBtn = $("lobbyToggleServerBtn");
      if (toggleBtn) toggleBtn.parentElement.classList.add("hidden");
    } else {
      if (serverUrl) serverUrl.value = "ws://localhost:9720";
    }

    var toggleServerBtn = $("lobbyToggleServerBtn");
    if (toggleServerBtn) {
      toggleServerBtn.addEventListener("click", () => {
        if (serverField) serverField.classList.toggle("hidden");
      });
    }

    const setOnlineStatus = (text, cls) => {
      if (!statusEl) return;
      statusEl.textContent = text;
      statusEl.className = "lobby-online-status" + (cls ? " " + cls : "");
    };

    const showPanel = (panel) => {
      if (connectPanel) connectPanel.classList.add("hidden");
      if (createPanel) createPanel.classList.add("hidden");
      if (joinPanel) joinPanel.classList.add("hidden");
      if (roomPanel) roomPanel.classList.add("hidden");
      if (panel) panel.classList.remove("hidden");
    };

    const getPlayerName = () => {
      const name = playerName ? playerName.value.trim() || "Player" : "Player";
      localStorage.setItem("mobao_lan_name", name);
      return name;
    };

    const autoConnectAndCreate = (options) => {
      const name = getPlayerName();
      if (isNative) {
        setOnlineStatus("启动本地服务器...", "");
        const started = LanBridge.startNativeServer();
        if (!started) {
          setOnlineStatus("启动服务器失败", "error");
          return;
        }
        const nativeUrl = LanBridge.getNativeServerUrl();
        if (!nativeUrl) {
          setOnlineStatus("获取服务器地址失败", "error");
          return;
        }
        setTimeout(() => {
          setOnlineStatus("连接本地服务器...", "");
          bridge.connect(nativeUrl, name).then(() => {
            bridge.createRoom(options);
          }).catch((e) => {
            setOnlineStatus("连接失败: " + e.message, "error");
          });
        }, 500);
      } else {
        var url = serverUrl ? serverUrl.value.trim() : "";
        if (!url) {
          if (serverField) serverField.classList.remove("hidden");
          setOnlineStatus("请先输入服务器地址", "error");
          return;
        }
        setOnlineStatus("连接中...", "");
        bridge.connect(url, name).then(() => {
          bridge.createRoom(options);
        }).catch((e) => {
          setOnlineStatus("连接失败: " + e.message, "error");
        });
      }
    };

    const autoConnectAndJoin = (serverIp, roomCode, password) => {
      const name = getPlayerName();
      var wsUrl = "ws://" + serverIp + ":9720";
      if (isNative && serverIp === LanBridge.getNativeWiFiIP()) {
        wsUrl = "ws://localhost:9720";
      }
      setOnlineStatus("连接 " + serverIp + "...", "");
      var doConnect = function () {
        bridge.connect(wsUrl, name).then(() => {
          bridge.joinRoom(roomCode, password);
        }).catch((e) => {
          setOnlineStatus("连接失败: " + e.message, "error");
        });
      };
      if (bridge.ws && bridge.ws.readyState <= 1) {
        bridge.disconnect();
        setTimeout(doConnect, 300);
      } else {
        doConnect();
      }
    };

    const detectLocalIP = () => {
      return new Promise(function (resolve) {
        try {
          var pc = new RTCPeerConnection({ iceServers: [] });
          pc.createDataChannel("");
          pc.createOffer().then(function (offer) { return pc.setLocalDescription(offer); }).catch(function () { });
          var found = [];
          var timer = setTimeout(function () {
            pc.close();
            resolve(found);
          }, 2000);
          pc.onicecandidate = function (e) {
            if (!e || !e.candidate || !e.candidate.candidate) return;
            var parts = e.candidate.candidate.split(" ");
            var ip = parts[4];
            if (ip && ip.match(/^(\d{1,3}\.){3}\d{1,3}$/) && !ip.startsWith("0.") && ip !== "0.0.0.0") {
              if (found.indexOf(ip) === -1) found.push(ip);
            }
          };
        } catch (e) {
          resolve([]);
        }
      });
    };

    const scanSubnet = (subnet, found, onDone) => {
      var pending = 0;
      for (var i = 1; i <= 254; i++) {
        var addr = subnet + i;
        pending++;
        (function (ip) {
          var tried = 0;
          var ports = [9721, 9720];
          var tryNext = function () {
            if (tried >= ports.length) {
              pending--;
              if (pending === 0 && onDone) onDone();
              return;
            }
            var port = ports[tried++];
            var controller = new AbortController();
            var timeout = setTimeout(function () { controller.abort(); }, 600);
            fetch("http://" + ip + ":" + port + "/rooms", { signal: controller.signal, mode: "cors" })
              .then(function (r) { return r.json(); })
              .then(function (data) {
                clearTimeout(timeout);
                if (data && data.rooms) {
                  found.push({ serverIp: ip, serverPort: 9720, rooms: data.rooms });
                }
                pending--;
                if (pending === 0 && onDone) onDone();
              })
              .catch(function () {
                clearTimeout(timeout);
                tryNext();
              });
          };
          tryNext();
        })(addr);
      }
    };

    const scanRooms = () => {
      if (joinList) {
        joinList.innerHTML = '<div class="lobby-room-scanning">正在扫描局域网房间...</div>';
      }
      if (joinPasswordField) joinPasswordField.classList.add("hidden");

      if (isNative) {
        var nativeUrl = LanBridge.getNativeServerUrl();
        var nativeIp = LanBridge.getNativeWiFiIP ? LanBridge.getNativeWiFiIP() : null;
        if (nativeUrl) {
          var httpBase = nativeUrl.replace("ws://", "http://").replace(/:\d+/, ":9721");
          fetch(httpBase + "/rooms", { mode: "cors" })
            .then(function (r) { return r.json(); })
            .then(function (data) {
              var found = [];
              processRoomData(data, nativeIp || "localhost", found);
              dedupFound(found);
              discoveredServers = found;
              renderRoomList();
            })
            .catch(function () {
              setTimeout(function () {
                var result = LanBridge.discoverRoomsNative();
                discoveredServers = result || [];
                renderRoomList();
              }, 100);
            });
        } else {
          setTimeout(function () {
            var result = LanBridge.discoverRoomsNative();
            discoveredServers = result || [];
            renderRoomList();
          }, 100);
        }
        return;
      }

      var done = false;
      var found = [];

      var finishScan = function () {
        if (done) return;
        done = true;
        dedupFound(found);
        discoveredServers = found;
        renderRoomList();
      };

      var currentHost = window.location.hostname;
      var serverBase = null;
      if (currentHost && currentHost !== "localhost" && currentHost !== "127.0.0.1" && currentHost.indexOf(".") > 0) {
        serverBase = "http://" + currentHost + ":9720";
      } else if (serverUrl && serverUrl.value) {
        var m = serverUrl.value.match(/ws:\/\/([^:\/]+)/);
        if (m && m[1] !== "localhost" && m[1] !== "127.0.0.1") {
          serverBase = "http://" + m[1] + ":9720";
        }
      }

      var localServerBase = "http://localhost:9720";
      var triedLocal = false;

      if (serverBase) {
        fetch(serverBase + "/rooms", { mode: "cors" })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            processRoomData(data, serverBase.replace("http://", "").split(":")[0], found);
            finishScan();
          })
          .catch(function () {
            fallbackScan(found, finishScan);
          });
      } else {
        fetch(localServerBase + "/rooms", { mode: "cors" })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            processRoomData(data, "localhost", found);
            finishScan();
          })
          .catch(function () {
            fallbackScan(found, finishScan);
          });
      }

      setTimeout(finishScan, 10000);
    };

    const processRoomData = (data, serverIp, found) => {
      if (data && data.rooms && data.rooms.length > 0) {
        var exists = found.some(function (f) { return f.serverIp === serverIp; });
        if (!exists) found.push({ serverIp: serverIp, serverPort: 9720, rooms: data.rooms });
      }
      if (data && data.remoteRooms && data.remoteRooms.length > 0) {
        var grouped = {};
        data.remoteRooms.forEach(function (room) {
          var ip = room.serverIp;
          if (!grouped[ip]) grouped[ip] = { serverIp: ip, serverPort: 9720, rooms: [] };
          var r = Object.assign({}, room);
          delete r.serverIp;
          grouped[ip].rooms.push(r);
        });
        Object.keys(grouped).forEach(function (ip) {
          var exists = found.some(function (f) { return f.serverIp === ip; });
          if (!exists) found.push(grouped[ip]);
        });
      }
    };

    const dedupFound = (found) => {
      var seen = {};
      for (var i = found.length - 1; i >= 0; i--) {
        var server = found[i];
        var dedupRooms = [];
        (server.rooms || []).forEach(function (room) {
          var key = server.serverIp + ":" + room.code;
          if (!seen[key]) {
            seen[key] = true;
            dedupRooms.push(room);
          }
        });
        server.rooms = dedupRooms;
      }
      for (var i = found.length - 1; i >= 0; i--) {
        if (!found[i].rooms || found[i].rooms.length === 0) {
          found.splice(i, 1);
        }
      }
    };

    const fallbackScan = (found, finishScan) => {
      var subnets = [];
      var commonSubnets = ["192.168.1.", "192.168.0.", "192.168.31.", "192.168.43.", "10.0.0.", "192.168.2.", "192.168.3."];

      detectLocalIP().then(function (ips) {
        ips.forEach(function (ip) {
          var s = ip.substring(0, ip.lastIndexOf(".") + 1);
          if (subnets.indexOf(s) === -1) subnets.push(s);
        });
        commonSubnets.forEach(function (s) {
          if (subnets.indexOf(s) === -1) subnets.push(s);
        });

        var scanned = 0;
        var totalSubnets = subnets.length;

        subnets.forEach(function (subnet) {
          scanSubnet(subnet, found, function () {
            scanned++;
            if (scanned >= totalSubnets) finishScan();
          });
        });
      });
    };

    const renderRoomList = () => {
      if (!joinList) return;
      var allRooms = [];
      discoveredServers.forEach(function (server) {
        (server.rooms || []).forEach(function (room) {
          allRooms.push({
            serverIp: server.serverIp,
            serverPort: server.serverPort || 9720,
            code: room.code,
            roomName: room.roomName,
            hostName: room.hostName,
            visibility: room.visibility,
            playerCount: room.playerCount,
            maxPlayers: room.maxPlayers,
          });
        });
      });

      if (allRooms.length === 0) {
        joinList.innerHTML = '<div class="lobby-room-empty">未发现可加入的房间</div>';
        return;
      }

      joinList.innerHTML = "";
      allRooms.forEach(function (room) {
        var item = document.createElement("div");
        item.className = "lobby-room-item";
        var visLabel = room.visibility === "private" ? "🔒 私密" : "🔓 公开";
        var visClass = room.visibility === "private" ? "private" : "public";
        item.innerHTML =
          '<div class="lobby-room-item-info">' +
          '<div class="lobby-room-item-name">' + room.roomName + '</div>' +
          '<div class="lobby-room-item-meta">' +
          '<span class="lobby-room-item-vis ' + visClass + '">' + visLabel + '</span>' +
          '<span class="lobby-room-item-players">👥 ' + room.playerCount + '/' + room.maxPlayers + '</span>' +
          '</div>' +
          '</div>' +
          '<button class="lobby-room-item-join" data-code="' + room.code + '" data-ip="' + room.serverIp + '" data-vis="' + room.visibility + '">加入</button>';
        joinList.appendChild(item);
      });

      joinList.querySelectorAll(".lobby-room-item-join").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var code = btn.getAttribute("data-code");
          var ip = btn.getAttribute("data-ip");
          var vis = btn.getAttribute("data-vis");
          pendingJoinServerIp = ip;
          pendingJoinRoomCode = code;
          if (vis === "private") {
            if (joinPasswordField) joinPasswordField.classList.remove("hidden");
            if (joinPassword) joinPassword.focus();
          } else {
            autoConnectAndJoin(ip, code);
          }
        });
      });
    };

    const lanSlotConfig = [
      { type: "empty" },
      { type: "empty" },
      { type: "empty" },
      { type: "empty" },
    ];

    const renderSlots = () => {
      if (!slotsContainer) return;
      const slotEls = slotsContainer.querySelectorAll(".lobby-online-slot");
      slotEls.forEach((el, i) => {
        const cfg = lanSlotConfig[i];
        el.className = "lobby-online-slot";
        if (cfg.type === "host") {
          el.classList.add("slot-host");
          el.innerHTML =
            '<span class="slot-icon">👑</span>' +
            '<span class="slot-name">' + cfg.name + '</span>' +
            '<span class="slot-tag tag-host">主机</span>';
        } else if (cfg.type === "client") {
          el.classList.add("slot-client");
          let actions = '<span class="slot-tag tag-client">客机</span>';
          if (lanSlotConfig[0].type === "host" && lanSlotConfig[0].id === bridge.playerId) {
            actions += ' <button class="slot-kick-btn" data-kick="' + cfg.id + '">踢出</button>';
          }
          el.innerHTML =
            '<span class="slot-icon">👤</span>' +
            '<span class="slot-name">' + cfg.name + '</span>' +
            actions;
        } else if (cfg.type === "ai") {
          el.classList.add("slot-ai");
          let actions = '<span class="slot-tag tag-ai">AI</span>';
          if (lanSlotConfig[0].type === "host" && lanSlotConfig[0].id === bridge.playerId) {
            actions +=
              ' <label class="slot-llm-label"><input type="checkbox" class="slot-llm-check" data-ai-slot="' + i + '"' + (cfg.llm ? " checked" : "") + '/>大模型</label>' +
              ' <button class="slot-remove-btn" data-remove-ai="' + i + '">删除</button>';
          }
          el.innerHTML =
            '<span class="slot-icon">🤖</span>' +
            '<span class="slot-name">' + cfg.name + '</span>' +
            actions;
        } else {
          el.classList.add("slot-empty");
          let inner = '<span class="slot-icon">⬜</span><span class="slot-name">待加入</span>';
          if (lanSlotConfig[0].type === "host" && lanSlotConfig[0].id === bridge.playerId) {
            inner += ' <button class="slot-ai-add-btn" data-add-ai="' + i + '">AI替补</button>';
          }
          el.innerHTML = inner;
        }
      });

      slotsContainer.querySelectorAll(".slot-kick-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const kickId = btn.getAttribute("data-kick");
          if (kickId) bridge.send({ type: "room:kick", playerId: kickId });
        });
      });
      slotsContainer.querySelectorAll(".slot-ai-add-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const slotIdx = parseInt(btn.getAttribute("data-add-ai"), 10);
          if (isNaN(slotIdx)) return;
          const aiIdx = lanSlotConfig.filter((s) => s.type === "ai").length;
          lanSlotConfig[slotIdx] = { type: "ai", name: "AI-" + (aiIdx + 1), llm: false };
          renderSlots();
          broadcastSlotState();
        });
      });
      slotsContainer.querySelectorAll(".slot-remove-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const slotIdx = parseInt(btn.getAttribute("data-remove-ai"), 10);
          if (isNaN(slotIdx)) return;
          lanSlotConfig[slotIdx] = { type: "empty" };
          renderSlots();
          broadcastSlotState();
        });
      });
      slotsContainer.querySelectorAll(".slot-llm-check").forEach((chk) => {
        chk.addEventListener("change", () => {
          const slotIdx = parseInt(chk.getAttribute("data-ai-slot"), 10);
          if (!isNaN(slotIdx) && lanSlotConfig[slotIdx].type === "ai") {
            lanSlotConfig[slotIdx].llm = chk.checked;
          }
          broadcastSlotState();
        });
      });
    };

    const syncSlotsFromPlayers = (players) => {
      const hostPlayer = (players || []).find((p) => p.isHost);
      const clientPlayers = (players || []).filter((p) => !p.isHost);
      const aiSlots = lanSlotConfig.filter((s) => s.type === "ai");
      let idx = 0;
      if (hostPlayer) {
        lanSlotConfig[idx] = { type: "host", id: hostPlayer.id, name: hostPlayer.name };
        idx++;
      }
      clientPlayers.forEach((p) => {
        if (idx < 4) {
          lanSlotConfig[idx] = { type: "client", id: p.id, name: p.name };
          idx++;
        }
      });
      aiSlots.forEach((ai) => {
        if (idx < 4) {
          lanSlotConfig[idx] = ai;
          idx++;
        }
      });
      while (idx < 4) {
        lanSlotConfig[idx] = { type: "empty" };
        idx++;
      }
      renderSlots();
      broadcastSlotState();
    };

    const broadcastSlotState = () => {
      if (!bridge || !bridge.connected || !bridge.isHost) return;
      const slotState = lanSlotConfig.map((s) => ({
        type: s.type,
        name: s.name || "",
        llm: s.llm || false,
      }));
      bridge.send({ type: "room:slot-state", slots: slotState });
    };

    bridge.on("ws:open", () => {
      setOnlineStatus("已连接", "connected");
      if (connectBtn) connectBtn.disabled = true;
    });

    bridge.on("ws:close", (d) => {
      setOnlineStatus("连接断开 (code=" + d.code + ")", "error");
      if (connectBtn) connectBtn.disabled = false;
    });

    bridge.on("ws:error", () => {
      setOnlineStatus("连接错误", "error");
    });

    bridge.on("room:created", (msg) => {
      showPanel(roomPanel);
      if (roomCodeEl) roomCodeEl.textContent = msg.roomCode;
      if (hostBadge) hostBadge.classList.remove("hidden");
      if (startBtn) startBtn.classList.remove("hidden");
      syncSlotsFromPlayers([{ id: msg.playerId, name: msg.playerName, isHost: true }]);
      var statusText = "房间 " + msg.roomCode + " 等待玩家加入";
      if (msg.visibility === "private" && msg.password) {
        statusText += " | 密钥: " + msg.password;
      }
      setOnlineStatus(statusText, "connected");
    });

    bridge.on("room:joined", (msg) => {
      showPanel(roomPanel);
      if (roomCodeEl) roomCodeEl.textContent = msg.roomCode;
      if (hostBadge) hostBadge.classList.add("hidden");
      if (startBtn) startBtn.classList.add("hidden");
      syncSlotsFromPlayers(msg.players || []);
      setOnlineStatus("房间 " + msg.roomCode + " 等待主机开始", "connected");
    });

    bridge.on("room:join-failed", (msg) => {
      showPanel(connectPanel);
      setOnlineStatus("加入失败: " + msg.reason, "error");
    });

    bridge.on("room:kicked", () => {
      showPanel(connectPanel);
      setOnlineStatus("你已被主机踢出", "error");
    });

    bridge.on("room:slot-state", (msg) => {
      if (!msg.slots) return;
      msg.slots.forEach((s, i) => {
        if (i < 4) {
          if (s.type === "ai") {
            lanSlotConfig[i] = { type: "ai", name: s.name, llm: s.llm };
          } else if (s.type === "empty") {
            lanSlotConfig[i] = { type: "empty" };
          }
        }
      });
      renderSlots();
    });

    bridge.on("room:player-joined", (msg) => {
      syncSlotsFromPlayers(msg.players || []);
    });

    bridge.on("room:player-left", (msg) => {
      syncSlotsFromPlayers(msg.players || []);
      if (msg.isHost && !this.lanIsHost) {
        this.stopRoundTimer();
        this.roundPaused = false;
        this.hideLanPauseOverlay();
        if (msg.canReconnect) {
          this.writeLog("主机暂时断开，等待重连（" + Math.ceil((msg.graceMs || 30000) / 1000) + "秒）...");
        } else {
          this.writeLog("主机已断开连接，游戏无法继续。");
        }
      }
    });

    bridge.on("room:player-reconnected", (msg) => {
      syncSlotsFromPlayers(msg.players || []);
      this.writeLog(msg.playerName + " 已重新连接");
    });

    bridge.on("room:player-removed", (msg) => {
      syncSlotsFromPlayers(msg.players || []);
      this.writeLog(msg.playerName + " 已离开（重连超时）");
    });

    bridge.on("room:reconnected", (msg) => {
      this.writeLog("重连成功！");
      if (msg.roomState === "playing") {
        this.lanBridge.requestFullSync();
      }
    });

    bridge.on("room:reconnect-failed", (msg) => {
      this.writeLog("重连失败: " + msg.reason);
    });

    bridge.on("full-sync-request", (msg) => {
      if (!this.lanIsHost) return;
      var syncData = this.lanBuildFullSyncData(msg.playerId);
      this.lanBridge.sendFullSync(msg.playerId, syncData);
    });

    bridge.on("full-sync", (msg) => {
      this.lanOnFullSync(msg);
    });

    bridge.on("ws:close", (d) => {
      if (this.isLanMode && !this.settled) {
        this.lanLastServerUrl = this.lanBridge.ws ? this.lanBridge.ws.url : this.lanLastServerUrl;
        this.lanLastRoomCode = this.lanBridge.roomCode || this.lanLastRoomCode;
        this.lanLastPlayerId = this.lanBridge.playerId || this.lanLastPlayerId;
        this.writeLog("连接断开 (code=" + d.code + ")");
        this.onLanForeground();
      }
    });

    bridge.on("ws:error", () => {
      if (this.isLanMode && !this.settled) {
        this.writeLog("连接错误，尝试重连...");
        this.onLanForeground();
      }
    });

    bridge.on("game:init", (msg) => {
      this.isLanMode = true;
      this.lanPlayers = msg.players || [];
      this.lanIsHost = (msg.hostId === bridge.playerId);

      this.lanLastServerUrl = bridge.ws ? bridge.ws.url : null;
      this.lanLastRoomCode = bridge.roomCode;
      this.lanLastPlayerId = bridge.playerId;

      const aiPlayersFromMsg = msg.aiPlayers || [];
      this.lanAiLlmEnabled = !!msg.aiLlmEnabled;

      if (this.lanIsHost) {
        this.lanHostWallets = {};
        this.lanPlayers.forEach((p) => { this.lanHostWallets[p.id] = DEFAULT_START_MONEY; });
        this.lanAiPlayers = aiPlayersFromMsg.length > 0
          ? aiPlayersFromMsg.map((ai) => ({ id: ai.id, name: ai.name, isAI: true, isHost: false, llm: ai.llm }))
          : [];
        this.lanAiPlayers.forEach((ai) => {
          this.lanPlayers.push(ai);
          this.lanHostWallets[ai.id] = DEFAULT_START_MONEY;
        });
      } else {
        this.lanAiPlayers = aiPlayersFromMsg.map((ai) => ({ id: ai.id, name: ai.name, isAI: true, isHost: false, llm: ai.llm }));
        this.lanAiPlayers.forEach((ai) => {
          this.lanPlayers.push(ai);
        });
      }

      window.MobaoAppState.patch({ appMode: "game", gameSource: "lan" });
      this.exitLobby();
      this.startLanRun();
    });

    bridge.on("round:start", (msg) => {
      if (!this.lanIsHost) {
        this.lanOnRoundStart(msg);
      } else {
        if (msg.ts && msg.roundSeconds) {
          const elapsed = Math.round((Date.now() - msg.ts) / 1000);
          const corrected = msg.roundSeconds - elapsed;
          if (corrected > 0 && corrected <= msg.roundSeconds) {
            this.roundTimeLeft = corrected;
            this.updateHud();
          }
        }
      }
    });

    bridge.on("round:bid-ack", () => {
      this.playerBidSubmitted = true;
      if (this.lanMySlotId) {
        this.setPlayerBidReady(this.lanMySlotId, true);
      }
      this.writeLog("联机出价已确认");
    });

    bridge.on("bid:received", (msg) => {
      if (this.lanIsHost) {
        this.lanHostBids[msg.playerId] = msg.bid;
      }
      const slotId = this.lanIdToSlotId ? this.lanIdToSlotId[msg.playerId] : null;
      if (slotId) {
        this.setPlayerBidReady(slotId, true);
        this.writeLog((msg.playerName || "玩家") + " 已提交出价");
      }
    });

    bridge.on("all-bids-in", (msg) => {
      if (!this.lanIsHost) return;
      this.lanOnAllBidsIn(msg).catch((e) => this.writeLog("AI行动异常：" + (e && e.message ? e.message : e)));
    });

    bridge.on("round:timeout", () => {
      if (this.lanIsHost) {
        this.lanOnRoundTimeout().catch((e) => this.writeLog("AI行动异常：" + (e && e.message ? e.message : e)));
      }
    });

    bridge.on("round:result", (msg) => {
      this.lanOnRoundResult(msg);
    });

    bridge.on("game:settle", (msg) => {
      this.lanOnSettle(msg);
    });

    bridge.on("game:settle-final", (msg) => {
      this.lanOnSettleFinal(msg);
    });

    bridge.on("game:restart-vote", (msg) => {
      this.showLanRestartVoteDialog(msg.hostName);
    });

    bridge.on("game:restart-go", (msg) => {
      this.removeLanRestartDialog();
      this.lanOnRestartGo(msg);
    });

    bridge.on("game:restart-cancelled", (msg) => {
      this.writeLog(msg.decliner + " 拒绝了重开请求");
      this.showLanRestartDeclinedDialog(msg.decliner);
    });

    bridge.on("pause:state", (msg) => {
      this.roundPaused = !!msg.paused;
      if (this.roundPaused) {
        this._pauseSnapshotTimeLeft = this.roundTimeLeft;
      } else {
        if (msg.roundTimeLeft != null && msg.roundTimeLeft > 0 && msg.ts) {
          var latency = (Date.now() - msg.ts) / 1000;
          this.roundTimeLeft = Math.max(1, Math.round(msg.roundTimeLeft - latency));
        } else if (msg.roundTimeLeft != null && msg.roundTimeLeft > 0) {
          this.roundTimeLeft = msg.roundTimeLeft;
        } else if (this._pauseSnapshotTimeLeft != null) {
          this.roundTimeLeft = this._pauseSnapshotTimeLeft;
        }
        this._pauseSnapshotTimeLeft = null;
      }
      this.syncPauseButton();
      this.updateHud();
      if (this.roundPaused) {
        this.showLanPauseOverlay();
      } else {
        this.hideLanPauseOverlay();
      }
    });

    bridge.on("game:warehouse-sync", (msg) => {
      if (this.lanIsHost) return;
      this.lanRestoreWarehouseFromSync(msg);
    });

    bridge.on("ai-bids-ready", (msg) => {
      if (!this.lanIdToSlotId) return;
      (msg.aiPlayerIds || []).forEach((aiId) => {
        const slotId = this.lanIdToSlotId[aiId];
        if (slotId) this.setPlayerBidReady(slotId, true);
      });
    });

    bridge.on("ai-item-use", (msg) => {
      if (!this.lanIdToSlotId) return;
      const slotId = this.lanIdToSlotId[msg.aiPlayerId];
      if (slotId) {
        this.writeLog((msg.aiPlayerName || "AI") + " 使用了 " + (msg.itemName || "道具"));
        if (msg.actionId) {
          this.recordPlayerUsage(slotId, msg.actionId);
          const usageArr = this.playerUsageHistory[slotId];
          if (usageArr && usageArr.length > 0) {
            const lastEntry = usageArr[usageArr.length - 1];
            if (lastEntry.round === this.round && !lastEntry.actions.includes(msg.actionId)) {
              lastEntry.actions.push(msg.actionId);
            }
          }
          this.refreshPlayerHistoryUI();
        }
      }
    });

    bridge.on("player-action", (msg) => {
      if (!this.lanIdToSlotId) return;
      const slotId = this.lanIdToSlotId[msg.playerId];
      if (slotId) {
        this.writeLog((msg.playerName || "玩家") + " 使用了 " + (msg.itemName || "道具"));
        if (msg.actionId) {
          this.recordPlayerUsage(slotId, msg.actionId);
          const usageArr = this.playerUsageHistory[slotId];
          if (usageArr && usageArr.length > 0) {
            const lastEntry = usageArr[usageArr.length - 1];
            if (lastEntry.round === this.round && !lastEntry.actions.includes(msg.actionId)) {
              lastEntry.actions.push(msg.actionId);
            }
          }
          this.refreshPlayerHistoryUI();
        }
      }
    });

    bridge.on("public-info", (msg) => {
      this.addPublicInfoEntry({
        source: msg.source || "未知",
        text: msg.text || "",
      });
    });

    if (connectBtn) {
      connectBtn.addEventListener("click", () => {
        const url = serverUrl ? serverUrl.value.trim() : "";
        const name = getPlayerName();
        if (!url) { setOnlineStatus("请输入服务器地址", "error"); return; }
        setOnlineStatus("连接中...", "");
        bridge.connect(url, name).catch((e) => {
          setOnlineStatus("连接失败: " + e.message, "error");
        });
      });
    }

    if (createBtn) {
      createBtn.addEventListener("click", () => {
        showPanel(createPanel);
        if (createRoomName) createRoomName.value = "";
        if (createPassword) createPassword.value = "";
        selectedVisibility = "public";
        if (visibilityToggle) {
          visibilityToggle.querySelectorAll(".lobby-visibility-btn").forEach((btn) => {
            btn.classList.toggle("active", btn.getAttribute("data-vis") === "public");
          });
        }
        if (createPasswordField) createPasswordField.classList.add("hidden");
      });
    }

    if (createBackBtn) {
      createBackBtn.addEventListener("click", () => {
        showPanel(connectPanel);
      });
    }

    if (visibilityToggle) {
      visibilityToggle.querySelectorAll(".lobby-visibility-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          selectedVisibility = btn.getAttribute("data-vis");
          visibilityToggle.querySelectorAll(".lobby-visibility-btn").forEach((b) => {
            b.classList.toggle("active", b.getAttribute("data-vis") === selectedVisibility);
          });
          if (createPasswordField) {
            createPasswordField.classList.toggle("hidden", selectedVisibility !== "private");
          }
        });
      });
    }

    if (createConfirmBtn) {
      createConfirmBtn.addEventListener("click", () => {
        var options = {
          roomName: createRoomName ? createRoomName.value.trim() : undefined,
          visibility: selectedVisibility,
          password: selectedVisibility === "private" && createPassword ? createPassword.value.trim() : undefined,
        };
        autoConnectAndCreate(options);
      });
    }

    if (joinBtn) {
      joinBtn.addEventListener("click", () => {
        showPanel(joinPanel);
        scanRooms();
      });
    }

    if (joinBackBtn) {
      joinBackBtn.addEventListener("click", () => {
        showPanel(connectPanel);
      });
    }

    if (joinRefreshBtn) {
      joinRefreshBtn.addEventListener("click", () => {
        scanRooms();
      });
    }

    if (joinPassword) {
      joinPassword.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && pendingJoinServerIp && pendingJoinRoomCode) {
          autoConnectAndJoin(pendingJoinServerIp, pendingJoinRoomCode, joinPassword.value.trim());
        }
      });
    }

    if (leaveBtn) {
      leaveBtn.addEventListener("click", () => {
        bridge.leaveRoom();
        showPanel(connectPanel);
        setOnlineStatus("已离开房间", "");
      });

      if (copyRoomBtn) {
        copyRoomBtn.addEventListener("click", () => {
          const code = roomCodeEl ? roomCodeEl.textContent.trim() : "";
          if (!code) return;
          navigator.clipboard.writeText(code).then(() => {
            copyRoomBtn.textContent = "✓";
            setTimeout(() => { copyRoomBtn.textContent = "📋"; }, 1200);
          }).catch(() => {
            const ta = document.createElement("textarea");
            ta.value = code;
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            document.body.removeChild(ta);
            copyRoomBtn.textContent = "✓";
            setTimeout(() => { copyRoomBtn.textContent = "📋"; }, 1200);
          });
        });
      }
    }

    if (startBtn) {
      startBtn.addEventListener("click", () => {
        const aiSlots = lanSlotConfig.filter((s) => s.type === "ai");
        const aiCount = aiSlots.length;
        const aiLlmEnabled = aiSlots.some((s) => s.llm);
        const aiPlayers = aiSlots.map((s, i) => ({
          id: "ai_" + i + "_" + Date.now(),
          name: s.name || ("AI-" + (i + 1)),
          isAI: true,
          isHost: false,
          llm: !!s.llm,
        }));
        bridge.startGame({ aiCount, aiLlmEnabled, aiPlayers });
      });
    }
  }

  startLanRun() {
    if (window.NativeBridge && window.NativeBridge.isNative && window.NativeBridge.isNative()) {
      try { window.NativeBridge.setGameRunning(true); } catch (_) { }
    }
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
    if (this.lanIsHost) {
      this.spawnRandomItems();
    }
    this.setupWarehouseAuction();
    this.rebuildWarehouseCellIndex();

    if (this.lanIsHost) {
      const warehouseData = this.buildWarehouseSnapshotForSync();
      this.lanBridge.send({
        type: "game:warehouse-sync",
        warehouse: warehouseData,
        warehouseTrueValue: this.warehouseTrueValue,
        currentBid: this.currentBid,
        aiMaxBid: this.aiMaxBid,
      });
    }

    this.players = this.lanPlayers.map((p, i) => ({
      id: "p" + (i + 1),
      lanId: p.id,
      name: p.name,
      avatar: p.isAI ? "AI" : (p.id === this.lanBridge.playerId ? "你" : p.name.substring(0, 2)),
      isHuman: !p.isAI,
      isAI: !!p.isAI,
      isSelf: !p.isAI && (p.id === this.lanBridge.playerId),
    }));

    this.lanIdToSlotId = {};
    this.slotIdToLanId = {};
    this.players.forEach((p) => {
      this.lanIdToSlotId[p.lanId] = p.id;
      this.slotIdToLanId[p.id] = p.lanId;
    });

    this.lanMySlotId = this.lanIdToSlotId[this.lanBridge.playerId] || "p2";

    this.initPlayersUI();
    if (this.lanAiLlmEnabled && this.lanAiPlayers.length > 0) {
      this.lanAiPlayers.forEach((ai) => {
        const slotId = this.lanIdToSlotId[ai.id];
        if (slotId) {
          this.aiLlmPlayerEnabled[slotId] = true;
          const toggleEl = document.getElementById("llm-switch-" + slotId);
          if (toggleEl) toggleEl.checked = true;
        }
      });
    }
    if (this.lanIsHost) {
      this.aiWallets = {};
      this.lanAiPlayers.forEach((ai) => {
        this.aiWallets[ai.id] = this.lanHostWallets[ai.id] || DEFAULT_START_MONEY;
      });
    } else {
      this.initAiWallets();
    }
    this.initAiIntelSystems();
    this.aiEngine.resetForNewRun({
      startingBid: this.currentBid,
      itemCount: this.items.length,
    });

    if (this.lanIsHost) {
      this.lanHostBids = {};
      this.lanBroadcastRoundStart();
    }

    this.startRound();
    this.updateHud();
    this.writeLog("联机游戏已开始！" + (this.lanIsHost ? "（你是主机）" : ""));
  }

  lanBroadcastRoundStart() {
    this.lanBridge.broadcastRoundStart(
      this.round,
      GAME_SETTINGS.maxRounds,
      this.currentBid,
      GAME_SETTINGS.roundSeconds,
    );
  }

  lanRestoreWarehouseFromSync(msg) {
    const warehouseData = msg.warehouse || [];
    if (warehouseData.length === 0) return;

    if (this.itemLayer) {
      this.itemLayer.destroy(true);
    }
    this.itemLayer = this.add.container(0, 0);
    this.items = [];
    this.warehouseTrueValue = 0;

    const qualityConfig = (window.ArtifactData && window.ArtifactData.QUALITY_CONFIG) || {};

    warehouseData.forEach((saved, idx) => {
      const qualityKey = saved.qualityKey && qualityConfig[saved.qualityKey] ? saved.qualityKey : "normal";
      const quality = qualityConfig[qualityKey] || { label: "良品", color: 0x2f78ff, glow: 0x9ec0ff };
      const safeW = Math.max(1, Math.round(Number(saved.w) || 1));
      const safeH = Math.max(1, Math.round(Number(saved.h) || 1));
      const safeX = Math.max(0, Math.round(Number(saved.x) || 0));
      const safeY = Math.max(0, Math.round(Number(saved.y) || 0));
      const trueValue = Math.max(0, Math.round(Number(saved.trueValue) || 0));

      const item = {
        id: String(saved.id || `sync-item-${idx}`),
        key: "synced",
        category: saved.category || "未知",
        name: saved.name || `藏品${idx + 1}`,
        basePrice: trueValue,
        trueValue,
        qualityKey,
        quality,
        w: safeW,
        h: safeH,
        x: safeX,
        y: safeY,
        revealed: { outline: false, qualityCell: null, exact: false },
      };

      this.renderItem(item);
      this.items.push(item);
      this.warehouseTrueValue += item.trueValue;
    });

    this.rebuildWarehouseCellIndex();
    this.warehouseTrueValue = msg.warehouseTrueValue || this.warehouseTrueValue;
    this.currentBid = msg.currentBid || this.currentBid;
    this.aiMaxBid = msg.aiMaxBid || this.aiMaxBid;
  }

  lanOnRoundStart(msg) {
    this.round = msg.round;
    this.currentBid = msg.currentBid || 0;
    this.playerBidSubmitted = false;
    this.playerRoundBid = 0;
    this.startRound();
    if (msg.ts && msg.roundSeconds) {
      const elapsed = Math.round((Date.now() - msg.ts) / 1000);
      const corrected = msg.roundSeconds - elapsed;
      if (corrected > 0 && corrected <= msg.roundSeconds) {
        this.roundTimeLeft = corrected;
      }
    }
    this.updateHud();
  }

  async lanOnAllBidsIn(msg) {
    if (this.lanIsHost && this.aiRoundDecisionPromise) {
      await this.aiRoundDecisionPromise;
    }
    if (this.roundPaused) await this.waitUntilResumed();
    const aiBids = this.lanComputeAiBids();
    for (const aid in aiBids) { this.lanHostBids[aid] = aiBids[aid]; }
    if (this.lanHostBids[this.lanBridge.playerId] === undefined) {
      this.lanHostBids[this.lanBridge.playerId] = this.playerRoundBid;
    }
    this.lanResolveRound("all-in");
  }

  onLanBackground() {
    if (!this.isLanMode || !this.lanBridge || !this.lanBridge.connected) return;
    this.lanLastServerUrl = this.lanBridge.ws ? this.lanBridge.ws.url : null;
    this.lanLastRoomCode = this.lanBridge.roomCode;
    this.lanLastPlayerId = this.lanBridge.playerId;
    if (this.lanIsHost && !this.roundPaused && !this.settled) {
      this.toggleLanPause(true);
      this.writeLog("游戏进入后台，已自动暂停");
    }
  }

  onLanForeground() {
    if (!this.isLanMode || !this.lanBridge) return;
    if (this.lanBridge.connected) {
      if (!this.lanIsHost) {
        this.lanBridge.requestFullSync();
      }
      return;
    }
    this.lanReconnecting = true;
    this.lanReconnectAttempts = 0;
    this.writeLog("连接断开，正在尝试重连...");
    this.lanAttemptReconnect();
  }

  lanAttemptReconnect() {
    if (!this.lanLastServerUrl || !this.lanLastRoomCode || !this.lanLastPlayerId) {
      this.writeLog("重连信息缺失，请手动重新连接");
      this.lanReconnecting = false;
      return;
    }
    if (this.lanReconnectAttempts >= this.lanMaxReconnectAttempts) {
      this.writeLog("重连失败次数过多，请手动重新连接");
      this.lanReconnecting = false;
      return;
    }
    this.lanReconnectAttempts++;
    var delay = Math.min(1000 * Math.pow(2, this.lanReconnectAttempts - 1), 8000);
    this.writeLog("重连尝试 " + this.lanReconnectAttempts + "/" + this.lanMaxReconnectAttempts + " (" + delay + "ms后)");
    setTimeout(() => {
      if (!this.lanReconnecting) return;
      this.lanBridge.reconnect(this.lanLastServerUrl, this.lanLastRoomCode, this.lanLastPlayerId)
        .then(() => {
          this.lanReconnecting = false;
          this.lanReconnectAttempts = 0;
          this.writeLog("重连成功！");
          if (!this.lanIsHost) {
            this.lanBridge.requestFullSync();
          }
        })
        .catch((e) => {
          this.writeLog("重连失败: " + (e.message || "未知错误"));
          this.lanAttemptReconnect();
        });
    }, delay);
  }

  lanOnFullSync(msg) {
    if (this.lanIsHost) return;
    this.writeLog("收到全量状态同步");

    if (msg.warehouse) {
      this.lanRestoreWarehouseFromSync({
        warehouse: msg.warehouse,
        warehouseTrueValue: msg.warehouseTrueValue || 0,
        currentBid: msg.currentBid || 0,
        aiMaxBid: msg.aiMaxBid || 0,
      });
    }

    if (msg.round != null) {
      this.round = msg.round;
    }
    if (msg.maxRounds != null) {
      GAME_SETTINGS.maxRounds = msg.maxRounds;
    }
    if (msg.currentBid != null) {
      this.currentBid = msg.currentBid;
    }
    if (msg.warehouseTrueValue != null) {
      this.warehouseTrueValue = msg.warehouseTrueValue;
    }

    if (msg.roundTimeLeft != null) {
      this.roundTimeLeft = msg.roundTimeLeft;
    }
    if (msg.isPaused != null) {
      this.roundPaused = msg.isPaused;
      if (msg.isPaused) {
        this.showLanPauseOverlay();
      } else {
        this.hideLanPauseOverlay();
      }
    }
    if (msg.settled != null) {
      this.settled = msg.settled;
    }
    if (msg.playerBidSubmitted != null) {
      this.playerBidSubmitted = msg.playerBidSubmitted;
    }
    if (msg.playerRoundBid != null) {
      this.playerRoundBid = msg.playerRoundBid;
    }

    if (msg.wallets) {
      for (var lanId in msg.wallets) {
        var slotId = this.lanIdToSlotId[lanId];
        if (slotId) {
          var p = this.players.find(function (pl) { return pl.id === slotId; });
          if (p) p.money = msg.wallets[lanId];
        }
      }
    }

    if (msg.bids) {
      for (var bidLanId in msg.bids) {
        var bidSlotId = this.lanIdToSlotId[bidLanId];
        if (bidSlotId) {
          this.setPlayerBidReady(bidSlotId, true);
        }
      }
    }

    if (msg.publicInfoEntries) {
      this.publicInfoEntries = msg.publicInfoEntries;
      this.renderPublicInfoPanel();
    }
    if (msg.privateIntelEntries) {
      this.privateIntelEntries = msg.privateIntelEntries;
      this.renderPrivateIntelPanel();
    }

    this.initPlayersUI();
    this.updateHud();
    this.refreshRevealScrollHints();
  }

  lanBuildFullSyncData(targetPlayerId) {
    var wallets = {};
    this.players.forEach((p) => {
      var lanId = this.slotIdToLanId[p.id];
      if (lanId) {
        if (this.lanIsHost && this.lanHostWallets[lanId] !== undefined) {
          wallets[lanId] = this.lanHostWallets[lanId];
        } else if (p.money !== undefined) {
          wallets[lanId] = p.money;
        }
      }
    });

    var bids = {};
    if (this.lanIsHost) {
      for (var aid in this.lanHostBids) {
        if (this.lanHostBids[aid] !== undefined) {
          bids[aid] = this.lanHostBids[aid];
        }
      }
    }

    return {
      playerId: targetPlayerId,
      round: this.round,
      maxRounds: GAME_SETTINGS.maxRounds,
      currentBid: this.currentBid,
      warehouseTrueValue: this.warehouseTrueValue,
      roundTimeLeft: this.roundTimeLeft,
      isPaused: this.roundPaused,
      settled: this.settled,
      playerBidSubmitted: this.playerBidSubmitted,
      playerRoundBid: this.playerRoundBid,
      wallets: wallets,
      bids: bids,
      warehouse: this.buildWarehouseSnapshotForSync(),
      publicInfoEntries: this.publicInfoEntries || [],
      privateIntelEntries: this.privateIntelEntries || [],
    };
  }

  async lanOnRoundTimeout() {
    if (this.lanHostBids[this.lanBridge.playerId] === undefined) {
      this.lanHostBids[this.lanBridge.playerId] = this.playerRoundBid || 0;
    }
    if (this.lanIsHost && this.aiRoundDecisionPromise) {
      await this.aiRoundDecisionPromise;
    }
    if (this.roundPaused) await this.waitUntilResumed();
    const aiBids = this.lanComputeAiBids();
    for (const aid in aiBids) { this.lanHostBids[aid] = aiBids[aid]; }
    this.lanResolveRound("timeout");
  }

  lanComputeAiBids() {
    const aiPlayers = this.lanAiPlayers;
    const clueRate = this.items.length === 0
      ? 0
      : this.items.filter((item) => this.hasAnyInfo(item)).length / this.items.length;
    const slotLastBids = this.getLastRoundBidMap();
    const lastRoundBids = {};
    for (const sid in slotLastBids) {
      const lanId = this.slotIdToLanId[sid];
      if (lanId) lastRoundBids[lanId] = slotLastBids[sid];
    }
    const aiIntelMap = this.buildAiIntelSnapshot();
    const remappedIntel = {};
    for (const sid in aiIntelMap) {
      const lanId = this.slotIdToLanId[sid];
      if (lanId) remappedIntel[lanId] = aiIntelMap[sid];
    }
    const remappedEffects = {};
    for (const sid in this.aiRoundEffects) {
      const lanId = this.slotIdToLanId[sid];
      if (lanId) remappedEffects[lanId] = this.aiRoundEffects[sid];
    }
    const ruleBids = this.aiEngine.buildAIBids({
      aiPlayers,
      clueRate,
      round: this.round,
      maxRounds: GAME_SETTINGS.maxRounds,
      currentBid: this.currentBid,
      lastRoundBids,
      bidStep: GAME_SETTINGS.bidStep,
      aiIntelMap: remappedIntel,
      aiToolEffectMap: remappedEffects,
      itemCount: this.items.length,
    });

    aiPlayers.forEach((ai) => {
      const slotId = this.lanIdToSlotId[ai.id];
      if (!slotId) return;
      const plan = this.aiLlmRoundPlans[slotId];
      if (!plan || plan.failed || !plan.hasBidDecision || !this.canUseLlmDecisionForPlayer(slotId)) return;
      const wallet = this.lanHostWallets[ai.id] || DEFAULT_START_MONEY;
      ruleBids[ai.id] = this.normalizeAiBidValue(slotId, plan.bid, wallet);
    });

    return ruleBids;
  }

  lanResolveRound(reason) {
    if (this.roundResolving || this.settled) return;
    this.roundResolving = true;
    this.stopRoundTimer();
    const allBids = this.players.map((p) => {
      const bid = this.lanHostBids[p.lanId] || 0;
      const wallet = this.lanHostWallets[p.lanId] || DEFAULT_START_MONEY;
      return { playerId: p.lanId, bid: Math.min(Math.max(0, bid), wallet) };
    });

    this.lanBridge.broadcastRoundResult(this.round, allBids, reason);

    const slotBids = this.players.map((p) => {
      const found = allBids.find((b) => b.playerId === p.lanId);
      return { playerId: p.id, bid: found ? found.bid : 0 };
    });

    this.captureAiDecisionTelemetry(slotBids);
    this.recordAiThoughtLogs(this.lastAiDecisionTelemetry);
    this.renderAiLogicPanel();

    const sorted = [...allBids].sort((a, b) => b.bid - a.bid);
    const first = sorted[0];
    const second = sorted[1] || { bid: 0 };
    this.currentBid = first.bid;
    this.bidLeader = this.lanIdToSlotId[first.playerId] || first.playerId;
    this.secondHighestBid = second.bid;

    this.revealRoundBidsSequential(slotBids).then(() => {
      this.recordRoundHistory(slotBids);
    });

    const shouldDirectTake =
      this.round < GAME_SETTINGS.maxRounds &&
      first.bid > 0 &&
      first.bid >= Math.ceil(second.bid * (1 + GAME_SETTINGS.directTakeRatio));

    if (this.round === GAME_SETTINGS.maxRounds || shouldDirectTake) {
      const mode = this.round === GAME_SETTINGS.maxRounds ? "final" : "direct";
      const winnerSlotId = this.lanIdToSlotId[first.playerId] || first.playerId;
      const winner = { playerId: winnerSlotId, bid: first.bid };
      this.lanBridge.broadcastSettle({
        winnerId: first.playerId,
        winnerName: this.players.find((p) => p.lanId === first.playerId)?.name || "?",
        winnerBid: first.bid,
        totalValue: this.warehouseTrueValue,
        winnerProfit: this.warehouseTrueValue - first.bid,
        secondHighestBid: second.bid,
        mode,
      });
      this.lanDoFinishAuction(winner, mode);
    } else {
      const waitMs = GAME_SETTINGS.postRevealWaitMs + this.players.length * GAME_SETTINGS.bidRevealIntervalMs;
      setTimeout(() => {
        this.round += 1;
        this.skillManager.onNewRound();
        this.lanHostBids = {};
        this.lanBroadcastRoundStart();
        this.startRound();
        this.updateHud();
      }, waitMs);
    }
  }

  lanOnRoundResult(msg) {
    const roundBids = msg.bids || [];
    this.revealRoundBidsSequential(
      this.players.map((p) => {
        const found = roundBids.find((b) => b.playerId === p.lanId);
        return { playerId: p.id, bid: found ? found.bid : 0 };
      }),
    ).then(() => {
      this.recordRoundHistory(
        this.players.map((p) => {
          const found = roundBids.find((b) => b.playerId === p.lanId);
          return { playerId: p.id, bid: found ? found.bid : 0 };
        }),
      );
    });
  }

  lanOnSettle(msg) {
    const slotId = this.lanIdToSlotId[msg.winnerId];
    let winner = this.players.find((p) => p.id === slotId);
    if (!winner) {
      winner = this.players.find((p) => p.lanId === msg.winnerId);
    }
    if (winner) {
      this.finishAuction({ playerId: winner.id, bid: msg.winnerBid }, msg.mode);
    } else {
      this.writeLog("结算：找不到胜者 " + msg.winnerId + "，尝试直接结算");
      this.finishAuction({ playerId: this.players[0]?.id, bid: msg.winnerBid }, msg.mode);
    }
  }

  lanOnSettleFinal(msg) {
    const myLanId = this.lanBridge.playerId;
    if (msg.wallets && msg.wallets[myLanId] !== undefined) {
      this.playerMoney = msg.wallets[myLanId];
      savePlayerMoney(this.playerMoney);
    }
    if (window.NativeBridge && window.NativeBridge.isNative && window.NativeBridge.isNative()) {
      try { window.NativeBridge.setGameRunning(false); } catch (_) { }
    }
  }

  lanDoFinishAuction(winner, mode) {
    this.finishAuction(winner, mode);
    if (this.lanHostWallets[this.lanBridge.playerId] !== undefined) {
      this.lanHostWallets[this.lanBridge.playerId] = this.playerMoney;
    }
    const finalWallets = {};
    const profitDetails = [];
    this.players.forEach((p) => {
      const bid = this.lanHostBids[p.lanId] || 0;
      if (p.id === winner.playerId) {
        finalWallets[p.lanId] = this.lanHostWallets[p.lanId] - bid + this.warehouseTrueValue;
        profitDetails.push({ playerId: p.lanId, playerName: p.name, bid, value: this.warehouseTrueValue, profit: this.warehouseTrueValue - bid });
      } else {
        finalWallets[p.lanId] = this.lanHostWallets[p.lanId];
        profitDetails.push({ playerId: p.lanId, playerName: p.name, bid: 0, value: 0, profit: 0 });
      }
    });
    setTimeout(() => {
      this.lanBridge.broadcastSettleFinal(finalWallets, profitDetails);
    }, 1500);
  }

  showLanRestartVoteDialog(hostName) {
    const existing = document.getElementById("lanRestartVoteDialog");
    if (existing) existing.remove();
    const overlay = document.createElement("div");
    overlay.id = "lanRestartVoteDialog";
    overlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:99999;";
    const box = document.createElement("div");
    box.style.cssText = "background:#2a2218;border:2px solid #d4a843;border-radius:12px;padding:24px 32px;text-align:center;color:#e0d0b0;font-size:16px;max-width:360px;";
    box.innerHTML =
      '<div style="margin-bottom:16px;font-size:18px;font-weight:bold;">' + hostName + ' 发起了重开请求</div>' +
      '<div style="margin-bottom:20px;color:#a09070;">是否同意开始新一局？</div>' +
      '<div style="display:flex;gap:12px;justify-content:center;">' +
      '<button id="lanRestartAccept" style="padding:8px 24px;border-radius:6px;border:1px solid #6a9f5a;background:rgba(106,159,90,0.2);color:#8fd070;cursor:pointer;font-size:14px;">同意</button>' +
      '<button id="lanRestartDecline" style="padding:8px 24px;border-radius:6px;border:1px solid #8a4a3a;background:rgba(180,60,40,0.15);color:#e07060;cursor:pointer;font-size:14px;">拒绝</button>' +
      '</div>';
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    document.getElementById("lanRestartAccept").addEventListener("click", () => {
      overlay.remove();
      this.lanBridge.send({ type: "game:restart-accept" });
      this.writeLog("已同意重开，等待其他玩家确认...");
    });
    document.getElementById("lanRestartDecline").addEventListener("click", () => {
      overlay.remove();
      this.lanBridge.send({ type: "game:restart-decline" });
      this.writeLog("已拒绝重开请求");
    });
  }

  removeLanRestartDialog() {
    const existing = document.getElementById("lanRestartVoteDialog");
    if (existing) existing.remove();
    const waiting = document.getElementById("lanRestartWaitingDialog");
    if (waiting) waiting.remove();
    const declined = document.getElementById("lanRestartDeclinedDialog");
    if (declined) declined.remove();
  }

  showLanRestartWaitingDialog() {
    this.removeLanRestartDialog();
    const overlay = document.createElement("div");
    overlay.id = "lanRestartWaitingDialog";
    overlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:99999;";
    const box = document.createElement("div");
    box.style.cssText = "background:#2a2218;border:2px solid #d4a843;border-radius:12px;padding:24px 32px;text-align:center;color:#e0d0b0;font-size:16px;max-width:360px;";
    box.innerHTML =
      '<div style="margin-bottom:12px;font-size:18px;font-weight:bold;">已发送重开请求</div>' +
      '<div style="color:#a09070;">等待其他玩家同意...</div>' +
      '<div style="margin-top:16px;"><span class="lan-waiting-spinner"></span></div>';
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    this.writeLog("已向所有玩家发送重开请求，等待确认...");
  }

  showLanRestartDeclinedDialog(declinerName) {
    this.removeLanRestartDialog();
    const overlay = document.createElement("div");
    overlay.id = "lanRestartDeclinedDialog";
    overlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:99999;";
    const box = document.createElement("div");
    box.style.cssText = "background:#2a2218;border:2px solid #8a4a3a;border-radius:12px;padding:24px 32px;text-align:center;color:#e0d0b0;font-size:16px;max-width:360px;";
    box.innerHTML =
      '<div style="margin-bottom:12px;font-size:18px;font-weight:bold;color:#e07060;">重开请求被拒绝</div>' +
      '<div style="color:#a09070;">' + declinerName + ' 拒绝了重开申请</div>' +
      '<button id="lanRestartDeclinedClose" style="margin-top:16px;padding:8px 24px;border-radius:6px;border:1px solid #8a4a3a;background:rgba(180,60,40,0.15);color:#e07060;cursor:pointer;font-size:14px;">确定</button>';
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    document.getElementById("lanRestartDeclinedClose").addEventListener("click", () => {
      overlay.remove();
    });
  }

  showLanPauseOverlay() {
    let overlay = document.getElementById("lanPauseOverlay");
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.id = "lanPauseOverlay";
    overlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:99998;";
    const box = document.createElement("div");
    box.style.cssText = "background:#2a2218;border:2px solid #d4a843;border-radius:12px;padding:28px 36px;text-align:center;color:#e0d0b0;font-size:16px;max-width:360px;";
    const title = document.createElement("div");
    title.style.cssText = "font-size:20px;font-weight:bold;margin-bottom:12px;color:#d4a843;";
    title.textContent = "游戏已暂停";
    box.appendChild(title);
    const hint = document.createElement("div");
    hint.style.cssText = "color:#a09070;margin-bottom:16px;";
    hint.textContent = this.isLanMode && this.lanIsHost ? "点击下方按钮继续游戏" : "等待主机继续游戏...";
    box.appendChild(hint);
    if (this.isLanMode && this.lanIsHost) {
      const resumeBtn = document.createElement("button");
      resumeBtn.style.cssText = "padding:10px 28px;border-radius:6px;border:1px solid #d4a843;background:rgba(212,168,67,0.15);color:#d4a843;cursor:pointer;font-size:15px;font-weight:bold;";
      resumeBtn.textContent = "结束暂停";
      resumeBtn.addEventListener("click", () => {
        this.toggleRoundPause();
      });
      box.appendChild(resumeBtn);
    }
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  hideLanPauseOverlay() {
    const overlay = document.getElementById("lanPauseOverlay");
    if (overlay) overlay.remove();
  }

  lanOnRestartGo(msg) {
    this.isLanMode = true;
    this.lanPlayers = msg.players || [];
    this.lanIsHost = (msg.hostId === this.lanBridge.playerId);
    const aiPlayersFromMsg = msg.aiPlayers || [];
    this.lanAiLlmEnabled = !!msg.aiLlmEnabled;
    if (this.lanIsHost) {
      this.lanHostWallets = {};
      this.lanPlayers.forEach((p) => { this.lanHostWallets[p.id] = DEFAULT_START_MONEY; });
      this.lanAiPlayers = aiPlayersFromMsg.map((ai) => ({ id: ai.id, name: ai.name, isAI: true, isHost: false, llm: ai.llm }));
      this.lanAiPlayers.forEach((ai) => {
        this.lanPlayers.push(ai);
        this.lanHostWallets[ai.id] = DEFAULT_START_MONEY;
      });
    } else {
      this.lanAiPlayers = aiPlayersFromMsg.map((ai) => ({ id: ai.id, name: ai.name, isAI: true, isHost: false, llm: ai.llm }));
      this.lanAiPlayers.forEach((ai) => {
        this.lanPlayers.push(ai);
      });
    }
    this.exitSettlementPage();
    this.startLanRun();
    this.writeLog("新一局已开始！");
  }

  applyMapProfile() {
    if (!window.MobaoMapProfiles) {
      return;
    }
    const profile = window.MobaoMapProfiles.getProfile(
      window.MobaoMapProfiles.getSelectedProfileId()
    );
    if (!profile || !profile.params) {
      return;
    }
    const p = profile.params;
    if (Number.isFinite(p.maxRounds)) {
      GAME_SETTINGS.maxRounds = p.maxRounds;
    }
    if (Number.isFinite(p.directTakeRatio)) {
      GAME_SETTINGS.directTakeRatio = p.directTakeRatio;
    }
    this._mapQualityWeights = p.qualityWeights || null;
    this._mapCategoryWeights = p.categoryWeights || null;
  }

  initPlayersUI() {
    const activeIds = new Set(this.players.map((p) => p.id));
    ["p1", "p2", "p3", "p4"].forEach((slotId) => {
      const cardEl = document.getElementById(`playerCard-${slotId}`);
      if (!cardEl) return;
      if (activeIds.has(slotId)) {
        cardEl.classList.remove("player-card-hidden");
      } else {
        cardEl.classList.add("player-card-hidden");
      }
    });

    const leftSide = document.getElementById("leftPlayerSide");
    const rightSide = document.getElementById("rightPlayerSide");
    const personalPanel = document.getElementById("personalPanel");
    const publicPanel = document.getElementById("publicPanel");
    if (leftSide && rightSide) {
      const playerCount = this.players.length;
      const leftSlots = playerCount <= 2 ? ["p1"] : ["p1", "p2"];
      const rightSlots = playerCount <= 1 ? [] : playerCount <= 2 ? ["p2"] : playerCount <= 3 ? ["p3"] : ["p3", "p4"];

      leftSlots.forEach((slotId) => {
        const cardEl = document.getElementById(`playerCard-${slotId}`);
        if (cardEl) leftSide.insertBefore(cardEl, personalPanel);
      });
      rightSlots.forEach((slotId) => {
        const cardEl = document.getElementById(`playerCard-${slotId}`);
        if (cardEl) rightSide.insertBefore(cardEl, publicPanel);
      });

      if (personalPanel) leftSide.appendChild(personalPanel);
      if (publicPanel) rightSide.appendChild(publicPanel);
    }

    this.players.forEach((player) => {
      const nameEl = document.getElementById(`name-${player.id}`);
      const avatarEl = document.getElementById(`avatar-${player.id}`);
      const cardEl = document.getElementById(`playerCard-${player.id}`);
      if (nameEl) {
        nameEl.textContent = player.name;
      }
      if (avatarEl) {
        avatarEl.textContent = player.avatar;
      }

      if (cardEl) {
        const metaEl = cardEl.querySelector(".meta");
        if (metaEl && player.isAI) {
          const toggleId = `llm-switch-${player.id}`;
          let switchEl = document.getElementById(toggleId);
          if (!switchEl) {
            const label = document.createElement("label");
            label.className = "llm-player-switch";
            label.setAttribute("for", toggleId);
            label.title = "启用该AI位的大模型决策";

            const input = document.createElement("input");
            input.type = "checkbox";
            input.id = toggleId;
            input.checked = this.isAiLlmEnabledForPlayer(player.id);
            input.addEventListener("change", () => {
              this.aiLlmPlayerEnabled[player.id] = Boolean(input.checked);
              LLM_BRIDGE.saveAiLlmPlayerSwitches(this.aiLlmPlayerEnabled);
              this.writeLog(`${player.name} 的大模型${input.checked ? "已启用" : "已关闭"}（总开关关闭时仍不会调用）。`);
            });

            const text = document.createElement("span");
            text.textContent = "LLM";

            label.appendChild(input);
            label.appendChild(text);
            metaEl.appendChild(label);
            switchEl = input;
          }

          switchEl.checked = this.isAiLlmEnabledForPlayer(player.id);
          if (this.isLanMode) {
            switchEl.disabled = true;
            const labelEl = switchEl.closest(".llm-player-switch");
            if (labelEl) labelEl.classList.add("llm-switch-disabled");
          } else {
            switchEl.disabled = false;
            const labelEl = switchEl.closest(".llm-player-switch");
            if (labelEl) labelEl.classList.remove("llm-switch-disabled");
          }
        } else if (metaEl && !player.isAI) {
          const existingLabel = metaEl.querySelector(".llm-player-switch");
          if (existingLabel) existingLabel.remove();
        }

        let historyEl = document.getElementById(`history-${player.id}`);
        if (!historyEl) {
          const history = document.createElement("div");
          history.id = `history-${player.id}`;
          history.className = "player-history";
          historyEl = history;
        }

        if (historyEl.parentElement !== cardEl) {
          cardEl.appendChild(historyEl);
        }
      }

      this.playerHistoryPanels[player.id] = document.getElementById(`history-${player.id}`);
    });

    this.refreshPlayerHistoryUI();
  }

  initPreviewFilterOptions() {
    const categories = [...new Set(window.ArtifactData.ARTIFACT_LIBRARY.map((item) => item.category))];
    const options = ['<option value="all">全部品类</option>']
      .concat(categories.map((category) => `<option value="${category}">${category}</option>`))
      .join("");

    this.dom.previewCategorySelect.innerHTML = options;
    this.dom.bidInput.step = "1";
    this.dom.bidInput.min = "0";
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
    if (window.PublicEventSystem) {
      this.currentPublicEvent = window.PublicEventSystem.pickRandomPublicEvent();
      this.publicInfoEntries.push({
        source: this.currentPublicEvent.category,
        text: this.currentPublicEvent.text
      });
    } else {
      this.currentPublicEvent = null;
    }

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
    this.dom.pauseRoundBtn.textContent = this.roundPaused ? "继续回合" : "暂停回合";
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

  setPlayerBidReady(playerId, ready) {
    this.roundBidReadyState[playerId] = Boolean(ready);
    const cardEl = document.getElementById(`playerCard-${playerId}`);
    if (cardEl) {
      cardEl.classList.toggle("bid-ready", Boolean(ready));
    }
  }

  areAllPlayersBidReady() {
    return this.players.every((player) => Boolean(this.roundBidReadyState[player.id]));
  }

  async kickoffAiRoundDecisions() {
    try {
      await this.prepareAiLlmRoundPlans();
      if (!this.isLanMode && this.roundPaused) await this.waitUntilResumed();
      await this.processAiIntelActions();
      if (this.roundPaused) {
        await this.waitUntilResumed();
      }
      this.players
        .filter((player) => !player.isHuman)
        .forEach((player) => this.setPlayerBidReady(player.id, true));
      this.updateHud();
      if (this.isLanMode && this.lanIsHost && this.lanBridge) {
        this.lanBridge.send({
          type: "lan:ai-bids-ready",
          aiPlayerIds: this.lanAiPlayers.map((ai) => ai.id),
        });
      }
    } catch (error) {
      if (error && error.message === "PAUSE_CANCELLED") return;
      const message = error && error.message ? error.message : "AI回合初始化失败";
      this.writeLog(`AI回合初始化异常：${message}`);
    } finally {
      this.aiRoundDecisionPromise = null;
    }

    if (!this.isLanMode && !this.roundResolving && !this.settled && !this.roundPaused && this.areAllPlayersBidReady()) {
      this.resolveRoundBids("all-ready");
    }
  }

  waitUntilResumed() {
    return new Promise((resolve, reject) => {
      if (!this.roundPaused) { resolve(); return; }
      const check = () => {
        if (this.settled || this.roundResolving) { reject(new Error("PAUSE_CANCELLED")); return; }
        if (!this.roundPaused) { resolve(); return; }
        setTimeout(check, 200);
      };
      check();
    });
  }

  initAiWallets() {
    const aiPlayers = this.players.filter((player) => !player.isHuman);
    this.aiWallets = {};
    aiPlayers.forEach((player) => {
      const budget = Math.max(
        this.currentBid + GAME_SETTINGS.bidStep,
        Math.round(this.warehouseTrueValue * Phaser.Math.FloatBetween(0.82, 1.08))
      );
      this.aiWallets[player.id] = budget;
    });
  }

  getAiWallet(playerId) {
    const fallback = Math.max(this.currentBid + GAME_SETTINGS.bidStep, this.aiMaxBid || 0);
    const direct = Math.max(0, Math.round(Number(this.aiWallets[playerId]) || 0));
    if (direct > 0) return direct;
    if (this.isLanMode && this.slotIdToLanId[playerId]) {
      const lanId = this.slotIdToLanId[playerId];
      const lanWallet = Math.max(0, Math.round(Number(this.lanHostWallets[lanId]) || 0));
      if (lanWallet > 0) return lanWallet;
    }
    return fallback;
  }

  getAiMinimumBid(playerId, wallet = null) {
    const safeWallet = wallet === null
      ? this.getAiWallet(playerId)
      : Math.max(0, Math.round(Number(wallet) || 0));
    const step = Math.max(1, Math.round(Number(GAME_SETTINGS.bidStep) || 1));
    if (safeWallet <= 0) {
      return 0;
    }
    return roundToStep(step, step);
  }

  normalizeAiBidValue(playerId, bid, wallet = null) {
    const safeWallet = wallet === null ? this.getAiWallet(playerId) : Math.max(0, Math.round(Number(wallet) || 0));
    const step = Math.max(1, Math.round(Number(GAME_SETTINGS.bidStep) || 1));
    const minBid = this.getAiMinimumBid(playerId, safeWallet);
    if (safeWallet <= 0) {
      return 0;
    }
    const safe = clamp(Math.round(Number(bid) || 0), minBid, safeWallet);
    return Math.max(minBid, roundToStep(safe, step));
  }

  openBidKeypad() {
    if (this.settled || this.roundResolving || this.playerBidSubmitted) {
      return;
    }

    this.closeItemDrawer();
    this.hideInfoPopup();
    this.keypadValue = String(Math.max(0, Math.round(Number(this.dom.bidInput.value) || 0)));
    this.syncBidKeypadScreen();
    this.updateKeypadDirectHint();
    this.dom.bidKeypad.classList.remove("hidden");
    if (this.input) {
      this.input.enabled = false;
    }
  }

  closeBidKeypad() {
    this.dom.bidKeypad.classList.add("hidden");
    if (this.input) {
      this.input.enabled = true;
    }
  }

  syncBidKeypadScreen() {
    this.dom.keypadScreen.textContent = this.keypadValue;
    this.updateKeypadDirectHint();
  }

  updateKeypadDirectHint() {
    if (!this.dom.keypadDirectHint) return;
    if (this.round >= GAME_SETTINGS.maxRounds || this.settled) {
      this.dom.keypadDirectHint.classList.add("hidden");
      return;
    }
    const myBid = Math.max(0, Math.round(Number(this.keypadValue) || 0));
    const secondBid = this.secondHighestBid || 0;
    const ratio = GAME_SETTINGS.directTakeRatio;
    const requiredBid = secondBid > 0 ? Math.ceil(secondBid * (1 + ratio)) : 0;
    if (myBid > 0 && requiredBid > 0 && myBid >= requiredBid) {
      this.dom.keypadDirectHint.textContent = "可直接拿下";
      this.dom.keypadDirectHint.classList.remove("hidden");
    } else if (requiredBid > 0) {
      const displayRatio = (1 + ratio).toFixed(1);
      this.dom.keypadDirectHint.textContent = `达第2名${displayRatio}倍可拿下`;
      this.dom.keypadDirectHint.classList.remove("hidden");
    } else {
      this.dom.keypadDirectHint.classList.add("hidden");
    }
  }

  handleBidKeyInput(key) {
    if (key === "clear") {
      this.keypadValue = "0";
      this.syncBidKeypadScreen();
      return;
    }

    if (key === "del") {
      this.keypadValue = this.keypadValue.length <= 1 ? "0" : this.keypadValue.slice(0, -1);
      this.syncBidKeypadScreen();
      return;
    }

    if (key === "ok") {
      const bid = Math.max(0, Math.round(Number(this.keypadValue) || 0));
      this.dom.bidInput.value = String(bid);
      this.closeBidKeypad();
      this.showGameConfirm(`确认出价 ${bid.toLocaleString()} ？`, () => this.playerBid());
      return;
    }

    const next = this.keypadValue === "0" ? key : this.keypadValue + key;
    this.keypadValue = String(Math.min(99999999, Number(next) || 0));
    this.syncBidKeypadScreen();
  }

  showGameConfirm(message, onConfirm) {
    this.dom.gameConfirmMsg.textContent = message;
    this._gameConfirmCallback = onConfirm || null;
    this.dom.gameConfirmOverlay.classList.remove("hidden");
  }

  hideGameConfirm() {
    this.dom.gameConfirmOverlay.classList.add("hidden");
    this._gameConfirmCallback = null;
  }

  showInfoPopup(title, sourceScrollEl) {
    this.dom.infoPopupTitle.textContent = title;
    if (sourceScrollEl) {
      this.dom.infoPopupContent.innerHTML = sourceScrollEl.innerHTML;
    } else {
      this.dom.infoPopupContent.innerHTML = "";
    }
    this.dom.infoPopupOverlay.classList.remove("hidden");
  }

  hideInfoPopup() {
    this.dom.infoPopupOverlay.classList.add("hidden");
  }

  openSettingsOverlay() {
    this.closeBidKeypad();
    this.closeItemDrawer();
    this.hideInfoPopup();
    this.fillSettingsForm(GAME_SETTINGS);
    this.fillLlmSettingsForm(LLM_SETTINGS);
    this.setSettingsStatus("设置保存在本地浏览器中。", false);
    const llmGroup = document.getElementById("llmSettingsGroup");
    if (llmGroup) {
      if (this.isLanMode) {
        llmGroup.classList.add("settings-group-disabled");
        const inputs = llmGroup.querySelectorAll("input, button");
        inputs.forEach((el) => { el.disabled = true; });
      } else {
        llmGroup.classList.remove("settings-group-disabled");
        const inputs = llmGroup.querySelectorAll("input, button");
        inputs.forEach((el) => { el.disabled = false; });
      }
    }
    this.dom.settingsOverlay.classList.remove("hidden");
  }

  closeSettingsOverlay(keepStatus = false) {
    this.dom.settingsOverlay.classList.add("hidden");
    if (!keepStatus) {
      this.setSettingsStatus("设置保存在本地浏览器中。", false);
    }
  }

  openAiLogicPanel() {
    if (!this.dom.aiLogicOverlay) {
      return;
    }
    this.renderAiLogicPanel();
    this.dom.aiLogicOverlay.classList.remove("hidden");
  }

  closeAiLogicPanel() {
    if (!this.dom.aiLogicOverlay) {
      return;
    }
    this.dom.aiLogicOverlay.classList.add("hidden");
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

  isSettingsOverlayOpen() {
    return !this.dom.settingsOverlay.classList.contains("hidden");
  }

  settingsInputId(field) {
    return `setting-${field}`;
  }

  fillSettingsForm(values) {
    SETTINGS_FIELDS.forEach((field) => {
      const input = document.getElementById(this.settingsInputId(field));
      if (!input) {
        return;
      }
      input.value = String(values[field]);
    });
    if (this.dom.qualityTextToggle) {
      this.dom.qualityTextToggle.checked = this.useQualityText;
    }
  }

  readSettingsForm() {
    const draft = {};
    SETTINGS_FIELDS.forEach((field) => {
      const input = document.getElementById(this.settingsInputId(field));
      draft[field] = input ? Number(input.value) : GAME_SETTINGS[field];
    });
    if (this.dom.qualityTextToggle) {
      this.useQualityText = this.dom.qualityTextToggle.checked;
      this.syncAllQualityTextVisibility();
    }
    return normalizeGameSettings(draft, GAME_SETTINGS);
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

  saveSettingsFromOverlay() {
    const next = this.readSettingsForm();
    Object.assign(GAME_SETTINGS, next);
    saveGameSettings(GAME_SETTINGS);

    if (!this.isLanMode) {
      const oldMultiGameMemoryEnabled = Boolean(LLM_SETTINGS.multiGameMemoryEnabled);
      const llmNext = this.readLlmSettingsForm();
      Object.assign(LLM_SETTINGS, llmNext);
      saveDeepSeekSettings(LLM_SETTINGS);
      this.deepSeekClient.applySettings(LLM_SETTINGS);
      if (oldMultiGameMemoryEnabled && !LLM_SETTINGS.multiGameMemoryEnabled) {
        this.resetAiConversations();
        this.writeLog("已关闭多局AI上下文：AI对话记忆已清空。");
      }
      if (!oldMultiGameMemoryEnabled && LLM_SETTINGS.multiGameMemoryEnabled) {
        this.pushRunStartContextToAi();
        this.writeLog("已启用多局AI上下文：后续会在同一会话中连续学习。");
      }
    }

    this.dom.bidInput.step = "1";
    this.dom.bidInput.min = "0";
    const normalizedBid = Math.max(0, Math.round(Number(this.dom.bidInput.value) || 0));
    this.dom.bidInput.value = String(normalizedBid);

    this.round = clamp(this.round, 1, GAME_SETTINGS.maxRounds);
    this.roundTimeLeft = Math.min(this.roundTimeLeft, GAME_SETTINGS.roundSeconds);
    this.actionsLeft = Math.min(this.actionsLeft, GAME_SETTINGS.actionsPerRound);
    this.updateHud();

    this.setSettingsStatus("设置已保存并立即生效。", true);
    this.setLlmSettingsStatus(
      LLM_SETTINGS.apiKey
        ? `DeepSeek配置已保存：${maskApiKey(LLM_SETTINGS.apiKey)}`
        : "DeepSeek配置已保存，但尚未填写 API Key。",
      LLM_SETTINGS.apiKey ? "success" : "normal"
    );
    this.writeLog(`设置已应用：对局参数生效；DeepSeek ${LLM_SETTINGS.enabled ? "已启用" : "未启用"}，模型 ${LLM_SETTINGS.model}。`);
    this.closeSettingsOverlay(true);
  }

  setSettingsStatus(text, saved) {
    this.dom.settingsStatusText.textContent = text;
    this.dom.settingsStatusText.classList.toggle("settings-note-saved", Boolean(saved));
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

  buildSkillContext() {
    return {
      revealOutline: ({ count, category, allowCategoryFallback = false }) =>
        this.revealOutlineBatch(count, category, allowCategoryFallback),
      revealQuality: ({ count, category, allowCategoryFallback = false }) =>
        this.revealQualityBatch(count, category, allowCategoryFallback)
    };
  }

  initAiIntelSystems() {
    this.aiPrivateIntel = {};
    this.aiResourceState = {};
    this.aiRoundEffects = {};
    this.lastAiIntelActions = [];
    this.aiLlmRoundPlans = {};
    this.aiFoldState = {};
    this.highValuePriceThreshold = null;

    const aiPlayers = this.players.filter((player) => !player.isHuman);
    aiPlayers.forEach((player) => {
      this.aiPrivateIntel[player.id] = createEmptyAiPrivateIntelPool();
      this.aiResourceState[player.id] = {
        skills: Object.fromEntries(SKILL_DEFS.map((skill) => [skill.id, skill.maxPerRound])),
        items: Object.fromEntries(ITEM_DEFS.map((item) => [item.id, item.initialCount]))
      };
      this.aiFoldState[player.id] = false;
    });
  }

  resetAiRoundResources() {
    const aiPlayers = this.players.filter((player) => !player.isHuman);
    aiPlayers.forEach((player) => {
      const resourceState = this.aiResourceState[player.id];
      if (!resourceState) {
        return;
      }
      SKILL_DEFS.forEach((skill) => {
        resourceState.skills[skill.id] = skill.maxPerRound;
      });
    });
    this.aiRoundEffects = {};
    this.lastAiIntelActions = [];
    this.aiLlmRoundPlans = {};
  }

  ensureAiPrivateIntel(playerId) {
    if (this.aiPrivateIntel[playerId]) {
      return this.aiPrivateIntel[playerId];
    }

    const pool = createEmptyAiPrivateIntelPool();
    this.aiPrivateIntel[playerId] = pool;
    return pool;
  }

  getAiIntelSummary(playerId) {
    const pool = this.ensureAiPrivateIntel(playerId);
    const total = Math.max(1, this.items.length);
    const outlineCount = pool.outlineSignals.length;
    const qualityCount = pool.qualitySignals.length;
    const clueCount = outlineCount + qualityCount;
    const clueRate = clamp((outlineCount * 0.65 + qualityCount) / total, 0, 1);
    const qualityRate = clamp(qualityCount / total, 0, 1);

    if (!pool.aggregateStats) {
      const totalStats = this.artifactManager.getSignalPriceStats(pool.signalHistory);
      pool.aggregateStats = totalStats.aggregate;
    }

    const aggregateStats = pool.aggregateStats || {
      mean: 0,
      spreadRatio: 0,
      upperEdge: 0,
      lowerEdge: 0,
      std: 0,
      iqr: 0,
      count: 0
    };

    const edgeBias = Math.max(0, aggregateStats.upperEdge - aggregateStats.lowerEdge);
    const uncertainty = clamp(
      0.88 - clueRate * 0.48 - qualityRate * 0.2 + aggregateStats.spreadRatio * 0.35 - edgeBias * 0.08,
      0.05,
      1
    );

    return {
      clueCount,
      outlineCount,
      qualityCount,
      clueRate,
      qualityRate,
      uncertainty,
      signalCount: pool.signalHistory.length,
      meanEstimate: aggregateStats.mean,
      spreadRatio: aggregateStats.spreadRatio,
      upperEdge: aggregateStats.upperEdge,
      lowerEdge: aggregateStats.lowerEdge,
      std: aggregateStats.std,
      iqr: aggregateStats.iqr
    };
  }

  buildAiIntelSnapshot() {
    const map = {};
    this.players
      .filter((player) => !player.isHuman)
      .forEach((player) => {
        map[player.id] = this.getAiIntelSummary(player.id);
      });
    return map;
  }

  getAiResourceSnapshot(playerId) {
    const resourceState = this.aiResourceState[playerId];
    if (!resourceState) {
      return {
        skills: {},
        items: {}
      };
    }

    return {
      skills: { ...resourceState.skills },
      items: { ...resourceState.items }
    };
  }

  buildAiPrivateRevealContext(playerId) {
    return {
      revealOutline: ({ count, category, allowCategoryFallback = false }) =>
        this.revealPrivateIntelBatch(playerId, "outline", count, category, allowCategoryFallback),
      revealQuality: ({ count, category, allowCategoryFallback = false }) =>
        this.revealPrivateIntelBatch(playerId, "quality", count, category, allowCategoryFallback)
    };
  }

  pickRandomItemCell(item) {
    const cells = [];
    for (let y = item.y; y < item.y + item.h; y += 1) {
      for (let x = item.x; x < item.x + item.w; x += 1) {
        cells.push({ x, y });
      }
    }

    if (cells.length === 0) {
      return null;
    }
    return cells[Math.floor(Math.random() * cells.length)];
  }

  markAiKnownCellState(playerId, x, y, state) {
    const pool = this.ensureAiPrivateIntel(playerId);
    if (!this.isInBoundsCell(x, y)) {
      return;
    }
    pool.knownCellStates[toCellKey(x, y)] = state;
  }

  scanNeighborIntelAroundCell(playerId, x, y) {
    const offsets = [
      [-1, -1], [0, -1], [1, -1],
      [-1, 0], [1, 0],
      [-1, 1], [0, 1], [1, 1]
    ];

    offsets.forEach(([dx, dy]) => {
      const nx = x + dx;
      const ny = y + dy;
      if (!this.isInBoundsCell(nx, ny)) {
        return;
      }
      const state = this.isWarehouseCellOccupied(nx, ny) ? "occupied" : "empty";
      this.markAiKnownCellState(playerId, nx, ny, state);
    });
  }

  buildAiPrivateSignal(playerId, item, mode) {
    const sampleCell = this.pickRandomItemCell(item);

    if (sampleCell) {
      this.markAiKnownCellState(playerId, sampleCell.x, sampleCell.y, "occupied");
      this.scanNeighborIntelAroundCell(playerId, sampleCell.x, sampleCell.y);
    }

    if (mode === "outline") {
      return {
        type: "outline",
        itemId: item.id,
        sizeTag: toSizeTag(item.w, item.h),
        category: item.category,
        sampleCell,
        round: this.round
      };
    }

    return {
      type: "quality",
      itemId: item.id,
      qualityKey: item.qualityKey,
      sampleCell,
      round: this.round
    };
  }

  ensureAiItemKnowledge(playerId, itemId) {
    const pool = this.ensureAiPrivateIntel(playerId);
    if (pool.itemKnowledge[itemId]) {
      return pool.itemKnowledge[itemId];
    }

    const created = {
      itemId,
      qualityKey: null,
      category: null,
      sizeTag: null,
      knownCells: new Set(),
      revealCount: 0,
      firstSeenRound: this.round,
      lastSeenRound: this.round
    };
    pool.itemKnowledge[itemId] = created;
    return created;
  }

  getHighValuePriceThreshold() {
    if (Number.isFinite(this.highValuePriceThreshold) && this.highValuePriceThreshold > 0) {
      return this.highValuePriceThreshold;
    }

    const prices = ARTIFACT_LIBRARY
      .map((entry) => Number(entry.basePrice) || 0)
      .filter((value) => value > 0)
      .sort((a, b) => a - b);

    if (prices.length === 0) {
      this.highValuePriceThreshold = 6000;
      return this.highValuePriceThreshold;
    }

    const idx = Math.floor((prices.length - 1) * 0.8);
    const p80 = prices[idx] || prices[prices.length - 1];
    this.highValuePriceThreshold = Math.max(5200, Math.round(p80));
    return this.highValuePriceThreshold;
  }

  isHighValueArtifact(item) {
    const threshold = this.getHighValuePriceThreshold();
    return item.qualityKey === "legendary" || (Number(item.basePrice) || 0) >= threshold;
  }

  ensureAiHighValueTrack(playerId, item) {
    if (!this.isHighValueArtifact(item)) {
      return null;
    }

    const pool = this.ensureAiPrivateIntel(playerId);
    let trackId = pool.highValueTrackByItemId[item.id];
    if (!trackId) {
      trackId = `红${formatTrackIndex(pool.nextTrackIndex)}`;
      pool.nextTrackIndex += 1;
      pool.highValueTrackByItemId[item.id] = trackId;
      pool.highValueTracks.push({
        trackId,
        itemId: item.id,
        createdRound: this.round,
        lastSeenRound: this.round
      });
      return { trackId, created: true };
    }

    const track = pool.highValueTracks.find((entry) => entry.itemId === item.id);
    if (track) {
      track.lastSeenRound = this.round;
    }
    return { trackId, created: false };
  }

  updateAiItemKnowledge(playerId, item, signal, mode) {
    const intel = this.ensureAiItemKnowledge(playerId, item.id);
    intel.revealCount += 1;
    intel.lastSeenRound = this.round;

    if (mode === "outline") {
      intel.category = item.category;
      intel.sizeTag = toSizeTag(item.w, item.h);
    } else if (mode === "quality") {
      intel.qualityKey = item.qualityKey;
    }

    if (signal && signal.sampleCell) {
      intel.knownCells.add(toCellKey(signal.sampleCell.x, signal.sampleCell.y));
    }

    // 检查是否为高价值追踪目标，如果是且状态有更新，返回更新后的追踪信息
    const pool = this.ensureAiPrivateIntel(playerId);
    const trackId = pool.highValueTrackByItemId[item.id];
    if (trackId) {
      const track = pool.highValueTracks.find((entry) => entry.itemId === item.id);
      if (track) {
        track.lastSeenRound = this.round;
        // 构建更新后的追踪信息
        const revealState = {
          qualityKey: intel.qualityKey,
          category: intel.category,
          sizeTag: intel.sizeTag
        };
        const candidatePreview = this.buildTrackCandidatePreview(revealState);
        const exactKnown = candidatePreview.total === 1;
        const revealLevel = exactKnown
          ? "已完全确定"
          : (intel.qualityKey && intel.category)
            ? "范围缩小"
            : (intel.qualityKey)
              ? "仅知品质"
              : (intel.category)
                ? "已知品类"
                : "仅知轮廓";

        return {
          ...intel,
          trackUpdate: {
            trackId,
            revealLevel,
            confirmed: {
              quality: intel.qualityKey
                ? (QUALITY_CONFIG[intel.qualityKey] ? QUALITY_CONFIG[intel.qualityKey].label : intel.qualityKey)
                : "未知",
              category: intel.category ? intel.category : "未知",
              exactArtifact: exactKnown && candidatePreview.list[0]
                ? candidatePreview.list[0].name
                : null
            },
            candidates: {
              total: candidatePreview.total,
              truncated: candidatePreview.truncated
            }
          }
        };
      }
    }

    return intel;
  }

  revealPrivateIntelBatch(playerId, mode, count, category, allowCategoryFallback = false) {
    const targets = this.pickPrivateRevealTargets({
      playerId,
      mode,
      count,
      category,
      allowCategoryFallback
    });

    if (targets.length === 0) {
      return { ok: false, revealed: 0, message: "没有可揭示目标。" };
    }

    const pool = this.ensureAiPrivateIntel(playerId);
    const signals = [];
    const trackUpdates = [];

    targets.forEach((item) => {
      const signal = this.buildAiPrivateSignal(playerId, item, mode);
      if (mode === "outline") {
        pool.knownOutlineIds.add(item.id);
        pool.outlineSignals.push(signal);
      } else {
        pool.knownQualityIds.add(item.id);
        pool.qualitySignals.push(signal);
        // 只有品质性质的道具或技能可以触发高价值追踪
        const trackUpdate = this.ensureAiHighValueTrack(playerId, item);
        if (trackUpdate) {
          trackUpdates.push(trackUpdate);
        }
      }

      const knowledgeUpdate = this.updateAiItemKnowledge(playerId, item, signal, mode);
      // 如果返回了trackUpdate，将其添加到trackUpdates数组中
      if (knowledgeUpdate.trackUpdate) {
        trackUpdates.push(knowledgeUpdate.trackUpdate);
      }

      signals.push(signal);
    });

    pool.signalHistory.push(...signals);
    if (pool.signalHistory.length > 160) {
      pool.signalHistory = pool.signalHistory.slice(-160);
    }

    const signalStats = this.artifactManager.getSignalPriceStats(signals);
    const totalStats = this.artifactManager.getSignalPriceStats(pool.signalHistory);
    pool.latestSignalStats = signalStats;
    pool.aggregateStats = totalStats.aggregate;
    const bottomCell = mode === "outline" ? this.pickBottomCellFromTargets(targets) : null;

    return {
      ok: true,
      revealed: targets.length,
      signals,
      signalStats,
      trackUpdates,
      bottomCell
    };
  }

  pickPrivateRevealTargets({ playerId, mode, count, category, allowCategoryFallback = false }) {
    const pool = this.ensureAiPrivateIntel(playerId);
    const knownSet = mode === "outline" ? pool.knownOutlineIds : pool.knownQualityIds;

    const isUnknown = (item) => {
      return !knownSet.has(item.id);
    };

    const primary = this.items.filter((item) => {
      if (category && item.category !== category) {
        return false;
      }
      return isUnknown(item);
    });

    let selected = shuffle(primary).slice(0, count);
    if (selected.length < count && allowCategoryFallback && category) {
      const existed = new Set(selected.map((item) => item.id));
      const fallback = this.items.filter((item) => !existed.has(item.id) && isUnknown(item));
      selected = selected.concat(shuffle(fallback).slice(0, count - selected.length));
    }

    return selected;
  }

  getPlayerById(playerId) {
    return this.players.find((entry) => entry.id === playerId) || null;
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

  getAiNeighborStateLabel(playerId, x, y) {
    if (!this.isInBoundsCell(x, y)) {
      return "越界";
    }

    const pool = this.ensureAiPrivateIntel(playerId);
    const key = toCellKey(x, y);
    const raw = pool.knownCellStates[key];
    if (raw === "occupied") {
      return "已被占用";
    }
    if (raw === "empty") {
      return "确认空闲";
    }
    return "尚未探明";
  }

  buildNeighborSnapshot(playerId, cell) {
    if (!cell) {
      return null;
    }

    return {
      上: this.getAiNeighborStateLabel(playerId, cell.x, cell.y - 1),
      下: this.getAiNeighborStateLabel(playerId, cell.x, cell.y + 1),
      左: this.getAiNeighborStateLabel(playerId, cell.x - 1, cell.y),
      右: this.getAiNeighborStateLabel(playerId, cell.x + 1, cell.y),
      左上: this.getAiNeighborStateLabel(playerId, cell.x - 1, cell.y - 1),
      右上: this.getAiNeighborStateLabel(playerId, cell.x + 1, cell.y - 1),
      左下: this.getAiNeighborStateLabel(playerId, cell.x - 1, cell.y + 1),
      右下: this.getAiNeighborStateLabel(playerId, cell.x + 1, cell.y + 1)
    };
  }

  buildAiAggregateIntelBlock(playerId) {
    const pool = this.ensureAiPrivateIntel(playerId);
    const qualityMap = {};
    const categoryMap = {};

    pool.qualitySignals.forEach((signal) => {
      if (!signal || !signal.qualityKey) {
        return;
      }
      const key = signal.qualityKey;
      if (!qualityMap[key]) {
        qualityMap[key] = {
          qualityKey: key,
          qualityLabel: QUALITY_CONFIG[key] ? QUALITY_CONFIG[key].label : key,
          count: 0,
          deepestRow: 0,
          estimatedCellCount: 0,
          estimatedCellSamples: 0
        };
      }
      qualityMap[key].count += 1;
      if (signal.sampleCell && Number.isFinite(signal.sampleCell.y)) {
        qualityMap[key].deepestRow = Math.max(qualityMap[key].deepestRow, signal.sampleCell.y + 1);
      }
      const knowledge = pool.itemKnowledge[signal.itemId];
      const sizeCells = knowledge ? sizeTagToCellCount(knowledge.sizeTag) : null;
      if (Number.isFinite(sizeCells) && sizeCells > 0) {
        qualityMap[key].estimatedCellCount += sizeCells;
        qualityMap[key].estimatedCellSamples += 1;
      }
    });

    pool.outlineSignals.forEach((signal) => {
      if (!signal || !signal.category) {
        return;
      }
      const key = signal.category;
      if (!categoryMap[key]) {
        categoryMap[key] = {
          category: key,
          count: 0,
          highQualityCount: 0,
          knownQualityCount: 0
        };
      }
      categoryMap[key].count += 1;
      const knowledge = pool.itemKnowledge[signal.itemId];
      if (knowledge && knowledge.qualityKey) {
        categoryMap[key].knownQualityCount += 1;
        if (knowledge.qualityKey === "rare" || knowledge.qualityKey === "legendary") {
          categoryMap[key].highQualityCount += 1;
        }
      }
    });

    const byQuality = Object.values(qualityMap)
      .sort((a, b) => b.count - a.count)
      .map((entry) => ({
        quality: entry.qualityLabel,
        count: entry.count,
        deepestRow: entry.deepestRow || null,
        estimatedOccupiedCells: entry.estimatedCellSamples > 0
          ? Math.round(entry.estimatedCellCount / entry.estimatedCellSamples)
          : null
      }));

    const byCategory = Object.values(categoryMap)
      .sort((a, b) => b.count - a.count)
      .map((entry) => ({
        category: entry.category,
        count: entry.count,
        qualityHint: entry.knownQualityCount > 0
          ? `已知品质中高品质 ${entry.highQualityCount}/${entry.knownQualityCount}`
          : "暂无品质细分"
      }));

    return {
      byQuality,
      byCategory,
      signalCount: pool.signalHistory.length
    };
  }

  buildTrackCandidatePreview(revealState) {
    let candidates = this.artifactManager.getCandidatesByRevealState(revealState);
    if (!candidates || candidates.length === 0) {
      const threshold = this.getHighValuePriceThreshold();
      candidates = ARTIFACT_LIBRARY
        .filter((entry) => entry.qualityKey === "legendary" || entry.basePrice >= threshold)
        .map((entry) => ({
          ...entry,
          expectedPrice: entry.basePrice,
          previewSizeTag: toSizeTag(entry.w, entry.h)
        }));
    }

    const sorted = [...candidates].sort((a, b) => (b.expectedPrice || b.basePrice || 0) - (a.expectedPrice || a.basePrice || 0));
    if (sorted.length <= 10) {
      return {
        total: sorted.length,
        truncated: false,
        list: sorted
      };
    }

    const first = sorted.slice(0, 5);
    const tail = sorted.slice(-5);
    return {
      total: sorted.length,
      truncated: true,
      list: first.concat(tail)
    };
  }

  buildAiHighValueTrackBlock(playerId) {
    const pool = this.ensureAiPrivateIntel(playerId);
    const tracks = pool.highValueTracks || [];

    return tracks.map((track) => {
      const item = this.items.find((entry) => entry.id === track.itemId);
      const knowledge = pool.itemKnowledge[track.itemId] || null;
      const knownCells = knowledge && knowledge.knownCells
        ? [...knowledge.knownCells].map((cellKey) => fromCellKey(cellKey)).filter(Boolean)
        : [];
      const anchorCell = knownCells[0] || null;

      const revealState = {
        qualityKey: knowledge && knowledge.qualityKey ? knowledge.qualityKey : null,
        category: knowledge && knowledge.category ? knowledge.category : null,
        sizeTag: knowledge && knowledge.sizeTag ? knowledge.sizeTag : null
      };
      const candidatePreview = this.buildTrackCandidatePreview(revealState);
      const exactKnown = candidatePreview.total === 1;
      const revealLevel = exactKnown
        ? "已完全确定"
        : (knowledge && knowledge.qualityKey && knowledge.category)
          ? "范围缩小"
          : (knowledge && knowledge.qualityKey)
            ? "仅知品质"
            : (knowledge && knowledge.category)
              ? "已知品类"
              : "仅知轮廓";

      return {
        trackId: track.trackId,
        revealLevel,
        confirmed: {
          quality: knowledge && knowledge.qualityKey
            ? (QUALITY_CONFIG[knowledge.qualityKey] ? QUALITY_CONFIG[knowledge.qualityKey].label : knowledge.qualityKey)
            : "未知",
          category: knowledge && knowledge.category ? knowledge.category : "未知",
          exactArtifact: exactKnown && candidatePreview.list[0]
            ? candidatePreview.list[0].name
            : null
        },
        candidates: {
          total: candidatePreview.total,
          truncated: candidatePreview.truncated,
          list: candidatePreview.list.map((entry) => ({
            name: entry.name,
            refPriceRange: [
              Math.round((entry.expectedPrice || entry.basePrice || 0) * 0.9),
              Math.round((entry.expectedPrice || entry.basePrice || 0) * 1.1)
            ],
            sizeCells: (entry.w && entry.h) ? entry.w * entry.h : sizeTagToCellCount(entry.previewSizeTag)
          }))
        },
        spatial: {
          knownCells: knownCells.map((cell) => ({ row: cell.y + 1, col: cell.x + 1 })),
          neighborState: this.buildNeighborSnapshot(playerId, anchorCell)
        },
        internalRef: item ? item.id : track.itemId
      };
    });
  }

  buildAiPrivateIntelBlock(playerId) {
    return {
      aggregate: this.buildAiAggregateIntelBlock(playerId),
      highValueTracks: this.buildAiHighValueTrackBlock(playerId)
    };
  }

  getAiAvailableActionState(playerId) {
    const resource = this.getAiResourceSnapshot(playerId);
    const availableSkillIds = SKILL_DEFS
      .filter((entry) => Number(resource.skills[entry.id] || 0) > 0)
      .map((entry) => entry.id);
    const availableItemIds = ITEM_DEFS
      .filter((entry) => Number(resource.items[entry.id] || 0) > 0)
      .map((entry) => entry.id);

    return {
      availableSkillIds,
      availableItemIds,
      availableSkillNames: SKILL_DEFS
        .filter((entry) => availableSkillIds.includes(entry.id))
        .map((entry) => entry.name),
      availableItemNames: ITEM_DEFS
        .filter((entry) => availableItemIds.includes(entry.id))
        .map((entry) => entry.name)
    };
  }

  buildAiActionConstraintBlock(playerId) {
    const actionState = this.getAiAvailableActionState(playerId);
    return {
      canBid: true,
      canFold: false,
      availableSkills: actionState.availableSkillNames,
      availableItems: actionState.availableItemNames,
      notes: [
        "本轮最多选择一个情报动作（技能或道具二选一）。",
        "当前技能/道具不需要目标参数；若填写目标，只会作为日志记录。"
      ],
      _internal: actionState
    };
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

  executeAiIntelAction(playerId, plan) {
    const resourceState = this.aiResourceState[playerId];
    if (!resourceState || !plan || plan.actionType === "none") {
      return { ok: false, revealed: 0, message: "未执行AI情报行动。" };
    }

    const usedThisRound = this.currentRoundUsage[playerId] || [];
    if (usedThisRound.length > 0) {
      return { ok: false, revealed: 0, message: "本回合已使用过技能或道具。" };
    }

    if (plan.actionType === "skill") {
      const remain = Number(resourceState.skills[plan.actionId] || 0);
      if (remain <= 0) {
        return { ok: false, revealed: 0, message: "AI技能次数不足。" };
      }

      const skill = SKILL_DEFS.find((entry) => entry.id === plan.actionId);
      if (!skill) {
        return { ok: false, revealed: 0, message: "AI技能不存在。" };
      }

      const result = skill.execute(this.buildAiPrivateRevealContext(playerId));
      if (!result.ok) {
        return result;
      }

      resourceState.skills[plan.actionId] = remain - 1;
      return result;
    }

    if (plan.actionType === "item") {
      const remain = Number(resourceState.items[plan.actionId] || 0);
      if (remain <= 0) {
        return { ok: false, revealed: 0, message: "AI道具库存不足。" };
      }

      const item = ITEM_DEFS.find((entry) => entry.id === plan.actionId);
      if (!item) {
        return { ok: false, revealed: 0, message: "AI道具不存在。" };
      }

      const result = item.execute(this.buildAiPrivateRevealContext(playerId));
      if (!result.ok) {
        return result;
      }

      resourceState.items[plan.actionId] = remain - 1;
      return result;
    }

    return { ok: false, revealed: 0, message: "未知AI行动类型。" };
  }

  async processAiIntelActions() {
    const aiPlayers = this.players.filter((player) => !player.isHuman);
    const roundProgress = GAME_SETTINGS.maxRounds <= 1
      ? 1
      : (this.round - 1) / (GAME_SETTINGS.maxRounds - 1);

    this.aiRoundEffects = {};
    this.lastAiIntelActions = [];

    if (!this.aiErrorCorrectionHistory) {
      this.aiErrorCorrectionHistory = {};
    }

    for (const player of aiPlayers) {
      if (!this.isLanMode && this.roundPaused) await this.waitUntilResumed();
      const intelSummary = this.getAiIntelSummary(player.id);
      const resources = this.getAiResourceSnapshot(player.id);
      const llmPlan = this.aiLlmRoundPlans[player.id];
      const llmBidReady = Boolean(
        llmPlan
        && !llmPlan.failed
        && llmPlan.hasBidDecision
        && this.canUseLlmDecisionForPlayer(player.id)
      );

      if (llmBidReady) {
        this.llmEverUsedThisRun = true;
      }

      let plan = null;
      if (llmBidReady) {
        plan = {
          actionType: llmPlan.actionType,
          actionId: llmPlan.actionId,
          expectedReveal: 0,
          score: 1,
          candidates: [],
          decisionSource: "llm",
          lockedByLlm: true
        };
      } else {
        plan = this.aiEngine.planIntelAction({
          playerId: player.id,
          round: this.round,
          maxRounds: GAME_SETTINGS.maxRounds,
          intelSummary,
          resources
        });
      }

      const result = this.executeAiIntelAction(player.id, plan);
      const effectiveActionType = result.ok ? plan.actionType : "none";
      const effectiveActionId = result.ok ? plan.actionId : "none";
      const effect = this.aiEngine.buildToolEffect({
        playerId: player.id,
        actionType: effectiveActionType,
        actionId: effectiveActionId,
        roundProgress,
        intelSummary: this.getAiIntelSummary(player.id),
        signalStats: result.ok ? result.signalStats : null,
        planScore: plan.score || 0
      });

      this.aiRoundEffects[player.id] = effect;

      if (!result.ok && plan.actionType !== "none" && llmBidReady && this.canUseLlmDecisionForPlayer(player.id)) {
        const correctionHistory = this.aiErrorCorrectionHistory[player.id] || [];
        const errorDetail = result.message || "未知错误";

        this.writeLog(`[AI纠错] ${player.name} 工具执行失败: ${errorDetail}`);

        if (!this.currentRunLog) {
          this.currentRunLog = { aiThoughtLogs: [], actionLogs: [] };
        }
        const errorLogEntry = {
          round: this.round,
          playerName: player.name,
          thought: `[工具报错] 错误: ${errorDetail}\n原始决策: skill=${plan.actionType === "skill" ? plan.actionId : "无"}, item=${plan.actionType === "item" ? plan.actionId : "无"}`,
          controlMode: "error-correction",
          error: errorDetail,
          at: Date.now()
        };
        this.currentRunLog.aiThoughtLogs.push(errorLogEntry);

        const correctionPlan = await this.requestAiLlmErrorCorrection(
          player,
          llmPlan,
          errorDetail,
          correctionHistory,
          this.getAiConversationMessages ? this.getAiConversationMessages(player.id) : []
        );

        if (!this.aiErrorCorrectionHistory[player.id]) {
          this.aiErrorCorrectionHistory[player.id] = [];
        }
        this.aiErrorCorrectionHistory[player.id].push({
          error: errorDetail,
          aiResponse: correctionPlan && !correctionPlan.failed ? `出价${correctionPlan.bid}` : correctionPlan.error || "失败",
          at: Date.now()
        });

        if (correctionPlan && !correctionPlan.failed && correctionPlan.hasBidDecision) {
          const correctionResult = this.executeAiIntelAction(player.id, {
            actionType: correctionPlan.actionType,
            actionId: correctionPlan.actionId,
            expectedReveal: 0,
            score: 1,
            candidates: [],
            decisionSource: "llm-correction",
            lockedByLlm: true
          });

          if (correctionResult.ok) {
            llmPlan.bid = correctionPlan.bid;
            llmPlan.hasBidDecision = true;
            llmPlan.actionType = correctionPlan.actionType;
            llmPlan.actionId = correctionPlan.actionId;
            llmPlan.thought = correctionPlan.thought || llmPlan.thought;
            llmPlan.controlMode = "llm-corrected";
            llmPlan.correctionAttempt = correctionPlan.correctionAttempt;
            llmPlan.originalError = errorDetail;
            llmPlan.errorCorrectionPrompt = correctionPlan.userPrompt || "";
            llmPlan.errorCorrectionResponse = correctionPlan.modelResponse || "";

            const correctionLogEntry = {
              round: this.round,
              playerName: player.name,
              thought: `[纠错成功] 纠错次数: ${correctionPlan.correctionAttempt}/2\n新出价: ${correctionPlan.bid}\n思考: ${correctionPlan.thought || "无"}`,
              controlMode: "llm-corrected",
              correctionAttempt: correctionPlan.correctionAttempt,
              at: Date.now()
            };
            this.currentRunLog.aiThoughtLogs.push(correctionLogEntry);

            if (correctionPlan.actionType !== "none" && correctionPlan.actionId !== "none") {
              this.recordPlayerUsage(player.id, correctionPlan.actionId);
              const correctionToolSummary = this.buildAiToolResultSummary(correctionResult, correctionPlan.actionType, correctionPlan.actionId);
              llmPlan.toolResultSummary = correctionToolSummary;
              llmPlan.toolActionType = correctionPlan.actionType;
              llmPlan.toolActionId = correctionPlan.actionId;

              const actionDef = this.getActionDefById(correctionPlan.actionId);
              this.addPublicInfoEntry({
                source: `${player.name}-${actionDef.name}(纠错)`,
                text: actionDef.description
              });

              if (this.isLanMode && this.lanIsHost) {
                this.lanBridge.send({
                  type: "lan:ai-item-use",
                  aiPlayerId: player.lanId || player.id,
                  aiPlayerName: player.name,
                  actionId: correctionPlan.actionId,
                  actionType: correctionPlan.actionType,
                  itemName: actionDef.name,
                  itemDesc: actionDef.description,
                });
              }

              if (this.canUseLlmDecisionForPlayer(player.id)) {
                const followup = await this.requestAiLlmFollowupBid(player, llmPlan, correctionToolSummary);
                if (followup && !followup.failed && followup.hasBidDecision) {
                  llmPlan.bid = followup.bid;
                  llmPlan.hasBidDecision = true;
                  llmPlan.thought = followup.thought || llmPlan.thought;
                  llmPlan.followupPrompt = followup.userPrompt || "";
                  llmPlan.followupResponse = followup.modelResponse || "";
                  llmPlan.followupElapsedMs = followup.elapsedMs || 0;
                  llmPlan.followupActionRejected = followup.followupActionRejected || "";
                } else if (followup && followup.failed) {
                  llmPlan.followupError = followup.error || "二次请求失败";
                  llmPlan.followupPrompt = followup.userPrompt || "";
                  llmPlan.followupResponse = followup.modelResponse || "";
                  llmPlan.controlMode = "rule-fallback-after-llm-tool";
                }
              }
            } else {
              const followup = await this.requestAiLlmFollowupBid(player, llmPlan, "工具执行失败，直接给出价");
              if (followup && !followup.failed && followup.hasBidDecision) {
                llmPlan.bid = followup.bid;
                llmPlan.hasBidDecision = true;
                llmPlan.thought = followup.thought || llmPlan.thought;
                llmPlan.followupPrompt = followup.userPrompt || "";
                llmPlan.followupResponse = followup.modelResponse || "";
                llmPlan.followupElapsedMs = followup.elapsedMs || 0;
                llmPlan.followupActionRejected = followup.followupActionRejected || "";
              } else if (followup && followup.failed) {
                llmPlan.followupError = followup.error || "二次请求失败";
                llmPlan.followupPrompt = followup.userPrompt || "";
                llmPlan.followupResponse = followup.modelResponse || "";
                llmPlan.controlMode = "rule-fallback-after-llm-tool";
              }
            }
          } else {
            const failLogEntry = {
              round: this.round,
              playerName: player.name,
              thought: `[纠错后执行失败] ${correctionResult.message || "未知错误"}`,
              controlMode: "rule-fallback-after-correction",
              error: correctionResult.message,
              at: Date.now()
            };
            this.currentRunLog.aiThoughtLogs.push(failLogEntry);
            llmPlan.controlMode = "rule-fallback-after-correction";
          }
        } else {
          const skipLogEntry = {
            round: this.round,
            playerName: player.name,
            thought: `[纠错跳过] ${correctionPlan ? correctionPlan.error || "已达最大纠错次数" : "纠错请求失败"}`,
            controlMode: "rule-fallback-correction-skipped",
            error: correctionPlan ? correctionPlan.error : "纠错请求失败",
            at: Date.now()
          };
          this.currentRunLog.aiThoughtLogs.push(skipLogEntry);
          llmPlan.controlMode = "rule-fallback-correction-skipped";
        }
        continue;
      }

      if (!result.ok || plan.actionType === "none") {
        continue;
      }

      this.recordPlayerUsage(player.id, plan.actionId);
      const toolSummary = this.buildAiToolResultSummary(result, plan.actionType, plan.actionId);
      this.lastAiIntelActions.push({
        playerId: player.id,
        playerName: player.name,
        actionType: plan.actionType,
        actionId: plan.actionId,
        revealed: result.revealed,
        detail: toolSummary,
        score: plan.score || 0,
        effectTag: effect.tag || "",
        signalStats: result.signalStats ? result.signalStats.aggregate : null
      });

      const actionDef = this.getActionDefById(plan.actionId);
      this.addPublicInfoEntry({
        source: `${player.name}-${actionDef.name}`,
        text: actionDef.description
      });

      if (this.isLanMode && this.lanIsHost) {
        this.lanBridge.send({
          type: "lan:ai-item-use",
          aiPlayerId: player.lanId || player.id,
          aiPlayerName: player.name,
          actionId: plan.actionId,
          actionType: plan.actionType,
          itemName: actionDef.name,
          itemDesc: actionDef.description,
        });
      }

      if (llmBidReady && llmPlan.actionId === plan.actionId) {
        llmPlan.actionExecuted = true;
        llmPlan.toolResultSummary = toolSummary;
        llmPlan.toolActionType = plan.actionType;
        llmPlan.toolActionId = plan.actionId;
        llmPlan.controlMode = "llm";

        if (this.canUseLlmDecisionForPlayer(player.id)) {
          const followup = await this.requestAiLlmFollowupBid(player, llmPlan, toolSummary);
          if (followup && !followup.failed && followup.hasBidDecision) {
            llmPlan.bid = followup.bid;
            llmPlan.hasBidDecision = true;
            llmPlan.thought = followup.thought || llmPlan.thought;
            llmPlan.followupPrompt = followup.userPrompt || "";
            llmPlan.followupResponse = followup.modelResponse || "";
            llmPlan.followupElapsedMs = followup.elapsedMs || 0;
            llmPlan.followupActionRejected = followup.followupActionRejected || "";
          } else if (followup && followup.failed) {
            llmPlan.followupError = followup.error || "二次请求失败";
            llmPlan.followupPrompt = followup.userPrompt || "";
            llmPlan.followupResponse = followup.modelResponse || "";
            llmPlan.controlMode = "rule-fallback-after-llm-tool";
          }
        }
      } else if (!llmBidReady) {
        if (llmPlan && llmPlan.failed) {
          llmPlan.controlMode = "rule-fallback-llm-failed";
        } else if (llmPlan && !llmPlan.hasBidDecision) {
          llmPlan.controlMode = "rule-fallback-llm-invalid";
        }
      }
    }

    if (this.lastAiIntelActions.length > 0) {
      const text = this.lastAiIntelActions
        .map((entry) => this.formatAiIntelActionPublicLine(entry))
        .join("；");
      this.writeLog(`他人情报行动：${text}`);
    }
  }

  formatAiIntelActionPublicLine(entry) {
    const info = this.getItemInfo(entry.actionId);
    const revealText = entry.revealed > 0 ? `私有线索+${entry.revealed}` : "未命中";
    const stats = entry.signalStats;
    const statsText = stats && stats.count > 0
      ? `，候选均值${formatCompactNumber(stats.mean)}，波动${(stats.spreadRatio * 100).toFixed(0)}%`
      : "";
    const tag = entry.effectTag ? `，${entry.effectTag}` : "";
    const detail = entry.detail ? `，结果:${compactOneLine(entry.detail, 100)}` : "";
    return `${entry.playerName} 使用${info.label}（${revealText}${statsText}${tag}${detail}）`;
  }

  canUseIntelActions() {
    if (this.settled || this.roundResolving) {
      return false;
    }

    if (this.roundPaused) {
      this.writeLog("当前处于暂停状态，请先继续回合后再操作。");
      return false;
    }

    if (this.roundTimeLeft <= 0) {
      this.writeLog("本回合已超时，无法再使用技能或道具。");
      return false;
    }

    if (this.playerBidSubmitted) {
      this.writeLog("你已提交本轮出价，无法继续使用技能或道具。");
      return false;
    }

    return true;
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

  async resolveRoundBids(reason = "manual", forceSettle = false) {
    if (this.settled || this.roundResolving) {
      return;
    }

    if (this.isLanMode && this.lanBridge) {
      return;
    }

    this.roundResolving = true;
    this.stopRoundTimer();

    try {
      if (!this.playerBidSubmitted) {
        this.playerRoundBid = 0;
        this.writeLog(reason === "timeout" ? "回合超时：玩家本轮出价记为 0。" : "玩家未提交出价，本轮按 0 处理。");
        const myId = this.isLanMode ? this.lanMySlotId : "p2";
        this.setPlayerBidReady(myId, true);
      }

      if (this.aiRoundDecisionPromise) {
        await this.aiRoundDecisionPromise;
      }
      this.updateHud();

      const roundBids = this.buildRoundBids();
      this.captureAiDecisionTelemetry(roundBids);
      this.recordAiThoughtLogs(this.lastAiDecisionTelemetry);
      this.renderAiLogicPanel();
      await this.revealRoundBidsSequential(roundBids);
      this.recordRoundHistory(roundBids);

      const sorted = [...roundBids].sort((a, b) => b.bid - a.bid);
      const first = sorted[0];
      const second = sorted[1] || { bid: 0 };
      this.markRoundRanking(sorted);

      this.currentBid = first.bid;
      this.bidLeader = first.playerId;
      this.secondHighestBid = second.bid;

      const shouldDirectTake =
        this.round < GAME_SETTINGS.maxRounds &&
        first.bid > 0 &&
        first.bid >= Math.ceil(second.bid * (1 + GAME_SETTINGS.directTakeRatio));

      if (this.round === GAME_SETTINGS.maxRounds || shouldDirectTake || forceSettle) {
        const mode = forceSettle ? "manual" : (this.round === GAME_SETTINGS.maxRounds ? "final" : "direct");
        await this.finishAuction(first, mode);
        return;
      }

      await delay(GAME_SETTINGS.postRevealWaitMs);
      this.round += 1;
      this.skillManager.onNewRound();
      this.startRound();
      this.updateHud();
      this.writeLog(`进入第 ${this.round} 回合。`);
    } catch (error) {
      const message = error && error.message ? error.message : "未知异常";
      this.roundResolving = false;
      this.writeLog(`回合结算异常：${message}`);
      this.updateHud();
      if (typeof console !== "undefined" && console.error) {
        console.error("resolveRoundBids failed", error);
      }
    }
  }

  buildRoundBids() {
    const clueRate = this.items.length === 0
      ? 0
      : this.items.filter((item) => this.hasAnyInfo(item)).length / this.items.length;
    const lastRoundBids = this.getLastRoundBidMap();
    const aiIntelMap = this.buildAiIntelSnapshot();

    const aiPlayers = this.players.filter((player) => !player.isHuman);
    const aiBidMap = this.aiEngine.buildAIBids({
      aiPlayers,
      clueRate,
      round: this.round,
      maxRounds: GAME_SETTINGS.maxRounds,
      currentBid: this.currentBid,
      lastRoundBids,
      bidStep: GAME_SETTINGS.bidStep,
      aiIntelMap,
      aiToolEffectMap: this.aiRoundEffects,
      itemCount: this.items.length
    });

    aiPlayers.forEach((player) => {
      const plan = this.aiLlmRoundPlans[player.id];
      if (!plan || plan.failed || !plan.hasBidDecision || !this.canUseLlmDecisionForPlayer(player.id)) {
        return;
      }

      const wallet = this.getAiWallet(player.id);
      aiBidMap[player.id] = this.normalizeAiBidValue(player.id, plan.bid, wallet);
    });

    return this.players.map((player) => {
      if (player.isSelf) {
        return { playerId: player.id, bid: this.playerRoundBid };
      }

      if (player.isHuman) {
        const existingBid = this.lanHostBids[player.lanId];
        return { playerId: player.id, bid: existingBid !== undefined ? existingBid : 0 };
      }

      const wallet = this.getAiWallet(player.id);
      const aiBid = this.normalizeAiBidValue(player.id, aiBidMap[player.id] ?? 0, wallet);
      return { playerId: player.id, bid: aiBid };
    });
  }

  getLastRoundBidMap() {
    const map = {};
    this.players.forEach((player) => {
      const history = this.playerRoundHistory[player.id] || [];
      const last = history.length > 0 ? history[history.length - 1] : null;
      if (last) {
        map[player.id] = last.bid;
      }
    });
    return map;
  }

  async revealRoundBidsSequential(roundBids) {
    for (let i = 0; i < this.players.length; i += 1) {
      const player = this.players[i];
      const bidInfo = roundBids.find((entry) => entry.playerId === player.id);
      this.setPlayerBidDisplay(player.id, bidInfo.bid, i + 1);
      this.writeLog(`${player.name} 本轮出价：${bidInfo.bid}`);
      await delay(GAME_SETTINGS.bidRevealIntervalMs);
    }
  }

  setPlayerBidDisplay(playerId, bid, order) {
    const bidEl = document.getElementById(`bid-${playerId}`);
    const cardEl = document.getElementById(`playerCard-${playerId}`);
    if (bidEl) {
      bidEl.textContent = `${formatBidRevealNumber(bid)} #${order}`;
      bidEl.classList.remove("bid-reveal");
      void bidEl.offsetWidth;
      bidEl.classList.add("bid-reveal");
      window.setTimeout(() => bidEl.classList.remove("bid-reveal"), 480);
    }
    if (cardEl) {
      cardEl.classList.add("revealed");
      cardEl.classList.remove("bid-pop");
      void cardEl.offsetWidth;
      cardEl.classList.add("bid-pop");
      window.setTimeout(() => cardEl.classList.remove("bid-pop"), 520);
    }
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

  resetPlayerHistoryState() {
    this.players.forEach((player) => {
      this.playerRoundHistory[player.id] = [];
      this.playerUsageHistory[player.id] = [];
      this.currentRoundUsage[player.id] = [];
    });
    this.refreshPlayerHistoryUI();
  }

  clearCurrentRoundUsage() {
    this.players.forEach((player) => {
      this.currentRoundUsage[player.id] = [];
    });
  }

  recordPlayerUsage(playerId, itemId) {
    if (!this.currentRoundUsage[playerId]) {
      this.currentRoundUsage[playerId] = [];
    }
    this.currentRoundUsage[playerId].push(itemId);
    this.refreshPlayerHistoryUI();
  }

  recordRoundHistory(roundBids) {
    const roundNumber = this.round;
    this.players.forEach((player) => {
      const bid = roundBids.find((entry) => entry.playerId === player.id)?.bid ?? 0;
      this.playerRoundHistory[player.id].push({ round: roundNumber, bid });
      if (this.playerRoundHistory[player.id].length > GAME_SETTINGS.maxRounds) {
        this.playerRoundHistory[player.id].shift();
      }

      const actions = [...(this.currentRoundUsage[player.id] || [])];
      this.playerUsageHistory[player.id].push({ round: roundNumber, actions });
      if (this.playerUsageHistory[player.id].length > GAME_SETTINGS.maxRounds) {
        this.playerUsageHistory[player.id].shift();
      }
    });

    this.refreshPlayerHistoryUI();
  }

  refreshPlayerHistoryUI() {
    this.players.forEach((player) => {
      const panel = this.playerHistoryPanels[player.id];
      if (!panel) {
        return;
      }

      const rounds = Array.from({ length: GAME_SETTINGS.maxRounds }, (_v, idx) => idx + 1);
      const bidByRound = new Map((this.playerRoundHistory[player.id] || []).map((entry) => [entry.round, entry.bid]));
      const usageByRound = new Map((this.playerUsageHistory[player.id] || []).map((entry) => [entry.round, entry.actions]));

      const roundHeaders = rounds.map((value) => `<td>${value}</td>`).join("");
      const itemCells = rounds
        .map((round) => `<td>${this.renderItemUsageCell(usageByRound.get(round) || [])}</td>`)
        .join("");
      const bidCells = rounds
        .map((round) => `<td>${bidByRound.has(round) ? formatCompactNumber(bidByRound.get(round)) : "-"}</td>`)
        .join("");

      panel.innerHTML = [
        '<table class="player-history-table">',
        "<tbody>",
        `<tr><th>轮次</th>${roundHeaders}</tr>`,
        `<tr><th>行动</th>${itemCells}</tr>`,
        `<tr><th>报价</th>${bidCells}</tr>`,
        "</tbody>",
        "</table>"
      ].join("");
    });
  }

  renderItemUsageCell(actions) {
    if (!actions || actions.length === 0) {
      return '<span class="history-empty">-</span>';
    }

    return actions
      .map((itemId) => {
        const info = this.getItemInfo(itemId);
        return `<span class="history-chip" data-tip="${escapeHtml(info.tip)}">${escapeHtml(info.label)}</span>`;
      })
      .join(" ");
  }

  toggleItemDrawer() {
    if (!this.dom.itemDrawer) {
      return;
    }

    if (this.dom.itemDrawer.classList.contains("hidden")) {
      this.openItemDrawer();
    } else {
      this.closeItemDrawer();
    }
  }

  openItemDrawer() {
    if (!this.dom.itemDrawer) {
      return;
    }

    const lockedIntel = this.settled || this.roundResolving || this.playerBidSubmitted || this.roundTimeLeft <= 0;
    if (lockedIntel || this.isSettingsOverlayOpen() || this.isSettlementPageActive()) {
      return;
    }

    this.closeBidKeypad();
    this.renderItemDrawer();
    this.dom.itemDrawer.classList.remove("hidden");
    if (this.dom.itemDrawerToggleBtn) {
      this.dom.itemDrawerToggleBtn.classList.add("active");
    }
  }

  closeItemDrawer() {
    if (!this.dom.itemDrawer) {
      return;
    }

    this.dom.itemDrawer.classList.add("hidden");
    if (this.dom.itemDrawerToggleBtn) {
      this.dom.itemDrawerToggleBtn.classList.remove("active");
    }
  }

  renderItemDrawer() {
    if (!this.dom.itemDrawerList) {
      return;
    }

    const canUse = !(this.settled || this.roundResolving || this.playerBidSubmitted || this.roundTimeLeft <= 0);
    const itemState = this.itemManager.getItemState().filter((item) => item.count > 0);

    if (!itemState.length) {
      this.dom.itemDrawerList.innerHTML = '<div class="item-drawer-empty">暂无可用道具</div>';
      return;
    }

    this.dom.itemDrawerList.innerHTML = itemState
      .map((item) => {
        const info = this.getItemInfo(item.id);
        const disabled = !canUse || item.count <= 0;
        return [
          `<button type="button" class="item-drawer-btn${disabled ? " is-empty" : ""}" data-item-id="${item.id}" ${disabled ? "disabled" : ""} title="${escapeHtml(info.tip)}">`,
          `<span class="item-drawer-name">${escapeHtml(info.label)}</span>`,
          `<span class="item-drawer-count">x${item.count}</span>`,
          "</button>"
        ].join("");
      })
      .join("");
  }

  addPrivateIntelEntry(entry) {
    this.privateIntelEntries.push({
      source: entry.source || "未知",
      text: entry.text || "",
      round: this.round
    });
  }

  addPublicInfoEntry(entry) {
    this.publicInfoEntries.push({
      source: entry.source || "未知",
      text: entry.text || "",
      round: this.round
    });
    if (this.isLanMode && this.lanIsHost && this.lanBridge) {
      this.lanBridge.send({
        type: "lan:public-info",
        source: entry.source || "未知",
        text: entry.text || "",
        round: this.round,
      });
    }
  }

  renderPrivateIntelPanel() {
    const container = this.dom.personalPanelScroll;
    if (!container) {
      return;
    }
    if (this.privateIntelEntries.length === 0) {
      container.innerHTML = '<div class="side-line intel-empty">暂无私有情报</div>';
      return;
    }
    container.innerHTML = this.privateIntelEntries
      .map((entry) => `<div class="side-line intel-entry"><span class="intel-source">${escapeHtml(entry.source)}：</span>${escapeHtml(entry.text)}</div>`)
      .join("");
    container.scrollTop = container.scrollHeight;
  }

  renderPublicInfoPanel() {
    const container = this.dom.publicInfoScroll;
    if (!container) {
      return;
    }

    if (this.publicInfoEntries.length === 0) {
      container.innerHTML = '<div class="public-line intel-empty">暂无公共信息</div>';
      return;
    }

    container.innerHTML = this.publicInfoEntries
      .map((entry) => `<div class="public-line public-event"><span class="intel-source">[${escapeHtml(entry.source)}]</span> ${escapeHtml(entry.text)}</div>`)
      .join("");
    container.scrollTop = container.scrollHeight;
  }

  updateSidePanels(skillState, itemState, clueCount, occupiedCells, capacity, bidState) {
    this.renderPrivateIntelPanel();
    this.renderPublicInfoPanel();
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
    await this.revealAllArtifactsForSettlement();

    const totalValue = this.warehouseTrueValue;
    const winnerProfit = totalValue - winnerBid;

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

  playerBid() {
    this.closeItemDrawer();

    if (this.settled) {
      this.writeLog("本局已结算，请重新开局。");
      return;
    }

    if (this.roundResolving) {
      this.writeLog("本轮正在结算中，请等待出价揭示。");
      return;
    }

    if (this.roundPaused) {
      this.writeLog("当前回合已暂停，请先继续回合再提交出价。");
      return;
    }

    if (this.playerBidSubmitted) {
      this.writeLog("你已提交本轮出价，不可再次提交。");
      return;
    }

    const inputValue = Number(this.dom.bidInput.value);
    if (!Number.isFinite(inputValue) || inputValue < 0) {
      this.writeLog("请输入有效出价金额（允许 0）。");
      return;
    }

    if (inputValue > this.playerMoney) {
      this.writeLog("资金不足，无法按该金额出价。");
      return;
    }

    this.playerRoundBid = Math.round(inputValue);
    this.playerBidSubmitted = true;
    const myId = this.isLanMode ? this.lanMySlotId : "p2";
    this.setPlayerBidReady(myId, true);
    this.closeBidKeypad();
    this.writeLog(`玩家已提交本轮密封出价：${this.playerRoundBid}。提交后不可再用道具/技能。`);
    this.updateHud();

    if (this.isLanMode && this.lanBridge) {
      this.lanBridge.submitBid(this.playerRoundBid);
      return;
    }

    if (!this.roundResolving && this.areAllPlayersBidReady()) {
      this.resolveRoundBids("all-ready");
    }
  }

  settleCurrentRun() {
    if (this.isLanMode && !this.lanIsHost) return;
    if (this.settled) {
      this.writeLog("本局已结算，请重新开局。");
      return;
    }

    this.resolveRoundBids("manual", true);
  }

  showSettleOverlay(html) {
    this.dom.settleCard.innerHTML = html;
    this.dom.settleOverlay.classList.remove("hidden");

    this.tweens.add({
      targets: this.dom.settleCard,
      scaleX: { from: 0.94, to: 1 },
      scaleY: { from: 0.94, to: 1 },
      alpha: { from: 0.5, to: 1 },
      duration: 260,
      ease: "Back.Out"
    });

  }

  hideSettleOverlay() {
    this.dom.settleOverlay.classList.add("hidden");
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
      : (this.roundTimeLeft <= 6 ? "round-timer-hot is-danger" : "round-timer-hot");
    const timerText = this.roundPaused ? `已暂停 ${this.roundTimeLeft}s` : `倒计时 ${this.roundTimeLeft}s`;
    this.dom.hudRound.textContent = `第 ${this.round}/${GAME_SETTINGS.maxRounds} 回合`;
    this.dom.hudTimer.innerHTML = `<span class="${timerClass}">${timerText}</span>`;
    this.dom.hudMoney.textContent = `资金 ${this.playerMoney.toLocaleString()}`;
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

  isAiMultiGameMemoryEnabled() {
    return Boolean(LLM_SETTINGS && LLM_SETTINGS.multiGameMemoryEnabled);
  }

  isAiReflectionEnabled() {
    return Boolean(LLM_SETTINGS && LLM_SETTINGS.reflectionEnabled);
  }

  loadAiMemoryFromStorage() {
    try {
      const raw = window.localStorage.getItem(AI_MEMORY_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      return parsed;
    } catch (_error) {
      return null;
    }
  }

  saveAiMemoryToStorage() {
    try {
      const data = {
        conversations: this.aiConversationByPlayer,
        crossGameMemory: this.aiCrossGameMemory,
        pendingSummary: this.pendingNextRunAiSummary || "",
        runSerial: this.runSerial || 0,
        savedAt: Date.now()
      };
      window.localStorage.setItem(AI_MEMORY_STORAGE_KEY, JSON.stringify(data));
    } catch (_error) {
    }
  }

  restoreAiMemoryFromStorage() {
    const stored = this.loadAiMemoryFromStorage();
    if (!stored) return;
    if (stored.conversations && typeof stored.conversations === "object") {
      this.aiConversationByPlayer = {};
      Object.keys(stored.conversations).forEach((playerId) => {
        const arr = stored.conversations[playerId];
        if (Array.isArray(arr)) {
          const filtered = arr.filter((entry) => entry && typeof entry.round === "number");
          this.aiConversationByPlayer[playerId] = filtered.slice(-30);
        }
      });
    }
    if (stored.crossGameMemory && typeof stored.crossGameMemory === "object") {
      this.aiCrossGameMemory = {};
      Object.keys(stored.crossGameMemory).forEach((playerId) => {
        const arr = stored.crossGameMemory[playerId];
        if (Array.isArray(arr)) {
          this.aiCrossGameMemory[playerId] = arr.slice(-20);
        }
      });
    }
    if (typeof stored.pendingSummary === "string") {
      this.pendingNextRunAiSummary = stored.pendingSummary;
    }
    if (typeof stored.runSerial === "number" && stored.runSerial > 0) {
      this.runSerial = stored.runSerial;
    }
  }

  ensureAiConversationBucket(playerId) {
    if (!this.aiConversationByPlayer[playerId]) {
      this.aiConversationByPlayer[playerId] = [];
    }
    return this.aiConversationByPlayer[playerId];
  }

  ensureAiCrossGameMemory(playerId) {
    if (!this.aiCrossGameMemory[playerId]) {
      this.aiCrossGameMemory[playerId] = [];
    }
    return this.aiCrossGameMemory[playerId];
  }

  getAiCrossGameMemoryCount(playerId) {
    return this.ensureAiCrossGameMemory(playerId).length;
  }

  getAiInGameHistoryCount(playerId) {
    const bucket = this.aiConversationByPlayer[playerId];
    return Array.isArray(bucket) ? bucket.length : 0;
  }

  getQualityCounts() {
    const counts = { poor: 0, normal: 0, fine: 0, rare: 0, legendary: 0 };
    this.items.forEach((item) => {
      const qk = item.qualityKey;
      if (typeof counts[qk] === "number") {
        counts[qk] += 1;
      }
    });
    return counts;
  }

  getTotalOccupiedCells() {
    return this.items.reduce((sum, item) => sum + item.w * item.h, 0);
  }

  getAiConversationMessages(playerId) {
    const messages = [];
    const crossMemory = this.ensureAiCrossGameMemory(playerId);
    if (crossMemory.length > 0) {
      const total = crossMemory.length;
      const lines = [`【跨局记忆：最近${total}局结果与反思】`];
      crossMemory.forEach((entry, i) => {
        const parts = [`最近第${total - i}局(局号${entry.run || "?"})`];
        if (entry.result) parts.push(entry.result);
        if (entry.dividendTicket) {
          const dt = entry.dividendTicket;
          if (dt.mechanism === "dividend") {
            parts.push(`分红+${dt.dividendPerPlayer || 0}`);
          } else if (dt.mechanism === "ticket") {
            parts.push(`门票-${dt.ticketPerPlayer || 0}`);
          }
        }
        if (entry.qualityCounts) {
          const qc = entry.qualityCounts;
          parts.push(`品质分布:粗${qc.poor || 0}良${qc.normal || 0}精${qc.fine || 0}珍${qc.rare || 0}绝${qc.legendary || 0}`);
        }
        if (entry.totalItems) parts.push(`总藏品${entry.totalItems}`);
        if (entry.totalCells) parts.push(`仓库占格${entry.totalCells}`);
        if (entry.reflection) {
          parts.push(`反思:${entry.reflection}`);
        } else if (entry.reflectionEnabled === false) {
          parts.push("反思:该局未开启局后反思");
        } else {
          parts.push("反思:(待生成)");
        }
        lines.push(parts.join(" | "));
      });
      messages.push({ role: "user", content: lines.join("\n") });
    }
    const inGameBucket = this.aiConversationByPlayer[playerId];
    if (Array.isArray(inGameBucket) && inGameBucket.length > 0) {
      const inGameLines = ["【本局内历史决策记录】"];
      inGameBucket.forEach((entry) => {
        const parts = [`轮${entry.round || "?"}`];
        if (entry.bid != null) parts.push(`出价${entry.bid}`);
        if (entry.skill && entry.skill !== "无") parts.push(`技能:${entry.skill}`);
        if (entry.item && entry.item !== "无") parts.push(`道具:${entry.item}`);
        if (entry.thought) parts.push(`想法:${entry.thought}`);
        if (entry.result) parts.push(`结果:${entry.result}`);
        inGameLines.push(parts.join(" | "));
      });
      messages.push({ role: "user", content: inGameLines.join("\n") });
    }
    return messages;
  }

  pushAiRoundSummary(playerId, plan) {
    if (!this.isAiMultiGameMemoryEnabled()) {
      return;
    }
    const bucket = this.ensureAiConversationBucket(playerId);
    const entry = {
      run: this.runSerial || 0,
      round: this.round || 0,
      bid: plan && plan.bid != null ? plan.bid : null,
      skill: plan && plan.actionType === "skill" && plan.actionId ? plan.actionId : "无",
      item: plan && plan.actionType === "item" && plan.actionId ? plan.actionId : "无",
      thought: plan && plan.thought ? String(plan.thought).slice(0, 120) : "",
      result: ""
    };
    bucket.push(entry);
    if (bucket.length > 30) {
      this.aiConversationByPlayer[playerId] = bucket.slice(-30);
    }
    this.saveAiMemoryToStorage();
  }

  updateLastAiRoundResult(playerId, resultText) {
    if (!this.isAiMultiGameMemoryEnabled()) {
      return;
    }
    const bucket = this.ensureAiConversationBucket(playerId);
    if (bucket.length > 0) {
      bucket[bucket.length - 1].result = String(resultText || "").slice(0, 60);
      this.saveAiMemoryToStorage();
    }
  }

  resetAiConversations() {
    this.aiConversationByPlayer = {};
    this.aiCrossGameMemory = {};
    this.aiReflectionPending = {};
    this.pendingNextRunAiSummary = "";
  }

  clearAiMemoryStorage() {
    this.aiConversationByPlayer = {};
    this.aiCrossGameMemory = {};
    this.aiReflectionPending = {};
    this.pendingNextRunAiSummary = "";
    this.runSerial = 0;
    try {
      window.localStorage.removeItem(AI_MEMORY_STORAGE_KEY);
    } catch (_error) {
    }
  }

  pushRunStartContextToAi() {
  }

  pushRunSettlementContextToAi(result) {
    const winnerName = result && result.winnerName ? result.winnerName : "未知";
    const winnerBid = Math.round(Number(result && result.winnerBid) || 0);
    const totalValue = Math.round(Number(result && result.totalValue) || 0);
    const winnerProfit = Math.round(Number(result && result.winnerProfit) || 0);
    const reasonText = result && result.reasonText ? result.reasonText : "结算";
    const dtInfo = result && result.dividendTicketInfo ? result.dividendTicketInfo : null;
    const mechanism = dtInfo ? dtInfo.mechanism : "none";
    const dividendAmt = dtInfo ? Math.round(Number(dtInfo.dividendPerPlayer) || 0) : 0;
    const ticketAmt = dtInfo ? Math.round(Number(dtInfo.ticketPerPlayer) || 0) : 0;

    let mechanismText = "";
    if (mechanism === "dividend") {
      mechanismText = `分红触发：拍下者亏损，非拍下者各获得亏损额的15%（+${dividendAmt}）。`;
    } else if (mechanism === "ticket") {
      mechanismText = `门票触发：拍下者盈利，非拍下者各被扣除盈利额的5%（-${ticketAmt}）。`;
    }

    this.pendingNextRunAiSummary = [
      `【系统事件】第 ${this.runSerial} 局已结算：${winnerName} 以 ${winnerBid} 拿下整仓（${reasonText}）。`,
      `本局揭示总值 ${totalValue}，拍下者利润 ${winnerProfit >= 0 ? "+" : ""}${winnerProfit}。`,
      mechanismText,
      "请记录本局经验并等待下一局开始。"
    ].filter(Boolean).join(" ");
    const resultText = `${winnerName}以${winnerBid}中标,总值${totalValue},利润${winnerProfit >= 0 ? "+" : ""}${winnerProfit}${mechanism === "dividend" ? `,分红+${dividendAmt}` : ""}${mechanism === "ticket" ? `,门票-${ticketAmt}` : ""}`;
    this.players.filter((p) => !p.isHuman).forEach((p) => {
      this.updateLastAiRoundResult(p.id, resultText);
    });
    this.saveAiMemoryToStorage();
  }

  createCrossGameRecord(result) {
    const winnerName = result && result.winnerName ? result.winnerName : "未知";
    const winnerBid = Math.round(Number(result && result.winnerBid) || 0);
    const totalValue = Math.round(Number(result && result.totalValue) || 0);
    const winnerProfit = Math.round(Number(result && result.winnerProfit) || 0);
    const reasonText = result && result.reasonText ? result.reasonText : "结算";
    const dtInfo = result && result.dividendTicketInfo ? result.dividendTicketInfo : null;
    const mechanism = dtInfo ? dtInfo.mechanism : "none";
    const dividendAmt = dtInfo ? Math.round(Number(dtInfo.dividendPerPlayer) || 0) : 0;
    const ticketAmt = dtInfo ? Math.round(Number(dtInfo.ticketPerPlayer) || 0) : 0;
    const qualityCounts = this.getQualityCounts();
    const totalItems = this.items.length;
    const totalCells = this.getTotalOccupiedCells();
    const roundBids = [];
    this.players.forEach((player) => {
      const history = this.playerRoundHistory[player.id] || [];
      history.forEach((entry) => {
        roundBids.push({
          round: entry.round,
          playerId: player.id,
          playerName: player.name,
          bid: entry.bid
        });
      });
    });
    let resultStr = `${winnerName}以${winnerBid}中标(${reasonText}),总值${totalValue},利润${winnerProfit >= 0 ? "+" : ""}${winnerProfit}`;
    if (mechanism === "dividend") {
      resultStr += `,分红+${dividendAmt}`;
    } else if (mechanism === "ticket") {
      resultStr += `,门票-${ticketAmt}`;
    }
    const record = {
      run: this.runSerial || 0,
      result: resultStr,
      dividendTicket: mechanism !== "none" ? { mechanism, dividendPerPlayer: dividendAmt, ticketPerPlayer: ticketAmt } : null,
      qualityCounts,
      totalItems,
      totalCells,
      roundBids,
      reflection: null,
      reflectionEnabled: this.isAiReflectionEnabled()
    };
    return record;
  }

  saveCrossGameRecord(record) {
    if (!this.isAiMultiGameMemoryEnabled()) return;
    this.players.filter((p) => !p.isHuman).forEach((p) => {
      const memory = this.ensureAiCrossGameMemory(p.id);
      const playerRecord = { ...record };
      const bucket = this.ensureAiConversationBucket(p.id);
      playerRecord.decisionSummary = bucket
        .filter((e) => e.run === record.run)
        .map((e) => {
          const parts = [`轮${e.round || "?"}`];
          if (e.bid != null) parts.push(`出价${e.bid}`);
          if (e.skill && e.skill !== "无") parts.push(`技能:${e.skill}`);
          if (e.item && e.item !== "无") parts.push(`道具:${e.item}`);
          if (e.thought) parts.push(`想法:${e.thought.slice(0, 60)}`);
          return parts.join(" ");
        });
      memory.push(playerRecord);
      if (memory.length > 20) {
        this.aiCrossGameMemory[p.id] = memory.slice(-20);
      }
    });
    this.saveAiMemoryToStorage();
  }

  async triggerAiReflection(record) {
    if (!this.isAiReflectionEnabled() || !this.canUseLlmDecision() || !this.llmEverUsedThisRun) return;
    this.aiReflectionState = "pending";
    this.updateReflectionStatusUI();
    const AI_REFLECTION_RULES = [
      "仓库摸宝游戏·规则摘要",
      "一、四位玩家通过多轮竞价争夺封闭仓库所有权。仓库内藏有若干件未知藏品，真实总价值仅在成交后揭晓。玩家利用技能、道具及心理博弈，在有限轮次内以合理价格拍下仓库，目标是盈利。",
      "二、藏品库大小随机（总格数随机），越大的仓库意味着更多藏品和机会。每个藏品有品质、占格数、价格。每局开始时从全部可能藏品中随机抽取若干件放入仓库，玩家初始对仓库内具体藏品、价值与品质一无所知。",
      "三、玩家由角色（附带固定技能含主动技被动技）和道具（从个人收藏中搭配携带）两部分构成。",
      "四、出价流程：每轮所有玩家同时提交出价，结束后公开所有出价。系统判断是否提前结束。若未结束进入轮间阶段：玩家可使用技能或道具，查看公开信息，调整策略。",
      "提前结束条件（非最后一轮）：第一名出价 > 第二名出价 × 溢价系数，则第一名直接赢得仓库。",
      "正常结束：最终轮出价最高者赢得仓库。",
      "五、结算：赢家诞生后揭示仓库所有藏品真实清单与总价值。总价值>成交价→赢家盈利；总价值<成交价→赢家亏损。",
      "分红机制：非拍下者可获得拍下者亏损的15%资金（鼓励欺诈对手高价拍下）。",
      "门票机制：非拍下者会被扣除拍下者盈利的5%资金（鼓励积极拍下）。"
    ].join("\n");
    const aiPlayers = this.players.filter((p) => !p.isHuman && this.canUseLlmDecisionForPlayer(p.id));
    if (aiPlayers.length === 0) {
      this.aiReflectionState = "done";
      this.updateReflectionStatusUI();
      return;
    }
    let anyFailed = false;
    let anyTimeout = false;
    const reflectionPromises = aiPlayers.map(async (player) => {
      const memory = this.aiCrossGameMemory[player.id];
      const memoryEntry = memory ? memory.find((e) => e.run === record.run) : null;
      const decisionLines = (memoryEntry && memoryEntry.decisionSummary) || [];
      const bidLines = (record.roundBids || []).map((b) => {
        const isYou = b.playerId === player.id;
        return `轮${b.round} ${b.playerName}(${b.playerId}): ${b.bid}${isYou ? " ←你" : ""}`;
      });
      const myBids = (record.roundBids || []).filter((b) => b.playerId === player.id);
      const myBidSummary = myBids.length > 0
        ? myBids.map((b) => `轮${b.round}: ${b.bid}`).join("、")
        : "未出价";
      const userContent = [
        `你是${player.name}(${player.id})，请对本局自己的表现写反思总结（200字内），分析你的决策优劣和可改进之处。注意：只反思你自己的出价和行为，不要把其他玩家的出价当作自己的。`,
        "",
        `【本局结果】${record.result}`,
        record.dividendTicket
          ? (record.dividendTicket.mechanism === "dividend"
            ? `【分红/门票】分红触发：拍下者亏损，你获得+${record.dividendTicket.dividendPerPlayer || 0}分红。`
            : `【分红/门票】门票触发：拍下者盈利，你被扣除${record.dividendTicket.ticketPerPlayer || 0}门票。`)
          : "【分红/门票】本局无分红/门票。",
        `【品质分布】粗${record.qualityCounts.poor || 0} 良${record.qualityCounts.normal || 0} 精${record.qualityCounts.fine || 0} 珍${record.qualityCounts.rare || 0} 绝${record.qualityCounts.legendary || 0} | 总藏品${record.totalItems || 0} | 仓库占格${record.totalCells || 0}`,
        "",
        `【你的出价记录】${myBidSummary}`,
        "",
        "【你的决策摘要】",
        ...(decisionLines.length > 0 ? decisionLines : ["（无LLM决策记录，请根据出价记录反思）"]),
        "",
        "【各轮各玩家出价】（←你 标记的是你的出价）",
        ...bidLines,
        "",
        AI_REFLECTION_RULES ? `【游戏规则】\n${AI_REFLECTION_RULES}` : "",
        "",
        "只输出反思文本，不要输出JSON或其他格式。"
      ].filter(Boolean).join("\n");

      try {
        const result = await this.deepSeekClient.requestChat({
          temperature: 0.3,
          maxTokens: 600,
          timeoutMs: 30000,
          messages: [
            { role: "system", content: `你是仓库摸宝竞拍AI玩家${player.name}(${player.id})，正在对本局自己的表现进行反思总结。只反思你自己的出价和决策，不要混淆其他玩家的行为。` },
            { role: "user", content: userContent }
          ]
        });
        if (result.ok && result.content) {
          const reflection = String(result.content).trim().slice(0, 600);
          if (this.isAiMultiGameMemoryEnabled()) {
            this.updateCrossGameReflection(player.id, record.run, reflection);
          } else {
            this.pendingNextRunAiSummary += ` 【${player.name}反思】${reflection}`;
            this.saveAiMemoryToStorage();
          }
          return { playerId: player.id, reflection };
        }
        if (result.code === "TIMEOUT") {
          anyTimeout = true;
        } else {
          anyFailed = true;
        }
        return { playerId: player.id, reflection: null };
      } catch (_error) {
        anyFailed = true;
        return { playerId: player.id, reflection: null };
      }
    });
    await Promise.all(reflectionPromises);
    if (anyTimeout) {
      this.aiReflectionState = "timeout";
    } else if (anyFailed) {
      this.aiReflectionState = "error";
    } else {
      this.aiReflectionState = "done";
    }
    this.updateReflectionStatusUI();
  }

  shouldShowReflectionUI() {
    return this.isAiReflectionEnabled() && this.canUseLlmDecision() && this.llmEverUsedThisRun;
  }

  updateReflectionStatusUI() {
    const el = this.dom.settleReflectionStatus;
    if (!el) return;
    if (!this.shouldShowReflectionUI()) {
      el.classList.add("hidden");
      el.textContent = "";
      el.className = "settle-reflection-status hidden";
      return;
    }
    el.classList.remove("hidden", "is-pending", "is-done", "is-timeout", "is-error");
    switch (this.aiReflectionState) {
      case "pending":
        el.classList.add("is-pending");
        el.textContent = "反思生成中...";
        break;
      case "done":
        el.classList.add("is-done");
        el.textContent = "反思生成完成";
        break;
      case "timeout":
        el.classList.add("is-timeout");
        el.textContent = "反思生成超时";
        break;
      case "error":
        el.classList.add("is-error");
        el.textContent = "反思生成失败";
        break;
      default:
        el.classList.add("hidden");
        break;
    }
  }

  showReflectionPendingDialog() {
    this.removeReflectionPendingDialog();
    const overlay = document.createElement("div");
    overlay.id = "reflectionPendingDialog";
    overlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:99999;";
    const box = document.createElement("div");
    box.style.cssText = "background:#2a2218;border:2px solid #d4a843;border-radius:12px;padding:24px 32px;text-align:center;color:#e0d0b0;font-size:16px;max-width:380px;";
    box.innerHTML =
      '<div style="margin-bottom:12px;font-size:18px;font-weight:bold;">AI反思尚未完成</div>' +
      '<div style="color:#a09070;margin-bottom:16px;">AI正在对本局表现进行反思，离开可能导致反思结果丢失。</div>' +
      '<div style="display:flex;gap:10px;justify-content:center;">' +
      '<button id="reflectionDialogWait" style="padding:8px 20px;border-radius:6px;border:1px solid #d4a843;background:rgba(212,168,67,0.15);color:#d4a843;cursor:pointer;font-size:14px;">等待完成</button>' +
      '<button id="reflectionDialogSkip" style="padding:8px 20px;border-radius:6px;border:1px solid #8a6a4a;background:rgba(138,106,74,0.15);color:#a09070;cursor:pointer;font-size:14px;">继续游戏</button>' +
      '</div>';
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    document.getElementById("reflectionDialogWait").addEventListener("click", () => {
      this.removeReflectionPendingDialog();
    });
    document.getElementById("reflectionDialogSkip").addEventListener("click", () => {
      this.removeReflectionPendingDialog();
      this.proceedToNewRun();
    });
  }

  removeReflectionPendingDialog() {
    const el = document.getElementById("reflectionPendingDialog");
    if (el) el.remove();
  }

  proceedToNewRun() {
    this.exitSettlementPage();
    this.startNewRun();
  }

  updateCrossGameReflection(playerId, run, reflection) {
    const memory = this.aiCrossGameMemory[playerId];
    if (!memory) return;
    const entry = memory.find((e) => e.run === run);
    if (entry) {
      entry.reflection = reflection;
      this.saveAiMemoryToStorage();
    }
  }

  openAiMemoryPanel() {
    if (!this.dom.aiMemoryOverlay) return;
    const aiPlayers = this.players.filter((p) => !p.isHuman);
    if (aiPlayers.length === 0) {
      if (this.dom.aiMemoryContent) {
        this.dom.aiMemoryContent.innerHTML = '<div class="ai-memory-empty">暂无AI玩家</div>';
      }
      this.dom.aiMemoryOverlay.classList.remove("hidden");
      return;
    }
    const sections = aiPlayers.map((player, idx) => {
      const memory = this.aiCrossGameMemory[player.id];
      const colors = ["#c49a3c", "#5a9e5a", "#5a7ebd", "#bd5a7e"];
      const color = colors[idx % colors.length];
      let inner = "";
      if (!memory || memory.length === 0) {
        inner = '<div class="ai-memory-empty">暂无跨局记忆</div>';
      } else {
        const total = memory.length;
        const entries = memory.map((entry, i) => {
          const recentIdx = total - i;
          let details = `<div class="ai-memory-entry">`;
          details += `<div class="ai-memory-entry-title">最近第${recentIdx}局 <span class="ai-memory-entry-sub">(局号${entry.run || "?"})</span></div>`;
          if (entry.result) details += `<div class="ai-memory-field"><span class="ai-memory-label">结果</span>${entry.result}</div>`;
          if (entry.dividendTicket) {
            const dt = entry.dividendTicket;
            if (dt.mechanism === "dividend") {
              details += `<div class="ai-memory-field"><span class="ai-memory-label">分红/门票</span>分红+${dt.dividendPerPlayer || 0}</div>`;
            } else if (dt.mechanism === "ticket") {
              details += `<div class="ai-memory-field"><span class="ai-memory-label">分红/门票</span>门票-${dt.ticketPerPlayer || 0}</div>`;
            }
          }
          if (entry.qualityCounts) {
            const qc = entry.qualityCounts;
            details += `<div class="ai-memory-field"><span class="ai-memory-label">品质</span>粗${qc.poor || 0} 良${qc.normal || 0} 精${qc.fine || 0} 珍${qc.rare || 0} 绝${qc.legendary || 0}</div>`;
          }
          if (entry.totalItems) details += `<div class="ai-memory-field"><span class="ai-memory-label">总藏品</span>${entry.totalItems}</div>`;
          if (entry.totalCells) details += `<div class="ai-memory-field"><span class="ai-memory-label">仓库占格</span>${entry.totalCells}</div>`;
          if (entry.reflection) {
            details += `<div class="ai-memory-field"><span class="ai-memory-label">反思</span>${entry.reflection}</div>`;
          } else if (entry.reflectionEnabled === false) {
            details += `<div class="ai-memory-field"><span class="ai-memory-label">反思</span><span class="ai-memory-disabled">该局未开启局后反思</span></div>`;
          } else {
            details += `<div class="ai-memory-field"><span class="ai-memory-label">反思</span><span class="ai-memory-pending">待生成</span></div>`;
          }
          details += "</div>";
          return details;
        }).join("");
        inner = entries;
      }
      return `<div class="ai-memory-section" style="--section-color:${color}">` +
        `<div class="ai-memory-section-header">${player.name}${memory && memory.length > 0 ? ` <span class="ai-memory-header-count">(最近${memory.length}局)</span>` : ""}</div>` +
        `<div class="ai-memory-section-body">${inner}</div>` +
        `</div>`;
    }).join("");
    if (this.dom.aiMemoryContent) {
      this.dom.aiMemoryContent.innerHTML = sections || '<div class="ai-memory-empty">暂无记忆数据</div>';
    }
    if (!this._aiMemoryTouchBound) {
      this._aiMemoryTouchBound = true;
      this.setupAiMemoryTouchScroll();
    }
    this.dom.aiMemoryOverlay.classList.remove("hidden");
  }

  setupAiMemoryTouchScroll() {
    const content = this.dom.aiMemoryContent;
    if (!content) return;
    let touchStartY = 0;
    let touchStartScrollTop = 0;
    content.addEventListener("touchstart", (e) => {
      if (e.touches.length === 1) {
        touchStartY = e.touches[0].clientY;
        touchStartScrollTop = content.scrollTop;
      }
    }, { passive: true });
    content.addEventListener("touchmove", (e) => {
      if (e.touches.length !== 1) return;
      const dy = touchStartY - e.touches[0].clientY;
      const maxScroll = content.scrollHeight - content.clientHeight;
      if (maxScroll <= 0) return;
      content.scrollTop = Math.max(0, Math.min(touchStartScrollTop + dy, maxScroll));
    }, { passive: true });
  }

  closeAiMemoryPanel() {
    if (this.dom.aiMemoryOverlay) {
      this.dom.aiMemoryOverlay.classList.add("hidden");
    }
  }

  getAiFirstRoundExtraBlocks() {
    if (!this.isAiMultiGameMemoryEnabled() || this.round !== 1) {
      return [];
    }

    const blocks = [
      `【系统事件】第 ${this.runSerial} 局开始。本局仓库随机生成，技能与道具已重置。`
    ];

    if (this.pendingNextRunAiSummary) {
      blocks.push(this.pendingNextRunAiSummary);
    }

    if (this.currentPublicEvent) {
      blocks.push(`【公共事件】${this.currentPublicEvent.category}：${this.currentPublicEvent.text}`);
    }

    return blocks;
  }

  buildAiDecisionPanelSnapshot(telemetry) {
    if (!telemetry || telemetry.mode !== "llm" || !Array.isArray(telemetry.entries)) {
      return null;
    }

    const lines = [];
    lines.push(`回合 ${telemetry.round} | 决策模式：混合（大模型+规则AI）`);
    lines.push("说明：大模型接管显示完整提示词与回复；规则AI显示信心拆解与估值。");
    lines.push("");
    lines.push("-");

    const rulePayload = this.aiEngine && typeof this.aiEngine.getLastDecisionLog === "function"
      ? this.aiEngine.getLastDecisionLog()
      : null;
    const ruleEntryById = new Map(
      ((rulePayload && rulePayload.entries) || []).map((entry) => [entry.playerId, entry])
    );

    (telemetry.entries || []).forEach((entry) => {
      const isLlm = entry.controlMode === "llm";
      lines.push(`${entry.playerName}（${entry.playerId}）| 接管状态: ${isLlm ? "大模型" : "规则AI"}`);
      lines.push(`  最终出价: ${formatBidRevealNumber(entry.finalBid)} | 决策来源: ${entry.decisionSource}`);

      if (isLlm) {
        if (entry.correctionAttempt > 0) {
          lines.push(`  纠错次数: ${entry.correctionAttempt}/2`);
          if (entry.originalError) {
            lines.push(`  原始错误: ${entry.originalError}`);
          }
        }
        if (entry.historyMessagesCount > 0 || entry.crossGameMemoryCount > 0) {
          const gameInfo = entry.crossGameMemoryCount > 0 ? (entry.inGameHistoryCount > 0 ? `${entry.crossGameMemoryCount}局跨局记忆+${entry.inGameHistoryCount}条本局历史` : `${entry.crossGameMemoryCount}局跨局记忆`) : `${entry.inGameHistoryCount}条本局历史`;
          lines.push(`  跨局记忆注入: ${gameInfo}`);
        }
        if (entry.llmActionName) {
          lines.push(`  大模型动作: ${entry.llmActionName}${entry.actionExecuted ? "（已执行）" : "（未执行）"}`);
        }
        if (entry.ruleActionName) {
          lines.push(`  规则动作: ${entry.ruleActionName}`);
        }
        if (entry.thought) {
          lines.push(`  思考: ${entry.thought}`);
        }
        if (entry.reasoningContent) {
          lines.push(`  思维链: ${entry.reasoningContent}`);
        }
        if (entry.error) {
          lines.push(`  错误: ${entry.error}`);
        }
        if (entry.fallbackRuleBid !== null && entry.fallbackRuleBid !== undefined) {
          lines.push(`  回退规则出价参考: ${formatBidRevealNumber(entry.fallbackRuleBid)}`);
        }
        if (entry.systemPrompt) {
          lines.push("  [System Prompt]");
          lines.push(this.compactPanelTextForSnapshot(entry.systemPrompt, 2200));
        }
        if (entry.crossGameMemoryText) {
          lines.push("  [Cross-game Memory]");
          lines.push(this.compactPanelTextForSnapshot(entry.crossGameMemoryText, 5000));
        }
        lines.push("  [User Prompt]");
        lines.push(this.compactPanelTextForSnapshot(entry.userPrompt, 10000));
        lines.push("  [Model Response]");
        lines.push(this.compactPanelTextForSnapshot(entry.modelResponse, 3000));
        if (entry.toolResultSummary) {
          lines.push("  [Tool Result]");
          lines.push(this.compactPanelTextForSnapshot(entry.toolResultSummary, 800));
        }
        if (entry.errorCorrectionPrompt || entry.errorCorrectionResponse) {
          lines.push("  [Error Correction Prompt]");
          lines.push(this.compactPanelTextForSnapshot(entry.errorCorrectionPrompt, 4200));
          lines.push("  [Error Correction Response]");
          lines.push(this.compactPanelTextForSnapshot(entry.errorCorrectionResponse, 4000));
        }
        if (entry.followupPrompt || entry.followupResponse || entry.followupError) {
          lines.push("  [Follow-up Prompt]");
          lines.push(this.compactPanelTextForSnapshot(entry.followupPrompt, 4200));
          lines.push("  [Follow-up Response]");
          lines.push(this.compactPanelTextForSnapshot(entry.followupResponse || entry.followupError, 4000));
          if (entry.followupActionRejected) {
            lines.push("  [Follow-up Action Guard]");
            lines.push(this.compactPanelTextForSnapshot(entry.followupActionRejected, 500));
          }
        }
      } else {
        const ruleEntry = ruleEntryById.get(entry.playerId);
        if (ruleEntry) {
          const parts = ruleEntry.confidenceParts || {};
          const overheat = Math.round((ruleEntry.overheatRatio || 0) * 100);
          const threshold = Math.round((ruleEntry.overheatThreshold || 0) * 100);
          lines.push(`  信心 ${Math.round((ruleEntry.confidence || 0) * 100)}% | 人格 ${ruleEntry.archetype || "规则型"}`);
          lines.push(`  私有线索: 线索率 ${Math.round((ruleEntry.intelClueRate || 0) * 100)}% | 品质率 ${Math.round((ruleEntry.intelQualityRate || 0) * 100)}% | 不确定 ${(ruleEntry.intelUncertainty || 0).toFixed(2)} | 波动 ${(ruleEntry.intelSpreadRatio || 0).toFixed(2)}`);
          lines.push(`  估值: ${formatBidRevealNumber(ruleEntry.perceivedValue || 0)} | 上限 ${formatBidRevealNumber(ruleEntry.hardCap || 0)}`);
          lines.push(`  心理预期: ${formatBidRevealNumber(ruleEntry.psychExpectedBid || 0)}`);
          lines.push(`  信心拆解: 基础 ${(parts.base || 0).toFixed(2)} + 线索 ${(parts.clue || 0).toFixed(2)} + 品质 ${(parts.quality || 0).toFixed(2)} + 回合 ${(parts.progress || 0).toFixed(2)} + 盘口 ${(parts.market || 0).toFixed(2)} + 工具 ${(parts.tool || 0).toFixed(2)} + 边缘奖励 ${(parts.edgeBonus || 0).toFixed(2)} - 波动惩罚 ${(parts.spreadPenalty || 0).toFixed(2)} - 不确定惩罚 ${(parts.uncertaintyPenalty || 0).toFixed(2)} + 情绪 ${(parts.mood || 0).toFixed(2)}`);
          lines.push(`  超预期: ${overheat}% | 回撤阈值 ${threshold}%`);
          lines.push(`  工具影响: ${ruleEntry.toolTag || "无"} | 决策加分 ${(ruleEntry.toolScoreBoost || 0).toFixed(2)}`);
          lines.push(`  行为: ${ruleEntry.actionTag || "常规"}${ruleEntry.mistakeTag ? ` | 失误:${ruleEntry.mistakeTag}` : ""}${ruleEntry.diversifyTag ? ` | 去同质:${ruleEntry.diversifyTag}` : ""}`);
        } else {
          lines.push("  （无规则AI决策数据）");
        }
      }
      lines.push("-");
    });

    return lines.join("\n");
  }

  compactPanelTextForSnapshot(text, maxLen) {
    const input = typeof text === "string" ? text.trim() : "";
    if (!input) {
      return "    （空）";
    }
    if (input.length <= maxLen) {
      return input.split("\n").map((l) => `    ${l}`).join("\n");
    }
    return `    ${input.slice(0, maxLen)}...`;
  }

  beginRunTracking() {
    this.runSerial += 1;
    this.saveAiMemoryToStorage();
    const runLog = {
      runNo: this.runSerial,
      startedAt: Date.now(),
      actionLogs: [],
      aiThoughtLogs: [],
      roundLogsByRound: {},
      roundPanelTexts: {}
    };
    this.currentRunLog = runLog;
    this.runLogHistory.push(runLog);
    if (this.runLogHistory.length > 12) {
      this.runLogHistory = this.runLogHistory.slice(-12);
    }
    this.renderAiThoughtLog();
  }

  recordAiThoughtLogs(telemetry) {
    if (!telemetry || telemetry.mode !== "llm" || !Array.isArray(telemetry.entries) || !this.currentRunLog) {
      return;
    }

    telemetry.entries.forEach((entry) => {
      const thought = String(entry && entry.thought ? entry.thought : "").trim();
      const reasoningContent = String(entry && entry.reasoningContent ? entry.reasoningContent : "").trim();
      const historyCount = entry && entry.historyMessagesCount ? entry.historyMessagesCount : 0;
      const crossGameCount = entry && entry.crossGameMemoryCount ? entry.crossGameMemoryCount : 0;
      const correctionAttempt = entry && entry.correctionAttempt ? entry.correctionAttempt : 0;
      const originalError = entry && entry.originalError ? entry.originalError : "";
      if (!thought && !reasoningContent && !historyCount && !crossGameCount && !correctionAttempt && !originalError) {
        return;
      }

      const parts = [];
      if (correctionAttempt > 0) {
        parts.push(`[纠错第${correctionAttempt}次]`);
        if (originalError) {
          parts.push(`[原始错误] ${originalError}`);
        }
      }
      if (historyCount > 0 || crossGameCount > 0) {
        const gameInfo = crossGameCount > 0 ? (entry.inGameHistoryCount > 0 ? `${crossGameCount}局跨局记忆+${entry.inGameHistoryCount}条本局历史` : `${crossGameCount}局跨局记忆`) : `${entry.inGameHistoryCount}条本局历史`;
        parts.push(`[注入${gameInfo}]`);
      }
      if (reasoningContent) {
        parts.push(`[思维链] ${reasoningContent}`);
      }
      if (thought) {
        parts.push(`[决策摘要] ${thought}`);
      }

      this.currentRunLog.aiThoughtLogs.push({
        round: telemetry.round,
        playerName: entry.playerName || entry.playerId || "AI",
        thought: parts.join("\n"),
        crossGameMemoryCount: crossGameCount,
        controlMode: entry.controlMode || "",
        finalBid: entry.finalBid,
        decisionSource: entry.decisionSource || "",
        llmActionName: entry.llmActionName || "",
        ruleActionName: entry.ruleActionName || "",
        actionExecuted: Boolean(entry.actionExecuted),
        error: entry.error || "",
        correctionAttempt: correctionAttempt,
        originalError: originalError,
        at: Date.now()
      });
    });

    if (this.currentRunLog.aiThoughtLogs.length > 80) {
      this.currentRunLog.aiThoughtLogs = this.currentRunLog.aiThoughtLogs.slice(-80);
    }

    const roundNo = Math.max(1, Math.round(Number(telemetry.round) || 1));
    if (!this.currentRunLog.roundPanelTexts) {
      this.currentRunLog.roundPanelTexts = {};
    }
    if (typeof this.buildAiDecisionPanelSnapshot === "function") {
      const panelText = this.buildAiDecisionPanelSnapshot(telemetry);
      if (panelText) {
        this.currentRunLog.roundPanelTexts[String(roundNo)] = panelText;
      }
    }

    this.renderAiThoughtLog();
  }

  renderAiThoughtLog() {
    if (!this.dom.aiThoughtContent) {
      return;
    }

    const lines = [];
    const runs = this.runLogHistory.slice().reverse();
    runs.forEach((run) => {
      lines.push(`第 ${run.runNo} 局`);

      if (!run.aiThoughtLogs || run.aiThoughtLogs.length === 0) {
        lines.push("  - 暂无AI思考记录");
      } else {
        run.aiThoughtLogs.forEach((entry) => {
          lines.push(`  - R${entry.round} ${entry.playerName}: ${entry.thought}`);
        });
      }

      const actionTail = (run.actionLogs || []).slice(-6);
      if (actionTail.length > 0) {
        lines.push("  最近日志:");
        actionTail.forEach((entry) => {
          lines.push(`    ${entry}`);
        });
      }
      lines.push("");
    });

    this.dom.aiThoughtContent.textContent = lines.length > 0 ? lines.join("\n") : "暂无AI思考记录。";
  }

  writeLog(text) {
    const line = `日志: ${text}`;
    if (this.dom.actionLog) this.dom.actionLog.textContent = line;
    if (this.currentRunLog) {
      this.currentRunLog.actionLogs.push(line);
      if (this.currentRunLog.actionLogs.length > 120) {
        this.currentRunLog.actionLogs = this.currentRunLog.actionLogs.slice(-120);
      }

      const roundNo = Math.max(1, Math.round(Number(this.round) || 1));
      if (!Array.isArray(this.currentRunLog.roundLogsByRound[roundNo])) {
        this.currentRunLog.roundLogsByRound[roundNo] = [];
      }
      this.currentRunLog.roundLogsByRound[roundNo].push(line);
      if (this.currentRunLog.roundLogsByRound[roundNo].length > 120) {
        this.currentRunLog.roundLogsByRound[roundNo] = this.currentRunLog.roundLogsByRound[roundNo].slice(-120);
      }
    }
    this.renderAiThoughtLog();
  }
}

Object.assign(WarehouseScene.prototype, window.MobaoWarehouse.WarehouseCoreMixin);
Object.assign(WarehouseScene.prototype, window.MobaoWarehouse.WarehouseRevealMixin);
Object.assign(WarehouseScene.prototype, window.MobaoWarehouse.WarehousePreviewMixin);

const config = {
  type: Phaser.AUTO,
  parent: "game-root",
  width: MARGIN * 2 + GRID_COLS * CELL_SIZE,
  height: MARGIN * 2 + GRID_ROWS * CELL_SIZE,
  backgroundColor: "#2f261b",
  pixelArt: true,
  antialias: false,
  roundPixels: true,
  resolution: window.devicePixelRatio || 1,
  input: {
    touch: {
      capture: false
    }
  },
  scene: [WarehouseScene]
};

new Phaser.Game(config);
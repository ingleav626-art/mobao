/**
 * @file lan/game-flow.js
 * @module lan/game-flow
 * @description 联机游戏流程 Mixin。管理出价结算、AI 出价计算、回合开始/结束、
 *              超时处理、全标结算、拍卖结束等核心游戏流程。
 *
 * @requires MobaoConstants - 常量（DEFAULT_START_MONEY, GRID_ROWS, GRID_COLS）
 * @requires MobaoSettings  - 游戏设置（GAME_SETTINGS, savePlayerMoney）
 *
 * @exports LanGameFlowMixin
 */
const { DEFAULT_START_MONEY, GRID_ROWS, GRID_COLS } = window.MobaoConstants
const { GAME_SETTINGS, savePlayerMoney } = window.MobaoSettings

export const LanGameFlowMixin = {
  lanResolveRound(reason) {
    if (this.roundResolving || this.settled) return
    this.roundResolving = true
    this.stopRoundTimer()
    const allBids = this.players.map((p) => {
      const bid = this.lanHostBids[p.lanId] || 0
      const wallet = this.lanHostWallets[p.lanId] || DEFAULT_START_MONEY
      return { playerId: p.lanId, bid: Math.min(Math.max(0, bid), wallet) }
    })

    this.lanBridge.broadcastRoundResult(this.round, allBids, reason)

    const slotBids = this.players.map((p) => {
      const found = allBids.find((b) => b.playerId === p.lanId)
      return { playerId: p.id, bid: found ? found.bid : 0 }
    })

    this.captureAiDecisionTelemetry(slotBids)
    this.recordAiThoughtLogs(this.lastAiDecisionTelemetry)
    this.renderAiLogicPanel()

    const sorted = [...allBids].sort((a, b) => b.bid - a.bid)
    const first = sorted[0]
    const second = sorted[1] || { bid: 0 }
    this.currentBid = first.bid
    this.bidLeader = this.lanIdToSlotId[first.playerId] || first.playerId
    this.secondHighestBid = second.bid

    this.revealRoundBidsSequential(slotBids).then(() => {
      this.recordRoundHistory(slotBids)
    })

    const shouldDirectTake =
      this.round < GAME_SETTINGS.maxRounds &&
      first.bid > 0 &&
      first.bid >= Math.ceil(second.bid * (1 + GAME_SETTINGS.directTakeRatio))

    if (this.round === GAME_SETTINGS.maxRounds || shouldDirectTake) {
      const mode = this.round === GAME_SETTINGS.maxRounds ? "final" : "direct"
      const winnerSlotId = this.lanIdToSlotId[first.playerId] || first.playerId
      const winner = { playerId: winnerSlotId, bid: first.bid }
      this.lanBridge.broadcastSettle({
        winnerId: first.playerId,
        winnerName: this.players.find((p) => p.lanId === first.playerId)?.name || "?",
        winnerBid: first.bid,
        totalValue: this.warehouseTrueValue,
        winnerProfit: this.warehouseTrueValue - first.bid,
        secondHighestBid: second.bid,
        mode
      })
      this.lanDoFinishAuction(winner, mode)
    } else {
      const waitMs = GAME_SETTINGS.postRevealWaitMs + this.players.length * GAME_SETTINGS.bidRevealIntervalMs
      setTimeout(() => {
        this.round += 1
        this.skillManager.onNewRound()
        this.lanHostBids = {}
        this.lanBroadcastRoundStart()
        this.startRound()
        this.updateHud()
      }, waitMs)
    }
  },

  lanComputeAiBids() {
    const aiPlayers = this.lanAiPlayers
    const clueRate =
      this.items.length === 0 ? 0 : this.items.filter((item) => this.hasAnyInfo(item)).length / this.items.length
    const slotLastBids = this.getLastRoundBidMap()
    const lastRoundBids = {}
    for (const sid in slotLastBids) {
      const lanId = this.slotIdToLanId[sid]
      if (lanId) lastRoundBids[lanId] = slotLastBids[sid]
    }
    const aiIntelMap = this.buildAiIntelSnapshot()
    const remappedIntel = {}
    for (const sid in aiIntelMap) {
      const lanId = this.slotIdToLanId[sid]
      if (lanId) remappedIntel[lanId] = aiIntelMap[sid]
    }
    const remappedEffects = {}
    for (const sid in this.aiRoundEffects) {
      const lanId = this.slotIdToLanId[sid]
      if (lanId) remappedEffects[lanId] = this.aiRoundEffects[sid]
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
      itemCount: this.items.length
    })

    aiPlayers.forEach((ai) => {
      const slotId = this.lanIdToSlotId[ai.id]
      if (!slotId) {
        console.log(`[lanComputeAiBids] ${ai.id} no slotId mapping, skipping`)
        return
      }
      const plan = this.aiLlmRoundPlans[slotId]
      console.log(
        `[lanComputeAiBids] ${ai.id} slotId=${slotId} plan:`,
        plan
          ? {
            failed: plan.failed,
            hasBidDecision: plan.hasBidDecision,
            bid: plan.bid,
            canUseLlm: this.canUseLlmDecisionForPlayer(slotId)
          }
          : "null"
      )
      if (!plan || plan.failed || !plan.hasBidDecision || !this.canUseLlmDecisionForPlayer(slotId)) return
      const wallet = this.lanHostWallets[ai.id] || DEFAULT_START_MONEY
      const normalizedBid = this.normalizeAiBidValue(slotId, plan.bid, wallet)
      console.log(
        `[lanComputeAiBids] ${ai.id} LLM bid override: ${ruleBids[ai.id]} -> ${normalizedBid} (wallet=${wallet})`
      )
      ruleBids[ai.id] = normalizedBid
    })

    return ruleBids
  },

  lanOnRoundStart(msg) {
    this.round = msg.round
    this.currentBid = msg.currentBid || 0
    this.playerBidSubmitted = false
    this.playerRoundBid = 0
    this.startRound()
    if (msg.ts && msg.roundSeconds) {
      const elapsed = Math.round((Date.now() - msg.ts) / 1000)
      const corrected = msg.roundSeconds - elapsed
      if (corrected > 0 && corrected <= msg.roundSeconds) {
        this.roundTimeLeft = corrected
      }
    }
    this.updateHud()
  },

  lanBroadcastRoundStart() {
    this.lanBridge.broadcastRoundStart(
      this.round,
      GAME_SETTINGS.maxRounds,
      this.currentBid,
      GAME_SETTINGS.roundSeconds
    )
  },

  startLanRun() {
    if (window.NativeBridge && window.NativeBridge.isNative && window.NativeBridge.isNative()) {
      try {
        window.NativeBridge.setGameRunning(true)
      } catch (_) { }
    }
    this.beginRunTracking()
    this.battleRecordReplayActive = false
    this.battleRecordReplayRecordId = null
    this.cancelSettlementReveal()
    this.stopRoundTimer()
    this.exitSettlementPage()
    this.guardWarehouseCapacity()

    // 应用地图配置
    if (window.MobaoMapProfiles) {
      var _mapId = MobaoMapProfiles.getSelectedProfileId()
      var profile = MobaoMapProfiles.getProfile(_mapId)
      if (profile && profile.params) {
        var mp = profile.params
        if (Number.isFinite(mp.maxRounds)) GAME_SETTINGS.maxRounds = mp.maxRounds
        if (Number.isFinite(mp.directTakeRatio)) GAME_SETTINGS.directTakeRatio = mp.directTakeRatio
        this._mapQualityWeights = mp.qualityWeights || null
        this._mapCategoryWeights = mp.categoryWeights || null
      }
    }

    this.round = 1
    this.actionsLeft = GAME_SETTINGS.actionsPerRound
    this.roundTimeLeft = GAME_SETTINGS.roundSeconds
    this.roundResolving = false
    this.playerBidSubmitted = false
    this.playerRoundBid = 0
    this.selectedItem = null
    this.currentBid = 1000
    this.bidLeader = "none"
    this.aiMaxBid = 0
    this.warehouseTrueValue = 0
    this.settled = false
    this.moneySettledRunToken = this.makeRunToken()
    this.resetPlayerHistoryState()

    this.privateIntelEntries = []
    this.publicInfoEntries = []
    this.currentPublicEvent = null

    this.skillManager.resetForNewRun()
    this.skillManager.onNewRound()
    this.syncItemManagerFromShop()

    this.hidePreview()
    this.closeBidKeypad()
    this.closeItemDrawer()
    this.hideSettleOverlay()
    this.hideRevealScrollHints()
    this.drawUnknownWarehouse()
    if (this.lanIsHost) {
      this.spawnRandomItems()
    }
    this.setupWarehouseAuction()
    this.rebuildWarehouseCellIndex()

    if (this.lanIsHost && window.PublicEventSystem && this.items.length > 0) {
      this.currentPublicEvent = window.PublicEventSystem.pickRandomPublicEvent(this.items, GRID_COLS, GRID_ROWS)
      this.publicInfoEntries = [
        {
          source: this.currentPublicEvent.category,
          text: this.currentPublicEvent.text
        }
      ]
    }

    if (this.lanIsHost) {
      const warehouseData = this.buildWarehouseSnapshotForSync()
      this.lanBridge.send({
        type: "game:warehouse-sync",
        warehouse: warehouseData,
        warehouseTrueValue: this.warehouseTrueValue,
        currentBid: this.currentBid,
        aiMaxBid: this.aiMaxBid
      })
    }

    this.players = this.lanPlayers.map((p, i) => ({
      id: "p" + (i + 1),
      lanId: p.id,
      name: p.name,
      avatar: p.isAI ? "AI" : p.id === this.lanBridge.playerId ? "你" : p.name.substring(0, 2),
      isHuman: !p.isAI,
      isAI: !!p.isAI,
      isSelf: !p.isAI && p.id === this.lanBridge.playerId,
      characterId: p.characterId || null,
      carryItems: p.carryItems || []
    }))

    this.lanIdToSlotId = {}
    this.slotIdToLanId = {}
    this.players.forEach((p) => {
      this.lanIdToSlotId[p.lanId] = p.id
      this.slotIdToLanId[p.id] = p.lanId
    })

    this.lanMySlotId = this.lanIdToSlotId[this.lanBridge.playerId] || "p2"

    this.initPlayersUI()

    // 应用角色选择到玩家数据
    if (window.CharacterSystem) {
      CharacterSystem.resetForNewGame()
      this.applyCharacterToPlayer()
    }
    // 为其他玩家设置角色信息（从 lanPlayers 同步，game:start 已包含 characterId）
    this.players.forEach((p) => {
      if (p.characterId && !p.isSelf) {
        if (window.CharacterData && (window.CharacterData as any).CHARACTERS) {
          var charData = (window.CharacterData as any).CHARACTERS.find((c) => c.id === p.characterId)
          if (charData) {
            p.characterName = charData.name
            p.avatar = charData.avatarLabel || charData.name.substring(0, 2)
          }
        }
      }
    })

    // 根据每个AI自己的llm属性设置aiLlmPlayerEnabled
    if (this.lanAiPlayers.length > 0) {
      this.lanAiPlayers.forEach((ai) => {
        const slotId = this.lanIdToSlotId[ai.id]
        if (slotId) {
          this.aiLlmPlayerEnabled[slotId] = !!ai.llm
          const toggleEl = document.getElementById("llm-switch-" + slotId)
          if (toggleEl) (toggleEl as HTMLInputElement).checked = !!ai.llm
        }
      })
    }
    if (this.lanIsHost) {
      this.aiWallets = {}
      this.lanAiPlayers.forEach((ai) => {
        this.aiWallets[ai.id] = this.lanHostWallets[ai.id] || DEFAULT_START_MONEY
      })
    } else {
      this.initAiWallets()
    }
    this.initAiIntelSystems()
    this.aiEngine.resetForNewRun({
      startingBid: this.currentBid,
      itemCount: this.items.length
    })

    if (this.lanIsHost) {
      this.lanHostBids = {}
      this.lanBroadcastRoundStart()
    }

    this.startRound()
    this.updateHud()
    this.writeLog("联机游戏已开始！" + (this.lanIsHost ? "（你是主机）" : ""))
  },

  async lanOnAllBidsIn(msg) {
    if (this.lanIsHost && this.aiRoundDecisionPromise) {
      await this.aiRoundDecisionPromise
    }
    if (this.roundPaused) await this.waitUntilResumed()
    const aiBids = this.lanComputeAiBids()
    for (const aid in aiBids) {
      this.lanHostBids[aid] = aiBids[aid]
    }
    if (this.lanHostBids[this.lanBridge.playerId] === undefined) {
      this.lanHostBids[this.lanBridge.playerId] = this.playerRoundBid
    }
    this.lanResolveRound("all-in")
  },

  async lanOnRoundTimeout() {
    if (this.lanHostBids[this.lanBridge.playerId] === undefined) {
      this.lanHostBids[this.lanBridge.playerId] = this.playerRoundBid || 0
    }
    if (this.lanIsHost && this.aiRoundDecisionPromise) {
      await this.aiRoundDecisionPromise
    }
    if (this.roundPaused) await this.waitUntilResumed()
    const aiBids = this.lanComputeAiBids()
    for (const aid in aiBids) {
      this.lanHostBids[aid] = aiBids[aid]
    }
    this.lanResolveRound("timeout")
  },

  lanOnRoundResult(msg) {
    const roundBids = msg.bids || []
    this.revealRoundBidsSequential(
      this.players.map((p) => {
        const found = roundBids.find((b) => b.playerId === p.lanId)
        return { playerId: p.id, bid: found ? found.bid : 0 }
      })
    ).then(() => {
      this.recordRoundHistory(
        this.players.map((p) => {
          const found = roundBids.find((b) => b.playerId === p.lanId)
          return { playerId: p.id, bid: found ? found.bid : 0 }
        })
      )
    })
  },

  lanDoFinishAuction(winner, mode) {
    this.finishAuction(winner, mode)
    if (this.lanHostWallets[this.lanBridge.playerId] !== undefined) {
      this.lanHostWallets[this.lanBridge.playerId] = this.playerMoney
    }
    const finalWallets = {}
    const profitDetails = []
    this.players.forEach((p) => {
      const bid = this.lanHostBids[p.lanId] || 0
      if (p.id === winner.playerId) {
        finalWallets[p.lanId] = this.lanHostWallets[p.lanId] - bid + this.warehouseTrueValue
        profitDetails.push({
          playerId: p.lanId,
          playerName: p.name,
          bid,
          value: this.warehouseTrueValue,
          profit: this.warehouseTrueValue - bid
        })
      } else {
        finalWallets[p.lanId] = this.lanHostWallets[p.lanId]
        profitDetails.push({ playerId: p.lanId, playerName: p.name, bid: 0, value: 0, profit: 0 })
      }
    })
    setTimeout(() => {
      this.lanBridge.broadcastSettleFinal(finalWallets, profitDetails)
    }, 1500)
  }
}
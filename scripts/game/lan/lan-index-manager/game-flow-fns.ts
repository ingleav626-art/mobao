/**
 * @file lan-index-manager/game-flow-fns.ts
 * @module lan-index-manager/game-flow-fns
 * @description 联机游戏流程纯函数。管理出价结算、AI 出价计算、回合开始/结束、
 *              超时处理、全标结算、拍卖结束等核心游戏流程。
 *              所有 this. 引用替换为 deps/state 参数。
 */
import type { LanIndexManagerDeps, LanIndexState } from "../lan-index-manager"
import { DEFAULT_START_MONEY, GRID_ROWS, GRID_COLS } from "../../core/constants"
import { GAME_SETTINGS } from "../../core/settings"
import { getSelectedProfileId as _getSelectedProfileId, getProfile as _getProfile } from "../../data/map-profiles"
import { pickRandomPublicEvent } from "../../data/public-events"
import { resetForNewGame } from "../../data/character-system"
import { CHARACTERS } from "../../data/characters"
import { createLogger } from "../../core/logger"
import type { IntelSummary } from "../../../../types/ai"

const log = createLogger("LAN")

export function lanResolveRound(deps: LanIndexManagerDeps, state: LanIndexState, reason: string): void {
  if (state.roundResolving || state.settled) return
  state.roundResolving = true
  deps.stopRoundTimer()
  const allBids = state.players.map((p) => {
    const lanId = ((p as unknown as Record<string, unknown>).lanId as string) || p.id
    const bid = state.lanHostBids[lanId] || 0
    const wallet = state.lanHostWallets[lanId] || DEFAULT_START_MONEY
    return { playerId: lanId, bid: Math.min(Math.max(0, bid), wallet) }
  })

  log.info(
    `lanResolveRound: reason=${reason}, round=${state.round}, ` +
    `lanHostBids keys=${JSON.stringify(Object.keys(state.lanHostBids))}, ` +
    `lanHostBids=${JSON.stringify(state.lanHostBids)}`
  )
  log.info(`lanResolveRound: allBids=${JSON.stringify(allBids)}`)

  const bridge = deps.getLanBridge()
  bridge?.broadcastRoundResult(state.round, allBids, reason)

  const slotBids = state.players.map((p) => {
    const found = allBids.find((b) => b.playerId === (p as unknown as Record<string, unknown>).lanId)
    return { playerId: p.id, bid: found ? found.bid : 0 }
  })

  deps.captureAiDecisionTelemetry(slotBids)
  deps.recordAiThoughtLogs(state.lastAiDecisionTelemetry)
  deps.renderAiLogicPanel()

  const sorted = [...allBids].sort((a, b) => b.bid - a.bid)
  const first = sorted[0]
  const second = sorted[1] || { bid: 0 }
  state.currentBid = first.bid
  state.bidLeader = state.lanIdToSlotId[first.playerId] || first.playerId
  state.secondHighestBid = second.bid

  log.info(
    `lanResolveRound: sorted=${JSON.stringify(sorted)}, ` +
    `first={playerId: ${first.playerId}, bid: ${first.bid}}, ` +
    `second={playerId: ${second.playerId || "none"}, bid: ${second.bid}}, ` +
    `winner=${state.bidLeader}, currentBid=${state.currentBid}, secondHighestBid=${state.secondHighestBid}`
  )

  deps.revealRoundBidsSequential(slotBids).then(() => {
    deps.recordRoundHistory(slotBids)
  })

  const shouldDirectTake =
    state.round < deps.getSettingsMaxRounds() &&
    first.bid > 0 &&
    first.bid >= Math.ceil(second.bid * (1 + deps.getSettingsDirectTakeRatio()))

  if (state.round === deps.getSettingsMaxRounds() || shouldDirectTake) {
    const mode = state.round === deps.getSettingsMaxRounds() ? "final" : "direct"
    const winnerSlotId = state.lanIdToSlotId[first.playerId] || first.playerId
    const winner = { playerId: winnerSlotId, bid: first.bid }
    log.info(
      `lanResolveRound: auction ends, mode=${mode}, ` +
      `winnerLanId=${first.playerId}, winnerSlotId=${winnerSlotId}, bid=${first.bid}`
    )
    bridge?.broadcastSettle({
      winnerId: first.playerId,
      winnerName:
        state.players.find((p) => (p as unknown as Record<string, unknown>).lanId === first.playerId)?.name || "?",
      winnerBid: first.bid,
      totalValue: state.warehouseTrueValue,
      winnerProfit: state.warehouseTrueValue - first.bid,
      secondHighestBid: second.bid,
      mode
    })
    lanDoFinishAuction(deps, state, winner, mode)
  } else {
    const waitMs = GAME_SETTINGS.postRevealWaitMs + state.players.length * GAME_SETTINGS.bidRevealIntervalMs
    setTimeout(() => {
      state.round += 1
      deps.skillManager.onNewRound()
      state.lanHostBids = {}
      lanBroadcastRoundStart(deps, state)
      deps.startRound()
      deps.updateHud()
    }, waitMs)
  }
}

export function lanComputeAiBids(deps: LanIndexManagerDeps, state: LanIndexState): Record<string, number> {
  const aiPlayers = state.lanAiPlayers
  const clueRate =
    state.items.length === 0 ? 0 : state.items.filter((item) => deps.hasAnyInfo(item)).length / state.items.length
  const slotLastBids = deps.getLastRoundBidMap()
  const lastRoundBids: Record<string, number> = {}
  for (const sid in slotLastBids) {
    const lanId = state.slotIdToLanId[sid]
    if (lanId) lastRoundBids[lanId] = slotLastBids[sid]
  }
  const aiIntelMap = deps.buildAiIntelSnapshot()
  const remappedIntel: Record<string, IntelSummary> = {}
  for (const sid in aiIntelMap) {
    const lanId = state.slotIdToLanId[sid]
    if (lanId) remappedIntel[lanId] = aiIntelMap[sid]
  }
  const remappedEffects: Record<string, unknown> = {}
  for (const sid in state.aiRoundEffects) {
    const lanId = state.slotIdToLanId[sid]
    if (lanId) remappedEffects[lanId] = state.aiRoundEffects[sid]
  }
  const ruleBids = deps.aiEngine.buildAIBids({
    aiPlayers,
    clueRate,
    round: state.round,
    maxRounds: deps.getSettingsMaxRounds(),
    currentBid: state.currentBid,
    lastRoundBids,
    bidStep: GAME_SETTINGS.bidStep,
    aiIntelMap: remappedIntel,
    aiToolEffectMap: remappedEffects,
    itemCount: state.items.length
  })

  aiPlayers.forEach((ai) => {
    const slotId = state.lanIdToSlotId[ai.id]
    if (!slotId) {
      log.debug("[lanComputeAiBids] " + ai.id + " no slotId mapping, skipping")
      return
    }
    const plan = state.aiLlmRoundPlans[slotId]
    log.debug(
      "[lanComputeAiBids] " + ai.id + " slotId=" + slotId + " plan:",
      plan
        ? {
            failed: (plan as Record<string, unknown>).failed,
            hasBidDecision: (plan as Record<string, unknown>).hasBidDecision,
            bid: (plan as Record<string, unknown>).bid,
            canUseLlm: deps.canUseLlmDecisionForPlayer(slotId)
          }
        : "null"
    )
    if (
      !plan ||
      (plan as Record<string, unknown>).failed ||
      !(plan as Record<string, unknown>).hasBidDecision ||
      !deps.canUseLlmDecisionForPlayer(slotId)
    )
      return
    const wallet = state.lanHostWallets[ai.id] || DEFAULT_START_MONEY
    const normalizedBid = deps.normalizeAiBidValue(slotId, (plan as Record<string, unknown>).bid as number, wallet)
    log.debug(
      "[lanComputeAiBids] " +
        ai.id +
        " LLM bid override: " +
        ruleBids[ai.id] +
        " -> " +
        normalizedBid +
        " (wallet=" +
        wallet +
        ")"
    )
    ruleBids[ai.id] = normalizedBid
  })

  log.info(
    `lanComputeAiBids: result=${JSON.stringify(
      Object.entries(ruleBids).map(([k, v]) => ({ playerId: k, bid: v }))
    )}`
  )
  return ruleBids
}

export function lanOnRoundStart(
  deps: LanIndexManagerDeps,
  state: LanIndexState,
  msg: { round: number; currentBid?: number; ts?: number; roundSeconds?: number }
): void {
  log.info(
    `lanOnRoundStart: round=${msg.round}, isLanMode=${state.isLanMode}, ` +
    `lanMySlotId=${state.lanMySlotId}, players count=${state.players.length}, ` +
    `playerBidSubmitted=${state.playerBidSubmitted}`
  )
  state.round = msg.round
  state.currentBid = msg.currentBid || 0
  state.playerBidSubmitted = false
  state.playerRoundBid = 0
  deps.startRound()
  if (msg.ts && msg.roundSeconds) {
    const elapsed = Math.round((Date.now() - msg.ts) / 1000)
    const corrected = msg.roundSeconds - elapsed
    if (corrected > 0 && corrected <= msg.roundSeconds) {
      state.roundTimeLeft = corrected
    }
  }
  deps.updateHud()
}

export function lanBroadcastRoundStart(deps: LanIndexManagerDeps, state: LanIndexState): void {
  const bridge = deps.getLanBridge()
  bridge?.broadcastRoundStart(state.round, deps.getSettingsMaxRounds(), state.currentBid, GAME_SETTINGS.roundSeconds)
}

export function startLanRun(deps: LanIndexManagerDeps, state: LanIndexState): void {
  if (window.NativeBridge && window.NativeBridge.isNative && window.NativeBridge.isNative()) {
    try {
      window.NativeBridge.setGameRunning(true)
    } catch (_) {}
  }
  deps.beginRunTracking()
  state.battleRecordReplayActive = false
  state.battleRecordReplayRecordId = null
  deps.cancelSettlementReveal()
  deps.stopRoundTimer()
  deps.exitSettlementPage()
  deps.guardWarehouseCapacity()

  if (deps.getProfile) {
    const profile = deps.getProfile(deps.getSelectedProfileId ? deps.getSelectedProfileId() : "")
    if (profile && profile.params) {
      var mp = profile.params
      if (Number.isFinite(mp.maxRounds)) deps.setSettingsMaxRounds(mp.maxRounds)
      if (Number.isFinite(mp.directTakeRatio)) deps.setSettingsDirectTakeRatio(mp.directTakeRatio)
      state._mapQualityWeights = mp.qualityWeights || null
      state._mapCategoryWeights = mp.categoryWeights || null
    }
  }

  state.round = 1
  state.actionsLeft = GAME_SETTINGS.actionsPerRound
  state.roundTimeLeft = GAME_SETTINGS.roundSeconds
  state.roundResolving = false
  state.playerBidSubmitted = false
  state.playerRoundBid = 0
  state.selectedItem = null
  state.currentBid = 1000
  state.bidLeader = "none"
  state.aiMaxBid = 0
  state.warehouseTrueValue = 0
  state.settled = false
  state.moneySettledRunToken = deps.makeRunToken()

  state.privateIntelEntries = []
  state.publicInfoEntries = []
  state.currentPublicEvent = null

  deps.skillManager.resetForNewRun()
  deps.skillManager.onNewRound()
  deps.syncItemManagerFromShop()

  deps.hidePreview()
  deps.closeBidKeypad()
  deps.closeItemDrawer()
  deps.hideSettleOverlay()
  deps.hideRevealScrollHints()
  deps.drawUnknownWarehouse()
  if (state.lanIsHost) {
    deps.spawnRandomItems()
  }
  deps.setupWarehouseAuction()
  deps.rebuildWarehouseCellIndex()

  if (state.lanIsHost && pickRandomPublicEvent && state.items.length > 0) {
    state.currentPublicEvent = pickRandomPublicEvent(state.items, GRID_COLS, GRID_ROWS)
    state.publicInfoEntries = [
      {
        source: state.currentPublicEvent.category,
        text: state.currentPublicEvent.text
      }
    ]
  }

  if (state.lanIsHost) {
    const warehouseData = deps.buildWarehouseSnapshotForSync()
    const bridge = deps.getLanBridge()
    bridge?.send({
      type: "game:warehouse-sync",
      warehouse: warehouseData,
      warehouseTrueValue: state.warehouseTrueValue,
      currentBid: state.currentBid,
      aiMaxBid: state.aiMaxBid
    })
  }

  state.players = state.lanPlayers.map((p, i) => ({
    id: "p" + (i + 1),
    lanId: p.id,
    name: p.name,
    avatar: p.isAI ? "AI" : p.id === deps.getLanBridge()?.playerId ? "你" : p.name.substring(0, 2),
    isHuman: !p.isAI,
    isAI: !!p.isAI,
    isSelf: !p.isAI && p.id === deps.getLanBridge()?.playerId,
    characterId: p.characterId || null,
    carryItems: p.carryItems || []
  })) as unknown as typeof state.players

  log.debug(
    "startLanRun carryItems mapping: {0}",
    JSON.stringify(
      (state.lanPlayers || []).map(function (p) {
        return { id: p.id, carryItems: p.carryItems }
      })
    )
  )

  log.info(
    "startLanRun: players=" +
      JSON.stringify(
        state.players.map((p) => ({
          id: p.id,
          name: p.name,
          isHuman: (p as unknown as Record<string, unknown>).isHuman,
          isAI: (p as unknown as Record<string, unknown>).isAI,
          isSelf: (p as unknown as Record<string, unknown>).isSelf
        }))
      )
  )

  // 在 players 设置后重新初始化历史数据，确保数据按联机实际玩家数（而非 solo 默认 4 玩家）初始化
  deps.resetPlayerHistoryState()
  log.info(
    "startLanRun: resetPlayerHistoryState after players set, count=" + state.players.length
  )

  state.lanIdToSlotId = {}
  state.slotIdToLanId = {}
  state.players.forEach((p) => {
    const lanId = (p as unknown as Record<string, unknown>).lanId as string | undefined
    if (lanId) {
      state.lanIdToSlotId[lanId] = p.id
      state.slotIdToLanId[p.id] = lanId
    }
  })

  const myPlayerId = deps.getLanBridge()?.playerId
  log.info(
    "startLanRun slot mapping: myPlayerId=" +
      myPlayerId +
      " | lanIdToSlotId=" +
      JSON.stringify(state.lanIdToSlotId) +
      " | players.lanId list=" +
      JSON.stringify(state.players.map((p) => (p as unknown as Record<string, unknown>).lanId))
  )
  state.lanMySlotId = (myPlayerId ? state.lanIdToSlotId[myPlayerId] : undefined) || "p2"
  log.info("startLanRun: lanMySlotId resolved to " + state.lanMySlotId)

  deps.initPlayersUI()

  resetForNewGame()
  deps.applyCharacterToPlayer()
  state.players.forEach((p) => {
    if (p.characterId && !(p as unknown as Record<string, unknown>).isSelf) {
      if (CHARACTERS) {
        var charData = CHARACTERS.find((c) => c.id === p.characterId)
        if (charData) {
          ;(p as unknown as Record<string, string>).characterName = charData.name
          ;(p as unknown as Record<string, string>).avatar = charData.avatar || charData.name.substring(0, 2)
        }
      }
    }
  })

  if (state.lanAiPlayers.length > 0) {
    state.lanAiPlayers.forEach((ai) => {
      const slotId = state.lanIdToSlotId[ai.id]
      if (slotId) {
        state.aiLlmPlayerEnabled[slotId] = !!ai.llm
        const toggleEl = document.getElementById("llm-switch-" + slotId)
        if (toggleEl) (toggleEl as HTMLInputElement).checked = !!ai.llm
      }
    })
  }
  if (state.lanIsHost) {
    state.aiWallets = {}
    state.lanAiPlayers.forEach((ai) => {
      state.aiWallets[ai.id] = state.lanHostWallets[ai.id] || DEFAULT_START_MONEY
    })
  } else {
    deps.initAiWallets()
  }
  deps.initAiIntelSystems()
  deps.aiEngine.resetForNewRun({
    startingBid: state.currentBid,
    itemCount: state.items.length
  })

  if (state.lanIsHost) {
    state.lanHostBids = {}
    lanBroadcastRoundStart(deps, state)
  }

  deps.startRound()
  deps.updateHud()
  deps.writeLog("联机游戏已开始！" + (state.lanIsHost ? "（你是主机）" : ""))
  log.info(
    `startLanRun done: isLanMode=${state.isLanMode}, lanMySlotId=${state.lanMySlotId}, ` +
    `players count=${state.players.length}, lanPlayers count=${state.lanPlayers.length}, ` +
    `round=${state.round}, playerBidSubmitted=${state.playerBidSubmitted}, ` +
    `lanIdToSlotId=${JSON.stringify(state.lanIdToSlotId)}, ` +
    `lanIsHost=${state.lanIsHost}`
  )
}

export async function lanOnAllBidsIn(deps: LanIndexManagerDeps, state: LanIndexState): Promise<void> {
  if (state.lanIsHost && state.aiRoundDecisionPromise) {
    await state.aiRoundDecisionPromise
  }
  if (state.roundPaused) await deps.waitUntilResumed()
  log.info(
    `lanOnAllBidsIn: before aiBids, lanHostBids=${JSON.stringify(state.lanHostBids)}, ` +
    `playerRoundBid=${state.playerRoundBid}, myPid=${deps.getLanBridge()?.playerId}`
  )
  const aiBids = lanComputeAiBids(deps, state)
  for (const aid in aiBids) {
    state.lanHostBids[aid] = aiBids[aid]
  }
  const myPid = deps.getLanBridge()?.playerId
  if (myPid != null && state.lanHostBids[myPid] === undefined) {
    log.info(
      `lanOnAllBidsIn: host bid not in lanHostBids, adding playerRoundBid=${state.playerRoundBid} for ${myPid}`
    )
    state.lanHostBids[myPid] = state.playerRoundBid
  }
  log.info(
    `lanOnAllBidsIn: final lanHostBids=${JSON.stringify(state.lanHostBids)}, ` +
    `keys=${JSON.stringify(Object.keys(state.lanHostBids))}`
  )
  lanResolveRound(deps, state, "all-in")
}

export async function lanOnRoundTimeout(deps: LanIndexManagerDeps, state: LanIndexState): Promise<void> {
  const myPid = deps.getLanBridge()?.playerId
  log.info(
    `lanOnRoundTimeout: lanHostBids before=${JSON.stringify(state.lanHostBids)}, ` +
    `playerRoundBid=${state.playerRoundBid}, myPid=${myPid}`
  )
  if (myPid != null && state.lanHostBids[myPid] === undefined) {
    state.lanHostBids[myPid] = state.playerRoundBid || 0
  }
  if (state.lanIsHost && state.aiRoundDecisionPromise) {
    await state.aiRoundDecisionPromise
  }
  if (state.roundPaused) await deps.waitUntilResumed()
  const aiBids = lanComputeAiBids(deps, state)
  for (const aid in aiBids) {
    state.lanHostBids[aid] = aiBids[aid]
  }
  log.info(
    `lanOnRoundTimeout: lanHostBids after=${JSON.stringify(state.lanHostBids)}, ` +
    `keys=${JSON.stringify(Object.keys(state.lanHostBids))}`
  )
  lanResolveRound(deps, state, "timeout")
}

export function lanOnRoundResult(
  deps: LanIndexManagerDeps,
  state: LanIndexState,
  msg: { bids?: Array<{ playerId: string; bid: number }> }
): void {
  const roundBids = msg.bids || []
  deps
    .revealRoundBidsSequential(
      state.players.map((p) => {
        const found = roundBids.find((b) => b.playerId === (p as unknown as Record<string, unknown>).lanId)
        return { playerId: p.id, bid: found ? found.bid : 0 }
      })
    )
    .then(() => {
      deps.recordRoundHistory(
        state.players.map((p) => {
          const found = roundBids.find((b) => b.playerId === (p as unknown as Record<string, unknown>).lanId)
          return { playerId: p.id, bid: found ? found.bid : 0 }
        })
      )
    })
}

export function lanDoFinishAuction(
  deps: LanIndexManagerDeps,
  state: LanIndexState,
  winner: { playerId: string; bid: number },
  mode: string
): void {
  deps.finishAuction(winner, mode)
  const myPid = deps.getLanBridge()?.playerId
  if (myPid != null && state.lanHostWallets[myPid] !== undefined) {
    state.lanHostWallets[myPid] = state.playerMoney
  }
  const finalWallets: Record<string, number> = {}
  const profitDetails: Array<{ playerId: string; playerName: string; bid: number; value: number; profit: number }> = []
  state.players.forEach((p) => {
    const lanId = ((p as unknown as Record<string, unknown>).lanId as string) || p.id
    const bid = state.lanHostBids[lanId] || 0
    if (p.id === winner.playerId) {
      finalWallets[lanId] = (state.lanHostWallets[lanId] || 0) - bid + state.warehouseTrueValue
      profitDetails.push({
        playerId: lanId,
        playerName: p.name,
        bid,
        value: state.warehouseTrueValue,
        profit: state.warehouseTrueValue - bid
      })
    } else {
      finalWallets[lanId] = state.lanHostWallets[lanId] || 0
      profitDetails.push({ playerId: lanId, playerName: p.name, bid: 0, value: 0, profit: 0 })
    }
  })
  setTimeout(() => {
    const bridge = deps.getLanBridge()
    bridge?.broadcastSettleFinal(finalWallets, profitDetails)
  }, 1500)
}

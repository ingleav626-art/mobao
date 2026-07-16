/**
 * @file lan-index-manager/events-fns.ts
 * @module lan-index-manager/events-fns
 * @description 联机 WebSocket 事件绑定纯函数。管理所有 bridge.on() 事件监听器，
 *              包括房间生命周期、游戏流程、数据同步、重连等事件的注册和处理。
 *              所有 this. 引用替换为 deps/state 参数。
 */
import type { LanIndexManagerDeps, LanIndexState, LanBridgeLike } from "../lan-index-manager"
import { DEFAULT_START_MONEY } from "../../core/constants"
import { setSelectedProfileId, getProfile } from "../../data/map-profiles"
import { patch as patchAppState } from "../../core/app-state"
import { createLogger } from "../../core/logger"
import type { LanPlayer } from "../../../../types/lan"
import { lanOnRoundStart, lanOnAllBidsIn, lanOnRoundTimeout, lanOnRoundResult, startLanRun } from "./game-flow-fns"
import { lanBuildFullSyncData, lanOnFullSync, lanRestoreWarehouseFromSync, onLanForeground } from "./sync-fns"
import { lanOnSettleFinal, lanOnSettle, lanOnRestartGo } from "./settle-fns"

const log = createLogger("LAN")

interface LanSlotConfigItem {
  type: string
  id?: string
  name?: string
  llm?: boolean
  characterId?: string
  carryItems?: string[]
  [key: string]: unknown
}

interface LanEventsCtx {
  setOnlineStatus: (text: string, status: string) => void
  showPanel: (el: HTMLElement | null) => void
  showLanAlert: (title: string, message: string) => void
  connectBtn: HTMLButtonElement | null
  roomCodeEl: HTMLElement | null
  hostBadge: HTMLElement | null
  startBtn: HTMLButtonElement | null
  roomManageBtn: HTMLButtonElement | null
  connectPanel: HTMLElement | null
  roomPanel: HTMLElement | null
  renderSlots: () => void
  syncSlotsFromPlayers: (players: unknown[], resetAi?: boolean) => void
  initLanCharacterFromStorage: () => void
  renderLanCarryItems: () => void
  updateModeMapCardState: (selected: boolean) => void
  lanCarryItems: Array<{ id: string; name: string }>
  lanSlotConfig: LanSlotConfigItem[]
  mapCardLabel: HTMLElement | null
  broadcastSlotState: () => void
  leaveBtn: HTMLButtonElement | null
  lanSelectedMapId: string
  [key: string]: unknown
}

export function bindLanEvents(
  deps: LanIndexManagerDeps,
  state: LanIndexState,
  bridge: LanBridgeLike,
  ctx: Record<string, unknown>
): void {
  const c = ctx as unknown as LanEventsCtx
  const {
    setOnlineStatus,
    showPanel,
    showLanAlert,
    connectBtn,
    roomCodeEl,
    hostBadge,
    startBtn,
    roomManageBtn,
    connectPanel,
    roomPanel,
    renderSlots,
    syncSlotsFromPlayers,
    initLanCharacterFromStorage,
    renderLanCarryItems,
    updateModeMapCardState,
    lanCarryItems,
    lanSlotConfig,
    mapCardLabel
  } = c
  let lanSelectedMapId = c.lanSelectedMapId

  bridge.on("ws:open", () => {
    setOnlineStatus("已连接", "connected")
    if (connectBtn) connectBtn.disabled = true
  })

  bridge.on("ws:close", (d: unknown) => {
    const data = d as { code: number }
    setOnlineStatus("连接断开 (code=" + data.code + ")", "error")
    if (connectBtn) connectBtn.disabled = false
    if (state.isLanMode && !state.settled) {
      const b = deps.getLanBridge()
      state.lanLastServerUrl = b?.ws ? b.ws.url : state.lanLastServerUrl
      state.lanLastRoomCode = b?.roomCode || state.lanLastRoomCode
      state.lanLastPlayerId = b?.playerId || state.lanLastPlayerId
      deps.writeLog("连接断开 (code=" + data.code + ")")
      onLanForeground(deps, state)
    }
  })

  bridge.on("ws:error", () => {
    setOnlineStatus("连接错误", "error")
    if (state.isLanMode && !state.settled) {
      deps.writeLog("连接错误，尝试重连...")
      onLanForeground(deps, state)
    }
  })

  bridge.on("room:created", (raw: unknown) => {
    const msg = raw as Record<string, unknown>
    log.info("room:created received", msg)
    showPanel(roomPanel)
    if (roomCodeEl) roomCodeEl.textContent = (msg.roomCode as string) ?? null
    if (hostBadge) hostBadge.classList.remove("hidden")
    if (startBtn) startBtn.classList.remove("hidden")
    if (roomManageBtn) roomManageBtn.classList.remove("hidden")
    syncSlotsFromPlayers([{ id: msg.playerId, name: msg.playerName, isHost: true }])
    initLanCharacterFromStorage()
    renderLanCarryItems()
    updateModeMapCardState(true)
    if (bridge && bridge.connected) {
      var carryIds = c.lanCarryItems.map(function (it: { id: string }) {
        return it.id
      })
      log.info("room:created sending lan:carry-items ids={0}", JSON.stringify(carryIds))
      bridge.send({
        type: "lan:carry-items",
        carryItems: carryIds
      })
    }
    var statusText = "房间 " + msg.roomCode + " 等待玩家加入"
    if (msg.visibility === "private" && msg.password) {
      statusText += " | 密钥: " + msg.password
    }
    setOnlineStatus(statusText, "connected")
  })

  bridge.on("room:joined", (raw: unknown) => {
    const msg = raw as Record<string, unknown>
    deps.writeLog(
      "加入房间 " +
        msg.roomCode +
        " | players=" +
        ((msg.players as unknown[]) || []).length +
        " | aiSlots=" +
        ((msg.aiSlots as unknown[]) || []).length +
        " | map=" +
        (msg.mapProfileId || "default")
    )
    showPanel(roomPanel)
    if (roomCodeEl) roomCodeEl.textContent = (msg.roomCode as string) ?? null
    if (hostBadge) hostBadge.classList.add("hidden")
    if (startBtn) startBtn.classList.add("hidden")
    if (roomManageBtn) roomManageBtn.classList.add("hidden")
    syncSlotsFromPlayers((msg.players as unknown[]) || [])
    if (msg.aiSlots && (msg.aiSlots as unknown[]).length > 0) {
      deps.writeLog("同步AI座位: " + JSON.stringify(msg.aiSlots))
      ;(msg.aiSlots as Array<{ name: string; llm: boolean }>).forEach((ai) => {
        const emptyIdx = lanSlotConfig.findIndex((s: LanSlotConfigItem) => s.type === "empty")
        if (emptyIdx >= 0) {
          lanSlotConfig[emptyIdx] = { type: "ai", name: ai.name, llm: ai.llm }
        }
      })
      renderSlots()
    }
    initLanCharacterFromStorage()
    renderLanCarryItems()
    updateModeMapCardState(false)
    if (msg.mapProfileId) {
      lanSelectedMapId = msg.mapProfileId as string
      deps.writeLog("同步地图: " + lanSelectedMapId)
      if (setSelectedProfileId) {
        setSelectedProfileId(lanSelectedMapId)
      }
      if (mapCardLabel) {
        var profile = getProfile && getProfile(lanSelectedMapId)
        mapCardLabel.textContent = profile ? profile.name : lanSelectedMapId
      }
    }
    if (bridge && bridge.connected) {
      var joinCarryIds = c.lanCarryItems.map(function (it: { id: string }) {
        return it.id
      })
      log.info("room:joined sending lan:carry-items ids={0}", JSON.stringify(joinCarryIds))
      bridge.send({
        type: "lan:carry-items",
        carryItems: joinCarryIds
      })
    }
    setOnlineStatus("房间 " + msg.roomCode + " 等待主机开始", "connected")
  })

  bridge.on("room:join-failed", (raw: unknown) => {
    const msg = raw as Record<string, unknown>
    showPanel(connectPanel)
    showLanAlert("加入失败", (msg.reason as string) || "无法加入房间")
    setOnlineStatus("加入失败: " + msg.reason, "error")
  })

  bridge.on("room:kicked", () => {
    showPanel(connectPanel)
    showLanAlert("被踢出", "你已被主机踢出房间")
    setOnlineStatus("你已被主机踢出", "error")
  })

  bridge.on("room:slot-state", (raw: unknown) => {
    const msg = raw as Record<string, unknown>
    if (!msg.slots) return
    ;(msg.slots as Array<{ type: string; name?: string; llm?: boolean }>).forEach((s, i) => {
      if (i < 4) {
        if (s.type === "ai") {
          lanSlotConfig[i] = { type: "ai", name: s.name, llm: s.llm }
        } else if (s.type === "empty") {
          lanSlotConfig[i] = { type: "empty" }
        }
      }
    })
    renderSlots()
  })

  bridge.on("lan:character-selected", (raw: unknown) => {
    const msg = raw as Record<string, unknown>
    var slotIdx = lanSlotConfig.findIndex((s: LanSlotConfigItem) => s.id === msg.playerId)
    if (slotIdx >= 0) {
      lanSlotConfig[slotIdx].characterId = msg.characterId as string
      renderSlots()
    }
  })

  bridge.on("lan:map-selected", (raw: unknown) => {
    const msg = raw as Record<string, unknown>
    lanSelectedMapId = (msg.mapProfileId as string) || "default"
    if (setSelectedProfileId) {
      setSelectedProfileId(lanSelectedMapId)
    }
    if (mapCardLabel) {
      var profile = getProfile && getProfile(lanSelectedMapId)
      mapCardLabel.textContent = profile ? profile.name : lanSelectedMapId
    }
  })

  bridge.on("lan:carry-items-update", (raw: unknown) => {
    const msg = raw as Record<string, unknown>
    log.debug("lan:carry-items-update playerId={0} carryItems={1}", msg.playerId, JSON.stringify(msg.carryItems))
    var slotIdx = lanSlotConfig.findIndex((s: LanSlotConfigItem) => s.id === msg.playerId)
    if (slotIdx >= 0) {
      lanSlotConfig[slotIdx].carryItems = (msg.carryItems as string[]) || []
      renderSlots()
    }
  })

  bridge.on("room:player-joined", (raw: unknown) => {
    const msg = raw as Record<string, unknown>
    syncSlotsFromPlayers((msg.players as unknown[]) || [])
  })

  bridge.on("room:player-left", (raw: unknown) => {
    const msg = raw as Record<string, unknown>
    syncSlotsFromPlayers((msg.players as unknown[]) || [])
    if (msg.isHost && !state.lanIsHost) {
      deps.stopRoundTimer()
      state.roundPaused = false
      deps.hideLanPauseOverlay()
      if (msg.canReconnect) {
        deps.writeLog("主机暂时断开，等待重连（" + Math.ceil(((msg.graceMs as number) || 30000) / 1000) + "秒）...")
      } else {
        deps.writeLog("主机已断开连接，游戏无法继续。")
      }
    }
  })

  bridge.on("room:host-left", (raw: unknown) => {
    const msg = raw as Record<string, unknown>
    deps.writeLog((msg.message as string) || "房主已离开房间，房间已解散")
    bridge.disconnect()
    showPanel(connectPanel)
    setOnlineStatus("房间已解散", "")
  })

  bridge.on("lan:room:return", (raw: unknown) => {
    const msg = raw as Record<string, unknown>
    log.debug("[fn-file] lan:room:return RECEIVED, players={0}, aiSlots={1}", (msg.players as unknown[] || []).length, (msg.aiSlots as unknown[] || []).length)
    deps.writeLog(
      "主机已返回房间 | players=" +
        ((msg.players as unknown[]) || []).length +
        " | aiSlots=" +
        ((msg.aiSlots as unknown[]) || []).length +
        " | map=" +
        (msg.mapProfileId || "default")
    )
    deps.enterLanRoom()
    if (msg.players) {
      c.syncSlotsFromPlayers(msg.players as unknown[], true)
    }
    if (msg.aiSlots && (msg.aiSlots as unknown[]).length > 0) {
      deps.writeLog("同步AI座位: " + JSON.stringify(msg.aiSlots))
      ;(msg.aiSlots as Array<{ name: string; llm: boolean }>).forEach((ai) => {
        const emptyIdx = lanSlotConfig.findIndex((s: LanSlotConfigItem) => s.type === "empty")
        if (emptyIdx >= 0) {
          lanSlotConfig[emptyIdx] = { type: "ai", name: ai.name, llm: ai.llm }
        }
      })
      renderSlots()
    }
    if (msg.mapProfileId) {
      lanSelectedMapId = msg.mapProfileId as string
      deps.writeLog("同步地图: " + lanSelectedMapId)
      if (setSelectedProfileId) {
        setSelectedProfileId(lanSelectedMapId)
      }
      if (mapCardLabel) {
        var profile = getProfile && getProfile(lanSelectedMapId)
        mapCardLabel.textContent = profile ? profile.name : lanSelectedMapId
      }
    }
  })

  bridge.on("room:player-reconnected", (raw: unknown) => {
    const msg = raw as Record<string, unknown>
    syncSlotsFromPlayers((msg.players as unknown[]) || [])
    deps.writeLog((msg.playerName as string) + " 已重新连接")
  })

  bridge.on("room:player-removed", (raw: unknown) => {
    const msg = raw as Record<string, unknown>
    syncSlotsFromPlayers((msg.players as unknown[]) || [])
    deps.writeLog((msg.playerName as string) + " 已离开（重连超时）")
  })

  bridge.on("room:reconnected", (raw: unknown) => {
    const msg = raw as Record<string, unknown>
    deps.writeLog("重连成功！")
    if (msg.roomState === "playing" && deps.getLanBridge()) {
      deps.getLanBridge()?.requestFullSync()
    }
  })

  bridge.on("room:reconnect-failed", (raw: unknown) => {
    const msg = raw as Record<string, unknown>
    deps.writeLog("重连失败: " + msg.reason)
  })

  bridge.on("full-sync-request", (raw: unknown) => {
    const msg = raw as Record<string, unknown>
    if (!state.lanIsHost) return
    if (!msg.playerId) return
    var syncData = lanBuildFullSyncData(deps, state, msg.playerId as string)
    const b = deps.getLanBridge()
    if (b) {
      b.sendFullSync(msg.playerId as string, syncData)
    }
  })

  bridge.on("full-sync", (raw: unknown) => {
    const msg = raw as Record<string, unknown>
    lanOnFullSync(deps, state, msg)
  })

  bridge.on("game:start-failed", (raw: unknown) => {
    const msg = raw as Record<string, unknown>
    deps.writeLog("游戏启动失败: " + ((msg.reason as string) || "未知原因"))
    showLanAlert("启动失败", (msg.reason as string) || "无法启动游戏，请检查人数配置")
  })

  bridge.on("game:init", (raw: unknown) => {
    const msg = raw as Record<string, unknown>
    state.isLanMode = true
    state.lanPlayers = (msg.players as LanPlayer[]) || []

    log.info(
      "game:init players={0} carryItems={1}",
      (state.lanPlayers || []).length,
      JSON.stringify(
        (state.lanPlayers || []).map(function (p: LanPlayer) {
          return { id: p.id, carryItems: p.carryItems }
        })
      )
    )
    state.lanIsHost = (msg.hostId as string) === bridge.playerId

    state.lanLastServerUrl = bridge.ws ? bridge.ws.url : null
    state.lanLastRoomCode = bridge.roomCode
    state.lanLastPlayerId = bridge.playerId

    const aiPlayersFromMsg = (msg.aiPlayers as Array<{ id: string; name: string; llm?: boolean }>) || []
    state.lanAiLlmEnabled = !!msg.aiLlmEnabled

    if (state.lanIsHost) {
      state.lanHostWallets = {}
      state.lanPlayers.forEach((p) => {
        state.lanHostWallets[p.id] = DEFAULT_START_MONEY
      })
      state.lanAiPlayers =
        aiPlayersFromMsg.length > 0
          ? aiPlayersFromMsg.map((ai) => ({ id: ai.id, name: ai.name, isAI: true, isHost: false, llm: ai.llm }))
          : []
      state.lanAiPlayers.forEach((ai) => {
        state.lanPlayers.push(ai as unknown as LanPlayer)
        state.lanHostWallets[ai.id] = DEFAULT_START_MONEY
      })
    } else {
      state.lanAiPlayers = aiPlayersFromMsg.map((ai) => ({
        id: ai.id,
        name: ai.name,
        isAI: true,
        isHost: false,
        llm: ai.llm
      }))
      state.lanAiPlayers.forEach((ai) => {
        state.lanPlayers.push(ai as unknown as LanPlayer)
      })
    }

    patchAppState({ appMode: "game", gameSource: "lan" })
    deps.exitLobby()
    startLanRun(deps, state)
  })

  bridge.on("round:start", (raw: unknown) => {
    const msg = raw as Record<string, unknown>
    if (!state.lanIsHost) {
      lanOnRoundStart(
        deps,
        state,
        msg as unknown as { round: number; currentBid?: number; ts?: number; roundSeconds?: number }
      )
    } else {
      if (msg.ts && msg.roundSeconds) {
        const elapsed = Math.round((Date.now() - (msg.ts as number)) / 1000)
        const corrected = (msg.roundSeconds as number) - elapsed
        if (corrected > 0 && corrected <= (msg.roundSeconds as number)) {
          state.roundTimeLeft = corrected
          deps.updateHud()
        }
      }
    }
  })

  bridge.on("round:bid-ack", () => {
    state.playerBidSubmitted = true
    if (state.lanMySlotId) {
      deps.setPlayerBidReady(state.lanMySlotId, true)
    }
    deps.writeLog("联机出价已确认")
  })

  bridge.on("bid:received", (raw: unknown) => {
    const msg = raw as Record<string, unknown>
    if (!msg.playerId) return
    if (state.lanIsHost) {
      state.lanHostBids[msg.playerId as string] = msg.bid as number
    }
    const slotId = state.lanIdToSlotId ? state.lanIdToSlotId[msg.playerId as string] : null
    if (slotId) {
      deps.setPlayerBidReady(slotId, true)
      deps.writeLog(((msg.playerName as string) || "玩家") + " 已提交出价")
    }
  })

  bridge.on("all-bids-in", () => {
    if (!state.lanIsHost) return
    lanOnAllBidsIn(deps, state).catch((e: Error) =>
      deps.writeLog("AI行动异常：" + (e && e.message ? e.message : String(e)))
    )
  })

  bridge.on("round:timeout", () => {
    if (state.lanIsHost) {
      lanOnRoundTimeout(deps, state).catch((e: Error) =>
        deps.writeLog("AI行动异常：" + (e && e.message ? e.message : String(e)))
      )
    }
  })

  bridge.on("round:result", (raw: unknown) => {
    const msg = raw as { bids?: Array<{ playerId: string; bid: number }> }
    lanOnRoundResult(deps, state, msg)
  })

  bridge.on("game:settle", (raw: unknown) => {
    const msg = raw as { winnerId: string; winnerBid: number; mode: string }
    lanOnSettle(deps, state, msg)
  })

  bridge.on("game:settle-final", (raw: unknown) => {
    const msg = raw as { wallets: Record<string, number> }
    lanOnSettleFinal(deps, state, msg)
  })

  bridge.on("game:restart-vote", (raw: unknown) => {
    const msg = raw as Record<string, unknown>
    deps.showLanRestartVoteDialog(msg.hostName as string)
  })

  bridge.on("game:restart-go", (raw: unknown) => {
    deps.removeLanRestartDialog()
    lanOnRestartGo(deps, state, raw as Parameters<typeof lanOnRestartGo>[2])
  })

  bridge.on("game:restart-cancelled", (raw: unknown) => {
    const msg = raw as Record<string, unknown>
    deps.writeLog((msg.decliner as string) + " 拒绝了重开请求")
    deps.showLanRestartDeclinedDialog(msg.decliner as string)
  })

  bridge.on("lan:pause:state", (raw: unknown) => {
    const msg = raw as Record<string, unknown>
    state.roundPaused = !!msg.paused
    if (state.roundPaused) {
      state._pauseSnapshotTimeLeft = state.roundTimeLeft
    } else {
      if (msg.roundTimeLeft != null && (msg.roundTimeLeft as number) > 0 && msg.ts) {
        var latency = (Date.now() - (msg.ts as number)) / 1000
        state.roundTimeLeft = Math.max(1, Math.round((msg.roundTimeLeft as number) - latency))
      } else if (msg.roundTimeLeft != null && (msg.roundTimeLeft as number) > 0) {
        state.roundTimeLeft = msg.roundTimeLeft as number
      } else if (state._pauseSnapshotTimeLeft != null) {
        state.roundTimeLeft = state._pauseSnapshotTimeLeft
      }
      state._pauseSnapshotTimeLeft = null
    }
    deps.syncPauseButton()
    deps.updateHud()
    if (state.roundPaused) {
      deps.showLanPauseOverlay()
    } else {
      deps.hideLanPauseOverlay()
    }
  })

  bridge.on("game:warehouse-sync", (raw: unknown) => {
    const msg = raw as Record<string, unknown>
    if (state.lanIsHost) return
    lanRestoreWarehouseFromSync(deps, state, msg)
  })

  bridge.on("ai-bids-ready", (raw: unknown) => {
    const msg = raw as Record<string, unknown>
    if (!state.lanIdToSlotId) return
    ;((msg.aiPlayerIds as string[]) || []).forEach((aiId: string) => {
      const slotId = state.lanIdToSlotId[aiId]
      if (slotId) deps.setPlayerBidReady(slotId, true)
    })
  })

  bridge.on("ai-item-use", (raw: unknown) => {
    const msg = raw as Record<string, unknown>
    if (!state.lanIdToSlotId || !msg.aiPlayerId) return
    const slotId = state.lanIdToSlotId[msg.aiPlayerId as string]
    if (slotId) {
      deps.writeLog(((msg.aiPlayerName as string) || "AI") + " 使用了 " + ((msg.itemName as string) || "道具"))
      if (msg.actionId) {
        deps.recordPlayerUsage(slotId, msg.actionId as string)
        const usageArr = state.playerUsageHistory[slotId]
        if (usageArr && usageArr.length > 0) {
          const lastEntry = usageArr[usageArr.length - 1]
          if (lastEntry.round === state.round && !lastEntry.actions.includes(msg.actionId as string)) {
            lastEntry.actions.push(msg.actionId as string)
          }
        }
        deps.refreshPlayerHistoryUI()
      }
    }
  })

  bridge.on("player-action", (raw: unknown) => {
    const msg = raw as Record<string, unknown>
    if (!state.lanIdToSlotId || !msg.playerId) return
    const slotId = state.lanIdToSlotId[msg.playerId as string]
    if (slotId) {
      deps.writeLog(((msg.playerName as string) || "玩家") + " 使用了 " + ((msg.itemName as string) || "道具"))
      if (msg.actionId) {
        deps.recordPlayerUsage(slotId, msg.actionId as string)
        const usageArr = state.playerUsageHistory[slotId]
        if (usageArr && usageArr.length > 0) {
          const lastEntry = usageArr[usageArr.length - 1]
          if (lastEntry.round === state.round && !lastEntry.actions.includes(msg.actionId as string)) {
            lastEntry.actions.push(msg.actionId as string)
          }
        }
        deps.refreshPlayerHistoryUI()
      }
    }
  })

  bridge.on("public-info", (raw: unknown) => {
    const msg = raw as Record<string, unknown>
    deps.addPublicInfoEntry({
      source: (msg.source as string) || "未知",
      text: (msg.text as string) || ""
    })
  })
}

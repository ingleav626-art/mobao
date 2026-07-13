/**
 * @file lan-index-manager/sync-fns.ts
 * @module lan-index-manager/sync-fns
 * @description 联机数据同步纯函数。管理全量状态同步、仓库恢复、断线重连、
 *              暂停/后台/前台处理。所有 this. 引用替换为 deps/state 参数。
 */
import type { LanIndexManagerDeps, LanIndexState } from "../lan-index-manager"
import { GRID_ROWS, GRID_COLS } from "../../core/constants"
import { GAME_SETTINGS } from "../../core/settings"
import { getSelectedProfileId, setSelectedProfileId } from "../../data/map-profiles"
import { CHARACTERS } from "../../data/characters"
import { QUALITY_CONFIG } from "../../data/artifacts"
import { pickRandomPublicEvent } from "../../data/public-events"
import type { QualityLevel, ArtifactView, Artifact } from "../../../../types/game"

export function lanBuildFullSyncData(
  deps: LanIndexManagerDeps,
  state: LanIndexState,
  targetPlayerId: string,
): Record<string, unknown> {
  var wallets: Record<string, number> = {}
  state.players.forEach((p) => {
    var lanId = state.slotIdToLanId[p.id]
    if (lanId) {
      if (state.lanIsHost && state.lanHostWallets[lanId] !== undefined) {
        wallets[lanId] = state.lanHostWallets[lanId]
      } else if (p.money !== undefined) {
        wallets[lanId] = p.money
      }
    }
  })

  var bids: Record<string, number> = {}
  if (state.lanIsHost) {
    for (var aid in state.lanHostBids) {
      if (state.lanHostBids[aid] !== undefined) {
        bids[aid] = state.lanHostBids[aid]
      }
    }
  }

  var playerCharacters: Record<string, string> = {}
  state.players.forEach((p) => {
    var lanId = state.slotIdToLanId[p.id]
    if (lanId && p.characterId) {
      playerCharacters[lanId] = p.characterId
    }
  })

  return {
    playerId: targetPlayerId,
    round: state.round,
    maxRounds: GAME_SETTINGS.maxRounds,
    currentBid: state.currentBid,
    warehouseTrueValue: state.warehouseTrueValue,
    roundTimeLeft: state.roundTimeLeft,
    isPaused: state.roundPaused,
    settled: state.settled,
    playerBidSubmitted: state.playerBidSubmitted,
    playerRoundBid: state.playerRoundBid,
    wallets: wallets,
    bids: bids,
    playerCharacters: playerCharacters,
    mapProfileId: getSelectedProfileId(),
    warehouse: deps.buildWarehouseSnapshotForSync(),
    publicInfoEntries: state.publicInfoEntries || [],
  }
}

export function lanOnFullSync(deps: LanIndexManagerDeps, state: LanIndexState, msg: Record<string, unknown>): void {
  if (state.lanIsHost) return
  deps.writeLog("收到全量状态同步")

  if (msg.warehouse) {
    lanRestoreWarehouseFromSync(deps, state, msg)
  }

  if (msg.round != null) {
    state.round = msg.round as number
  }
  if (msg.maxRounds != null) {
    GAME_SETTINGS.maxRounds = msg.maxRounds as number
  }
  if (msg.currentBid != null) {
    state.currentBid = msg.currentBid as number
  }
  if (msg.warehouseTrueValue != null) {
    state.warehouseTrueValue = msg.warehouseTrueValue as number
  }

  if (msg.roundTimeLeft != null) {
    state.roundTimeLeft = msg.roundTimeLeft as number
  }
  if (msg.isPaused != null) {
    state.roundPaused = msg.isPaused as boolean
    if (msg.isPaused) {
      deps.showLanPauseOverlay()
    } else {
      deps.hideLanPauseOverlay()
    }
  }
  if (msg.settled != null) {
    state.settled = msg.settled as boolean
  }
  if (msg.playerBidSubmitted != null) {
    state.playerBidSubmitted = msg.playerBidSubmitted as boolean
  }
  if (msg.playerRoundBid != null) {
    state.playerRoundBid = msg.playerRoundBid as number
  }

  if (msg.wallets) {
    var walletsMap = msg.wallets as Record<string, number>
    for (var lanId in walletsMap) {
      var slotId = state.lanIdToSlotId[lanId]
      if (slotId) {
        var p = state.players.find(function (pl) {
          return pl.id === slotId
        })
        if (p) p.money = walletsMap[lanId]
      }
    }
  }

  if (msg.bids) {
    var bidsMap = msg.bids as Record<string, number>
    for (var bidLanId in bidsMap) {
      var bidSlotId = state.lanIdToSlotId[bidLanId]
      if (bidSlotId) {
        deps.setPlayerBidReady(bidSlotId, true)
      }
    }
  }

  if (msg.playerCharacters) {
    var charactersMap = msg.playerCharacters as Record<string, string>
    for (var charLanId in charactersMap) {
      var charSlotId = state.lanIdToSlotId[charLanId]
      if (charSlotId) {
        var cp = state.players.find(function (pl) {
          return pl.id === charSlotId
        })
        if (cp) {
          cp.characterId = charactersMap[charLanId]
          if (CHARACTERS) {
            var cpRef = cp
            var charInfo = CHARACTERS.find(function (c) {
              return c.id === cpRef.characterId
            })
            if (charInfo) {
              cp.characterName = charInfo.name
              cp.avatar = charInfo.avatar || charInfo.name.substring(0, 2)
            }
          }
        }
      }
    }
  }

  if (msg.mapProfileId) {
    var lanSelectedMapId = msg.mapProfileId as string
    if (setSelectedProfileId) {
      setSelectedProfileId(lanSelectedMapId)
    }
  }

  if (msg.publicInfoEntries) {
    state.publicInfoEntries = msg.publicInfoEntries as typeof state.publicInfoEntries
    deps.renderPublicInfoPanel()
  }

  deps.initPlayersUI()
  deps.updateHud()
  deps.refreshRevealScrollHints()
}

export function lanRestoreWarehouseFromSync(
  deps: LanIndexManagerDeps,
  state: LanIndexState,
  msg: Record<string, unknown>,
): void {
  const warehouseData = (msg.warehouse || []) as Record<string, unknown>[]
  if (warehouseData.length === 0) return

  if (state.itemLayer) {
    state.itemLayer.destroy(true)
  }
  state.itemLayer = null
  state.items = []
  state.warehouseTrueValue = 0
  state.revealedCells = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(false))

  warehouseData.forEach((saved, idx) => {
    const qualityKey = saved.qualityKey && QUALITY_CONFIG[saved.qualityKey as string] ? (saved.qualityKey as string) : "normal"
    const quality = QUALITY_CONFIG[qualityKey] || { label: "良品", color: 0x2f78ff, glow: 0x9ec0ff, weight: 1 }
    const safeW = Math.max(1, Math.round(Number(saved.w) || 1))
    const safeH = Math.max(1, Math.round(Number(saved.h) || 1))
    const safeX = Math.max(0, Math.round(Number(saved.x) || 0))
    const safeY = Math.max(0, Math.round(Number(saved.y) || 0))
    const trueValue = Math.max(0, Math.round(Number(saved.trueValue) || 0))

    const item = {
      id: String(saved.id || ("sync-item-" + idx)),
      key: (saved.key as string) || "synced",
      majorCategory: (saved.majorCategory as string) || "未知",
      category: (saved.category as string) || "未知",
      name: (saved.name as string) || ("藏品" + (idx + 1)),
      basePrice: trueValue,
      trueValue,
      qualityKey: qualityKey as QualityLevel,
      quality,
      w: safeW,
      h: safeH,
      x: safeX,
      y: safeY,
      revealed: { outline: false, qualityCell: null, exact: false },
      expectedPrice: trueValue,
      previewSizeTag: safeW + "x" + safeH,
      view: {} as ArtifactView,
    }

    item as Artifact
    state.items.push(item as Artifact)
    state.warehouseTrueValue += item.trueValue
  })

  deps.rebuildWarehouseCellIndex()
  state.warehouseTrueValue = (msg.warehouseTrueValue as number) || state.warehouseTrueValue
  state.currentBid = (msg.currentBid as number) || state.currentBid
  state.aiMaxBid = (msg.aiMaxBid as number) || state.aiMaxBid

  if (pickRandomPublicEvent && state.items.length > 0) {
    state.currentPublicEvent = pickRandomPublicEvent(state.items, GRID_COLS, GRID_ROWS)
    state.publicInfoEntries = [
      {
        source: state.currentPublicEvent.category,
        text: state.currentPublicEvent.text,
      },
    ]
  }
}

export function lanAttemptReconnect(deps: LanIndexManagerDeps, state: LanIndexState): void {
  if (!state.lanLastServerUrl || !state.lanLastRoomCode || !state.lanLastPlayerId) {
    deps.writeLog("重连信息缺失，请手动重新连接")
    state.lanReconnecting = false
    return
  }
  if (state.lanReconnectAttempts >= state.lanMaxReconnectAttempts) {
    deps.writeLog("重连失败次数过多，请手动重新连接")
    state.lanReconnecting = false
    return
  }
  state.lanReconnectAttempts++
  var delay = Math.min(1000 * Math.pow(2, state.lanReconnectAttempts - 1), 8000)
  deps.writeLog(
    "重连尝试 " + state.lanReconnectAttempts + "/" + state.lanMaxReconnectAttempts + " (" + delay + "ms后)",
  )
  const lastServerUrl = state.lanLastServerUrl
  const lastRoomCode = state.lanLastRoomCode
  const lastPlayerId = state.lanLastPlayerId
  setTimeout(() => {
    if (!state.lanReconnecting) return
    const bridge = deps.getLanBridge()
    if (!bridge) return
    bridge
      .reconnect(lastServerUrl, lastRoomCode, lastPlayerId)
      .then(() => {
        state.lanReconnecting = false
        state.lanReconnectAttempts = 0
        deps.writeLog("重连成功！")
        if (!state.lanIsHost && bridge) {
          bridge.requestFullSync()
        }
      })
      .catch((e: Error) => {
        deps.writeLog("重连失败: " + (e.message || "未知错误"))
        lanAttemptReconnect(deps, state)
      })
  }, delay)
}

export function toggleLanPause(deps: LanIndexManagerDeps, state: LanIndexState, pause: boolean): void {
  if (!state.isLanMode || !state.lanIsHost) return
  if (state.settled || state.roundResolving) return

  state.roundPaused = pause
  if (state.roundPaused) {
    state._pauseSnapshotTimeLeft = state.roundTimeLeft
  } else if (state._pauseSnapshotTimeLeft != null) {
    state.roundTimeLeft = state._pauseSnapshotTimeLeft
    state._pauseSnapshotTimeLeft = null
  }
  deps.syncPauseButton()
  deps.updateHud()
  if (state.roundPaused) {
    deps.showLanPauseOverlay()
  } else {
    deps.hideLanPauseOverlay()
  }
  const bridge = deps.getLanBridge()
  if (bridge) {
    bridge.togglePause(state.roundPaused, state.roundTimeLeft)
  }
}

export function onLanBackground(deps: LanIndexManagerDeps, state: LanIndexState): void {
  const bridge = deps.getLanBridge()
  if (!state.isLanMode || !bridge || !bridge.connected) return
  state.lanLastServerUrl = bridge.ws ? bridge.ws.url : null
  state.lanLastRoomCode = bridge.roomCode
  state.lanLastPlayerId = bridge.playerId
  if (state.lanIsHost && !state.roundPaused && !state.settled) {
    toggleLanPause(deps, state, true)
    deps.writeLog("游戏进入后台，已自动暂停")
  }
}

export function onLanForeground(deps: LanIndexManagerDeps, state: LanIndexState): void {
  const bridge = deps.getLanBridge()
  if (!state.isLanMode || !bridge) return
  if (state.settled || state.settlementRevealRunning) return
  if (bridge.connected) {
    if (!state.lanIsHost) {
      bridge.requestFullSync()
    }
    return
  }
  state.lanReconnecting = true
  state.lanReconnectAttempts = 0
  deps.writeLog("连接断开，正在尝试重连...")
  lanAttemptReconnect(deps, state)
}
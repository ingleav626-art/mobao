/**
 * @file lan/sync.js
 * @module lan/sync
 * @description 联机数据同步 Mixin。管理全量状态同步、仓库恢复、断线重连、
 *              暂停/后台/前台处理。
 *
 * @requires MobaoConstants - 常量（DEFAULT_START_MONEY, GRID_ROWS, GRID_COLS）
 * @requires MobaoSettings  - 游戏设置（GAME_SETTINGS）
 *
 * @exports LanSyncMixin
 */
import { GRID_ROWS, GRID_COLS } from "../core/constants"
import { GAME_SETTINGS } from "../core/settings"
import { getSelectedProfileId, setSelectedProfileId } from "../data/map-profiles"
import { CHARACTERS } from "../data/characters"
import { QUALITY_CONFIG } from "../data/artifacts"
import { pickRandomPublicEvent } from "../data/public-events"
import type { WarehouseSceneThis } from "../../../types/warehouse-scene-this"
import type { QualityLevel, ArtifactView, Artifact } from "../../../types/game"

export const LanSyncMixin: ThisType<WarehouseSceneThis> = {
  lanBuildFullSyncData(targetPlayerId: string) {
    var wallets: Record<string, number> = {}
    this.players.forEach((p) => {
      var lanId = this.slotIdToLanId[p.id]
      if (lanId) {
        if (this.lanIsHost && this.lanHostWallets[lanId] !== undefined) {
          wallets[lanId] = this.lanHostWallets[lanId]
        } else if (p.money !== undefined) {
          wallets[lanId] = p.money
        }
      }
    })

    var bids: Record<string, number> = {}
    if (this.lanIsHost) {
      for (var aid in this.lanHostBids) {
        if (this.lanHostBids[aid] !== undefined) {
          bids[aid] = this.lanHostBids[aid]
        }
      }
    }

    var playerCharacters: Record<string, string> = {}
    this.players.forEach((p) => {
      var lanId = this.slotIdToLanId[p.id]
      if (lanId && p.characterId) {
        playerCharacters[lanId] = p.characterId
      }
    })

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
      playerCharacters: playerCharacters,
      mapProfileId: getSelectedProfileId(),
      warehouse: this.buildWarehouseSnapshotForSync(),
      publicInfoEntries: this.publicInfoEntries || []
    }
  },

  lanOnFullSync(msg: Record<string, unknown>) {
    if (this.lanIsHost) return
    this.writeLog("收到全量状态同步")

    if (msg.warehouse) {
      this.lanRestoreWarehouseFromSync({
        warehouse: msg.warehouse,
        warehouseTrueValue: msg.warehouseTrueValue || 0,
        currentBid: msg.currentBid || 0,
        aiMaxBid: msg.aiMaxBid || 0
      })
    }

    if (msg.round != null) {
      this.round = msg.round as number
    }
    if (msg.maxRounds != null) {
      GAME_SETTINGS.maxRounds = msg.maxRounds as number
    }
    if (msg.currentBid != null) {
      this.currentBid = msg.currentBid as number
    }
    if (msg.warehouseTrueValue != null) {
      this.warehouseTrueValue = msg.warehouseTrueValue as number
    }

    if (msg.roundTimeLeft != null) {
      this.roundTimeLeft = msg.roundTimeLeft as number
    }
    if (msg.isPaused != null) {
      this.roundPaused = msg.isPaused as boolean
      if (msg.isPaused) {
        this.showLanPauseOverlay()
      } else {
        this.hideLanPauseOverlay()
      }
    }
    if (msg.settled != null) {
      this.settled = msg.settled as boolean
    }
    if (msg.playerBidSubmitted != null) {
      this.playerBidSubmitted = msg.playerBidSubmitted as boolean
    }
    if (msg.playerRoundBid != null) {
      this.playerRoundBid = msg.playerRoundBid as number
    }

    if (msg.wallets) {
      var walletsMap = msg.wallets as Record<string, number>
      for (var lanId in walletsMap) {
        var slotId = this.lanIdToSlotId[lanId]
        if (slotId) {
          var p = this.players.find(function (pl) {
            return pl.id === slotId
          })
          if (p) p.money = walletsMap[lanId]
        }
      }
    }

    if (msg.bids) {
      var bidsMap = msg.bids as Record<string, number>
      for (var bidLanId in bidsMap) {
        var bidSlotId = this.lanIdToSlotId[bidLanId]
        if (bidSlotId) {
          this.setPlayerBidReady(bidSlotId, true)
        }
      }
    }

    if (msg.playerCharacters) {
      var charactersMap = msg.playerCharacters as Record<string, string>
      for (var charLanId in charactersMap) {
        var charSlotId = this.lanIdToSlotId[charLanId]
        if (charSlotId) {
          var cp = this.players.find(function (pl) {
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
      this.publicInfoEntries = msg.publicInfoEntries as typeof this.publicInfoEntries
      this.renderPublicInfoPanel()
    }

    this.initPlayersUI()
    this.updateHud()
    this.refreshRevealScrollHints()
  },

  lanRestoreWarehouseFromSync(msg: Record<string, unknown>) {
    const warehouseData = (msg.warehouse || []) as Record<string, unknown>[]
    if (warehouseData.length === 0) return

    if (this.itemLayer) {
      this.itemLayer.destroy(true)
    }
    this.itemLayer = this.add.container(0, 0)
    this.items = []
    this.warehouseTrueValue = 0
    this.revealedCells = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(false))

    const qualityConfig = QUALITY_CONFIG
    warehouseData.forEach((saved, idx) => {
      const qualityKey =
        saved.qualityKey && qualityConfig[saved.qualityKey as string] ? (saved.qualityKey as string) : "normal"
      const quality = qualityConfig[qualityKey] || { label: "良品", color: 0x2f78ff, glow: 0x9ec0ff, weight: 1 }
      const safeW = Math.max(1, Math.round(Number(saved.w) || 1))
      const safeH = Math.max(1, Math.round(Number(saved.h) || 1))
      const safeX = Math.max(0, Math.round(Number(saved.x) || 0))
      const safeY = Math.max(0, Math.round(Number(saved.y) || 0))
      const trueValue = Math.max(0, Math.round(Number(saved.trueValue) || 0))

      const item = {
        id: String(saved.id || `sync-item-${idx}`),
        key: (saved.key as string) || "synced",
        majorCategory: (saved.majorCategory as string) || "未知",
        category: (saved.category as string) || "未知",
        name: (saved.name as string) || `藏品${idx + 1}`,
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
        previewSizeTag: `${safeW}x${safeH}`,
        view: {} as ArtifactView
      }

      this.renderItem(item as Artifact)
      this.items.push(item as Artifact)
      this.warehouseTrueValue += item.trueValue
    })

    this.rebuildWarehouseCellIndex()
    this.warehouseTrueValue = (msg.warehouseTrueValue as number) || this.warehouseTrueValue
    this.currentBid = (msg.currentBid as number) || this.currentBid
    this.aiMaxBid = (msg.aiMaxBid as number) || this.aiMaxBid

    if (pickRandomPublicEvent && this.items.length > 0) {
      this.currentPublicEvent = pickRandomPublicEvent(this.items, GRID_COLS, GRID_ROWS)
      this.publicInfoEntries = [
        {
          source: this.currentPublicEvent.category,
          text: this.currentPublicEvent.text
        }
      ]
    }
  },

  lanAttemptReconnect() {
    if (!this.lanLastServerUrl || !this.lanLastRoomCode || !this.lanLastPlayerId) {
      this.writeLog("重连信息缺失，请手动重新连接")
      this.lanReconnecting = false
      return
    }
    if (this.lanReconnectAttempts >= this.lanMaxReconnectAttempts) {
      this.writeLog("重连失败次数过多，请手动重新连接")
      this.lanReconnecting = false
      return
    }
    this.lanReconnectAttempts++
    var delay = Math.min(1000 * Math.pow(2, this.lanReconnectAttempts - 1), 8000)
    this.writeLog("重连尝试 " + this.lanReconnectAttempts + "/" + this.lanMaxReconnectAttempts + " (" + delay + "ms后)")
    const lastServerUrl = this.lanLastServerUrl
    const lastRoomCode = this.lanLastRoomCode
    const lastPlayerId = this.lanLastPlayerId
    setTimeout(() => {
      if (!this.lanReconnecting || !this.lanBridge) return
      this.lanBridge
        .reconnect(lastServerUrl, lastRoomCode, lastPlayerId)
        .then(() => {
          this.lanReconnecting = false
          this.lanReconnectAttempts = 0
          this.writeLog("重连成功！")
          if (!this.lanIsHost && this.lanBridge) {
            this.lanBridge.requestFullSync()
          }
        })
        .catch((e) => {
          this.writeLog("重连失败: " + (e.message || "未知错误"))
          this.lanAttemptReconnect()
        })
    }, delay)
  },

  toggleLanPause(pause: boolean) {
    if (!this.isLanMode || !this.lanIsHost) return
    if (this.settled || this.roundResolving) return

    this.roundPaused = pause
    if (this.roundPaused) {
      this._pauseSnapshotTimeLeft = this.roundTimeLeft
    } else if (this._pauseSnapshotTimeLeft != null) {
      this.roundTimeLeft = this._pauseSnapshotTimeLeft
      this._pauseSnapshotTimeLeft = null
    }
    this.roundManager.syncPauseButton()
    this.updateHud()
    if (this.roundPaused) {
      this.showLanPauseOverlay()
    } else {
      this.hideLanPauseOverlay()
    }
    if (this.lanBridge) {
      this.lanBridge.togglePause(this.roundPaused, this.roundTimeLeft)
    }
  },

  onLanBackground() {
    if (!this.isLanMode || !this.lanBridge || !this.lanBridge.connected) return
    this.lanLastServerUrl = this.lanBridge.ws ? this.lanBridge.ws.url : null
    this.lanLastRoomCode = this.lanBridge.roomCode
    this.lanLastPlayerId = this.lanBridge.playerId
    if (this.lanIsHost && !this.roundPaused && !this.settled) {
      this.toggleLanPause(true)
      this.writeLog("游戏进入后台，已自动暂停")
    }
  },

  onLanForeground() {
    if (!this.isLanMode || !this.lanBridge) return
    if (this.settled || this.settlementRevealRunning) return
    if (this.lanBridge.connected) {
      if (!this.lanIsHost) {
        this.lanBridge.requestFullSync()
      }
      return
    }
    this.lanReconnecting = true
    this.lanReconnectAttempts = 0
    this.writeLog("连接断开，正在尝试重连...")
    this.lanAttemptReconnect()
  }
}

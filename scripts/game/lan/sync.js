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
const { DEFAULT_START_MONEY, GRID_ROWS, GRID_COLS } = window.MobaoConstants
const { GAME_SETTINGS } = window.MobaoSettings

export const LanSyncMixin = {
  lanBuildFullSyncData(targetPlayerId) {
    var wallets = {}
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

    var bids = {}
    if (this.lanIsHost) {
      for (var aid in this.lanHostBids) {
        if (this.lanHostBids[aid] !== undefined) {
          bids[aid] = this.lanHostBids[aid]
        }
      }
    }

    var playerCharacters = {}
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
      mapProfileId: window.MobaoMapProfiles ? MobaoMapProfiles.getSelectedProfileId() : "default",
      warehouse: this.buildWarehouseSnapshotForSync(),
      publicInfoEntries: this.publicInfoEntries || []
    }
  },

  lanOnFullSync(msg) {
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
      this.round = msg.round
    }
    if (msg.maxRounds != null) {
      GAME_SETTINGS.maxRounds = msg.maxRounds
    }
    if (msg.currentBid != null) {
      this.currentBid = msg.currentBid
    }
    if (msg.warehouseTrueValue != null) {
      this.warehouseTrueValue = msg.warehouseTrueValue
    }

    if (msg.roundTimeLeft != null) {
      this.roundTimeLeft = msg.roundTimeLeft
    }
    if (msg.isPaused != null) {
      this.roundPaused = msg.isPaused
      if (msg.isPaused) {
        this.showLanPauseOverlay()
      } else {
        this.hideLanPauseOverlay()
      }
    }
    if (msg.settled != null) {
      this.settled = msg.settled
    }
    if (msg.playerBidSubmitted != null) {
      this.playerBidSubmitted = msg.playerBidSubmitted
    }
    if (msg.playerRoundBid != null) {
      this.playerRoundBid = msg.playerRoundBid
    }

    if (msg.wallets) {
      for (var lanId in msg.wallets) {
        var slotId = this.lanIdToSlotId[lanId]
        if (slotId) {
          var p = this.players.find(function (pl) {
            return pl.id === slotId
          })
          if (p) p.money = msg.wallets[lanId]
        }
      }
    }

    if (msg.bids) {
      for (var bidLanId in msg.bids) {
        var bidSlotId = this.lanIdToSlotId[bidLanId]
        if (bidSlotId) {
          this.setPlayerBidReady(bidSlotId, true)
        }
      }
    }

    if (msg.playerCharacters) {
      for (var charLanId in msg.playerCharacters) {
        var charSlotId = this.lanIdToSlotId[charLanId]
        if (charSlotId) {
          var cp = this.players.find(function (pl) {
            return pl.id === charSlotId
          })
          if (cp) {
            cp.characterId = msg.playerCharacters[charLanId]
            if (window.CharacterData && window.CharacterData.CHARACTERS) {
              var charInfo = CharacterData.CHARACTERS.find(function (c) {
                return c.id === cp.characterId
              })
              if (charInfo) {
                cp.characterName = charInfo.name
                cp.avatar = charInfo.avatarLabel || charInfo.name.substring(0, 2)
              }
            }
          }
        }
      }
    }

    if (msg.mapProfileId) {
      lanSelectedMapId = msg.mapProfileId
      if (window.MobaoMapProfiles) {
        MobaoMapProfiles.setSelectedProfileId(lanSelectedMapId)
      }
    }

    if (msg.publicInfoEntries) {
      this.publicInfoEntries = msg.publicInfoEntries
      this.renderPublicInfoPanel()
    }

    this.initPlayersUI()
    this.updateHud()
    this.refreshRevealScrollHints()
  },

  lanRestoreWarehouseFromSync(msg) {
    const warehouseData = msg.warehouse || []
    if (warehouseData.length === 0) return

    if (this.itemLayer) {
      this.itemLayer.destroy(true)
    }
    this.itemLayer = this.add.container(0, 0)
    this.items = []
    this.warehouseTrueValue = 0
    this.revealedCells = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(false))

    const qualityConfig = (window.ArtifactData && window.ArtifactData.QUALITY_CONFIG) || {}
    warehouseData.forEach((saved, idx) => {
      const qualityKey = saved.qualityKey && qualityConfig[saved.qualityKey] ? saved.qualityKey : "normal"
      const quality = qualityConfig[qualityKey] || { label: "良品", color: 0x2f78ff, glow: 0x9ec0ff }
      const safeW = Math.max(1, Math.round(Number(saved.w) || 1))
      const safeH = Math.max(1, Math.round(Number(saved.h) || 1))
      const safeX = Math.max(0, Math.round(Number(saved.x) || 0))
      const safeY = Math.max(0, Math.round(Number(saved.y) || 0))
      const trueValue = Math.max(0, Math.round(Number(saved.trueValue) || 0))

      const item = {
        id: String(saved.id || `sync-item-${idx}`),
        key: saved.key || "synced",
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
        revealed: { outline: false, qualityCell: null, exact: false }
      }

      this.renderItem(item)
      this.items.push(item)
      this.warehouseTrueValue += item.trueValue
    })

    this.rebuildWarehouseCellIndex()
    this.warehouseTrueValue = msg.warehouseTrueValue || this.warehouseTrueValue
    this.currentBid = msg.currentBid || this.currentBid
    this.aiMaxBid = msg.aiMaxBid || this.aiMaxBid

    if (window.PublicEventSystem && this.items.length > 0) {
      this.currentPublicEvent = window.PublicEventSystem.pickRandomPublicEvent(this.items, GRID_COLS, GRID_ROWS)
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
    this.writeLog(
      "重连尝试 " + this.lanReconnectAttempts + "/" + this.lanMaxReconnectAttempts + " (" + delay + "ms后)"
    )
    setTimeout(() => {
      if (!this.lanReconnecting) return
      this.lanBridge
        .reconnect(this.lanLastServerUrl, this.lanLastRoomCode, this.lanLastPlayerId)
        .then(() => {
          this.lanReconnecting = false
          this.lanReconnectAttempts = 0
          this.writeLog("重连成功！")
          if (!this.lanIsHost) {
            this.lanBridge.requestFullSync()
          }
        })
        .catch((e) => {
          this.writeLog("重连失败: " + (e.message || "未知错误"))
          this.lanAttemptReconnect()
        })
    }, delay)
  },

  toggleLanPause(pause) {
    if (!this.isLanMode || !this.lanIsHost) return
    if (this.settled || this.roundResolving) return

    this.roundPaused = pause
    if (this.roundPaused) {
      this._pauseSnapshotTimeLeft = this.roundTimeLeft
    } else if (this._pauseSnapshotTimeLeft != null) {
      this.roundTimeLeft = this._pauseSnapshotTimeLeft
      this._pauseSnapshotTimeLeft = null
    }
    this.syncPauseButton()
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
  },

  tryAutoReconnect(playerId, roomCode, playerName, isHost) {
    const bridge = this.lanBridge
    const $ = (id) => document.getElementById(id)
    const connectPanel = $("lobbyOnlineConnect")
    const roomPanel = $("lobbyOnlineRoom")

    this.writeLog(`尝试自动重连 | room=${roomCode} | player=${playerId}`)

    // 显示重连提示
    if (connectPanel) connectPanel.classList.add("hidden")
    if (roomPanel) roomPanel.classList.remove("hidden")
    this.setOnlineStatus("正在重连...", "connecting")

    bridge
      .reconnect("ws://localhost:9720", roomCode, playerId)
      .then((msg) => {
        this.writeLog(`重连成功 | room=${msg.roomCode} | state=${msg.roomState}`)
        // 清除重连失败标记
        localStorage.removeItem("mobao_lan_reconnect_failed")
        this.isLanMode = true
        this.lanIsHost = msg.isHost
        this.lanPlayers = msg.players || []

        // 根据房间状态恢复界面
        if (msg.roomState === "waiting") {
          // 房间等待状态，恢复房间界面
          this.enterLanRoom()
          this.setOnlineStatus("已重连到房间 " + msg.roomCode, "connected")
        } else if (msg.roomState === "playing") {
          // 游戏进行中，恢复游戏界面
          this.writeLog("游戏进行中，准备恢复游戏场景")
          // 退出房间界面
          this.exitLanRoom()
          // 进入游戏场景
          MobaoAppState.patch({ appMode: "game", gameSource: "lan" })
          this.startLanRun()
          this.setOnlineStatus("已重连到游戏", "connected")
          // 请求完整同步
          bridge.requestFullSync()
        }
      })
      .catch((err) => {
        this.writeLog(`重连失败 | ${err.message}`)
        // 清除 localStorage
        localStorage.removeItem("mobao_lan_player_id")
        localStorage.removeItem("mobao_lan_room_code")
        localStorage.removeItem("mobao_lan_player_name")
        localStorage.removeItem("mobao_lan_is_host")
        // 设置重连失败标记，防止反复重连
        localStorage.setItem("mobao_lan_reconnect_failed", "true")

        // 显示正常界面
        if (connectPanel) connectPanel.classList.remove("hidden")
        if (roomPanel) roomPanel.classList.add("hidden")
        this.setOnlineStatus("重连失败: " + err.message, "error")
      })
  }
}
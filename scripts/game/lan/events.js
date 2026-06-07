/**
 * @file lan/events.js
 * @module lan/events
 * @description 联机 WebSocket 事件绑定 Mixin。管理所有 bridge.on() 事件监听器，
 *              包括房间生命周期、游戏流程、数据同步、重连等事件的注册和处理。
 *
 * 核心职责：
 *   - bindLanEvents(bridge, ctx): 绑定所有 WebSocket 事件监听器
 *   - ctx 包含所有事件处理所需的 UI 函数和 DOM 引用
 *
 * WebSocket 事件：
 *   房间生命周期：room:created, room:joined, room:join-failed, room:kicked,
 *     room:player-joined, room:player-left, room:host-left, room:slot-state
 *   角色同步：lan:character-selected
 *   游戏流程：game:init, round:start, round:bid-ack, bid:received, all-bids-in,
 *     round:timeout, round:result, game:settle, game:settle-final
 *   暂停/恢复：pause:state
 *   数据同步：full-sync, full-sync-request, game:warehouse-sync
 *   重开投票：game:restart-vote, game:restart-go, game:restart-cancelled
 *   AI事件：ai-bids-ready, ai-item-use
 *   玩家动作：player-action, public-info
 *   重连：room:player-reconnected, room:player-removed, room:reconnected, room:reconnect-failed
 *   地图/道具同步：lan:map-selected, lan:carry-items-update
 *
 * @requires LanBridge - 联机通信桥
 *
 * @exports LanEventsMixin
 */

const { DEFAULT_START_MONEY } = window.MobaoConstants;
const { MobaoAppState } = window;

export const LanEventsMixin = {
  /**
   * 绑定所有联机 WebSocket 事件监听器
   * @param {LanBridge} bridge - 联机通信桥实例
   * @param {object} ctx - 上下文对象，包含所有事件处理所需的函数和 DOM 引用
   */
  bindLanEvents(bridge, ctx) {
    const {
      setOnlineStatus, showPanel, showLanAlert,
      connectBtn, roomCodeEl, hostBadge, startBtn, roomManageBtn, connectPanel, roomPanel,
      renderSlots, syncSlotsFromPlayers, initLanCharacterFromStorage,
      renderLanCarryItems, updateModeMapCardState,
      lanCarryItems, lanSlotConfig, lanSelectedMapId, mapCardLabel,
      broadcastSlotState, leaveBtn,
    } = ctx;

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
      console.log('[LAN] room:created received', msg);
      showPanel(roomPanel);
      if (roomCodeEl) roomCodeEl.textContent = msg.roomCode;
      if (hostBadge) hostBadge.classList.remove("hidden");
      if (startBtn) startBtn.classList.remove("hidden");
      if (roomManageBtn) roomManageBtn.classList.remove("hidden");
      syncSlotsFromPlayers([{ id: msg.playerId, name: msg.playerName, isHost: true }]);
      initLanCharacterFromStorage();
      renderLanCarryItems();
      updateModeMapCardState(true);
      if (bridge && bridge.connected) {
        bridge.send({ type: "lan:carry-items", carryItems: lanCarryItems.map(function (it) { return it.id; }) });
      }
      var statusText = "房间 " + msg.roomCode + " 等待玩家加入";
      if (msg.visibility === "private" && msg.password) {
        statusText += " | 密钥: " + msg.password;
      }
      setOnlineStatus(statusText, "connected");
    });

    bridge.on("room:joined", (msg) => {
      this.writeLog(`加入房间 ${msg.roomCode} | players=${(msg.players || []).length} | aiSlots=${(msg.aiSlots || []).length} | map=${msg.mapProfileId || "default"}`);
      showPanel(roomPanel);
      if (roomCodeEl) roomCodeEl.textContent = msg.roomCode;
      if (hostBadge) hostBadge.classList.add("hidden");
      if (startBtn) startBtn.classList.add("hidden");
      if (roomManageBtn) roomManageBtn.classList.add("hidden");
      syncSlotsFromPlayers(msg.players || []);
      // 同步主机的AI座位
      if (msg.aiSlots && msg.aiSlots.length > 0) {
        this.writeLog(`同步AI座位: ${JSON.stringify(msg.aiSlots)}`);
        msg.aiSlots.forEach((ai) => {
          const emptyIdx = lanSlotConfig.findIndex((s) => s.type === "empty");
          if (emptyIdx >= 0) {
            lanSlotConfig[emptyIdx] = { type: "ai", name: ai.name, llm: ai.llm };
          }
        });
        renderSlots();
      }
      initLanCharacterFromStorage();
      renderLanCarryItems();
      updateModeMapCardState(false);
      // 同步主机的地图选择
      if (msg.mapProfileId) {
        lanSelectedMapId = msg.mapProfileId;
        this.writeLog(`同步地图: ${lanSelectedMapId}`);
        if (window.MobaoMapProfiles) {
          window.MobaoMapProfiles.setSelectedProfileId(lanSelectedMapId);
        }
        if (mapCardLabel) {
          var profile = window.MobaoMapProfiles && window.MobaoMapProfiles.getProfile(lanSelectedMapId);
          mapCardLabel.textContent = profile ? profile.name : lanSelectedMapId;
        }
      }
      if (bridge && bridge.connected) {
        bridge.send({ type: "lan:carry-items", carryItems: lanCarryItems.map(function (it) { return it.id; }) });
      }
      setOnlineStatus("房间 " + msg.roomCode + " 等待主机开始", "connected");
    });

    bridge.on("room:join-failed", (msg) => {
      showPanel(connectPanel);
      showLanAlert("加入失败", msg.reason || "无法加入房间");
      setOnlineStatus("加入失败: " + msg.reason, "error");
    });

    bridge.on("room:kicked", () => {
      showPanel(connectPanel);
      showLanAlert("被踢出", "你已被主机踢出房间");
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

    bridge.on("lan:character-selected", (msg) => {
      var slotIdx = lanSlotConfig.findIndex((s) => s.id === msg.playerId);
      if (slotIdx >= 0) {
        lanSlotConfig[slotIdx].characterId = msg.characterId;
        renderSlots();
      }
    });

    bridge.on("lan:map-selected", (msg) => {
      lanSelectedMapId = msg.mapProfileId || "default";
      if (window.MobaoMapProfiles) {
        MobaoMapProfiles.setSelectedProfileId(lanSelectedMapId);
      }
      if (mapCardLabel) {
        var profile = window.MobaoMapProfiles && window.MobaoMapProfiles.getProfile(lanSelectedMapId);
        mapCardLabel.textContent = profile ? profile.name : lanSelectedMapId;
      }
    });

    bridge.on("lan:carry-items-update", (msg) => {
      var slotIdx = lanSlotConfig.findIndex((s) => s.id === msg.playerId);
      if (slotIdx >= 0) {
        lanSlotConfig[slotIdx].carryItems = msg.carryItems || [];
        renderSlots();
      }
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

    bridge.on("room:host-left", (msg) => {
      this.writeLog(msg.message || "房主已离开房间，房间已解散");
      bridge.disconnect();
      showPanel(connectPanel);
      setOnlineStatus("房间已解散", "");
    });

    bridge.on("lan:room:return", (msg) => {
      this.writeLog(`主机已返回房间 | players=${(msg.players || []).length} | aiSlots=${(msg.aiSlots || []).length} | map=${msg.mapProfileId || "default"}`);
      this.enterLanRoom();
      if (msg.players) {
        syncSlotsFromPlayers(msg.players, true);
      }
      if (msg.aiSlots && msg.aiSlots.length > 0) {
        this.writeLog(`同步AI座位: ${JSON.stringify(msg.aiSlots)}`);
        msg.aiSlots.forEach((ai) => {
          const emptyIdx = lanSlotConfig.findIndex((s) => s.type === "empty");
          if (emptyIdx >= 0) {
            lanSlotConfig[emptyIdx] = { type: "ai", name: ai.name, llm: ai.llm };
          }
        });
        renderSlots();
      }
      if (msg.mapProfileId) {
        lanSelectedMapId = msg.mapProfileId;
        this.writeLog(`同步地图: ${lanSelectedMapId}`);
        if (window.MobaoMapProfiles) {
          window.MobaoMapProfiles.setSelectedProfileId(lanSelectedMapId);
        }
        if (mapCardLabel) {
          var profile = window.MobaoMapProfiles && window.MobaoMapProfiles.getProfile(lanSelectedMapId);
          mapCardLabel.textContent = profile ? profile.name : lanSelectedMapId;
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

    bridge.on("game:start-failed", (msg) => {
      this.writeLog("游戏启动失败: " + (msg.reason || "未知原因"));
      showLanAlert("启动失败", msg.reason || "无法启动游戏，请检查人数配置");
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

      MobaoAppState.patch({ appMode: "game", gameSource: "lan" });
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

    bridge.on("lan:pause:state", (msg) => {
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
  },
};

// 兼容层
window.MobaoLan = window.MobaoLan || {};
window.MobaoLan.EventsMixin = LanEventsMixin;
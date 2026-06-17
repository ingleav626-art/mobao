/**
 * @file lan/client/lan-bridge.ts
 * @module lan/client/lan-bridge
 * @description 联机通信桥客户端。采用 IIFE + 构造函数模式，挂载到 window.LanBridge。
 *              封装 WebSocket 连接管理、消息收发、事件系统和原生桥接，
 *              是前端 UI 与联机服务器之间的唯一通信通道。
 *
 * @requires lan/shared/protocol - 通信协议常量
 * @exports LanBridge - 联机通信桥构造函数
 */
(function setupLanBridge(global: any) {
  var TAG = "[LanBridge]";

  function LanBridgeLog(level: string, msg: string) {
    var prefix = TAG + "[" + new Date().toLocaleTimeString() + "][" + level + "]";
    if (level === "error") console.error(prefix, msg);
    else if (level === "warn") console.warn(prefix, msg);
    else console.log(prefix, msg);
  }

  function LanBridge(this: any) {
    this.ws = null as WebSocket | null;
    this.connected = false;
    this.playerId = null as string | null;
    this.playerName = null as string | null;
    this.roomCode = null as string | null;
    this.isHost = false;
    this.players = [] as any[];

    this._listeners = {} as Record<string, Function[]>;
  }

  /**
   * 注册事件监听器
   * @param {string} event - 事件名称
   * @param {Function} fn - 回调函数
   * @returns {Function} 取消监听的函数
   */
  LanBridge.prototype.on = function (event: string, fn: Function) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
    var self = this;
    return function () {
      self._listeners[event] = (self._listeners[event] || []).filter(function (f: Function) { return f !== fn; });
    };
  };

  /**
   * 触发本地事件，通知所有注册的监听器
   * @param {string} event - 事件名称
   * @param {any} data - 事件数据
   * @returns {void}
   */
  LanBridge.prototype._emit = function (event: string, data: any) {
    var fns = this._listeners[event] || [];
    for (var i = 0; i < fns.length; i++) {
      try { fns[i](data); } catch (e) { console.error(TAG + " handler error:", e); }
    }
  };

  /**
   * 建立WebSocket连接
   * @param {string} url - WebSocket服务器地址 (ws://host:port)
   * @param {string} playerName - 玩家昵称
   * @returns {Promise<void>} 连接成功resolve，失败reject
   */
  LanBridge.prototype.connect = function (url: string, playerName: string) {
    var self = this;
    return new Promise<void>(function (resolve, reject) {
      if (self.ws && (self.ws as WebSocket).readyState <= 1) {
        LanBridgeLog("warn", "Already connected");
        resolve();
        return;
      }

      self.playerName = String(playerName || "Player").slice(0, 12);
      LanBridgeLog("info", 'Connecting to ' + url + ' as "' + self.playerName + '"...');

      try {
        self.ws = new WebSocket(url);
      } catch (e: any) {
        LanBridgeLog("error", "WebSocket creation failed: " + e.message);
        reject(e);
        return;
      }

      (self.ws as WebSocket).onopen = function () {
        self.connected = true;
        LanBridgeLog("info", "Connected");
        self._emit("ws:open", {});
        resolve();
      };

      (self.ws as WebSocket).onclose = function (evt: CloseEvent) {
        self.connected = false;
        LanBridgeLog("warn", "Closed (code=" + evt.code + " reason=" + (evt.reason || "none") + ")");
        self._emit("ws:close", { code: evt.code, reason: evt.reason });
      };

      (self.ws as WebSocket).onerror = function () {
        LanBridgeLog("error", "Error, readyState=" + (self.ws ? (self.ws as WebSocket).readyState : "null"));
        self._emit("ws:error", {});
        if (!self.connected) reject(new Error("Connection failed"));
      };

      (self.ws as WebSocket).onmessage = function (evt: MessageEvent) {
        var msg: any;
        try { msg = JSON.parse(evt.data); } catch (_) { return; }
        self._handleMessage(msg);
      };
    });
  };

  LanBridge.prototype.disconnect = function () {
    if (this.ws) { (this.ws as WebSocket).close(); this.ws = null; }
    this.connected = false;
    this.playerId = null;
    this.roomCode = null;
    this.isHost = false;
    LanBridgeLog("info", "Disconnected");
  };

  /**
   * 发送消息到服务端
   * @param {Object} msg - 消息对象（会被JSON.stringify）
   * @returns {boolean} 发送成功返回true，失败返回false
   */
  LanBridge.prototype.send = function (msg: any) {
    if (!this.ws || (this.ws as WebSocket).readyState !== 1) {
      LanBridgeLog("error", "Cannot send, readyState=" + (this.ws ? (this.ws as WebSocket).readyState : "null"));
      return false;
    }
    (this.ws as WebSocket).send(JSON.stringify(msg));
    return true;
  };

  /**
   * 创建房间
   * @param options 房间选项（结构不确定，使用 unknown 强制类型检查）
   */
  LanBridge.prototype.createRoom = function (options: unknown) {
    var opts = (options || {}) as { roomName?: string; visibility?: string; password?: string };
    LanBridgeLog("info", "Creating room...");
    this.send({
      type: "room:create",
      playerName: this.playerName,
      roomName: opts.roomName || undefined,
      visibility: opts.visibility || "public",
      password: opts.password || undefined,
    });
  };

  LanBridge.prototype.joinRoom = function (code: string, password?: string) {
    LanBridgeLog("info", "Joining room " + code + "...");
    var msg: any = { type: "room:join", roomCode: code, playerName: this.playerName };
    if (password) msg.password = password;
    this.send(msg);
  };

  LanBridge.prototype.listRooms = function () {
    LanBridgeLog("info", "Requesting room list...");
    this.send({ type: "room:list" });
  };

  LanBridge.prototype.reconnect = function (url: string, roomCode: string, playerId: string) {
    var self = this;
    return new Promise<any>(function (resolve, reject) {
      LanBridgeLog("info", "Reconnecting to " + url + " room=" + roomCode + " pid=" + playerId + "...");

      try {
        self.ws = new WebSocket(url);
      } catch (e: any) {
        LanBridgeLog("error", "WebSocket creation failed: " + e.message);
        reject(e);
        return;
      }

      (self.ws as WebSocket).onopen = function () {
        self.connected = true;
        LanBridgeLog("info", "Connected, sending reconnect...");
        self.send({
          type: "room:reconnect",
          roomCode: roomCode,
          playerId: playerId,
        });
      };

      (self.ws as WebSocket).onclose = function (evt: CloseEvent) {
        self.connected = false;
        LanBridgeLog("warn", "Closed (code=" + evt.code + ")");
        self._emit("ws:close", { code: evt.code, reason: evt.reason });
        if (!self.connected) reject(new Error("Connection closed during reconnect"));
      };

      (self.ws as WebSocket).onerror = function () {
        LanBridgeLog("error", "Error during reconnect");
        self._emit("ws:error", {});
        if (!self.connected) reject(new Error("Reconnect failed"));
      };

      (self.ws as WebSocket).onmessage = function (evt: MessageEvent) {
        var msg: any;
        try { msg = JSON.parse(evt.data); } catch (_) { return; }

        if (msg.type === "room:reconnected") {
          self.playerId = msg.playerId;
          self.roomCode = msg.roomCode;
          self.isHost = msg.isHost;
          LanBridgeLog("info", "Reconnected to room " + msg.roomCode);
          self._emit("room:reconnected", msg);
          resolve(msg);
        } else if (msg.type === "room:reconnect-failed") {
          LanBridgeLog("error", "Reconnect failed: " + msg.reason);
          self._emit("room:reconnect-failed", msg);
          reject(new Error(msg.reason));
        } else {
          self._handleMessage(msg);
        }
      };
    });
  };

  LanBridge.prototype.requestFullSync = function () {
    LanBridgeLog("info", "Requesting full sync...");
    this.send({ type: "game:full-sync-request" });
  };

  LanBridge.prototype.sendFullSync = function (targetPlayerId: string, syncData: any) {
    if (!this.isHost) return;
    this.send(Object.assign({ type: "lan:full-sync", playerId: targetPlayerId }, syncData));
  };

  LanBridge.prototype.leaveRoom = function () {
    this.send({ type: "room:leave" });
    this.roomCode = null;
    this.isHost = false;
    localStorage.removeItem("mobao_lan_player_id");
    localStorage.removeItem("mobao_lan_room_code");
    localStorage.removeItem("mobao_lan_player_name");
    localStorage.removeItem("mobao_lan_is_host");
    LanBridgeLog("info", "Left room, cleared localStorage");
  };

  LanBridge.prototype.startGame = function (options: any) {
    if (!this.isHost) { LanBridgeLog("warn", "Only host can start"); return; }
    var opts = options || {};
    this.send({
      type: "game:start",
      aiCount: opts.aiCount || 0,
      aiLlmEnabled: opts.aiLlmEnabled || false,
      aiPlayers: opts.aiPlayers || [],
    });
  };

  LanBridge.prototype.broadcastRoundStart = function (round: number, maxRounds: number, currentBid: number, roundSeconds: number) {
    if (!this.isHost) return;
    this.send({
      type: "lan:round:start",
      round: round,
      maxRounds: maxRounds,
      currentBid: currentBid,
      roundSeconds: roundSeconds,
    });
  };

  LanBridge.prototype.submitBid = function (bid: number) {
    var amount = Math.max(0, Math.round(Number(bid) || 0));
    LanBridgeLog("info", "Submitting bid: " + amount);
    this.send({ type: "lan:bid:submit", bid: amount });
  };

  LanBridge.prototype.broadcastRoundResult = function (round: number, bids: any[], reason?: string) {
    if (!this.isHost) return;
    this.send({
      type: "lan:round:result",
      round: round,
      bids: bids,
      reason: reason,
    });
  };

  LanBridge.prototype.broadcastSettle = function (data: any) {
    if (!this.isHost) return;
    this.send(Object.assign({ type: "lan:game:settle" }, data));
  };

  LanBridge.prototype.broadcastSettleFinal = function (wallets: any, profitDetails: any) {
    if (!this.isHost) return;
    this.send({
      type: "lan:game:settle-final",
      wallets: wallets,
      profitDetails: profitDetails,
    });
  };

  LanBridge.prototype.togglePause = function (paused: boolean, roundTimeLeft?: number) {
    this.send({ type: "lan:pause:toggle", paused: !!paused, roundTimeLeft: roundTimeLeft != null ? roundTimeLeft : undefined });
  };

  LanBridge.prototype.sendChat = function (text: string) {
    this.send({ type: "chat", text: String(text || "").slice(0, 200) });
  };

  LanBridge.prototype.ping = function () {
    this.send({ type: "lan:ping", ts: Date.now() });
  };

  /**
   * 处理服务端消息，按type分发到对应事件
   * @param {Object} msg - 解析后的JSON消息 { type: string, ... }
   * @returns {void}
   */
  LanBridge.prototype._handleMessage = function (msg: any) {
    // ─── 消息处理链 ───
    //
    // ws.onmessage → JSON.parse → _handleMessage → switch(type) → _emit(event, data)
    //
    // 事件映射:
    //   room:created    → room:created     房间创建成功
    //   room:joined     → room:joined      加入房间成功
    //   room:player-*   → room:player-*    玩家状态变更
    //   game:init       → game:init        游戏初始化
    //   round:start     → round:start      回合开始
    //   round:result    → round:result     回合结果
    //   game:settle     → game:settle      游戏结算
    //   lan:*           → lan:*            联机同步事件
    //   error           → error            错误消息

    switch (msg.type) {
      case "room:created":
        this.playerId = msg.playerId;
        this.roomCode = msg.roomCode;
        this.isHost = true;
        localStorage.setItem("mobao_lan_player_id", msg.playerId);
        localStorage.setItem("mobao_lan_room_code", msg.roomCode);
        localStorage.setItem("mobao_lan_player_name", this.playerName);
        localStorage.setItem("mobao_lan_is_host", "true");
        localStorage.removeItem("mobao_lan_reconnect_failed");
        LanBridgeLog("info", "Room created: " + msg.roomCode + " (saved to localStorage)");
        this._emit("room:created", msg);
        break;

      case "room:joined":
        this.playerId = msg.playerId;
        this.roomCode = msg.roomCode;
        this.isHost = false;
        localStorage.setItem("mobao_lan_player_id", msg.playerId);
        localStorage.setItem("mobao_lan_room_code", msg.roomCode);
        localStorage.setItem("mobao_lan_player_name", this.playerName);
        localStorage.setItem("mobao_lan_is_host", "false");
        localStorage.removeItem("mobao_lan_reconnect_failed");
        LanBridgeLog("info", "Joined room: " + msg.roomCode + " (saved to localStorage)");
        this._emit("room:joined", msg);
        break;

      case "room:join-failed":
        LanBridgeLog("error", "Join failed: " + msg.reason);
        localStorage.removeItem("mobao_lan_player_id");
        localStorage.removeItem("mobao_lan_room_code");
        localStorage.removeItem("mobao_lan_player_name");
        localStorage.removeItem("mobao_lan_is_host");
        this._emit("room:join-failed", msg);
        break;

      case "room:reconnected":
        this.playerId = msg.playerId;
        this.roomCode = msg.roomCode;
        this.isHost = msg.isHost;
        LanBridgeLog("info", "Reconnected to room " + msg.roomCode);
        this._emit("room:reconnected", msg);
        break;

      case "room:reconnect-failed":
        localStorage.removeItem("mobao_lan_player_id");
        localStorage.removeItem("mobao_lan_room_code");
        localStorage.removeItem("mobao_lan_player_name");
        localStorage.removeItem("mobao_lan_is_host");
        LanBridgeLog("error", "Reconnect failed: " + msg.reason);
        this._emit("room:reconnect-failed", msg);
        break;

      case "room:player-joined":
        LanBridgeLog("info", msg.playerName + " joined");
        this._emit("room:player-joined", msg);
        break;

      case "room:player-left":
        LanBridgeLog("warn", msg.playerName + " left");
        this._emit("room:player-left", msg);
        break;

      case "room:host-left":
        LanBridgeLog("warn", "Host left, room destroyed");
        this.roomCode = null;
        this.isHost = false;
        this._emit("room:host-left", msg);
        break;

      case "room:player-reconnected":
        LanBridgeLog("info", msg.playerName + " reconnected");
        this._emit("room:player-reconnected", msg);
        break;

      case "room:player-removed":
        LanBridgeLog("warn", msg.playerName + " removed (grace expired)");
        this._emit("room:player-removed", msg);
        break;

      case "room:kicked":
        LanBridgeLog("warn", "Kicked by host");
        this._emit("room:kicked", msg);
        break;

      case "room:list":
        LanBridgeLog("info", "Room list: " + (msg.rooms || []).length + " rooms");
        this._emit("room:list", msg);
        break;

      case "room:slot-state":
        LanBridgeLog("info", "Slot state update");
        this._emit("room:slot-state", msg);
        break;

      case "lan:game:restart-vote":
        LanBridgeLog("info", "Restart vote from host");
        this._emit("game:restart-vote", msg);
        break;

      case "lan:game:restart-go":
        LanBridgeLog("info", "Restart go");
        this._emit("game:restart-go", msg);
        break;

      case "lan:game:restart-cancelled":
        LanBridgeLog("info", "Restart cancelled");
        this._emit("game:restart-cancelled", msg);
        break;

      case "lan:game:init":
        this.players = msg.players;
        this.isHost = (msg.hostId === this.playerId);
        LanBridgeLog("info", "Game init: players=" + msg.players.length + " isHost=" + this.isHost);
        this._emit("game:init", msg);
        break;

      case "lan:round:start":
        LanBridgeLog("info", "Round " + msg.round + "/" + msg.maxRounds + " start, bid=" + msg.currentBid);
        this._emit("round:start", msg);
        break;

      case "lan:round:bid-ack":
        LanBridgeLog("info", "Bid ack: " + msg.bid);
        this._emit("round:bid-ack", msg);
        break;

      case "lan:bid:received":
        LanBridgeLog("info", msg.playerName + " submitted bid");
        this._emit("bid:received", msg);
        break;

      case "lan:all-bids-in":
        LanBridgeLog("info", "All human bids received");
        this._emit("all-bids-in", msg);
        break;

      case "lan:round:timeout":
        LanBridgeLog("warn", "Round timeout");
        this._emit("round:timeout", msg);
        break;

      case "lan:round:result":
        LanBridgeLog("info", "Round " + msg.round + " result revealed");
        this._emit("round:result", msg);
        break;

      case "lan:game:settle":
        LanBridgeLog("info", "Game settled: " + msg.winnerName);
        this._emit("game:settle", msg);
        break;

      case "lan:game:settle-final":
        LanBridgeLog("info", "Settle final received");
        this._emit("game:settle-final", msg);
        break;

      case "lan:public-info":
        this._emit("public-info", msg);
        break;

      case "lan:game:warehouse-sync":
        LanBridgeLog("info", "Warehouse sync: " + (msg.warehouse || []).length + " items");
        this._emit("game:warehouse-sync", msg);
        break;

      case "lan:ai-bids-ready":
        LanBridgeLog("info", "AI bids ready");
        this._emit("ai-bids-ready", msg);
        break;

      case "lan:ai-item-use":
        LanBridgeLog("info", "AI item use: " + msg.aiPlayerId);
        this._emit("ai-item-use", msg);
        break;

      case "lan:player-action":
        LanBridgeLog("info", "Player action: " + msg.actionId);
        this._emit("player-action", msg);
        break;

      case "lan:pause:state":
        LanBridgeLog("info", "Pause: " + msg.paused);
        this._emit("lan:pause:state", msg);
        break;

      case "lan:pong":
        var rtt = Date.now() - msg.ts;
        LanBridgeLog("info", "Pong RTT: " + rtt + "ms");
        this._emit("pong", { rtt: rtt });
        break;

      case "lan:full-sync-request":
        LanBridgeLog("info", "Full sync requested by " + msg.playerId);
        this._emit("full-sync-request", msg);
        break;

      case "lan:full-sync":
        LanBridgeLog("info", "Full sync received");
        this._emit("full-sync", msg);
        break;

      case "lan:map-selected":
        LanBridgeLog("info", "Map selected: " + msg.mapProfileId);
        this._emit("lan:map-selected", msg);
        break;

      case "lan:character-selected":
        LanBridgeLog("info", "Character selected by " + msg.playerId);
        this._emit("lan:character-selected", msg);
        break;

      case "lan:carry-items-update":
        LanBridgeLog("info", "Carry items update from " + msg.playerId);
        this._emit("lan:carry-items-update", msg);
        break;

      case "lan:room:return":
        LanBridgeLog("info", "Host returned to room");
        this._emit("lan:room:return", msg);
        break;

      case "game:start-failed":
        LanBridgeLog("error", "Game start failed: " + msg.reason);
        this._emit("game:start-failed", msg);
        break;

      case "chat":
        this._emit("chat", msg);
        break;

      case "error":
        LanBridgeLog("error", "Error: " + msg.reason);
        this._emit("error", msg);
        break;

      default:
        LanBridgeLog("warn", "Unknown: " + msg.type);
        this._emit("unknown", msg);
    }
  };

  LanBridge.isNative = function () {
    return !!(global.NativeBridge && global.NativeBridge.isNative && global.NativeBridge.isNative());
  };

  LanBridge.getNativeServerUrl = function () {
    if (!global.NativeBridge || !global.NativeBridge.getServerUrl) return null;
    try { return global.NativeBridge.getServerUrl(); } catch (_) { return null; }
  };

  LanBridge.getLocalServerUrl = function () {
    if (!global.NativeBridge || !global.NativeBridge.getLocalServerUrl) return null;
    try { return global.NativeBridge.getLocalServerUrl(); } catch (_) { return null; }
  };

  LanBridge.startNativeServer = function () {
    if (!global.NativeBridge || !global.NativeBridge.startServer) return false;
    try { return global.NativeBridge.startServer(); } catch (_) { return false; }
  };

  LanBridge.stopNativeServer = function () {
    if (!global.NativeBridge || !global.NativeBridge.stopServer) return;
    try { global.NativeBridge.stopServer(); } catch (_) { }
  };

  LanBridge.isNativeServerRunning = function () {
    if (!global.NativeBridge || !global.NativeBridge.isServerRunning) return false;
    try { return global.NativeBridge.isServerRunning(); } catch (_) { return false; }
  };

  LanBridge.getNativeWiFiIP = function () {
    if (!global.NativeBridge || !global.NativeBridge.getWiFiIP) return null;
    try { return global.NativeBridge.getWiFiIP(); } catch (_) { return null; }
  };

  LanBridge.discoverRoomsNative = function () {
    if (!global.NativeBridge || !global.NativeBridge.discoverRoomsQuick) return null;
    try {
      var result = global.NativeBridge.discoverRoomsQuick();
      return JSON.parse(result || "[]");
    } catch (e) { return null; }
  };

  LanBridge.discoverRoomsHTTP = function () {
    return new Promise<any>(function (resolve) {
      var results: any[] = [];
      var pending = 0;
      var ips: string[] = LanBridge._getLocalSubnetIPs();
      if (!ips || ips.length === 0) { resolve(results); return; }

      ips.forEach(function (ip: string) {
        var subnet = ip.substring(0, ip.lastIndexOf(".") + 1);
        for (var i = 1; i <= 254; i++) {
          var targetIp = subnet + i;
          if (targetIp === ip) continue;
          pending++;
          (function (addr: string) {
            var controller = new AbortController();
            var timeout = setTimeout(function () { controller.abort(); }, 800);
            fetch("http://" + addr + ":9721/rooms", { signal: controller.signal, mode: "cors" })
              .then(function (r: Response) { return r.json(); })
              .then(function (data: any) {
                clearTimeout(timeout);
                if (data && data.rooms) {
                  results.push({ serverIp: addr, serverPort: 9720, rooms: data.rooms });
                }
              })
              .catch(function () { clearTimeout(timeout); })
              .finally(function () {
                pending--;
                if (pending === 0) resolve(results);
              });
          })(targetIp);
        }
      });

      if (pending === 0) resolve(results);

      setTimeout(function () { resolve(results); }, 5000);
    });
  };

  LanBridge._getLocalSubnetIPs = function () {
    if (LanBridge.isNative()) {
      var ip = LanBridge.getNativeWiFiIP();
      return ip ? [ip] : [];
    }
    var ws = window.location.hostname;
    if (ws && ws !== "localhost" && ws !== "127.0.0.1" && ws.indexOf(".") > 0) {
      return [ws];
    }
    return ["192.168.1.1", "192.168.0.1", "192.168.31.1", "10.0.0.1", "192.168.50.1"];
  };

  global.LanBridge = LanBridge;
})(window);

export { }

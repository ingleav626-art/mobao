(function setupLanBridge(global) {
  var TAG = "[LanBridge]";

  function LanBridgeLog(level, msg) {
    var prefix = TAG + "[" + new Date().toLocaleTimeString() + "][" + level + "]";
    if (level === "error") console.error(prefix, msg);
    else if (level === "warn") console.warn(prefix, msg);
    else console.log(prefix, msg);
  }

  function LanBridge() {
    this.ws = null;
    this.connected = false;
    this.playerId = null;
    this.playerName = null;
    this.roomCode = null;
    this.isHost = false;
    this.players = [];

    this._listeners = {};
  }

  LanBridge.prototype.on = function (event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
    var self = this;
    return function () {
      self._listeners[event] = (self._listeners[event] || []).filter(function (f) { return f !== fn; });
    };
  };

  LanBridge.prototype._emit = function (event, data) {
    var fns = this._listeners[event] || [];
    for (var i = 0; i < fns.length; i++) {
      try { fns[i](data); } catch (e) { console.error(TAG + " handler error:", e); }
    }
  };

  LanBridge.prototype.connect = function (url, playerName) {
    var self = this;
    return new Promise(function (resolve, reject) {
      if (self.ws && self.ws.readyState <= 1) {
        LanBridgeLog("warn", "Already connected");
        resolve();
        return;
      }

      self.playerName = String(playerName || "Player").slice(0, 12);
      LanBridgeLog("info", 'Connecting to ' + url + ' as "' + self.playerName + '"...');

      try {
        self.ws = new WebSocket(url);
      } catch (e) {
        LanBridgeLog("error", "WebSocket creation failed: " + e.message);
        reject(e);
        return;
      }

      self.ws.onopen = function () {
        self.connected = true;
        LanBridgeLog("info", "Connected");
        self._emit("ws:open", {});
        resolve();
      };

      self.ws.onclose = function (evt) {
        self.connected = false;
        LanBridgeLog("warn", "Closed (code=" + evt.code + " reason=" + (evt.reason || "none") + ")");
        self._emit("ws:close", { code: evt.code, reason: evt.reason });
      };

      self.ws.onerror = function () {
        LanBridgeLog("error", "Error, readyState=" + (self.ws ? self.ws.readyState : "null"));
        self._emit("ws:error", {});
        if (!self.connected) reject(new Error("Connection failed"));
      };

      self.ws.onmessage = function (evt) {
        var msg;
        try { msg = JSON.parse(evt.data); } catch (_) { return; }
        self._handleMessage(msg);
      };
    });
  };

  LanBridge.prototype.disconnect = function () {
    if (this.ws) { this.ws.close(); this.ws = null; }
    this.connected = false;
    this.playerId = null;
    this.roomCode = null;
    this.isHost = false;
    LanBridgeLog("info", "Disconnected");
  };

  LanBridge.prototype.send = function (msg) {
    if (!this.ws || this.ws.readyState !== 1) {
      LanBridgeLog("error", "Cannot send, readyState=" + (this.ws ? this.ws.readyState : "null"));
      return false;
    }
    this.ws.send(JSON.stringify(msg));
    return true;
  };

  LanBridge.prototype.createRoom = function (options) {
    var opts = options || {};
    LanBridgeLog("info", "Creating room...");
    this.send({
      type: "room:create",
      playerName: this.playerName,
      roomName: opts.roomName || undefined,
      visibility: opts.visibility || "public",
      password: opts.password || undefined,
    });
  };

  LanBridge.prototype.joinRoom = function (code, password) {
    LanBridgeLog("info", "Joining room " + code + "...");
    var msg = { type: "room:join", roomCode: code, playerName: this.playerName };
    if (password) msg.password = password;
    this.send(msg);
  };

  LanBridge.prototype.listRooms = function () {
    LanBridgeLog("info", "Requesting room list...");
    this.send({ type: "room:list" });
  };

  LanBridge.prototype.reconnect = function (url, roomCode, playerId) {
    var self = this;
    return new Promise(function (resolve, reject) {
      LanBridgeLog("info", "Reconnecting to " + url + " room=" + roomCode + " pid=" + playerId + "...");

      try {
        self.ws = new WebSocket(url);
      } catch (e) {
        LanBridgeLog("error", "WebSocket creation failed: " + e.message);
        reject(e);
        return;
      }

      self.ws.onopen = function () {
        self.connected = true;
        LanBridgeLog("info", "Connected, sending reconnect...");
        self.send({
          type: "room:reconnect",
          roomCode: roomCode,
          playerId: playerId,
        });
      };

      self.ws.onclose = function (evt) {
        self.connected = false;
        LanBridgeLog("warn", "Closed (code=" + evt.code + ")");
        self._emit("ws:close", { code: evt.code, reason: evt.reason });
        if (!self.connected) reject(new Error("Connection closed during reconnect"));
      };

      self.ws.onerror = function () {
        LanBridgeLog("error", "Error during reconnect");
        self._emit("ws:error", {});
        if (!self.connected) reject(new Error("Reconnect failed"));
      };

      self.ws.onmessage = function (evt) {
        var msg;
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

  LanBridge.prototype.sendFullSync = function (targetPlayerId, syncData) {
    if (!this.isHost) return;
    this.send(Object.assign({ type: "lan:full-sync", playerId: targetPlayerId }, syncData));
  };

  LanBridge.prototype.leaveRoom = function () {
    this.send({ type: "room:leave" });
    this.roomCode = null;
    this.isHost = false;
  };

  LanBridge.prototype.startGame = function (options) {
    if (!this.isHost) { LanBridgeLog("warn", "Only host can start"); return; }
    var opts = options || {};
    this.send({
      type: "game:start",
      aiCount: opts.aiCount || 0,
      aiLlmEnabled: opts.aiLlmEnabled || false,
      aiPlayers: opts.aiPlayers || [],
    });
  };

  LanBridge.prototype.broadcastRoundStart = function (round, maxRounds, currentBid, roundSeconds) {
    if (!this.isHost) return;
    this.send({
      type: "lan:round:start",
      round: round,
      maxRounds: maxRounds,
      currentBid: currentBid,
      roundSeconds: roundSeconds,
    });
  };

  LanBridge.prototype.submitBid = function (bid) {
    var amount = Math.max(0, Math.round(Number(bid) || 0));
    LanBridgeLog("info", "Submitting bid: " + amount);
    this.send({ type: "lan:bid:submit", bid: amount });
  };

  LanBridge.prototype.broadcastRoundResult = function (round, bids, reason) {
    if (!this.isHost) return;
    this.send({
      type: "lan:round:result",
      round: round,
      bids: bids,
      reason: reason,
    });
  };

  LanBridge.prototype.broadcastSettle = function (data) {
    if (!this.isHost) return;
    this.send(Object.assign({ type: "lan:game:settle" }, data));
  };

  LanBridge.prototype.broadcastSettleFinal = function (wallets, profitDetails) {
    if (!this.isHost) return;
    this.send({
      type: "lan:game:settle-final",
      wallets: wallets,
      profitDetails: profitDetails,
    });
  };

  LanBridge.prototype.togglePause = function (paused, roundTimeLeft) {
    this.send({ type: "lan:pause:toggle", paused: !!paused, roundTimeLeft: roundTimeLeft != null ? roundTimeLeft : undefined });
  };

  LanBridge.prototype.sendChat = function (text) {
    this.send({ type: "chat", text: String(text || "").slice(0, 200) });
  };

  LanBridge.prototype.ping = function () {
    this.send({ type: "lan:ping", ts: Date.now() });
  };

  LanBridge.prototype._handleMessage = function (msg) {
    switch (msg.type) {
      case "room:created":
        this.playerId = msg.playerId;
        this.roomCode = msg.roomCode;
        this.isHost = true;
        LanBridgeLog("info", "Room created: " + msg.roomCode);
        this._emit("room:created", msg);
        break;

      case "room:joined":
        this.playerId = msg.playerId;
        this.roomCode = msg.roomCode;
        this.isHost = false;
        LanBridgeLog("info", "Joined room: " + msg.roomCode);
        this._emit("room:joined", msg);
        break;

      case "room:join-failed":
        LanBridgeLog("error", "Join failed: " + msg.reason);
        this._emit("room:join-failed", msg);
        break;

      case "room:player-joined":
        LanBridgeLog("info", msg.playerName + " joined");
        this._emit("room:player-joined", msg);
        break;

      case "room:player-left":
        LanBridgeLog("warn", msg.playerName + " left");
        this._emit("room:player-left", msg);
        break;

      case "room:player-reconnected":
        LanBridgeLog("info", msg.playerName + " reconnected");
        this._emit("room:player-reconnected", msg);
        break;

      case "room:player-removed":
        LanBridgeLog("warn", msg.playerName + " removed (grace expired)");
        this._emit("room:player-removed", msg);
        break;

      case "room:reconnected":
        this.playerId = msg.playerId;
        this.roomCode = msg.roomCode;
        this.isHost = msg.isHost;
        LanBridgeLog("info", "Reconnected to room " + msg.roomCode);
        this._emit("room:reconnected", msg);
        break;

      case "room:reconnect-failed":
        LanBridgeLog("error", "Reconnect failed: " + msg.reason);
        this._emit("room:reconnect-failed", msg);
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
        this._emit("pause:state", msg);
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
    return new Promise(function (resolve) {
      var results = [];
      var pending = 0;
      var ips = LanBridge._getLocalSubnetIPs();
      if (!ips || ips.length === 0) { resolve(results); return; }

      ips.forEach(function (ip) {
        var subnet = ip.substring(0, ip.lastIndexOf(".") + 1);
        for (var i = 1; i <= 254; i++) {
          var targetIp = subnet + i;
          if (targetIp === ip) continue;
          pending++;
          (function (addr) {
            var controller = new AbortController();
            var timeout = setTimeout(function () { controller.abort(); }, 800);
            fetch("http://" + addr + ":9721/rooms", { signal: controller.signal, mode: "cors" })
              .then(function (r) { return r.json(); })
              .then(function (data) {
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
    return ["192.168.1.1"];
  };

  global.LanBridge = LanBridge;
})(window);

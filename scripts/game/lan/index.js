(function setupMobaoLanIndex(global) {
  const { LanBridge } = global;
  const { MobaoAppState } = global;
  const { DEFAULT_START_MONEY, GRID_ROWS, GRID_COLS } = global.MobaoConstants;
  const { savePlayerMoney } = global.MobaoSettings;
  const { GAME_SETTINGS } = global.MobaoSettings;

  const LanIndexMixin = {
    initLanLobby() {
      if (!LanBridge) return;

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

    toggleLanPause(pause) {
      if (!this.isLanMode || !this.lanIsHost) return;
      if (this.settled || this.roundResolving) return;

      this.roundPaused = pause;
      if (this.roundPaused) {
        this._pauseSnapshotTimeLeft = this.roundTimeLeft;
      } else if (this._pauseSnapshotTimeLeft != null) {
        this.roundTimeLeft = this._pauseSnapshotTimeLeft;
        this._pauseSnapshotTimeLeft = null;
      }
      this.syncPauseButton();
      this.updateHud();
      if (this.roundPaused) {
        this.showLanPauseOverlay();
      } else {
        this.hideLanPauseOverlay();
      }
      if (this.lanBridge) {
        this.lanBridge.togglePause(this.roundPaused, this.roundTimeLeft);
      }
    },

    onLanBackground() {
      if (!this.isLanMode || !this.lanBridge || !this.lanBridge.connected) return;
      this.lanLastServerUrl = this.lanBridge.ws ? this.lanBridge.ws.url : null;
      this.lanLastRoomCode = this.lanBridge.roomCode;
      this.lanLastPlayerId = this.lanBridge.playerId;
      if (this.lanIsHost && !this.roundPaused && !this.settled) {
        this.toggleLanPause(true);
        this.writeLog("游戏进入后台，已自动暂停");
      }
    },

    onLanForeground() {
      if (!this.isLanMode || !this.lanBridge) return;
      if (this.settled || this.settlementRevealRunning) return;
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
    },

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
    },

    lanRestoreWarehouseFromSync(msg) {
      const warehouseData = msg.warehouse || [];
      if (warehouseData.length === 0) return;

      if (this.itemLayer) {
        this.itemLayer.destroy(true);
      }
      this.itemLayer = this.add.container(0, 0);
      this.items = [];
      this.warehouseTrueValue = 0;
      this.revealedCells = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(false));

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
    },

    lanBroadcastRoundStart() {
      this.lanBridge.broadcastRoundStart(
        this.round,
        GAME_SETTINGS.maxRounds,
        this.currentBid,
        GAME_SETTINGS.roundSeconds,
      );
    },

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
    },

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
    },

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
    },

    lanOnSettleFinal(msg) {
      const myLanId = this.lanBridge.playerId;
      if (msg.wallets && msg.wallets[myLanId] !== undefined) {
        this.playerMoney = msg.wallets[myLanId];
        savePlayerMoney(this.playerMoney);
        this.updateHud();
        this.updateLobbyMoneyDisplay();
      }
      if (window.NativeBridge && window.NativeBridge.isNative && window.NativeBridge.isNative()) {
        try { window.NativeBridge.setGameRunning(false); } catch (_) { }
      }
    },

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
    },

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
    },

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
    },

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
      MobaoAppState.patch({ appMode: "game", gameSource: "lan" });
      this.exitLobby();
      this.exitSettlementPage();
      this.startLanRun();
      this.writeLog("新一局已开始！");
    }
  };

  global.MobaoLan = global.MobaoLan || {};
  global.MobaoLan.IndexMixin = LanIndexMixin;
})(window);

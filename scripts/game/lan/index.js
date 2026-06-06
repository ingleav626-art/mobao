/**
 * @file lan/index.js
 * @module lan
 * @description 联机房间 UI 与事件处理 Mixin。管理联机大厅的完整生命周期，
 *              包括服务器连接、房间创建/加入、玩家槽位管理、角色选择、道具携带、
 *              地图选择、以及游戏过程中的 WebSocket 事件监听。
 *
 * 核心职责：
 *   - initLanLobby: 初始化联机大厅，绑定所有 DOM 元素和事件
 *   - 服务器连接：connectWithRetry / autoConnectAndCreate / autoConnectAndJoin
 *     支持手动输入地址和自动发现（子网扫描、Native WiFi IP）
 *   - 房间管理：创建房间（公开/私密）、加入房间、离开房间（含确认弹窗）
 *   - 玩家槽位：lanSlotConfig[4] + renderSlots + syncSlotsFromPlayers
 *     4个槽位：host/client/ai/empty，支持踢出、加AI、LLM勾选
 *   - 角色选择：renderLanCharacterList + updateLanPortrait
 *     两列式角色卡片，选择后广播 lan:character-select，Live2D 立绘无缝循环
 *   - 道具携带：renderLanCarryItems + lanCarryItems
 *     复用单机道具选择UI，选择后发送 lan:carry-items
 *   - 地图选择：openLanMapSelect，仅房主可操作
 *   - 房间管理弹窗：openLanRoomManage，踢出/加AI/编号
 *
 * WebSocket 事件监听（bridge.on）：
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
 *
 * @requires LanBridge       - 联机通信桥（scripts/game/lan-bridge.js）
 * @requires MobaoAppState   - 全局状态管理
 * @requires MobaoConstants  - 常量（DEFAULT_START_MONEY, GRID_ROWS, GRID_COLS）
 * @requires MobaoSettings   - 设置（savePlayerMoney, GAME_SETTINGS）
 * @requires CharacterData   - 角色数据（characters.js）
 * @requires MobaoMapProfiles - 地图配置
 * @requires MobaoShopBridge - 商店系统
 *
 * @exports MobaoLan.LanIndexMixin - 联机大厅 Mixin，混入 Phaser Scene
 */
(function setupMobaoLanIndex(global) {
  const { LanBridge } = global;
  const { MobaoAppState } = global;
  const { DEFAULT_START_MONEY, GRID_ROWS, GRID_COLS } = global.MobaoConstants;
  const { savePlayerMoney } = global.MobaoSettings;
  const { GAME_SETTINGS } = global.MobaoSettings;

  const LanIndexMixin = {
    initLanLobby() {
      console.log('[LAN] initLanLobby called, LanBridge=' + !!LanBridge);
      if (!LanBridge) return;

      this.lanBridge = new LanBridge();
      this.isLanMode = false;
      this.lanHostWallets = {};
      this.lanHostBids = {};
      this.lanAiPlayers = [];

      const $ = (id) => document.getElementById(id);
      const bridge = this.lanBridge;

      // 先定义 setOnlineStatus 方法
      const statusEl = $("lobbyOnlineStatus");
      this.lanStatusEl = statusEl;
      this.setOnlineStatus = (text, cls) => {
        if (!this.lanStatusEl) return;
        this.lanStatusEl.textContent = text;
        this.lanStatusEl.className = "lobby-online-status" + (cls ? " " + cls : "");
      };

      // 检查是否有保存的重连数据
      const savedPlayerId = localStorage.getItem("mobao_lan_player_id");
      const savedRoomCode = localStorage.getItem("mobao_lan_room_code");
      const savedPlayerName = localStorage.getItem("mobao_lan_player_name");
      const savedIsHost = localStorage.getItem("mobao_lan_is_host") === "true";
      const reconnectFailed = localStorage.getItem("mobao_lan_reconnect_failed");

      // 如果之前重连已失败，不再尝试
      if (reconnectFailed) {
        this.writeLog("之前重连已失败，跳过自动重连");
        localStorage.removeItem("mobao_lan_reconnect_failed");
      } else if (savedPlayerId && savedRoomCode && savedPlayerName) {
        this.writeLog(`检测到保存的房间数据 | room=${savedRoomCode} | player=${savedPlayerId} | host=${savedIsHost}`);
        // 尝试自动重连
        this.tryAutoReconnect(savedPlayerId, savedRoomCode, savedPlayerName, savedIsHost);
        // 重连是异步的，后续逻辑会在重连失败后继续执行
      }

      const serverUrl = $("lobbyOnlineServerUrl");
      const playerName = $("lobbyOnlinePlayerName");
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
      const playerGrid = $("lanPlayerGrid");
      const portraitArea = $("lanPortraitArea");
      const portraitPlaceholder = $("lanPortraitPlaceholder");
      const portraitLive2d = $("lanPortraitLive2d");
      const portraitName = $("lanPortraitName");
      const roomManageBtn = $("lanRoomManageBtn");
      const roomShopBtn = $("lanRoomShopBtn");
      const modeCard = $("lanModeCard");
      const mapCard = $("lanMapCard");
      const mapCardLabel = $("lanMapCardLabel");
      const characterOverlay = $("lanCharacterOverlay");
      const characterList = $("lanCharacterList");
      const characterCloseBtn = $("lanCharacterCloseBtn");
      const manageOverlay = $("lanRoomManageOverlay");
      const manageCloseBtn = $("lanManageCloseBtn");
      const mapSelectOverlay = $("lanMapSelectOverlay");
      const mapSelectCloseBtn = $("lanMapSelectCloseBtn");
      const carryItemsRow = $("lanCarryItemsRow");
      const carryAutoReplenish = $("lanCarryAutoReplenish");
      const alertOverlay = $("lanAlertOverlay");
      const alertTitle = $("lanAlertTitle");
      const alertMessage = $("lanAlertMessage");
      const alertCloseBtn = $("lanAlertCloseBtn");
      const alertOkBtn = $("lanAlertOkBtn");

      var lanSelectedCharacterId = null;
      var lanCarryItems = [];
      var lanSelectedMapId = "default";

      console.log('[LAN] DOM elements: createBtn=' + !!createBtn + ', joinBtn=' + !!joinBtn + ', createConfirmBtn=' + !!createConfirmBtn + ', createPanel=' + !!createPanel);

      if (!createBtn || !joinBtn) return;

      // 创建弹窗函数
      const showLanAlert = (title, message) => {
        if (!alertOverlay) return;
        if (alertTitle) alertTitle.textContent = title || "提示";
        if (alertMessage) alertMessage.textContent = message || "";
        openOverlay(alertOverlay);
      };

      const hideLanAlert = () => {
        closeOverlay(alertOverlay);
      };

      if (alertCloseBtn) {
        alertCloseBtn.addEventListener("click", hideLanAlert);
      }
      if (alertOkBtn) {
        alertOkBtn.addEventListener("click", hideLanAlert);
      }
      if (alertOverlay) {
        alertOverlay.addEventListener("click", (e) => {
          if (e.target === alertOverlay) hideLanAlert();
        });
      }

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
        // Listen for native server errors (e.g., port conflict)
        window.onNativeServerError = function (errorMsg) {
          setOnlineStatus("服务器错误: " + errorMsg, "error");
        };
      } else {
        // Reset native server error handler on non-native
        window.onNativeServerError = null;
        if (serverUrl) serverUrl.value = "ws://localhost:9720";
      }

      var toggleServerBtn = $("lobbyToggleServerBtn");
      if (toggleServerBtn) {
        toggleServerBtn.addEventListener("click", () => {
          if (serverField) serverField.classList.toggle("hidden");
        });
      }

      const setOnlineStatus = this.setOnlineStatus;

      const showPanel = (panel) => {
        if (connectPanel) connectPanel.classList.add("hidden");
        if (createPanel) createPanel.classList.add("hidden");
        if (joinPanel) joinPanel.classList.add("hidden");
        if (roomPanel) roomPanel.classList.add("hidden");
        var subHeader = document.getElementById("lobbyOnlineSubHeader");
        var placeholder = document.getElementById("lobbyOnlinePlaceholder");
        if (subHeader) {
          if (panel === roomPanel) {
            subHeader.classList.add("hidden");
          } else {
            subHeader.classList.remove("hidden");
          }
        }
        if (placeholder) {
          if (panel === roomPanel) {
            placeholder.classList.add("lan-room-active");
          } else {
            placeholder.classList.remove("lan-room-active");
          }
        }
        if (panel) panel.classList.remove("hidden");
      };

      const getPlayerName = () => {
        const name = playerName ? playerName.value.trim() || "Player" : "Player";
        localStorage.setItem("mobao_lan_name", name);
        return name;
      };

      const connectWithRetry = (url, name, roomOptions, serverFailedRef, maxAttempts) => {
        console.log('[LAN] connectWithRetry called, url=' + url);
        maxAttempts = maxAttempts || 8;
        var attempt = 1;
        var doTry = function () {
          if (serverFailedRef && serverFailedRef.failed) return;
          setOnlineStatus("连接本地服务器... (" + attempt + "/" + maxAttempts + ")", "");
          bridge.connect(url, name).then(function () {
            console.log('[LAN] connect succeeded, creating room...');
            setOnlineStatus("已连接", "connected");
            bridge.createRoom(roomOptions);
          }).catch(function (e) {
            console.log('[LAN] connect attempt ' + attempt + ' failed: ' + e.message);
            if (serverFailedRef && serverFailedRef.failed) return;
            attempt++;
            if (attempt <= maxAttempts) {
              var delay = Math.min(500 * Math.pow(1.5, attempt - 2), 4000);
              setTimeout(doTry, Math.round(delay));
            } else {
              setOnlineStatus("连接失败: " + e.message + "，请确认端口未被占用或重启游戏重试", "error");
            }
          });
        };
        doTry();
      };

      const autoConnectAndCreate = (options) => {
        const name = getPlayerName();
        console.log('[LAN] autoConnectAndCreate called, isNative=' + isNative + ', name=' + name);
        if (isNative) {
          setOnlineStatus("启动本地服务器...", "");
          const started = LanBridge.startNativeServer();
          console.log('[LAN] startNativeServer returned: ' + started);
          if (!started) {
            setOnlineStatus("启动服务器失败", "error");
            return;
          }
          const nativeUrl = LanBridge.getLocalServerUrl() || LanBridge.getNativeServerUrl();
          console.log('[LAN] nativeUrl: ' + nativeUrl);
          if (!nativeUrl) {
            setOnlineStatus("获取服务器地址失败", "error");
            return;
          }
          var serverFailedRef = { failed: false };
          var origErrorHandler = window.onNativeServerError;
          window.onNativeServerError = function (errorMsg) {
            serverFailedRef.failed = true;
            setOnlineStatus("服务器错误: " + errorMsg, "error");
          };
          var serverStartedRef = { started: false };
          window.onNativeServerStarted = function (ip, port) {
            serverStartedRef.started = true;
            console.log('[LAN] onNativeServerStarted: ' + ip + ':' + port);
          };
          setTimeout(function () {
            if (!serverFailedRef.failed) {
              connectWithRetry(nativeUrl, name, options, serverFailedRef);
            }
          }, 300);
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

      const scanRoomsNativeFull = () => {
        // Always run subnet scan to find other players' servers
        setOnlineStatus("正在扫描房间...", "");
        var nativeIp = LanBridge.getNativeWiFiIP ? LanBridge.getNativeWiFiIP() : null;
        var found = [];
        var localDone = false;
        var scanDone = false;

        var finishScan = function () {
          if (scanDone) return;
          scanDone = true;
          dedupFound(found);
          discoveredServers = found;
          renderRoomList();
          setOnlineStatus("扫描完成", "connected");
        };

        // Step 1: Try local HTTP discovery (quick)
        var nativeUrl = LanBridge.getNativeServerUrl();
        if (nativeUrl) {
          var httpBase = nativeUrl.replace("ws://", "http://").replace(/:\d+/, ":9721");
          fetch(httpBase + "/rooms", { mode: "cors" })
            .then(function (r) { return r.json(); })
            .then(function (data) {
              processRoomData(data, nativeIp || "localhost", found);
              localDone = true;
            })
            .catch(function () {
              localDone = true;
            });
        } else {
          localDone = true;
        }

        // Step 2: Always run native subnet scan (discovers other servers)
        setTimeout(function () {
          var result = LanBridge.discoverRoomsNative();
          if (result && result.length > 0) {
            result.forEach(function (server) {
              var exists = found.some(function (f) { return f.serverIp === server.serverIp; });
              if (!exists) found.push(server);
            });
          }
          finishScan();
        }, 200);

        // Safety timeout: render even if native scan hangs
        setTimeout(finishScan, 8000);
      };

      const scanRooms = () => {
        if (joinList) {
          joinList.innerHTML = '<div class="lobby-room-scanning">正在扫描局域网房间...</div>';
        }
        if (joinPasswordField) joinPasswordField.classList.add("hidden");

        if (isNative) {
          scanRoomsNativeFull();
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
        var commonSubnets = ["192.168.1.", "192.168.0.", "192.168.31.", "192.168.43.", "10.0.0.", "192.168.2.", "192.168.3.", "192.168.50.", "192.168.10.", "172.16.0.", "172.17.0.", "172.18.0.", "172.19.0.", "172.20.0.", "10.0.1.", "10.1.0."];

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
              aiCount: room.aiCount || 0,
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
          var totalCount = room.playerCount + room.aiCount;
          var playerLabel = room.aiCount > 0 ? `👥 ${room.playerCount}+${room.aiCount}AI/${room.maxPlayers}` : `👥 ${room.playerCount}/${room.maxPlayers}`;
          item.innerHTML =
            '<div class="lobby-room-item-info">' +
            '<div class="lobby-room-item-name">' + room.roomName + '</div>' +
            '<div class="lobby-room-item-meta">' +
            '<span class="lobby-room-item-vis ' + visClass + '">' + visLabel + '</span>' +
            '<span class="lobby-room-item-players">' + playerLabel + '</span>' +
            '</div>' +
            '</div>' +
            '<button class="lobby-room-item-join" data-code="' + room.code + '" data-ip="' + room.serverIp + '" data-vis="' + room.visibility + '" data-total="' + totalCount + '" data-max="' + room.maxPlayers + '">加入</button>';
          joinList.appendChild(item);
        });

        joinList.querySelectorAll(".lobby-room-item-join").forEach(function (btn) {
          btn.addEventListener("click", function () {
            var code = btn.getAttribute("data-code");
            var ip = btn.getAttribute("data-ip");
            var vis = btn.getAttribute("data-vis");
            var total = parseInt(btn.getAttribute("data-total"), 10);
            var max = parseInt(btn.getAttribute("data-max"), 10);

            // 检查房间是否已满
            if (total >= max) {
              showLanAlert("房间已满", "该房间已有 " + total + " 人（含AI），无法加入");
              return;
            }

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
        if (!playerGrid) return;
        const slotEls = playerGrid.querySelectorAll(".lan-player-slot");
        slotEls.forEach((el, i) => {
          const cfg = lanSlotConfig[i];
          renderLanPlayerSlot(el, i, cfg);
        });
        bindSlotActions(playerGrid);
      };

      const renderLanPlayerSlot = (el, i, cfg) => {
        el.className = "lan-player-slot";
        if (cfg.type === "host") {
          el.classList.add("slot-host");
          const charAvatar = cfg.characterId && CharacterData ? getCharAvatarHtml(cfg.characterId) : '<span class="lan-avatar-emoji">👑</span>';
          const kickHtml = (lanSlotConfig[0].type === "host" && lanSlotConfig[0].id === bridge.playerId && cfg.id !== bridge.playerId) ? '<span class="lan-slot-kick" data-kick="' + cfg.id + '">✕</span>' : '';
          el.innerHTML = kickHtml +
            '<div class="lan-slot-avatar">' + charAvatar + '</div>' +
            '<span class="lan-slot-name">' + cfg.name + '</span>' +
            '<span class="lan-slot-tag tag-host">主机</span>';
        } else if (cfg.type === "client") {
          el.classList.add("slot-client");
          const charAvatar = cfg.characterId && CharacterData ? getCharAvatarHtml(cfg.characterId) : '<span class="lan-avatar-emoji">👤</span>';
          const kickHtml = (lanSlotConfig[0].type === "host" && lanSlotConfig[0].id === bridge.playerId) ? '<span class="lan-slot-kick" data-kick="' + cfg.id + '">✕</span>' : '';
          el.innerHTML = kickHtml +
            '<div class="lan-slot-avatar">' + charAvatar + '</div>' +
            '<span class="lan-slot-name">' + cfg.name + '</span>' +
            '<span class="lan-slot-tag tag-client">客机</span>';
        } else if (cfg.type === "ai") {
          el.classList.add("slot-ai");
          const llmCheck = (lanSlotConfig[0].type === "host" && lanSlotConfig[0].id === bridge.playerId)
            ? '<div class="lan-slot-llm"><input type="checkbox" class="slot-llm-check" data-ai-slot="' + i + '"' + (cfg.llm ? " checked" : '') + '/><span class="lan-slot-llm-label">LLM</span></div>' +
            '<span class="lan-slot-kick" data-remove-ai="' + i + '">✕</span>'
            : (cfg.llm ? '<div class="lan-slot-llm"><span class="lan-slot-llm-label">LLM</span></div>' : '');
          el.innerHTML =
            '<div class="lan-slot-avatar"><span class="lan-avatar-emoji">🤖</span></div>' +
            '<span class="lan-slot-name">' + cfg.name + '</span>' +
            '<span class="lan-slot-tag tag-ai">AI</span>' +
            llmCheck;
        } else {
          el.classList.add("slot-empty");
          const addBtn = (lanSlotConfig[0].type === "host" && lanSlotConfig[0].id === bridge.playerId) ? ' data-add-ai="' + i + '"' : '';
          el.innerHTML =
            '<div class="lan-slot-avatar"><span class="lan-avatar-plus">+</span></div>' +
            '<span class="lan-slot-name">待加入</span>' +
            (addBtn ? '<span class="lan-slot-tag" style="cursor:pointer;background:rgba(212,168,67,0.15);color:#d4a843"' + addBtn + '>+AI</span>' : '');
        }
      };

      const getCharAvatarHtml = (characterId) => {
        if (!window.CharacterData) return '<span class="lan-avatar-emoji">👤</span>';
        const char = CharacterData.getCharacterById(characterId);
        if (char && char.avatar) {
          return '<img src="' + char.avatar + '" alt="' + char.name + '" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'inline\';"><span class="lan-avatar-emoji" style="display:none;">👤</span>';
        }
        return '<span class="lan-avatar-emoji">👤</span>';
      };

      const bindSlotActions = (container) => {
        container.querySelectorAll("[data-kick]").forEach((btn) => {
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const kickId = btn.getAttribute("data-kick");
            if (kickId) bridge.send({ type: "room:kick", playerId: kickId });
          });
        });
        container.querySelectorAll("[data-add-ai]").forEach((btn) => {
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const slotIdx = parseInt(btn.getAttribute("data-add-ai"), 10);
            if (isNaN(slotIdx)) return;

            // 检查是否可以添加AI（总人数不超过4）
            const humanCount = lanSlotConfig.filter((s) => s.type === "host" || s.type === "client").length;
            const currentAiCount = lanSlotConfig.filter((s) => s.type === "ai").length;
            const maxPlayers = 4;

            this.writeLog(`添加AI尝试 | human=${humanCount} | ai=${currentAiCount} | total=${humanCount + currentAiCount}/${maxPlayers}`);

            if (humanCount + currentAiCount >= maxPlayers) {
              this.writeLog("无法添加更多AI：总人数已达上限（" + maxPlayers + "人）");
              return;
            }

            const aiIdx = currentAiCount;
            lanSlotConfig[slotIdx] = { type: "ai", name: "AI-" + (aiIdx + 1), llm: false };
            this.writeLog(`添加AI成功 | slot=${slotIdx} | name=AI-${aiIdx + 1} | total=${humanCount + currentAiCount + 1}/${maxPlayers}`);
            renderSlots();
            broadcastSlotState();
          });
        });
        container.querySelectorAll("[data-remove-ai]").forEach((btn) => {
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const slotIdx = parseInt(btn.getAttribute("data-remove-ai"), 10);
            if (isNaN(slotIdx)) return;
            lanSlotConfig[slotIdx] = { type: "empty" };
            renderSlots();
            broadcastSlotState();
          });
        });
        container.querySelectorAll(".slot-llm-check").forEach((chk) => {
          chk.addEventListener("change", () => {
            const slotIdx = parseInt(chk.getAttribute("data-ai-slot"), 10);
            if (!isNaN(slotIdx) && lanSlotConfig[slotIdx].type === "ai") {
              lanSlotConfig[slotIdx].llm = chk.checked;
            }
            broadcastSlotState();
          });
        });
      };

      const renderLanCharacterList = () => {
        if (!characterList) return;
        const characters = (window.CharacterData && CharacterData.getUnlockedCharacters()) || [];
        characterList.innerHTML = characters.map((char) => {
          const avatarHtml = char.avatar
            ? '<img src="' + char.avatar + '" alt="' + char.name + '">'
            : '<span class="lan-char-avatar-emoji">👤</span>';
          return '<div class="lan-char-card' + (char.id === lanSelectedCharacterId ? ' selected' : '') + '" data-char-id="' + char.id + '">' +
            '<div class="lan-char-avatar">' + avatarHtml + '</div>' +
            '<div class="lan-char-info">' +
            '<div class="lan-char-name">' + char.name + '</div>' +
            '<div class="lan-char-skill">' + (char.skillName || '') + ' — ' + (char.skillDesc || '') + '</div>' +
            '<div class="lan-char-passive">' + (char.passive ? char.passive.label : '无被动') + '</div>' +
            '</div></div>';
        }).join("");

        characterList.querySelectorAll(".lan-char-card").forEach((card) => {
          card.addEventListener("click", () => {
            lanSelectedCharacterId = card.dataset.charId;
            renderLanCharacterList();
            updateLanPortrait();
            var mySlot = lanSlotConfig.find((s) => s.id === (bridge ? bridge.playerId : null));
            if (mySlot) {
              mySlot.characterId = lanSelectedCharacterId;
              renderSlots();
            }
            if (bridge && bridge.connected) {
              bridge.send({ type: "lan:character-select", characterId: lanSelectedCharacterId });
            }
          });
        });
      };

      const updateLanPortrait = () => {
        if (!portraitArea || !portraitPlaceholder || !portraitName) return;
        if (!lanSelectedCharacterId || !window.CharacterData) {
          portraitArea.classList.remove("has-character");
          portraitName.classList.add("hidden");
          stopLanLive2dLoop();
          return;
        }
        var char = CharacterData.getCharacterById(lanSelectedCharacterId);
        if (!char) {
          portraitArea.classList.remove("has-character");
          portraitName.classList.add("hidden");
          stopLanLive2dLoop();
          return;
        }
        portraitArea.classList.add("has-character");
        portraitName.classList.remove("hidden");
        portraitName.textContent = char.name;
        if (char.live2d) {
          var videoA = document.getElementById("lanLive2dVideoA");
          var videoB = document.getElementById("lanLive2dVideoB");
          if (videoA && videoB) {
            startLanLive2dLoop(char.live2d, videoA, videoB);
          }
        } else {
          stopLanLive2dLoop();
        }
      };

      var _lanLive2dState = null;

      const startLanLive2dLoop = (src, videoA, videoB) => {
        stopLanLive2dLoop();

        var loadingPlaceholder = document.getElementById("lanLive2dLoadingPlaceholder");
        if (loadingPlaceholder) loadingPlaceholder.classList.add("visible");

        var hasRVFC = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
        var isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;
        var PREWARM_TIME = isMobile ? 5.0 : 2.0;
        var SWITCH_TIME = isMobile ? 4.0 : 0.033;

        var state = {
          current: "A",
          src: src,
          running: true,
          duration: 0,
          prewarmed: false,
          nextFrameReady: false,
          switchPending: false,
          rafId: null,
          loadRetries: 0,
          maxRetries: 3,
          loadTimeout: null
        };
        _lanLive2dState = state;

        var getCurrent = function () { return state.current === "A" ? videoA : videoB; };
        var getNext = function () { return state.current === "A" ? videoB : videoA; };

        var clearLoadTimeout = function () {
          if (state.loadTimeout) { clearTimeout(state.loadTimeout); state.loadTimeout = null; }
        };

        var retryLoad = function () {
          if (state.loadRetries >= state.maxRetries) return;
          state.loadRetries++;
          videoA.removeAttribute("src");
          videoB.removeAttribute("src");
          videoA.load();
          videoB.load();
          setTimeout(function () {
            if (!state.running) return;
            videoA.src = src;
            videoB.src = src;
            videoA.load();
            videoB.load();
            setupLoadTimeout();
          }, 100);
        };

        var setupLoadTimeout = function () {
          clearLoadTimeout();
          state.loadTimeout = setTimeout(function () {
            if (!state.duration && state.running) retryLoad();
          }, 5000);
        };

        videoA.classList.remove("active");
        videoB.classList.remove("active");
        videoA.style.opacity = "0";
        videoB.style.opacity = "0";

        videoA.classList.add("active");
        videoA.src = src;
        videoB.src = src;
        videoA.load();
        videoB.load();
        setupLoadTimeout();

        var stopPolling = function () {
          if (state.rafId) { cancelAnimationFrame(state.rafId); state.rafId = null; }
        };

        var startPolling = function () {
          stopPolling();
          state.rafId = requestAnimationFrame(pollProgress);
        };

        var prewarmNext = function () {
          if (state.prewarmed) return;
          state.prewarmed = true;
          var next = getNext();
          next.style.opacity = "0";

          var markFrameReady = function () {
            if (!state.running || state.nextFrameReady) return;
            state.nextFrameReady = true;
            if (state.switchPending) performSwitch();
          };

          if (next.readyState >= 3) {
            next.currentTime = 0;
            var waitSeek = function () {
              if (!state.running) return;
              if (next.readyState >= 3) {
                next.play().catch(function () { });
                if (hasRVFC) {
                  next.requestVideoFrameCallback(function () {
                    next.pause();
                    markFrameReady();
                  });
                } else {
                  requestAnimationFrame(function () {
                    next.pause();
                    markFrameReady();
                  });
                }
              } else {
                requestAnimationFrame(waitSeek);
              }
            };
            requestAnimationFrame(waitSeek);
            return;
          }

          next.play().catch(function () { });
          if (hasRVFC) {
            next.requestVideoFrameCallback(function () {
              next.pause();
              markFrameReady();
            });
          } else {
            var checkFrame = function () {
              if (!state.running) return;
              if (next.readyState >= 3 || next.currentTime > 0) {
                next.pause();
                markFrameReady();
              } else {
                requestAnimationFrame(checkFrame);
              }
            };
            requestAnimationFrame(checkFrame);
          }
        };

        var performSwitch = function () {
          if (!state.running) return;
          state.switchPending = false;
          var current = getCurrent();
          var next = getNext();
          var oldKey = state.current;
          var nextKey = state.current === "A" ? "B" : "A";

          next.style.opacity = "1";
          next.classList.add("active");
          next.play().catch(function () { });

          setTimeout(function () {
            current.pause();
            current.style.opacity = "0";
            current.classList.remove("active");
          }, 0);

          state.current = nextKey;
          state.prewarmed = false;
          state.nextFrameReady = false;

          setTimeout(function () {
            current.pause();
            current.removeAttribute("src");
            current.load();
            setTimeout(function () {
              current.src = state.src;
              current.load();
            }, 50);
          }, 200);

          startPolling();
        };

        var requestSwitch = function () {
          if (state.switchPending) return;
          if (state.nextFrameReady) {
            performSwitch();
          } else {
            state.switchPending = true;
            if (!state.prewarmed) prewarmNext();
          }
        };

        var pollProgress = function () {
          if (!state.running) return;
          var current = getCurrent();
          if (state.duration > 0 && !current.paused) {
            var remaining = state.duration - current.currentTime;
            if (remaining <= PREWARM_TIME && !state.prewarmed) prewarmNext();
            if (remaining <= SWITCH_TIME && !state.switchPending) {
              requestSwitch();
              return;
            }
          }
          if (state.running) state.rafId = requestAnimationFrame(pollProgress);
        };

        videoA.onloadeddata = function () {
          if (!state.running) return;
          if (!videoA.classList.contains("active")) return;
          clearLoadTimeout();
          state.duration = videoA.duration;
          if (loadingPlaceholder) loadingPlaceholder.classList.remove("visible");
          videoA.style.opacity = "1";
          videoA.play().catch(function () { });
          startPolling();
          setTimeout(function () {
            if (!state.running) return;
            videoB.play().catch(function () { });
            if (hasRVFC) {
              videoB.requestVideoFrameCallback(function () { videoB.pause(); });
            }
          }, 100);
        };

        videoB.onloadeddata = function () {
          if (!state.running) return;
          if (!videoB.classList.contains("active")) return;
          videoB.currentTime = 0;
          videoB.pause();
        };

        videoA.onended = function () {
          if (!state.running || state.current !== "A") return;
          requestSwitch();
        };

        videoB.onended = function () {
          if (!state.running || state.current !== "B") return;
          requestSwitch();
        };

        videoA.onerror = function () {
          if (state.running && state.loadRetries < state.maxRetries) retryLoad();
        };

        videoB.onerror = function () {
          if (state.running && state.loadRetries < state.maxRetries) retryLoad();
        };
      };

      const stopLanLive2dLoop = () => {
        if (_lanLive2dState) {
          _lanLive2dState.running = false;
          if (_lanLive2dState.rafId) cancelAnimationFrame(_lanLive2dState.rafId);
          if (_lanLive2dState.loadTimeout) clearTimeout(_lanLive2dState.loadTimeout);
          _lanLive2dState = null;
        }
        var videoA = document.getElementById("lanLive2dVideoA");
        var videoB = document.getElementById("lanLive2dVideoB");
        if (videoA) {
          videoA.pause();
          videoA.onloadeddata = null;
          videoA.onended = null;
          videoA.onerror = null;
          videoA.removeAttribute("src");
          videoA.classList.remove("active");
          videoA.style.opacity = "0";
        }
        if (videoB) {
          videoB.pause();
          videoB.onloadeddata = null;
          videoB.onended = null;
          videoB.onerror = null;
          videoB.removeAttribute("src");
          videoB.classList.remove("active");
          videoB.style.opacity = "0";
        }
        var loadingPlaceholder = document.getElementById("lanLive2dLoadingPlaceholder");
        if (loadingPlaceholder) loadingPlaceholder.classList.remove("visible");
      };

      const openOverlay = (overlay) => {
        if (!overlay) return;
        overlay.classList.remove("hidden");
        requestAnimationFrame(() => overlay.classList.add("visible"));
      };

      const closeOverlay = (overlay) => {
        if (!overlay) return;
        overlay.classList.remove("visible");
        setTimeout(() => overlay.classList.add("hidden"), 260);
      };

      if (portraitArea) {
        portraitArea.addEventListener("click", () => {
          renderLanCharacterList();
          openOverlay(characterOverlay);
        });
      }

      if (characterCloseBtn) {
        characterCloseBtn.addEventListener("click", () => closeOverlay(characterOverlay));
      }

      if (characterOverlay) {
        characterOverlay.addEventListener("click", (e) => {
          if (e.target === characterOverlay) closeOverlay(characterOverlay);
        });
      }

      if (roomManageBtn) {
        roomManageBtn.addEventListener("click", () => openOverlay(manageOverlay));
      }

      if (manageCloseBtn) {
        manageCloseBtn.addEventListener("click", () => closeOverlay(manageOverlay));
      }

      if (manageOverlay) {
        manageOverlay.addEventListener("click", (e) => {
          if (e.target === manageOverlay) closeOverlay(manageOverlay);
        });
      }

      if (mapCard) {
        mapCard.addEventListener("click", () => {
          if (!bridge || !bridge.isHost) return;
          renderLanMapList();
          openOverlay(mapSelectOverlay);
        });
      }

      // 渲染地图选择列表
      const renderLanMapList = () => {
        var body = document.getElementById("lanMapSelectBody");
        if (!body || !window.MobaoMapProfiles) return;
        var profiles = MobaoMapProfiles.getAllProfiles();
        body.innerHTML = "";
        profiles.forEach(function (profile) {
          var card = document.createElement("div");
          card.className = "lan-map-item" + (profile.id === lanSelectedMapId ? " selected" : "");
          card.innerHTML =
            '<div class="lan-map-item-icon">' + (profile.icon || "🗺") + '</div>' +
            '<div class="lan-map-item-info">' +
            '<div class="lan-map-item-name">' + profile.name + '</div>' +
            '<div class="lan-map-item-desc">' + profile.desc + '</div>' +
            '<div class="lan-map-item-params">' + profile.params.maxRounds + '回合 · 直接拿下' + Math.round(profile.params.directTakeRatio * 100) + '%</div>' +
            '</div>';
          card.addEventListener("click", function () {
            lanSelectedMapId = profile.id;
            if (window.MobaoMapProfiles) MobaoMapProfiles.setSelectedProfileId(profile.id);
            if (mapCardLabel) mapCardLabel.textContent = profile.name;
            closeOverlay(mapSelectOverlay);
            if (bridge && bridge.connected) {
              bridge.send({ type: "lan:map-select", mapProfileId: profile.id, mapParams: profile.params });
            }
            renderLanMapList();
          });
          body.appendChild(card);
        });
      };

      if (modeCard) {
        modeCard.addEventListener("click", () => {
          if (!bridge || !bridge.isHost) return;
        });
      }

      if (mapSelectCloseBtn) {
        mapSelectCloseBtn.addEventListener("click", () => closeOverlay(mapSelectOverlay));
      }

      if (mapSelectOverlay) {
        mapSelectOverlay.addEventListener("click", (e) => {
          if (e.target === mapSelectOverlay) closeOverlay(mapSelectOverlay);
        });
      }

      if (roomShopBtn) {
        roomShopBtn.addEventListener("click", () => {
          if (typeof window.MobaoShopPage !== "undefined") {
            window.MobaoShopPage.init({
              onPurchase: () => {
                if (bridge && bridge.connected) {
                  bridge.send({ type: "lan:carry-items", carryItems: lanCarryItems.map(function (it) { return it.id; }) });
                }
              }
            });
            window.MobaoShopPage.open();
          }
        });
      }

      const renderLanCarryItems = () => {
        if (!carryItemsRow) return;
        carryItemsRow.innerHTML = "";
        lanCarryItems.forEach((item, idx) => {
          var slot = document.createElement("div");
          slot.className = "carry-item-slot";
          slot.textContent = item.icon || "📦";
          var removeBtn = document.createElement("span");
          removeBtn.className = "carry-item-remove";
          removeBtn.textContent = "✕";
          removeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            lanCarryItems.splice(idx, 1);
            renderLanCarryItems();
            if (bridge && bridge.connected) {
              bridge.send({ type: "lan:carry-items", carryItems: lanCarryItems.map(function (it) { return it.id; }) });
            }
          });
          slot.appendChild(removeBtn);
          carryItemsRow.appendChild(slot);
        });
        if (lanCarryItems.length < 3) {
          var addSlot = document.createElement("div");
          addSlot.className = "carry-item-add";
          addSlot.textContent = "+";
          addSlot.addEventListener("click", () => openLanCarryItemPicker());
          carryItemsRow.appendChild(addSlot);
        }
      };

      // 复用单机道具选择器逻辑，操作 lanCarryItems
      var lanCarryPickerEl = null;
      var LAN_MAX_CARRY = 3;

      const openLanCarryItemPicker = () => {
        if (lanCarryPickerEl) { lanCarryPickerEl.remove(); lanCarryPickerEl = null; }

        var existingIds = new Set(lanCarryItems.map(function (i) { return i.id; }));
        var bridge2 = window.MobaoShopBridge;
        var inventory = bridge2 ? bridge2.getFullInventory() : {};
        var shopItems = bridge2 ? bridge2.SHOP_ITEMS : [];
        var available = shopItems.map(function (def) {
          var storageKey = bridge2.getItemStorageKey(def.id);
          return { id: def.id, name: def.name, icon: def.icon, count: inventory[storageKey] || 0 };
        }).filter(function (item) { return item.count > 0; });

        var pickerSelected = new Set(existingIds);

        var overlay = document.createElement("div");
        overlay.className = "carry-picker-overlay";
        lanCarryPickerEl = overlay;

        var panel = document.createElement("div");
        panel.className = "carry-picker-panel";
        overlay.appendChild(panel);

        var renderPicker = function () {
          var totalSelected = pickerSelected.size;
          var headCount = totalSelected + " / " + LAN_MAX_CARRY;
          panel.innerHTML =
            '<div class="carry-picker-head">' +
            '<h3>选择携带道具<span class="carry-picker-count">' + headCount + '</span></h3>' +
            '<button class="carry-picker-close" type="button">\u2715</button>' +
            '</div>' +
            '<p class="carry-picker-sub">最多可携带 ' + LAN_MAX_CARRY + ' 个道具进入游戏</p>' +
            '<div class="carry-picker-body"><div class="carry-picker-grid">' +
            available.map(function (item) {
              var isLocked = existingIds.has(item.id);
              var isChecked = pickerSelected.has(item.id);
              var isFull = !isChecked && totalSelected >= LAN_MAX_CARRY;
              var cls = "carry-picker-item";
              if (isChecked) cls += isLocked ? " locked" : " checked";
              else if (isFull) cls += " full";
              return '<div class="' + cls + '" data-item-id="' + item.id + '">' +
                '<span class="carry-picker-item-icon">' + item.icon + '</span>' +
                '<div class="carry-picker-item-info">' +
                '<div class="carry-picker-item-name">' + item.name + '</div>' +
                '<div class="carry-picker-item-count">库存: ' + item.count + '</div>' +
                '</div></div>';
            }).join("") +
            '</div></div>' +
            '<div class="carry-picker-foot">' +
            '<button class="carry-picker-confirm" type="button">确认携带</button>' +
            '</div>';

          panel.querySelector(".carry-picker-close").addEventListener("click", function () { closeLanCarryItemPicker(); });
          panel.querySelector(".carry-picker-confirm").addEventListener("click", function () {
            lanCarryItems = available.filter(function (item) { return pickerSelected.has(item.id); })
              .map(function (item) { return { id: item.id, name: item.name, icon: item.icon }; });
            closeLanCarryItemPicker();
            renderLanCarryItems();
            if (bridge && bridge.connected) {
              bridge.send({ type: "lan:carry-items", carryItems: lanCarryItems.map(function (it) { return it.id; }) });
            }
          });
          panel.querySelectorAll(".carry-picker-item").forEach(function (el) {
            el.addEventListener("click", function () {
              var itemId = el.dataset.itemId;
              if (existingIds.has(itemId)) return;
              if (pickerSelected.has(itemId)) { pickerSelected.delete(itemId); }
              else { if (pickerSelected.size >= LAN_MAX_CARRY) return; pickerSelected.add(itemId); }
              renderPicker();
            });
          });
        };

        renderPicker();
        document.body.appendChild(overlay);
        overlay.addEventListener("click", function (e) { if (e.target === overlay) closeLanCarryItemPicker(); });
        requestAnimationFrame(function () { overlay.classList.add("open"); });
      };

      const closeLanCarryItemPicker = () => {
        if (lanCarryPickerEl) {
          lanCarryPickerEl.classList.remove("open");
          var el = lanCarryPickerEl;
          setTimeout(function () { el.remove(); }, 300);
          lanCarryPickerEl = null;
        }
      };

      const initLanCharacterFromStorage = () => {
        if (window.CharacterData && window.CharacterData.getSelectedCharacter) {
          var saved = CharacterData.getSelectedCharacter();
          if (saved && saved.id) {
            lanSelectedCharacterId = saved.id;
          } else if (typeof saved === "string") {
            lanSelectedCharacterId = saved;
          }
        }
        updateLanPortrait();
        var mySlot = lanSlotConfig.find((s) => s.id === (bridge ? bridge.playerId : null));
        if (mySlot && lanSelectedCharacterId) {
          mySlot.characterId = lanSelectedCharacterId;
          renderSlots();
        }
      };

      const updateModeMapCardState = (isHost) => {
        if (modeCard) {
          if (isHost) modeCard.classList.remove("disabled");
          else modeCard.classList.add("disabled");
        }
        if (mapCard) {
          if (isHost) mapCard.classList.remove("disabled");
          else mapCard.classList.add("disabled");
        }
      };

      const syncSlotsFromPlayers = (players, resetAi = false) => {
        const hostPlayer = (players || []).find((p) => p.isHost);
        const clientPlayers = (players || []).filter((p) => !p.isHost);
        const aiSlots = resetAi ? [] : lanSlotConfig.filter((s) => s.type === "ai");
        let idx = 0;
        if (hostPlayer) {
          lanSlotConfig[idx] = { type: "host", id: hostPlayer.id, name: hostPlayer.name, characterId: hostPlayer.characterId || null };
          idx++;
        }
        clientPlayers.forEach((p) => {
          if (idx < 4) {
            lanSlotConfig[idx] = { type: "client", id: p.id, name: p.name, characterId: p.characterId || null };
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
            MobaoMapProfiles.setSelectedProfileId(lanSelectedMapId);
          }
          if (mapCardLabel) {
            var profile = window.MobaoMapProfiles && MobaoMapProfiles.getProfile(lanSelectedMapId);
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
          var profile = window.MobaoMapProfiles && MobaoMapProfiles.getProfile(lanSelectedMapId);
          mapCardLabel.textContent = profile ? profile.name : lanSelectedMapId;
        }
      });

      bridge.on("lan:carry-items-update", (msg) => {
        var slotIdx = lanSlotConfig.findIndex((s) => s.id === msg.playerId);
        if (slotIdx >= 0) {
          lanSlotConfig[slotIdx].carryItems = msg.carryItems || [];
          // 只更新玩家槽位显示，不渲染自己的道具列表
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
        // 同步座位信息，重置AI座位（因为主机已经清空了）
        if (msg.players) {
          syncSlotsFromPlayers(msg.players, true);
        }
        // 同步AI座位（应该为空，因为主机重置了）
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
        // 同步地图
        if (msg.mapProfileId) {
          lanSelectedMapId = msg.mapProfileId;
          this.writeLog(`同步地图: ${lanSelectedMapId}`);
          if (window.MobaoMapProfiles) {
            MobaoMapProfiles.setSelectedProfileId(lanSelectedMapId);
          }
          if (mapCardLabel) {
            var profile = window.MobaoMapProfiles && MobaoMapProfiles.getProfile(lanSelectedMapId);
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
          console.log('[LAN] createConfirmBtn clicked');
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
          if (typeof this.showGameConfirm === "function") {
            this.showGameConfirm("确定要离开房间吗？", () => {
              bridge.leaveRoom();
              bridge.disconnect();
              showPanel(connectPanel);
              setOnlineStatus("已离开房间", "");
            });
          } else {
            bridge.leaveRoom();
            bridge.disconnect();
            showPanel(connectPanel);
            setOnlineStatus("已离开房间", "");
          }
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
          const humanCount = lanSlotConfig.filter((s) => s.type === "host" || s.type === "client").length;
          const totalCount = humanCount + aiCount;

          this.writeLog(`开始游戏 | human=${humanCount} | ai=${aiCount} | total=${totalCount}/${4}`);

          const aiLlmEnabled = aiSlots.some((s) => s.llm);
          const fixedAiIds = ["p1", "p3", "p4"];
          const aiPlayers = aiSlots.map((s, i) => ({
            id: fixedAiIds[i] || ("ai_" + i),
            name: s.name || ("AI-" + (i + 1)),
            isAI: true,
            isHost: false,
            llm: !!s.llm,
          }));

          this.writeLog(`发送game:start | aiPlayers=${JSON.stringify(aiPlayers.map(p => p.name))}`);
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
        if (!slotId) { console.log(`[lanComputeAiBids] ${ai.id} no slotId mapping, skipping`); return; }
        const plan = this.aiLlmRoundPlans[slotId];
        console.log(`[lanComputeAiBids] ${ai.id} slotId=${slotId} plan:`, plan ? { failed: plan.failed, hasBidDecision: plan.hasBidDecision, bid: plan.bid, canUseLlm: this.canUseLlmDecisionForPlayer(slotId) } : "null");
        if (!plan || plan.failed || !plan.hasBidDecision || !this.canUseLlmDecisionForPlayer(slotId)) return;
        const wallet = this.lanHostWallets[ai.id] || DEFAULT_START_MONEY;
        const normalizedBid = this.normalizeAiBidValue(slotId, plan.bid, wallet);
        console.log(`[lanComputeAiBids] ${ai.id} LLM bid override: ${ruleBids[ai.id]} -> ${normalizedBid} (wallet=${wallet})`);
        ruleBids[ai.id] = normalizedBid;
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

      var playerCharacters = {};
      this.players.forEach((p) => {
        var lanId = this.slotIdToLanId[p.id];
        if (lanId && p.characterId) {
          playerCharacters[lanId] = p.characterId;
        }
      });

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
        publicInfoEntries: this.publicInfoEntries || [],
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

      if (msg.playerCharacters) {
        for (var charLanId in msg.playerCharacters) {
          var charSlotId = this.lanIdToSlotId[charLanId];
          if (charSlotId) {
            var cp = this.players.find(function (pl) { return pl.id === charSlotId; });
            if (cp) {
              cp.characterId = msg.playerCharacters[charLanId];
              if (window.CharacterData && window.CharacterData.CHARACTERS) {
                var charInfo = CharacterData.CHARACTERS.find(function (c) { return c.id === cp.characterId; });
                if (charInfo) {
                  cp.characterName = charInfo.name;
                  cp.avatar = charInfo.avatarLabel || charInfo.name.substring(0, 2);
                }
              }
            }
          }
        }
      }

      if (msg.mapProfileId) {
        lanSelectedMapId = msg.mapProfileId;
        if (window.MobaoMapProfiles) {
          MobaoMapProfiles.setSelectedProfileId(lanSelectedMapId);
        }
      }

      if (msg.publicInfoEntries) {
        this.publicInfoEntries = msg.publicInfoEntries;
        this.renderPublicInfoPanel();
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

      if (window.PublicEventSystem && this.items.length > 0) {
        this.currentPublicEvent = window.PublicEventSystem.pickRandomPublicEvent(
          this.items,
          GRID_COLS,
          GRID_ROWS
        );
        this.publicInfoEntries = [{
          source: this.currentPublicEvent.category,
          text: this.currentPublicEvent.text
        }];
      }
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

      // 应用地图配置
      if (window.MobaoMapProfiles) {
        var _mapId = MobaoMapProfiles.getSelectedProfileId();
        var profile = MobaoMapProfiles.getProfile(_mapId);
        if (profile && profile.params) {
          var mp = profile.params;
          if (Number.isFinite(mp.maxRounds)) GAME_SETTINGS.maxRounds = mp.maxRounds;
          if (Number.isFinite(mp.directTakeRatio)) GAME_SETTINGS.directTakeRatio = mp.directTakeRatio;
          this._mapQualityWeights = mp.qualityWeights || null;
          this._mapCategoryWeights = mp.categoryWeights || null;
        }
      }

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

      if (this.lanIsHost && window.PublicEventSystem && this.items.length > 0) {
        this.currentPublicEvent = window.PublicEventSystem.pickRandomPublicEvent(
          this.items,
          GRID_COLS,
          GRID_ROWS
        );
        this.publicInfoEntries = [{
          source: this.currentPublicEvent.category,
          text: this.currentPublicEvent.text
        }];
      }

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
        characterId: p.characterId || null,
        carryItems: p.carryItems || [],
      }));

      this.lanIdToSlotId = {};
      this.slotIdToLanId = {};
      this.players.forEach((p) => {
        this.lanIdToSlotId[p.lanId] = p.id;
        this.slotIdToLanId[p.id] = p.lanId;
      });

      this.lanMySlotId = this.lanIdToSlotId[this.lanBridge.playerId] || "p2";

      this.initPlayersUI();

      // 应用角色选择到玩家数据
      if (window.CharacterSystem) {
        CharacterSystem.resetForNewGame();
        this.applyCharacterToPlayer();
      }
      // 为其他玩家设置角色信息（从 lanPlayers 同步，game:start 已包含 characterId）
      this.players.forEach((p) => {
        if (p.characterId && !p.isSelf) {
          if (window.CharacterData && window.CharacterData.CHARACTERS) {
            var charData = CharacterData.CHARACTERS.find((c) => c.id === p.characterId);
            if (charData) {
              p.characterName = charData.name;
              p.avatar = charData.avatarLabel || charData.name.substring(0, 2);
            }
          }
        }
      });

      // 根据每个AI自己的llm属性设置aiLlmPlayerEnabled
      if (this.lanAiPlayers.length > 0) {
        this.lanAiPlayers.forEach((ai) => {
          const slotId = this.lanIdToSlotId[ai.id];
          if (slotId) {
            this.aiLlmPlayerEnabled[slotId] = !!ai.llm;
            const toggleEl = document.getElementById("llm-switch-" + slotId);
            if (toggleEl) toggleEl.checked = !!ai.llm;
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
    },

    tryAutoReconnect(playerId, roomCode, playerName, isHost) {
      const bridge = this.lanBridge;
      const $ = (id) => document.getElementById(id);
      const connectPanel = $("lobbyOnlineConnect");
      const roomPanel = $("lobbyOnlineRoom");

      this.writeLog(`尝试自动重连 | room=${roomCode} | player=${playerId}`);

      // 显示重连提示
      if (connectPanel) connectPanel.classList.add("hidden");
      if (roomPanel) roomPanel.classList.remove("hidden");
      this.setOnlineStatus("正在重连...", "connecting");

      bridge.reconnect("ws://localhost:9720", roomCode, playerId)
        .then((msg) => {
          this.writeLog(`重连成功 | room=${msg.roomCode} | state=${msg.roomState}`);
          // 清除重连失败标记
          localStorage.removeItem("mobao_lan_reconnect_failed");
          this.isLanMode = true;
          this.lanIsHost = msg.isHost;
          this.lanPlayers = msg.players || [];

          // 根据房间状态恢复界面
          if (msg.roomState === "waiting") {
            // 房间等待状态，恢复房间界面
            this.enterLanRoom();
            this.setOnlineStatus("已重连到房间 " + msg.roomCode, "connected");
          } else if (msg.roomState === "playing") {
            // 游戏进行中，恢复游戏界面
            this.writeLog("游戏进行中，准备恢复游戏场景");
            // 退出房间界面
            this.exitLanRoom();
            // 进入游戏场景
            MobaoAppState.patch({ appMode: "game", gameSource: "lan" });
            this.startLanRun();
            this.setOnlineStatus("已重连到游戏", "connected");
            // 请求完整同步
            bridge.requestFullSync();
          }
        })
        .catch((err) => {
          this.writeLog(`重连失败 | ${err.message}`);
          // 清除 localStorage
          localStorage.removeItem("mobao_lan_player_id");
          localStorage.removeItem("mobao_lan_room_code");
          localStorage.removeItem("mobao_lan_player_name");
          localStorage.removeItem("mobao_lan_is_host");
          // 设置重连失败标记，防止反复重连
          localStorage.setItem("mobao_lan_reconnect_failed", "true");

          // 显示正常界面
          if (connectPanel) connectPanel.classList.remove("hidden");
          if (roomPanel) roomPanel.classList.add("hidden");
          this.setOnlineStatus("重连失败: " + err.message, "error");
        });
    },
  };

  global.MobaoLan = global.MobaoLan || {};
  global.MobaoLan.IndexMixin = LanIndexMixin;
})(window);

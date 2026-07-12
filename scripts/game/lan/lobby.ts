/**
 * @file lan/lobby.js
 * @module lan/lobby
 * @description 联机大厅 UI 实现。包含房间管理、玩家槽位、角色选择、
 *              道具携带、地图选择等联机大厅的全部 UI 逻辑。
 *
 * 核心职责：
 *   - initLanLobbyImpl: 初始化联机大厅，绑定所有 UI 事件和 WebSocket 事件
 *   - 房间管理：创建/加入/离开房间，房间列表渲染
 *   - 玩家槽位：槽位渲染、角色选择、AI 座位管理
 *   - 道具携带：携带道具 UI 和同步
 *   - 地图选择：联机地图选择和同步
 *
 * @requires LanBridge - 联机通信桥
 *
 * @exports initLanLobbyImpl
 */

import { getCharacterById, getUnlockedCharacters } from "../data/characters"
import { getActiveCharacterId } from "../data/character-system"
import { setSelectedProfileId, getAllProfiles } from "../data/map-profiles"
import { MobaoShopPage } from "../shop/index"
import { MobaoShopBridge } from "../bridge/shop"

import type { WarehouseSceneThis } from "../../../types/warehouse-scene-this"
import type { CarryItem } from "../../../types/game"
import type { RoomCreateOptions } from "../../../types/lan"

interface LanRoomInfo {
  code: string
  name?: string
  roomName?: string
  hostName: string
  visibility?: string
  playerCount: number
  maxPlayers: number
  aiCount?: number
  [key: string]: unknown
}

interface LanServerInfo {
  serverIp: string
  serverPort: number
  rooms: LanRoomInfo[]
}

export function initLanLobbyImpl(this: WarehouseSceneThis) {
  console.log('[LAN] initLanLobby called, LanBridge=' + !!LanBridge);
  if (!LanBridge) return;

  this.lanBridge = new LanBridge() as WarehouseSceneThis['lanBridge'];
  this.isLanMode = false;
  this.lanHostWallets = {};
  this.lanHostBids = {};
  this.lanAiPlayers = [];

  const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T | null;
  const bridge = this.lanBridge!;

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

  const serverUrl = $<HTMLInputElement>("lobbyOnlineServerUrl");
  const playerName = $<HTMLInputElement>("lobbyOnlinePlayerName");
  const connectBtn = $("lobbyOnlineConnectBtn");
  const serverField = $("lobbyOnlineServerField");
  const createBtn = $("lobbyOnlineCreateBtn");
  const joinBtn = $("lobbyOnlineJoinBtn");
  const connectPanel = $("lobbyOnlineConnect");
  const createPanel = $("lobbyOnlineCreatePanel");
  const joinPanel = $("lobbyOnlineJoinPanel");
  const createBackBtn = $("lobbyCreateBackBtn");
  const createRoomName = $<HTMLInputElement>("lobbyCreateRoomName");
  const visibilityToggle = $("lobbyVisibilityToggle");
  const createPasswordField = $("lobbyCreatePasswordField");
  const createPassword = $<HTMLInputElement>("lobbyCreatePassword");
  const createConfirmBtn = $("lobbyCreateConfirmBtn");
  const joinBackBtn = $("lobbyJoinBackBtn");
  const joinRefreshBtn = $("lobbyJoinRefreshBtn");
  const joinList = $("lobbyOnlineJoinList");
  const joinPasswordField = $("lobbyJoinPasswordField");
  const joinPassword = $<HTMLInputElement>("lobbyJoinPassword");
  const roomPanel = $("lobbyOnlineRoom");
  const roomCodeEl = $("lobbyOnlineRoomCode");
  const copyRoomBtn = $("lobbyCopyRoomBtn");
  const hostBadge = $("lobbyOnlineHostBadge");
  const startBtn = $("lobbyOnlineStartBtn");
  const leaveBtn = $("lobbyOnlineLeaveBtn");
  const playerGrid = $("lanPlayerGrid");
  const portraitArea = $("lanPortraitArea");
  const portraitPlaceholder = $("lanPortraitPlaceholder");
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
  const alertOverlay = $("lanAlertOverlay");
  const alertTitle = $("lanAlertTitle");
  const alertMessage = $("lanAlertMessage");
  const alertCloseBtn = $("lanAlertCloseBtn");
  const alertOkBtn = $("lanAlertOkBtn");

  var lanSelectedCharacterId: string | null = null;
  var lanCarryItems: CarryItem[] = [];
  var lanSelectedMapId = "default";

  console.log('[LAN] DOM elements: createBtn=' + !!createBtn + ', joinBtn=' + !!joinBtn + ', createConfirmBtn=' + !!createConfirmBtn + ', createPanel=' + !!createPanel);

  if (!createBtn || !joinBtn) return;

  // 创建弹窗函数
  const showLanAlert = (title: string, message: string) => {
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
  var discoveredServers: LanServerInfo[] = [];
  var pendingJoinServerIp: string | null = null;
  var pendingJoinRoomCode: string | null = null;

  const isNative = LanBridge.isNative();

  if (isNative) {
    if (serverField) serverField.classList.add("hidden");
    var toggleBtn = $("lobbyToggleServerBtn");
    if (toggleBtn) toggleBtn.parentElement?.classList.add("hidden");
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

  const showPanel = (panel: HTMLElement | null) => {
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

  /**
   * 带重试的连接
   * @param url WebSocket URL
   * @param name 玩家名称
   * @param roomOptions 房间创建选项
   * @param serverFailedRef 服务器失败引用（{ failed: boolean }）
   * @param maxAttempts 最大尝试次数
   */
  const connectWithRetry = (url: string, name: string, roomOptions: RoomCreateOptions, serverFailedRef: { failed: boolean }, maxAttempts?: number) => {
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

  const autoConnectAndCreate = (options: { serverIp?: string; roomCode?: string; password?: string }) => {
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

  const autoConnectAndJoin = (serverIp: string, roomCode: string, password?: string) => {
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

  const detectLocalIP = (): Promise<string[]> => {
    return new Promise(function (resolve) {
      try {
        var pc = new RTCPeerConnection({ iceServers: [] });
        pc.createDataChannel("");
        pc.createOffer().then(function (offer) { return pc.setLocalDescription(offer); }).catch(function () { });
        var found: string[] = [];
        setTimeout(function () {
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
      } catch (_e) {
        resolve([]);
      }
    });
  };

  const scanSubnet = (subnet: string, found: Array<{ serverIp: string; serverPort?: number; rooms: unknown[] }>, onDone: () => void) => {
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
    var found: LanServerInfo[] = [];
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
        })
        .catch(function () {
        });
    }

    // Step 2: Always run native subnet scan (discovers other servers)
    setTimeout(function () {
      var result = LanBridge.discoverRoomsNative();
      if (result && result.length > 0) {
        result.forEach(function (server) {
          var exists = found.some(function (f) { return f.serverIp === server.serverIp; });
          if (!exists) found.push({ serverIp: server.serverIp, serverPort: 9720, rooms: server.rooms as LanRoomInfo[] });
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
    var found: LanServerInfo[] = [];

    var finishScan = function () {
      if (done) return;
      done = true;
      dedupFound(found);
      discoveredServers = found;
      renderRoomList();
    };

    var currentHost = window.location.hostname;
    var serverBase: string | null = null;
    if (currentHost && currentHost !== "localhost" && currentHost !== "127.0.0.1" && currentHost.indexOf(".") > 0) {
      serverBase = "http://" + currentHost + ":9720";
    } else if (serverUrl && serverUrl.value) {
      var m = serverUrl.value.match(/ws:\/\/([^:/]+)/);
      if (m && m[1] !== "localhost" && m[1] !== "127.0.0.1") {
        serverBase = "http://" + m[1] + ":9720";
      }
    }

    var localServerBase = "http://localhost:9720";

    if (serverBase) {
      var base = serverBase;
      fetch(base + "/rooms", { mode: "cors" })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          processRoomData(data, base.replace("http://", "").split(":")[0], found);
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

  const processRoomData = (data: { rooms?: Array<{ code: string; name: string; hostName: string; playerCount: number; maxPlayers: number }>; remoteRooms?: Array<{ code: string; name: string; hostName: string; playerCount: number; maxPlayers: number; serverIp: string }> }, serverIp: string, found: LanServerInfo[]) => {
    if (data && data.rooms && data.rooms.length > 0) {
      var exists = found.some(function (f) { return f.serverIp === serverIp; });
      if (!exists) found.push({ serverIp: serverIp, serverPort: 9720, rooms: data.rooms });
    }
    if (data && data.remoteRooms && data.remoteRooms.length > 0) {
      var grouped: Record<string, LanServerInfo> = {};
      data.remoteRooms.forEach(function (room) {
        var ip = room.serverIp;
        if (!grouped[ip]) grouped[ip] = { serverIp: ip, serverPort: 9720, rooms: [] };
        var r = Object.assign({}, room) as Omit<typeof room, 'serverIp'> & { serverIp?: string };
        delete r.serverIp;
        grouped[ip].rooms.push(r);
      });
      Object.keys(grouped).forEach(function (ip) {
        var exists = found.some(function (f) { return f.serverIp === ip; });
        if (!exists) found.push(grouped[ip]);
      });
    }
  };

  const dedupFound = (found: LanServerInfo[]) => {
    var seen: Record<string, boolean> = {};
    for (var i = found.length - 1; i >= 0; i--) {
      var server = found[i];
      var dedupRooms: LanRoomInfo[] = [];
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

  const fallbackScan = (found: LanServerInfo[], finishScan: () => void) => {
    var subnets: string[] = [];
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
    var allRooms: Array<{ serverIp: string; serverPort: number; code: string; roomName?: string; hostName: string; visibility?: string; playerCount: number; aiCount: number; maxPlayers: number }> = [];
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
        var code = btn.getAttribute("data-code") || "";
        var ip = btn.getAttribute("data-ip") || "";
        var vis = btn.getAttribute("data-vis") || "";
        var total = parseInt(btn.getAttribute("data-total") || "0", 10);
        var max = parseInt(btn.getAttribute("data-max") || "0", 10);

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
          if (ip && code) autoConnectAndJoin(ip, code);
        }
      });
    });
  };

  const lanSlotConfig: Array<Record<string, any>> = [
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

  const renderLanPlayerSlot = (el: Element, i: number, cfg: Record<string, any>) => {
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

  const getCharAvatarHtml = (characterId: string) => {
    if (!getCharacterById) return '<span class="lan-avatar-emoji">👤</span>';
    const char = getCharacterById(characterId);
    if (char && char.avatar) {
      return '<img src="' + char.avatar + '" alt="' + char.name + '" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'inline\';"><span class="lan-avatar-emoji" style="display:none;">👤</span>';
    }
    return '<span class="lan-avatar-emoji">👤</span>';
  };

  const bindSlotActions = (container: HTMLElement) => {
    container.querySelectorAll("[data-kick]").forEach((btn) => {
      btn.addEventListener("click", (e: Event) => {
        e.stopPropagation();
        const kickId = btn.getAttribute("data-kick");
        if (kickId) bridge.send({ type: "room:kick", playerId: kickId });
      });
    });
    container.querySelectorAll("[data-add-ai]").forEach((btn) => {
      btn.addEventListener("click", (e: Event) => {
        e.stopPropagation();
        const slotIdx = parseInt(btn.getAttribute("data-add-ai") || "", 10);
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
      btn.addEventListener("click", (e: Event) => {
        e.stopPropagation();
        const slotIdx = parseInt(btn.getAttribute("data-remove-ai") || "", 10);
        if (isNaN(slotIdx)) return;
        lanSlotConfig[slotIdx] = { type: "empty" };
        renderSlots();
        broadcastSlotState();
      });
    });
    container.querySelectorAll(".slot-llm-check").forEach((chk: Element) => {
      chk.addEventListener("change", () => {
        const slotIdx = parseInt((chk as HTMLInputElement).getAttribute("data-ai-slot") || "", 10);
        if (!isNaN(slotIdx) && lanSlotConfig[slotIdx].type === "ai") {
          lanSlotConfig[slotIdx].llm = (chk as HTMLInputElement).checked;
        }
        broadcastSlotState();
      });
    });
  };

  const renderLanCharacterList = () => {
    if (!characterList) return;
    const characters = getUnlockedCharacters() || [];
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
        lanSelectedCharacterId = (card as HTMLElement).dataset.charId ?? null;
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
    if (!lanSelectedCharacterId) {
      portraitArea.classList.remove("has-character");
      portraitName.classList.add("hidden");
      this.stopLanLive2dLoop();
      return;
    }
    var char = getCharacterById(lanSelectedCharacterId);
    if (!char) {
      portraitArea.classList.remove("has-character");
      portraitName.classList.add("hidden");
      this.stopLanLive2dLoop();
      return;
    }
    portraitArea.classList.add("has-character");
    portraitName.classList.remove("hidden");
    portraitName.textContent = char.name;
    if (char.live2d) {
      var videoA = document.getElementById("lanLive2dVideoA") as HTMLVideoElement | null;
      var videoB = document.getElementById("lanLive2dVideoB") as HTMLVideoElement | null;
      if (videoA && videoB) {
        this.startLanLive2dLoop(char.live2d, videoA, videoB);
      }
    } else {
      this.stopLanLive2dLoop();
    }
  };


  const openOverlay = (overlay: HTMLElement | null) => {
    if (!overlay) return;
    overlay.classList.remove("hidden");
    requestAnimationFrame(() => overlay.classList.add("visible"));
  };

  const closeOverlay = (overlay: HTMLElement | null) => {
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
    if (!body || !getAllProfiles) return;
    var profiles = getAllProfiles();
    var bodyEl = body;
    bodyEl.innerHTML = "";
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
        if (setSelectedProfileId) setSelectedProfileId(profile.id);
        if (mapCardLabel) mapCardLabel.textContent = profile.name;
        closeOverlay(mapSelectOverlay);
        if (bridge && bridge.connected) {
          bridge.send({ type: "lan:map-select", mapProfileId: profile.id, mapParams: profile.params });
        }
        renderLanMapList();
      });
      bodyEl.appendChild(card);
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
      if (typeof MobaoShopPage !== "undefined") {
        MobaoShopPage.init({
          onPurchase: () => {
            if (bridge && bridge.connected) {
              bridge.send({ type: "lan:carry-items", carryItems: lanCarryItems.map(function (it) { return it.id; }) });
            }
          }
        });
        MobaoShopPage.open();
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
  var lanCarryPickerEl: HTMLElement | null = null;
  var LAN_MAX_CARRY = 3;

  const openLanCarryItemPicker = () => {
    if (lanCarryPickerEl) { lanCarryPickerEl.remove(); lanCarryPickerEl = null; }

    var existingIds = new Set(lanCarryItems.map(function (i) { return i.id; }));
    var bridge2 = MobaoShopBridge;
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

      const closeBtn = panel.querySelector(".carry-picker-close")
      if (closeBtn) closeBtn.addEventListener("click", function () { closeLanCarryItemPicker(); });
      const confirmBtn = panel.querySelector(".carry-picker-confirm")
      if (confirmBtn) confirmBtn.addEventListener("click", function () {
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
          var itemId = (el as HTMLElement).dataset.itemId || "";
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
    const savedId = getActiveCharacterId();
    if (savedId) {
      lanSelectedCharacterId = savedId;
    }
    updateLanPortrait();
    var mySlot = lanSlotConfig.find((s) => s.id === (bridge ? bridge.playerId : null));
    if (mySlot && lanSelectedCharacterId) {
      mySlot.characterId = lanSelectedCharacterId;
      renderSlots();
    }
  };

  const updateModeMapCardState = (isHost: boolean) => {
    if (modeCard) {
      if (isHost) modeCard.classList.remove("disabled");
      else modeCard.classList.add("disabled");
    }
    if (mapCard) {
      if (isHost) mapCard.classList.remove("disabled");
      else mapCard.classList.add("disabled");
    }
  };

  const syncSlotsFromPlayers = (players: Array<{ id: string; name: string; isHost: boolean; characterId?: string | null }>, resetAi = false) => {
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

  // 绑定所有 WebSocket 事件
  this.bindLanEvents(bridge, {
    setOnlineStatus, showPanel, showLanAlert,
    connectBtn, roomCodeEl, hostBadge, startBtn, roomManageBtn, connectPanel, roomPanel,
    renderSlots, syncSlotsFromPlayers, initLanCharacterFromStorage,
    renderLanCarryItems, updateModeMapCardState,
    lanCarryItems, lanSlotConfig, lanSelectedMapId, mapCardLabel,
    broadcastSlotState, leaveBtn,
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
        selectedVisibility = btn.getAttribute("data-vis") || "public";
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

}

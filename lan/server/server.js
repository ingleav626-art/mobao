const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const dgram = require("dgram");
const { WebSocketServer } = require("ws");

const PORT = 9720;
const DISCOVERY_PORT = 9721;
const ROOM_CODE_LEN = 4;
const CLIENT_DIR = path.join(__dirname, "..", "client");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
};

const RECONNECT_GRACE_MS = 30000;

const rooms = new Map();
const clients = new Map();

function genRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < ROOM_CODE_LEN; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return rooms.has(code) ? genRoomCode() : code;
}

function genPlayerId() {
  return "p" + crypto.randomBytes(4).toString("hex");
}

function sendJson(ws, obj) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(obj));
  }
}

function broadcastToRoom(room, msg, excludeId) {
  if (!room) return;
  for (const seat of room.seats) {
    if (seat.id === excludeId) continue;
    const c = clients.get(seat.id);
    if (c) sendJson(c, msg);
  }
}

function logRoom(roomCode, action, detail) {
  console.log(`[room:${roomCode}] ${action}${detail ? " | " + detail : ""}`);
}

function removePlayer(ws, immediate) {
  if (!ws.playerId) return;
  clients.delete(ws.playerId);
  if (ws.roomCode) {
    const room = rooms.get(ws.roomCode);
    if (room) {
      const seat = room.seats.find((s) => s.id === ws.playerId);
      if (seat) {
        seat.connected = false;
        var isHostLeft = (ws.playerId === room.hostId);

        if (isHostLeft && immediate && room.state === "waiting") {
          broadcastToRoom(room, {
            type: "room:host-left",
            hostName: seat.name,
            message: "房主已离开房间，房间已解散",
          });
          logRoom(ws.roomCode, "host-left", `${seat.name}(${ws.playerId}) [HOST] room destroyed`);
          for (const s of room.seats) {
            const c = clients.get(s.id);
            if (c) {
              c.roomCode = null;
              c.playerId = null;
            }
          }
          if (room.roundTimer) clearTimeout(room.roundTimer);
          rooms.delete(ws.roomCode);
          ws.roomCode = null;
          ws.playerId = null;
          return;
        }

        if (!immediate && room.state === "playing") {
          seat.disconnectedAt = Date.now();
          broadcastToRoom(room, {
            type: "room:player-left",
            playerId: ws.playerId,
            playerName: seat.name,
            isHost: isHostLeft,
            playerCount: room.seats.filter((s) => s.connected).length,
            players: room.seats.filter((s) => s.connected).map((s) => ({
              id: s.id, name: s.name, isHost: s.isHost,
            })),
            canReconnect: true,
            graceMs: RECONNECT_GRACE_MS,
          });
          logRoom(ws.roomCode, "player-left", `${seat.name}(${ws.playerId})${isHostLeft ? " [HOST]" : ""} (grace=${RECONNECT_GRACE_MS}ms)`);

          if (isHostLeft) {
            if (room.roundTimer) { clearTimeout(room.roundTimer); room.roundTimer = null; }
            room.isPaused = false;
            room.pauseRemainingMs = null;
          }

          scheduleGraceCleanup(room, ws.playerId);
        } else {
          broadcastToRoom(room, {
            type: "room:player-left",
            playerId: ws.playerId,
            playerName: seat.name,
            isHost: isHostLeft,
            playerCount: room.seats.filter((s) => s.connected).length,
            players: room.seats.filter((s) => s.connected).map((s) => ({
              id: s.id, name: s.name, isHost: s.isHost,
            })),
            canReconnect: false,
          });
          logRoom(ws.roomCode, "player-left", `${seat.name}(${ws.playerId})${isHostLeft ? " [HOST]" : ""} (immediate)`);

          if (isHostLeft) {
            if (room.roundTimer) { clearTimeout(room.roundTimer); room.roundTimer = null; }
            room.isPaused = false;
            room.pauseRemainingMs = null;
          }
        }
      }
      if (room.seats.every((s) => !s.connected)) {
        if (room.roundTimer) clearTimeout(room.roundTimer);
        rooms.delete(ws.roomCode);
        logRoom(ws.roomCode, "destroyed", "all disconnected");
      }
    }
    ws.roomCode = null;
  }
  ws.playerId = null;
}

function scheduleGraceCleanup(room, playerId) {
  setTimeout(() => {
    if (!rooms.has(room.code)) return;
    const seat = room.seats.find((s) => s.id === playerId);
    if (!seat || seat.connected) return;
    room.seats = room.seats.filter((s) => s.id !== playerId);
    logRoom(room.code, "grace-expire", `${seat.name}(${playerId}) removed after grace`);
    broadcastToRoom(room, {
      type: "room:player-removed",
      playerId: playerId,
      playerName: seat.name,
      playerCount: room.seats.filter((s) => s.connected).length,
      players: room.seats.filter((s) => s.connected).map((s) => ({
        id: s.id, name: s.name, isHost: s.isHost,
      })),
    });
    if (room.seats.every((s) => !s.connected)) {
      if (room.roundTimer) clearTimeout(room.roundTimer);
      rooms.delete(room.code);
      logRoom(room.code, "destroyed", "all disconnected after grace");
    }
  }, RECONNECT_GRACE_MS);
}

function handleMessage(ws, msg) {
  if (!msg || !msg.type) return;

  if (msg.type.startsWith("room:") || msg.type.startsWith("game:") || msg.type === "ping" || msg.type === "chat") {
    handleRoomMessage(ws, msg);
  } else if (msg.type.startsWith("lan:")) {
    handleLanRelay(ws, msg);
  } else {
    sendJson(ws, { type: "error", reason: "Unknown message type: " + msg.type });
  }
}

function handleRoomMessage(ws, msg) {
  switch (msg.type) {
    case "room:create": {
      const code = genRoomCode();
      const pid = genPlayerId();
      const name = String(msg.playerName || "Host").slice(0, 12);
      const roomName = String(msg.roomName || name + "的房间").slice(0, 20);
      const visibility = msg.visibility === "private" ? "private" : "public";
      const password = visibility === "private" ? String(msg.password || genRoomCode()) : "";
      ws.playerId = pid;
      ws.roomCode = code;
      clients.set(pid, ws);
      rooms.set(code, {
        code,
        hostId: pid,
        hostName: name,
        roomName,
        visibility,
        password,
        seats: [{ id: pid, name, isHost: true, connected: true }],
        state: "waiting",
        maxPlayers: 4,
        roundTimer: null,
        roundStartTime: 0,
        roundSeconds: 30,
        isPaused: false,
        pauseRemainingMs: null,
        humanBidsThisRound: {},
      });
      sendJson(ws, {
        type: "room:created",
        roomCode: code,
        playerId: pid,
        playerName: name,
        isHost: true,
        roomName,
        visibility,
        password: visibility === "private" ? password : undefined,
      });
      console.log(`[room] ${code} created by ${name}(${pid}) vis=${visibility}`);
      break;
    }

    case "room:join": {
      const code = String(msg.roomCode || "").toUpperCase();
      const room = rooms.get(code);
      if (!room) {
        sendJson(ws, { type: "room:join-failed", reason: "Room not found" });
        return;
      }
      if (room.seats.filter((s) => s.connected).length >= room.maxPlayers) {
        sendJson(ws, { type: "room:join-failed", reason: "Room is full" });
        return;
      }
      if (room.state !== "waiting") {
        sendJson(ws, { type: "room:join-failed", reason: "Game already started" });
        return;
      }
      if (room.visibility === "private") {
        const inputPassword = String(msg.password || "");
        if (inputPassword !== room.password) {
          sendJson(ws, { type: "room:join-failed", reason: "Wrong password" });
          return;
        }
      }
      const pid = genPlayerId();
      const name = String(msg.playerName || "Player").slice(0, 12);
      ws.playerId = pid;
      ws.roomCode = code;
      clients.set(pid, ws);
      room.seats.push({ id: pid, name, isHost: false, connected: true });

      sendJson(ws, {
        type: "room:joined",
        roomCode: code,
        playerId: pid,
        playerName: name,
        isHost: false,
        players: room.seats.filter((s) => s.connected).map((s) => ({
          id: s.id, name: s.name, isHost: s.isHost,
        })),
      });

      broadcastToRoom(room, {
        type: "room:player-joined",
        playerId: pid,
        playerName: name,
        playerCount: room.seats.filter((s) => s.connected).length,
        players: room.seats.filter((s) => s.connected).map((s) => ({
          id: s.id, name: s.name, isHost: s.isHost,
        })),
      }, pid);
      console.log(`[room] ${name}(${pid}) joined ${code}`);
      break;
    }

    case "room:leave": {
      removePlayer(ws, true);
      break;
    }

    case "room:list": {
      const roomList = [];
      for (const [code, room] of rooms) {
        if (room.state !== "waiting") continue;
        const playerCount = room.seats.filter((s) => s.connected).length;
        roomList.push({
          code,
          roomName: room.roomName || room.hostName + "的房间",
          hostName: room.hostName || "Host",
          visibility: room.visibility || "public",
          playerCount,
          maxPlayers: room.maxPlayers,
        });
      }
      sendJson(ws, { type: "room:list", rooms: roomList });
      break;
    }

    case "room:reconnect": {
      const code = String(msg.roomCode || "").toUpperCase();
      const oldPid = String(msg.playerId || "");
      const room = rooms.get(code);
      if (!room) {
        sendJson(ws, { type: "room:reconnect-failed", reason: "Room not found" });
        return;
      }
      const seat = room.seats.find((s) => s.id === oldPid);
      if (!seat) {
        sendJson(ws, { type: "room:reconnect-failed", reason: "Player not found in room" });
        return;
      }
      if (seat.connected) {
        sendJson(ws, { type: "room:reconnect-failed", reason: "Player already connected" });
        return;
      }
      if (seat.disconnectedAt && Date.now() - seat.disconnectedAt > RECONNECT_GRACE_MS) {
        sendJson(ws, { type: "room:reconnect-failed", reason: "Reconnect grace period expired" });
        return;
      }

      ws.playerId = oldPid;
      ws.roomCode = code;
      clients.set(oldPid, ws);
      seat.connected = true;
      seat.disconnectedAt = null;

      sendJson(ws, {
        type: "room:reconnected",
        roomCode: code,
        playerId: oldPid,
        playerName: seat.name,
        isHost: seat.isHost,
        players: room.seats.filter((s) => s.connected).map((s) => ({
          id: s.id, name: s.name, isHost: s.isHost,
        })),
        roomState: room.state,
      });

      broadcastToRoom(room, {
        type: "room:player-reconnected",
        playerId: oldPid,
        playerName: seat.name,
        playerCount: room.seats.filter((s) => s.connected).length,
        players: room.seats.filter((s) => s.connected).map((s) => ({
          id: s.id, name: s.name, isHost: s.isHost,
        })),
      }, oldPid);
      logRoom(code, "reconnect", `${seat.name}(${oldPid}) reconnected`);
      break;
    }

    case "game:full-sync-request": {
      if (!ws.roomCode || !ws.playerId) return;
      const syncRoom = rooms.get(ws.roomCode);
      if (!syncRoom || syncRoom.hostId === ws.playerId) return;
      const hostWs = clients.get(syncRoom.hostId);
      if (hostWs) {
        sendJson(hostWs, {
          type: "lan:full-sync-request",
          playerId: ws.playerId,
          ts: Date.now(),
        });
        logRoom(ws.roomCode, "full-sync-request", `from ${ws.playerId}`);
      }
      break;
    }

    case "room:kick": {
      if (!ws.roomCode || !ws.playerId) return;
      const kickRoom = rooms.get(ws.roomCode);
      if (!kickRoom || kickRoom.hostId !== ws.playerId) return;
      const targetId = msg.playerId;
      if (!targetId || targetId === ws.playerId) return;
      const targetWs = clients.get(targetId);
      if (targetWs) {
        sendJson(targetWs, { type: "room:kicked", reason: "Kicked by host" });
        removePlayer(targetWs);
      }
      break;
    }

    case "room:slot-state": {
      if (!ws.roomCode || !ws.playerId) return;
      const slotRoom = rooms.get(ws.roomCode);
      if (!slotRoom || slotRoom.hostId !== ws.playerId) return;
      broadcastToRoom(slotRoom, {
        type: "room:slot-state",
        slots: msg.slots || [],
      }, ws.playerId);
      break;
    }

    case "game:start": {
      if (!ws.roomCode || !ws.playerId) return;
      const room = rooms.get(ws.roomCode);
      if (!room || room.hostId !== ws.playerId) return;
      room.state = "playing";
      room.humanBidsThisRound = {};
      room.restartVotes = {};

      const playersInfo = room.seats.filter((s) => s.connected).map((s, i) => ({
        id: s.id, name: s.name, seat: i, isHost: s.isHost,
      }));

      broadcastToRoom(room, {
        type: "lan:game:init",
        players: playersInfo,
        hostId: room.hostId,
        aiCount: msg.aiCount || 0,
        aiLlmEnabled: msg.aiLlmEnabled || false,
        aiPlayers: msg.aiPlayers || [],
        ts: Date.now(),
      });
      logRoom(room.code, "game-start", `players=${playersInfo.length} ai=${msg.aiCount || 0}`);
      break;
    }

    case "game:warehouse-sync": {
      if (!ws.roomCode || !ws.playerId) return;
      const wRoom = rooms.get(ws.roomCode);
      if (!wRoom || wRoom.hostId !== ws.playerId) return;
      broadcastToRoom(wRoom, {
        type: "lan:game:warehouse-sync",
        warehouse: msg.warehouse || [],
        warehouseTrueValue: msg.warehouseTrueValue || 0,
        currentBid: msg.currentBid || 0,
        aiMaxBid: msg.aiMaxBid || 0,
        ts: Date.now(),
      }, ws.playerId);
      logRoom(wRoom.code, "warehouse-sync", `items=${(msg.warehouse || []).length}`);
      break;
    }

    case "game:restart-request": {
      if (!ws.roomCode || !ws.playerId) return;
      const rRoom = rooms.get(ws.roomCode);
      if (!rRoom || rRoom.hostId !== ws.playerId) return;
      rRoom.restartVotes = {};
      rRoom.restartVotes[ws.playerId] = true;
      rRoom.restartAiCount = msg.aiCount || 0;
      rRoom.restartAiLlmEnabled = !!msg.aiLlmEnabled;
      rRoom.restartAiPlayers = msg.aiPlayers || [];
      const humanClients = rRoom.seats.filter((s) => s.connected && !s.isHost);
      if (humanClients.length === 0) {
        rRoom.state = "waiting";
        rRoom.humanBidsThisRound = {};
        const playersInfo = rRoom.seats.filter((s) => s.connected).map((s, i) => ({
          id: s.id, name: s.name, seat: i, isHost: s.isHost,
        }));
        broadcastToRoom(rRoom, {
          type: "lan:game:restart-go",
          players: playersInfo,
          hostId: rRoom.hostId,
          aiCount: rRoom.restartAiCount || 0,
          aiLlmEnabled: rRoom.restartAiLlmEnabled || false,
          aiPlayers: rRoom.restartAiPlayers,
          ts: Date.now(),
        });
        logRoom(rRoom.code, "restart-go", "no clients, direct restart");
      } else {
        broadcastToRoom(rRoom, {
          type: "lan:game:restart-vote",
          hostName: rRoom.seats.find((s) => s.id === ws.playerId)?.name || "主机",
          ts: Date.now(),
        }, ws.playerId);
        logRoom(rRoom.code, "restart-request", "host initiated, waiting for clients");
      }
      break;
    }

    case "game:restart-accept": {
      if (!ws.roomCode || !ws.playerId) return;
      const aRoom = rooms.get(ws.roomCode);
      if (!aRoom) return;
      aRoom.restartVotes[ws.playerId] = true;
      const humanSeats = aRoom.seats.filter((s) => s.connected && !s.isHost);
      const allAccepted = humanSeats.every((s) => aRoom.restartVotes[s.id]);
      if (allAccepted) {
        aRoom.state = "waiting";
        aRoom.humanBidsThisRound = {};
        const playersInfo = aRoom.seats.filter((s) => s.connected).map((s, i) => ({
          id: s.id, name: s.name, seat: i, isHost: s.isHost,
        }));
        broadcastToRoom(aRoom, {
          type: "lan:game:restart-go",
          players: playersInfo,
          hostId: aRoom.hostId,
          aiCount: aRoom.restartAiCount || 0,
          aiLlmEnabled: aRoom.restartAiLlmEnabled || false,
          aiPlayers: aRoom.restartAiPlayers || [],
          ts: Date.now(),
        });
        logRoom(aRoom.code, "restart-go", "all accepted");
      }
      break;
    }

    case "game:restart-decline": {
      if (!ws.roomCode || !ws.playerId) return;
      const dRoom = rooms.get(ws.roomCode);
      if (!dRoom) return;
      dRoom.restartVotes = {};
      broadcastToRoom(dRoom, {
        type: "lan:game:restart-cancelled",
        decliner: dRoom.seats.find((s) => s.id === ws.playerId)?.name || "客机",
        ts: Date.now(),
      });
      logRoom(dRoom.code, "restart-cancelled", "declined by " + ws.playerId);
      break;
    }

    case "ping": {
      sendJson(ws, { type: "pong", ts: msg.ts });
      break;
    }

    case "chat": {
      if (!ws.roomCode || !ws.playerId) return;
      const room = rooms.get(ws.roomCode);
      if (!room) return;
      const seat = room.seats.find((s) => s.id === ws.playerId);
      const text = String(msg.text || "").slice(0, 200);
      broadcastToRoom(room, {
        type: "chat",
        from: ws.playerId,
        fromName: seat ? seat.name : "?",
        text,
        ts: Date.now(),
      });
      break;
    }
  }
}

function handleLanRelay(ws, msg) {
  if (!ws.playerId || !ws.roomCode) return;
  const room = rooms.get(ws.roomCode);
  if (!room) return;

  switch (msg.type) {
    case "lan:round:start": {
      if (ws.playerId !== room.hostId) return;
      room.humanBidsThisRound = {};
      room.roundSeconds = msg.roundSeconds || 30;
      room.roundStartTime = Date.now();
      room.isPaused = false;
      room.pauseRemainingMs = null;

      if (room.roundTimer) clearTimeout(room.roundTimer);
      room.roundTimer = setTimeout(() => {
        if (room.isPaused) {
          logRoom(room.code, "round-timeout", `blocked (paused)`);
          room.roundTimer = null;
          return;
        }
        logRoom(room.code, "round-timeout", `round expired after ${room.roundSeconds}s`);
        broadcastToRoom(room, {
          type: "lan:round:timeout",
          round: msg.round,
          ts: Date.now(),
        });
        room.roundTimer = null;
      }, room.roundSeconds * 1000);

      broadcastToRoom(room, {
        type: "lan:round:start",
        round: msg.round,
        maxRounds: msg.maxRounds,
        currentBid: msg.currentBid,
        roundSeconds: msg.roundSeconds,
        ts: Date.now(),
      });
      logRoom(room.code, "round-start", `round=${msg.round} currentBid=${msg.currentBid} time=${msg.roundSeconds}s`);
      break;
    }

    case "lan:bid:submit": {
      const seat = room.seats.find((s) => s.id === ws.playerId);
      if (!seat) return;

      room.humanBidsThisRound[ws.playerId] = msg.bid;

      sendJson(ws, {
        type: "lan:round:bid-ack",
        playerId: ws.playerId,
        bid: msg.bid,
        ts: Date.now(),
      });

      broadcastToRoom(room, {
        type: "lan:bid:received",
        playerId: ws.playerId,
        playerName: seat.name,
        bid: msg.bid,
        ts: Date.now(),
      }, ws.playerId);

      logRoom(room.code, "bid-submit", `${seat.name} bid=${msg.bid}`);

      const hostWs = clients.get(room.hostId);
      if (hostWs) {
        const allSeats = room.seats.filter((s) => s.connected);
        const allIn = allSeats.every((s) => room.humanBidsThisRound[s.id] !== undefined);
        if (allIn) {
          sendJson(hostWs, {
            type: "lan:all-bids-in",
            bids: room.humanBidsThisRound,
            ts: Date.now(),
          });
          logRoom(room.code, "all-bids-in", "all humans submitted");
        }
      }
      break;
    }

    case "lan:round:result": {
      if (ws.playerId !== room.hostId) return;
      if (room.roundTimer) {
        clearTimeout(room.roundTimer);
        room.roundTimer = null;
      }
      broadcastToRoom(room, msg);
      logRoom(room.code, "round-result", `round=${msg.round} bids=${JSON.stringify(msg.bids ? msg.bids.length : 0)}`);
      break;
    }

    case "lan:game:settle": {
      if (ws.playerId !== room.hostId) return;
      if (room.roundTimer) {
        clearTimeout(room.roundTimer);
        room.roundTimer = null;
      }
      broadcastToRoom(room, msg);
      logRoom(room.code, "game-settle", `winner=${msg.winnerName} bid=${msg.winnerBid}`);
      break;
    }

    case "lan:game:settle-final": {
      if (ws.playerId !== room.hostId) return;
      broadcastToRoom(room, msg);
      room.state = "waiting";
      room.humanBidsThisRound = {};
      if (room.roundTimer) { clearTimeout(room.roundTimer); room.roundTimer = null; }
      room.isPaused = false;
      room.pauseRemainingMs = null;
      logRoom(room.code, "settle-final", "wallets broadcasted, room reset to waiting");
      break;
    }

    case "lan:ai-bids-ready": {
      if (ws.playerId !== room.hostId) return;
      broadcastToRoom(room, msg, ws.playerId);
      logRoom(room.code, "ai-bids-ready", `ai count=${(msg.aiPlayerIds || []).length}`);
      break;
    }

    case "lan:ai-item-use": {
      if (ws.playerId !== room.hostId) return;
      broadcastToRoom(room, msg, ws.playerId);
      logRoom(room.code, "ai-item-use", `ai=${msg.aiPlayerId}`);
      break;
    }

    case "lan:player-action": {
      broadcastToRoom(room, msg, ws.playerId);
      logRoom(room.code, "player-action", `player=${ws.playerId} action=${msg.actionId}`);
      break;
    }

    case "lan:public-info": {
      if (ws.playerId !== room.hostId) return;
      broadcastToRoom(room, msg, ws.playerId);
      break;
    }

    case "lan:pause:toggle": {
      var actorName = room.seats.find((s) => s.id === ws.playerId)?.name || "?";
      if (msg.paused) {
        room.isPaused = true;
        if (room.roundTimer) {
          clearTimeout(room.roundTimer);
          room.roundTimer = null;
          room.pauseRemainingMs = Math.max(0, (room.roundSeconds || 30) * 1000 - (Date.now() - (room.roundStartTime || Date.now())));
          logRoom(room.code, "pause", `${actorName} paused | remaining=${Math.ceil(room.pauseRemainingMs / 1000)}s`);
        } else {
          room.pauseRemainingMs = room.pauseRemainingMs || 0;
          logRoom(room.code, "pause", `${actorName} paused | no active timer`);
        }
      } else {
        room.isPaused = false;
        if (room.pauseRemainingMs != null && room.pauseRemainingMs > 0) {
          room.roundStartTime = Date.now() - ((room.roundSeconds || 30) * 1000 - room.pauseRemainingMs);
          logRoom(room.code, "pause", `${actorName} resumed | timer=${Math.ceil(room.pauseRemainingMs / 1000)}s`);
          room.roundTimer = setTimeout(() => {
            if (room.isPaused) {
              logRoom(room.code, "round-timeout", `blocked (paused)`);
              room.roundTimer = null;
              return;
            }
            logRoom(room.code, "round-timeout", `round expired after pause resume`);
            broadcastToRoom(room, {
              type: "lan:round:timeout",
              ts: Date.now(),
            });
            room.roundTimer = null;
            room.pauseRemainingMs = null;
          }, room.pauseRemainingMs);
        } else {
          logRoom(room.code, "pause", `${actorName} resumed | no pauseRemainingMs, timer NOT restarted`);
        }
        room.pauseRemainingMs = null;
      }
      var serverTimeLeft;
      if (msg.paused) {
        serverTimeLeft = room.pauseRemainingMs != null
          ? Math.ceil(room.pauseRemainingMs / 1000)
          : msg.roundTimeLeft;
      } else {
        serverTimeLeft = room.roundStartTime
          ? Math.max(0, Math.ceil((room.roundSeconds * 1000 - (Date.now() - room.roundStartTime)) / 1000))
          : msg.roundTimeLeft;
      }
      logRoom(room.code, "pause", `${msg.paused ? "paused" : "resumed"} | serverTimeLeft=${serverTimeLeft}s`);
      broadcastToRoom(room, {
        type: "lan:pause:state",
        paused: msg.paused,
        by: actorName,
        roundTimeLeft: serverTimeLeft,
        ts: Date.now(),
      });
      break;
    }

    case "lan:ping": {
      sendJson(ws, { type: "lan:pong", ts: msg.ts });
      break;
    }

    case "lan:full-sync": {
      if (ws.playerId !== room.hostId) return;
      var targetId = msg.playerId;
      if (targetId) {
        var targetWs = clients.get(targetId);
        if (targetWs) {
          sendJson(targetWs, msg);
          logRoom(room.code, "full-sync", `sent to ${targetId}`);
        }
      } else {
        broadcastToRoom(room, msg, ws.playerId);
        logRoom(room.code, "full-sync", "broadcast to all clients");
      }
      break;
    }

    default:
      logRoom(room.code, "unknown-lan", msg.type);
  }
}

function getLocalIPs() {
  const os = require("os");
  const nets = os.networkInterfaces();
  const results = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) {
        results.push({ name, address: net.address });
      }
    }
  }
  return results;
}

function buildRoomListJSON() {
  const roomList = [];
  for (const [code, room] of rooms) {
    if (room.state !== "waiting") continue;
    const playerCount = room.seats.filter((s) => s.connected).length;
    roomList.push({
      code,
      roomName: room.roomName || room.hostName + "的房间",
      hostName: room.hostName || "Host",
      visibility: room.visibility || "public",
      playerCount,
      maxPlayers: room.maxPlayers,
    });
  }
  const remoteList = [];
  const now = Date.now();
  for (const [key, val] of remoteRooms) {
    if (now - val.ts > REMOTE_ROOM_TTL) continue;
    remoteList.push({
      serverIp: val.serverIp,
      ...val.room,
    });
  }
  return JSON.stringify({ rooms: roomList, remoteRooms: remoteList });
}

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url.startsWith("/api/deepseek/")) {
    if (req.method !== "POST") {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try {
        const parsed = JSON.parse(body);
        let targetUrl = "https://api.deepseek.com" + req.url.replace("/api/deepseek", "/v1");
        const headers = { "Content-Type": "application/json" };
        if (parsed.apiKey) {
          headers["Authorization"] = "Bearer " + parsed.apiKey;
          delete parsed.apiKey;
        }
        if (parsed.proxyTarget) {
          targetUrl = parsed.proxyTarget;
          delete parsed.proxyTarget;
        }
        const forwardBody = JSON.stringify(parsed);

        const proxyReq = https.request(targetUrl, {
          method: "POST",
          headers,
          timeout: 60000,
        }, (proxyRes) => {
          res.writeHead(proxyRes.statusCode, {
            "Content-Type": "application/json; charset=utf-8",
          });
          proxyRes.pipe(res);
        });
        proxyReq.on("error", (err) => {
          res.writeHead(502, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: err.message, code: "PROXY_ERROR" }));
        });
        proxyReq.on("timeout", () => {
          proxyReq.destroy();
          res.writeHead(504, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "upstream timeout", code: "TIMEOUT" }));
        });
        proxyReq.write(forwardBody);
        proxyReq.end();
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", rooms: rooms.size, clients: clients.size, uptime: process.uptime() }));
    return;
  }

  if (req.url === "/rooms" || req.url === "/rooms/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(buildRoomListJSON());
    return;
  }

  let urlPath = req.url.split("?")[0];
  if (urlPath === "/") urlPath = "/index.html";

  const ROOT_DIR = path.join(__dirname, "..", "..");
  let baseDir = ROOT_DIR;
  if (urlPath === "/lan-bridge.js") {
    baseDir = CLIENT_DIR;
  }

  const filePath = path.join(baseDir, urlPath);
  const resolved = path.resolve(filePath);
  const allowedBase = urlPath === "/lan-bridge.js" ? path.resolve(CLIENT_DIR) : path.resolve(ROOT_DIR);
  if (!resolved.startsWith(allowedBase)) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }

  fs.readFile(resolved, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    const ext = path.extname(resolved).toLowerCase();
    const mime = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": mime });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  ws.playerId = null;
  ws.roomCode = null;

  console.log("[ws] new connection");

  ws.on("message", (data) => {
    let msg;
    try { msg = JSON.parse(data.toString("utf8")); } catch (_) { return; }
    handleMessage(ws, msg);
  });

  ws.on("close", (code) => {
    console.log("[ws] closed code=" + code + " player=" + (ws.playerId || "unknown"));
    removePlayer(ws);
  });

  ws.on("error", (err) => {
    console.log("[ws] error: " + err.message);
    removePlayer(ws);
  });
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.log("[ERROR] Port " + PORT + " already in use!");
    console.log("  Try: taskkill /F /IM node.exe");
  } else {
    console.log("[ERROR] " + err.message);
  }
  process.exit(1);
});

server.listen(PORT, "0.0.0.0", () => {
  const ips = getLocalIPs();
  console.log("========================================");
  console.log("  Mobao Warehouse - LAN Relay v0.4.0");
  console.log("  (Host-Authority Architecture)");
  console.log("========================================");
  console.log(`  Local:   ws://localhost:${PORT}`);
  for (const ip of ips) console.log(`  LAN:     ws://${ip.address}:${PORT}`);
  console.log("----------------------------------------");
  console.log(`  Test:    http://localhost:${PORT}`);
  for (const ip of ips) console.log(`  LAN Web: http://${ip.address}:${PORT}`);
  console.log(`  Rooms:   http://localhost:${PORT}/rooms`);
  console.log("========================================");

  if (process.argv.includes("--open-browser")) {
    const url = `http://localhost:${PORT}`;
    const cmd = process.platform === "win32" ? "start" : process.platform === "darwin" ? "open" : "xdg-open";
    require("child_process").exec(cmd + " " + url);
    console.log("[auto] Browser opened: " + url);
  }
});

const remoteRooms = new Map();
const REMOTE_ROOM_TTL = 8000;

const udpSocket = dgram.createSocket("udp4");
udpSocket.on("message", (data, rinfo) => {
  try {
    const localIPs = getLocalIPs().map(ip => ip.address);
    if (localIPs.includes(rinfo.address) || rinfo.address === "127.0.0.1") return;
    const parsed = JSON.parse(data.toString("utf8"));
    if (parsed && parsed.rooms && Array.isArray(parsed.rooms)) {
      const serverIp = rinfo.address;
      for (const room of parsed.rooms) {
        remoteRooms.set(serverIp + ":" + room.code, {
          serverIp,
          room,
          ts: Date.now(),
        });
      }
      for (const [key, val] of remoteRooms) {
        if (val.serverIp === serverIp && !parsed.rooms.find((r) => serverIp + ":" + r.code === key)) {
          remoteRooms.delete(key);
        }
      }
    }
  } catch (_) { }
});

setInterval(() => {
  const now = Date.now();
  for (const [key, val] of remoteRooms) {
    if (now - val.ts > REMOTE_ROOM_TTL) remoteRooms.delete(key);
  }
}, 3000);

udpSocket.bind(DISCOVERY_PORT, () => {
  udpSocket.setBroadcast(true);
  console.log(`[udp] listening on port ${DISCOVERY_PORT} for room broadcasts`);
});

setInterval(() => {
  const ips = getLocalIPs();
  if (ips.length === 0) return;
  const payload = Buffer.from(buildRoomListJSON(), "utf8");
  for (const ip of ips) {
    const subnet = ip.address.split(".").slice(0, 3).join(".") + ".255";
    udpSocket.send(payload, DISCOVERY_PORT, subnet, (err) => {
      if (err) console.log("[udp] broadcast error:", err.message);
    });
  }
}, 2000);

package com.mobao.game;

import org.java_websocket.WebSocket;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.server.WebSocketServer;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonElement;

import java.net.InetSocketAddress;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Timer;
import java.util.TimerTask;
import java.util.concurrent.ConcurrentHashMap;

@SuppressWarnings("unchecked")
public class GameServer extends WebSocketServer {

    private static final int PORT = 9720;
    private static final int ROOM_CODE_LEN = 4;
    private static final String CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final int MAX_PLAYERS = 4;
    private static final int DEFAULT_START_MONEY = 500000;
    private static final long RECONNECT_GRACE_MS = 30000L;
    private static final int DISCOVERY_PORT = 9721;

    private final Gson gson = new Gson();
    private final SecureRandom random = new SecureRandom();
    private final Map<String, Room> rooms = new ConcurrentHashMap<>();
    private final Map<String, WebSocket> clients = new ConcurrentHashMap<>();
    private ServerEventListener eventListener;
    private volatile boolean running = false;
    private Thread udpBroadcastThread;
    private Thread udpListenThread;
    private java.net.ServerSocket discoveryHttpServer;
    private final Map<String, RemoteRoomEntry> remoteRooms = new ConcurrentHashMap<>();
    private static final long REMOTE_ROOM_TTL = 8000L;

    static class RemoteRoomEntry {
        String serverIp;
        Map<String, Object> room;
        long ts;

        RemoteRoomEntry(String ip, Map<String, Object> r, long t) {
            serverIp = ip;
            room = r;
            ts = t;
        }
    }

    public interface ServerEventListener {
        void onServerStarted(String ip, int port);

        void onServerStopped();

        void onLog(String message);
    }

    static class Seat {
        String id;
        String name;
        boolean isHost;
        boolean connected;
        Long disconnectedAt;

        Seat(String id, String name, boolean isHost) {
            this.id = id;
            this.name = name;
            this.isHost = isHost;
            this.connected = true;
            this.disconnectedAt = null;
        }
    }

    static class Room {
        String code;
        String hostId;
        String hostName;
        String roomName;
        String visibility = "public";
        String password = "";
        List<Seat> seats = new ArrayList<>();
        String state = "waiting";
        int maxPlayers = MAX_PLAYERS;
        Timer roundTimer = null;
        long roundStartTime = 0;
        int roundSeconds = 30;
        boolean isPaused = false;
        Long pauseRemainingMs = null;
        Map<String, Long> humanBidsThisRound = new HashMap<>();
        Map<String, Boolean> restartVotes = new HashMap<>();
        int restartAiCount = 0;
        boolean restartAiLlmEnabled = false;
        List<Map<String, Object>> restartAiPlayers = new ArrayList<>();
        int currentRound = 0;
    }

    public GameServer() {
        super(new InetSocketAddress(PORT));
        setConnectionLostTimeout(30);
    }

    public void setEventListener(ServerEventListener listener) {
        this.eventListener = listener;
    }

    private volatile boolean serverRunning = false;

    public boolean isRunning() {
        return serverRunning;
    }

    @Override
    public void onStart() {
        serverRunning = true;
        running = true;
        startDiscoveryHttpServer();
        startUdpListen();
        startUdpBroadcast();
        startRemoteRoomCleanup();
        log("========================================");
        log("  Mobao Warehouse - LAN Relay (Android)");
        log("  Port: " + PORT);
        log("  Discovery: HTTP :9721/rooms + UDP broadcast");
        log("========================================");
        if (eventListener != null) {
            eventListener.onServerStarted("0.0.0.0", PORT);
        }
    }

    @Override
    public void stop() throws InterruptedException {
        serverRunning = false;
        running = false;
        stopDiscoveryServices();
        super.stop();
    }

    @Override
    public void stop(int timeout) throws InterruptedException {
        serverRunning = false;
        running = false;
        stopDiscoveryServices();
        super.stop(timeout);
    }

    private String buildRoomListJSON() {
        List<Map<String, Object>> roomList = new ArrayList<>();
        for (Map.Entry<String, Room> entry : rooms.entrySet()) {
            Room r = entry.getValue();
            if (!"waiting".equals(r.state))
                continue;
            long playerCount = r.seats.stream().filter(s -> s.connected).count();
            Map<String, Object> ri = new HashMap<>();
            ri.put("code", r.code);
            ri.put("roomName", r.roomName != null ? r.roomName : (r.hostName != null ? r.hostName + "的房间" : "房间"));
            ri.put("hostName", r.hostName != null ? r.hostName : "Host");
            ri.put("visibility", r.visibility != null ? r.visibility : "public");
            ri.put("playerCount", playerCount);
            ri.put("maxPlayers", r.maxPlayers);
            roomList.add(ri);
        }
        List<Map<String, Object>> remoteList = new ArrayList<>();
        long now = System.currentTimeMillis();
        for (Map.Entry<String, RemoteRoomEntry> entry : remoteRooms.entrySet()) {
            RemoteRoomEntry re = entry.getValue();
            if (now - re.ts > REMOTE_ROOM_TTL)
                continue;
            Map<String, Object> ri = new HashMap<>();
            ri.put("serverIp", re.serverIp);
            ri.putAll(re.room);
            remoteList.add(ri);
        }
        Map<String, Object> result = new HashMap<>();
        result.put("rooms", roomList);
        result.put("remoteRooms", remoteList);
        return gson.toJson(result);
    }

    private void startDiscoveryHttpServer() {
        new Thread(() -> {
            try {
                discoveryHttpServer = new java.net.ServerSocket(DISCOVERY_PORT, 0, InetAddress.getByName("0.0.0.0"));
                while (running) {
                    try (java.net.Socket client = discoveryHttpServer.accept()) {
                        client.setSoTimeout(30000);
                        java.io.BufferedReader reader = new java.io.BufferedReader(
                                new java.io.InputStreamReader(client.getInputStream()));
                        StringBuilder headerBuf = new StringBuilder();
                        String requestLine = reader.readLine();
                        if (requestLine == null)
                            continue;
                        String line;
                        int contentLength = 0;
                        while ((line = reader.readLine()) != null && !line.isEmpty()) {
                            headerBuf.append(line).append("\n");
                            if (line.toLowerCase().startsWith("content-length:")) {
                                try {
                                    contentLength = Integer.parseInt(line.substring(15).trim());
                                } catch (Exception ignored) {
                                }
                            }
                        }
                        String body = "";
                        if (contentLength > 0 && contentLength <= 65536) {
                            char[] bodyChars = new char[contentLength];
                            reader.read(bodyChars, 0, contentLength);
                            body = new String(bodyChars);
                        }

                        if (requestLine.startsWith("OPTIONS")) {
                            String cors = "HTTP/1.1 204 No Content\r\n"
                                    + "Access-Control-Allow-Origin: *\r\n"
                                    + "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
                                    + "Access-Control-Allow-Headers: Content-Type, Authorization\r\n"
                                    + "Access-Control-Max-Age: 86400\r\n"
                                    + "Connection: close\r\n\r\n";
                            client.getOutputStream().write(cors.getBytes("UTF-8"));
                            client.getOutputStream().flush();
                        } else if (requestLine.contains("/rooms") || requestLine.contains("/health")) {
                            String json = buildRoomListJSON();
                            String response = "HTTP/1.1 200 OK\r\n"
                                    + "Content-Type: application/json; charset=utf-8\r\n"
                                    + "Access-Control-Allow-Origin: *\r\n"
                                    + "Content-Length: " + json.getBytes("UTF-8").length + "\r\n"
                                    + "Connection: close\r\n\r\n" + json;
                            client.getOutputStream().write(response.getBytes("UTF-8"));
                            client.getOutputStream().flush();
                        }
                    } catch (Exception ignored) {
                    }
                }
            } catch (Exception e) {
                log("[discovery-http] error: " + e.getMessage());
            }
        }, "discovery-http").start();
    }

    private void startUdpListen() {
        udpListenThread = new Thread(() -> {
            try (DatagramSocket socket = new DatagramSocket(DISCOVERY_PORT)) {
                socket.setReuseAddress(true);
                byte[] buf = new byte[4096];
                while (running) {
                    try {
                        DatagramPacket packet = new DatagramPacket(buf, buf.length);
                        socket.receive(packet);
                        String json = new String(packet.getData(), 0, packet.getLength(), "UTF-8");
                        JsonObject parsed = gson.fromJson(json, JsonObject.class);
                        if (parsed != null && parsed.has("rooms")) {
                            String serverIp = packet.getAddress().getHostAddress();
                            boolean isOwnIp = serverIp.equals("127.0.0.1");
                            if (!isOwnIp) {
                                Enumeration<NetworkInterface> ifaces = NetworkInterface.getNetworkInterfaces();
                                while (ifaces != null && ifaces.hasMoreElements()) {
                                    for (InetAddress addr : Collections.list(ifaces.nextElement().getInetAddresses())) {
                                        if (addr.getHostAddress().equals(serverIp)) {
                                            isOwnIp = true;
                                            break;
                                        }
                                    }
                                    if (isOwnIp)
                                        break;
                                }
                            }
                            if (isOwnIp)
                                continue;
                            JsonArray roomsArr = parsed.getAsJsonArray("rooms");
                            for (JsonElement elem : roomsArr) {
                                JsonObject roomObj = elem.getAsJsonObject();
                                String code = roomObj.has("code") ? roomObj.get("code").getAsString() : "";
                                Map<String, Object> roomMap = new HashMap<>();
                                roomMap.put("code", code);
                                if (roomObj.has("roomName"))
                                    roomMap.put("roomName", roomObj.get("roomName").getAsString());
                                if (roomObj.has("hostName"))
                                    roomMap.put("hostName", roomObj.get("hostName").getAsString());
                                if (roomObj.has("visibility"))
                                    roomMap.put("visibility", roomObj.get("visibility").getAsString());
                                if (roomObj.has("playerCount"))
                                    roomMap.put("playerCount", roomObj.get("playerCount").getAsLong());
                                if (roomObj.has("maxPlayers"))
                                    roomMap.put("maxPlayers", roomObj.get("maxPlayers").getAsInt());
                                remoteRooms.put(serverIp + ":" + code,
                                        new RemoteRoomEntry(serverIp, roomMap, System.currentTimeMillis()));
                            }
                            Iterator<Map.Entry<String, RemoteRoomEntry>> iter = remoteRooms.entrySet().iterator();
                            while (iter.hasNext()) {
                                Map.Entry<String, RemoteRoomEntry> entry = iter.next();
                                if (entry.getValue().serverIp.equals(serverIp)) {
                                    boolean found = false;
                                    for (JsonElement e : roomsArr) {
                                        String eCode = e.getAsJsonObject().has("code")
                                                ? e.getAsJsonObject().get("code").getAsString()
                                                : "";
                                        if ((serverIp + ":" + eCode).equals(entry.getKey())) {
                                            found = true;
                                            break;
                                        }
                                    }
                                    if (!found)
                                        iter.remove();
                                }
                            }
                        }
                    } catch (Exception ignored) {
                    }
                }
            } catch (Exception e) {
                log("[udp-listen] error: " + e.getMessage());
            }
        }, "udp-listen");
        udpListenThread.start();
    }

    private void startRemoteRoomCleanup() {
        new Thread(() -> {
            while (running) {
                try {
                    Thread.sleep(3000);
                } catch (InterruptedException e) {
                    break;
                }
                long now = System.currentTimeMillis();
                remoteRooms.entrySet().removeIf(e -> now - e.getValue().ts > REMOTE_ROOM_TTL);
            }
        }, "remote-room-cleanup").start();
    }

    private void startUdpBroadcast() {
        udpBroadcastThread = new Thread(() -> {
            try (DatagramSocket udpSocket = new DatagramSocket()) {
                udpSocket.setBroadcast(true);
                while (running) {
                    try {
                        String json = buildRoomListJSON();
                        byte[] data = json.getBytes("UTF-8");
                        Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
                        while (interfaces != null && interfaces.hasMoreElements()) {
                            NetworkInterface iface = interfaces.nextElement();
                            if (iface.isLoopback() || !iface.isUp())
                                continue;
                            Enumeration<InetAddress> addresses = iface.getInetAddresses();
                            while (addresses.hasMoreElements()) {
                                InetAddress addr = addresses.nextElement();
                                if (addr.isLoopbackAddress() || addr.getHostAddress().contains(":"))
                                    continue;
                                String subnet = addr.getHostAddress().substring(0,
                                        addr.getHostAddress().lastIndexOf(".") + 1) + "255";
                                DatagramPacket packet = new DatagramPacket(data, data.length,
                                        InetAddress.getByName(subnet), DISCOVERY_PORT);
                                udpSocket.send(packet);
                            }
                        }
                    } catch (Exception e) {
                        // ignore
                    }
                    try {
                        Thread.sleep(2000);
                    } catch (InterruptedException e) {
                        break;
                    }
                }
            } catch (Exception e) {
                log("[udp-broadcast] error: " + e.getMessage());
            }
        }, "udp-broadcast");
        udpBroadcastThread.start();
    }

    private void stopDiscoveryServices() {
        running = false;
        try {
            if (discoveryHttpServer != null && !discoveryHttpServer.isClosed()) {
                discoveryHttpServer.close();
                discoveryHttpServer = null;
            }
        } catch (Exception ignored) {
        }
        if (udpBroadcastThread != null) {
            udpBroadcastThread.interrupt();
            udpBroadcastThread = null;
        }
        if (udpListenThread != null) {
            udpListenThread.interrupt();
            udpListenThread = null;
        }
        remoteRooms.clear();
    }

    public int getPort() {
        return PORT;
    }

    private void log(String msg) {
        if (eventListener != null) {
            eventListener.onLog(msg);
        }
    }

    private String genRoomCode() {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < ROOM_CODE_LEN; i++) {
            sb.append(CODE_CHARS.charAt(random.nextInt(CODE_CHARS.length())));
        }
        String code = sb.toString();
        return rooms.containsKey(code) ? genRoomCode() : code;
    }

    private String genPlayerId() {
        byte[] bytes = new byte[4];
        random.nextBytes(bytes);
        StringBuilder sb = new StringBuilder("p");
        for (byte b : bytes) {
            sb.append(String.format("%02x", b & 0xff));
        }
        return sb.toString();
    }

    private void sendJson(WebSocket ws, Map<String, Object> msg) {
        if (ws != null && ws.isOpen()) {
            ws.send(gson.toJson(msg));
        }
    }

    private void broadcastToRoom(Room room, Map<String, Object> msg, String excludeId) {
        if (room == null)
            return;
        String json = gson.toJson(msg);
        for (Seat seat : room.seats) {
            if (seat.id.equals(excludeId))
                continue;
            WebSocket c = clients.get(seat.id);
            if (c != null && c.isOpen()) {
                c.send(json);
            }
        }
    }

    private void broadcastToRoom(Room room, Map<String, Object> msg) {
        broadcastToRoom(room, msg, null);
    }

    private void logRoom(String roomCode, String action, String detail) {
        log("[room:" + roomCode + "] " + action + (detail != null && !detail.isEmpty() ? " | " + detail : ""));
    }

    private void removePlayer(WebSocket ws, boolean immediate) {
        if (ws == null)
            return;
        String pid = (String) ws.getAttachment();
        if (pid == null)
            return;

        clients.remove(pid);
        String roomCode = null;
        for (Room r : rooms.values()) {
            for (Seat s : r.seats) {
                if (s.id.equals(pid)) {
                    roomCode = r.code;
                    break;
                }
            }
            if (roomCode != null)
                break;
        }

        if (roomCode != null) {
            Room room = rooms.get(roomCode);
            if (room != null) {
                Seat seat = null;
                for (Seat s : room.seats) {
                    if (s.id.equals(pid)) {
                        seat = s;
                        break;
                    }
                }
                if (seat != null) {
                    seat.connected = false;
                    boolean isHostLeft = pid.equals(room.hostId);

                    Map<String, Object> msg = new HashMap<>();
                    msg.put("type", "room:player-left");
                    msg.put("playerId", pid);
                    msg.put("playerName", seat.name);
                    msg.put("isHost", isHostLeft);
                    msg.put("playerCount", room.seats.stream().filter(s2 -> s2.connected).count());
                    List<Map<String, Object>> playersList = new ArrayList<>();
                    for (Seat s : room.seats) {
                        if (s.connected) {
                            Map<String, Object> p = new HashMap<>();
                            p.put("id", s.id);
                            p.put("name", s.name);
                            p.put("isHost", s.isHost);
                            playersList.add(p);
                        }
                    }
                    msg.put("players", playersList);

                    if (!immediate && "playing".equals(room.state)) {
                        seat.disconnectedAt = System.currentTimeMillis();
                        msg.put("canReconnect", true);
                        msg.put("graceMs", RECONNECT_GRACE_MS);
                        logRoom(roomCode, "player-left", seat.name + "(" + pid + ")" + (isHostLeft ? " [HOST]" : "")
                                + " (grace=" + RECONNECT_GRACE_MS + "ms)");
                        scheduleGraceCleanup(room, pid);
                    } else {
                        msg.put("canReconnect", false);
                        logRoom(roomCode, "player-left",
                                seat.name + "(" + pid + ")" + (isHostLeft ? " [HOST]" : "") + " (immediate)");
                    }

                    broadcastToRoom(room, msg);

                    if (isHostLeft) {
                        if (room.roundTimer != null) {
                            room.roundTimer.cancel();
                            room.roundTimer = null;
                        }
                        room.isPaused = false;
                        room.pauseRemainingMs = null;
                    }
                }

                boolean allDisconnected = true;
                for (Seat s : room.seats) {
                    if (s.connected) {
                        allDisconnected = false;
                        break;
                    }
                }
                if (allDisconnected) {
                    if (room.roundTimer != null) {
                        room.roundTimer.cancel();
                        room.roundTimer = null;
                    }
                    rooms.remove(roomCode);
                    logRoom(roomCode, "destroyed", "all disconnected");
                }
            }
        }
    }

    private void removePlayer(WebSocket ws) {
        removePlayer(ws, false);
    }

    private void scheduleGraceCleanup(Room room, String playerId) {
        final Room roomRef = room;
        final String pid = playerId;
        new Timer().schedule(new TimerTask() {
            @Override
            public void run() {
                if (!rooms.containsKey(roomRef.code))
                    return;
                Seat seat = null;
                for (Seat s : roomRef.seats) {
                    if (s.id.equals(pid)) {
                        seat = s;
                        break;
                    }
                }
                if (seat == null || seat.connected)
                    return;
                roomRef.seats.removeIf(s -> s.id.equals(pid));
                logRoom(roomRef.code, "grace-expire", seat.name + "(" + pid + ") removed after grace");
                Map<String, Object> removeMsg = new HashMap<>();
                removeMsg.put("type", "room:player-removed");
                removeMsg.put("playerId", pid);
                removeMsg.put("playerName", seat.name);
                removeMsg.put("playerCount", roomRef.seats.stream().filter(s2 -> s2.connected).count());
                List<Map<String, Object>> playersList = new ArrayList<>();
                for (Seat s : roomRef.seats) {
                    if (s.connected) {
                        Map<String, Object> p = new HashMap<>();
                        p.put("id", s.id);
                        p.put("name", s.name);
                        p.put("isHost", s.isHost);
                        playersList.add(p);
                    }
                }
                removeMsg.put("players", playersList);
                broadcastToRoom(roomRef, removeMsg);
                boolean allDisconnected = true;
                for (Seat s : roomRef.seats) {
                    if (s.connected) {
                        allDisconnected = false;
                        break;
                    }
                }
                if (allDisconnected) {
                    if (roomRef.roundTimer != null)
                        roomRef.roundTimer.cancel();
                    rooms.remove(roomRef.code);
                    logRoom(roomRef.code, "destroyed", "all disconnected after grace");
                }
            }
        }, RECONNECT_GRACE_MS);
    }

    @Override
    public void onOpen(WebSocket conn, ClientHandshake handshake) {
        log("[ws] new connection from " + conn.getRemoteSocketAddress());
    }

    @Override
    public void onClose(WebSocket ws, int code, String reason, boolean remote) {
        log("[ws] closed code=" + code + " player=" + (ws.getAttachment() != null ? ws.getAttachment() : "unknown"));
        removePlayer(ws);
    }

    @Override
    public void onError(WebSocket ws, Exception ex) {
        log("[ws] error: " + (ex.getMessage() != null ? ex.getMessage() : "unknown"));
    }

    @Override
    public void onMessage(WebSocket ws, String message) {
        try {
            JsonObject msg = gson.fromJson(message, JsonObject.class);
            if (msg == null || !msg.has("type"))
                return;
            String type = msg.get("type").getAsString();

            if (type.startsWith("room:") || type.startsWith("game:") || type.equals("ping") || type.equals("chat")) {
                handleRoomMessage(ws, msg, type);
            } else if (type.startsWith("lan:")) {
                handleLanRelay(ws, msg, type);
            } else {
                Map<String, Object> err = new HashMap<>();
                err.put("type", "error");
                err.put("reason", "Unknown message type: " + type);
                sendJson(ws, err);
            }
        } catch (Exception e) {
            log("[ws] parse error: " + e.getMessage());
        }
    }

    private Room findRoomByPlayer(String pid) {
        for (Room r : rooms.values()) {
            for (Seat s : r.seats) {
                if (s.id.equals(pid))
                    return r;
            }
        }
        return null;
    }

    private void handleRoomMessage(WebSocket ws, JsonObject msg, String type) {
        switch (type) {
            case "room:create": {
                String code = genRoomCode();
                String pid = genPlayerId();
                String name = msg.has("playerName") ? msg.get("playerName").getAsString() : "Host";
                if (name.length() > 12)
                    name = name.substring(0, 12);
                String roomName = msg.has("roomName") ? msg.get("roomName").getAsString() : name + "的房间";
                if (roomName.length() > 20)
                    roomName = roomName.substring(0, 20);
                String visibility = msg.has("visibility") && msg.get("visibility").getAsString().equals("private")
                        ? "private"
                        : "public";
                String password = visibility.equals("private")
                        ? (msg.has("password") && !msg.get("password").getAsString().isEmpty()
                                ? msg.get("password").getAsString()
                                : code)
                        : "";

                ws.setAttachment(pid);
                clients.put(pid, ws);

                Room room = new Room();
                room.code = code;
                room.hostId = pid;
                room.hostName = name;
                room.roomName = roomName;
                room.visibility = visibility;
                room.password = password;
                room.seats.add(new Seat(pid, name, true));
                rooms.put(code, room);

                Map<String, Object> resp = new HashMap<>();
                resp.put("type", "room:created");
                resp.put("roomCode", code);
                resp.put("playerId", pid);
                resp.put("playerName", name);
                resp.put("isHost", true);
                resp.put("roomName", roomName);
                resp.put("visibility", visibility);
                if (visibility.equals("private"))
                    resp.put("password", password);
                sendJson(ws, resp);
                log("[room] " + code + " created by " + name + "(" + pid + ") vis=" + visibility);
                break;
            }

            case "room:join": {
                String code = msg.has("roomCode") ? msg.get("roomCode").getAsString().toUpperCase() : "";
                Room room = rooms.get(code);
                if (room == null) {
                    Map<String, Object> resp = new HashMap<>();
                    resp.put("type", "room:join-failed");
                    resp.put("reason", "Room not found");
                    sendJson(ws, resp);
                    return;
                }
                long connectedCount = room.seats.stream().filter(s -> s.connected).count();
                if (connectedCount >= room.maxPlayers) {
                    Map<String, Object> resp = new HashMap<>();
                    resp.put("type", "room:join-failed");
                    resp.put("reason", "Room is full");
                    sendJson(ws, resp);
                    return;
                }
                if (!"waiting".equals(room.state)) {
                    Map<String, Object> resp = new HashMap<>();
                    resp.put("type", "room:join-failed");
                    resp.put("reason", "Game already started");
                    sendJson(ws, resp);
                    return;
                }
                if ("private".equals(room.visibility)) {
                    String inputPassword = msg.has("password") ? msg.get("password").getAsString() : "";
                    if (!inputPassword.equals(room.password)) {
                        Map<String, Object> resp = new HashMap<>();
                        resp.put("type", "room:join-failed");
                        resp.put("reason", "Wrong password");
                        sendJson(ws, resp);
                        return;
                    }
                }

                String pid = genPlayerId();
                String name = msg.has("playerName") ? msg.get("playerName").getAsString() : "Player";
                if (name.length() > 12)
                    name = name.substring(0, 12);

                ws.setAttachment(pid);
                clients.put(pid, ws);
                room.seats.add(new Seat(pid, name, false));

                List<Map<String, Object>> playersList = new ArrayList<>();
                for (Seat s : room.seats) {
                    if (s.connected) {
                        Map<String, Object> p = new HashMap<>();
                        p.put("id", s.id);
                        p.put("name", s.name);
                        p.put("isHost", s.isHost);
                        playersList.add(p);
                    }
                }

                Map<String, Object> resp = new HashMap<>();
                resp.put("type", "room:joined");
                resp.put("roomCode", code);
                resp.put("playerId", pid);
                resp.put("playerName", name);
                resp.put("isHost", false);
                resp.put("players", playersList);
                sendJson(ws, resp);

                Map<String, Object> broadcast = new HashMap<>();
                broadcast.put("type", "room:player-joined");
                broadcast.put("playerId", pid);
                broadcast.put("playerName", name);
                broadcast.put("playerCount", room.seats.stream().filter(s -> s.connected).count());
                broadcast.put("players", playersList);
                broadcastToRoom(room, broadcast, pid);
                log("[room] " + name + "(" + pid + ") joined " + code);
                break;
            }

            case "room:leave": {
                removePlayer(ws, true);
                break;
            }

            case "room:list": {
                List<Map<String, Object>> roomList = new ArrayList<>();
                for (Map.Entry<String, Room> entry : rooms.entrySet()) {
                    Room r = entry.getValue();
                    if (!"waiting".equals(r.state))
                        continue;
                    long playerCount = r.seats.stream().filter(s -> s.connected).count();
                    Map<String, Object> ri = new HashMap<>();
                    ri.put("code", r.code);
                    ri.put("roomName",
                            r.roomName != null ? r.roomName : (r.hostName != null ? r.hostName + "的房间" : "房间"));
                    ri.put("hostName", r.hostName != null ? r.hostName : "Host");
                    ri.put("visibility", r.visibility != null ? r.visibility : "public");
                    ri.put("playerCount", playerCount);
                    ri.put("maxPlayers", r.maxPlayers);
                    roomList.add(ri);
                }
                Map<String, Object> resp = new HashMap<>();
                resp.put("type", "room:list");
                resp.put("rooms", roomList);
                sendJson(ws, resp);
                break;
            }

            case "room:reconnect": {
                String code = msg.has("roomCode") ? msg.get("roomCode").getAsString().toUpperCase() : "";
                String oldPid = msg.has("playerId") ? msg.get("playerId").getAsString() : "";
                Room room = rooms.get(code);
                if (room == null) {
                    Map<String, Object> failMsg = new HashMap<>();
                    failMsg.put("type", "room:reconnect-failed");
                    failMsg.put("reason", "Room not found");
                    sendJson(ws, failMsg);
                    return;
                }
                Seat seat = null;
                for (Seat s : room.seats) {
                    if (s.id.equals(oldPid)) {
                        seat = s;
                        break;
                    }
                }
                if (seat == null) {
                    Map<String, Object> failMsg = new HashMap<>();
                    failMsg.put("type", "room:reconnect-failed");
                    failMsg.put("reason", "Player not found in room");
                    sendJson(ws, failMsg);
                    return;
                }
                if (seat.connected) {
                    Map<String, Object> failMsg = new HashMap<>();
                    failMsg.put("type", "room:reconnect-failed");
                    failMsg.put("reason", "Player already connected");
                    sendJson(ws, failMsg);
                    return;
                }
                if (seat.disconnectedAt != null
                        && System.currentTimeMillis() - seat.disconnectedAt > RECONNECT_GRACE_MS) {
                    Map<String, Object> failMsg = new HashMap<>();
                    failMsg.put("type", "room:reconnect-failed");
                    failMsg.put("reason", "Reconnect grace period expired");
                    sendJson(ws, failMsg);
                    return;
                }

                ws.setAttachment(oldPid);
                clients.put(oldPid, ws);
                seat.connected = true;
                seat.disconnectedAt = null;

                List<Map<String, Object>> playersList = new ArrayList<>();
                for (Seat s : room.seats) {
                    if (s.connected) {
                        Map<String, Object> p = new HashMap<>();
                        p.put("id", s.id);
                        p.put("name", s.name);
                        p.put("isHost", s.isHost);
                        playersList.add(p);
                    }
                }

                Map<String, Object> reconnMsg = new HashMap<>();
                reconnMsg.put("type", "room:reconnected");
                reconnMsg.put("roomCode", code);
                reconnMsg.put("playerId", oldPid);
                reconnMsg.put("playerName", seat.name);
                reconnMsg.put("isHost", seat.isHost);
                reconnMsg.put("players", playersList);
                reconnMsg.put("roomState", room.state);
                sendJson(ws, reconnMsg);

                Map<String, Object> broadcastMsg = new HashMap<>();
                broadcastMsg.put("type", "room:player-reconnected");
                broadcastMsg.put("playerId", oldPid);
                broadcastMsg.put("playerName", seat.name);
                broadcastMsg.put("playerCount", room.seats.stream().filter(s2 -> s2.connected).count());
                broadcastMsg.put("players", playersList);
                broadcastToRoom(room, broadcastMsg, oldPid);
                logRoom(code, "reconnect", seat.name + "(" + oldPid + ") reconnected");
                break;
            }

            case "game:full-sync-request": {
                String pid = (String) ws.getAttachment();
                if (pid == null)
                    return;
                Room syncRoom = findRoomByPlayer(pid);
                if (syncRoom == null || syncRoom.hostId.equals(pid))
                    return;
                WebSocket hostWs = clients.get(syncRoom.hostId);
                if (hostWs != null) {
                    Map<String, Object> syncReqMsg = new HashMap<>();
                    syncReqMsg.put("type", "lan:full-sync-request");
                    syncReqMsg.put("playerId", pid);
                    syncReqMsg.put("ts", System.currentTimeMillis());
                    sendJson(hostWs, syncReqMsg);
                    logRoom(syncRoom.code, "full-sync-request", "from " + pid);
                }
                break;
            }

            case "room:kick": {
                String pid = (String) ws.getAttachment();
                if (pid == null)
                    return;
                Room room = findRoomByPlayer(pid);
                if (room == null || !room.hostId.equals(pid))
                    return;
                String targetId = msg.has("playerId") ? msg.get("playerId").getAsString() : null;
                if (targetId == null || targetId.equals(pid))
                    return;
                WebSocket targetWs = clients.get(targetId);
                if (targetWs != null) {
                    Map<String, Object> kickMsg = new HashMap<>();
                    kickMsg.put("type", "room:kicked");
                    kickMsg.put("reason", "Kicked by host");
                    sendJson(targetWs, kickMsg);
                    removePlayer(targetWs);
                }
                break;
            }

            case "room:slot-state": {
                String pid = (String) ws.getAttachment();
                if (pid == null)
                    return;
                Room room = findRoomByPlayer(pid);
                if (room == null || !room.hostId.equals(pid))
                    return;
                Map<String, Object> broadcast = new HashMap<>();
                broadcast.put("type", "room:slot-state");
                broadcast.put("slots",
                        msg.has("slots") ? gson.fromJson(msg.get("slots"), List.class) : new ArrayList<>());
                broadcastToRoom(room, broadcast, pid);
                break;
            }

            case "game:start": {
                String pid = (String) ws.getAttachment();
                if (pid == null)
                    return;
                Room room = findRoomByPlayer(pid);
                if (room == null || !room.hostId.equals(pid))
                    return;
                room.state = "playing";
                room.humanBidsThisRound.clear();
                room.restartVotes.clear();

                List<Map<String, Object>> playersInfo = new ArrayList<>();
                int seatIdx = 0;
                for (Seat s : room.seats) {
                    if (s.connected) {
                        Map<String, Object> p = new HashMap<>();
                        p.put("id", s.id);
                        p.put("name", s.name);
                        p.put("seat", seatIdx++);
                        p.put("isHost", s.isHost);
                        playersInfo.add(p);
                    }
                }

                int aiCount = msg.has("aiCount") ? msg.get("aiCount").getAsInt() : 0;
                boolean aiLlmEnabled = msg.has("aiLlmEnabled") && msg.get("aiLlmEnabled").getAsBoolean();
                List<Map<String, Object>> aiPlayers = msg.has("aiPlayers")
                        ? gson.fromJson(msg.get("aiPlayers"), List.class)
                        : new ArrayList<>();

                Map<String, Object> initMsg = new HashMap<>();
                initMsg.put("type", "lan:game:init");
                initMsg.put("players", playersInfo);
                initMsg.put("hostId", room.hostId);
                initMsg.put("aiCount", aiCount);
                initMsg.put("aiLlmEnabled", aiLlmEnabled);
                initMsg.put("aiPlayers", aiPlayers);
                initMsg.put("ts", System.currentTimeMillis());
                broadcastToRoom(room, initMsg);
                logRoom(room.code, "game-start", "players=" + playersInfo.size() + " ai=" + aiCount);
                break;
            }

            case "game:warehouse-sync": {
                String pid = (String) ws.getAttachment();
                if (pid == null)
                    return;
                Room room = findRoomByPlayer(pid);
                if (room == null || !room.hostId.equals(pid))
                    return;

                Map<String, Object> syncMsg = new HashMap<>();
                syncMsg.put("type", "lan:game:warehouse-sync");
                syncMsg.put("warehouse",
                        msg.has("warehouse") ? gson.fromJson(msg.get("warehouse"), List.class) : new ArrayList<>());
                syncMsg.put("warehouseTrueValue",
                        msg.has("warehouseTrueValue") ? msg.get("warehouseTrueValue").getAsLong() : 0L);
                syncMsg.put("currentBid", msg.has("currentBid") ? msg.get("currentBid").getAsLong() : 0L);
                syncMsg.put("aiMaxBid", msg.has("aiMaxBid") ? msg.get("aiMaxBid").getAsLong() : 0L);
                syncMsg.put("ts", System.currentTimeMillis());
                broadcastToRoom(room, syncMsg, pid);
                logRoom(room.code, "warehouse-sync",
                        "items=" + (msg.has("warehouse") ? msg.get("warehouse").getAsJsonArray().size() : 0));
                break;
            }

            case "game:restart-request": {
                String pid = (String) ws.getAttachment();
                if (pid == null)
                    return;
                Room room = findRoomByPlayer(pid);
                if (room == null || !room.hostId.equals(pid))
                    return;

                room.restartVotes.clear();
                room.restartVotes.put(pid, true);
                room.restartAiCount = msg.has("aiCount") ? msg.get("aiCount").getAsInt() : 0;
                room.restartAiLlmEnabled = msg.has("aiLlmEnabled") && msg.get("aiLlmEnabled").getAsBoolean();
                room.restartAiPlayers = msg.has("aiPlayers") ? gson.fromJson(msg.get("aiPlayers"), List.class)
                        : new ArrayList<>();

                List<Seat> humanClients = new ArrayList<>();
                for (Seat s : room.seats) {
                    if (s.connected && !s.isHost)
                        humanClients.add(s);
                }

                if (humanClients.isEmpty()) {
                    room.state = "waiting";
                    room.humanBidsThisRound.clear();
                    List<Map<String, Object>> playersInfo = new ArrayList<>();
                    int seatIdx = 0;
                    for (Seat s : room.seats) {
                        if (s.connected) {
                            Map<String, Object> p = new HashMap<>();
                            p.put("id", s.id);
                            p.put("name", s.name);
                            p.put("seat", seatIdx++);
                            p.put("isHost", s.isHost);
                            playersInfo.add(p);
                        }
                    }
                    Map<String, Object> goMsg = new HashMap<>();
                    goMsg.put("type", "lan:game:restart-go");
                    goMsg.put("players", playersInfo);
                    goMsg.put("hostId", room.hostId);
                    goMsg.put("aiCount", room.restartAiCount);
                    goMsg.put("aiLlmEnabled", room.restartAiLlmEnabled);
                    goMsg.put("aiPlayers", room.restartAiPlayers);
                    goMsg.put("ts", System.currentTimeMillis());
                    broadcastToRoom(room, goMsg);
                    logRoom(room.code, "restart-go", "no clients, direct restart");
                } else {
                    String hostName = "?";
                    for (Seat s : room.seats) {
                        if (s.id.equals(pid)) {
                            hostName = s.name;
                            break;
                        }
                    }
                    Map<String, Object> voteMsg = new HashMap<>();
                    voteMsg.put("type", "lan:game:restart-vote");
                    voteMsg.put("hostName", hostName);
                    voteMsg.put("ts", System.currentTimeMillis());
                    broadcastToRoom(room, voteMsg, pid);
                    logRoom(room.code, "restart-request", "host initiated, waiting for clients");
                }
                break;
            }

            case "game:restart-accept": {
                String pid = (String) ws.getAttachment();
                if (pid == null)
                    return;
                Room room = findRoomByPlayer(pid);
                if (room == null)
                    return;

                room.restartVotes.put(pid, true);
                boolean allAccepted = true;
                for (Seat s : room.seats) {
                    if (s.connected && !s.isHost) {
                        if (!room.restartVotes.containsKey(s.id) || !room.restartVotes.get(s.id)) {
                            allAccepted = false;
                            break;
                        }
                    }
                }
                if (allAccepted) {
                    room.state = "waiting";
                    room.humanBidsThisRound.clear();
                    List<Map<String, Object>> playersInfo = new ArrayList<>();
                    int seatIdx = 0;
                    for (Seat s : room.seats) {
                        if (s.connected) {
                            Map<String, Object> p = new HashMap<>();
                            p.put("id", s.id);
                            p.put("name", s.name);
                            p.put("seat", seatIdx++);
                            p.put("isHost", s.isHost);
                            playersInfo.add(p);
                        }
                    }
                    Map<String, Object> goMsg = new HashMap<>();
                    goMsg.put("type", "lan:game:restart-go");
                    goMsg.put("players", playersInfo);
                    goMsg.put("hostId", room.hostId);
                    goMsg.put("aiCount", room.restartAiCount);
                    goMsg.put("aiLlmEnabled", room.restartAiLlmEnabled);
                    goMsg.put("aiPlayers", room.restartAiPlayers);
                    goMsg.put("ts", System.currentTimeMillis());
                    broadcastToRoom(room, goMsg);
                    logRoom(room.code, "restart-go", "all accepted");
                }
                break;
            }

            case "game:restart-decline": {
                String pid = (String) ws.getAttachment();
                if (pid == null)
                    return;
                Room room = findRoomByPlayer(pid);
                if (room == null)
                    return;

                room.restartVotes.clear();
                String decliner = "?";
                for (Seat s : room.seats) {
                    if (s.id.equals(pid)) {
                        decliner = s.name;
                        break;
                    }
                }
                Map<String, Object> cancelMsg = new HashMap<>();
                cancelMsg.put("type", "lan:game:restart-cancelled");
                cancelMsg.put("decliner", decliner);
                cancelMsg.put("ts", System.currentTimeMillis());
                broadcastToRoom(room, cancelMsg);
                logRoom(room.code, "restart-cancelled", "declined by " + pid);
                break;
            }

            case "ping": {
                Map<String, Object> pong = new HashMap<>();
                pong.put("type", "pong");
                pong.put("ts", msg.has("ts") ? msg.get("ts").getAsLong() : System.currentTimeMillis());
                sendJson(ws, pong);
                break;
            }

            case "chat": {
                String pid = (String) ws.getAttachment();
                if (pid == null)
                    return;
                Room room = findRoomByPlayer(pid);
                if (room == null)
                    return;
                String fromName = "?";
                for (Seat s : room.seats) {
                    if (s.id.equals(pid)) {
                        fromName = s.name;
                        break;
                    }
                }
                String text = msg.has("text") ? msg.get("text").getAsString() : "";
                if (text.length() > 200)
                    text = text.substring(0, 200);
                Map<String, Object> chatMsg = new HashMap<>();
                chatMsg.put("type", "chat");
                chatMsg.put("from", pid);
                chatMsg.put("fromName", fromName);
                chatMsg.put("text", text);
                chatMsg.put("ts", System.currentTimeMillis());
                broadcastToRoom(room, chatMsg);
                break;
            }
        }
    }

    private void handleLanRelay(WebSocket ws, JsonObject msg, String type) {
        String pid = (String) ws.getAttachment();
        if (pid == null)
            return;
        Room room = findRoomByPlayer(pid);
        if (room == null)
            return;

        switch (type) {
            case "lan:round:start": {
                if (!room.hostId.equals(pid))
                    return;
                room.humanBidsThisRound.clear();
                room.roundSeconds = msg.has("roundSeconds") ? msg.get("roundSeconds").getAsInt() : 30;
                room.roundStartTime = System.currentTimeMillis();
                room.isPaused = false;
                room.pauseRemainingMs = null;
                room.currentRound = msg.has("round") ? msg.get("round").getAsInt() : 1;

                if (room.roundTimer != null) {
                    room.roundTimer.cancel();
                    room.roundTimer = null;
                }

                final Room roomRef = room;
                final int roundSeconds = room.roundSeconds;
                final int round = room.currentRound;
                room.roundTimer = new Timer();
                room.roundTimer.schedule(new TimerTask() {
                    @Override
                    public void run() {
                        if (roomRef.isPaused) {
                            logRoom(roomRef.code, "round-timeout", "blocked (paused)");
                            roomRef.roundTimer = null;
                            return;
                        }
                        logRoom(roomRef.code, "round-timeout", "round expired after " + roundSeconds + "s");
                        Map<String, Object> timeoutMsg = new HashMap<>();
                        timeoutMsg.put("type", "lan:round:timeout");
                        timeoutMsg.put("round", round);
                        timeoutMsg.put("ts", System.currentTimeMillis());
                        broadcastToRoom(roomRef, timeoutMsg);
                        roomRef.roundTimer = null;
                    }
                }, roundSeconds * 1000L);

                Map<String, Object> startMsg = new HashMap<>();
                startMsg.put("type", "lan:round:start");
                startMsg.put("round", room.currentRound);
                startMsg.put("maxRounds", msg.has("maxRounds") ? msg.get("maxRounds").getAsInt() : 5);
                startMsg.put("currentBid", msg.has("currentBid") ? msg.get("currentBid").getAsLong() : 0L);
                startMsg.put("roundSeconds", room.roundSeconds);
                startMsg.put("ts", System.currentTimeMillis());
                broadcastToRoom(room, startMsg);
                logRoom(room.code, "round-start", "round=" + room.currentRound + " currentBid="
                        + startMsg.get("currentBid") + " time=" + room.roundSeconds + "s");
                break;
            }

            case "lan:bid:submit": {
                Seat seat = null;
                for (Seat s : room.seats) {
                    if (s.id.equals(pid)) {
                        seat = s;
                        break;
                    }
                }
                if (seat == null)
                    return;

                long bid = msg.has("bid") ? msg.get("bid").getAsLong() : 0L;
                room.humanBidsThisRound.put(pid, bid);

                Map<String, Object> ackMsg = new HashMap<>();
                ackMsg.put("type", "lan:round:bid-ack");
                ackMsg.put("playerId", pid);
                ackMsg.put("bid", bid);
                ackMsg.put("ts", System.currentTimeMillis());
                sendJson(ws, ackMsg);

                Map<String, Object> receivedMsg = new HashMap<>();
                receivedMsg.put("type", "lan:bid:received");
                receivedMsg.put("playerId", pid);
                receivedMsg.put("playerName", seat.name);
                receivedMsg.put("bid", bid);
                receivedMsg.put("ts", System.currentTimeMillis());
                broadcastToRoom(room, receivedMsg, pid);

                logRoom(room.code, "bid-submit", seat.name + " bid=" + bid);

                WebSocket hostWs = clients.get(room.hostId);
                if (hostWs != null) {
                    boolean allIn = true;
                    for (Seat s : room.seats) {
                        if (s.connected && !room.humanBidsThisRound.containsKey(s.id)) {
                            allIn = false;
                            break;
                        }
                    }
                    if (allIn) {
                        Map<String, Object> allInMsg = new HashMap<>();
                        allInMsg.put("type", "lan:all-bids-in");
                        allInMsg.put("bids", new HashMap<>(room.humanBidsThisRound));
                        allInMsg.put("ts", System.currentTimeMillis());
                        sendJson(hostWs, allInMsg);
                        logRoom(room.code, "all-bids-in", "all humans submitted");
                    }
                }
                break;
            }

            case "lan:round:result": {
                if (!room.hostId.equals(pid))
                    return;
                if (room.roundTimer != null) {
                    room.roundTimer.cancel();
                    room.roundTimer = null;
                }
                Map<String, Object> resultMsg = new HashMap<>();
                resultMsg.put("type", "lan:round:result");
                resultMsg.put("round", msg.has("round") ? msg.get("round").getAsInt() : 0);
                resultMsg.put("bids", msg.has("bids") ? gson.fromJson(msg.get("bids"), List.class) : new ArrayList<>());
                resultMsg.put("reason", msg.has("reason") ? msg.get("reason").getAsString() : "");
                broadcastToRoom(room, resultMsg);
                logRoom(room.code, "round-result", "round=" + resultMsg.get("round"));
                break;
            }

            case "lan:game:settle": {
                if (!room.hostId.equals(pid))
                    return;
                if (room.roundTimer != null) {
                    room.roundTimer.cancel();
                    room.roundTimer = null;
                }
                Map<String, Object> settleMsg = new HashMap<>();
                settleMsg.put("type", "lan:game:settle");
                settleMsg.put("winnerId", msg.has("winnerId") ? msg.get("winnerId").getAsString() : "");
                settleMsg.put("winnerName", msg.has("winnerName") ? msg.get("winnerName").getAsString() : "");
                settleMsg.put("winnerBid", msg.has("winnerBid") ? msg.get("winnerBid").getAsLong() : 0L);
                settleMsg.put("totalValue", msg.has("totalValue") ? msg.get("totalValue").getAsLong() : 0L);
                settleMsg.put("winnerProfit", msg.has("winnerProfit") ? msg.get("winnerProfit").getAsLong() : 0L);
                settleMsg.put("secondHighestBid",
                        msg.has("secondHighestBid") ? msg.get("secondHighestBid").getAsLong() : 0L);
                settleMsg.put("mode", msg.has("mode") ? msg.get("mode").getAsString() : "");
                broadcastToRoom(room, settleMsg);
                logRoom(room.code, "game-settle",
                        "winner=" + settleMsg.get("winnerName") + " bid=" + settleMsg.get("winnerBid"));
                break;
            }

            case "lan:game:settle-final": {
                if (!room.hostId.equals(pid))
                    return;
                Map<String, Object> finalMsg = new HashMap<>();
                finalMsg.put("type", "lan:game:settle-final");
                finalMsg.put("wallets",
                        msg.has("wallets") ? gson.fromJson(msg.get("wallets"), Map.class) : new HashMap<>());
                finalMsg.put("profitDetails",
                        msg.has("profitDetails") ? gson.fromJson(msg.get("profitDetails"), List.class)
                                : new ArrayList<>());
                broadcastToRoom(room, finalMsg);
                room.state = "waiting";
                room.humanBidsThisRound.clear();
                if (room.roundTimer != null) {
                    room.roundTimer.cancel();
                    room.roundTimer = null;
                }
                room.isPaused = false;
                room.pauseRemainingMs = null;
                logRoom(room.code, "settle-final", "wallets broadcasted, room reset to waiting");
                break;
            }

            case "lan:ai-bids-ready": {
                if (!room.hostId.equals(pid))
                    return;
                Map<String, Object> readyMsg = new HashMap<>();
                readyMsg.put("type", "lan:ai-bids-ready");
                readyMsg.put("aiPlayerIds",
                        msg.has("aiPlayerIds") ? gson.fromJson(msg.get("aiPlayerIds"), List.class) : new ArrayList<>());
                broadcastToRoom(room, readyMsg, pid);
                logRoom(room.code, "ai-bids-ready",
                        "ai count=" + (readyMsg.get("aiPlayerIds") instanceof List
                                ? ((List<?>) readyMsg.get("aiPlayerIds")).size()
                                : 0));
                break;
            }

            case "lan:ai-item-use": {
                if (!room.hostId.equals(pid))
                    return;
                Map<String, Object> useMsg = new HashMap<>();
                useMsg.put("type", "lan:ai-item-use");
                useMsg.put("aiPlayerId", msg.has("aiPlayerId") ? msg.get("aiPlayerId").getAsString() : "");
                useMsg.put("aiPlayerName", msg.has("aiPlayerName") ? msg.get("aiPlayerName").getAsString() : "");
                useMsg.put("actionId", msg.has("actionId") ? msg.get("actionId").getAsString() : "");
                useMsg.put("actionType", msg.has("actionType") ? msg.get("actionType").getAsString() : "");
                useMsg.put("itemName", msg.has("itemName") ? msg.get("itemName").getAsString() : "");
                useMsg.put("itemDesc", msg.has("itemDesc") ? msg.get("itemDesc").getAsString() : "");
                broadcastToRoom(room, useMsg, pid);
                logRoom(room.code, "ai-item-use", "ai=" + useMsg.get("aiPlayerId"));
                break;
            }

            case "lan:player-action": {
                Map<String, Object> actionMsg = new HashMap<>();
                actionMsg.put("type", "lan:player-action");
                actionMsg.put("playerId", pid);
                actionMsg.put("playerName", msg.has("playerName") ? msg.get("playerName").getAsString() : "");
                actionMsg.put("actionId", msg.has("actionId") ? msg.get("actionId").getAsString() : "");
                actionMsg.put("actionType", msg.has("actionType") ? msg.get("actionType").getAsString() : "");
                actionMsg.put("itemName", msg.has("itemName") ? msg.get("itemName").getAsString() : "");
                broadcastToRoom(room, actionMsg, pid);
                logRoom(room.code, "player-action", "player=" + pid + " action=" + actionMsg.get("actionId"));
                break;
            }

            case "lan:public-info": {
                if (!room.hostId.equals(pid))
                    return;
                Map<String, Object> infoMsg = new HashMap<>();
                infoMsg.put("type", "lan:public-info");
                infoMsg.put("source", msg.has("source") ? msg.get("source").getAsString() : "");
                infoMsg.put("text", msg.has("text") ? msg.get("text").getAsString() : "");
                infoMsg.put("round", msg.has("round") ? msg.get("round").getAsInt() : 0);
                broadcastToRoom(room, infoMsg, pid);
                break;
            }

            case "lan:pause:toggle": {
                String actorName = "?";
                for (Seat s : room.seats) {
                    if (s.id.equals(pid)) {
                        actorName = s.name;
                        break;
                    }
                }

                boolean paused = msg.has("paused") && msg.get("paused").getAsBoolean();

                if (paused) {
                    room.isPaused = true;
                    if (room.roundTimer != null) {
                        room.roundTimer.cancel();
                        room.roundTimer = null;
                        room.pauseRemainingMs = Math.max(0,
                                room.roundSeconds * 1000L - (System.currentTimeMillis() - room.roundStartTime));
                        logRoom(room.code, "pause",
                                actorName + " paused | remaining=" + ((room.pauseRemainingMs + 999) / 1000) + "s");
                    } else {
                        room.pauseRemainingMs = room.pauseRemainingMs != null ? room.pauseRemainingMs : 0L;
                        logRoom(room.code, "pause", actorName + " paused | no active timer");
                    }
                } else {
                    room.isPaused = false;
                    if (room.pauseRemainingMs != null && room.pauseRemainingMs > 0) {
                        room.roundStartTime = System.currentTimeMillis()
                                - (room.roundSeconds * 1000L - room.pauseRemainingMs);
                        final long remainingMs = room.pauseRemainingMs;
                        final Room roomRef = room;
                        logRoom(room.code, "pause",
                                actorName + " resumed | timer=" + ((remainingMs + 999) / 1000) + "s");
                        room.roundTimer = new Timer();
                        room.roundTimer.schedule(new TimerTask() {

                            @Override
                            public void run() {
                                if (roomRef.isPaused) {
                                    logRoom(roomRef.code, "round-timeout", "blocked (paused)");
                                    roomRef.roundTimer = null;
                                    return;
                                }
                                logRoom(roomRef.code, "round-timeout", "round expired after pause resume");
                                Map<String, Object> timeoutMsg = new HashMap<>();
                                timeoutMsg.put("type", "lan:round:timeout");
                                timeoutMsg.put("ts", System.currentTimeMillis());
                                broadcastToRoom(roomRef, timeoutMsg);
                                roomRef.roundTimer = null;
                                roomRef.pauseRemainingMs = null;
                            }
                        }, remainingMs);
                    } else {
                        logRoom(room.code, "pause", actorName + " resumed | no pauseRemainingMs, timer NOT restarted");
                    }
                    room.pauseRemainingMs = null;
                }

                int serverTimeLeft;
                if (paused) {
                    serverTimeLeft = room.pauseRemainingMs != null ? (int) Math.ceil(room.pauseRemainingMs / 1000.0)
                            : (msg.has("roundTimeLeft") ? msg.get("roundTimeLeft").getAsInt() : 0);
                } else {
                    serverTimeLeft = room.roundStartTime > 0
                            ? Math.max(0,
                                    (int) Math.ceil((room.roundSeconds * 1000.0
                                            - (System.currentTimeMillis() - room.roundStartTime)) / 1000.0))
                            : (msg.has("roundTimeLeft") ? msg.get("roundTimeLeft").getAsInt() : 0);
                }

                logRoom(room.code, "pause",
                        (paused ? "paused" : "resumed") + " | serverTimeLeft=" + serverTimeLeft + "s");

                Map<String, Object> pauseMsg = new HashMap<>();
                pauseMsg.put("type", "lan:pause:state");
                pauseMsg.put("paused", paused);
                pauseMsg.put("by", actorName);
                pauseMsg.put("roundTimeLeft", serverTimeLeft);
                pauseMsg.put("ts", System.currentTimeMillis());

                broadcastToRoom(room, pauseMsg);
                break;
            }

            case "lan:ping": {

                Map<String, Object> pong = new HashMap<>();
                pong.put("type", "lan:pong");
                pong.put("ts", msg.has("ts") ? msg.get("ts").getAsLong() : System.currentTimeMillis());

                sendJson(ws, pong);
                break;
            }

            case "lan:full-sync":

            {
                if (!room.hostId.equals(pid))
                    return;
                String targetId = msg.has("playerId") ? msg.get("playerId").getAsString() : null;
                if (targetId != null) {
                    WebSocket targetWs = clients.get(targetId);
                    if (targetWs != null) {
                        Map<String, Object> syncMsg = new HashMap<>();
                        syncMsg.put("type", "lan:full-sync");
                        for (Map.Entry<String, JsonElement> entry : msg.entrySet()) {
                            if (!"type".equals(entry.getKey())) {
                                syncMsg.put(entry.getKey(), gson.fromJson(entry.getValue(), Object.class));
                            }
                        }
                        sendJson(targetWs, syncMsg);
                        logRoom(room.code, "full-sync", "sent to " + targetId);
                    }
                } else {
                    Map<String, Object> syncMsg = new HashMap<>();
                    syncMsg.put("type", "lan:full-sync");
                    for (Map.Entry<String, JsonElement> entry : msg.entrySet()) {
                        if (!"type".equals(entry.getKey())) {
                            syncMsg.put(entry.getKey(), gson.fromJson(entry.getValue(), Object.class));
                        }
                    }
                    broadcastToRoom(room, syncMsg, pid);
                    logRoom(room.code, "full-sync", "broadcast to all clients");
                }
                break;
            }

            default:
                logRoom(room.code, "unknown-lan", type);
        }
    }
}

package com.mobao.game;

import android.content.Context;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.text.format.Formatter;
import android.util.Base64;
import android.util.Log;
import android.webkit.JavascriptInterface;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.URL;
import java.util.Enumeration;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;
import java.security.cert.X509Certificate;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

public class NativeBridge {

    private static final String TAG = "NativeBridge";
    private final MainActivity activity;
    private GameServer gameServer;

    public NativeBridge(MainActivity activity) {
        this.activity = activity;
    }

    void setGameServer(GameServer server) {
        this.gameServer = server;
    }

    @JavascriptInterface
    public boolean isNative() {
        return true;
    }

    @JavascriptInterface
    public boolean startServer() {
        if (gameServer != null && gameServer.isRunning()) {
            Log.i(TAG, "GameServer already running");
            return true;
        }
        if (gameServer != null) {
            try {
                gameServer.stop(100);
            } catch (Exception e) {
                Log.w(TAG, "Failed to stop old server: " + e.getMessage());
            }
            gameServer = null;
        }
        try {
            gameServer = new GameServer();
            gameServer.setEventListener(new GameServer.ServerEventListener() {
                @Override
                public void onServerStarted(String ip, int port) {
                    activity.runOnUiThread(() -> {
                        String js = "if(window.onNativeServerStarted)window.onNativeServerStarted('" + getWiFiIP()
                                + "'," + port + ")";
                        activity.evaluateJs(js);
                    });
                }

                @Override
                public void onServerStopped() {
                    activity.runOnUiThread(() -> {
                        String js = "if(window.onNativeServerStopped)window.onNativeServerStopped()";
                        activity.evaluateJs(js);
                    });
                }

                @Override
                public void onServerError(String error) {
                    activity.runOnUiThread(() -> {
                        String escaped = error.replace("'", "\\'").replace("\n", "\\n");
                        String js = "if(window.onNativeServerError)window.onNativeServerError('" + escaped + "')";
                        activity.evaluateJs(js);
                    });
                }

                @Override
                public void onLog(String message) {
                    Log.d(TAG, message);
                }
            });
            gameServer.start();
            Log.i(TAG, "GameServer started on port " + gameServer.getPort());
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Failed to start server: " + e.getMessage());
            return false;
        }
    }

    @JavascriptInterface
    public void stopServer() {
        if (gameServer != null) {
            try {
                gameServer.stop();
                Log.i(TAG, "GameServer stopped");
            } catch (Exception e) {
                Log.e(TAG, "Failed to stop server: " + e.getMessage());
            }
            gameServer = null;
        }
    }

    @JavascriptInterface
    public boolean isServerRunning() {
        return gameServer != null && gameServer.isRunning();
    }

    @JavascriptInterface
    public String getWiFiIP() {
        try {
            WifiManager wifiManager = (WifiManager) activity.getApplicationContext()
                    .getSystemService(Context.WIFI_SERVICE);
            if (wifiManager != null) {
                WifiInfo wifiInfo = wifiManager.getConnectionInfo();
                int ipInt = wifiInfo.getIpAddress();
                if (ipInt != 0) {
                    return Formatter.formatIpAddress(ipInt);
                }
            }
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            while (interfaces != null && interfaces.hasMoreElements()) {
                NetworkInterface iface = interfaces.nextElement();
                Enumeration<InetAddress> addresses = iface.getInetAddresses();
                while (addresses.hasMoreElements()) {
                    InetAddress addr = addresses.nextElement();
                    if (!addr.isLoopbackAddress() && addr.getHostAddress() != null
                            && addr.getHostAddress().indexOf(':') < 0) {
                        return addr.getHostAddress();
                    }
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "getWiFiIP error: " + e.getMessage());
        }
        return "127.0.0.1";
    }

    @JavascriptInterface
    public int getServerPort() {
        return gameServer != null ? gameServer.getPort() : 9720;
    }

    @JavascriptInterface
    public String getServerUrl() {
        return "ws://" + getWiFiIP() + ":" + getServerPort();
    }

    @JavascriptInterface
    public String getLocalServerUrl() {
        return "ws://localhost:" + getServerPort();
    }

    @JavascriptInterface
    public void setGameRunning(boolean running) {
        activity.setGameRunning(running);
    }

    @JavascriptInterface
    public String discoverRooms() {
        try {
            String myIp = getWiFiIP();
            String subnet = myIp.substring(0, myIp.lastIndexOf(".") + 1);
            StringBuilder results = new StringBuilder("[");
            boolean first = true;

            for (int i = 1; i <= 254; i++) {
                String ip = subnet + i;
                if (ip.equals(myIp))
                    continue;
                String found = null;
                for (int port : new int[] { 9721, 9720 }) {
                    if (found != null)
                        break;
                    try {
                        URL url = new URL("http://" + ip + ":" + port + "/rooms");
                        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                        conn.setConnectTimeout(300);
                        conn.setReadTimeout(300);
                        conn.setRequestMethod("GET");
                        int code = conn.getResponseCode();
                        if (code == 200) {
                            BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                            StringBuilder sb = new StringBuilder();
                            String line;
                            while ((line = reader.readLine()) != null)
                                sb.append(line);
                            reader.close();
                            found = sb.toString();
                        }
                        conn.disconnect();
                    } catch (Exception ignored) {
                    }
                }
                if (found != null && found.contains("\"rooms\"")) {
                    if (!first)
                        results.append(",");
                    results.append("{\"serverIp\":\"").append(ip).append("\",\"serverPort\":9720,\"data\":")
                            .append(found).append("}");
                    first = false;
                }
            }
            results.append("]");
            return results.toString();
        } catch (Exception e) {
            Log.e(TAG, "discoverRooms error: " + e.getMessage());
            return "[]";
        }
    }

    @JavascriptInterface
    public String discoverRoomsQuick() {
        try {
            String myIp = getWiFiIP();
            String subnet = myIp.substring(0, myIp.lastIndexOf(".") + 1);
            StringBuilder results = new StringBuilder("[");
            boolean first = true;
            int threads = 20;
            Thread[] scanThreads = new Thread[threads];
            final String[] threadResults = new String[254];

            for (int t = 0; t < threads; t++) {
                final int threadId = t;
                scanThreads[t] = new Thread(() -> {
                    for (int i = threadId + 1; i <= 253; i += threads) {
                        String ip = subnet + i;
                        if (ip.equals(myIp))
                            continue;
                        String found = null;
                        for (int port : new int[] { 9721, 9720 }) {
                            if (found != null)
                                break;
                            try {
                                URL url = new URL("http://" + ip + ":" + port + "/rooms");
                                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                                conn.setConnectTimeout(400);
                                conn.setReadTimeout(400);
                                conn.setRequestMethod("GET");
                                int code = conn.getResponseCode();
                                if (code == 200) {
                                    BufferedReader reader = new BufferedReader(
                                            new InputStreamReader(conn.getInputStream()));
                                    StringBuilder sb = new StringBuilder();
                                    String line;
                                    while ((line = reader.readLine()) != null)
                                        sb.append(line);
                                    reader.close();
                                    found = sb.toString();
                                }
                                conn.disconnect();
                            } catch (Exception ignored) {
                            }
                        }
                        if (found != null)
                            threadResults[i] = found;
                    }
                });
                scanThreads[t].start();
            }

            for (Thread t : scanThreads) {
                try {
                    t.join(15000);
                } catch (Exception ignored) {
                }
            }

            for (int i = 1; i <= 253; i++) {
                if (threadResults[i] != null && threadResults[i].contains("\"rooms\"")) {
                    try {
                        com.google.gson.JsonObject parsed = new com.google.gson.Gson().fromJson(threadResults[i],
                                com.google.gson.JsonObject.class);
                        String ip = subnet + i;

                        if (parsed.has("rooms")) {
                            for (JsonElement elem : parsed.getAsJsonArray("rooms")) {
                                JsonObject roomObj = elem.getAsJsonObject();
                                if (!first)
                                    results.append(",");
                                results.append("{\"serverIp\":\"").append(ip)
                                        .append("\",\"serverPort\":9720,\"rooms\":[")
                                        .append(roomObj.toString()).append("]}");
                                first = false;
                            }
                        }

                        if (parsed.has("remoteRooms")) {
                            for (JsonElement elem : parsed.getAsJsonArray("remoteRooms")) {
                                JsonObject roomObj = elem.getAsJsonObject();
                                String remoteIp = roomObj.has("serverIp") ? roomObj.get("serverIp").getAsString() : ip;
                                JsonObject cleanRoom = new JsonObject();
                                for (Map.Entry<String, JsonElement> entry : roomObj.entrySet()) {
                                    if (!entry.getKey().equals("serverIp"))
                                        cleanRoom.add(entry.getKey(), entry.getValue());
                                }
                                if (!first)
                                    results.append(",");
                                results.append("{\"serverIp\":\"").append(remoteIp)
                                        .append("\",\"serverPort\":9720,\"rooms\":[")
                                        .append(cleanRoom.toString()).append("]}");
                                first = false;
                            }
                        }
                    } catch (Exception e) {
                        Log.e(TAG, "parse rooms error: " + e.getMessage());
                    }
                }
            }
            results.append("]");
            return results.toString();
        } catch (Exception e) {
            Log.e(TAG, "discoverRoomsQuick error: " + e.getMessage());
            return "[]";
        }
    }

    private final java.util.concurrent.ConcurrentHashMap<String, javax.net.ssl.HttpsURLConnection> pendingLlmConnections = new java.util.concurrent.ConcurrentHashMap<>();

    @JavascriptInterface
    public void llmProxyAsync(String requestId, String bodyJson) {
        new Thread(() -> {
            try {
                com.google.gson.Gson gson = new com.google.gson.Gson();
                com.google.gson.JsonObject body = gson.fromJson(bodyJson, com.google.gson.JsonObject.class);
                String targetUrl = "https://api.deepseek.com/v1/chat/completions";
                String authHeader = null;
                if (body != null) {
                    if (body.has("apiKey")) {
                        authHeader = "Bearer " + body.get("apiKey").getAsString();
                        body.remove("apiKey");
                    }
                    if (body.has("proxyTarget")) {
                        targetUrl = body.get("proxyTarget").getAsString();
                        body.remove("proxyTarget");
                    }
                }
                String finalBody = (body != null) ? gson.toJson(body) : bodyJson;

                java.net.URL url = new java.net.URL(targetUrl);
                javax.net.ssl.HttpsURLConnection conn = (javax.net.ssl.HttpsURLConnection) url.openConnection();
                try {
                    SSLContext sslContext = SSLContext.getInstance("TLS");
                    sslContext.init(null, new TrustManager[] { new X509TrustManager() {
                        public X509Certificate[] getAcceptedIssuers() {
                            return new X509Certificate[0];
                        }

                        public void checkClientTrusted(X509Certificate[] certs, String authType) {
                        }

                        public void checkServerTrusted(X509Certificate[] certs, String authType) {
                        }
                    } }, new java.security.SecureRandom());
                    conn.setSSLSocketFactory(sslContext.getSocketFactory());
                } catch (Exception e) {
                    Log.w(TAG, "Failed to set custom SSL context: " + e.getMessage());
                }
                conn.setRequestMethod("POST");
                conn.setDoOutput(true);
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(60000);
                conn.setRequestProperty("Content-Type", "application/json");
                if (authHeader != null) {
                    conn.setRequestProperty("Authorization", authHeader);
                }

                pendingLlmConnections.put(requestId, conn);

                byte[] bodyBytes = finalBody.getBytes("UTF-8");
                conn.getOutputStream().write(bodyBytes);
                conn.getOutputStream().flush();

                int status = conn.getResponseCode();
                java.io.InputStream is = (status >= 400) ? conn.getErrorStream() : conn.getInputStream();
                byte[] respBytes;
                if (is != null) {
                    java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
                    byte[] buf = new byte[4096];
                    int n;
                    while ((n = is.read(buf)) != -1)
                        baos.write(buf, 0, n);
                    respBytes = baos.toByteArray();
                    is.close();
                } else {
                    respBytes = "{}".getBytes("UTF-8");
                }
                conn.disconnect();
                pendingLlmConnections.remove(requestId);

                com.google.gson.JsonObject result = new com.google.gson.JsonObject();
                result.addProperty("status", status);
                result.addProperty("body", new String(respBytes, "UTF-8"));
                String resultJson = gson.toJson(result);
                callbackLlmProxy(requestId, resultJson);
            } catch (Exception e) {
                pendingLlmConnections.remove(requestId);
                com.google.gson.JsonObject result = new com.google.gson.JsonObject();
                result.addProperty("status", 502);
                result.addProperty("error", e.getMessage() != null ? e.getMessage() : "unknown");
                String resultJson = new com.google.gson.Gson().toJson(result);
                callbackLlmProxy(requestId, resultJson);
            }
        }, "llm-proxy-" + requestId).start();
    }

    @JavascriptInterface
    public void llmProxyCancel(String requestId) {
        javax.net.ssl.HttpsURLConnection conn = pendingLlmConnections.remove(requestId);
        if (conn != null) {
            try {
                conn.disconnect();
            } catch (Exception ignored) {
            }
        }
    }

    private void callbackLlmProxy(String requestId, String resultJson) {
        activity.runOnUiThread(() -> {
            try {
                String b64 = android.util.Base64.encodeToString(
                        resultJson.getBytes(java.nio.charset.StandardCharsets.UTF_8), android.util.Base64.NO_WRAP);
                com.google.gson.Gson gson = new com.google.gson.Gson();
                String js = "if(window.__llmProxyCallback)window.__llmProxyCallback(" +
                        gson.toJson(requestId) + "," + gson.toJson(b64) + ")";
                activity.evaluateJs(js);
            } catch (Exception e) {
                Log.e(TAG, "callbackLlmProxy error: " + e.getMessage());
            }
        });
    }
}

const http = require("http");
const crypto = require("crypto");

const key = crypto.randomBytes(16).toString("base64");
const req = http.request({
  hostname: "localhost",
  port: 9720,
  path: "/",
  method: "GET",
  headers: {
    Upgrade: "websocket",
    Connection: "Upgrade",
    "Sec-WebSocket-Key": key,
    "Sec-WebSocket-Version": "13",
  },
});

req.on("upgrade", (res, socket, head) => {
  console.log("✅ WebSocket upgrade 成功! 状态:", res.statusCode);

  function sendMsg(obj) {
    const msg = JSON.stringify(obj);
    const payload = Buffer.from(msg);
    const mask = crypto.randomBytes(4);
    const masked = Buffer.alloc(payload.length);
    for (let i = 0; i < payload.length; i++) masked[i] = payload[i] ^ mask[i & 3];

    let header;
    if (payload.length < 126) {
      header = Buffer.alloc(6);
      header[0] = 0x81;
      header[1] = 0x80 | payload.length;
      mask.copy(header, 2);
    }
    socket.write(Buffer.concat([header, masked]));
  }

  let buf = Buffer.alloc(0);
  socket.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length > 2) {
      const payloadLen = buf[1] & 0x7f;
      let offset = 2;
      if (payloadLen === 126) {
        if (buf.length < 4) break;
        offset = 4;
      }
      const totalLen = offset + payloadLen;
      if (buf.length < totalLen) break;

      const payload = buf.slice(offset, offset + payloadLen);
      buf = buf.slice(totalLen);

      try {
        const msg = JSON.parse(payload.toString("utf8"));
        console.log("◀ 收到:", JSON.stringify(msg));

        if (msg.type === "room:created") {
          console.log("✅ 房间创建成功! 房间号:", msg.roomCode);
          sendMsg({ type: "ping", ts: Date.now() });
        }
        if (msg.type === "pong") {
          console.log("✅ Ping/Pong 成功! RTT:", Date.now() - msg.ts, "ms");
          console.log("\n🎉 联通性测试全部通过!");
          socket.end();
          process.exit(0);
        }
      } catch (_e) { }
    }
  });

  sendMsg({ type: "room:create", playerName: "TestBot" });
  setTimeout(() => {
    console.log("❌ 超时");
    process.exit(1);
  }, 5000);
});

req.on("error", (e) => {
  console.log("❌ 连接失败:", e.message);
  process.exit(1);
});
req.end();

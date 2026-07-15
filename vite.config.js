import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteStaticCopy } from 'vite-plugin-static-copy'

// Vite 插件：LLM API CORS 代理
// dev 环境自动转发 /llm-cors-proxy/https://api.example.com/... 到目标 API
// 避免浏览器 CORS 拦截。生产环境（Android WebView）无 CORS 限制，不走此代理。
function llmCorsProxyPlugin() {
  return {
    name: "llm-cors-proxy",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || !req.url.startsWith("/llm-cors-proxy/")) {
          return next()
        }

        // 从路径提取目标 URL
        // /llm-cors-proxy/https://token.sensenova.cn/v1/chat/completions -> https://token.sensenova.cn/v1/chat/completions
        const targetUrl = req.url.replace(/^\/llm-cors-proxy\//, "").split("?")[0]

        if (!targetUrl.startsWith("http")) {
          res.statusCode = 400
          res.end("Invalid target URL")
          return
        }

        // 异步处理，避免阻塞 connect 管线
        const chunks = []
        req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
        req.on("end", async () => {
          try {
            const body = Buffer.concat(chunks)

            // 转发请求头（排除 hop-by-hop 头）
            const forwardHeaders = {}
            for (const [key, value] of Object.entries(req.headers)) {
              const lower = key.toLowerCase()
              if (lower === "host" || lower === "origin" || lower === "referer" ||
                  lower === "connection" || lower === "content-length") continue
              forwardHeaders[key] = value
            }

            // 用 Node.js 内置 fetch 转发请求
            const response = await fetch(targetUrl, {
              method: req.method || "GET",
              headers: forwardHeaders,
              body: body.length > 0 ? body : undefined
            })

            // 转发响应
            res.statusCode = response.status
            response.headers.forEach((value, key) => {
              res.setHeader(key, value)
            })
            const responseBody = Buffer.from(await response.arrayBuffer())
            res.end(responseBody)
          } catch (err) {
            console.error("[llm-cors-proxy] Error:", err)
            if (!res.headersSent) {
              res.statusCode = 502
              res.end(JSON.stringify({ ok: false, error: String(err) }))
            }
          }
        })
      })
    }
  }
}

export default defineConfig({
  root: '.',
  base: './',
  plugins: [
    vue(),
    viteStaticCopy({
      targets: [
        {
          src: 'lib/phaser.min.js',
          dest: '.'
        },
        {
          src: 'assets/**/*',
          dest: '.'
        }
      ]
    }),
    llmCorsProxyPlugin()
  ],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    target: 'es2020',
    cssMinify: true,
    rollupOptions: {
      input: 'index.html'
    }
  },
  server: {
    port: 5173,
    host: '0.0.0.0',  // 允许局域网访问，手机端调试用
    open: true,
    proxy: {
      // 联机请求直连 9720（ws:// / http://），此代理为备用
      '/api': 'http://localhost:9720'
    }
  }
})

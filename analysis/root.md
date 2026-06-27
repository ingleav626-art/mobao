# 根目录文件分析

## 文件清单

| 文件 | 行数 | 主要职责 |
|------|------|----------|
| index.html | 865 | 应用入口，包含所有页面HTML结构 + script加载 |
| proxy-server.js | 58 | CORS 代理服务器（端口 3000），转发 LLM API 请求 |
| vite.config.js | 40 | Vite 构建配置 |
| eslint.config.js | 73 | ESLint flat config |
| tsconfig.json | 34 | TypeScript 编译配置 |

## 逐文件职责问题

### index.html (865行)
- **AGENTS.md 与实际严重不符**：AGENTS.md 描述"script标签加载+IIFE全局变量"模式，但实际仅有 2 个 `<script type="module">` 标签。项目已迁移到 Vite module bundler 模式
- **HTML 结构庞大**：865 行包含大厅、游戏、设置、商店、战绩、图鉴等所有页面的 HTML
- 未加载 mobile-handler.ts、audio-manager.ts、audio-ui.ts（这些通过 module import 引入）

### proxy-server.js (58行)
- **端口冲突**：与 `vite.config.js` 的 `server.port: 3000` 冲突
- **与 LAN server 功能重叠**：`lan/server/server.js` 的 `/api/deepseek/` 端点做了同样的 LLM 代理

### vite.config.js (40行)
- `lan/shared` 被排除在 TypeScript 编译之外

### eslint.config.js (73行)
- **全局变量列表与 globals.d.ts 不完全一致**：如 `AuctionAI` 在 eslint 中注册但 `globals.d.ts` 未声明；`Deps`、`MobaoContextBuilder` 在 `globals.d.ts` 中声明但 eslint 中未注册

### tsconfig.json (34行)
- **strict: true 与 AGENTS.md 不符**：AGENTS.md 说 `strict: false`，实际 `strict: true`
- **exclude: ["lan/shared"]**：共享协议文件被排除

## 架构层面关键发现

1. **文档与代码严重脱节**：AGENTS.md 描述的旧架构已被 Vite module bundler 取代
2. **模块系统混乱**：部分文件用 `export`（AudioManager、AudioUI、MobileHandler），部分用 `window.Xxx` 全局挂载（LanBridge），两种模式并存
3. **类型系统形同虚设**：大量 `Record<string, any>`，strict: true 的 tsconfig 被架空

## 改进建议

1. **更新 AGENTS.md**：准确描述当前 Vite module 架构
2. **统一模块系统**：全部迁移到 ES module export
3. **同步 eslint 全局变量与 globals.d.ts**
4. **消除 LLM 代理重复**：统一使用 proxy-server.js 或 server.js
5. **将 lan/shared 纳入 TypeScript 编译**

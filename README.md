# 摸宝仓库 — 古董竞拍·暗仓探秘

一款基于 Phaser 3 的仓库摸宝竞拍游戏。玩家在随机生成的仓库中探查古董藏品，与 AI 或真人玩家博弈出价，在有限轮次内以低于仓库真实总价值的成交价盈利。

## 游戏机制

### 核心玩法
- **仓库探查**：每局随机生成仓库，藏品以网格形式分布，品质从粗品到绝品共五档
- **多轮竞拍**：玩家与 3 个 AI 或真人竞拍者轮流出价，非最终轮可触发"直接拿下"（出价达到第二名 × directWinRatio）
- **技能与道具**：每轮可使用技能（拓影侦测、玉脉鉴质等）和道具（探照灯、鉴定针等）揭示藏品信息
- **公共事件**：每局随机出现市场传闻、拍卖行消息等公共事件，影响决策判断

### 分红与门票
- **分红机制**：拍下者亏损时，非拍下者各获得亏损额 15% 的分红
- **门票机制**：拍下者盈利时，非拍下者各被扣除盈利额 5% 的门票

### 地图配置
- 标准仓库、珍宝密室等多种地图预设，影响品质权重与品类分布

## 项目结构

```
├── index.html                  主游戏页面
├── scripts/
│   ├── game/
│   │   ├── main.js             游戏入口（Phaser 场景、Mixin 组装）
│   │   ├── core/               核心模块
│   │   │   ├── constants.js    常量定义
│   │   │   ├── utils.js        工具函数
│   │   │   ├── settings.js     设置管理
│   │   │   └── app-state.js    应用状态
│   │   ├── data/               数据配置
│   │   │   ├── artifacts.js    藏品数据
│   │   │   ├── skills.js       技能系统
│   │   │   ├── items.js        道具系统
│   │   │   ├── public-events.js 公共事件
│   │   │   └── map-profiles.js 地图预设
│   │   ├── ai/                 AI 系统
│   │   │   ├── bidding.js      规则 AI 出价引擎
│   │   │   ├── decision.js     LLM 决策调度
│   │   │   ├── intel.js        情报分析
│   │   │   ├── memory.js       跨局记忆
│   │   │   ├── reflection.js   AI 反思
│   │   │   └── wallet.js       AI 钱包管理
│   │   ├── bidding/            竞价系统
│   │   │   └── index.js        竞价流程管理
│   │   ├── warehouse/          仓库模块
│   │   │   └── index.js        仓库渲染与揭示
│   │   ├── lobby/              大厅系统
│   │   │   ├── index.js        大厅逻辑
│   │   │   └── carousel.js     角色选择轮播
│   │   ├── ui/                 UI 组件
│   │   │   ├── overlay.js      弹窗层
│   │   │   ├── panels.js       侧边面板
│   │   │   └── history.js      历史记录
│   │   ├── bridge/             桥接模块
│   │   │   ├── shop.js         商店系统
│   │   │   ├── battle-record.js 战绩记录
│   │   │   └── settlement.js   结算展示
│   │   └── lan/                联机功能
│   │       └── index.js        LAN 客户端逻辑
│   └── llm/                    LLM 提供商
│       ├── llm-manager.js      LLM 管理器
│       ├── llm-ui-bridge.js    LLM 设置 UI
│       ├── scene-llm.js        场景 LLM 桥接
│       ├── deepseek-provider.js
│       ├── openai-provider.js
│       ├── qwen-provider.js
│       ├── glm-provider.js
│       └── kimi-provider.js
├── lan/                        联机服务器
│   ├── server/                 服务端
│   │   └── server.js           WebSocket 服务器
│   ├── client/                 客户端
│   │   └── lan-bridge.js       联机桥接
│   └── shared/
│       └── protocol.js         通信协议
├── styles/
│   ├── game/
│   │   ├── styles.css          游戏主样式
│   │   └── mobile-landscape.css 横屏移动端适配
│   └── lobby/
│       ├── lobby.css           大厅样式
│       └── mobile-lobby.css    大厅移动端适配
├── android/                    Android WebView 打包项目
│   ├── app/                    Android 应用模块
│   ├── build.gradle            Gradle 构建配置
│   └── gradlew.bat             Gradle 启动脚本
└── docs/                       开发文档
```

## AI 系统

### 双引擎架构
- **规则 AI**（`ai/bidding.js`）：基于人格参数的规则化出价引擎，每个 AI 有独立的激进/纪律/跟风/虚张声势等参数
- **LLM AI**（`ai/decision.js` + `llm/`）：支持多家大模型（DeepSeek、OpenAI、通义千问、智谱GLM、Kimi），让 AI 基于上下文做出决策

### AI 模块拆分
| 模块 | 功能 |
|------|------|
| `bidding.js` | 规则化出价引擎，人格参数控制 |
| `decision.js` | LLM 决策调度，技能/道具选择 |
| `intel.js` | 情报分析，信息整合 |
| `memory.js` | 跨局记忆存储与恢复 |
| `reflection.js` | 局后反思生成 |
| `wallet.js` | AI 钱包管理，出价归一化 |

### 跨局记忆
- 开启后 AI 会记住历史每局的结果与反思
- 局后反思功能：结算后调用 LLM 生成 200 字内的反思总结，存入跨局记忆

## 联机系统

### 架构
- **服务端**：Node.js WebSocket 服务器（`lan/server/`）
- **客户端**：浏览器端桥接层（`lan/client/lan-bridge.js`）
- **协议**：JSON 消息通信（`lan/shared/protocol.js`）

### 功能
- 创建/加入房间
- 实时同步出价、技能使用
- 主机端 AI 补位（人数不足时）
- 结算同步与再来一局

### 启动联机服务器
```bash
cd lan/server
npm install
node server.js
```

## 技术栈

- **Phaser 3.90** — 游戏引擎（仓库渲染、动画、交互）
- **纯前端** — 无后端依赖，所有数据存储在 localStorage
- **LLM API** — 可选的 AI 大模型决策（支持多家提供商）
- **WebSocket** — 联机通信
- **Android WebView** — 可打包为 Android APK

## 运行方式

直接用浏览器打开 `index.html` 即可运行（需 HTTP 服务器）：

```bash
# 使用 Python 简易服务器
python -m http.server 8080

# 或使用 Node.js
npx serve .
```

## Android 打包

依赖工具链位于 `D:\web\tool\`（JDK 17、Gradle 8.14.3、Android SDK）：

```powershell
$env:JAVA_HOME='D:\web\tool\jdk-17.0.18.8-hotspot'
$env:ANDROID_HOME='D:\web\tool\android-sdk'
cd android
& 'D:\web\tool\gradle-8.14.3\bin\gradle.bat' assembleDebug --no-daemon
```

APK 输出：`android/app/build/outputs/apk/debug/app-debug.apk`

## 设置项

| 设置项 | 默认值 | 说明 |
|--------|--------|------|
| maxRounds | 6 | 竞拍轮数 |
| actionsPerRound | 2 | 每轮可用动作次数 |
| roundSeconds | 18 | 每轮倒计时（秒） |
| directTakeRatio | 0.2 | 直接拿下倍率（需达第二名 1+ratio 倍） |
| bidStep | 100 | 最小出价步长 |
| bidDefaultRaise | 500 | 默认加价幅度 |

## 开发历程

- **v1.0** — 基础竞拍玩法
- **v1.1** — AI 系统、技能道具
- **v1.2** — LLM 集成、跨局记忆
- **v1.3** — 联机系统
- **v1.4** — 代码重构，模块化拆分

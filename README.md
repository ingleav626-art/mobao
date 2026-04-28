# 摸宝仓库 — 古董竞拍·暗仓探秘

一款基于 Phaser 3 的仓库摸宝竞拍游戏。玩家在随机生成的仓库中探查古董藏品，与 AI 竞拍者博弈出价，在有限轮次内以低于仓库真实总价值的成交价盈利。

## 游戏机制

### 核心玩法
- **仓库探查**：每局随机生成仓库，藏品以网格形式分布，品质从粗品到绝品共五档
- **多轮竞拍**：玩家与 3 个 AI 竞拍者轮流出价，非最终轮可触发"直接拿下"（出价达到第二名 × directWinRatio）
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
├── settings.html               设置页面
├── scripts/
│   ├── game/
│   │   ├── main.js             核心游戏逻辑（Phaser 场景、竞拍流程、AI 记忆）
│   │   ├── ai-bidding.js       规则 AI 出价引擎（人格参数、群体多样性调整）
│   │   ├── artifacts.js        藏品数据（品质配置、品类尺寸权重、估值模型）
│   │   ├── skills.js           技能系统（轮廓扫描、品质鉴定）
│   │   ├── items.js            道具系统（探照灯、鉴定针）
│   │   ├── public-events.js    公共事件池（市场传闻、拍卖行消息等）
│   │   ├── map-profiles.js     地图预设配置
│   │   ├── app-state.js        应用全局状态管理
│   │   ├── shop-bridge.js      商店系统（每日刷新道具购买）
│   │   ├── battle-record-bridge.js  战绩记录与统计
│   │   └── settlement-bridge.js     结算页面动画与展示
│   ├── llm/
│   │   ├── deepseek-llm.js     DeepSeek API 客户端与设置管理
│   │   └── scene-llm.js        AI LLM 决策桥接（提示词构建、多局记忆、反思）
│   └── ui/
│       └── settings.js         设置页面逻辑
├── styles/
│   ├── game/
│   │   ├── styles.css          游戏主样式
│   │   └── mobile-landscape.css 横屏移动端适配
│   ├── lobby/
│   │   ├── lobby.css           大厅样式
│   │   └── mobile-lobby.css    大厅移动端适配
│   └── ui/
│       └── settings.css        设置页面样式
├── android/                    Android WebView 打包项目
│   ├── app/                    Android 应用模块
│   ├── build.gradle            Gradle 构建配置
│   └── gradlew.bat             Gradle 启动脚本（使用本地工具链）
└── docs/                       开发文档（已 gitignore）
```

## AI 系统

### 双引擎架构
- **规则 AI**（`ai-bidding.js`）：基于人格参数的规则化出价引擎，每个 AI 有独立的激进/纪律/跟风/虚张声势等参数
- **LLM AI**（`scene-llm.js` + `deepseek-llm.js`）：通过 DeepSeek API 让 AI 基于上下文做出决策，支持技能/道具使用

### 跨局记忆
- 开启后 AI 会记住历史每局的结果与反思
- 局后反思功能：结算后调用 LLM 生成 200 字内的反思总结，存入跨局记忆

## 技术栈

- **Phaser 3.90** — 游戏引擎（仓库渲染、动画、交互）
- **纯前端** — 无后端依赖，所有数据存储在 localStorage
- **DeepSeek API** — 可选的 AI 大模型决策（需配置 API Key）
- **Android WebView** — 可打包为 Android APK

## 运行方式

直接用浏览器打开 `index.html` 即可运行（需 HTTP 服务器以支持 ES Module 加载）：

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

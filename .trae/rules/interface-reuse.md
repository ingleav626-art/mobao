---
alwaysApply: false
description: 当你需要复用接口时
---
# 接口复用清单

> 本文件列出项目中已有的可复用接口，实现新功能前必须先查阅此清单。

---

## 一、场景 Mixin（scripts/game/）

| Mixin | 文件 | 功能 | 使用方式 |
|-------|------|------|---------|
| CharacterSelectMixin | lobby/character-select.js | 角色选择（头像网格、Live2D 立绘、技能展示） | `Object.assign(Scene.prototype, CharacterSelectMixin)` |
| MapSelectMixin | lobby/map-select.js | 地图选择（地图卡片、参数预览） | 同上 |
| CarryItemsMixin | lobby/carry-items.js | 道具携带选择（道具列表、数量限制、自动补充） | 同上 |
| BiddingMixin | bidding/index.js | 出价流程（出价面板、倒计时、出价提交） | 同上 |
| ShopMixin | shop/index.js | 商店（购买、出售、库存管理） | 同上 |
| SettlementMixin | bridge/settlement.js | 结算（收益计算、品质揭示、数字滚动动画） | 同上 |
| BattleRecordMixin | bridge/battle-record.js | 战斗记录（回合历史、出价记录） | 同上 |
| LanIndexMixin | lan/index.js | 联机房间（房间 UI、玩家列表、WebSocket 事件） | 同上 |

## 二、全局单例（window.*）

| 单例 | 文件 | 功能 | 调用方式 |
|------|------|------|---------|
| AudioManager | audio/audio-manager.js | 音效/音乐播放控制 | `AudioManager.playSfx('coin')` |
| AudioUI | audio/audio-ui.js | 音频 UI 自动播放 | `AudioUI.playClick()` |
| MobileHandler | mobile/mobile-handler.js | 移动端适配 | `MobileHandler.isMobile` |
| LanBridge | lan/client/lan-bridge.js (构造函数) | 联机通信 | `new LanBridge()` → `bridge.connect()` |

## 三、数据模块（scripts/game/data/）

| 模块 | 文件 | 内容 |
|------|------|------|
| QUALITY_CONFIG | data/artifacts.js | 品质配置（颜色、权重、标签） |
| CATEGORY_CONFIG | data/artifacts.js | 类别配置（瓷器、玉器、书画等） |
| CHARACTERS | data/characters.js | 角色定义（技能、属性） |
| SKILLS | data/skills.js | 技能定义（效果、冷却） |
| ITEMS | data/items.js | 道具定义（效果、价格） |
| MAP_PROFILES | data/map-profiles.js | 地图配置（参数、权重） |
| PUBLIC_EVENTS | data/public-events.js | 公共事件定义 |

## 四、核心工具（scripts/game/core/）

| 工具 | 文件 | 功能 |
|------|------|------|
| MobaoSettings | core/settings.js | 游戏设置（音量、难度等） |
| MobaoAppState | core/app-state.js | 应用状态（当前场景、玩家数据） |
| CONSTANTS | core/constants.js | 全局常量（网格尺寸、时间限制等） |
| Utils | core/utils.js | 工具函数（格式化、随机等） |

## 五、AI 模块（scripts/game/ai/）

| 模块 | 文件 | 功能 |
|------|------|------|
| BiddingAI | ai/bidding.js | 规则 AI 出价（8步算法） |
| AIWallet | ai/wallet.js | AI 钱包管理（跨游戏持久化） |
| AIIntel | ai/intel.js | AI 情报系统（私有信息管理） |
| AIMemory | ai/memory.js | AI 记忆系统（跨游戏经验） |
| AIReflection | ai/reflection.js | AI 反思系统（赛后总结） |

## 六、LLM 模块（scripts/llm/）

| 模块 | 文件 | 功能 |
|------|------|------|
| LlmManager | llm/llm-manager.js | LLM 提供商管理（多提供商、回退） |
| LlmUiBridge | llm/llm-ui-bridge.js | LLM 设置 UI 桥接 |
| SceneLlm | llm/scene-llm.js | 场景级 LLM 决策 |
| DeepSeekLlm | llm/deepseek-llm.js | DeepSeek 提供商 |
| DeepSeekProvider | llm/deepseek-provider.js | DeepSeek API 适配 |
| OpenAIProvider | llm/openai-provider.js | OpenAI API 适配 |
| QwenProvider | llm/qwen-provider.js | 通义千问 API 适配 |
| KimiProvider | llm/kimi-provider.js | Kimi API 适配 |
| GLMProvider | llm/glm-provider.js | 智谱 GLM API 适配 |

## 七、UI 组件（scripts/game/ui/）

| 组件 | 文件 | 功能 |
|------|------|------|
| HistoryUI | ui/history.js | 历史记录面板 |
| OverlayUI | ui/overlay.js | 覆盖层/弹窗系统 |
| PanelsUI | ui/panels.js | 信息面板（个人/公共/结算） |

---

> 新增接口时必须更新此清单。
> 格式：`| 名称 | 文件路径 | 功能简述 |`

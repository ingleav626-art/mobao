# 摸宝仓库 — 文件导航表

> 生成时间：2026-07-12
> 用途：每个源文件的一句话职责说明，作为项目总体参考

## scripts/audio/

| 文件 | 职责 |
|------|------|
| audio-manager.ts | 音频管理器单例，管理 SFX/BGM 的加载、播放、控制和持久化设置 |
| audio-ui.ts | 音频 UI 交互层单例，监听 DOM 事件自动播放对应音效，提供业务快捷方法 |

## scripts/game/

| 文件 | 职责 |
|------|------|
| main.ts | 游戏入口与组装文件（198行）：创建桥接层、将 19 个 Mixin + bridge.methods 直接 Object.assign 到 WarehouseScene.prototype、启动 Phaser |
| animations.ts | 前端动效工具库单例，提供涟漪、数字滚动、卡片入场、脉冲、覆盖层动效等 9 类通用动画 |

## scripts/game/ai/

| 文件 | 职责 |
|------|------|
| index.ts | AI 系统模块聚合导出，re-export 钱包/情报/记忆/反思/决策五个 Mixin |
| bidding.ts | AI 出价引擎（AuctionAiEngine 类），基于人格/情报/市场价计算出价决策；纯函数已提取到 ai/bidding/ 子目录，类方法委托（1213->716 行）|
| context-builder.ts | AI 上下文构建器，从场景状态提取结构化数据供 AI 决策和 LLM 对话使用 |
| decision.ts | AI 决策日志与记录，记录 AI 出价的决策过程（渲染 UI 已迁 ui/overlay/core.ts） |
| game-history.ts | AI 多局历史存储系统，管理最近 N 局完整对局记录，支持滑动窗口裁剪 |
| memory.ts | AI 跨局记忆系统，管理对局内对话历史和跨局经验本，支持持久化和导入导出 |
| reflection.ts | AI 局后反思系统，通过 LLM 让 AI 反思表现并更新跨局经验本 |
| summarizer.ts | AI 定期总结系统，当对局数达到间隔时触发 LLM 生成跨局经验总结 |
| wallet.ts | AI 玩家钱包管理，负责虚拟资金初始化、持久化、余额查询和出价规范化 |

## scripts/game/ai/bidding/

| 文件 | 职责 |
|------|------|
| types.ts | AI 出价引擎的接口定义（14 个 interface：Personality/AiStateEntry/ToolEffect/ConfidenceParts 等）|
| pure.ts | 出价相关纯函数（buildToolEffect/computeConfidenceParts/applyCrowdDiversity/defaultPersona/normalizeToolEffect/marketReference + computeSingleDecision 子公式 calcHardCap 等 8 个），可独立测试 |
| intel-action.ts | 情报动作规划纯函数（planIntelAction，参数化 personalityMap）|

## scripts/game/ai/intel/

| 文件 | 职责 |
|------|------|
| intel.ts | AI 情报系统薄入口，通过 Object.assign 合并 5 个子 Mixin，re-export 纯函数 |
| pure.ts | AI 情报系统的可独立测试纯函数（随机选格、高价值阈值、揭示级别、不确定性计算等） |
| init.ts | AI 情报系统初始化 Mixin，初始化情报池、资源状态、角色分配、LLM 开关 |
| snapshot.ts | AI 情报摘要与资源快照 Mixin，构建情报汇总、可用动作状态、不确定性评估 |
| reveal.ts | AI 情报揭示执行 Mixin，执行藏品揭示、信号统计、高价值追踪、空间推理 |
| panel.ts | AI 情报面板渲染 Mixin，渲染私有情报面板、候选列表、邻居状态标签 |
| action.ts | AI 情报动作执行 Mixin，执行技能/道具动作、LLM 纠错流程、LAN 通信 |

## scripts/game/bidding/

| 文件 | 职责 |
|------|------|
| index.ts | 出价流程控制 Mixin，管理玩家/AI 出价交互、回合结算、揭示动画、直接拿下判定、联机出价（通用对话框已迁 ui/overlay/，474->446 行）|

## scripts/game/bridge/

| 文件 | 职责 |
|------|------|
| battle-record.ts | 战绩记录 Bridge 薄入口工厂，调用 5 slice 工厂组装 methods（908->54 行）|
| shop.ts | 商店系统 Bridge 单例，管理道具购买、消耗、库存持久化、每日限购、限时特惠 |
| settlement.ts | 结算系统 Bridge（工厂函数），管理结算页面、藏品逐个揭示动画、品质特效（粒子效果已抽到 settlement-particles.ts，773->590 行）|
| settlement-particles.ts | 结算庆祝粒子效果（playSettlementFinalEffect + 6 spawn helper：金币/星星/上升/闪烁粒子）|

## scripts/game/bridge/battle-record/

| 文件 | 职责 |
|------|------|
| types.ts | 战绩记录 Bridge 的接口定义（6 个 interface：BattleRecordDeps/BattleRecord 等）|
| pure.ts | 纯函数（formatRecordTime + parsePanelTextToHtml(text, escapeHtml)），可独立测试 |
| persist.ts | createPersistSlice：战绩持久化（load/saveBattleRecords + buildWarehouseSnapshotForRecord/saveBattleRecord/deleteBattleRecord）|
| panel.ts | createPanelSlice：战绩面板渲染（open/closeBattleRecordPanel + renderBattleRecordSummary/Panel）|
| log-view.ts | createLogViewSlice：日志视图（open/closeBattleRecordLogs + renderBattleRecordLogView，调 pure.parsePanelTextToHtml）|
| replay.ts | createReplaySlice：回放（openBattleRecordReplay）|
| restore.ts | createRestoreSlice：仓库恢复（restoreWarehouseFromBattleRecord）|

## scripts/game/core/

| 文件 | 职责 |
|------|------|
| app-state.ts | 应用全局状态管理，持久化当前模式、大厅标签页、地图选择、游戏统计等 |
| constants.ts | 游戏全局常量定义，仓库网格布局、Canvas 尺寸、存储键名、品质配置等 |
| deps.ts | 依赖注入容器，解决模块拆分后局部变量无法被其他 ES Module 访问的问题 |
| round-manager.ts | 回合生命周期管理 Mixin，负责回合初始化、计时器、暂停/恢复、出价显示重置 |
| settings.ts | 游戏设置管理，规则参数的持久化、规范化校验（PlayerMoney 已拆到 player-money.ts，129->109 行）|
| player-money.ts | 玩家资金读写（loadPlayerMoney/savePlayerMoney，从 settings.ts 拆出）|
| settlement-manager.ts | 结算业务逻辑 Mixin，负责分红/门票计算、钱包更新、联机结算分发、战绩保存、AI 反思触发 |
| skill-item-manager.ts | 技能/道具使用管理 Mixin，处理技能道具的使用、扣减、角色加成、动作状态管理 |
| utils.ts | 全局工具函数库，提供数组/数值/字符串处理、Phaser 动画封装、AI 情报池初始化等 |

## scripts/game/data/

| 文件 | 职责 |
|------|------|
| artifacts.ts | 藏品数据薄入口（18行），re-export artifacts/ 4 子模块的全部公共符号 |
| character-system.ts | 角色系统运行时管理，管理当前选中角色状态、被动技能效果计算、角色选择持久化 |
| characters.ts | 角色数据定义，定义 3 个可玩角色的静态数据（ID、技能、被动、头像、立绘） |
| items.ts | 道具数据定义与使用管理，定义 11 种道具配置，ItemManager 负责使用、扣减和状态查询 |
| map-profiles.ts | 地图配置定义，定义 4 个地图的参数配置（回合数、直接拿下比例、品质权重等） |
| public-events.ts | 公共事件系统，根据仓库藏品分布自动生成公共情报事件 |
| skills.ts | 技能数据定义与使用管理，定义 3 个主动技能配置，SkillManager 负责使用、扣减和状态查询 |
| def-manager-helpers.ts | ItemManager/SkillManager 共享 helper（applyUse + resetEntries），消除 use/reset 同构重复 |

## scripts/game/data/artifacts/

| 文件 | 职责 |
|------|------|
| config.ts | 品质配置（QUALITY_CONFIG + SIZE_TAG_BY_DIMENSION + CATEGORY_WEIGHTS）|
| library.ts | ARTIFACT_LIBRARY 藏品数据（73 件）|
| pure.ts | 9 纯函数（estimatePriceByQuality/signalToRevealState/summarizeCandidatePrices 等）|
| manager.ts | ArtifactManager 类（藏品生成管理）|

## scripts/game/lan/

| 文件 | 职责 |
|------|------|
| index.ts | 联机模块聚合 Mixin，合并 6 个子 Mixin（events/sync/reconnect/settle/game-flow/live2d） |
| events.ts | 联机 WebSocket 事件绑定 Mixin，管理所有 bridge.on() 事件监听器注册 |
| game-flow.ts | 联机游戏流程 Mixin，管理出价结算、AI 出价计算、回合开始/结束、超时处理 |
| live2d.ts | 联机大厅 Live2D 立绘无缝循环播放器，双视频 A/B 切换实现 |
| lobby.ts | 联机大厅 UI 实现，包含房间管理、玩家槽位、角色选择、道具携带、地图选择等 UI 逻辑 |
| reconnect.ts | 联机断线重连 Mixin，管理自动重连逻辑 |
| settle.ts | 联机结算 Mixin，处理最终结算、普通结算、重开一局 |
| sync.ts | 联机数据同步 Mixin，管理全量状态同步、仓库恢复、断线重连、暂停/后台/前台处理 |

## scripts/game/lobby/

| 文件 | 职责 |
|------|------|
| index.ts | 大厅主页面 Mixin，管理页面导航、子页面切换、单机/联机入口、玩家初始化、游戏启动（收藏图鉴已迁 lobby/collection.ts，908->678 行）|
| collection.ts | LobbyCollectionMixin：收藏图鉴面板（openCollectionOverlay/initCollectionPanel/renderCollectionGrid 等 7 方法 + sortCollectionItems 纯函数）|
| carousel.ts | 大厅地图选择轮播组件，提供卡片横向滚动、触摸滑动、箭头导航、地图详情展示 |
| character-select.ts | 角色选择薄入口，通过 Object.assign 合并核心/Live2D/携带道具三个 Mixin，re-export 纯函数 |

## scripts/game/lobby/character-select/

| 文件 | 职责 |
|------|------|
| pure.ts | 角色选择子系统的纯函数和共享类型（携带道具接口、补充成本计算） |
| live2d.ts | 角色选择页 Live2D 双视频无缝循环 Mixin，含预热、切换、重试、诊断日志 |
| carry-items.ts | 携带道具系统 Mixin，管理道具槽位渲染、选择器、增删、自动补充、持久化 |

## scripts/game/scene/

| 文件 | 职责 |
|------|------|
| warehouse-scene.ts | WarehouseScene 类定义，属性声明、构造函数、Mixin 方法类型声明（类型用途，实际类在 main.ts） |
| scene-init.ts | 场景初始化方法，包含 create、initAudio、cacheDom、initAnimations、bindDomEvents |
| scene-run.ts | 回合管理方法，包含 startNewRun（新局初始化、仓库生成、AI 初始化） |
| scene-hud.ts | HUD 更新方法，包含 updateHud 和 updateActionAvailability |
| scene-utils.ts | 场景工具方法，快照构建、坐标转换、排名标记、运行令牌、LLM 设置获取 |
| scene-ai-panel.ts | AI 逻辑面板渲染（renderAiLogicPanel）+ LLM 设置方法（getLlmSettings/getLlmProvider）；LLM_BRIDGE.methods 已直接挂原型，不再需转发代理 |
| scene-character.ts | 角色相关场景方法（applyCharacterToPlayer/bindCharacterSkillButton/refreshSkillButtonLabel），从 main.ts MainOnlyMethods 迁入 |
| scene-battle-record.ts | 仅保留 buildWarehouseSnapshotForSync 别名；战绩方法由 BATTLE_RECORD_BRIDGE.methods 直接挂原型 |
| scene-settlement.ts | 空占位（仅文档注释）；结算方法由 SETTLEMENT_BRIDGE.methods 直接挂原型 |
| events-overlay.ts | 覆盖层/弹窗事件绑定（设置面板、信息弹窗、玩家气泡的点击/关闭事件） |
| events-settings.ts | 设置面板事件绑定（音量滑块、重抽按钮、设置保存/重置/关闭） |
| events-ai-memory.ts | AI 记忆面板事件绑定（设置关闭/重置、AI 记忆面板开关、经验本导入导出） |
| events-ai-panel.ts | AI 逻辑面板事件绑定（面板开关、消息查看、日志渲染） |
| events-battle-record.ts | 战绩面板事件绑定（面板开关、记录点击、回放控制） |
| events-item-drawer.ts | 道具抽屉事件绑定（道具使用按钮、抽屉开关/关闭） |
| events-settlement.ts | 结算页事件绑定（结算按钮、返回、重开、藏品跳过揭示） |

## scripts/game/shop/

| 文件 | 职责 |
|------|------|
| index.ts | 商店页面 UI 管理单例，管理道具浏览、搜索筛选、购买、库存查看、限时特惠交互 |

## scripts/game/ui/

| 文件 | 职责 |
|------|------|
| index.ts | UI 组件模块聚合导出，re-export 覆盖层/信息面板/历史记录三个 Mixin |
| overlay.ts | 弹窗与覆盖层管理薄入口（32行），Object.assign 合并 overlay/ 下 7 个子 Mixin，re-export 纯函数 |
| panels.ts | 侧边信息面板 Mixin，管理左右两侧的私有情报面板和公共信息面板的渲染和更新 |
| history.ts | 玩家历史记录与道具抽屉 Mixin，管理出价历史、道具使用记录、道具抽屉开关和渲染 |

## scripts/game/ui/overlay/

| 文件 | 职责 |
|------|------|
| pure.ts | 纯函数（getCollectionCategories、filterCollectionItems），零依赖可独立测试 |
| info-popup.ts | InfoPopupMixin：信息弹窗与玩家气泡（showInfoPopup/showPlayerInfoPopover 等 5 方法） |
| detail-popup.ts | DetailPopupMixin：道具/角色详情弹窗（showItemDetailPopup/showCharacterInfoPopup 等 4 方法） |
| settings.ts | SettingsMixin：设置面板（8 方法，含越界 saveSettingsFromOverlay + 3 个 DeepSeek 迁移别名） |
| lan-dialog.ts | LanDialogMixin：LAN 重开投票/暂停弹窗（6 方法，含 2 越界） |
| ai-model-config.ts | AiModelConfigMixin：AI 模型配置面板（7 方法 + 1 属性） |
| ai-memory-panel.ts | AiMemoryPanelMixin：AI 记忆面板 UI（openAiMemoryPanel 等 3 方法，从 ai/memory.ts 迁入）|
| ai-reflection-dialog.ts | AiReflectionDialogMixin：AI 反思待处理对话框 UI（showReflectionPendingDialog 等 4 方法，从 ai/reflection.ts 迁入）|
| confirm-dialog.ts | ConfirmDialogMixin：通用确认对话框（showGameConfirm/hideGameConfirm，从 bidding/index.ts 迁入）|
| core.ts | CoreOverlayMixin：通用覆盖层开关（结算开闭/AI面板/商店转发，6 方法） |

## scripts/game/warehouse/

| 文件 | 职责 |
|------|------|
| index.ts | 仓库核心系统薄入口，re-export 三个 Mixin（Core/Reveal/Preview）和共享纯函数 |
| types.ts | 仓库 Mixin 的 this 类型定义（WarehouseSceneLike 运行时接口） |
| core.ts | 仓库核心 Mixin，管理网格绘制、藏品生成与放置、仓库初始化 |
| reveal.ts | 仓库揭示 Mixin，管理藏品揭示动画、品质特效、信号生成 |
| preview.ts | 仓库预览 Mixin，管理候选藏品预览弹窗的定位和渲染 |

## scripts/llm/core/

| 文件 | 职责 |
|------|------|
| scene-llm.ts | 场景 LLM 桥接器入口，合并 4 个子模块（error/settings/prompt/decision）为统一接口 |
| llm-manager.ts | LLM 多 Provider 管理器薄入口，负责 Provider 注册表管理和自定义 Provider 持久化 |
| manager-utils.ts | LLM 管理器的纯工具函数，便于独立测试和复用 |
| provider-factory.ts | LLM Provider 工厂函数，createBaseProvider 和 createOpenAICompatibleProvider |
| prompts.ts | LLM 决策 Prompt 模板，集中管理所有 LLM 提示词 |
| llm-error.ts | LLM 错误处理模块，JSON 解析、错误分类、Toast 通知、Badge 显示 |
| llm-prompt.ts | LLM Prompt 构建与决策解析模块，payload 组装、prompt/messages 构建、动作解析 |
| llm-settings.ts | LLM 设置 UI 模块，设置表单读写、连接测试、开关管理 |
| llm-ui-bridge.ts | LLM 设置 UI 桥接层单例，连接 LlmManager 与设置面板 DOM，处理 Provider 切换/表单/连接测试 |
| llm-decision.ts | LLM 决策流程薄入口，组合拆分后的子模块并 re-export 纯函数 |

## scripts/llm/core/decision/

| 文件 | 职责 |
|------|------|
| types.ts | LLM 决策子模块的类型定义（规则决策条目、遥测条目、依赖容器接口） |
| pure.ts | LLM 决策子模块的纯函数（AI 索引解析、模型配置校验、控制模式标签、条目详情渲染） |
| request.ts | LLM 决策请求方法，发起 LLM 请求、构建 prompt、解析响应、处理错误 |
| correction.ts | LLM 决策纠错方法，请求 AI LLM 错误纠正、重试逻辑、纠错历史管理 |
| panel.ts | LLM 决策面板方法，捕获遥测数据、渲染决策日志、构建快照 |

## scripts/llm/providers/

| 文件 | 职责 |
|------|------|
| deepseek-provider.ts | DeepSeek Provider 插件，基于工厂函数创建，注册到 LlmManager |
| openai-provider.ts | OpenAI Provider 插件，基于工厂函数创建，注册到 LlmManager |
| qwen-provider.ts | 通义千问 Provider 插件，基于工厂函数创建，注册到 LlmManager |
| glm-provider.ts | 智谱 GLM Provider 插件，基于工厂函数创建，注册到 LlmManager |
| kimi-provider.ts | Moonshot Kimi Provider 插件，基于工厂函数创建，注册到 LlmManager |

## scripts/mobile/

| 文件 | 职责 |
|------|------|
| mobile-handler.ts | 移动端适配处理器薄入口（56行），Object.assign 合并 mobile-handler/ 9 子模块 + re-export 纯函数 + 自动初始化 |

## scripts/mobile/mobile-handler/

| 文件 | 职责 |
|------|------|
| types.ts | MobileHandlerType 接口（11 属性 + 18 方法签名）|
| pure.ts | 5 纯函数（detectMobile/detectTouch/calcSafeKeyboardHeight/isTextInputElement/isPortraitOrientation）|
| styles.ts | addStyles() CSS 注入 |
| core.ts | CorePart：11 状态属性 + init |
| keyboard.ts | KeyboardPart：键盘适配 6 方法 |
| input.ts | InputPart：输入框定位 6 方法 |
| orientation.ts | OrientationPart：横竖屏切换 |
| custom-select.ts | CustomSelectPart：自定义 select 3 方法（含 convertToCustomSelect）|
| vibration.ts | VibrationPart：振动反馈 |

## types/

| 文件 | 职责 |
|------|------|
| game.d.ts | 游戏核心类型定义（藏品、品质、玩家、技能、道具、地图、角色） |
| ai.d.ts | AI 系统类型定义（人格、出价决策、情报分析、记忆、反思） |
| llm.d.ts | LLM 桥接层类型定义（决策载荷、响应解析、遥测记录） |
| lan.d.ts | 联机通信类型定义（WebSocket 消息、房间管理、座位槽位） |
| globals.d.ts | 全局变量声明，为 TS 编译器提供 window/全局变量的类型 |
| warehouse-scene-this.d.ts | WarehouseSceneThis 接口，定义所有 Mixin 混入后的完整类型 |

## lan/client/

| 文件 | 职责 |
|------|------|
| lan-bridge.ts | 联机通信桥客户端，封装 WebSocket 连接管理、消息收发、事件系统、原生桥接 |
| lan-bridge.d.ts | LanBridge 模块类型声明 |

## lan/server/

| 文件 | 职责 |
|------|------|
| server.js | 联机游戏服务器（Node.js），HTTP + WebSocket + UDP 设备发现，房间管理/状态同步/消息中继 |

## lan/shared/

| 文件 | 职责 |
|------|------|
| protocol.ts | 联机通信协议常量定义，消息类型、协议版本、房间状态、回合阶段常量 + 默认服务器 URL（DEFAULT_LAN_SERVER_URL/DEFAULT_LAN_HTTP_BASE，被 reconnect.ts/lobby.ts 使用）|

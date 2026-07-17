# lan/lobby.ts 拆分方案

> 创建时间：2026-07-12
> 状态：📋 计划中（仅调查 + 计划，未执行代码改动）
> 目标：将 `scripts/game/lan/lobby.ts`（1282 行，单一长函数 `initLanLobbyImpl`）拆分为"薄入口协调器 + 子目录 + 纯函数"结构。
> task-list #4 来源：`analysis/lan-game.md` 标注"严重臃肿：网络扫描+HTTP API+UI渲染+闭包状态全在 initLanLobbyImpl"。

---

## 一、现状分析

### 1.1 文件形态：单一长函数（非 Mixin 对象）

与 `ui/overlay.ts`（40 个离散方法的对象字面量）**本质不同**，`lobby.ts` 是**单一导出函数**：

```ts
export function initLanLobbyImpl(this: WarehouseSceneThis) {
  // L47-L1282: 1236 行的命令式函数体
  // 包含 ~30 个闭包内函数 + ~49 个 DOM 元素获取 + ~18 个闭包共享变量
}
```

- 导出：`initLanLobbyImpl`（唯一导出）
- 消费方：`scripts/game/lan/index.ts` L54 导入，L58 `initLanLobbyImpl.call(this)` 调用
- 类型声明：`types/warehouse-scene-this.d.ts` L788 `initLanLobby(): void`
- 外部调用方：`scripts/game/lobby/index.ts` L156 `this.initLanLobby()`
- **无测试文件**（`tests/game/lan/` 目录不存在）

### 1.2 对外接口（拆分后必须保持不变）

| 消费方 | 导入路径 | 导入内容 |
|--------|----------|----------|
| `scripts/game/lan/index.ts` L54 | `from "./lobby.js"` | `initLanLobbyImpl` |
| `types/warehouse-scene-this.d.ts` L788 | - | `initLanLobby(): void`（类型声明） |

**拆分后 `lobby.ts` 仍以同名导出 `initLanLobbyImpl`，签名 `(this: WarehouseSceneThis) => void` 不变。`lan/index.ts` 零改动。**

### 1.3 git 状态确认

`lobby.ts` 当前工作区干净（无未提交改动）。`lan/` 目录下其他文件（`sync.ts`）也干净。不存在与并行 task-list 流冲突的风险。

---

## 二、initLanLobbyImpl 内部逻辑块剖析

### 2.1 完整逻辑块表

按行号区间列出所有逻辑块。**耦合度**标注：纯=无 DOM/网络/this 依赖；DOM=操作 DOM 元素；网络=HTTP/WebSocket；this=调用场景方法；闭包=读写闭包共享变量。

| # | 块名 | 行号 | 职责 | 耦合度 | 闭包变量读写 |
|---|------|------|------|--------|-------------|
| B1 | Bridge 初始化 + 状态重置 | L48-L58 | 创建 LanBridge 实例，重置 isLanMode/lanHostWallets/lanHostBids/lanAiPlayers | this, 闭包 | 写 bridge |
| B2 | setOnlineStatus 定义 | L60-L67 | 获取 statusEl，定义 this.setOnlineStatus 闭包 | DOM, this | 写 this.lanStatusEl, this.setOnlineStatus |
| B3 | 自动重连检测 | L69-L85 | 读 localStorage，调 this.tryAutoReconnect | DOM(localStorage), this | - |
| B4 | DOM 元素获取 | L87-L135 | 通过 `$` 获取 ~49 个 DOM 元素 | DOM | 写 ~49 个局部 const |
| B5 | 闭包状态变量 + 守卫 | L136-L142 | 定义 lanSelectedCharacterId/lanCarryItems/lanSelectedMapId；if(!createBtn/\!joinBtn) return | 闭包 | 写 3 个状态变量 |
| B6 | Alert 弹窗辅助 | L144-L166 | showLanAlert/hideLanAlert 函数 + 绑定 alert 按钮 | DOM | - |
| B7 | 玩家名加载 + 状态变量 | L168-L174 | 加载保存的玩家名；定义 selectedVisibility/discoveredServers/pendingJoin* | DOM, 闭包 | 写 4 个状态变量 |
| B8 | 原生桥接设置 | L176-L197 | isNative 检测，onNativeServerError 设置，toggleServerBtn 绑定 | DOM, 网络(原生) | 写 isNative |
| B9 | setOnlineStatus 引用捕获 | L199 | `const setOnlineStatus = this.setOnlineStatus` | 闭包 | 读 this.setOnlineStatus |
| B10 | showPanel 函数 | L201-L223 | 隐藏所有面板，显示目标面板 | DOM | 读 4 个 panel 元素 |
| B11 | getPlayerName 函数 | L225-L229 | 从输入框获取名称，存 localStorage | DOM | 读 playerName |
| B12 | connectWithRetry 函数 | L231-L263 | 带指数退避的重试连接 + 创建房间 | 网络, this | 读 bridge, setOnlineStatus |
| B13 | autoConnectAndCreate 函数 | L265-L311 | 原生/非原生自动连接并创建房间 | 网络, DOM, 原生 | 读 isNative, bridge, serverUrl, setOnlineStatus, connectWithRetry, getPlayerName |
| B14 | autoConnectAndJoin 函数 | L313-L333 | 自动连接并加入房间 | 网络, 原生 | 读 isNative, bridge, setOnlineStatus, getPlayerName |
| B15 | detectLocalIP 函数 | L335-L358 | WebRTC ICE 获取本机 IP | 网络(WebRTC) | - |
| B16 | scanSubnet 函数 | L360-L395 | 扫描子网 1-254，fetch /rooms | 网络(HTTP) | - |
| B17 | scanRoomsNativeFull 函数 | L397-L440 | 原生房间发现：HTTP + 原生 discover | 网络, 原生, DOM | 读写 discoveredServers；调 dedupFound, renderRoomList, processRoomData, setOnlineStatus |
| B18 | scanRooms 函数 | L442-L501 | Web 房间发现：fetch /rooms 或回退扫描 | 网络(HTTP), DOM | 读写 discoveredServers；调 fallbackScan, processRoomData, dedupFound, renderRoomList, setOnlineStatus |
| B19 | processRoomData 函数 | L503-L522 | 解析 HTTP 响应，按 serverIp 分组 remoteRooms | 纯 | - |
| B20 | dedupFound 函数 | L524-L543 | 按 serverIp:code 去重，移除空服务器 | 纯 | - |
| B21 | fallbackScan 函数 | L545-L568 | detectLocalIP + 常见子网 scanSubnet | 网络 | 调 detectLocalIP, scanSubnet |
| B22 | renderRoomList 函数 | L570-L638 | 构建 allRooms，渲染 DOM 列表项，绑定加入按钮 | DOM, 网络 | 读写 discoveredServers, pendingJoinServerIp, pendingJoinRoomCode；调 showLanAlert, autoConnectAndJoin |
| B23 | lanSlotConfig 定义 | L640-L645 | 4 槽位数组初始化为 empty | 闭包 | 写 lanSlotConfig |
| B24 | renderSlots 函数 | L647-L655 | 遍历槽位渲染，调 renderLanPlayerSlot + bindSlotActions | DOM | 读写 lanSlotConfig；调 renderLanPlayerSlot, bindSlotActions |
| B25 | renderLanPlayerSlot 函数 | L657-L694 | 按 type(host/client/ai/empty) 渲染槽位 HTML | DOM | 读 lanSlotConfig, bridge.playerId；调 getCharAvatarHtml |
| B26 | getCharAvatarHtml 函数 | L696-L703 | 获取角色头像 HTML | 纯(import) | - |
| B27 | bindSlotActions 函数 | L705-L757 | 绑定踢出/加AI/移除AI/LLM勾选事件 | DOM, 网络, this | 读写 lanSlotConfig；调 renderSlots, broadcastSlotState, this.writeLog |
| B28 | renderLanCharacterList 函数 | L759-L790 | 渲染角色卡片列表，绑定选择事件 | DOM, 网络 | 读写 lanSelectedCharacterId, lanSlotConfig；调 updateLanPortrait, renderSlots, bridge.send |
| B29 | updateLanPortrait 函数 | L792-L819 | 更新立绘区域，启动/停止 Live2D | DOM, this | 读 lanSelectedCharacterId；调 this.stopLanLive2dLoop, this.startLanLive2dLoop |
| B30 | openOverlay/closeOverlay 函数 | L822-L832 | 通用覆盖层开关（动画） | DOM | - |
| B31 | 覆盖层按钮绑定（角色/管理/地图） | L834-L918 | portraitArea/characterCloseBtn/roomManageBtn/mapCard 等点击绑定 | DOM | 读写 lanSelectedMapId；调 renderLanCharacterList, openOverlay, closeOverlay, renderLanMapList, bridge |
| B32 | renderLanMapList 函数 | L874-L902 | 渲染地图选择列表，绑定选择事件 | DOM, 网络 | 读写 lanSelectedMapId；调 closeOverlay, bridge.send, setSelectedProfileId |
| B33 | roomShopBtn 绑定 | L920-L933 | 打开商店，购买后发送 carry-items | DOM, 网络 | 读 lanCarryItems, bridge |
| B34 | renderLanCarryItems 函数 | L935-L963 | 渲染携带道具槽位，绑定移除事件 | DOM, 网络 | 读写 lanCarryItems；调 openLanCarryItemPicker, bridge.send |
| B35 | 携带道具选择器 | L965-L1056 | lanCarryPickerEl/LAN_MAX_CARRY + openLanCarryItemPicker + closeLanCarryItemPicker | DOM, 网络 | 读写 lanCarryItems, lanCarryPickerEl；调 renderLanCarryItems, bridge.send, MobaoShopBridge |
| B36 | initLanCharacterFromStorage 函数 | L1058-L1069 | 从存储加载角色，更新立绘+槽位 | DOM, this | 读写 lanSelectedCharacterId, lanSlotConfig；调 updateLanPortrait, renderSlots |
| B37 | updateModeMapCardState 函数 | L1071-L1080 | 切换 modeCard/mapCard 的 disabled 状态 | DOM | - |
| B38 | syncSlotsFromPlayers 函数 | L1082-L1109 | 从玩家列表重建 lanSlotConfig | 闭包 | 读写 lanSlotConfig；调 renderSlots, broadcastSlotState |
| B39 | broadcastSlotState 函数 | L1111-L1119 | 发送 room:slot-state 消息 | 网络 | 读 lanSlotConfig, bridge |
| B40 | bindLanEvents 调用 | L1121-L1129 | 构建大 ctx 对象，调 this.bindLanEvents | this | 读所有函数引用 + 状态 + DOM |
| B41 | 按钮事件绑定（连接/创建/加入等） | L1131-L1280 | connectBtn/createBtn/joinBtn/leaveBtn/startBtn 等 ~12 个按钮绑定 | DOM, 网络, this | 读写 selectedVisibility, lanSlotConfig, pendingJoin*；调 autoConnectAndCreate, autoConnectAndJoin, scanRooms, showPanel, setOnlineStatus, bridge 等 |

**统计：41 个逻辑块，~30 个闭包内函数，~49 个 DOM 元素，~18 个闭包共享变量。**

### 2.2 纯函数识别（可独立提取+测试）

| 函数 | 行号 | 依赖 | 可测试性 |
|------|------|------|----------|
| `processRoomData` | L503-L522 | 仅参数 + import 类型 | ✅ 高（输入输出等价性） |
| `dedupFound` | L524-L543 | 仅参数 | ✅ 高（数组去重逻辑） |
| `getCharAvatarHtml` | L696-L703 | import getCharacterById | ✅ 中（依赖角色数据） |
| `detectLocalIP` | L335-L358 | WebRTC API（Promise） | ⚠️ 中（需 mock RTCPeerConnection） |
| `scanSubnet` | L360-L395 | fetch API + 参数 | ⚠️ 中（需 mock fetch） |

---

## 三、闭包共享状态清单（拆分最大障碍）

### 3.1 可变状态变量（被多个块读写）

| # | 变量名 | 类型 | 定义行号 | 读写块 | 拆分处理方案 |
|---|--------|------|----------|--------|-------------|
| S1 | `lanSelectedCharacterId` | `string \| null` | L136 | B28,B29,B36 写；B28 读 | 提升为 state 对象属性 |
| S2 | `lanCarryItems` | `CarryItem[]` | L137 | B33,B34,B35 写；B33,B34,B40 读 | 提升为 state 对象属性（数组引用共享） |
| S3 | `lanSelectedMapId` | `string` | L138 | B31,B32 写；B32,B40 读 | 提升为 state 对象属性 |
| S4 | `selectedVisibility` | `string` | L171 | B7,B41(B13间接) 写；B41 读 | 提升为 state 对象属性 |
| S5 | `discoveredServers` | `LanServerInfo[]` | L172 | B17,B18,B22 读写 | 提升为 state 对象属性 |
| S6 | `pendingJoinServerIp` | `string \| null` | L173 | B22,B41 写；B22,B41 读 | 提升为 state 对象属性 |
| S7 | `pendingJoinRoomCode` | `string \| null` | L174 | B22,B41 写；B22,B41 读 | 提升为 state 对象属性 |
| S8 | `lanSlotConfig` | `Array<Record<string, any>>` | L640 | B24,B25,B27,B28,B36,B38,B39 读写 | 提升为 state 对象属性（数组引用共享） |
| S9 | `lanCarryPickerEl` | `HTMLElement \| null` | L966 | B35 读写 | 提升为 state 对象属性 |
| S10 | `isNative` | `boolean` | L176 | B8 写；B13,B14,B18 读 | 提升为 ctx 常量（只读） |

### 3.2 不可变引用（定义后不变，多块读取）

| # | 引用名 | 类型 | 定义行号 | 读取块数 |
|---|--------|------|----------|----------|
| R1 | `bridge` | `LanBridge` | L58 | ~15 块 |
| R2 | `$` | 查找函数 | L57 | B4（仅 DOM 获取阶段） |
| R3 | `setOnlineStatus` | 函数 | L199 | ~8 块 |
| R4 | `showPanel` | 函数 | L201 | ~5 块 |
| R5 | `showLanAlert` | 函数 | L145 | B22,B40 |
| R6 | `openOverlay` | 函数 | L822 | B31 |
| R7 | `closeOverlay` | 函数 | L828 | B31,B32 |
| R8 | `getPlayerName` | 函数 | L225 | B13,B14 |
| R9-R57 | ~49 个 DOM 元素 | `HTMLElement \| null` | L87-L135 | 各自相关块 |

### 3.3 闭包内函数互调关系（跨块依赖图）

```
scanRooms ──> scanRoomsNativeFull ──> dedupFound, renderRoomList, processRoomData
         └──> fallbackScan ──> detectLocalIP, scanSubnet
         └──> processRoomData, dedupFound, renderRoomList
renderRoomList ──> showLanAlert, autoConnectAndJoin
autoConnectAndJoin ──> getPlayerName, setOnlineStatus, bridge
autoConnectAndCreate ──> getPlayerName, setOnlineStatus, connectWithRetry, bridge
connectWithRetry ──> setOnlineStatus, bridge
renderSlots ──> renderLanPlayerSlot, bindSlotActions
bindSlotActions ──> renderSlots, broadcastSlotState
renderLanCharacterList ──> updateLanPortrait, renderSlots, bridge.send
initLanCharacterFromStorage ──> updateLanPortrait, renderSlots
syncSlotsFromPlayers ──> renderSlots, broadcastSlotState
renderLanCarryItems ──> openLanCarryItemPicker, bridge.send
openLanCarryItemPicker ──> closeLanCarryItemPicker, renderLanCarryItems, bridge.send
```

**跨模块互调（拆分后需通过 ctx 引用）：**
- `renderRoomList`(scan 模块) -> `autoConnectAndJoin`(connect 模块)
- `renderLanCharacterList`(character 模块) -> `renderSlots`(slots 模块)
- `initLanCharacterFromStorage`(character 模块) -> `renderSlots`(slots 模块)
- `bindSlotActions`(slots 模块) -> `renderSlots`(同模块，无问题)

---

## 四、拆分方案

### 4.1 方向选择：方向 B（长函数提取子函数 + 协调器）

`lobby.ts` 是单一长函数（非 Mixin 对象），无法直接套用 overlay 的"方法归类"模式（方向 A）。采用**方向 B**：提取子函数为模块级函数，纯函数入 `pure.ts`，DOM/网络块按职责入子模块，`initLanLobbyImpl` 改为协调器。

### 4.2 核心机制：共享上下文对象 `LanLobbyCtx`

将闭包共享状态和函数引用提升为显式的 `LanLobbyCtx` 对象（与 `events.ts` 的 `LanEventsCtx` 模式一致）：

```ts
// lobby/types.ts
interface LanLobbyState {
  lanSelectedCharacterId: string | null
  lanCarryItems: CarryItem[]
  lanSelectedMapId: string
  selectedVisibility: string
  discoveredServers: LanServerInfo[]
  pendingJoinServerIp: string | null
  pendingJoinRoomCode: string | null
  lanSlotConfig: Array<Record<string, any>>
  lanCarryPickerEl: HTMLElement | null
}

interface LanLobbyCtx extends LanLobbyState {
  scene: WarehouseSceneThis        // 场景引用
  bridge: LanBridge                // 通信桥
  isNative: boolean                // 原生标志
  // ~49 个 DOM 元素引用
  serverUrl: HTMLInputElement | null
  playerName: HTMLInputElement | null
  // ... (完整 DOM 列表)
  // 辅助函数（由协调器或 dom-helpers 设置）
  setOnlineStatus: (text: string, cls?: string) => void
  showPanel: (panel: HTMLElement | null) => void
  showLanAlert: (title: string, message: string) => void
  hideLanAlert: () => void
  openOverlay: (overlay: HTMLElement | null) => void
  closeOverlay: (overlay: HTMLElement | null) => void
  getPlayerName: () => string
  // 跨模块函数引用（由各 setup 函数赋值）
  renderSlots: () => void
  broadcastSlotState: () => void
  syncSlotsFromPlayers: (players: unknown[], resetAi?: boolean) => void
  autoConnectAndCreate: (options: { serverIp?: string; roomCode?: string; password?: string }) => void
  autoConnectAndJoin: (serverIp: string, roomCode: string, password?: string) => void
  scanRooms: () => void
  renderRoomList: () => void
  renderLanCharacterList: () => void
  updateLanPortrait: () => void
  initLanCharacterFromStorage: () => void
  renderLanCarryItems: () => void
  renderLanMapList: () => void
  updateModeMapCardState: (isHost: boolean) => void
}
```

**状态共享原理**：`lanSlotConfig` 和 `lanCarryItems` 是数组/对象引用，ctx 持有引用后各模块修改同一实例（与当前闭包行为一致）。`lanSelectedCharacterId` 等原始类型通过 `ctx.lanSelectedCharacterId = newValue` 赋值传播（与当前闭包 `var` 赋值一致）。

### 4.3 目录结构

```
scripts/game/lan/
  ├── lobby.ts                        # 薄入口协调器（~150 行）：状态初始化 + DOM 获取 + setup 调用 + 事件绑定
  ├── lobby/                          # 新建子目录
  │   ├── types.ts                    # LanLobbyState + LanLobbyCtx 接口定义（~80 行）
  │   ├── pure.ts                     # 纯函数：processRoomData, dedupFound, getCharAvatarHtml, detectLocalIP, scanSubnet（~120 行）
  │   ├── dom-helpers.ts              # DOM 辅助：openOverlay, closeOverlay, showPanel, showLanAlert, hideLanAlert, getPlayerName, updateModeMapCardState（~80 行）
  │   ├── connect.ts                  # 连接逻辑：connectWithRetry, autoConnectAndCreate, autoConnectAndJoin（~100 行）
  │   ├── scan.ts                     # 房间扫描：scanRooms, scanRoomsNativeFull, fallbackScan, renderRoomList（~200 行）
  │   ├── slots.ts                    # 槽位管理：renderSlots, renderLanPlayerSlot, bindSlotActions, syncSlotsFromPlayers, broadcastSlotState（~130 行）
  │   ├── character.ts                # 角色选择：renderLanCharacterList, updateLanPortrait, initLanCharacterFromStorage（~80 行）
  │   ├── carry-items.ts              # 道具携带：renderLanCarryItems, openLanCarryItemPicker, closeLanCarryItemPicker（~130 行）
  │   ├── map-select.ts               # 地图选择：renderLanMapList（~40 行）
  │   └── bind-events.ts              # 按钮事件绑定：connectBtn/createBtn/joinBtn/leaveBtn/startBtn 等 ~12 个绑定（~160 行）
  ├── index.ts                        # 不变
  ├── events.ts                       # 不变
  ├── sync.ts                         # 不变
  ├── reconnect.ts                    # 不变
  ├── settle.ts                       # 不变
  ├── game-flow.ts                    # 不变
  └── live2d.ts                       # 不变
```

### 4.4 各子模块详情

#### `lobby/pure.ts`（~120 行）- 纯函数，零 `this` 依赖

| 函数 | 来源行号 | 签名 | 说明 |
|------|----------|------|------|
| `processRoomData` | L503-L522 | `(data, serverIp, found) => void` | 解析 HTTP 响应，分组 remoteRooms |
| `dedupFound` | L524-L543 | `(found: LanServerInfo[]) => void` | 按 serverIp:code 去重 |
| `getCharAvatarHtml` | L696-L703 | `(characterId: string) => string` | 角色头像 HTML |
| `detectLocalIP` | L335-L358 | `() => Promise<string[]>` | WebRTC 获取本机 IP |
| `scanSubnet` | L360-L395 | `(subnet, found, onDone) => void` | 扫描子网 |

import：`getCharacterById` from `../data/characters`（仅 getCharAvatarHtml）。

**可测试性**：processRoomData、dedupFound 可直接加单元测试（输入输出等价性）。detectLocalIP、scanSubnet 需 mock WebRTC/fetch。

#### `lobby/types.ts`（~80 行）- 接口定义

定义 `LanLobbyState`、`LanLobbyCtx` 接口，以及从 lobby.ts 顶部迁移的 `LanRoomInfo`、`LanServerInfo` 接口。

import：`CarryItem` from `types/game`，`WarehouseSceneThis` from `types/warehouse-scene-this`。

#### `lobby/dom-helpers.ts`（~80 行）- DOM 辅助函数

| 函数 | 来源行号 | 签名 | 说明 |
|------|----------|------|------|
| `createOpenOverlay` | L822-L826 | `() => (overlay) => void` | 工厂函数，返回 openOverlay |
| `createCloseOverlay` | L828-L832 | `() => (overlay) => void` | 工厂函数，返回 closeOverlay |
| `createShowPanel` | L201-L223 | `(panels) => (panel) => void` | 工厂函数，接收 4 个 panel 元素 |
| `createShowLanAlert` | L145-L150 | `(alertEls) => (title, msg) => void` | 工厂函数 |
| `createHideLanAlert` | L152-L154 | `(alertOverlay) => () => void` | 工厂函数 |
| `createGetPlayerName` | L225-L229 | `(playerNameEl) => () => string` | 工厂函数 |
| `updateModeMapCardState` | L1071-L1080 | `(modeCard, mapCard) => (isHost) => void` | 工厂函数 |

**设计**：采用工厂函数模式，接收 DOM 元素，返回闭包函数。协调器调用工厂创建函数后赋值到 ctx。

#### `lobby/connect.ts`（~100 行）- 连接逻辑

| 函数 | 来源行号 | 签名 |
|------|----------|------|
| `connectWithRetry` | L231-L263 | `(ctx, url, name, roomOptions, serverFailedRef, maxAttempts?) => void` |
| `autoConnectAndCreate` | L265-L311 | `(ctx, options) => void` |
| `autoConnectAndJoin` | L313-L333 | `(ctx, serverIp, roomCode, password?) => void` |

依赖 ctx：`bridge`, `isNative`, `serverUrl`, `setOnlineStatus`, `getPlayerName`。
跨模块调用：无（autoConnectAndCreate 调 connectWithRetry 同模块）。

#### `lobby/scan.ts`（~200 行）- 房间扫描与列表渲染

| 函数 | 来源行号 | 签名 |
|------|----------|------|
| `scanRooms` | L442-L501 | `(ctx) => void` |
| `scanRoomsNativeFull` | L397-L440 | `(ctx) => void` |
| `fallbackScan` | L545-L568 | `(ctx, found, finishScan) => void` |
| `renderRoomList` | L570-L638 | `(ctx) => void` |

依赖 ctx：`bridge`, `isNative`, `serverUrl`, `joinList`, `joinPasswordField`, `joinPassword`, `setOnlineStatus`, `discoveredServers`, `pendingJoinServerIp`, `pendingJoinRoomCode`。
跨模块调用：`renderRoomList` -> `ctx.autoConnectAndJoin`(connect 模块)、`ctx.showLanAlert`(dom-helpers)。
调用 pure.ts：`processRoomData`, `dedupFound`, `detectLocalIP`, `scanSubnet`。

#### `lobby/slots.ts`（~130 行）- 玩家槽位管理

| 函数 | 来源行号 | 签名 |
|------|----------|------|
| `initSlotConfig` | L640-L645 | `() => Array<Record<string, any>>` | 初始化 4 空槽位 |
| `renderSlots` | L647-L655 | `(ctx) => void` |
| `renderLanPlayerSlot` | L657-L694 | `(ctx, el, i, cfg) => void` |
| `bindSlotActions` | L705-L757 | `(ctx, container) => void` |
| `syncSlotsFromPlayers` | L1082-L1109 | `(ctx, players, resetAi?) => void` |
| `broadcastSlotState` | L1111-L1119 | `(ctx) => void` |

依赖 ctx：`lanSlotConfig`, `playerGrid`, `bridge`, `scene.writeLog`。
跨模块调用：`bindSlotActions` -> `ctx.renderSlots`(同模块，通过 ctx 避免循环)、`ctx.broadcastSlotState`(同模块)。
调用 pure.ts：`getCharAvatarHtml`。

#### `lobby/character.ts`（~80 行）- 角色选择

| 函数 | 来源行号 | 签名 |
|------|----------|------|
| `renderLanCharacterList` | L759-L790 | `(ctx) => void` |
| `updateLanPortrait` | L792-L819 | `(ctx) => void` |
| `initLanCharacterFromStorage` | L1058-L1069 | `(ctx) => void` |

依赖 ctx：`lanSelectedCharacterId`, `lanSlotConfig`, `characterList`, `portraitArea`, `portraitPlaceholder`, `portraitName`, `bridge`, `scene`。
跨模块调用：`renderLanCharacterList` -> `ctx.updateLanPortrait`(同模块)、`ctx.renderSlots`(slots 模块)；`initLanCharacterFromStorage` -> `ctx.updateLanPortrait`(同模块)、`ctx.renderSlots`(slots 模块)。
调用 scene 方法：`this.stopLanLive2dLoop`, `this.startLanLive2dLoop`（Live2D Mixin 提供）。

#### `lobby/carry-items.ts`（~130 行）- 道具携带

| 函数 | 来源行号 | 签名 |
|------|----------|------|
| `renderLanCarryItems` | L935-L963 | `(ctx) => void` |
| `openLanCarryItemPicker` | L969-L1047 | `(ctx) => void` |
| `closeLanCarryItemPicker` | L1049-L1056 | `(ctx) => void` |

依赖 ctx：`lanCarryItems`, `lanCarryPickerEl`, `carryItemsRow`, `bridge`, `MobaoShopBridge`。
跨模块调用：`renderLanCarryItems` -> `ctx.openLanCarryItemPicker`(同模块)；`openLanCarryItemPicker` -> `ctx.closeLanCarryItemPicker`(同模块)、`ctx.renderLanCarryItems`(同模块)。

#### `lobby/map-select.ts`（~40 行）- 地图选择

| 函数 | 来源行号 | 签名 |
|------|----------|------|
| `renderLanMapList` | L874-L902 | `(ctx) => void` |

依赖 ctx：`lanSelectedMapId`, `mapCardLabel`, `bridge`, `closeOverlay`。
import：`getAllProfiles`, `setSelectedProfileId` from `../data/map-profiles`。

#### `lobby/bind-events.ts`（~160 行）- 按钮事件绑定

| 绑定 | 来源行号 | 说明 |
|------|----------|------|
| `connectBtn` click | L1131-L1141 | 手动连接 |
| `createBtn` click | L1143-L1156 | 显示创建面板 |
| `createBackBtn` click | L1158-L1162 | 返回连接面板 |
| `visibilityToggle` buttons | L1164-L1176 | 公开/私密切换 |
| `createConfirmBtn` click | L1178-L1188 | 确认创建房间 |
| `joinBtn` click | L1190-L1195 | 显示加入面板 + scanRooms |
| `joinBackBtn` click | L1197-L1201 | 返回连接面板 |
| `joinRefreshBtn` click | L1203-L1207 | 刷新房间列表 |
| `joinPassword` keydown | L1209-L1215 | 密码输入回车加入 |
| `leaveBtn` click | L1217-L1233 | 离开房间（含确认弹窗） |
| `copyRoomBtn` click | L1234-L1254 | 复制房间码 |
| `startBtn` click | L1257-L1280 | 开始游戏 |
| Alert 按钮绑定 | L156-L166 | alertCloseBtn/alertOkBtn/alertOverlay |

导出 `bindLobbyEvents(ctx: LanLobbyCtx): void`，由协调器调用。

#### `lobby.ts` 薄入口协调器（~150 行）

```ts
import type { WarehouseSceneThis } from "../../../types/warehouse-scene-this"
import type { CarryItem } from "../../../types/game"
import { LanRoomInfo, LanServerInfo } from "./lobby/types"
import type { LanLobbyCtx, LanLobbyState } from "./lobby/types"

// 纯函数 re-export（向后兼容 + 可测试）
export { processRoomData, dedupFound, getCharAvatarHtml } from "./lobby/pure"

export function initLanLobbyImpl(this: WarehouseSceneThis) {
  // 1. Bridge 初始化 + 状态重置（B1-B3）
  // 2. DOM 元素获取（B4）
  // 3. 创建 state 对象（B5, B7）
  // 4. 创建 ctx = { scene: this, bridge, isNative, ...state, ...domElements }
  // 5. 创建辅助函数并赋值到 ctx（dom-helpers 工厂调用）
  // 6. 初始化各子模块（setup 调用，赋值函数到 ctx）
  //    - ctx.renderSlots = (el, i, cfg) => renderSlots(ctx, el, i, cfg)
  //    - ctx.autoConnectAndJoin = (ip, code, pw?) => autoConnectAndJoin(ctx, ip, code, pw)
  //    - ... 等
  // 7. 绑定按钮事件：bindLobbyEvents(ctx)
  // 8. 绑定覆盖层事件（B31 的 portraitArea/characterCloseBtn 等）
  // 9. 调用 this.bindLanEvents(bridge, buildEventsCtx(ctx))
}
```

### 4.5 协调器与子模块的接线模式

子模块导出**接收 ctx 的模块级函数**，协调器创建 ctx 后将函数引用赋值到 ctx：

```ts
// slots.ts
export function renderSlots(ctx: LanLobbyCtx): void {
  const { playerGrid, lanSlotConfig } = ctx
  if (!playerGrid) return
  const slotEls = playerGrid.querySelectorAll(".lan-player-slot")
  slotEls.forEach((el, i) => {
    renderLanPlayerSlot(ctx, el, i, lanSlotConfig[i])
  })
  bindSlotActions(ctx, playerGrid)
}

// lobby.ts 协调器
import { renderSlots as _renderSlots } from "./lobby/slots"
ctx.renderSlots = () => _renderSlots(ctx)
```

**顺序保证**：协调器按依赖顺序初始化各模块（slots -> character -> carry-items -> connect -> scan），确保跨模块引用在首次调用前已赋值。由于所有函数引用在 `initLanLobbyImpl` 执行期间全部赋值完毕（用户交互发生在之后），不存在时序问题。

### 4.6 bindLanEvents 上下文构建

当前 B40（L1121-L1129）构建的 ctx 对象保持不变，但从 `LanLobbyCtx` 中提取字段：

```ts
this.bindLanEvents(bridge, {
  setOnlineStatus: ctx.setOnlineStatus,
  showPanel: ctx.showPanel,
  showLanAlert: ctx.showLanAlert,
  connectBtn, roomCodeEl, hostBadge, startBtn, roomManageBtn,
  connectPanel, roomPanel,
  renderSlots: ctx.renderSlots,
  syncSlotsFromPlayers: ctx.syncSlotsFromPlayers,
  initLanCharacterFromStorage: ctx.initLanCharacterFromStorage,
  renderLanCarryItems: ctx.renderLanCarryItems,
  updateModeMapCardState: ctx.updateModeMapCardState,
  lanCarryItems: ctx.lanCarryItems,           // 数组引用共享
  lanSlotConfig: ctx.lanSlotConfig,            // 数组引用共享
  lanSelectedMapId: ctx.lanSelectedMapId,      // 值拷贝（与当前行为一致）
  mapCardLabel,
  broadcastSlotState: ctx.broadcastSlotState,
  leaveBtn,
})
```

**关键**：`lanCarryItems` 和 `lanSlotConfig` 传引用（数组），events.ts 的修改会反映到 ctx。`lanSelectedMapId` 传值（string），events.ts 内部 `let lanSelectedMapId = ctx.lanSelectedMapId` 创建独立副本——**此行为必须保持**。

---

## 五、行为保持原则

### 5.1 只重组，不改逻辑

- **逐字搬移**每个函数体，包括 `var` 声明、`console.log` 调试语句、`function` vs 箭头函数风格，均原样保留。
- **不改函数签名语义**：原闭包函数改为 `(ctx, ...原参数) => ...`，ctx 仅替代闭包变量访问，不改变参数逻辑。
- **不改 LAN 协议消息**：所有 `bridge.send({ type: "..." })` / `bridge.on("...")` 消息类型和载荷原样保留。
- **不改 localStorage key**：`mobao_lan_*` 前缀 key 全部保留。
- **不改 DOM 元素 ID**：所有 `document.getElementById(...)` 的 ID 不变。
- **var -> const/let**：闭包变量提升为 ctx 属性后，`var` 自然消除（ctx 属性是对象属性，无 var/let 之分）。子模块内部的局部 `var` 可保留原样或改为 `const`/`let`（风格统一，但不改语义）。

### 5.2 不改的事件绑定行为

- `addEventListener` 的回调逻辑原样搬移，不改事件类型、不改触发条件。
- `if (xxx)` 守卫检查（DOM 元素可能为 null）全部保留。
- `leaveBtn` 块内嵌套 `copyRoomBtn` 绑定（L1234-L1254 在 `if (leaveBtn)` 块内）——**此嵌套结构保持不变**（虽然 copyRoomBtn 不依赖 leaveBtn，但改动可能影响初始化顺序，保持原样）。

### 5.3 对外接口不变

- `lobby.ts` 仍导出 `initLanLobbyImpl`，签名 `(this: WarehouseSceneThis) => void`。
- `lan/index.ts` L54 `import { initLanLobbyImpl } from "./lobby.js"` 不变。
- `types/warehouse-scene-this.d.ts` L788 `initLanLobby(): void` 不变。
- `lan/events.ts` 的 `LanEventsCtx` 接口和 `bindLanEvents` 方法不变。
- 新增纯函数 re-export（`processRoomData` 等）不影响现有导入。

---

## 六、可测试性提升点

### 6.1 第一优先级（纯函数，立即可测）

| 函数 | 模块 | 测试场景 |
|------|------|----------|
| `processRoomData` | `pure.ts` | 空 rooms/remoteRooms、重复 serverIp、多 remoteRooms 分组 |
| `dedupFound` | `pure.ts` | 空数组、重复 serverIp:code、空 rooms 过滤、多服务器混合 |
| `getCharAvatarHtml` | `pure.ts` | 有效角色(含 avatar)、有效角色(无 avatar)、无效 ID、getCharacterById 为 null |

### 6.2 第二优先级（需 mock，中等难度）

| 函数 | 模块 | 测试场景 |
|------|------|----------|
| `detectLocalIP` | `pure.ts` | mock RTCPeerConnection，验证 IP 提取、超时、异常 |
| `scanSubnet` | `pure.ts` | mock fetch，验证 254 IP 扫描、端口回退、超时 abort |
| `syncSlotsFromPlayers` | `slots.ts` | 4 种玩家组合（host+clients+ai+empty）、resetAi=true/false、超过 4 人截断 |

### 6.3 第三优先级（DOM 重，需 jsdom）

| 函数 | 模块 | 测试场景 |
|------|------|----------|
| `renderLanPlayerSlot` | `slots.ts` | 4 种 slot type 的 HTML 输出 |
| `renderRoomList` | `scan.ts` | 空列表、多房间、私密房间点击、已满房间拦截 |

---

## 七、验证步骤

拆分完成后依次执行：

1. **TypeScript 类型检查**：`npx tsc --noEmit` -> 期望 0 错误。
   - 重点核对：`LanLobbyCtx` 接口字段完整性（所有子模块访问的 ctx 属性都有声明）；`initLanLobbyImpl` 的 `this: WarehouseSceneThis` 约束不变。
2. **单元测试**：`npm run test` -> 期望通过当前基线（无 lan 测试存在，不增不减除非新增 pure.ts 测试）。
   - 若新增 `tests/game/lan/lobby.test.ts` 测试 pure.ts 函数，期望新增用例全部通过。
3. **Lint**：`npm run lint` -> 期望 0 error（warning 数不增加）。
   - 重点核对：子模块无未用 import、`LanLobbyCtx` 的 `[key: string]: unknown` 索引签名避免 `any`。
4. **格式**：`npm run format` -> 期望通过（无分号、双引号、120 print width、无尾逗号）。
5. **LAN 功能手动冒烟**（**关键，必须执行**）：
   - `npm run server` 启动 LAN 服务器
   - `npm run dev` 启动客户端
   - 验证项：
     - [ ] 连接页面：手动输入地址连接成功
     - [ ] 创建房间：公开/私密房间创建，房间码显示
     - [ ] 加入房间：扫描发现房间，点击加入
     - [ ] 槽位渲染：host/client/ai/empty 4 种状态正确显示
     - [ ] 加 AI / 移除 AI / LLM 勾选
     - [ ] 角色选择：卡片渲染、选择后立绘更新、广播同步
     - [ ] 道具携带：选择器打开/确认/移除
     - [ ] 地图选择：仅房主可操作
     - [ ] 开始游戏：game:init 流程正常
     - [ ] 离开房间：确认弹窗 + 断开连接
   - 若有第二台设备：验证联机加入、角色同步、槽位同步

---

## 八、风险点

### 8.1 闭包状态传播（高风险）

**问题**：当前闭包中 `lanSelectedCharacterId` 等 `var` 变量的赋值是即时的，所有闭包函数读取同一变量。改为 ctx 属性后，赋值 `ctx.lanSelectedCharacterId = newValue` 同样即时传播（对象属性赋值），行为一致。但需确保**所有写入点都改为 `ctx.xxx =`**，不能遗漏。

**应对**：逐函数核对每个闭包变量的读写点（见 3.1 表），确保全部改为 ctx 属性访问。拆分后跑 `tsc --noEmit` 可捕获遗漏的变量引用（未声明变量报错）。

### 8.2 数组引用共享 vs 值拷贝（中风险）

**问题**：`lanSlotConfig` 和 `lanCarryItems` 是数组，当前闭包中所有函数操作同一引用。ctx 传递引用，行为一致。但 `lanSelectedMapId` 是 string（原始类型），`events.ts` 中 `let lanSelectedMapId = ctx.lanSelectedMapId` 创建了独立副本——**这是当前已有行为**，拆分后必须保持。

**应对**：bindLanEvents 上下文构建时，`lanSelectedMapId` 传值（与当前一致），`lanCarryItems`/`lanSlotConfig` 传引用。在 `lobby/types.ts` 的 `LanEventsCtx` 构建注释中标注此差异。

### 8.3 setup 函数初始化顺序（中风险）

**问题**：跨模块函数引用（如 `ctx.autoConnectAndJoin`）在协调器中按顺序赋值。如果 scan 模块的 `renderRoomList` 在 `ctx.autoConnectAndJoin` 赋值前被调用，会报 `undefined is not a function`。

**应对**：所有函数引用在 `initLanLobbyImpl` 执行期间**全部赋值完毕**后，才开始绑定 DOM 事件（用户交互在 init 完成后才触发）。协调器确保：先赋值所有函数引用 -> 再调 `bindLobbyEvents` -> 再调 `bindLanEvents`。无时序风险。但代码结构上应保持此顺序，添加注释提醒。

### 8.4 LAN 协议边界（中风险）

**问题**：`bridge.send({ type: "..." })` 和 `bridge.on("...")` 消息类型散布在 lobby.ts 和 events.ts 中。拆分时不能改变任何消息类型或载荷结构。

**应对**：拆分时**逐字搬移**所有 `bridge.send` / `bridge.on` 调用。不新增、不删除、不修改协议消息。拆分后用 `grep` 核对所有 `bridge.send` / `bridge.on` 调用与拆分前一致。

### 8.5 嵌套 DOM 事件绑定（低风险）

**问题**：`copyRoomBtn` 绑定嵌套在 `if (leaveBtn)` 块内（L1234-L1254）。这可能是原始代码的结构性 bug（copyRoomBtn 不应依赖 leaveBtn 存在），但**本次拆分不改此行为**。

**应对**：`bind-events.ts` 中保持 `copyRoomBtn` 绑定在 `leaveBtn` 块内。如需修复，作为独立后续任务。

### 8.6 模块解析：lobby.ts 与 lobby/ 共存（低风险）

`lobby.ts`（文件）与 `lobby/`（目录）共存。TS/Node 模块解析中 `"./lobby"` 优先匹配 `lobby.ts` 文件。此模式与 `ai/intel.ts` + `intel/`、`ui/overlay.ts` + `overlay/` 完全一致，已验证可行。

### 8.7 原生桥接全局变量（低风险）

`LanBridge.isNative()`、`LanBridge.startNativeServer()`、`LanBridge.getLocalServerUrl()` 等是全局 API（`LanBridge` 在 `eslint.config.js` 注册为全局）。拆分后 `connect.ts` / `scan.ts` 中直接引用全局 `LanBridge`，与当前行为一致。

---

## 九、分阶段执行建议

### 总体风险评估

**风险等级：中高**。lobby.ts 是单一长函数（非 Mixin 对象），闭包共享状态多（18 个变量），跨模块函数互调复杂。但无测试基线需维护（无现有 lan 测试），且代码逻辑可逐块验证。建议分 4 阶段执行，每阶段独立可验证。

### 第一阶段：提取纯函数（最安全，建议立即执行）

**范围**：创建 `lobby/pure.ts`，搬移 5 个纯函数（processRoomData, dedupFound, getCharAvatarHtml, detectLocalIP, scanSubnet）。lobby.ts 内对应函数定义替换为 import 调用。

**改动量**：新增 1 文件（~120 行），修改 lobby.ts ~80 行（删除函数定义 + 添加 import）。
**风险**：极低。纯函数无副作用，不依赖闭包状态或 DOM。
**验证**：`tsc --noEmit` + 新增 `tests/game/lan/lobby.test.ts` 测试 processRoomData/dedupFound/getCharAvatarHtml。
**收益**：立即获得可测试的纯函数，减少 lobby.ts ~80 行。

### 第二阶段：提取 DOM 辅助 + 槽位管理（低风险）

**范围**：
- 创建 `lobby/types.ts`（接口定义）
- 创建 `lobby/dom-helpers.ts`（openOverlay/closeOverlay/showPanel/showLanAlert/hideLanAlert/getPlayerName/updateModeMapCardState）
- 创建 `lobby/slots.ts`（renderSlots/renderLanPlayerSlot/bindSlotActions/syncSlotsFromPlayers/broadcastSlotState + initSlotConfig）
- 引入 `LanLobbyCtx` 对象，lobby.ts 开始构建 ctx

**改动量**：新增 3 文件（~290 行），修改 lobby.ts ~250 行。
**风险**：低。DOM 辅助函数用工厂模式封装，槽位管理函数改为接收 ctx。跨模块依赖少（slots 内部互调通过 ctx 同模块函数）。
**验证**：`tsc --noEmit` + 手动冒烟槽位渲染（加AI/移除AI/LLM勾选/踢出）。

### 第三阶段：提取角色/道具/地图模块（中风险）

**范围**：
- 创建 `lobby/character.ts`（renderLanCharacterList/updateLanPortrait/initLanCharacterFromStorage）
- 创建 `lobby/carry-items.ts`（renderLanCarryItems/openLanCarryItemPicker/closeLanCarryItemPicker）
- 创建 `lobby/map-select.ts`（renderLanMapList）

**改动量**：新增 3 文件（~250 行），修改 lobby.ts ~250 行。
**风险**：中。character 模块跨调 slots.renderSlots（通过 ctx），carry-items 模块有 MobaoShopBridge 依赖。
**验证**：`tsc --noEmit` + 手动冒烟角色选择/道具携带/地图选择。

### 第四阶段：提取连接/扫描/事件绑定（较高风险）

**范围**：
- 创建 `lobby/connect.ts`（connectWithRetry/autoConnectAndCreate/autoConnectAndJoin）
- 创建 `lobby/scan.ts`（scanRooms/scanRoomsNativeFull/fallbackScan/renderRoomList）
- 创建 `lobby/bind-events.ts`（~12 个按钮事件绑定）
- lobby.ts 改为薄入口协调器（~150 行）

**改动量**：新增 3 文件（~460 行），修改 lobby.ts ~600 行（删除搬出的代码 + 重写为协调器）。
**风险**：较高。connect/scan 涉及网络逻辑和原生桥接，跨模块互调多（renderRoomList -> autoConnectAndJoin）。bind-events 是所有按钮绑定的集中点。
**验证**：`tsc --noEmit` + **完整 LAN 联机冒烟测试**（见第七节第 5 项）。

### 分阶段执行总结

| 阶段 | 新增文件 | lobby.ts 净减 | 风险 | 可独立验证 |
|------|----------|--------------|------|-----------|
| 1 | pure.ts | ~80 行 | 极低 | tsc + 新测试 |
| 2 | types.ts + dom-helpers.ts + slots.ts | ~250 行 | 低 | tsc + 槽位冒烟 |
| 3 | character.ts + carry-items.ts + map-select.ts | ~250 行 | 中 | tsc + 角色/道具/地图冒烟 |
| 4 | connect.ts + scan.ts + bind-events.ts | ~600 行 | 较高 | tsc + 完整联机冒烟 |
| **合计** | **10 文件** | **~1180 行** | - | lobby.ts 最终 ~150 行 |

---

## 十、与 overlay-split 的对比

| 维度 | overlay.ts | lobby.ts |
|------|-----------|----------|
| 形态 | 对象字面量（40 方法） | 单一长函数（1236 行） |
| 拆分模式 | 方向 A：方法归类到子 Mixin | 方向 B：子函数提取 + 协调器 |
| 共享状态 | `this` 属性（已解耦） | 闭包变量（18 个，需提升为 ctx） |
| 跨模块调用 | `this.X()`（合并后自动可见） | ctx 函数引用（需显式赋值） |
| 子模块接线 | `Object.assign` 合并 | 协调器逐个 setup + ctx 赋值 |
| 纯函数 | 2 个（已独立） | 5 个（需提取） |
| 测试基线 | 16 个纯函数用例 | 无（新增） |
| 风险 | 低（方法独立、this 解耦） | 中高（闭包耦合、网络逻辑） |
| 验证 | tsc + test + 手动 UI | tsc + test + **LAN 联机冒烟** |

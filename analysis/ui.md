# scripts/game/ui/ 文件夹分析

## 文件清单

| 文件 | 行数 | 主要职责 |
|------|------|----------|
| index.ts | 3 | barrel 导出 OverlayMixin、PanelsMixin、HistoryMixin |
| overlay.ts | 941 | 覆盖层/弹窗/对话框管理（40+ 方法） |
| panels.ts | 117 | 左右信息面板（私有情报 + 公共信息） |
| history.ts | 202 | 出价历史、道具使用记录、道具抽屉 UI |

## 逐文件职责问题

### overlay.ts (941行) — 严重
- **God Object 倾向**：941行、40+ 方法，承担远超"覆盖层管理"的职责
- **包含的不相关功能组**：
  - 设置面板保存逻辑（`saveSettingsFromOverlay` 混合了设置保存、LLM配置、游戏状态截断）
  - 收藏图鉴面板（~130行数据过滤 + HTML拼装）
  - AI 模型配置面板（~130行 localStorage读写 + HTML拼装）
  - LAN 重开投票/暂停弹窗
  - 商店覆盖层转发
- **UI层越界操作游戏逻辑**：
  - `saveSettingsFromOverlay` 直接修改 `this.round`、`this.roundTimeLeft`、`this.actionsLeft`
  - LAN 弹窗直接调用 `this.lanBridge.send()`
  - LAN 暂停直接调用 `this.toggleRoundPause()`

### panels.ts (117行)
- **数据与渲染混在一起**：数据存储和 DOM 渲染在同一 mixin 中
- **UI层越界**：`addPublicInfoEntry` 中直接调用 `this.lanBridge.send()` 进行LAN广播
- **空壳方法**：`updateSidePanels` 6个参数全部未使用

### history.ts (202行)
- **数据逻辑和UI渲染混合**：`recordRoundHistory` 既维护数据结构又调用 `refreshPlayerHistoryUI`
- **道具抽屉归属不明确**：抽屉是交互面板，逻辑上接近 overlay，但放在 history 中
- **读localStorage**：`renderItemDrawer` 读取 localStorage 判断道具携带状态

## 三个文件的边界问题

| 维度 | overlay.ts | panels.ts | history.ts |
|------|-----------|-----------|------------|
| 抽象层级 | 弹窗/覆盖层 | 侧边信息面板 | 历史数据+道具抽屉 |
| 数据存储 | 无（临时DOM） | privateIntelEntries/publicInfoEntries | playerRoundHistory/playerUsageHistory |
| 代码量 | 941行 | 117行 | 202行 |

**边界模糊**：history.ts 中的道具抽屉更接近 overlay；overlay.ts 中的收藏面板和 panels.ts 功能相似但分散在不同文件。

## DOM操作方式不统一

- overlay.ts LAN弹窗：`document.createElement` + 内联 style
- panels.ts 和 history.ts：`innerHTML` 拼装
- 部分方法引用 `this.dom.*`，部分用 `document.getElementById`
- 多处使用 `!` 非空断言，无防御性编码

## 整体评价

**优点**：panels.ts 和 history.ts 职责相对聚焦、版本缓存机制避免重复渲染。

**核心问题**：overlay.ts 承载过多职责（941行）、无独立数据层、UI层直接操作游戏逻辑和网络通信。

## 改进建议

1. 拆分 overlay.ts：设置面板、收藏面板、AI模型配置面板、LAN弹窗分别独立为文件
2. 提取数据层：privateIntelEntries 等数据抽取到独立的数据 store 模块
3. 消除UI层逻辑越界：通过回调或事件机制委托给游戏逻辑层
4. 统一DOM操作方式：全面采用 this.dom.* 缓存引用 + innerHTML 模板
5. 道具抽屉独立：从 history.ts 提取为 `item-drawer.ts`

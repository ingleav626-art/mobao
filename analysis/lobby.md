# scripts/game/lobby/ 文件夹分析

## 文件清单

| 文件 | 行数 | 主要职责 |
|------|------|----------|
| index.ts | 909 | 大厅核心入口——页面导航、游戏启动、场景切换、收藏图鉴 |
| carousel.ts | 225 | 地图选择轮播组件 |
| character-select.ts | 1360 | 角色选择页——角色列表、Live2D、携带道具系统 |

## 逐文件职责问题

### index.ts (909行) — 过大
- **收藏图鉴逻辑混入**：`initCollectionPanel` / `renderCollectionGrid` / `getCollectionCategories`（~180行）应独立为 mixin 或单独文件
- **道具同步逻辑混入**：`syncItemManagerFromShop` 不属于大厅 UI
- **玩家面板 UI 混入**：`updatePlayerAvatar` / `updatePlayerCharNames` / `initPlayersUI` 与大厅导航混合

### carousel.ts (225行)
- **设计良好**：职责清晰，仅依赖 `data/map-profiles`

### character-select.ts (1360行) — 过于庞大
- **Live2D 播放器不应在此**：`_startLive2dLoop` ~500行是独立的视频播放引擎
- **携带道具系统不应在此**：`_carryItems` 相关方法是游戏准备阶段的道具管理逻辑
- **绕过 bridge 层**：`executeReplenish` 直接操作 localStorage 修改金钱和库存

## 整体评价

**核心问题**：
| 问题 | 严重度 |
|------|--------|
| character-select.ts 过大（1360行） | **中** |
| lobby/index.ts 收藏图鉴逻辑混入 | **中** |

## 改进建议

1. 提取 Live2D 播放器 → `lobby/live2d-player.ts`
2. 提取携带道具逻辑 → `lobby/carry-items.ts`
3. 提取收藏图鉴逻辑 → `lobby/collection.ts`

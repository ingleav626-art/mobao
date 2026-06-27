# scripts/game/bridge/ 文件夹分析

## 文件清单

| 文件 | 行数 | 主要职责 |
|------|------|----------|
| settlement.ts | 773 | 结算页面管理——揭示动画、搜索特效、庆祝粒子、利润计算 |
| battle-record.ts | 908 | 战绩持久化、战绩面板渲染、AI日志查看、对局复现 |
| shop.ts | 406 | 商店数据层——库存管理、购买/消耗、每日限购、限时特惠 |

## 逐文件职责问题

### settlement.ts (773行)
- 职责清晰，通过工厂函数注入依赖，设计合理
- 体量大：粒子效果代码 ~200行

### battle-record.ts (908行) — 严重过载
- `parsePanelTextToHtml`（~100行）：文本→HTML 解析器
- `renderBattleRecordLogView`（~150行）：完整分页日志 UI
- `restoreWarehouseFromBattleRecord`（~100行）：从快照恢复仓库状态（涉及 Phaser 渲染）
- 这些应拆分为独立模块

### shop.ts (406行)
- 职责清晰，纯数据层，通过 localStorage 持久化

## 整体评价

三个文件职责划分合理，但 `battle-record.ts` 过大，混合了持久化、UI渲染、Phaser仓库重建。

## 改进建议

1. 拆分 `battle-record.ts`：text-parser / log-view / warehouse-restore 分离
2. 粒子效果可抽取为独立的 particle-utils

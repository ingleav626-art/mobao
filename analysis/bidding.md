# scripts/game/bidding/ 文件夹分析

## 文件清单

| 文件 | 行数 | 主要职责 |
|------|------|----------|
| index.ts | 459 | 出价流程控制——数字键盘、回合结算、AI决策调度、出价揭示动画 |

## 职责问题

- **混合UI交互和核心流程**：`openBidKeypad`、`handleBidKeyInput`（UI）与 `resolveRoundBids`、`buildRoundBids`（核心流程）混在一起
- **通用对话框错位**：`showGameConfirm` / `hideGameConfirm` 是通用对话框，不属于出价逻辑
- **结算UI错位**：`showSettleOverlay` 是结算UI，应归属结算模块

## 整体评价

代码量可控（459行），但职责边界需要与 bidding/index.ts 和 bridge/settlement.ts 重新划分。

## 改进建议

1. 将通用对话框（showGameConfirm/hideGameConfirm）提取到通用UI模块
2. 将 showSettleOverlay 移到 bridge/settlement.ts
3. 将数字键盘交互与回合结算逻辑分离

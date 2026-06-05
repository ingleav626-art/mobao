# 代码组织规则

> 本文件定义文件创建、拆分、接口复用的规则。

---

## 一、文件职责


1. **职责不同的逻辑必须分文件**：
   - UI 渲染 vs 业务逻辑
   - 数据定义 vs 数据操作
   - 单机模式 vs 联机模式
   - 通用工具 vs 特定功能
2. **新文件命名必须体现职责**：`bidding.js`（出价逻辑）、`wallet.js`（钱包逻辑）

## 二、接口复用优先

1. **实现新功能前，先搜索项目中是否已有类似功能**：用 SearchCodebase / Grep 工具搜索
2. **已有接口必须优先使用**，不要重新实现：
   - 角色选择 → `CharacterSelectMixin`（scripts/game/lobby/character-select.js）
   - 地图选择 → `MapSelectMixin`（scripts/game/lobby/map-select.js）
   - 道具选择 → `CarryItemsMixin`（scripts/game/lobby/carry-items.js）
   - 商店 → `ShopMixin`（scripts/game/shop/index.js）
   - 出价 → `BiddingMixin`（scripts/game/bidding/index.js）
   - 仓库 → `WarehouseScene`（scripts/game/warehouse/index.js）
   - 结算 → `SettlementMixin`（scripts/game/bridge/settlement.js）
   - 音频 → `AudioManager` / `AudioUI`（scripts/audio/）
   - 移动端 → `MobileHandler`（scripts/mobile/mobile-handler.js）
   - LLM → `LlmManager`（scripts/llm/llm-manager.js）
   - 联机通信 → `LanBridge`（lan/client/lan-bridge.js）
3. **只有当现有接口无法满足需求时，才创建新接口**
4. **创建新接口时，必须在文件头注释中说明为什么不复用旧接口**

## 三、联机 vs 单机

1. **联机模式复用单机逻辑时，注意 DOM 依赖差异**：单机代码可能依赖特定的 DOM 结构
2. **联机模式不能直接调用单机的场景方法**：需要通过 LanBridge 中继
3. **数据同步由房主驱动**：客机只接收和渲染，不做计算

## 四、设计模式一致性

1. **本项目使用的设计模式**：
   - IIFE（立即执行函数）→ 用于独立模块
   - Mixin（混入）→ 用于场景功能组合
   - 对象字面量单例 → 用于全局管理器（AudioManager、AudioUI、MobileHandler）
   - 构造函数 + prototype → 用于可实例化的类（LanBridge）
2. **新代码必须遵循已有模式**：不要在 Mixin 项目里引入 Class，不要在单例项目里用工厂模式

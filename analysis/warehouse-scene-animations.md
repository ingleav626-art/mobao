# scripts/game/warehouse/, scene/, animations.ts 分析

## 文件清单

| 文件 | 行数 | 主要职责 |
|------|------|----------|
| warehouse/index.ts | 1500+ | 仓库网格绘制、藏品生成/放置、揭示机制、候选预览（三个 Mixin） |
| scene/warehouse-scene.ts | 555 | WarehouseScene 类定义——属性声明、构造函数、Mixin 类型声明 |
| main.ts | 2748 | 游戏入口与主场景——Phaser 配置、WarehouseScene 完整实现、Mixin 组装 |
| animations.ts | 508 | 通用 UI 动效工具库 |

## 逐文件职责问题

### warehouse/index.ts (1500+行)
- **三个 Mixin 总量巨大**
- **揭示特效重复**：`WarehouseRevealMixin` 的揭示特效与 `bridge/settlement.ts` 的揭示特效结构相似但实现不同
- **候选预览 UI 混在仓库逻辑中**

### scene/warehouse-scene.ts (555行)
- **与 main.ts 严重职责重叠**：两者都定义 `WarehouseScene` 类
- `warehouse-scene.ts` 是精简版（属性+类型+构造），`main.ts` 是完整版
- 实际运行的是 `main.ts` 的 `WarehouseScene`
- 看起来是早期版本或类型声明文件，**实际未被使用**

### main.ts (2748行)
- **游戏的最终组装点**：Phaser 配置 + WarehouseScene 完整实现 + 16个 Mixin 的 Object.assign
- 包含所有核心业务逻辑（60+ 实例属性、核心方法）
- 是整个项目最大的单文件

### animations.ts (508行)
- **设计良好**：职责清晰，无依赖，纯工具层

## 整体评价

**核心问题**：
| 问题 | 严重度 |
|------|--------|
| scene/warehouse-scene.ts 与 main.ts 职责重叠（scene 版本未使用） | **高** |
| main.ts 过大（2748行） | **中** |
| warehouse/index.ts 过大（1500+行） | **中** |
| 揭示特效在 warehouse 和 bridge 中重复 | **低** |

## 改进建议

1. 删除或归档 `scene/warehouse-scene.ts`
2. 统一揭示特效：warehouse/index.ts 和 bridge/settlement.ts 共享底层动画函数
3. warehouse/index.ts 拆分为 grid-render / artifact-place / reveal / preview 四个独立 Mixin
4. main.ts 随着各 Mixin 拆分而逐步减小

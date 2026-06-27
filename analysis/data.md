# scripts/game/data/ 文件夹分析

## 文件清单

| 文件 | 行数 | 主要职责 |
|------|------|----------|
| artifacts.ts | 1148 | 藏品图鉴库定义 + ArtifactManager 类 |
| characters.ts | 82 | 角色静态数据定义 + 查询/选择持久化 |
| character-system.ts | 140 | 角色运行时状态管理（被动技能、利润加成） |
| items.ts | 209 | 道具定义 + ItemManager 类 |
| skills.ts | 129 | 技能定义 + SkillManager 类 |
| public-events.ts | 328 | 公共事件生成系统 |
| map-profiles.ts | 143 | 地图配置定义 + 读写当前选中地图 |

## 逐文件职责问题

### artifacts.ts (1148行) — 过大
- **数据定义与业务逻辑混杂**：`QUALITY_CONFIG`、`ARTIFACT_LIBRARY`、`CATEGORY_WEIGHTS`（数据）与 `ArtifactManager`、`summarizeCandidatePrices`、`estimatePriceByQuality`（逻辑）混在一起
- **通用工具函数错位**：`canPlaceRect`、`weightedPick` 应归入 `core/utils`
- **统计分析逻辑不属于数据定义**：`summarizeCandidatePrices` 是分析逻辑

### characters.ts (82行)
- **与 character-system.ts 职责重叠**：`getSelectedCharacter()` / `saveSelectedCharacter()` 直接读写 localStorage，与 `character-system.ts` 的 `getActiveCharacter()` / `selectCharacter()` 功能重叠
- **存在两套角色选择持久化路径**
- `saveSelectedCharacter` 已被 `character-system.ts` 的 `selectCharacter` 覆盖，基本是死代码

### character-system.ts (140行)
- 与 `characters.ts` 双写同一个 localStorage key (`mobao_selected_character_v1`)
- 重新从 localStorage 加载角色时不信任 `characters.ts` 的缓存

### items.ts (209行)
- 结构清晰
- `execute()` 方法依赖运行时 context，数据定义与运行时行为耦合

### skills.ts (129行)
- 与 `items.ts` 几乎完全同构（`use()` 签名、`resetForNewRun`、状态返回结构）
- 可考虑合并抽象
- 同样 `execute()` 耦合运行时 context

### public-events.ts (328行)
- `QUALITY_LABELS` 与 `artifacts.ts` 的 `QUALITY_CONFIG.label` 重复
- `CATEGORY_NAMES` 仅覆盖古董6类，与 `ARTIFACT_LIBRARY` 的10个品类不一致
- `analyzeWarehouse` 与 `artifacts.ts` 的统计函数存在概念交叉

### map-profiles.ts (143行)
- 职责清晰，无明显问题

## 整体评价

**核心问题**：
| 问题 | 严重度 |
|------|--------|
| characters.ts 与 character-system.ts 双写 localStorage | **高** |
| artifacts.ts 过大（1148行）数据与逻辑混杂 | **中** |
| items.ts / skills.ts 同构未抽象 | **低** |
| public-events.ts 品类常量不完整 | **低** |

## 改进建议

1. 合并 `characters.ts` 与 `character-system.ts`，统一为一个模块
2. 拆分 `artifacts.ts`：ArtifactManager 移入 `core/artifact-manager.ts`，统计函数移入 `core/stats.ts`
3. 统一 `items.ts` 和 `skills.ts` 的抽象结构
4. 修复 `public-events.ts` 的品类常量覆盖范围

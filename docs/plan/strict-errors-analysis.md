# Strict 模式错误分析

> 生成时间：2026-06-15
> 最后更新：2026-06-17
> 初始错误总数：约 2000+ 个
> 当前错误总数：**0 个** ✅

---

## 一、错误类型分布（初始 → 最终）

| 错误代码 | 错误描述 | 初始数量 | 修复方式 |
|---------|---------|------|------|
| TS2339 | Property does not exist | 1015 → 0 | 补充 WarehouseSceneThis 接口定义 |
| TS2352 | Type assignment error | 315 → 0 | 修正类型断言 |
| TS7006 | Parameter implicitly has 'any' type | 311 → 0 | 补充参数类型注解 |
| TS2571 | Object is of type 'unknown' | 171 → 0 | 添加类型守卫 |
| TS2531 | Object is possibly 'null' | 136 → 0 | 提取局部变量 + 非空断言 |
| TS7005 | Variable implicitly has 'any' type | 45 → 0 | 补充变量类型 |
| TS2551 | Property does not exist on type | 40 → 0 | 修正属性名 |
| TS7031 | Binding element implicitly has 'any' type | 29 → 0 | 补充解构类型 |
| TS18047 | Variable is possibly 'null' | 28 → 0 | 添加 null 检查 |
| TS2683 | Module has no exported member | 28 → 0 | 修正 import |
| TS7053 | Element implicitly has 'any' type | 24 → 0 | 补充索引签名类型 |
| TS2345 | Argument type mismatch | 23 → 0 | 修正参数类型 |
| TS7034 | Variable implicitly has type | 21 → 0 | 补充类型注解 |
| TS2322 | Type is not assignable | 7 → 0 | 修正赋值类型 |
| TS18046 | Expression is of type 'unknown' | 4 → 0 | 添加类型断言 |
| 其他 | - | ~50 → 0 | 逐一修复 |

---

## 二、关键修复策略

### 2.1 Mixin this 类型问题（TS2339，1015个）

**问题**：Mixin 模式下，`this` 无法识别其他 mixin 的属性/方法。

**解决方案**：
1. 定义 `WarehouseSceneThis` 接口（`types/warehouse-scene-this.d.ts`），包含所有 mixin 的属性和方法
2. 在 mixin 方法内使用 `this as WarehouseSceneLike` 类型断言
3. 使用 `ThisType<WarehouseSceneThis>` 声明 mixin 对象的 this 类型

### 2.2 DOM null 检查问题（TS2531，136个）

**问题**：`document.getElementById` 返回 `HTMLElement | null`。

**解决方案**：
1. 将 `dom` 属性从 `Record<string, HTMLElement | null>` 重构为精确接口
2. 在方法内提取局部变量，添加 null 检查后使用
3. 必要时使用非空断言 `!`

### 2.3 隐式 any 问题（TS7006/TS7005，356个）

**问题**：回调函数参数缺少类型注解。

**解决方案**：
1. 为回调参数补充类型注解（如 `(event: Event) => void`）
2. 使用 Phaser/DOM 内置类型而非手写

---

## 三、修复成果

**`npx tsc --noEmit` 输出 0 个错误，strict 模式完全通过。**
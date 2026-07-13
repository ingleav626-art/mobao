# mobile/mobile-handler.ts 拆分方案

> 创建时间：2026-07-13
> 状态：📋 计划中（仅调查 + 计划，未执行代码改动）
> 目标：将 `scripts/mobile/mobile-handler.ts`（812 行，单例对象字面量，18 方法 + 11 状态属性 + 3 模块级函数）按职责拆分为"薄入口 + 子目录 + re-export 纯函数"结构，参照已落地的 `ai/intel.ts` + `ai/intel/`（39 行薄入口 + 6 子模块）、`ui/overlay.ts` + `ui/overlay/`（32 行薄入口 + 9 子模块）。

---

## 一、现状分析

### 1.1 形态判定

`MobileHandler` 是**单例对象字面量**（非类、非 Mixin）：

- `export const MobileHandler: { ...类型注解... } = { ...方法... }`（L12-L646）
- 方法用 `function ()` 语法定义，内部通过 `this.` 访问共享状态、通过 `var self = this` 在回调中保持绑定
- 文件尾部有 3 个**模块级函数**（非单例成员）：`addStyles()`（L648-L791，CSS 注入）、`initMobileHandler()`（L793-L805，编排初始化 + 注册全局 click）、自动初始化（L807-L811，DOMContentLoaded 或立即执行）
- 导入即执行副作用：`import { MobileHandler }` 会触发 `initMobileHandler()` -> `addStyles()` + `MobileHandler.init()`

与 Mixin 模式的差异：不混入 Phaser Scene 原型，不使用 `ThisType<WarehouseSceneThis>`，独立管理自身状态。但 `Object.assign` 合并子对象的模式完全适用。

### 1.2 文件结构

| 部分 | 行号 | 内容 |
|------|------|------|
| 文件头注释 | L1-L10 | @file/@module/@description/@exports |
| 类型注解 | L12-L42 | MobileHandler 的完整类型声明（11 属性 + 18 方法签名）|
| 状态属性 | L43-L53 | isMobile/isTouch/portraitOverlay/fixedInputOverlay 等 11 个 |
| `init` | L55-L79 | 编排：检测平台 -> 创建覆盖层 -> 调用 5 个 setup 方法 |
| 输入框定位方法 | L81-L132, L214-L338 | createFixedInputOverlay/updateInputPosition/showFixedInput/checkAndUpdatePosition/resetInputPosition/hideFixedInput |
| 键盘适配方法 | L134-L212, L368-L404 | setupNativeKeyboardListener/handleKeyboardHeightChange/calculateSafeKeyboardHeight/startPolling/stopPolling/setupKeyboardHandler |
| 横竖屏切换 | L340-L366 | setupOrientationCheck |
| 振动反馈 | L406-L423 | setupVibrationFeedback |
| 自定义 select | L425-L645 | setupCustomSelects/convertToCustomSelect/closeAllCustomSelects |
| 模块级 `addStyles` | L648-L791 | 注入 CSS 样式表（143 行，大部分是 CSS 字符串）|
| 模块级 `initMobileHandler` | L793-L805 | addStyles + init + 全局 click 监听 |
| 自动初始化 | L807-L811 | DOMContentLoaded 或立即执行 |

### 1.3 对外接口（拆分后必须保持不变）

| 消费方 | 导入路径 | 使用的成员 |
|--------|----------|----------|
| `scripts/game/lobby/collection.ts` L27 | `from "../../mobile/mobile-handler"` | `MobileHandler`（解构 import）|
| `scripts/game/lobby/collection.ts` L105-106 | - | `MobileHandler.isMobile`、`MobileHandler.isTouch`、`MobileHandler.convertToCustomSelect(originalSelect)` |
| `eslint.config.js` L39 | - | `MobileHandler: "readonly"`（全局变量声明，遗留）|
| `types/globals.d.ts` L62 | - | `declare var MobileHandler: Record<string, any>`（遗留全局类型）|

**消费方仅 1 个文件（collection.ts），使用 3 个成员。** 全局声明（eslint/globals.d.ts）是历史遗留，实际通过 ES Module import 消费（无 `window.MobileHandler =` 赋值）。拆分后 `MobileHandler` 仍由 `mobile-handler.ts` 同名导出，导入路径不变，消费方零改动。

### 1.4 测试现状

**无测试文件。** `tests/` 下不存在 `mobile/` 目录或 `mobile-handler.test.ts`。拆分无测试回归风险，但拆分后建议为提取的纯函数补测试。

---

## 二、完整方法/逻辑块清单与归类

### 2.1 状态属性（11 个）

| # | 属性 | 行号 | 职责分类 | 主要使用方 |
|---|------|------|----------|-----------|
| 1 | `isMobile` | L43 | 其他/平台检测 | init/keyboard/orientation/custom-select/vibration |
| 2 | `isTouch` | L44 | 其他/平台检测 | init/keyboard/orientation/custom-select/vibration |
| 3 | `portraitOverlay` | L45 | 横竖屏切换 | orientation |
| 4 | `fixedInputOverlay` | L46 | 输入框定位 | input/keyboard |
| 5 | `fixedInputElement` | L47 | 输入框定位 | input |
| 6 | `fixedInputContainer` | L48 | 输入框定位 | input/keyboard |
| 7 | `originalInput` | L49 | 输入框定位 | input |
| 8 | `isHidingFixedInput` | L50 | 输入框定位 | input/keyboard |
| 9 | `currentKeyboardHeight` | L51 | 键盘适配 | keyboard/input |
| 10 | `screenHeight` | L52 | 键盘适配/输入框定位 | keyboard/input |
| 11 | `pollIntervalId` | L53 | 键盘适配 | keyboard |

### 2.2 单例方法（18 个）

| # | 方法 | 行号 | 职责分类 | 目标子模块 |
|---|------|------|----------|-----------|
| 1 | `init` | L55-L79 | 其他/编排 | `core.ts` |
| 2 | `createFixedInputOverlay` | L81-L132 | 输入框定位 | `input.ts` |
| 3 | `setupNativeKeyboardListener` | L134-L146 | 键盘适配 | `keyboard.ts` |
| 4 | `handleKeyboardHeightChange` | L148-L167 | 键盘适配 | `keyboard.ts` |
| 5 | `calculateSafeKeyboardHeight` | L169-L187 | 键盘适配 | `keyboard.ts`（委托 `pure.ts`）|
| 6 | `startPolling` | L189-L205 | 键盘适配 | `keyboard.ts` |
| 7 | `stopPolling` | L207-L212 | 键盘适配 | `keyboard.ts` |
| 8 | `updateInputPosition` | L214-L245 | 输入框定位 | `input.ts` |
| 9 | `showFixedInput` | L247-L289 | 输入框定位 | `input.ts` |
| 10 | `checkAndUpdatePosition` | L291-L302 | 输入框定位/键盘适配 | `input.ts` |
| 11 | `resetInputPosition` | L304-L310 | 输入框定位 | `input.ts` |
| 12 | `hideFixedInput` | L312-L338 | 输入框定位 | `input.ts` |
| 13 | `setupOrientationCheck` | L340-L366 | 横竖屏切换 | `orientation.ts` |
| 14 | `setupKeyboardHandler` | L368-L404 | 键盘适配 | `keyboard.ts` |
| 15 | `setupVibrationFeedback` | L406-L423 | 振动 | `vibration.ts` |
| 16 | `setupCustomSelects` | L425-L456 | 自定义 select | `custom-select.ts` |
| 17 | `convertToCustomSelect` | L458-L639 | 自定义 select | `custom-select.ts` |
| 18 | `closeAllCustomSelects` | L641-L645 | 自定义 select | `custom-select.ts` |

### 2.3 模块级函数（3 个，非单例成员）

| # | 函数 | 行号 | 职责分类 | 目标位置 |
|---|------|------|----------|---------|
| 1 | `addStyles` | L648-L791 | 其他/CSS 注入 | `styles.ts` |
| 2 | `initMobileHandler` | L793-L805 | 其他/编排 | `mobile-handler.ts`（薄入口）|
| 3 | 自动初始化 IIFE | L807-L811 | 其他/副作用 | `mobile-handler.ts`（薄入口）|

### 2.4 归类汇总

| 职责分类 | 方法数 | 属性数 | 行数（含空行）| 目标子模块 |
|----------|--------|--------|-------------|-----------|
| 键盘适配 | 6 | 3（currentKeyboardHeight/screenHeight/pollIntervalId）| ~112 | `keyboard.ts` |
| 输入框定位 | 6 | 5（fixedInputOverlay/fixedInputElement/fixedInputContainer/originalInput/isHidingFixedInput）| ~173 | `input.ts` |
| 横竖屏切换 | 1 | 1（portraitOverlay）| ~27 | `orientation.ts` |
| 自定义 select | 3 | 0 | ~219 | `custom-select.ts` |
| 振动 | 1 | 0 | ~18 | `vibration.ts` |
| 其他/编排 | 1 方法 + 3 模块函数 | 2（isMobile/isTouch）| ~187 | `core.ts` + `styles.ts` + 薄入口 |
| 类型注解 | - | - | ~31 | `types.ts` |
| **合计** | **18 方法 + 3 函数** | **11** | **812** | **8 子模块 + 薄入口** |

---

## 三、可提取纯函数（无 DOM/window 副作用）

以下函数可从方法体中提取为 `pure.ts` 中的独立导出函数，可独立测试：

| # | 纯函数签名 | 来源行号 | 原始方法 | 说明 |
|---|-----------|----------|----------|------|
| 1 | `detectMobile(userAgent: string): boolean` | L56 | `init` | `/Android\|webOS\|...\|Opera Mini/i.test(userAgent)` |
| 2 | `detectTouch(ontouchstart: unknown, maxTouchPoints: number): boolean` | L57 | `init` | `Boolean(ontouchstart) \|\| maxTouchPoints > 0` |
| 3 | `calcSafeKeyboardHeight(rawHeight: number, screenHeight: number, containerHeight: number): number` | L169-L187 | `calculateSafeKeyboardHeight` | 纯数学：键盘高度安全裁剪（<=0/<100 归零、超屏幕取 85%、超上限截断）|
| 4 | `isTextInputElement(tagName: string, type: string \| undefined): boolean` | L375-L385 | `setupKeyboardHandler` | 判断 INPUT/TEXTAREA 是否为文本输入类型（text/search/tel/url/email/password/number/无 type）|
| 5 | `isPortraitOrientation(innerHeight: number, innerWidth: number): boolean` | L347 | `setupOrientationCheck` | `innerHeight > innerWidth` |

提取后，原方法改为委托调用纯函数（传入 `this.screenHeight` 等状态），方法签名与行为不变。此模式与 `ai/intel.ts` re-export `pickRandomItemCell` 等纯函数一致。

---

## 四、拆分方案

### 4.1 推荐模式：薄入口 + 子模块目录 + re-export 纯函数

与 `ai/intel.ts` + `ai/intel/`、`ui/overlay.ts` + `ui/overlay/` 完全同构，适配点：

| 维度 | Mixin 模式（intel/overlay）| 本方案（MobileHandler）|
|------|--------------------------|----------------------|
| 合并方式 | `Object.assign({}, SubMixinA, SubMixinB, ...)` | 同 |
| `this` 类型 | `ThisType<WarehouseSceneThis>` | `ThisType<MobileHandlerType>`（本地接口）|
| 状态属性 | 在 Mixin 子对象中 | 在 `core.ts` 子对象中（init 方法设置）|
| 混入目标 | `WarehouseScene.prototype` | 不混入，`MobileHandler` 本身即合并结果 |
| 副作用 | 无（由 main.ts 显式调用）| 导入即自动初始化（保留在薄入口）|

### 4.2 目录结构

```
scripts/mobile/
  ├── mobile-handler.ts              # 薄入口（~55 行）：Object.assign 合并 6 子对象 + re-export 纯函数 + addStyles 调用 + 自动初始化
  ├── mobile-handler/                # 新建子目录
  │   ├── types.ts                   # MobileHandlerType 接口（~35 行）
  │   ├── pure.ts                    # 纯函数（~55 行）
  │   ├── keyboard.ts                # KeyboardPart（~115 行）
  │   ├── input.ts                   # InputPart（~180 行）
  │   ├── orientation.ts             # OrientationPart（~30 行）
  │   ├── custom-select.ts           # CustomSelectPart（~225 行）
  │   ├── vibration.ts               # VibrationPart（~20 行）
  │   ├── core.ts                    # CorePart：状态属性 + init（~45 行）
  │   └── styles.ts                  # addStyles CSS 注入（~150 行）
```

### 4.3 各子模块详情

#### `mobile-handler/types.ts`（~35 行）

MobileHandler 单例的完整类型接口，供所有子模块 `ThisType<MobileHandlerType>` 使用。

```ts
export interface MobileHandlerType {
  isMobile: boolean
  isTouch: boolean
  portraitOverlay: HTMLElement | null
  fixedInputOverlay: HTMLElement | null
  fixedInputElement: HTMLInputElement | null
  fixedInputContainer: HTMLElement | null
  originalInput: HTMLInputElement | HTMLTextAreaElement | null
  isHidingFixedInput: boolean
  currentKeyboardHeight: number
  screenHeight: number
  pollIntervalId: ReturnType<typeof setInterval> | null
  init: () => void
  createFixedInputOverlay: () => void
  // ... 全部 18 方法签名
}
```

> 与原文件 L12-L42 的内联类型注解一一对应，仅从内联提取为命名接口。

#### `mobile-handler/pure.ts`（~55 行）

5 个纯函数（见第三节），零外部依赖。

#### `mobile-handler/core.ts`（~45 行）- CorePart

状态属性初始值 + `init` 编排方法。

| 成员 | 来源行号 |
|------|----------|
| `isMobile: false` | L43 |
| `isTouch: false` | L44 |
| `portraitOverlay: null` | L45 |
| `fixedInputOverlay: null` | L46 |
| `fixedInputElement: null` | L47 |
| `fixedInputContainer: null` | L48 |
| `originalInput: null` | L49 |
| `isHidingFixedInput: false` | L50 |
| `currentKeyboardHeight: 0` | L51 |
| `screenHeight: 0` | L52 |
| `pollIntervalId: null` | L53 |
| `init` | L55-L79 |

`init` 改为委托纯函数：`this.isMobile = detectMobile(navigator.userAgent)`、`this.isTouch = detectTouch("ontouchstart" in window, navigator.maxTouchPoints)`。

跨子模块 `this.` 调用：`this.createFixedInputOverlay()`（input）、`this.setupOrientationCheck()`（orientation）、`this.setupKeyboardHandler()`（keyboard）、`this.setupVibrationFeedback()`（vibration）、`this.setupCustomSelects()`（custom-select）、`this.setupNativeKeyboardListener()`（keyboard）。全部经 `ThisType<MobileHandlerType>` 类型可见。

#### `mobile-handler/keyboard.ts`（~115 行）- KeyboardPart

键盘高度监听、轮询、安全高度计算、focusin 拦截。

| 方法 | 来源行号 |
|------|----------|
| `setupNativeKeyboardListener` | L134-L146 |
| `handleKeyboardHeightChange` | L148-L167 |
| `calculateSafeKeyboardHeight` | L169-L187（改为委托 `pure.calcSafeKeyboardHeight`）|
| `startPolling` | L189-L205 |
| `stopPolling` | L207-L212 |
| `setupKeyboardHandler` | L368-L404（`isTextInput` 判断改为委托 `pure.isTextInputElement`）|

跨子模块 `this.` 调用：`this.updateInputPosition()`（input）、`this.showFixedInput()`（input）、`this.handleKeyboardHeightChange()`（同模块）。

#### `mobile-handler/input.ts`（~180 行）- InputPart

固定输入浮层创建、显示、隐藏、定位。

| 方法 | 来源行号 |
|------|----------|
| `createFixedInputOverlay` | L81-L132 |
| `updateInputPosition` | L214-L245 |
| `showFixedInput` | L247-L289 |
| `checkAndUpdatePosition` | L291-L302 |
| `resetInputPosition` | L304-L310 |
| `hideFixedInput` | L312-L338 |

跨子模块 `this.` 调用：`this.handleKeyboardHeightChange()`（keyboard）、`this.startPolling()`（keyboard）、`this.stopPolling()`（keyboard）、`this.updateInputPosition()`（同模块）、`this.resetInputPosition()`（同模块）、`this.checkAndUpdatePosition()`（同模块）。

#### `mobile-handler/orientation.ts`（~30 行）- OrientationPart

| 方法 | 来源行号 |
|------|----------|
| `setupOrientationCheck` | L340-L366（`isPortrait` 判断改为委托 `pure.isPortraitOrientation`）|

跨子模块 `this.` 调用：仅访问 `this.isMobile`、`this.isTouch`、`this.portraitOverlay`、`this.screenHeight`（core 状态）。

#### `mobile-handler/custom-select.ts`（~225 行）- CustomSelectPart

| 方法 | 来源行号 |
|------|----------|
| `setupCustomSelects` | L425-L456 |
| `convertToCustomSelect` | L458-L639（本模块最大方法，182 行）|
| `closeAllCustomSelects` | L641-L645 |

跨子模块 `this.` 调用：仅 `this.isMobile`、`this.isTouch`（core 状态）。`convertToCustomSelect` 内部用闭包变量（touchStartY/touchStartX/touchStartTime/isScrolling），无跨方法 `this.` 调用。

#### `mobile-handler/vibration.ts`（~20 行）- VibrationPart

| 方法 | 来源行号 |
|------|----------|
| `setupVibrationFeedback` | L406-L423 |

跨子模块 `this.` 调用：仅 `this.isMobile`、`this.isTouch`（core 状态）。

#### `mobile-handler/styles.ts`（~150 行）

模块级函数 `addStyles()`（L648-L791），非单例成员。CSS 字符串原样搬移。

#### `mobile-handler.ts` 薄入口（~55 行）

```ts
/**
 * @file mobile/mobile-handler.ts
 * @module mobile/mobile-handler
 * @description 移动端适配处理器薄入口。通过 Object.assign 合并 6 个子对象
 *              （Core/Keyboard/Input/Orientation/CustomSelect/Vibration），
 *              并 re-export 纯函数。原 812 行单例已按职责拆分到 mobile-handler/ 目录。
 *
 * @exports MobileHandler - 移动端适配处理器单例
 * @exports 纯函数 - detectMobile, detectTouch, calcSafeKeyboardHeight, isTextInputElement, isPortraitOrientation
 */
import { CorePart } from "./mobile-handler/core"
import { KeyboardPart } from "./mobile-handler/keyboard"
import { InputPart } from "./mobile-handler/input"
import { OrientationPart } from "./mobile-handler/orientation"
import { CustomSelectPart } from "./mobile-handler/custom-select"
import { VibrationPart } from "./mobile-handler/vibration"
import { addStyles } from "./mobile-handler/styles"

export {
  detectMobile,
  detectTouch,
  calcSafeKeyboardHeight,
  isTextInputElement,
  isPortraitOrientation
} from "./mobile-handler/pure"

export const MobileHandler = Object.assign(
  {},
  CorePart,
  KeyboardPart,
  InputPart,
  OrientationPart,
  CustomSelectPart,
  VibrationPart
) as import("./mobile-handler/types").MobileHandlerType

function initMobileHandler() {
  addStyles()
  MobileHandler.init()

  document.addEventListener("click", function (e) {
    var target = e.target as HTMLElement
    var container = target.closest(".custom-select-container")
    var fixedOverlay = target.closest("#fixedInputOverlay")
    if (!container && !fixedOverlay) {
      MobileHandler.closeAllCustomSelects()
    }
  })
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initMobileHandler)
} else {
  initMobileHandler()
}
```

> 与 `ai/intel.ts`（L32-L39）同构。`Object.assign` 合并后，子模块间 `this.X()` 调用全部生效（运行时合并到同一对象，`this` 指向完整 MobileHandler）。
>
> `as MobileHandlerType` 断言保留原类型对外可见。`initMobileHandler` + 自动初始化保留在薄入口，导入即执行副作用的行为不变。

---

## 五、对外接口不变

### 5.1 导出不变

- `MobileHandler` 仍由 `mobile-handler.ts` 以 `export const MobileHandler` 导出。
- 导入路径 `"../../mobile/mobile-handler"`（collection.ts L27）不变。
- `MobileHandler.isMobile` / `MobileHandler.isTouch` / `MobileHandler.convertToCustomSelect()` 三个被消费的成员仍直接挂在合并后的对象上。
- 新增 re-export 5 个纯函数（`detectMobile` 等），不影响现有导入。

### 5.2 行为不变

- 导入即自动初始化（`initMobileHandler` -> `addStyles` + `MobileHandler.init` + 全局 click 监听）。
- `init()` 调用顺序不变：平台检测 -> portraitOverlay 获取 -> createFixedInputOverlay -> setupOrientationCheck -> setupKeyboardHandler -> setupVibrationFeedback -> setupCustomSelects -> setupNativeKeyboardListener。
- 所有 `console.log` 调试语句原样保留（L60-L69, L158-L165, L230-L237, L256, L316）。
- 所有 `var self = this` 回调绑定模式原样保留。
- CSS 样式表内容不变（`addStyles` 逐字搬移）。

### 5.3 全局声明（遗留，不动）

- `eslint.config.js` L39 `MobileHandler: "readonly"` 保留（不删除，避免误报）。
- `types/globals.d.ts` L62 `declare var MobileHandler` 保留（遗留，与 ES Module 导出并存，不冲突）。

---

## 六、行为保持原则

### 6.1 只搬移，不改逻辑

- **逐字搬移**每个方法体，包括 `var self = this`、`;(window as any).__onKeyboardChange` 前缀分号、`console.log` 调试语句、`function ()` 函数声明风格，均原样保留。
- **不改方法签名**（参数名、类型、返回值）。
- **不改状态属性初始值**（`isMobile: false` 等）。
- **不调整 Object.assign 合并顺序**：各子模块方法名无冲突（18 方法名唯一），属性仅在 CorePart 中声明一次，合并顺序不影响结果。
- **不重构 `var` 为 `const/let`**、**不改 `function ()` 为箭头函数**（会改变 `this` 绑定语义）。这些现代化改造应作为独立后续任务。

### 6.2 纯函数委托（唯一逻辑变更）

`calculateSafeKeyboardHeight`、`init`（平台检测部分）、`setupKeyboardHandler`（输入类型判断部分）、`setupOrientationCheck`（横竖屏判断部分）改为委托调用 `pure.ts` 中的纯函数。这是唯一允许的逻辑变更，行为等价：

```ts
// 改前（L169-L187）
calculateSafeKeyboardHeight: function (rawHeight: number) {
  var containerHeight = this.fixedInputContainer ? this.fixedInputContainer.offsetHeight || 80 : 80
  var minSpaceForInput = containerHeight + 30
  var maxKeyboardHeight = this.screenHeight - minSpaceForInput
  if (rawHeight <= 0 || rawHeight < 100) return 0
  if (rawHeight > this.screenHeight) return Math.floor(maxKeyboardHeight * 0.85)
  if (rawHeight > maxKeyboardHeight) return maxKeyboardHeight
  return rawHeight
}

// 改后
calculateSafeKeyboardHeight: function (rawHeight: number) {
  var containerHeight = this.fixedInputContainer ? this.fixedInputContainer.offsetHeight || 80 : 80
  return calcSafeKeyboardHeight(rawHeight, this.screenHeight, containerHeight)
}
```

> `pure.ts` 中的 `calcSafeKeyboardHeight` 内部包含 `minSpaceForInput` / `maxKeyboardHeight` 计算，逻辑等价。

---

## 七、import 分配表

原文件无 import（仅用全局 `document` / `window` / `navigator` / `console`）。子模块按需引入：

| import | 使用方 | 分配到 |
|--------|--------|--------|
| `MobileHandlerType`（type）| 全部子模块 | 各子模块 `import type { MobileHandlerType } from "./types"` |
| `detectMobile` | `init` | `core.ts` |
| `detectTouch` | `init` | `core.ts` |
| `calcSafeKeyboardHeight` | `calculateSafeKeyboardHeight` | `keyboard.ts` |
| `isTextInputElement` | `setupKeyboardHandler` | `keyboard.ts` |
| `isPortraitOrientation` | `setupOrientationCheck` | `orientation.ts` |
| `addStyles` | `initMobileHandler` | `mobile-handler.ts`（薄入口）|

> 子模块相对路径基准：`scripts/mobile/mobile-handler/<sub>.ts`
> - 类型：`./types`
> - 同目录纯函数：`./pure`
> - styles：`./styles`（仅薄入口引用）

---

## 八、验证步骤

拆分完成后依次执行：

1. **TypeScript 类型检查**：`npx tsc --noEmit` -> 期望 0 错误。
   - 重点核对：各子模块 `ThisType<MobileHandlerType>` 下 `this.X()` 调用均类型可见；薄入口 `Object.assign` 合并结果类型正确；`collection.ts` 的 `MobileHandler.convertToCustomSelect` 等调用类型不变。
2. **单元测试**：`npm run test` -> 期望全量通过（当前基线无 mobile-handler 测试，无回归风险）。
   - 拆分后建议新增 `tests/mobile/mobile-handler.test.ts` 覆盖 5 个纯函数（detectMobile/detectTouch/calcSafeKeyboardHeight/isTextInputElement/isPortraitOrientation）。
3. **Lint**：`npm run lint` -> 期望 0 error（warning 数不增加）。
4. **格式**：`npm run format` -> 期望通过（无分号、双引号、120 print width、无尾逗号、LF）。
5. **冒烟（手动）**：`npm run dev` 启动，逐一验证：
   - 移动端模拟（Chrome DevTools 设备模式）下输入框聚焦 -> 固定输入浮层弹出 -> 键盘高度变化时位置更新
   - 竖屏旋转 -> portraitOverlay 显示 -> 横屏恢复
   - 自定义 select 点击展开 -> 选项选中 -> 原生 select.value 同步 -> change 事件触发
   - 输入删除时振动反馈（仅触屏设备）
   - 收藏图鉴面板的 select 重建（collection.ts `_rebuildCustomSelect` 调用 `MobileHandler.convertToCustomSelect`）

---

## 九、风险点

### 9.1 子模块间 `this.` 相互调用（中风险）

keyboard 与 input 子模块存在双向 `this.` 调用：

| 调用方 | 被调方法 | 定义位置 |
|--------|----------|----------|
| `keyboard.setupKeyboardHandler` | `this.showFixedInput` | `input.ts` |
| `keyboard.handleKeyboardHeightChange` | `this.updateInputPosition` | `input.ts` |
| `keyboard.startPolling` | `this.handleKeyboardHeightChange` | 同模块（keyboard）|
| `input.showFixedInput` | `this.startPolling` / `this.checkAndUpdatePosition` | `keyboard.ts` / 同模块 |
| `input.checkAndUpdatePosition` | `this.handleKeyboardHeightChange` / `this.updateInputPosition` | `keyboard.ts` / 同模块 |
| `input.hideFixedInput` | `this.stopPolling` | `keyboard.ts` |
| `core.init` | 5 个 setup 方法 + `createFixedInputOverlay` | 5 个子模块 |

**应对**：子模块**不得**直接 import 兄弟子模块的方法，一律走 `this.`。`ThisType<MobileHandlerType>` 声明全部方法/属性，类型层安全；运行时 `Object.assign` 合并到同一对象后 `this.X` 全部解析成功。此模式已被 `ai/intel/action.ts`（调 `this.buildAiPrivateRevealContext` 等）验证可行。

### 9.2 `var self = this` 回调绑定（低风险）

原代码大量使用 `var self = this` 在 addEventListener/setInterval/requestAnimationFrame/setTimeout 回调中保持 `this` 绑定。拆分后 `this` 仍指向合并后的完整 MobileHandler，`self` 捕获行为不变。**不得改为箭头函数**（会改变 `this` 绑定语义，虽结果相同但违反"只搬移不改逻辑"原则）。

### 9.3 自动初始化副作用（低风险）

薄入口保留 `initMobileHandler` + 自动初始化代码。导入 `mobile-handler.ts` 仍触发 `addStyles()` + `MobileHandler.init()` + 全局 click 监听。副作用执行时机不变（DOMContentLoaded 或立即执行）。

### 9.4 模块解析：`mobile-handler.ts` 与 `mobile-handler/` 共存（低风险）

方案采用 `mobile-handler.ts`（文件）与 `mobile-handler/`（目录）共存。TS/Node 模块解析中，`"./mobile-handler"` / `"../../mobile/mobile-handler"` 优先匹配 `mobile-handler.ts` 文件，不会误入 `mobile-handler/index.ts`。此模式与 `ai/intel.ts` + `ai/intel/`、`ui/overlay.ts` + `ui/overlay/` 完全一致，已验证可行。

### 9.5 `convertToCustomSelect` 体量大（低风险）

`convertToCustomSelect`（L458-L639，182 行）是单方法最大的方法，内部有大量 DOM 操作和事件绑定（touchstart/touchmove/touchend/click/keydown）。本次拆分**不拆解此方法内部**，整体搬入 `custom-select.ts`。如需进一步拆解（如分离 touch 处理与 keyboard 处理），应作为独立后续任务。

### 9.6 `Object.assign` 合并顺序（低风险）

18 方法名 + 11 属性名已核对唯一，无覆盖。属性仅在 CorePart 中声明，其他子模块仅含方法。Object.assign 顺序（Core -> Keyboard -> Input -> Orientation -> CustomSelect -> Vibration）不影响结果。

### 9.7 `console.log` 调试语句（低风险，非阻塞）

L60-L69、L158-L165、L230-L237、L256、L316 含多处 `console.log` 调试输出。按"只搬移不改逻辑"原则原样保留；如需清理应作为独立后续任务。

---

## 十、难归类 / 跨职责方法说明

| 方法 | 归类决策 | 理由 |
|------|----------|------|
| `init` | `core.ts` | 编排方法，调用 6 个子模块的 setup/create 方法，归核心编排 |
| `setupKeyboardHandler` | `keyboard.ts` | 虽名为"keyboard handler"，实际是 focusin 事件拦截器，拦截文本输入焦点并转发到 `showFixedInput`。与键盘高度监听同属"键盘适配"职责，归 keyboard |
| `checkAndUpdatePosition` | `input.ts` | 虽调用 `handleKeyboardHeightChange`（keyboard），但主体职责是检查并更新输入框位置，归 input |
| `calculateSafeKeyboardHeight` | `keyboard.ts` | 键盘高度安全计算，归 keyboard；纯逻辑提取到 `pure.ts` |
| `addStyles` | `styles.ts`（独立）| 143 行 CSS 字符串注入，非单例成员，独立成文件避免膨胀薄入口 |
| `initMobileHandler` + 自动初始化 | 薄入口 | 编排 addStyles + init + 全局 click，且需引用合并后的 `MobileHandler`，留在薄入口 |

---

## 十一、执行顺序建议

**单阶段即可完成**（纯搬移，无逻辑变更，无测试回归）。但建议按以下顺序逐步推进，每步可单独 `tsc --noEmit` 校验：

1. 新建 `scripts/mobile/mobile-handler/` 目录。
2. 创建 `mobile-handler/types.ts`（提取 L12-L42 类型注解为 `MobileHandlerType` 接口）。
3. 创建 `mobile-handler/pure.ts`（提取 5 个纯函数，零依赖，最先可测）。
4. 创建 `mobile-handler/styles.ts`（搬 L648-L791 `addStyles`，零依赖）。
5. 创建 `mobile-handler/core.ts`（搬 L43-L53 状态 + L55-L79 `init`，import `./types` + `./pure`）。
6. 创建 `mobile-handler/vibration.ts`（搬 L406-L423，最小模块，import `./types`）。
7. 创建 `mobile-handler/orientation.ts`（搬 L340-L366，import `./types` + `./pure`）。
8. 创建 `mobile-handler/keyboard.ts`（搬 L134-L212 + L368-L404，import `./types` + `./pure`）。
9. 创建 `mobile-handler/input.ts`（搬 L81-L132 + L214-L338，import `./types`）。
10. 创建 `mobile-handler/custom-select.ts`（搬 L425-L645，最大模块，import `./types`）。
11. 改写 `mobile-handler.ts` 为薄入口（替换 812 行为 ~55 行，见 4.3）。
12. 跑 `npx tsc --noEmit` -> `npm run test` -> `npm run lint` -> `npm run format`。
13. 手动冒烟（见第八节 5）。
14. （可选）新增 `tests/mobile/mobile-handler.test.ts` 覆盖 5 个纯函数。

---

## 十二、是否分阶段

**推荐单阶段执行**。理由：

- 无测试文件 -> 无回归风险
- 仅 1 个消费方 -> 接口面极小
- 纯搬移 + 纯函数委托 -> 无逻辑变更
- 812 行体量中等（小于 intel.ts 1673 行、overlay.ts 957 行的已落地拆分）

若需降低风险，可分两阶段：
- **阶段 1**：提取 `types.ts` + `pure.ts` + `styles.ts`（三个零依赖模块），原文件改为 import 并委托纯函数。跑 tsc + test 验证。
- **阶段 2**：提取 6 个方法子模块 + 改写薄入口。跑全量验证。

但鉴于单阶段已足够安全，且两阶段中间态的"半拆分"文件反而增加复杂度，**推荐单阶段一次完成**。

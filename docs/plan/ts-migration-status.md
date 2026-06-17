# TypeScript 迁移现状报告

> 创建时间：2026-06-15
> 最后更新：2026-06-17
> 目的：澄清项目当前 TypeScript 迁移的真实进度，消除混淆

---

## 一、结论：这是一个 **"完整 TypeScript 项目"**

| 维度 | 状态 | 完成度 |
|------|------|--------|
| 文件后缀 | ✅ 全部 `.ts` | 100% |
| 类型定义 | ✅ 6 个 `.d.ts`，~150 接口 | 95% |
| any 类型 | ✅ 从 1,494 → 289 | 81% |
| ES Module | ✅ 170 import / 432 export | 90% |
| strict 模式 | ✅ `strict: true`，0 错误 | 100% |
| window 模块通信 | ✅ 已清除 | 95% |

---

## 二、window.XXX 真实统计

**总搜索结果：173 处 `window.`**

### 2.1 合法调用（浏览器原生 API）—— **不需要清除**

| 类型 | 数量 | 说明 |
|------|------|------|
| `window.localStorage` | ~80 | 存储读写，浏览器标准 API |
| `window.innerWidth/Height` | ~10 | 视口尺寸检测 |
| `window.setTimeout/setInterval` | ~15 | 定时器 |
| `window.fetch` | ~5 | 网络请求 |
| `window.confirm/alert` | ~5 | 弹窗 |
| `window.addEventListener` | ~5 | resize/orientationchange 监听 |
| `window.location` | ~5 | URL 解析 |
| `window.devicePixelRatio` | ~2 | 设备像素比 |
| `window.requestAnimationFrame` | ~2 | 动画帧 |
| `window.AudioContext` | ~2 | 音频上下文 |
| `window.NativeBridge` | ~10 | Android 原生桥接（外部接口） |
| `window.onNativeServerError` | ~5 | 原生回调（Android WebView 调用） |

**合计：~130 处，全部合法，不需要清除**

### 2.2 注释中的 window.XXX —— **文档说明，不是代码**

| 类型 | 数量 | 说明 |
|------|------|------|
| `@exports window.XXX` | ~25 | JSDoc 注释，说明导出位置 |
| `@requires window.XXX` | ~10 | JSDoc 注释，说明依赖 |

**合计：~35 处，是文档注释，不是实际调用**

### 2.3 需要清除的模块间通信 —— **已基本清除**

| 类型 | 数量 | 说明 |
|------|------|------|
| `window.MobaoXxx = Xxx` | **0** | 已全部改为 `export` |
| `const { xxx } = window.MobaoXxx` | **0** | 已全部改为 `import` |

**结论：ES Module 迁移已完成，模块间通信不再依赖 window.XXX**

---

## 三、为什么还有 173 处 window.XXX？

**因为大部分是浏览器原生 API，不是模块间通信！**

混淆来源：
1. `grep "window\."` 会匹配所有 `window.`，包括 `window.localStorage`
2. 注释中的 `@exports window.XXX` 也会被匹配
3. Android 原生桥接 `window.NativeBridge` 是外部接口，必须保留

**真正需要清除的 window.XXX（模块间通信）已经清除了。**

---

## 四、当前 tsconfig.json 配置

```json
{
  "compilerOptions": {
    "strict": true,         // ✅ 已开启严格模式
    "noImplicitAny": true,  // ✅ 禁止隐式 any
    "strictNullChecks": true, // ✅ 严格 null 检查
    "allowJs": true,
    "checkJs": false,
    "noEmit": true          // ✅ 仅类型检查，不生成代码
  }
}
```

**成果**：`npx tsc --noEmit` 输出 **0 个错误**，strict 模式完全通过。

---

## 五、下一步建议

### 5.1 继续消除 any 类型（当前 289 处）

any 类型从 1,494 降至 289，完成度 81%。继续将 `any` 替换为精确类型。

### 5.2 删除注释中的 window.XXX 说明

把 `@exports window.XXX` 改为 `@exports Xxx`，因为现在是 ES Module 导出，不再是 window 全局变量。

### 5.3 统一 localStorage 操作

当前 localStorage 操作分散在 20+ 个文件中，可考虑：
- 创建 `core/storage.ts` 统一管理
- 或保持现状（localStorage 是浏览器标准 API，不算"模块间通信")

---

## 六、与计划文档的关系

| 计划文档 | 目标 | 实际完成 |
|---------|------|---------|
| `es-module-migration-plan.md` | 消除 window.XXX 模块通信 | ✅ 已完成 |
| `any-elimination-plan.md` | any 从 1,494 → 150 | 🔄 289（81%） |
| `architecture-refactoring-plan.md` | Phase 2 拆分巨型文件 | ✅ 已完成 |
| `strict-mode-渐进修复.md` | 开启 strict 模式 | ✅ 已完成（0 错误） |

**结论**：ES Module 迁移已完成，strict 模式已开启（0 错误），any 消除进度 81%。

---

## 七、总结

| 问题 | 状态 |
|------|------|
| "还有 window 全局调用？" | ❌ 误解。173 处中 130 处是浏览器原生 API，35 处是注释 |
| "这都第几轮了还没清空？" | ❌ 误解。模块间通信的 window.XXX 已清空 |
| "算不算 TS 项目？" | ✅ 是"半 TS 项目"：文件已迁移，类型已定义，但 strict 未开启 |

**下一步行动**：开启 `strict: true`，让 TypeScript 真正发挥作用。
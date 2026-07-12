# 项目问题综合分析报告

> 创建时间：2026-06-17
> 目标：全面分析项目存在的问题，提供改进建议

> ⚠️ **状态更新（2026-07-12）**：本报告部分数据已过时（如测试 458 用例 -> 现 1011；console.log 数量已部分清理）。ESLint 已修复并可 lint `.ts`（0 error / 305 warning，主要是 `no-explicit-any` warn）。当前活跃追踪见 `analysis/task-list.md`。

---

## 一、已分析的问题（已知）

### 1.1 模块化问题

| 问题 | 说明 | 影响 |
|------|------|------|
| **巨行星文件** | main.ts（2748行）、llm-decision.ts（1685行）、warehouse/index.ts（约1474行） | 难以维护、难以审查 |
| **超级对象隐式依赖** | WarehouseScene 通过 Mixin 合并 19+ 个模块，Mixin 之间通过 `this` 相互调用 | 难以测试、难以追踪 |
| **IIFE 滥用** | lan-bridge.ts、llm-decision.ts 使用 IIFE | 不符合现代模块化 |
| **依赖注入不充分** | Deps 容器只有3个依赖，但实际依赖更多 | 依赖关系不显式 |

**详见**：[architecture.md](./architecture.md)

---

### 1.2 CSS 管理问题

| 问题 | 说明 | 影响 |
|------|------|------|
| **分类极其不明显** | styles.css（3711行）包含几乎所有样式 | 难以查找、难以维护 |
| **CSS 优先级混乱** | 多个文件定义相同选择器（如 `.hud button`） | 样式冲突、难以预测 |
| **超级文件** | styles.css（3711行）、lobby.css（1288行） | Git diff 难读、难以审查 |
| **手机端分离不彻底** | 手机样式分散在7个文件中 | 样式冲突、难以管理 |
| **命名不规范** | 命名风格不一致 | 难以识别文件类型 |
| **CSS 变量分散** | 变量分散在多个文件中 | 难以管理、容易冲突 |

**详见**：[css-management.md](./css-management.md)

---

## 二、新发现的问题

### 2.1 代码质量问题

#### 2.1.1 console.log 滥用

**现状**：
- **25个文件**包含 `console.log`、`console.error`、`console.warn`
- 调试代码没有清理，影响生产环境性能

**示例**：
```typescript
// scripts/game/main.ts
console.log("WarehouseScene created")

// scripts/llm/core/llm-manager.ts
console.error("LLM API call failed:", error)
```

**问题**：
- ❌ 生产环境会输出调试日志，影响性能
- ❌ 可能暴露敏感信息（如 API 错误详情）
- ❌ 用户可能看到调试信息

**改进建议**：
- 使用环境变量控制日志输出（`if (process.env.NODE_ENV === 'development')`）
- 使用日志库（如 `loglevel`、`winston`）分级管理日志
- 清理所有不必要的调试日志

---

#### 2.1.2 错误处理不一致

**现状**：
- **107次** `try-catch`，但只有 **36次** 有实际错误处理
- 很多空 `catch` 块，错误被吞掉

**示例**：
```typescript
// scripts/game/main.ts
try {
  this.startNewRun()
} catch (e) {
  // 空 catch，错误被吞掉
}

// scripts/llm/core/llm-manager.ts
try {
  await this.callLlmApi()
} catch (e) {
  console.error(e)  // 只打印，不处理
}
```

**问题**：
- ❌ 错误被吞掉，难以排查问题
- ❌ 用户可能不知道操作失败
- ❌ 错误处理不一致，有的打印，有的忽略

**改进建议**：
- 统一错误处理策略（记录日志 + 用户提示）
- 使用错误处理库（如 `error-handler`）
- 删除空 `catch` 块，至少记录日志

---

#### 2.1.3 TODO/FIXME 注释不足

**现状**：
- 只有 **1个** TODO 注释（在 `deps.ts`）
- 代码中缺少待办事项标记

**问题**：
- ❌ 难以追踪待办事项
- ❌ 新人不知道哪些代码需要改进

**改进建议**：
- 添加 TODO/FIXME 注释标记待办事项
- 使用工具（如 `todo-tree` VSCode 插件）追踪 TODO

---

### 2.2 架构设计问题

#### 2.2.1 window 全局对象滥用

**现状**：
- **170次** 使用 `window.`，说明模块化不完整
- 很多模块通过 `window.XXX` 全局变量暴露

**示例**：
```typescript
// scripts/game/main.ts
window.MobaoAppState = { scene: this }

// scripts/llm/core/llm-manager.ts
window.MobaoLlmManager = this
```

**问题**：
- ❌ 模块化不完整，依赖全局作用域
- ❌ 难以追踪依赖关系
- ❌ 可能引入命名冲突

**改进建议**：
- 使用 ES Module 导入导出（`import/export`）
- 使用依赖注入容器（`Deps`）管理共享依赖
- 减少 `window.XXX` 全局变量

---

#### 2.2.2 localStorage 使用过多

**现状**：
- **100次** 使用 `localStorage`，数据持久化依赖浏览器存储

**示例**：
```typescript
// scripts/game/core/settings.ts
localStorage.setItem('mobao_settings', JSON.stringify(settings))

// scripts/game/lobby/character-select.ts
localStorage.setItem('mobao_selected_character_v1', characterId)
```

**问题**：
- ❌ 数据存储在浏览器，无法跨设备同步
- ❌ localStorage 有容量限制（5-10MB）
- ❌ 数据没有加密，可能被篡改

**改进建议**：
- 使用 IndexedDB 存储大量数据
- 使用加密存储敏感数据
- 提供云端同步选项（如果有后端）

---

#### 2.2.3 依赖注入不充分

**现状**：
- `Deps` 容器只有 **3个依赖**（LLM_BRIDGE、BATTLE_RECORD_BRIDGE、SETTLEMENT_BRIDGE）
- 但实际依赖更多（AudioManager、MobileHandler、LanBridge 等）

**示例**：
```typescript
// scripts/game/core/deps.ts
export const Deps = {
  LLM_BRIDGE: null,
  BATTLE_RECORD_BRIDGE: null,
  SETTLEMENT_BRIDGE: null,
}
```

**问题**：
- ❌ 依赖注入不充分，很多依赖仍然通过 `window.XXX` 传递
- ❌ 依赖关系不显式

**改进建议**：
- 扩展 `Deps` 容器，包含所有共享依赖
- 使用依赖注入框架（如 `InversifyJS`）

---

### 2.3 性能和安全问题

#### 2.3.1 CORS 代理服务器

**现状**：
- `proxy-server.js` 是一个 CORS 代理，用于绕过 CORS 限制
- 允许所有来源（`Access-Control-Allow-Origin: '*'`）

**示例**：
```javascript
// proxy-server.js
res.setHeader('Access-Control-Allow-Origin', '*')
```

**问题**：
- ❌ 允许所有来源，可能被恶意利用
- ❌ 没有速率限制，可能被滥用
- ❌ 没有认证机制，任何人都可以使用

**改进建议**：
- 限制允许的来源（只允许游戏域名）
- 添加速率限制（防止滥用）
- 添加认证机制（防止未授权访问）

---

#### 2.3.2 API Key 管理

**现状**：
- **47个文件**包含 password、token、secret、key、credential 等关键词
- API Key 可能存储在 localStorage 或代码中

**问题**：
- ❌ API Key 可能暴露在代码或 localStorage 中
- ❌ 没有加密存储 API Key
- ❌ API Key 可能被篡改或窃取

**改进建议**：
- 使用环境变量存储 API Key（`process.env.LLM_API_KEY`）
- 使用加密存储 API Key（如 `crypto-js`）
- 提供 API Key 输入界面，不存储在代码中

---

#### 2.3.3 网络请求错误处理

**现状**：
- **6次** 使用 `fetch`，但错误处理不一致
- 有的打印错误，有的忽略错误

**问题**：
- ❌ 网络请求失败时用户体验差
- ❌ 错误处理不一致

**改进建议**：
- 统一网络请求错误处理（重试 + 用户提示）
- 使用网络请求库（如 `axios`）

---

### 2.4 测试和文档问题

#### 2.4.1 测试覆盖率极低

**现状**：
- 已安装 Vitest，有 22 个测试文件、458 个测试用例，全部通过
- 但整体语句覆盖率仅 **7%**（12061 条语句中覆盖 846 条）
- 测试集中在已提取的纯函数层，大量模块零覆盖

**问题**：
- ❌ 覆盖率远低于行业标准（80%），代码修改缺乏安全网
- ❌ Phaser/DOM 耦合代码无法测试（lan/、scene/、audio/、mobile/）
- ❌ UI 层全部手动 DOM 操作，无法自动化测试
- ❌ 重构风险高，改一处可能破坏另一处但无法检测

**改进建议**：
- **短期**：补充纯函数测试，目标覆盖率 60%（详见 [test-coverage.md](../plans/test-coverage.md)）
- **中期**：引入 Vue 做 UI 层，用 Vue Test Utils 测试 UI 逻辑
- **长期**：目标覆盖率 80%+，配合 CI/CD 自动运行

---

#### 2.4.2 文档过时

**现状**：
- `project-overview.md` 描述的是 JS 项目（"47 个 JS 文件，~27,000 行代码"）
- 但现在是 TypeScript 项目（约 66 个 TS 文件）

**问题**：
- ❌ 文档与代码不一致，误导新人
- ❌ 难以理解项目当前状态

**改进建议**：
- 更新文档，反映 TypeScript 迁移后的状态
- 添加 TypeScript 迁移状态文档

---

#### 2.4.3 没有代码质量工具

**现状**：
- 只有 ESLint 和 Prettier
- 没有更高级的代码质量工具（如 SonarQube、CodeClimate）

**问题**：
- ❌ 无法检测复杂度、重复代码、潜在 bug
- ❌ 无法追踪代码质量趋势

**改进建议**：
- 使用 SonarQube 或 CodeClimate 检测代码质量
- 使用 ESLint 插件（如 `eslint-plugin-complexity`）

---

#### 2.4.4 没有 CI/CD

**现状**：
- 没有 GitHub Actions、Travis CI 等配置文件
- 没有自动化测试、构建、部署流程

**问题**：
- ❌ 每次提交需要手动测试、构建
- ❌ 可能引入 bug，无法自动检测

**改进建议**：
- 配置 GitHub Actions 自动化测试、构建
- 在 PR 时自动运行测试和 lint

---

## 三、问题优先级排序

### P0（紧急，影响用户体验或安全）

| 问题 | 影响 | 改进建议 |
|------|------|---------|
| **console.log 滥用** | 生产环境性能、敏感信息暴露 | 使用环境变量控制日志输出 |
| **错误处理不一致** | 用户不知道操作失败、难以排查 | 统一错误处理策略 |
| **API Key 管理** | API Key 可能暴露或被窃取 | 使用环境变量或加密存储 |
| **CORS 代理服务器** | 可能被恶意利用 | 限制允许的来源 |

---

### P1（重要，影响代码质量）

| 问题 | 影响 | 改进建议 |
|------|------|---------|
| **window 全局对象滥用** | 模块化不完整、难以追踪依赖 | 使用 ES Module 导入导出 |
| **localStorage 使用过多** | 数据无法跨设备同步、容量限制 | 使用 IndexedDB 或云端同步 |
| **依赖注入不充分** | 依赖关系不显式 | 扩展 Deps 容器 |
| **测试覆盖率极低（7%）** | 代码修改缺乏安全网、重构风险高 | 补充纯函数测试，中期引入 Vue 测试 UI |

---

### P2（中等，影响维护性）

| 问题 | 影响 | 改进建议 |
|------|------|---------|
| **TODO/FIXME 注释不足** | 难以追踪待办事项 | 添加 TODO/FIXME 注释 |
| **文档过时** | 误导新人、难以理解项目状态 | 更新文档 |
| **没有代码质量工具** | 无法检测复杂度、重复代码 | 使用 SonarQube 或 CodeClimate |
| **没有 CI/CD** | 需要手动测试、构建 | 配置 GitHub Actions |

---

## 四、综合改进建议

### 4.1 短期改进（1-2天）

**目标**：解决 P0 问题，提升用户体验和安全

**步骤**：
1. 清理 console.log（使用环境变量控制）
2. 统一错误处理（记录日志 + 用户提示）
3. 加密存储 API Key（使用环境变量或加密）
4. 限制 CORS 代理服务器来源

---

### 4.2 中期改进（3-5天）

**目标**：解决 P1 问题，提升代码质量

**步骤**：
1. 减少 window 全局对象（使用 ES Module）
2. 扩展 Deps 容器（包含所有共享依赖）
3. 补充纯函数测试，目标覆盖率 60%
4. 使用 IndexedDB 替代 localStorage（大量数据）

---

### 4.3 长期改进（5-7天）

**目标**：解决 P2 问题，提升维护性

**步骤**：
1. 添加 TODO/FIXME 注释
2. 更新文档（反映 TypeScript 迁移后状态）
3. 使用 SonarQube 或 CodeClimate 检测代码质量
4. 配置 GitHub Actions 自动化测试、构建

---

## 五、总结

### 核心问题汇总

| 类别 | 问题数 | 优先级 |
|------|--------|--------|
| **代码质量** | 3 | P0/P1 |
| **架构设计** | 3 | P1 |
| **性能和安全** | 3 | P0 |
| **测试和文档** | 4 | P1/P2 |

**总计**：**13个问题**

### 改进路径

**短期（1-2天）**：
- 解决 console.log 滥用、错误处理不一致、API Key 管理、CORS 代理安全问题

**中期（3-5天）**：
- 解决 window 全局对象滥用、依赖注入不充分、没有单元测试、localStorage 使用过多

**长期（5-7天）**：
- 解决 TODO/FIXME 注释不足、文档过时、没有代码质量工具、没有 CI/CD

---

## 六、参考资料

- [architecture.md](./architecture.md) - 模块化和超级对象重构方案
- [css-management.md](./css-management.md) - CSS 管理问题分析
- [vue-integration.md](../plans/vue-integration.md) - Vue 引入方案分析
- [ts-migration.md](../archive/ts-migration.md) - TypeScript 迁移状态
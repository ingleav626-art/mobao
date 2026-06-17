# strict 模式渐进修复计划

> 创建时间：2026-06-15
> 最后更新：2026-06-17
> 目标：逐个文件修复类型错误，最终开启 `strict: true`
> 状态：✅ **已完成（0 错误）**

---

## 一、策略：从少到多

**原则**：
1. 先修复错误少的文件（容易看到进展）
2. 每修复一个文件，验证 `tsc --noEmit` 通过
3. 提交后再修复下一个
4. 最后修复错误多的文件（ai/intel.ts、warehouse/index.ts）

**实际执行**：
- 采用批量修复策略，优先处理 TS2339（1015个）和 TS2531（136个）
- 定义 WarehouseSceneThis 接口解决 mixin this 类型问题
- 将 dom 属性重构为精确接口解决 null 检查问题
- 最终一次性清零所有错误

---

## 二、修复成果

**`npx tsc --noEmit` 输出 0 个错误，strict 模式完全通过。**

### 关键修复文件

| 文件 | 修复内容 |
|------|---------|
| `types/warehouse-scene-this.d.ts` | 定义完整的 WarehouseSceneThis 接口（~700行） |
| `scripts/game/warehouse/index.ts` | 修复 TS2531 null 检查错误 |
| `scripts/llm/core/llm-decision.ts` | 修复 TS2322 类型赋值错误 |
| `scripts/game/ai/memory.ts` | 修复类型定义错误 |
| 所有 mixin 文件 | 使用 ThisType 或类型断言 |

---

## 三、修复流程（标准）

### 单文件修复流程

1. **单文件严格检查**
   ```bash
   npx tsc --noEmit --project tsconfig.strict-single.json
   ```

2. **修复错误**
   - 补充类型定义（不使用 any/unknown）
   - 添加 null 检查
   - 修正类型断言

3. **再次检查**
   ```bash
   npx tsc --noEmit --project tsconfig.strict-single.json
   ```

4. **全局验证**
   ```bash
   npx tsc --noEmit
   ```

5. **提交**
   ```bash
   git add scripts/xxx.ts types/xxx.d.ts
   git commit -m "fix: 修复 xxx.ts 类型错误"
   ```

---

## 四、下一步

- 继续消除 any 类型（当前 289 处）
- 删除注释中的 window.XXX 说明
- 统一 localStorage 操作
---
alwaysApply: false
description: 当你需要写注释时
---
# 注释与文档规则

> 本文件定义代码注释的标准和必写场景。

---

## 一、文件头注释（必须）

每个 JS 文件必须有 JSDoc 头部注释，格式如下：

```javascript
/**
 * @file path/to/file.js
 * @module module/name
 * @description 一句话描述文件的核心职责
 *
 * 核心功能：
 *   - 功能1：简述
 *   - 功能2：简述
 *
 * @requires 依赖模块 - 简述依赖原因
 *
 * @exports 导出内容 - 简述
 */
```

字段说明：
- `@file`：文件相对路径
- `@module`：模块路径（如 `game/ai/bidding`）
- `@description`：文件职责概述 + 核心功能列表
- `@requires`：外部依赖（文件级）
- `@exports`：导出内容（变量名、类名、Mixin 名）

## 二、必须写注释的场景

1. **非显而易见的算法逻辑**：
   ```javascript
   // ✅ 市场参考价 = 基础价 × 稀有度系数 × 趋势修正
   const marketRef = basePrice * rarityCoeff * trendFactor;

   // ❌ 计算市场参考价  →  显然是 marketRef
   ```

2. **魔法数字**：
   ```javascript
   // ✅ 30秒断线宽限期
   const GRACE_PERIOD_MS = 30000;

   // ❌ 30000  →  什么意思？
   ```

3. **临时方案/待定设计**：
   ```javascript
   // TODO: 联机模式暂未实现好友邀请功能
   // FIXME: 此处硬编码了房间最大人数，应从配置读取
   ```

4. **与其他模块的隐式约定**：
   ```javascript
   // 事件名格式：lan:模块:动作（如 lan:round:start）
   // 房间码格式：4位大写字母+数字，排除 I/O/0/1
   ```

5. **为什么不这样做**（设计决策）：
   ```javascript
   // 联机模式不复用单机的 _startLive2dLoop，因为它依赖
   // 单机特有的 #character-video DOM 结构
   ```

## 三、禁止写的注释

1. **废话注释**（代码本身已经表达清楚的）：
   ```javascript
   // ❌ 设置名字
   this.name = name;

   // ❌ 遍历玩家列表
   for (const player of players) { ... }
   ```

2. **注释式删除代码**：
   ```javascript
   // ❌ // const oldFunction = () => { ... }
   // 要删就真删，Git 有历史可找回
   ```

3. **被注释掉的调试代码**：
   ```javascript
   // ❌ // console.log('debug:', data);
   ```

## 四、函数注释

对于导出的/公共的函数，写 JSDoc 注释：

```javascript
/**
 * 计算 AI 出价
 * @param {Object} args - 出价参数
 * @param {string} args.playerId - 玩家 ID
 * @param {number} args.clueRate - 线索比率 (0~1)
 * @param {number} args.qualityRate - 品质比率 (0~1)
 * @returns {number} 出价金额
 */
function computeBid(args) { ... }
```

对于内部/私有函数，如果逻辑不直观则写行内注释，不需要完整 JSDoc。

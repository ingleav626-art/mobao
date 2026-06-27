# scripts/mobile/, scripts/audio/, types/, lan/ 分析

## 一、scripts/mobile/

### mobile-handler.ts (812行)
- **职责过重**：键盘管理、输入框覆盖层、横竖屏检测、自定义select组件、振动反馈 五个独立功能域
- **样式内嵌**：CSS 通过 JS 字符串硬编码注入
- **加载时机不明确**

## 二、scripts/audio/

### audio-manager.ts (430行)
- `Record<string, any>` 泛滥，完全放弃类型安全
- 重复的"查找音效"逻辑：playSfx/playLoopingSfx/playStopableSfx 各有一段几乎相同的搜索逻辑

### audio-ui.ts (175行)
- 与 AudioManager 职责边界模糊：直接访问私有字段 `_enabled`/`_sfxEnabled`
- 类型不精确：`Record<string, any>`

## 三、types/

### globals.d.ts (212行)
- 大量 `Record<string, any>`，类型检查形同虚设
- LanBridge 与 `types/lan.d.ts` 重复定义且不完全一致

### game.d.ts (254行) — 基本清晰

### ai.d.ts (385行)
- AiPrivateIntel 和 AiPrivateIntelPool 两个接口高度重叠

### llm.d.ts (404行)
- `LlmChatResult` 重复定义（两个定义，第二个覆盖第一个）
- `LlmPlan` 和 `LlmPlanResult` 字段高度重叠

### lan.d.ts (280行)
- 与 `globals.d.ts` 重复定义 LanBridge

### warehouse-scene-this.d.ts (919行)
- **巨型文件**：维护成本极高
- 重复导入：LlmBridge 等类型 import 了两次
- 重复声明：多个属性重复出现（settlementRunToken、isSettlementRevealMode 等）

## 四、lan/（客户端+服务端）

### lan/client/lan-bridge.ts (667行)
- **职责过重**：WebSocket管理 + 事件系统 + 房间操作 + 游戏同步 + 子网扫描
- `_handleMessage` switch 130+ 行，30+ 消息类型
- 子网扫描过于激进（254个IP，每个800ms超时）

### lan/shared/protocol.ts (73行)
- **未被使用**：server.js 和 lan-bridge.ts 均未 import，消息类型全部硬编码

### lan/server/server.js (1382行)
- **单文件过大**：房间管理、消息路由、游戏逻辑、HTTP服务、UDP发现全在一个文件
- **LLM代理功能混入**：与根目录 `proxy-server.js` 功能重复
- **与 protocol.ts 脱节**：完全不引用共享协议常量

### LanBridge 类型三处重复定义
- `types/globals.d.ts`（declare class）
- `types/lan.d.ts`（export interface）
- `lan/client/lan-bridge.d.ts`（declare module）

## 整体评价

**核心问题**：
| 问题 | 严重度 |
|------|--------|
| server.js 过大（1382行）+ LLM代理混入 | **高** |
| lan-bridge.ts 过大（667行） | **中** |
| mobile-handler.ts 过大（812行） | **中** |
| warehouse-scene-this.d.ts 维护噩梦（919行） | **中** |
| protocol.ts 未被使用 | **低** |
| LLM代理功能重复（proxy-server.js + server.js） | **低** |
| LanBridge 类型三处重复定义 | **低** |

## 改进建议

1. 拆分 server.js：rooms / message-router / llm-proxy / udp-discovery
2. 拆分 lan-bridge.ts：connection / event-system / device-discovery
3. 拆分 mobile-handler.ts：keyboard / orientation / select / vibration
4. 使用 protocol.ts 替代硬编码字符串
5. 合并 LanBridge 的三处类型声明
6. 消除 LLM 代理重复

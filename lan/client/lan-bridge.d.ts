/**
 * @file lan/client/lan-bridge.d.ts
 * @description LanBridge 模块类型声明
 */

declare module "../../lan/client/lan-bridge" {
  import type { LanBridge } from "../../types/lan"
  global {
    const LanBridge: LanBridge
  }
  export { }
}

declare module "../../lan/client/lan-bridge.js" {
  import type { LanBridge } from "../../types/lan"
  global {
    const LanBridge: LanBridge
  }
  export { }
}
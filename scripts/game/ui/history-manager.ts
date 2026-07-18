/**
 * @file history-manager.ts
 * @module ui/history-manager
 * @description HistoryManager -- 玩家历史记录管理器（Phase 2 依赖注入）。
 *              包装 history.ts 的纯函数，通过构造函数注入依赖（players、HistoryData、dom 等），
 *              替代原 Mixin 通过 this. 隐式读取场景属性的方式。
 *              Manager 可独立单测，过渡期 Mixin 保留为薄代理层。
 */
import type { ItemDef } from "../../../types/game"
import type { HistoryData } from "./history"
import {
  resetPlayerHistoryState,
  clearCurrentRoundUsage,
  recordPlayerUsage,
  recordRoundHistory,
  refreshPlayerHistoryUI,
  renderItemUsageCell,
  toggleItemDrawer,
  openItemDrawer,
  closeItemDrawer,
  renderItemDrawer
} from "./history"
import { useInventoryStore } from "../../vue/stores/inventoryStore"

/** 道具抽屉动态状态（从场景读取的瞬时值） */
export interface DrawerState {
  settled: boolean
  roundResolving: boolean
  playerBidSubmitted: boolean
  roundTimeLeft: number
}

/** HistoryManager 依赖接口 */
export interface HistoryManagerDeps {
  /** 玩家列表（引用，用于遍历初始化/记录历史） */
  players: Array<{ id: string }>
  /** 历史数据（getter：resetForNewRun 会替换 state 对象引用，必须每次取最新值） */
  data: HistoryData | { (): HistoryData }
  /** DOM 元素映射（引用，抽屉/面板渲染用） */
  dom: Record<string, HTMLElement | null>
  /** 道具管理器（引用，renderItemDrawer 读取道具状态） */
  itemManager: { getItemState(): Array<{ id: string; name: string; count: number; initialCount: number }> }
  /** 技能管理器（引用，Vue 桥接读取技能状态） */
  skillManager?: {
    getSkillState(): Array<{ id: string; name: string; remainingThisRound: number; maxPerRound: number }>
  }
  /** 获取当前回合号（动态值） */
  getRound: () => number
  /** 获取道具抽屉状态（动态值：settled/roundResolving 等） */
  getDrawerState: () => DrawerState
  /** 关闭出价键盘（跨 Mixin 回调） */
  closeBidKeypad: () => void
  /** 设置覆盖层是否打开（跨 Mixin 回调） */
  isSettingsOverlayOpen: () => boolean
  /** 结算页面是否激活（跨 Mixin 回调） */
  isSettlementPageActive: () => boolean
  /** 获取道具信息（跨 Mixin 回调） */
  getItemInfo: (itemId: string) => ItemDef
}

/**
 * 玩家历史记录管理器。
 *
 * 依赖通过构造函数注入，Manager 内部不访问 this（场景）属性。
 * _drawerVersionRef 由 Manager 内部持有（原 Mixin 挂在场景的 _drawerVersionRef 上）。
 */
export class HistoryManager {
  /** 道具抽屉渲染版本缓存（避免重复渲染相同状态） */
  private drawerVersionRef: { current: string } = { current: "" }

  constructor(private readonly deps: HistoryManagerDeps) { }

  /** 获取最新的历史数据引用（支持 getter，避免 resetForNewRun 后引用分叉） */
  private getData(): HistoryData {
    return typeof this.deps.data === "function" ? (this.deps.data as () => HistoryData)() : this.deps.data
  }

  /** 重置所有玩家的回合历史和使用记录 */
  resetPlayerHistoryState(): void {
    resetPlayerHistoryState(this.deps.players, this.getData(), () => this.refreshPlayerHistoryUI())
  }

  /** 清空所有玩家当前回合使用记录 */
  clearCurrentRoundUsage(): void {
    clearCurrentRoundUsage(this.deps.players, this.getData())
  }

  /** 记录玩家使用道具 */
  recordPlayerUsage(playerId: string, itemId: string): void {
    recordPlayerUsage(this.getData(), playerId, itemId, () => this.refreshPlayerHistoryUI())
  }

  /** 记录一轮结束后各玩家的出价和道具使用 */
  recordRoundHistory(roundBids: Array<{ playerId: string; bid: number }>): void {
    recordRoundHistory(this.deps.players, this.getData(), this.deps.getRound(), roundBids, () =>
      this.refreshPlayerHistoryUI()
    )
  }

  /** 刷新所有玩家的历史面板 */
  refreshPlayerHistoryUI(): void {
    refreshPlayerHistoryUI(this.deps.players, this.getData(), (actions: string[]) => this.renderItemUsageCell(actions))
  }

  /** 渲染道具使用单元格 */
  renderItemUsageCell(actions: string[]): string {
    return renderItemUsageCell(actions, (itemId: string) => this.deps.getItemInfo(itemId))
  }

  /** 切换道具抽屉开关 */
  toggleItemDrawer(): void {
    toggleItemDrawer(
      this.deps.dom,
      () => this.openItemDrawer(),
      () => this.closeItemDrawer()
    )
    try {
      const store = useInventoryStore()
      store.toggleDrawer()
    } catch (_e) {
      // Pinia 尚未初始化
    }
  }

  /** 打开道具抽屉 */
  openItemDrawer(): void {
    const state = this.deps.getDrawerState()
    openItemDrawer(
      {
        settled: state.settled,
        roundResolving: state.roundResolving,
        playerBidSubmitted: state.playerBidSubmitted,
        roundTimeLeft: state.roundTimeLeft,
        itemManager: this.deps.itemManager,
        dom: this.deps.dom
      },
      () => this.deps.closeBidKeypad(),
      () => this.deps.isSettingsOverlayOpen(),
      () => this.deps.isSettlementPageActive(),
      () => this.renderItemDrawer()
    )
    try {
      const store = useInventoryStore()
      store.openDrawer()
    } catch (_e) {
      // Pinia 尚未初始化
    }
  }

  /** 关闭道具抽屉 */
  closeItemDrawer(): void {
    closeItemDrawer(this.deps.dom)
    try {
      const store = useInventoryStore()
      store.closeDrawer()
    } catch (_e) {
      // Pinia 尚未初始化
    }
  }

  /** 渲染道具抽屉内容 */
  renderItemDrawer(): void {
    const state = this.deps.getDrawerState()
    const canUse = !(state.settled || state.roundResolving || state.playerBidSubmitted || state.roundTimeLeft <= 0)
    renderItemDrawer(this.deps.dom, canUse, this.deps.itemManager, this.drawerVersionRef, (itemId: string) =>
      this.deps.getItemInfo(itemId)
    )
    try {
      const store = useInventoryStore()
      const items = this.deps.itemManager.getItemState()
      const skills = this.deps.skillManager?.getSkillState() ?? []
      store.updateItems(items, skills)
    } catch (_e) {
      // Pinia 尚未初始化
    }
  }
}

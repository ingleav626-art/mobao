/**
 * @file panels-manager.ts
 * @module ui/panels-manager
 * @description PanelsManager -- 侧边信息面板管理器（Phase 2 依赖注入）。
 *              包装 panels.ts 的纯函数，通过构造函数注入依赖（entries 数组、dom、
 *              回合号、联机状态等），替代原 Mixin 通过 this. 隐式读取场景属性的方式。
 *              Manager 可独立单测，过渡期 Mixin 保留为薄代理层。
 */
import type { IntelEntry } from "./panels"
import {
  addPrivateIntelEntry,
  addPublicInfoEntry,
  renderPrivateIntelPanel,
  renderPublicInfoPanel,
  updateSidePanels,
} from "./panels"

/** 联机桥最小接口（仅约束 send 方法，用于广播公共信息） */
export type PanelsLanBridge = { send: (msg: unknown) => void } | null

/** PanelsManager 依赖接口 */
export interface PanelsManagerDeps {
  /** 私有情报条目（可变引用：addXxx 写入 / renderXxx 读取，外部模块亦可重置/同步） */
  privateIntelEntries: IntelEntry[]
  /** 公共信息条目（可变引用：联机同步与 scene-run 等模块共享） */
  publicInfoEntries: IntelEntry[]
  /** DOM 元素映射（引用，读取 personalPanelScroll / publicInfoScroll） */
  dom: Record<string, HTMLElement | null>
  /** 获取当前回合号（动态值） */
  getRound: () => number
  /** 获取联机桥（动态值，用于广播公共信息；非联机时为 null） */
  getLanBridge: () => PanelsLanBridge
  /** 获取是否联机模式（动态值） */
  getIsLanMode: () => boolean
  /** 获取是否联机主机（动态值） */
  getLanIsHost: () => boolean
}

/**
 * 侧边信息面板管理器。
 *
 * 依赖通过构造函数注入，Manager 内部不访问 this（场景）属性。
 * intelPanelVersionRef 由 Manager 内部持有（原 Mixin 挂在场景的 _intelPanelVersionRef 上）。
 */
export class PanelsManager {
  /** 私有情报面板渲染版本缓存（避免重复渲染相同状态） */
  private intelPanelVersionRef: { current: string } = { current: "" }

  constructor(private readonly deps: PanelsManagerDeps) {}

  /** 添加私有情报条目（来源+文本+当前回合号） */
  addPrivateIntelEntry(entry: { source?: string; text?: string }): void {
    addPrivateIntelEntry(this.deps.privateIntelEntries, this.deps.getRound(), entry)
  }

  /** 添加公共信息条目（联机模式且为主机时自动通过 lanBridge 广播） */
  addPublicInfoEntry(entry: { source?: string; text?: string }): void {
    addPublicInfoEntry(
      this.deps.publicInfoEntries,
      this.deps.getRound(),
      entry,
      this.deps.getLanBridge(),
      this.deps.getIsLanMode(),
      this.deps.getLanIsHost(),
    )
  }

  /** 渲染私有情报面板（带版本缓存，自动滚动到底部） */
  renderPrivateIntelPanel(): void {
    renderPrivateIntelPanel(
      this.deps.dom.personalPanelScroll,
      this.deps.privateIntelEntries,
      this.intelPanelVersionRef,
    )
  }

  /** 渲染公共信息面板（自动滚动到底部） */
  renderPublicInfoPanel(): void {
    renderPublicInfoPanel(this.deps.dom.publicInfoScroll, this.deps.publicInfoEntries)
  }

  /** 统一更新两侧面板（先私有后公共） */
  updateSidePanels(): void {
    updateSidePanels(() => this.renderPrivateIntelPanel(), () => this.renderPublicInfoPanel())
  }
}

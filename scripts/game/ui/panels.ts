/**
 * @file ui/panels.ts
 * @module ui/panels
 * @description 侧边信息面板。管理游戏界面左右两侧的私有情报面板和
 *              公共信息面板的渲染和更新，以及联机模式下的公共信息同步。
 *
 * 核心职责：
 *   - addPrivateIntelEntry: 添加私有情报条目（来源+文本+轮次）
 *   - addPublicInfoEntry: 添加公共信息条目（联机模式自动广播）
 *   - renderPrivateIntelPanel / renderPublicInfoPanel: 渲染面板（带版本缓存）
 *   - updateSidePanels: 统一更新两侧面板
 *
 * @exports IntelEntry - 情报条目接口
 * @exports addPrivateIntelEntry / addPublicInfoEntry / renderPrivateIntelPanel / renderPublicInfoPanel / updateSidePanels
 * @exports UiPanelsMixin - 向后兼容的 Mixin 薄包装
 */
import { escapeHtml } from "../core/utils"

export interface IntelEntry {
  source: string
  text: string
  round: number
}

// ─── 独立函数（可独立测试）───

export function addPrivateIntelEntry(
  entries: IntelEntry[],
  round: number,
  entry: { source?: string; text?: string }
): void {
  entries.push({
    source: entry.source || "未知",
    text: entry.text || "",
    round
  })
}

export function addPublicInfoEntry(
  entries: IntelEntry[],
  round: number,
  entry: { source?: string; text?: string },
  lanBridge?: { send: (msg: any) => void } | null,
  isLanMode?: boolean,
  lanIsHost?: boolean
): void {
  entries.push({
    source: entry.source || "未知",
    text: entry.text || "",
    round
  })
  if (isLanMode && lanIsHost && lanBridge) {
    lanBridge.send({
      type: "lan:public-info",
      source: entry.source || "未知",
      text: entry.text || "",
      round
    })
  }
}

export function renderPrivateIntelPanel(
  container: HTMLElement | null,
  entries: IntelEntry[],
  versionRef: { current: string }
): void {
  if (!container) return
  const version =
    entries.length +
    "|" +
    (entries[entries.length - 1]?.text || "")
  if (versionRef.current === version) return
  versionRef.current = version
  if (entries.length === 0) {
    container.innerHTML = '<div class="side-line intel-empty">暂无私有情报</div>'
    return
  }
  const wasAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 20
  container.innerHTML = entries
    .map(
      (entry) =>
        `<div class="side-line intel-entry"><span class="intel-source">${escapeHtml(entry.source)}：</span>${escapeHtml(entry.text)}</div>`
    )
    .join("")
  if (wasAtBottom) {
    container.scrollTop = container.scrollHeight
  }
}

export function renderPublicInfoPanel(
  container: HTMLElement | null,
  entries: IntelEntry[]
): void {
  if (!container) return
  if (entries.length === 0) {
    container.innerHTML = '<div class="public-line intel-empty">暂无公共信息</div>'
    return
  }
  const wasAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 20
  container.innerHTML = entries
    .map(
      (entry) =>
        `<div class="public-line public-event"><span class="intel-source">[${escapeHtml(entry.source)}]</span> ${escapeHtml(entry.text)}</div>`
    )
    .join("")
  if (wasAtBottom) {
    container.scrollTop = container.scrollHeight
  }
}

export function updateSidePanels(
  renderPrivate: () => void,
  renderPublic: () => void
): void {
  renderPrivate()
  renderPublic()
}

// ─── Mixin 薄包装（向后兼容）───

export const UiPanelsMixin: Record<string, any> = {
  privateIntelEntries: [] as IntelEntry[],
  publicInfoEntries: [] as IntelEntry[],

  addPrivateIntelEntry(entry: { source?: string; text?: string }): void {
    addPrivateIntelEntry(this.privateIntelEntries, this.round, entry)
  },

  addPublicInfoEntry(entry: { source?: string; text?: string }): void {
    addPublicInfoEntry(this.publicInfoEntries, this.round, entry, this.lanBridge, this.isLanMode, this.lanIsHost)
  },

  renderPrivateIntelPanel(): void {
    renderPrivateIntelPanel(this.dom.personalPanelScroll, this.privateIntelEntries, this._intelPanelVersionRef || (this._intelPanelVersionRef = { current: "" }))
  },

  renderPublicInfoPanel(): void {
    renderPublicInfoPanel(this.dom.publicInfoScroll, this.publicInfoEntries)
  },

  updateSidePanels(): void {
    updateSidePanels(() => this.renderPrivateIntelPanel(), () => this.renderPublicInfoPanel())
  }
}

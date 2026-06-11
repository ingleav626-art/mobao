/**
 * @file ui/panels.js
 * @module ui/panels
 * @description 侧边信息面板 Mixin。管理游戏界面左右两侧的私有情报面板和
 *              公共信息面板的渲染和更新，以及联机模式下的公共信息同步。
 *
 * 核心职责：
 *   - addPrivateIntelEntry(entry): 添加私有情报条目（来源+文本+轮次）
 *   - addPublicInfoEntry(entry): 添加公共信息条目
 *     联机模式下，房主自动通过 lanBridge 广播公共信息（lan:public-info）
 *   - renderPrivateIntelPanel(): 渲染私有情报面板
 *     带版本缓存避免重复渲染，自动滚动到底部（如果之前就在底部）
 *   - renderPublicInfoPanel(): 渲染公共信息面板
 *     同上，带版本缓存和自动滚动
 *   - updateSidePanels(): 统一更新两侧面板
 *
 * 数据结构：
 *   privateIntelEntries: [{ source, text, round }]
 *   publicInfoEntries: [{ source, text, round }]
 *
 * @requires MobaoUtils - 工具函数（escapeHtml）
 *
 * @exports PanelsMixin - 侧边信息面板 Mixin，混入 Phaser Scene
 */
const { escapeHtml } = window.MobaoUtils

export const UiPanelsMixin = {
  addPrivateIntelEntry(entry) {
    this.privateIntelEntries.push({
      source: entry.source || "未知",
      text: entry.text || "",
      round: this.round
    })
  },

  addPublicInfoEntry(entry) {
    this.publicInfoEntries.push({
      source: entry.source || "未知",
      text: entry.text || "",
      round: this.round
    })
    if (this.isLanMode && this.lanIsHost && this.lanBridge) {
      this.lanBridge.send({
        type: "lan:public-info",
        source: entry.source || "未知",
        text: entry.text || "",
        round: this.round
      })
    }
  },

  renderPrivateIntelPanel() {
    const container = this.dom.personalPanelScroll
    if (!container) {
      return
    }
    const version =
      this.privateIntelEntries.length +
      "|" +
      (this.privateIntelEntries[this.privateIntelEntries.length - 1]?.text || "")
    if (this._intelPanelVersion === version) return
    this._intelPanelVersion = version
    if (this.privateIntelEntries.length === 0) {
      container.innerHTML = '<div class="side-line intel-empty">暂无私有情报</div>'
      return
    }
    const wasAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 20
    container.innerHTML = this.privateIntelEntries
      .map(
        (entry) =>
          `<div class="side-line intel-entry"><span class="intel-source">${escapeHtml(entry.source)}：</span>${escapeHtml(entry.text)}</div>`
      )
      .join("")
    if (wasAtBottom) {
      container.scrollTop = container.scrollHeight
    }
  },

  renderPublicInfoPanel() {
    const container = this.dom.publicInfoScroll
    if (!container) {
      return
    }

    if (this.publicInfoEntries.length === 0) {
      container.innerHTML = '<div class="public-line intel-empty">暂无公共信息</div>'
      return
    }

    const wasAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 20
    container.innerHTML = this.publicInfoEntries
      .map(
        (entry) =>
          `<div class="public-line public-event"><span class="intel-source">[${escapeHtml(entry.source)}]</span> ${escapeHtml(entry.text)}</div>`
      )
      .join("")
    if (wasAtBottom) {
      container.scrollTop = container.scrollHeight
    }
  },

  updateSidePanels(skillState, itemState, clueCount, occupiedCells, capacity, bidState) {
    this.renderPrivateIntelPanel()
    this.renderPublicInfoPanel()
  }
}

// 兼容层：保持 window.MobaoUi 全局变量可用
window.MobaoUi = window.MobaoUi || {}
window.MobaoUi.PanelsMixin = UiPanelsMixin

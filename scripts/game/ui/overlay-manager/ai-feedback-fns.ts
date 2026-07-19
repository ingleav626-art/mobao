/**
 * @file ai-feedback-fns.ts
 * @module ui/overlay-manager/ai-feedback-fns
 * @description AI 反馈面板操作函数（打开/关闭/渲染/触摸滚动）
 *
 * 复用 ai-memory-fns.ts 的触摸滚动模式；不复用其渲染逻辑，因为反馈数据结构与跨局记忆不同。
 */
import type { UiOverlayManagerDeps } from "../overlay-manager"
import type { UiOverlayManagerState } from "../overlay-manager"
import type { AiFeedbackEntry } from "../../../../types/ai"

/** 打开 AI 反馈面板：从 localStorage 加载最新数据并渲染 */
export function openAiFeedbackPanel(deps: UiOverlayManagerDeps, state: UiOverlayManagerState): void {
  if (!deps.dom.aiFeedbackOverlay) return
  deps.loadAiFeedbacks()
  renderAiFeedbackList(deps)
  if (!state.aiFeedbackTouchBound) {
    state.aiFeedbackTouchBound = true
    setupAiFeedbackTouchScroll(deps)
  }
  deps.dom.aiFeedbackOverlay.classList.remove("hidden")
}

/** 关闭 AI 反馈面板 */
export function closeAiFeedbackPanel(deps: UiOverlayManagerDeps): void {
  if (deps.dom.aiFeedbackOverlay) {
    deps.dom.aiFeedbackOverlay.classList.add("hidden")
  }
}

/** 渲染反馈列表到面板内容区 */
export function renderAiFeedbackList(deps: UiOverlayManagerDeps): void {
  const content = deps.dom.aiFeedbackContent
  if (!content) return
  const list: AiFeedbackEntry[] = deps.getAiFeedbacks()
  if (list.length === 0) {
    content.innerHTML = '<div class="ai-feedback-empty">暂无反馈</div>'
    return
  }
  const colors = ["#c49a3c", "#5a9e5a", "#5a7ebd", "#bd5a7e"]
  const html = list
    .map((entry, idx) => {
      const color = colors[idx % colors.length]
      const date = new Date(entry.timestamp)
      const dateStr = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
      const safeContent = escapeHtml(entry.content)
      const safeName = escapeHtml(entry.playerName)
      return (
        `<div class="ai-feedback-section" style="--section-color:${color}">` +
        `<div class="ai-feedback-section-header">` +
        `<span class="ai-feedback-player">[${entry.playerId}] ${safeName}</span>` +
        `<span class="ai-feedback-meta">第 ${entry.runSerial} 局 · ${dateStr}</span>` +
        `</div>` +
        `<div class="ai-feedback-text">${safeContent}</div>` +
        `<div class="ai-feedback-actions">` +
        `<button class="ai-feedback-delete-btn" data-feedback-id="${entry.id}" type="button">删除此条</button>` +
        `</div>` +
        `</div>`
      )
    })
    .join("")
  content.innerHTML = html
}

/** 删除单条反馈，调用前已在调用方做了确认 */
export function deleteAiFeedback(deps: UiOverlayManagerDeps, id: string): void {
  deps.deleteAiFeedback(id)
  renderAiFeedbackList(deps)
}

/** 清空全部反馈，调用前已在调用方做了确认 */
export function clearAllAiFeedbacks(deps: UiOverlayManagerDeps): void {
  deps.clearAiFeedbacks()
  renderAiFeedbackList(deps)
}

/** 绑定触摸滚动（移动端友好） */
export function setupAiFeedbackTouchScroll(deps: UiOverlayManagerDeps): void {
  const content = deps.dom.aiFeedbackContent
  if (!content) return
  let touchStartY = 0
  let touchStartScrollTop = 0
  content.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length === 1) {
        touchStartY = e.touches[0].clientY
        touchStartScrollTop = content.scrollTop
      }
    },
    { passive: true }
  )
  content.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches.length !== 1) return
      const dy = touchStartY - e.touches[0].clientY
      const maxScroll = content.scrollHeight - content.clientHeight
      if (maxScroll <= 0) return
      content.scrollTop = Math.max(0, Math.min(touchStartScrollTop + dy, maxScroll))
    },
    { passive: true }
  )
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

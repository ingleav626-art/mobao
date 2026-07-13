/**
 * @file ai-reflection-fns.ts
 * @module ui/overlay-manager/ai-reflection-fns
 * @description AI 反思状态 UI 与对话框操作函数
 */
import type { UiOverlayManagerDeps } from "../overlay-manager"

export function updateReflectionStatusUI(deps: UiOverlayManagerDeps): void {
  const el = deps.dom.settleReflectionStatus
  if (!el) return
  if (!deps.shouldShowReflectionUI()) {
    el.classList.add("hidden")
    el.textContent = ""
    el.className = "settle-reflection-status hidden"
    return
  }
  el.classList.remove("hidden", "is-pending", "is-done", "is-timeout", "is-error")
  const detail = deps.getAiReflectionStateDetail() || ""
  const needsSummary =
    deps.isAiMultiGameMemoryEnabled() &&
    typeof deps.shouldGenerateSummary === "function" &&
    deps.shouldGenerateSummary()
  const summaryLabel = needsSummary ? "并总结" : ""
  const progress =
    deps.getAiReflectionTotal() > 1
      ? ` ${deps.getAiReflectionCompleted()}/${deps.getAiReflectionTotal()}`
      : ""
  switch (deps.getAiReflectionState()) {
    case "pending":
      el.classList.add("is-pending")
      el.textContent = `反思${summaryLabel}中${progress}...`
      break
    case "done":
      el.classList.add("is-done")
      el.textContent = `反思${summaryLabel}完成`
      break
    case "timeout":
      el.classList.add("is-timeout")
      el.textContent = `反思${summaryLabel}超时: ${detail}`
      break
    case "error":
      el.classList.add("is-error")
      el.textContent = `反思${summaryLabel}失败: ${detail}`
      break
    default:
      el.classList.add("hidden")
      break
  }
}

export function showReflectionPendingDialog(deps: UiOverlayManagerDeps): void {
  removeReflectionPendingDialog()
  const needsSummary =
    deps.isAiMultiGameMemoryEnabled() &&
    typeof deps.shouldGenerateSummary === "function" &&
    deps.shouldGenerateSummary()
  const actionLabel = needsSummary ? "反思并总结" : "反思"
  const overlay = document.createElement("div")
  overlay.id = "reflectionPendingDialog"
  overlay.style.cssText =
    "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:99999;"
  const box = document.createElement("div")
  box.style.cssText =
    "background:#2a2218;border:2px solid #d4a843;border-radius:12px;padding:24px 32px;text-align:center;color:#e0d0b0;font-size:16px;max-width:380px;"
  box.innerHTML =
    `<div style="margin-bottom:12px;font-size:18px;font-weight:bold;">AI${actionLabel}尚未完成</div>` +
    `<div style="color:#a09070;margin-bottom:16px;">AI正在对本局表现进行${actionLabel}，已完成的结果已保存，未完成的将丢失。</div>` +
    '<div style="display:flex;gap:10px;justify-content:center;">' +
    '<button id="reflectionDialogWait" style="padding:8px 20px;border-radius:6px;border:1px solid #d4a843;background:rgba(212,168,67,0.15);color:#d4a843;cursor:pointer;font-size:14px;">等待完成</button>' +
    '<button id="reflectionDialogSkip" style="padding:8px 20px;border-radius:6px;border:1px solid #8a6a4a;background:rgba(138,106,74,0.15);color:#a09070;cursor:pointer;font-size:14px;">继续游戏</button>' +
    "</div>"
  overlay.appendChild(box)
  document.body.appendChild(overlay)
  const waitBtn = document.getElementById("reflectionDialogWait")
  if (waitBtn) {
    waitBtn.addEventListener("click", () => {
      removeReflectionPendingDialog()
    })
  }
  const skipBtn = document.getElementById("reflectionDialogSkip")
  if (skipBtn) {
    skipBtn.addEventListener("click", () => {
      removeReflectionPendingDialog()
      deps.proceedToNewRun()
    })
  }
}

export function showReflectionPendingDialogForBack(deps: UiOverlayManagerDeps): void {
  removeReflectionPendingDialog()
  const needsSummary =
    deps.isAiMultiGameMemoryEnabled() &&
    typeof deps.shouldGenerateSummary === "function" &&
    deps.shouldGenerateSummary()
  const actionLabel = needsSummary ? "反思并总结" : "反思"
  const overlay = document.createElement("div")
  overlay.id = "reflectionPendingDialog"
  overlay.style.cssText =
    "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:99999;"
  const box = document.createElement("div")
  box.style.cssText =
    "background:#2a2218;border:2px solid #d4a843;border-radius:12px;padding:24px 32px;text-align:center;color:#e0d0b0;font-size:16px;max-width:380px;"
  box.innerHTML =
    `<div style="margin-bottom:12px;font-size:18px;font-weight:bold;">AI${actionLabel}尚未完成</div>` +
    `<div style="color:#a09070;margin-bottom:16px;">AI正在对本局表现进行${actionLabel}，已完成的结果已保存，未完成的将丢失。</div>` +
    '<div style="display:flex;gap:10px;justify-content:center;">' +
    '<button id="reflectionDialogWait" style="padding:8px 20px;border-radius:6px;border:1px solid #d4a843;background:rgba(212,168,67,0.15);color:#d4a843;cursor:pointer;font-size:14px;">等待完成</button>' +
    '<button id="reflectionDialogSkip" style="padding:8px 20px;border-radius:6px;border:1px solid #8a6a4a;background:rgba(138,106,74,0.15);color:#a09070;cursor:pointer;font-size:14px;">直接离开</button>' +
    "</div>"
  overlay.appendChild(box)
  document.body.appendChild(overlay)
  const waitBtn = document.getElementById("reflectionDialogWait")
  if (waitBtn) {
    waitBtn.addEventListener("click", () => {
      removeReflectionPendingDialog()
    })
  }
  const skipBtn = document.getElementById("reflectionDialogSkip")
  if (skipBtn) {
    skipBtn.addEventListener("click", () => {
      removeReflectionPendingDialog()
      deps.proceedToBack()
    })
  }
}

export function removeReflectionPendingDialog(): void {
  const el = document.getElementById("reflectionPendingDialog")
  if (el) el.remove()
}
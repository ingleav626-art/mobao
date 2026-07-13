/**
 * @file lan-dialog-fns.ts
 * @module ui/overlay-manager/lan-dialog-fns
 * @description LAN 联机弹窗操作函数（重开投票/暂停/等待/拒绝）
 */
import type { UiOverlayManagerDeps } from "../overlay-manager"

export function showLanRestartVoteDialog(deps: UiOverlayManagerDeps, hostName: string): void {
  const existing = document.getElementById("lanRestartVoteDialog")
  if (existing) existing.remove()
  const overlay = document.createElement("div")
  overlay.id = "lanRestartVoteDialog"
  overlay.style.cssText =
    "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:99999;"
  const box = document.createElement("div")
  box.style.cssText =
    "background:#2a2218;border:2px solid #d4a843;border-radius:12px;padding:24px 32px;text-align:center;color:#e0d0b0;font-size:16px;max-width:360px;"
  box.innerHTML =
    '<div style="margin-bottom:16px;font-size:18px;font-weight:bold;">' +
    hostName +
    " 发起了重开请求</div>" +
    '<div style="margin-bottom:20px;color:#a09070;">是否同意开始新一局？</div>' +
    '<div style="display:flex;gap:12px;justify-content:center;">' +
    '<button id="lanRestartAccept" style="padding:8px 24px;border-radius:6px;border:1px solid #6a9f5a;background:rgba(106,159,90,0.2);color:#8fd070;cursor:pointer;font-size:14px;">同意</button>' +
    '<button id="lanRestartDecline" style="padding:8px 24px;border-radius:6px;border:1px solid #8a4a3a;background:rgba(180,60,40,0.15);color:#e07060;cursor:pointer;font-size:14px;">拒绝</button>' +
    "</div>"
  overlay.appendChild(box)
  document.body.appendChild(overlay)
  document.getElementById("lanRestartAccept")!.addEventListener("click", () => {
    overlay.remove()
    deps.getLanBridge()?.send({ type: "game:restart-accept" })
    deps.writeLog("已同意重开，等待其他玩家确认...")
  })
  document.getElementById("lanRestartDecline")!.addEventListener("click", () => {
    overlay.remove()
    deps.getLanBridge()?.send({ type: "game:restart-decline" })
    deps.writeLog("已拒绝重开请求")
  })
}

export function removeLanRestartDialog(): void {
  const existing = document.getElementById("lanRestartVoteDialog")
  if (existing) existing.remove()
  const waiting = document.getElementById("lanRestartWaitingDialog")
  if (waiting) waiting.remove()
  const declined = document.getElementById("lanRestartDeclinedDialog")
  if (declined) declined.remove()
}

export function showLanRestartWaitingDialog(deps: UiOverlayManagerDeps): void {
  removeLanRestartDialog()
  const overlay = document.createElement("div")
  overlay.id = "lanRestartWaitingDialog"
  overlay.style.cssText =
    "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:99999;"
  const box = document.createElement("div")
  box.style.cssText =
    "background:#2a2218;border:2px solid #d4a843;border-radius:12px;padding:24px 32px;text-align:center;color:#e0d0b0;font-size:16px;max-width:360px;"
  box.innerHTML =
    '<div style="margin-bottom:12px;font-size:18px;font-weight:bold;">已发送重开请求</div>' +
    '<div style="color:#a09070;">等待其他玩家同意...</div>' +
    '<div style="margin-top:16px;"><span class="lan-waiting-spinner"></span></div>'
  overlay.appendChild(box)
  document.body.appendChild(overlay)
  deps.writeLog("已向所有玩家发送重开请求，等待确认...")
}

export function showLanRestartDeclinedDialog(declinerName: string): void {
  removeLanRestartDialog()
  const overlay = document.createElement("div")
  overlay.id = "lanRestartDeclinedDialog"
  overlay.style.cssText =
    "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:99999;"
  const box = document.createElement("div")
  box.style.cssText =
    "background:#2a2218;border:2px solid #8a4a3a;border-radius:12px;padding:24px 32px;text-align:center;color:#e0d0b0;font-size:16px;max-width:360px;"
  box.innerHTML =
    '<div style="margin-bottom:12px;font-size:18px;font-weight:bold;color:#e07060;">重开请求被拒绝</div>' +
    '<div style="color:#a09070;">' +
    declinerName +
    " 拒绝了重开申请</div>" +
    '<button id="lanRestartDeclinedClose" style="margin-top:16px;padding:8px 24px;border-radius:6px;border:1px solid #8a4a3a;background:rgba(180,60,40,0.15);color:#e07060;cursor:pointer;font-size:14px;">确定</button>'
  overlay.appendChild(box)
  document.body.appendChild(overlay)
  document.getElementById("lanRestartDeclinedClose")!.addEventListener("click", () => {
    overlay.remove()
  })
}

export function showLanPauseOverlay(deps: UiOverlayManagerDeps): void {
  if (!deps.getIsLanMode() || deps.getSettled() || !deps.dom.hud) return
  let overlay = document.getElementById("lanPauseOverlay")
  if (overlay) return
  overlay = document.createElement("div")
  overlay.id = "lanPauseOverlay"
  overlay.style.cssText =
    "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:99998;"
  const box = document.createElement("div")
  box.style.cssText =
    "background:#2a2218;border:2px solid #d4a843;border-radius:12px;padding:28px 36px;text-align:center;color:#e0d0b0;font-size:16px;max-width:360px;"
  const title = document.createElement("div")
  title.style.cssText = "font-size:20px;font-weight:bold;margin-bottom:12px;color:#d4a843;"
  title.textContent = "游戏已暂停"
  box.appendChild(title)
  const hint = document.createElement("div")
  hint.style.cssText = "color:#a09070;margin-bottom:16px;"
  hint.textContent =
    deps.getIsLanMode() && deps.getLanIsHost() ? "点击下方按钮继续游戏" : "等待主机继续游戏..."
  box.appendChild(hint)
  if (deps.getIsLanMode() && deps.getLanIsHost()) {
    const resumeBtn = document.createElement("button")
    resumeBtn.style.cssText =
      "padding:10px 28px;border-radius:6px;border:1px solid #d4a843;background:rgba(212,168,67,0.15);color:#d4a843;cursor:pointer;font-size:15px;font-weight:bold;"
    resumeBtn.textContent = "结束暂停"
    resumeBtn.addEventListener("click", () => {
      deps.toggleRoundPause()
    })
    box.appendChild(resumeBtn)
  }
  overlay.appendChild(box)
  document.body.appendChild(overlay)
}

export function hideLanPauseOverlay(): void {
  const overlay = document.getElementById("lanPauseOverlay")
  if (overlay) overlay.remove()
}
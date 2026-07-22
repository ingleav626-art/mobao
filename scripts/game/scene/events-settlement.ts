/**
 * @file scripts/game/scene/events-settlement.ts
 * @module scene/events-settlement
 * @description 结算页事件绑定。绑定结算按钮、返回大厅、重开一局、
 *              藏品跳过揭示、角色技能按钮等事件监听器。
 *
 * @exports bindSettlementEvents - 结算页事件绑定函数
 */
import type { WarehouseSceneThis } from "../../../types/warehouse-scene-this"

export function bindSettlementEvents(this: WarehouseSceneThis): void {
  this.bindCharacterSkillButton()
  this.dom.settleBtn?.addEventListener("click", () => this.settleCurrentRun())
  this.dom.settleBackBtn?.addEventListener("click", () => {
    if (this.aiReflectionManager.shouldShowReflectionUI() && this.aiReflectionState === "pending") {
      this.uiOverlayManager.showReflectionPendingDialogForBack()
      return
    }
    this.exitSettlementPage()
    if (this.battleRecordReplayActive) {
      this.battleRecordReplayActive = false
      this.battleRecordReplayRecordId = null
      this.enterLobby()
      setTimeout(() => {
        this.openBattleRecordPanel()
        this.aiDecisionManager.writeLog("已返回战绩列表，可继续选择其他战绩回放。")
      }, 100)
      return
    }
    if (this.isLanMode) {
      this.enterLanRoom()
    } else {
      this.enterLobby()
    }
  })
  this.dom.settleReplayBtn?.addEventListener("click", () => {
    if (this.aiReflectionManager.shouldShowReflectionUI() && this.aiReflectionState === "pending") {
      this.uiOverlayManager.showReflectionPendingDialog()
      return
    }
    if (this.isLanMode) {
      if (this.lanIsHost) {
        const aiCount = this.lanAiPlayers ? this.lanAiPlayers.length : 0
        const aiPlayers = (this.lanAiPlayers || []).map((ai) => ({
          id: ai.id,
          name: ai.name,
          isAI: true,
          isHost: false,
          llm: !!ai.llm
        }))
        this.lanBridge?.send({ type: "game:restart-request", aiCount, aiLlmEnabled: this.lanAiLlmEnabled, aiPlayers })
        this.uiOverlayManager.showLanRestartWaitingDialog()
      } else {
        this.aiDecisionManager.writeLog("等待主机发起重开请求...")
      }
    } else {
      this.aiReflectionManager.proceedToNewRun()
    }
  })

  if (this.dom.previewCloseBtn) {
    this.dom.previewCloseBtn?.addEventListener("click", () => this.hidePreview())
  }
  this.setupPreviewTouchScroll()
  this.dom.previewCategorySelect?.addEventListener("change", () => {
    if (this.selectedItem) {
      this.renderPreviewCandidates(this.selectedItem)
    }
  })
}

/**
 * @file scripts/game/scene/events-battle-record.ts
 * @module scene/events-battle-record
 * @description 战绩面板事件绑定。绑定战绩面板开关、记录点击、回放控制等事件监听器。
 *
 * @exports bindBattleRecordEvents - 战绩事件绑定函数
 */
import type { WarehouseSceneThis } from "../../../types/warehouse-scene-this"

export function bindBattleRecordEvents(this: WarehouseSceneThis): void {
  if (this.dom.battleRecordCloseBtn) {
    this.dom.battleRecordCloseBtn?.addEventListener("click", () => this.closeBattleRecordPanel())
  }
  if (this.dom.battleRecordOverlay) {
    this.dom.battleRecordOverlay?.addEventListener("click", (event) => {
      if (event.target === this.dom.battleRecordOverlay) {
        this.closeBattleRecordPanel()
      }
    })
  }
  if (this.dom.battleRecordContent) {
    this.dom.battleRecordContent?.addEventListener("click", (event) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) {
        return
      }
      const replayButton = target.closest("button[data-record-id]")
      if (replayButton instanceof HTMLButtonElement) {
        const recordId = replayButton.dataset.recordId
        if (recordId) {
          this.openBattleRecordReplay(recordId)
        }
        return
      }

      const logButton = target.closest("button[data-record-log-id]")
      if (logButton instanceof HTMLButtonElement) {
        const recordId = logButton.dataset.recordLogId
        if (recordId) {
          this.openBattleRecordLogs(recordId, 1)
        }
        return
      }

      if (target.closest("button[data-log-close]")) {
        this.closeBattleRecordLogs()
        return
      }

      if (target.closest("button[data-log-prev]")) {
        const recordId = this.battleRecordLogView && this.battleRecordLogView.recordId
        const page = Math.max(
          1,
          Math.round(Number((this.battleRecordLogView && this.battleRecordLogView.page) || 1)) - 1
        )
        if (recordId) {
          this.openBattleRecordLogs(recordId, page)
        }
        return
      }

      if (target.closest("button[data-log-next]")) {
        const recordId = this.battleRecordLogView && this.battleRecordLogView.recordId
        const page = Math.max(
          1,
          Math.round(Number((this.battleRecordLogView && this.battleRecordLogView.page) || 1)) + 1
        )
        if (recordId) {
          this.openBattleRecordLogs(recordId, page)
        }
        return
      }

      const deleteButton = target.closest("button[data-delete-record-id]")
      if (deleteButton instanceof HTMLButtonElement) {
        const recordId = deleteButton.dataset.deleteRecordId
        if (recordId) {
          this.deleteBattleRecord(recordId)
        }
      }
    })
  }
}

import { defineStore } from "pinia"
import type { IntelEntry } from "../../game/ui/panels"

export const usePanelsStore = defineStore("panels", {
  state: () => ({
    /** 私有情报条目列表（玩家探查结果、AI 思考日志） */
    privateIntelEntries: [] as IntelEntry[],
    /** 公共信息条目列表（公共事件、AI 出价公开信息） */
    publicInfoEntries: [] as IntelEntry[],
    /** 面板是否可见 */
    isPanelVisible: true
  }),

  actions: {
    /** 添加一条私有情报 */
    addPrivateIntel(entry: IntelEntry): void {
      this.privateIntelEntries.push(entry)
    },

    /** 添加一条公共信息 */
    addPublicInfo(entry: IntelEntry): void {
      this.publicInfoEntries.push(entry)
    },

    /** 同步整个私有情报数组（替换式，用于桥接同步） */
    syncPrivateIntelEntries(entries: IntelEntry[]): void {
      this.privateIntelEntries = [...entries]
    },

    /** 同步整个公共信息数组（替换式，用于桥接同步） */
    syncPublicInfoEntries(entries: IntelEntry[]): void {
      this.publicInfoEntries = [...entries]
    },

    /** 清空所有条目 */
    clearEntries(): void {
      this.privateIntelEntries = []
      this.publicInfoEntries = []
    },

    /** 更新面板可见性 */
    updateVisibility(visible: boolean): void {
      this.isPanelVisible = visible
    }
  }
})

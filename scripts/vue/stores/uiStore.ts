import { defineStore } from "pinia"

export const useUiStore = defineStore("ui", {
  state: () => ({
    // 面板开关
    settingsOpen: false,
    battleRecordOpen: false,
    collectionOpen: false,
    shopOpen: false,
    aiLogicOpen: false,
    aiMemoryOpen: false,
    itemDrawerOpen: false,
    bidKeypadOpen: false,

    // 当前页面
    currentPage: "lobby" as "lobby" | "game" | "settlement",

    // 设置
    settingsInitialValues: "",
    gameConfirmCallback: null as (() => void) | null,
    gameCancelCallback: null as (() => void) | null,

    // 确认对话框状态
    confirmMessage: "",
    confirmVisible: false,
    confirmCallback: null as (() => void) | null,
    cancelCallback: null as (() => void) | null,

    // 信息弹窗状态
    infoPopupTitle: "",
    infoPopupContent: "",
    infoPopupVisible: false
  }),

  actions: {
    showConfirm(message: string, onConfirm: () => void, onCancel?: () => void): void {
      this.confirmMessage = message
      this.confirmCallback = onConfirm
      this.cancelCallback = onCancel ?? null
      this.confirmVisible = true
    },

    hideConfirm(): void {
      this.confirmVisible = false
      this.confirmMessage = ""
      this.confirmCallback = null
      this.cancelCallback = null
    },

    showInfoPopup(title: string, content: string): void {
      this.infoPopupTitle = title
      this.infoPopupContent = content
      this.infoPopupVisible = true
    },

    hideInfoPopup(): void {
      this.infoPopupVisible = false
      this.infoPopupTitle = ""
      this.infoPopupContent = ""
    }
  }
})

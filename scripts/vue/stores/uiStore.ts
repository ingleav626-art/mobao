import { defineStore } from 'pinia'

export const useUiStore = defineStore('ui', {
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
  }),

  actions: {
    // Phase 2 填充
  },
})
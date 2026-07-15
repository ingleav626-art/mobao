import { defineStore } from "pinia"
import type { BattleRecord } from "../../game/bridge/battle-record/types"
import { BATTLE_RECORD_STORAGE_KEY } from "../../game/core/constants"

function loadRecordsFromStorage(): BattleRecord[] {
  const raw = window.localStorage.getItem(BATTLE_RECORD_STORAGE_KEY)
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as BattleRecord[]
  } catch {
    return []
  }
}

function saveRecordsToStorage(records: BattleRecord[]): void {
  window.localStorage.setItem(BATTLE_RECORD_STORAGE_KEY, JSON.stringify(records.slice(0, 20)))
}

export const useBattleRecordStore = defineStore("battleRecord", {
  state: () => ({
    records: [] as BattleRecord[],
    isOpen: false,
    selectedRecord: null as BattleRecord | null,
    logViewPage: 1,
    logViewRecordId: null as string | null
  }),

  actions: {
    openPanel(): void {
      this.isOpen = true
      this.loadRecords()
    },

    closePanel(): void {
      this.isOpen = false
      this.logViewRecordId = null
      this.logViewPage = 1
      this.selectedRecord = null
    },

    selectRecord(record: BattleRecord | null): void {
      this.selectedRecord = record
    },

    openLogs(recordId: string, page = 1): void {
      this.logViewRecordId = recordId
      this.logViewPage = page
    },

    closeLogs(): void {
      this.logViewRecordId = null
      this.logViewPage = 1
    },

    deleteRecord(recordId: string): void {
      this.records = this.records.filter((r) => r.id !== recordId)
      saveRecordsToStorage(this.records)
    },

    loadRecords(): void {
      this.records = loadRecordsFromStorage()
    },

    syncRecords(records: BattleRecord[]): void {
      this.records = records
    }
  }
})

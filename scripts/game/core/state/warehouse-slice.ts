import type { Artifact } from "../../../../types/game"

export interface WarehouseSlice {
  items: Artifact[]
  revealedCells: unknown[]
  deepSeekTesting: boolean
}

export function createWarehouseSlice(): WarehouseSlice {
  return {
    items: [],
    revealedCells: [],
    deepSeekTesting: false
  }
}

export function reset(s: WarehouseSlice): void {
  s.items = []
  s.revealedCells = []
  s.deepSeekTesting = false
}
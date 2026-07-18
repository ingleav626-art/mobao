import { describe, it } from "vitest"
import { ITEM_DEFS, getItemQuality } from "../../../scripts/game/data/items"

describe("品质表", () => {
  it("打印各品质道具列表", () => {
    const labels: Record<string, string> = {
      common: "普通", fine: "精品", rare: "稀有", epic: "史诗", legendary: "传说"
    }
    const byQ: Record<string, string[]> = { common: [], fine: [], rare: [], epic: [], legendary: [] }
    for (const d of ITEM_DEFS) {
      const q = getItemQuality(d.id)
      if (byQ[q]) byQ[q].push(d.name)
    }
    console.log("\n========== 道具品质一览表 ==========")
    for (const q of ["common", "fine", "rare", "epic", "legendary"]) {
      console.log(`\n【${labels[q]}】（${byQ[q].length} 种）`)
      for (const n of byQ[q]) {
        console.log(`  ${n}`)
      }
    }
    console.log("\n===================================")
  })
})

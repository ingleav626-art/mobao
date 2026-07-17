import { describe, it, expect, vi } from "vitest"
import { applyUse, resetEntries } from "../../../scripts/game/data/def-manager-helpers"
import type { DefEntry, UseHelperConfig } from "../../../scripts/game/data/def-manager-helpers"

function makeEntry(overrides: Partial<DefEntry> = {}): DefEntry {
  return {
    id: "entry-1",
    name: "测试条目",
    execute: () => ({ ok: true, revealed: 1, message: "执行成功" }),
    ...overrides
  }
}

function makeConfig<T extends DefEntry>(overrides: Partial<UseHelperConfig<T>> = {}): UseHelperConfig<T> {
  return {
    entries: [],
    getRemaining: () => 1,
    setRemaining: () => {},
    notFoundMessage: () => "未找到条目",
    depletedMessage: () => "条目已耗尽",
    ...overrides
  } as UseHelperConfig<T>
}

describe("applyUse", () => {
  it("条目存在且剩余>0 时执行成功并扣减剩余次数，message 来自 execute", () => {
    const entry = makeEntry()
    const setRemaining = vi.fn()
    const config = makeConfig({
      entries: [entry],
      getRemaining: () => 2,
      setRemaining
    })

    const result = applyUse("entry-1", {}, config)

    expect(result.ok).toBe(true)
    expect(result.revealed).toBe(1)
    // message 来自 entry.execute()，不再被 applyUse 覆盖
    expect(result.message).toBe("执行成功")
    expect(setRemaining).toHaveBeenCalledWith(entry, 1)
  })

  it("条目不存在时返回 notFoundMessage", () => {
    const config = makeConfig({
      entries: [makeEntry()],
      notFoundMessage: () => "目标不存在"
    })

    const result = applyUse("unknown", {}, config)

    expect(result.ok).toBe(false)
    expect(result.revealed).toBe(0)
    expect(result.message).toBe("目标不存在")
  })

  it("剩余=0 时返回 depletedMessage 且不调用 execute", () => {
    const execute = vi.fn(() => ({ ok: true, revealed: 1, message: "执行成功" }))
    const entry = makeEntry({ execute })
    const config = makeConfig({
      entries: [entry],
      getRemaining: () => 0,
      depletedMessage: (e) => `${e.name} 已用完`
    })

    const result = applyUse("entry-1", {}, config)

    expect(result.ok).toBe(false)
    expect(result.revealed).toBe(0)
    expect(result.message).toBe("测试条目 已用完")
    expect(execute).not.toHaveBeenCalled()
  })

  it("剩余为负时视为已耗尽且不调用 execute", () => {
    const execute = vi.fn(() => ({ ok: true, revealed: 1, message: "执行成功" }))
    const entry = makeEntry({ execute })
    const config = makeConfig({
      entries: [entry],
      getRemaining: () => -1,
      depletedMessage: () => "剩余次数不足"
    })

    const result = applyUse("entry-1", {}, config)

    expect(result.ok).toBe(false)
    expect(result.message).toBe("剩余次数不足")
    expect(execute).not.toHaveBeenCalled()
  })

  it("execute 返回 !ok 时返回失败信息且不扣减剩余", () => {
    const entry = makeEntry({
      execute: () => ({ ok: false, revealed: 0, message: "无可用目标" })
    })
    const setRemaining = vi.fn()
    const config = makeConfig({
      entries: [entry],
      getRemaining: () => 1,
      setRemaining
    })

    const result = applyUse("entry-1", {}, config)

    expect(result.ok).toBe(false)
    expect(result.revealed).toBe(0)
    expect(result.message).toBe("无可用目标")
    expect(setRemaining).not.toHaveBeenCalled()
  })

  it("execute 返回 ok 时 message 透传", () => {
    const entry = makeEntry({
      execute: () => ({ ok: true, revealed: 3, message: "揭示3件" })
    })
    const config = makeConfig({
      entries: [entry],
      getRemaining: () => 2
    })

    const result = applyUse("entry-1", {}, config)

    expect(result.ok).toBe(true)
    expect(result.revealed).toBe(3)
    expect(result.message).toBe("揭示3件")
  })

  it("传入的 context 被透传给 execute", () => {
    const context = { round: 5, player: "p1" }
    const execute = vi.fn(() => ({ ok: true, revealed: 1, message: "ok" }))
    const entry = makeEntry({ execute })
    const config = makeConfig({
      entries: [entry],
      getRemaining: () => 1
    })

    applyUse("entry-1", context, config)

    expect(execute).toHaveBeenCalledWith(context)
  })

  it("连续使用多次逐步扣减剩余次数", () => {
    let remaining = 3
    const entry = makeEntry()
    const getRemaining = vi.fn(() => remaining)
    const setRemaining = vi.fn((_, v) => { remaining = v })
    const config = makeConfig({
      entries: [entry],
      getRemaining,
      setRemaining
    })

    const r1 = applyUse("entry-1", {}, config)
    expect(r1.ok).toBe(true)
    expect(remaining).toBe(2)

    const r2 = applyUse("entry-1", {}, config)
    expect(r2.ok).toBe(true)
    expect(remaining).toBe(1)

    const r3 = applyUse("entry-1", {}, config)
    expect(r3.ok).toBe(true)
    expect(remaining).toBe(0)

    const r4 = applyUse("entry-1", {}, config)
    expect(r4.ok).toBe(false)
    expect(r4.message).toContain("耗尽")
  })

  it("数据类道具应保留 execute 返回的原始 message，不覆盖为通用文案", () => {
    // bug: applyUse 第 58 行永远覆盖为 "${name} 生效，揭示 N 件目标。"
    // 对于均价/加成等非揭示类道具，revealed=0 且 message 含计算结果，覆盖就丢了数据
    const entry = makeEntry({
      name: "双格均价仪",
      execute: () => ({ ok: true, revealed: 0, message: "双格均价：8500" })
    })
    const config = makeConfig({
      entries: [entry],
      getRemaining: () => 2
    })

    const result = applyUse("entry-1", {}, config)
    expect(result.ok).toBe(true)
    // 应保留原始计算结果而非通用文案
    expect(result.message).toBe("双格均价：8500")
  })
})

describe("resetEntries", () => {
  it("将所有条目重置为上限值", () => {
    const entries = [
      makeEntry({ id: "a" }),
      makeEntry({ id: "b" })
    ]
    const setRemaining = vi.fn()

    resetEntries(entries, () => 5, setRemaining)

    expect(setRemaining).toHaveBeenCalledTimes(2)
    expect(setRemaining).toHaveBeenCalledWith(entries[0], 5)
    expect(setRemaining).toHaveBeenCalledWith(entries[1], 5)
  })

  it("空数组不做任何操作", () => {
    const setRemaining = vi.fn()

    resetEntries([], () => 5, setRemaining)

    expect(setRemaining).not.toHaveBeenCalled()
  })

  it("不同条目使用不同的上限值", () => {
    const entries = [
      makeEntry({ id: "a" }),
      makeEntry({ id: "b" }),
      makeEntry({ id: "c" })
    ]
    const setRemaining = vi.fn()
    const getMax = (entry: DefEntry) => {
      if (entry.id === "a") return 3
      if (entry.id === "b") return 5
      return 1
    }

    resetEntries(entries, getMax, setRemaining)

    expect(setRemaining).toHaveBeenCalledWith(entries[0], 3)
    expect(setRemaining).toHaveBeenCalledWith(entries[1], 5)
    expect(setRemaining).toHaveBeenCalledWith(entries[2], 1)
  })
})
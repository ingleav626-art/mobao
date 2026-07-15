/**
 * @file data/def-manager-helpers.ts
 * @module data/def-manager-helpers
 * @description ItemManager 与 SkillManager 共享的 use/reset helper。
 *              提取两 Manager 中逐行同构的 use 流程（find->不存在->depleted->execute->!ok 短路->扣减->成功消息）
 *              与 reset 流程（forEach 置剩余=上限），通过配置对象驱动字段访问与文案差异，
 *              保持两 Manager 对外接口（方法签名、公开字段、onNewRound 非对称）零改动。
 *
 *              这两个 helper 有副作用（修改条目对象的剩余次数字段），不符合 pure.ts 纯函数约定，
 *              与 core/skill-item-manager.ts 中 useAction（同样非纯）的定位一致。
 */

export interface DefEntry {
  id: string
  name: string
  execute: (context: unknown) => { ok: boolean; revealed: number; message: string }
}

export interface RevealResult {
  ok: boolean
  revealed: number
  message: string
}

export interface UseHelperConfig<T extends DefEntry> {
  /** 条目数组（会被原地读取/修改） */
  entries: T[]
  /** 读取剩余次数 */
  getRemaining: (entry: T) => number
  /** 写入剩余次数 */
  setRemaining: (entry: T, value: number) => void
  /** id 未找到时的文案 */
  notFoundMessage: () => string
  /** 剩余耗尽时的文案 */
  depletedMessage: (entry: T) => string
}

/** 统一 use 流程：find->不存在->depleted->execute->!ok 短路->扣减->成功消息。剩余耗尽时不调用 execute。 */
export function applyUse<T extends DefEntry>(id: string, context: unknown, config: UseHelperConfig<T>): RevealResult {
  const entry = config.entries.find((e) => e.id === id)
  if (!entry) {
    return { ok: false, revealed: 0, message: config.notFoundMessage() }
  }

  if (config.getRemaining(entry) <= 0) {
    return { ok: false, revealed: 0, message: config.depletedMessage(entry) }
  }

  const revealResult = entry.execute(context)
  if (!revealResult.ok) {
    return { ok: false, revealed: 0, message: revealResult.message || "揭示失败" }
  }

  config.setRemaining(entry, config.getRemaining(entry) - 1)
  return {
    ok: true,
    revealed: revealResult.revealed,
    message: `${entry.name} 生效，揭示 ${revealResult.revealed} 件目标。`
  }
}

/** 统一 reset 流程：遍历条目，将剩余次数重置为上限值。 */
export function resetEntries<T extends DefEntry>(
  entries: T[],
  getMax: (entry: T) => number,
  setRemaining: (entry: T, value: number) => void
): void {
  entries.forEach((entry) => {
    setRemaining(entry, getMax(entry))
  })
}

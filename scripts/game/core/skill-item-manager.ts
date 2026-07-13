/**
 * @file scripts/game/core/skill-item-manager.ts
 * @module core/skill-item-manager
 * @description 技能/道具使用管理 Mixin。处理技能道具的使用、扣减、角色加成、
 *              动作状态管理，以及道具描述和标签解析。包含可独立测试的纯函数。
 *
 * @requires data/character-system - getOutlineBonus, getQualityBonus, getOutlineSortStrategy
 * @requires bridge/shop - MobaoShopBridge
 * @requires data/skills - SKILL_DEFS
 * @requires data/items - ITEM_DEFS
 * @requires ./settings - GAME_SETTINGS
 * @exports SkillItemManagerMixin - 技能/道具管理 Mixin
 * @exports 纯函数 - getItemInfo, getPlayerActionId, consumeActionState, wrapContextWithCharacterBonus
 */
import type { WarehouseSceneThis } from '../../../types/warehouse-scene-this'
import type { SkillContext } from '../../../types/game'

import { SKILL_DEFS } from "../data/skills"
import { ITEM_DEFS } from "../data/items"
import { GAME_SETTINGS } from "./settings"

// ─── 独立函数（可独立测试）───

type DefEntry = { id: string; name: string; description: string }

export function getItemInfo(
  itemId: string,
  itemDefs: DefEntry[] = ITEM_DEFS,
  skillDefs: DefEntry[] = SKILL_DEFS
): { label: string; tip: string } {
  const itemDef = itemDefs.find((d) => d.id === itemId)
  if (itemDef) return { label: itemDef.name, tip: itemDef.description }
  const skillDef = skillDefs.find((d) => d.id === itemId)
  if (skillDef) return { label: skillDef.name, tip: skillDef.description }
  return { label: "未知道具", tip: "未知道具：暂无说明。" }
}

export function getPlayerActionId(isLanMode: boolean, lanMySlotId: string | null): string {
  return isLanMode ? (lanMySlotId || "p2") : "p2"
}

export function consumeActionState(
  round: number,
  actionsLeft: number,
  actionType: string,
  maxRounds: number = GAME_SETTINGS.maxRounds
): { allowed: boolean; message?: string } {
  if (round > maxRounds) {
    return { allowed: false, message: "所有回合已结束，请重新随机开局。" }
  }
  if (actionsLeft <= 0) {
    return { allowed: false, message: `本回合行动次数已耗尽，无法继续使用${actionType}。` }
  }
  return { allowed: true }
}

export function wrapContextWithCharacterBonus(
  context: SkillContext,
  outlineBonus: number,
  qualityBonus: number,
  sortStrategy: string | null
): SkillContext {
  if (outlineBonus <= 0 && qualityBonus <= 0 && !sortStrategy) {
    return context
  }
  return {
    revealOutline: (opts) =>
      context.revealOutline({
        ...opts,
        count: ((opts.count as number) || 0) + outlineBonus,
        sortStrategy: opts.sortStrategy || sortStrategy
      }),
    revealQuality: (opts) =>
      context.revealQuality({
        ...opts,
        count: ((opts.count as number) || 0) + qualityBonus,
        sortStrategy: opts.sortStrategy || sortStrategy
      }),
    revealAll: (opts) =>
      context.revealAll({ ...opts, sortStrategy: opts.sortStrategy || sortStrategy || "" })
  }
}

// ─── Mixin 薄代理（Phase 2：代理到 SkillItemManager，向后兼容 Object.assign 混入）───

export const SkillItemManagerMixin: ThisType<WarehouseSceneThis> = {
  useSkill(skillId: string): void {
    this.skillItemManager.useSkill(skillId)
  },

  useItem(itemId: string): void {
    this.skillItemManager.useItem(itemId)
  },

  consumeAction(actionType: string): boolean {
    return this.skillItemManager.consumeAction(actionType)
  },

  getItemInfo(itemId: string): { label: string; tip: string } {
    return this.skillItemManager.getItemInfo(itemId)
  }
}

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

import { getOutlineBonus, getQualityBonus, getOutlineSortStrategy } from "../data/character-system"
import { MobaoShopBridge } from "../bridge/shop"
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

// ─── 内部 helper（useSkill/useItem 共享逻辑，有副作用，非纯函数）───

type ActionManager = { use(id: string, ctx: unknown): { ok: boolean; message: string } }

interface UseActionOptions {
  /** 管理器（skillManager / itemManager） */
  manager: ActionManager
  /** 定义表（SKILL_DEFS / ITEM_DEFS） */
  defs: DefEntry[]
  /** 技能/道具 id */
  actionId: string
  /** consumeActionState 提示用的中文标签（"技能" / "道具"） */
  actionLabel: string
  /** LAN 消息的 actionType（"skill" / "item"） */
  lanActionType: string
  /** 定义缺失时的回退文案（"技能效果" / "道具效果"） */
  fallbackText: string
  /** 是否在各退出点关闭道具抽屉（useItem 为 true） */
  closeDrawer: boolean
  /** 使用成功后的额外副作用（道具：MobaoShopBridge.consumeItem） */
  onAfterUse?: (actionId: string) => void
}

function useAction(self: WarehouseSceneThis, options: UseActionOptions): void {
  const { manager, defs, actionId, actionLabel, lanActionType, fallbackText, closeDrawer, onAfterUse } = options

  if (!self.canUseIntelActions()) {
    if (closeDrawer) self.closeItemDrawer()
    return
  }

  const check = consumeActionState(self.round, self.actionsLeft, actionLabel)
  if (!check.allowed) {
    self.writeLog(check.message!)
    if (closeDrawer) self.closeItemDrawer()
    return
  }
  self.actionsLeft -= 1

  let context = self.buildSkillContext()
  if (getOutlineBonus) {
    const outlineBonus = getOutlineBonus()
    const qualityBonus = getQualityBonus()
    const sortStrategy = getOutlineSortStrategy()
    context = wrapContextWithCharacterBonus(context, outlineBonus, qualityBonus, sortStrategy)
  }
  const result = manager.use(actionId, context)
  if (!result.ok) {
    self.actionsLeft += 1
    self.writeLog(result.message)
    self.updateHud()
    if (closeDrawer) self.closeItemDrawer()
    return
  }

  if (onAfterUse) {
    onAfterUse(actionId)
  }

  const playerActionId = getPlayerActionId(self.isLanMode, self.lanMySlotId)
  self.recordPlayerUsage(playerActionId, actionId)
  const def = defs.find((d) => d.id === actionId)
  self.addPrivateIntelEntry({
    source: def ? def.name : actionId,
    text: def ? def.description : fallbackText
  })
  self.writeLog(result.message)
  self.updateHud()
  if (closeDrawer) self.closeItemDrawer()
  if (self.isLanMode && self.lanBridge) {
    self.lanBridge.send({
      type: "lan:player-action",
      playerId: self.lanBridge.playerId,
      playerName: self.players.find((p) => p.id === playerActionId)?.name || "玩家",
      actionId,
      actionType: lanActionType,
      itemName: def ? def.name : actionId
    })
  }
}

// ─── Mixin 薄包装（向后兼容）───

export const SkillItemManagerMixin: Record<string, Function> = {
  useSkill(this: WarehouseSceneThis, skillId: string) {
    useAction(this, {
      manager: this.skillManager,
      defs: SKILL_DEFS,
      actionId: skillId,
      actionLabel: "技能",
      lanActionType: "skill",
      fallbackText: "技能效果",
      closeDrawer: false
    })
  },

  useItem(this: WarehouseSceneThis, itemId: string) {
    useAction(this, {
      manager: this.itemManager,
      defs: ITEM_DEFS,
      actionId: itemId,
      actionLabel: "道具",
      lanActionType: "item",
      fallbackText: "道具效果",
      closeDrawer: true,
      onAfterUse: (id) => {
        if (MobaoShopBridge) {
          MobaoShopBridge.consumeItem(id)
        }
      }
    })
  },

  consumeAction(this: WarehouseSceneThis, actionType: string) {
    const check = consumeActionState(this.round, this.actionsLeft, actionType)
    if (!check.allowed) {
      this.writeLog(check.message!)
      return false
    }
    this.actionsLeft -= 1
    return true
  },

  getItemInfo(itemId: string) {
    return getItemInfo(itemId)
  }
}

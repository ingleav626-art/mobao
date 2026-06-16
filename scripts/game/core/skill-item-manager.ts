import type { WarehouseSceneThis } from '../../../types/warehouse-scene-this'

/**
 * @file skill-item-manager.js
 * @module core/skill-item-manager
 * @description 技能与道具使用管理。处理技能/道具的消耗、执行、效果记录和联机通知。
 *              所有方法通过 Mixin 混入 WarehouseScene，操作 this 上的状态和 DOM。
 *
 * 核心方法：
 *   - useSkill: 使用技能，处理角色加成和联机通知
 *   - useItem: 使用道具，处理角色加成、商店同步和联机通知
 *   - consumeAction: 消耗行动次数
 *   - getItemInfo: 获取道具/技能的名称和描述
 *
 * @requires window.CharacterSystem - 角色系统（技能/道具加成）
 * @requires window.MobaoShopBridge - 商店桥接（道具消耗同步）
 * @requires SKILL_DEFS - 技能定义（全局）
 * @requires ITEM_DEFS - 道具定义（全局）
 *
 * @exports SkillItemManagerMixin - 技能与道具使用管理 Mixin
 */

import { getOutlineBonus, getQualityBonus, getOutlineSortStrategy } from "../data/character-system"
import { MobaoShopBridge } from "../bridge/shop"
import { SKILL_DEFS } from "../data/skills"
import { ITEM_DEFS } from "../data/items"
import { GAME_SETTINGS } from "./settings"

export const SkillItemManagerMixin: Record<string, Function> = {
  useSkill(skillId: string) {
    if (!(this as unknown as { canUseIntelActions(): boolean }).canUseIntelActions()) {
      return
    }

    if (!(this as unknown as { consumeAction(actionType: string): boolean }).consumeAction("技能")) {
      return
    }

    let context = (this as unknown as { buildSkillContext(): { revealOutline(opts: Record<string, unknown>): void; revealQuality(opts: Record<string, unknown>): void; revealAll(opts: Record<string, unknown>): void } }).buildSkillContext()
    if (getOutlineBonus) {
      const outlineBonus = getOutlineBonus()
      const qualityBonus = getQualityBonus()
      const sortStrategy = getOutlineSortStrategy()
      if (outlineBonus > 0 || qualityBonus > 0 || sortStrategy) {
        const baseContext = context
        context = {
          revealOutline: (opts: Record<string, unknown>) =>
            baseContext.revealOutline({
              ...opts,
              count: ((opts.count as number) || 0) + outlineBonus,
              sortStrategy: opts.sortStrategy || sortStrategy
            }),
          revealQuality: (opts: Record<string, unknown>) =>
            baseContext.revealQuality({
              ...opts,
              count: ((opts.count as number) || 0) + qualityBonus,
              sortStrategy: opts.sortStrategy || sortStrategy
            }),
          revealAll: (opts: Record<string, unknown>) => baseContext.revealAll({ ...opts, sortStrategy: opts.sortStrategy || sortStrategy })
        }
      }
    }
    const result = (this as unknown as { skillManager: { use(id: string, ctx: unknown): { ok: boolean; message: string } } }).skillManager.use(skillId, context)
    if (!result.ok) {
      (this as unknown as { actionsLeft: number }).actionsLeft += 1;
      (this as unknown as { writeLog(msg: string): void }).writeLog(result.message);
      (this as unknown as { updateHud(): void }).updateHud()
      return
    }

    (this as unknown as { recordPlayerUsage(playerId: string, itemId: string): void }).recordPlayerUsage((this as unknown as { isLanMode: boolean; lanMySlotId: string }).isLanMode ? (this as unknown as { lanMySlotId: string }).lanMySlotId : "p2", skillId);
    const skillDef = SKILL_DEFS.find((s: { id: string; name: string; description: string }) => s.id === skillId);
    (this as unknown as { addPrivateIntelEntry(entry: { source: string; text: string }): void }).addPrivateIntelEntry({
      source: skillDef ? skillDef.name : skillId,
      text: skillDef ? skillDef.description : "技能效果"
    });
    (this as unknown as { writeLog(msg: string): void }).writeLog(result.message);
    (this as unknown as { updateHud(): void }).updateHud()
    if ((this as unknown as { isLanMode: boolean; lanBridge: { send(msg: unknown): void; playerId: string } }).isLanMode && (this as unknown as { lanBridge: { send(msg: unknown): void; playerId: string } }).lanBridge) {
      (this as unknown as { lanBridge: { send(msg: unknown): void; playerId: string } }).lanBridge.send({
        type: "lan:player-action",
        playerId: (this as unknown as { lanBridge: { send(msg: unknown): void; playerId: string } }).lanBridge.playerId,
        playerName: (this as unknown as { players: Array<{ id: string; name: string }> }).players.find((p: { id: string; name: string }) => p.id === ((this as unknown as { lanMySlotId: string }).lanMySlotId || "p2"))?.name || "玩家",
        actionId: skillId,
        actionType: "skill",
        itemName: skillDef ? skillDef.name : skillId
      })
    }
  },

  useItem(itemId: string) {
    if (!(this as unknown as { canUseIntelActions(): boolean }).canUseIntelActions()) {
      (this as unknown as { closeItemDrawer(): void }).closeItemDrawer()
      return
    }

    if (!(this as unknown as { consumeAction(actionType: string): boolean }).consumeAction("道具")) {
      (this as unknown as { closeItemDrawer(): void }).closeItemDrawer()
      return
    }

    let itemContext = (this as unknown as { buildSkillContext(): { revealOutline(opts: Record<string, unknown>): void; revealQuality(opts: Record<string, unknown>): void; revealAll(opts: Record<string, unknown>): void } }).buildSkillContext()
    if (getOutlineBonus) {
      const outlineBonus = getOutlineBonus()
      const qualityBonus = getQualityBonus()
      const sortStrategy = getOutlineSortStrategy()
      if (outlineBonus > 0 || qualityBonus > 0 || sortStrategy) {
        const baseItemContext = itemContext
        itemContext = {
          revealOutline: (opts: Record<string, unknown>) =>
            baseItemContext.revealOutline({
              ...opts,
              count: ((opts.count as number) || 0) + outlineBonus,
              sortStrategy: opts.sortStrategy || sortStrategy
            }),
          revealQuality: (opts: Record<string, unknown>) =>
            baseItemContext.revealQuality({
              ...opts,
              count: ((opts.count as number) || 0) + qualityBonus,
              sortStrategy: opts.sortStrategy || sortStrategy
            }),
          revealAll: (opts: Record<string, unknown>) => baseItemContext.revealAll({ ...opts, sortStrategy: opts.sortStrategy || sortStrategy })
        }
      }
    }
    const result = (this as unknown as { itemManager: { use(id: string, ctx: unknown): { ok: boolean; message: string } } }).itemManager.use(itemId, itemContext)
    if (!result.ok) {
      (this as unknown as { actionsLeft: number }).actionsLeft += 1;
      (this as unknown as { writeLog(msg: string): void }).writeLog(result.message);
      (this as unknown as { updateHud(): void }).updateHud();
      (this as unknown as { closeItemDrawer(): void }).closeItemDrawer()
      return
    }

    if (MobaoShopBridge) {
      MobaoShopBridge.consumeItem(itemId)
    }

    (this as unknown as { recordPlayerUsage(playerId: string, itemId: string): void }).recordPlayerUsage((this as unknown as { isLanMode: boolean; lanMySlotId: string }).isLanMode ? (this as unknown as { lanMySlotId: string }).lanMySlotId : "p2", itemId);
    const itemDef = ITEM_DEFS.find((i: { id: string; name: string; description: string }) => i.id === itemId);
    (this as unknown as { addPrivateIntelEntry(entry: { source: string; text: string }): void }).addPrivateIntelEntry({
      source: itemDef ? itemDef.name : itemId,
      text: itemDef ? itemDef.description : "道具效果"
    });
    (this as unknown as { writeLog(msg: string): void }).writeLog(result.message);
    (this as unknown as { updateHud(): void }).updateHud();
    (this as unknown as { closeItemDrawer(): void }).closeItemDrawer()
    if ((this as unknown as { isLanMode: boolean; lanBridge: { send(msg: unknown): void; playerId: string } }).isLanMode && (this as unknown as { lanBridge: { send(msg: unknown): void; playerId: string } }).lanBridge) {
      (this as unknown as { lanBridge: { send(msg: unknown): void; playerId: string } }).lanBridge.send({
        type: "lan:player-action",
        playerId: (this as unknown as { lanBridge: { send(msg: unknown): void; playerId: string } }).lanBridge.playerId,
        playerName: (this as unknown as { players: Array<{ id: string; name: string }> }).players.find((p: { id: string; name: string }) => p.id === ((this as unknown as { lanMySlotId: string }).lanMySlotId || "p2"))?.name || "玩家",
        actionId: itemId,
        actionType: "item",
        itemName: itemDef ? itemDef.name : itemId
      })
    }
  },

  consumeAction(actionType: string) {
    if ((this as unknown as { round: number }).round > GAME_SETTINGS.maxRounds) {
      (this as unknown as { writeLog(msg: string): void }).writeLog("所有回合已结束，请重新随机开局。")
      return false
    }

    if ((this as unknown as { actionsLeft: number }).actionsLeft <= 0) {
      (this as unknown as { writeLog(msg: string): void }).writeLog(`本回合行动次数已耗尽，无法继续使用${actionType}。`)
      return false
    }

    (this as unknown as { actionsLeft: number }).actionsLeft -= 1
    return true
  },

  getItemInfo(itemId: string) {
    if (ITEM_DEFS) {
      const itemDef = ITEM_DEFS.find((item: { id: string; name: string; description: string }) => item.id === itemId)
      if (itemDef) return { label: itemDef.name, tip: itemDef.description }
    }
    if (SKILL_DEFS) {
      const skillDef = SKILL_DEFS.find((skill: { id: string; name: string; description: string }) => skill.id === itemId)
      if (skillDef) return { label: skillDef.name, tip: skillDef.description }
    }
    return { label: "未知道具", tip: "未知道具：暂无说明。" }
  }
}
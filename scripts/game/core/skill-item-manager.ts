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
 */

import { getOutlineBonus, getQualityBonus, getOutlineSortStrategy } from "../data/character-system"
import { MobaoShopBridge } from "../bridge/shop"
import { SKILL_DEFS } from "../data/skills"
import { ITEM_DEFS } from "../data/items"

export const SkillItemManagerMixin: Record<string, Function> = {
  useSkill(skillId) {
    if (!this.canUseIntelActions()) {
      return
    }

    if (!this.consumeAction("技能")) {
      return
    }

    let context = this.buildSkillContext()
    if (getOutlineBonus) {
      const outlineBonus = getOutlineBonus()
      const qualityBonus = getQualityBonus()
      const sortStrategy = getOutlineSortStrategy()
      if (outlineBonus > 0 || qualityBonus > 0 || sortStrategy) {
        const baseContext = context
        context = {
          revealOutline: (opts) =>
            baseContext.revealOutline({
              ...opts,
              count: (opts.count || 0) + outlineBonus,
              sortStrategy: opts.sortStrategy || sortStrategy
            }),
          revealQuality: (opts) =>
            baseContext.revealQuality({
              ...opts,
              count: (opts.count || 0) + qualityBonus,
              sortStrategy: opts.sortStrategy || sortStrategy
            }),
          revealAll: (opts) => baseContext.revealAll({ ...opts, sortStrategy: opts.sortStrategy || sortStrategy })
        }
      }
    }
    const result = this.skillManager.use(skillId, context)
    if (!result.ok) {
      this.actionsLeft += 1
      this.writeLog(result.message)
      this.updateHud()
      return
    }

    this.recordPlayerUsage(this.isLanMode ? this.lanMySlotId : "p2", skillId)
    const skillDef = SKILL_DEFS.find((s) => s.id === skillId)
    this.addPrivateIntelEntry({
      source: skillDef ? skillDef.name : skillId,
      text: skillDef ? skillDef.description : "技能效果"
    })
    this.writeLog(result.message)
    this.updateHud()
    if (this.isLanMode && this.lanBridge) {
      this.lanBridge.send({
        type: "lan:player-action",
        playerId: this.lanBridge.playerId,
        playerName: this.players.find((p) => p.id === (this.lanMySlotId || "p2"))?.name || "玩家",
        actionId: skillId,
        actionType: "skill",
        itemName: skillDef ? skillDef.name : skillId
      })
    }
  },

  useItem(itemId) {
    if (!this.canUseIntelActions()) {
      this.closeItemDrawer()
      return
    }

    if (!this.consumeAction("道具")) {
      this.closeItemDrawer()
      return
    }

    let itemContext = this.buildSkillContext()
    if (getOutlineBonus) {
      const outlineBonus = getOutlineBonus()
      const qualityBonus = getQualityBonus()
      const sortStrategy = getOutlineSortStrategy()
      if (outlineBonus > 0 || qualityBonus > 0 || sortStrategy) {
        const baseItemContext = itemContext
        itemContext = {
          revealOutline: (opts) =>
            baseItemContext.revealOutline({
              ...opts,
              count: (opts.count || 0) + outlineBonus,
              sortStrategy: opts.sortStrategy || sortStrategy
            }),
          revealQuality: (opts) =>
            baseItemContext.revealQuality({
              ...opts,
              count: (opts.count || 0) + qualityBonus,
              sortStrategy: opts.sortStrategy || sortStrategy
            }),
          revealAll: (opts) => baseItemContext.revealAll({ ...opts, sortStrategy: opts.sortStrategy || sortStrategy })
        }
      }
    }
    const result = this.itemManager.use(itemId, itemContext)
    if (!result.ok) {
      this.actionsLeft += 1
      this.writeLog(result.message)
      this.updateHud()
      this.closeItemDrawer()
      return
    }

    if (MobaoShopBridge) {
      MobaoShopBridge.consumeItem(itemId)
    }

    this.recordPlayerUsage(this.isLanMode ? this.lanMySlotId : "p2", itemId)
    const itemDef = ITEM_DEFS.find((i) => i.id === itemId)
    this.addPrivateIntelEntry({
      source: itemDef ? itemDef.name : itemId,
      text: itemDef ? itemDef.description : "道具效果"
    })
    this.writeLog(result.message)
    this.updateHud()
    this.closeItemDrawer()
    if (this.isLanMode && this.lanBridge) {
      this.lanBridge.send({
        type: "lan:player-action",
        playerId: this.lanBridge.playerId,
        playerName: this.players.find((p) => p.id === (this.lanMySlotId || "p2"))?.name || "玩家",
        actionId: itemId,
        actionType: "item",
        itemName: itemDef ? itemDef.name : itemId
      })
    }
  },

  consumeAction(actionType) {
    if (this.round > GAME_SETTINGS.maxRounds) {
      this.writeLog("所有回合已结束，请重新随机开局。")
      return false
    }

    if (this.actionsLeft <= 0) {
      this.writeLog(`本回合行动次数已耗尽，无法继续使用${actionType}。`)
      return false
    }

    this.actionsLeft -= 1
    return true
  },

  getItemInfo(itemId) {
    if (ITEM_DEFS) {
      const itemDef = ITEM_DEFS.find((item) => item.id === itemId)
      if (itemDef) return { label: itemDef.name, tip: itemDef.description }
    }
    if (SKILL_DEFS) {
      const skillDef = SKILL_DEFS.find((skill) => skill.id === itemId)
      if (skillDef) return { label: skillDef.name, tip: skillDef.description }
    }
    return { label: "未知道具", tip: "未知道具：暂无说明。" }
  }
}
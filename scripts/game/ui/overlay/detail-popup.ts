/**
 * @file scripts/game/ui/overlay/detail-popup.ts
 * @module ui/overlay/detail-popup
 * @description 道具/角色详情弹窗 Mixin。展示道具、技能、角色信息，
 *              复用 info-popup 的 popover 进行定位显示。
 *
 * @requires data/items - ITEM_DEFS
 * @requires data/skills - SKILL_DEFS
 * @requires data/character-system - getActiveCharacter
 * @requires data/characters - getCharacterById
 * @exports DetailPopupMixin - 详情弹窗子 Mixin
 */
import type { WarehouseSceneThis } from "../../../../types/warehouse-scene-this"
import { ITEM_DEFS } from "../../data/items"
import { SKILL_DEFS } from "../../data/skills"
import { getActiveCharacter } from "../../data/character-system"
import { getCharacterById } from "../../data/characters"

export const DetailPopupMixin: ThisType<WarehouseSceneThis> = {
  showItemDetailPopup(itemId: string, itemName: string | null, x: number, y: number) {
    const itemDefs = ITEM_DEFS || []
    const skillDefs = SKILL_DEFS || []
    const itemDef = itemDefs.find((item: { id: string }) => item.id === itemId) as Record<string, unknown> | undefined
    const skillDef = skillDefs.find((skill: { id: string }) => skill.id === itemId)

    if (itemDef) {
      const title = itemName || String(itemDef.name || "") || "道具详情"
      const htmlContent = [
        `<p><strong>名称：</strong>${String(itemDef.name || itemId)}</p>`,
        `<p><strong>效果：</strong>${String(itemDef.description || "未知效果")}</p>`,
        itemDef.initialCount !== undefined ? `<p><strong>初始数量：</strong>${String(itemDef.initialCount)}</p>` : "",
        itemDef.maxPerRound !== undefined ? `<p><strong>每轮上限：</strong>${String(itemDef.maxPerRound)}</p>` : ""
      ]
        .filter(Boolean)
        .join("")
      this.showPlayerInfoPopover(title, htmlContent, x, y)
    } else if (skillDef) {
      const title = itemName || skillDef.name || "技能详情"
      const htmlContent = [
        `<p><strong>名称：</strong>${skillDef.name || itemId}</p>`,
        `<p><strong>效果：</strong>${skillDef.description || "未知效果"}</p>`,
        skillDef.maxPerRound !== undefined ? `<p><strong>每轮上限：</strong>${skillDef.maxPerRound}</p>` : ""
      ]
        .filter(Boolean)
        .join("")
      this.showPlayerInfoPopover(title, htmlContent, x, y)
    }
  },

  hideItemDetailPopup() {
    this.hidePlayerInfoPopover()
  },

  showCharacterInfoPopup(playerId: string, x: number, y: number) {
    const player = this.players.find((p: { id: string }) => p.id === playerId)
    if (!player) {
      return
    }

    let characterInfo: {
      name: string
      desc: string
      skillName: string
      skillDesc: string
      passive: { label?: string } | null
    } | null = null
    if (player.isHuman) {
      const char = getActiveCharacter()
      if (char) {
        characterInfo = {
          name: char.name,
          desc: (char as unknown as { desc: string }).desc,
          skillName: char.skillName,
          skillDesc: (char as unknown as { skillDesc: string }).skillDesc,
          passive: char.passive
        }
      }
    } else {
      const charAssign = this.aiCharacterAssignments && this.aiCharacterAssignments[playerId]
      if (charAssign) {
        const charDef = getCharacterById(charAssign.characterId)
        characterInfo = {
          name: charAssign.characterName || charAssign.characterId,
          desc: charDef ? charDef.desc : "",
          skillName: charAssign.skillName,
          skillDesc: charDef ? charDef.skillDesc : "",
          passive: charAssign.passive
        }
      }
    }

    if (!characterInfo) {
      this.showPlayerInfoPopover("角色信息", "<p>该玩家暂无角色信息</p>", x, y)
      return
    }

    const title = characterInfo.name || "角色信息"
    const passiveText = characterInfo.passive && characterInfo.passive.label ? characterInfo.passive.label : "无"
    const htmlContent = [
      `<p><strong>角色：</strong>${characterInfo.name}</p>`,
      characterInfo.desc ? `<p><strong>描述：</strong>${characterInfo.desc}</p>` : "",
      `<p><strong>技能：</strong>${characterInfo.skillName || "无"}</p>`,
      characterInfo.skillDesc ? `<p><strong>技能效果：</strong>${characterInfo.skillDesc}</p>` : "",
      `<p><strong>被动：</strong>${passiveText}</p>`
    ]
      .filter(Boolean)
      .join("")
    this.showPlayerInfoPopover(title, htmlContent, x, y)
  },

  hideCharacterInfoPopup() {
    this.hidePlayerInfoPopover()
  }
}

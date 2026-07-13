/**
 * @file detail-popup-fns.ts
 * @module ui/overlay-manager/detail-popup-fns
 * @description 道具/技能详情弹窗与角色信息弹窗操作函数
 */
import type { UiOverlayManagerDeps } from "../overlay-manager"
import { ITEM_DEFS } from "../../data/items"
import { SKILL_DEFS } from "../../data/skills"
import { getActiveCharacter } from "../../data/character-system"
import { getCharacterById } from "../../data/characters"
import { showPlayerInfoPopover, hidePlayerInfoPopover } from "./info-popup-fns"

export function showItemDetailPopup(itemId: string, itemName: string | null, x: number, y: number): void {
  const itemDefs = ITEM_DEFS || []
  const skillDefs = SKILL_DEFS || []
  const itemDef = itemDefs.find((item: { id: string }) => item.id === itemId) as
    | { name?: string; description?: string; initialCount?: number; maxPerRound?: number }
    | undefined
  const skillDef = skillDefs.find((skill: { id: string }) => skill.id === itemId) as
    | { name?: string; description?: string; maxPerRound?: number }
    | undefined

  if (itemDef) {
    const title = itemName || itemDef.name || "道具详情"
    const htmlContent = [
      `<p><strong>名称：</strong>${itemDef.name || itemId}</p>`,
      `<p><strong>效果：</strong>${itemDef.description || "未知效果"}</p>`,
      itemDef.initialCount !== undefined ? `<p><strong>初始数量：</strong>${itemDef.initialCount}</p>` : "",
      itemDef.maxPerRound !== undefined ? `<p><strong>每轮上限：</strong>${itemDef.maxPerRound}</p>` : ""
    ]
      .filter(Boolean)
      .join("")
    showPlayerInfoPopover(title, htmlContent, x, y)
  } else if (skillDef) {
    const title = itemName || skillDef.name || "技能详情"
    const htmlContent = [
      `<p><strong>名称：</strong>${skillDef.name || itemId}</p>`,
      `<p><strong>效果：</strong>${skillDef.description || "未知效果"}</p>`,
      skillDef.maxPerRound !== undefined ? `<p><strong>每轮上限：</strong>${skillDef.maxPerRound}</p>` : ""
    ]
      .filter(Boolean)
      .join("")
    showPlayerInfoPopover(title, htmlContent, x, y)
  }
}

export function hideItemDetailPopup(): void {
  hidePlayerInfoPopover()
}

export function showCharacterInfoPopup(deps: UiOverlayManagerDeps, playerId: string, x: number, y: number): void {
  const player = deps.players.find((p) => p.id === playerId)
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
        desc: char.desc,
        skillName: char.skillName,
        skillDesc: char.skillDesc,
        passive: char.passive
      }
    }
  } else {
    const assignments = deps.getAiCharacterAssignments()
    const charAssign = assignments && assignments[playerId]
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
    showPlayerInfoPopover("角色信息", "<p>该玩家暂无角色信息</p>", x, y)
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
  showPlayerInfoPopover(title, htmlContent, x, y)
}

export function hideCharacterInfoPopup(): void {
  hidePlayerInfoPopover()
}
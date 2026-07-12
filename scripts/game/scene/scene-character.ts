/**
 * @file scene/scene-character.ts
 * @module scene/character
 * @description 角色相关方法。负责将当前选中角色应用到玩家对象、绑定技能按钮、
 *              刷新技能按钮标签。
 *
 * 拆分说明：
 *   - 从 main.ts MainOnlyMethods 迁移而来
 *   - 依赖 data/character-system 的角色状态查询函数
 */

import type { WarehouseSceneThis } from "../../../types/warehouse-scene-this"
import { getActiveCharacter, getActiveSkillId, getDisplayName, getAvatarLabel } from "../data/character-system"

/** 将当前选中角色应用到本地玩家对象（ID、名称、头像、技能） */
export function applyCharacterToPlayer(this: WarehouseSceneThis): void {
  if (!getActiveCharacter) return
  const char = getActiveCharacter()
  if (!char) return
  const self = this.players.find((p) => p.isSelf)
  if (!self) return
  self.characterId = char.id
  self.characterName = char.name
  self.name = getDisplayName()
  self.avatar = getAvatarLabel()
  const nameEl = document.getElementById(`name-${self.id}`)
  if (nameEl) nameEl.textContent = char.name
  this._activeSkillId = getActiveSkillId()
  this.refreshSkillButtonLabel()
}

/** 绑定技能按钮点击事件，使用当前激活技能 */
export function bindCharacterSkillButton(this: WarehouseSceneThis): void {
  if (!this.dom.skillBtn) return
  this.dom.skillBtn.onclick = () => {
    const skillId = this._activeSkillId || getActiveSkillId() || "skill-outline-scan"
    this.useSkill(skillId)
  }
  this.refreshSkillButtonLabel()
}

/** 刷新技能按钮标签为当前角色的技能名称 */
export function refreshSkillButtonLabel(this: WarehouseSceneThis): void {
  if (!this.dom.skillBtn || !getActiveCharacter) return
  const char = getActiveCharacter()
  if (!char || !char.skillName) return
  this.dom.skillBtn.textContent = char.skillName
}

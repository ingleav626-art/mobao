import type { WarehouseSceneThis } from '../../../types/warehouse-scene-this'

/**
 * @file ui/overlay.ts
 * @module ui/overlay
 * @description 弹窗与覆盖层管理 Mixin。管理游戏内所有弹窗、覆盖层、设置面板、
 *              确认对话框、信息弹窗等 UI 组件的显示/隐藏和交互逻辑。
 *
 * 核心职责：
 *   - 信息弹窗：showInfoPopup / hideInfoPopup
 *   - 玩家信息气泡：showPlayerInfoPopover / hidePlayerInfoPopover
 *   - 道具/技能详情：showItemDetailPopup / showCharacterInfoPopup
 *   - 设置覆盖层：openSettingsOverlay / closeSettingsOverlay
 *   - 联机重开投票：showLanRestartVoteDialog / showLanRestartWaitingDialog / showLanRestartDeclinedDialog
 *   - 确认对话框：showGameConfirm / hideGameConfirm
 *
 * @exports UiOverlayMixin - 弹窗与覆盖层 Mixin，混入 Phaser Scene
 *
 * @requires core/utils - 工具函数
 * @requires core/settings - 游戏设置
 * @requires core/constants - 常量定义
 */
import { clamp, rgbHex } from "../core/utils"
import { GAME_SETTINGS, saveGameSettings, normalizeGameSettings, defaultGameSettings } from "../core/settings"
import { DEFAULT_START_MONEY, SETTINGS_FIELDS } from "../core/constants"
import { QUALITY_CONFIG, ARTIFACT_LIBRARY } from "../data/artifacts"
import { ITEM_DEFS } from "../data/items"
import { SKILL_DEFS } from "../data/skills"
import { getActiveCharacter } from "../data/character-system"
import { getCharacterById } from "../data/characters"
import { DeepSeekProvider } from "../../llm/providers/deepseek-provider"
import { LlmManager } from "../../llm/core/llm-manager"

// DeepSeek settings 函数从旧版 deepseek-llm.ts 迁移到新 Provider 体系
const loadDeepSeekSettings = DeepSeekProvider.getSettings
const saveDeepSeekSettings = DeepSeekProvider.applySettings
const maskApiKey = LlmManager.utils.maskApiKey
import { MobaoAnimations } from "../animations"
import { MobaoShopPage } from "../shop/index"

// ─── 独立函数（可独立测试）───

export function getCollectionCategories(library: Array<{ category?: string }>): string[] {
  const categories = new Set<string>()
  library.forEach((a) => {
    if (a.category) categories.add(a.category)
  })
  return Array.from(categories).sort()
}

export function filterCollectionItems<T extends { category?: string; qualityKey?: string; name?: string; key?: string }>(
  library: T[],
  opts: { categoryFilter?: string; qualityFilter?: string; searchText?: string }
): T[] {
  let result = library
  if (opts.categoryFilter && opts.categoryFilter !== "all") {
    result = result.filter((a) => a.category === opts.categoryFilter)
  }
  if (opts.qualityFilter && opts.qualityFilter !== "all") {
    result = result.filter((a) => a.qualityKey === opts.qualityFilter)
  }
  if (opts.searchText) {
    const q = opts.searchText.toLowerCase()
    result = result.filter(
      (a) => (a.name || "").toLowerCase().includes(q) || (a.key || "").toLowerCase().includes(q)
    )
  }
  return result
}

export const UiOverlayMixin: ThisType<WarehouseSceneThis> = {
  showInfoPopup(title: string, sourceScrollEl: HTMLElement | null) {
    this.dom.infoPopupTitle!.textContent = title
    if (sourceScrollEl) {
      this.dom.infoPopupContent!.innerHTML = sourceScrollEl.innerHTML
    } else {
      this.dom.infoPopupContent!.innerHTML = ""
    }
    if (MobaoAnimations) {
      MobaoAnimations.animateOverlayOpen(
        this.dom.infoPopupOverlay!,
        this.dom.infoPopupOverlay!.querySelector(".info-popup-box")
      )
    } else {
      this.dom.infoPopupOverlay!.classList.remove("hidden")
    }
  },

  hideInfoPopup() {
    if (MobaoAnimations) {
      MobaoAnimations.animateOverlayClose(this.dom.infoPopupOverlay!)
    } else {
      this.dom.infoPopupOverlay!.classList.add("hidden")
    }
  },

  showPlayerInfoPopover(title: string, htmlContent: string, x: number, y: number) {
    const popover = document.getElementById("playerInfoPopover")
    const titleEl = document.getElementById("playerInfoPopoverTitle")
    const htmlContentEl = document.getElementById("playerInfoPopoverContent")
    if (!popover || !titleEl || !htmlContentEl) {
      return
    }
    titleEl.textContent = title
    htmlContentEl.innerHTML = htmlContent
    popover.classList.remove("hidden")
    popover.classList.add("popup-content-enter")
    popover.addEventListener(
      "animationend",
      function onEnter() {
        popover.classList.remove("popup-content-enter")
        popover.removeEventListener("animationend", onEnter)
      },
      { once: true }
    )
    this.positionPlayerInfoPopover(x, y)
  },

  positionPlayerInfoPopover(x: number, y: number) {
    const popover = document.getElementById("playerInfoPopover")
    if (!popover) {
      return
    }
    const rect = popover.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    let left = x + 10
    let top = y + 10
    if (left + rect.width > viewportWidth - 10) {
      left = x - rect.width - 10
    }
    if (top + rect.height > viewportHeight - 10) {
      top = y - rect.height - 10
    }
    left = Math.max(10, Math.min(left, viewportWidth - rect.width - 10))
    top = Math.max(10, Math.min(top, viewportHeight - rect.height - 10))
    popover.style.left = `${left}px`
    popover.style.top = `${top}px`
  },

  hidePlayerInfoPopover() {
    const popover = document.getElementById("playerInfoPopover")
    if (popover) {
      popover.classList.add("hidden")
      popover.classList.remove("popup-content-enter")
    }
  },

  showItemDetailPopup(itemId: string, itemName: string | null, x: number, y: number) {
    const itemDefs = ITEM_DEFS || []
    const skillDefs = SKILL_DEFS || []
    const itemDef = itemDefs.find((item: any) => item.id === itemId) as any
    const skillDef = skillDefs.find((skill: any) => skill.id === itemId) as any

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
    const player = this.players.find((p: any) => p.id === playerId)
    if (!player) {
      return
    }

    let characterInfo: { name: string; desc: string; skillName: string; skillDesc: string; passive: any } | null = null
    if (player.isHuman) {
      const char = getActiveCharacter()
      if (char) {
        characterInfo = {
          name: char.name,
          desc: (char as any).desc,
          skillName: char.skillName,
          skillDesc: (char as any).skillDesc,
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
  },

  openSettingsOverlay() {
    // 保存初始设置值，用于离开保护（使用表单读取的值，确保一致性）
    ; this.closeBidKeypad()
      ; this.closeItemDrawer()
    this.hideInfoPopup()
      ; this.fillSettingsForm(GAME_SETTINGS)
      ; this.fillLlmSettingsForm(this.getLlmSettings())
      ; this.setSettingsStatus("设置保存在本地浏览器中。", false)

      ; this._settingsInitialValues = JSON.stringify({
        game: this.readSettingsForm(),
        llm: this.readLlmSettingsForm()
      })

    const llmGroup = document.getElementById("llmSettingsGroup")
    if (llmGroup) {
      if (this.isLanMode) {
        llmGroup.classList.add("settings-group-disabled")
        const inputs = llmGroup.querySelectorAll("input, button")
        inputs.forEach((el: any) => {
          el.disabled = true
        })
      } else {
        llmGroup.classList.remove("settings-group-disabled")
        const inputs = llmGroup.querySelectorAll("input, button")
        inputs.forEach((el: any) => {
          el.disabled = false
        })
      }
    }
    const returnLobbyBtn = document.getElementById("settingsReturnLobbyBtn")
    if (returnLobbyBtn) {
      const lobbyPage = document.getElementById("lobbyPage")
      const isLobbyVisible = lobbyPage && !lobbyPage.classList.contains("hidden")
      if (isLobbyVisible) {
        returnLobbyBtn.classList.add("hidden")
      } else {
        if (this.isLanMode) {
          if (this.lanIsHost) {
            returnLobbyBtn.textContent = "返回房间"
            returnLobbyBtn.classList.remove("hidden")
          } else {
            returnLobbyBtn.classList.add("hidden")
          }
        } else {
          returnLobbyBtn.textContent = "返回大厅"
          returnLobbyBtn.classList.remove("hidden")
        }
      }
    }
    if (MobaoAnimations) {
      MobaoAnimations.animateOverlayOpen(this.dom.settingsOverlay!, this.dom.settingsPanel!)
    } else {
      this.dom.settingsOverlay!.classList.remove("hidden")
    }
  },

  closeSettingsOverlay(keepStatus: boolean = false, forceClose: boolean = false) {
    // 检查是否有未保存的设置
    if (!forceClose && this._settingsInitialValues) {
      const currentValues = JSON.stringify({
        game: this.readSettingsForm(),
        llm: this.readLlmSettingsForm()
      })

      if (currentValues !== this._settingsInitialValues) {
        const okBtn = document.getElementById("gameConfirmOkBtn")
        const cancelBtn = document.getElementById("gameConfirmCancelBtn")
        const originalOkText = okBtn ? okBtn.textContent : ""
        const originalCancelText = cancelBtn ? cancelBtn.textContent : ""
        if (okBtn) okBtn.textContent = "保存"
        if (cancelBtn) cancelBtn.textContent = "不保存"
          // 临时修改确认按钮文本

          ; this.showGameConfirm(
            "设置已修改，是否保存？",
            () => {
              // 恢复按钮文本
              if (okBtn) okBtn.textContent = originalOkText
              if (cancelBtn) cancelBtn.textContent = originalCancelText
                ; this.saveSettingsFromOverlay()
                ; this._settingsInitialValues = null
              this.closeSettingsOverlay(keepStatus, true)
            },
            () => {
              // 恢复按钮文本
              if (okBtn) okBtn.textContent = originalOkText
              if (cancelBtn) cancelBtn.textContent = originalCancelText
                ; this._settingsInitialValues = null
              this.closeSettingsOverlay(keepStatus, true)
            }
          )
        return
      }
    }

    // 清除初始值记录，避免关闭时再次弹窗
    ; this._settingsInitialValues = null

    if (MobaoAnimations) {
      MobaoAnimations.animateOverlayClose(
        this.dom.settingsOverlay!,
        this.dom.settingsPanel!,
        () => {
          if (!keepStatus) {
            this.setSettingsStatus("设置保存在本地浏览器中。", false)
          }
        }
      )
    } else {
      this.dom.settingsOverlay!.classList.add("hidden")
      if (!keepStatus) {
        this.setSettingsStatus("设置保存在本地浏览器中。", false)
      }
    }
  },

  isSettingsOverlayOpen(): boolean {
    return !this.dom.settingsOverlay!.classList.contains("hidden")
  },

  settingsInputId(field: string): string {
    return `setting-${field}`
  },

  fillSettingsForm(values: Record<string, any>) {
    SETTINGS_FIELDS.forEach((field: string) => {
      const input = document.getElementById(this.settingsInputId(field))
      if (!input) {
        return
      }
      ; (input as HTMLInputElement).value = String(values[field])
    })
    const roundSecondsInput = document.getElementById("setting-roundSeconds") as HTMLInputElement | null
    const roundSecondsDecrease = document.getElementById("roundSecondsDecrease") as HTMLButtonElement | null
    const roundSecondsIncrease = document.getElementById("roundSecondsIncrease") as HTMLButtonElement | null
    if (roundSecondsInput) {
      const value = Number(roundSecondsInput.value) || 60
      if (roundSecondsDecrease) {
        roundSecondsDecrease.disabled = value <= 10
      }
      if (roundSecondsIncrease) {
        roundSecondsIncrease.disabled = value >= 180
      }
    }
    const settlementSpeedInput = document.getElementById("setting-settlementSpeedMultiplier") as HTMLInputElement | null
    const settlementSpeedDecrease = document.getElementById("settlementSpeedDecrease") as HTMLButtonElement | null
    const settlementSpeedIncrease = document.getElementById("settlementSpeedIncrease") as HTMLButtonElement | null
    if (settlementSpeedInput) {
      const value = Number(settlementSpeedInput.value) || 1
      if (settlementSpeedDecrease) {
        settlementSpeedDecrease.disabled = value <= 0.5
      }
      if (settlementSpeedIncrease) {
        settlementSpeedIncrease.disabled = value >= 3
      }
    }
    const musicVolumeInput = document.getElementById("setting-musicVolume") as HTMLInputElement | null
    const musicVolumeValue = document.getElementById("musicVolumeValue")
    const musicVolumeIconImg = document.getElementById("musicVolumeIconImg") as HTMLImageElement | null
    if (musicVolumeInput && musicVolumeValue) {
      musicVolumeValue.textContent = `${musicVolumeInput.value}%`
      if (musicVolumeIconImg) {
        const isMuted = Number(musicVolumeInput.value) === 0
        musicVolumeIconImg.src = isMuted
          ? "./assets/images/icons/ui/mute-fill.svg"
          : "./assets/images/icons/ui/sound-on.svg"
        musicVolumeIconImg.classList.toggle("muted", isMuted)
      }
    }
    const sfxVolumeInput = document.getElementById("setting-sfxVolume") as HTMLInputElement | null
    const sfxVolumeValue = document.getElementById("sfxVolumeValue")
    const sfxVolumeIconImg = document.getElementById("sfxVolumeIconImg") as HTMLImageElement | null
    if (sfxVolumeInput && sfxVolumeValue) {
      sfxVolumeValue.textContent = `${sfxVolumeInput.value}%`
      if (sfxVolumeIconImg) {
        const isMuted = Number(sfxVolumeInput.value) === 0
        sfxVolumeIconImg.src = isMuted
          ? "./assets/images/icons/ui/mute-fill.svg"
          : "./assets/images/icons/ui/sound-on.svg"
        sfxVolumeIconImg.classList.toggle("muted", isMuted)
      }
    }
  },

  readSettingsForm(): Record<string, any> {
    const draft: Record<string, number> = {}
    SETTINGS_FIELDS.forEach((field: string) => {
      const input = document.getElementById(this.settingsInputId(field))
      draft[field] = input ? Number((input as HTMLInputElement).value) : (GAME_SETTINGS as unknown as Record<string, number>)[field]
    })
    return normalizeGameSettings(draft, GAME_SETTINGS)
  },

  setSettingsStatus(text: string, saved: boolean) {
    this.dom.settingsStatusText!.textContent = text
    this.dom.settingsStatusText!.classList.toggle("settings-note-saved", Boolean(saved))
  },

  saveSettingsFromOverlay() {
    const LLM_SETTINGS = loadDeepSeekSettings()
    const next = this.readSettingsForm()
    Object.assign(GAME_SETTINGS, next)
    saveGameSettings(GAME_SETTINGS)

    if (!this.isLanMode) {
      const oldMultiGameMemoryEnabled = Boolean(LLM_SETTINGS.multiGameMemoryEnabled)
      const llmNext = this.readLlmSettingsForm()
      console.log("[saveSettingsFromOverlay] llmNext:", {
        independentModelEnabled: llmNext.independentModelEnabled,
        enabled: llmNext.enabled,
        apiKey: llmNext.apiKey ? "(已设置)" : "(空)"
      })

      const LLM_GLOBAL_SETTINGS_KEY = "mobao_llm_global_settings_v1"
      const globalSettings = {
        enabled: llmNext.enabled,
        multiGameMemoryEnabled: llmNext.multiGameMemoryEnabled,
        reflectionEnabled: llmNext.reflectionEnabled,
        thinkingEnabled: llmNext.thinkingEnabled,
        independentModelEnabled: llmNext.independentModelEnabled,
        independentReflectionEnabled: llmNext.independentReflectionEnabled,
        contextLength: llmNext.contextLength,
        autoSummarizeEnabled: llmNext.autoSummarizeEnabled,
        reflectionScope: llmNext.reflectionScope
      }
      try {
        window.localStorage.setItem(LLM_GLOBAL_SETTINGS_KEY, JSON.stringify(globalSettings))
      } catch (_e) { }

      const llmProvider = this.getLlmProvider()
      console.log("[saveSettingsFromOverlay] llmProvider:", llmProvider ? llmProvider.id : null)
      if (llmProvider && llmProvider.saveSettings) {
        llmProvider.saveSettings({
          apiKey: llmNext.apiKey,
          endpoint: llmNext.endpoint,
          model: llmNext.model,
          maxTokens: llmNext.maxTokens,
          timeoutMs: llmNext.timeoutMs,
          thinkingParams: llmNext.thinkingParams
        })
      } else if (saveDeepSeekSettings) {
        saveDeepSeekSettings({
          apiKey: llmNext.apiKey,
          endpoint: llmNext.endpoint,
          model: llmNext.model,
          maxTokens: llmNext.maxTokens,
          timeoutMs: llmNext.timeoutMs,
          thinkingParams: llmNext.thinkingParams
        })
      }
      if (llmProvider && llmProvider.applySettings) {
        llmProvider.applySettings(llmNext)
      }
      Object.assign(LLM_SETTINGS, llmNext)
      console.log(
        "[saveSettingsFromOverlay] LLM_SETTINGS.independentModelEnabled:",
        LLM_SETTINGS.independentModelEnabled
      )
      if (oldMultiGameMemoryEnabled && !LLM_SETTINGS.multiGameMemoryEnabled) {
        ; this.writeLog("已关闭多局AI上下文：仅停止发送，不删除记忆。")
      }
      if (!oldMultiGameMemoryEnabled && LLM_SETTINGS.multiGameMemoryEnabled) {
        ; this.pushRunStartContextToAi()
          ; this.writeLog("已启用多局AI上下文：后续会在同一会话中连续学习。")
      }
    }

    ; this._settingsInitialValues = null

    const bidInput = this.dom.bidInput as HTMLInputElement
    bidInput.step = "1"
    bidInput.min = "0"
    const normalizedBid = Math.max(0, Math.round(Number(bidInput.value) || 0))
    bidInput.value = String(normalizedBid)

      ; this.round = clamp(this.round, 1, GAME_SETTINGS.maxRounds)
      ; this.roundTimeLeft = Math.min(this.roundTimeLeft, GAME_SETTINGS.roundSeconds)
      ; this.actionsLeft = Math.min(this.actionsLeft, GAME_SETTINGS.actionsPerRound)
      ; this.updateHud()

      ; this.setSettingsStatus("设置已保存并立即生效。", true)
    const modelName = (LLM_SETTINGS && LLM_SETTINGS.model) || "大模型"
      ; this.setLlmSettingsStatus(
        LLM_SETTINGS.apiKey
          ? `${modelName}配置已保存：${maskApiKey(LLM_SETTINGS.apiKey)}`
          : `${modelName}配置已保存，但尚未填写 API Key。`,
        LLM_SETTINGS.apiKey ? "success" : "normal"
      )
      ; this.writeLog(`设置已应用：对局参数生效；${modelName} ${LLM_SETTINGS.enabled ? "已启用" : "未启用"}。`)
    this.closeSettingsOverlay(true)
  },

  showLanRestartVoteDialog(hostName: string) {
    const existing = document.getElementById("lanRestartVoteDialog")
    if (existing) existing.remove()
    const overlay = document.createElement("div")
    overlay.id = "lanRestartVoteDialog"
    overlay.style.cssText =
      "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:99999;"
    const box = document.createElement("div")
    box.style.cssText =
      "background:#2a2218;border:2px solid #d4a843;border-radius:12px;padding:24px 32px;text-align:center;color:#e0d0b0;font-size:16px;max-width:360px;"
    box.innerHTML =
      '<div style="margin-bottom:16px;font-size:18px;font-weight:bold;">' +
      hostName +
      " 发起了重开请求</div>" +
      '<div style="margin-bottom:20px;color:#a09070;">是否同意开始新一局？</div>' +
      '<div style="display:flex;gap:12px;justify-content:center;">' +
      '<button id="lanRestartAccept" style="padding:8px 24px;border-radius:6px;border:1px solid #6a9f5a;background:rgba(106,159,90,0.2);color:#8fd070;cursor:pointer;font-size:14px;">同意</button>' +
      '<button id="lanRestartDecline" style="padding:8px 24px;border-radius:6px;border:1px solid #8a4a3a;background:rgba(180,60,40,0.15);color:#e07060;cursor:pointer;font-size:14px;">拒绝</button>' +
      "</div>"
    overlay.appendChild(box)
    document.body.appendChild(overlay)
    document.getElementById("lanRestartAccept")!.addEventListener("click", () => {
      overlay.remove()
      this.lanBridge!.send({ type: "game:restart-accept" })
      this.writeLog("已同意重开，等待其他玩家确认...")
    })
    document.getElementById("lanRestartDecline")!.addEventListener("click", () => {
      overlay.remove()
      this.lanBridge!.send({ type: "game:restart-decline" })
      this.writeLog("已拒绝重开请求")
    })
  },

  removeLanRestartDialog() {
    const existing = document.getElementById("lanRestartVoteDialog")
    if (existing) existing.remove()
    const waiting = document.getElementById("lanRestartWaitingDialog")
    if (waiting) waiting.remove()
    const declined = document.getElementById("lanRestartDeclinedDialog")
    if (declined) declined.remove()
  },

  showLanRestartWaitingDialog() {
    this.removeLanRestartDialog()
    const overlay = document.createElement("div")
    overlay.id = "lanRestartWaitingDialog"
    overlay.style.cssText =
      "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:99999;"
    const box = document.createElement("div")
    box.style.cssText =
      "background:#2a2218;border:2px solid #d4a843;border-radius:12px;padding:24px 32px;text-align:center;color:#e0d0b0;font-size:16px;max-width:360px;"
    box.innerHTML =
      '<div style="margin-bottom:12px;font-size:18px;font-weight:bold;">已发送重开请求</div>' +
      '<div style="color:#a09070;">等待其他玩家同意...</div>' +
      '<div style="margin-top:16px;"><span class="lan-waiting-spinner"></span></div>'
    overlay.appendChild(box)
    document.body.appendChild(overlay)
      ; this.writeLog("已向所有玩家发送重开请求，等待确认...")
  },

  showLanRestartDeclinedDialog(declinerName: string) {
    this.removeLanRestartDialog()
    const overlay = document.createElement("div")
    overlay.id = "lanRestartDeclinedDialog"
    overlay.style.cssText =
      "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:99999;"
    const box = document.createElement("div")
    box.style.cssText =
      "background:#2a2218;border:2px solid #8a4a3a;border-radius:12px;padding:24px 32px;text-align:center;color:#e0d0b0;font-size:16px;max-width:360px;"
    box.innerHTML =
      '<div style="margin-bottom:12px;font-size:18px;font-weight:bold;color:#e07060;">重开请求被拒绝</div>' +
      '<div style="color:#a09070;">' +
      declinerName +
      " 拒绝了重开申请</div>" +
      '<button id="lanRestartDeclinedClose" style="margin-top:16px;padding:8px 24px;border-radius:6px;border:1px solid #8a4a3a;background:rgba(180,60,40,0.15);color:#e07060;cursor:pointer;font-size:14px;">确定</button>'
    overlay.appendChild(box)
    document.body.appendChild(overlay)
    document.getElementById("lanRestartDeclinedClose")!.addEventListener("click", () => {
      overlay.remove()
    })
  },

  showLanPauseOverlay() {
    // 只在游戏场景显示暂停弹窗
    if (!this.isLanMode || this.settled || !this.dom.hud) return
    let overlay = document.getElementById("lanPauseOverlay")
    if (overlay) return
    overlay = document.createElement("div")
    overlay.id = "lanPauseOverlay"
    overlay.style.cssText =
      "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:99998;"
    const box = document.createElement("div")
    box.style.cssText =
      "background:#2a2218;border:2px solid #d4a843;border-radius:12px;padding:28px 36px;text-align:center;color:#e0d0b0;font-size:16px;max-width:360px;"
    const title = document.createElement("div")
    title.style.cssText = "font-size:20px;font-weight:bold;margin-bottom:12px;color:#d4a843;"
    title.textContent = "游戏已暂停"
    box.appendChild(title)
    const hint = document.createElement("div")
    hint.style.cssText = "color:#a09070;margin-bottom:16px;"
    hint.textContent = this.isLanMode && this.lanIsHost ? "点击下方按钮继续游戏" : "等待主机继续游戏..."
    box.appendChild(hint)
    if (this.isLanMode && this.lanIsHost) {
      const resumeBtn = document.createElement("button")
      resumeBtn.style.cssText =
        "padding:10px 28px;border-radius:6px;border:1px solid #d4a843;background:rgba(212,168,67,0.15);color:#d4a843;cursor:pointer;font-size:15px;font-weight:bold;"
      resumeBtn.textContent = "结束暂停"
      resumeBtn.addEventListener("click", () => {
        ; this.toggleRoundPause()
      })
      box.appendChild(resumeBtn)
    }
    overlay.appendChild(box)
    document.body.appendChild(overlay)
  },

  hideLanPauseOverlay() {
    const overlay = document.getElementById("lanPauseOverlay")
    if (overlay) overlay.remove()
  },

  hideSettleOverlay() {
    const overlayEl = this.dom.settleOverlay
    if (!overlayEl) return
    if (typeof MobaoAnimations !== "undefined") {
      ; (MobaoAnimations as any).animateOverlayClose(overlayEl, null, function () {
        overlayEl.classList.add("hidden")
        overlayEl.style.animation = ""
        overlayEl.style.opacity = ""
      })
    } else {
      overlayEl.classList.add("hidden")
    }
  },

  openAiLogicPanel() {
    if (!this.dom.aiLogicOverlay) {
      return
    }
    ; this.renderAiLogicPanel()
    if (typeof this.renderAiThoughtLog === "function") {
      ; this.renderAiThoughtLog()
    }
    if (MobaoAnimations) {
      MobaoAnimations.animateOverlayOpen(this.dom.aiLogicOverlay, this.dom.aiLogicPanel)
    } else {
      ; this.dom.aiLogicOverlay.classList.remove("hidden")
    }
  },

  closeAiLogicPanel() {
    if (!this.dom.aiLogicOverlay) {
      return
    }
    if (MobaoAnimations) {
      MobaoAnimations.animateOverlayClose(this.dom.aiLogicOverlay, this.dom.aiLogicPanel)
    } else {
      ; this.dom.aiLogicOverlay.classList.add("hidden")
    }
  },

  openShopOverlay() {
    if (typeof MobaoShopPage !== "undefined") {
      MobaoShopPage.init({
        onPurchase: () => {
          ; this.updateLobbyMoneyDisplay()
          if (!document.getElementById("gameArea")!.classList.contains("hidden")) {
            ; this.updateHud()
          }
        }
      })
      MobaoShopPage.open()
    }
  },

  closeShopOverlay() {
    if (typeof MobaoShopPage !== "undefined") {
      MobaoShopPage.close()
    }
    ; this.updateLobbyMoneyDisplay()
    if (!document.getElementById("gameArea")!.classList.contains("hidden")) {
      ; this.updateHud()
    }
  },

  openCollectionOverlay() {
    const overlay = document.getElementById("collectionOverlay")
    if (!overlay) return
    if (typeof MobaoAnimations !== "undefined") {
      ; (MobaoAnimations as any).animateOverlayOpen(overlay)
    } else {
      overlay.classList.remove("hidden")
    }
    ; this.initCollectionPanel()

    const closeBtn = document.getElementById("collectionCloseBtn")
    if (closeBtn && !(closeBtn as any)._collectionBound) {
      ; (closeBtn as any)._collectionBound = true
      closeBtn.addEventListener("click", () => this.closeCollectionOverlay())
    }

    overlay.onclick = (e) => {
      if (e.target === overlay) this.closeCollectionOverlay()
    }
  },

  closeCollectionOverlay() {
    const overlay = document.getElementById("collectionOverlay")
    if (!overlay) return
    if (typeof MobaoAnimations !== "undefined") {
      ; (MobaoAnimations as any).animateOverlayClose(overlay, null, function () {
        overlay.classList.add("hidden")
        overlay.style.animation = ""
        overlay.style.opacity = ""
      })
    } else {
      overlay.classList.add("hidden")
    }
  },

  initCollectionPanel() {
    const categorySelect = document.getElementById("collectionCategoryFilter") as HTMLSelectElement | null
    const qualitySelect = document.getElementById("collectionQualityFilter") as HTMLSelectElement | null
    const searchInput = document.getElementById("collectionSearchInput") as HTMLInputElement | null

    if (categorySelect && !(categorySelect as any)._initialized) {
      ; (categorySelect as any)._initialized = true
      const categories = this.getCollectionCategories()
      categorySelect.innerHTML =
        '<option value="all">全部品类</option>' + categories.map((c: string) => `<option value="${c}">${c}</option>`).join("")
      categorySelect.addEventListener("change", () => this.renderCollectionGrid())
    }

    if (qualitySelect && !(qualitySelect as any)._initialized) {
      ; (qualitySelect as any)._initialized = true
      const qualities = Object.entries(QUALITY_CONFIG)
      qualitySelect.innerHTML =
        '<option value="all">全部品质</option>' +
        qualities.map(([key, val]) => `<option value="${key}">${val.label}</option>`).join("")
      qualitySelect.addEventListener("change", () => this.renderCollectionGrid())
    }

    if (searchInput && !(searchInput as any)._initialized) {
      ; (searchInput as any)._initialized = true
      searchInput.addEventListener("input", () => this.renderCollectionGrid())
    }

    ; this.renderCollectionGrid()
  },

  getCollectionCategories(): string[] {
    return getCollectionCategories(ARTIFACT_LIBRARY || [])
  },

  renderCollectionGrid() {
    const grid = document.getElementById("collectionGrid")
    const stats = document.getElementById("collectionStats")
    if (!grid) return

    const categoryFilter = (document.getElementById("collectionCategoryFilter") as HTMLSelectElement | null)?.value || "all"
    const qualityFilter = (document.getElementById("collectionQualityFilter") as HTMLSelectElement | null)?.value || "all"
    const searchText = (document.getElementById("collectionSearchInput") as HTMLInputElement | null)?.value || ""

    const artifacts = filterCollectionItems(ARTIFACT_LIBRARY || [], { categoryFilter, qualityFilter, searchText })

    const total = (ARTIFACT_LIBRARY || []).length
    if (stats) {
      stats.textContent = `显示 ${artifacts.length} / ${total} 件藏品`
    }

    const rgbHexFn = rgbHex

    grid.innerHTML = artifacts
      .map((artifact: any) => {
        const quality = QUALITY_CONFIG[artifact.qualityKey]
        const qualityLabel = quality ? quality.label : "未知"
        const qualityColor = quality ? rgbHex(quality.color) : "#9f9f9f"
        const imgSrc = `assets/images/artifacts/thumbs/${artifact.key}.png`

        return `
          <article class="collection-item" data-key="${artifact.key}">
            <div class="collection-thumb" style="background: ${qualityColor}44;">
              <img src="${imgSrc}" alt="${artifact.name}" onerror="this.style.display='none'"/>
            </div>
            <div class="collection-info">
              <strong class="collection-name">${artifact.name}</strong>
              <div class="collection-meta">
                <span class="collection-quality" style="color: ${qualityColor};">${qualityLabel}</span>
                <span class="collection-category">${artifact.category}</span>
              </div>
              <div class="collection-details">
                <span>基础价: ${artifact.basePrice}</span>
                <span>尺寸: ${artifact.w}x${artifact.h}</span>
              </div>
            </div>
          </article>
        `
      })
      .join("")
  },

  AI_MODEL_CONFIGS_STORAGE_KEY: "mobao_ai_model_configs_v1",

  loadAiModelConfigs(): Record<string, string | null> {
    try {
      const stored = localStorage.getItem(this.AI_MODEL_CONFIGS_STORAGE_KEY)
      if (stored) {
        return JSON.parse(stored)
      }
    } catch (e) {
      console.error("Failed to load AI model configs:", e)
    }
    return { ai1: null, ai2: null, ai3: null }
  },

  saveAiModelConfigs(configs: Record<string, string | null>) {
    try {
      localStorage.setItem(this.AI_MODEL_CONFIGS_STORAGE_KEY, JSON.stringify(configs))
    } catch (e) {
      console.error("Failed to save AI model configs:", e)
    }
  },

  openAiModelConfigOverlay() {
    const overlay = document.getElementById("aiModelConfigOverlay")
    if (!overlay) return
    this.renderAiModelConfigContent()
    overlay.classList.remove("hidden")
  },

  closeAiModelConfigOverlay() {
    const overlay = document.getElementById("aiModelConfigOverlay")
    if (overlay) overlay.classList.add("hidden")
  },

  renderAiModelConfigContent() {
    const htmlContentEl = document.getElementById("aiModelConfigContent")
    if (!htmlContentEl) return
    const aiModelConfigs = this.loadAiModelConfigs()
    const providers = LlmManager ? LlmManager.listProviders() : []
    const activeProviderId = LlmManager ? LlmManager.getActiveProviderId() : "deepseek"
    const currentSettings: Record<string, any> =
      typeof this.getLlmSettings === "function"
        ? this.getLlmSettings()
        : {} as Record<string, any>
    const currentModel = currentSettings.model || "未配置"
    const currentEndpoint = currentSettings.endpoint || "未配置"
    const hasCurrentApiKey = !!(currentSettings.apiKey && currentSettings.apiKey.trim())
    const activeProvider = providers.find((p: any) => p.id === activeProviderId)
    const activeProviderName = activeProvider ? activeProvider.name : activeProviderId
    let html = `
        <div style="margin-bottom:12px;padding:8px;background:#fff9f0;border:1px solid #d6ba8d;border-radius:6px;">
          <div style="font-weight:bold;color:#402f1c;margin-bottom:4px;">当前默认配置：${activeProviderName}</div>
          <div style="font-size:11px;color:#6a5a4a;">模型: ${currentModel}</div>
          <div style="font-size:11px;color:#6a5a4a;">Endpoint: ${currentEndpoint.slice(0, 50)}${currentEndpoint.length > 50 ? "..." : ""}</div>
          <div style="font-size:11px;color:${hasCurrentApiKey ? "#2a7a2a" : "#a04040"};">API Key: ${hasCurrentApiKey ? "已配置" : "未配置"}</div>
        </div>
      `
    const providerIds = new Set(providers.map((p: any) => p.id))
    const providerOptions = providers.map((p: any) => `<option value="${p.id}">${p.name}</option>`).join("")
      ;["ai1", "ai2", "ai3"].forEach((aiId, i) => {
        const savedProviderId = aiModelConfigs[aiId] || ""
        const isSavedValid = !savedProviderId || providerIds.has(savedProviderId)
        let extraOption = ""
        if (savedProviderId && !isSavedValid) {
          extraOption = `<option value="${savedProviderId}" selected>[已失效] ${savedProviderId}</option>`
        }
        html += `
          <div class="ai-model-config-section" style="margin-bottom:12px;padding:10px;background:#fff;border:1px solid #d6ba8d;border-radius:6px;">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:bold;color:#402f1c;">
              <span style="width:60px;">AI${i + 1}：</span>
              <select id="aiModelProvider-${aiId}" style="flex:1;padding:6px 8px;border:1px solid #b79d77;border-radius:4px;font-size:13px;background:#fff;">
                <option value="" ${!savedProviderId ? "selected" : ""}>使用默认配置</option>
                ${extraOption}
                ${providerOptions}
              </select>
            </label>
          </div>
        `
      })
    htmlContentEl.innerHTML = html
  },

  saveAiModelConfigFromForm() {
    const configs: Record<string, string> = {}
      ;["ai1", "ai2", "ai3"].forEach((aiId) => {
        const select = document.getElementById(`aiModelProvider-${aiId}`) as HTMLSelectElement | null
        if (select) {
          configs[aiId] = select.value || ""
        }
      })
    this.saveAiModelConfigs(configs as any)
    this.closeAiModelConfigOverlay()
      ; this.writeLog("AI模型配置已保存。")
  },

  getAiModelConfig(aiIndex: number): Record<string, any> | null {
    const aiId = `ai${aiIndex + 1}`
    const aiModelConfigs = this.loadAiModelConfigs()
    const providerId = aiModelConfigs[aiId]
    console.log("[getAiModelConfig] aiIndex:", aiIndex, "aiId:", aiId, "providerId:", providerId)
    if (!providerId) {
      console.log("[getAiModelConfig] no providerId for aiId:", aiId)
      return null
    }
    if (LlmManager) {
      const provider = LlmManager.getProvider(providerId)
      console.log("[getAiModelConfig] provider:", provider ? provider.id : null)
      if (provider && typeof provider.loadSettings === "function") {
        const settings = provider.loadSettings()
        console.log("[getAiModelConfig] settings:", {
          apiKey: settings.apiKey ? "(已设置)" : "(空)",
          endpoint: settings.endpoint,
          model: settings.model
        })
        return {
          apiKey: settings.apiKey || "",
          endpoint: settings.endpoint || "",
          model: settings.model || "",
          maxTokens: settings.maxTokens,
          timeoutMs: settings.timeoutMs,
          thinkingEnabled: settings.thinkingEnabled
        }
      }
    }
    console.log("[getAiModelConfig] LlmManager not available or provider not found")
    return null
  }
}

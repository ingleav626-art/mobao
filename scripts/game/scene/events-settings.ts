/**
 * @file scripts/game/scene/events-settings.ts
 * @module scene/events-settings
 * @description 设置面板事件绑定。绑定音量滑块、重抽按钮、设置保存/重置/关闭、
 *              回合数/动作数/加价幅度等规则参数调整的事件监听器。
 *
 * @requires audio/audio-manager - AudioManager
 * @requires audio/audio-ui - AudioUI
 * @exports bindSettingsEvents - 设置面板事件绑定函数
 */
import type { WarehouseSceneThis } from "../../../types/warehouse-scene-this"
import { AudioManager } from "../../audio/audio-manager"

export function bindSettingsEvents(this: WarehouseSceneThis): void {
  const updateVolumeIcon = (value: string | number, imgEl: HTMLImageElement | null) => {
    if (!imgEl) return
    const isMuted = Number(value) === 0
    imgEl.src = isMuted ? "./assets/images/icons/ui/mute-fill.svg" : "./assets/images/icons/ui/sound-on.svg"
    imgEl.classList.toggle("muted", isMuted)
  }

  this.dom.rerollBtn?.addEventListener("click", () => {
    if (this.isLanMode) return
    this.startNewRun()
  })
  this.dom.openSettingsBtn?.addEventListener("click", () => {
    this.openSettingsOverlay()
  })
  const roundSecondsInput = document.getElementById("setting-roundSeconds") as HTMLInputElement | null
  const roundSecondsDecrease = document.getElementById("roundSecondsDecrease") as HTMLButtonElement | null
  const roundSecondsIncrease = document.getElementById("roundSecondsIncrease") as HTMLButtonElement | null
  function updateRoundSecondsUI(value: number) {
    if (roundSecondsInput) {
      roundSecondsInput.value = String(value)
    }
    if (roundSecondsDecrease) {
      roundSecondsDecrease.disabled = value <= 10
    }
    if (roundSecondsIncrease) {
      roundSecondsIncrease.disabled = value >= 180
    }
  }
  if (roundSecondsDecrease && roundSecondsInput) {
    roundSecondsDecrease.addEventListener("click", () => {
      let value = Number(roundSecondsInput.value) || 60
      value = Math.max(10, value - 5)
      updateRoundSecondsUI(value)
    })
  }
  if (roundSecondsIncrease && roundSecondsInput) {
    roundSecondsIncrease.addEventListener("click", () => {
      let value = Number(roundSecondsInput.value) || 60
      value = Math.min(180, value + 5)
      updateRoundSecondsUI(value)
    })
  }
  const settlementSpeedInput = document.getElementById("setting-settlementSpeed") as HTMLInputElement | null
  const settlementSpeedDecrease = document.getElementById("settlementSpeedDecrease") as HTMLButtonElement | null
  const settlementSpeedIncrease = document.getElementById("settlementSpeedIncrease") as HTMLButtonElement | null
  function updateSettlementSpeedUI(value: number) {
    if (settlementSpeedInput) {
      settlementSpeedInput.value = String(value)
    }
    if (settlementSpeedDecrease) {
      settlementSpeedDecrease.disabled = value <= 1
    }
    if (settlementSpeedIncrease) {
      settlementSpeedIncrease.disabled = value >= 5
    }
  }
  if (settlementSpeedDecrease && settlementSpeedInput) {
    settlementSpeedDecrease.addEventListener("click", () => {
      let value = Number(settlementSpeedInput.value) || 3
      value = Math.max(1, value - 1)
      updateSettlementSpeedUI(value)
    })
  }
  if (settlementSpeedIncrease && settlementSpeedInput) {
    settlementSpeedIncrease.addEventListener("click", () => {
      let value = Number(settlementSpeedInput.value) || 3
      value = Math.min(5, value + 1)
      updateSettlementSpeedUI(value)
    })
  }
  const contextLengthInput = document.getElementById("setting-llm-contextLength") as HTMLInputElement | null
  const contextLengthDecrease = document.getElementById("contextLengthDecrease") as HTMLButtonElement | null
  const contextLengthIncrease = document.getElementById("contextLengthIncrease") as HTMLButtonElement | null
  function updateContextLengthUI(value: number) {
    if (contextLengthInput) {
      contextLengthInput.value = String(value)
    }
    if (contextLengthDecrease) {
      contextLengthDecrease.disabled = value <= 0
    }
    if (contextLengthIncrease) {
      contextLengthIncrease.disabled = value >= 8
    }
  }
  if (contextLengthDecrease && contextLengthInput) {
    contextLengthDecrease.addEventListener("click", () => {
      let value = Number(contextLengthInput.value) || 0
      value = Math.max(0, value - 1)
      updateContextLengthUI(value)
    })
  }
  if (contextLengthIncrease && contextLengthInput) {
    contextLengthIncrease.addEventListener("click", () => {
      let value = Number(contextLengthInput.value) || 0
      value = Math.min(8, value + 1)
      updateContextLengthUI(value)
    })
  }
  const multiGameMemoryCb = document.getElementById("setting-llm-multiGameMemoryEnabled") as HTMLInputElement | null
  if (multiGameMemoryCb) {
    multiGameMemoryCb.addEventListener("change", () => {
      const enabled = multiGameMemoryCb.checked
      if (this.dom.clearAiMemoryBtn) {
        this.dom.clearAiMemoryBtn.style.display = enabled ? "" : "none"
      }
      if (this.dom.viewAiMemoryBtn) {
        this.dom.viewAiMemoryBtn.style.display = enabled ? "" : "none"
      }
    })
  }
  const reflectionCb = document.getElementById("setting-llm-reflectionEnabled") as HTMLInputElement | null
  if (reflectionCb) {
    reflectionCb.addEventListener("change", () => {
      // placeholder for future reflection-related UI
    })
  }
  const musicVolumeSlider = document.getElementById("setting-musicVolume") as HTMLInputElement | null
  const musicVolumeValue = document.getElementById("musicVolumeValue")
  const musicVolumeIconImg = document.getElementById("musicVolumeIconImg") as HTMLImageElement | null
  if (musicVolumeSlider) {
    musicVolumeSlider.addEventListener("input", () => {
      const vol = Number(musicVolumeSlider.value)
      if (musicVolumeValue) {
        musicVolumeValue.textContent = `${vol}%`
      }
      if (typeof AudioManager !== "undefined") {
        AudioManager.setMusicVolume(vol / 100)
      }
      updateVolumeIcon(String(vol), musicVolumeIconImg)
    })
    const musicVolumeIcon = document.getElementById("musicVolumeIcon")
    if (musicVolumeIcon) {
      musicVolumeIcon.addEventListener("click", () => {
        const currentVol = Number(musicVolumeSlider.value)
        const newVol = currentVol > 0 ? 0 : 50
        musicVolumeSlider.value = String(newVol)
        if (musicVolumeValue) {
          musicVolumeValue.textContent = `${newVol}%`
        }
        if (typeof AudioManager !== "undefined") {
          AudioManager.setMusicVolume(newVol / 100)
        }
        updateVolumeIcon(String(newVol), musicVolumeIconImg)
      })
    }
  }
  const sfxVolumeSlider = document.getElementById("setting-sfxVolume") as HTMLInputElement | null
  const sfxVolumeValue = document.getElementById("sfxVolumeValue")
  const sfxVolumeIconImg = document.getElementById("sfxVolumeIconImg") as HTMLImageElement | null
  if (sfxVolumeSlider) {
    sfxVolumeSlider.addEventListener("input", () => {
      const vol = Number(sfxVolumeSlider.value)
      if (sfxVolumeValue) {
        sfxVolumeValue.textContent = `${vol}%`
      }
      if (typeof AudioManager !== "undefined") {
        AudioManager.setSfxVolume(vol / 100)
      }
      updateVolumeIcon(String(vol), sfxVolumeIconImg)
    })
    const sfxVolumeIcon = document.getElementById("sfxVolumeIcon")
    if (sfxVolumeIcon) {
      sfxVolumeIcon.addEventListener("click", () => {
        const currentVol = Number(sfxVolumeSlider.value)
        const newVol = currentVol > 0 ? 0 : 50
        sfxVolumeSlider.value = String(newVol)
        if (sfxVolumeValue) {
          sfxVolumeValue.textContent = `${newVol}%`
        }
        if (typeof AudioManager !== "undefined") {
          AudioManager.setSfxVolume(newVol / 100)
        }
        updateVolumeIcon(String(newVol), sfxVolumeIconImg)
      })
    }
  }
  const gameShopBtn = document.getElementById("gameShopBtn")
  if (gameShopBtn) {
    gameShopBtn.addEventListener("click", () => this.openShopOverlay())
  }
  const backToLobbyBtn = document.getElementById("backToLobbyBtn")
  if (backToLobbyBtn) {
    backToLobbyBtn.addEventListener("click", () => {
      this.roundManager.stopRoundTimer()
      this.enterLobby()
    })
  }
  this.dom.nextRoundBtn?.addEventListener("click", () => this.resolveRoundBids("manual"))
  if (this.dom.pauseRoundBtn) {
    this.dom.pauseRoundBtn?.addEventListener("click", () => this.roundManager.toggleRoundPause())
  }
  this.dom.autoPlayToggle?.addEventListener("click", () => {
    this.autoplayManager.toggle()
  })
}

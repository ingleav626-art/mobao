/**
 * @file audio/audio-ui.js
 * @module audio/ui
 * @description 音频 UI 交互层。采用对象字面量单例模式，挂载到 window.AudioUI。
 *              监听 DOM 交互事件（点击、键盘），自动为 UI 元素播放对应音效。
 *              提供 API 供业务代码主动触发特定音效。
 *
 * 核心功能：
 *   - init(): 初始化，绑定全局 click/keydown 事件委托
 *   - 自动音效：点击按钮/键盘激活时自动播放音效
 *     选择器匹配: 'button, .btn, [role="button"], .clickable, .tab, .menu-item'
 *     跳过条件: data-no-sound="true"、disabled、.disabled
 *   - 音效路由（_getSoundForElement）优先级：
 *     1. data-sound 属性 → 自定义音效名
 *     2. _customBindings 匹配（id 或 CSS 选择器）
 *
 * 3. 默认 'click' 音效
* - bindSound(selector, soundName) / unbindSound(selector): 动态绑定 / 解绑
*
 * 业务快捷方法：
 * - playClick / playCoin / playReveal / playWin / playLose
  * - playCountdown / stopCountdown: 可停止音效（倒计时）
 * - playRound / playSkill(skillName)
  * - startSearch / stopSearch: 搜索音效控制
    * - playSettlementReveal(qualityKey): 按品质播放揭示音效
      * legendary → revealLegendary, rare → revealRare, 其他 → revealNormal
        * - play(soundName, options): 通用播放
          *
 * @requires AudioManager - 音频管理器（scripts / audio / audio - manager.js）
 *
 * @exports window.AudioUI - 音频 UI 交互层单例
  */

import { AudioManager } from "./audio-manager"

const AudioUI: Record<string, any> = {
  _initialized: false as boolean,
  _clickSelector: 'button, .btn, [role="button"], .clickable, .tab, .menu-item',
  _hoverSelector: ".hover-sound",
  _customBindings: new Map<string, string>(),

  init(): void {
    if (this._initialized) return

    document.addEventListener("click", this._handleClick.bind(this), true)
    document.addEventListener("keydown", this._handleKeydown.bind(this), true)

    document.querySelectorAll('button[id*="Close"]').forEach((btn) => {
      this._customBindings.set(btn.id, "close")
    })

    this._initialized = true
    console.log("[AudioUI] Initialized")
  },

  _handleClick(e: MouseEvent): void {
    if (!AudioManager._enabled || !AudioManager._sfxEnabled) return

    const target = (e.target as HTMLElement).closest(this._clickSelector)
    if (target) {
      if (target.dataset.noSound === "true") return
      if (target.disabled || target.classList.contains("disabled")) return

      const soundName = this._getSoundForElement(target as HTMLElement)
      const volume = parseFloat((target as HTMLElement).dataset.soundVolume || "") || 0.8

        ; AudioManager.playSfx(soundName, { volume })
    }
  },

  _handleKeydown(e: KeyboardEvent): void {
    if (!AudioManager._enabled || !AudioManager._sfxEnabled) return

    if (e.key === "Enter" || e.key === " ") {
      const activeEl = document.activeElement as HTMLElement
      if (activeEl && activeEl.matches(this._clickSelector)) {
        if (activeEl.dataset.noSound === "true") return
        if ((activeEl as HTMLButtonElement).disabled || activeEl.classList.contains("disabled")) return

        const soundName = this._getSoundForElement(activeEl as HTMLElement)
        const volume = parseFloat((activeEl as HTMLElement).dataset.soundVolume || "") || 0.8

          ; AudioManager.playSfx(soundName, { volume })
      }
    }
  },

  _getSoundForElement(el: HTMLElement): string {
    if (el.dataset.sound) {
      return el.dataset.sound
    }

    if (el.id && this._customBindings.has(el.id)) {
      return this._customBindings.get(el.id)
    }

    for (const [selector, sound] of this._customBindings) {
      if (selector.startsWith(".") || selector.startsWith("[")) {
        if (el.matches(selector)) {
          return sound
        }
      }
    }

    return "click"
  },

  bindSound(selector: string, soundName: string): void {
    this._customBindings.set(selector, soundName)
  },

  unbindSound(selector: string): void {
    this._customBindings.delete(selector)
  },

  playClick(): void {
    ; AudioManager.playSfx("click")
  },

  playCoin(): void {
    ; AudioManager.playSfx("coin")
  },

  playReveal(): void {
    ; AudioManager.playSfx("reveal", { volume: 0.5 })
  },

  playWin(): void {
    ; AudioManager.playSfx("win")
  },

  playLose(): void {
    ; AudioManager.playSfx("lose")
  },

  playCountdown(): void {
    ; AudioManager.playStopableSfx("countdown")
  },

  stopCountdown(): void {
    ; AudioManager.stopStopableSfx("countdown")
  },

  playRound(): void {
    ; AudioManager.playSfx("round")
  },

  playSkill(skillName: string): void {
    ; AudioManager.playSfx(skillName)
  },

  play(soundName: string, options: Record<string, any> = {}): void {
    ; AudioManager.playSfx(soundName, options)
  },

  startSearch(): void {
    ; AudioManager.playStopableSfx("search", { volume: 1 })
  },

  stopSearch(): void {
    ; AudioManager.stopStopableSfx("search")
  },

  playSettlementReveal(qualityKey: string): void {
    if (qualityKey === "legendary") {
      ; AudioManager.playSfx("revealLegendary", { volume: 0.8 })
    } else if (qualityKey === "rare") {
      ; AudioManager.playSfx("revealRare", { volume: 0.7 })
    } else {
      ; AudioManager.playSfx("revealNormal", { volume: 0.6 })
    }
  }
}

export { AudioUI }

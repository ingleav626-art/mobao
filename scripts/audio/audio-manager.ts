/**
 * @file audio/audio-manager.ts
 * @module audio/audio-manager
 * @description 音频管理器。采用对象字面量单例模式，挂载到 window.AudioManager。
 *              管理游戏所有音效（SFX）和背景音乐（BGM）的加载、播放、控制和持久化设置。
 *
 * 音频资源分类（sounds 对象）：
 *   - ui: click, close
 *   - game: coin, reveal, coinsReveal, search, win, lose, countdown, round,
 *           revealNormal, revealRare, revealLegendary
 *   - skill: scan, identify
 *   - bgm: lobby, game
 *
 * 核心功能：
 *   - init(): 初始化（创建 AudioContext、加载设置）
 *   - preload(category, keys): 按分类预加载音频（5秒超时、cloneNode 播放）
 *   - playSfx(key, options): 播放一次性音效（cloneNode 避免冲突，支持 volume/playbackRate）
 *   - playLoopingSfx(key, options): 播放循环音效（自动停止同 key 旧实例）
 *   - stopLoopingSfx(key) / stopAllLoopingSfx(): 停止循环音效
 *   - playStopableSfx(key, options): 播放可中途停止的音效（onended 自动清理）
 *   - stopStopableSfx(key): 停止可停止音效
 *   - playBgm(key, options): 播放背景音乐（自动停止旧 BGM，支持 loop）
 *   - stopBgm(fadeOut): 停止 BGM（支持淡出，fadeOut=秒数）
 *   - pauseBgm() / resumeBgm(): 暂停/恢复 BGM
 *
 * 设置持久化：
 *   - _loadSettings(): 从 localStorage 读取（mobao_audio_settings + mobao_settings 音量）
 *   - _saveSettings(): 保存到 localStorage
 *   - setEnabled / setBgmEnabled / setSfxEnabled / setBgmVolume / setSfxVolume
 *   - getSettings(): 获取当前设置快照
 *
 * @requires localStorage - 设置持久化
 *
 * @exports window.AudioManager - 音频管理器单例
 */
interface SoundEntry {
  path: string;
  loaded: boolean;
  audio: HTMLAudioElement | null;
}

const AUDIO_SETTINGS_STORAGE_KEY = "mobao_audio_settings"

const AudioManager: Record<string, any> = {
  _initialized: false as boolean,
  _enabled: true as boolean,
  _bgmEnabled: true as boolean,
  _sfxEnabled: true as boolean,
  _bgmVolume: 0.5 as number,
  _sfxVolume: 0.7 as number,
  _currentBgm: null as string | null,
  _bgmAudio: null as HTMLAudioElement | null,
  _sfxPool: new Map<string, SoundEntry>(),
  _loopingSfx: new Map<string, HTMLAudioElement>(),
  _stopableSfx: new Map<string, HTMLAudioElement>(),
  _audioContext: null as AudioContext | null,

  sounds: {
    ui: {
      click: { path: "assets/audio/sfx/ui/keyboard.wav", loaded: false, audio: null },
      close: { path: "assets/audio/sfx/game/freesound_crunchpixstudio-fall-394469.mp3", loaded: false, audio: null }
    },
    game: {
      coin: { path: "assets/audio/sfx/game/coin.mp3", loaded: false, audio: null },
      reveal: { path: "assets/audio/sfx/game/reveal.wav", loaded: false, audio: null },
      coinsReveal: { path: "assets/audio/sfx/game/coins-sound.wav", loaded: false, audio: null },
      search: { path: "assets/audio/sfx/game/search.mp3", loaded: false, audio: null },
      win: { path: "assets/audio/sfx/game/win.mp3", loaded: false, audio: null },
      lose: { path: "assets/audio/sfx/game/lose.mp3", loaded: false, audio: null },
      countdown: { path: "assets/audio/sfx/game/countdown.wav", loaded: false, audio: null },
      round: { path: "assets/audio/sfx/game/round.mp3", loaded: false, audio: null },
      revealNormal: { path: "assets/audio/sfx/game/reveal-normal.mp3", loaded: false, audio: null },
      revealRare: { path: "assets/audio/sfx/game/reveal-rare.mp3", loaded: false, audio: null },
      revealLegendary: { path: "assets/audio/sfx/game/reveal-legendary.mp3", loaded: false, audio: null }
    },
    skill: {
      scan: { path: "assets/audio/sfx/skill/scan.mp3", loaded: false, audio: null },
      identify: { path: "assets/audio/sfx/skill/identify.mp3", loaded: false, audio: null }
    },
    bgm: {
      lobby: { path: "assets/audio/bgm/lobby.mp3", loaded: false, audio: null },
      game: { path: "assets/audio/bgm/game.mp3", loaded: false, audio: null }
    }
  },

  async init(): Promise<void> {
    if (this._initialized) return

    this._loadSettings()

    try {
      this._audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    } catch (_e) {
      console.warn("[AudioManager] Web Audio API not supported")
    }

    this._initialized = true
    console.log("[AudioManager] Initialized")
  },

  _loadSettings(): void {
    try {
      const saved = localStorage.getItem(AUDIO_SETTINGS_STORAGE_KEY)
      if (saved) {
        const settings = JSON.parse(saved)
        this._enabled = settings.enabled ?? true
        this._bgmEnabled = settings.bgmEnabled ?? true
        this._sfxEnabled = settings.sfxEnabled ?? true
        this._bgmVolume = settings.bgmVolume ?? 0.5
        this._sfxVolume = settings.sfxVolume ?? 0.7
      }
      const gameSettings = localStorage.getItem("mobao_settings")
      if (gameSettings) {
        const parsed = JSON.parse(gameSettings)
        if (typeof parsed.musicVolume === "number") {
          this._bgmVolume = parsed.musicVolume / 100
        }
        if (typeof parsed.sfxVolume === "number") {
          this._sfxVolume = parsed.sfxVolume / 100
        }
      }
    } catch (e) {
      console.warn("[AudioManager] Failed to load settings:", e)
    }
  },

  _saveSettings(): void {
    try {
      localStorage.setItem(
        AUDIO_SETTINGS_STORAGE_KEY,
        JSON.stringify({
          enabled: this._enabled,
          bgmEnabled: this._bgmEnabled,
          sfxEnabled: this._sfxEnabled,
          bgmVolume: this._bgmVolume,
          sfxVolume: this._sfxVolume
        })
      )
    } catch (e) {
      console.warn("[AudioManager] Failed to save settings:", e)
    }
  },

  async preload(category: string = "ui", keys: string[] | null = null): Promise<void> {
    const sounds = this.sounds[category]
    if (!sounds) return

    const toLoad = keys ? keys.filter((k) => sounds[k]) : Object.keys(sounds)

    for (const key of toLoad) {
      const sound = sounds[key]
      if (sound.loaded || sound.audio) continue

      try {
        const audio = new Audio()
        audio.preload = "auto"
        audio.src = sound.path
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error(`Load timeout: ${sound.path}`)), 5000)
          audio.oncanplaythrough = () => {
            clearTimeout(timer)
            resolve()
          }
          audio.onerror = () => {
            clearTimeout(timer)
            reject(new Error(`Failed to load: ${sound.path}`))
          }
        })
        sound.audio = audio
        sound.loaded = true
        console.log(`[AudioManager] Loaded: ${key}`)
      } catch (e: unknown) {
        console.warn(`[AudioManager] Preload failed for ${key}:`, (e as Error).message)
      }
    }
  },

  playSfx(key: string, options: Record<string, any> = {}): void {
    if (!this._enabled || !this._sfxEnabled) return

    let sound = null
    let soundCategory = null
    for (const category of ["ui", "game", "skill"]) {
      if (this.sounds[category][key]) {
        sound = this.sounds[category][key]
        soundCategory = category
        break
      }
    }

    if (!sound) {
      console.warn(`[AudioManager] SFX not found: ${key}`)
      return
    }

    if (!sound.loaded && sound.audio === null) {
      this.preload(soundCategory, [key]).then(() => this.playSfx(key, options))
      return
    }

    try {
      const audio = sound.audio.cloneNode()
      audio.volume = (options.volume ?? 1) * this._sfxVolume
      audio.playbackRate = options.playbackRate ?? 1
      audio.play().catch((e: Error) => console.warn(`[AudioManager] Play failed: ${key}`, e.message))
    } catch (e) {
      console.warn(`[AudioManager] SFX play error: ${key}`, e)
    }
  },

  playLoopingSfx(key: string, options: Record<string, any> = {}): void {
    if (!this._enabled || !this._sfxEnabled) return

    this.stopLoopingSfx(key)

    let sound = null
    for (const category of ["ui", "game", "skill"]) {
      if (this.sounds[category][key]) {
        sound = this.sounds[category][key]
        break
      }
    }

    if (!sound) {
      console.warn(`[AudioManager] Looping SFX not found: ${key}`)
      return
    }

    if (!sound.loaded && sound.audio === null) {
      this.preload("game", [key]).then(() => this.playLoopingSfx(key, options))
      return
    }

    try {
      const audio = sound.audio.cloneNode()
      audio.volume = (options.volume ?? 1) * this._sfxVolume
      audio.loop = options.loop ?? true
      audio.play().catch((e: Error) => console.warn(`[AudioManager] Looping SFX play failed: ${key}`, e.message))
      this._loopingSfx.set(key, audio)
    } catch (e) {
      console.warn(`[AudioManager] Looping SFX play error: ${key}`, e)
    }
  },

  stopLoopingSfx(key: string): void {
    const audio = this._loopingSfx.get(key)
    if (audio) {
      audio.pause()
      audio.currentTime = 0
      this._loopingSfx.delete(key)
    }
  },

  stopAllLoopingSfx(): void {
    this._loopingSfx.forEach((audio: HTMLAudioElement) => {
      audio.pause()
      audio.currentTime = 0
    })
    this._loopingSfx.clear()
  },

  playStopableSfx(key: string, options: Record<string, any> = {}): void {
    if (!this._enabled || !this._sfxEnabled) return

    this.stopStopableSfx(key)

    let sound = null
    for (const category of ["ui", "game", "skill"]) {
      if (this.sounds[category][key]) {
        sound = this.sounds[category][key]
        break
      }
    }

    if (!sound) {
      console.warn(`[AudioManager] Stopable SFX not found: ${key}`)
      return
    }

    if (!sound.loaded && sound.audio === null) {
      this.preload("game", [key]).then(() => this.playStopableSfx(key, options))
      return
    }

    try {
      const audio = sound.audio.cloneNode()
      audio.volume = (options.volume ?? 1) * this._sfxVolume
      audio.play().catch((e: Error) => console.warn(`[AudioManager] Stopable SFX play failed: ${key}`, e.message))
      this._stopableSfx.set(key, audio)

      audio.onended = () => {
        this._stopableSfx.delete(key)
      }
    } catch (e) {
      console.warn(`[AudioManager] Stopable SFX play error: ${key}`, e)
    }
  },

  stopStopableSfx(key: string): void {
    const audio = this._stopableSfx.get(key)
    if (audio) {
      audio.pause()
      audio.currentTime = 0
      this._stopableSfx.delete(key)
    }
  },

  playBgm(key: string, options: Record<string, any> = {}): void {
    if (!this._enabled || !this._bgmEnabled) return

    const sound = this.sounds.bgm[key]
    if (!sound) {
      console.warn(`[AudioManager] BGM not found: ${key}`)
      return
    }

    if (this._currentBgm === key && this._bgmAudio && !this._bgmAudio.paused) {
      return
    }

    this.stopBgm()

    if (!sound.loaded && sound.audio === null) {
      this.preload("bgm", [key]).then(() => this.playBgm(key, options))
      return
    }

    try {
      this._bgmAudio = sound.audio.cloneNode()
      this._bgmAudio.volume = (options.volume ?? 1) * this._bgmVolume
      this._bgmAudio.loop = options.loop ?? true
      this._bgmAudio.play().catch((e: Error) => console.warn(`[AudioManager] BGM play failed: ${key}`, e.message))
      this._currentBgm = key
    } catch (e) {
      console.warn(`[AudioManager] BGM play error: ${key}`, e)
    }
  },

  stopBgm(fadeOut: number = 0): void {
    if (!this._bgmAudio) return

    if (fadeOut > 0) {
      const audio = this._bgmAudio
      const step = audio.volume / (fadeOut * 60)
      const fade = setInterval(() => {
        audio.volume -= step
        if (audio.volume <= 0) {
          clearInterval(fade)
          audio.pause()
          audio.currentTime = 0
        }
      }, 1000 / 60)
    } else {
      this._bgmAudio.pause()
      this._bgmAudio.currentTime = 0
    }

    this._currentBgm = null
  },

  pauseBgm(): void {
    if (this._bgmAudio && !this._bgmAudio.paused) {
      this._bgmAudio.pause()
    }
  },

  resumeBgm(): void {
    if (this._bgmAudio && this._bgmAudio.paused && this._bgmEnabled) {
      this._bgmAudio.play().catch(() => { })
    }
  },

  setEnabled(enabled: boolean): void {
    this._enabled = enabled
    if (!enabled) {
      this.stopBgm()
    }
    this._saveSettings()
  },

  setBgmEnabled(enabled: boolean): void {
    this._bgmEnabled = enabled
    if (!enabled) {
      this.stopBgm()
    } else if (this._currentBgm) {
      this.playBgm(this._currentBgm)
    }
    this._saveSettings()
  },

  setSfxEnabled(enabled: boolean): void {
    this._sfxEnabled = enabled
    this._saveSettings()
  },

  setBgmVolume(volume: number): void {
    this._bgmVolume = Math.max(0, Math.min(1, volume))
    if (this._bgmAudio) {
      this._bgmAudio.volume = this._bgmVolume
    }
    this._saveSettings()
  },

  setSfxVolume(volume: number): void {
    this._sfxVolume = Math.max(0, Math.min(1, volume))
    this._saveSettings()
  },

  getSettings(): Record<string, any> {
    return {
      enabled: this._enabled,
      bgmEnabled: this._bgmEnabled,
      sfxEnabled: this._sfxEnabled,
      bgmVolume: this._bgmVolume,
      sfxVolume: this._sfxVolume
    }
  },

  isBgmPlaying(): boolean {
    return this._bgmAudio && !this._bgmAudio.paused
  },

  getCurrentBgm(): string | null {
    return this._currentBgm
  }
}
export { AudioManager }


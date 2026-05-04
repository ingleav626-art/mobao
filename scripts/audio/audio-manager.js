const AudioManager = {
    _initialized: false,
    _enabled: true,
    _bgmEnabled: true,
    _sfxEnabled: true,
    _bgmVolume: 0.5,
    _sfxVolume: 0.7,
    _currentBgm: null,
    _bgmAudio: null,
    _sfxPool: new Map(),
    _loopingSfx: new Map(),
    _stopableSfx: new Map(),
    _audioContext: null,

    sounds: {
        ui: {
            click: { path: 'assets/audio/sfx/ui/keyboard.wav', loaded: false, audio: null }
        },
        game: {
            coin: { path: 'assets/audio/sfx/game/coin.mp3', loaded: false, audio: null },
            reveal: { path: 'assets/audio/sfx/game/reveal.wav', loaded: false, audio: null },
            coinsReveal: { path: 'assets/audio/sfx/game/coins-sound.wav', loaded: false, audio: null },
            search: { path: 'assets/audio/sfx/game/search.mp3', loaded: false, audio: null },
            win: { path: 'assets/audio/sfx/game/win.mp3', loaded: false, audio: null },
            lose: { path: 'assets/audio/sfx/game/lose.mp3', loaded: false, audio: null },
            countdown: { path: 'assets/audio/sfx/game/countdown.wav', loaded: false, audio: null },
            round: { path: 'assets/audio/sfx/game/round.mp3', loaded: false, audio: null }
        },
        skill: {
            scan: { path: 'assets/audio/sfx/skill/scan.mp3', loaded: false, audio: null },
            identify: { path: 'assets/audio/sfx/skill/identify.mp3', loaded: false, audio: null }
        },
        bgm: {
            lobby: { path: 'assets/audio/bgm/lobby.mp3', loaded: false, audio: null },
            bidding: { path: 'assets/audio/bgm/bidding.mp3', loaded: false, audio: null },
            settlement: { path: 'assets/audio/bgm/settlement.mp3', loaded: false, audio: null }
        }
    },

    async init() {
        if (this._initialized) return;

        this._loadSettings();

        try {
            this._audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('[AudioManager] Web Audio API not supported');
        }

        this._initialized = true;
        console.log('[AudioManager] Initialized');
    },

    _loadSettings() {
        try {
            const saved = localStorage.getItem('mobao_audio_settings');
            if (saved) {
                const settings = JSON.parse(saved);
                this._enabled = settings.enabled ?? true;
                this._bgmEnabled = settings.bgmEnabled ?? true;
                this._sfxEnabled = settings.sfxEnabled ?? true;
                this._bgmVolume = settings.bgmVolume ?? 0.5;
                this._sfxVolume = settings.sfxVolume ?? 0.7;
            }
        } catch (e) {
            console.warn('[AudioManager] Failed to load settings:', e);
        }
    },

    _saveSettings() {
        try {
            localStorage.setItem('mobao_audio_settings', JSON.stringify({
                enabled: this._enabled,
                bgmEnabled: this._bgmEnabled,
                sfxEnabled: this._sfxEnabled,
                bgmVolume: this._bgmVolume,
                sfxVolume: this._sfxVolume
            }));
        } catch (e) {
            console.warn('[AudioManager] Failed to save settings:', e);
        }
    },

    async preload(category = 'ui', keys = null) {
        const sounds = this.sounds[category];
        if (!sounds) return;

        const toLoad = keys ? keys.filter(k => sounds[k]) : Object.keys(sounds);

        for (const key of toLoad) {
            const sound = sounds[key];
            if (sound.loaded || sound.audio) continue;

            try {
                const audio = new Audio();
                audio.preload = 'auto';
                audio.src = sound.path;
                await new Promise((resolve, reject) => {
                    const timer = setTimeout(() => reject(new Error(`Load timeout: ${sound.path}`)), 5000);
                    audio.oncanplaythrough = () => { clearTimeout(timer); resolve(); };
                    audio.onerror = () => { clearTimeout(timer); reject(new Error(`Failed to load: ${sound.path}`)); };
                });
                sound.audio = audio;
                sound.loaded = true;
                console.log(`[AudioManager] Loaded: ${key}`);
            } catch (e) {
                console.warn(`[AudioManager] Preload failed for ${key}:`, e.message);
            }
        }
    },

    playSfx(key, options = {}) {
        if (!this._enabled || !this._sfxEnabled) return;

        let sound = null;
        let soundCategory = null;
        for (const category of ['ui', 'game', 'skill']) {
            if (this.sounds[category][key]) {
                sound = this.sounds[category][key];
                soundCategory = category;
                break;
            }
        }

        if (!sound) {
            console.warn(`[AudioManager] SFX not found: ${key}`);
            return;
        }

        if (!sound.loaded && sound.audio === null) {
            this.preload(soundCategory, [key]).then(() => this.playSfx(key, options));
            return;
        }

        try {
            const audio = sound.audio.cloneNode();
            audio.volume = (options.volume ?? 1) * this._sfxVolume;
            audio.playbackRate = options.playbackRate ?? 1;
            audio.play().catch(e => console.warn(`[AudioManager] Play failed: ${key}`, e.message));
        } catch (e) {
            console.warn(`[AudioManager] SFX play error: ${key}`, e);
        }
    },

    playLoopingSfx(key, options = {}) {
        if (!this._enabled || !this._sfxEnabled) return;

        this.stopLoopingSfx(key);

        let sound = null;
        for (const category of ['ui', 'game', 'skill']) {
            if (this.sounds[category][key]) {
                sound = this.sounds[category][key];
                break;
            }
        }

        if (!sound) {
            console.warn(`[AudioManager] Looping SFX not found: ${key}`);
            return;
        }

        if (!sound.loaded && sound.audio === null) {
            this.preload('game', [key]).then(() => this.playLoopingSfx(key, options));
            return;
        }

        try {
            const audio = sound.audio.cloneNode();
            audio.volume = (options.volume ?? 1) * this._sfxVolume;
            audio.loop = options.loop ?? true;
            audio.play().catch(e => console.warn(`[AudioManager] Looping SFX play failed: ${key}`, e.message));
            this._loopingSfx.set(key, audio);
        } catch (e) {
            console.warn(`[AudioManager] Looping SFX play error: ${key}`, e);
        }
    },

    stopLoopingSfx(key) {
        const audio = this._loopingSfx.get(key);
        if (audio) {
            audio.pause();
            audio.currentTime = 0;
            this._loopingSfx.delete(key);
        }
    },

    stopAllLoopingSfx() {
        this._loopingSfx.forEach((audio, key) => {
            audio.pause();
            audio.currentTime = 0;
        });
        this._loopingSfx.clear();
    },

    playStopableSfx(key, options = {}) {
        if (!this._enabled || !this._sfxEnabled) return;

        this.stopStopableSfx(key);

        let sound = null;
        for (const category of ['ui', 'game', 'skill']) {
            if (this.sounds[category][key]) {
                sound = this.sounds[category][key];
                break;
            }
        }

        if (!sound) {
            console.warn(`[AudioManager] Stopable SFX not found: ${key}`);
            return;
        }

        if (!sound.loaded && sound.audio === null) {
            this.preload('game', [key]).then(() => this.playStopableSfx(key, options));
            return;
        }

        try {
            const audio = sound.audio.cloneNode();
            audio.volume = (options.volume ?? 1) * this._sfxVolume;
            audio.play().catch(e => console.warn(`[AudioManager] Stopable SFX play failed: ${key}`, e.message));
            this._stopableSfx.set(key, audio);

            audio.onended = () => {
                this._stopableSfx.delete(key);
            };
        } catch (e) {
            console.warn(`[AudioManager] Stopable SFX play error: ${key}`, e);
        }
    },

    stopStopableSfx(key) {
        const audio = this._stopableSfx.get(key);
        if (audio) {
            audio.pause();
            audio.currentTime = 0;
            this._stopableSfx.delete(key);
        }
    },

    playBgm(key, options = {}) {
        if (!this._enabled || !this._bgmEnabled) return;

        const sound = this.sounds.bgm[key];
        if (!sound) {
            console.warn(`[AudioManager] BGM not found: ${key}`);
            return;
        }

        if (this._currentBgm === key && this._bgmAudio && !this._bgmAudio.paused) {
            return;
        }

        this.stopBgm();

        if (!sound.loaded && sound.audio === null) {
            this.preload('bgm', [key]).then(() => this.playBgm(key, options));
            return;
        }

        try {
            this._bgmAudio = sound.audio.cloneNode();
            this._bgmAudio.volume = (options.volume ?? 1) * this._bgmVolume;
            this._bgmAudio.loop = options.loop ?? true;
            this._bgmAudio.play().catch(e => console.warn(`[AudioManager] BGM play failed: ${key}`, e.message));
            this._currentBgm = key;
        } catch (e) {
            console.warn(`[AudioManager] BGM play error: ${key}`, e);
        }
    },

    stopBgm(fadeOut = 0) {
        if (!this._bgmAudio) return;

        if (fadeOut > 0) {
            const audio = this._bgmAudio;
            const step = audio.volume / (fadeOut * 60);
            const fade = setInterval(() => {
                audio.volume -= step;
                if (audio.volume <= 0) {
                    clearInterval(fade);
                    audio.pause();
                    audio.currentTime = 0;
                }
            }, 1000 / 60);
        } else {
            this._bgmAudio.pause();
            this._bgmAudio.currentTime = 0;
        }

        this._currentBgm = null;
    },

    pauseBgm() {
        if (this._bgmAudio && !this._bgmAudio.paused) {
            this._bgmAudio.pause();
        }
    },

    resumeBgm() {
        if (this._bgmAudio && this._bgmAudio.paused && this._bgmEnabled) {
            this._bgmAudio.play().catch(() => { });
        }
    },

    setEnabled(enabled) {
        this._enabled = enabled;
        if (!enabled) {
            this.stopBgm();
        }
        this._saveSettings();
    },

    setBgmEnabled(enabled) {
        this._bgmEnabled = enabled;
        if (!enabled) {
            this.stopBgm();
        } else if (this._currentBgm) {
            this.playBgm(this._currentBgm);
        }
        this._saveSettings();
    },

    setSfxEnabled(enabled) {
        this._sfxEnabled = enabled;
        this._saveSettings();
    },

    setBgmVolume(volume) {
        this._bgmVolume = Math.max(0, Math.min(1, volume));
        if (this._bgmAudio) {
            this._bgmAudio.volume = this._bgmVolume;
        }
        this._saveSettings();
    },

    setSfxVolume(volume) {
        this._sfxVolume = Math.max(0, Math.min(1, volume));
        this._saveSettings();
    },

    getSettings() {
        return {
            enabled: this._enabled,
            bgmEnabled: this._bgmEnabled,
            sfxEnabled: this._sfxEnabled,
            bgmVolume: this._bgmVolume,
            sfxVolume: this._sfxVolume
        };
    },

    isBgmPlaying() {
        return this._bgmAudio && !this._bgmAudio.paused;
    },

    getCurrentBgm() {
        return this._currentBgm;
    }
};

window.AudioManager = AudioManager;

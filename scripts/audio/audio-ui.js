const AudioUI = {
    _initialized: false,
    _clickSelector: 'button, .btn, [role="button"], .clickable, .tab, .menu-item',
    _hoverSelector: '.hover-sound',
    _customBindings: new Map(),

    init() {
        if (this._initialized) return;

        document.addEventListener('click', this._handleClick.bind(this), true);
        document.addEventListener('keydown', this._handleKeydown.bind(this), true);

        this._initialized = true;
        console.log('[AudioUI] Initialized');
    },

    _handleClick(e) {
        if (!AudioManager._enabled || !AudioManager._sfxEnabled) return;

        const target = e.target.closest(this._clickSelector);
        if (target) {
            if (target.dataset.noSound === 'true') return;
            if (target.disabled || target.classList.contains('disabled')) return;

            const soundName = this._getSoundForElement(target);
            const volume = parseFloat(target.dataset.soundVolume) || 0.8;

            AudioManager.playSfx(soundName, { volume });
        }
    },

    _handleKeydown(e) {
        if (!AudioManager._enabled || !AudioManager._sfxEnabled) return;

        if (e.key === 'Enter' || e.key === ' ') {
            const activeEl = document.activeElement;
            if (activeEl && activeEl.matches(this._clickSelector)) {
                if (activeEl.dataset.noSound === 'true') return;
                if (activeEl.disabled || activeEl.classList.contains('disabled')) return;

                const soundName = this._getSoundForElement(activeEl);
                const volume = parseFloat(activeEl.dataset.soundVolume) || 0.8;

                AudioManager.playSfx(soundName, { volume });
            }
        }
    },

    _getSoundForElement(el) {
        if (el.dataset.sound) {
            return el.dataset.sound;
        }

        if (el.id && this._customBindings.has(el.id)) {
            return this._customBindings.get(el.id);
        }

        for (const [selector, sound] of this._customBindings) {
            if (selector.startsWith('.') || selector.startsWith('[')) {
                if (el.matches(selector)) {
                    return sound;
                }
            }
        }

        return 'click';
    },

    bindSound(selector, soundName) {
        this._customBindings.set(selector, soundName);
    },

    unbindSound(selector) {
        this._customBindings.delete(selector);
    },

    playClick() {
        AudioManager.playSfx('click');
    },

    playCoin() {
        AudioManager.playSfx('coin');
    },

    playReveal() {
        AudioManager.playSfx('reveal', { volume: 0.5 });
    },

    playWin() {
        AudioManager.playSfx('win');
    },

    playLose() {
        AudioManager.playSfx('lose');
    },

    playCountdown() {
        AudioManager.playStopableSfx('countdown');
    },

    stopCountdown() {
        AudioManager.stopStopableSfx('countdown');
    },

    playRound() {
        AudioManager.playSfx('round');
    },

    playSkill(skillName) {
        AudioManager.playSfx(skillName);
    },

    play(soundName, options = {}) {
        AudioManager.playSfx(soundName, options);
    },

    startSearch() {
        AudioManager.playStopableSfx('search', { volume: 1 });
    },

    stopSearch() {
        AudioManager.stopStopableSfx('search');
    }
};

window.AudioUI = AudioUI;

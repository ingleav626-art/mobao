(function (global) {
  'use strict';

  var MobileHandler = {
    isMobile: false,
    isTouch: false,
    portraitOverlay: null,
    fixedInputOverlay: null,
    fixedInputElement: null,
    fixedInputContainer: null,
    originalInput: null,
    isHidingFixedInput: false,
    currentKeyboardHeight: 0,
    screenHeight: 0,
    pollIntervalId: null,

    init: function () {
      this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      this.isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      this.screenHeight = window.innerHeight;

      console.log('[MobileHandler] init - isMobile:', this.isMobile, 'isTouch:', this.isTouch,
        'hasAndroidKeyboard:', typeof AndroidKeyboard !== 'undefined',
        'screenHeight:', this.screenHeight);

      this.portraitOverlay = document.getElementById('portraitOverlay');

      this.createFixedInputOverlay();
      this.setupOrientationCheck();
      this.setupKeyboardHandler();
      this.setupVibrationFeedback();
      this.setupCustomSelects();
      this.setupNativeKeyboardListener();
    },

    createFixedInputOverlay: function () {
      var overlay = document.createElement('div');
      overlay.id = 'fixedInputOverlay';
      overlay.className = 'fixed-input-overlay';
      overlay.innerHTML = '\
        <div class="fixed-input-container" id="fixedInputContainer">\
          <input type="text" id="fixedInputField" class="fixed-input-field" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">\
          <button type="button" class="fixed-input-close" id="fixedInputClose">完成</button>\
        </div>';
      document.body.appendChild(overlay);

      this.fixedInputOverlay = overlay;
      this.fixedInputElement = overlay.querySelector('#fixedInputField');
      this.fixedInputContainer = overlay.querySelector('#fixedInputContainer');
      var closeBtn = overlay.querySelector('#fixedInputClose');

      var self = this;

      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) {
          self.hideFixedInput();
        }
      });

      closeBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        self.hideFixedInput();
      });

      this.fixedInputElement.addEventListener('input', function (e) {
        if (self.originalInput) {
          self.originalInput.value = e.target.value;
          self.originalInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });

      this.fixedInputElement.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          self.hideFixedInput();
          return;
        }
        if (self.originalInput) {
          self.originalInput.dispatchEvent(new KeyboardEvent('keydown', { key: e.key, code: e.code, bubbles: true }));
        }
      });
    },

    setupNativeKeyboardListener: function () {
      var self = this;

      window.__onKeyboardChange = function (height) {
        self.handleKeyboardHeightChange(parseInt(height) || 0);
      };

      document.addEventListener('keyboardchange', function (e) {
        var height = e.detail && e.detail.height ? parseInt(e.detail.height) : 0;
        self.handleKeyboardHeightChange(height);
      });
    },

    handleKeyboardHeightChange: function (rawHeight) {
      if (!this.fixedInputOverlay || !this.fixedInputOverlay.classList.contains('show')) {
        return;
      }

      var safeHeight = this.calculateSafeKeyboardHeight(rawHeight);

      if (safeHeight !== this.currentKeyboardHeight && Math.abs(safeHeight - this.currentKeyboardHeight) > 10) {
        this.currentKeyboardHeight = safeHeight;
        this.updateInputPosition();
        console.log('[MobileHandler] keyboard updated - raw:', rawHeight, '→ safe:', safeHeight, 'bottom:', (safeHeight + (this.fixedInputContainer.offsetHeight || 80)) + 'px');
      }
    },

    calculateSafeKeyboardHeight: function (rawHeight) {
      var containerHeight = this.fixedInputContainer ? (this.fixedInputContainer.offsetHeight || 80) : 80;
      var minSpaceForInput = containerHeight + 30;
      var maxKeyboardHeight = this.screenHeight - minSpaceForInput;

      if (rawHeight <= 0 || rawHeight < 100) {
        return 0;
      }

      if (rawHeight > this.screenHeight) {
        return Math.floor(maxKeyboardHeight * 0.85);
      }

      if (rawHeight > maxKeyboardHeight) {
        return maxKeyboardHeight;
      }

      return rawHeight;
    },

    startPolling: function () {
      var self = this;

      this.stopPolling();

      if (typeof AndroidKeyboard !== 'undefined' && AndroidKeyboard.getKeyboardHeight) {
        this.pollIntervalId = setInterval(function () {
          if (!self.fixedInputOverlay || !self.fixedInputOverlay.classList.contains('show')) {
            self.stopPolling();
            return;
          }

          var rawHeight = AndroidKeyboard.getKeyboardHeight();
          self.handleKeyboardHeightChange(rawHeight);
        }, 200);
      }
    },

    stopPolling: function () {
      if (this.pollIntervalId) {
        clearInterval(this.pollIntervalId);
        this.pollIntervalId = null;
      }
    },

    updateInputPosition: function () {
      if (!this.fixedInputContainer || !this.fixedInputOverlay || !this.fixedInputOverlay.classList.contains('show')) {
        return;
      }

      var kbHeight = this.currentKeyboardHeight;
      var containerHeight = this.fixedInputContainer.offsetHeight || 80;

      if (kbHeight > 50) {
        var bottomValue = (kbHeight + containerHeight) + 'px';
        this.fixedInputContainer.style.position = 'absolute';
        this.fixedInputContainer.style.bottom = bottomValue;
        this.fixedInputContainer.style.left = '0';
        this.fixedInputContainer.style.right = '0';

        var inputTop = this.screenHeight - kbHeight - containerHeight;
        console.log('[MobileHandler] ✅ positioned - bottom:', bottomValue, '| input visible at', inputTop.toFixed(0), '-', (inputTop + containerHeight).toFixed(0), 'px');
      } else {
        this.fixedInputContainer.style.position = '';
        this.fixedInputContainer.style.bottom = '';
        this.fixedInputContainer.style.left = '';
        this.fixedInputContainer.style.right = '';
      }
    },

    showFixedInput: function (input) {
      if (this.isHidingFixedInput) {
        return;
      }

      this.originalInput = input;
      this.screenHeight = window.innerHeight;
      this.currentKeyboardHeight = 0;

      console.log('[MobileHandler] show input - value:', input.value.substring(0, 20), 'screen:', this.screenHeight);

      var inputType = input.type || 'text';
      this.fixedInputElement.type = inputType === 'number' ? 'tel' : inputType;
      this.fixedInputElement.value = input.value;
      this.fixedInputElement.placeholder = input.placeholder || '';

      if (input.maxLength > 0) {
        this.fixedInputElement.maxLength = input.maxLength;
      }

      this.resetInputPosition();
      this.fixedInputOverlay.classList.add('show');

      var self = this;
      requestAnimationFrame(function () {
        self.fixedInputElement.focus();
        self.startPolling();

        setTimeout(function () { self.checkAndUpdatePosition(); }, 150);
        setTimeout(function () { self.checkAndUpdatePosition(); }, 350);
        setTimeout(function () { self.checkAndUpdatePosition(); }, 600);
      });
    },

    checkAndUpdatePosition: function () {
      if (!this.fixedInputOverlay || !this.fixedInputOverlay.classList.contains('show')) {
        return;
      }

      if (typeof AndroidKeyboard !== 'undefined') {
        var rawHeight = AndroidKeyboard.getKeyboardHeight();
        this.handleKeyboardHeightChange(rawHeight);
      } else {
        this.updateInputPosition();
      }
    },

    resetInputPosition: function () {
      this.fixedInputContainer.style.position = '';
      this.fixedInputContainer.style.bottom = '';
      this.fixedInputContainer.style.left = '';
      this.fixedInputContainer.style.right = '';
    },

    hideFixedInput: function () {
      var self = this;
      this.isHidingFixedInput = true;

      console.log('[MobileHandler] hide input');

      this.stopPolling();
      this.fixedInputElement.blur();
      this.fixedInputOverlay.classList.remove('show');
      this.resetInputPosition();

      var origInput = this.originalInput;
      this.originalInput = null;
      this.currentKeyboardHeight = 0;

      if (origInput) {
        origInput.blur();
      }

      setTimeout(function () {
        self.isHidingFixedInput = false;
      }, 200);
    },

    setupOrientationCheck: function () {
      var self = this;

      function checkOrientation() {
        self.screenHeight = window.innerHeight;

        if (!self.isMobile && !self.isTouch) return;
        var isPortrait = window.innerHeight > window.innerWidth;
        if (isPortrait) {
          if (self.portraitOverlay) {
            self.portraitOverlay.classList.add('show');
          }
          document.body.style.overflow = 'hidden';
        } else {
          if (self.portraitOverlay) {
            self.portraitOverlay.classList.remove('show');
          }
          document.body.style.overflow = '';
        }
      }

      checkOrientation();
      window.addEventListener('resize', checkOrientation);
      window.addEventListener('orientationchange', function () {
        setTimeout(checkOrientation, 100);
      });
    },

    setupKeyboardHandler: function () {
      var self = this;

      document.addEventListener('focusin', function (e) {
        var target = e.target;
        var isTextInput = (target.tagName === 'INPUT' &&
          (target.type === 'text' || target.type === 'search' ||
            target.type === 'tel' || target.type === 'url' ||
            target.type === 'email' || target.type === 'password' ||
            target.type === 'number' || !target.type)) ||
          target.tagName === 'TEXTAREA';

        if (isTextInput && !target.hasAttribute('data-no-fixed-input')) {
          if (self.isMobile || self.isTouch) {
            if (target.id === 'fixedInputField') return;
            if (self.isHidingFixedInput) return;

            e.preventDefault();
            e.stopPropagation();

            setTimeout(function () {
              target.blur();
              self.showFixedInput(target);
            }, 10);
          }
        }
      }, true);
    },

    setupVibrationFeedback: function () {
      if (!this.isMobile && !this.isTouch) return;
      if (!navigator.vibrate) return;

      document.addEventListener('input', function (e) {
        var target = e.target;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
          var inputType = e.inputType;
          if (inputType === 'deleteContentBackward' ||
            inputType === 'deleteContentForward' ||
            inputType === 'deleteByCut') {
            navigator.vibrate(10);
          }
        }
      });
    },

    setupCustomSelects: function () {
      if (!this.isMobile && !this.isTouch) return;

      var self = this;

      setTimeout(function () {
        var selects = document.querySelectorAll('select:not([data-custom-select])');
        selects.forEach(function (select) {
          self.convertToCustomSelect(select);
        });
      }, 500);

      var observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
          mutation.addedNodes.forEach(function (node) {
            if (node.nodeType === 1) {
              if (node.tagName === 'SELECT' && !node.hasAttribute('data-custom-select')) {
                self.convertToCustomSelect(node);
              }
              if (node.querySelectorAll) {
                var nestedSelects = node.querySelectorAll('select:not([data-custom-select])');
                nestedSelects.forEach(function (s) {
                  self.convertToCustomSelect(s);
                });
              }
            }
          });
        });
      });

      observer.observe(document.body, { childList: true, subtree: true });
    },

    convertToCustomSelect: function (originalSelect) {
      if (originalSelect.hasAttribute('data-custom-select')) return;
      if (!originalSelect.parentNode) return;

      originalSelect.setAttribute('data-custom-select', 'true');

      var container = document.createElement('div');
      container.className = 'custom-select-container';

      var trigger = document.createElement('div');
      trigger.className = 'custom-select-trigger';
      trigger.setAttribute('tabindex', '0');

      var selectedText = document.createElement('span');
      selectedText.className = 'custom-select-text';

      var arrow = document.createElement('span');
      arrow.className = 'custom-select-arrow';
      arrow.innerHTML = '<svg viewBox="0 0 12 12" width="12" height="12"><path fill="currentColor" d="M6 8L1 3h10z"/></svg>';

      trigger.appendChild(selectedText);
      trigger.appendChild(arrow);

      var dropdown = document.createElement('div');
      dropdown.className = 'custom-select-dropdown';

      var options = originalSelect.querySelectorAll('option');
      var hasSelected = false;

      options.forEach(function (option) {
        var item = document.createElement('div');
        item.className = 'custom-select-option';
        item.setAttribute('data-value', option.value);
        item.textContent = option.textContent;

        if (option.selected) {
          item.classList.add('selected');
          selectedText.textContent = option.textContent;
          hasSelected = true;
        }

        dropdown.appendChild(item);
      });

      if (!hasSelected && options.length > 0) {
        selectedText.textContent = options[0].textContent;
        dropdown.querySelector('.custom-select-option').classList.add('selected');
      }

      container.appendChild(trigger);
      container.appendChild(dropdown);

      originalSelect.parentNode.insertBefore(container, originalSelect.nextSibling);
      originalSelect.style.display = 'none';

      var self = this;
      var touchStartY = 0;
      var touchStartX = 0;
      var touchStartTime = 0;
      var isScrolling = false;

      dropdown.addEventListener('touchstart', function (e) {
        touchStartY = e.touches[0].clientY;
        touchStartX = e.touches[0].clientX;
        touchStartTime = Date.now();
        isScrolling = false;
      }, { passive: true });

      dropdown.addEventListener('touchmove', function (e) {
        var touchY = e.touches[0].clientY;
        var touchX = e.touches[0].clientX;
        var deltaY = Math.abs(touchY - touchStartY);
        var deltaX = Math.abs(touchX - touchStartX);
        if (deltaY > 8 || deltaX > 8) {
          isScrolling = true;
        }
      }, { passive: true });

      dropdown.addEventListener('touchend', function (e) {
        var elapsed = Date.now() - touchStartTime;

        if (isScrolling || elapsed > 500) {
          if (e.cancelable) e.preventDefault();
          e.stopPropagation();
          return;
        }

        var touch = e.changedTouches[0];
        var target = document.elementFromPoint(touch.clientX, touch.clientY);
        var option = target ? target.closest('.custom-select-option') : null;

        if (option) {
          e.preventDefault();
          e.stopPropagation();

          dropdown.querySelectorAll('.custom-select-option').forEach(function (opt) {
            opt.classList.remove('selected');
          });
          option.classList.add('selected');

          selectedText.textContent = option.textContent;
          var value = option.getAttribute('data-value');
          originalSelect.value = value;

          originalSelect.dispatchEvent(new Event('change', { bubbles: true }));

          container.classList.remove('open');
        }
      });

      trigger.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();

        var isOpen = container.classList.contains('open');

        document.querySelectorAll('.custom-select-container.open').forEach(function (c) {
          c.classList.remove('open');
        });

        if (!isOpen) {
          container.classList.add('open');
          var selectedOption = dropdown.querySelector('.custom-select-option.selected');
          if (selectedOption) {
            selectedOption.scrollIntoView({ block: 'nearest' });
          }
        }
      });

      trigger.addEventListener('touchstart', function (e) {
        e.stopPropagation();
      });

      dropdown.addEventListener('click', function (e) {
        var option = e.target.closest('.custom-select-option');
        if (!option) return;

        e.stopPropagation();

        dropdown.querySelectorAll('.custom-select-option').forEach(function (opt) {
          opt.classList.remove('selected');
        });
        option.classList.add('selected');

        selectedText.textContent = option.textContent;
        var value = option.getAttribute('data-value');
        originalSelect.value = value;

        originalSelect.dispatchEvent(new Event('change', { bubbles: true }));

        container.classList.remove('open');
      });

      trigger.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          trigger.click();
        } else if (e.key === 'Escape') {
          container.classList.remove('open');
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          var opts = dropdown.querySelectorAll('.custom-select-option');
          var currentIdx = -1;
          opts.forEach(function (opt, idx) {
            if (opt.classList.contains('selected')) currentIdx = idx;
          });
          var nextIdx = e.key === 'ArrowDown' ? currentIdx + 1 : currentIdx - 1;
          if (nextIdx >= 0 && nextIdx < opts.length) {
            opts[nextIdx].click();
          }
        }
      });
    },

    closeAllCustomSelects: function () {
      document.querySelectorAll('.custom-select-container.open').forEach(function (container) {
        container.classList.remove('open');
      });
    }
  };

  function addStyles() {
    if (document.getElementById('mobile-handler-styles')) return;

    var style = document.createElement('style');
    style.id = 'mobile-handler-styles';
    style.textContent = '\
      .fixed-input-overlay {\
        position: fixed;\
        left: 0;\
        right: 0;\
        top: 0;\
        bottom: 0;\
        background: rgba(0, 0, 0, 0.5);\
        z-index: 99998;\
        display: none;\
        flex-direction: column;\
        justify-content: flex-end;\
      }\
      .fixed-input-overlay.show {\
        display: flex;\
      }\
      .fixed-input-container {\
        display: flex;\
        align-items: center;\
        width: 100%;\
        background: #fff;\
        padding: 16px;\
        gap: 12px;\
        box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.3);\
        box-sizing: border-box;\
        min-height: 80px;\
        border-top: 3px solid #4a90d9;\
      }\
      .fixed-input-field {\
        flex: 1;\
        font-size: 20px;\
        padding: 14px 18px;\
        border: 2px solid #ddd;\
        border-radius: 10px;\
        outline: none;\
        min-height: 52px;\
        background: #fff;\
        color: #333;\
      }\
      .fixed-input-field:focus {\
        border-color: #4a90d9;\
        box-shadow: 0 0 0 3px rgba(74, 144, 217, 0.15);\
      }\
      .fixed-input-close {\
        font-size: 18px;\
        font-weight: bold;\
        padding: 14px 28px;\
        background: linear-gradient(135deg, #4a90d9, #357abd);\
        color: #fff;\
        border: none;\
        border-radius: 10px;\
        cursor: pointer;\
        white-space: nowrap;\
        min-height: 52px;\
        -webkit-tap-highlight-color: transparent;\
        box-shadow: 0 2px 8px rgba(74, 144, 217, 0.3);\
      }\
      .custom-select-container {\
        position: relative;\
        display: inline-block;\
        width: 100%;\
      }\
      .custom-select-trigger {\
        display: flex;\
        align-items: center;\
        justify-content: space-between;\
        padding: 12px 14px;\
        background: #fff;\
        border: 2px solid #ccc;\
        border-radius: 8px;\
        cursor: pointer;\
        font-size: 17px;\
        min-height: 48px;\
        user-select: none;\
        -webkit-user-select: none;\
        touch-action: manipulation;\
      }\
      .custom-select-trigger:focus {\
        outline: none;\
        border-color: #4a90d9;\
        box-shadow: 0 0 0 3px rgba(74, 144, 217, 0.15);\
      }\
      .custom-select-text {\
        flex: 1;\
        overflow: hidden;\
        text-overflow: ellipsis;\
        white-space: nowrap;\
      }\
      .custom-select-arrow {\
        flex-shrink: 0;\
        margin-left: 10px;\
        color: #666;\
        transition: transform 0.2s ease;\
        pointer-events: none;\
      }\
      .custom-select-container.open .custom-select-arrow {\
        transform: rotate(180deg);\
      }\
      .custom-select-dropdown {\
        position: absolute;\
        top: 100%;\
        left: 0;\
        right: 0;\
        margin-top: 6px;\
        background: #fff;\
        border: 2px solid #ccc;\
        border-radius: 8px;\
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);\
        max-height: 220px;\
        overflow-y: auto;\
        -webkit-overflow-scrolling: touch;\
        z-index: 10000;\
        display: none;\
      }\
      .custom-select-container.open .custom-select-dropdown {\
        display: block;\
      }\
      .custom-select-option {\
        padding: 16px 18px;\
        cursor: pointer;\
        font-size: 17px;\
        user-select: none;\
        -webkit-user-select: none;\
        touch-action: pan-y;\
        transition: background-color 0.15s ease;\
      }\
      .custom-select-option:hover,\
      .custom-select-option:active {\
        background: #f5f5f5;\
      }\
      .custom-select-option.selected {\
        background: #e8f4fc;\
        color: #4a90d9;\
        font-weight: 600;\
      }\
    ';
    document.head.appendChild(style);
  }

  function initMobileHandler() {
    addStyles();
    MobileHandler.init();

    document.addEventListener('click', function (e) {
      var target = e.target;
      var container = target.closest('.custom-select-container');
      var fixedOverlay = target.closest('#fixedInputOverlay');
      if (!container && !fixedOverlay) {
        MobileHandler.closeAllCustomSelects();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileHandler);
  } else {
    initMobileHandler();
  }

  global.MobileHandler = MobileHandler;

})(window);

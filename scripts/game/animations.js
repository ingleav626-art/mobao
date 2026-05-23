/* ============================================================
   animations.js – 前端动效工具函数
   无依赖，挂载在 window.MobaoAnimations 上
   使用方式：MobaoAnimations.ripple(event, element)
            MobaoAnimations.scrollNumber(element, from, to, options)
            MobaoAnimations.staggerEnter(elements, options)
            MobaoAnimations.pulse(element, type)
   ============================================================ */
(function setupMobaoAnimations(global) {
  'use strict';

  /* ---- 1. 按钮点击涟漪 ---- */
  /**
   * 在按钮上创建涟漪效果
   * @param {PointerEvent|MouseEvent|TouchEvent} event - 点击事件对象
   * @param {HTMLElement} element - 按钮元素（需已添加 .ripple-btn 类）
   * @param {object} [options]
   * @param {string} [options.color] - 涟漪颜色，覆盖默认
   * @param {number} [options.size] - 涟漪直径，默认根据按钮尺寸自适应
   */
  function ripple(event, element, options) {
    if (!element || !event) return;
    options = options || {};

    // 清理已结束的涟漪
    const oldRipples = element.querySelectorAll('.ripple-effect');
    for (let i = 0; i < oldRipples.length; i++) {
      const r = oldRipples[i];
      if (getComputedStyle(r).opacity === '0') {
        r.remove();
      }
    }

    // 创建涟漪元素
    const rippleEl = document.createElement('span');
    rippleEl.className = 'ripple-effect';
    rippleEl.style.position = 'absolute';
    rippleEl.style.borderRadius = '50%';
    rippleEl.style.pointerEvents = 'none';
    rippleEl.style.transform = 'scale(0)';

    // 颜色
    if (options.color) {
      rippleEl.style.background = options.color;
    }

    // 计算点击位置和大小
    const rect = element.getBoundingClientRect();
    const size = options.size || Math.max(rect.width, rect.height);
    const halfSize = size / 2;

    let clientX, clientY;
    if (event.touches && event.touches.length > 0) {
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    } else if (event.changedTouches && event.changedTouches.length > 0) {
      clientX = event.changedTouches[0].clientX;
      clientY = event.changedTouches[0].clientY;
    } else {
      clientX = event.clientX;
      clientY = event.clientY;
    }

    const x = (clientX - rect.left) - halfSize;
    const y = (clientY - rect.top) - halfSize;

    rippleEl.style.width = size + 'px';
    rippleEl.style.height = size + 'px';
    rippleEl.style.left = x + 'px';
    rippleEl.style.top = y + 'px';

    element.appendChild(rippleEl);

    // 动画结束后清理
    const cleanup = function () {
      if (rippleEl.parentNode) {
        rippleEl.remove();
      }
    };
    rippleEl.addEventListener('animationend', cleanup, { once: true });
    // 兜底清理
    setTimeout(cleanup, 800);
  }

  /**
   * 为按钮绑定涟漪事件
   * @param {HTMLElement} button - 按钮元素
   * @param {object} [options] - 传递给 ripple() 的选项
   */
  function bindRipple(button, options) {
    if (!button) return;
    button.classList.add('ripple-btn');
    const handler = function (event) {
      ripple(event, button, options);
    };
    button.addEventListener('click', handler);
    return function unbind() {
      button.removeEventListener('click', handler);
    };
  }


  /* ---- 2. 数字滚动动画 ---- */
  /**
   * 数字从旧值滚动到新值
   * @param {HTMLElement} element - 显示数字的元素
   * @param {number} fromValue - 起始值
   * @param {number} toValue - 目标值
   * @param {object} [options]
   * @param {number} [options.duration=400] - 动画时长（毫秒）
   * @param {number} [options.decimals=0] - 小数位数
   * @param {boolean} [options.useLocale=true] - 是否使用 toLocaleString 格式化
   * @param {string} [options.prefix=''] - 数字前缀（如 ¥）
   * @param {string} [options.suffix=''] - 数字后缀
   * @param {function} [options.format] - 自定义格式化函数 (value) => string
   * @param {function} [options.onComplete] - 动画完成回调
   * @returns {Promise} 动画结束后的 Promise
   */
  function scrollNumber(element, fromValue, toValue, options) {
    return new Promise(function (resolve) {
      if (!element) {
        resolve();
        return;
      }

      options = options || {};
      var duration = options.duration || 400;
      var decimals = options.decimals || 0;
      var useLocale = options.useLocale !== false;
      var prefix = options.prefix || '';
      var suffix = options.suffix || '';
      var format = options.format || null;

      var from = Number(fromValue) || 0;
      var to = Number(toValue) || 0;

      // 数值没变或差值为 0，直接设置并返回
      if (from === to) {
        element.textContent = prefix + formatNumber(to, decimals, useLocale, format) + suffix;
        element.classList.remove('is-scrolling');
        if (options.onComplete) options.onComplete();
        resolve();
        return;
      }

      var startTime = performance.now();
      element.classList.add('is-scrolling');

      function formatNumber(val, dec, locale, fmt) {
        if (fmt) return fmt(val);
        var fixed = val.toFixed(dec);
        if (locale) {
          var parts = fixed.split('.');
          parts[0] = parseInt(parts[0], 10).toLocaleString('zh-CN');
          return parts.length > 1 ? parts.join('.') : parts[0];
        }
        return fixed;
      }

      function step(currentTime) {
        var elapsed = currentTime - startTime;
        var progress = Math.min(elapsed / duration, 1);

        // easeOutCubic 缓出
        var eased = 1 - Math.pow(1 - progress, 3);
        var current = from + (to - from) * eased;

        element.textContent = prefix + formatNumber(current, decimals, useLocale, format) + suffix;

        if (progress < 1) {
          global.requestAnimationFrame(step);
        } else {
          element.textContent = prefix + formatNumber(to, decimals, useLocale, format) + suffix;
          element.classList.remove('is-scrolling');
          if (options.onComplete) options.onComplete();
          resolve();
        }
      }

      global.requestAnimationFrame(step);
    });
  }

  /**
   * 便捷版本：自动检测元素当前值并滚动到新值
   * @param {HTMLElement} element - 显示数字的元素
   * @param {number} newValue - 新的数字值
   * @param {object} [options] - 同 scrollNumber
   */
  function scrollToNumber(element, newValue, options) {
    if (!element) return;
    var currentText = element.textContent.replace(/[^0-9\-.,]/g, '');
    var currentValue = parseFloat(currentText) || 0;
    return scrollNumber(element, currentValue, newValue, options);
  }


  /* ---- 3. 卡片渐次入场 ---- */
  /**
   * 触发一组元素的渐次入场动画
   * @param {HTMLElement[]|NodeList|string} elements - 元素数组、NodeList 或 CSS 选择器
   * @param {object} [options]
   * @param {number} [options.staggerDelay=80] - 每个卡片间的延迟（毫秒）
   * @param {number} [options.initialDelay=0] - 首个卡片前的延迟
   * @param {string} [options.direction='up'] - 方向：'up' | 'left' | 'right'
   * @param {function} [options.onComplete] - 全部入场完成回调
   * @returns {Promise}
   */
  function staggerEnter(elements, options) {
    return new Promise(function (resolve) {
      options = options || {};
      var staggerDelay = options.staggerDelay || 80;
      var initialDelay = options.initialDelay || 0;
      var direction = options.direction || 'up';
      var onComplete = options.onComplete || null;

      // 解析元素列表
      var list;
      if (typeof elements === 'string') {
        list = document.querySelectorAll(elements);
      } else if (elements instanceof NodeList) {
        list = Array.prototype.slice.call(elements);
      } else if (Array.isArray(elements)) {
        list = elements;
      } else {
        list = [];
      }

      if (list.length === 0) {
        if (onComplete) onComplete();
        resolve();
        return;
      }

      // 确定 CSS 类名
      var enterClass;
      switch (direction) {
        case 'left':
          enterClass = 'card-enter-left';
          break;
        case 'right':
          enterClass = 'card-enter-right';
          break;
        default:
          enterClass = 'card-enter';
      }

      // 先重置所有元素
      for (var i = 0; i < list.length; i++) {
        var el = list[i];
        el.classList.remove('enter-visible', 'card-enter', 'card-enter-left', 'card-enter-right');
        el.classList.add(enterClass);
        el.style.animationDelay = '0ms';
        el.style.opacity = '0';
      }

      // 逐个触发：setTimeout 已实现渐次延迟，animationDelay 不再重复累加
      list.forEach(function (el, index) {
        var delay = initialDelay + index * staggerDelay;
        setTimeout(function () {
          void el.offsetWidth;
          el.classList.add('enter-visible');
        }, delay);
      });

      // 所有入场完成
      var totalDuration = initialDelay + list.length * staggerDelay + 500;
      setTimeout(function () {
        // 清理行内样式
        for (var j = 0; j < list.length; j++) {
          list[j].style.animationDelay = '';
        }
        if (onComplete) onComplete();
        resolve();
      }, totalDuration);
    });
  }


  /* ---- 4. 脉冲提示动画 ---- */
  /**
   * 对元素应用脉冲动画
   * @param {HTMLElement} element - 目标元素
   * @param {string} [type='heart'] - 脉冲类型：'heart' | 'soft' | 'alert' | 'badge'
   * @param {object} [options]
   * @param {number} [options.duration] - 可覆盖默认动画时长
   * @param {boolean} [options.once=false] - 是否只播放一次而非无限循环
   * @param {function} [options.onEnd] - 动画结束回调（仅 once=true 时触发）
   */
  function pulse(element, type, options) {
    if (!element) return;
    options = options || {};
    type = type || 'heart';

    // 先移除已有的脉冲类
    element.classList.remove('pulse-heart', 'pulse-soft', 'pulse-alert', 'pulse-badge', 'anim-paused');

    var className;
    switch (type) {
      case 'soft':
        className = 'pulse-soft';
        break;
      case 'alert':
        className = 'pulse-alert';
        break;
      case 'badge':
        className = 'pulse-badge';
        break;
      default:
        className = 'pulse-heart';
    }

    element.classList.add(className);

    // 自定义时长
    if (options.duration) {
      element.style.animationDuration = options.duration + 'ms';
    }

    // 仅播放一次
    if (options.once) {
      var animName = global.getComputedStyle(element).animationName;
      if (!animName || animName === 'none') {
        if (options.onEnd) options.onEnd();
        return;
      }

      var handler = function () {
        element.classList.remove(className);
        element.style.animationDuration = '';
        element.removeEventListener('animationend', handler);
        if (options.onEnd) options.onEnd();
      };
      element.addEventListener('animationend', handler, { once: true });
    }
  }

  /**
   * 停止脉冲动画
   */
  function stopPulse(element) {
    if (!element) return;
    element.classList.remove('pulse-heart', 'pulse-soft', 'pulse-alert', 'pulse-badge');
    element.style.animationDuration = '';
  }


  /* ---- 导出 ---- */
  global.MobaoAnimations = {
    ripple: ripple,
    bindRipple: bindRipple,
    scrollNumber: scrollNumber,
    scrollToNumber: scrollToNumber,
    staggerEnter: staggerEnter,
    pulse: pulse,
    stopPulse: stopPulse,

    /* ---- 5. 覆盖层动效 ---- */
    /**
     * 打开覆盖层：淡入 + 缩放 + 内容面板滑入
     * @param {HTMLElement} overlayEl - 覆盖层容器（背景层）
     * @param {HTMLElement} innerEl - 内部内容面板
     */
    animateOverlayOpen: function (overlayEl, innerEl) {
      if (!overlayEl) return;
      overlayEl.classList.remove("overlay-enter", "overlay-exit", "hidden");
      void overlayEl.offsetWidth;
      overlayEl.classList.add("overlay-enter");
      if (innerEl) {
        innerEl.classList.remove("overlay-inner-enter");
        void innerEl.offsetWidth;
        innerEl.classList.add("overlay-inner-enter");
      }
    },

    /**
     * 关闭覆盖层：淡出 + 缩放，动画结束后添加 hidden
     * @param {HTMLElement} overlayEl - 覆盖层容器
     * @param {HTMLElement} innerEl - 内部内容面板（可选）
     * @param {function} [onDone] - 动画完成后的回调
     */
    animateOverlayClose: function (overlayEl, innerEl, onDone) {
      if (!overlayEl) return;
      if (overlayEl.classList.contains("hidden")) {
        if (onDone) onDone();
        return;
      }
      overlayEl.classList.remove("overlay-enter");
      overlayEl.classList.add("overlay-exit");
      if (innerEl) {
        innerEl.classList.remove("overlay-inner-enter");
      }
      var cleanup = function () {
        overlayEl.classList.add("hidden");
        overlayEl.classList.remove("overlay-enter", "overlay-exit");
        overlayEl.removeEventListener("animationend", cleanup);
        if (onDone) onDone();
      };
      overlayEl.addEventListener("animationend", cleanup, { once: true });
    },

    /* ---- 6. 回合过渡动画 ---- */
    /**
     * 执行游戏区→结算页的回合过渡动画
     * @param {object} options
     * @param {string} options.text - 过渡文字（如"第3回合 结算中…"）
     * @param {function} [options.onComplete] - 过渡完成回调（淡入完成后触发）
     * @returns {Promise}
     */
    roundTransition: function (options) {
      return new Promise(function (resolve) {
        options = options || {};
        var text = options.text || '';
        var onComplete = options.onComplete || null;

        var overlay = document.createElement('div');
        overlay.className = 'round-transition-overlay';
        overlay.innerHTML = '<div class="round-transition-label">' + text + '</div>';
        document.body.appendChild(overlay);

        void overlay.offsetWidth;
        overlay.classList.add('round-transition-active');

        var label = overlay.querySelector('.round-transition-label');
        if (label) {
          setTimeout(function () {
            if (label) label.classList.add('transition-text-enter');
          }, 120);
        }

        var totalTime = 700;
        setTimeout(function () {
          overlay.classList.remove('round-transition-active');
          overlay.classList.add('round-transition-exit');
          setTimeout(function () {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            if (onComplete) onComplete();
            resolve();
          }, 320);
        }, totalTime);
      });
    },

    /* ---- 7. 暂停/恢复视觉动画 ---- */
    /**
     * 切换 HUD 暂停视觉状态
     * @param {HTMLElement} hudEl - HUD 容器元素（如 .hud）
     * @param {boolean} isPaused - 是否暂停
     * @param {HTMLElement} timerSpan - 计时器元素
     */
    togglePauseVisual: function (hudEl, isPaused, timerSpan) {
      if (!hudEl) return;
      if (isPaused) {
        hudEl.classList.remove('hud-resuming');
        hudEl.classList.add('hud-paused');
        if (timerSpan) timerSpan.classList.add('is-frozen');
      } else {
        hudEl.classList.remove('hud-paused');
        hudEl.classList.add('hud-resuming');
        if (timerSpan) timerSpan.classList.remove('is-frozen');
        var handler = function () {
          hudEl.classList.remove('hud-resuming');
          hudEl.removeEventListener('animationend', handler);
        };
        hudEl.addEventListener('animationend', handler, { once: true });
        setTimeout(function () {
          hudEl.classList.remove('hud-resuming');
        }, 400);
      }
    },

    /* ---- 8. 游戏区→结算页过渡工具 ---- */
    /**
     * 淡出游戏区并淡入结算页
     * @param {HTMLElement} gameArea - 游戏区元素
     * @param {HTMLElement} settlePage - 结算页元素
     * @param {function} [onComplete]
     */
    transitionToSettlement: function (gameArea, settlePage, onComplete) {
      if (gameArea) {
        gameArea.classList.add('game-area-fade-out');
      }
      if (settlePage) {
        settlePage.classList.remove('hidden');
        void settlePage.offsetWidth;
        settlePage.classList.add('settle-fade-in');
      }
      setTimeout(function () {
        if (gameArea) gameArea.classList.remove('game-area-fade-out');
        if (onComplete) onComplete();
      }, 400);
    },

    /* ---- 9. 按钮按下缩放（轻量级点击反馈） ---- */
    /**
     * 绑定按钮按下缩放效果
     * @param {HTMLElement} button
     */
    bindPressScale: function (button) {
      if (!button) return;
      button.classList.add('btn-press-scale');
    },

    /**
     * 批量绑定按钮效果（涟漪+按下缩放）
     * @param {HTMLElement[]|NodeList|string} buttons - 元素列表或 CSS 选择器
     */
    bindAllButtonEffects: function (buttons) {
      var list;
      if (typeof buttons === 'string') {
        list = document.querySelectorAll(buttons);
      } else if (buttons instanceof NodeList) {
        list = Array.prototype.slice.call(buttons);
      } else if (Array.isArray(buttons)) {
        list = buttons;
      } else {
        return;
      }
      for (var i = 0; i < list.length; i++) {
        var btn = list[i];
        this.bindRipple(btn);
        this.bindPressScale(btn);
      }
    }
  };

})(window);
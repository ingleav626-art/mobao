/**
 * @file animations.ts
 * @module game/animations
 * @description 前端动效工具函数库。挂载到 window.MobaoAnimations。
 *              提供项目通用的 UI 动画效果，包括涟漪、数字滚动、卡片入场、脉冲、
 *              覆盖层开关、回合过渡、暂停视觉等。无外部依赖，纯 DOM + CSS 动画。
 *
 * 动效分类（9类）：
 *
 * 1. 涟漪效果：
 *    - ripple(event, element, options): 按钮点击涟漪（自动清理、支持触摸）
 *    - bindRipple(button, options): 为按钮绑定涟漪事件
 *
 * 2. 数字滚动：
 *    - scrollNumber(element, from, to, options): 数字从旧值滚动到新值
 *      支持 easeOutCubic 缓出、小数位、千分位、前后缀、自定义格式化
 *    - scrollToNumber(element, newValue, options): 便捷版，自动检测当前值
 *
 * 3. 卡片渐次入场：
 *    - staggerEnter(elements, options): 一组元素渐次入场
 *      支持 up/left/right 方向、staggerDelay 间隔、initialDelay 初始延迟
 *
 * 4. 脉冲提示：
 *    - pulse(element, type, options): 4种脉冲类型（heart/soft/alert/badge）
 *      支持自定义时长、仅播放一次
 *    - stopPulse(element): 停止脉冲
 *
 * 5. 覆盖层动效：
 *    - animateOverlayOpen(overlayEl, innerEl): 淡入+缩放+面板滑入
 *    - animateOverlayClose(overlayEl, innerEl, onDone): 淡出+缩放+hidden
 *
 * 6. 回合过渡：
 *    - roundTransition(options): 游戏区→结算页过渡（创建临时覆盖层、文字淡入淡出）
 *
 * 7. 暂停/恢复视觉：
 *    - togglePauseVisual(hudEl, isPaused, timerSpan): HUD 暂停状态切换
 *
 * 8. 页面过渡：
 *    - transitionToSettlement(gameArea, settlePage, onComplete): 游戏区淡出+结算页淡入
 *
 * 9. 按钮效果：
 *    - bindPressScale(button): 按下缩放反馈
 *    - bindAllButtonEffects(buttons): 批量绑定涟漪+缩放
 *
 * @exports window.MobaoAnimations - 动效工具库单例
 *
 * @requires core/utils - 工具函数
 */

/* ---- 1. 按钮点击涟漪 ---- */
function ripple(event: PointerEvent | MouseEvent | TouchEvent, element: HTMLElement, options?: { color?: string; size?: number }): void {
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

  let clientX: number, clientY: number;
  if ('touches' in event && event.touches && event.touches.length > 0) {
    clientX = event.touches[0].clientX;
    clientY = event.touches[0].clientY;
  } else if ('changedTouches' in event && event.changedTouches && event.changedTouches.length > 0) {
    clientX = event.changedTouches[0].clientX;
    clientY = event.changedTouches[0].clientY;
  } else {
    clientX = (event as MouseEvent).clientX;
    clientY = (event as MouseEvent).clientY;
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

function bindRipple(button: HTMLElement, options?: { color?: string; size?: number }): () => void {
  if (!button) return () => { };
  button.classList.add('ripple-btn');
  const handler = function (event: Event) {
    ripple(event as PointerEvent, button, options);
  };
  button.addEventListener('click', handler);
  return function unbind() {
    button.removeEventListener('click', handler);
  };
}


/* ---- 2. 数字滚动动画 ---- */
interface ScrollNumberOptions {
  duration?: number;
  decimals?: number;
  useLocale?: boolean;
  prefix?: string;
  suffix?: string;
  format?: (value: number) => string;
  onComplete?: () => void;
}

function formatNumber(val: number, dec: number, locale: boolean, fmt?: ((value: number) => string) | null): string {
  if (fmt) return fmt(val);
  var fixed = val.toFixed(dec);
  if (locale) {
    var parts = fixed.split('.');
    parts[0] = parseInt(parts[0], 10).toLocaleString('zh-CN');
    return parts.length > 1 ? parts.join('.') : parts[0];
  }
  return fixed;
}

function scrollNumber(element: HTMLElement, fromValue: number, toValue: number, options?: ScrollNumberOptions): Promise<void> {
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

    function step(currentTime: number) {
      var elapsed = currentTime - startTime;
      var progress = Math.min(elapsed / duration, 1);

      // easeOutCubic 缓出
      var eased = 1 - Math.pow(1 - progress, 3);
      var current = from + (to - from) * eased;

      element.textContent = prefix + formatNumber(current, decimals, useLocale, format) + suffix;

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        element.textContent = prefix + formatNumber(to, decimals, useLocale, format) + suffix;
        element.classList.remove('is-scrolling');
        if (options?.onComplete) options.onComplete();
        resolve();
      }
    }

    requestAnimationFrame(step);
  });
}

function scrollToNumber(element: HTMLElement, newValue: number, options?: ScrollNumberOptions): Promise<void> | undefined {
  if (!element) return;
  var currentText = (element.textContent || '').replace(/[^0-9\-.,]/g, '');
  var currentValue = parseFloat(currentText) || 0;
  return scrollNumber(element, currentValue, newValue, options);
}


/* ---- 3. 卡片渐次入场 ---- */
interface StaggerEnterOptions {
  staggerDelay?: number;
  initialDelay?: number;
  direction?: string;
  onComplete?: () => void;
}

function staggerEnter(elements: HTMLElement[] | NodeList | string, options?: StaggerEnterOptions): Promise<void> {
  return new Promise(function (resolve) {
    options = options || {};
    var staggerDelay = options.staggerDelay || 80;
    var initialDelay = options.initialDelay || 0;
    var direction = options.direction || 'up';
    var onComplete = options.onComplete || null;

    // 解析元素列表
    var list: Element[];
    if (typeof elements === 'string') {
      list = Array.from(document.querySelectorAll(elements));
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
    var enterClass: string;
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
      (el as HTMLElement).style.animationDelay = '0ms';
      (el as HTMLElement).style.opacity = '0';
    }

    // 逐个触发
    list.forEach(function (el, index) {
      var delay = initialDelay + index * staggerDelay;
      setTimeout(function () {
        void (el as HTMLElement).offsetWidth;
        el.classList.add('enter-visible');
      }, delay);
    });

    // 所有入场完成
    var totalDuration = initialDelay + list.length * staggerDelay + 500;
    setTimeout(function () {
      for (var j = 0; j < list.length; j++) {
        (list[j] as HTMLElement).style.animationDelay = '';
      }
      if (onComplete) onComplete();
      resolve();
    }, totalDuration);
  });
}


/* ---- 4. 脉冲提示动画 ---- */
interface PulseOptions {
  duration?: number;
  once?: boolean;
  onEnd?: () => void;
}

function pulse(element: HTMLElement, type?: string, options?: PulseOptions): void {
  if (!element) return;
  options = options || {};
  type = type || 'heart';

  // 先移除已有的脉冲类
  element.classList.remove('pulse-heart', 'pulse-soft', 'pulse-alert', 'pulse-badge', 'anim-paused');

  var className: string;
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
    var animName = getComputedStyle(element).animationName;
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

function stopPulse(element: HTMLElement): void {
  if (!element) return;
  element.classList.remove('pulse-heart', 'pulse-soft', 'pulse-alert', 'pulse-badge');
  element.style.animationDuration = '';
}


/* ---- 5. 覆盖层动效 ---- */
function animateOverlayOpen(overlayEl: HTMLElement, innerEl?: HTMLElement | null): void {
  if (!overlayEl) return;
  overlayEl.classList.remove("overlay-enter", "overlay-exit", "hidden");
  void overlayEl.offsetWidth;
  overlayEl.classList.add("overlay-enter");
  if (innerEl) {
    innerEl.classList.remove("overlay-inner-enter");
    void innerEl.offsetWidth;
    innerEl.classList.add("overlay-inner-enter");
  }
}

function animateOverlayClose(overlayEl: HTMLElement, innerEl?: HTMLElement | null, onDone?: (() => void) | null): void {
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
}


/* ---- 6. 回合过渡动画 ---- */
interface RoundTransitionOptions {
  text?: string;
  onComplete?: () => void;
}

function roundTransition(options?: RoundTransitionOptions): Promise<void> {
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
}


/* ---- 7. 暂停/恢复视觉动画 ---- */
function togglePauseVisual(hudEl: HTMLElement, isPaused: boolean, timerSpan?: HTMLElement | null): void {
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
}


/* ---- 8. 游戏区→结算页过渡工具 ---- */
function transitionToSettlement(gameArea: HTMLElement | null, settlePage: HTMLElement | null, onComplete?: (() => void) | null): void {
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
}


/* ---- 9. 按钮按下缩放 ---- */
function bindPressScale(button: HTMLElement): void {
  if (!button) return;
  button.classList.add('btn-press-scale');
}

function bindAllButtonEffects(buttons: HTMLElement[] | NodeList | string): void {
  var list: Element[];
  if (typeof buttons === 'string') {
    list = Array.from(document.querySelectorAll(buttons));
  } else if (buttons instanceof NodeList) {
    list = Array.prototype.slice.call(buttons);
  } else if (Array.isArray(buttons)) {
    list = buttons;
  } else {
    return;
  }
  for (var i = 0; i < list.length; i++) {
    var btn = list[i] as HTMLElement;
    bindRipple(btn);
    bindPressScale(btn);
  }
}


/* ---- 导出 ---- */
export const MobaoAnimations = {
  ripple,
  bindRipple,
  scrollNumber,
  scrollToNumber,
  staggerEnter,
  pulse,
  stopPulse,
  animateOverlayOpen,
  animateOverlayClose,
  roundTransition,
  togglePauseVisual,
  transitionToSettlement,
  bindPressScale,
  bindAllButtonEffects
}

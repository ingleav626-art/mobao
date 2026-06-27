# 基础设施层文档

> 本文档详细描述游戏的基础设施模块，包括音频系统和移动端适配。

---

## 一、基础设施层总览

### 1.1 文件清单

| 路径 | 设计模式 | 职责 |
|------|---------|------|
| `scripts/audio/audio-manager.ts` | 对象字面量单例 | 音效/音乐加载、播放、控制、设置持久化 |
| `scripts/audio/audio-ui.ts` | 对象字面量单例 | 音频 UI 交互层（自动播放、快捷方法） |
| `scripts/mobile/mobile-handler.ts` | IIFE + 对象字面量单例 | 移动端适配（键盘遮挡、横竖屏、触觉反馈） |

### 1.2 与其他模块的关系

```
┌──────────────────────────────────────────────┐
│              游戏各模块                        │
│  (bidding / settlement / lobby / main ...)   │
└──────────┬───────────────────────┬───────────┘
           │                       │
           ▼                       ▼
┌──────────────────┐    ┌──────────────────────┐
│    AudioUI       │    │   MobileHandler      │
│  (UI交互层)      │    │  (移动端适配)          │
└────────┬─────────┘    └──────────────────────┘
         │
         ▼
┌──────────────────┐
│   AudioManager   │
│  (音频管理器)     │
└──────────────────┘
```

---

## 二、音频管理器（audio-manager.ts）

### 2.1 概述

`AudioManager` 是全局音频管理单例，管理所有音效（SFX）和背景音乐（BGM）的加载、播放和控制。

### 2.2 音频资源分类

| 分类 | 音效 | 路径 |
|------|------|------|
| ui | click | `assets/audio/sfx/ui/keyboard.wav` |
| ui | close | `assets/audio/sfx/game/fall-394469.mp3` |
| game | coin | `assets/audio/sfx/game/coin.mp3` |
| game | reveal | `assets/audio/sfx/game/reveal.wav` |
| game | coinsReveal | `assets/audio/sfx/game/coins-sound.wav` |
| game | search | `assets/audio/sfx/game/search.mp3` |
| game | win | `assets/audio/sfx/game/win.mp3` |
| game | lose | `assets/audio/sfx/game/lose.mp3` |
| game | countdown | `assets/audio/sfx/game/countdown.wav` |
| game | round | `assets/audio/sfx/game/round.mp3` |
| game | revealNormal | `assets/audio/sfx/game/reveal-normal.mp3` |
| game | revealRare | `assets/audio/sfx/game/reveal-rare.mp3` |
| game | revealLegendary | `assets/audio/sfx/game/reveal-legendary.mp3` |
| skill | scan | `assets/audio/sfx/skill/scan.mp3` |
| skill | identify | `assets/audio/sfx/skill/identify.mp3` |
| bgm | lobby | `assets/audio/bgm/lobby.mp3` |
| bgm | game | `assets/audio/bgm/game.mp3` |

### 2.3 核心属性

| 属性 | 类型 | 说明 |
|------|------|------|
| _enabled | boolean | 全局音频开关 |
| _bgmEnabled | boolean | BGM 开关 |
| _sfxEnabled | boolean | SFX 开关 |
| _bgmVolume | number | BGM 音量 (0~1) |
| _sfxVolume | number | SFX 音量 (0~1) |
| _currentBgm | string | 当前 BGM key |
| _bgmAudio | HTMLAudioElement | 当前 BGM 音频实例 |
| _sfxPool | Map | 音效池（key → audio） |
| _loopingSfx | Map | 循环音效实例（key → audio） |
| _stopableSfx | Map | 可停止音效实例（key → audio） |
| _audioContext | AudioContext | Web Audio 上下文 |

### 2.4 播放方式

#### 一次性音效

```
playSfx(key, options)
  │
  ├── 从 _sfxPool 获取 audio
  ├── cloneNode() 创建新实例（避免冲突）
  ├── 设置 volume / playbackRate
  └── play() → onended 自动清理
```

#### 循环音效

```
playLoopingSfx(key, options)
  │
  ├── 停止同 key 旧实例
  ├── cloneNode() + loop = true
  └── play()

stopLoopingSfx(key)
  └── pause() + 清理

stopAllLoopingSfx()
  └── 停止所有循环音效
```

#### 可停止音效

```
playStopableSfx(key, options)
  │
  ├── cloneNode() 创建实例
  ├── 存入 _stopableSfx
  └── play() → onended 自动清理

stopStopableSfx(key)
  └── pause() + 从 _stopableSfx 移除
```

#### 背景音乐

```
playBgm(key, options)
  │
  ├── 停止旧 BGM
  ├── 加载新 BGM
  ├── 设置 loop = true, volume
  └── play()

stopBgm(fadeOut)
  │
  ├── fadeOut > 0 → 渐出（线性降低音量）
  └── fadeOut = 0 → 立即停止

pauseBgm() / resumeBgm()
  └── 暂停/恢复 BGM
```

### 2.5 设置持久化

```javascript
// 存储: localStorage("mobao_audio_settings")
{
  enabled: true,
  bgmEnabled: true,
  sfxEnabled: true,
  bgmVolume: 0.5,
  sfxVolume: 0.7
}

// 同步游戏设置中的音量
// MobaoSettings.GAME_SETTINGS.musicVolume → _bgmVolume
// MobaoSettings.GAME_SETTINGS.sfxVolume → _sfxVolume
```

### 2.6 预加载

```
preload(category, keys)
  │
  ├── 按 category 和 keys 加载音频
  ├── 创建 Audio 对象
  ├── 5秒超时保护
  └── 存入 _sfxPool
```

---

## 三、音频 UI 交互层（audio-ui.ts）

### 3.1 概述

`AudioUI` 监听 DOM 交互事件，自动为 UI 元素播放对应音效，并提供业务快捷方法。

### 3.2 自动音效机制

```
点击事件委托:
  │
  ├── 匹配选择器: 'button, .btn, [role="button"], .clickable, .tab, .menu-item'
  │
  ├── 跳过条件:
  │     ├── data-no-sound="true"
  │     ├── disabled
  │     └── .disabled
  │
  └── 音效路由优先级:
        ├── 1. data-sound 属性 → 自定义音效名
        ├── 2. _customBindings 匹配（id 或 CSS 选择器）
        └── 3. 默认 'click' 音效
```

### 3.3 动态绑定

```javascript
// 绑定自定义音效
AudioUI.bindSound('#myButton', 'coin');

// 解绑
AudioUI.unbindSound('#myButton');
```

### 3.4 业务快捷方法

| 方法 | 音效 | 说明 |
|------|------|------|
| `playClick()` | click | 通用点击 |
| `playCoin()` | coin | 金币音效 |
| `playReveal()` | reveal | 揭示音效 |
| `playWin()` | win | 胜利音效 |
| `playLose()` | lose | 失败音效 |
| `playCountdown()` | countdown | 倒计时（可停止） |
| `stopCountdown()` | - | 停止倒计时 |
| `playRound()` | round | 回合开始 |
| `playSkill(name)` | scan/identify | 技能音效 |
| `startSearch()` | search | 搜索音效（循环） |
| `stopSearch()` | - | 停止搜索音效 |
| `playSettlementReveal(qualityKey)` | 按品质 | 结算揭示音效 |
| `play(soundName, options)` | 通用 | 通用播放 |

### 3.5 结算揭示音效路由

```
playSettlementReveal(qualityKey)
  │
  ├── legendary → revealLegendary
  ├── rare → revealRare
  └── 其他 → revealNormal
```

---

## 四、移动端适配（mobile-handler.ts）

### 4.1 概述

`MobileHandler` 解决移动端（特别是 Android WebView）的键盘遮挡、输入框定位、横竖屏切换等兼容性问题。

### 4.2 设备检测

```javascript
isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
```

### 4.3 固定输入框系统

#### 问题

移动端虚拟键盘弹出时会遮挡页面底部的输入框，导致用户看不到正在输入的内容。

#### 解决方案

```
createFixedInputOverlay()
  │
  ├── 创建全局固定输入覆盖层
  │     └── position: fixed, bottom: 0, z-index: 9999
  │
  ├── 拦截原生 input 的 focusin 事件:
  │     ├── 原生 input 获焦 → 隐藏原生 input
  │     ├── 显示固定输入框
  │     ├── 同步值到固定输入框
  │     └── 固定输入框获焦 → 弹出键盘
  │
  ├── data-no-fixed-input 属性可跳过拦截
  │
  └── 输入同步:
        ├── 固定输入框 input 事件 → 同步到原生 input
        └── 固定输入框 blur → 隐藏固定输入框
```

#### 键盘高度处理

```
setupNativeKeyboardListener()
  │
  ├── Android 环境:
  │     ├── AndroidKeyboard.getKeyboardHeight()
  │     └── keyboardchange 事件
  │
  └── 通用环境:
        └── window.resize 事件 + 轮询

handleKeyboardHeightChange(rawHeight)
  │
  ├── calculateSafeKeyboardHeight(rawHeight)
  │     └── 防止超出屏幕: min(rawHeight, screenHeight × 0.6)
  │
  └── updateInputPosition()
        └── 固定输入框 bottom = keyboardHeight
```

### 4.4 横竖屏检测

```
setupOrientationCheck()
  │
  ├── 监听 orientationchange + resize 事件
  │
  ├── 竖屏 (height > width):
  │     └── 显示 portraitOverlay 提示横屏
  │           "请将设备横屏以获得最佳体验"
  │
  └── 横屏:
        └── 隐藏 portraitOverlay
```

### 4.5 触觉反馈

```
setupVibrationFeedback()
  │
  ├── 监听固定输入框的 keydown 事件
  └── 删除键 (Backspace/Delete) → navigator.vibrate(10)
```

### 4.6 自定义下拉框

#### 问题

移动端原生 `<select>` 的下拉选项样式不可控，且在 WebView 中可能显示异常。

#### 解决方案

```
setupCustomSelects()
  │
  ├── 查找所有 select 元素
  ├── convertToCustomSelect(select) 逐个转换
  └── MutationObserver 监听动态添加的 select

convertToCustomSelect(select)
  │
  ├── 隐藏原生 select (opacity: 0, position: absolute)
  ├── 创建自定义下拉框容器:
  │     ├── 触发按钮（显示当前选中值）
  │     └── 选项列表（绝对定位，可滚动）
  │
  ├── 交互:
  │     ├── 点击触发按钮 → 展开/收起选项列表
  │     ├── 触摸滚动区分（scroll 不触发选择）
  │     ├── 点击选项 → 选中 + 更新原生 select
  │     └── 键盘导航（上下箭头 + Enter）
  │
  └── closeAllCustomSelects(): 点击外部关闭
```

### 4.7 内联样式

```
addStyles()
  │
  └── 注入 mobile-handler-styles 样式表:
        ├── 固定输入框样式（position: fixed, 底部定位）
        ├── 自定义下拉框样式（触发按钮 + 选项列表）
        ├── 竖屏提示覆盖层样式
        └── 触摸优化（-webkit-tap-highlight-color, touch-action）
```

---

## 五、音频资源路径汇总

### 5.1 目录结构

```
assets/audio/
├── bgm/
│   ├── lobby.mp3
│   └── game.mp3
└── sfx/
    ├── game/
    │   ├── coin.mp3
    │   ├── reveal.wav
    │   ├── coins-sound.wav
    │   ├── search.mp3
    │   ├── win.mp3
    │   ├── lose.mp3
    │   ├── countdown.wav
    │   ├── round.mp3
    │   ├── reveal-normal.mp3
    │   ├── reveal-rare.mp3
    │   ├── reveal-legendary.mp3
    │   └── fall-394469.mp3
    ├── skill/
    │   ├── scan.mp3
    │   └── identify.mp3
    └── ui/
        └── keyboard.wav
```

### 5.2 音效使用场景

| 场景 | 音效 | 触发位置 |
|------|------|---------|
| 按钮点击 | click | AudioUI 自动播放 |
| 关闭弹窗 | close | AudioUI _customBindings |
| 金币/出价 | coin | bidding/index.ts |
| 藏品揭示 | reveal | warehouse/index.ts |
| 多件揭示 | coinsReveal | warehouse/index.ts |
| 搜索动画 | search (循环) | settlement.ts |
| 胜利 | win | settlement.ts |
| 失败 | lose | settlement.ts |
| 倒计时 | countdown (可停止) | bidding/index.ts |
| 回合开始 | round | bidding/index.ts |
| 普通品质揭示 | revealNormal | settlement.ts |
| 珍品揭示 | revealRare | settlement.ts |
| 绝品揭示 | revealLegendary | settlement.ts |
| 扫描技能 | scan | skills.ts |
| 鉴定技能 | identify | skills.ts |
| 大厅 BGM | lobby | lobby/index.ts |
| 游戏 BGM | game | main.ts |

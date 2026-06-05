---
alwaysApply: false
description: 当出现很难排查的bug以及记录bug时
---
# 项目已知陷阱

> 本文件记录开发中踩过的坑，AI 必须避免重复犯错。
> 每次修完 bug，把教训追加到对应分类下。

---

## 一、联机模式

- [LAN-001] Live2D 循环不能直接复用单机的 `_startLive2dLoop`，因为它依赖单机特有的 `#character-video` DOM 结构。联机模式需独立实现循环逻辑
- [LAN-002] 联机模式下数据同步由房主驱动，客机只接收和渲染，不做独立计算
- [LAN-003] 联机角色选择后必须通过 `bridge.send({type:"lan:character-select"})` 广播，不能只更新本地 UI
- [LAN-004] 地图选择仅房主可操作，需判断 `player.id === this.hostId`
- [LAN-005] 已删除的变量（如 `slotsContainer`）不能在代码中引用，修改前先确认变量是否存在
- [LAN-006] Live2D 视频元素必须在设置 `src` 之前添加 `active` class，否则 `onloadeddata` 回调可能不触发
- [LAN-007] Live2D 容器需要 `overflow: visible`，否则视频会被裁切

## 二、平台兼容

- [PLAT-001] Windows 下 `wc` 命令不可用，统计行数用 Read 工具读取文件
- [PLAT-002] PowerShell 路径中中文可能编码异常，输出 JSON 重定向到文件保存
- [PLAT-003] Android WebView 中原生 `<select>` 下拉样式异常，需用 MobileHandler 的自定义下拉框

## 三、代码结构

- [CODE-001] Mixin 方法通过 `Object.assign` 混入场景，不能在 Mixin 中使用 `class` 语法定义
- [CODE-002] 全局单例（AudioManager、AudioUI、MobileHandler）直接挂载到 `window`，不要 `new` 实例化
- [CODE-003] Phaser 场景方法（create/update）由引擎调用，不要手动调用
- [CODE-004] 事件名格式：`lan:模块:动作`（如 `lan:round:start`），不要随意发明新格式
- [CODE-005] 房间码字符集：`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`，排除 I/O/0/1 防混淆

## 四、数据与存储

- [DATA-001] localStorage key 前缀统一：`mobao_`（如 `mobao_audio_settings`、`mobao_settings`）
- [DATA-002] AI 钱包数据跨游戏持久化，重置时需区分"新游戏"和"重开"
- [DATA-003] LLM API Key 存储在 localStorage，不要在日志中打印

## 五、UI 与样式

- [UI-001] 返回按钮必须有确认弹窗保护（`showGameConfirm`），防止误触
- [UI-002] CSS 变量定义在 `_variables.css`，不要在组件 CSS 中硬编码颜色值
- [UI-003] 移动端横屏检测由 MobileHandler 处理，竖屏时显示 portraitOverlay

---

> 新增陷阱格式：`-[分类-编号] 描述`，编号递增。
> 修完 bug 后必须在此登记，防止 AI 重复犯错。

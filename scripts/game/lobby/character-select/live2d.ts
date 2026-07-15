/**
 * @file scripts/game/lobby/character-select/live2d.ts
 * @module lobby/character-select/live2d
 * @description 角色选择页 Live2D 双视频无缝循环 Mixin。
 *              使用 A/B 视频切换实现无缝循环，支持 requestVideoFrameCallback
 *              精确帧控制、移动端/桌面端适配、预热解码器、加载重试、性能诊断。
 *
 * @requires DOM - overlayLive2dVideoA/B, live2dLoadingPlaceholder
 * @exports Live2dMixin - 包含 _startLive2dLoop 和 _stopLive2dLoop 方法
 */
import type { WarehouseSceneThis } from "../../../../types/warehouse-scene-this"

interface Live2dVideoState {
  current: "A" | "B"
  src: string
  running: boolean
  duration: number
  startTime: number
  prewarmed: boolean
  nextFrameReady: boolean
  switchPending: boolean
  rafId: number | null
  loadRetries: number
  maxRetries: number
  loadTimeout: ReturnType<typeof setTimeout> | null
  PREWARM_TIME: number
  SWITCH_TIME: number
}

export const Live2dMixin: ThisType<WarehouseSceneThis> = {
  _startLive2dLoop(src: string, videoA: HTMLVideoElement, videoB: HTMLVideoElement) {
    if (this._loadingLock) {
      console.log("[Live2D] 加载锁定中，跳过本次请求")
      return
    }

    this._stopLive2dLoop()
    this._loadingLock = true

    console.log("[Live2D] ========== 开始无缝循环 v2 ==========")
    console.log("[Live2D] 视频源:", src)

    const hasRVFC = "requestVideoFrameCallback" in HTMLVideoElement.prototype
    console.log("[Live2D] requestVideoFrameCallback 支持:", hasRVFC)

    const isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
      window.innerWidth <= 768

    const PREWARM_TIME = isMobile ? 5.0 : 2
    const SWITCH_TIME = isMobile ? 4.0 : 0.033

    console.log("[Live2D] 设备类型:", isMobile ? "移动端" : "桌面端")
    console.log("[Live2D] 预热时间:", PREWARM_TIME, "s")
    console.log("[Live2D] 切换时间:", SWITCH_TIME, "s")

    const state: Live2dVideoState = {
      current: "A",
      src,
      running: true,
      duration: 0,
      startTime: Date.now(),
      prewarmed: false,
      nextFrameReady: false,
      switchPending: false,
      rafId: null,
      loadRetries: 0,
      maxRetries: 3,
      loadTimeout: null,
      PREWARM_TIME,
      SWITCH_TIME
    }
    this._live2dVideoState = state

    const getCurrent = (): HTMLVideoElement => (state.current === "A" ? videoA : videoB)
    const getNext = (): HTMLVideoElement => (state.current === "A" ? videoB : videoA)
    const log = (msg: string) => console.log(`[Live2D] ${Date.now() - state.startTime}ms: ${msg}`)

    const clearLoadTimeout = () => {
      if (state.loadTimeout) {
        clearTimeout(state.loadTimeout)
        state.loadTimeout = null
      }
    }

    const retryLoad = () => {
      if (state.loadRetries >= state.maxRetries) {
        console.error("[Live2D] 视频加载失败，已达到最大重试次数")
        return
      }

      state.loadRetries++
      log(`重试加载视频 (第 ${state.loadRetries} 次)`)

      videoA.src = ""
      videoB.src = ""

      setTimeout(() => {
        videoA.src = src
        videoB.src = src
        videoA.load()
        videoB.load()
        setupLoadTimeout()
      }, 100)
    }

    const setupLoadTimeout = () => {
      clearLoadTimeout()
      state.loadTimeout = setTimeout(() => {
        if (!state.duration && state.running) {
          log("视频加载超时 (5秒)")
          retryLoad()
        }
      }, 5000)
    }

    videoA.classList.remove("active")
    videoB.classList.remove("active")
    videoA.style.opacity = "0"
    videoB.style.opacity = "0"

    const loadingPlaceholder = document.getElementById("live2dLoadingPlaceholder")
    if (loadingPlaceholder) {
      loadingPlaceholder.classList.add("visible")
    }

    const getReadyStateText = (video: HTMLVideoElement) => {
      const states = ["HAVE_NOTHING", "HAVE_METADATA", "HAVE_CURRENT_DATA", "HAVE_FUTURE_DATA", "HAVE_ENOUGH_DATA"]
      return states[video.readyState] || "UNKNOWN"
    }

    const getNetworkStateText = (video: HTMLVideoElement) => {
      const states = ["NETWORK_EMPTY", "NETWORK_IDLE", "NETWORK_LOADING", "NETWORK_NO_SOURCE"]
      return states[video.networkState] || "UNKNOWN"
    }

    const diagnoseVideo = (label: string, video: HTMLVideoElement) => {
      console.log(`[Live2D-DIAG] ${label}:`)
      console.log(`[Live2D-DIAG]   src: ${video.src}`)
      console.log(`[Live2D-DIAG]   readyState: ${video.readyState} (${getReadyStateText(video)})`)
      console.log(`[Live2D-DIAG]   networkState: ${video.networkState} (${getNetworkStateText(video)})`)
      console.log(`[Live2D-DIAG]   currentTime: ${video.currentTime.toFixed(3)}s`)
      console.log(`[Live2D-DIAG]   duration: ${video.duration.toFixed(3)}s`)
      console.log(`[Live2D-DIAG]   paused: ${video.paused}`)
      console.log(`[Live2D-DIAG]   buffered: ${video.buffered.length} ranges`)
      if (video.buffered.length > 0) {
        console.log(
          `[Live2D-DIAG]   buffered 0: ${video.buffered.start(0).toFixed(3)} - ${video.buffered.end(0).toFixed(3)}`
        )
      }
    }

    console.log("[Live2D-DIAG] ========== 开始加载视频 ==========")
    console.log(`[Live2D-DIAG] 视频路径: ${src}`)
    console.log(`[Live2D-DIAG] 开始时间: ${Date.now()}`)

    const previousSrcA = videoA.src
    console.log(`[Live2D-DIAG] videoA之前的src: ${previousSrcA}`)
    console.log(`[Live2D-DIAG] videoB之前的src: ${videoB.src}`)
    console.log(
      `[Live2D-DIAG] 是否切换到相同视频: ${previousSrcA === src || previousSrcA.includes(src.substring(src.lastIndexOf("/")))}`
    )

    diagnoseVideo("videoA 初始状态", videoA)

    videoA.classList.add("active")
    videoA.src = src
    videoB.src = src

    console.log(`[Live2D-DIAG] 设置src后: ${Date.now()}`)
    diagnoseVideo("videoA 设置src后", videoA)

    videoA.load()
    videoB.load()

    console.log(`[Live2D-DIAG] 调用load()后: ${Date.now()}`)
    diagnoseVideo("videoA load()后", videoA)

    setupLoadTimeout()

    const loadStartTime = Date.now()
    const getElapsed = () => `${Date.now() - loadStartTime}ms`

    console.log(`[Live2D-PERF] ========== 性能计时开始 ==========`)
    console.log(`[Live2D-PERF] 开始时间: ${loadStartTime}`)

    const stopPolling = () => {
      if (state.rafId) {
        cancelAnimationFrame(state.rafId)
        state.rafId = null
      }
    }

    const startPolling = () => {
      stopPolling()
      state.rafId = requestAnimationFrame(pollProgress)
    }

    const prewarmNext = () => {
      if (state.prewarmed) return
      state.prewarmed = true

      const next = getNext()

      console.log(`[Live2D-DIAG] 预热备用视频:`)
      diagnoseVideo(`next before prewarm`, next)

      const markFrameReady = () => {
        if (!state.running || state.nextFrameReady) return
        state.nextFrameReady = true
        log(`备用视频首帧已渲染 @ ${next.currentTime.toFixed(3)}s`)
        console.log(`[Live2D-DIAG] 备用视频首帧就绪:`)
        diagnoseVideo(`next frame ready`, next)
        if (state.switchPending) {
          performSwitch()
        }
      }

      next.style.opacity = "0"

      if (next.readyState >= 3) {
        log(`[快速路径] seek到0, 等待readyState恢复`)
        next.currentTime = 0
        const waitSeek = () => {
          if (!state.running) return
          if (next.readyState >= 3) {
            log(`[快速路径] seek完成, 预热解码器`)
            next.play().catch(() => {})
            if (hasRVFC) {
              next.requestVideoFrameCallback(() => {
                next.pause()
                log(`[快速路径] 解码器已预热, 就绪`)
                markFrameReady()
              })
            } else {
              const checkDecode = () => {
                if (next.currentTime > 0 || next.readyState >= 4) {
                  next.pause()
                  markFrameReady()
                } else {
                  requestAnimationFrame(checkDecode)
                }
              }
              requestAnimationFrame(checkDecode)
            }
          } else {
            log(`[快速路径] 等待解码恢复 readyState=${next.readyState}`)
            requestAnimationFrame(waitSeek)
          }
        }
        requestAnimationFrame(waitSeek)
        return
      }

      log(`[慢速路径] readyState=${next.readyState}, 需要解码首帧, 调用 play()`)
      next.play().catch(() => {})

      if (hasRVFC) {
        next.requestVideoFrameCallback(() => {
          log(`[RVFC回调] 首帧已解码 @ ${next.currentTime.toFixed(3)}s, pause()`)
          next.pause()
          markFrameReady()
        })
      } else {
        const checkFrame = () => {
          if (!state.running) return
          if (next.readyState >= 3 || next.currentTime > 0) {
            log(`[轮询就绪] readyState=${next.readyState}, currentTime=${next.currentTime.toFixed(3)}, pause()`)
            next.pause()
            markFrameReady()
          } else {
            requestAnimationFrame(checkFrame)
          }
        }
        requestAnimationFrame(checkFrame)
      }
    }

    const performSwitch = () => {
      if (!state.running) return
      state.switchPending = false

      const current = getCurrent()
      const next = getNext()
      const nextKey: "A" | "B" = state.current === "A" ? "B" : "A"
      const oldKey = state.current

      const t0 = Date.now()
      log(`========== 执行切换 ${oldKey} -> ${nextKey} ==========`)

      console.log(`[Live2D-DIAG] 切换前状态:`)
      diagnoseVideo(`current (${oldKey})`, current)
      diagnoseVideo(`next (${nextKey})`, next)

      next.style.opacity = "1"
      next.classList.add("active")
      const playT0 = Date.now()
      next.play().catch(() => {})
      const playT1 = Date.now()
      if (playT1 - playT0 > 1) {
        log(`[性能] next.play() 阻塞了 ${playT1 - playT0}ms`)
      }

      setTimeout(() => {
        current.pause()
        current.style.opacity = "0"
        current.classList.remove("active")
      }, 0)

      state.current = nextKey
      state.prewarmed = false
      state.nextFrameReady = false

      log(`切换完成，耗时 ${Date.now() - t0}ms`)

      setTimeout(() => {
        console.log(`[Live2D-DIAG] 重置旧视频(=${oldKey})到第一帧:`)
        diagnoseVideo(`current before reset`, current)

        const resetStartTime = Date.now()

        current.pause()

        current.removeAttribute("src")
        current.load()

        console.log(`[Live2D-DIAG] 清空src后:`)
        diagnoseVideo(`current after clear`, current)

        setTimeout(() => {
          current.src = state.src
          current.load()

          const resetElapsed = Date.now() - resetStartTime
          console.log(`[Live2D-PERF] 重置视频耗时: ${resetElapsed}ms`)
          console.log(`[Live2D-DIAG] 重置后 readyState=${current.readyState}:`)
          diagnoseVideo(`current after reset`, current)
          log(`旧视频${oldKey}已重置到第一帧 (缓存${resetElapsed}ms)`)
        }, 50)
      }, 200)

      startPolling()
    }

    const requestSwitch = () => {
      if (state.switchPending) return

      if (state.nextFrameReady) {
        performSwitch()
      } else {
        state.switchPending = true
        log(`切换等待备用视频首帧就绪...`)
        if (!state.prewarmed) {
          prewarmNext()
        }
      }
    }

    const pollProgress = () => {
      if (!state.running) return

      const current = getCurrent()
      const currentKey = state.current

      if (state.duration > 0 && !current.paused) {
        const remaining = state.duration - current.currentTime
        if (remaining <= state.PREWARM_TIME && !state.prewarmed) {
          log(`[轮询] 视频${currentKey} 剩余 ${remaining.toFixed(3)}s, 触发预热`)
          prewarmNext()
        }

        if (remaining <= state.SWITCH_TIME && !state.switchPending) {
          log(`[轮询] 视频${currentKey} 剩余 ${remaining.toFixed(3)}s, 触发切换`)
          requestSwitch()
          return
        }
      }

      if (state.running) {
        state.rafId = requestAnimationFrame(pollProgress)
      }
    }

    videoA.onloadedmetadata = () => {
      console.log(`[Live2D-PERF] videoA loadedmetadata: ${getElapsed()}`)
      console.log(`[Live2D-DIAG] videoA onloadedmetadata: ${Date.now()}`)
      diagnoseVideo("videoA loadedmetadata", videoA)
    }

    videoB.onloadedmetadata = () => {
      console.log(`[Live2D-PERF] videoB loadedmetadata: ${getElapsed()}`)
      console.log(`[Live2D-DIAG] videoB onloadedmetadata: ${Date.now()}`)
      diagnoseVideo("videoB loadedmetadata", videoB)
    }

    videoA.onloadeddata = () => {
      if (!state.running) return

      if (!videoA.classList.contains("active")) {
        console.log(`[Live2D-DIAG] videoA loadeddata 忽略（非活动状态）`)
        return
      }

      console.log(`[Live2D-PERF] videoA loadeddata: ${getElapsed()}`)
      console.log(`[Live2D-DIAG] videoA onloadeddata: ${Date.now()}`)
      diagnoseVideo("videoA loadeddata", videoA)
      clearLoadTimeout()
      this._loadingLock = false
      state.duration = videoA.duration
      log(`videoA 加载完成, duration: ${videoA.duration}s`)

      if (loadingPlaceholder) {
        loadingPlaceholder.classList.remove("visible")
      }

      videoA.style.opacity = "1"
      videoA.play().catch((e) => console.error("[Live2D] videoA play 失败:", e))
      startPolling()

      setTimeout(() => {
        if (!state.running) return
        videoB.play().catch(() => {})
        if (hasRVFC) {
          videoB.requestVideoFrameCallback(() => {
            videoB.pause()
            console.log(`[Live2D-PERF] videoB 初始预解码完成: ${getElapsed()}`)
          })
        }
      }, 100)
    }

    videoB.onloadeddata = () => {
      if (!state.running) return

      if (!videoB.classList.contains("active")) {
        console.log(`[Live2D-DIAG] videoB loadeddata 忽略（非活动状态）`)
        return
      }

      console.log(`[Live2D-PERF] videoB loadeddata: ${getElapsed()}`)
      console.log(`[Live2D-DIAG] videoB onloadeddata: ${Date.now()}`)
      diagnoseVideo("videoB loadeddata", videoB)
      log(`videoB 加载完成`)
      videoB.currentTime = 0
      videoB.pause()
    }

    videoA.oncanplay = () => {
      console.log(`[Live2D-PERF] videoA canplay: ${getElapsed()}`)
      console.log(`[Live2D-DIAG] videoA oncanplay: ${Date.now()}`)
      diagnoseVideo("videoA canplay", videoA)
    }

    videoB.oncanplay = () => {
      console.log(`[Live2D-PERF] videoB canplay: ${getElapsed()}`)
      console.log(`[Live2D-DIAG] videoB oncanplay: ${Date.now()}`)
    }

    videoA.oncanplaythrough = () => {
      console.log(`[Live2D-PERF] videoA canplaythrough: ${getElapsed()}`)
      console.log(`[Live2D-DIAG] videoA oncanplaythrough: ${Date.now()}`)
    }

    videoB.oncanplaythrough = () => {
      console.log(`[Live2D-PERF] videoB canplaythrough: ${getElapsed()}`)
      console.log(`[Live2D-DIAG] videoB oncanplaythrough: ${Date.now()}`)
    }

    videoA.onprogress = () => {
      if (videoA.buffered.length > 0) {
        const end = videoA.buffered.end(videoA.buffered.length - 1)
        const percent = videoA.duration > 0 ? ((end / videoA.duration) * 100).toFixed(1) : "0"
        console.log(`[Live2D-DIAG] videoA progress: ${percent}% buffered`)
      }
    }

    videoA.onwaiting = () => {
      console.log(`[Live2D-PERF] videoA waiting: ${getElapsed()}`)
      console.log(`[Live2D-DIAG] videoA onwaiting: ${Date.now()}`)
    }

    videoA.onplaying = () => {
      if (!videoA.classList.contains("active")) return
      console.log(`[Live2D-PERF] videoA playing: ${getElapsed()}`)
      console.log(`[Live2D-DIAG] videoA onplaying: ${Date.now()}`)
    }

    videoB.onplaying = () => {
      if (!videoB.classList.contains("active")) return
      console.log(`[Live2D-PERF] videoB playing: ${getElapsed()}`)
      console.log(`[Live2D-DIAG] videoB onplaying: ${Date.now()}`)
    }

    videoA.onended = () => {
      if (!state.running || state.current !== "A") return
      log(`videoA ended 事件兜底触发`)
      requestSwitch()
    }

    videoB.onended = () => {
      if (!state.running || state.current !== "B") return
      log(`videoB ended 事件兜底触发`)
      requestSwitch()
    }

    videoA.onerror = (e) => {
      console.error("[Live2D-DIAG] ========== videoA ERROR ==========")
      console.error("[Live2D-DIAG] 时间:", Date.now())
      console.error("[Live2D-DIAG] 事件:", e)
      if (videoA.error) {
        console.error("[Live2D-DIAG] error code:", videoA.error.code)
        console.error("[Live2D-DIAG] error message:", videoA.error.message)
      }
      console.error("[Live2D-DIAG] src:", videoA.src)
      console.error("[Live2D-DIAG] networkState:", videoA.networkState)
      console.error("[Live2D-DIAG] readyState:", videoA.readyState)
      diagnoseVideo("videoA error state", videoA)
      if (state.running && state.loadRetries < state.maxRetries) {
        retryLoad()
      } else {
        this._loadingLock = false
      }
    }
    videoB.onerror = (e) => {
      console.error("[Live2D-DIAG] ========== videoB ERROR ==========")
      console.error("[Live2D-DIAG] 时间:", Date.now())
      console.error("[Live2D-DIAG] 事件:", e)
      if (videoB.error) {
        console.error("[Live2D-DIAG] error code:", videoB.error.code)
        console.error("[Live2D-DIAG] error message:", videoB.error.message)
      }
      console.error("[Live2D-DIAG] src:", videoB.src)
      console.error("[Live2D-DIAG] networkState:", videoB.networkState)
      console.error("[Live2D-DIAG] readyState:", videoB.readyState)
      diagnoseVideo("videoB error state", videoB)
      if (state.running && state.loadRetries < state.maxRetries) {
        retryLoad()
      } else {
        this._loadingLock = false
      }
    }
  },

  _stopLive2dLoop() {
    this._loadingLock = false

    const loadingPlaceholder = document.getElementById("live2dLoadingPlaceholder")
    if (loadingPlaceholder) {
      loadingPlaceholder.classList.remove("visible")
    }

    if (this._live2dVideoState) {
      this._live2dVideoState.running = false
      if (this._live2dVideoState.rafId) {
        cancelAnimationFrame(this._live2dVideoState.rafId)
      }
      if (this._live2dVideoState.loadTimeout) {
        clearTimeout(this._live2dVideoState.loadTimeout)
      }
      this._live2dVideoState = null
    }

    const videoA = document.getElementById("overlayLive2dVideoA") as HTMLVideoElement | null
    const videoB = document.getElementById("overlayLive2dVideoB") as HTMLVideoElement | null

    if (videoA) {
      videoA.pause()
      videoA.onloadedmetadata = null
      videoA.onloadeddata = null
      videoA.ontimeupdate = null
      videoA.onended = null
      videoA.onerror = null
      videoA.oncanplay = null
      videoA.oncanplaythrough = null
      videoA.onprogress = null
      videoA.onwaiting = null
      videoA.onplaying = null
      videoA.removeAttribute("src")
      videoA.srcObject = null
      videoA.load()
    }

    if (videoB) {
      videoB.pause()
      videoB.onloadedmetadata = null
      videoB.onloadeddata = null
      videoB.ontimeupdate = null
      videoB.onended = null
      videoB.onerror = null
      videoB.oncanplay = null
      videoB.oncanplaythrough = null
      videoB.onplaying = null
      videoB.removeAttribute("src")
      videoB.srcObject = null
      videoB.load()
    }

    console.log("[Live2D-DIAG] 已停止循环并清理视频资源")
  }
}

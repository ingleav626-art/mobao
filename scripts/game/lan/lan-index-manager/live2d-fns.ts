/**
 * @file lan-index-manager/live2d-fns.ts
 * @module lan-index-manager/live2d-fns
 * @description 联机大厅 Live2D 立绘无缝循环播放器纯函数。
 *              使用双视频 A/B 切换实现无缝循环，支持移动端适配。
 *              无 this. 依赖，仅操作 DOM 元素。
 */
interface Live2dState {
  current: string
  src: string
  running: boolean
  duration: number
  prewarmed: boolean
  nextFrameReady: boolean
  switchPending: boolean
  rafId: number | null
  loadRetries: number
  maxRetries: number
  loadTimeout: number | null
}

let _lanLive2dState: Live2dState | null = null

export function startLanLive2dLoop(src: string, videoA: HTMLVideoElement, videoB: HTMLVideoElement): void {
  stopLanLive2dLoop()

  var loadingPlaceholder = document.getElementById("lanLive2dLoadingPlaceholder")
  if (loadingPlaceholder) loadingPlaceholder.classList.add("visible")

  var hasRVFC = "requestVideoFrameCallback" in HTMLVideoElement.prototype
  var isMobile =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    window.innerWidth <= 768
  var PREWARM_TIME = isMobile ? 5.0 : 2.0
  var SWITCH_TIME = isMobile ? 4.0 : 0.033

  var state: Live2dState = {
    current: "A",
    src: src,
    running: true,
    duration: 0,
    prewarmed: false,
    nextFrameReady: false,
    switchPending: false,
    rafId: null,
    loadRetries: 0,
    maxRetries: 3,
    loadTimeout: null
  }
  _lanLive2dState = state

  var getCurrent = function () {
    return state.current === "A" ? videoA : videoB
  }
  var getNext = function () {
    return state.current === "A" ? videoB : videoA
  }

  var clearLoadTimeout = function () {
    if (state.loadTimeout) {
      clearTimeout(state.loadTimeout)
      state.loadTimeout = null
    }
  }

  var retryLoad = function () {
    if (state.loadRetries >= state.maxRetries) return
    state.loadRetries++
    videoA.removeAttribute("src")
    videoB.removeAttribute("src")
    videoA.load()
    videoB.load()
    setTimeout(function () {
      if (!state.running) return
      videoA.src = src
      videoB.src = src
      videoA.load()
      videoB.load()
      setupLoadTimeout()
    }, 100)
  }

  var setupLoadTimeout = function () {
    clearLoadTimeout()
    state.loadTimeout = setTimeout(function () {
      if (!state.duration && state.running) retryLoad()
    }, 5000)
  }

  videoA.classList.remove("active")
  videoB.classList.remove("active")
  videoA.style.opacity = "0"
  videoB.style.opacity = "0"

  videoA.classList.add("active")
  videoA.src = src
  videoB.src = src
  videoA.load()
  videoB.load()
  setupLoadTimeout()

  var stopPolling = function () {
    if (state.rafId) {
      cancelAnimationFrame(state.rafId)
      state.rafId = null
    }
  }

  var startPolling = function () {
    stopPolling()
    state.rafId = requestAnimationFrame(pollProgress)
  }

  var prewarmNext = function () {
    if (state.prewarmed) return
    state.prewarmed = true
    var next = getNext()
    next.style.opacity = "0"

    var markFrameReady = function () {
      if (!state.running || state.nextFrameReady) return
      state.nextFrameReady = true
      if (state.switchPending) performSwitch()
    }

    if (next.readyState >= 3) {
      next.currentTime = 0
      var waitSeek = function () {
        if (!state.running) return
        if (next.readyState >= 3) {
          next.play().catch(function () {})
          if (hasRVFC) {
            ;(next as unknown as { requestVideoFrameCallback: (cb: () => void) => void }).requestVideoFrameCallback(
              function () {
                next.pause()
                markFrameReady()
              }
            )
          } else {
            requestAnimationFrame(function () {
              next.pause()
              markFrameReady()
            })
          }
        } else {
          requestAnimationFrame(waitSeek)
        }
      }
      requestAnimationFrame(waitSeek)
      return
    }

    next.play().catch(function () {})
    if (hasRVFC) {
      ;(next as unknown as { requestVideoFrameCallback: (cb: () => void) => void }).requestVideoFrameCallback(
        function () {
          next.pause()
          markFrameReady()
        }
      )
    } else {
      var checkFrame = function () {
        if (!state.running) return
        if (next.readyState >= 3 || next.currentTime > 0) {
          next.pause()
          markFrameReady()
        } else {
          requestAnimationFrame(checkFrame)
        }
      }
      requestAnimationFrame(checkFrame)
    }
  }

  var performSwitch = function () {
    if (!state.running) return
    state.switchPending = false
    var current = getCurrent()
    var next = getNext()
    var nextKey = state.current === "A" ? "B" : "A"

    next.style.opacity = "1"
    next.classList.add("active")
    next.play().catch(function () {})

    setTimeout(function () {
      current.pause()
      current.style.opacity = "0"
      current.classList.remove("active")
    }, 0)

    state.current = nextKey
    state.prewarmed = false
    state.nextFrameReady = false

    setTimeout(function () {
      current.pause()
      current.removeAttribute("src")
      current.load()
      setTimeout(function () {
        current.src = state.src
        current.load()
      }, 50)
    }, 200)

    startPolling()
  }

  var requestSwitch = function () {
    if (state.switchPending) return
    if (state.nextFrameReady) {
      performSwitch()
    } else {
      state.switchPending = true
      if (!state.prewarmed) prewarmNext()
    }
  }

  var pollProgress = function () {
    if (!state.running) return
    var current = getCurrent()
    if (state.duration > 0 && !current.paused) {
      var remaining = state.duration - current.currentTime
      if (remaining <= PREWARM_TIME && !state.prewarmed) prewarmNext()
      if (remaining <= SWITCH_TIME && !state.switchPending) {
        requestSwitch()
        return
      }
    }
    if (state.running) state.rafId = requestAnimationFrame(pollProgress)
  }

  videoA.onloadeddata = function () {
    if (!state.running) return
    if (!videoA.classList.contains("active")) return
    clearLoadTimeout()
    state.duration = videoA.duration
    if (loadingPlaceholder) loadingPlaceholder.classList.remove("visible")
    videoA.style.opacity = "1"
    videoA.play().catch(function () {})
    startPolling()
    setTimeout(function () {
      if (!state.running) return
      videoB.play().catch(function () {})
      if (hasRVFC) {
        ;(videoB as unknown as { requestVideoFrameCallback: (cb: () => void) => void }).requestVideoFrameCallback(
          function () {
            videoB.pause()
          }
        )
      }
    }, 100)
  }

  videoB.onloadeddata = function () {
    if (!state.running) return
    if (!videoB.classList.contains("active")) return
    videoB.currentTime = 0
    videoB.pause()
  }

  videoA.onended = function () {
    if (!state.running || state.current !== "A") return
    requestSwitch()
  }

  videoB.onended = function () {
    if (!state.running || state.current !== "B") return
    requestSwitch()
  }

  videoA.onerror = function () {
    if (state.running && state.loadRetries < state.maxRetries) retryLoad()
  }

  videoB.onerror = function () {
    if (state.running && state.loadRetries < state.maxRetries) retryLoad()
  }
}

export function stopLanLive2dLoop(): void {
  if (_lanLive2dState) {
    _lanLive2dState.running = false
    if (_lanLive2dState.rafId) cancelAnimationFrame(_lanLive2dState.rafId)
    if (_lanLive2dState.loadTimeout) clearTimeout(_lanLive2dState.loadTimeout)
    _lanLive2dState = null
  }
  var videoA = document.getElementById("lanLive2dVideoA") as HTMLVideoElement | null
  var videoB = document.getElementById("lanLive2dVideoB") as HTMLVideoElement | null
  if (videoA) {
    videoA.pause()
    videoA.onloadeddata = null
    videoA.onended = null
    videoA.onerror = null
    videoA.removeAttribute("src")
    videoA.classList.remove("active")
    videoA.style.opacity = "0"
  }
  if (videoB) {
    videoB.pause()
    videoB.onloadeddata = null
    videoB.onended = null
    videoB.onerror = null
    videoB.removeAttribute("src")
    videoB.classList.remove("active")
    videoB.style.opacity = "0"
  }
  var loadingPlaceholder = document.getElementById("lanLive2dLoadingPlaceholder")
  if (loadingPlaceholder) loadingPlaceholder.classList.remove("visible")
}

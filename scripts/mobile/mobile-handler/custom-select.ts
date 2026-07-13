/**
 * @file mobile/mobile-handler/custom-select.ts
 * @module mobile/mobile-handler/custom-select
 * @description CustomSelectPart - 自定义下拉框子对象。将原生 <select> 转换为
 *              自定义样式的下拉框，支持触摸滚动、键盘导航、点击选择。
 *              convertToCustomSelect 为最大方法（182 行），内部使用闭包变量
 *              管理 touch 状态，无跨方法 this 调用。
 *
 * @requires ./types - MobileHandlerType
 * @exports CustomSelectPart - 自定义下拉框子对象
 */
import type { MobileHandlerType } from "./types"

export const CustomSelectPart: ThisType<MobileHandlerType> = {
  setupCustomSelects: function () {
    if (!this.isMobile && !this.isTouch) return

    var self = this

    setTimeout(function () {
      var selects = document.querySelectorAll("select:not([data-custom-select])")
      selects.forEach(function (select) {
        self.convertToCustomSelect(select as HTMLSelectElement)
      })
    }, 500)

    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
          if (node.nodeType === 1) {
            if (
              (node as HTMLElement).tagName === "SELECT" &&
              !(node as HTMLElement).hasAttribute("data-custom-select")
            ) {
              self.convertToCustomSelect(node as HTMLSelectElement)
            }
            if ((node as HTMLElement).querySelectorAll) {
              var nestedSelects = (node as HTMLElement).querySelectorAll("select:not([data-custom-select])")
              nestedSelects.forEach(function (s) {
                self.convertToCustomSelect(s as HTMLSelectElement)
              })
            }
          }
        })
      })
    })

    observer.observe(document.body, { childList: true, subtree: true })
  },

  convertToCustomSelect: function (originalSelect: HTMLSelectElement) {
    if (originalSelect.hasAttribute("data-custom-select")) return
    if (!originalSelect.parentNode) return

    originalSelect.setAttribute("data-custom-select", "true")

    var container = document.createElement("div")
    container.className = "custom-select-container"

    var trigger = document.createElement("div")
    trigger.className = "custom-select-trigger"
    trigger.setAttribute("tabindex", "0")

    var selectedText = document.createElement("span")
    selectedText.className = "custom-select-text"

    var arrow = document.createElement("span")
    arrow.className = "custom-select-arrow"
    arrow.innerHTML =
      '<svg viewBox="0 0 12 12" width="12" height="12"><path fill="currentColor" d="M6 8L1 3h10z"/></svg>'

    trigger.appendChild(selectedText)
    trigger.appendChild(arrow)

    var dropdown = document.createElement("div")
    dropdown.className = "custom-select-dropdown"

    var options = originalSelect.querySelectorAll("option")
    var hasSelected = false

    options.forEach(function (option) {
      var item = document.createElement("div")
      item.className = "custom-select-option"
      item.setAttribute("data-value", option.value)
      item.textContent = option.textContent

      if (option.selected) {
        item.classList.add("selected")
        selectedText.textContent = option.textContent
        hasSelected = true
      }

      dropdown.appendChild(item)
    })

    if (!hasSelected && options.length > 0) {
      selectedText.textContent = options[0].textContent
      var firstOpt = dropdown.querySelector(".custom-select-option")
      if (firstOpt) firstOpt.classList.add("selected")
    }

    container.appendChild(trigger)
    container.appendChild(dropdown)

    originalSelect.parentNode!.insertBefore(container, originalSelect.nextSibling)
    originalSelect.style.display = "none"

    var touchStartY = 0
    var touchStartX = 0
    var touchStartTime = 0
    var isScrolling = false

    dropdown.addEventListener(
      "touchstart",
      function (e) {
        touchStartY = e.touches[0].clientY
        touchStartX = e.touches[0].clientX
        touchStartTime = Date.now()
        isScrolling = false
      },
      { passive: true }
    )

    dropdown.addEventListener(
      "touchmove",
      function (e) {
        var touchY = e.touches[0].clientY
        var touchX = e.touches[0].clientX
        var deltaY = Math.abs(touchY - touchStartY)
        var deltaX = Math.abs(touchX - touchStartX)
        if (deltaY > 8 || deltaX > 8) {
          isScrolling = true
        }
      },
      { passive: true }
    )

    dropdown.addEventListener("touchend", function (e) {
      var elapsed = Date.now() - touchStartTime

      if (isScrolling || elapsed > 500) {
        if (e.cancelable) e.preventDefault()
        e.stopPropagation()
        return
      }

      var touch = e.changedTouches[0]
      var target = document.elementFromPoint(touch.clientX, touch.clientY)
      var option = target ? target.closest(".custom-select-option") : null

      if (option) {
        e.preventDefault()
        e.stopPropagation()

        dropdown.querySelectorAll(".custom-select-option").forEach(function (opt) {
          opt.classList.remove("selected")
        })
        option.classList.add("selected")

        selectedText.textContent = option.textContent
        var value = option.getAttribute("data-value")
        originalSelect.value = value || ""

        originalSelect.dispatchEvent(new Event("change", { bubbles: true }))

        container.classList.remove("open")
      }
    })

    trigger.addEventListener("click", function (e) {
      e.preventDefault()
      e.stopPropagation()

      var isOpen = container.classList.contains("open")

      document.querySelectorAll(".custom-select-container.open").forEach(function (c) {
        c.classList.remove("open")
      })

      if (!isOpen) {
        container.classList.add("open")
        var selectedOption = dropdown.querySelector(".custom-select-option.selected")
        if (selectedOption) {
          selectedOption.scrollIntoView({ block: "nearest" })
        }
      }
    })

    trigger.addEventListener("touchstart", function (e) {
      e.stopPropagation()
    })

    dropdown.addEventListener("click", function (e) {
      var option = (e.target as HTMLElement).closest(".custom-select-option")
      if (!option) return

      e.stopPropagation()

      dropdown.querySelectorAll(".custom-select-option").forEach(function (opt) {
        opt.classList.remove("selected")
      })
      option.classList.add("selected")

      selectedText.textContent = option.textContent
      var value = option.getAttribute("data-value")
      originalSelect.value = value || ""

      originalSelect.dispatchEvent(new Event("change", { bubbles: true }))

      container.classList.remove("open")
    })

    trigger.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault()
        trigger.click()
      } else if (e.key === "Escape") {
        container.classList.remove("open")
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault()
        var opts = dropdown.querySelectorAll(".custom-select-option")
        var currentIdx = -1
        opts.forEach(function (opt, idx) {
          if (opt.classList.contains("selected")) currentIdx = idx
        })
        var nextIdx = e.key === "ArrowDown" ? currentIdx + 1 : currentIdx - 1
        if (nextIdx >= 0 && nextIdx < opts.length) {
          ;(opts[nextIdx] as HTMLElement).click()
        }
      }
    })
  },

  closeAllCustomSelects: function () {
    document.querySelectorAll(".custom-select-container.open").forEach(function (container) {
      container.classList.remove("open")
    })
  }
}

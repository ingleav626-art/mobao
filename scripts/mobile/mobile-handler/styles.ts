/**
 * @file mobile/mobile-handler/styles.ts
 * @module mobile/mobile-handler/styles
 * @description 移动端适配 CSS 样式注入。从原 mobile-handler.ts 模块级 addStyles 函数搬移。
 *              非单例成员，由薄入口 initMobileHandler 调用。
 */
export function addStyles() {
  if (document.getElementById("mobile-handler-styles")) return

  var style = document.createElement("style")
  style.id = "mobile-handler-styles"
  style.textContent =
    "\
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
    "
  document.head.appendChild(style)
}

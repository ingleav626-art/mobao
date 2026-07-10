import type { WarehouseSceneThis } from "../../../types/warehouse-scene-this"
import { defaultGameSettings } from "../core/settings"
import { defaultDeepSeekSettings } from "../../llm/providers/deepseek-llm"

export function bindAiMemoryEvents(this: WarehouseSceneThis): void {
  this.dom.settingsCloseBtn?.addEventListener("click", () => this.closeSettingsOverlay(false))
  this.dom.settingsResetBtn?.addEventListener("click", () => {
    this.fillSettingsForm(defaultGameSettings())
    const provider = this.getLlmProvider()
    this.fillLlmSettingsForm(
      provider && typeof provider.defaultSettings === "function"
        ? provider.defaultSettings()
        : defaultDeepSeekSettings()
    )
    this.setSettingsStatus("已恢复默认，点击保存后生效。", false)
  })
  this.dom.settingsSaveBtn?.addEventListener("click", () => this.saveSettingsFromOverlay())
  if (this.dom.settingsReturnLobbyBtn) {
    this.dom.settingsReturnLobbyBtn?.addEventListener("click", () => {
      if (this.isLanMode) {
        this.showGameConfirm("确定要返回房间吗？当前游戏进度将丢失。", () => {
          this.closeSettingsOverlay(false)
          this.enterLanRoom()
        })
      } else {
        this.showGameConfirm("确定要返回大厅吗？当前游戏进度将丢失。", () => {
          this.closeSettingsOverlay(false)
          this.enterLobby()
        })
      }
    })
  }
  if (this.dom.clearAiMemoryBtn) {
    this.dom.clearAiMemoryBtn?.addEventListener("click", () => {
      this.showGameConfirm("确定要清空所有AI的持久化记忆吗？此操作不可恢复。", () => {
        this.clearAiMemoryStorage()
        if (this.dom.aiMemoryStatusText) {
          this.dom.aiMemoryStatusText.textContent = "已清空"
        }
        this.writeLog("AI持久化记忆已清空。")
      })
    })
  }
  if (this.dom.clearAiContextBtn) {
    this.dom.clearAiContextBtn?.addEventListener("click", () => {
      this.showGameConfirm("确定要清空AI跨局上下文吗？这将清除所有AI的跨局记忆和对话缓存。", () => {
        if (this.aiCrossGameMessagesByPlayer) {
          Object.keys(this.aiCrossGameMessagesByPlayer).forEach((pid) => {
            this.aiCrossGameMessagesByPlayer[pid] = []
          })
        }
        if (this.pendingNextRunAiSummaryByPlayer) {
          Object.keys(this.pendingNextRunAiSummaryByPlayer).forEach((pid) => {
            this.pendingNextRunAiSummaryByPlayer[pid] = ""
          })
        }
        if (this.aiConversationCache) {
          Object.keys(this.aiConversationCache).forEach((pid) => {
            this.aiConversationCache[pid] = null
          })
        }
        this.pendingSettlementSummary = ""
        this.saveAiMemoryToStorage()
        this.writeLog("AI跨局上下文已清空。")
      })
    })
  }
  if (this.dom.viewAiMemoryBtn) {
    this.dom.viewAiMemoryBtn?.addEventListener("click", () => {
      this.openAiMemoryPanel()
    })
  }
  if (this.dom.exportAiMemoryBtn) {
    this.dom.exportAiMemoryBtn?.addEventListener("click", () => {
      this.showAiMemoryExportDialog()
    })
  }
  this.showAiMemoryExportDialog = () => {
    this.removeAiMemoryExportDialog()
    const jsonData = this.exportAiMemoryToJson()
    const overlay = document.createElement("div")
    overlay.id = "aiMemoryExportDialog"
    overlay.style.cssText =
      "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:99999;"
    const box = document.createElement("div")
    box.style.cssText =
      "background:#2a2218;border:2px solid #d4a843;border-radius:12px;padding:20px;text-align:center;color:#e0d0b0;font-size:16px;max-width:400px;width:90%;"
    box.innerHTML =
      '<div style="margin-bottom:16px;font-size:18px;font-weight:bold;">导出AI记忆</div>' +
      '<div style="color:#a09070;margin-bottom:12px;font-size:14px;">选择导出方式：</div>' +
      '<div style="display:flex;gap:12px;justify-content:center;margin-bottom:16px;">' +
      '<button id="exportShareBtn" style="padding:12px 24px;border-radius:8px;border:1px solid #d4a843;background:rgba(212,168,67,0.15);color:#d4a843;cursor:pointer;font-size:15px;">分享</button>' +
      '<button id="exportCopyBtn" style="padding:12px 24px;border-radius:8px;border:1px solid #5a7ebd;background:rgba(90,126,189,0.15);color:#5a7ebd;cursor:pointer;font-size:15px;">复制JSON</button>' +
      "</div>" +
      '<button id="exportDialogCloseBtn" style="padding:10px 24px;border-radius:6px;border:1px solid #8a6a4a;background:rgba(138,106,74,0.15);color:#a09070;cursor:pointer;font-size:14px;">关闭</button>'
    overlay.appendChild(box)
    document.body.appendChild(overlay)
    const fileName = `mobao-ai-memory-${new Date().toISOString().slice(0, 10)}.json`
    const closeBtn = document.getElementById("exportDialogCloseBtn")
    if (closeBtn)
      closeBtn.addEventListener("click", () => {
        this.removeAiMemoryExportDialog()
      })
    const shareBtn = document.getElementById("exportShareBtn")
    if (shareBtn)
      shareBtn.addEventListener("click", () => {
        if (window.NativeBridge?.shareFile) {
          const base64Data = btoa(unescape(encodeURIComponent(jsonData)))
          const success = window.NativeBridge.shareFile(base64Data, fileName, "AI记忆导出")
          if (success) {
            if (this.dom.aiMemoryStatusText) {
              this.dom.aiMemoryStatusText.textContent = "已导出"
            }
            this.writeLog("AI记忆已通过分享导出。")
            this.removeAiMemoryExportDialog()
          } else {
            this.writeLog("分享导出失败。")
          }
        } else {
          const blob = new Blob([jsonData], { type: "application/json" })
          const file = new File([blob], fileName, { type: "application/json" })
          if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            navigator
              .share({
                files: [file],
                title: "AI记忆导出",
                text: "导出AI跨局记忆数据"
              })
              .then(() => {
                if (this.dom.aiMemoryStatusText) {
                  this.dom.aiMemoryStatusText.textContent = "已导出"
                }
                this.writeLog("AI记忆已通过分享导出。")
                this.removeAiMemoryExportDialog()
              })
              .catch((err) => {
                this.writeLog("分享导出失败: " + (err.message || "未知错误"))
              })
          } else {
            this.writeLog("当前环境不支持分享文件功能。")
          }
        }
      })
    const copyBtn = document.getElementById("exportCopyBtn")
    if (copyBtn)
      copyBtn.addEventListener("click", () => {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard
            .writeText(jsonData)
            .then(() => {
              if (this.dom.aiMemoryStatusText) {
                this.dom.aiMemoryStatusText.textContent = "已复制"
              }
              this.writeLog("AI记忆JSON已复制到剪贴板。")
              this.removeAiMemoryExportDialog()
            })
            .catch((err) => {
              this.writeLog("复制失败: " + (err.message || "未知错误"))
            })
        } else {
          this.writeLog("当前环境不支持剪贴板功能。")
        }
      })
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        this.removeAiMemoryExportDialog()
      }
    })
  }
  this.removeAiMemoryExportDialog = () => {
    const el = document.getElementById("aiMemoryExportDialog")
    if (el) el.remove()
  }
  if (this.dom.importAiMemoryBtn) {
    this.dom.importAiMemoryBtn?.addEventListener("click", () => {
      this.showAiMemoryImportDialog()
    })
  }
  window.__onFileImportResult = (base64Data) => {
    const statusEl = document.getElementById("importStatus")
    try {
      const jsonText = decodeURIComponent(escape(atob(base64Data)))
      const result = this.importAiMemoryFromJson(jsonText)
      if (result.ok) {
        if (statusEl) {
          statusEl.textContent = "导入成功！"
          statusEl.className = "ai-import-status success"
        }
        if (this.dom.aiMemoryStatusText) this.dom.aiMemoryStatusText.textContent = "已导入"
        this.writeLog("AI记忆已从文件导入。")
        setTimeout(() => this.removeAiMemoryImportDialog(), 800)
      } else {
        if (statusEl) {
          statusEl.textContent = "导入失败: " + result.error
          statusEl.className = "ai-import-status error"
        }
        this.writeLog("导入失败: " + result.error)
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (statusEl) {
        statusEl.textContent = "文件解析失败: " + msg
        statusEl.className = "ai-import-status error"
      }
      this.writeLog("文件解析失败: " + msg)
    }
  }
  window.__onFileImportError = (errorMsg) => {
    const statusEl = document.getElementById("importStatus")
    if (statusEl) {
      statusEl.textContent = "导入错误: " + errorMsg
      statusEl.className = "ai-import-status error"
    }
    this.writeLog("文件导入错误: " + errorMsg)
  }
  this.showAiMemoryImportDialog = () => {
    this.removeAiMemoryImportDialog()
    const overlay = document.createElement("div")
    overlay.id = "aiMemoryImportDialog"
    overlay.className = "ai-import-overlay"
    const hasNativeImport = !!window.NativeBridge?.openFileImport
    const box = document.createElement("div")
    box.className = "ai-import-box"
    box.innerHTML =
      '<div class="ai-import-title">导入AI记忆</div>' +
      '<div class="ai-import-actions">' +
      (hasNativeImport
        ? '<button id="importFileBtn" class="ai-import-btn">从文件导入</button>'
        : '<label id="importFileBtn" class="ai-import-btn" style="cursor:pointer;display:inline-block;">从文件导入<input type="file" id="importFileInput" accept=".json,application/json" style="display:none;"></label>') +
      '<button id="importPasteBtn" class="ai-import-btn secondary">粘贴JSON</button>' +
      "</div>" +
      '<div id="importPasteArea" style="display:none;">' +
      '<textarea id="importJsonTextarea" class="ai-import-textarea" placeholder="在此粘贴JSON数据..."></textarea>' +
      "</div>" +
      '<div id="importStatus" class="ai-import-status"></div>' +
      '<div class="ai-import-footer">' +
      '<button id="importPasteConfirmBtn" class="ai-import-btn" style="display:none;">确认导入</button>' +
      '<button id="importDialogCloseBtn" class="ai-import-close">关闭</button>' +
      "</div>"
    overlay.appendChild(box)
    document.body.appendChild(overlay)

    const textarea = document.getElementById("importJsonTextarea") as HTMLTextAreaElement | null
    const pasteArea = document.getElementById("importPasteArea")
    const confirmBtn = document.getElementById("importPasteConfirmBtn")
    const fileBtn = document.getElementById("importFileBtn")
    const pasteBtn = document.getElementById("importPasteBtn")
    const statusEl = document.getElementById("importStatus")
    const fileInput = document.getElementById("importFileInput")

    const showStatus = (msg: string, type?: string | null) => {
      if (!statusEl) return
      statusEl.textContent = msg
      statusEl.className = "ai-import-status " + (type || "")
    }

    if (hasNativeImport && fileBtn) {
      fileBtn.addEventListener("click", () => {
        showStatus("正在打开文件选择器...", "loading")
        window.NativeBridge?.openFileImport?.()
      })
    }

    if (fileInput) {
      fileInput.addEventListener("change", (e) => {
        const file = (e.target as HTMLInputElement).files && (e.target as HTMLInputElement).files?.[0]
        if (!file) return
        showStatus("正在读取文件...", "loading")
        const reader = new FileReader()
        reader.onload = (ev) => {
          try {
            const jsonText = (ev.target as FileReader).result as string
            const result = this.importAiMemoryFromJson(jsonText)
            if (result.ok) {
              showStatus("导入成功！", "success")
              if (this.dom.aiMemoryStatusText) this.dom.aiMemoryStatusText.textContent = "已导入"
              this.writeLog("AI记忆已从文件导入。")
              setTimeout(() => this.removeAiMemoryImportDialog(), 800)
            } else {
              showStatus("导入失败: " + result.error, "error")
            }
          } catch (err: unknown) {
            showStatus("文件解析失败: " + (err instanceof Error ? err.message : String(err)), "error")
          }
        }
        reader.onerror = () => showStatus("文件读取失败", "error")
        reader.readAsText(file)
      })
    }

    if (pasteBtn) {
      pasteBtn.addEventListener("click", () => {
        if (pasteArea) pasteArea.style.display = "block"
        if (textarea) textarea.focus()
        if (confirmBtn) confirmBtn.style.display = "inline-block"
        if (fileBtn) fileBtn.style.display = "none"
        if (pasteBtn) pasteBtn.style.display = "none"
      })
    }

    const importCloseBtn = document.getElementById("importDialogCloseBtn")
    if (importCloseBtn)
      importCloseBtn.addEventListener("click", () => {
        this.removeAiMemoryImportDialog()
      })
    const importPasteBtn = document.getElementById("importPasteConfirmBtn")
    if (importPasteBtn)
      importPasteBtn.addEventListener("click", () => {
        if (!textarea) return
        const jsonText = textarea.value.trim()
        if (!jsonText) {
          showStatus("请粘贴JSON数据。", "error")
          return
        }
        showStatus("正在导入...", "loading")
        const result = this.importAiMemoryFromJson(jsonText)
        if (result.ok) {
          showStatus("导入成功！", "success")
          if (this.dom.aiMemoryStatusText) this.dom.aiMemoryStatusText.textContent = "已导入"
          this.writeLog("AI记忆已成功导入。")
          setTimeout(() => this.removeAiMemoryImportDialog(), 800)
        } else {
          showStatus("导入失败: " + result.error, "error")
        }
      })
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        this.removeAiMemoryImportDialog()
      }
    })
  }
  this.removeAiMemoryImportDialog = () => {
    const el = document.getElementById("aiMemoryImportDialog")
    if (el) el.remove()
  }
  this.downloadAiMemoryFallback = (jsonData: string, fileName: string) => {
    const url = URL.createObjectURL(new Blob([jsonData], { type: "application/json" }))
    const a = document.createElement("a")
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    if (this.dom.aiMemoryStatusText) {
      this.dom.aiMemoryStatusText.textContent = "已导出"
    }
    this.writeLog("AI记忆已导出到文件。")
  }
  if (this.dom.resetAiWalletBtn) {
    this.dom.resetAiWalletBtn?.addEventListener("click", () => {
      const okBtn = document.getElementById("gameConfirmOkBtn")
      const cancelBtn = document.getElementById("gameConfirmCancelBtn")
      const originalOkText = okBtn ? okBtn.textContent : ""
      const originalCancelText = cancelBtn ? cancelBtn.textContent : ""
      if (okBtn) okBtn.textContent = "确认重置"
      if (cancelBtn) cancelBtn.textContent = "取消"

      this.showGameConfirm(
        "确定要重置所有AI钱包到初始100万吗？此操作不可撤销。",
        () => {
          if (okBtn) okBtn.textContent = originalOkText
          if (cancelBtn) cancelBtn.textContent = originalCancelText

          this.resetAiWallets()
          if (this.dom.aiMemoryStatusText) {
            this.dom.aiMemoryStatusText.textContent = "已重置AI钱包"
          }
          this.writeLog("AI钱包已重置为100万。")
        },
        () => {
          if (okBtn) okBtn.textContent = originalOkText
          if (cancelBtn) cancelBtn.textContent = originalCancelText
        }
      )
    })
  }
  if (this.dom.aiMemoryCloseBtn) {
    this.dom.aiMemoryCloseBtn?.addEventListener("click", (event) => {
      event.stopPropagation()
      this.closeAiMemoryPanel()
    })
  }
  if (this.dom.settingLlmIndependentModelEnabled) {
    this.dom.settingLlmIndependentModelEnabled?.addEventListener("change", () => {
      const checked = (this.dom.settingLlmIndependentModelEnabled as HTMLInputElement).checked
      if (this.dom.independentModelConfig) {
        this.dom.independentModelConfig.classList.toggle("hidden", !checked)
      }
    })
  }
  if (this.dom.configIndependentModelBtn) {
    this.dom.configIndependentModelBtn?.addEventListener("click", () => {
      this.openAiModelConfigOverlay()
    })
  }
  if (this.dom.aiModelConfigCloseBtn) {
    this.dom.aiModelConfigCloseBtn?.addEventListener("click", (event) => {
      event.stopPropagation()
      this.closeAiModelConfigOverlay()
    })
  }
  if (this.dom.aiModelConfigSaveBtn) {
    this.dom.aiModelConfigSaveBtn?.addEventListener("click", (event) => {
      event.stopPropagation()
      this.saveAiModelConfigFromForm()
    })
  }
  if (this.dom.aiModelConfigOverlay) {
    this.dom.aiModelConfigOverlay?.addEventListener("click", (event) => {
      event.stopPropagation()
      if (event.target === this.dom.aiModelConfigOverlay) {
        this.closeAiModelConfigOverlay()
      }
    })
  }
  const aiModelConfigPanel = document.getElementById("aiModelConfigPanel")
  if (aiModelConfigPanel) {
    aiModelConfigPanel.addEventListener("click", (event) => {
      event.stopPropagation()
    })
  }
  if (this.dom.aiMemoryOverlay) {
    this.dom.aiMemoryOverlay?.addEventListener("click", (event) => {
      event.stopPropagation()
      if (event.target === this.dom.aiMemoryOverlay) {
        this.closeAiMemoryPanel()
      }
    })
  }
  if (this.dom.aiMemoryPanel) {
    this.dom.aiMemoryPanel?.addEventListener("click", (event) => {
      event.stopPropagation()
    })
    this.dom.aiMemoryPanel?.addEventListener(
      "touchstart",
      (event) => {
        event.stopPropagation()
      },
      { passive: true }
    )
    this.dom.aiMemoryPanel?.addEventListener(
      "touchmove",
      (event) => {
        event.stopPropagation()
      },
      { passive: true }
    )
  }
}

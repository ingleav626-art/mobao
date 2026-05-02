(function setupMobaoUiOverlay(global) {
  const { clamp } = global.MobaoUtils;
  const { GAME_SETTINGS, saveGameSettings, normalizeGameSettings, defaultGameSettings } = global.MobaoSettings;
  const { DEFAULT_START_MONEY, SETTINGS_FIELDS } = global.MobaoConstants;

  const UiOverlayMixin = {
    showInfoPopup(title, sourceScrollEl) {
      this.dom.infoPopupTitle.textContent = title;
      if (sourceScrollEl) {
        this.dom.infoPopupContent.innerHTML = sourceScrollEl.innerHTML;
      } else {
        this.dom.infoPopupContent.innerHTML = "";
      }
      this.dom.infoPopupOverlay.classList.remove("hidden");
    },

    hideInfoPopup() {
      this.dom.infoPopupOverlay.classList.add("hidden");
    },

    openSettingsOverlay() {
      this.closeBidKeypad();
      this.closeItemDrawer();
      this.hideInfoPopup();
      this.fillSettingsForm(GAME_SETTINGS);
      this.fillLlmSettingsForm(this.getLlmSettings());
      this.setSettingsStatus("设置保存在本地浏览器中。", false);
      const llmGroup = document.getElementById("llmSettingsGroup");
      if (llmGroup) {
        if (this.isLanMode) {
          llmGroup.classList.add("settings-group-disabled");
          const inputs = llmGroup.querySelectorAll("input, button");
          inputs.forEach((el) => { el.disabled = true; });
        } else {
          llmGroup.classList.remove("settings-group-disabled");
          const inputs = llmGroup.querySelectorAll("input, button");
          inputs.forEach((el) => { el.disabled = false; });
        }
      }
      this.dom.settingsOverlay.classList.remove("hidden");
    },

    closeSettingsOverlay(keepStatus = false) {
      this.dom.settingsOverlay.classList.add("hidden");
      if (!keepStatus) {
        this.setSettingsStatus("设置保存在本地浏览器中。", false);
      }
    },

    isSettingsOverlayOpen() {
      return !this.dom.settingsOverlay.classList.contains("hidden");
    },

    settingsInputId(field) {
      return `setting-${field}`;
    },

    fillSettingsForm(values) {
      SETTINGS_FIELDS.forEach((field) => {
        const input = document.getElementById(this.settingsInputId(field));
        if (!input) {
          return;
        }
        input.value = String(values[field]);
      });
      if (this.dom.qualityTextToggle) {
        this.dom.qualityTextToggle.checked = this.useQualityText;
      }
    },

    readSettingsForm() {
      const draft = {};
      SETTINGS_FIELDS.forEach((field) => {
        const input = document.getElementById(this.settingsInputId(field));
        draft[field] = input ? Number(input.value) : GAME_SETTINGS[field];
      });
      if (this.dom.qualityTextToggle) {
        this.useQualityText = this.dom.qualityTextToggle.checked;
        this.syncAllQualityTextVisibility();
      }
      return normalizeGameSettings(draft, GAME_SETTINGS);
    },

    setSettingsStatus(text, saved) {
      this.dom.settingsStatusText.textContent = text;
      this.dom.settingsStatusText.classList.toggle("settings-note-saved", Boolean(saved));
    },

    saveSettingsFromOverlay() {
      const { LLM_SETTINGS, saveDeepSeekSettings, maskApiKey } = global.MobaoLlm || {};
      const next = this.readSettingsForm();
      Object.assign(GAME_SETTINGS, next);
      saveGameSettings(GAME_SETTINGS);

      if (!this.isLanMode) {
        const oldMultiGameMemoryEnabled = Boolean(LLM_SETTINGS.multiGameMemoryEnabled);
        const llmNext = this.readLlmSettingsForm();
        const llmProvider = this.getLlmProvider();
        if (llmProvider && llmProvider.saveSettings) {
          llmProvider.saveSettings(llmNext);
        } else if (saveDeepSeekSettings) {
          saveDeepSeekSettings(llmNext);
        }
        if (llmProvider && llmProvider.applySettings) {
          llmProvider.applySettings(llmNext);
        }
        Object.assign(LLM_SETTINGS, llmNext);
        if (oldMultiGameMemoryEnabled && !LLM_SETTINGS.multiGameMemoryEnabled) {
          this.writeLog("已关闭多局AI上下文：仅停止发送，不删除记忆。");
        }
        if (!oldMultiGameMemoryEnabled && LLM_SETTINGS.multiGameMemoryEnabled) {
          this.pushRunStartContextToAi();
          this.writeLog("已启用多局AI上下文：后续会在同一会话中连续学习。");
        }
      }

      this.dom.bidInput.step = "1";
      this.dom.bidInput.min = "0";
      const normalizedBid = Math.max(0, Math.round(Number(this.dom.bidInput.value) || 0));
      this.dom.bidInput.value = String(normalizedBid);

      this.round = clamp(this.round, 1, GAME_SETTINGS.maxRounds);
      this.roundTimeLeft = Math.min(this.roundTimeLeft, GAME_SETTINGS.roundSeconds);
      this.actionsLeft = Math.min(this.actionsLeft, GAME_SETTINGS.actionsPerRound);
      this.updateHud();

      this.setSettingsStatus("设置已保存并立即生效。", true);
      const modelName = (LLM_SETTINGS && LLM_SETTINGS.model) || "大模型";
      this.setLlmSettingsStatus(
        LLM_SETTINGS.apiKey
          ? `${modelName}配置已保存：${maskApiKey(LLM_SETTINGS.apiKey)}`
          : `${modelName}配置已保存，但尚未填写 API Key。`,
        LLM_SETTINGS.apiKey ? "success" : "normal"
      );
      this.writeLog(`设置已应用：对局参数生效；${modelName} ${LLM_SETTINGS.enabled ? "已启用" : "未启用"}。`);
      this.closeSettingsOverlay(true);
    },

    showLanRestartVoteDialog(hostName) {
      const existing = document.getElementById("lanRestartVoteDialog");
      if (existing) existing.remove();
      const overlay = document.createElement("div");
      overlay.id = "lanRestartVoteDialog";
      overlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:99999;";
      const box = document.createElement("div");
      box.style.cssText = "background:#2a2218;border:2px solid #d4a843;border-radius:12px;padding:24px 32px;text-align:center;color:#e0d0b0;font-size:16px;max-width:360px;";
      box.innerHTML =
        '<div style="margin-bottom:16px;font-size:18px;font-weight:bold;">' + hostName + ' 发起了重开请求</div>' +
        '<div style="margin-bottom:20px;color:#a09070;">是否同意开始新一局？</div>' +
        '<div style="display:flex;gap:12px;justify-content:center;">' +
        '<button id="lanRestartAccept" style="padding:8px 24px;border-radius:6px;border:1px solid #6a9f5a;background:rgba(106,159,90,0.2);color:#8fd070;cursor:pointer;font-size:14px;">同意</button>' +
        '<button id="lanRestartDecline" style="padding:8px 24px;border-radius:6px;border:1px solid #8a4a3a;background:rgba(180,60,40,0.15);color:#e07060;cursor:pointer;font-size:14px;">拒绝</button>' +
        '</div>';
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      document.getElementById("lanRestartAccept").addEventListener("click", () => {
        overlay.remove();
        this.lanBridge.send({ type: "game:restart-accept" });
        this.writeLog("已同意重开，等待其他玩家确认...");
      });
      document.getElementById("lanRestartDecline").addEventListener("click", () => {
        overlay.remove();
        this.lanBridge.send({ type: "game:restart-decline" });
        this.writeLog("已拒绝重开请求");
      });
    },

    removeLanRestartDialog() {
      const existing = document.getElementById("lanRestartVoteDialog");
      if (existing) existing.remove();
      const waiting = document.getElementById("lanRestartWaitingDialog");
      if (waiting) waiting.remove();
      const declined = document.getElementById("lanRestartDeclinedDialog");
      if (declined) declined.remove();
    },

    showLanRestartWaitingDialog() {
      this.removeLanRestartDialog();
      const overlay = document.createElement("div");
      overlay.id = "lanRestartWaitingDialog";
      overlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:99999;";
      const box = document.createElement("div");
      box.style.cssText = "background:#2a2218;border:2px solid #d4a843;border-radius:12px;padding:24px 32px;text-align:center;color:#e0d0b0;font-size:16px;max-width:360px;";
      box.innerHTML =
        '<div style="margin-bottom:12px;font-size:18px;font-weight:bold;">已发送重开请求</div>' +
        '<div style="color:#a09070;">等待其他玩家同意...</div>' +
        '<div style="margin-top:16px;"><span class="lan-waiting-spinner"></span></div>';
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      this.writeLog("已向所有玩家发送重开请求，等待确认...");
    },

    showLanRestartDeclinedDialog(declinerName) {
      this.removeLanRestartDialog();
      const overlay = document.createElement("div");
      overlay.id = "lanRestartDeclinedDialog";
      overlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:99999;";
      const box = document.createElement("div");
      box.style.cssText = "background:#2a2218;border:2px solid #8a4a3a;border-radius:12px;padding:24px 32px;text-align:center;color:#e0d0b0;font-size:16px;max-width:360px;";
      box.innerHTML =
        '<div style="margin-bottom:12px;font-size:18px;font-weight:bold;color:#e07060;">重开请求被拒绝</div>' +
        '<div style="color:#a09070;">' + declinerName + ' 拒绝了重开申请</div>' +
        '<button id="lanRestartDeclinedClose" style="margin-top:16px;padding:8px 24px;border-radius:6px;border:1px solid #8a4a3a;background:rgba(180,60,40,0.15);color:#e07060;cursor:pointer;font-size:14px;">确定</button>';
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      document.getElementById("lanRestartDeclinedClose").addEventListener("click", () => {
        overlay.remove();
      });
    },

    showLanPauseOverlay() {
      let overlay = document.getElementById("lanPauseOverlay");
      if (overlay) return;
      overlay = document.createElement("div");
      overlay.id = "lanPauseOverlay";
      overlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:99998;";
      const box = document.createElement("div");
      box.style.cssText = "background:#2a2218;border:2px solid #d4a843;border-radius:12px;padding:28px 36px;text-align:center;color:#e0d0b0;font-size:16px;max-width:360px;";
      const title = document.createElement("div");
      title.style.cssText = "font-size:20px;font-weight:bold;margin-bottom:12px;color:#d4a843;";
      title.textContent = "游戏已暂停";
      box.appendChild(title);
      const hint = document.createElement("div");
      hint.style.cssText = "color:#a09070;margin-bottom:16px;";
      hint.textContent = this.isLanMode && this.lanIsHost ? "点击下方按钮继续游戏" : "等待主机继续游戏...";
      box.appendChild(hint);
      if (this.isLanMode && this.lanIsHost) {
        const resumeBtn = document.createElement("button");
        resumeBtn.style.cssText = "padding:10px 28px;border-radius:6px;border:1px solid #d4a843;background:rgba(212,168,67,0.15);color:#d4a843;cursor:pointer;font-size:15px;font-weight:bold;";
        resumeBtn.textContent = "结束暂停";
        resumeBtn.addEventListener("click", () => {
          this.toggleRoundPause();
        });
        box.appendChild(resumeBtn);
      }
      overlay.appendChild(box);
      document.body.appendChild(overlay);
    },

    hideLanPauseOverlay() {
      const overlay = document.getElementById("lanPauseOverlay");
      if (overlay) overlay.remove();
    },

    hideSettleOverlay() {
      this.dom.settleOverlay.classList.add("hidden");
    },

    openAiLogicPanel() {
      if (!this.dom.aiLogicOverlay) {
        return;
      }
      this.renderAiLogicPanel();
      if (typeof this.renderAiThoughtLog === "function") {
        this.renderAiThoughtLog();
      }
      this.dom.aiLogicOverlay.classList.remove("hidden");
    },

    closeAiLogicPanel() {
      if (!this.dom.aiLogicOverlay) {
        return;
      }
      this.dom.aiLogicOverlay.classList.add("hidden");
    },

    openShopOverlay() {
      const overlay = document.getElementById("shopOverlay");
      if (!overlay) return;
      overlay.classList.remove("hidden");
      this.renderShopContent();
      this.updateLobbyMoneyDisplay();

      const closeBtn = document.getElementById("shopCloseBtn");
      if (closeBtn && !closeBtn._shopBound) {
        closeBtn._shopBound = true;
        closeBtn.addEventListener("click", () => this.closeShopOverlay());
      }

      overlay.onclick = (e) => {
        if (e.target === overlay) this.closeShopOverlay();
      };
    },

    closeShopOverlay() {
      const overlay = document.getElementById("shopOverlay");
      if (overlay) overlay.classList.add("hidden");
      this.updateLobbyMoneyDisplay();
      if (!document.getElementById("gameArea").classList.contains("hidden")) {
        this.updateHud();
      }
    }
  };

  global.MobaoUi = global.MobaoUi || {};
  global.MobaoUi.OverlayMixin = UiOverlayMixin;
})(window);

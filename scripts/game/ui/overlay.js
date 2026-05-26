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
      if (window.MobaoAnimations) {
        window.MobaoAnimations.animateOverlayOpen(
          this.dom.infoPopupOverlay,
          this.dom.infoPopupOverlay.querySelector('.info-popup-box')
        );
      } else {
        this.dom.infoPopupOverlay.classList.remove("hidden");
      }
    },

    hideInfoPopup() {
      if (window.MobaoAnimations) {
        window.MobaoAnimations.animateOverlayClose(this.dom.infoPopupOverlay);
      } else {
        this.dom.infoPopupOverlay.classList.add("hidden");
      }
    },

    showPlayerInfoPopover(title, content, x, y) {
      const popover = document.getElementById("playerInfoPopover");
      const titleEl = document.getElementById("playerInfoPopoverTitle");
      const contentEl = document.getElementById("playerInfoPopoverContent");
      if (!popover || !titleEl || !contentEl) {
        return;
      }
      titleEl.textContent = title;
      contentEl.innerHTML = content;
      popover.classList.remove("hidden");
      popover.classList.add("popup-content-enter");
      popover.addEventListener("animationend", function onEnter() {
        popover.classList.remove("popup-content-enter");
        popover.removeEventListener("animationend", onEnter);
      }, { once: true });
      this.positionPlayerInfoPopover(x, y);
    },

    positionPlayerInfoPopover(x, y) {
      const popover = document.getElementById("playerInfoPopover");
      if (!popover) {
        return;
      }
      const rect = popover.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      let left = x + 10;
      let top = y + 10;
      if (left + rect.width > viewportWidth - 10) {
        left = x - rect.width - 10;
      }
      if (top + rect.height > viewportHeight - 10) {
        top = y - rect.height - 10;
      }
      left = Math.max(10, Math.min(left, viewportWidth - rect.width - 10));
      top = Math.max(10, Math.min(top, viewportHeight - rect.height - 10));
      popover.style.left = `${left}px`;
      popover.style.top = `${top}px`;
    },

    hidePlayerInfoPopover() {
      const popover = document.getElementById("playerInfoPopover");
      if (popover) {
        popover.classList.add("hidden");
        popover.classList.remove("popup-content-enter");
      }
    },

    showItemDetailPopup(itemId, itemName, x, y) {
      const itemDefs = (window.ItemSystem && window.ItemSystem.ITEM_DEFS) || [];
      const skillDefs = (window.SkillSystem && window.SkillSystem.SKILL_DEFS) || [];
      const itemDef = itemDefs.find((item) => item.id === itemId);
      const skillDef = skillDefs.find((skill) => skill.id === itemId);

      if (itemDef) {
        const title = itemName || itemDef.name || "道具详情";
        const content = [
          `<p><strong>名称：</strong>${itemDef.name || itemId}</p>`,
          `<p><strong>效果：</strong>${itemDef.description || "未知效果"}</p>`,
          itemDef.initialCount !== undefined ? `<p><strong>初始数量：</strong>${itemDef.initialCount}</p>` : "",
          itemDef.maxPerRound !== undefined ? `<p><strong>每轮上限：</strong>${itemDef.maxPerRound}</p>` : ""
        ].filter(Boolean).join("");
        this.showPlayerInfoPopover(title, content, x, y);
      } else if (skillDef) {
        const title = itemName || skillDef.name || "技能详情";
        const content = [
          `<p><strong>名称：</strong>${skillDef.name || itemId}</p>`,
          `<p><strong>效果：</strong>${skillDef.description || "未知效果"}</p>`,
          skillDef.maxPerRound !== undefined ? `<p><strong>每轮上限：</strong>${skillDef.maxPerRound}</p>` : ""
        ].filter(Boolean).join("");
        this.showPlayerInfoPopover(title, content, x, y);
      }
    },

    hideItemDetailPopup() {
      this.hidePlayerInfoPopover();
    },

    showCharacterInfoPopup(playerId, x, y) {
      const player = this.players.find((p) => p.id === playerId);
      if (!player) {
        return;
      }

      let characterInfo = null;
      if (player.isHuman) {
        const char = window.CharacterSystem && window.CharacterSystem.getActiveCharacter();
        if (char) {
          characterInfo = {
            name: char.name,
            desc: char.desc,
            skillName: char.skillName,
            skillDesc: char.skillDesc,
            passive: char.passive
          };
        }
      } else {
        const charAssign = this.aiCharacterAssignments && this.aiCharacterAssignments[playerId];
        if (charAssign) {
          const charDef = window.CharacterData && window.CharacterData.getCharacterById(charAssign.characterId);
          characterInfo = {
            name: charAssign.characterName,
            desc: charDef ? charDef.desc : "",
            skillName: charAssign.skillName,
            skillDesc: charDef ? charDef.skillDesc : "",
            passive: charAssign.passive
          };
        }
      }

      if (!characterInfo) {
        this.showPlayerInfoPopover("角色信息", "<p>该玩家暂无角色信息</p>", x, y);
        return;
      }

      const title = characterInfo.name || "角色信息";
      const passiveText = characterInfo.passive && characterInfo.passive.label ? characterInfo.passive.label : "无";
      const content = [
        `<p><strong>角色：</strong>${characterInfo.name}</p>`,
        characterInfo.desc ? `<p><strong>描述：</strong>${characterInfo.desc}</p>` : "",
        `<p><strong>技能：</strong>${characterInfo.skillName || "无"}</p>`,
        characterInfo.skillDesc ? `<p><strong>技能效果：</strong>${characterInfo.skillDesc}</p>` : "",
        `<p><strong>被动：</strong>${passiveText}</p>`
      ].filter(Boolean).join("");
      this.showPlayerInfoPopover(title, content, x, y);
    },

    hideCharacterInfoPopup() {
      this.hidePlayerInfoPopover();
    },

    openSettingsOverlay() {
      this.closeBidKeypad();
      this.closeItemDrawer();
      this.hideInfoPopup();
      this.fillSettingsForm(GAME_SETTINGS);
      this.fillLlmSettingsForm(this.getLlmSettings());
      this.setSettingsStatus("设置保存在本地浏览器中。", false);

      // 保存初始设置值，用于离开保护（使用表单读取的值，确保一致性）
      this._settingsInitialValues = JSON.stringify({
        game: this.readSettingsForm(),
        llm: this.readLlmSettingsForm()
      });

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
      const returnLobbyBtn = document.getElementById("settingsReturnLobbyBtn");
      if (returnLobbyBtn) {
        const lobbyPage = document.getElementById("lobbyPage");
        const isLobbyVisible = lobbyPage && !lobbyPage.classList.contains("hidden");
        if (isLobbyVisible) {
          returnLobbyBtn.classList.add("hidden");
        } else {
          if (this.isLanMode) {
            if (this.lanIsHost) {
              returnLobbyBtn.textContent = "返回房间";
              returnLobbyBtn.classList.remove("hidden");
            } else {
              returnLobbyBtn.classList.add("hidden");
            }
          } else {
            returnLobbyBtn.textContent = "返回大厅";
            returnLobbyBtn.classList.remove("hidden");
          }
        }
      }
      if (window.MobaoAnimations) {
        window.MobaoAnimations.animateOverlayOpen(
          this.dom.settingsOverlay,
          this.dom.settingsPanel
        );
      } else {
        this.dom.settingsOverlay.classList.remove("hidden");
      }
    },

    closeSettingsOverlay(keepStatus = false, forceClose = false) {
      // 检查是否有未保存的设置
      if (!forceClose && this._settingsInitialValues) {
        const currentValues = JSON.stringify({
          game: this.readSettingsForm(),
          llm: this.readLlmSettingsForm()
        });

        if (currentValues !== this._settingsInitialValues) {
          // 临时修改确认按钮文本
          const okBtn = document.getElementById("gameConfirmOkBtn");
          const cancelBtn = document.getElementById("gameConfirmCancelBtn");
          const originalOkText = okBtn ? okBtn.textContent : "";
          const originalCancelText = cancelBtn ? cancelBtn.textContent : "";
          if (okBtn) okBtn.textContent = "保存";
          if (cancelBtn) cancelBtn.textContent = "不保存";

          this.showGameConfirm(
            "设置已修改，是否保存？",
            () => {
              // 恢复按钮文本
              if (okBtn) okBtn.textContent = originalOkText;
              if (cancelBtn) cancelBtn.textContent = originalCancelText;

              this.saveSettingsFromOverlay();
              this._settingsInitialValues = null;
              this.closeSettingsOverlay(keepStatus, true);
            },
            () => {
              // 恢复按钮文本
              if (okBtn) okBtn.textContent = originalOkText;
              if (cancelBtn) cancelBtn.textContent = originalCancelText;

              this._settingsInitialValues = null;
              this.closeSettingsOverlay(keepStatus, true);
            }
          );
          return;
        }
      }

      this._settingsInitialValues = null;

      if (window.MobaoAnimations) {
        window.MobaoAnimations.animateOverlayClose(this.dom.settingsOverlay, this.dom.settingsPanel, function () {
          if (!keepStatus) {
            this.setSettingsStatus("设置保存在本地浏览器中。", false);
          }
        }.bind(this));
      } else {
        this.dom.settingsOverlay.classList.add("hidden");
        if (!keepStatus) {
          this.setSettingsStatus("设置保存在本地浏览器中。", false);
        }
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
      const roundSecondsInput = document.getElementById("setting-roundSeconds");
      const roundSecondsDecrease = document.getElementById("roundSecondsDecrease");
      const roundSecondsIncrease = document.getElementById("roundSecondsIncrease");
      if (roundSecondsInput) {
        const value = Number(roundSecondsInput.value) || 60;
        if (roundSecondsDecrease) {
          roundSecondsDecrease.disabled = value <= 10;
        }
        if (roundSecondsIncrease) {
          roundSecondsIncrease.disabled = value >= 180;
        }
      }
      const settlementSpeedInput = document.getElementById("setting-settlementSpeedMultiplier");
      const settlementSpeedDecrease = document.getElementById("settlementSpeedDecrease");
      const settlementSpeedIncrease = document.getElementById("settlementSpeedIncrease");
      if (settlementSpeedInput) {
        const value = Number(settlementSpeedInput.value) || 1;
        if (settlementSpeedDecrease) {
          settlementSpeedDecrease.disabled = value <= 0.5;
        }
        if (settlementSpeedIncrease) {
          settlementSpeedIncrease.disabled = value >= 3;
        }
      }
      const musicVolumeInput = document.getElementById("setting-musicVolume");
      const musicVolumeValue = document.getElementById("musicVolumeValue");
      const musicVolumeIconImg = document.getElementById("musicVolumeIconImg");
      if (musicVolumeInput && musicVolumeValue) {
        musicVolumeValue.textContent = `${musicVolumeInput.value}%`;
        if (musicVolumeIconImg) {
          const isMuted = Number(musicVolumeInput.value) === 0;
          musicVolumeIconImg.src = isMuted
            ? "./assets/images/icons/ui/mute-fill.svg"
            : "./assets/images/icons/ui/sound-on.svg";
          musicVolumeIconImg.classList.toggle("muted", isMuted);
        }
      }
      const sfxVolumeInput = document.getElementById("setting-sfxVolume");
      const sfxVolumeValue = document.getElementById("sfxVolumeValue");
      const sfxVolumeIconImg = document.getElementById("sfxVolumeIconImg");
      if (sfxVolumeInput && sfxVolumeValue) {
        sfxVolumeValue.textContent = `${sfxVolumeInput.value}%`;
        if (sfxVolumeIconImg) {
          const isMuted = Number(sfxVolumeInput.value) === 0;
          sfxVolumeIconImg.src = isMuted
            ? "./assets/images/icons/ui/mute-fill.svg"
            : "./assets/images/icons/ui/sound-on.svg";
          sfxVolumeIconImg.classList.toggle("muted", isMuted);
        }
      }
    },

    readSettingsForm() {
      const draft = {};
      SETTINGS_FIELDS.forEach((field) => {
        const input = document.getElementById(this.settingsInputId(field));
        draft[field] = input ? Number(input.value) : GAME_SETTINGS[field];
      });
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
        console.log("[saveSettingsFromOverlay] llmNext:", { independentModelEnabled: llmNext.independentModelEnabled, enabled: llmNext.enabled, apiKey: llmNext.apiKey ? "(已设置)" : "(空)" });
        const llmProvider = this.getLlmProvider();
        console.log("[saveSettingsFromOverlay] llmProvider:", llmProvider ? llmProvider.id : null);
        if (llmProvider && llmProvider.saveSettings) {
          llmProvider.saveSettings(llmNext);
        } else if (saveDeepSeekSettings) {
          saveDeepSeekSettings(llmNext);
        }
        if (llmProvider && llmProvider.applySettings) {
          llmProvider.applySettings(llmNext);
        }
        Object.assign(LLM_SETTINGS, llmNext);
        console.log("[saveSettingsFromOverlay] LLM_SETTINGS.independentModelEnabled:", LLM_SETTINGS.independentModelEnabled);
        if (oldMultiGameMemoryEnabled && !LLM_SETTINGS.multiGameMemoryEnabled) {
          this.writeLog("已关闭多局AI上下文：仅停止发送，不删除记忆。");
        }
        if (!oldMultiGameMemoryEnabled && LLM_SETTINGS.multiGameMemoryEnabled) {
          this.pushRunStartContextToAi();
          this.writeLog("已启用多局AI上下文：后续会在同一会话中连续学习。");
        }
      }

      // 清除初始值记录，避免关闭时再次弹窗
      this._settingsInitialValues = null;

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
      const overlayEl = this.dom.settleOverlay;
      if (typeof MobaoAnimations !== "undefined") {
        MobaoAnimations.animateOverlayClose(overlayEl, null, function () {
          overlayEl.classList.add("hidden");
          overlayEl.style.animation = "";
          overlayEl.style.opacity = "";
        });
      } else {
        overlayEl.classList.add("hidden");
      }
    },

    openAiLogicPanel() {
      if (!this.dom.aiLogicOverlay) {
        return;
      }
      this.renderAiLogicPanel();
      if (typeof this.renderAiThoughtLog === "function") {
        this.renderAiThoughtLog();
      }
      if (window.MobaoAnimations) {
        window.MobaoAnimations.animateOverlayOpen(
          this.dom.aiLogicOverlay,
          this.dom.aiLogicPanel
        );
      } else {
        this.dom.aiLogicOverlay.classList.remove("hidden");
      }
    },

    closeAiLogicPanel() {
      if (!this.dom.aiLogicOverlay) {
        return;
      }
      if (window.MobaoAnimations) {
        window.MobaoAnimations.animateOverlayClose(this.dom.aiLogicOverlay, this.dom.aiLogicPanel);
      } else {
        this.dom.aiLogicOverlay.classList.add("hidden");
      }
    },

    openShopOverlay() {
      if (typeof window.MobaoShopPage !== "undefined") {
        window.MobaoShopPage.init({
          onPurchase: () => {
            this.updateLobbyMoneyDisplay();
            if (!document.getElementById("gameArea").classList.contains("hidden")) {
              this.updateHud();
            }
          }
        });
        window.MobaoShopPage.open();
      }
    },

    closeShopOverlay() {
      if (typeof window.MobaoShopPage !== "undefined") {
        window.MobaoShopPage.close();
      }
      this.updateLobbyMoneyDisplay();
      if (!document.getElementById("gameArea").classList.contains("hidden")) {
        this.updateHud();
      }
    },

    openCollectionOverlay() {
      const overlay = document.getElementById("collectionOverlay");
      if (!overlay) return;
      if (typeof MobaoAnimations !== "undefined") {
        MobaoAnimations.animateOverlayOpen(overlay);
      } else {
        overlay.classList.remove("hidden");
      }
      this.initCollectionPanel();

      const closeBtn = document.getElementById("collectionCloseBtn");
      if (closeBtn && !closeBtn._collectionBound) {
        closeBtn._collectionBound = true;
        closeBtn.addEventListener("click", () => this.closeCollectionOverlay());
      }

      overlay.onclick = (e) => {
        if (e.target === overlay) this.closeCollectionOverlay();
      };
    },

    closeCollectionOverlay() {
      const overlay = document.getElementById("collectionOverlay");
      if (!overlay) return;
      if (typeof MobaoAnimations !== "undefined") {
        MobaoAnimations.animateOverlayClose(overlay, null, function () {
          overlay.classList.add("hidden");
          overlay.style.animation = "";
          overlay.style.opacity = "";
        });
      } else {
        overlay.classList.add("hidden");
      }
    },

    initCollectionPanel() {
      const categorySelect = document.getElementById("collectionCategoryFilter");
      const qualitySelect = document.getElementById("collectionQualityFilter");
      const searchInput = document.getElementById("collectionSearchInput");

      if (categorySelect && !categorySelect._initialized) {
        categorySelect._initialized = true;
        const categories = this.getCollectionCategories();
        categorySelect.innerHTML = '<option value="all">全部品类</option>' +
          categories.map(c => `<option value="${c}">${c}</option>`).join('');
        categorySelect.addEventListener('change', () => this.renderCollectionGrid());
      }

      if (qualitySelect && !qualitySelect._initialized) {
        qualitySelect._initialized = true;
        const qualities = Object.entries(window.ArtifactData.QUALITY_CONFIG);
        qualitySelect.innerHTML = '<option value="all">全部品质</option>' +
          qualities.map(([key, val]) => `<option value="${key}">${val.label}</option>`).join('');
        qualitySelect.addEventListener('change', () => this.renderCollectionGrid());
      }

      if (searchInput && !searchInput._initialized) {
        searchInput._initialized = true;
        searchInput.addEventListener('input', () => this.renderCollectionGrid());
      }

      this.renderCollectionGrid();
    },

    getCollectionCategories() {
      const artifacts = window.ArtifactData.ARTIFACT_LIBRARY || [];
      const categories = new Set();
      artifacts.forEach(a => {
        if (a.category) categories.add(a.category);
      });
      return Array.from(categories).sort();
    },

    renderCollectionGrid() {
      const grid = document.getElementById("collectionGrid");
      const stats = document.getElementById('collectionStats');
      if (!grid) return;

      const categoryFilter = document.getElementById('collectionCategoryFilter')?.value || 'all';
      const qualityFilter = document.getElementById('collectionQualityFilter')?.value || 'all';
      const searchText = document.getElementById('collectionSearchInput')?.value?.toLowerCase() || '';

      let artifacts = window.ArtifactData.ARTIFACT_LIBRARY || [];

      if (categoryFilter !== 'all') {
        artifacts = artifacts.filter(a => a.category === categoryFilter);
      }
      if (qualityFilter !== 'all') {
        artifacts = artifacts.filter(a => a.qualityKey === qualityFilter);
      }
      if (searchText) {
        artifacts = artifacts.filter(a =>
          a.name.toLowerCase().includes(searchText) ||
          a.key.toLowerCase().includes(searchText)
        );
      }

      const total = (window.ArtifactData.ARTIFACT_LIBRARY || []).length;
      if (stats) {
        stats.textContent = `显示 ${artifacts.length} / ${total} 件藏品`;
      }

      const rgbHex = global.MobaoUtils.rgbHex;

      grid.innerHTML = artifacts.map(artifact => {
        const quality = window.ArtifactData.QUALITY_CONFIG[artifact.qualityKey];
        const qualityLabel = quality ? quality.label : '未知';
        const qualityColor = quality ? rgbHex(quality.color) : '#9f9f9f';
        const imgSrc = `assets/images/artifacts/thumbs/${artifact.key}.png`;

        return `
          <article class="collection-item" data-key="${artifact.key}">
            <div class="collection-thumb" style="background: ${qualityColor}44;">
              <img src="${imgSrc}" alt="${artifact.name}" onerror="this.style.display='none'"/>
            </div>
            <div class="collection-info">
              <strong class="collection-name">${artifact.name}</strong>
              <div class="collection-meta">
                <span class="collection-quality" style="color: ${qualityColor};">${qualityLabel}</span>
                <span class="collection-category">${artifact.category}</span>
              </div>
              <div class="collection-details">
                <span>基础价: ${artifact.basePrice}</span>
                <span>尺寸: ${artifact.w}x${artifact.h}</span>
              </div>
            </div>
          </article>
        `;
      }).join('');
    },

    AI_MODEL_CONFIGS_STORAGE_KEY: "mobao_ai_model_configs_v1",

    loadAiModelConfigs() {
      try {
        const stored = localStorage.getItem(this.AI_MODEL_CONFIGS_STORAGE_KEY);
        if (stored) {
          return JSON.parse(stored);
        }
      } catch (e) {
        console.error("Failed to load AI model configs:", e);
      }
      return { ai1: null, ai2: null, ai3: null };
    },

    saveAiModelConfigs(configs) {
      try {
        localStorage.setItem(this.AI_MODEL_CONFIGS_STORAGE_KEY, JSON.stringify(configs));
      } catch (e) {
        console.error("Failed to save AI model configs:", e);
      }
    },

    openAiModelConfigOverlay() {
      const overlay = document.getElementById("aiModelConfigOverlay");
      if (!overlay) return;
      this.renderAiModelConfigContent();
      overlay.classList.remove("hidden");
    },

    closeAiModelConfigOverlay() {
      const overlay = document.getElementById("aiModelConfigOverlay");
      if (overlay) overlay.classList.add("hidden");
    },

    renderAiModelConfigContent() {
      const contentEl = document.getElementById("aiModelConfigContent");
      if (!contentEl) return;
      const aiModelConfigs = this.loadAiModelConfigs();
      const providers = window.LlmManager ? window.LlmManager.listProviders() : [];
      const activeProviderId = window.LlmManager ? window.LlmManager.getActiveProviderId() : "deepseek";
      const currentSettings = typeof this.getLlmSettings === "function" ? this.getLlmSettings() : (window.MobaoLlm && window.MobaoLlm.LLM_SETTINGS) || {};
      const currentModel = currentSettings.model || "未配置";
      const currentEndpoint = currentSettings.endpoint || "未配置";
      const hasCurrentApiKey = !!(currentSettings.apiKey && currentSettings.apiKey.trim());
      const activeProvider = providers.find(p => p.id === activeProviderId);
      const activeProviderName = activeProvider ? activeProvider.name : activeProviderId;
      let html = `
        <div style="margin-bottom:12px;padding:8px;background:#fff9f0;border:1px solid #d6ba8d;border-radius:6px;">
          <div style="font-weight:bold;color:#402f1c;margin-bottom:4px;">当前默认配置：${activeProviderName}</div>
          <div style="font-size:11px;color:#6a5a4a;">模型: ${currentModel}</div>
          <div style="font-size:11px;color:#6a5a4a;">Endpoint: ${currentEndpoint.slice(0, 50)}${currentEndpoint.length > 50 ? "..." : ""}</div>
          <div style="font-size:11px;color:${hasCurrentApiKey ? "#2a7a2a" : "#a04040"};">API Key: ${hasCurrentApiKey ? "已配置" : "未配置"}</div>
        </div>
      `;
      const providerOptions = providers.map(p => `<option value="${p.id}">${p.name}</option>`).join("");
      ["ai1", "ai2", "ai3"].forEach((aiId, i) => {
        const selectedProviderId = aiModelConfigs[aiId] || "";
        const selectValue = selectedProviderId || "";
        html += `
          <div class="ai-model-config-section" style="margin-bottom:12px;padding:10px;background:#fff;border:1px solid #d6ba8d;border-radius:6px;">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:bold;color:#402f1c;">
              <span style="width:60px;">AI${i + 1}：</span>
              <select id="aiModelProvider-${aiId}" style="flex:1;padding:6px 8px;border:1px solid #b79d77;border-radius:4px;font-size:13px;background:#fff;">
                <option value="">使用默认配置</option>
                ${providerOptions}
              </select>
            </label>
          </div>
        `;
      });
      contentEl.innerHTML = html;
      ["ai1", "ai2", "ai3"].forEach((aiId) => {
        const select = document.getElementById(`aiModelProvider-${aiId}`);
        if (select) {
          select.value = aiModelConfigs[aiId] || "";
        }
      });
    },

    saveAiModelConfigFromForm() {
      const configs = {};
      ["ai1", "ai2", "ai3"].forEach((aiId) => {
        const select = document.getElementById(`aiModelProvider-${aiId}`);
        if (select) {
          configs[aiId] = select.value || "";
        }
      });
      this.saveAiModelConfigs(configs);
      this.closeAiModelConfigOverlay();
      this.writeLog("AI模型配置已保存。");
    },

    getAiModelConfig(aiIndex) {
      const aiId = `ai${aiIndex + 1}`;
      const aiModelConfigs = this.loadAiModelConfigs();
      const providerId = aiModelConfigs[aiId];
      console.log("[getAiModelConfig] aiIndex:", aiIndex, "aiId:", aiId, "providerId:", providerId);
      if (!providerId) {
        console.log("[getAiModelConfig] no providerId for aiId:", aiId);
        return null;
      }
      if (window.LlmManager) {
        const provider = window.LlmManager.getProvider(providerId);
        console.log("[getAiModelConfig] provider:", provider ? provider.id : null);
        if (provider && typeof provider.loadSettings === "function") {
          const settings = provider.loadSettings();
          console.log("[getAiModelConfig] settings:", { apiKey: settings.apiKey ? "(已设置)" : "(空)", endpoint: settings.endpoint, model: settings.model });
          return {
            apiKey: settings.apiKey || "",
            endpoint: settings.endpoint || "",
            model: settings.model || "",
            maxTokens: settings.maxTokens,
            timeoutMs: settings.timeoutMs,
            thinkingEnabled: settings.thinkingEnabled
          };
        }
      }
      console.log("[getAiModelConfig] LlmManager not available or provider not found");
      return null;
    }
  };

  global.MobaoUi = global.MobaoUi || {};
  global.MobaoUi.OverlayMixin = UiOverlayMixin;
})(window);

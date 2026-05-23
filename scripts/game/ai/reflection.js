(function setupMobaoAiReflection(global) {
  const AiReflectionMixin = {
    isAiReflectionEnabled() {
      const settings = typeof this.getLlmSettings === "function" ? this.getLlmSettings() : null;
      return Boolean(settings && settings.reflectionEnabled);
    },

    async triggerAiReflection(record) {
      console.log("[triggerAiReflection] called, checking conditions...");
      console.log("[triggerAiReflection] isAiReflectionEnabled:", this.isAiReflectionEnabled(), "canUseLlmDecision:", this.canUseLlmDecision(), "llmEverUsedThisRun:", this.llmEverUsedThisRun);
      if (!this.isAiReflectionEnabled() || !this.canUseLlmDecision() || !this.llmEverUsedThisRun) {
        console.log("[triggerAiReflection] EARLY RETURN: conditions not met");
        return;
      }
      this.aiReflectionState = "pending";
      this.updateReflectionStatusUI();
      const aiPlayers = this.players.filter((p) => !p.isHuman && this.canUseLlmDecisionForPlayer(p.id));
      console.log("[triggerAiReflection] aiPlayers count:", aiPlayers.length);
      if (aiPlayers.length === 0) {
        this.aiReflectionState = "done";
        this.updateReflectionStatusUI();
        return;
      }
      let anyFailed = false;
      let anyTimeout = false;
      const reflectionPromises = aiPlayers.map(async (player) => {
        console.log("[triggerAiReflection] starting reflection for player:", player.id, player.name);
        const isWinner = record.winnerId === player.id;
        let dividendTicketText = "无分红/门票";
        if (record.dividendTicket) {
          if (isWinner) {
            dividendTicketText = "你是拍下者，无分红/门票";
          } else if (record.dividendTicket.mechanism === "dividend") {
            dividendTicketText = `分红触发：拍下者亏损，你获得+${record.dividendTicket.dividendPerPlayer || 0}分红`;
          } else if (record.dividendTicket.mechanism === "ticket") {
            dividendTicketText = `门票触发：拍下者盈利，你被扣除${record.dividendTicket.ticketPerPlayer || 0}门票`;
          }
        }
        const reflectionPrompt = [
          "【本局结束，请反思】",
          `结果：${record.result}`,
          `${dividendTicketText}。`,
          `品质分布：粗${record.qualityCounts.poor || 0} 良${record.qualityCounts.normal || 0} 精${record.qualityCounts.fine || 0} 珍${record.qualityCounts.rare || 0} 绝${record.qualityCounts.legendary || 0} | 总藏品${record.totalItems || 0}`,
          "",
          "请对本局表现写反思总结（200字内），分析决策优劣和可改进之处。只输出反思文本。"
        ].join("\n");

        try {
          const llmProvider = this.getLlmProvider();
          console.log("[triggerAiReflection] llmProvider:", llmProvider ? llmProvider.id : "null");
          if (!llmProvider) {
            anyFailed = true;
            console.log("[triggerAiReflection] FAILED: no llmProvider for player:", player.id);
            return { playerId: player.id, reflection: null };
          }
          let settings = typeof this.getLlmSettings === "function" ? this.getLlmSettings() : null;
          const independentReflectionEnabled = settings && settings.independentReflectionEnabled !== undefined ? settings.independentReflectionEnabled : true;
          console.log("[triggerAiReflection] independentReflectionEnabled:", independentReflectionEnabled);
          if (independentReflectionEnabled && typeof this.getAiModelConfigForPlayer === "function") {
            const aiModelConfig = this.getAiModelConfigForPlayer(player.id);
            console.log("[triggerAiReflection] aiModelConfig for player:", player.id, aiModelConfig ? { apiKey: aiModelConfig.apiKey ? "(已设置)" : "(空)", endpoint: aiModelConfig.endpoint, model: aiModelConfig.model } : null);
            if (aiModelConfig) {
              settings = {
                ...settings,
                apiKey: aiModelConfig.apiKey || settings.apiKey,
                endpoint: aiModelConfig.endpoint || settings.endpoint,
                model: aiModelConfig.model || settings.model,
                maxTokens: aiModelConfig.maxTokens || settings.maxTokens,
                timeoutMs: aiModelConfig.timeoutMs || settings.timeoutMs,
                thinkingEnabled: aiModelConfig.thinkingEnabled !== undefined ? aiModelConfig.thinkingEnabled : settings.thinkingEnabled
              };
              console.log("[triggerAiReflection] merged settings for player:", player.id, { apiKey: settings.apiKey ? "(已设置)" : "(空)", endpoint: settings.endpoint, model: settings.model });
            }
          }
          const thinkingEnabled = settings && settings.thinkingEnabled;
          const userTimeoutMs = settings && settings.timeoutMs ? settings.timeoutMs : 40000;
          const maxTokens = settings && settings.maxTokens ? settings.maxTokens : (thinkingEnabled ? 4000 : 800);
          const timeoutMs = thinkingEnabled ? Math.max(userTimeoutMs, 90000) : userTimeoutMs;

          const playerCache = this.aiConversationCache && this.aiConversationCache[player.id];
          let messages;
          if (playerCache && Array.isArray(playerCache) && playerCache.length > 0) {
            messages = [...playerCache, { role: "user", content: reflectionPrompt }];
            console.log("[triggerAiReflection] using cached conversation, messages count:", messages.length);
          } else {
            messages = [
              { role: "system", content: `你是仓库摸宝竞拍AI玩家${player.name}(${player.id})，正在对本局自己的表现进行反思总结。只反思你自己的出价和决策，不要混淆其他玩家的行为。` },
              { role: "user", content: reflectionPrompt }
            ];
            console.log("[triggerAiReflection] no cache, using simple prompt");
          }

          console.log("[triggerAiReflection] requesting chat for player:", player.id, "thinkingEnabled:", thinkingEnabled, "maxTokens:", maxTokens, "timeoutMs:", timeoutMs);
          const result = await llmProvider.requestChat({
            temperature: 0.3,
            maxTokens,
            timeoutMs,
            isThinking: thinkingEnabled,
            messages
          });
          console.log("[triggerAiReflection] result for player:", player.id, "ok:", result.ok, "code:", result.code, "error:", result.error, "contentLength:", result.content ? result.content.length : 0, "reasoningContentLength:", result.reasoningContent ? result.reasoningContent.length : 0);
          if (result.ok && (result.content || result.reasoningContent)) {
            const rawContent = result.content || result.reasoningContent || "";
            const reflection = String(rawContent).trim().slice(0, 300);
            console.log("[triggerAiReflection] SUCCESS for player:", player.id, "reflection length:", reflection.length);
            if (this.isAiMultiGameMemoryEnabled()) {
              this.updateCrossGameReflection(player.id, record.run, reflection);
            } else {
              this.pendingNextRunAiSummary += ` 【${player.name}反思】${reflection}`;
              this.saveAiMemoryToStorage();
            }
            return { playerId: player.id, reflection };
          }
          if (result.code === "TIMEOUT") {
            anyTimeout = true;
            console.log("[triggerAiReflection] TIMEOUT for player:", player.id);
          } else {
            anyFailed = true;
            console.log("[triggerAiReflection] FAILED for player:", player.id, "code:", result.code, "error:", result.error);
          }
          return { playerId: player.id, reflection: null };
        } catch (_error) {
          anyFailed = true;
          return { playerId: player.id, reflection: null };
        }
      });
      await Promise.all(reflectionPromises);
      if (anyTimeout) {
        this.aiReflectionState = "timeout";
      } else if (anyFailed) {
        this.aiReflectionState = "error";
      } else {
        this.aiReflectionState = "done";
      }
      this.updateReflectionStatusUI();
    },

    updateCrossGameReflection(playerId, run, reflection) {
      const memory = this.aiCrossGameMemory[playerId];
      if (!memory) return;
      const entry = memory.find((e) => e.run === run);
      if (entry) {
        entry.reflection = reflection;
        this.saveAiMemoryToStorage();
      }
    },

    shouldShowReflectionUI() {
      return this.isAiReflectionEnabled() && this.canUseLlmDecision() && this.llmEverUsedThisRun;
    },

    updateReflectionStatusUI() {
      const el = this.dom.settleReflectionStatus;
      if (!el) return;
      if (!this.shouldShowReflectionUI()) {
        el.classList.add("hidden");
        el.textContent = "";
        el.className = "settle-reflection-status hidden";
        return;
      }
      el.classList.remove("hidden", "is-pending", "is-done", "is-timeout", "is-error");
      switch (this.aiReflectionState) {
        case "pending":
          el.classList.add("is-pending");
          el.textContent = "反思生成中...";
          break;
        case "done":
          el.classList.add("is-done");
          el.textContent = "反思生成完成";
          break;
        case "timeout":
          el.classList.add("is-timeout");
          el.textContent = "反思生成超时";
          break;
        case "error":
          el.classList.add("is-error");
          el.textContent = "反思生成失败";
          break;
        default:
          el.classList.add("hidden");
          break;
      }
    },

    showReflectionPendingDialog() {
      this.removeReflectionPendingDialog();
      const overlay = document.createElement("div");
      overlay.id = "reflectionPendingDialog";
      overlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:99999;";
      const box = document.createElement("div");
      box.style.cssText = "background:#2a2218;border:2px solid #d4a843;border-radius:12px;padding:24px 32px;text-align:center;color:#e0d0b0;font-size:16px;max-width:380px;";
      box.innerHTML =
        '<div style="margin-bottom:12px;font-size:18px;font-weight:bold;">AI反思尚未完成</div>' +
        '<div style="color:#a09070;margin-bottom:16px;">AI正在对本局表现进行反思，离开可能导致反思结果丢失。</div>' +
        '<div style="display:flex;gap:10px;justify-content:center;">' +
        '<button id="reflectionDialogWait" style="padding:8px 20px;border-radius:6px;border:1px solid #d4a843;background:rgba(212,168,67,0.15);color:#d4a843;cursor:pointer;font-size:14px;">等待完成</button>' +
        '<button id="reflectionDialogSkip" style="padding:8px 20px;border-radius:6px;border:1px solid #8a6a4a;background:rgba(138,106,74,0.15);color:#a09070;cursor:pointer;font-size:14px;">继续游戏</button>' +
        '</div>';
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      document.getElementById("reflectionDialogWait").addEventListener("click", () => {
        this.removeReflectionPendingDialog();
      });
      document.getElementById("reflectionDialogSkip").addEventListener("click", () => {
        this.removeReflectionPendingDialog();
        this.proceedToNewRun();
      });
    },

    removeReflectionPendingDialog() {
      const el = document.getElementById("reflectionPendingDialog");
      if (el) el.remove();
    },

    proceedToNewRun() {
      this.exitSettlementPage();
      this.startNewRun();
      if (typeof AudioManager !== "undefined") {
        AudioManager.resumeBgm();
      }
    }
  };

  global.MobaoAi = global.MobaoAi || {};
  global.MobaoAi.ReflectionMixin = AiReflectionMixin;
})(window);

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
      const AI_REFLECTION_RULES = [
        "仓库摸宝游戏·规则摘要",
        "一、四位玩家通过多轮竞价争夺封闭仓库所有权。仓库内藏有若干件未知藏品，真实总价值仅在成交后揭晓。玩家利用技能、道具及心理博弈，在有限轮次内以合理价格拍下仓库，目标是盈利。",
        "二、藏品库大小随机（总格数随机），越大的仓库意味着更多藏品和机会。每个藏品有品质、占格数、价格。每局开始时从全部可能藏品中随机抽取若干件放入仓库，玩家初始对仓库内具体藏品、价值与品质一无所知。",
        "三、玩家由角色（附带固定技能含主动技被动技）和道具（从个人收藏中搭配携带）两部分构成。",
        "四、出价流程：每轮所有玩家同时提交出价，结束后公开所有出价。系统判断是否提前结束。若未结束进入轮间阶段：玩家可使用技能或道具，查看公开信息，调整策略。",
        "提前结束条件（非最后一轮）：第一名出价 > 第二名出价 × 溢价系数，则第一名直接赢得仓库。",
        "正常结束：最终轮出价最高者赢得仓库。",
        "五、结算：赢家诞生后揭示仓库所有藏品真实清单与总价值。总价值>成交价→赢家盈利；总价值<成交价→赢家亏损。",
        "分红机制：非拍下者可获得拍下者亏损的15%资金（鼓励欺诈对手高价拍下）。",
        "门票机制：非拍下者会被扣除拍下者盈利的5%资金（鼓励积极拍下）。"
      ].join("\n");
      const aiPlayers = this.players.filter((p) => !p.isHuman && this.canUseLlmDecisionForPlayer(p.id));
      console.log("[triggerAiReflection] aiPlayers count:", aiPlayers.length, "isAiReflectionEnabled:", this.isAiReflectionEnabled(), "canUseLlmDecision:", this.canUseLlmDecision(), "llmEverUsedThisRun:", this.llmEverUsedThisRun);
      if (aiPlayers.length === 0) {
        this.aiReflectionState = "done";
        this.updateReflectionStatusUI();
        return;
      }
      let anyFailed = false;
      let anyTimeout = false;
      const reflectionPromises = aiPlayers.map(async (player) => {
        console.log("[triggerAiReflection] starting reflection for player:", player.id, player.name);
        const memory = this.aiCrossGameMemory[player.id];
        const memoryEntry = memory ? memory.find((e) => e.run === record.run) : null;
        const decisionLines = (memoryEntry && memoryEntry.decisionSummary) || [];
        const bidLines = (record.roundBids || []).map((b) => {
          const isYou = b.playerId === player.id;
          return `轮${b.round} ${b.playerName}(${b.playerId}): ${b.bid}${isYou ? " ←你" : ""}`;
        });
        const myBids = (record.roundBids || []).filter((b) => b.playerId === player.id);
        const myBidSummary = myBids.length > 0
          ? myBids.map((b) => `轮${b.round}: ${b.bid}`).join("、")
          : "未出价";
        const isWinner = record.winnerId === player.id;
        let dividendTicketText = "【分红/门票】本局无分红/门票。";
        if (record.dividendTicket) {
          if (isWinner) {
            dividendTicketText = "【分红/门票】你是拍下者，无分红/门票。";
          } else if (record.dividendTicket.mechanism === "dividend") {
            dividendTicketText = `【分红/门票】分红触发：拍下者亏损，你获得+${record.dividendTicket.dividendPerPlayer || 0}分红。`;
          } else if (record.dividendTicket.mechanism === "ticket") {
            dividendTicketText = `【分红/门票】门票触发：拍下者盈利，你被扣除${record.dividendTicket.ticketPerPlayer || 0}门票。`;
          }
        }
        const userContent = [
          `你是${player.name}(${player.id})，请对本局自己的表现写反思总结（200字内），分析你的决策优劣和可改进之处。注意：只反思你自己的出价和行为，不要把其他玩家的出价当作自己的。`,
          "",
          `【本局结果】${record.result}`,
          dividendTicketText,
          `【品质分布】粗${record.qualityCounts.poor || 0} 良${record.qualityCounts.normal || 0} 精${record.qualityCounts.fine || 0} 珍${record.qualityCounts.rare || 0} 绝${record.qualityCounts.legendary || 0} | 总藏品${record.totalItems || 0} | 仓库占格${record.totalCells || 0}`,
          "",
          `【你的出价记录】${myBidSummary}`,
          "",
          "【你的决策摘要】",
          ...(decisionLines.length > 0 ? decisionLines : ["（无LLM决策记录，请根据出价记录反思）"]),
          "",
          "【各轮各玩家出价】（←你 标记的是你的出价）",
          ...bidLines,
          "",
          AI_REFLECTION_RULES ? `【游戏规则】\n${AI_REFLECTION_RULES}` : "",
          "",
          "只输出反思文本，不要输出JSON或其他格式。"
        ].filter(Boolean).join("\n");

        try {
          const llmProvider = this.getLlmProvider();
          console.log("[triggerAiReflection] llmProvider:", llmProvider ? llmProvider.id : "null");
          if (!llmProvider) {
            anyFailed = true;
            console.log("[triggerAiReflection] FAILED: no llmProvider for player:", player.id);
            return { playerId: player.id, reflection: null };
          }
          const settings = typeof this.getLlmSettings === "function" ? this.getLlmSettings() : null;
          const thinkingEnabled = settings && settings.thinkingEnabled;
          const userTimeoutMs = settings && settings.timeoutMs ? settings.timeoutMs : 40000;
          const maxTokens = thinkingEnabled ? 4000 : 800;
          const timeoutMs = thinkingEnabled ? Math.max(userTimeoutMs, 90000) : userTimeoutMs;
          console.log("[triggerAiReflection] requesting chat for player:", player.id, "thinkingEnabled:", thinkingEnabled, "maxTokens:", maxTokens, "timeoutMs:", timeoutMs);
          const result = await llmProvider.requestChat({
            temperature: 0.3,
            maxTokens,
            timeoutMs,
            isThinking: thinkingEnabled,
            messages: [
              { role: "system", content: `你是仓库摸宝竞拍AI玩家${player.name}(${player.id})，正在对本局自己的表现进行反思总结。只反思你自己的出价和决策，不要混淆其他玩家的行为。` },
              { role: "user", content: userContent }
            ]
          });
          console.log("[triggerAiReflection] FULL RESULT for player:", player.id, JSON.stringify(result, null, 2));
          console.log("[triggerAiReflection] RAW RESPONSE:", result.raw ? JSON.stringify(result.raw, null, 2).slice(0, 1000) : "null");
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
    }
  };

  global.MobaoAi = global.MobaoAi || {};
  global.MobaoAi.ReflectionMixin = AiReflectionMixin;
})(window);

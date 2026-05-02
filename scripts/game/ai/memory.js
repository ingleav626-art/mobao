(function setupMobaoAiMemory(global) {
  const { AI_MEMORY_STORAGE_KEY } = global.MobaoConstants;
  const { formatBidRevealNumber } = global.MobaoUtils;

  const AiMemoryMixin = {
    isAiMultiGameMemoryEnabled() {
      const settings = typeof this.getLlmSettings === "function" ? this.getLlmSettings() : null;
      return Boolean(settings && settings.multiGameMemoryEnabled);
    },

    loadAiMemoryFromStorage() {
      try {
        const raw = window.localStorage.getItem(AI_MEMORY_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return null;
        return parsed;
      } catch (_error) {
        return null;
      }
    },

    saveAiMemoryToStorage() {
      try {
        const data = {
          conversations: this.aiConversationByPlayer,
          crossGameMemory: this.aiCrossGameMemory,
          pendingSummary: this.pendingNextRunAiSummary || "",
          runSerial: this.runSerial || 0,
          savedAt: Date.now()
        };
        window.localStorage.setItem(AI_MEMORY_STORAGE_KEY, JSON.stringify(data));
      } catch (_error) {
      }
    },

    restoreAiMemoryFromStorage() {
      const stored = this.loadAiMemoryFromStorage();
      if (!stored) return;
      if (stored.conversations && typeof stored.conversations === "object") {
        this.aiConversationByPlayer = {};
        Object.keys(stored.conversations).forEach((playerId) => {
          const arr = stored.conversations[playerId];
          if (Array.isArray(arr)) {
            const filtered = arr.filter((entry) => entry && typeof entry.round === "number");
            this.aiConversationByPlayer[playerId] = filtered.slice(-30);
          }
        });
      }
      if (stored.crossGameMemory && typeof stored.crossGameMemory === "object") {
        this.aiCrossGameMemory = {};
        Object.keys(stored.crossGameMemory).forEach((playerId) => {
          const arr = stored.crossGameMemory[playerId];
          if (Array.isArray(arr)) {
            this.aiCrossGameMemory[playerId] = arr.slice(-20);
          }
        });
      }
      if (typeof stored.pendingSummary === "string") {
        this.pendingNextRunAiSummary = stored.pendingSummary;
      }
      if (typeof stored.runSerial === "number" && stored.runSerial > 0) {
        this.runSerial = stored.runSerial;
      }
    },

    ensureAiConversationBucket(playerId) {
      if (!this.aiConversationByPlayer[playerId]) {
        this.aiConversationByPlayer[playerId] = [];
      }
      return this.aiConversationByPlayer[playerId];
    },

    ensureAiCrossGameMemory(playerId) {
      if (!this.aiCrossGameMemory[playerId]) {
        this.aiCrossGameMemory[playerId] = [];
      }
      return this.aiCrossGameMemory[playerId];
    },

    getAiCrossGameMemoryCount(playerId) {
      return this.ensureAiCrossGameMemory(playerId).length;
    },

    getAiInGameHistoryCount(playerId) {
      const bucket = this.aiConversationByPlayer[playerId];
      return Array.isArray(bucket) ? bucket.length : 0;
    },

    getQualityCounts() {
      const counts = { poor: 0, normal: 0, fine: 0, rare: 0, legendary: 0 };
      this.items.forEach((item) => {
        const qk = item.qualityKey;
        if (typeof counts[qk] === "number") {
          counts[qk] += 1;
        }
      });
      return counts;
    },

    getTotalOccupiedCells() {
      return this.items.reduce((sum, item) => sum + item.w * item.h, 0);
    },

    getAiConversationMessages(playerId) {
      const messages = [];
      const crossMemory = this.ensureAiCrossGameMemory(playerId);
      if (crossMemory.length > 0) {
        const total = crossMemory.length;
        const lines = [`【跨局记忆：最近${total}局结果与反思】`];
        crossMemory.forEach((entry, i) => {
          const parts = [`最近第${total - i}局(局号${entry.run || "?"})`];
          if (entry.result) parts.push(entry.result);
          const isWinner = entry.winnerId === playerId;
          if (entry.dividendTicket && !isWinner) {
            const dt = entry.dividendTicket;
            if (dt.mechanism === "dividend") {
              parts.push(`分红+${dt.dividendPerPlayer || 0}`);
            } else if (dt.mechanism === "ticket") {
              parts.push(`门票-${dt.ticketPerPlayer || 0}`);
            }
          }
          if (entry.qualityCounts) {
            const qc = entry.qualityCounts;
            parts.push(`品质分布:粗${qc.poor || 0}良${qc.normal || 0}精${qc.fine || 0}珍${qc.rare || 0}绝${qc.legendary || 0}`);
          }
          if (entry.totalItems) parts.push(`总藏品${entry.totalItems}`);
          if (entry.totalCells) parts.push(`仓库占格${entry.totalCells}`);
          if (entry.reflection) {
            parts.push(`反思:${entry.reflection}`);
          } else if (entry.reflectionEnabled === false) {
            parts.push("反思:该局未开启局后反思");
          } else {
            parts.push("反思:(待生成)");
          }
          lines.push(parts.join(" | "));
        });
        messages.push({ role: "user", content: lines.join("\n") });
      }
      const inGameBucket = this.aiConversationByPlayer[playerId];
      if (Array.isArray(inGameBucket) && inGameBucket.length > 0) {
        const inGameLines = ["【本局内历史决策记录】"];
        inGameBucket.forEach((entry) => {
          const parts = [`轮${entry.round || "?"}`];
          if (entry.bid != null) parts.push(`出价${entry.bid}`);
          if (entry.skill && entry.skill !== "无") parts.push(`技能:${entry.skill}`);
          if (entry.item && entry.item !== "无") parts.push(`道具:${entry.item}`);
          if (entry.thought) parts.push(`想法:${entry.thought}`);
          if (entry.result) parts.push(`结果:${entry.result}`);
          inGameLines.push(parts.join(" | "));
        });
        messages.push({ role: "user", content: inGameLines.join("\n") });
      }
      return messages;
    },

    pushAiRoundSummary(playerId, plan) {
      if (!this.isAiMultiGameMemoryEnabled()) {
        return;
      }
      const bucket = this.ensureAiConversationBucket(playerId);
      const entry = {
        run: this.runSerial || 0,
        round: this.round || 0,
        bid: plan && plan.bid != null ? plan.bid : null,
        skill: plan && plan.actionType === "skill" && plan.actionId ? plan.actionId : "无",
        item: plan && plan.actionType === "item" && plan.actionId ? plan.actionId : "无",
        thought: plan && plan.thought ? String(plan.thought).slice(0, 120) : "",
        result: ""
      };
      bucket.push(entry);
      if (bucket.length > 30) {
        this.aiConversationByPlayer[playerId] = bucket.slice(-30);
      }
      this.saveAiMemoryToStorage();
    },

    updateLastAiRoundResult(playerId, resultText) {
      if (!this.isAiMultiGameMemoryEnabled()) {
        return;
      }
      const bucket = this.ensureAiConversationBucket(playerId);
      if (bucket.length > 0) {
        bucket[bucket.length - 1].result = String(resultText || "").slice(0, 60);
        this.saveAiMemoryToStorage();
      }
    },

    resetAiConversations() {
      this.aiConversationByPlayer = {};
      this.aiCrossGameMemory = {};
      this.aiReflectionPending = {};
      this.pendingNextRunAiSummary = "";
    },

    clearAiMemoryStorage() {
      this.aiConversationByPlayer = {};
      this.aiCrossGameMemory = {};
      this.aiReflectionPending = {};
      this.pendingNextRunAiSummary = "";
      this.runSerial = 0;
      try {
        window.localStorage.removeItem(AI_MEMORY_STORAGE_KEY);
      } catch (_error) {
      }
    },

    pushRunStartContextToAi() {
    },

    pushRunSettlementContextToAi(result) {
      const winnerId = result && result.winnerId ? result.winnerId : null;
      const winnerName = result && result.winnerName ? result.winnerName : "未知";
      const winnerBid = Math.round(Number(result && result.winnerBid) || 0);
      const totalValue = Math.round(Number(result && result.totalValue) || 0);
      const winnerProfit = Math.round(Number(result && result.winnerProfit) || 0);
      const reasonText = result && result.reasonText ? result.reasonText : "结算";
      const dtInfo = result && result.dividendTicketInfo ? result.dividendTicketInfo : null;
      const mechanism = dtInfo ? dtInfo.mechanism : "none";
      const dividendAmt = dtInfo ? Math.round(Number(dtInfo.dividendPerPlayer) || 0) : 0;
      const ticketAmt = dtInfo ? Math.round(Number(dtInfo.ticketPerPlayer) || 0) : 0;

      let mechanismText = "";
      if (mechanism === "dividend") {
        mechanismText = `分红触发：拍下者亏损，非拍下者各获得亏损额的15%（+${dividendAmt}）。`;
      } else if (mechanism === "ticket") {
        mechanismText = `门票触发：拍下者盈利，非拍下者各被扣除盈利额的5%（-${ticketAmt}）。`;
      }

      this.pendingNextRunAiSummary = [
        `【系统事件】第 ${this.runSerial} 局已结算：${winnerName} 以 ${winnerBid} 拿下整仓（${reasonText}）。`,
        `本局揭示总值 ${totalValue}，拍下者利润 ${winnerProfit >= 0 ? "+" : ""}${winnerProfit}。`,
        mechanismText,
        "请记录本局经验并等待下一局开始。"
      ].filter(Boolean).join(" ");

      this.players.filter((p) => !p.isHuman).forEach((p) => {
        const isWinner = p.id === winnerId;
        let resultText = `${winnerName}以${winnerBid}中标,总值${totalValue},利润${winnerProfit >= 0 ? "+" : ""}${winnerProfit}`;
        if (!isWinner && mechanism === "dividend") {
          resultText += `,分红+${dividendAmt}`;
        } else if (!isWinner && mechanism === "ticket") {
          resultText += `,门票-${ticketAmt}`;
        }
        this.updateLastAiRoundResult(p.id, resultText);
      });
      this.saveAiMemoryToStorage();
    },

    createCrossGameRecord(result) {
      const winnerId = result && result.winnerId ? result.winnerId : null;
      const winnerName = result && result.winnerName ? result.winnerName : "未知";
      const winnerBid = Math.round(Number(result && result.winnerBid) || 0);
      const totalValue = Math.round(Number(result && result.totalValue) || 0);
      const winnerProfit = Math.round(Number(result && result.winnerProfit) || 0);
      const reasonText = result && result.reasonText ? result.reasonText : "结算";
      const dtInfo = result && result.dividendTicketInfo ? result.dividendTicketInfo : null;
      const mechanism = dtInfo ? dtInfo.mechanism : "none";
      const dividendAmt = dtInfo ? Math.round(Number(dtInfo.dividendPerPlayer) || 0) : 0;
      const ticketAmt = dtInfo ? Math.round(Number(dtInfo.ticketPerPlayer) || 0) : 0;
      const qualityCounts = this.getQualityCounts();
      const totalItems = this.items.length;
      const totalCells = this.getTotalOccupiedCells();
      const roundBids = [];
      this.players.forEach((player) => {
        const history = this.playerRoundHistory[player.id] || [];
        history.forEach((entry) => {
          roundBids.push({
            round: entry.round,
            playerId: player.id,
            playerName: player.name,
            bid: entry.bid
          });
        });
      });
      let resultStr = `${winnerName}以${winnerBid}中标(${reasonText}),总值${totalValue},利润${winnerProfit >= 0 ? "+" : ""}${winnerProfit}`;
      if (mechanism === "dividend") {
        resultStr += `,分红+${dividendAmt}`;
      } else if (mechanism === "ticket") {
        resultStr += `,门票-${ticketAmt}`;
      }
      const record = {
        run: this.runSerial || 0,
        winnerId,
        result: resultStr,
        dividendTicket: mechanism !== "none" ? { mechanism, dividendPerPlayer: dividendAmt, ticketPerPlayer: ticketAmt } : null,
        qualityCounts,
        totalItems,
        totalCells,
        roundBids,
        reflection: null,
        reflectionEnabled: this.isAiReflectionEnabled()
      };
      return record;
    },

    saveCrossGameRecord(record) {
      if (!this.isAiMultiGameMemoryEnabled()) return;
      this.players.filter((p) => !p.isHuman).forEach((p) => {
        const memory = this.ensureAiCrossGameMemory(p.id);
        const playerRecord = { ...record };
        const bucket = this.ensureAiConversationBucket(p.id);
        playerRecord.decisionSummary = bucket
          .filter((e) => e.run === record.run)
          .map((e) => {
            const parts = [`轮${e.round || "?"}`];
            if (e.bid != null) parts.push(`出价${e.bid}`);
            if (e.skill && e.skill !== "无") parts.push(`技能:${e.skill}`);
            if (e.item && e.item !== "无") parts.push(`道具:${e.item}`);
            if (e.thought) parts.push(`想法:${e.thought.slice(0, 60)}`);
            return parts.join(" ");
          });
        memory.push(playerRecord);
        if (memory.length > 20) {
          this.aiCrossGameMemory[p.id] = memory.slice(-20);
        }
      });
      this.saveAiMemoryToStorage();
    },

    getAiFirstRoundExtraBlocks() {
      if (!this.isAiMultiGameMemoryEnabled() || this.round !== 1) {
        return [];
      }

      const blocks = [
        `【系统事件】第 ${this.runSerial} 局开始。本局仓库随机生成，技能与道具已重置。`
      ];

      if (this.pendingNextRunAiSummary) {
        blocks.push(this.pendingNextRunAiSummary);
      }

      if (this.currentPublicEvent) {
        blocks.push(`【公共事件】${this.currentPublicEvent.category}：${this.currentPublicEvent.text}`);
      }

      return blocks;
    },

    openAiMemoryPanel() {
      if (!this.dom.aiMemoryOverlay) return;
      const aiPlayers = this.players.filter((p) => !p.isHuman);
      if (aiPlayers.length === 0) {
        if (this.dom.aiMemoryContent) {
          this.dom.aiMemoryContent.innerHTML = '<div class="ai-memory-empty">暂无AI玩家</div>';
        }
        this.dom.aiMemoryOverlay.classList.remove("hidden");
        return;
      }
      const sections = aiPlayers.map((player, idx) => {
        const memory = this.aiCrossGameMemory[player.id];
        const colors = ["#c49a3c", "#5a9e5a", "#5a7ebd", "#bd5a7e"];
        const color = colors[idx % colors.length];
        let inner = "";
        if (!memory || memory.length === 0) {
          inner = '<div class="ai-memory-empty">暂无跨局记忆</div>';
        } else {
          const total = memory.length;
          const entries = memory.map((entry, i) => {
            const recentIdx = total - i;
            let details = `<div class="ai-memory-entry">`;
            details += `<div class="ai-memory-entry-title">最近第${recentIdx}局 <span class="ai-memory-entry-sub">(局号${entry.run || "?"})</span></div>`;
            if (entry.result) details += `<div class="ai-memory-field"><span class="ai-memory-label">结果</span>${entry.result}</div>`;
            const isWinner = entry.winnerId === player.id;
            if (entry.dividendTicket && !isWinner) {
              const dt = entry.dividendTicket;
              if (dt.mechanism === "dividend") {
                details += `<div class="ai-memory-field"><span class="ai-memory-label">分红/门票</span>分红+${dt.dividendPerPlayer || 0}</div>`;
              } else if (dt.mechanism === "ticket") {
                details += `<div class="ai-memory-field"><span class="ai-memory-label">分红/门票</span>门票-${dt.ticketPerPlayer || 0}</div>`;
              }
            }
            if (entry.qualityCounts) {
              const qc = entry.qualityCounts;
              details += `<div class="ai-memory-field"><span class="ai-memory-label">品质</span>粗${qc.poor || 0} 良${qc.normal || 0} 精${qc.fine || 0} 珍${qc.rare || 0} 绝${qc.legendary || 0}</div>`;
            }
            if (entry.totalItems) details += `<div class="ai-memory-field"><span class="ai-memory-label">总藏品</span>${entry.totalItems}</div>`;
            if (entry.totalCells) details += `<div class="ai-memory-field"><span class="ai-memory-label">仓库占格</span>${entry.totalCells}</div>`;
            if (entry.reflection) {
              details += `<div class="ai-memory-field"><span class="ai-memory-label">反思</span>${entry.reflection}</div>`;
            } else if (entry.reflectionEnabled === false) {
              details += `<div class="ai-memory-field"><span class="ai-memory-label">反思</span><span class="ai-memory-disabled">该局未开启局后反思</span></div>`;
            } else {
              details += `<div class="ai-memory-field"><span class="ai-memory-label">反思</span><span class="ai-memory-pending">待生成</span></div>`;
            }
            details += "</div>";
            return details;
          }).join("");
          inner = entries;
        }
        return `<div class="ai-memory-section" style="--section-color:${color}">` +
          `<div class="ai-memory-section-header">${player.name}${memory && memory.length > 0 ? ` <span class="ai-memory-header-count">(最近${memory.length}局)</span>` : ""}</div>` +
          `<div class="ai-memory-section-body">${inner}</div>` +
          `</div>`;
      }).join("");
      if (this.dom.aiMemoryContent) {
        this.dom.aiMemoryContent.innerHTML = sections || '<div class="ai-memory-empty">暂无记忆数据</div>';
      }
      if (!this._aiMemoryTouchBound) {
        this._aiMemoryTouchBound = true;
        this.setupAiMemoryTouchScroll();
      }
      this.dom.aiMemoryOverlay.classList.remove("hidden");
    },

    setupAiMemoryTouchScroll() {
      const content = this.dom.aiMemoryContent;
      if (!content) return;
      let touchStartY = 0;
      let touchStartScrollTop = 0;
      content.addEventListener("touchstart", (e) => {
        if (e.touches.length === 1) {
          touchStartY = e.touches[0].clientY;
          touchStartScrollTop = content.scrollTop;
        }
      }, { passive: true });
      content.addEventListener("touchmove", (e) => {
        if (e.touches.length !== 1) return;
        const dy = touchStartY - e.touches[0].clientY;
        const maxScroll = content.scrollHeight - content.clientHeight;
        if (maxScroll <= 0) return;
        content.scrollTop = Math.max(0, Math.min(touchStartScrollTop + dy, maxScroll));
      }, { passive: true });
    },

    closeAiMemoryPanel() {
      if (this.dom.aiMemoryOverlay) {
        this.dom.aiMemoryOverlay.classList.add("hidden");
      }
    }
  };

  global.MobaoAi = global.MobaoAi || {};
  global.MobaoAi.MemoryMixin = AiMemoryMixin;
})(window);

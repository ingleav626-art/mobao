(function setupMobaoAiMemory(global) {
  const { AI_MEMORY_STORAGE_KEY } = global.MobaoConstants;
  const { formatBidRevealNumber } = global.MobaoUtils;

  const AiMemoryMixin = {
    getAiMemoryStorageKey() {
      if (this.isLanMode) {
        return AI_MEMORY_STORAGE_KEY + "_lan";
      }
      return AI_MEMORY_STORAGE_KEY;
    },

    isAiMultiGameMemoryEnabled() {
      const settings = typeof this.getLlmSettings === "function" ? this.getLlmSettings() : null;
      return Boolean(settings && settings.multiGameMemoryEnabled);
    },

    loadAiMemoryFromStorage() {
      try {
        const storageKey = this.getAiMemoryStorageKey();
        const raw = window.localStorage.getItem(storageKey);
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
        const storageKey = this.getAiMemoryStorageKey();
        const data = {
          conversations: this.aiConversationByPlayer,
          crossGameMemory: this.aiCrossGameMemory,
          pendingSummary: this.pendingNextRunAiSummary || "",
          runSerial: this.runSerial || 0,
          savedAt: Date.now()
        };
        window.localStorage.setItem(storageKey, JSON.stringify(data));
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
          const data = stored.crossGameMemory[playerId];
          if (data && typeof data === "object" && (data.stats || data.lessons || data.strategies || data.praises)) {
            const defaultStats = {
              totalGames: 0,
              warehouseValueMax: 0,
              warehouseValueMin: 0,
              warehouseValueAvg: 0,
              winRate: 0,
              avgProfit: 0,
              totalCellsMax: 0,
              totalCellsMin: 0,
              totalCellsAvg: 0,
              totalItemsMax: 0,
              totalItemsMin: 0,
              totalItemsAvg: 0,
              legendaryMax: 0,
              legendaryMin: 0,
              legendaryAvg: 0,
              rareMax: 0,
              rareMin: 0,
              rareAvg: 0
            };
            const storedStats = data.stats || {};
            const mergedStats = { ...defaultStats, ...storedStats };
            this.aiCrossGameMemory[playerId] = {
              stats: mergedStats,
              lessons: Array.isArray(data.lessons) ? data.lessons.slice(-10) : [],
              strategies: Array.isArray(data.strategies) ? data.strategies.slice(-10) : [],
              praises: Array.isArray(data.praises) ? data.praises.slice(-10) : []
            };
          } else if (Array.isArray(data)) {
            this.aiCrossGameMemory[playerId] = {
              stats: {
                totalGames: 0,
                warehouseValueMax: 0,
                warehouseValueMin: 0,
                warehouseValueAvg: 0,
                winRate: 0,
                avgProfit: 0,
                totalCellsMax: 0,
                totalCellsMin: 0,
                totalCellsAvg: 0,
                totalItemsMax: 0,
                totalItemsMin: 0,
                totalItemsAvg: 0,
                legendaryMax: 0,
                legendaryMin: 0,
                legendaryAvg: 0,
                rareMax: 0,
                rareMin: 0,
                rareAvg: 0
              },
              lessons: [],
              strategies: [],
              praises: []
            };
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
        this.aiCrossGameMemory[playerId] = {
          stats: {
            totalGames: 0,
            warehouseValueMax: 679100,
            warehouseValueMin: 170400,
            warehouseValueAvg: 412000,
            winRate: 0,
            avgProfit: 0,
            totalCellsMax: 0,
            totalCellsMin: 0,
            totalCellsAvg: 0,
            totalItemsMax: 0,
            totalItemsMin: 0,
            totalItemsAvg: 0,
            legendaryMax: 0,
            legendaryMin: 0,
            legendaryAvg: 0,
            rareMax: 0,
            rareMin: 0,
            rareAvg: 0
          },
          lessons: [

          ],
          strategies: [

          ],
          praises: [

          ]
        };
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
      const stats = crossMemory.stats || {};
      const lessons = crossMemory.lessons || [];
      const strategies = crossMemory.strategies || [];
      const praises = crossMemory.praises || [];

      if (stats.totalGames > 0 || lessons.length > 0 || strategies.length > 0 || praises.length > 0) {
        const lines = ["【跨局经验总结】"];
        if (stats.totalGames > 0) {
          lines.push(`历史统计: 共${stats.totalGames}局, 胜率${Math.round((stats.winRate || 0) * 100)}%, 平均盈亏${Math.round(stats.avgProfit || 0)}`);
          if (stats.warehouseValueMax > 0) {
            lines.push(`仓库价值范围: ${stats.warehouseValueMin}~${stats.warehouseValueMax}, 平均${Math.round(stats.warehouseValueAvg || 0)}`);
          }
          if (stats.totalCellsMax > 0) {
            lines.push(`格数范围: ${stats.totalCellsMin}~${stats.totalCellsMax}, 平均${Math.round(stats.totalCellsAvg || 0)}`);
          }
          if (stats.totalItemsMax > 0) {
            lines.push(`藏品件数范围: ${stats.totalItemsMin}~${stats.totalItemsMax}, 平均${Math.round(stats.totalItemsAvg || 0)}`);
          }
          if (stats.legendaryMax > 0) {
            lines.push(`绝品件数范围: ${stats.legendaryMin}~${stats.legendaryMax}, 平均${(stats.legendaryAvg || 0).toFixed(1)}`);
          }
          if (stats.rareMax > 0) {
            lines.push(`珍品件数范围: ${stats.rareMin}~${stats.rareMax}, 平均${(stats.rareAvg || 0).toFixed(1)}`);
          }
        }
        if (praises.length > 0) {
          lines.push(`成功经验:`);
          praises.forEach((p, i) => lines.push(`  ${i + 1}. ${p}`));
        }
        if (strategies.length > 0) {
          lines.push(`策略建议:`);
          strategies.forEach((s, i) => lines.push(`  ${i + 1}. ${s}`));
        }
        if (lessons.length > 0) {
          lines.push(`经验教训:`);
          lessons.forEach((l, i) => lines.push(`  ${i + 1}. ${l}`));
        }
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

    exportAiMemoryToJson() {
      const data = {
        conversations: this.aiConversationByPlayer || {},
        crossGameMemory: this.aiCrossGameMemory || {},
        pendingSummary: this.pendingNextRunAiSummary || "",
        runSerial: this.runSerial || 0,
        exportedAt: Date.now(),
        version: "v1"
      };
      return JSON.stringify(data, null, 2);
    },

    importAiMemoryFromJson(jsonString) {
      try {
        const parsed = JSON.parse(jsonString);
        if (!parsed || typeof parsed !== "object") {
          return { ok: false, error: "无效的JSON格式" };
        }
        if (parsed.version && parsed.version !== "v1") {
          return { ok: false, error: "不支持的版本格式" };
        }
        if (parsed.conversations && typeof parsed.conversations === "object") {
          this.aiConversationByPlayer = {};
          Object.keys(parsed.conversations).forEach((playerId) => {
            const arr = parsed.conversations[playerId];
            if (Array.isArray(arr)) {
              const filtered = arr.filter((entry) => entry && typeof entry.round === "number");
              this.aiConversationByPlayer[playerId] = filtered.slice(-30);
            }
          });
        }
        if (parsed.crossGameMemory && typeof parsed.crossGameMemory === "object") {
          this.aiCrossGameMemory = {};
          Object.keys(parsed.crossGameMemory).forEach((playerId) => {
            const data = parsed.crossGameMemory[playerId];
            if (Array.isArray(data)) {
              this.aiCrossGameMemory[playerId] = {
                stats: {
                  totalGames: 0,
                  warehouseValueMax: 0,
                  warehouseValueMin: 0,
                  warehouseValueAvg: 0,
                  winRate: 0,
                  avgProfit: 0,
                  totalCellsMax: 0,
                  totalCellsMin: 0,
                  totalCellsAvg: 0,
                  totalItemsMax: 0,
                  totalItemsMin: 0,
                  totalItemsAvg: 0,
                  legendaryMax: 0,
                  legendaryMin: 0,
                  legendaryAvg: 0,
                  rareMax: 0,
                  rareMin: 0,
                  rareAvg: 0
                },
                lessons: [],
                strategies: [],
                praises: []
              };
            } else if (data && typeof data === "object") {
              const defaultStats = {
                totalGames: 0,
                warehouseValueMax: 0,
                warehouseValueMin: 0,
                warehouseValueAvg: 0,
                winRate: 0,
                avgProfit: 0,
                totalCellsMax: 0,
                totalCellsMin: 0,
                totalCellsAvg: 0,
                totalItemsMax: 0,
                totalItemsMin: 0,
                totalItemsAvg: 0,
                legendaryMax: 0,
                legendaryMin: 0,
                legendaryAvg: 0,
                rareMax: 0,
                rareMin: 0,
                rareAvg: 0
              };
              const storedStats = data.stats || {};
              const mergedStats = { ...defaultStats, ...storedStats };
              this.aiCrossGameMemory[playerId] = {
                stats: mergedStats,
                lessons: Array.isArray(data.lessons) ? data.lessons.slice(-10) : [],
                strategies: Array.isArray(data.strategies) ? data.strategies.slice(-10) : [],
                praises: Array.isArray(data.praises) ? data.praises.slice(-10) : []
              };
            }
          });
        }
        if (typeof parsed.pendingSummary === "string") {
          this.pendingNextRunAiSummary = parsed.pendingSummary;
        }
        if (typeof parsed.runSerial === "number" && parsed.runSerial >= 0) {
          this.runSerial = parsed.runSerial;
        }
        this.saveAiMemoryToStorage();
        return { ok: true };
      } catch (error) {
        return { ok: false, error: "JSON解析失败: " + (error.message || "未知错误") };
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
      const resultStr = `${winnerName}以${winnerBid}中标(${reasonText}),总值${totalValue},利润${winnerProfit >= 0 ? "+" : ""}${winnerProfit}`;
      const record = {
        run: this.runSerial || 0,
        winnerId,
        result: resultStr,
        warehouseValue: totalValue,
        winnerProfit,
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
        const memory = this.ensureAiCrossGameMemory(player.id);
        const colors = ["#c49a3c", "#5a9e5a", "#5a7ebd", "#bd5a7e"];
        const color = colors[idx % colors.length];
        let inner = "";

        const stats = memory.stats || {};
        const praises = memory.praises || [];
        const strategies = memory.strategies || [];
        const lessons = memory.lessons || [];

        if (stats.totalGames === 0 && praises.length === 0 && strategies.length === 0 && lessons.length === 0) {
          inner = '<div class="ai-memory-empty">暂无跨局记忆</div>';
        } else {
          inner = '<div class="ai-memory-entry">';

          if (stats.totalGames > 0) {
            inner += `<div class="ai-memory-entry-title">历史统计</div>`;
            inner += `<div class="ai-memory-field"><span class="ai-memory-label">总局数</span>${stats.totalGames}局</div>`;
            inner += `<div class="ai-memory-field"><span class="ai-memory-label">胜率</span>${Math.round((stats.winRate || 0) * 100)}%</div>`;
            inner += `<div class="ai-memory-field"><span class="ai-memory-label">平均盈亏</span>${Math.round(stats.avgProfit || 0)}</div>`;
            if (stats.warehouseValueMax > 0) {
              inner += `<div class="ai-memory-field"><span class="ai-memory-label">仓库价值</span>${stats.warehouseValueMin}~${stats.warehouseValueMax}，平均${Math.round(stats.warehouseValueAvg || 0)}</div>`;
            }
            if (stats.totalCellsMax > 0) {
              inner += `<div class="ai-memory-field"><span class="ai-memory-label">格数范围</span>${stats.totalCellsMin}~${stats.totalCellsMax}，平均${Math.round(stats.totalCellsAvg || 0)}</div>`;
            }
            if (stats.totalItemsMax > 0) {
              inner += `<div class="ai-memory-field"><span class="ai-memory-label">藏品件数</span>${stats.totalItemsMin}~${stats.totalItemsMax}，平均${Math.round(stats.totalItemsAvg || 0)}</div>`;
            }
            if (stats.legendaryMax > 0) {
              inner += `<div class="ai-memory-field"><span class="ai-memory-label">绝品件数</span>${stats.legendaryMin}~${stats.legendaryMax}，平均${(stats.legendaryAvg || 0).toFixed(1)}</div>`;
            }
            if (stats.rareMax > 0) {
              inner += `<div class="ai-memory-field"><span class="ai-memory-label">珍品件数</span>${stats.rareMin}~${stats.rareMax}，平均${(stats.rareAvg || 0).toFixed(1)}</div>`;
            }
          }

          if (praises.length > 0) {
            inner += `<div class="ai-memory-entry-title">成功经验 (${praises.length}/10)</div>`;
            praises.forEach((p, i) => {
              inner += `<div class="ai-memory-field"><span class="ai-memory-label">${i}</span>${p}</div>`;
            });
          }

          if (strategies.length > 0) {
            inner += `<div class="ai-memory-entry-title">策略建议 (${strategies.length}/10)</div>`;
            strategies.forEach((s, i) => {
              inner += `<div class="ai-memory-field"><span class="ai-memory-label">${i}</span>${s}</div>`;
            });
          }

          if (lessons.length > 0) {
            inner += `<div class="ai-memory-entry-title">经验教训 (${lessons.length}/10)</div>`;
            lessons.forEach((l, i) => {
              inner += `<div class="ai-memory-field"><span class="ai-memory-label">${i}</span>${l}</div>`;
            });
          }

          inner += "</div>";
        }

        return `<div class="ai-memory-section" style="--section-color:${color}">` +
          `<div class="ai-memory-section-header">${player.name}</div>` +
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

(function setupMobaoBattleRecordBridge(global) {
  function createBattleRecordBridge(deps) {
    const {
      BATTLE_RECORD_STORAGE_KEY,
      GRID_COLS,
      GRID_ROWS,
      clamp,
      escapeHtml,
      formatBidRevealNumber
    } = deps;

    function loadBattleRecords() {
      const raw = window.localStorage.getItem(BATTLE_RECORD_STORAGE_KEY);
      if (!raw) {
        return [];
      }

      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
          return [];
        }
        return parsed
          .filter((record) => record && typeof record === "object")
          .map((record, idx) => {
            if (record.id) {
              return record;
            }
            return {
              ...record,
              id: `legacy-rec-${idx}`
            };
          })
          .slice(0, 20);
      } catch (_error) {
        return [];
      }
    }

    function saveBattleRecords(records) {
      const list = Array.isArray(records) ? records.slice(0, 20) : [];
      window.localStorage.setItem(BATTLE_RECORD_STORAGE_KEY, JSON.stringify(list));
    }

    function formatRecordTime(iso) {
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) {
        return "未知时间";
      }
      return date.toLocaleString("zh-CN", { hour12: false });
    }

    const methods = {
      openBattleRecordPanel() {
        if (!this.dom.battleRecordOverlay) {
          return;
        }
        this.battleRecordLogView = null;
        this.renderBattleRecordPanel();
        this.dom.battleRecordOverlay.classList.remove("hidden");
      },

      closeBattleRecordPanel() {
        if (!this.dom.battleRecordOverlay) {
          return;
        }
        this.battleRecordLogView = null;
        this.dom.battleRecordOverlay.classList.add("hidden");
      },

      buildWarehouseSnapshotForRecord() {
        return this.items
          .map((item) => ({
            id: item.id,
            name: item.name,
            category: item.category,
            qualityKey: item.qualityKey,
            w: item.w,
            h: item.h,
            x: item.x,
            y: item.y,
            trueValue: item.trueValue
          }))
          .sort((a, b) => {
            if (a.y !== b.y) {
              return a.y - b.y;
            }
            if (a.x !== b.x) {
              return a.x - b.x;
            }
            return String(a.id).localeCompare(String(b.id));
          });
      },

      saveBattleRecord(result) {
        const hasLlm = typeof this.canUseLlmDecision === "function" && this.canUseLlmDecision();
        const runLog = this.currentRunLog;
        let aiDecisionPanelText = null;
        if (hasLlm && this.lastAiDecisionTelemetry && this.lastAiDecisionTelemetry.mode === "llm") {
          aiDecisionPanelText = this.buildAiDecisionPanelSnapshot(this.lastAiDecisionTelemetry);
        }
        const record = {
          id: `rec-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          finishedAt: new Date().toISOString(),
          round: this.round,
          mode: result.mode,
          winnerId: result.winnerId,
          winnerName: result.winnerName,
          winnerBid: Math.round(Number(result.winnerBid) || 0),
          totalValue: Math.round(Number(result.totalValue) || 0),
          winnerProfit: Math.round(Number(result.winnerProfit) || 0),
          playerProfit: Math.round(Number(result.playerProfit) || 0),
          playerWon: Boolean(result.playerWon),
          dividendTicketInfo: result.dividendTicketInfo || null,
          reasonText: result.reasonText || "结算",
          warehouse: {
            cols: GRID_COLS,
            rows: GRID_ROWS,
            itemCount: this.items.length,
            items: this.buildWarehouseSnapshotForRecord()
          },
          logs: hasLlm && aiDecisionPanelText
            ? {
              aiDecisionPanelText,
              runNo: runLog && Number.isFinite(Number(runLog.runNo)) ? Math.round(Number(runLog.runNo)) : null,
              aiThoughtLogs: runLog && Array.isArray(runLog.aiThoughtLogs) ? runLog.aiThoughtLogs : [],
              roundLogsByRound: runLog && runLog.roundLogsByRound ? runLog.roundLogsByRound : {},
              roundPanelTexts: runLog && runLog.roundPanelTexts ? runLog.roundPanelTexts : {}
            }
            : null,
          logsRound: this.round || 0
        };

        this.battleRecords = [record, ...(this.battleRecords || [])].slice(0, 20);
        saveBattleRecords(this.battleRecords);

        if (this.dom.battleRecordOverlay && !this.dom.battleRecordOverlay.classList.contains("hidden")) {
          this.renderBattleRecordPanel();
        }
      },

      renderBattleRecordSummary() {
        const summaryEl = document.getElementById("battleRecordSummary");
        if (!summaryEl) {
          return;
        }

        const appState = window.MobaoAppState ? window.MobaoAppState.load() : {};
        const records = Array.isArray(this.battleRecords) ? this.battleRecords : [];
        const totalGames = appState.totalGamesPlayed || 0;
        const totalWins = appState.totalWins || 0;
        const totalProfit = appState.totalProfit || 0;
        const winRate = totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : 0;

        let bestProfit = 0;
        let worstProfit = 0;
        records.forEach((r) => {
          const p = Math.round(Number(r.playerProfit != null ? r.playerProfit : r.winnerProfit) || 0);
          if (p > bestProfit) {
            bestProfit = p;
          }
          if (p < worstProfit) {
            worstProfit = p;
          }
        });

        summaryEl.innerHTML = [
          '<div class="summary-grid">',
          `<div class="summary-item"><span class="summary-value">${totalGames}</span><span class="summary-label">总局数</span></div>`,
          `<div class="summary-item"><span class="summary-value">${totalWins}</span><span class="summary-label">胜场</span></div>`,
          `<div class="summary-item"><span class="summary-value">${winRate}%</span><span class="summary-label">胜率</span></div>`,
          `<div class="summary-item"><span class="summary-value">${totalProfit >= 0 ? "+" : ""}${formatBidRevealNumber(totalProfit)}</span><span class="summary-label">累计利润</span></div>`,
          `<div class="summary-item"><span class="summary-value">${bestProfit > 0 ? "+" : ""}${formatBidRevealNumber(bestProfit)}</span><span class="summary-label">最高单局</span></div>`,
          `<div class="summary-item"><span class="summary-value">${formatBidRevealNumber(worstProfit)}</span><span class="summary-label">最低单局</span></div>`,
          '</div>'
        ].join("");
      },

      renderBattleRecordPanel() {
        if (!this.dom.battleRecordContent) {
          return;
        }

        if (this.battleRecordLogView && this.battleRecordLogView.recordId) {
          this.renderBattleRecordLogView();
          return;
        }

        this.renderBattleRecordSummary();

        const records = Array.isArray(this.battleRecords) ? this.battleRecords : [];
        if (records.length === 0) {
          this.dom.battleRecordContent.innerHTML = '<p class="battle-record-meta">暂无战绩，完成一局后会自动记录。</p>';
          return;
        }

        const html = records.map((record, idx) => {
          const timeText = formatRecordTime(record.finishedAt);
          const warehouseLines = (record.warehouse && Array.isArray(record.warehouse.items) ? record.warehouse.items : [])
            .map((item) => {
              return `${item.name} | 品类:${item.category} | 品质:${item.qualityKey} | 位置(${Number(item.x) + 1},${Number(item.y) + 1}) | 尺寸${item.w}x${item.h} | 价值${item.trueValue}`;
            })
            .join("\n");
          const hasAiDecisionPanel = record.logs && typeof record.logs.aiDecisionPanelText === "string" && record.logs.aiDecisionPanelText.length > 0;

          const playerProfit = record.playerProfit != null ? record.playerProfit : record.winnerProfit;
          const dtInfo = record.dividendTicketInfo;
          let dtText = "";
          if (dtInfo) {
            if (dtInfo.mechanism === "dividend") {
              dtText = ` | 分红+${dtInfo.dividendPerPlayer || 0}`;
            } else if (dtInfo.mechanism === "ticket") {
              dtText = ` | 门票-${dtInfo.ticketPerPlayer || 0}`;
            }
          }

          return [
            '<article class="battle-record-entry">',
            `<h4>第 ${records.length - idx} 条 | ${escapeHtml(timeText)}</h4>`,
            `<p class="battle-record-meta">拍下者：${escapeHtml(record.winnerName || "-")}（${escapeHtml(record.reasonText || "结算")}）</p>`,
            `<p class="battle-record-meta">成交价：${formatBidRevealNumber(record.winnerBid)} | 仓库总值：${formatBidRevealNumber(record.totalValue)} | 拍下者利润：${record.winnerProfit >= 0 ? "+" : ""}${formatBidRevealNumber(record.winnerProfit)}</p>`,
            `<p class="battle-record-meta">自身利润：${playerProfit >= 0 ? "+" : ""}${formatBidRevealNumber(playerProfit)}${dtText}</p>`,
            `<p class="battle-record-meta">回合：${record.round} | 藏品数：${record.warehouse && record.warehouse.itemCount ? record.warehouse.itemCount : 0}</p>`,
            `<div class="battle-record-actions">`,
            `<button class="battle-record-replay-btn" type="button" data-record-id="${escapeHtml(record.id || "")}">复现该局结算页</button>`,
            hasAiDecisionPanel ? `<button class="battle-record-log-btn" type="button" data-record-log-id="${escapeHtml(record.id || "")}">查看AI决策日志</button>` : "",
            `<button class="battle-record-delete-btn" type="button" data-delete-record-id="${escapeHtml(record.id || "")}">删除</button>`,
            `</div>`,
            `<details><summary>查看该局真实仓库（揭晓后）</summary><pre class="battle-record-warehouse">${escapeHtml(warehouseLines || "无数据")}</pre></details>`,
            '</article>'
          ].join("");
        }).join("");

        this.dom.battleRecordContent.innerHTML = html;
      },

      openBattleRecordLogs(recordId, page = 1) {
        const records = Array.isArray(this.battleRecords) ? this.battleRecords : [];
        const record = records.find((entry) => entry && entry.id === recordId);
        if (!record) {
          this.writeLog("未找到该条战绩日志。请刷新后重试。");
          return;
        }

        this.battleRecordLogView = {
          recordId,
          page: Math.max(1, Math.round(Number(page) || 1))
        };
        this.renderBattleRecordLogView();
      },

      closeBattleRecordLogs() {
        this.battleRecordLogView = null;
        this.renderBattleRecordPanel();
      },

      renderBattleRecordLogView() {
        if (!this.dom.battleRecordContent || !this.battleRecordLogView || !this.battleRecordLogView.recordId) {
          return;
        }

        const records = Array.isArray(this.battleRecords) ? this.battleRecords : [];
        const record = records.find((entry) => entry && entry.id === this.battleRecordLogView.recordId);
        if (!record) {
          this.battleRecordLogView = null;
          this.renderBattleRecordPanel();
          return;
        }

        const panelText = record && record.logs && typeof record.logs.aiDecisionPanelText === "string"
          ? record.logs.aiDecisionPanelText
          : "";

        if (!panelText) {
          const winnerName = record.winnerName || "未知玩家";
          const html = [
            '<article class="battle-record-log-view">',
            '<div class="battle-record-log-head">',
            `<h4>${escapeHtml(winnerName)} | ${escapeHtml(formatRecordTime(record.finishedAt))}</h4>`,
            '<button class="battle-record-log-close-btn" type="button" data-log-close="1" aria-label="关闭日志页">×</button>',
            '</div>',
            `<p class="battle-record-meta">该局无AI决策日志（未使用大模型AI）。</p>`,
            '</article>'
          ].join("");
          this.dom.battleRecordContent.innerHTML = html;
          return;
        }

        const winnerName = record.winnerName || "未知玩家";
        const runNo = record.logs && Number.isFinite(Number(record.logs.runNo))
          ? Math.round(Number(record.logs.runNo))
          : null;
        const aiThoughtLogs = record.logs && Array.isArray(record.logs.aiThoughtLogs)
          ? record.logs.aiThoughtLogs
          : [];
        const roundLogsByRound = record.logs && record.logs.roundLogsByRound
          ? record.logs.roundLogsByRound
          : {};
        const roundPanelTexts = record.logs && record.logs.roundPanelTexts
          ? record.logs.roundPanelTexts
          : {};

        const roundSet = new Set();
        aiThoughtLogs.forEach((e) => { if (e.round) roundSet.add(e.round); });
        Object.keys(roundLogsByRound).forEach((k) => { const n = Number(k); if (Number.isFinite(n) && n > 0) roundSet.add(n); });
        Object.keys(roundPanelTexts).forEach((k) => { const n = Number(k); if (Number.isFinite(n) && n > 0) roundSet.add(n); });
        const allRounds = Array.from(roundSet).sort((a, b) => a - b);
        const maxRound = allRounds.length > 0 ? allRounds[allRounds.length - 1] : 0;

        const currentPage = Math.max(1, Math.min(
          Math.round(Number(this.battleRecordLogView.page) || 1),
          maxRound > 0 ? maxRound : 1
        ));

        let bodyContent = "";
        if (maxRound > 0) {
          const roundPanelText = roundPanelTexts[String(currentPage)];
          const roundThoughts = aiThoughtLogs.filter((e) => e.round === currentPage);
          const roundActionLogs = roundLogsByRound[String(currentPage)] || [];

          const lines = [];
          lines.push(`═══ 第 ${currentPage} 轮 / 共 ${maxRound} 轮 ═══`);
          lines.push("");

          if (roundPanelText) {
            lines.push("──── 完整AI决策详情 ────");
            roundPanelText.split("\n").forEach((line) => lines.push(line));
            lines.push("");
          } else if (panelText && Object.keys(roundPanelTexts).length === 0) {
            const isLegacy = currentPage === 1 ? "（该局在旧版本中运行，此为最终轮快照）" : "";
            lines.push(`──── 完整AI决策详情 ${isLegacy}────`.trim());
            panelText.split("\n").forEach((line) => lines.push(line));
            lines.push("");
          }

          if (roundThoughts.length > 0) {
            lines.push("──── AI决策摘要 ────");
            roundThoughts.forEach((entry) => {
              const isLlm = entry.controlMode === "llm";
              lines.push(`【${entry.playerName || "AI"}】| ${isLlm ? "大模型" : "规则AI"} | 出价: ${formatBidRevealNumber(entry.finalBid)} | 来源: ${entry.decisionSource || "?"}`);
              if (entry.llmActionName) {
                lines.push(`  动作: ${entry.llmActionName}${entry.actionExecuted ? "（已执行）" : "（未执行）"}${entry.ruleActionName ? ` | 规则动作: ${entry.ruleActionName}` : ""}`);
              }
              if (entry.error) {
                lines.push(`  错误: ${entry.error}`);
              }
              if (entry.thought) {
                entry.thought.split("\n").forEach((line) => lines.push(`  ${line}`));
              }
              lines.push("");
            });
          }

          if (roundActionLogs.length > 0) {
            lines.push("──── 行动日志 ────");
            roundActionLogs.forEach((line) => lines.push(`  ${line}`));
          }

          bodyContent = lines.join("\n");
        } else {
          bodyContent = panelText;
        }

        const paginationHtml = maxRound > 1
          ? `<div class="battle-record-log-pagination">
              <button class="battle-record-log-page-btn" type="button" data-log-prev="1"${currentPage <= 1 ? " disabled" : ""}>◀ 上一轮</button>
              <span class="battle-record-log-page-info">第 ${currentPage} 轮 / 共 ${maxRound} 轮</span>
              <button class="battle-record-log-page-btn" type="button" data-log-next="1"${currentPage >= maxRound ? " disabled" : ""}>下一轮 ▶</button>
            </div>`
          : "";

        const html = [
          '<article class="battle-record-log-view">',
          '<div class="battle-record-log-head">',
          `<h4>${escapeHtml(winnerName)} | ${escapeHtml(formatRecordTime(record.finishedAt))}${runNo ? ` | 第 ${runNo} 局` : ""}</h4>`,
          '<button class="battle-record-log-close-btn" type="button" data-log-close="1" aria-label="关闭日志页">×</button>',
          '</div>',
          `<p class="battle-record-meta">成交价：${formatBidRevealNumber(record.winnerBid)} | 仓库总值：${formatBidRevealNumber(record.totalValue)} | 拍下者利润：${record.winnerProfit >= 0 ? "+" : ""}${formatBidRevealNumber(record.winnerProfit)}</p>`,
          (() => {
            const pp = record.playerProfit != null ? record.playerProfit : record.winnerProfit;
            const dt = record.dividendTicketInfo;
            let dtSuffix = "";
            if (dt) {
              if (dt.mechanism === "dividend") dtSuffix = `（分红+${dt.dividendPerPlayer || 0}）`;
              else if (dt.mechanism === "ticket") dtSuffix = `（门票-${dt.ticketPerPlayer || 0}）`;
            }
            return `<p class="battle-record-meta">自身利润：${pp >= 0 ? "+" : ""}${formatBidRevealNumber(pp)}${dtSuffix}</p>`;
          })(),
          paginationHtml,
          `<pre class="battle-record-log-body">${escapeHtml(bodyContent)}</pre>`,
          paginationHtml,
          '</article>'
        ].join("");

        this.dom.battleRecordContent.innerHTML = html;
      },

      openBattleRecordReplay(recordId) {
        const records = Array.isArray(this.battleRecords) ? this.battleRecords : [];
        const record = records.find((entry) => entry && entry.id === recordId);
        if (!record) {
          this.writeLog("未找到该条战绩，可能已被清理。请刷新后重试。");
          return;
        }

        const replayItems = record.warehouse && Array.isArray(record.warehouse.items)
          ? record.warehouse.items
          : [];
        if (replayItems.length === 0) {
          this.writeLog("该条战绩缺少仓库快照，暂时无法复现结算页。");
          return;
        }

        this.battleRecordReplayActive = true;
        this.battleRecordReplayRecordId = record.id;
        this.isSettlementRevealMode = true;
        this.closeBattleRecordPanel();
        this.stopRoundTimer();
        this.roundResolving = false;
        this.roundPaused = false;
        this.playerBidSubmitted = true;
        this.settled = true;

        this.restoreWarehouseFromBattleRecord(record);

        const replayWinner = {
          id: record.winnerId || "record-replay-winner",
          name: record.winnerName || "未知玩家"
        };
        const winnerBid = Math.max(0, Math.round(Number(record.winnerBid) || 0));
        const totalValue = Math.max(0, Math.round(Number(record.totalValue) || 0));
        const winnerProfit = Math.round(Number(record.winnerProfit) || (totalValue - winnerBid));
        const reasonText = record.reasonText || "结算";

        this.enterSettlementPage(replayWinner, winnerBid, `${reasonText} · 战绩回放`);
        this.updateSettlementPanelMetrics(totalValue, winnerProfit);

        const replayPlayerProfit = record.playerProfit != null ? record.playerProfit : winnerProfit;
        const replayDtInfo = record.dividendTicketInfo;
        const humanPlayer = this.players ? this.players.find((p) => p.isSelf) : null;
        if (humanPlayer && replayWinner.id !== humanPlayer.id) {
          let replaySelfLabel = "自身利润";
          if (replayDtInfo) {
            if (replayDtInfo.mechanism === "dividend") {
              replaySelfLabel = "自身利润（分红）";
            } else if (replayDtInfo.mechanism === "ticket") {
              replaySelfLabel = "自身利润（门票）";
            }
          }
          this.showSelfProfit(replayPlayerProfit, replaySelfLabel);
        }

        this.setSettlementProgress(`战绩回放：${replayWinner.name} 利润 ${winnerProfit >= 0 ? "+" : ""}${winnerProfit}`);
        this.writeLog(`已加载战绩回放：${replayWinner.name} 以 ${winnerBid} 拿下整仓。`);
        this.updateHud();
      },

      deleteBattleRecord(recordId) {
        const records = Array.isArray(this.battleRecords) ? this.battleRecords : [];
        const record = records.find((entry) => entry && entry.id === recordId);
        if (!record) {
          this.writeLog("未找到可删除的战绩。");
          return;
        }

        const label = `${record.winnerName || "未知玩家"} / ${formatBidRevealNumber(record.winnerBid)} / ${formatRecordTime(record.finishedAt)}`;
        const confirmed = window.confirm(`确定删除这条战绩吗？\n${label}`);
        if (!confirmed) {
          return;
        }

        this.battleRecords = records.filter((entry) => entry && entry.id !== recordId).slice(0, 20);
        saveBattleRecords(this.battleRecords);

        if (this.battleRecordReplayRecordId === recordId) {
          this.battleRecordReplayActive = false;
          this.battleRecordReplayRecordId = null;
          this.exitSettlementPage();
        }

        if (this.dom.battleRecordOverlay && !this.dom.battleRecordOverlay.classList.contains("hidden")) {
          this.renderBattleRecordPanel();
        }

        this.writeLog("战绩已删除。");
      },

      restoreWarehouseFromBattleRecord(record) {
        this.drawUnknownWarehouse();

        if (this.itemLayer) {
          this.itemLayer.destroy(true);
        }
        this.itemLayer = this.add.container(0, 0);
        this.items = [];
        this.warehouseTrueValue = 0;

        const qualityConfig = (window.ArtifactData && window.ArtifactData.QUALITY_CONFIG)
          ? window.ArtifactData.QUALITY_CONFIG
          : {};
        const snapshotItems = record && record.warehouse && Array.isArray(record.warehouse.items)
          ? record.warehouse.items
          : [];

        snapshotItems.forEach((saved, idx) => {
          const qualityKey = saved.qualityKey && qualityConfig[saved.qualityKey] ? saved.qualityKey : "normal";
          const quality = qualityConfig[qualityKey] || { label: "良品", color: 0x2f78ff, glow: 0x9ec0ff };
          const safeW = clamp(Math.max(1, Math.round(Number(saved.w) || 1)), 1, GRID_COLS);
          const safeH = clamp(Math.max(1, Math.round(Number(saved.h) || 1)), 1, GRID_ROWS);
          const maxX = Math.max(0, GRID_COLS - safeW);
          const maxY = Math.max(0, GRID_ROWS - safeH);
          const safeX = clamp(Math.max(0, Math.round(Number(saved.x) || 0)), 0, maxX);
          const safeY = clamp(Math.max(0, Math.round(Number(saved.y) || 0)), 0, maxY);
          const trueValue = Math.max(0, Math.round(Number(saved.trueValue) || 0));

          const item = {
            id: String(saved.id || `record-item-${idx}`),
            key: "record-snapshot",
            category: saved.category || "未知",
            name: saved.name || `藏品${idx + 1}`,
            basePrice: trueValue,
            trueValue,
            qualityKey,
            quality,
            w: safeW,
            h: safeH,
            x: safeX,
            y: safeY,
            revealed: {
              outline: false,
              qualityCell: null,
              exact: true,
              settlementPreRevealed: true
            }
          };

          this.renderItem(item);
          this.revealOutline(item, { settlementShowName: true });
          item.revealed.qualityCell = { x: item.x, y: item.y };
          item.revealed.exact = true;
          this.renderQualityVisual(item, { showName: true });
          this.items.push(item);
          this.warehouseTrueValue += item.trueValue;
        });

        this.rebuildWarehouseCellIndex();
      }
    };

    return {
      methods,
      loadBattleRecords,
      saveBattleRecords,
      formatRecordTime
    };
  }

  global.MobaoBattleRecordBridge = {
    createBattleRecordBridge
  };
})(window);

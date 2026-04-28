(function setupMobaoSettlementBridge(global) {
  function createSettlementBridge(deps) {
    const {
      MARGIN,
      CELL_SIZE,
      delay,
      tweenToPromise,
      settlementRevealDelayByQuality,
      settlementSearchDurationByQuality
    } = deps;

    const methods = {
      isSettlementPageActive() {
        return document.body.classList.contains("settlement-mode");
      },

      async revealAllArtifactsForSettlement() {
        const runToken = Date.now() + Math.random();
        this.settlementRunToken = runToken;
        this.settlementRevealRunning = true;
        this.settlementRevealSkipRequested = false;
        this.isSettlementRevealMode = true;
        this.hideRevealScrollHints();

        this.items.forEach((item) => {
          // 仅“完全揭露”藏品跳过结算揭示；已知品质仍需在结算环节继续揭示。
          item.revealed.settlementPreRevealed = Boolean(item.revealed.exact);
        });

        const totalCount = this.items.length;
        let revealedCount = this.items.filter((item) => item.revealed.settlementPreRevealed).length;
        let revealedValue = this.items
          .filter((item) => item.revealed.settlementPreRevealed)
          .reduce((sum, item) => sum + item.trueValue, 0);

        this.updateSettlementPanelMetrics(revealedValue, revealedValue - this.settlementSession.winnerBid);
        this.setSettlementProgress(`正在揭示藏品 ${revealedCount}/${totalCount}，点击游戏区可跳过。`);

        this.items.forEach((item) => {
          if (!item.revealed.outline) {
            this.revealOutline(item, { settlementShowName: false });
          }
        });

        const orderedItems = [...this.items].sort((a, b) => {
          if (a.y !== b.y) {
            return a.y - b.y;
          }
          if (a.x !== b.x) {
            return a.x - b.x;
          }
          return a.id.localeCompare(b.id);
        });

        const revealQueue = orderedItems.filter((item) => !item.revealed.settlementPreRevealed);

        for (let i = 0; i < revealQueue.length; i += 1) {
          if (runToken !== this.settlementRunToken) {
            return;
          }

          const item = revealQueue[i];

          if (this.settlementRevealSkipRequested) {
            for (let j = i; j < revealQueue.length; j += 1) {
              const rest = revealQueue[j];
              if (!rest.revealed.qualityCell) {
                this.revealQualityCell(rest, { showName: true });
              } else {
                this.renderQualityVisual(rest, { showName: true });
              }
            }
            revealedValue = this.warehouseTrueValue;
            this.updateSettlementPanelMetrics(revealedValue, revealedValue - this.settlementSession.winnerBid);
            this.setSettlementProgress(`已快速揭示全部藏品 ${totalCount}/${totalCount}`);
            break;
          }

          await this.playSettlementSearchEffect(item, runToken);

          if (runToken !== this.settlementRunToken) {
            return;
          }

          if (!item.revealed.qualityCell) {
            this.revealQualityCell(item, { showName: true });
          } else {
            this.renderQualityVisual(item, { showName: true });
          }

          revealedValue += item.trueValue;
          revealedCount += 1;
          this.updateSettlementPanelMetrics(revealedValue, revealedValue - this.settlementSession.winnerBid);
          this.setSettlementProgress(`正在揭示藏品 ${revealedCount}/${totalCount}：${item.name}`);
          await this.playSettlementRevealStep(item);
        }

        if (runToken !== this.settlementRunToken) {
          return;
        }

        this.settlementRevealRunning = false;
        this.settlementRevealSkipRequested = false;
        this.isSettlementRevealMode = false;
      },

      async playSettlementRevealStep(item) {
        const duration = settlementRevealDelayByQuality(item.qualityKey);
        if (!item.view) {
          await delay(duration);
          return;
        }

        await tweenToPromise(this, [item.view.silhouette, item.view.border], {
          alpha: { from: 0.35, to: 1 },
          duration,
          ease: "Sine.easeInOut"
        });
      },

      async playSettlementSearchEffect(item, runToken) {
        if (!item.view) {
          return;
        }

        const duration = settlementSearchDurationByQuality(item.qualityKey);
        const centerX = MARGIN + item.x * CELL_SIZE + (item.w * CELL_SIZE) / 2;
        const centerY = MARGIN + item.y * CELL_SIZE + (item.h * CELL_SIZE) / 2;
        const radius = item.qualityKey === "legendary" ? 20 : item.qualityKey === "rare" ? 17 : 14;
        if (this.activeSettlementSpinner) {
          this.activeSettlementSpinner.destroy();
          this.activeSettlementSpinner = null;
        }
        const spinner = this.add.arc(centerX, centerY, radius, 0, 280, false, 0xffe8b8, 0);
        spinner.setStrokeStyle(2, 0xffe8b8, 0.95);
        spinner.setDepth(40);
        this.activeSettlementSpinner = spinner;

        await tweenToPromise(this, spinner, {
          angle: { from: 0, to: 360 },
          duration,
          ease: "Linear"
        });

        if (runToken !== this.settlementRunToken) {
          if (!spinner.destroyed) {
            spinner.destroy();
          }
          return;
        }

        spinner.destroy();
        this.activeSettlementSpinner = null;
      },

      enterSettlementPage(winnerPlayer, winnerBid, reasonText) {
        this.settlementSession = {
          winnerId: winnerPlayer.id,
          winnerName: winnerPlayer.name,
          winnerBid,
          reasonText
        };

        document.body.classList.add("settlement-mode");
        this.dom.settlementPage.classList.remove("hidden");
        this.dom.settleWinnerName.textContent = `${winnerPlayer.name}（${reasonText}）`;
        this.dom.settleWinnerBid.textContent = String(winnerBid);
        if (this.dom.settleBackBtn) {
          const label = this.battleRecordReplayActive ? "返回战绩列表" : (this.isLanMode ? "返回房间" : "返回大厅");
          this.dom.settleBackBtn.textContent = label;
        }
        if (this.dom.settleSelfProfitRow) {
          this.dom.settleSelfProfitRow.classList.add("hidden");
        }
        this.updateSettlementPanelMetrics(0, -winnerBid);
        this.setSettlementProgress("准备揭示藏品...");
        this.hidePreview();
        this.closeBidKeypad();
        this.closeItemDrawer();
      },

      exitSettlementPage() {
        this.cancelSettlementReveal();
        document.body.classList.remove("settlement-mode");
        this.dom.settlementPage.classList.add("hidden");
        this.settlementSession = null;
        this.hidePreview();
      },

      cancelSettlementReveal() {
        this.settlementRunToken = 0;
        this.isSettlementRevealMode = false;
        this.settlementRevealRunning = false;
        this.settlementRevealSkipRequested = false;
        if (this.activeSettlementSpinner) {
          this.activeSettlementSpinner.destroy();
          this.activeSettlementSpinner = null;
        }
      },

      setSettlementProgress(text) {
        this.dom.settleProgressText.textContent = text;
      },

      updateSettlementPanelMetrics(revealedValue, winnerProfit) {
        this.dom.settleRevealedValue.textContent = String(revealedValue);
        this.dom.settleWinnerProfit.textContent = `${winnerProfit >= 0 ? "+" : ""}${winnerProfit}`;
        this.dom.settleWinnerProfit.classList.remove("profit-positive", "profit-negative", "profit-neutral");
        if (winnerProfit > 0) {
          this.dom.settleWinnerProfit.classList.add("profit-positive");
        } else if (winnerProfit < 0) {
          this.dom.settleWinnerProfit.classList.add("profit-negative");
        } else {
          this.dom.settleWinnerProfit.classList.add("profit-neutral");
        }
      },

      showSelfProfit(selfProfit, label) {
        if (!this.dom.settleSelfProfitRow || !this.dom.settleSelfProfit) {
          return;
        }
        this.dom.settleSelfProfitRow.classList.remove("hidden");
        const displayLabel = label || "自身利润";
        this.dom.settleSelfProfitRow.querySelector("span").textContent = displayLabel;
        this.dom.settleSelfProfit.textContent = `${selfProfit >= 0 ? "+" : ""}${selfProfit}`;
        this.dom.settleSelfProfit.classList.remove("profit-positive", "profit-negative", "profit-neutral");
        if (selfProfit > 0) {
          this.dom.settleSelfProfit.classList.add("profit-positive");
        } else if (selfProfit < 0) {
          this.dom.settleSelfProfit.classList.add("profit-negative");
        } else {
          this.dom.settleSelfProfit.classList.add("profit-neutral");
        }
      }
    };

    return { methods };
  }

  global.MobaoSettlementBridge = {
    createSettlementBridge
  };
})(window);

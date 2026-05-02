(function setupMobaoUiPanels(global) {
  const { escapeHtml } = global.MobaoUtils;

  const UiPanelsMixin = {
    addPrivateIntelEntry(entry) {
      this.privateIntelEntries.push({
        source: entry.source || "未知",
        text: entry.text || "",
        round: this.round
      });
    },

    addPublicInfoEntry(entry) {
      this.publicInfoEntries.push({
        source: entry.source || "未知",
        text: entry.text || "",
        round: this.round
      });
      if (this.isLanMode && this.lanIsHost && this.lanBridge) {
        this.lanBridge.send({
          type: "lan:public-info",
          source: entry.source || "未知",
          text: entry.text || "",
          round: this.round,
        });
      }
    },

    renderPrivateIntelPanel() {
      const container = this.dom.personalPanelScroll;
      if (!container) {
        return;
      }
      if (this.privateIntelEntries.length === 0) {
        container.innerHTML = '<div class="side-line intel-empty">暂无私有情报</div>';
        return;
      }
      container.innerHTML = this.privateIntelEntries
        .map((entry) => `<div class="side-line intel-entry"><span class="intel-source">${escapeHtml(entry.source)}：</span>${escapeHtml(entry.text)}</div>`)
        .join("");
      container.scrollTop = container.scrollHeight;
    },

    renderPublicInfoPanel() {
      const container = this.dom.publicInfoScroll;
      if (!container) {
        return;
      }

      if (this.publicInfoEntries.length === 0) {
        container.innerHTML = '<div class="public-line intel-empty">暂无公共信息</div>';
        return;
      }

      container.innerHTML = this.publicInfoEntries
        .map((entry) => `<div class="public-line public-event"><span class="intel-source">[${escapeHtml(entry.source)}]</span> ${escapeHtml(entry.text)}</div>`)
        .join("");
      container.scrollTop = container.scrollHeight;
    },

    updateSidePanels(skillState, itemState, clueCount, occupiedCells, capacity, bidState) {
      this.renderPrivateIntelPanel();
      this.renderPublicInfoPanel();
    }
  };

  global.MobaoUi = global.MobaoUi || {};
  global.MobaoUi.PanelsMixin = UiPanelsMixin;
})(window);

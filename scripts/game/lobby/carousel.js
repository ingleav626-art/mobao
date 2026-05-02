(function setupMobaoLobbyCarousel(global) {
  const LobbyCarouselMixin = {
    renderCarousel() {
      const track = document.getElementById("carouselTrack");
      if (!track || !window.MobaoMapProfiles) {
        return;
      }

      const profiles = window.MobaoMapProfiles.getAllProfiles();
      const selectedId = window.MobaoMapProfiles.getSelectedProfileId();

      track.innerHTML = profiles.map((p) => {
        const isSelected = p.id === selectedId;
        return [
          '<div class="lobby-map-card' + (isSelected ? ' selected' : '') + '" data-map-id="' + p.id + '">',
          '<span class="lobby-map-card-icon">' + p.icon + '</span>',
          '<span class="lobby-map-card-name">' + p.name + '</span>',
          '<span class="lobby-map-card-desc">' + p.desc + '</span>',
          '</div>'
        ].join("");
      }).join("");

      track.querySelectorAll(".lobby-map-card").forEach((card) => {
        card.addEventListener("click", () => {
          const id = card.getAttribute("data-map-id");
          window.MobaoMapProfiles.setSelectedProfileId(id);
          track.querySelectorAll(".lobby-map-card").forEach((c) => c.classList.remove("selected"));
          card.classList.add("selected");
          this.renderMapDetail();
        });
      });

      this._carouselOffset = 0;
      this.updateCarouselPosition();
      this.bindCarouselTouch();
    },

    bindCarouselTouch() {
      const wrap = document.querySelector(".carousel-track-wrap");
      if (!wrap || wrap._touchBound) return;
      wrap._touchBound = true;

      let startX = 0;
      let startY = 0;
      let dragging = false;

      wrap.addEventListener("touchstart", (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        dragging = true;
      }, { passive: true });

      wrap.addEventListener("touchend", (e) => {
        if (!dragging) return;
        dragging = false;
        const dx = e.changedTouches[0].clientX - startX;
        const dy = e.changedTouches[0].clientY - startY;
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 30) {
          this.carouselScroll(dx < 0 ? 1 : -1);
        }
      }, { passive: true });
    },

    carouselScroll(direction) {
      const track = document.getElementById("carouselTrack");
      if (!track) return;
      const cards = track.querySelectorAll(".lobby-map-card");
      const maxOffset = Math.max(0, cards.length - 3);
      this._carouselOffset = Math.max(0, Math.min(maxOffset, this._carouselOffset + direction));
      this.updateCarouselPosition();
    },

    updateCarouselPosition() {
      const track = document.getElementById("carouselTrack");
      const leftBtn = document.getElementById("carouselLeftBtn");
      const rightBtn = document.getElementById("carouselRightBtn");
      if (!track) return;

      const cardWidth = 174;
      track.style.transform = 'translateX(' + (-this._carouselOffset * cardWidth) + 'px)';

      const cards = track.querySelectorAll(".lobby-map-card");
      const maxOffset = Math.max(0, cards.length - 3);
      if (leftBtn) leftBtn.disabled = this._carouselOffset <= 0;
      if (rightBtn) rightBtn.disabled = this._carouselOffset >= maxOffset;
    },

    renderMapDetail() {
      const detail = document.getElementById("lobbyMapDetail");
      if (!detail || !window.MobaoMapProfiles) return;

      const profile = window.MobaoMapProfiles.getProfile(
        window.MobaoMapProfiles.getSelectedProfileId()
      );
      if (!profile) return;

      const p = profile.params;
      const qualityLabels = { poor: "粗品", normal: "良品", fine: "精品", rare: "珍品", legendary: "绝品" };
      const toLevel = (v, thresholds) => {
        for (let i = 0; i < thresholds.length; i++) {
          if (v < thresholds[i][0]) return thresholds[i][1];
        }
        return thresholds[thresholds.length - 1][1];
      };
      const totalQ = Object.values(p.qualityWeights || {}).reduce((s, v) => s + v, 0) || 1;
      const highQ = ((p.qualityWeights.fine || 0) + (p.qualityWeights.rare || 0) + (p.qualityWeights.legendary || 0)) / totalQ;
      const lowQ = (p.qualityWeights.poor || 0) / totalQ;
      const takeRatio = p.directTakeRatio || 0.2;
      const rounds = p.maxRounds || 5;

      const qualityLevel = toLevel(highQ, [[0.2, "低"], [0.35, "较低"], [0.5, "中"], [0.65, "较高"], [1, "高"]]);
      const lowLevel = toLevel(lowQ, [[0.15, "低"], [0.25, "较低"], [0.35, "中"], [0.45, "较高"], [1, "高"]]);
      const takeLevel = toLevel(takeRatio, [[0.12, "低"], [0.18, "较低"], [0.25, "中"], [0.35, "较高"], [1, "高"]]);
      const roundLevel = toLevel(rounds, [[4, "少"], [5, "中"], [7, "多"]]);

      const qualityLines = Object.entries(p.qualityWeights || {}).map(([k, v]) => {
        const pct = Math.round((v / totalQ) * 100);
        const lv = toLevel(pct, [[8, "低"], [16, "较低"], [26, "中"], [36, "较高"], [100, "高"]]);
        return '<div class="lobby-map-detail-row"><span class="lobby-map-detail-label">' + (qualityLabels[k] || k) + '</span><span class="lobby-map-detail-value">' + lv + '</span></div>';
      }).join("");

      detail.innerHTML = [
        '<div class="lobby-map-detail-title">' + profile.icon + ' ' + profile.name + '</div>',
        '<div class="lobby-map-detail-row"><span class="lobby-map-detail-label">回合数</span><span class="lobby-map-detail-value">' + roundLevel + '</span></div>',
        '<div class="lobby-map-detail-row"><span class="lobby-map-detail-label">直接拿下</span><span class="lobby-map-detail-value">' + takeLevel + '</span></div>',
        '<div class="lobby-map-detail-row"><span class="lobby-map-detail-label">高品质占比</span><span class="lobby-map-detail-value">' + qualityLevel + '</span></div>',
        '<div class="lobby-map-detail-row"><span class="lobby-map-detail-label">低品质占比</span><span class="lobby-map-detail-value">' + lowLevel + '</span></div>',
        qualityLines,
        '<div class="lobby-map-detail-hint" id="mapDetailHint">↓ 向下滑动查看更多</div>'
      ].join("");

      const hint = document.getElementById("mapDetailHint");
      if (hint) {
        const checkScroll = () => {
          const atBottom = detail.scrollHeight - detail.scrollTop <= detail.clientHeight + 4;
          hint.style.display = atBottom ? "none" : "";
        };
        detail.removeEventListener("scroll", detail._mapDetailScrollHandler);
        detail._mapDetailScrollHandler = checkScroll;
        detail.addEventListener("scroll", checkScroll);
        requestAnimationFrame(checkScroll);
      }
    }
  };

  global.MobaoLobby = global.MobaoLobby || {};
  global.MobaoLobby.CarouselMixin = LobbyCarouselMixin;
})(window);

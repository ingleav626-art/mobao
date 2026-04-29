(function setupMobaoWarehouse(global) {
  const {
    GRID_COLS,
    GRID_ROWS,
    CELL_SIZE,
    MARGIN,
    CANVAS_NATIVE_HEIGHT,
    MAX_WAREHOUSE_CELLS,
    ARTIFACT_COUNT_RANGE,
    WAREHOUSE_OCCUPANCY_RATIO_RANGE
  } = global.MobaoConstants;

  const { shuffle, clamp, toCellKey, rgbHex, qualityPulseDuration } = global.MobaoUtils;

  const { toSizeTag } = global.ArtifactData;

  const WarehouseCoreMixin = {
    drawUnknownWarehouse() {
      if (this.gridLayer) {
        this.gridLayer.destroy();
      }
      if (this.revealCellLayer) {
        this.revealCellLayer.destroy();
      }

      this.gridLayer = this.add.graphics();
      this.gridLayer.fillStyle(0x403325, 0.95);
      this.gridLayer.fillRect(MARGIN, MARGIN, GRID_COLS * CELL_SIZE, GRID_ROWS * CELL_SIZE);
      this.gridLayer.lineStyle(2, 0x9f8a6a, 0.85);
      this.gridLayer.strokeRect(MARGIN, MARGIN, GRID_COLS * CELL_SIZE, GRID_ROWS * CELL_SIZE);

      if (this.areaTitleText) {
        this.areaTitleText.destroy();
      }

      this.areaTitleText = this.add
        .text(MARGIN, 2, "未知仓库区域（点击已获线索的藏品可预览候选）", {
          fontSize: "15px",
          color: "#f4dec0"
        })
        .setOrigin(0, 0);

      this.revealCellLayer = this.add.graphics();
      this.revealedCells = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(false));
    },

    guardWarehouseCapacity() {
      const capacity = GRID_COLS * GRID_ROWS;
      if (capacity > MAX_WAREHOUSE_CELLS) {
        throw new Error(`仓库容量超上限：${capacity} > ${MAX_WAREHOUSE_CELLS}，请调整 GRID_COLS / GRID_ROWS / CELL_SIZE。`);
      }
    },

    spawnRandomItems() {
      if (this.itemLayer) {
        this.itemLayer.destroy(true);
      }

      this.itemLayer = this.add.container(0, 0);
      this.items = [];

      const occupancy = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(false));
      const capacity = GRID_COLS * GRID_ROWS;
      const targetOccupiedCells = Math.round(
        capacity * Phaser.Math.FloatBetween(WAREHOUSE_OCCUPANCY_RATIO_RANGE.min, WAREHOUSE_OCCUPANCY_RATIO_RANGE.max)
      );
      let occupiedCellsCount = 0;
      const desiredCount = Phaser.Math.Between(ARTIFACT_COUNT_RANGE.min, ARTIFACT_COUNT_RANGE.max);

      let attempts = 0;
      while (this.items.length < desiredCount && attempts < 520 && occupiedCellsCount < targetOccupiedCells) {
        attempts += 1;
        const slot = this.findFirstEmptySlot(occupancy);
        if (!slot) {
          break;
        }

        const item = this.artifactManager.createRandomArtifactForSlot({
          col: slot.col,
          row: slot.row,
          gridCols: GRID_COLS,
          gridRows: GRID_ROWS,
          occupancy,
          categoryWeights: this._mapCategoryWeights || undefined,
          qualityWeights: this._mapQualityWeights || undefined
        });

        if (!item) {
          occupancy[slot.row][slot.col] = true;
          continue;
        }

        item.revealed = {
          outline: false,
          qualityCell: null,
          exact: false
        };
        item.trueValue = item.basePrice;

        this.placeItem(item, slot, occupancy);
        this.renderItem(item);
        this.items.push(item);
        occupiedCellsCount += item.w * item.h;
      }
    },

    setupWarehouseAuction() {
      this.warehouseTrueValue = this.items.reduce((sum, item) => sum + item.trueValue, 0);
      const aiRatio = Phaser.Math.FloatBetween(0.9, 1.12);
      this.aiMaxBid = Math.round(this.warehouseTrueValue * aiRatio);
      this.currentBid = Math.max(1000, Math.round(this.warehouseTrueValue * 0.18 / 100) * 100);
      this.dom.bidInput.value = this.round <= 1 ? "" : "0";
      this.dom.bidInput.placeholder = this.round <= 1 ? "点击出价" : "";
    },

    findFirstEmptySlot(occupancy) {
      for (let row = 0; row < GRID_ROWS; row += 1) {
        for (let col = 0; col < GRID_COLS; col += 1) {
          if (!occupancy[row][col]) {
            return { col, row };
          }
        }
      }
      return null;
    },

    placeItem(item, slot, occupancy) {
      item.x = slot.col;
      item.y = slot.row;

      for (let y = slot.row; y < slot.row + item.h; y += 1) {
        for (let x = slot.col; x < slot.col + item.w; x += 1) {
          occupancy[y][x] = true;
        }
      }
    },

    rebuildWarehouseCellIndex() {
      this.warehouseCellIndex = {};
      this.items.forEach((item) => {
        for (let y = item.y; y < item.y + item.h; y += 1) {
          for (let x = item.x; x < item.x + item.w; x += 1) {
            this.warehouseCellIndex[toCellKey(x, y)] = item.id;
          }
        }
      });
    },

    isInBoundsCell(x, y) {
      return x >= 0 && x < GRID_COLS && y >= 0 && y < GRID_ROWS;
    },

    isWarehouseCellOccupied(x, y) {
      if (!this.isInBoundsCell(x, y)) {
        return false;
      }
      return Boolean(this.warehouseCellIndex[toCellKey(x, y)]);
    },

    renderItem(item) {
      const pixelX = Math.round(MARGIN + item.x * CELL_SIZE);
      const pixelY = Math.round(MARGIN + item.y * CELL_SIZE);
      const width = item.w * CELL_SIZE;
      const height = item.h * CELL_SIZE;

      const silhouette = this.add.rectangle(pixelX, pixelY, width, height, 0xe5d7bd, 0);
      silhouette.setOrigin(0, 0);

      const border = this.add.rectangle(pixelX, pixelY, width, height);
      border.setOrigin(0, 0);
      border.setStrokeStyle(3, item.quality.color, 0);

      const qualityMarkers = this.add.container(0, 0);
      const clickZone = this.add.zone(pixelX, pixelY, width, height).setOrigin(0, 0);
      clickZone.setInteractive();

      clickZone.on("pointerover", () => {
        if (this.hasAnyInfo(item)) {
          this.input.setDefaultCursor("pointer");
        } else {
          this.input.setDefaultCursor("default");
        }
      });

      clickZone.on("pointerout", () => {
        this.input.setDefaultCursor("default");
      });

      clickZone.on("pointerdown", (pointer) => {
        this.onArtifactClicked(item, pointer);
      });

      item.view = {
        silhouette,
        border,
        qualityMarkers,
        clickZone,
        borderPulseStarted: false,
        qualityTextObjects: [],
        qualitySynced: false,
        qualityGlowTween: null
      };

      this.itemLayer.add([silhouette, border, qualityMarkers, clickZone]);
    },

    onArtifactClicked(item, pointer) {
      if (!this.dom.bidKeypad.classList.contains("hidden") || (this.dom.itemDrawer && !this.dom.itemDrawer.classList.contains("hidden"))) {
        return;
      }

      if (this.isSettlementPageActive()) {
        if (!item.revealed.outline) {
          return;
        }
        this.selectedItem = item;
        this.positionPreview(pointer.x, pointer.y);
        this.renderSettlementItemPreview(item);
        this.writeLog(`结算查看：${item.name}（价值 ${item.trueValue}）`);
        return;
      }

      if (this.settled || this.roundResolving) {
        return;
      }

      if (!this.hasAnyInfo(item)) {
        this.writeLog("该藏品尚无任何线索，无法进行候选预览。");
        return;
      }

      this.selectedItem = item;

      this.dom.previewCategorySelect.value = "all";
      this.positionPreview(pointer.x, pointer.y);
      this.renderPreviewCandidates(item);

      const info = this.getItemKnownText(item);
      this.writeLog(`已打开候选预览：${info}。当前出价作用于整仓，不是单件。`);
      this.updateHud();
    },

    hasAnyInfo(item) {
      return item.revealed.outline || Boolean(item.revealed.qualityCell);
    },

    getItemKnownText(item) {
      const segments = [];
      if (item.revealed.qualityCell) {
        segments.push(`品质=${item.quality.label}`);
      }
      if (item.revealed.outline) {
        segments.push(`占格=${item.w}x${item.h}`);
      }
      if (segments.length === 0) {
        return "未知藏品";
      }
      return segments.join(" | ");
    }
  };

  const WarehouseRevealMixin = {
    revealOutlineBatch(count, category, allowCategoryFallback) {
      const targets = this.pickRevealTargets({ mode: "outline", count, category, allowCategoryFallback });
      if (targets.length === 0) {
        return { ok: false, revealed: 0, message: "没有可揭示轮廓的目标。" };
      }

      targets.forEach((item) => this.revealOutline(item));
      this.showRevealScrollHintsForTargets(targets, "轮廓揭示位置不在当前可视区");
      const bottomCell = this.pickBottomCellFromTargets(targets);
      return {
        ok: true,
        revealed: targets.length,
        bottomCell
      };
    },

    revealQualityBatch(count, category, allowCategoryFallback) {
      const targets = this.pickRevealTargets({ mode: "quality", count, category, allowCategoryFallback });
      if (targets.length === 0) {
        return { ok: false, revealed: 0, message: "没有可揭示品质格的目标。" };
      }

      targets.forEach((item) => this.revealQualityCell(item));
      this.showRevealScrollHintsForTargets(targets, "品质揭示位置不在当前可视区");
      return { ok: true, revealed: targets.length };
    },

    pickBottomCellFromTargets(targets) {
      const list = Array.isArray(targets) ? targets : [];
      if (list.length === 0) {
        return null;
      }

      let selected = list[0];
      let maxBottomY = (selected.y + selected.h - 1);

      list.forEach((item) => {
        const bottomY = item.y + item.h - 1;
        if (bottomY > maxBottomY) {
          selected = item;
          maxBottomY = bottomY;
        }
      });

      const x = Math.max(0, Math.round(selected.x));
      const y = Math.max(0, Math.round(maxBottomY));
      return {
        x,
        y,
        col: x + 1,
        row: y + 1
      };
    },

    hideRevealScrollHints() {
      if (this.dom.revealHintUp) {
        this.dom.revealHintUp.classList.add("hidden");
      }
      if (this.dom.revealHintDown) {
        this.dom.revealHintDown.classList.add("hidden");
      }
      this.pendingRevealHintTargets = null;
      this.pendingRevealHintText = "";
      this.pendingRevealHintSeenIds = null;
    },

    showRevealScrollHintsForTargets(targets, message) {
      if (!targets || targets.length === 0) {
        return;
      }

      this.pendingRevealHintTargets = targets;
      this.pendingRevealHintText = message;
      this.pendingRevealHintSeenIds = new Set();
      this.refreshRevealScrollHints();
    },

    refreshRevealScrollHints() {
      if (!this.dom.gameRoot || !this.pendingRevealHintTargets || this.pendingRevealHintTargets.length === 0) {
        return;
      }

      const canvasEl = this.dom.gameRoot.querySelector("canvas");
      const canvasRenderHeight = canvasEl ? canvasEl.getBoundingClientRect().height : this.dom.gameRoot.scrollHeight;
      const scaleRatio = canvasRenderHeight > 0 ? canvasRenderHeight / CANVAS_NATIVE_HEIGHT : 1;

      const viewportTop = this.dom.gameRoot.scrollTop;
      const viewportBottom = viewportTop + this.dom.gameRoot.clientHeight;

      this.pendingRevealHintTargets.forEach((item) => {
        const top = (MARGIN + item.y * CELL_SIZE) * scaleRatio;
        const bottom = (MARGIN + (item.y + item.h) * CELL_SIZE) * scaleRatio;
        if (top < viewportBottom && bottom > viewportTop) {
          this.pendingRevealHintSeenIds.add(item.id);
        }
      });

      if (this.pendingRevealHintSeenIds.size >= this.pendingRevealHintTargets.length) {
        this.hideRevealScrollHints();
        return;
      }

      let hasAbove = false;
      let hasBelow = false;

      this.pendingRevealHintTargets.forEach((item) => {
        if (this.pendingRevealHintSeenIds.has(item.id)) {
          return;
        }
        const top = (MARGIN + item.y * CELL_SIZE) * scaleRatio;
        const bottom = (MARGIN + (item.y + item.h) * CELL_SIZE) * scaleRatio;
        if (bottom <= viewportTop) {
          hasAbove = true;
        } else if (top >= viewportBottom) {
          hasBelow = true;
        }
      });

      const baseTop = viewportTop + 8;
      if (this.dom.revealHintUp) {
        this.dom.revealHintUp.style.top = `${baseTop}px`;
        this.dom.revealHintUp.textContent = `${this.pendingRevealHintText}（上方）`;
        this.dom.revealHintUp.classList.toggle("hidden", !hasAbove);
      }
      if (this.dom.revealHintDown) {
        this.dom.revealHintDown.style.top = `${baseTop + 36}px`;
        this.dom.revealHintDown.textContent = `${this.pendingRevealHintText}（下方）`;
        this.dom.revealHintDown.classList.toggle("hidden", !hasBelow);
      }

      if (!hasAbove && !hasBelow) {
        this.hideRevealScrollHints();
      }
    },

    pickRevealTargets({ mode, count, category, allowCategoryFallback }) {
      const primary = this.items.filter((item) => {
        if (category && item.category !== category) {
          return false;
        }
        if (mode === "outline") {
          return !item.revealed.outline;
        }
        return !item.revealed.qualityCell;
      });

      let selected = shuffle(primary).slice(0, count);
      if (selected.length < count && allowCategoryFallback && category) {
        const existedIds = new Set(selected.map((item) => item.id));
        const fallback = this.items.filter((item) => {
          if (existedIds.has(item.id)) {
            return false;
          }
          if (mode === "outline") {
            return !item.revealed.outline;
          }
          return !item.revealed.qualityCell;
        });

        selected = selected.concat(shuffle(fallback).slice(0, count - selected.length));
      }

      return selected;
    },

    revealOutline(item, options = {}) {
      if (item.revealed.outline) {
        return;
      }

      const { silhouette, border } = item.view;
      silhouette.setFillStyle(0xe5d7bd, 0.26);
      border.setStrokeStyle(2, 0xc8b08a, 0.92);

      if (item.revealed.qualityCell && !item.view.borderPulseStarted) {
        item.view.borderPulseStarted = true;
        border.setStrokeStyle(3, item.quality.color, 1);
        this.tweens.add({
          targets: border,
          alpha: { from: 1, to: 0.35 },
          duration: qualityPulseDuration(item.qualityKey),
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut"
        });
      }

      for (let y = item.y; y < item.y + item.h; y += 1) {
        for (let x = item.x; x < item.x + item.w; x += 1) {
          this.revealCell(x, y);
        }
      }

      item.revealed.outline = true;

      if (item.revealed.qualityCell) {
        this.syncQualityMarkersForOutlinedItem(item, options);
      }
    },

    revealQualityCell(item, options = {}) {
      if (item.revealed.qualityCell) {
        return;
      }

      const cells = [];
      for (let y = item.y; y < item.y + item.h; y += 1) {
        for (let x = item.x; x < item.x + item.w; x += 1) {
          cells.push({ x, y });
        }
      }

      const chosen = cells[Math.floor(Math.random() * cells.length)];
      this.revealCell(chosen.x, chosen.y);
      item.revealed.qualityCell = chosen;
      this.renderQualityVisual(item, options);

      if (item.revealed.outline) {
        this.syncQualityMarkersForOutlinedItem(item, options);
      }
    },

    clearQualityVisual(item) {
      if (!item.view) {
        return;
      }

      if (item.view.qualityGlowTween) {
        item.view.qualityGlowTween.stop();
        item.view.qualityGlowTween = null;
      }

      item.view.qualityMarkers.removeAll(true);
      item.view.qualityTextObjects = [];
    },

    renderQualityVisual(item, options = {}) {
      if (!item.revealed.qualityCell) {
        return;
      }

      this.clearQualityVisual(item);

      let markerX;
      let markerY;
      let markerW;
      let markerH;

      if (item.revealed.outline && item.w * item.h > 1) {
        markerX = MARGIN + item.x * CELL_SIZE;
        markerY = MARGIN + item.y * CELL_SIZE;
        markerW = item.w * CELL_SIZE;
        markerH = item.h * CELL_SIZE;
      } else {
        markerX = MARGIN + item.revealed.qualityCell.x * CELL_SIZE;
        markerY = MARGIN + item.revealed.qualityCell.y * CELL_SIZE;
        markerW = CELL_SIZE;
        markerH = CELL_SIZE;
      }

      const marker = this.add.rectangle(markerX, markerY, markerW, markerH, item.quality.color, 0.24);
      marker.setOrigin(0, 0);
      marker.setStrokeStyle(2, item.quality.color, 1);

      const shouldShowName = options.showName === true || (this.isSettlementRevealMode && options.showName !== false);

      const markerText = this.add
        .text(markerX + markerW / 2, markerY + markerH / 2, shouldShowName ? item.name : item.quality.label, {
          fontSize: "13px",
          color: rgbHex(item.quality.color),
          fontStyle: "bold",
          stroke: "#2a2016",
          strokeThickness: 2
        })
        .setOrigin(0.5, 0.5);
      markerText.setVisible(this.isSettlementRevealMode ? true : this.useQualityText);

      item.view.qualityMarkers.add([marker, markerText]);
      item.view.qualityTextObjects.push(markerText);

      item.view.qualityGlowTween = this.tweens.add({
        targets: marker,
        alpha: { from: 0.24, to: 0.5 },
        duration: qualityPulseDuration(item.qualityKey),
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut"
      });

      if (item.revealed.outline && !item.view.borderPulseStarted) {
        item.view.border.setStrokeStyle(3, item.quality.color, 1);
        item.view.borderPulseStarted = true;
        this.tweens.add({
          targets: item.view.border,
          alpha: { from: 1, to: 0.35 },
          duration: qualityPulseDuration(item.qualityKey),
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut"
        });
      }
    },

    syncQualityMarkersForOutlinedItem(item, options = {}) {
      if (!item.revealed.outline || !item.revealed.qualityCell || item.view.qualitySynced) {
        return;
      }

      item.view.qualitySynced = true;
      const showName = options.settlementShowName === true
        ? true
        : (options.settlementShowName === false ? false : undefined);
      this.renderQualityVisual(item, {
        showName
      });
    },

    syncAllQualityTextVisibility() {
      this.items.forEach((item) => {
        if (!item.view || !item.view.qualityTextObjects) {
          return;
        }
        item.view.qualityTextObjects.forEach((textObj) => {
          textObj.setVisible(this.useQualityText);
        });
      });
    },

    revealCell(col, row) {
      if (this.revealedCells[row][col]) {
        return;
      }

      this.revealedCells[row][col] = true;
      const x = MARGIN + col * CELL_SIZE;
      const y = MARGIN + row * CELL_SIZE;

      this.revealCellLayer.fillStyle(0xf1e6cc, 0.2);
      this.revealCellLayer.fillRect(x, y, CELL_SIZE, CELL_SIZE);
    }
  };

  const WarehousePreviewMixin = {
    positionPreview(canvasX, canvasY) {
      this.previewAnchor = { x: canvasX, y: canvasY };
      const pop = this.dom.previewPopover;
      pop.classList.remove("hidden");
      this.previewOpenTick = Date.now();

      this.applyPreviewPosition();
    },

    applyPreviewPosition() {
      const pop = this.dom.previewPopover;
      if (pop.classList.contains("hidden") || !this.previewAnchor) {
        return;
      }

      const canvasX = this.previewAnchor.x;
      const canvasY = this.previewAnchor.y;

      const root = this.dom.gameRoot;
      const pad = 10;
      const maxPopoverHeight = Math.min(320, Math.max(180, root.clientHeight - pad * 2));
      pop.style.maxHeight = `${Math.round(maxPopoverHeight)}px`;

      const popWidth = pop.offsetWidth || 460;
      const popHeight = pop.offsetHeight || 360;
      const viewLeft = root.scrollLeft;
      const viewTop = root.scrollTop;
      const viewRight = viewLeft + root.clientWidth;
      const viewBottom = viewTop + root.clientHeight;

      const rightSpace = viewRight - canvasX - pad;
      const leftSpace = canvasX - viewLeft - pad;
      const downSpace = viewBottom - canvasY - pad;
      const upSpace = canvasY - viewTop - pad;

      let left = rightSpace >= popWidth || rightSpace >= leftSpace
        ? canvasX + 18
        : canvasX - popWidth - 18;

      let top = downSpace >= popHeight || downSpace >= upSpace
        ? canvasY + 18
        : canvasY - popHeight - 18;

      left = clamp(left, viewLeft + pad, Math.max(viewLeft + pad, viewRight - popWidth - pad));
      top = clamp(top, viewTop + pad, Math.max(viewTop + pad, viewBottom - popHeight - pad));

      pop.style.left = `${Math.round(left)}px`;
      pop.style.top = `${Math.round(top)}px`;
    },

    repositionPreview() {
      if (this.dom.previewPopover.classList.contains("hidden")) {
        return;
      }

      window.requestAnimationFrame(() => {
        this.applyPreviewPosition();
      });
    },

    hidePreview() {
      if (this.dom.previewFilterRow) {
        this.dom.previewFilterRow.style.display = "flex";
      }
      this.dom.previewPopover.classList.add("hidden");
      this.dom.previewList.innerHTML = "";
      this.dom.previewHint.textContent = "";
      this.input.setDefaultCursor("default");
    },

    setupPreviewTouchScroll() {
      const pop = this.dom.previewPopover;
      if (!pop) return;
      let touchStartY = 0;
      let touchStartScrollTop = 0;
      pop.addEventListener("touchstart", (e) => {
        if (e.touches.length === 1) {
          touchStartY = e.touches[0].clientY;
          touchStartScrollTop = pop.scrollTop;
        }
      }, { passive: true });
      pop.addEventListener("touchmove", (e) => {
        if (e.touches.length !== 1) return;
        const dy = touchStartY - e.touches[0].clientY;
        const maxScroll = pop.scrollHeight - pop.clientHeight;
        if (maxScroll <= 0) return;
        pop.scrollTop = Math.max(0, Math.min(touchStartScrollTop + dy, maxScroll));
      }, { passive: true });
    },

    isPointOnSettlementLockedItem(x, y) {
      if (!this.items || this.items.length === 0) {
        return false;
      }

      return this.items.some((item) => {
        if (!item.revealed || (!item.revealed.qualityCell && !item.revealed.exact)) {
          return false;
        }

        const left = MARGIN + item.x * CELL_SIZE;
        const top = MARGIN + item.y * CELL_SIZE;
        const right = left + item.w * CELL_SIZE;
        const bottom = top + item.h * CELL_SIZE;
        return x >= left && x <= right && y >= top && y <= bottom;
      });
    },

    renderPreviewCandidates(item) {
      if (this.dom.previewFilterRow) {
        this.dom.previewFilterRow.style.display = "flex";
      }
      const qualityKey = item.revealed.qualityCell ? item.qualityKey : null;
      const sizeTag = item.revealed.outline ? toSizeTag(item.w, item.h) : null;
      const selectedCategory = this.dom.previewCategorySelect.value;
      const category = selectedCategory === "all" ? null : selectedCategory;

      const candidates = this.artifactManager.getCandidatesByRevealState({
        qualityKey,
        sizeTag,
        category
      });

      if (item.revealed.outline && item.revealed.qualityCell && candidates.length === 1) {
        item.revealed.exact = true;
      }

      const libStats = this.artifactManager.getLibraryStats();
      this.dom.previewTitle.textContent = `可能藏品预览（候选 ${candidates.length}/${libStats.total}）`;
      this.dom.previewHint.textContent = `已知线索：${this.getItemKnownText(item)}；局内藏品 ${this.items.length} 件；藏品库总数 ${libStats.total} 件；若仅有品质线索，候选会接近全库；默认按估算价从高到低。`;

      if (candidates.length === 0) {
        this.dom.previewList.innerHTML = "<div class=\"preview-item\">无符合候选</div>";
        return;
      }

      const sorted = [...candidates].sort((a, b) => b.expectedPrice - a.expectedPrice);
      const html = sorted
        .map((candidate) => {
          const qualityText = qualityKey
            ? `${window.ArtifactData.QUALITY_CONFIG[qualityKey].label}`
            : "未知";
          const sizeText = candidate.previewSizeTag || "未知";
          return `<article class="preview-item"><div class="preview-thumb">图片占位 ${sizeText}</div><strong>${candidate.name}</strong><br/>品类: ${candidate.category} | 品质: ${qualityText}<br/>基础价: ${candidate.basePrice} | 估算价: ${candidate.expectedPrice}</article>`;
        })
        .join("");

      this.dom.previewList.innerHTML = html;
      this.repositionPreview();
    },

    renderSettlementItemPreview(item) {
      if (this.dom.previewFilterRow) {
        this.dom.previewFilterRow.style.display = "none";
      }
      this.dom.previewTitle.textContent = `藏品详情：${item.name}`;
      this.dom.previewHint.textContent = "结算页点击藏品可直接查看其价值。";
      this.dom.previewList.innerHTML = [
        '<article class="preview-item">',
        `<div class="preview-thumb">图片占位 ${item.w}x${item.h}</div>`,
        `<strong>${item.name}</strong><br/>`,
        `品类: ${item.category}<br/>`,
        `基础价: ${item.basePrice}<br/>`,
        `当前揭示价值: ${item.trueValue}`,
        "</article>"
      ].join("");
      this.repositionPreview();
    }
  };

  global.MobaoWarehouse = {
    WarehouseCoreMixin,
    WarehouseRevealMixin,
    WarehousePreviewMixin
  };
})(window);

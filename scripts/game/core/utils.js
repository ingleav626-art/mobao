(function setupMobaoUtils(global) {
  function shuffle(list) {
    const arr = [...list];
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function delay(ms) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  function tweenToPromise(scene, targets, config) {
    return new Promise((resolve) => {
      scene.tweens.add({
        targets,
        ...config,
        onComplete: () => resolve()
      });
    });
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function roundToStep(value, step) {
    const safeStep = Math.max(1, Math.round(Number(step) || 1));
    const num = Number(value) || 0;
    return Math.round(num / safeStep) * safeStep;
  }

  function toCellKey(x, y) {
    return `${x},${y}`;
  }

  function fromCellKey(key) {
    const [xRaw, yRaw] = String(key || "").split(",");
    const x = Number(xRaw);
    const y = Number(yRaw);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }
    return { x, y };
  }

  function sizeTagToCellCount(sizeTag) {
    const text = String(sizeTag || "").trim();
    const match = text.match(/^(\d+)x(\d+)$/i);
    if (!match) {
      return null;
    }
    const w = Number(match[1]);
    const h = Number(match[2]);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
      return null;
    }
    return w * h;
  }

  function formatTrackIndex(index) {
    const map = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
    const value = Math.max(1, Math.round(Number(index) || 1));
    if (value <= 10) {
      return map[value];
    }
    if (value < 20) {
      return `十${map[value - 10]}`;
    }
    return String(value);
  }

  function rgbHex(numberColor) {
    return `#${numberColor.toString(16).padStart(6, "0")}`;
  }

  function trimTrailingZero(value) {
    return String(value).replace(/\.0$/, "");
  }

  function formatCompactNumber(value) {
    const num = Number(value) || 0;
    const abs = Math.abs(num);

    if (abs >= 1_000_000) {
      const m = num / 1_000_000;
      return `${trimTrailingZero(m.toFixed(m >= 10 || m <= -10 ? 0 : 1))}M`;
    }

    if (abs >= 1_000) {
      const k = num / 1_000;
      return `${trimTrailingZero(k.toFixed(k >= 10 || k <= -10 ? 0 : 1))}k`;
    }

    return String(Math.round(num));
  }

  function formatBidRevealNumber(value) {
    const num = Math.round(Number(value) || 0);
    const abs = Math.abs(num);
    if (abs >= 1_000_000) {
      return formatCompactNumber(num);
    }
    return num.toLocaleString("zh-CN");
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function compactOneLine(value, maxLength = 120) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (text.length <= maxLength) {
      return text;
    }
    return `${text.slice(0, maxLength)}...`;
  }

  function compactPanelText(value, maxLength) {
    const text = String(value || "").trim();
    if (!text) {
      return "(empty)";
    }
    if (text.length <= maxLength) {
      return text;
    }
    return `${text.slice(0, maxLength)}\n...(truncated)`;
  }

  function indentMultiline(value, indent) {
    return String(value || "")
      .split("\n")
      .map((line) => `${indent}${line}`)
      .join("\n");
  }

  function normalizeActionToken(value) {
    return String(value || "")
      .replace(/[\s\-—_：:（）()]/g, "")
      .toLowerCase();
  }

  function isNoneActionText(value) {
    const text = normalizeActionToken(value);
    return ["无", "不使用", "none", "null", "nil", "na"].some((entry) => text === normalizeActionToken(entry));
  }

  function safeParseJson(text) {
    try {
      return JSON.parse(text);
    } catch (_error) {
      return null;
    }
  }

  function tryExtractDecisionJson(rawText) {
    const text = String(rawText || "").trim();
    if (!text) {
      return null;
    }

    const direct = safeParseJson(text);
    if (direct && typeof direct === "object") {
      return direct;
    }

    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced && fenced[1]) {
      const parsed = safeParseJson(fenced[1].trim());
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
    }

    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      const slice = text.slice(firstBrace, lastBrace + 1);
      const parsed = safeParseJson(slice);
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
    }

    return null;
  }

  function pickFirstDefined(...values) {
    for (const value of values) {
      if (value !== undefined && value !== null) {
        return value;
      }
    }
    return null;
  }

  function createEmptyAiPrivateIntelPool() {
    return {
      knownOutlineIds: new Set(),
      knownQualityIds: new Set(),
      outlineSignals: [],
      qualitySignals: [],
      signalHistory: [],
      latestSignalStats: null,
      aggregateStats: null,
      knownCellStates: {},
      itemKnowledge: {},
      highValueTrackByItemId: {},
      highValueTracks: [],
      nextTrackIndex: 1
    };
  }

  function qualityPulseDuration(qualityKey) {
    switch (qualityKey) {
      case "legendary":
        return 380;
      case "rare":
        return 520;
      case "fine":
        return 660;
      case "normal":
        return 760;
      default:
        return 880;
    }
  }

  function settlementRevealDelayByQuality(qualityKey) {
    const multiplier = global.MobaoSettings ? global.MobaoSettings.GAME_SETTINGS.revealSpeedMultiplier : 1;
    switch (qualityKey) {
      case "legendary":
        return Math.round(360 * multiplier);
      case "rare":
        return Math.round(320 * multiplier);
      case "fine":
        return Math.round(280 * multiplier);
      case "normal":
        return Math.round(240 * multiplier);
      case "poor":
        return Math.round(220 * multiplier);
      default:
        return Math.round(260 * multiplier);
    }
  }

  function settlementSearchDurationByQuality(qualityKey) {
    const multiplier = global.MobaoSettings ? global.MobaoSettings.GAME_SETTINGS.searchSpeedMultiplier : 1;
    switch (qualityKey) {
      case "legendary":
        return Math.round(1250 * multiplier);
      case "rare":
        return Math.round(920 * multiplier);
      case "fine":
        return Math.round(680 * multiplier);
      case "normal":
        return Math.round(500 * multiplier);
      case "poor":
        return Math.round(360 * multiplier);
      default:
        return Math.round(540 * multiplier);
    }
  }

  global.MobaoUtils = {
    shuffle,
    delay,
    tweenToPromise,
    clamp,
    roundToStep,
    toCellKey,
    fromCellKey,
    sizeTagToCellCount,
    formatTrackIndex,
    rgbHex,
    trimTrailingZero,
    formatCompactNumber,
    formatBidRevealNumber,
    escapeHtml,
    compactOneLine,
    compactPanelText,
    indentMultiline,
    normalizeActionToken,
    isNoneActionText,
    safeParseJson,
    tryExtractDecisionJson,
    pickFirstDefined,
    createEmptyAiPrivateIntelPool,
    qualityPulseDuration,
    settlementRevealDelayByQuality,
    settlementSearchDurationByQuality
  };
})(window);

const SETTINGS_STORAGE_KEY = "mobao_settings_v2";

const SETTINGS_META = [
  ["maxRounds", 5, 3, 12],
  ["actionsPerRound", 2, 1, 4],
  ["roundSeconds", 40, 10, 60],
  ["directTakeRatio", 0.2, 0.05, 0.6],
  ["bidRevealIntervalMs", 650, 250, 1800],
  ["postRevealWaitMs", 3000, 800, 6000],
  ["bidStep", 100, 10, 10000],
  ["bidDefaultRaise", 500, 0, 50000],
  ["revealSpeedMultiplier", 1, 0.5, 2.2],
  ["searchSpeedMultiplier", 1, 0.5, 2.5],
  ["musicVolume", 70, 0, 100],
  ["sfxVolume", 80, 0, 100]
];

function loadSettings() {
  const defaults = Object.fromEntries(SETTINGS_META.map(([key, def]) => [key, def]));
  const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
  if (!raw) {
    return defaults;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return defaults;
    }

    const output = { ...defaults };
    SETTINGS_META.forEach(([key, _def, min, max]) => {
      const value = Number(parsed[key]);
      if (!Number.isFinite(value)) {
        return;
      }
      output[key] = Math.min(max, Math.max(min, value));
    });
    return output;
  } catch (_error) {
    return defaults;
  }
}

function fillForm(values) {
  SETTINGS_META.forEach(([key]) => {
    const input = document.getElementById(key);
    if (input) {
      input.value = String(values[key]);
    }
  });
}

function readForm() {
  const values = {};
  SETTINGS_META.forEach(([key, def, min, max]) => {
    const input = document.getElementById(key);
    const raw = input ? Number(input.value) : def;
    const normalized = Number.isFinite(raw) ? raw : def;
    values[key] = Math.min(max, Math.max(min, normalized));
  });
  return values;
}

function saveSettings(values) {
  window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(values));
}

function setStatus(text) {
  const el = document.getElementById("statusText");
  if (el) {
    el.textContent = text;
  }
}

function bindActions() {
  const saveBtn = document.getElementById("saveBtn");
  const resetBtn = document.getElementById("resetBtn");
  const backBtn = document.getElementById("backBtn");

  saveBtn.addEventListener("click", () => {
    const values = readForm();
    saveSettings(values);
    setStatus("设置已保存，正在返回主界面...");
    window.setTimeout(() => {
      window.location.href = "./index.html";
    }, 180);
  });

  resetBtn.addEventListener("click", () => {
    const defaults = Object.fromEntries(SETTINGS_META.map(([key, def]) => [key, def]));
    fillForm(defaults);
    setStatus("已恢复默认参数，点击“保存并返回”后生效。");
  });

  backBtn.addEventListener("click", () => {
    window.location.href = "./index.html";
  });
}

fillForm(loadSettings());
bindActions();

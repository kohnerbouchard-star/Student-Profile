import {
  ADMIN_DATA_STATES,
  beginAdminDataLoad,
  createAdminDataState,
  rejectAdminDataLoad,
  resolveAdminDataLoad,
} from "../../core/data-state.js";
import {
  createAdminErrorEnvelope,
  isAdminErrorEnvelope,
  normalizeAdminError,
} from "../../core/error-envelope.js";
import { SettingsRoute } from "./SettingsRoute.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_IN_TEXT_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const CURRENCY_PATTERN = /^[A-Z]{3,8}$/;
const DIFFICULTY_PRESETS = new Set(["easy", "moderate", "hard", "custom"]);
const MODIFIER_FIELDS = Object.freeze([
  "priceMultiplier",
  "incomeMultiplier",
  "shockFrequency",
  "shockSeverity",
  "recoverySupport",
  "tradeMultiplier",
]);

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeText(value, fallback = "", maximum = 120) {
  if (typeof value !== "string" && typeof value !== "number") return fallback;
  const normalized = String(value ?? "").trim();
  if (!normalized || UUID_IN_TEXT_PATTERN.test(normalized)) return fallback;
  return normalized.slice(0, maximum);
}

function finite(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function safeConfigValue(value, depth = 0) {
  if (depth > 3 || value === undefined || typeof value === "function") return undefined;
  if (typeof value === "string") {
    const normalized = value.trim();
    if (UUID_IN_TEXT_PATTERN.test(normalized) || normalized.length > 512) return undefined;
    return normalized;
  }
  if (["number", "boolean"].includes(typeof value) || value === null) return value;
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((entry) => safeConfigValue(entry, depth + 1)).filter((entry) => entry !== undefined);
  }
  if (!isRecord(value)) return undefined;
  const result = {};
  Object.entries(value).slice(0, 80).forEach(([key, entry]) => {
    if (/(?:owner|player|staff|user|session).*id|uuid|token|secret|password|environment|service[_-]?role|api[_-]?key|credential|authorization/i.test(key)) return;
    const sanitized = safeConfigValue(entry, depth + 1);
    if (sanitized !== undefined) result[key] = sanitized;
  });
  return result;
}

function safeAttendanceWindow(value) {
  const source = safeConfigValue(isRecord(value) ? value : {}) || {};
  return Object.freeze({
    ...source,
    timezone: safeText(source.timezone, "Asia/Seoul", 64),
    presentRewardAmount: Math.max(0, finite(source.presentRewardAmount, 1)),
    lateRewardAmount: Math.max(0, finite(source.lateRewardAmount, 0)),
    currencyMode: source.currencyMode === "fixed" ? "fixed" : "player_country",
    applyDifficultyIncomeModifier: bool(source.applyDifficultyIncomeModifier, true),
    currencyCode: CURRENCY_PATTERN.test(safeText(source.currencyCode, "ECO", 8).toUpperCase())
      ? safeText(source.currencyCode, "ECO", 8).toUpperCase()
      : "ECO",
  });
}

export function normalizeSettingsReadModel(result) {
  const root = isRecord(result?.data) ? result.data : isRecord(result) ? result : null;
  if (!root) throw createAdminErrorEnvelope({ code: "INVALID_RESPONSE", retryable: true });
  const settings = isRecord(root.settings) ? root.settings : root;
  const attendanceWindow = safeAttendanceWindow(settings.attendanceWindow ?? settings.attendance_window);
  const difficultyPreset = safeText(
    settings.difficultyBasePreset ?? settings.difficultyPreset ?? settings.difficulty,
    "moderate",
    80,
  );
  return Object.freeze({
    difficultyPreset,
    priceMultiplier: finite(settings.priceMultiplier, 1),
    incomeMultiplier: finite(settings.incomeMultiplier, 1),
    shockFrequency: finite(settings.shockFrequency, 1),
    shockSeverity: finite(settings.shockSeverity, 1),
    recoverySupport: finite(settings.recoverySupport ?? settings.bankruptcyProtection, 1),
    tradeMultiplier: finite(settings.tradeMultiplier, 1),
    attendanceWindow,
    configLastSaved: safeText(settings.configLastSaved, "", 80),
  });
}

function validationError(field, message) {
  return Object.freeze({ field, message });
}

export function validateSettingsDraft(draft) {
  const input = isRecord(draft) ? draft : {};
  const errors = [];
  const difficultyBase = isRecord(input.difficultyBase) ? input.difficultyBase : {};
  const basePreset = safeText(difficultyBase.difficultyPreset, "", 80).toLowerCase();
  const difficultyPreset = safeText(input.difficultyPreset, "", 80).toLowerCase();
  if (!difficultyPreset) {
    errors.push(validationError("difficultyPreset", "Select the current difficulty preset."));
  } else if (!DIFFICULTY_PRESETS.has(difficultyPreset) && difficultyPreset !== basePreset) {
    errors.push(validationError("difficultyPreset", "Select an existing authoritative difficulty preset."));
  }

  MODIFIER_FIELDS.forEach((field) => {
    const value = Number(input[field]);
    if (!Number.isFinite(value) || value < 0.5 || value > 2) {
      errors.push(validationError(field, "Use a value from 0.5 through 2.0."));
    }
  });

  const attendance = isRecord(input.attendanceWindow) ? input.attendanceWindow : {};
  const presentRewardAmount = Number(attendance.presentRewardAmount);
  const lateRewardAmount = Number(attendance.lateRewardAmount);
  if (!Number.isFinite(presentRewardAmount) || presentRewardAmount < 0 || presentRewardAmount > 1000) {
    errors.push(validationError("presentRewardAmount", "Use an amount from 0 through 1000."));
  }
  if (!Number.isFinite(lateRewardAmount) || lateRewardAmount < 0 || lateRewardAmount > 1000) {
    errors.push(validationError("lateRewardAmount", "Use an amount from 0 through 1000."));
  }
  const attendanceBase = isRecord(input.attendanceWindowBase) ? input.attendanceWindowBase : {};
  const timezone = safeText(attendanceBase.timezone, "Asia/Seoul", 64);
  const currencyCodeCandidate = safeText(attendanceBase.currencyCode, "ECO", 8).toUpperCase();
  const currencyCode = CURRENCY_PATTERN.test(currencyCodeCandidate) ? currencyCodeCandidate : "ECO";

  const settings = {
    attendanceWindow: Object.freeze({
      ...attendanceBase,
      timezone,
      presentRewardAmount,
      lateRewardAmount,
      currencyMode: "player_country",
      applyDifficultyIncomeModifier: true,
      currencyCode,
    }),
  };
  const modifierChanged = MODIFIER_FIELDS.some((field) => {
    const before = Number(difficultyBase[field]);
    const after = Number(input[field]);
    return !Number.isFinite(before) || before !== after;
  });
  if (modifierChanged) {
    MODIFIER_FIELDS.forEach((field) => { settings[field] = Number(input[field]); });
  } else if (difficultyPreset !== safeText(difficultyBase.difficultyPreset, "", 80).toLowerCase()) {
    settings.difficultyPreset = difficultyPreset;
  }

  return Object.freeze({
    ok: errors.length === 0,
    errors: Object.freeze(errors),
    settings: Object.freeze(settings),
  });
}

function safeError(error) {
  return isAdminErrorEnvelope(error)
    ? error
    : normalizeAdminError(error, { fieldErrors: error?.fieldErrors });
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

export function createSettingsController({
  api,
  selectedGameId,
  hasPermission = () => false,
  onChange = () => {},
  notify = () => {},
  cryptoObject = globalThis.crypto,
} = {}) {
  for (const method of ["readSettings", "updateSettings"]) {
    if (typeof api?.[method] !== "function") throw new TypeError(`Settings API ${method} is unavailable.`);
  }

  let state = createAdminDataState();
  let requestVersion = 0;
  let mutationSequence = 0;
  let destroyed = false;
  let currentView = null;
  const pendingIdempotency = new Map();
  const activeMutations = new Set();

  function publish() {
    if (!destroyed) onChange(state);
  }

  async function load() {
    if (destroyed || !hasPermission("settings.manage")) return state;
    api.cancelSettingsRequest?.();
    requestVersion += 1;
    const version = requestVersion;
    state = beginAdminDataLoad(state, { requestVersion: version });
    publish();
    try {
      const result = await api.readSettings({ gameId: selectedGameId });
      if (destroyed || version !== requestVersion) return state;
      state = resolveAdminDataLoad(state, normalizeSettingsReadModel(result), { requestVersion: version });
    } catch (error) {
      if (destroyed || version !== requestVersion) return state;
      state = rejectAdminDataLoad(state, safeError(error), { requestVersion: version });
    }
    publish();
    return state;
  }

  function nextIdempotencyKey() {
    mutationSequence += 1;
    const uuid = String(cryptoObject?.randomUUID?.() || "").trim().toLowerCase();
    if (!UUID_PATTERN.test(uuid)) throw createAdminErrorEnvelope({ code: "INVALID_REQUEST", retryable: false });
    return `admin.settings.save.${uuid}.${mutationSequence}`.slice(0, 159);
  }

  async function save(draft) {
    if (destroyed || !hasPermission("settings.manage")) {
      return { ok: false, error: createAdminErrorEnvelope({ code: "PERMISSION_DENIED", retryable: false }) };
    }
    if (state.status === ADMIN_DATA_STATES.STALE) {
      return { ok: false, error: createAdminErrorEnvelope({ code: "CONFLICT", retryable: false }) };
    }
    const validation = validateSettingsDraft(draft);
    if (!validation.ok) return { ok: false, validation };

    const fingerprint = stableStringify(validation.settings);
    if (activeMutations.has(fingerprint)) {
      return { ok: false, busy: true, error: createAdminErrorEnvelope({ code: "CONFLICT", retryable: false }) };
    }
    let idempotencyKey = pendingIdempotency.get(fingerprint);
    if (!idempotencyKey) {
      try {
        idempotencyKey = nextIdempotencyKey();
        pendingIdempotency.set(fingerprint, idempotencyKey);
      } catch (error) {
        return { ok: false, error: safeError(error) };
      }
    }

    activeMutations.add(fingerprint);
    try {
      const result = await api.updateSettings({
        gameId: selectedGameId,
        settings: validation.settings,
        idempotencyKey,
      });
      pendingIdempotency.delete(fingerprint);
      notify({
        tone: "success",
        title: "Settings saved",
        message: "The authoritative game settings were updated.",
      });
      if (!destroyed) void load();
      return { ok: true, result };
    } catch (error) {
      const envelope = safeError(error);
      if (!envelope.retryable) pendingIdempotency.delete(fingerprint);
      notify({ tone: "error", title: "Settings were not saved", message: envelope.userMessage });
      return { ok: false, error: envelope };
    } finally {
      activeMutations.delete(fingerprint);
    }
  }

  function render() {
    currentView?.destroy?.();
    currentView = SettingsRoute({
      state,
      onRetry: load,
      onValidate: validateSettingsDraft,
      onSave: save,
    });
    return currentView;
  }

  return Object.freeze({
    load,
    save,
    render,
    getState: () => state,
    deactivate() {
      currentView?.destroy?.();
      currentView = null;
      api.cancelSettingsRequest?.();
    },
    destroy() {
      destroyed = true;
      requestVersion += 1;
      currentView?.destroy?.();
      currentView = null;
      api.cancelSettingsRequest?.();
      activeMutations.clear();
      pendingIdempotency.clear();
    },
  });
}

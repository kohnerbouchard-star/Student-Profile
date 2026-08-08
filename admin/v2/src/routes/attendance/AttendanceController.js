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
import { AttendanceRoute } from "./AttendanceRoute.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_IN_TEXT_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const ATTENDANCE_STATUSES = new Set(["present", "late", "absent", "excused", "missing"]);
const CORRECTION_STATUSES = new Set(["present", "late", "absent", "excused"]);
const SUCCESS_RESET_MS = 1_200;
const ERROR_RESET_MS = 2_000;
const SCANNER_REARM_MS = 250;

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeText(value, maximum = 500) {
  const text = String(value ?? "").trim();
  if (!text || UUID_IN_TEXT_PATTERN.test(text)) return "";
  return text.slice(0, maximum);
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function safeDate(value) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function safeTimestamp(value) {
  const text = safeText(value, 80);
  if (!text) return "";
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

function sourcePayload(result) {
  const daily = isRecord(result?.daily) ? result.daily : {};
  const enhanced = isRecord(result?.enhanced) ? result.enhanced : {};
  return { daily, enhanced };
}

function recordsFrom(daily, enhanced) {
  const candidates = [daily.records, daily.attendanceRows, daily.attendance, enhanced.attendanceRows, enhanced.attendance];
  return candidates.find(Array.isArray) || [];
}

function missingFrom(daily, enhanced) {
  const candidates = [daily.missingPlayers, enhanced.missingPlayers];
  return candidates.find(Array.isArray) || [];
}

function playerSource(row) {
  return isRecord(row?.player) ? row.player : row;
}

function rowKey(kind, row, index) {
  const player = playerSource(row);
  const roster = safeText(player?.rosterLabel ?? player?.roster_label, 120).toLowerCase();
  const name = safeText(player?.displayName ?? player?.display_name ?? row?.displayName, 240).toLowerCase();
  const base = `${kind}-${roster || name || "player"}`
    .replace(/[^a-z0-9가-힣_-]+/giu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
  return `${base || kind}-${index + 1}`;
}

function playerId(row) {
  const player = playerSource(row);
  const id = String(player?.id || player?.playerId || row?.playerId || "").trim().toLowerCase();
  return UUID_PATTERN.test(id) ? id : "";
}

function normalizedStatus(row, fallback = "missing") {
  const value = String(row?.status ?? row?.attendanceStatus ?? fallback).trim().toLowerCase();
  return ATTENDANCE_STATUSES.has(value) ? value : fallback;
}

function normalizeRow(kind, row, index, fallbackStatus) {
  if (!isRecord(row)) return null;
  const player = playerSource(row);
  const displayName = safeText(player?.displayName ?? player?.display_name ?? row?.displayName, 240)
    || "Unnamed player";
  const rosterLabel = safeText(player?.rosterLabel ?? player?.roster_label ?? row?.rosterLabel, 120);
  const status = normalizedStatus(row, fallbackStatus);
  return Object.freeze({
    rowKey: rowKey(kind, row, index),
    displayName,
    rosterLabel,
    playerStatus: safeText(player?.status ?? row?.playerStatus, 40).toLowerCase(),
    attendanceStatus: status,
    clockedInAt: safeTimestamp(row?.clockedInAt ?? row?.clocked_in_at),
    source: safeText(row?.source, 80).toLowerCase(),
    note: safeText(row?.note, 1_000),
    correctedAt: safeTimestamp(row?.correctedAt ?? row?.corrected_at),
    isMissing: status === "missing",
  });
}

function normalizedLock(daily, enhanced) {
  const raw = isRecord(enhanced.attendanceLock)
    ? enhanced.attendanceLock
    : isRecord(daily.attendanceLock)
      ? daily.attendanceLock
      : null;
  const locked = enhanced.attendanceLocked === true || daily.attendanceLocked === true
    || String(raw?.status || "").toLowerCase() === "locked";
  return Object.freeze({
    locked,
    reason: safeText(raw?.reason, 500),
    lockedAt: safeTimestamp(raw?.lockedAt ?? raw?.locked_at),
    unlockedAt: safeTimestamp(raw?.unlockedAt ?? raw?.unlocked_at),
  });
}

function normalizeSummary(rows, daily, enhanced) {
  const source = isRecord(daily.summary)
    ? daily.summary
    : isRecord(enhanced.attendanceSummary)
      ? enhanced.attendanceSummary
      : {};
  const count = (status) => rows.filter((row) => row.attendanceStatus === status).length;
  return Object.freeze({
    presentCount: Number.isFinite(Number(source.presentCount)) ? Number(source.presentCount) : count("present"),
    lateCount: Number.isFinite(Number(source.lateCount)) ? Number(source.lateCount) : count("late"),
    absentCount: Number.isFinite(Number(source.absentCount)) ? Number(source.absentCount) : count("absent"),
    excusedCount: Number.isFinite(Number(source.excusedCount)) ? Number(source.excusedCount) : count("excused"),
    missingCount: Number.isFinite(Number(source.missingCount)) ? Number(source.missingCount) : count("missing"),
    activePlayerCount: Number.isFinite(Number(source.activePlayerCount))
      ? Number(source.activePlayerCount)
      : rows.length,
  });
}

function normalizeAttendancePayload(result) {
  const { daily, enhanced } = sourcePayload(result);
  const rawRecords = recordsFrom(daily, enhanced).slice(0, 2_000);
  const rawMissing = missingFrom(daily, enhanced).slice(0, 2_000);
  if (!Array.isArray(rawRecords) || !Array.isArray(rawMissing)) {
    throw createAdminErrorEnvelope({ code: "INVALID_RESPONSE", retryable: true });
  }

  const rows = [
    ...rawRecords.map((row, index) => normalizeRow("record", row, index, "absent")).filter(Boolean),
    ...rawMissing.map((row, index) => normalizeRow("missing", row, index, "missing")).filter(Boolean),
  ];
  const references = new Map();
  rawRecords.forEach((row, index) => {
    const id = playerId(row);
    if (id) references.set(rowKey("record", row, index), id);
  });
  rawMissing.forEach((row, index) => {
    const id = playerId(row);
    if (id) references.set(rowKey("missing", row, index), id);
  });

  const attendanceDate = safeDate(daily.attendanceDate || enhanced.attendanceDate)
    || new Intl.DateTimeFormat("en-CA", {
      timeZone: safeText(daily.timezone || enhanced.timezone, 80) || "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  const timezone = safeText(daily.timezone || enhanced.timezone, 80) || "Asia/Seoul";
  const model = Object.freeze({
    attendanceDate,
    timezone,
    generatedAt: safeTimestamp(daily.generatedAt || enhanced.generatedAt),
    rows: Object.freeze(rows),
    summary: normalizeSummary(rows, daily, enhanced),
    lock: normalizedLock(daily, enhanced),
    isEmpty: rows.length === 0,
  });
  return { model, references };
}

/** Public Attendance projection; internal player UUID references are deliberately omitted. */
export function normalizeAttendanceReadModel(result) {
  return normalizeAttendancePayload(result).model;
}

function safeError(error) {
  return isAdminErrorEnvelope(error) ? error : normalizeAdminError(error, { fieldErrors: error?.fieldErrors });
}

function scannerState(overrides = {}) {
  return Object.freeze({
    status: "ready",
    accepting: true,
    message: "Scanner ready.",
    detail: "",
    ...overrides,
  });
}

function mutationResultPayload(result) {
  return isRecord(result?.data) ? result.data : isRecord(result) ? result : {};
}

function safeScanOutcome(result) {
  const payload = mutationResultPayload(result);
  const player = isRecord(payload.player) ? payload.player : {};
  const attendance = isRecord(payload.attendance) ? payload.attendance : {};
  const reward = isRecord(payload.reward) ? payload.reward : {};
  const amount = safeNumber(reward.amount);
  const currency = safeText(reward.currencyCode, 16).toUpperCase();
  const created = attendance.wasCreated !== false;
  const status = normalizedStatus(attendance, "present");
  return Object.freeze({
    name: safeText(player.displayName, 240) || "Player",
    status,
    created,
    rewardText: amount === null ? "" : `${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}${currency ? ` ${currency}` : ""}`,
  });
}

/** Owns Attendance reads, scanner timing, supported corrections/actions, idempotency, and cancellation. */
export function createAttendanceController({
  api,
  selectedGameId,
  hasPermission = () => false,
  onChange = () => {},
  notify = () => {},
  cryptoObject = globalThis.crypto,
  setTimeoutImpl = globalThis.setTimeout?.bind(globalThis),
  clearTimeoutImpl = globalThis.clearTimeout?.bind(globalThis),
} = {}) {
  for (const method of [
    "readAttendance",
    "scanAttendance",
    "correctAttendance",
    "saveAttendanceNote",
    "adjustAttendanceReward",
    "setAttendanceLock",
  ]) {
    if (typeof api?.[method] !== "function") throw new TypeError(`Attendance API ${method} is unavailable.`);
  }

  let state = createAdminDataState();
  let scanner = scannerState();
  let requestVersion = 0;
  let mutationSequence = 0;
  let destroyed = false;
  let currentView = null;
  let playerReferences = new Map();
  const activeMutations = new Set();
  const pendingIdempotency = new Map();
  const timers = new Set();

  function publish() {
    if (!destroyed) onChange(state);
  }

  function setScanner(next) {
    scanner = scannerState({ ...scanner, ...next });
    publish();
  }

  function schedule(callback, delay) {
    if (typeof setTimeoutImpl !== "function") return null;
    const timer = setTimeoutImpl(() => {
      timers.delete(timer);
      if (!destroyed) callback();
    }, delay);
    timers.add(timer);
    return timer;
  }

  async function load() {
    if (destroyed || !hasPermission("attendance.manage")) return state;
    api.cancelAttendanceRequest?.();
    requestVersion += 1;
    const version = requestVersion;
    state = beginAdminDataLoad(state, { requestVersion: version });
    publish();
    try {
      const result = await api.readAttendance({ gameId: selectedGameId });
      if (destroyed || version !== requestVersion || result?.current === false) return state;
      const normalized = normalizeAttendancePayload(result);
      playerReferences = normalized.references;
      state = resolveAdminDataLoad(state, normalized.model, {
        empty: normalized.model.isEmpty,
        requestVersion: version,
      });
    } catch (error) {
      if (destroyed || version !== requestVersion) return state;
      state = rejectAdminDataLoad(state, safeError(error), { requestVersion: version });
    }
    publish();
    return state;
  }

  function nextIdempotencyKey(action) {
    mutationSequence += 1;
    const uuid = String(cryptoObject?.randomUUID?.() || "").trim().toLowerCase();
    if (!UUID_PATTERN.test(uuid)) throw createAdminErrorEnvelope({ code: "INVALID_REQUEST", retryable: false });
    return `admin.attendance.${action}.${uuid}.${mutationSequence}`.slice(0, 159);
  }

  function resolvePlayer(rowKeyValue) {
    return playerReferences.get(String(rowKeyValue || "")) || "";
  }

  async function mutate({ fingerprint, action, request, successTitle, successMessage }) {
    if (destroyed || !hasPermission("attendance.manage")) {
      return { ok: false, error: createAdminErrorEnvelope({ code: "PERMISSION_DENIED", retryable: false }) };
    }
    if (activeMutations.has(fingerprint)) {
      return { ok: false, busy: true, error: createAdminErrorEnvelope({ code: "CONFLICT", retryable: false }) };
    }
    let key = pendingIdempotency.get(fingerprint);
    try {
      if (!key) {
        key = nextIdempotencyKey(action);
        pendingIdempotency.set(fingerprint, key);
      }
    } catch (error) {
      return { ok: false, error: safeError(error) };
    }

    activeMutations.add(fingerprint);
    try {
      const result = await request(key);
      pendingIdempotency.delete(fingerprint);
      if (!destroyed && successTitle) notify({ tone: "success", title: successTitle, message: successMessage });
      if (!destroyed) schedule(() => void load(), 0);
      return { ok: true, result };
    } catch (error) {
      const envelope = safeError(error);
      if (!envelope.retryable) pendingIdempotency.delete(fingerprint);
      if (!destroyed && successTitle) notify({ tone: "error", title: `${successTitle} failed`, message: envelope.userMessage });
      return { ok: false, error: envelope };
    } finally {
      activeMutations.delete(fingerprint);
    }
  }

  async function submitScan(scanValue) {
    const value = String(scanValue || "").trim();
    if (!value || !scanner.accepting || destroyed || !hasPermission("attendance.manage")) {
      return { ok: false, ignored: true };
    }
    scanner = scannerState({ status: "submitting", accepting: false, message: "Checking attendance…" });
    publish();

    let key;
    try {
      key = nextIdempotencyKey("scan");
      const result = await api.scanAttendance({
        gameId: selectedGameId,
        scanValue: value,
        deviceTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Seoul",
        idempotencyKey: key,
      });
      const outcome = safeScanOutcome(result);
      const reward = outcome.rewardText ? ` · Reward ${outcome.rewardText}` : "";
      scanner = scannerState({
        status: "success",
        accepting: false,
        message: outcome.created ? `${outcome.name} checked in.` : `${outcome.name} was already recorded.`,
        detail: `${outcome.status}${reward}`,
      });
      publish();
      schedule(() => setScanner({ accepting: true }), SCANNER_REARM_MS);
      schedule(() => setScanner({ status: "ready", message: "Scanner ready.", detail: "" }), SUCCESS_RESET_MS);
      schedule(() => void load(), 0);
      return { ok: true, result: outcome };
    } catch (error) {
      const envelope = safeError(error);
      scanner = scannerState({ status: "error", accepting: false, message: envelope.userMessage, detail: "Scan not recorded." });
      publish();
      schedule(() => setScanner({ accepting: true }), SCANNER_REARM_MS);
      schedule(() => setScanner({ status: "ready", message: "Scanner ready.", detail: "" }), ERROR_RESET_MS);
      return { ok: false, error: envelope };
    }
  }

  function correct(rowKeyValue, status, note = "") {
    const normalizedStatusValue = String(status || "").toLowerCase();
    const id = resolvePlayer(rowKeyValue);
    if (!id || !CORRECTION_STATUSES.has(normalizedStatusValue) || !state.data?.attendanceDate) {
      return Promise.resolve({ ok: false, error: createAdminErrorEnvelope({ code: "VALIDATION_FAILED", retryable: false }) });
    }
    return mutate({
      fingerprint: `correction:${rowKeyValue}:${normalizedStatusValue}:${String(note || "").trim()}`,
      action: "correction",
      request: (key) => api.correctAttendance({
        gameId: selectedGameId,
        playerId: id,
        attendanceDate: state.data.attendanceDate,
        status: normalizedStatusValue,
        note: String(note || "").trim() || undefined,
        idempotencyKey: key,
      }),
      successTitle: "Attendance corrected",
      successMessage: "The authoritative attendance record was updated.",
    });
  }

  function saveNote(rowKeyValue, note) {
    const id = resolvePlayer(rowKeyValue);
    const normalizedNote = String(note || "").trim();
    if (!id || !normalizedNote || !state.data?.attendanceDate) {
      return Promise.resolve({ ok: false, error: createAdminErrorEnvelope({ code: "VALIDATION_FAILED", retryable: false }) });
    }
    return mutate({
      fingerprint: `note:${rowKeyValue}:${normalizedNote}`,
      action: "note",
      request: (key) => api.saveAttendanceNote({
        gameId: selectedGameId,
        playerId: id,
        attendanceDate: state.data.attendanceDate,
        note: normalizedNote,
        idempotencyKey: key,
      }),
      successTitle: "Attendance note saved",
      successMessage: "The note was saved to the authoritative attendance record.",
    });
  }

  function adjustReward(rowKeyValue, input = {}) {
    const id = resolvePlayer(rowKeyValue);
    const amount = Number(input.amount);
    const currencyCode = String(input.currencyCode || "ECO").trim().toUpperCase();
    const accountType = String(input.accountType || "checking").trim().toLowerCase();
    if (!id || !Number.isFinite(amount) || amount === 0 || !state.data?.attendanceDate) {
      return Promise.resolve({ ok: false, error: createAdminErrorEnvelope({ code: "VALIDATION_FAILED", retryable: false }) });
    }
    return mutate({
      fingerprint: `reward:${rowKeyValue}:${amount}:${currencyCode}:${accountType}:${String(input.note || "").trim()}`,
      action: "reward-adjustment",
      request: (key) => api.adjustAttendanceReward({
        gameId: selectedGameId,
        playerId: id,
        attendanceDate: state.data.attendanceDate,
        amount,
        currencyCode,
        accountType,
        note: String(input.note || "").trim() || undefined,
        idempotencyKey: key,
      }),
      successTitle: "Attendance reward adjusted",
      successMessage: "The server-authoritative ledger adjustment was recorded.",
    });
  }

  function setDayLocked(locked, reason = "") {
    if (!state.data?.attendanceDate) {
      return Promise.resolve({ ok: false, error: createAdminErrorEnvelope({ code: "VALIDATION_FAILED", retryable: false }) });
    }
    return mutate({
      fingerprint: `lock:${Boolean(locked)}:${state.data.attendanceDate}:${String(reason || "").trim()}`,
      action: locked ? "lock" : "unlock",
      request: (key) => api.setAttendanceLock({
        gameId: selectedGameId,
        attendanceDate: state.data.attendanceDate,
        locked: Boolean(locked),
        reason: String(reason || "").trim() || undefined,
        idempotencyKey: key,
      }),
      successTitle: locked ? "Attendance day locked" : "Attendance day unlocked",
      successMessage: locked ? "Further attendance changes are blocked by the server." : "Attendance changes are available again.",
    });
  }

  function render() {
    if (destroyed) throw new Error("Attendance controller has been destroyed.");
    currentView?.destroy?.();
    currentView = AttendanceRoute({
      state,
      scanner,
      onRefresh: load,
      onScan: submitScan,
      onCorrect: correct,
      onSaveNote: saveNote,
      onAdjustReward: adjustReward,
      onSetLocked: setDayLocked,
    });
    return currentView;
  }

  function deactivate() {
    if (api.cancelAttendanceRequest?.() !== true) return;
    requestVersion += 1;
    if (!state.hasResolved) {
      requestVersion = 0;
      state = createAdminDataState();
      playerReferences = new Map();
    } else if (state.status === ADMIN_DATA_STATES.REFRESHING) {
      state = resolveAdminDataLoad(state, state.data, {
        empty: state.data?.isEmpty === true,
        requestVersion,
        updatedAt: state.updatedAt,
      });
    }
  }

  return Object.freeze({
    load,
    render,
    deactivate,
    getState: () => state,
    getScannerState: () => scanner,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      requestVersion += 1;
      api.cancelAttendanceRequest?.();
      timers.forEach((timer) => clearTimeoutImpl?.(timer));
      timers.clear();
      activeMutations.clear();
      pendingIdempotency.clear();
      playerReferences.clear();
      currentView?.destroy?.();
      currentView = null;
    },
  });
}

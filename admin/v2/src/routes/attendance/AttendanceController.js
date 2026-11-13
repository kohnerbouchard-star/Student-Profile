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

import {
  UUID_PATTERN,
  normalizeAttendancePayload,
  safeScanOutcome,
} from "./AttendanceReadModel.js";
export { normalizeAttendanceReadModel } from "./AttendanceReadModel.js";

const CORRECTION_STATUSES = new Set(["present", "late", "absent", "excused"]);
const SUCCESS_RESET_MS = 1_200;
const ERROR_RESET_MS = 2_000;
const SCANNER_REARM_MS = 250;

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

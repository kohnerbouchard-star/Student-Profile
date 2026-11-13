import { createAdminErrorEnvelope } from "../../core/error-envelope.js";

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_IN_TEXT_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const ATTENDANCE_STATUSES = new Set(["present", "late", "absent", "excused", "missing"]);

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

export function normalizeAttendancePayload(result) {
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

function mutationResultPayload(result) {
  return isRecord(result?.data) ? result.data : isRecord(result) ? result : {};
}

export function safeScanOutcome(result) {
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

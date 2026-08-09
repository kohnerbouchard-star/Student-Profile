import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createAttendanceApi } from "../admin/v2/src/routes/attendance/AttendanceApi.js";
import {
  createAttendanceController,
  normalizeAttendanceReadModel,
} from "../admin/v2/src/routes/attendance/AttendanceController.js";

const GAME_ID = "10000000-0000-4000-8000-000000000001";
const PLAYER_ID = "20000000-0000-4000-8000-000000000002";
const RECORD_ID = "30000000-0000-4000-8000-000000000003";

function jsonResponse(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    status: init.status || 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers || {}),
    },
  });
}

function today(overrides = {}) {
  return {
    attendanceDate: "2026-08-07",
    timezone: "Asia/Seoul",
    attendanceRows: [{
      id: RECORD_ID,
      playerId: PLAYER_ID,
      displayName: "김민서 Very Long Korean Player Name That Must Wrap Safely",
      rosterLabel: "A-01",
      status: "present",
      clockedInAt: "2026-08-07T07:20:00.000Z",
      source: "scanner",
      note: null,
      player: {
        id: PLAYER_ID,
        displayName: "김민서 Very Long Korean Player Name That Must Wrap Safely",
        rosterLabel: "A-01",
        status: "active",
      },
    }, {
      id: `missing:40000000-0000-4000-8000-000000000004:2026-08-07`,
      playerId: "40000000-0000-4000-8000-000000000004",
      displayName: "박지훈",
      rosterLabel: "A-02",
      status: "absent",
      clockedInAt: null,
      source: "not_scanned",
      note: null,
      player: {
        id: "40000000-0000-4000-8000-000000000004",
        displayName: "박지훈",
        rosterLabel: "A-02",
        status: "active",
      },
    }],
    attendanceSummary: {
      presentCount: 1,
      lateCount: 0,
      absentCount: 1,
      excusedCount: 0,
      missingCount: 1,
      activePlayerCount: 2,
    },
    attendanceLocked: false,
    attendanceLock: null,
    ...overrides,
  };
}

function readResult(overrides = {}) {
  return { enhanced: today(overrides), current: true };
}

function rosterRows(count) {
  return Array.from({ length: count }, (_, index) => {
    const id = `50000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
    return {
      id: `missing:${id}:2026-08-07`,
      playerId: id,
      displayName: index === 0
        ? "김하늘 — 국제 경제 시뮬레이션 연구 프로젝트 참가자"
        : `학생 ${index + 1}`,
      rosterLabel: `R-${index + 1}`,
      status: "absent",
      source: "not_scanned",
      player: {
        id,
        displayName: index === 0
          ? "김하늘 — 국제 경제 시뮬레이션 연구 프로젝트 참가자"
          : `학생 ${index + 1}`,
        rosterLabel: `R-${index + 1}`,
        status: "active",
      },
    };
  });
}

test("Attendance client uses the exact authoritative Admin BFF today route", async () => {
  const calls = [];
  const api = createAttendanceApi({
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return jsonResponse({ data: today() });
    },
  });

  const result = await api.readAttendance({ gameId: GAME_ID });
  assert.equal(result.current, true);
  assert.deepEqual(calls.map(({ url }) => url), [
    `/api/admin/games/${GAME_ID}/attendance/today`,
  ]);
  calls.forEach(({ init }) => {
    assert.equal(init.method, "GET");
    assert.equal(init.credentials, "include");
    assert.equal(init.cache, "no-store");
    assert.equal(init.redirect, "error");
    assert.equal(new Headers(init.headers).has("authorization"), false);
  });
  assert.equal(api.checkOutAttendance, undefined);
  assert.equal(api.deleteAttendance, undefined);
});

test("Attendance mutations preserve exact existing action paths and idempotency", async () => {
  const calls = [];
  const api = createAttendanceApi({
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return jsonResponse({ data: { ok: true } });
    },
  });
  const base = { gameId: GAME_ID, idempotencyKey: "attendance.test.12345678" };
  await api.scanAttendance({ ...base, scanValue: "RFID-77", deviceTimezone: "Asia/Seoul" });
  await api.correctAttendance({ ...base, playerId: PLAYER_ID, attendanceDate: "2026-08-07", status: "late", note: "Bus delay" });
  await api.saveAttendanceNote({ ...base, playerId: PLAYER_ID, attendanceDate: "2026-08-07", note: "Parent notified" });
  await api.adjustAttendanceReward({ ...base, playerId: PLAYER_ID, attendanceDate: "2026-08-07", amount: 1, currencyCode: "ECO", accountType: "checking" });
  await api.setAttendanceLock({ ...base, attendanceDate: "2026-08-07", locked: true, reason: "Day complete" });

  assert.deepEqual(calls.map(({ url }) => url), [
    `/api/admin/games/${GAME_ID}/attendance/scan`,
    `/api/admin/games/${GAME_ID}/attendance/corrections`,
    `/api/admin/games/${GAME_ID}/attendance/notes`,
    `/api/admin/games/${GAME_ID}/attendance/reward-adjustments`,
    `/api/admin/games/${GAME_ID}/attendance/lock`,
  ]);
  calls.forEach(({ init }) => {
    const headers = new Headers(init.headers);
    assert.equal(init.method, "POST");
    assert.equal(headers.get("Idempotency-Key"), "attendance.test.12345678");
    assert.equal(headers.has("authorization"), false);
  });
  assert.equal(JSON.parse(calls[0].init.body).playerId, "RFID-77");
  assert.equal(JSON.parse(calls[1].init.body).status, "late");
  assert.equal(JSON.parse(calls[3].init.body).accountType, "checking");
  assert.equal(JSON.parse(calls[4].init.body).locked, true);
});

test("Attendance scanner preserves successful and duplicate server outcomes", async () => {
  const responses = [{
    player: { displayName: "김민서" },
    attendance: {
      status: "present",
      attendanceDate: "2026-08-07",
      clockedInAt: "2026-08-07T07:20:00.000Z",
      wasCreated: true,
    },
    reward: { amount: 5, currencyCode: "ECO" },
  }, {
    player: { displayName: "김민서" },
    attendance: {
      status: "present",
      attendanceDate: "2026-08-07",
      clockedInAt: "2026-08-07T07:20:00.000Z",
      wasCreated: false,
    },
    reward: { amount: 0, currencyCode: "ECO" },
  }];
  let call = 0;
  const api = createAttendanceApi({
    fetchImpl: async () => jsonResponse(responses[call++]),
  });
  const base = {
    gameId: GAME_ID,
    scanValue: "PLAYER-ACCESS-77",
    deviceTimezone: "Asia/Seoul",
    idempotencyKey: "attendance.scan.12345678",
  };

  const success = await api.scanAttendance(base);
  const duplicate = await api.scanAttendance({
    ...base,
    idempotencyKey: "attendance.scan.87654321",
  });

  assert.equal(success.player.displayName, "김민서");
  assert.equal(success.attendance.wasCreated, true);
  assert.equal(success.attendance.status, "present");
  assert.equal(success.reward.amount, 5);
  assert.equal(duplicate.attendance.wasCreated, false);
  assert.equal(duplicate.attendance.clockedInAt, success.attendance.clockedInAt);
});

test("Attendance scanner failures are safely normalized and do not expose backend detail", async () => {
  const rawDetail = "SELECT credential FROM private.attendance USING service_role";
  const api = createAttendanceApi({
    fetchImpl: async () => jsonResponse({
      error: {
        code: "internal_attendance_scan_failure",
        message: rawDetail,
        details: rawDetail,
        requestId: "attendance-scan-req-1",
      },
    }, { status: 503 }),
  });

  await assert.rejects(
    () => api.scanAttendance({
      gameId: GAME_ID,
      scanValue: "RFID-FAIL-1",
      deviceTimezone: "Asia/Seoul",
      idempotencyKey: "attendance.scan.failure.12345678",
    }),
    (error) => {
      assert.equal(error.code, "SERVICE_UNAVAILABLE");
      assert.equal(error.userMessage.includes(rawDetail), false);
      assert.equal(JSON.stringify(error).includes(rawDetail), false);
      return true;
    },
  );
});

test("Attendance client normalizes unsafe backend read failures", async () => {
  const rawDetail = "SELECT secret FROM private_table USING service_role";
  const api = createAttendanceApi({
    fetchImpl: async () => jsonResponse({
      code: "internal_attendance_failure",
      message: rawDetail,
      details: rawDetail,
      requestId: "attendance-req-1",
    }, { status: 503 }),
  });
  await assert.rejects(
    () => api.readAttendance({ gameId: GAME_ID }),
    (error) => {
      assert.equal(error.code, "SERVICE_UNAVAILABLE");
      assert.equal(error.userMessage.includes(rawDetail), false);
      assert.equal(JSON.stringify(error).includes(rawDetail), false);
      return true;
    },
  );
});

test("Attendance read model handles 0, 1, and 48-player rosters with long Korean names and no UUID leakage", () => {
  const normal = normalizeAttendanceReadModel(readResult());
  const serialized = JSON.stringify(normal);
  assert.equal(normal.rows.length, 2);
  assert.equal(normal.rows[0].displayName.startsWith("김민서"), true);
  assert.equal(normal.rows[1].attendanceStatus, "absent");
  assert.equal(serialized.includes(PLAYER_ID), false);
  assert.equal(serialized.includes(RECORD_ID), false);
  assert.equal(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(serialized), false);

  const empty = normalizeAttendanceReadModel(readResult({ attendanceRows: [], attendanceSummary: {} }));
  assert.equal(empty.isEmpty, true);
  assert.equal(empty.rows.length, 0);

  const oneRows = rosterRows(1);
  const one = normalizeAttendanceReadModel(readResult({
    attendanceRows: oneRows,
    attendanceSummary: { activePlayerCount: 1, absentCount: 1 },
  }));
  assert.equal(one.rows.length, 1);
  assert.equal(one.rows[0].displayName.startsWith("김하늘"), true);
  assert.equal(one.summary.activePlayerCount, 1);

  const largeRows = rosterRows(48);
  const large = normalizeAttendanceReadModel(readResult({
    attendanceRows: largeRows,
    attendanceSummary: { activePlayerCount: 48, absentCount: 48 },
  }));
  assert.equal(large.rows.length, 48);
  assert.equal(large.summary.activePlayerCount, 48);
  assert.equal(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(JSON.stringify(large)), false);
});

test("Attendance controller fails closed on permission denial and owns empty/stale retry states", async () => {
  let reads = 0;
  let allowed = false;
  let next = readResult({ attendanceRows: [], attendanceSummary: {} });
  const api = {
    async readAttendance() {
      reads += 1;
      if (next instanceof Error) throw next;
      return next;
    },
    cancelAttendanceRequest() { return false; },
    async scanAttendance() { return {}; },
    async correctAttendance() { return {}; },
    async saveAttendanceNote() { return {}; },
    async adjustAttendanceReward() { return {}; },
    async setAttendanceLock() { return {}; },
  };
  const controller = createAttendanceController({
    api,
    selectedGameId: GAME_ID,
    hasPermission: () => allowed,
  });

  await controller.load();
  assert.equal(reads, 0);
  assert.equal(controller.getState().requestVersion, 0);

  allowed = true;
  await controller.load();
  assert.equal(reads, 1);
  assert.equal(controller.getState().status, "empty");

  const failure = new Error("private backend failure");
  failure.status = 503;
  next = failure;
  await controller.load();
  assert.equal(controller.getState().status, "stale");
  assert.equal(controller.getState().error.code, "SERVICE_UNAVAILABLE");
  controller.destroy();
});

test("Attendance scanner source preserves legacy timing, keyboard focus, and responsive desktop/tablet/mobile behavior", async () => {
  const controllerSource = await readFile(new URL("../admin/v2/src/routes/attendance/AttendanceController.js", import.meta.url), "utf8");
  const routeSource = await readFile(new URL("../admin/v2/src/routes/attendance/AttendanceRoute.js", import.meta.url), "utf8");
  const cssSource = await readFile(new URL("../admin/v2/styles/routes/attendance.css", import.meta.url), "utf8");

  assert.match(controllerSource, /SUCCESS_RESET_MS\s*=\s*1_200/);
  assert.match(controllerSource, /ERROR_RESET_MS\s*=\s*2_000/);
  assert.match(controllerSource, /SCANNER_REARM_MS\s*=\s*250/);
  assert.match(routeSource, /form\.addEventListener\("submit"/);
  assert.match(routeSource, /input\.focus\(\{ preventScroll: true \}\)/);
  assert.match(routeSource, /autocomplete:\s*"off"/);
  assert.match(routeSource, /Scan RFID \/ player code/);
  assert.doesNotMatch(routeSource, /check.?out/i);
  assert.match(cssSource, /@media \(max-width: 1100px\)/);
  assert.match(cssSource, /@media \(max-width: 760px\)/);
  assert.match(cssSource, /overflow-wrap:\s*anywhere/);
});

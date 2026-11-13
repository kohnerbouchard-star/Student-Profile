import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  createAttendanceController,
  normalizeAttendanceReadModel,
} from "../admin/v2/src/routes/attendance/AttendanceController.js";

const PLAYER_A = "20000000-0000-4000-8000-000000000001";
const PLAYER_B = "20000000-0000-4000-8000-000000000002";
const GAME = "10000000-0000-4000-8000-000000000001";
const DATE = "2026-11-13";
const payload = (daily = {}, enhanced = {}) => ({ daily: { attendanceDate: DATE, ...daily }, enhanced });

function controllerHarness(readAttendance) {
  const calls = [];
  const timers = new Map();
  let timerId = 0;
  const api = {
    readAttendance,
    cancelAttendanceRequest: () => false,
    scanAttendance: async (request) => { calls.push(["scan", request]); return {}; },
    correctAttendance: async (request) => { calls.push(["correct", request]); return {}; },
    saveAttendanceNote: async (request) => { calls.push(["note", request]); return {}; },
    adjustAttendanceReward: async (request) => { calls.push(["reward", request]); return {}; },
    setAttendanceLock: async (request) => { calls.push(["lock", request]); return {}; },
  };
  const controller = createAttendanceController({
    api, selectedGameId: GAME, hasPermission: () => true,
    cryptoObject: { randomUUID: () => "30000000-0000-4000-8000-000000000001" },
    setTimeoutImpl: (callback, delay) => { timers.set(++timerId, { callback, delay }); return timerId; },
    clearTimeoutImpl: (id) => timers.delete(id),
  });
  return { controller, api, calls, timers };
}

test("Attendance projection preserves payload precedence, aliases and frozen safe display fields", () => {
  const result = payload({
    records: [{ player: { id: PLAYER_A, display_name: " 가나 ", roster_label: " A 1 ", status: "ACTIVE" },
      attendanceStatus: "LATE", clocked_in_at: "2026-11-13T09:00:00+09:00", corrected_at: "invalid",
      source: " STAFF ", note: `private ${PLAYER_B}` }],
    attendanceRows: [{ displayName: "ignored" }],
    missingPlayers: [{ playerId: PLAYER_B, displayName: "Same", rosterLabel: "A 1" }],
    timezone: "Asia/Seoul", generatedAt: "2026-11-13T10:00:00+09:00",
    summary: { presentCount: "4", missingCount: "bad", activePlayerCount: 99 },
    attendanceLock: { reason: "daily ignored" },
  }, { attendanceRows: [{ displayName: "also ignored" }], attendanceLocked: true,
    attendanceLock: { reason: " Closed ", locked_at: "2026-11-13T10:00:00+09:00" } });
  const original = structuredClone(result);
  const model = normalizeAttendanceReadModel(result);
  assert.equal(model.rows.length, 2);
  assert.deepEqual(model.rows[0], { rowKey: "record-a-1-1", displayName: "가나", rosterLabel: "A 1",
    playerStatus: "active", attendanceStatus: "late", clockedInAt: "2026-11-13T00:00:00.000Z",
    source: "staff", note: "", correctedAt: "", isMissing: false });
  assert.equal(model.rows[1].rowKey, "missing-a-1-1");
  assert.equal(model.rows[1].attendanceStatus, "missing");
  assert.deepEqual(model.summary, { presentCount: 4, lateCount: 1, absentCount: 0, excusedCount: 0, missingCount: 1, activePlayerCount: 99 });
  assert.deepEqual(model.lock, { locked: true, reason: "Closed", lockedAt: "2026-11-13T01:00:00.000Z", unlockedAt: "" });
  assert.equal(model.generatedAt, "2026-11-13T01:00:00.000Z");
  for (const value of [model, model.rows, ...model.rows, model.summary, model.lock]) assert.ok(Object.isFrozen(value));
  assert.deepEqual(result, original);
  assert.equal(JSON.stringify(model).includes(PLAYER_A), false);
  assert.equal(JSON.stringify(model).includes(PLAYER_B), false);
});

test("Attendance projection caps each list, filters invalid rows and preserves indexed duplicate keys", () => {
  const records = [null, [], ...Array.from({ length: 2_001 }, () => ({ displayName: "Duplicate", status: "invalid" }))];
  const model = normalizeAttendanceReadModel(payload({ records, missingPlayers: Array.from({ length: 2_001 }, () => ({ displayName: "Duplicate" })) }));
  assert.equal(model.rows.length, 3_998);
  assert.equal(model.rows[0].rowKey, "record-duplicate-3");
  assert.equal(model.rows[0].attendanceStatus, "absent");
  assert.equal(model.rows.at(-1).rowKey, "missing-duplicate-2000");
  assert.equal(new Set(model.rows.map((row) => row.rowKey)).size, 3_998);
  assert.equal(model.summary.absentCount, 1_998);
  assert.equal(model.summary.missingCount, 2_000);
});

test("Attendance controller exposes safe projections across sequential loads and clears timers on destroy", async () => {
  let next = payload({ records: [{ playerId: PLAYER_A, displayName: "Student A" }] });
  const h = controllerHarness(async () => next);
  await h.controller.load();
  const model = h.controller.getState().data;
  assert.equal(JSON.stringify(model).includes(PLAYER_A), false);
  const row = model.rows[0].rowKey;
  assert.ok(h.controller.getState().hasResolved);
  next = payload({ records: [{ playerId: PLAYER_B, displayName: "Student B" }] });
  await h.controller.load();
  assert.notEqual(h.controller.getState().data.rows[0].rowKey, row);
  assert.equal(JSON.stringify(h.controller.getState()).includes(PLAYER_B), false);
  h.controller.destroy();
  assert.equal(h.timers.size, 0);
  assert.deepEqual(h.calls, []);
});

test("Attendance extraction retains complete normalization and controller function bodies", async () => {
  const expected = JSON.parse(readFileSync("scripts/fixtures/admin-attendance-controller-function-hashes.json", "utf8"));
  const actual = {};
  for (const file of ["AttendanceController.js", "AttendanceReadModel.js"]) {
    const source = readFileSync(`admin/v2/src/routes/attendance/${file}`, "utf8");
    for (const match of source.matchAll(/^(?:export )?function (\w+)\(/gm)) {
      const end = match.index + source.slice(match.index).match(/^}$/m).index + 1;
      assert.equal(actual[match[1]], undefined, `Duplicate ${match[1]}`);
      actual[match[1]] = createHash("sha256").update(source.slice(match.index, end).replace(/^export /, "")).digest("hex");
    }
  }
  assert.deepEqual(actual, expected);
  assert.deepEqual(Object.keys(await import("../admin/v2/src/routes/attendance/AttendanceController.js")),
    ["createAttendanceController", "normalizeAttendanceReadModel"]);
});

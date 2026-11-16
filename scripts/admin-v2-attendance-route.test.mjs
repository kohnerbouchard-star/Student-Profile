import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { createAttendanceRouteHarness, attendanceModel } from "./fixtures/admin-attendance-route-harness.mjs";

const scannerState = () => ({ accepting: true, status: "idle", message: "Ready for scan", detail: "Synthetic input only" });
function ready({ model = attendanceModel(), status = "ready", scanner = scannerState(), ...options } = {}) {
  const h = createAttendanceRouteHarness();
  const route = h.AttendanceRoute({ state: { status, data: model }, scanner, ...options });
  return { ...h, route, model, scanner };
}
async function select(h, value = "attendance-player-1") { h.fields.get("attendance-player").value = value; await h.fields.get("attendance-player").control.dispatch("change"); }
const actionStatus = (h) => h.nodes.findLast((node) => node.className === "admin-attendance-route__action-status");

test("Attendance retains its sole public route export", async () => {
  assert.deepEqual(Object.keys(await import("../admin/v2/src/routes/attendance/AttendanceRoute.js")), ["AttendanceRoute"]);
});

test("Attendance read-panel extraction preserves every complete function and correction option", () => {
  // Recorded before extraction from unchanged main b77c9610.
  const expected = JSON.parse(readFileSync("scripts/fixtures/admin-attendance-function-hashes.json", "utf8"));
  const directory = "admin/v2/src/routes/attendance", actual = {}; let combined = "";
  for (const file of readdirSync(directory).filter((name) => /^Attendance(?:Route|ReadPanels)\.js$/.test(name))) {
    const source = readFileSync(`${directory}/${file}`, "utf8"); combined += source;
    for (const match of source.matchAll(/^(?:export )?function (\w+)\(/gm)) {
      const end = match.index + source.slice(match.index).match(/^}$/m).index + 1;
      assert.equal(actual[match[1]], undefined, `Duplicate ${match[1]}`);
      actual[match[1]] = createHash("sha256").update(source.slice(match.index, end).replace(/^export /, "")).digest("hex");
    }
  }
  assert.deepEqual(actual, expected);
  assert.equal(combined.match(/const CORRECTION_OPTIONS = .*;/g)?.length, 1);
  assert.ok(combined.includes('const CORRECTION_OPTIONS = ["present", "late", "absent", "excused"];'));
});

for (const status of ["initial-loading", "failed", "empty", "ready", "refreshing", "stale"]) {
  test(`Attendance ${status} keeps accessible state, retry and destruction ownership`, async () => {
    const h = createAttendanceRouteHarness(); let calls = 0;
    const model = attendanceModel(); if (status === "empty") { model.rows = []; model.isEmpty = true; }
    const route = h.AttendanceRoute({ state: { status, data: model, error: { userMessage: "Unavailable", requestId: "safe-request", retryAfterSeconds: 9, retryable: true } }, scanner: scannerState(), onRefresh: () => { calls += 1; } });
    const content = h.frames[0].options.content;
    assert.equal(h.frames[0].options.title, "Attendance");
    assert.equal(content.dataset.adminV2State, status);
    assert.equal(content.attrs["aria-busy"], ["initial-loading", "refreshing"].includes(status));
    const refresh = h.frames[0].options.actions[0]; assert.equal(refresh.disabled, status === "refreshing");
    await refresh.dispatch("click"); assert.equal(calls, 1);
    if (status === "initial-loading") { assert.equal(content.children[0].attrs["aria-label"], "Loading Attendance"); assert.equal(content.children[0].attrs.role, "status"); }
    if (status === "failed") { assert.equal(content.children[0].kind, "error"); assert.equal(content.children[0].options.retryAfterSeconds, 9); await content.children[0].options.retry.onClick(); assert.equal(calls, 2); }
    if (status === "empty") { assert.equal(content.children[0].children.at(-1).kind, "empty"); assert.equal(h.tables.length, 0); }
    if (status === "refreshing") assert.equal(content.children[0].attrs.role, "status");
    if (status === "stale") { assert.equal(content.children[0].kind, "stale"); await content.children[0].options.retry.onClick(); assert.equal(calls, 2); }
    route.destroy(); route.destroy();
    if (h.confirmations.length) assert.equal(h.confirmations[0].destroyed, 1);
  });
}

test("Attendance non-retryable failure does not offer a retry action", () => {
  const h = createAttendanceRouteHarness(); h.AttendanceRoute({ state: { status: "failed", error: { retryable: false } } });
  assert.equal(h.frames[0].options.content.children[0].options.retry, null);
});

test("Attendance read panels preserve summary, roster, time zone, Unicode and public row identity", () => {
  const h = ready(); const content = h.frames[0].options.content.children[0];
  assert.deepEqual(content.children.map((node) => node.className), ["admin-attendance-route__summary", "admin-attendance-route__scanner", "admin-attendance-route__lock-panel", "admin-attendance-route__roster", "admin-attendance-route__actions-panel"]);
  const metrics = content.children[0]; assert.equal(metrics.attrs["aria-label"], "Attendance summary");
  assert.deepEqual(metrics.children.map((node) => node.children[0].textContent), ["Present", "Late", "Absent", "Excused", "Missing"]);
  assert.deepEqual(metrics.children.map((node) => node.children[1].textContent), ["1", "0", "1", "0", "1"]);
  const table = h.tables[0];
  assert.equal(table.options.caption, "Attendance roster for 2026-11-10");
  assert.deepEqual(table.options.columns.map((column) => column.key), ["displayName", "attendanceStatus", "clockedInAt", "source", "note"]);
  assert.equal(table.options.columns[0].rowHeader, true); assert.strictEqual(table.rows, h.model.rows);
  assert.equal(table.options.rowKey(table.rows[0]), "attendance-player-1");
  assert.equal(table.cells[0][0].children[0].textContent, "가상 학생");
  assert.equal(table.cells[0][2], "10:00:00 AM"); assert.equal(table.cells[1][2], "—");
  assert.equal(table.cells[1][3], "Not Scanned"); assert.equal(table.cells[1][4], "—");
  assert.equal(table.options.columns[2].sortValue(table.rows[0]), Date.parse("2026-11-10T01:00:00Z"));
});

for (const mode of ["invalid time", "invalid timezone"]) {
  test(`Attendance ${mode} has the original safe display fallback`, () => {
    const model = attendanceModel();
    if (mode === "invalid time") model.rows[0].clockedInAt = "not-a-date";
    else model.timezone = "invalid/timezone";
    const h = ready({ model }); assert.equal(h.tables[0].cells[0][2], "—");
  });
}

test("Attendance selection stays explicit and updates the read-only selected-player card", async () => {
  const h = ready(); const field = h.fields.get("attendance-player");
  assert.equal(field.value, ""); assert.equal(field.options.options[0].disabled, true);
  assert.deepEqual(field.options.options.map((option) => option.value), ["", "attendance-player-1", "attendance-player-2"]);
  for (const action of ["correct", "note", "reward"]) { assert.equal(h.button(action).disabled, true); assert.equal(h.button(action).title, "Select a player first."); }
  assert.equal(h.nodes.find((node) => node.className === "admin-attendance-route__selected-player").dataset.selected, "false");
  await select(h);
  const card = h.nodes.findLast((node) => node.className === "admin-attendance-route__selected-player");
  assert.equal(card.dataset.selected, "true"); assert.equal(card.children[1].children[0].textContent, "가상 학생");
  assert.equal(card.children[1].children[1].textContent, "Class A · Present");
  for (const action of ["correct", "note", "reward"]) assert.equal(h.button(action).disabled, false);
  await select(h, "missing"); for (const action of ["correct", "note", "reward"]) assert.equal(h.button(action).disabled, true);
});

test("Attendance locked days keep selected actions and scanner unavailable", async () => {
  const model = attendanceModel(); model.lock = { locked: true, reason: "Synthetic lock" };
  const h = ready({ model }); await select(h);
  for (const action of ["correct", "note", "reward"]) { assert.equal(h.button(action).disabled, true); assert.match(h.button(action).title, /Unlock the attendance day/); }
  const input = h.nodes.find((node) => node.id === "adminAttendanceScannerInput");
  assert.equal(input.disabled, true); assert.deepEqual(input.focuses, []);
});

test("Attendance scanner and explicit focus intent retain original submission and busy ownership", async () => {
  let resolve; const pending = new Promise((yes) => { resolve = yes; }); const calls = [];
  const h = ready({ onScan: (value) => { calls.push(value); return pending; } });
  const input = h.nodes.find((node) => node.id === "adminAttendanceScannerInput");
  const form = h.nodes.find((node) => node.className === "admin-attendance-route__scanner-form");
  await Promise.resolve(); assert.deepEqual(input.focuses, [{ preventScroll: true }]);
  await h.route.element.dispatch("admin-route-intent", { detail: { intent: "focus-scanner" } });
  assert.deepEqual(input.focuses.at(-1), { preventScroll: false });
  input.value = "  SYNTHETIC-CODE  "; const submitted = form.dispatch("submit");
  assert.deepEqual(calls, ["SYNTHETIC-CODE"]); assert.equal(input.value, ""); assert.equal(input.disabled, true);
  resolve(); await submitted; assert.equal(input.disabled, false);
  await form.dispatch("submit"); assert.equal(calls.length, 1);
});

test("Attendance correction selection and busy deduplication preserve exact callback payloads", async () => {
  let resolve; const pending = new Promise((yes) => { resolve = yes; }); const calls = [];
  const h = ready({ onCorrect: (...args) => { calls.push(args); return pending; } });
  await h.button("correct").dispatch("click"); assert.deepEqual(calls, []);
  await select(h); h.fields.get("attendance-correction").value = "excused"; h.fields.get("attendance-correction-note").value = "Synthetic reason";
  const request = h.button("correct").dispatch("click"); await h.button("correct").dispatch("click");
  assert.deepEqual(calls, [["attendance-player-1", "excused", "Synthetic reason"]]);
  assert.equal(h.fields.get("attendance-player").control.disabled, true);
  resolve({ ok: true }); await request;
  assert.equal(actionStatus(h).textContent, "Attendance correction saved."); assert.equal(actionStatus(h).dataset.tone, "success");
  assert.equal(h.fields.get("attendance-player").control.disabled, false);
});

test("Attendance note failure retains safe message and restores editable controls", async () => {
  const calls = []; const h = ready({ onSaveNote: (...args) => { calls.push(args); return { ok: false, error: { userMessage: "Try later" } }; } });
  await select(h); h.fields.get("attendance-admin-note").value = "Synthetic note";
  await h.button("note").dispatch("click"); assert.deepEqual(calls, [["attendance-player-1", "Synthetic note"]]);
  assert.equal(actionStatus(h).textContent, "Try later"); assert.equal(actionStatus(h).dataset.tone, "error");
  assert.equal(h.fields.get("attendance-player").control.disabled, false);
});

test("Attendance rewards validate amount and preserve server-derived currency/account boundary", async () => {
  const calls = []; const h = ready({ onAdjustReward: (...args) => { calls.push(args); return { ok: true }; } }); await select(h);
  const amount = h.fields.get("attendance-reward-amount"); amount.value = "0";
  await h.button("reward").dispatch("click"); assert.deepEqual(calls, []); assert.equal(amount.focused, 1);
  amount.value = "-1.25"; h.fields.get("attendance-reward-note").value = "Synthetic reward correction";
  await h.button("reward").dispatch("click"); await Promise.resolve();
  assert.deepEqual(calls, [["attendance-player-1", { amount: "-1.25", note: "Synthetic reward correction" }]]);
  assert.equal(h.fields.has("currency"), false); assert.equal(h.fields.has("account"), false);
});

test("Attendance day locking still requires explicit confirmation and preserves reason", async () => {
  const calls = []; const h = ready({ onSetLocked: (...args) => { calls.push(args); return { ok: true }; } });
  h.fields.get("attendance-lock-reason").value = "  Synthetic reason  ";
  const click = h.button("lock-day").dispatch("click"), confirm = h.confirmations[0];
  assert.deepEqual(calls, []); assert.strictEqual(confirm.opens[0], h.button("lock-day"));
  assert.match(confirm.detail, /Reason: Synthetic reason/); assert.equal(confirm.options.tone, "danger");
  assert.equal(await confirm.options.onConfirm(), true);
  assert.deepEqual(calls, [[true, "  Synthetic reason  "]]); confirm.settle(true); await click;
  h.route.destroy(); h.route.destroy(); assert.equal(confirm.destroyed, 1);
});

test("Attendance lock cancellation performs no mutation and failed confirmation rejects", async () => {
  let writes = 0; const h = ready({ onSetLocked: () => { writes += 1; return { ok: false }; } });
  const click = h.button("lock-day").dispatch("click"); h.confirmations[0].settle(false); await click;
  assert.equal(writes, 0); await assert.rejects(h.confirmations[0].options.onConfirm(), /ATTENDANCE_LOCK_FAILED/);
});

test("Attendance unlocking retains pending state, result message and original callback", async () => {
  const model = attendanceModel(); model.lock.locked = true; const calls = [];
  const h = ready({ model, onSetLocked: (...args) => { calls.push(args); return { ok: false, error: { userMessage: "Unable to unlock" } }; } });
  h.fields.get("attendance-lock-reason").value = "Synthetic unlock";
  await h.button("unlock-day").dispatch("click");
  assert.deepEqual(calls, [[false, "Synthetic unlock"]]); assert.equal(h.confirmations[0].opens.length, 0);
  assert.equal(h.button("unlock-day").disabled, false);
  assert.equal(h.nodes.find((node) => node.className === "admin-attendance-route__action-status").textContent, "Unable to unlock");
});

import assert from "node:assert/strict";
import test from "node:test";
import { webcrypto } from "node:crypto";
import { createAdminApiClient } from "../admin/v2/src/api/admin-api-client.js";
import { normalizeRosterImportResult } from "../admin/v2/src/api/player-roster-import.js";
import { createRosterImportController } from "../admin/v2/src/routes/players/RosterImportController.js";

const gameId = "10000000-0000-4000-8000-000000000001";
const names = ["Avery", "Avery"];
const key = "admin.players.roster.synthetic-key";
const fresh = () => ({ data: { createdCount: 2, replayed: false, credentialsAvailable: true, students: names.map((displayName, index) => ({
  row: index + 1, displayName, playerIdentifier: `STU-${String(index + 1).padStart(24, "A")}`,
  accessCode: String(index + 1).padStart(32, "B"), internalId: gameId,
})) } });
const replay = () => { const result = fresh(); result.data.replayed = true; result.data.credentialsAvailable = false; return result; };

test("import uses scoped same-origin BFF with names only and protected transport", async () => {
  let captured;
  const api = createAdminApiClient({ fetchImpl: async (url, init) => {
    captured = { url, init };
    return new Response(JSON.stringify(fresh()), { status: 201, headers: { "content-type": "application/json" } });
  } });
  const result = await api.importPlayerRoster({ gameId, studentNames: names, idempotencyKey: key, file: "not allowed", credentials: "not allowed" });
  assert.equal(captured.url, `/api/admin/games/${gameId}/players/imports/csv`);
  assert.deepEqual(JSON.parse(captured.init.body), { studentNames: names });
  assert.equal(captured.init.credentials, "include");
  assert.equal(captured.init.cache, "no-store");
  assert.equal(captured.init.referrerPolicy, "no-referrer");
  assert.equal(captured.init.redirect, "error");
  assert.equal(new Headers(captured.init.headers).get("Idempotency-Key"), key);
  assert.equal(new Headers(captured.init.headers).has("Authorization"), false);
  assert.equal(result.students.length, 2);
  assert.doesNotMatch(JSON.stringify(result), /internalId|10000000-0000/);
});

test("input rejects extra types, invalid names and missing scope/key before transmission", async () => {
  let requests = 0;
  const api = createAdminApiClient({ fetchImpl: async () => { requests++; throw new Error("unreachable"); } });
  for (const studentNames of [null, [], [123], [" "], ["A\nB"], ["A\ud800"], ["A\udc00"], [gameId], ["a".repeat(241)], Array(201).fill("Name")]) {
    await assert.rejects(api.importPlayerRoster({ gameId, studentNames, idempotencyKey: key }));
  }
  await assert.rejects(api.importPlayerRoster({ gameId: "invalid", studentNames: names, idempotencyKey: key }));
  await assert.rejects(api.importPlayerRoster({ gameId, studentNames: names }));
  assert.equal(requests, 0);
});

test("browser replay projection never reveals access codes even from a malformed extra field", () => {
  const result = normalizeRosterImportResult(replay(), names);
  assert.equal(result.replayed, true);
  assert.doesNotMatch(JSON.stringify(result), /accessCode|internalId/);
});

test("success validates exact ordered names, counts, unique identifiers and credentials", () => {
  for (const change of [
    (data) => { data.createdCount = 1; },
    (data) => { data.students[0].displayName = "Other"; },
    (data) => { data.students[0].row = 2; },
    (data) => { data.students[1].playerIdentifier = data.students[0].playerIdentifier; },
    (data) => { data.students[0].playerIdentifier = gameId; },
    (data) => { data.students[0].accessCode = "short"; },
    (data) => { data.students[0].accessCode = "A".repeat(16); },
    (data) => { data.students[0].playerIdentifier = "UNEXPECTED-PUBLIC-ID"; },
    (data) => { data.students[0].accessCode = gameId; },
    (data) => { data.credentialsAvailable = false; },
  ]) {
    const payload = fresh(); change(payload.data);
    assert.throws(() => normalizeRosterImportResult(payload, names));
  }
});

function controller(api, options = {}) {
  return createRosterImportController({ api, gameId, hasPermission: () => true, cryptoObject: webcrypto, ...options });
}

test("uncertain transport and invalid-success retries reuse one key, without automatic retry", async () => {
  const calls = [];
  const importer = controller({ importPlayerRoster: async (input) => {
    calls.push(input);
    if (calls.length === 1) throw new Error("PRIVATE-ERROR");
    return normalizeRosterImportResult(replay(), names);
  } });
  assert.deepEqual(await importer.submit(names), { ok: false, uncertain: true });
  assert.equal(calls.length, 1);
  assert.equal((await importer.submit([...names])).ok, true);
  assert.equal(calls[0].idempotencyKey, calls[1].idempotencyKey);
  assert.equal((await importer.submit([...names])).ok, true);
  assert.equal(calls[1].idempotencyKey, calls[2].idempotencyKey);
  importer.destroy();
});

test("duplicate clicks cannot create parallel batches", async () => {
  let complete;
  let entered;
  const started = new Promise((resolve) => { entered = resolve; });
  const importer = controller({ importPlayerRoster: () => { entered(); return new Promise((resolve) => { complete = resolve; }); } });
  const pending = importer.submit(names);
  await started;
  assert.deepEqual(await importer.submit(names), { ok: false, busy: true });
  complete(normalizeRosterImportResult(fresh(), names));
  assert.equal((await pending).ok, true);
});

test("destruction suppresses late credentials and blocks later submissions", async () => {
  let complete;
  let entered;
  const started = new Promise((resolve) => { entered = resolve; });
  const importer = controller({ importPlayerRoster: () => { entered(); return new Promise((resolve) => { complete = resolve; }); } });
  const pending = importer.submit(names);
  await started;
  importer.destroy();
  complete(normalizeRosterImportResult(fresh(), names));
  assert.deepEqual(await pending, { ok: false, denied: true });
  assert.deepEqual(await importer.submit(names), { ok: false, denied: true });
});

test("permission checks precede fingerprinting and request creation", async () => {
  let called = false;
  const importer = controller({ importPlayerRoster: () => { called = true; } }, { hasPermission: () => false, cryptoObject: null });
  assert.deepEqual(await importer.submit(names), { ok: false, denied: true });
  assert.equal(called, false);
});

test("different ordered names get distinct keys but same repeated-name roster remains stable", async () => {
  const calls = [];
  const importer = controller({ importPlayerRoster: async (input) => { calls.push(input); throw new Error("lost"); } });
  await importer.submit(["Avery", "Blair"]);
  await importer.submit(["Blair", "Avery"]);
  await importer.submit(["Avery", "Blair"]);
  assert.notEqual(calls[0].idempotencyKey, calls[1].idempotencyKey);
  assert.equal(calls[0].idempotencyKey, calls[2].idempotencyKey);
});

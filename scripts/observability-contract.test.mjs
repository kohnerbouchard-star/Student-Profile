import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { classifyOutcome, createOperationalEvent, normalizeRouteTemplate } from "../backend/src/platform/observability/operationalEvent.ts";
import { validateObservabilityContracts } from "./observability-contract.mjs";

const read = (path) => JSON.parse(fs.readFileSync(path, "utf8"));
const documents = () => ({
  dashboard: structuredClone(read("docs/operations/observability-dashboard-alerts.json")),
  profile: structuredClone(read("docs/operations/performance/beta-load-profile.json")),
  plans: structuredClone(read("docs/operations/performance/query-plan-evidence.json")),
});

test("repository observability contracts pass", () => {
  assert.deepEqual(validateObservabilityContracts(documents()), []);
});

test("operational event is bounded and privacy-safe", () => {
  const event = createOperationalEvent({
    occurredAt: "2026-07-20T00:00:00Z",
    service: "classroom-api",
    releaseSha: "1".repeat(40),
    requestId: "req-example",
    routeTemplate: "/games/550e8400-e29b-41d4-a716-446655440000/players/42",
    actorKey: "actor_abcdefghijklmnop",
    gameKey: "game_abcdefghijklmnop",
    outcomeClass: "success",
    httpStatus: 200,
    durationMs: 42.456,
    database: { queryCount: 2, durationMs: 18.123 },
    coldStart: true,
  });
  assert.equal(event.routeTemplate, "/games/:uuid/players/:number");
  assert.equal(event.durationMs, 42.46);
  assert.equal(event.database?.durationMs, 18.12);
  assert.ok(JSON.stringify(event).length < 2048);
});

test("raw identifiers are rejected", () => {
  assert.throws(() => createOperationalEvent({
    occurredAt: "2026-07-20T00:00:00Z",
    service: "classroom-api",
    releaseSha: "1".repeat(40),
    requestId: "req-example",
    routeTemplate: "/players/me",
    actorKey: "raw-player-17",
    outcomeClass: "success",
    httpStatus: 200,
    durationMs: 1,
  }), /pseudonymous/);
});

test("outcome classification distinguishes protected failures", () => {
  assert.equal(classifyOutcome(429, "rate_limit"), "rate_limited");
  assert.equal(classifyOutcome(403, "cross_scope"), "cross_scope_denied");
  assert.equal(classifyOutcome(503, "database"), "dependency_failure");
});

test("load bounds and connected-plan claims fail closed", () => {
  const docs = documents();
  docs.profile.maximumPlayers = 41;
  docs.plans.queries[0].evidence = { fabricated: true };
  const failures = validateObservabilityContracts(docs);
  assert.ok(failures.some((message) => message.includes("30 expected and 40 maximum")));
  assert.ok(failures.some((message) => message.includes("must not fabricate")));
});

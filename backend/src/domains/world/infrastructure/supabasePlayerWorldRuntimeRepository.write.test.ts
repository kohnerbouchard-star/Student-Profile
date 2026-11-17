import {
  equal, frozen, GAME, harness, journeyRow, NOW, PLAYER, readCall, same, SCOPE, step, unavailable, type Row,
} from "./supabasePlayerWorldRuntimeRepository.fixtures.ts";
import {
  assignmentInput, COMPLETE_CALL, COMPLETE_INPUT, EXECUTE_CALL, EXECUTE_INPUT, EXPECTED_INSERT,
  expectedJourney, expectedQuote, expectedResidency, quoteInput, quoteRow, RESIDENCY_CALL,
  RESIDENCY_INPUT, residencyRow, rpcJourneyRow,
} from "./supabasePlayerWorldRuntimeRepository.writeFixtures.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };
const completedRead = readCall("player_travel_journeys", { player: true, single: true,
  select: "*, quote:player_travel_quotes(public_id)", filters: [["eq", "public_id", "trj_requested"]] });
const quoteCall = { target: "player_travel_quotes", operations: [["insert", EXPECTED_INSERT], ["select", "*"], ["single"]] };

Deno.test("World repository arrival assignment sends the exact single authoritative RPC without additional writes", async () => {
  const input = assignmentInput(), before = JSON.stringify(input), rows = [{ ignored: true }, { ignored: false }];
  const fixture = harness([step("assign_arrival_class_atomic_v2", rows)]);
  same(await fixture.repository.assignArrivalClassAtomic(input as never), undefined);
  equal(fixture.calls, [{ target: "assign_arrival_class_atomic_v2", operations: [["rpc", {
    p_game_session_id: GAME, p_player_id: PLAYER, p_country_id: "eldoran", p_class_id: "analyst",
    p_questionnaire_id: "q_main", p_questionnaire_version: "v1", p_score_result: input.scoreResult,
    p_assignment_idempotency_key: "assign-key", p_arrival_package_definition_id: "arrival_package",
    p_grant_definition_id: "class_grant", p_grant_idempotency_key: "grant-key", p_assigned_at: NOW,
  }]] }]);
  same((fixture.calls[0]!.operations[0]![1] as Row).p_score_result, input.scoreResult);
  equal(JSON.stringify(input), before); frozen(rows); fixture.done();
});

for (const data of [null, []]) Deno.test(`World repository arrival assignment permits ${JSON.stringify(data)} success payload`, async () => {
  const fixture = harness([step("assign_arrival_class_atomic_v2", data)]);
  same(await fixture.repository.assignArrivalClassAtomic(assignmentInput() as never), undefined); fixture.done();
});

Deno.test("World repository quote insert strips leg extras, scopes from request and returns authoritative stored values", async () => {
  const quote = quoteInput(), before = JSON.stringify(quote), row = quoteRow();
  const fixture = harness([step("player_travel_quotes", row)]);
  const result = await fixture.repository.storeTravelQuote({ scope: SCOPE, quote: quote as never });
  equal(result, expectedQuote()); equal(fixture.calls, [quoteCall]); equal(JSON.stringify(quote), before);
  frozen(result, result.legs, result.legs[0]); same(Object.isFrozen(row.legs), false); fixture.done();
});

Deno.test("World repository quote preserves all status mappings and converts non-array legs to empty", async () => {
  for (const [status, expected] of [["created", "created"], ["consumed", "consumed"], ["expired", "expired"], ["unknown", "created"]]) {
    const fixture = harness([step("player_travel_quotes", quoteRow({ status, legs: { bogus: true } }))]);
    const result = await fixture.repository.storeTravelQuote({ scope: SCOPE, quote: quoteInput() as never });
    equal(result, expectedQuote({ status: expected, legs: [] })); frozen(result.legs); fixture.done();
  }
});

Deno.test("World repository quote accepts String mode and numeric coercion while preserving whitespace identifiers", async () => {
  const row = quoteRow({ total_cost_minor: null, total_duration_minutes: true, route_state_revision: "", expires_at: 2026 });
  Object.assign(row.legs[0], { mode: { toString: () => "sea" }, costMinor: false, durationMinutes: "1", routeRevision: null });
  const fixture = harness([step("player_travel_quotes", row)]);
  const result = await fixture.repository.storeTravelQuote({ scope: SCOPE, quote: quoteInput() as never });
  equal(result, expectedQuote({ totalCostMinor: 0, totalDurationMinutes: 1, routeStateRevision: 0, expiresAt: "2026",
    legs: [{ publicRouteId: " route_road ", fromLocationId: "loc_home", toLocationId: "loc_port", mode: "sea", costMinor: 0,
      durationMinutes: 1, routeRevision: 0 }] })); fixture.done();
});

const invalidQuotes: [string, unknown, string][] = [
  ["currency_code", "usd", "Settlement currency is invalid."],
  ["total_cost_minor", -1, "travel cost is invalid."],
  ["total_duration_minutes", 0, "travel duration must be positive."],
  ["total_duration_minutes", 0.5, "travel duration is invalid."],
  ["route_state_revision", Number.MAX_SAFE_INTEGER + 1, "route revision is invalid."],
  ["expires_at", null, "quote expiry is invalid."],
  ["legs", [null], "Stored travel leg is malformed."],
  ["legs", [[]], "Stored travel leg is malformed."],
];
for (const [field, value, message] of invalidQuotes) Deno.test(`World repository quote rejects ${field} ${JSON.stringify(value)}`, async () => {
  const fixture = harness([step("player_travel_quotes", quoteRow({ [field]: value }))]);
  await unavailable(() => fixture.repository.storeTravelQuote({ scope: SCOPE, quote: quoteInput() as never }), message);
  equal(fixture.calls, [quoteCall]); fixture.done();
});
for (const [field, value, message] of [
  ["mode", "rail", "Stored travel leg mode is invalid."],
  ["publicRouteId", " ", "route id is invalid."],
  ["fromLocationId", 3, "route origin is invalid."],
  ["toLocationId", null, "route destination is invalid."],
  ["costMinor", -1, "leg cost is invalid."],
  ["durationMinutes", 0, "leg duration must be positive."],
  ["routeRevision", "invalid", "leg revision is invalid."],
] as const) Deno.test(`World repository quote leg rejects ${field}`, async () => {
  const row = quoteRow(); row.legs[0][field] = value; const fixture = harness([step("player_travel_quotes", row)]);
  await unavailable(() => fixture.repository.storeTravelQuote({ scope: SCOPE, quote: quoteInput() as never }), message); fixture.done();
});

Deno.test("World repository quote validation retains currency-before-totals and mode-before-identifiers ordering", async () => {
  for (const [row, message] of [
    [quoteRow({ currency_code: "", total_cost_minor: -1, legs: [null] }), "Settlement currency is invalid."],
    [quoteRow({ total_cost_minor: -1, total_duration_minutes: 0, legs: [null] }), "travel cost is invalid."],
    [quoteRow({ legs: [{ mode: "bad", publicRouteId: "" }], expires_at: "bad" }), "Stored travel leg mode is invalid."],
  ] as const) {
    const fixture = harness([step("player_travel_quotes", row)]);
    await unavailable(() => fixture.repository.storeTravelQuote({ scope: SCOPE, quote: quoteInput() as never }), message); fixture.done();
  }
});

Deno.test("World repository execution uses exact atomic RPC and maps returned journey independently of input", async () => {
  const rows = [rpcJourneyRow()], fixture = harness([step("execute_player_travel_v1", rows)]);
  const result = await fixture.repository.executeTravelAtomic(EXECUTE_INPUT);
  equal(result, expectedJourney()); equal(fixture.calls, [EXECUTE_CALL]); frozen(result, rows); fixture.done();
});

Deno.test("World repository completion ignores RPC receipt shape then rereads scoped joined journey", async () => {
  const receipt = [{ ignored: true }], fixture = harness([step("complete_player_travel_v1", receipt),
    step("player_travel_journeys", journeyRow({ status: "completed", completed_at: NOW }))]);
  const result = await fixture.repository.completeTravelAtomic(COMPLETE_INPUT);
  equal(result, expectedJourney({ status: "completed", completedAt: NOW }));
  equal(fixture.calls, [COMPLETE_CALL, completedRead]); frozen(result, receipt); fixture.done();
});

Deno.test("World repository residency request sends expected revision and maps authoritative scoped response", async () => {
  const rows = [residencyRow()], fixture = harness([step("request_player_residency_change_v1", rows)]);
  const result = await fixture.repository.requestResidencyChange(RESIDENCY_INPUT);
  equal(result, expectedResidency()); equal(fixture.calls, [RESIDENCY_CALL]); frozen(result, result.eligibleCountryIds, rows); fixture.done();
});

const atomicCases = [
  { target: "execute_player_travel_v1", label: "travel execution", call: EXECUTE_CALL,
    invoke: (fixture: ReturnType<typeof harness>) => fixture.repository.executeTravelAtomic(EXECUTE_INPUT) },
  { target: "complete_player_travel_v1", label: "travel completion", call: COMPLETE_CALL,
    invoke: (fixture: ReturnType<typeof harness>) => fixture.repository.completeTravelAtomic(COMPLETE_INPUT) },
  { target: "request_player_residency_change_v1", label: "residency request", call: RESIDENCY_CALL,
    invoke: (fixture: ReturnType<typeof harness>) => fixture.repository.requestResidencyChange(RESIDENCY_INPUT) },
];
for (const entry of atomicCases) {
  for (const data of [null, [], [{}, {}]]) Deno.test(`World repository ${entry.label} requires exactly one row from ${JSON.stringify(data)}`, async () => {
    const fixture = harness([step(entry.target, data)]);
    await unavailable(() => entry.invoke(fixture), `${entry.label} returned ${data?.length ?? 0} rows.`);
    equal(fixture.calls, [entry.call]); if (data) frozen(data); fixture.done();
  });
  Deno.test(`World repository ${entry.label} database error wins over receipt cardinality`, async () => {
    const fixture = harness([step(entry.target, [], "DENIED")]);
    await unavailable(() => entry.invoke(fixture), `${entry.label} failed: DENIED.`);
    equal(fixture.calls, [entry.call]); fixture.done();
  });
}

Deno.test("World repository arrival error and quote missing-row/error retain database error redaction", async () => {
  const arrival = harness([step("assign_arrival_class_atomic_v2", [], "23505")]);
  await unavailable(() => arrival.repository.assignArrivalClassAtomic(assignmentInput() as never), "arrival assignment failed: 23505."); arrival.done();
  for (const error of [null, { message: "private database detail" }]) {
    const response = step("player_travel_quotes", null); response.result.error = error; const fixture = harness([response]);
    await unavailable(() => fixture.repository.storeTravelQuote({ scope: SCOPE, quote: quoteInput() as never }),
      error ? "travel quote failed: database_error." : "travel quote was not found."); fixture.done();
  }
});

Deno.test("World repository completion requires joined row and surfaces its error only after successful RPC", async () => {
  for (const error of [null, { code: "READ_FAILED", message: "private" }]) {
    const read = step("player_travel_journeys", null); read.result.error = error;
    const fixture = harness([step("complete_player_travel_v1", [{}]), read]);
    await unavailable(() => fixture.repository.completeTravelAtomic(COMPLETE_INPUT),
      error ? "completed journey failed: READ_FAILED." : "completed journey was not found.");
    equal(fixture.calls, [COMPLETE_CALL, completedRead]); fixture.done();
  }
});

const invalidJourneys: [string, unknown, string][] = [
  ["currency_code", "invalid", "Settlement currency is invalid."],
  ["total_cost_minor", -1, "journey cost is invalid."],
  ["total_duration_minutes", 0, "journey duration must be positive."],
  ["departed_at", "invalid", "journey departure is invalid."],
  ["arrival_at", "invalid", "journey arrival is invalid."],
  ["completed_at", "invalid", "timestamp is invalid."],
];
for (const [field, value, message] of invalidJourneys) Deno.test(`World repository RPC and joined journey reject ${field}`, async () => {
  const execution = harness([step("execute_player_travel_v1", [rpcJourneyRow({ [field]: value })])]);
  await unavailable(() => execution.repository.executeTravelAtomic(EXECUTE_INPUT), message); execution.done();
  const completion = harness([step("complete_player_travel_v1", [{}]), step("player_travel_journeys", journeyRow({ [field]: value }))]);
  await unavailable(() => completion.repository.completeTravelAtomic(COMPLETE_INPUT), message); completion.done();
});

Deno.test("World repository joined quote validates whitespace while RPC quote and journey IDs pass through unchanged", async () => {
  const completion = harness([step("complete_player_travel_v1", [{}]), step("player_travel_journeys", journeyRow({ quote: { public_id: " " }, currency_code: "bad" }))]);
  await unavailable(() => completion.repository.completeTravelAtomic(COMPLETE_INPUT), "quote id is invalid."); completion.done();
  const execution = harness([step("execute_player_travel_v1", [rpcJourneyRow({ journey_id: null, quote_id: 42 })])]);
  equal(await execution.repository.executeTravelAtomic(EXECUTE_INPUT), expectedJourney({ publicJourneyId: null, publicQuoteId: 42 })); execution.done();
});

Deno.test("World repository journey coercion preserves completed/default status and noncanonical timestamps", async () => {
  for (const status of ["completed", "unknown"]) {
    const row = rpcJourneyRow({ status, total_cost_minor: null, total_duration_minutes: true, departed_at: 2026, arrival_at: "2027-01-01", completed_at: null });
    const fixture = harness([step("execute_player_travel_v1", [row])]);
    equal(await fixture.repository.executeTravelAtomic(EXECUTE_INPUT), expectedJourney({ status: status === "completed" ? "completed" : "in_transit",
      totalCostMinor: 0, totalDurationMinutes: 1, departedAt: "2026", arrivalAt: "2027-01-01" })); fixture.done();
  }
});

for (const [field, value, message] of [
  ["currency_code", null, "Settlement currency is invalid."],
  ["revision", "bad", "residency revision is invalid."],
  ["updated_at", "bad", "residency update is invalid."],
] as const) Deno.test(`World repository residency RPC rejects ${field}`, async () => {
  const fixture = harness([step("request_player_residency_change_v1", [residencyRow({ [field]: value })])]);
  await unavailable(() => fixture.repository.requestResidencyChange(RESIDENCY_INPUT), message); fixture.done();
});

Deno.test("World repository residency RPC preserves empty arrays, pending-string handling and coercion", async () => {
  for (const [eligible, pending, expected] of [[{}, 3, []], [["", 5, "a", "a"], "", ["", "a", "a"]]] as const) {
    const fixture = harness([step("request_player_residency_change_v1", [residencyRow({ eligible_country_ids: eligible,
      pending_country_id: pending, currency_code: { toString: () => "USD" }, revision: false, updated_at: 2026 })])]);
    const result = await fixture.repository.requestResidencyChange(RESIDENCY_INPUT);
    equal(result, expectedResidency({ eligibleCountryIds: expected, pendingCountryId: typeof pending === "string" ? pending : null,
      currencyCode: "USD", revision: 0, updatedAt: "2026" })); frozen(result.eligibleCountryIds); fixture.done();
  }
});

import {
  arrivalSteps, CLASS_IDS, equal, expectedJourney, frozen, GAME, harness, INITIAL_CALLS,
  INITIAL_TABLES, journeyRow, NOW, PLAYER, readCall, same, SCOPE, snapshotRows, snapshotSteps,
  step, unavailable,
} from "./supabasePlayerWorldRuntimeRepository.fixtures.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };
const scopeFields = { gameId: GAME, gameSessionId: GAME, playerUuid: PLAYER };
const expectedResidency = { ...scopeFields, currentCountryId: "eldoran", currencyCode: "ELD",
  eligibleCountryIds: ["eldoran", "", "eldoran", "meridian"], pendingCountryId: null, revision: 4, updatedAt: NOW };
const expectedWorld = { gameId: GAME, definition: { packId: "pack", packVersion: "v1", definitionDigest: "digest" },
  locationStates: [{ publicLocationId: "loc_home", availability: "normal", revision: 6, updatedAt: NOW }],
  routeStates: [{ publicRouteId: "route_road", status: "restricted", reason: "shortage", costMultiplierBasisPoints: 9000,
    durationMultiplierBasisPoints: 11000, revision: 9, updatedAt: NOW }], executedCommandKeys: [], revision: 5, updatedAt: NOW };

Deno.test("World repository snapshot preserves exact mapping, scope, query order and shallow freezing", async () => {
  const rows = snapshotRows(), before = JSON.stringify(rows), fixture = harness(snapshotSteps(rows));
  frozen(fixture.repository);
  equal(Object.keys(fixture.repository), ["readSnapshot", "readArrivalInput", "assignArrivalClassAtomic",
    "readTravelPlanningInput", "storeTravelQuote", "executeTravelAtomic", "completeTravelAtomic", "requestResidencyChange"]);
  const result = await fixture.repository.readSnapshot(SCOPE);
  equal(result, { campaign: null, arrivalAssignment: { assignmentId: "asg_public", ...scopeFields,
    countryId: "eldoran", classId: "analyst", source: "questionnaire", questionnaireId: "q_main",
    questionnaireVersion: "v1", scoreResult: { scores: [] }, overrideReason: null, revision: 2,
    assignedAt: NOW, updatedAt: NOW, economicRestrictions: [] },
    travelState: { ...scopeFields, currentLocationId: "loc_home", status: "available", activeJourneyId: null,
      arrivalAt: null, revision: 3, updatedAt: NOW }, activeJourney: null, residency: expectedResidency, world: expectedWorld });
  equal(fixture.calls, INITIAL_CALLS); fixture.done(); equal(JSON.stringify(rows), before);
  frozen(result, result.arrivalAssignment, result.arrivalAssignment!.economicRestrictions, result.travelState,
    result.residency, result.residency!.eligibleCountryIds, result.world, result.world!.definition,
    result.world!.locationStates, result.world!.locationStates[0], result.world!.routeStates,
    result.world!.routeStates[0], result.world!.executedCommandKeys, rows.world_location_states, rows.world_route_states);
  same(result.arrivalAssignment!.scoreResult, rows.arrival_class_assignments.score_result);
  same(Object.isFrozen(result.arrivalAssignment!.scoreResult), false);
  same(Object.isFrozen(rows.world_location_states[0]), false);
});

Deno.test("World repository absent snapshot accepts null row collections without inventing runtime", async () => {
  const fixture = harness(snapshotSteps({})), result = await fixture.repository.readSnapshot(SCOPE);
  equal(result, { campaign: null, arrivalAssignment: null, travelState: null, activeJourney: null, residency: null, world: null });
  equal(fixture.calls, INITIAL_CALLS); frozen(result); fixture.done();
});

Deno.test("World repository snapshot starts all seven reads before waiting for any result", async () => {
  let release!: () => void;
  const ready = new Promise<void>(resolve => { release = resolve; });
  const steps = snapshotSteps().map(planned => ({ ...planned, ready })), fixture = harness(steps);
  const pending = fixture.repository.readSnapshot(SCOPE);
  try { equal(fixture.calls, INITIAL_CALLS); } finally { release(); }
  await pending; fixture.done();
});

Deno.test("World repository snapshot retains all reviewed class and location-route state values", async () => {
  for (const classId of CLASS_IDS) {
    const rows = snapshotRows(); rows.arrival_class_assignments.class_id = classId;
    const fixture = harness(snapshotSteps(rows)); equal((await fixture.repository.readSnapshot(SCOPE)).arrivalAssignment!.classId, classId); fixture.done();
  }
  for (const availability of ["normal", "shortage", "conflict", "closed"]) {
    const rows = snapshotRows(); rows.world_location_states[0].availability = { toString: () => availability };
    const fixture = harness(snapshotSteps(rows)); equal((await fixture.repository.readSnapshot(SCOPE)).world!.locationStates[0]!.availability, availability); fixture.done();
  }
  for (const status of ["open", "restricted", "closed"]) for (const reason of ["normal", "shortage", "meridian_disruption", "war", "recovery"]) {
    const rows = snapshotRows(); Object.assign(rows.world_route_states[0], { status: { toString: () => status }, reason: { toString: () => reason } });
    const fixture = harness(snapshotSteps(rows)), result = (await fixture.repository.readSnapshot(SCOPE)).world!.routeStates[0]!;
    equal([result.status, result.reason], [status, reason]); fixture.done();
  }
});

Deno.test("World repository integer coercion preserves negative zero and the safe-integer ceiling", async () => {
  const rows = snapshotRows(); rows.player_travel_states.revision = "-0";
  rows.world_runtime_instances.revision = Number.MAX_SAFE_INTEGER;
  const fixture = harness(snapshotSteps(rows)), result = await fixture.repository.readSnapshot(SCOPE);
  same(result.travelState!.revision, -0); same(result.world!.revision, Number.MAX_SAFE_INTEGER); fixture.done();
});

Deno.test("World repository no runtime leaves malformed location and route rows uninterpreted", async () => {
  const fixture = harness(snapshotSteps({ world_location_states: [null], world_route_states: [null] }));
  equal((await fixture.repository.readSnapshot(SCOPE)).world, null); fixture.done();
});

Deno.test("World repository active journey uses internal lookup then public identity and unchanged joined quote", async () => {
  const rows = snapshotRows(); rows.player_travel_states.active_journey_id = "private_journey";
  rows.player_travel_states.status = "in_transit"; rows.player_travel_states.arrival_at = NOW;
  const fixture = harness([...snapshotSteps(rows), step("player_travel_journeys", journeyRow())]);
  const result = await fixture.repository.readSnapshot(SCOPE);
  equal(result.activeJourney, expectedJourney());
  equal(result.travelState, { ...scopeFields, currentLocationId: "loc_home", status: "in_transit",
    activeJourneyId: "trj_public", arrivalAt: NOW, revision: 3, updatedAt: NOW });
  equal(fixture.calls, [...INITIAL_CALLS, readCall("player_travel_journeys", { player: true, single: true,
    select: "*, quote:player_travel_quotes(public_id)", filters: [["eq", "id", "private_journey"]] })]);
  frozen(result.activeJourney, result.travelState); fixture.done();
});

for (const id of ["private_missing", ""]) Deno.test(`World repository unresolved journey ${JSON.stringify(id)} clears public link`, async () => {
  const rows = snapshotRows(); rows.player_travel_states.active_journey_id = id;
  const fixture = harness([...snapshotSteps(rows), ...(id ? [step("player_travel_journeys", null)] : [])]);
  const result = await fixture.repository.readSnapshot(SCOPE);
  equal([result.activeJourney, result.travelState!.activeJourneyId], [null, null]); fixture.done();
});

Deno.test("World repository journey lookup failure precedes campaign reads and later snapshot mapping", async () => {
  const rows = snapshotRows(); rows.player_travel_states.active_journey_id = "private_journey";
  rows.campaign_instances = {}; rows.arrival_class_assignments.class_id = "bad";
  const fixture = harness([...snapshotSteps(rows), step("player_travel_journeys", null, "JOURNEY")]);
  await unavailable(() => fixture.repository.readSnapshot(SCOPE), "active journey failed: JOURNEY."); fixture.done();
});

Deno.test("World repository malformed joined quote preserves the existing TypeError boundary", async () => {
  const rows = snapshotRows(); rows.player_travel_states.active_journey_id = "private_journey";
  const fixture = harness([...snapshotSteps(rows), step("player_travel_journeys", journeyRow({ quote: null }))]);
  let caught: unknown;
  try { await fixture.repository.readSnapshot(SCOPE); } catch (error) { caught = error; }
  same(caught instanceof TypeError, true); fixture.done();
});

const readLabels = ["arrival context", "travel context", "residency context", "world runtime", "world locations", "world routes", "campaign context"];
for (let index = 0; index < INITIAL_TABLES.length; index++) {
  Deno.test(`World repository ${readLabels[index]} rejects before later batched errors`, async () => {
    const steps = snapshotSteps();
    for (let later = index; later < steps.length; later++) steps[later]!.result.error = { code: `DB_${later}`, message: "secret" };
    const fixture = harness(steps);
    await unavailable(() => fixture.repository.readSnapshot(SCOPE), `${readLabels[index]} failed: DB_${index}.`);
    equal(fixture.calls, INITIAL_CALLS); fixture.done();
  });
}

const invalidSnapshotRows: [string, string, unknown, string][] = [
  ["arrival_class_assignments", "class_id", "invalid", "Stored arrival class is invalid."],
  ["arrival_class_assignments", "revision", 0.5, "arrival revision is invalid."],
  ["arrival_class_assignments", "assigned_at", "invalid", "arrival assignment is invalid."],
  ["arrival_class_assignments", "updated_at", "invalid", "arrival assignment update is invalid."],
  ["player_travel_states", "revision", -1, "travel revision is invalid."],
  ["player_travel_states", "arrival_at", "invalid", "timestamp is invalid."],
  ["player_travel_states", "updated_at", null, "travel update is invalid."],
  ["player_residency_states", "currency_code", "eld", "Settlement currency is invalid."],
  ["player_residency_states", "revision", Number.MAX_SAFE_INTEGER + 1, "residency revision is invalid."],
  ["player_residency_states", "updated_at", "invalid", "residency update is invalid."],
  ["world_runtime_instances", "revision", Infinity, "world revision is invalid."],
  ["world_runtime_instances", "updated_at", "invalid", "world update is invalid."],
  ["world_location_states", "availability", "unknown", "Location loc_home has invalid state."],
  ["world_location_states", "revision", "bad", "location revision is invalid."],
  ["world_location_states", "updated_at", "invalid", "location update is invalid."],
  ["world_route_states", "status", "unknown", "Route route_road has invalid state."],
  ["world_route_states", "reason", "unknown", "Route route_road has invalid state."],
  ["world_route_states", "cost_multiplier_basis_points", null, "route cost multiplier must be positive."],
  ["world_route_states", "duration_multiplier_basis_points", -1, "route duration multiplier is invalid."],
  ["world_route_states", "revision", NaN, "route revision is invalid."],
  ["world_route_states", "updated_at", "invalid", "route update is invalid."],
];
for (const [table, field, value, message] of invalidSnapshotRows) {
  Deno.test(`World repository rejects malformed ${table}.${field}`, async () => {
    const rows = snapshotRows(); (Array.isArray(rows[table]) ? rows[table][0] : rows[table])[field] = value;
    const fixture = harness(snapshotSteps(rows)); await unavailable(() => fixture.repository.readSnapshot(SCOPE), message); fixture.done();
  });
}

Deno.test("World repository snapshot coercion retains Number, String, nullable and non-record score behavior", async () => {
  const rows = snapshotRows(); Object.assign(rows.arrival_class_assignments, { class_id: { toString: () => "builder" },
    source: "admin_override", score_result: [], override_reason: "", revision: null, assigned_at: 2026 });
  Object.assign(rows.player_travel_states, { revision: false, arrival_at: undefined });
  Object.assign(rows.player_residency_states, { currency_code: { toString: () => "ELD" }, eligible_country_ids: {}, pending_country_id: "", revision: true });
  const fixture = harness(snapshotSteps(rows)), result = await fixture.repository.readSnapshot(SCOPE);
  equal([result.arrivalAssignment!.classId, result.arrivalAssignment!.source, result.arrivalAssignment!.scoreResult,
    result.arrivalAssignment!.overrideReason, result.arrivalAssignment!.revision, result.arrivalAssignment!.assignedAt],
  ["builder", "admin_override", null, "", 0, "2026"]);
  equal([result.travelState!.revision, result.travelState!.arrivalAt, result.residency!.currencyCode,
    result.residency!.eligibleCountryIds, result.residency!.pendingCountryId, result.residency!.revision], [0, null, "ELD", [], "", 1]);
  fixture.done();
});

Deno.test("World repository snapshot first mapping error is travel then arrival then residency then world", async () => {
  for (const [table, message] of [["player_travel_states", "travel revision is invalid."],
    ["arrival_class_assignments", "arrival revision is invalid."], ["player_residency_states", "residency revision is invalid."],
    ["world_runtime_instances", "world revision is invalid."]] as const) {
    const rows = snapshotRows(), order = ["player_travel_states", "arrival_class_assignments", "player_residency_states", "world_runtime_instances"];
    for (const later of order.slice(order.indexOf(table))) rows[later].revision = -1;
    const fixture = harness(snapshotSteps(rows)); await unavailable(() => fixture.repository.readSnapshot(SCOPE), message); fixture.done();
  }
});

Deno.test("World repository arrival inputs retain three sequential scoped reads and last duplicate grant", async () => {
  const steps = arrivalSteps(); steps[2]!.result.data.push({ class_id: "analyst", grant_definition_id: "last_analyst" });
  const fixture = harness(steps), result = await fixture.repository.readArrivalInput(SCOPE);
  equal([result.countryId, result.arrivalPackageDefinitionId, CLASS_IDS.map(result.classGrantDefinitionId)],
    ["eldoran", "arrival_package", CLASS_IDS.map(id => id === "analyst" ? "last_analyst" : `grant_${id}`)]);
  frozen(result, steps[2]!.result.data); equal(fixture.calls, [
    readCall("players", { select: "country_id", single: true, filters: [["eq", "id", PLAYER]] }),
    readCall("world_country_runtime", { single: true, filters: [["eq", "country_uuid", "private_country"]] }),
    readCall("arrival_class_grant_runtime"),
  ]); fixture.done();
  await unavailable(() => result.classGrantDefinitionId("unknown"), "No grant definition exists for class unknown.");
});

for (const count of [0, 7, 9]) Deno.test(`World repository arrival rejects ${count} distinct grants`, async () => {
  const grants = Array.from({ length: count }, (_, i) => ({ class_id: `class_${i}`, grant_definition_id: `grant_${i}` }));
  const fixture = harness(arrivalSteps(grants));
  await unavailable(() => fixture.repository.readArrivalInput(SCOPE), "Arrival class grant registry is incomplete."); fixture.done();
});

Deno.test("World repository arrival registry checks distinct size without validating canonical class names", async () => {
  const grants = Array.from({ length: 8 }, (_, i) => ({ class_id: `custom_${i}`, grant_definition_id: i ? `g${i}` : "" }));
  const fixture = harness(arrivalSteps(grants)), result = await fixture.repository.readArrivalInput(SCOPE);
  equal(result.classGrantDefinitionId("custom_1"), "g1");
  await unavailable(() => result.classGrantDefinitionId("custom_0"), "No grant definition exists for class custom_0."); fixture.done();
});

for (const [index, label] of [[0, "player country"], [1, "world country runtime"], [2, "arrival class grants"]] as const) {
  Deno.test(`World repository arrival ${label} failure stops subsequent queries`, async () => {
    const steps = arrivalSteps().slice(0, index + 1); steps[index]!.result.error = { message: "private" };
    const fixture = harness(steps); await unavailable(() => fixture.repository.readArrivalInput(SCOPE), `${label} failed: database_error.`); fixture.done();
  });
  if (index < 2) Deno.test(`World repository arrival missing ${label} stops subsequent queries`, async () => {
    const steps = arrivalSteps().slice(0, index + 1); steps[index]!.result.data = null;
    const fixture = harness(steps); await unavailable(() => fixture.repository.readArrivalInput(SCOPE), `${label} was not found.`); fixture.done();
  });
}

function planning(rows = snapshotRows(), locations = rows.world_location_states, routes = rows.world_route_states) {
  return harness([...snapshotSteps(rows), step("world_location_states", locations), step("world_route_states", routes)]);
}
Deno.test("World repository planning rereads definitions and preserves snapshot state and context identities", async () => {
  const rows = snapshotRows(), location = { ...rows.world_location_states[0], availability: "closed", display_name: " Port ", location_kind: "port" };
  const fixture = planning(rows, [location]), result = await fixture.repository.readTravelPlanningInput(SCOPE);
  equal(result, { bundle: { definition: expectedWorld.definition,
    locations: [{ publicLocationId: "loc_home", countryId: "eldoran", name: " Port ", kind: "port", enabled: false }],
    routes: [{ publicRouteId: "route_road", fromLocationId: "loc_home", toLocationId: "loc_port", mode: "land",
      bidirectional: true, baseCostMinor: 7, baseDurationMinutes: 8 }] }, state: expectedWorld,
    context: { ...scopeFields, currentLocationId: "loc_home", settlementCurrencyCode: "ELD", residency: expectedResidency,
      allowedModes: ["land", "sea", "air", "meridian"] } });
  same(result.bundle.definition, result.state.definition);
  frozen(result, result.bundle, result.bundle.locations, result.bundle.locations[0], result.bundle.routes,
    result.bundle.routes[0], result.context, result.context.allowedModes);
  equal(fixture.calls, [...INITIAL_CALLS, INITIAL_CALLS[4], INITIAL_CALLS[5]]); fixture.done();
});

for (const missing of ["world_runtime_instances", "player_travel_states", "player_residency_states"]) {
  Deno.test(`World repository planning missing ${missing} prevents definition reads`, async () => {
    const rows = snapshotRows(); rows[missing] = null; const fixture = harness(snapshotSteps(rows));
    await unavailable(() => fixture.repository.readTravelPlanningInput(SCOPE), "World, travel, or residency state is not initialized."); fixture.done();
  });
}
Deno.test("World repository planning in-transit status prevents definition reads", async () => {
  const rows = snapshotRows(); rows.player_travel_states.status = "in_transit"; const fixture = harness(snapshotSteps(rows));
  await unavailable(() => fixture.repository.readTravelPlanningInput(SCOPE), "Player is already in transit."); fixture.done();
});

const invalidDefinitions: ["location" | "route", string, unknown, string][] = [
  ["location", "location_kind", "unknown", "Location loc_home has no reviewed kind."],
  ["location", "display_name", "  ", "location name is invalid."],
  ["route", "mode", "unknown", "Route route_road has an invalid mode."],
  ["route", "base_cost_minor", -1, "route base cost is invalid."],
  ["route", "base_duration_minutes", 0, "route base duration must be positive."],
];
for (const [kind, field, value, message] of invalidDefinitions) Deno.test(`World repository planning rejects ${field}`, async () => {
  const rows = snapshotRows(), locations = [{ ...rows.world_location_states[0] }], routes = [{ ...rows.world_route_states[0] }];
  (kind === "location" ? locations[0] : routes[0])[field] = value;
  const fixture = planning(rows, locations, routes); await unavailable(() => fixture.repository.readTravelPlanningInput(SCOPE), message); fixture.done();
});

Deno.test("World repository planning retains all location kinds, modes and Boolean coercion", async () => {
  const rows = snapshotRows(), kinds = ["capital", "city", "port", "airport", "industrial", "meridian_hub"], modes = ["land", "sea", "air", "meridian"];
  const locations = kinds.map(kind => ({ ...rows.world_location_states[0], location_kind: { toString: () => kind } }));
  const routes = modes.map((mode, i) => ({ ...rows.world_route_states[0], mode: { toString: () => mode }, bidirectional: [0, "false", null, 1][i] }));
  const fixture = planning(rows, locations, routes), result = await fixture.repository.readTravelPlanningInput(SCOPE);
  equal(result.bundle.locations.map(row => row.kind), kinds); equal(result.bundle.routes.map(row => row.mode), modes);
  equal(result.bundle.routes.map(row => row.bidirectional), [false, true, false, true]); fixture.done();
});

Deno.test("World repository planning definition reads permit null arrays and prioritize location database failure", async () => {
  const empty = planning(snapshotRows(), null, null), result = await empty.repository.readTravelPlanningInput(SCOPE);
  equal([result.bundle.locations, result.bundle.routes], [[], []]); empty.done();
  for (const index of [7, 8]) {
    const steps = [...snapshotSteps(), step("world_location_states", [], "LOCATION"), step("world_route_states", [], "ROUTE")];
    if (index === 8) steps[7]!.result.error = null;
    const fixture = harness(steps); await unavailable(() => fixture.repository.readTravelPlanningInput(SCOPE),
      index === 7 ? "travel locations failed: LOCATION." : "travel routes failed: ROUTE."); fixture.done();
  }
});

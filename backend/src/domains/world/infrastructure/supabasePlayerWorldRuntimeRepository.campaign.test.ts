import {
  campaignRow, campaignSteps, equal, executionRow, frozen, GAME, harness, INITIAL_CALLS,
  NOW, readCall, same, SCOPE, snapshotRows, snapshotSteps, step, unavailable, type Row,
} from "./supabasePlayerWorldRuntimeRepository.fixtures.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };
const historyCall = readCall("campaign_event_executions", { order: "sequence", limit: 200,
  filters: [["eq", "campaign_instance_id", "private_campaign"]] });
const effectsCall = readCall("campaign_effect_commands", { order: "created_at", limit: 500,
  filters: [["eq", "campaign_instance_id", "private_campaign"]] });

Deno.test("World repository campaign preserves exact public source, history order and affected-location filtering", async () => {
  const executions = [executionRow({ sequence: "3" }), executionRow({ public_id: "ev_second", sequence: "1", execution_key: "exec_second" })];
  const commands = [
    { status: "completed", idempotency_key: "done", payload: { targetLocationIds: ["loc_z", "loc_a", "loc_z", "loc_UPPER", "private", 5, "loc_a-b"] } },
    { status: "pending", idempotency_key: "pending", payload: { targetLocationIds: ["loc_b", "loc_", "loc_1"] } },
    { status: "failed", idempotency_key: "failed", payload: ["loc_array", 9] },
    { status: "completed", idempotency_key: "done", payload: null },
  ];
  const fixture = harness(campaignSteps(campaignRow(), executions, commands));
  const result = (await fixture.repository.readSnapshot(SCOPE)).campaign!;
  equal(result, { instance: { campaignInstanceId: "cmp_public", gameId: GAME,
    definition: { packId: "pack", packVersion: "v1", definitionId: "campaign", definitionDigest: "digest" },
    status: "paused", currentPhase: "arrival", revision: 2, eventSequence: 3,
    executedEventKeys: ["exec_arrival", "exec_second"], completedEffectKeys: ["done", "done"], outcome: null,
    scheduledAt: null, pausedAt: NOW, disabledAt: null, completedAt: null, createdAt: NOW, updatedAt: NOW },
    history: [
      { publicEventId: "ev_public", eventKey: "arrival_event", phase: "arrival", sequence: 3, occurredAt: NOW, summaryDefinitionId: "arrival_event" },
      { publicEventId: "ev_second", eventKey: "arrival_event", phase: "arrival", sequence: 1, occurredAt: NOW, summaryDefinitionId: "arrival_event" },
    ], affectedLocationIds: ["loc_1", "loc_a", "loc_array", "loc_b", "loc_z"] });
  equal(fixture.calls, [...INITIAL_CALLS, historyCall, effectsCall]); fixture.done();
  const instance = result.instance as unknown as Row;
  frozen(result, instance, instance.definition, instance.executedEventKeys,
    instance.completedEffectKeys, result.history, ...result.history, result.affectedLocationIds, executions, commands);
  same(Object.isFrozen(commands[0]!.payload), false);
});

Deno.test("World repository campaign null history and commands map to frozen empty collections", async () => {
  const steps = campaignSteps(); steps[7]!.result.data = null; steps[8]!.result.data = null;
  const fixture = harness(steps), result = (await fixture.repository.readSnapshot(SCOPE)).campaign!;
  const instance = result.instance as unknown as Row;
  equal([result.history, result.affectedLocationIds, instance.executedEventKeys, instance.completedEffectKeys], [[], [], [], []]);
  frozen(result.history, result.affectedLocationIds, instance.executedEventKeys, instance.completedEffectKeys); fixture.done();
});

Deno.test("World repository campaign accepts every stored phase, status and recognized outcome", async () => {
  const phases = ["arrival", "opportunity", "rivalry", "shortage", "meridian_disruption", "open_conflict", "adaptation", "reconstruction", "continued_conflict"];
  for (const phase of phases) {
    const fixture = harness(campaignSteps(campaignRow({ current_phase: { toString: () => phase } }), [executionRow({ to_phase: phase })]));
    const result = (await fixture.repository.readSnapshot(SCOPE)).campaign!;
    equal([result.instance.currentPhase, result.history[0]!.phase], [phase, phase]); fixture.done();
  }
  for (const status of ["active", "paused", "emergency_disabled", "completed"]) {
    const fixture = harness(campaignSteps(campaignRow({ status: { toString: () => status } })));
    equal((await fixture.repository.readSnapshot(SCOPE)).campaign!.instance.status, status); fixture.done();
  }
  for (const outcome of ["reconstruction", "continued_conflict", null, "invalid"]) {
    const fixture = harness(campaignSteps(campaignRow({ outcome })));
    equal((await fixture.repository.readSnapshot(SCOPE)).campaign!.instance.outcome, outcome === "invalid" ? null : outcome); fixture.done();
  }
});

const invalidCampaign: [string, unknown, string][] = [
  ["status", "unknown", "Stored campaign status is invalid."],
  ["current_phase", "unknown", "Stored campaign phase is invalid."],
  ["revision", -1, "campaign revision is invalid."],
  ["event_sequence", 0.1, "campaign event sequence is invalid."],
  ["scheduled_at", "invalid", "timestamp is invalid."],
  ["paused_at", "invalid", "timestamp is invalid."],
  ["disabled_at", "invalid", "timestamp is invalid."],
  ["completed_at", "invalid", "timestamp is invalid."],
  ["created_at", "invalid", "campaign creation is invalid."],
  ["updated_at", "invalid", "campaign update is invalid."],
];
for (const [field, value, message] of invalidCampaign) Deno.test(`World repository campaign rejects malformed ${field} after both history queries`, async () => {
  const fixture = harness(campaignSteps(campaignRow({ [field]: value })));
  await unavailable(() => fixture.repository.readSnapshot(SCOPE), message);
  equal(fixture.calls, [...INITIAL_CALLS, historyCall, effectsCall]); fixture.done();
});

for (const [field, value, message] of [
  ["to_phase", "unknown", "Stored campaign phase is invalid."],
  ["sequence", -1, "campaign sequence is invalid."],
  ["occurred_at", "invalid", "campaign occurrence is invalid."],
] as const) Deno.test(`World repository campaign history ${field} validation precedes instance validation`, async () => {
  const fixture = harness(campaignSteps(campaignRow({ status: "invalid" }), [executionRow({ [field]: value })]));
  await unavailable(() => fixture.repository.readSnapshot(SCOPE), message); fixture.done();
});

Deno.test("World repository campaign database errors precede row validation and retain history-before-effects order", async () => {
  for (const index of [7, 8]) {
    const steps = campaignSteps(campaignRow({ status: "invalid" }));
    for (let later = index; later <= 8; later++) steps[later]!.result.error = { code: `DB_${later}`, message: "private" };
    const fixture = harness(steps); await unavailable(() => fixture.repository.readSnapshot(SCOPE),
      `${index === 7 ? "campaign history" : "campaign effects"} failed: DB_${index}.`); fixture.done();
  }
});

Deno.test("World repository campaign mapping error precedes arrival assignment validation", async () => {
  const rows = snapshotRows(); rows.campaign_instances = campaignRow({ status: "invalid" }); rows.arrival_class_assignments.class_id = "invalid";
  const fixture = harness([...snapshotSteps(rows), step("campaign_event_executions", []), step("campaign_effect_commands", [])]);
  await unavailable(() => fixture.repository.readSnapshot(SCOPE), "Stored campaign status is invalid."); fixture.done();
});

Deno.test("World repository campaign retains numeric and timestamp coercion without canonicalizing values", async () => {
  const row: Row = campaignRow({ revision: null, event_sequence: true, scheduled_at: 2026, paused_at: undefined,
    disabled_at: "2026-01-01", completed_at: NOW, created_at: 2025 });
  const fixture = harness(campaignSteps(row, [executionRow({ sequence: "", occurred_at: 2024 })]));
  const result = (await fixture.repository.readSnapshot(SCOPE)).campaign!;
  const instance = result.instance as unknown as Row;
  equal([instance.revision, instance.eventSequence, instance.scheduledAt, instance.pausedAt,
    instance.disabledAt, instance.completedAt, instance.createdAt, result.history[0]!.sequence,
    result.history[0]!.occurredAt], [0, 1, "2026", null, "2026-01-01", NOW, "2025", 0, "2024"]); fixture.done();
});

import {
  createSupabaseCampaignAdminRepository as admin,
  createSupabaseCampaignEffectWorkerRepository as worker,
  createSupabaseCampaignSchedulerRepository as scheduler,
  type CampaignRuntimeSupabaseClient,
} from "./supabaseCampaignRuntimeRepository.ts";
import { CampaignRuntimeError } from "../contracts/campaignRuntimeContracts.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };
const time = "2026-08-18T00:00:00.000Z";
function row(extra: Record<string, unknown> = {}) {
  return { id: "internal", public_id: "campaign", game_session_id: "game", pack_id: "pack", pack_version: "v1", definition_id: "definition", definition_digest: "digest", status: "active", current_phase: "arrival", revision: "2", event_sequence: null, outcome: "unknown", scheduled_at: null, paused_at: undefined, disabled_at: null, completed_at: null, created_at: time, updated_at: time, ...extra };
}
function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
}
function frozen(value: unknown) { if (!Object.isFrozen(value)) throw new Error("Expected frozen value"); }
function fixture(...results: { data: unknown; error: unknown }[]) {
  const calls: unknown[][] = [];
  const query = {
    select(...args: unknown[]) { calls.push(["select", ...args]); return query; },
    eq(...args: unknown[]) { calls.push(["eq", ...args]); return query; },
    lte(...args: unknown[]) { calls.push(["lte", ...args]); return query; },
    order(...args: unknown[]) { calls.push(["order", ...args]); return query; },
    limit(...args: unknown[]) { calls.push(["limit", ...args]); return query; },
    maybeSingle() { calls.push(["maybeSingle"]); return Promise.resolve(results.shift()); },
    then(resolve: (value: unknown) => unknown) { return Promise.resolve(results.shift()).then(resolve); },
  };
  const client = { from(table: string) { calls.push(["from", table]); return query; }, rpc(...args: unknown[]) { calls.push(["rpc", ...args]); return Promise.resolve(results.shift()); } } as unknown as CampaignRuntimeSupabaseClient;
  return { client, calls };
}
const ok = (data: unknown) => ({ data, error: null });
async function rejects(action: () => Promise<unknown>, message: string, retryable = false) {
  try { await action(); } catch (error) {
    if (!(error instanceof CampaignRuntimeError)) throw error;
    equal(error.message, message);
    equal(error.retryable, retryable);
    equal(error.code, retryable ? "campaign_revision_conflict" : "campaign_event_invalid");
    return;
  }
  throw new Error("Expected rejection");
}
Deno.test("campaign rows preserve due query order, coercion and nested freezing", async () => {
  const rows = [row()]; const f = fixture(ok(rows));
  const repo = scheduler(f.client, { nextScheduledAt: () => null }); frozen(repo);
  const result = await repo.listDueCampaigns({ dueAt: time, limit: 7 });
  equal(f.calls, [["from", "campaign_instances"], ["select", "*"], ["eq", "status", "active"], ["lte", "scheduled_at", time], ["order", "scheduled_at", { ascending: true }], ["order", "public_id", { ascending: true }], ["limit", 7]]);
  frozen(rows); frozen(result); frozen(result[0]); frozen(result[0]!.definition); frozen(result[0]!.executedEventKeys); frozen(result[0]!.completedEffectKeys);
  equal(result[0]!.revision, 2); equal(result[0]!.eventSequence, 0); equal(result[0]!.outcome, null); equal(result[0]!.pausedAt, null);
});
for (const [field, value, message] of [
  ["status", "bad", "Campaign status is invalid."], ["current_phase", "bad", "Campaign phase is invalid."],
  ["revision", -1, "campaign revision is invalid."], ["revision", 1.5, "campaign revision is invalid."],
  ["revision", Number.MAX_SAFE_INTEGER + 1, "campaign revision is invalid."], ["event_sequence", "bad", "campaign sequence is invalid."],
  ["scheduled_at", "bad", "campaign timestamp is invalid."], ["created_at", null, "campaign creation is invalid."], ["updated_at", "bad", "campaign update is invalid."],
] as const) Deno.test(`campaign row rejects ${field} ${String(value)}`, async () => {
  const f = fixture(ok(row({ [field]: value })));
  await rejects(() => admin(f.client).readInstance({ gameId: "game", campaignId: "campaign" }), message);
});
Deno.test("campaign status validates hidden instance fields and status precedes phase", async () => {
  const f = fixture(ok(row({ status: "bad", current_phase: "bad", revision: -1 })), ok(row({ updated_at: "bad" })));
  await rejects(() => admin(f.client).readStatus({ gameId: "game" }), "Campaign status is invalid.");
  await rejects(() => admin(f.client).readStatus({ gameId: "game" }), "campaign update is invalid.");
});
Deno.test("campaign database conflicts precede malformed rows and sanitize messages", async () => {
  for (const code of ["40001", "XX000", undefined]) {
    const f = fixture({ data: row({ status: "bad" }), error: { code, message: "private database details" } });
    await rejects(() => admin(f.client).readInstance({ gameId: "game", campaignId: "campaign" }), `campaign instance failed: ${code ?? "database_error"}.`, code === "40001");
  }
});
Deno.test("campaign missing status is null but missing instance rejects", async () => {
  const f = fixture(ok(null), ok(null)); const repo = admin(f.client); frozen(repo);
  equal(await repo.readStatus({ gameId: "game", campaignId: "campaign" }), null);
  equal(f.calls, [["from", "campaign_instances"], ["select", "*"], ["eq", "game_session_id", "game"], ["order", "created_at", { ascending: true }], ["limit", 1], ["eq", "public_id", "campaign"], ["maybeSingle"]]);
  await rejects(() => repo.readInstance({ gameId: "game", campaignId: "campaign" }), "campaign instance was not found.");
});
Deno.test("campaign claim retains payload identity and freezes source and projected arrays", async () => {
  const payload = { nested: {} }; const rows = [{ command_id: "command", game_session_id: "game", campaign_id: "campaign", idempotency_key: "key", effect_kind: "notify_players", payload, attempt_count: true }];
  const f = fixture(ok(rows)); const repo = worker(f.client); frozen(repo);
  const result = await repo.claim({ limit: 3, claimedAt: time });
  equal(f.calls, [["rpc", "claim_campaign_effect_commands_v1", { p_limit: 3, p_claimed_at: time }]]);
  frozen(rows); frozen(result); frozen(result[0]); equal(result[0]!.attemptCount, 1);
  if (result[0]!.payload !== payload || Object.isFrozen(payload)) throw new Error("Payload identity/freeze changed");
});
Deno.test("campaign claim kind validation precedes attempt validation", async () => {
  const f = fixture(ok([{ effect_kind: "bad", attempt_count: -1 }]));
  await rejects(() => worker(f.client).claim({ limit: 1, claimedAt: time }), "Claimed campaign effect kind is invalid.");
});
for (const data of [true, false, null, 1, "true"]) Deno.test(`campaign acknowledgement ${String(data)} stays strict`, async () => {
  const f = fixture(ok(data)); const repo = worker(f.client);
  const action = () => repo.complete({ commandId: "command", attemptCount: 4, completedAt: time });
  if (typeof data === "boolean") equal(await action(), data);
  else await rejects(action, "Campaign acknowledgement must be boolean.");
  equal(f.calls, [["rpc", "complete_campaign_effect_command_v2", { p_command_public_id: "command", p_expected_attempt_count: 4, p_completed_at: time }]]);
});
Deno.test("campaign audit scopes internal lookup and maps default actor and reason", async () => {
  const rows = [{ public_id: "audit", actor_type: "other", action: "pause", from_status: "active", to_status: "paused", from_phase: "arrival", to_phase: "opportunity", reason: 1, occurred_at: time }];
  const f = fixture(ok({ id: "internal" }), ok(rows));
  const result = await admin(f.client).readAudit({ gameId: "game", campaignId: "campaign", limit: 9 });
  equal(f.calls, [["from", "campaign_instances"], ["select", "id"], ["eq", "game_session_id", "game"], ["eq", "public_id", "campaign"], ["maybeSingle"], ["from", "campaign_admin_audit"], ["select", "*"], ["eq", "game_session_id", "game"], ["eq", "campaign_instance_id", "internal"], ["order", "occurred_at", { ascending: false }], ["limit", 9]]);
  equal(result[0], { auditId: "audit", actorType: "system", action: "pause", fromStatus: "active", toStatus: "paused", fromPhase: "arrival", toPhase: "opportunity", reason: null, occurredAt: time }); frozen(rows); frozen(result); frozen(result[0]);
});
Deno.test("campaign initialization enforces exact cardinality before follow-up read", async () => {
  for (const data of [null, [], [{ campaign_id: "one" }, { campaign_id: "two" }]]) {
    const f = fixture(ok(data));
    await rejects(() => admin(f.client).initialize({ gameId: "game", packId: "pack", packVersion: "v1", definitionId: "definition", definitionDigest: "digest", scheduledAt: null, initializedAt: time }), `campaign initialization returned ${data?.length ?? 0} rows.`);
    equal(f.calls.length, 1);
  }
});
Deno.test("campaign execution preserves scheduling input, payload references and RPC projection", async () => {
  const instance = await admin(fixture(ok(row())).client).readInstance({ gameId: "game", campaignId: "campaign" });
  const targetLocationIds = ["location"];
  const event = { eventKey: "event", phase: "arrival" as const, nextPhase: "opportunity" as const, completeCampaign: false, prerequisites: ["prior"], effects: [{ kind: "create_contract" as const, contractDefinitionId: "contract", targetLocationIds }] };
  for (const execution_outcome of ["replayed", "unknown"]) {
    const f = fixture(ok([{ execution_outcome, campaign_id: "campaign", event_id: "event-id", status: "active", current_phase: "opportunity", revision: "3", event_sequence: "1", outcome: "reconstruction" }]));
    const repo = scheduler(f.client, { nextScheduledAt(input) { if (input.instance !== instance || input.event !== event) throw new Error("Schedule reference changed"); equal(input.occurredAt, time); return "2026-08-19T00:00:00.000Z"; } });
    const result = await repo.executeEventAtomic({ instance, event, triggerKey: "trigger", actorStaffUserId: null, reason: "reason", occurredAt: time });
    equal(result, { executionOutcome: execution_outcome === "replayed" ? "replayed" : "executed", campaignId: "campaign", eventId: "event-id", status: "active", currentPhase: "opportunity", revision: 3, eventSequence: 1, outcome: "reconstruction" }); frozen(result);
    equal(f.calls, [["rpc", "execute_campaign_event_atomic_v2", { p_game_session_id: "game", p_campaign_public_id: "campaign", p_expected_revision: 2, p_event_key: "event", p_trigger_key: "trigger", p_expected_phase: "arrival", p_next_phase: "opportunity", p_complete_campaign: false, p_prerequisite_event_keys: ["prior"], p_effect_commands: [{ effectKind: "create_contract", idempotencyKey: "campaign:campaign:1:1", payload: { contractDefinitionId: "contract", targetLocationIds } }], p_next_scheduled_at: "2026-08-19T00:00:00.000Z", p_actor_staff_user_id: null, p_reason: "reason", p_occurred_at: time }]]);
    const args = f.calls[0]![2] as { p_effect_commands: { payload: { targetLocationIds: unknown } }[] };
    if (args.p_effect_commands[0]!.payload.targetLocationIds !== targetLocationIds) throw new Error("Nested effect identity changed");
  }
});
Deno.test("campaign invalid schedule rejects before RPC", async () => {
  const instance = await admin(fixture(ok(row())).client).readInstance({ gameId: "game", campaignId: "campaign" });
  for (const next of [null, "", time, "2026-08-17T00:00:00Z"]) {
    const f = fixture();
    await rejects(() => scheduler(f.client, { nextScheduledAt: () => next }).executeEventAtomic({ instance, event: { eventKey: "event", phase: "arrival", nextPhase: "opportunity", completeCampaign: false, prerequisites: [], effects: [] }, triggerKey: "trigger", actorStaffUserId: null, reason: null, occurredAt: time }), "Campaign schedule policy returned an invalid next time.");
    equal(f.calls, []);
  }
});
Deno.test("campaign initialize and control re-read scoped persisted status", async () => {
  const f = fixture(ok([{ campaign_id: "returned" }]), ok(row()), ok([{ campaign_id: "ignored" }]), ok(row()));
  const repo = admin(f.client);
  const initial = await repo.initialize({ gameId: "game", packId: "pack", packVersion: "v1", definitionId: "definition", definitionDigest: "digest", scheduledAt: null, initializedAt: time }); frozen(initial);
  equal(f.calls.slice(1), [["from", "campaign_instances"], ["select", "*"], ["eq", "game_session_id", "game"], ["eq", "public_id", "returned"], ["maybeSingle"]]);
  const status = await repo.control({ gameId: "game", campaignId: "requested", expectedRevision: 2, action: "pause", correctedPhase: null, actorStaffUserId: "staff", reason: "reason", occurredAt: time }); frozen(status);
  equal(f.calls.slice(6), [["rpc", "control_campaign_instance_atomic_v1", { p_game_session_id: "game", p_campaign_public_id: "requested", p_expected_revision: 2, p_action: "pause", p_corrected_phase: null, p_actor_staff_user_id: "staff", p_reason: "reason", p_occurred_at: time }], ["from", "campaign_instances"], ["select", "*"], ["eq", "game_session_id", "game"], ["eq", "public_id", "requested"], ["maybeSingle"]]);
  equal(Object.keys(status), ["campaignId", "status", "currentPhase", "revision", "eventSequence", "outcome", "scheduledAt", "pausedAt", "disabledAt", "completedAt"]);
});
Deno.test("campaign fail acknowledgement preserves arguments and errors", async () => {
  const f = fixture({ data: false, error: { code: "40001", message: "private" } });
  await rejects(() => worker(f.client).fail({ commandId: "command", attemptCount: 3, errorCode: "failed" }), "campaign effect acknowledgement failed: 40001.", true);
  equal(f.calls, [["rpc", "fail_campaign_effect_command_v2", { p_command_public_id: "command", p_expected_attempt_count: 3, p_error_code: "failed" }]]);
});

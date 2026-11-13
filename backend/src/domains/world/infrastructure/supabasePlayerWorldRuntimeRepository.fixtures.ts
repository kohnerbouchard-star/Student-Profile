import { createSupabasePlayerWorldRuntimeRepository } from "./supabasePlayerWorldRuntimeRepository.ts";
import type { PlayerRequestScope } from "../../players/index.ts";

export type Row = Record<string, any>;
export type Result = { data: any; error: { code?: string; message: string } | null };
export type Step = { target: string; result: Result; ready?: Promise<void> };
export type Call = { target: string; operations: unknown[][] };
export const NOW = "2026-07-21T00:00:00.000Z";
export const GAME = "synthetic-game";
export const PLAYER = "synthetic-player";
export const SCOPE = Object.freeze({
  gameId: GAME, playerUuid: PLAYER, activeSessionId: "synthetic-session", sessionValid: true,
  sessionExpiresAt: "2099-01-01T00:00:00.000Z", authorizationContext: Object.freeze({
    actorType: "player", source: "player_session", gameScope: "session", resourceScope: "own_player",
  }),
}) satisfies PlayerRequestScope;
export const INITIAL_TABLES = ["arrival_class_assignments", "player_travel_states", "player_residency_states",
  "world_runtime_instances", "world_location_states", "world_route_states", "campaign_instances"];
export const CLASS_IDS = ["analyst", "builder", "maker", "mediator", "navigator", "operator", "steward", "trader"];

export function equal(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}
export function same(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected)) throw new Error("Expected reference/value identity");
}
export function frozen(...values: unknown[]): void {
  for (const value of values) same(Object.isFrozen(value), true);
}
export async function unavailable(run: () => unknown, message: string): Promise<void> {
  let caught: any;
  try { await run(); } catch (error) { caught = error; }
  equal([caught?.name, caught?.code, caught?.message, caught?.retryable],
    ["WorldRuntimeError", "world_travel_unavailable", message, true]);
}
export function step(target: string, data: any, code?: string): Step {
  return { target, result: { data, error: code ? { code, message: "Private database detail" } : null } };
}

// Script responses independently of predicates: a missing scope/filter cannot be
// hidden by fixture filtering. Every query method, RPC and unexpected write is visible.
export function harness(steps: Step[]) {
  const calls: Call[] = [];
  function next(target: string): { call: Call; result: Promise<Result> } {
    const planned = steps[calls.length];
    if (!planned) throw new Error(`Unexpected query ${target}`);
    equal(target, planned.target);
    const call = { target, operations: [] as unknown[][] };
    calls.push(call);
    return { call, result: planned.ready ? planned.ready.then(() => planned.result) : Promise.resolve(planned.result) };
  }
  const client = {
    from(target: string) {
      const { call, result } = next(target);
      const query = {
        select(...args: unknown[]) { call.operations.push(["select", ...args]); return query; },
        insert(...args: unknown[]) { call.operations.push(["insert", ...args]); return query; },
        update(...args: unknown[]) { call.operations.push(["update", ...args]); return query; },
        eq(...args: unknown[]) { call.operations.push(["eq", ...args]); return query; },
        in(...args: unknown[]) { call.operations.push(["in", ...args]); return query; },
        order(...args: unknown[]) { call.operations.push(["order", ...args]); return query; },
        limit(...args: unknown[]) { call.operations.push(["limit", ...args]); return query; },
        maybeSingle() { call.operations.push(["maybeSingle"]); return result; },
        single() { call.operations.push(["single"]); return result; },
        then(resolve: (value: Result) => unknown, reject: (error: unknown) => unknown) {
          return result.then(resolve, reject);
        },
      };
      return query;
    },
    rpc(target: string, args: unknown) {
      const { call, result } = next(target);
      call.operations.push(["rpc", args]);
      return result;
    },
  };
  return { repository: createSupabasePlayerWorldRuntimeRepository(client as never), calls,
    done() { equal(calls.length, steps.length); } };
}

export function readCall(target: string, options: {
  player?: boolean; order?: string; limit?: number; single?: boolean; select?: string; filters?: unknown[][];
} = {}): Call {
  return { target, operations: [
    ["select", options.select ?? "*"], ["eq", "game_session_id", GAME],
    ...(options.player ? [["eq", "player_id", PLAYER]] : []), ...(options.filters ?? []),
    ...(options.order ? [["order", options.order, { ascending: true }]] : []),
    ...(options.limit === undefined ? [] : [["limit", options.limit]]),
    ...(options.single ? [["maybeSingle"]] : []),
  ] };
}
export const INITIAL_CALLS = [
  readCall(INITIAL_TABLES[0]!, { player: true, single: true }),
  readCall(INITIAL_TABLES[1]!, { player: true, single: true }),
  readCall(INITIAL_TABLES[2]!, { player: true, single: true }),
  readCall(INITIAL_TABLES[3]!, { single: true }),
  readCall(INITIAL_TABLES[4]!, { order: "public_location_id" }),
  readCall(INITIAL_TABLES[5]!, { order: "public_route_id" }),
  readCall(INITIAL_TABLES[6]!, { order: "created_at", limit: 1, single: true }),
];
export function snapshotRows(): Record<string, any> {
  return {
    arrival_class_assignments: { public_id: "asg_public", country_id: "eldoran", class_id: "analyst",
      source: "unknown", questionnaire_id: "q_main", questionnaire_version: "v1", score_result: { scores: [] },
      override_reason: 8, revision: "2", assigned_at: NOW, updated_at: NOW },
    player_travel_states: { current_location_id: "loc_home", status: "unknown", active_journey_id: 99,
      arrival_at: null, revision: "3", updated_at: NOW },
    player_residency_states: { current_country_id: "eldoran", currency_code: "ELD",
      eligible_country_ids: ["eldoran", 1, "", "eldoran", null, "meridian"], pending_country_id: 5,
      revision: "4", updated_at: NOW },
    world_runtime_instances: { pack_id: "pack", pack_version: "v1", definition_digest: "digest",
      revision: "5", updated_at: NOW },
    world_location_states: [{ public_location_id: "loc_home", country_id: "eldoran", display_name: " Home ",
      location_kind: "capital", availability: "normal", revision: "6", updated_at: NOW }],
    world_route_states: [{ public_route_id: "route_road", from_location_id: "loc_home", to_location_id: "loc_port",
      mode: "land", bidirectional: "false", base_cost_minor: "7", base_duration_minutes: "8",
      status: "restricted", reason: "shortage", cost_multiplier_basis_points: "9000",
      duration_multiplier_basis_points: "11000", revision: "9", updated_at: NOW }],
    campaign_instances: null,
  };
}
export function snapshotSteps(rows: Record<string, any> = snapshotRows()): Step[] {
  return INITIAL_TABLES.map((target) => step(target, rows[target] ?? null));
}
export function journeyRow(overrides: Row = {}): Row {
  return { id: "private_journey", public_id: "trj_public", quote: { public_id: " trq_public " },
    from_location_id: "loc_home", to_location_id: "loc_port", currency_code: "ELD", total_cost_minor: "12",
    total_duration_minutes: "13", status: "unexpected", departed_at: NOW, arrival_at: NOW,
    completed_at: undefined, ...overrides };
}
export function expectedJourney(overrides: Row = {}): Row {
  return { publicJourneyId: "trj_public", publicQuoteId: " trq_public ", fromLocationId: "loc_home",
    toLocationId: "loc_port", currencyCode: "ELD", totalCostMinor: 12, totalDurationMinutes: 13,
    status: "in_transit", departedAt: NOW, arrivalAt: NOW, completedAt: null, ...overrides };
}
export function arrivalSteps(grants = CLASS_IDS.map((class_id) => ({ class_id, grant_definition_id: `grant_${class_id}` }))) {
  return [step("players", { country_id: "private_country" }), step("world_country_runtime", {
    country_id: "eldoran", arrival_package_definition_id: "arrival_package", currency_code: "ELD",
  }), step("arrival_class_grant_runtime", grants)];
}
export function campaignRow(overrides: Row = {}): Row {
  return { id: "private_campaign", public_id: "cmp_public", pack_id: "pack", pack_version: "v1",
    definition_id: "campaign", definition_digest: "digest", status: "paused", current_phase: "arrival",
    revision: "2", event_sequence: "3", outcome: "unexpected", scheduled_at: null, paused_at: NOW,
    disabled_at: undefined, completed_at: null, created_at: NOW, updated_at: NOW, ...overrides };
}
export function executionRow(overrides: Row = {}): Row {
  return { public_id: "ev_public", event_key: "arrival_event", execution_key: "exec_arrival",
    to_phase: "arrival", sequence: "2", occurred_at: NOW, ...overrides };
}
export function campaignSteps(row = campaignRow(), executions = [executionRow()], commands: Row[] = []): Step[] {
  const rows = snapshotRows(); rows.campaign_instances = row;
  return [...snapshotSteps(rows), step("campaign_event_executions", executions), step("campaign_effect_commands", commands)];
}

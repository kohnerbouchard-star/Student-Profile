import { createSupabasePlayerWorldRuntimeRepository } from "./supabasePlayerWorldRuntimeRepository.ts";
import { createPlayerWorldRuntimeService } from "../services/playerWorldRuntimeService.ts";
import { handlePlayerWorldRuntimeRequest } from "../api/playerWorldRuntimeHttpHandler.ts";
import { resolveActivePlayerSession, resolvePlayerRequestScope, type PlayerRequestScope } from "../../players/index.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };
type Row = Record<string, any>;
type Call = { table: string; filters: [string, unknown][]; orders: [string, boolean][]; limit?: number; select?: string };
const NOW = "2026-07-21T00:00:00.000Z";
const GAME = "00000000-0000-4000-8000-000000000001";
const OTHER_GAME = "00000000-0000-4000-8000-000000000002";
const PLAYER = "00000000-0000-4000-8000-000000000021";
const OTHER_PLAYER = "00000000-0000-4000-8000-000000000022";
const initialTables = ["arrival_class_assignments", "player_travel_states", "player_residency_states",
  "world_runtime_instances", "world_location_states", "world_route_states", "campaign_instances"];
function scope(gameId = GAME, playerUuid = PLAYER): PlayerRequestScope {
  return Object.freeze({ gameId, playerUuid, activeSessionId: "private-session", sessionValid: true,
    sessionExpiresAt: "2099-01-01T00:00:00.000Z", authorizationContext: Object.freeze({
      actorType: "player", source: "player_session", gameScope: "session", resourceScope: "own_player",
    }) });
}
function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Mismatch: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
}
const forbidden = () => { throw new Error("REF032 read invoked a command, clock or ID generator"); };
function fixture() {
  const rows: Record<string, Row[]> = Object.fromEntries(initialTables.map(t => [t, []]));
  for (const [game, player, revision] of [[GAME, PLAYER, 1], [OTHER_GAME, OTHER_PLAYER, 8]] as const) {
    rows.world_runtime_instances.push({ game_session_id: game, pack_id: "shared-pack", pack_version: "1", definition_digest: "a".repeat(64), revision, updated_at: NOW });
    rows.world_location_states.push({ game_session_id: game, public_location_id: "loc_shared", availability: revision === 1 ? "normal" : "closed", revision, updated_at: NOW });
    rows.world_route_states.push({ game_session_id: game, public_route_id: "route_shared", status: "open", reason: "normal", cost_multiplier_basis_points: 10000, duration_multiplier_basis_points: 10000, revision, updated_at: NOW });
    rows.player_travel_states.push({ game_session_id: game, player_id: player, current_location_id: "loc_shared", status: "available", active_journey_id: null, arrival_at: null, revision, updated_at: NOW });
    rows.player_residency_states.push({ game_session_id: game, player_id: player, current_country_id: "eldoran", currency_code: "ELD", eligible_country_ids: ["eldoran"], pending_country_id: null, revision, updated_at: NOW });
  }
  return rows;
}
// Exercise the actual aggregation; assert captured predicates independently of fixture filtering.
// Writes and RPCs fail immediately so a read cannot hide a command side effect.
function clientFor(rows: Record<string, Row[]>, failure?: string) {
  const calls: Call[] = [];
  const client = {
    calls, rpc: forbidden,
    from(table: string) {
      const call: Call = { table, filters: [], orders: [] };
      calls.push(call);
      const result = (single = false) => {
        let data = (rows[table] ?? []).filter(row => call.filters.every(([key, value]) => row[key] === value));
        for (const [key, ascending] of [...call.orders].reverse()) data.sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0) * (ascending ? 1 : -1));
        if (call.limit !== undefined) data = data.slice(0, call.limit);
        return { data: single ? data[0] ?? null : data, error: table === failure ? { code: "XX000", message: "fixture failure" } : null };
      };
      const query = {
        insert: forbidden, update: forbidden,
        select(value: string) { call.select = value; return query; },
        eq(key: string, value: unknown) { call.filters.push([key, value]); return query; },
        order(key: string, options?: { ascending?: boolean }) { call.orders.push([key, options?.ascending !== false]); return query; },
        limit(value: number) { call.limit = value; return query; },
        maybeSingle() { return Promise.resolve(result(true)); },
        then(onFulfilled: (value: unknown) => unknown, onRejected: (reason: unknown) => unknown) { return Promise.resolve(result()).then(onFulfilled, onRejected); },
      };
      return query;
    },
  };
  return client;
}
function serviceFor(client: ReturnType<typeof clientFor>) {
  return createPlayerWorldRuntimeService({ repository: createSupabasePlayerWorldRuntimeRepository(client as never),
    now: forbidden, createAssignmentId: forbidden, createPublicQuoteId: forbidden });
}
function scoped(calls: Call[], game: string, player: string) {
  for (const call of calls) {
    equal(call.filters.some(([key, value]) => key === "game_session_id" && value === game), true);
    if (["arrival_class_assignments", "player_travel_states", "player_residency_states", "player_travel_journeys"].includes(call.table)) {
      equal(call.filters.some(([key, value]) => key === "player_id" && value === player), true);
    }
  }
}
Deno.test("REF032 actual read isolates two games sharing reference definitions without writes", async () => {
  const rows = fixture(), before = JSON.stringify(rows), client = clientFor(rows), service = serviceFor(client);
  const first = await service.readContext(scope()), second = await service.readContext(scope(OTHER_GAME, OTHER_PLAYER));
  equal([first.world?.revision, second.world?.revision], [1, 8]);
  equal([first.world?.locations[0]?.availability, second.world?.locations[0]?.availability], ["normal", "closed"]);
  equal([first.residency?.revision, second.residency?.revision], [1, 8]);
  equal(client.calls.map(c => c.table), [...initialTables, ...initialTables]);
  scoped(client.calls.slice(0, 7), GAME, PLAYER); scoped(client.calls.slice(7), OTHER_GAME, OTHER_PLAYER);
  equal(client.calls[4]?.orders, [["public_location_id", true]]);
  equal(client.calls[5]?.orders, [["public_route_id", true]]);
  equal(client.calls[6]?.orders, [["created_at", true]]); equal(client.calls[6]?.limit, 1);
  for (const hidden of [GAME, OTHER_GAME, PLAYER, OTHER_PLAYER, "private-session", "shared-pack"]) equal(JSON.stringify([first, second]).includes(hidden), false);
  equal(JSON.stringify(rows), before);
});
Deno.test("REF032 missing optional runtime remains absent with seven batched reads", async () => {
  const client = clientFor({}), result = await serviceFor(client).readContext(scope());
  equal([result.campaign, result.world, result.residency, result.travel.state, result.travel.activeJourney], [null, null, null, null, null]);
  equal(result.arrival.required, true); equal(result.arrival.questionnaire?.questions.length, 8);
  equal(client.calls.map(c => c.table), initialTables);
});
Deno.test("REF032 repeat read sees current revision and does not reuse prior Player projection", async () => {
  const rows = fixture(), client = clientFor(rows), service = serviceFor(client);
  const first = await service.readContext(scope()); rows.world_runtime_instances[0]!.revision = 2;
  const second = await service.readContext(scope());
  equal([first.world?.revision, second.world?.revision], [1, 2]); equal(client.calls.length, 14);
});
Deno.test("REF032 optional journey and paused campaign retain ten-query scope and history ordering", async () => {
  const rows = fixture(); rows.player_travel_states[0]!.active_journey_id = "private-journey";
  rows.player_travel_states[0]!.status = "in_transit";
  rows.player_travel_journeys = [{ id: "private-journey", game_session_id: GAME, player_id: PLAYER,
    public_id: "trj_public", quote: { public_id: "trq_public" }, from_location_id: "loc_shared", to_location_id: "loc_next",
    currency_code: "ELD", total_cost_minor: 5, total_duration_minutes: 10, status: "in_transit", departed_at: NOW, arrival_at: NOW, completed_at: null }];
  rows.campaign_instances = [{ id: "private-campaign", public_id: "cmp_public", game_session_id: GAME,
    pack_id: "shared-pack", pack_version: "1", definition_id: "campaign", definition_digest: "a".repeat(64), status: "paused",
    current_phase: "arrival", revision: 1, event_sequence: 2, outcome: null,
    created_at: NOW, updated_at: NOW, paused_at: NOW, scheduled_at: null, disabled_at: null, completed_at: null }];
  rows.campaign_event_executions = [3, 2, 1].map(sequence => ({ game_session_id: GAME, campaign_instance_id: "private-campaign",
    public_id: `event_${sequence}`, event_key: `event.${sequence}`, execution_key: `execution.${sequence}`, to_phase: "arrival", sequence, occurred_at: NOW }));
  rows.campaign_effect_commands = [{ game_session_id: GAME, campaign_instance_id: "private-campaign", idempotency_key: "command", status: "completed", payload: { targetLocationIds: ["loc_shared"] } }];
  const client = clientFor(rows), result = await serviceFor(client).readContext(scope());
  equal(client.calls.map(c => c.table), [...initialTables, "player_travel_journeys", "campaign_event_executions", "campaign_effect_commands"]);
  scoped(client.calls, GAME, PLAYER);
  equal(result.travel.state?.activeJourneyId, "trj_public"); equal(result.campaign?.status, "paused");
  equal(result.campaign?.history.map(e => e.sequence), [1, 2]); equal(result.campaign?.currentLocationAffected, true);
  equal(client.calls[8]?.limit, 200); equal(client.calls[9]?.limit, 500);
  equal(client.calls[8]?.orders, [["sequence", true]]);
  equal(client.calls[9]?.orders, [["created_at", true]]);
  for (const call of client.calls.slice(8)) equal(call.filters.some(([key, value]) => key === "campaign_instance_id" && value === "private-campaign"), true);
  for (const hidden of ["private-journey", "private-campaign", GAME, PLAYER]) equal(JSON.stringify(result).includes(hidden), false);
  for (const failedTable of ["player_travel_journeys", "campaign_event_executions", "campaign_effect_commands"]) {
    let failure: any;
    try { await serviceFor(clientFor(rows, failedTable)).readContext(scope()); } catch (caught) { failure = caught; }
    equal(failure?.code, "world_travel_unavailable");
  }
});
for (const table of initialTables) Deno.test(`REF032 ${table} failure rejects partial World context`, async () => {
  const client = clientFor(fixture(), table); let error: any;
  try { await serviceFor(client).readContext(scope()); } catch (caught) { error = caught; }
  equal(error?.code, "world_travel_unavailable"); equal(error?.retryable, true);
  equal(client.calls.map(c => c.table), initialTables);
});
Deno.test("REF032 scope denial occurs before any World query", async () => {
  const client = clientFor(fixture());
  const response = await handlePlayerWorldRuntimeRequest(new Request("https://example.test/players/me/world-runtime"), {
    resolveScope: async () => { throw Object.assign(new Error("Denied"), { code: "permission_denied", status: 403 }); }, service: serviceFor(client),
  });
  equal(response.status, 403); equal(client.calls.length, 0);
});
Deno.test("REF032 paused game retains active-session lookup denial before World reads", async () => {
  const rows = fixture();
  rows.player_sessions = [{ id: "session", game_session_id: GAME, player_id: PLAYER, status: "active",
    session_token_hash: "fixture-hash", expires_at: "2099-01-01T00:00:00.000Z", revoked_at: null }];
  rows.game_sessions = [{ id: GAME, name: "Paused", status: "disabled", lifecycle_state: "paused" }];
  const client = clientFor(rows);
  const response = await handlePlayerWorldRuntimeRequest(new Request("https://example.test/players/me/world-runtime", { headers: { "x-player-session-token": "fixture-token" } }), {
    resolveScope: request => resolvePlayerRequestScope(request, { hashSessionToken: async () => "fixture-hash",
      resolvePlayerSession: hash => resolveActivePlayerSession(client as never, hash) }), service: serviceFor(client),
  });
  equal(response.status, 401); equal(client.calls.map(c => c.table), ["player_sessions", "game_sessions"]);
  equal(client.calls[1]?.filters, [["id", GAME], ["status", "active"]]);
});

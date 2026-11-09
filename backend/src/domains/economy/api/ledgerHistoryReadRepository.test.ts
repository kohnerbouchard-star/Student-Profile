import { SupabaseLedgerHistoryReadRepository } from "../infrastructure/supabaseLedgerHistoryReadRepository.ts";
import { handlePlayerLedgerHistoryRequest } from "./playerLedgerHistoryHttpHandler.ts";
import { handleStaffPlayerLedgerHistoryRequest } from "./staffPlayerLedgerHistoryHttpHandler.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };
const GAME = "game-fixture", PLAYER = "player-fixture", STAFF = "staff-fixture";
const STAMP = "2026-10-01T00:00:00.000Z";
type Audience = "player" | "staff";
type Options = { absent?: string; failure?: string; revoked?: boolean; expired?: boolean; inactive?: boolean; denied?: boolean; empty?: boolean };
type Query = { table: string; columns?: string; filters: Array<[string, unknown]>; order?: [string, unknown]; limit?: number };
function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
}
const entries = ["ECO", "LUM"].map((currency, i) => ({ id: `entry-${i}`, account_type: i ? "savings" : "checking", amount: "12.3400", currency_code: currency,
  entry_type: "credit", source_domain: "attendance", source_action: "fixture", source_id: null, created_by_type: "staff_user", created_at: STAMP }));
async function fixture(audience: Audience, options: Options, run: (f: any) => Promise<void>) {
  const runtime = (globalThis as any).Deno, savedGet = runtime.env.get, savedFetch = globalThis.fetch;
  const queries: Query[] = [], events: string[] = [];
  const env: Record<string, string> = { SUPABASE_URL: "https://ref021.invalid", SUPABASE_ANON_KEY: "fixture-anon", SUPABASE_SERVICE_ROLE_KEY: "fixture-service" };
  runtime.env.get = (key: string) => env[key];
  globalThis.fetch = () => { throw new Error("Ledger fixture must never access network"); };
  const rows: Record<string, unknown> = {
    player_sessions: { id: "session-fixture", game_session_id: GAME, player_id: PLAYER, status: "active", expires_at: new Date(Date.now() + (options.expired ? -60000 : 60000)).toISOString(), revoked_at: options.revoked ? STAMP : null },
    game_sessions: { id: GAME, name: "Fixture", status: "active", owner_staff_user_id: STAFF },
    players: { id: PLAYER, display_name: "Synthetic Player", roster_label: null, status: options.inactive ? "archived" : "active" },
    account_balances: options.empty ? null : [{ account_type: "checking", balance: "100.2500", currency_code: "ECO" }, { account_type: "savings", balance: "0.0100", currency_code: "LUM" }],
    ledger_entries: options.empty ? null : entries,
  };
  const client = { from(table: string) {
    if (!(table in rows)) throw new Error(`Unexpected table ${table}`);
    const call: Query = { table, filters: [] }; queries.push(call); events.push(table);
    const result = () => ({ data: options.absent === table ? null : rows[table], error: options.failure === table ? { message: "private SQL diagnostic" } : null });
    const q: any = { select(columns: string) { call.columns = columns; return q; }, eq(key: string, value: unknown) { call.filters.push([key, value]); return q; },
      order(key: string, value: unknown) { call.order = [key, value]; return q; }, limit(value: number) { call.limit = value; return q; },
      maybeSingle() { return Promise.resolve(result()); }, then(resolve: any, reject: any) { return Promise.resolve(result()).then(resolve, reject); },
      insert() { throw new Error("No writes allowed"); }, update() { throw new Error("No writes allowed"); }, delete() { throw new Error("No writes allowed"); } };
    return q;
  }, rpc() { throw new Error("No mutation or replacement RPC allowed"); } };
  const send = (query = "", method = "GET", token = "fixture-token") => {
    const request = new Request(`https://ref021.invalid/ledger${query}`, { method, headers: token ? { "x-player-session-token": token } : {} });
    if (audience === "player") return handlePlayerLedgerHistoryRequest(request, { createServiceClient: () => client as never });
    return handleStaffPlayerLedgerHistoryRequest(request, GAME, PLAYER, { resolveStaffForRequest: async () => {
      events.push("staff-auth");
      return options.denied ? { ok: false as const, status: 403, error: { code: "staff_forbidden", message: "Forbidden", retryable: false } }
        : { ok: true as const, staff: { id: STAFF }, serviceClient: client as never };
    } });
  };
  try { await run({ send, queries, events, client }); } finally { runtime.env.get = savedGet; globalThis.fetch = savedFetch; }
}
const dataTables = (f: any) => f.queries.filter((q: Query) => ["account_balances", "ledger_entries"].includes(q.table));
for (const audience of ["player", "staff"] as const) {
  for (const limit of [1, 50, 100]) Deno.test(`REF021 ${audience}: exact scope, projection, ordering and limit ${limit}`, () => fixture(audience, {}, async (f) => {
    const response = await f.send(limit === 50 ? "" : `?limit=${limit}`), body = await response.json();
    equal(response.status, 200); equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
    equal(dataTables(f), [
      { table: "account_balances", filters: [["game_session_id", GAME], ["player_id", PLAYER]], columns: "account_type,balance,currency_code", order: ["account_type", { ascending: true }] },
      { table: "ledger_entries", filters: [["game_session_id", GAME], ["player_id", PLAYER]], columns: "id,account_type,amount,currency_code,entry_type,source_domain,source_action,source_id,created_by_type,created_at", order: ["created_at", { ascending: false }], limit },
    ]);
    equal(f.events, audience === "player" ? ["player_sessions", "game_sessions", "players", "account_balances", "ledger_entries"] : ["staff-auth", "game_sessions", "players", "account_balances", "ledger_entries"]);
    // Tied timestamps retain the returned order; no new tie-breaker or currency conversion.
    equal(body.currentBalances, [{ accountType: "checking", balance: 100.25, currencyCode: "ECO" }, { accountType: "savings", balance: 0.01, currencyCode: "LUM" }]);
    equal(body.ledgerEntries.map((r: any) => [r.id, r.amount, r.currencyCode, r.createdAt]), [["entry-0", 12.34, "ECO", STAMP], ["entry-1", 12.34, "LUM", STAMP]]);
    equal(Object.keys(body.ledgerEntries[0]), ["id", "accountType", "amount", "currencyCode", "entryType", "sourceDomain", "sourceAction", "sourceId", "createdByType", "createdAt"]);
    equal(body.player, { id: PLAYER, displayName: "Synthetic Player", rosterLabel: null, status: "active" });
    equal(body.gameSession, { id: GAME, name: "Fixture", status: "active" });
  }));
  Deno.test(`REF021 ${audience}: null data is empty without added queries`, () => fixture(audience, { empty: true }, async (f) => {
    const body = await (await f.send()).json(); equal(body.currentBalances, []); equal(body.ledgerEntries, []); equal(dataTables(f).length, 2);
  }));
  for (const failure of ["account_balances", "ledger_entries"]) Deno.test(`REF021 ${audience}: ${failure} failure is redacted and stops reads`, () => fixture(audience, { failure }, async (f) => {
    const response = await f.send(), body = await response.json(); equal(response.status, 500);
    equal(body.error.code, audience === "player" ? "player_ledger_history_failed" : "admin_player_ledger_history_failed");
    equal(body.error.message, "Player ledger history could not be loaded."); equal(body.error.retryable, false);
    equal(dataTables(f).length, failure === "account_balances" ? 1 : 2);
  }));
  for (const limit of ["0", "101", "1.5", "oops"]) Deno.test(`REF021 ${audience}: invalid limit ${limit} never reads ledger data`, () => fixture(audience, {}, async (f) => {
    const response = await f.send(`?limit=${limit}`); equal(response.status, 400); equal(dataTables(f), []);
  }));
  for (const absent of ["game_sessions", "players"]) Deno.test(`REF021 ${audience}: missing or wrong-scope ${absent} never reads money`, () => fixture(audience, { absent }, async (f) => {
    const response = await f.send(); equal(response.status, audience === "player" ? 401 : 404); equal(dataTables(f), []);
    const query = f.queries.find((q: Query) => q.table === absent);
    equal(query.filters, absent === "players" ? [["game_session_id", GAME], ["id", PLAYER]] : audience === "player" ? [["id", GAME], ["status", "active"]] : [["id", GAME], ["owner_staff_user_id", STAFF]]);
  }));
  Deno.test(`REF021 ${audience}: unsupported method has no reads`, () => fixture(audience, {}, async (f) => {
    equal((await f.send("", "POST")).status, 405); equal(f.queries, []);
  }));
}
for (const options of [{ revoked: true }, { expired: true }, { inactive: true }]) Deno.test(`REF021 Player denial ${JSON.stringify(options)}`, () => fixture("player", options, async (f) => {
  equal((await f.send()).status, 401); equal(dataTables(f), []);
}));
Deno.test("REF021 missing Player token and denied Staff never read persistence", async () => {
  await fixture("player", {}, async (f) => { equal((await f.send("", "GET", "")).status, 401); equal(f.queries, []); });
  await fixture("staff", { denied: true }, async (f) => { equal((await f.send()).status, 403); equal(f.queries, []); });
});
Deno.test("REF021 Staff retains history visibility for archived Player", () => fixture("staff", { inactive: true }, async (f) => {
  equal((await f.send()).status, 200); equal(dataTables(f).length, 2);
}));

Deno.test("REF021 repository retains exact decimal strings and input row order", () => fixture("staff", {}, async (f) => {
  const result = await new SupabaseLedgerHistoryReadRepository(f.client).readHistory({ gameSessionId: GAME, playerId: PLAYER, limit: 50 });
  equal(result.balances.map(r => r.balance), ["100.2500", "0.0100"]);
  equal(result.entries, entries);
}));

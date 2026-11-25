// Reconstructed local characterization, not recovered original patch bytes.
// Exercise actual session resolution and public RPC repository without injected scope.
import { handlePlayerBankingPublicRequest } from "./playerBankingPublicHttpHandler.ts";
declare const Deno: { test(name: string, run: () => void | Promise<void>): void };
const GAME = "00000000-0000-4000-8000-000000000001", PLAYER = "00000000-0000-4000-8000-000000000002";
const STAMP = "2026-10-01T00:00:00.000Z";
type Options = { absent?: string; failure?: string; revoked?: boolean; expired?: boolean; inactive?: boolean; empty?: boolean; nullAccounts?: boolean; accounts?: readonly Record<string, unknown>[] };
function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
}
async function fixture(options: Options, run: (f: any) => Promise<void>) {
  const savedFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("Banking fixture must never access network"); };
  const queries: any[] = [], calls: any[] = [], events: string[] = [];
  const rows: Record<string, unknown> = {
    player_sessions: { id: "session-fixture", game_session_id: GAME, player_id: PLAYER, status: "active", expires_at: new Date(Date.now() + (options.expired ? -60000 : 60000)).toISOString(), revoked_at: options.revoked ? STAMP : null },
    game_sessions: { id: GAME, name: "Fixture", status: "active" },
    players: { id: PLAYER, display_name: "Synthetic Player", roster_label: null, status: options.inactive ? "archived" : "active" },
  };
  const entries = ["ECO", "LUM"].map(currency => ({ account_type: "checking", amount: "12.3400", currency_code: currency, entry_type: "credit", source_domain: "attendance", source_action: "fixture", created_at: STAMP }));
  const client = {
    from(table: string) {
      if (!(table in rows)) throw new Error(`Unexpected financial table access: ${table}`);
      const query: any = { table, filters: [] }; queries.push(query); events.push(table);
      const q: any = {
        select(columns: string) { query.columns = columns; return q; },
        eq(k: string, v: unknown) { query.filters.push([k, v]); return q; },
        maybeSingle() { return Promise.resolve({ data: options.absent === table ? null : rows[table], error: options.failure === table ? { message: "private SQL diagnostic" } : null }); },
      }; return q;
    },
    rpc(name: string, args: unknown) {
      calls.push({ name, args }); events.push(name);
      if (!["list_player_bank_accounts_v1", "list_player_bank_activity_v1"].includes(name)) throw new Error(`Unexpected RPC ${name}`);
      const data = name === "list_player_bank_accounts_v1" ? options.nullAccounts ? null : options.empty ? [] : options.accounts ?? [{ account_key: "bac_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", account_kind: "checking", currency_code: "ECO", posted_amount: "100.2500", held_amount: "0.0100" }] : options.empty ? null : entries;
      return Promise.resolve({ data, error: options.failure === name ? { message: "private SQL diagnostic" } : null });
    },
  };
  const send = (query = "", method = "GET", token = "fixture-token") => handlePlayerBankingPublicRequest(
    new Request(`https://fixture.invalid/players/me/ledger${query}`, { method, headers: token ? { "x-player-session-token": token } : {} }),
    { createServiceClient: () => client as never, readEnvironment: () => ({ ok: true, value: { supabaseUrl: "https://fixture.invalid", supabaseAnonKey: "fixture", supabaseServiceRoleKey: "fixture" } }) },
  );
  try { await run({ send, queries, calls, events }); } finally { globalThis.fetch = savedFetch; }
}
for (const limit of [1, 50, 100]) Deno.test(`Player Banking real session scopes RPCs and bounds limit ${limit}`, () => fixture({}, async f => {
  const response = await f.send(limit === 50 ? "" : `?limit=${limit}`), body = await response.json();
  equal(response.status, 200); equal(response.headers.get("cache-control"), "private, no-store");
  equal(f.calls, [{ name: "list_player_bank_accounts_v1", args: { p_game_session_id: GAME, p_player_id: PLAYER } }, { name: "list_player_bank_activity_v1", args: { p_game_session_id: GAME, p_player_id: PLAYER, p_limit: limit, p_offset: 0 } }]);
  equal(f.events, ["player_sessions", "game_sessions", "players", "list_player_bank_accounts_v1", "list_player_bank_activity_v1"]);
  equal(f.queries[1].filters, [["id", GAME], ["status", "active"]]); equal(f.queries[2].filters, [["game_session_id", GAME], ["id", PLAYER]]);
  equal(f.queries[0].filters[0][0], "session_token_hash");
  if (!/^[a-f0-9]{64}$/.test(f.queries[0].filters[0][1])) throw new Error("Session token was not hashed");
  equal(body.ledgerEntries.map((e: any) => [e.amount, e.currencyCode, e.createdAt]), [[12.34, "ECO", STAMP], [12.34, "LUM", STAMP]].slice(0, limit));
  equal(body.currentBalances[0].balance, 100.25);
  equal(Object.keys(body.ledgerEntries[0]), ["entryKey", "accountType", "amount", "currencyCode", "entryType", "sourceDomain", "sourceAction", "createdAt"]);
  if (JSON.stringify(body).includes(GAME) || JSON.stringify(body).includes(PLAYER)) throw new Error("Private identity leaked");
}));
Deno.test("Player Banking real RPC empty/null activity is bounded empty", () => fixture({ empty: true }, async f => {
  const body = await (await f.send()).json(); equal(body.currentBalances, []); equal(body.ledgerEntries, []); equal(f.calls.length, 2);
}));
Deno.test("Player Banking malformed null account response fails closed", () => fixture({ nullAccounts: true }, async f => {
  const response = await f.send(); equal(response.status, 500); equal((await response.json()).error.code, "player_banking_read_failed");
}));
for (const failure of ["list_player_bank_accounts_v1", "list_player_bank_activity_v1"]) Deno.test(`Player Banking RPC failure ${failure} is redacted and stops reads`, () => fixture({ failure }, async f => {
  const response = await f.send(), body = await response.json(); equal(response.status, 500); equal(body.error.code, "player_banking_read_failed"); equal(body.error.retryable, false);
  if (JSON.stringify(body).includes("private SQL")) throw new Error("Diagnostic leaked");
  equal(f.calls.length, failure === "list_player_bank_accounts_v1" ? 1 : 2);
}));
for (const limit of ["0", "101", "1.5", "oops"]) Deno.test(`Player Banking invalid limit ${limit} never reads persistence`, () => fixture({}, async f => {
  equal((await f.send(`?limit=${limit}`)).status, 400); equal(f.calls, []); equal(f.queries, []);
}));
for (const absent of ["player_sessions", "game_sessions", "players"]) Deno.test(`Player Banking absent/wrong-scope ${absent} never reads money`, () => fixture({ absent }, async f => {
  equal((await f.send()).status, 401); equal(f.calls, []);
  if (absent === "players") equal(f.queries[2].filters, [["game_session_id", GAME], ["id", PLAYER]]);
  if (absent === "game_sessions") equal(f.queries[1].filters, [["id", GAME], ["status", "active"]]);
}));
for (const options of [{ revoked: true }, { expired: true }, { inactive: true }]) Deno.test(`Player Banking real session denial ${JSON.stringify(options)}`, () => fixture(options, async f => {
  equal((await f.send()).status, 401); equal(f.calls, []);
}));
Deno.test("Player Banking missing token never reads persistence", () => fixture({}, async f => {
  equal((await f.send("", "GET", "")).status, 401); equal(f.queries, []); equal(f.calls, []);
}));
Deno.test("Player Banking unsupported method never reads persistence", () => fixture({}, async f => {
  equal((await f.send("", "POST")).status, 405); equal(f.queries, []); equal(f.calls, []);
}));
for (const failure of ["player_sessions", "game_sessions", "players"]) Deno.test(`Player Banking session lookup ${failure} error never reads money`, () => fixture({ failure }, async f => {
  const response = await f.send(), body = await response.json(); equal(response.status, 500); equal(f.calls, []);
  if (JSON.stringify(body).includes("private SQL")) throw new Error("Diagnostic leaked");
}));

for (const [label, amounts, expected] of [
  ["explicit zero availability", { posted_amount: "15.34", held_amount: "15.34", available_amount: "0" }, [15.34, 15.34, 0]],
  ["explicit zero hold", { posted_amount: "15.34", held_amount: "0", available_amount: "15.34" }, [15.34, 0, 15.34]],
  ["known hold without availability", { posted_amount: "15.34", held_amount: "3" }, [15.34, 3, 12.34]],
  ["signed balances", { posted_amount: "-2.25", held_amount: "0", available_amount: "-2.25" }, [-2.25, 0, -2.25]],
  ["posted only", { balance: "15.34" }, null],
  ["explicit availability without hold", { posted_amount: "15.34", available_amount: "12.34" }, null],
  ["blank hold", { posted_amount: "15.34", held_amount: " " }, null],
  ["negative hold", { posted_amount: "15.34", held_amount: "-3", available_amount: "12.34" }, null],
  ["hex hold", { posted_amount: "15.34", held_amount: "0x0" }, null],
  ["blank availability", { posted_amount: "15.34", held_amount: "3", available_amount: " " }, null],
] as const) Deno.test(`Player Banking real read requires hold evidence: ${label}`, () => fixture({
  accounts: [{ account_key: "bac_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", account_kind: "checking", currency_code: "ECO", ...amounts }],
}, async (f) => {
  const response = await f.send(), body = await response.json();
  equal(f.calls.map((call: { name: string }) => call.name), ["list_player_bank_accounts_v1", "list_player_bank_activity_v1"]);
  if (expected === null) {
    equal(response.status, 500);
    equal(body.error.code, "player_banking_read_failed");
    equal(body.error.retryable, false);
    equal(Object.hasOwn(body, "currentBalances"), false);
  } else {
    equal(response.status, 200);
    equal(body.currentBalances.map((row: any) => [row.postedAmount, row.heldAmount, row.availableAmount]), [expected]);
  }
}));

import assert from "node:assert/strict";
import { createAdminRequestApplicationContext } from "../backend/supabase/functions/admin-api/adminRequestApplicationContext.ts";
import { handleAdminContractRewardIssueOperation } from "../backend/supabase/functions/admin-api/contractRewardIssueOperation.ts";
import { proxyClassroom } from "../backend/supabase/functions/admin-api/common.ts";

// This is a disposable PostgreSQL qualification harness, not a production migration.
// The application adapter/helper run unchanged; only their transport uses psql.
const database = Deno.env.get("DATABASE_URL") || "";
const location = new URL(database);
assert.equal(Deno.env.get("REF009_DISPOSABLE_DATABASE"), "1");
assert.ok(["postgres:", "postgresql:"].includes(location.protocol));
assert.ok(["127.0.0.1", "localhost"].includes(location.hostname));
assert.equal(location.port, "54322");
assert.equal(location.pathname, "/postgres");
const decoder = new TextDecoder();
const literal = (value: unknown) => `'${String(value).replaceAll("'", "''")}'`;
const identifier = (value: string) => `"${value.replaceAll('"', '""')}"`;
const evidence: Record<string, unknown> = {
  task: "REF-009", sourceSha: Deno.env.get("RELEASE_COMMIT"),
  transport: "real application adapters and helper; PostgreSQL service_role via psql",
  productionTouched: false, checks: {}, status: "running",
};
const checks = evidence.checks as Record<string, unknown>;

function command(statement: string, app = "ref009-fixture", role = false) {
  return new Deno.Command("psql", {
    args: [database, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c",
      role ? `begin; set local role service_role; ${statement}; commit;` : statement],
    env: { PGAPPNAME: app, PGOPTIONS: "-c statement_timeout=45000 -c lock_timeout=30000" },
    stdout: "piped", stderr: "piped",
  });
}
async function sql(statement: string, app?: string, role = false): Promise<string> {
  const result = await command(statement, app, role).output();
  if (result.code !== 0) throw new Error(decoder.decode(result.stderr).trim());
  return decoder.decode(result.stdout).trim();
}
async function jsonSql(statement: string, app?: string, role = false) {
  return JSON.parse(await sql(statement, app, role));
}
type Fixture = { game: string; staff: string; player: string; item: string; contract: string; progress: string };
type State = Record<string, Array<Record<string, any>>>;
let tables: Array<{ table_schema: string; table_name: string }> = [];

async function seed(label: string): Promise<Fixture> {
  const f = Object.fromEntries(["game", "staff", "player", "item", "contract", "progress"]
    .map(key => [key, crypto.randomUUID()])) as Fixture;
  const gameItem = crypto.randomUUID();
  const reward = { checking: { amount: 12.34, currencyMode: "global_eco", currencyCode: "ECO" },
    items: [{ storeItemId: f.item, quantity: 2 }],
    storyFlagsToSet: [{ flagKey: "ref009_reward_complete", value: true }] };
  await sql(`begin;
    insert into public.staff_users (id,supabase_auth_user_id,email,display_name)
      values (${literal(f.staff)},${literal(crypto.randomUUID())},${literal(`${f.staff}@example.test`)},'REF009 Staff');
    insert into public.game_sessions (id,owner_staff_user_id,name,status)
      values (${literal(f.game)},${literal(f.staff)},${literal(`REF009 ${label}`)},'active');
    insert into public.players (id,game_session_id,display_name,status)
      values (${literal(f.player)},${literal(f.game)},'REF009 Player','active');
    insert into public.game_items (id,public_key,game_session_id,canonical_key,source_kind,name,item_class,subtype,stackable,serialized,transferable,status)
      values (${literal(gameItem)},${literal(`itm_${gameItem.replaceAll("-", "")}`)},${literal(f.game)},'ref009.fixture','business_product','REF009 Item','finished_good','widget',true,false,true,'active');
    insert into public.store_items (id,game_session_id,item_key,name,category,price,currency_code,stock_quantity,status,visibility,game_item_id)
      values (${literal(f.item)},${literal(f.game)},'ref009_fixture','REF009 Item','goods',1.25,'ECO',10,'active','visible',${literal(gameItem)});
    insert into public.game_session_contracts (id,game_session_id,contract_key,source_type,title,description,instructions,category,status,visibility,targeting_payload,requirements_payload,reward_payload,completion_mode,published_at,metadata)
      values (${literal(f.contract)},${literal(f.game)},'contract.ref009.fixture','system','REF009 Contract','Disposable qualification','Complete fixture','story','active','public','{"allPlayers":true}','{}',${literal(JSON.stringify(reward))}::jsonb,'manual_review',clock_timestamp(),'{}');
    insert into public.player_contract_progress (id,game_session_id,contract_id,player_id,status,completed_at)
      values (${literal(f.progress)},${literal(f.game)},${literal(f.contract)},${literal(f.player)},'completed',clock_timestamp());
    commit;`);
  return f;
}
async function snapshot(f: Fixture): Promise<State> {
  const selects = tables.map(t => `select ${literal(`${t.table_schema}.${t.table_name}`)} as name,
    coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]'::jsonb) as rows
    from ${identifier(t.table_schema)}.${identifier(t.table_name)} r where game_session_id=${literal(f.game)}::uuid`);
  return await jsonSql(`select jsonb_object_agg(name,rows)::text from (${selects.join(" union all ")}) s`);
}
function delta(before: State, after: State) {
  return Object.fromEntries(Object.keys(after).sort()
    .map(key => [key, after[key].length - before[key].length])
    .filter(([, difference]) => difference !== 0));
}
function service(app: string) {
  const calls: Array<Record<string, unknown>> = [];
  return { calls,
    async rpc(name: string, args: Record<string, unknown>) {
      assert.equal(name, "issue_contract_rewards_atomic_v1");
      assert.deepEqual(Object.keys(args).sort(), ["p_contract_id", "p_game_session_id", "p_progress_id", "p_request_id", "p_staff_user_id"]);
      calls.push(args);
      try {
        const values = ["p_game_session_id", "p_contract_id", "p_progress_id", "p_staff_user_id", "p_request_id"]
          .map(key => args[key] == null ? "null" : literal(args[key]));
        const data = await jsonSql(`select coalesce(jsonb_agg(r),'[]'::jsonb)::text from public.issue_contract_rewards_atomic_v1(${values.join(",")}) r`, app, true);
        return { data, error: null };
      } catch (error) { return { data: null, error: { message: String(error) } }; }
    },
    from(table: string) {
      assert.ok(["game_session_contracts", "player_contract_progress"].includes(table));
      const filters: string[] = [];
      const query = {
        select(columns: string) { assert.equal(columns, "*"); return query; },
        eq(column: string, value: unknown) {
          assert.ok(["game_session_id", "contract_id", "id"].includes(column));
          filters.push(`${identifier(column)}=${literal(value)}::uuid`); return query;
        },
        async maybeSingle() {
          try {
            const rows = await jsonSql(`select coalesce(jsonb_agg(r),'[]'::jsonb)::text from public.${identifier(table)} r where ${filters.join(" and ")}`, `${app}-read`, true);
            assert.ok(rows.length <= 1);
            return { data: rows[0] ?? null, error: null };
          } catch (error) { return { data: null, error }; }
        },
      }; return query;
    },
  };
}
async function issue(f: Fixture, path: "before" | "after", key: string, app = `ref009-${path}`) {
  const suffix = `/contracts/${f.contract}/progress/${f.progress}/rewards/issue`;
  const request = new Request(`https://ref009.invalid/games/${f.game}${suffix}`, {
    method: "POST", headers: { "idempotency-key": key, "content-type": "application/json" },
    body: JSON.stringify({ gameSessionId: "forged", staffUserId: "forged", reward: { amount: 999999 } }),
  });
  const client = service(app);
  const applicationContext = createAdminRequestApplicationContext({ ownedGame: { id: f.game }, staffUserId: f.staff,
    security: { ok: true, assuranceLevel: "aal2", permissions: ["contracts.manage"], requiredPermission: "contracts.manage" }, requestId: "context-only" });
  const response = path === "before"
    ? await proxyClassroom(request, { service: client, staff: { id: f.staff } }, `/staff/game-sessions/${f.game}${suffix}`, "POST")
    : await handleAdminContractRewardIssueOperation(request, client as never, { applicationContext, gameSessionId: f.game, suffix });
  assert.ok(response);
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].p_request_id, key);
  assert.equal(response.headers.get("cache-control"), "no-store");
  return { status: response.status, body: await response.json() };
}
function assertIssued(f: Fixture, before: State, after: State, key: string) {
  assert.equal(after["public.contract_reward_issuances"].length - before["public.contract_reward_issuances"].length, 1);
  const receipt = after["public.contract_reward_issuances"].find(r => r.progress_id === f.progress)!;
  assert.equal(receipt.request_id, key);
  assert.equal(receipt.issued_by_staff_user_id, f.staff);
  const entries = after["public.ledger_entries"].filter(r => r.source_id === f.progress && r.source_action === "contract_reward_cash");
  assert.equal(entries.length, 1);
  assert.equal(Number(entries[0].amount), 12.34);
  assert.equal(entries[0].currency_code, "ECO");
  const holdings = after["public.inventory_holdings"].filter(r => r.player_id === f.player && r.store_item_id === f.item);
  assert.equal(holdings.length, 1);
  assert.equal(Number(holdings[0].quantity_owned), 2);
  assert.equal(Number(after["public.store_items"].find(r => r.id === f.item)!.stock_quantity), 8);
  assert.ok(after["public.player_contract_progress"].find(r => r.id === f.progress)!.reward_issued_at);
  const audits = after["public.audit_log"].filter(r => r.metadata?.progressId === f.progress);
  for (const action of ["contracts.contract_reward_item", "contracts.contract_reward_story_flag", "contracts.contract_rewards_applied"]) {
    const rows = audits.filter(r => r.action === action);
    assert.equal(rows.length, 1, action);
    assert.equal(rows[0].metadata.requestId, key);
    assert.equal(rows[0].actor_id, f.staff);
  }
}
async function waitFor(check: () => Promise<boolean>, message: string) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(message);
}

try {
  tables = await jsonSql(`select jsonb_agg(jsonb_build_object('table_schema',c.table_schema,'table_name',c.table_name) order by c.table_schema,c.table_name)::text
    from information_schema.columns c join information_schema.tables t using(table_catalog,table_schema,table_name)
    where c.column_name='game_session_id' and c.table_schema in ('public','economy_private') and t.table_type='BASE TABLE'`);
  checks.snapshotTableCount = tables.length;
  assert.ok(tables.length > 10);
  const outcomes: Record<string, unknown> = {};
  for (const path of ["before", "after"] as const) {
    const f = await seed(path);
    const before = await snapshot(f);
    const first = await issue(f, path, "ref009-success");
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.rewardIssued, true);
    assert.equal(first.body.alreadyIssued, false);
    const after = await snapshot(f);
    assertIssued(f, before, after, "ref009-success");
    const replay = await issue(f, path, "ref009-success");
    assert.equal(replay.status, 200);
    assert.equal(replay.body.alreadyIssued, true);
    assert.equal(replay.body.rewardIssued, false);
    assert.deepEqual(replay.body.rewardResult, first.body.rewardResult);
    assert.equal(replay.body.issuedAt, first.body.issuedAt);
    assert.deepEqual(await snapshot(f), after, `${path}: identical retry changed persistent state`);
    await sql(`update public.game_session_contracts set reward_payload=jsonb_set(reward_payload,'{checking,amount}','12.35') where id=${literal(f.contract)}`);
    const conflictBefore = await snapshot(f);
    const conflict = await issue(f, path, "ref009-success");
    assert.equal(conflict.status, 400);
    assert.match(conflict.body.error.message, /CONTRACT_REWARD_IDEMPOTENCY_CONFLICT/);
    assert.deepEqual(await snapshot(f), conflictBefore, `${path}: conflicting replay changed persistent state`);
    outcomes[path] = delta(before, after);
  }
  assert.deepEqual(outcomes.after, outcomes.before);
  checks.successEffectParity = outcomes;
  checks.identicalReplay = true;
  checks.conflictingReplay = true;

  for (const path of ["before", "after"] as const) {
    const f = await seed(`${path}-failure`);
    await sql(`create schema if not exists ref009_test;
      create or replace function ref009_test.fail_issuance() returns trigger language plpgsql as $f$
      begin if new.game_session_id=${literal(f.game)}::uuid then raise exception 'REF009_INJECTED_AFTER_REWARD_WRITES'; end if; return new; end $f$;
      create trigger ref009_injected_failure before insert on public.contract_reward_issuances for each row execute function ref009_test.fail_issuance();`);
    const before = await snapshot(f);
    const failure = await issue(f, path, "ref009-failure");
    assert.equal(failure.status, 400);
    assert.match(failure.body.error.message, /REF009_INJECTED_AFTER_REWARD_WRITES/);
    assert.deepEqual(await snapshot(f), before, `${path}: injected failure left partial writes`);
    await sql("drop trigger ref009_injected_failure on public.contract_reward_issuances; drop schema ref009_test cascade;");
    const retry = await issue(f, path, "ref009-failure");
    assert.equal(retry.status, 200, JSON.stringify(retry.body));
    assertIssued(f, before, await snapshot(f), "ref009-failure");
  }
  checks.rollbackAfterRewardWrites = true;
  checks.retryAfterRollback = true;

  const denied = await seed("denied");
  await sql(`update public.player_contract_progress set status='submitted',completed_at=null where id=${literal(denied.progress)}`);
  const deniedBefore = await snapshot(denied);
  for (const path of ["before", "after"] as const) {
    const response = await issue(denied, path, "ref009-denied");
    assert.equal(response.status, 409);
    assert.equal(response.body.error.code, "contract_progress_not_completed");
    const wrongAssociation = await issue({ ...denied, contract: crypto.randomUUID() }, path, "ref009-wrong-scope");
    assert.equal(wrongAssociation.status, 404);
    assert.deepEqual(await snapshot(denied), deniedBefore);
  }
  checks.deniedAndWrongAssociationNoEffects = true;

  const race = await seed("concurrent");
  const raceBefore = await snapshot(race);
  const holder = command(`begin; select id from public.player_contract_progress where id=${literal(race.progress)} for update; select pg_sleep(35); rollback;`, "ref009-lock-holder").spawn();
  const holderResult = holder.output();
  let pending: Array<Promise<{ status: number; body: any }>> = [];
  try {
    await waitFor(async () => (await sql("select count(*) from pg_stat_activity where application_name='ref009-lock-holder' and wait_event='PgSleep'")) === "1", "Fixture row lock was not acquired");
    pending = [issue(race, "before", "ref009-race", "ref009-race-before"), issue(race, "after", "ref009-race", "ref009-race-after")];
    await waitFor(async () => (await sql("select count(*) from pg_stat_activity where application_name in ('ref009-race-before','ref009-race-after') and wait_event_type='Lock'")) === "2", "Both submissions must be observed concurrently waiting on the row lock");
    checks.concurrentWaitersObserved = 2;
    await sql("select pg_cancel_backend(pid) from pg_stat_activity where application_name='ref009-lock-holder'");
    await holderResult;
    const results = await Promise.all(pending);
    for (const result of results) assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(results.filter(r => r.body.rewardIssued).length, 1);
    assert.equal(results.filter(r => r.body.alreadyIssued).length, 1);
    assert.deepEqual(results[0].body.rewardResult, results[1].body.rewardResult);
    const raceAfter = await snapshot(race);
    assertIssued(race, raceBefore, raceAfter, "ref009-race");
    assert.deepEqual(delta(raceBefore, raceAfter), outcomes.after);
    checks.concurrentDuplicateNoExtraEffects = true;
  } finally {
    await sql("select pg_cancel_backend(pid) from pg_stat_activity where application_name='ref009-lock-holder'");
    await holderResult;
    await Promise.allSettled(pending);
  }
  evidence.status = "pass";
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  evidence.status = "fail";
  evidence.error = String(error);
  throw error;
} finally {
  await sql("drop trigger if exists ref009_injected_failure on public.contract_reward_issuances; drop schema if exists ref009_test cascade;").catch(() => {});
  await Deno.mkdir("/tmp/ref009", { recursive: true });
  await Deno.writeTextFile("/tmp/ref009/database-qualification.json", JSON.stringify(evidence, null, 2) + "\n");
}

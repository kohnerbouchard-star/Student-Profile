import assert from "node:assert/strict";
import { handleStockMarketRunnerRequest } from "../backend/src/domains/stocks/api/stockMarketRunnerHttpHandler.ts";
import { RuntimeCursorStockMarketRunnerRepository } from "../backend/src/domains/stocks/infrastructure/runtimeCursorStockMarketRepositories.ts";

const database = Deno.env.get("DATABASE_URL") || "", url = new URL(database);
assert.equal(Deno.env.get("REF039_DISPOSABLE_DATABASE"), "1");
assert.ok(["postgres:", "postgresql:"].includes(url.protocol));
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname));
assert.equal(url.port, "54322"); assert.equal(url.pathname, "/postgres");
assert.equal(url.username, "postgres"); assert.equal(url.search + url.hash, "");
const sourceSha = Deno.env.get("RELEASE_COMMIT") || "";
assert.match(sourceSha, /^[a-f0-9]{40}$/);
const q = (v: unknown) => `'${String(v).replaceAll("'", "''")}'`;
const ident = (v: string) => { assert.match(v, /^[a-z_][a-z0-9_]*$/); return `"${v}"`; };
const decoder = new TextDecoder(), checks: Record<string, unknown> = {};
const evidence = { task: "REF-039a", sourceSha, status: "running", productionTouched: false, checks };
const open = new Date("2026-10-01T10:00:00Z"), closed = new Date("2026-10-04T10:00:00Z");
function command(s: string, app = "ref039-fixture", role = false) {
  return new Deno.Command("psql", { args: [database, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-c",
    role ? `begin; set local role service_role; ${s}; commit;` : s],
    env: { PGAPPNAME: app, PGOPTIONS: "-c statement_timeout=45000 -c lock_timeout=30000" }, stdout: "piped", stderr: "piped" });
}
async function sql(s: string, app?: string, role = false) {
  const r = await command(s, app, role).output();
  if (r.code) throw new Error(decoder.decode(r.stderr).trim());
  return decoder.decode(r.stdout).trim();
}
const json = async (s: string) => JSON.parse(await sql(s));
type Fixture = { game: string; assets: string[] };
type State = Record<string, Array<Record<string, any>>>;
let tables: Array<{ schema: string; name: string }> = [];
async function snapshot(f: Fixture): Promise<State> {
  const selects = tables.map(t => `select ${q(t.schema + "." + t.name)} name,
    coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]') rows from ${ident(t.schema)}.${ident(t.name)} r
    where game_session_id=${q(f.game)}::uuid`);
  return await json(`select jsonb_object_agg(name,rows)::text from (${selects.join(" union all ")}) s`);
}
async function seed(): Promise<Fixture> {
  const f = { game: crypto.randomUUID(), assets: [crypto.randomUUID(), crypto.randomUUID()] };
  const staff = crypto.randomUUID(), purchase = crypto.randomUUID();
  await sql(`begin; insert into public.staff_users(id,supabase_auth_user_id,email,display_name)
    values(${q(staff)},${q(crypto.randomUUID())},${q(staff + '@example.test')},'REF039 Staff');
    insert into public.game_sessions(id,owner_staff_user_id,name,status,lifecycle_state,provisioning_status)
    values(${q(f.game)},${q(staff)},'REF039 synthetic','active','active','pending');
    insert into public.game_settings(game_session_id,stock_market_window) values(${q(f.game)},'{"timezone":"UTC"}');
    update public.game_sessions set provisioning_status='ready',provisioned_at=clock_timestamp() where id=${q(f.game)};
    insert into public.purchase_codes(id,code_hash) values(${q(purchase)},${q('ref039-' + purchase)});
    insert into public.entitlements(purchase_code_id,staff_user_id,game_session_id,license_expires_at)
    values(${q(purchase)},${q(staff)},${q(f.game)},'2099-01-01');
    insert into private.stock_market_runtime_state(game_session_id,simulation_seed,next_due_at)
    values(${q(f.game)},'ref039-fixed-seed',null);
    ${f.assets.map((asset, i) => `insert into public.game_session_stock_assets(id,game_session_id,ticker,company_name,sector_key,country_code,
      current_price,previous_close,open_price,day_high,day_low,market_cap,shares_outstanding,beta,liquidity,current_volatility,long_run_volatility)
      values(${q(asset)},${q(f.game)},'REF${i}','REF039 Asset','technology','NORTHREACH',100,100,100,100,100,100000,1000,1,1,0.02,0.02);`).join("\n")}
    commit;`);
  return f;
}
function transport(app: string) {
  const errors: string[] = [], calls: string[] = [];
  async function query(s: string) {
    try { return { data: JSON.parse(await sql(s, app, true)), error: null }; }
    catch (error) { errors.push(String(error)); return { data: null, error: { message: String(error), code: String(error).match(/ERROR:\s+(\w{5}):/)?.[1] } }; }
  }
  return { errors, calls, async rpc(name: string, args: Record<string, unknown>) {
    assert.ok(["is_stock_market_open_at", "get_next_stock_market_tick_index", "consume_business_market_events_v1", "apply_stock_market_runner_tick"].includes(name));
    calls.push(name);
    const named = Object.entries(args).map(([k, v]) => `${ident(k)} => ${q(typeof v === "object" ? JSON.stringify(v) : v)}`).join(",");
    const call = `public.${ident(name)}(${named})`;
    return query(["is_stock_market_open_at", "get_next_stock_market_tick_index"].includes(name)
      ? `select to_jsonb(${call})::text` : `select coalesce(jsonb_agg(r),'[]')::text from ${call} r`);
  }, from(table: string) {
    assert.ok(["game_sessions", "game_session_stock_assets", "stock_price_ticks", "stock_market_events", "stock_market_regimes", "country_profiles", "country_economic_snapshots"].includes(table));
    let columns = "*", limit = "", order = ""; const filters: string[] = [];
    const run = () => query(`select coalesce(jsonb_agg(r),'[]')::text from (select ${columns} from public.${ident(table)}
      ${filters.length ? 'where ' + filters.join(' and ') : ''} ${order} ${limit}) r`);
    const builder = {
      select(v: string) { columns = v.split(',').map(ident).join(','); return builder; },
      eq(k: string, v: unknown) { filters.push(`${ident(k)}=${q(v)}`); return builder; },
      in(k: string, v: unknown[]) { filters.push(v.length ? `${ident(k)} in (${v.map(q)})` : 'false'); return builder; },
      order(k: string, o?: { ascending?: boolean }) { order = `order by ${ident(k)} ${o?.ascending === false ? 'desc' : 'asc'}`; return builder; },
      limit(n: number) { assert.ok(Number.isSafeInteger(n) && n > 0); limit = `limit ${n}`; return builder; },
      async maybeSingle() { const r = await run(); assert.ok(!r.data || r.data.length <= 1); return { ...r, data: r.data?.[0] ?? null }; },
      then(resolve: (r: unknown) => unknown, reject: (e: unknown) => unknown) { return run().then(resolve, reject); },
    }; return builder;
  } };
}
async function tick(f: Fixture, tickIndex: number | null = 1, app = "ref039-runner", at = open, failHooks = false, secret = "synthetic") {
  const client = transport(app), stages: string[] = [];
  const response = await handleStockMarketRunnerRequest(new Request("https://ref039.invalid/run", { method: "POST",
    headers: { "content-type": "application/json", "x-stock-market-runner-secret": secret },
    body: JSON.stringify({ gameSessionId: f.game, tickIndex: tickIndex ?? undefined, seed: "ref039-fixed-seed" }) }), {
    createServiceClient: () => client as never, readSupabaseEnv: () => ({ ok: true, value: {} as never }),
    readRunnerSecret: () => "synthetic", now: () => at,
    createRepository: () => new RuntimeCursorStockMarketRunnerRepository(client as never),
    createPublicRealtimePublisher: () => ({ async publish() {
      assert.equal(await sql(`select count(*) from public.stock_price_ticks where game_session_id=${q(f.game)}`), "2");
      stages.push("publish-after-commit"); if (failHooks) throw new Error("synthetic realtime failure");
      return { ok: true } as never;
    } }),
    runStorylineEventsAfterTick: async input => { stages.push("story-after-publish"); assert.equal(input.generatedAt, at.toISOString());
      if (failHooks) throw new Error("synthetic Story failure"); return {} as never; },
    logPublicRealtimePublishFailure: () => stages.push("publish-failure"), logStorylineRunnerFailure: () => stages.push("story-failure"),
  });
  return { status: response.status, body: await response.json(), calls: client.calls, errors: client.errors, stages };
}
function committed(s: State) {
  const assets = s["public.game_session_stock_assets"], ticks = s["public.stock_price_ticks"];
  assert.equal(ticks.length, 2); assert.ok(ticks.every(t => t.tick_index === 1));
  for (const a of assets) {
    const t = ticks.find(t => t.stock_asset_id === a.id)!;
    assert.equal(Number(a.current_price), Number(t.price)); assert.equal(a.recent_returns.length, 1); assert.deepEqual(a.chart_history, []);
  }
  assert.equal(s["private.stock_market_runtime_state"][0].current_tick_index, 1);
  const checkpoints = s["private.stock_market_simulation_checkpoints"];
  assert.equal(checkpoints.length, 1); assert.equal(checkpoints[0].stock_count, 2); assert.equal(checkpoints[0].missing_tick_state_count, 0);
  assert.equal(s["public.ledger_entries"].length, 0); assert.equal(s["public.bank_transactions"].length, 0);
}
async function waitFor(predicate: () => Promise<boolean>) {
  const end = Date.now() + 15000;
  while (Date.now() < end) { if (await predicate()) return; await new Promise(r => setTimeout(r, 100)); }
  throw new Error("REF039 database overlap not observed");
}
async function race(f: Fixture) {
  const holder = "ref039-holder", apps = ["ref039-race-a", "ref039-race-b"];
  // Hold the actual asset rows so both complete the duplicate check before persistence.
  const held = command(`begin; select id from public.game_session_stock_assets where game_session_id=${q(f.game)}
    for update; select pg_sleep(35); rollback;`, holder).spawn().output();
  const pending: Array<ReturnType<typeof tick>> = [];
  try {
    await waitFor(async () => await sql(`select count(*) from pg_stat_activity where application_name=${q(holder)} and wait_event='PgSleep'`) === "1");
    pending.push(...apps.map(app => tick(f, 1, app))); pending.forEach(p => { void p.catch(() => {}); });
    await waitFor(async () => await sql(`select count(*) from pg_stat_activity where application_name in (${apps.map(q)}) and wait_event_type='Lock'`) === "2");
    await sql(`select pg_cancel_backend(pid) from pg_stat_activity where application_name=${q(holder)}`); await held;
    const results = await Promise.all(pending);
    assert.deepEqual(results.map(r => r.status).sort(), [200, 500]);
    const loser = results.find(r => r.status === 500)!;
    assert.equal(loser.body.error.code, "stock_market_tick_apply_failed"); assert.match(loser.errors.join('\n'), /23505/);
    assert.deepEqual(loser.stages, []); committed(await snapshot(f));
    checks.competingRunner = { lockWaiters: 2, committedTicks: 1, losingStatus: 500, losingSqlState: "23505" };
  } finally {
    await sql(`select pg_cancel_backend(pid) from pg_stat_activity where application_name=${q(holder)}`);
    await held; await Promise.allSettled(pending);
  }
}
let injection = false;
async function removeInjection() {
  if (injection) { await sql("drop trigger ref039_failure on public.stock_price_ticks; drop schema ref039_test cascade;"); injection = false; }
}
try {
  tables = await json(`select jsonb_agg(jsonb_build_object('schema',c.table_schema,'name',c.table_name) order by c.table_schema,c.table_name)::text
    from information_schema.columns c join information_schema.tables t using(table_schema,table_name)
    where c.column_name='game_session_id' and c.table_schema in ('public','private','economy_private') and t.table_type='BASE TABLE'`);
  checks.scopedSnapshotTables = tables.length;
  const f = await seed(), other = await seed(), before = await snapshot(f), untouched = await snapshot(other);
  const denied = await tick(f, 1, "ref039-denied", open, false, "wrong");
  assert.equal(denied.status, 401); assert.deepEqual(denied.calls, []); assert.deepEqual(await snapshot(f), before);
  const shut = await tick(f, 1, "ref039-closed", closed);
  assert.equal(shut.status, 409); assert.equal(shut.body.error.code, "stock_market_closed"); assert.equal(shut.body.error.retryable, true);
  assert.deepEqual(shut.calls, ["is_stock_market_open_at"]); assert.deepEqual(await snapshot(f), before);
  const applied = await tick(f, null, "ref039-cursor", open, true);
  assert.equal(applied.status, 200, JSON.stringify(applied)); assert.equal(applied.body.tickIndex, 1); assert.equal(applied.body.ticksInserted, 2);
  assert.deepEqual(applied.calls, ["is_stock_market_open_at", "get_next_stock_market_tick_index", "consume_business_market_events_v1", "apply_stock_market_runner_tick"]);
  assert.deepEqual(applied.stages, ["publish-after-commit", "publish-failure", "story-after-publish", "story-failure"]);
  const after = await snapshot(f); committed(after); assert.deepEqual(await snapshot(other), untouched);
  const duplicate = await tick(f); assert.equal(duplicate.status, 409); assert.equal(duplicate.body.error.code, "stock_tick_already_exists");
  assert.deepEqual(duplicate.stages, []); assert.deepEqual(await snapshot(f), after);
  checks.authCalendarCursorReplayAndPostCommitFailures = true;
  const due = async (limit = 100) => JSON.parse(await sql(`select coalesce(jsonb_agg(r),'[]')::text from public.list_due_stock_market_games_v2(${q(open.toISOString())},${limit}) r`, "ref039-discovery", true));
  assert.ok((await due()).some((r: any) => r.game_session_id === other.game)); assert.equal((await due(101)).length, 0);
  for (const change of ["update public.game_sessions set lifecycle_state='paused'", "update public.game_sessions set provisioning_status='pending'",
    "update private.stock_market_runtime_state set runtime_mode='suspended'", "update private.stock_market_runtime_state set next_due_at='2099-01-01'",
    "update public.entitlements set status='expired'"]) {
    const candidate = await seed();
    await sql(`${change} where ${change.includes('public.game_sessions') ? 'id' : 'game_session_id'}=${q(candidate.game)}`);
    assert.ok(!(await due()).some((r: any) => r.game_session_id === candidate.game));
  }
  await sql(`update public.game_sessions set status='disabled',lifecycle_state='paused' where id=${q(other.game)}`);
  const paused = await snapshot(other); assert.equal((await tick(other)).body.error.code, "stock_market_closed"); assert.deepEqual(await snapshot(other), paused);
  checks.discoveryEligibilityAndPausedGame = true;
  const rollback = await seed(), beforeFailure = await snapshot(rollback);
  // Raise inside the authoritative RPC after asset updates, before tick/cursor/checkpoint writes.
  await sql(`create schema ref039_test; create function ref039_test.fail_tick() returns trigger language plpgsql as $f$ begin
    if new.game_session_id=${q(rollback.game)}::uuid then
      if (select count(*) from public.game_session_stock_assets where game_session_id=new.game_session_id and jsonb_array_length(recent_returns)=1) <> 2
      then raise exception 'REF039_FAILURE_POINT_NOT_REACHED'; end if;
      raise exception 'REF039_INJECTED_AFTER_ASSET_UPDATES'; end if; return new; end $f$;
    create trigger ref039_failure before insert on public.stock_price_ticks for each row execute function ref039_test.fail_tick();`);
  injection = true;
  const failed = await tick(rollback); assert.equal(failed.status, 500); assert.equal(failed.body.error.code, "stock_market_tick_apply_failed");
  assert.match(failed.errors.join('\n'), /REF039_INJECTED_AFTER_ASSET_UPDATES/); assert.deepEqual(failed.stages, []);
  assert.deepEqual(await snapshot(rollback), beforeFailure); await removeInjection();
  assert.equal((await tick(rollback)).status, 200); committed(await snapshot(rollback));
  checks.inRpcRollbackAndRetry = true;
  await race(await seed()); evidence.status = "pass";
} catch (error) { evidence.status = "fail"; throw error; }
finally {
  try { await removeInjection(); } catch (error) { evidence.status = "fail"; throw error; }
  finally { await Deno.mkdir("/tmp/ref018", { recursive: true });
    await Deno.writeTextFile("/tmp/ref018/ref039-database-qualification.json", JSON.stringify(evidence, null, 2) + "\n"); }
}
console.log(JSON.stringify(evidence, null, 2));

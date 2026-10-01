import assert from "node:assert/strict";

// Only a disposable, migration-replayed local database may receive these fixtures.
const database = Deno.env.get("DATABASE_URL") || "";
const url = new URL(database);
assert.equal(Deno.env.get("REF023_DISPOSABLE_DATABASE"), "1");
assert.ok(["postgres:", "postgresql:"].includes(url.protocol));
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname));
assert.equal(url.port, "54322");
assert.equal(url.pathname, "/postgres");
assert.equal(url.username, "postgres");
assert.equal(url.search + url.hash, "");
const sourceSha = Deno.env.get("RELEASE_COMMIT") || "";
assert.match(sourceSha, /^[a-f0-9]{40}$/);
const q = (v: unknown) => `'${String(v).replaceAll("'", "''")}'`;
const ident = (v: string) => `"${v.replaceAll('"', '""')}"`;
const checks: Record<string, unknown> = {};
const evidence = { task: "REF-023", sourceSha, status: "running", productionTouched: false,
  transport: "Unchanged public Crafting and Marketplace atomic RPCs through service_role psql", checks };
const decoder = new TextDecoder();
function command(statement: string, app = "ref023-fixture", role = false) {
  return new Deno.Command("psql", {
    args: [database, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c",
      role ? `begin; set local role service_role; ${statement}; commit;` : statement],
    env: { PGAPPNAME: app, PGOPTIONS: "-c statement_timeout=45000 -c lock_timeout=30000" },
    stdout: "piped", stderr: "piped",
  });
}
async function sql(statement: string, app?: string, role = false) {
  const result = await command(statement, app, role).output();
  if (result.code) throw new Error(decoder.decode(result.stderr).trim());
  return decoder.decode(result.stdout).trim();
}
const json = async (s: string) => JSON.parse(await sql(s));
type Fixture = { game: string; player: string; item: string; store: string; recipe: string };
let tables: Array<{ schema: string; name: string }> = [];
async function snapshot(f: Fixture) {
  const queries = tables.map(t => `select ${q(t.schema + "." + t.name)} name,
    coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]') rows
    from ${ident(t.schema)}.${ident(t.name)} r where game_session_id=${q(f.game)}::uuid`);
  // Job line tables inherit game scope through their owning job rather than a column.
  for (const name of ["crafting_job_inputs", "crafting_job_outputs"]) queries.push(
    `select ${q("public." + name)},coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')
    from public.${name} r join public.crafting_jobs j on j.id=r.job_id where j.game_session_id=${q(f.game)}`);
  return await json(`select jsonb_object_agg(name,rows)::text from (${queries.join(" union all ")}) s`);
}
async function seed(quantity = 2): Promise<Fixture> {
  const f = { game: crypto.randomUUID(), player: crypto.randomUUID(), item: crypto.randomUUID(),
    store: crypto.randomUUID(), recipe: crypto.randomUUID() };
  const staff = crypto.randomUUID(), pack = crypto.randomUUID(), output = crypto.randomUUID();
  // A single fixed input isolates contention from recipe scaling and random quality.
  await sql(`begin;
    insert into public.staff_users(id,supabase_auth_user_id,email,display_name)
      values(${q(staff)},${q(crypto.randomUUID())},${q(staff + "@example.test")},'REF023 Staff');
    insert into public.game_sessions(id,owner_staff_user_id,name,status,lifecycle_state)
      values(${q(f.game)},${q(staff)},'REF023 synthetic','active','active');
    insert into public.players(id,game_session_id,display_name,status)
      values(${q(f.player)},${q(f.game)},'REF023 Player','active');
    insert into public.game_settings(game_session_id,stock_market_window)
      values(${q(f.game)},'{"timezone":"Asia/Seoul"}') on conflict do nothing;
    insert into public.player_country_assignments(game_session_id,player_id,country_profile_id)
      select ${q(f.game)},${q(f.player)},id from public.country_profiles where status='active' order by country_code limit 1;
    select public.record_player_ledger_entry(${q(f.game)},${q(f.player)},'cash',1,
      (select currency_code from public.marketplace_player_country_v1(${q(f.game)},${q(f.player)})),
      'credit','setup','initial_balance_seed',${q(f.player)},'system',null,
      '{"bankTransactionIdempotencyKey":"ref023-funding"}'::jsonb);
    insert into public.physical_economy_content_packs(id,pack_key,schema_version,content_version,content_digest,source_commit,status)
      values(${q(pack)},${q('ref023.' + pack)},'1.0','1',repeat('a',64),${q(sourceSha)},'active');
    insert into public.physical_economy_recipe_definitions(id,pack_id,recipe_key,name,category,tier,workshop_tier,base_duration_seconds,difficulty_profile,status)
      values(${q(f.recipe)},${q(pack)},'recipe.ref023','REF023','general',1,1,3600,'moderate','active');
    insert into public.physical_economy_recipe_inputs(recipe_id,line_key,item_key,base_quantity,scaling_class)
      values(${q(f.recipe)},'input','ref023_input',2,'fixed');
    insert into public.physical_economy_recipe_outputs(recipe_id,line_key,item_key,quantity,output_kind)
      values(${q(f.recipe)},'output','ref023_output',1,'stackable');
    insert into public.game_session_physical_economy_packs(game_session_id,pack_id,status) values(${q(f.game)},${q(pack)},'active');
    insert into public.game_session_recipe_availability(game_session_id,recipe_id,enabled,unlocked_by_default)
      values(${q(f.game)},${q(f.recipe)},true,true);
    insert into public.game_items(id,game_session_id,canonical_key,source_kind,name,item_class)
      values(${q(f.item)},${q(f.game)},'ref023_input','admin_created','REF023 input','material'),
      (${q(output)},${q(f.game)},'ref023_output','admin_created','REF023 output','component');
    insert into public.store_items(id,game_session_id,item_key,name,category,price,currency_code,stock_quantity,game_item_id)
      select ${q(f.store)},${q(f.game)},'ref023_input','REF023 input','goods',1,currency_code,0,${q(f.item)}
      from public.marketplace_player_country_v1(${q(f.game)},${q(f.player)});
    select economy_private.post_inventory_transaction_v2(${q(f.game)},'grant','validation','ref023_seed',null,'ref023-seed','{}',
      jsonb_build_array(jsonb_build_object('inventoryAccountId',economy_private.ensure_player_inventory_account_v2(${q(f.game)},${q(f.player)}),
      'gameItemId',${q(f.item)},'playerId',${q(f.player)},'storeItemId',${q(f.store)},'quantityDelta',${quantity},
      'reservationDelta',0,'unitCost',1,'currencyCode',(select currency_code from public.store_items where id=${q(f.store)}),
      'eventType','ADJUSTED','legacyEventQuantityDelta',${quantity})));
    commit;`);
  return f;
}
async function rpc(name: string, args: string, app = "ref023-command") {
  assert.ok(["start_player_crafting_job_v1", "cancel_player_crafting_job_v1", "claim_player_crafting_job_v1", "create_marketplace_listing_public_v2"].includes(name));
  return JSON.parse(await sql(`select to_jsonb(r)::text from public.${name}(${args}) r`, app, true));
}
const start = (f: Fixture, key: string, app?: string, quantity = 1) => rpc("start_player_crafting_job_v1",
  `${q(f.game)},${q(f.player)},'recipe.ref023',${quantity},'{}',${q(key)}`, app);
const market = (f: Fixture, key: string, app?: string) => rpc("create_marketplace_listing_public_v2",
  `${q(f.game)},${q(f.player)},'ref023_input',2,1,(select currency_code from public.store_items where id=${q(f.store)}),'Used',24,${q(key)}`, app);
const finish = (f: Fixture, job: string, cancel = false) => rpc(cancel ? "cancel_player_crafting_job_v1" : "claim_player_crafting_job_v1",
  `${q(f.game)},${q(f.player)},${q(job)},'ref023-finish'`);
async function holding(f: Fixture, owned: number, reserved: number, active: number) {
  const state = await snapshot(f);
  const rows = state["public.inventory_holdings"].filter((r: any) => r.player_id === f.player && r.game_item_id === f.item);
  assert.equal(rows.length, 1);
  assert.equal(Number(rows[0].quantity_owned), owned);
  assert.equal(Number(rows[0].quantity_reserved), reserved);
  const reservations = state["public.inventory_reservations"].filter((r: any) => r.status === "active");
  assert.equal(reservations.length, active);
  assert.equal(reservations.reduce((n: number, r: any) => n + Number(r.quantity), 0), reserved);
  assert.ok(reservations.every((r: any) => r.player_id === f.player && r.game_item_id === f.item));
  return state;
}
async function rejectedUnchanged(f: Fixture, action: () => Promise<unknown>, error: RegExp) {
  const before = await snapshot(f);
  await assert.rejects(action(), error);
  assert.deepEqual(await snapshot(f), before);
}
async function waitFor(predicate: () => Promise<boolean>) {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("REF023 overlap not observed");
}
async function race() {
  const f = await seed(), name = "ref023-holder";
  // Both public commands must reach the same held inventory row before release.
  const holder = command(`begin; select id from public.inventory_holdings where game_session_id=${q(f.game)} and player_id=${q(f.player)} for update; select pg_sleep(35); rollback;`, name).spawn();
  const held = holder.output(), pending: Promise<any>[] = [];
  try {
    await waitFor(async () => await sql(`select count(*) from pg_stat_activity where application_name=${q(name)} and wait_event='PgSleep'`) === "1");
    pending.push(start(f, "ref023-race-craft", "ref023-race-craft"), market(f, "ref023-race-market", "ref023-race-market"));
    pending.forEach(p => { void p.catch(() => {}); });
    await waitFor(async () => await sql("select count(*) from pg_stat_activity where application_name in ('ref023-race-craft','ref023-race-market') and wait_event_type='Lock'") === "2");
    await sql(`select pg_cancel_backend(pid) from pg_stat_activity where application_name=${q(name)}`);
    await held;
    const results = await Promise.allSettled(pending);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    const loser = results.find(r => r.status === "rejected") as PromiseRejectedResult;
    assert.match(String(loser.reason), /CRAFTING_INPUT_QUANTITY_UNAVAILABLE|MARKETPLACE_QUANTITY_UNAVAILABLE/);
    const state = await holding(f, 2, 2, 1);
    assert.equal(state["public.crafting_jobs"].length + state["public.marketplace_listings"].length, 1);
    checks.competingCommands = { pass: true, observedLockWaiters: 2, winners: 1 };
  } finally {
    await sql(`select pg_cancel_backend(pid) from pg_stat_activity where application_name=${q(name)}`);
    await held;
    await Promise.allSettled(pending);
  }
}
let injection = false;
async function removeInjection() {
  if (!injection) return;
  await sql("drop trigger ref023_failure on public.crafting_jobs; drop schema ref023_test cascade;");
  injection = false;
}
try {
  tables = await json(`select jsonb_agg(jsonb_build_object('schema',c.table_schema,'name',c.table_name))::text
    from information_schema.columns c join information_schema.tables t using(table_catalog,table_schema,table_name)
    where c.column_name='game_session_id' and c.table_schema in ('public','private','economy_private') and t.table_type='BASE TABLE'`);
  assert.ok(tables.length > 10);
  checks.snapshotTableCount = tables.length;
  const f = await seed(), first = await start(f, "ref023-start");
  assert.equal(first.outcome, "created");
  const after = await holding(f, 2, 2, 1), replay = await start(f, "ref023-start");
  assert.equal(replay.outcome, "replayed");
  assert.equal(replay.jobKey, first.jobKey);
  assert.deepEqual(await snapshot(f), after);
  await rejectedUnchanged(f, () => start(f, "ref023-start", undefined, 2), /CRAFTING_IDEMPOTENCY_CONFLICT/);
  await rejectedUnchanged(f, () => start(f, "ref023-insufficient"), /CRAFTING_INPUT_QUANTITY_UNAVAILABLE/);
  await rejectedUnchanged(f, () => market(f, "ref023-market-denied"), /MARKETPLACE_QUANTITY_UNAVAILABLE/);
  assert.equal((await finish(f, first.jobKey, true)).status, "cancelled");
  const cancelled = await holding(f, 2, 0, 0);
  assert.equal((await finish(f, first.jobKey, true)).outcome, "replayed");
  assert.deepEqual(await snapshot(f), cancelled);
  const listing = await market(f, "ref023-market");
  assert.equal(listing.outcome, "applied");
  const listed = await holding(f, 2, 2, 1);
  assert.equal((await market(f, "ref023-market")).outcome, "replayed");
  assert.deepEqual(await snapshot(f), listed);
  await rejectedUnchanged(f, () => start(f, "ref023-market-first"), /CRAFTING_INPUT_QUANTITY_UNAVAILABLE/);
  checks.replayConflictInsufficientCancellationAndBothOrders = true;
  const other = await seed(), untouched = await snapshot(f);
  await rejectedUnchanged(other, () => start({ ...other, player: f.player }, "ref023-scope"), /CRAFTING_PLAYER_SCOPE_INACTIVE/);
  await rejectedUnchanged(other, () => market({ ...other, player: f.player }, "ref023-scope-market"), /MARKETPLACE_QUANTITY_UNAVAILABLE/);
  assert.deepEqual(await snapshot(f), untouched);
  checks.crossGameNoEffects = true;
  await sql(`update public.game_sessions set lifecycle_state='paused' where id=${q(other.game)}`);
  await rejectedUnchanged(other, () => start(other, "ref023-paused"), /CRAFTING_PLAYER_SCOPE_INACTIVE/);
  checks.pausedGameNoEffects = true;
  // Force both existing deterministic failure policies on synthetic job snapshots.
  for (const consume of [false, true]) {
    const failed = await seed(), job = await start(failed, "ref023-failure");
    await sql(`update public.crafting_jobs set completes_at=now()-interval '1 second',failure_rule=${q(consume ? 'consume_approved' : 'release_all')},
      recipe_snapshot=recipe_snapshot || '{"failureRoll":0,"failureBasisPoints":10000}'::jsonb where game_session_id=${q(failed.game)}`);
    assert.equal((await finish(failed, job.jobKey)).status, "failed");
    const state = await holding(failed, consume ? 0 : 2, 0, 0);
    assert.ok(state["public.crafting_job_outputs"].every((r: any) => !r.granted_at));
    assert.equal((await finish(failed, job.jobKey)).outcome, "replayed");
    assert.deepEqual(await snapshot(failed), state);
  }
  checks.failedCompletionBothPoliciesAndReplay = true;
  const rollback = await seed(), job = await start(rollback, "ref023-rollback");
  await sql(`update public.crafting_jobs set completes_at=now()-interval '1 second',recipe_snapshot=recipe_snapshot || '{"failureBasisPoints":0}'::jsonb where game_session_id=${q(rollback.game)}`);
  // Fail inside the actual claim after output posting; an outer rollback would not prove this.
  await sql(`create schema ref023_test; create function ref023_test.fail_claim() returns trigger language plpgsql as $f$ begin
    if new.game_session_id=${q(rollback.game)}::uuid and new.status='claimed' then
      if not exists(select 1 from public.inventory_transactions where game_session_id=new.game_session_id and source_action='output_granted') then raise exception 'REF023_FAILURE_POINT_NOT_REACHED'; end if;
      raise exception 'REF023_INJECTED_AFTER_OUTPUT'; end if; return new; end $f$;
    create trigger ref023_failure before update on public.crafting_jobs for each row execute function ref023_test.fail_claim();`);
  injection = true;
  await rejectedUnchanged(rollback, () => finish(rollback, job.jobKey), /REF023_INJECTED_AFTER_OUTPUT/);
  await removeInjection();
  assert.equal((await finish(rollback, job.jobKey)).status, "claimed");
  const claimed = await holding(rollback, 0, 0, 0);
  assert.equal(claimed["public.inventory_holdings"].filter((r: any) => r.player_id === rollback.player && r.game_item_id !== rollback.item).reduce((n: number, r: any) => n + Number(r.quantity_owned), 0), 1);
  assert.equal((await finish(rollback, job.jobKey)).outcome, "replayed");
  assert.deepEqual(await snapshot(rollback), claimed);
  checks.inRpcRollbackRetryAndSingleOutput = true;
  await race();
  evidence.status = "pass";
} catch (error) {
  evidence.status = "fail";
  throw error;
} finally {
  try { await removeInjection(); }
  catch (error) { evidence.status = "fail"; throw error; }
  finally {
    await Deno.mkdir("/tmp/ref018", { recursive: true });
    await Deno.writeTextFile("/tmp/ref018/ref023-database-qualification.json", JSON.stringify(evidence, null, 2) + "\n");
  }
}
console.log(JSON.stringify(evidence, null, 2));

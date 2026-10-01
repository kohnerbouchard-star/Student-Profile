import assert from "node:assert/strict";

// Only a disposable, migration-replayed local database may receive these fixtures.
const database = Deno.env.get("DATABASE_URL") || "";
const url = new URL(database);
assert.equal(Deno.env.get("REF024_DISPOSABLE_DATABASE"), "1");
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
const evidence = { task: "REF-024", sourceSha, status: "running", productionTouched: false,
  transport: "Unchanged public funded Marketplace atomic RPCs through service_role psql", checks };
const decoder = new TextDecoder();
function command(statement: string, app = "ref024-fixture", role = false) {
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
type Fixture = { game: string; seller: string; buyer: string; rival: string; item: string; store: string; currency: string; listing: string; version: number };
let tables: Array<{ schema: string; name: string }> = [];
async function snapshot(f: Fixture) {
  const queries = tables.map(t => `select ${q(t.schema + "." + t.name)} name,
    coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]') rows
    from ${ident(t.schema)}.${ident(t.name)} r where game_session_id=${q(f.game)}::uuid`);
  return await json(`select jsonb_object_agg(name,rows)::text from (${queries.join(" union all ")}) s`);
}
async function seed(): Promise<Fixture> {
  const f: Fixture = { game: crypto.randomUUID(), seller: crypto.randomUUID(), buyer: crypto.randomUUID(),
    rival: crypto.randomUUID(), item: crypto.randomUUID(), store: crypto.randomUUID(), currency: "", listing: "", version: 0 };
  const staff = crypto.randomUUID();
  const country = await json("select to_jsonb(c)::text from public.country_profiles c where status='active' order by country_code limit 1");
  f.currency = country.currency_code;
  await sql(`begin;
    insert into public.staff_users(id,supabase_auth_user_id,email,display_name)
      values(${q(staff)},${q(crypto.randomUUID())},${q(staff + '@example.test')},'REF024 Staff');
    insert into public.game_sessions(id,owner_staff_user_id,name,status,lifecycle_state)
      values(${q(f.game)},${q(staff)},'REF024 synthetic','active','active');
    insert into public.game_settings(game_session_id,stock_market_window)
      values(${q(f.game)},'{"timezone":"UTC"}') on conflict do nothing;
    insert into public.players(id,game_session_id,display_name,status)
      select p,${q(f.game)},'REF024 Player','active' from unnest(array[${q(f.seller)},${q(f.buyer)},${q(f.rival)}]::uuid[]) p;
    insert into public.player_country_assignments(game_session_id,player_id,country_profile_id)
      select ${q(f.game)},p,${q(country.id)} from unnest(array[${q(f.seller)},${q(f.buyer)},${q(f.rival)}]::uuid[]) p;
    insert into public.marketplace_policies(game_session_id,moderation_required,fee_rate,tax_rate)
      values(${q(f.game)},false,0,0);
    insert into public.game_items(id,game_session_id,canonical_key,source_kind,name,item_class)
      values(${q(f.item)},${q(f.game)},'ref024_input','admin_created','REF024 input','material');
    insert into public.store_items(id,game_session_id,item_key,name,category,price,currency_code,stock_quantity,game_item_id)
      values(${q(f.store)},${q(f.game)},'ref024_input','REF024 input','goods',10,${q(f.currency)},0,${q(f.item)});
    select economy_private.post_inventory_transaction_v2(${q(f.game)},'grant','validation','ref024_seed',null,'ref024-seed','{}',
      jsonb_build_array(jsonb_build_object('inventoryAccountId',economy_private.ensure_player_inventory_account_v2(${q(f.game)},${q(f.seller)}),
      'gameItemId',${q(f.item)},'playerId',${q(f.seller)},'storeItemId',${q(f.store)},'quantityDelta',1,
      'reservationDelta',0,'unitCost',10,'currencyCode',${q(f.currency)},'eventType','ADJUSTED','legacyEventQuantityDelta',1)));
    commit;`);
  for (const player of [f.seller, f.buyer, f.rival]) await fund(f, player, 100);
  await fund(f, f.seller, 1, "cash");
  // Reuse the accepted C1 initialization: authoritative snapshots precede immutable FX fixing.
  await sql(`insert into public.country_economic_snapshots(game_session_id,country_profile_id,snapshot_sequence,effective_at,
      snapshot_label,difficulty_policy_profile_id,difficulty_preset,metadata,created_at)
    select ${q(f.game)},c.id,0,statement_timestamp()-interval '2 minutes','REF024 qualification',d.id,d.preset_key,
      '{"source":"ref024"}',statement_timestamp()-interval '3 minutes'
    from public.country_profiles c join public.difficulty_policy_profiles d on d.preset_key='standard' where c.status='active';
    select public.initialize_fx_authority_for_game_v1(${q(f.game)},clock_timestamp()-interval '1 minute',true);`);
  const listing = await rpc("create_marketplace_listing_public_v2",
    `${q(f.game)},${q(f.seller)},'ref024_input',1,10,${q(f.currency)},'Used',24,'ref024-listing'`);
  f.listing = listing.listing_key;
  const active = await rpc("activate_marketplace_listing_public_v1",
    `${q(f.game)},${q(f.seller)},${q(f.listing)},${listing.version},'ref024-activate'`);
  assert.equal(active.status, "active");
  f.version = Number(active.version);
  return f;
}
async function fund(f: Fixture, player: string, amount: number, account = "checking") {
  await sql(`select public.record_player_ledger_entry(${q(f.game)},${q(player)},${q(account)},${amount},${q(f.currency)},
    ${q(amount > 0 ? 'credit' : 'debit')},'setup','initial_balance_seed',${q(player)},'system',null,
    ${q(JSON.stringify({ bankTransactionIdempotencyKey: crypto.randomUUID() }))}::jsonb)`);
}
const functions = ["create_marketplace_listing_public_v2", "activate_marketplace_listing_public_v1",
  "cancel_marketplace_listing_public_v2", "create_marketplace_funding_quote_v1", "settle_marketplace_funding_v1"];
async function rpc(name: string, args: string, app = "ref024-command") {
  assert.ok(functions.includes(name));
  return JSON.parse(await sql(`select to_jsonb(r)::text from public.${name}(${args}) r`, app, true));
}
async function quote(f: Fixture, player = f.buyer, key = "ref024-quote", app?: string, version = f.version, quantity = 1) {
  const account = await sql(`select a.public_key from public.bank_accounts a join public.economic_parties p
    on p.id=a.party_id and p.game_session_id=a.game_session_id where a.game_session_id=${q(f.game)}
    and p.player_id=${q(player)} and a.account_kind='checking' and a.currency_code=${q(f.currency)}`);
  return await rpc("create_marketplace_funding_quote_v1", `${q(f.game)},${q(player)},${q(f.listing)},${quantity},${version},
    ${q(JSON.stringify([{ sourceAccountKey: account, targetAmount: String(10 * quantity) }]))}::jsonb,${q(key)},statement_timestamp()`, app);
}
const settle = (f: Fixture, reservation: string, player = f.buyer, key = "ref024-settle", app?: string) =>
  rpc("settle_marketplace_funding_v1", `${q(f.game)},${q(player)},${q(reservation)},${q(key)},null`, app);
const cancel = (f: Fixture) => rpc("cancel_marketplace_listing_public_v2",
  `${q(f.game)},${q(f.seller)},${q(f.listing)},${f.version},'ref024-cancel'`);
async function rejectedUnchanged(f: Fixture, action: () => Promise<unknown>, error: RegExp) {
  const before = await snapshot(f);
  await assert.rejects(action(), error);
  assert.deepEqual(await snapshot(f), before);
}
function assertSettlement(f: Fixture, before: any, after: any, buyer = f.buyer) {
  for (const [table, count] of [["marketplace_orders", 1], ["purchase_funding_receipts", 1], ["bank_transactions", 2],
    ["ledger_entries", 4], ["inventory_events", 2], ["marketplace_financial_postings", 2], ["marketplace_audit_events", 1]] as const) {
    assert.equal(after[`public.${table}`].length - before[`public.${table}`].length, count, table);
  }
  // The accepted compatibility patch omits zero fee/tax rows; retain exact nonzero evidence.
  assert.deepEqual(after["public.marketplace_financial_postings"].map((r: any) => [r.posting_type, Number(r.amount), r.currency_code]).sort(),
    [["buyer_commercial_debit", -10, f.currency], ["seller_credit", 10, f.currency]]);
  const holdings = after["public.inventory_holdings"].filter((r: any) => r.game_item_id === f.item && r.player_id);
  assert.equal(holdings.find((r: any) => r.player_id === f.seller).quantity_owned, 0);
  assert.equal(holdings.find((r: any) => r.player_id === buyer).quantity_owned, 1);
  assert.equal(holdings.reduce((n: number, r: any) => n + r.quantity_owned, 0), 1);
  assert.ok(holdings.every((r: any) => r.quantity_reserved === 0));
  for (const [player, delta] of [[buyer, -10], [f.seller, 10]] as const) {
    const balance = (s: any) => Number(s["public.account_balances"].find((r: any) =>
      r.player_id === player && r.account_type === "checking" && r.currency_code === f.currency).balance);
    assert.equal(balance(after) - balance(before), delta);
  }
  assert.equal(after["public.marketplace_orders"][0].status, "completed");
  assert.equal(after["public.marketplace_purchase_reservations"][0].status, "settled");
  assert.equal(after["public.inventory_reservations"][0].status, "consumed");
}
async function waitFor(predicate: () => Promise<boolean>) {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("REF024 overlap not observed");
}
async function race(replay: boolean) {
  const f = await seed(), reservation = replay ? await quote(f) : null, before = await snapshot(f);
  const name = "ref024-holder", apps = ["ref024-race-a", "ref024-race-b"];
  const held = command(`begin; select id from public.marketplace_listings where game_session_id=${q(f.game)} for update;
    select pg_sleep(35); rollback;`, name).spawn().output();
  const pending: Promise<any>[] = [];
  try {
    await waitFor(async () => await sql(`select count(*) from pg_stat_activity where application_name=${q(name)} and wait_event='PgSleep'`) === "1");
    for (let i = 0; i < 2; i++) pending.push(replay
      ? settle(f, reservation.reservationKey, f.buyer, "ref024-settle", apps[i])
      : quote(f, i ? f.rival : f.buyer, apps[i], apps[i]));
    pending.forEach(p => { void p.catch(() => {}); });
    await waitFor(async () => await sql(`select count(*) from pg_stat_activity where application_name in (${apps.map(q).join(',')}) and wait_event_type='Lock'`) === "2");
    await sql(`select pg_cancel_backend(pid) from pg_stat_activity where application_name=${q(name)}`);
    await held;
    const results = await Promise.allSettled(pending);
    if (replay) {
      const values = results.map(r => { assert.equal(r.status, "fulfilled"); return (r as PromiseFulfilledResult<any>).value; });
      assert.equal(values.filter(v => v.replayed).length, 1);
      assert.equal(values[0].orderKey, values[1].orderKey);
      assertSettlement(f, before, await snapshot(f));
    } else {
      assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
      const loser = results.find(r => r.status === "rejected") as PromiseRejectedResult;
      assert.match(String(loser.reason), /MARKETPLACE_STALE_VERSION/);
      const winner = results.findIndex(r => r.status === "fulfilled");
      const result = (results[winner] as PromiseFulfilledResult<any>).value;
      const quoted = await snapshot(f);
      assert.equal(quoted["public.marketplace_purchase_reservations"].length, 1);
      await settle(f, result.reservationKey, winner ? f.rival : f.buyer);
      assertSettlement(f, quoted, await snapshot(f), winner ? f.rival : f.buyer);
    }
    checks[replay ? "sameReservationSingleSettlement" : "competingPurchaseSingleWinner"] = { pass: true, observedLockWaiters: 2 };
  } finally {
    await sql(`select pg_cancel_backend(pid) from pg_stat_activity where application_name=${q(name)}`);
    await held;
    await Promise.allSettled(pending);
  }
}
let injection = false;
async function removeInjection() {
  if (!injection) return;
  await sql("drop trigger ref024_failure on public.marketplace_orders; drop schema ref024_test cascade;");
  injection = false;
}
try {
  tables = await json(`select jsonb_agg(jsonb_build_object('schema',c.table_schema,'name',c.table_name))::text
    from information_schema.columns c join information_schema.tables t using(table_catalog,table_schema,table_name)
    where c.column_name='game_session_id' and c.table_schema in ('public','private','economy_private') and t.table_type='BASE TABLE'`);
  assert.ok(tables.length > 10);
  checks.snapshotTableCount = tables.length;
  const f = await seed();
  await rejectedUnchanged(f, () => quote(f, f.seller), /MARKETPLACE_SELF_PURCHASE/);
  await rejectedUnchanged(f, () => quote(f, f.buyer, "ref024-stale", undefined, f.version + 1), /MARKETPLACE_STALE_VERSION/);
  await rejectedUnchanged(f, () => quote(f, f.buyer, "ref024-stock", undefined, f.version, 2), /MARKETPLACE_QUANTITY_UNAVAILABLE/);
  const reservation = await quote(f), quoted = await snapshot(f);
  assert.equal((await quote(f)).replayed, true);
  assert.deepEqual(await snapshot(f), quoted);
  await rejectedUnchanged(f, () => quote(f, f.buyer, "ref024-quote", undefined, f.version, 2), /MARKETPLACE_FUNDED_QUOTE_IDEMPOTENCY_CONFLICT/);
  await rejectedUnchanged(f, () => settle(f, reservation.reservationKey, f.rival), /MARKETPLACE_RESERVATION_NOT_FOUND/);
  const other = await seed(), otherBefore = await snapshot(other);
  await rejectedUnchanged(f, () => settle({ ...other, game: f.game }, reservation.reservationKey, other.buyer), /MARKETPLACE_RESERVATION_NOT_FOUND/);
  assert.deepEqual(await snapshot(other), otherBefore);
  const order = await settle(f, reservation.reservationKey), settled = await snapshot(f);
  assert.equal(order.replayed, false);
  assertSettlement(f, quoted, settled);
  assert.deepEqual(await settle(f, reservation.reservationKey), { ...order, replayed: true });
  assert.deepEqual(await snapshot(f), settled);
  await rejectedUnchanged(f, () => settle(f, reservation.reservationKey, f.buyer, "ref024-conflict"), /MARKETPLACE_FUNDED_SETTLEMENT_CONFLICT/);
  checks.commitReplayConflictStockScopeAndStaleVersion = true;
  const cancelled = await seed();
  assert.equal((await cancel(cancelled)).outcome, "applied");
  const afterCancel = await snapshot(cancelled);
  assert.equal(afterCancel["public.inventory_reservations"][0].status, "released");
  assert.equal((await cancel(cancelled)).outcome, "replayed");
  assert.deepEqual(await snapshot(cancelled), afterCancel);
  checks.duplicateCancellation = true;
  const poor = await seed();
  await fund(poor, poor.buyer, -100);
  await rejectedUnchanged(poor, () => quote(poor), /FUNDING_INSUFFICIENT/);
  const expired = await seed(), stale = await quote(expired);
  await sql(`update public.marketplace_purchase_reservations set reserved_at=now()-interval '2 seconds',expires_at=now()-interval '1 second' where game_session_id=${q(expired.game)}`);
  await rejectedUnchanged(expired, () => settle(expired, stale.reservationKey), /MARKETPLACE_FUNDED_QUOTE_EXPIRED/);
  checks.insufficientFundsAndExpiredReservationNoEffects = true;
  const rollback = await seed(), pending = await quote(rollback), before = await snapshot(rollback);
  // Raise inside the real completion update, after money and Inventory have moved.
  await sql(`create schema ref024_test; create function ref024_test.fail_completion() returns trigger language plpgsql as $f$ begin
    if new.game_session_id=${q(rollback.game)}::uuid and new.status='completed' then
      if not exists(select 1 from public.inventory_holdings where game_session_id=new.game_session_id and player_id=new.buyer_player_id and quantity_owned=1)
        or not exists(select 1 from public.bank_transactions where game_session_id=new.game_session_id and source_action='marketplace_purchase_distribution')
      then raise exception 'REF024_FAILURE_POINT_NOT_REACHED'; end if;
      raise exception 'REF024_INJECTED_AFTER_MONEY_INVENTORY'; end if; return new; end $f$;
    create trigger ref024_failure before update on public.marketplace_orders for each row execute function ref024_test.fail_completion();`);
  injection = true;
  await rejectedUnchanged(rollback, () => settle(rollback, pending.reservationKey), /REF024_INJECTED_AFTER_MONEY_INVENTORY/);
  await removeInjection();
  await settle(rollback, pending.reservationKey);
  assertSettlement(rollback, before, await snapshot(rollback));
  checks.inRpcRollbackAndSameKeyRetry = true;
  await race(false);
  await race(true);
  evidence.status = "pass";
} catch (error) {
  evidence.status = "fail";
  throw error;
} finally {
  try { await removeInjection(); }
  catch (error) { evidence.status = "fail"; throw error; }
  finally {
    await Deno.mkdir("/tmp/ref018", { recursive: true });
    await Deno.writeTextFile("/tmp/ref018/ref024-database-qualification.json", JSON.stringify(evidence, null, 2) + "\n");
  }
}
console.log(JSON.stringify(evidence, null, 2));

import assert from "node:assert/strict";
import { recordTrustedProgressionEventV1 } from "../backend/src/domains/progression/services/progressionIntegrationEventService.ts";
import { handlePlayerProgressionRequest } from "../backend/src/domains/progression/api/playerProgressionHttpHandler.ts";

const database = Deno.env.get("DATABASE_URL") || "";
const url = new URL(database);
assert.equal(Deno.env.get("REF036_DISPOSABLE_DATABASE"), "1");
assert.ok(["postgres:", "postgresql:"].includes(url.protocol));
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname));
assert.equal(url.port, "54322");
assert.equal(url.pathname, "/postgres");
assert.equal(url.username, "postgres");
assert.equal(url.search + url.hash, "");
const sourceSha = Deno.env.get("RELEASE_COMMIT") || "";
assert.match(sourceSha, /^[a-f0-9]{40}$/);
const q = (v: unknown) => `'${String(v).replaceAll("'", "''")}'`;
const ident = (v: string) => { assert.match(v, /^[a-z_][a-z0-9_]*$/); return `"${v}"`; };
const decoder = new TextDecoder(), checks: Record<string, unknown> = {};
const evidence = { task: "REF-036", sourceSha, status: "running", productionTouched: false, checks };
function command(s: string, app = "ref036-fixture", role = false) {
  return new Deno.Command("psql", {
    args: [database, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", role ? `begin; set local role service_role; ${s}; commit;` : s],
    env: { PGAPPNAME: app, PGOPTIONS: "-c statement_timeout=45000 -c lock_timeout=30000" }, stdout: "piped", stderr: "piped",
  });
}
async function sql(s: string, app?: string, role = false) {
  const r = await command(s, app, role).output();
  if (r.code) throw new Error(decoder.decode(r.stderr).trim());
  return decoder.decode(r.stdout).trim();
}
const json = async (s: string) => JSON.parse(await sql(s));
type Fixture = { game: string; player: string };
type State = Record<string, Array<Record<string, any>>>;
let tables: Array<{ schema: string; name: string }> = [];
async function snapshot(f: Fixture): Promise<State> {
  const selects = tables.map(t => `select ${q(t.schema + "." + t.name)} name,
    coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]') rows from ${ident(t.schema)}.${ident(t.name)} r
    where game_session_id=${q(f.game)}::uuid`);
  return await json(`select jsonb_object_agg(name,rows)::text from (${selects.join(" union all ")}) s`);
}
async function seed(): Promise<Fixture> {
  const f = { game: crypto.randomUUID(), player: crypto.randomUUID() }, staff = crypto.randomUUID();
  await sql(`begin; insert into public.staff_users(id,supabase_auth_user_id,email,display_name)
    values(${q(staff)},${q(crypto.randomUUID())},${q(staff + '@example.test')},'REF036 Staff');
    insert into public.game_sessions(id,owner_staff_user_id,name,status,lifecycle_state)
    values(${q(f.game)},${q(staff)},'REF036 synthetic','active','active');
    insert into public.players(id,game_session_id,display_name,status) values(${q(f.player)},${q(f.game)},'REF036 Player','active');
    select public.ensure_player_progression_profile_v1(${q(f.game)},${q(f.player)}); commit;`);
  return f;
}
function transport(app: string) {
  let calls = 0;
  const errors: string[] = [];
  return { errors, get calls() { return calls; }, async rpc(name: string, args: Record<string, unknown>) {
    assert.ok(["record_progression_integration_event_v1", "claim_player_progression_reward_atomic_v1"].includes(name));
    calls++;
    try {
      const named = Object.entries(args).map(([k, v]) => `${ident(k)} => ${q(v)}`).join(",");
      const data = JSON.parse(await sql(`select coalesce(jsonb_agg(r),'[]')::text from public.${ident(name)}(${named}) r`, app, true));
      return { data, error: null };
    } catch (error) { errors.push(String(error)); return { data: null, error: { message: String(error) } }; }
  } };
}
const now = new Date(), occurredAt = new Date(now.getTime() - 60000).toISOString();
async function event(f: Fixture, key: string, source = key, at = occurredAt) {
  const client = transport("ref036-event");
  return await recordTrustedProgressionEventV1(client as never, { gameId: f.game, playerUuid: f.player,
    sourceDomain: "contracts", eventType: "contract.completed", sourcePublicId: source, idempotencyKey: key, occurredAt: at }, { now });
}
async function claim(f: Fixture, reward: string, key: string, app = "ref036-claim") {
  const client = transport(app);
  const response = await handlePlayerProgressionRequest(new Request(`https://ref036.invalid/players/me/progression/rewards/${reward}/claim`, {
    method: "POST", headers: { "x-player-session-token": "synthetic-token" }, body: JSON.stringify({ idempotencyKey: key }),
  }), { kind: "claim", rewardId: reward }, {
    createServiceClient: () => client as never, readEnvironment: () => ({ ok: true, value: {} as never }),
    hashSessionToken: async () => "synthetic-hash", now: () => now,
    resolvePlayerSession: async () => ({ ok: true, session: { id: crypto.randomUUID(), game_session_id: f.game, player_id: f.player,
      status: "active", expires_at: "2099-01-01T00:00:00Z", revoked_at: null },
      gameSession: { id: f.game, name: "REF036", status: "active" },
      player: { id: f.player, display_name: "REF036", roster_label: null, status: "active" } }) as never,
  });
  const body = await response.json();
  assert.equal(client.calls, 1);
  for (const id of [f.game, f.player]) assert.ok(!JSON.stringify(body).includes(id));
  if (response.status === 200) assert.equal(response.headers.get("cache-control"), "private, no-store");
  return { status: response.status, body, errors: client.errors };
}
const profile = (s: State) => s["public.player_progression_profiles"][0];
const rewards = (s: State) => s["public.player_progression_reward_grants"];
function noMoney(before: State, after: State) {
  for (const t of ["public.ledger_entries", "public.bank_transactions"]) {
    assert.ok(t in before && t in after);
    assert.deepEqual(after[t], before[t]);
    assert.equal(after[t].length, 0);
  }
}
function claimed(before: State, after: State, reward: string) {
  assert.equal(profile(after).bonus_skill_points, profile(before).bonus_skill_points + 1);
  assert.equal(after["public.progression_command_audit"].length, before["public.progression_command_audit"].length + 1);
  assert.equal(rewards(after).length, rewards(before).length);
  assert.equal(rewards(after).find(r => r.public_reward_id === reward)!.status, "claimed");
  assert.deepEqual(Object.keys(after).filter(t => JSON.stringify(before[t]) !== JSON.stringify(after[t])).sort(),
    ["public.player_progression_profiles", "public.player_progression_reward_grants", "public.progression_command_audit"].sort());
  noMoney(before, after);
}
async function ready() {
  const f = await seed(), first = await event(f, "first"), state = await snapshot(f);
  assert.equal(first.outcome, "applied"); assert.equal(first.experienceAwarded, 120);
  assert.equal(profile(state).experience, 120); assert.equal(profile(state).level, 1);
  assert.equal(rewards(state).length, 1);
  const reward = rewards(state)[0];
  assert.equal(reward.source_public_id, "ach_first_step_v1");
  assert.equal(reward.reward_kind, "skill_points"); assert.equal(reward.amount, 1); assert.equal(reward.status, "pending");
  return { f, reward: reward.public_reward_id as string, first };
}
async function denied(f: Fixture, reward: string, key: string, status: number, code: string) {
  const before = await snapshot(f), result = await claim(f, reward, key);
  assert.equal(result.status, status); assert.equal(result.body.error.code, code);
  assert.deepEqual(await snapshot(f), before);
  return result;
}
async function waitFor(predicate: () => Promise<boolean>) {
  const end = Date.now() + 15000;
  while (Date.now() < end) { if (await predicate()) return; await new Promise(r => setTimeout(r, 100)); }
  throw new Error("REF036 database overlap not observed");
}
async function race() {
  const { f, reward } = await ready(), before = await snapshot(f), holder = "ref036-holder", apps = ["ref036-race-a", "ref036-race-b"];
  // Both real claims reach the held reward row before either can apply its effect.
  const held = command(`begin; select public_reward_id from public.player_progression_reward_grants
    where public_reward_id=${q(reward)} for update; select pg_sleep(35); rollback;`, holder).spawn().output();
  const pending: Array<ReturnType<typeof claim>> = [];
  try {
    await waitFor(async () => await sql(`select count(*) from pg_stat_activity where application_name=${q(holder)} and wait_event='PgSleep'`) === "1");
    pending.push(...apps.map(app => claim(f, reward, app, app)));
    pending.forEach(p => { void p.catch(() => {}); });
    await waitFor(async () => await sql(`select count(*) from pg_stat_activity where application_name in (${apps.map(q)}) and wait_event_type='Lock'`) === "2");
    await sql(`select pg_cancel_backend(pid) from pg_stat_activity where application_name=${q(holder)}`); await held;
    const result = await Promise.all(pending);
    assert.deepEqual(result.map(r => r.status).sort(), [200,409]);
    assert.equal(result.find(r => r.status === 409)!.body.error.code, "progression_reward_already_claimed");
    claimed(before, await snapshot(f), reward);
    checks.competingClaims = { observedLockWaiters: 2, effects: 1, receipts: 1 };
  } finally {
    await sql(`select pg_cancel_backend(pid) from pg_stat_activity where application_name=${q(holder)}`);
    await held; await Promise.allSettled(pending);
  }
}
let injection = false;
async function removeInjection() {
  if (!injection) return;
  await sql("drop trigger ref036_failure on public.progression_command_audit; drop schema ref036_test cascade;");
  injection = false;
}
try {
  tables = await json(`select jsonb_agg(jsonb_build_object('schema',c.table_schema,'name',c.table_name) order by c.table_schema,c.table_name)::text
    from information_schema.columns c join information_schema.tables t using(table_schema,table_name)
    where c.column_name='game_session_id' and c.table_schema in ('public','economy_private') and t.table_type='BASE TABLE'`);
  checks.scopedSnapshotTables = tables.length;
  const { f, reward, first } = await ready(), beforeReplay = await snapshot(f);
  for (const key of ["first", "new-delivery-key"]) {
    const replay = await event(f, key, "first");
    assert.equal(replay.outcome, "replayed"); assert.equal(replay.eventId, first.eventId);
    assert.deepEqual(await snapshot(f), beforeReplay);
  }
  await assert.rejects(() => event(f, "first", "different"), /another Progression event/);
  await assert.rejects(() => event(f, "other", "first", new Date(now.getTime() - 120000).toISOString()), /different immutable details/);
  assert.deepEqual(await snapshot(f), beforeReplay);
  const older = await event(f, "older", "older", new Date(now.getTime() - 120000).toISOString());
  assert.equal(older.experienceAwarded, 120); assert.equal(older.resultingExperience, 240);
  const beforeClaim = await snapshot(f), applied = await claim(f, reward, "claim");
  assert.equal(applied.status, 200); assert.equal(applied.body.outcome, "applied");
  claimed(beforeClaim, await snapshot(f), reward);
  const afterClaim = await snapshot(f), replay = await claim(f, reward, "claim");
  assert.equal(replay.body.outcome, "replayed"); assert.equal(replay.body.commandId, applied.body.commandId);
  assert.deepEqual(await snapshot(f), afterClaim);
  await denied(f, reward, "again", 409, "progression_reward_already_claimed");
  const absent = `rwd_${"f".repeat(32)}`;
  await denied(f, absent, "claim", 409, "progression_idempotency_conflict");
  const ineligible = await seed(); await denied(ineligible, absent, "unearned", 404, "progression_reward_not_found");
  await denied(ineligible, reward, "other-game", 404, "progression_reward_not_found");
  assert.deepEqual(await snapshot(f), afterClaim);
  await assert.rejects(() => event({ game: ineligible.game, player: f.player }, "wrong-game"), /Progression Player was not found/);
  await sql(`update public.game_sessions set status='disabled',lifecycle_state='paused' where id=${q(f.game)}`);
  const paused = await snapshot(f);
  await assert.rejects(() => event(f, "paused-new"), /paused for this game/);
  assert.equal((await event(f, "first")).outcome, "replayed");
  assert.deepEqual(await snapshot(f), paused);
  checks.eventAndClaimReplayConflictScopeEligibility = true;
  const cap = await seed();
  for (let i = 0; i < 10; i++) assert.equal((await event(cap, `cap:${i}`)).experienceAwarded, 120);
  const beforeCap = await snapshot(cap), capped = await event(cap, "cap:10"), afterCap = await snapshot(cap);
  assert.equal(capped.outcome, "capped"); assert.equal(capped.experienceAwarded, 0);
  assert.equal(profile(afterCap).experience, 1200);
  assert.deepEqual(rewards(afterCap), rewards(beforeCap)); noMoney(beforeCap, afterCap);
  assert.equal(afterCap["public.progression_events"].length, 11);
  checks.outOfOrderAndDailyCap = true;
  const rollback = await ready(), beforeFailure = await snapshot(rollback.f);
  // Fail after the grant and claimed marker, inside the RPC's receipt insert.
  await sql(`create schema ref036_test; create function ref036_test.fail_receipt() returns trigger language plpgsql as $f$ begin
    if new.game_session_id=${q(rollback.f.game)}::uuid then
      if not exists(select 1 from public.player_progression_reward_grants where public_reward_id=${q(rollback.reward)} and status='claimed')
        or (select bonus_skill_points from public.player_progression_profiles where game_session_id=new.game_session_id and player_id=new.player_id) <> 1
      then raise exception 'REF036_FAILURE_POINT_NOT_REACHED'; end if;
      raise exception 'REF036_INJECTED_AFTER_REWARD'; end if; return new; end $f$;
    create trigger ref036_failure before insert on public.progression_command_audit for each row execute function ref036_test.fail_receipt();`);
  injection = true;
  const failed = await denied(rollback.f, rollback.reward, "rollback", 500, "player_progression_failed");
  assert.match(failed.errors.join("\n"), /REF036_INJECTED_AFTER_REWARD/);
  assert.ok(!failed.errors.join("\n").includes("REF036_FAILURE_POINT_NOT_REACHED"));
  assert.deepEqual(await snapshot(rollback.f), beforeFailure);
  await removeInjection();
  assert.equal((await claim(rollback.f, rollback.reward, "rollback")).status, 200);
  claimed(beforeFailure, await snapshot(rollback.f), rollback.reward);
  checks.inRpcRollbackAndSameKeyRetry = true;
  await race(); evidence.status = "pass";
} catch (error) { evidence.status = "fail"; throw error; }
finally {
  try { await removeInjection(); }
  catch (error) { evidence.status = "fail"; throw error; }
  finally {
    await Deno.mkdir("/tmp/ref018", { recursive: true });
    await Deno.writeTextFile("/tmp/ref018/ref036-database-qualification.json", JSON.stringify(evidence, null, 2) + "\n");
  }
}
console.log(JSON.stringify(evidence, null, 2));

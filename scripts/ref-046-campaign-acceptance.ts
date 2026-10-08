import assert from "node:assert/strict";
import { runCampaignScheduler } from "../backend/src/domains/campaign/services/campaignScheduler.ts";
import { runCampaignEffectWorker } from "../backend/src/domains/campaign/services/campaignEffectWorker.ts";
import { createSupabaseCampaignSchedulerRepository, createSupabaseCampaignEffectWorkerRepository } from "../backend/src/domains/campaign/infrastructure/supabaseCampaignRuntimeRepository.ts";
import { createSupabaseCampaignProgramProvider } from "../backend/src/domains/campaign/infrastructure/supabaseCampaignProgramProvider.ts";
import { createSupabaseCampaignEffectPorts } from "../backend/src/domains/campaign/infrastructure/supabaseCampaignEffectPorts.ts";
import { CAMPAIGN_PROGRESS_PHASES } from "../backend/src/domains/campaign/services/campaignProgram.ts";

// Replace only the transport: application adapters and frozen PostgreSQL RPCs remain real.
const database = Deno.env.get("DATABASE_URL") || "", url = new URL(database);
assert.equal(Deno.env.get("REF046_DISPOSABLE_DATABASE"), "1");
assert.equal(Deno.env.get("REF046_STACK_ID"), "econovaria");
assert.ok(["postgres:", "postgresql:"].includes(url.protocol));
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname));
assert.equal(url.port, "54322"); assert.equal(url.pathname, "/postgres");
assert.equal(url.username, "postgres"); assert.equal(url.search + url.hash, "");
assert.deepEqual(Deno.args, ["--phase=events"]);
const sourceSha = Deno.env.get("RELEASE_COMMIT") || "";
assert.match(sourceSha, /^[a-f0-9]{40}$/);
const checks: Record<string, unknown> = {}, receipts: Array<Record<string, unknown>> = [];
const evidence = { task: "REF-046a", sourceSha, status: "running", productionTouched: false, checks, receipts };
let now = "2026-10-08T00:00:00.000Z", later = "2026-10-09T00:00:00.000Z";
const pack = `ref046-${crypto.randomUUID()}`;
let digest = `sha256:${"a".repeat(64)}`;
const games: string[] = [], staff: string[] = [], decoder = new TextDecoder(), encoder = new TextEncoder();
const q = (v: unknown): string => v === null ? "null" : `'${String(typeof v === "object" ? JSON.stringify(v) : v).replaceAll("'", "''")}'`;
const ident = (v: string) => { assert.match(v, /^[a-z_][a-z0-9_]*$/); return `"${v}"`; };
function command(statement?: string, app = "ref046-fixture") {
  return new Deno.Command("psql", { args: [database, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", ...(statement ? ["-c", statement] : [])],
    clearEnv: true, env: { PATH: Deno.env.get("PATH") || "/usr/bin:/bin", PGAPPNAME: app,
      PGOPTIONS: "-c statement_timeout=15000 -c lock_timeout=10000" },
    stdin: statement ? "null" : "piped", stdout: "piped", stderr: "piped" });
}
async function sql(statement: string, app?: string, service = false) {
  const r = await command(service ? `begin; set local role service_role; ${statement}; commit;` : statement, app).output();
  if (r.code) throw new Error(decoder.decode(r.stderr).trim());
  return decoder.decode(r.stdout).trim();
}
const json = async (statement: string) => JSON.parse(await sql(statement));
const tables = ["campaign_instances", "campaign_event_executions", "campaign_effect_commands", "campaign_admin_audit", "notifications", "notification_deliveries"];
async function snapshot(game: string) {
  return Object.fromEntries(await Promise.all(tables.map(async table => [table,
    await json(`select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]') from public.${ident(table)} r where game_session_id=${q(game)}`)])));
}
const rpcNames = ["execute_campaign_event_atomic_v2", "claim_campaign_effect_commands_v1", "complete_campaign_effect_command_v1",
  "fail_campaign_effect_command_v1", "publish_campaign_notification_v1", "apply_world_route_state_v1"];
function client(app: string) {
  return {
    async rpc(name: string, args: Readonly<Record<string, unknown>>) {
      assert.ok(rpcNames.includes(name));
      const call = `public.${ident(name)}(${Object.entries(args).map(([k, v]) => `${ident(k)}=>${q(v)}`).join(",")})`;
      try {
        const set = ["execute_campaign_event_atomic_v2", "claim_campaign_effect_commands_v1"].includes(name);
        const data = JSON.parse(await sql(set ? `select coalesce(jsonb_agg(r),'[]') from ${call} r` : `select to_jsonb(${call})`, app, true));
        receipts.push({ app, name, data }); return { data, error: null };
      } catch (error) {
        const message = String(error), code = message.match(/ERROR:\s+(\w{5}):/)?.[1];
        receipts.push({ app, name, code, message }); return { data: null, error: { code, message } };
      }
    },
    from(table: string) {
      assert.ok([...tables, "campaign_program_definitions", "campaign_effect_definitions", "campaign_outcome_evidence_snapshots", "world_runtime_instances"].includes(table));
      let columns = "*", limit = 1000; const filters: string[] = [], order: string[] = [];
      async function execute(single: boolean) {
        const rows = JSON.parse(await sql(`select coalesce(jsonb_agg(r),'[]') from (select ${columns} from public.${ident(table)}
          ${filters.length ? `where ${filters.join(" and ")}` : ""} ${order.length ? `order by ${order.join(",")}` : ""} limit ${limit}) r`, app, true));
        if (single) assert.ok(rows.length <= 1);
        return { data: single ? rows[0] ?? null : rows, error: null };
      }
      const builder = {
        select(value = "*") { columns = value === "*" ? "*" : value.split(",").map(ident).join(","); return builder; },
        eq(column: string, value: unknown) { filters.push(`${ident(column)}=${q(value)}`); return builder; },
        lte(column: string, value: unknown) { filters.push(`${ident(column)}<=${q(value)}`); return builder; },
        order(column: string, options?: { ascending?: boolean }) { order.push(`${ident(column)} ${options?.ascending === false ? "desc" : "asc"}`); return builder; },
        limit(value: number) { assert.ok(Number.isInteger(value) && value > 0 && value <= 1000); limit = value; return builder; },
        in(column: string, values: readonly unknown[]) { filters.push(`${ident(column)} in (${values.map(q)})`); return builder; },
        maybeSingle: () => execute(true),
        then: <T, U>(resolve?: ((value: { data: any; error: null }) => T | PromiseLike<T>) | null, reject?: ((reason: unknown) => U | PromiseLike<U>) | null) => execute(false).then(resolve, reject),
      }; return builder;
    },
  };
}
const service = client("ref046-service");
const schedule = { nextScheduledAt: ({ event }: { event: { completeCampaign: boolean } }) => event.completeCampaign ? null : later };
const repository = createSupabaseCampaignSchedulerRepository(service, schedule);
const programs = createSupabaseCampaignProgramProvider(service);
const effects = createSupabaseCampaignEffectWorkerRepository(service);

const notify = { kind: "notify_players" as const, audience: "all_players" as const, notificationDefinitionId: "ref046.notice" };
const event = (phase: string, nextPhase: string | null, completeCampaign = false) => ({
  eventKey: `ref046.${completeCampaign ? nextPhase : phase}`, phase, nextPhase, completeCampaign, prerequisites: [], effects: [notify],
});
const program = { packId: pack, packVersion: "1", programId: "ref046.program", definitionDigest: digest, recoveryThresholdBasisPoints: 5000,
  eventsByPhase: Object.fromEntries(CAMPAIGN_PROGRESS_PHASES.map((p, i) => [p, event(p, CAMPAIGN_PROGRESS_PHASES[i + 1] ?? null)])),
  terminalEvents: { reconstruction: event("adaptation", "reconstruction", true), continuedConflict: event("adaptation", "continued_conflict", true) } };
async function seed(phase = "arrival", definition = "ref046.program") {
  const game = crypto.randomUUID(), owner = crypto.randomUUID(), player = crypto.randomUUID(); games.push(game); staff.push(owner);
  await sql(`begin;
    insert into public.staff_users(id,supabase_auth_user_id,email,display_name) values(${q(owner)},${q(crypto.randomUUID())},${q(owner + "@example.test")},'REF046 synthetic');
    insert into public.game_sessions(id,owner_staff_user_id,name,status,lifecycle_state,provisioning_status,provisioning_pack_id,provisioning_pack_version,started_at)
      values(${q(game)},${q(owner)},'REF046 synthetic','active','active','pending',${q(pack)},'1',${q(now)});
    insert into public.game_settings(game_session_id,stock_market_window) values(${q(game)},'{"timezone":"UTC"}');
    update public.game_sessions set provisioning_status='ready',provisioned_at=clock_timestamp(),
      provisioning_pack_sha256=${q(digest.slice(7))},provisioning_source_game_session_id=id where id=${q(game)};
    insert into public.players(id,game_session_id,display_name,status) values(${q(player)},${q(game)},'REF046 synthetic','active');
    update public.campaign_instances set definition_id=${q(definition)},current_phase=${q(phase)},scheduled_at=${q(now)}
      where game_session_id=${q(game)} and pack_id=${q(pack)};
    insert into public.campaign_outcome_evidence_snapshots(game_session_id,evidence_revision,recovery_readiness_basis_points,evidence_digest,observed_at)
      values(${q(game)},1,8000,${q(digest)},${q(now)}); commit;`);
  return { game, player, instance: (await repository.listDueCampaigns({ dueAt: now, limit: 100 })).find(r => r.gameId === game)! };
}
const run = (runId: string = crypto.randomUUID(), c = service) => runCampaignScheduler({ repository: createSupabaseCampaignSchedulerRepository(c, schedule), programs: createSupabaseCampaignProgramProvider(c), dueAt: now, runId, limit: 25 });
const deliver = () => runCampaignEffectWorker({ repository: effects, ports: createSupabaseCampaignEffectPorts(service, now), claimedAt: now, limit: 100 });
async function definition() {
  await sql(`insert into public.campaign_effect_definitions(pack_id,pack_version,definition_id,effect_kind,payload)
    values(${q(pack)},'1','ref046.notice','notify_players',${q({ title: "REF046", summary: "Synthetic proof", priority: "normal", displayMode: "inbox", notificationType: "campaign" })})`);
}
async function waitFor(predicate: string) {
  for (let n = 0; n < 100; n++) {
    if (await sql(`select exists(${predicate})`) === "t") return;
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  throw new Error("Real PostgreSQL contention was not observed");
}
async function foreignState() {
  const excluded = games.length ? `where game_session_id not in (${games.map(q)})` : "";
  return Object.fromEntries(await Promise.all(tables.map(async table => [table,
    await json(`select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]') from public.${ident(table)} r ${excluded}`)])));
}
let foreignBaseline: unknown, blocker: Deno.ChildProcess | undefined;
try {
  const migrations: string[] = [];
  for await (const entry of Deno.readDir("backend/supabase/migrations")) if (entry.isFile && /^\d+_.+\.sql$/.test(entry.name)) migrations.push(entry.name.split("_")[0]);
  migrations.sort(); assert.ok(migrations.length > 0);
  assert.deepEqual(await json("select jsonb_agg(version order by version) from supabase_migrations.schema_migrations"), migrations, "Full frozen migration replay required");
  checks.migrations = { count: migrations.length, head: migrations.at(-1) };
  // Retained suites provision their own campaigns; preserve them and choose a clock before their work.
  foreignBaseline = await foreignState();
  const earliest = await json("select coalesce(to_jsonb(min(scheduled_at)),'null'::jsonb) from public.campaign_instances");
  if (earliest) now = new Date(Math.min(Date.parse(now), Date.parse(earliest) - 86400000)).toISOString();
  later = new Date(Date.parse(now) + 86400000).toISOString();
  assert.equal(await sql("select count(*) from public.campaign_effect_commands where status <> 'completed'"), "0", "No foreign claimable work may enter this test");
  checks.fixtureClock = now;
  digest = await sql(`select public.campaign_program_digest_v1(${q(program)})`);
  program.definitionDigest = digest;
  await sql(`insert into public.campaign_program_definitions(pack_id,pack_version,definition_id,definition_digest,program) values(${q(pack)},'1','ref046.program',${q(digest)},${q(program)})`);
  const empty = await run(); assert.deepEqual(empty, { dueCount: 0, executedCount: 0, replayedCount: 0, failedCount: 0, failures: [] });
  assert.deepEqual(await foreignState(), foreignBaseline); checks.emptyWork = empty;

  const paused = await seed();
  await sql(`update public.game_sessions set status='disabled',lifecycle_state='paused' where id=${q(paused.game)}`);
  const beforePause = await snapshot(paused.game), denied = await run();
  assert.equal(denied.failedCount, 1); assert.match(String(receipts.at(-1)?.message), /CAMPAIGN_GAME_NOT_ACTIVE/);
  assert.deepEqual(await snapshot(paused.game), beforePause); checks.pausedGame = denied;
  await sql(`update public.campaign_instances set scheduled_at=${q(later)} where game_session_id=${q(paused.game)}`);

  const missing = await seed("arrival", "ref046.missing"), beforeMissing = await snapshot(missing.game);
  assert.equal((await run()).failures[0]?.code, "campaign_program_not_found");
  assert.deepEqual(await snapshot(missing.game), beforeMissing); checks.missingProgram = true;
  await sql(`update public.campaign_instances set scheduled_at=${q(later)} where game_session_id=${q(missing.game)}`);

  const a = await seed(), b = await seed("adaptation");
  assert.equal((await run()).executedCount, 2);
  const committedA = await snapshot(a.game), committedB = await snapshot(b.game);
  assert.equal(committedA.campaign_instances[0].current_phase, "opportunity");
  assert.equal(committedB.campaign_instances[0].current_phase, "reconstruction");
  for (const state of [committedA, committedB]) {
    assert.equal(state.campaign_instances[0].revision, 1); assert.equal(state.campaign_event_executions.length, 1);
    assert.equal(state.campaign_effect_commands.length, 1); assert.equal(state.notifications.length, 0);
  }
  // A missing destination definition fails after the atomic event/outbox commit.
  assert.equal((await deliver()).failedCount, 2);
  assert.deepEqual((await snapshot(a.game)).campaign_event_executions, committedA.campaign_event_executions);
  assert.deepEqual((await snapshot(b.game)).campaign_event_executions, committedB.campaign_event_executions);
  assert.equal((await snapshot(a.game)).campaign_effect_commands[0].status, "failed");
  await definition(); assert.equal((await deliver()).completedCount, 2);
  for (const f of [a, b]) {
    const state = await snapshot(f.game), command = state.campaign_effect_commands[0];
    assert.equal(command.status, "completed"); assert.equal(command.attempt_count, 2);
    assert.equal(state.notifications.length, 1); assert.equal(state.notifications[0].source_id, command.idempotency_key);
    assert.equal(state.notification_deliveries.length, 1); assert.equal(state.notification_deliveries[0].player_id, f.player);
    const result = await service.rpc("publish_campaign_notification_v1", { p_game_session_id: f.game, p_idempotency_key: command.idempotency_key,
      p_title: "REF046", p_summary: "Synthetic proof", p_priority: "normal", p_display_mode: "inbox", p_notification_type: "campaign", p_published_at: now });
    assert.equal(result.data.outcome, "replayed"); assert.equal(result.data.insertedDeliveries, 0);
    assert.deepEqual(await snapshot(f.game), state);
  }
  checks.twoGamesAndDestinationRetry = { games: [a.game, b.game], notifications: 2, deliveries: 2 };

  const rollback = await seed(), prior = await snapshot(rollback.game);
  const selected = (await programs.readProgram(rollback.instance)).eventsByPhase.arrival;
  await assert.rejects(repository.executeEventAtomic({ instance: rollback.instance,
    event: { ...selected, effects: [notify, { ...notify, kind: "invalid" } as any] }, triggerKey: "ref046.rollback",
    occurredAt: now, actorStaffUserId: null, reason: null }));
  assert.match(String(receipts.at(-1)?.message), /CAMPAIGN_EFFECT_COMMAND_INVALID/);
  assert.deepEqual(await snapshot(rollback.game), prior); checks.atomicSecondCommandRollback = true;
  await sql(`update public.campaign_instances set scheduled_at=${q(later)} where game_session_id=${q(rollback.game)}`);

  const missingRuntime = await seed();
  await sql(`insert into public.world_runtime_instances(game_session_id,pack_id,pack_version,definition_digest,initialized_at) values(${q(missingRuntime.game)},${q(pack)},'1',${q(digest)},${q(now)});
    delete from public.world_runtime_instances where game_session_id=${q(missingRuntime.game)}`);
  await repository.executeEventAtomic({ instance: missingRuntime.instance, event: { ...selected, effects: [{ kind: "set_route_state", routeDefinitionIds: ["rte_ref046"], state: "closed", reason: "war" }] },
    triggerKey: "ref046.missing-runtime", occurredAt: now, actorStaffUserId: null, reason: null });
  const runtimeCommitted = await snapshot(missingRuntime.game), runtimeFailure = await deliver();
  assert.equal(runtimeFailure.failures[0]?.errorCode, "campaign_world_runtime_missing");
  assert.deepEqual((await snapshot(missingRuntime.game)).campaign_event_executions, runtimeCommitted.campaign_event_executions);
  assert.equal(await sql(`select count(*) from public.world_runtime_commands where game_session_id=${q(missingRuntime.game)}`), "0");
  checks.missingRuntime = runtimeFailure;
  await sql(`update public.campaign_effect_commands set attempt_count=25 where game_session_id=${q(missingRuntime.game)}`);

  // Both real scheduler runs must reach the frozen RPC's game-row lock before release.
  for (const sameRun of [true, false]) {
    const f = await seed(), tag = sameRun ? "same" : "distinct";
    blocker = command(undefined, "ref046-blocker").spawn(); const writer = blocker.stdin.getWriter();
    await writer.write(encoder.encode(`begin; select id from public.game_sessions where id=${q(f.game)} for update;\n`));
    await waitFor("select 1 from pg_stat_activity where application_name='ref046-blocker' and state='idle in transaction'");
    const left = run(`ref046-${tag}-run-a`, client("ref046-race-a")), right = run(`ref046-${tag}-run-${sameRun ? "a" : "b"}`, client("ref046-race-b"));
    await waitFor("select 1 from pg_stat_activity where application_name='ref046-race-a' and wait_event_type='Lock'");
    await waitFor("select 1 from pg_stat_activity where application_name='ref046-race-b' and wait_event_type='Lock'");
    await writer.write(encoder.encode("commit;\n\\q\n")); await writer.close();
    assert.equal((await blocker.output()).code, 0); blocker = undefined;
    const results = await Promise.all([left, right]);
    assert.equal(results.reduce((n, r) => n + r.executedCount, 0), 1);
    assert.equal(results.reduce((n, r) => n + r.replayedCount, 0), sameRun ? 1 : 0);
    assert.equal(results.reduce((n, r) => n + r.failedCount, 0), sameRun ? 0 : 1);
    if (!sameRun) assert.equal(results.flatMap(r => r.failures)[0]?.code, "campaign_revision_conflict");
    const state = await snapshot(f.game); assert.equal(state.campaign_event_executions.length, 1);
    assert.equal(state.campaign_effect_commands.length, 1); assert.equal(state.campaign_instances[0].revision, 1);
    assert.equal((await deliver()).completedCount, 1); assert.equal((await snapshot(f.game)).notification_deliveries.length, 1);
    checks[`${tag}RunContention`] = results;
  }
  assert.deepEqual(await foreignState(), foreignBaseline); checks.foreignFixturesUnchanged = true;
  evidence.status = "passed";
} catch (error) {
  evidence.status = "failed"; checks.error = String(error); throw error;
} finally {
  if (blocker) { blocker.kill("SIGTERM"); await blocker.status; }
  try {
    for (const game of games) await sql(`delete from public.campaign_instances where game_session_id=${q(game)};
      delete from public.notifications where game_session_id=${q(game)}; delete from public.players where game_session_id=${q(game)};
      delete from public.game_sessions where id=${q(game)}`);
    for (const owner of staff) await sql(`delete from public.staff_users where id=${q(owner)}`);
    await sql(`delete from public.campaign_program_definitions where pack_id=${q(pack)}; delete from public.campaign_effect_definitions where pack_id=${q(pack)}`);
  } catch (error) { evidence.status = "failed"; checks.cleanupError = String(error); throw error; }
  finally { await Deno.writeTextFile("/tmp/ref018/ref046-events.json", JSON.stringify(evidence, null, 2) + "\n"); }
}
console.log(JSON.stringify(evidence));

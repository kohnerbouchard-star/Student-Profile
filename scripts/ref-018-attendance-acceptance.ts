import assert from "node:assert/strict";
import { recordAttendanceScanForAuthorizedStaff } from "../backend/src/domains/attendance/application/recordAttendanceForAuthorizedStaff.ts";
import { derivePlayerCredentialLookupDigest } from "../backend/src/security/playerCredentialHashing.ts";

// Never aim this destructive fixture harness at a hosted database. Its only
// client substitution is psql transport; application, repository and RPC run unchanged.
const database = Deno.env.get("DATABASE_URL") || "";
const location = new URL(database);
assert.equal(Deno.env.get("REF018_DISPOSABLE_DATABASE"), "1");
assert.ok(["postgres:", "postgresql:"].includes(location.protocol));
assert.ok(["127.0.0.1", "localhost"].includes(location.hostname));
assert.equal(location.port, "54322");
assert.equal(location.pathname, "/postgres");
assert.equal(location.username, "postgres");
assert.equal(location.search, "", "Connection parameters must not override loopback binding");
assert.equal(location.hash, "");
const sourceSha = Deno.env.get("RELEASE_COMMIT") || "";
assert.match(sourceSha, /^[a-f0-9]{40}$/);
const now = new Date("2026-10-01T00:30:00Z");
const date = "2026-10-01";
const decoder = new TextDecoder();
const literal = (value: unknown) => `'${String(value).replaceAll("'", "''")}'`;
const identifier = (value: string) => `"${value.replaceAll('"', '""')}"`;
const checks: Record<string, unknown> = {};
const evidence: Record<string, unknown> = {
  task: "REF-018", sourceSha, status: "running", productionTouched: false,
  transport: "Actual scan application and Supabase repository; service_role PostgreSQL via psql",
  checks,
};
type Row = Record<string, any>;
type State = Record<string, Row[]>;
type Fixture = { game: string; staff: string; player: string; code: string };
let tables: Array<{ table_schema: string; table_name: string }> = [];
let injectionInstalled = false;
const initialStates = new Map<string, State>();
function command(statement: string, app = "ref018-fixture", role = false) {
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
async function seed(label: string): Promise<Fixture> {
  const f = { game: crypto.randomUUID(), staff: crypto.randomUUID(), player: crypto.randomUUID(), code: `REF018-${crypto.randomUUID()}`.toUpperCase() };
  const window = { timezone: "Asia/Seoul", lateCutoff: "10:00", presentRewardAmount: 12.34,
    lateRewardAmount: 2.5, currencyCode: "ECO", currencyMode: "fixed", applyDifficultyIncomeModifier: false };
  await sql(`begin;
    insert into public.staff_users (id,supabase_auth_user_id,email,display_name)
      values (${literal(f.staff)},${literal(crypto.randomUUID())},${literal(`${f.staff}@example.test`)},'REF018 Staff');
    insert into public.game_sessions (id,owner_staff_user_id,name,status)
      values (${literal(f.game)},${literal(f.staff)},${literal(`REF018 ${label}`)},'active');
    insert into public.players (id,game_session_id,display_name,player_identifier,player_identifier_normalized,status)
      values (${literal(f.player)},${literal(f.game)},'REF018 Player',${literal(f.code)},${literal(f.code)},'active');
    insert into public.game_settings (game_session_id,attendance_window,stock_market_window)
      values (${literal(f.game)},${literal(JSON.stringify(window))}::jsonb,'{"timezone":"Asia/Seoul"}'::jsonb)
      on conflict (game_session_id) do update set attendance_window=excluded.attendance_window;
    commit;`);
  initialStates.set(f.game, await snapshot(f));
  return f;
}
async function snapshot(f: Fixture): Promise<State> {
  const selects = tables.map(t => `select ${literal(`${t.table_schema}.${t.table_name}`)} as name,
    coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]'::jsonb) as rows
    from ${identifier(t.table_schema)}.${identifier(t.table_name)} r where game_session_id=${literal(f.game)}::uuid`);
  return await jsonSql(`select jsonb_object_agg(name,rows)::text from (${selects.join(" union all ")}) s`);
}
function service(app: string) {
  const calls: string[] = [];
  const errors: string[] = [];
  return { calls, errors,
    async rpc(name: string, args: Record<string, unknown>) {
      assert.ok(["admin_read_mutation_replay_v1", "admin_record_attendance_v1"].includes(name));
      calls.push(name);
      const values = Object.entries(args).map(([key, value]) => {
        assert.match(key, /^p_[a-z_]+$/);
        const encoded = value === null ? "null" : typeof value === "object" ? `${literal(JSON.stringify(value))}::jsonb` : literal(value);
        return `${identifier(key)} => ${encoded}`;
      });
      try {
        const data = await jsonSql(`select coalesce(jsonb_agg(r),'[]'::jsonb)::text from public.${identifier(name)}(${values.join(",")}) r`, app, true);
        return { data, error: null };
      } catch (error) {
        errors.push(String(error));
        return { data: null, error: { message: String(error) } };
      }
    },
    from(table: string) {
      assert.ok(["players", "game_settings"].includes(table));
      const filters: string[] = [];
      let selected = "";
      const query = {
        select(columns: string) {
          const allowed = table === "players" ? "id,display_name,roster_label,player_identifier,status" : "attendance_window";
          assert.equal(columns, allowed); selected = columns.split(",").map(identifier).join(","); return query;
        },
        eq(column: string, value: unknown) {
          assert.ok(["game_session_id", "player_identifier_normalized", "id", "status"].includes(column));
          filters.push(`${identifier(column)}=${literal(value)}`); return query;
        },
        async maybeSingle() {
          assert.ok(selected && filters.length);
          try {
            const rows = await jsonSql(`select coalesce(jsonb_agg(r),'[]'::jsonb)::text from (select ${selected} from public.${identifier(table)} where ${filters.join(" and ")}) r`, `${app}-read`, true);
            assert.ok(rows.length <= 1);
            return { data: rows[0] ?? null, error: null };
          } catch (error) { return { data: null, error }; }
        },
      }; return query;
    },
  };
}
function scan(f: Fixture, key: string, client = service("ref018-scan"), timezone = "Asia/Seoul") {
  return recordAttendanceScanForAuthorizedStaff({ gameSessionId: f.game, staffUserId: f.staff,
    body: { playerId: f.code, deviceTimezone: timezone }, identity: { idempotencyKey: key, requestId: key } }, client as never, {
      now: () => now,
      // Synthetic pepper is passed explicitly; no real credential or environment secret is read.
      deriveCredentialLookupDigest: value => derivePlayerCredentialLookupDigest(value, { pepper: "ref018-disposable-synthetic-pepper-000000000000" }),
    });
}
function assertEffects(f: Fixture, state: State, receiptCount: number) {
  const initial = initialStates.get(f.game)!;
  // Count every game-scoped posting, not just entries bearing the expected source.
  assert.equal(state["public.ledger_entries"].length - initial["public.ledger_entries"].length, 2);
  assert.equal(state["public.bank_transactions"].length - initial["public.bank_transactions"].length, 1);
  const attendance = state["public.player_attendance_records"];
  assert.equal(attendance.length, 1);
  assert.equal(attendance[0].player_id, f.player);
  assert.equal(attendance[0].attendance_date, date);
  assert.equal(attendance[0].status, "present");
  const entries = state["public.ledger_entries"].filter(r => r.source_id === attendance[0].id && r.source_action === "staff_scan_reward");
  // Current Banking posts one spendable credit and one non-spendable signed offset.
  assert.equal(entries.length, 2);
  const credit = entries.find(r => r.player_id === f.player && r.account_type === "checking");
  const offset = entries.find(r => r.line_metadata?.compatibilityRole === "signed_offset");
  assert.ok(credit); assert.ok(offset);
  assert.equal(Number(credit.amount), 12.34); assert.equal(credit.currency_code, "ECO");
  assert.equal(Number(offset.amount), -12.34); assert.equal(offset.currency_code, "ECO");
  assert.equal(offset.player_id, null); assert.equal(offset.line_metadata.nonSpendable, true);
  assert.equal(offset.bank_transaction_id, credit.bank_transaction_id);
  assert.equal(state["public.bank_transactions"].filter(r => r.id === credit.bank_transaction_id).length, 1);
  assert.equal(state["private.admin_mutation_requests"].length, receiptCount);
  assert.equal(state["public.audit_log"].filter(r => r.action === "attendance.staff_scan").length, receiptCount);
}
async function waitFor(predicate: () => Promise<boolean>, message: string) {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(message);
}
async function race(sameKey: boolean) {
  const f = await seed(sameKey ? "same-key-race" : "same-day-race");
  const prefix = sameKey ? "ref018-same-key" : "ref018-same-day";
  const holderName = `${prefix}-holder`;
  const holder = command(`begin; select private.lock_attendance_day_mutation_v1(${literal(f.game)},${literal(date)}); select pg_sleep(35); rollback;`, holderName).spawn();
  const holderResult = holder.output();
  const pending: Array<ReturnType<typeof scan>> = [];
  try {
    await waitFor(async () => await sql(`select count(*) from pg_stat_activity where application_name=${literal(holderName)} and wait_event='PgSleep'`) === "1", "Attendance day lock not acquired");
    pending.push(scan(f, `${prefix}-a`, service(`${prefix}-a`)), scan(f, sameKey ? `${prefix}-a` : `${prefix}-b`, service(`${prefix}-b`)));
    // Attach rejection handlers while the lock-observation phase is still running.
    pending.forEach(result => { void result.catch(() => {}); });
    await waitFor(async () => await sql(`select count(*) from pg_stat_activity where application_name in (${literal(`${prefix}-a`)},${literal(`${prefix}-b`)}) and wait_event_type='Lock'`) === "2", "Both real submissions must wait concurrently on database locks");
    await sql(`select pg_cancel_backend(pid) from pg_stat_activity where application_name=${literal(holderName)}`);
    await holderResult;
    const results = await Promise.all(pending);
    results.forEach(result => assert.equal(result.status, 200));
    if (sameKey) {
      assert.equal(results.filter(r => r.replayed).length, 1);
      assert.deepEqual(results[0].attendance, results[1].attendance);
    } else {
      assert.equal(results.filter(r => r.attendance.was_created).length, 1);
      assert.equal(results.filter(r => !r.attendance.was_created).length, 1);
      assert.equal(Number(results.find(r => !r.attendance.was_created)?.attendance.reward_amount), 0);
    }
    assertEffects(f, await snapshot(f), sameKey ? 1 : 2);
    checks[sameKey ? "sameKeyConcurrentReplay" : "samePlayerDayConcurrentSingleReward"] = { concurrentWaiters: 2, pass: true };
  } finally {
    await sql(`select pg_cancel_backend(pid) from pg_stat_activity where application_name=${literal(holderName)}`);
    await holderResult;
    await Promise.allSettled(pending);
  }
}
async function removeInjection() {
  if (!injectionInstalled) return;
  await sql("begin; drop trigger ref018_injected_failure on public.audit_log; drop schema ref018_test cascade; commit;");
  injectionInstalled = false;
}
try {
  tables = await jsonSql(`select jsonb_agg(jsonb_build_object('table_schema',c.table_schema,'table_name',c.table_name) order by c.table_schema,c.table_name)::text
    from information_schema.columns c join information_schema.tables t using(table_catalog,table_schema,table_name)
    where c.column_name='game_session_id' and c.table_schema in ('public','private','economy_private') and t.table_type='BASE TABLE'`);
  assert.ok(tables.length > 10);
  assert.ok(tables.some(t => t.table_schema === "private" && t.table_name === "admin_mutation_requests"));
  checks.snapshotTableCount = tables.length;
  const f = await seed("replay");
  const first = await scan(f, "ref018-replay-key");
  assert.equal(first.status, 200); assert.equal(first.replayed, false);
  assert.equal(first.attendance.was_created, true);
  const after = await snapshot(f);
  assertEffects(f, after, 1);
  const replayClient = service("ref018-replay");
  const replay = await scan(f, "ref018-replay-key", replayClient);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.attendance, first.attendance);
  assert.deepEqual(replay.reward, first.reward);
  assert.deepEqual(replayClient.calls, ["admin_read_mutation_replay_v1"]);
  assert.deepEqual(await snapshot(f), after);
  await assert.rejects(scan(f, "ref018-replay-key", service("ref018-conflict"), "UTC"), { code: "idempotency_key_conflict", status: 409 });
  assert.deepEqual(await snapshot(f), after);
  checks.sameKeyReplayAndPayloadConflict = true;

  const locked = await seed("locked");
  await sql(`insert into public.attendance_day_locks (game_session_id,attendance_date,locked_by_staff_user_id) values (${literal(locked.game)},${literal(date)},${literal(locked.staff)})`);
  const lockedBefore = await snapshot(locked);
  await assert.rejects(scan(locked, "ref018-locked-key"), { code: "attendance_period_locked", status: 423 });
  assert.deepEqual(await snapshot(locked), lockedBefore);
  checks.lockedDayNoEffects = true;

  const failed = await seed("rollback");
  // Fail inside the existing completion-audit insert, after reward/attendance writes.
  // The scoped transient trigger exists only in this explicitly disposable database.
  await sql(`begin; create schema ref018_test;
    create function ref018_test.fail_completion() returns trigger language plpgsql as $f$
    begin if new.game_session_id=${literal(failed.game)}::uuid and new.action='attendance.staff_scan' then
      if not exists (select 1 from public.player_attendance_records where game_session_id=new.game_session_id)
        or not exists (select 1 from public.ledger_entries where game_session_id=new.game_session_id and source_action='staff_scan_reward') then
        raise exception 'REF018_FAILURE_POINT_NOT_REACHED'; end if;
      raise exception 'REF018_INJECTED_AFTER_REWARD'; end if; return new; end $f$;
    create trigger ref018_injected_failure before insert on public.audit_log for each row execute function ref018_test.fail_completion(); commit;`);
  injectionInstalled = true;
  const beforeFailure = await snapshot(failed);
  const failureClient = service("ref018-rollback");
  await assert.rejects(scan(failed, "ref018-rollback-key", failureClient));
  assert.ok(failureClient.errors.some(error => error.includes("REF018_INJECTED_AFTER_REWARD")));
  assert.deepEqual(await snapshot(failed), beforeFailure, "Failure must roll back attendance, money, audit and replay receipt");
  await removeInjection();
  const retry = await scan(failed, "ref018-rollback-key");
  assert.equal(retry.replayed, false); assert.equal(retry.attendance.was_created, true);
  assertEffects(failed, await snapshot(failed), 1);
  checks.inRpcRollbackAndSameKeyRetry = true;
  await race(true);
  await race(false);
  evidence.status = "pass";
} catch (error) {
  evidence.status = "fail";
  // Do not persist connection strings or SQL diagnostics, even from local fixtures.
  evidence.error = error instanceof Error ? error.name : "UnknownError";
  throw error;
} finally {
  try { await removeInjection(); } catch (error) { evidence.status = "fail"; evidence.cleanupFailed = true; throw error; }
  finally {
    await Deno.mkdir("/tmp/ref018", { recursive: true });
    await Deno.writeTextFile("/tmp/ref018/database-qualification.json", JSON.stringify(evidence, null, 2) + "\n");
  }
}
console.log(JSON.stringify(evidence, null, 2));

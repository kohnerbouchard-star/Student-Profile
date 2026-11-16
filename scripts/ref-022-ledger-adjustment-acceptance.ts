import { adjustLedgerForAuthorizedStaff } from "../backend/src/domains/economy/application/adjustLedgerForAuthorizedStaff.ts";
import assert from "node:assert/strict";
import { recordIdempotentStaffLedgerAdjustment } from "../backend/src/domains/economy/services/idempotentStaffLedgerAdjustment.ts";

// Never aim this destructive fixture harness at a hosted database. Its only
// transport substitution is psql; the application, atomic service and RPC run unchanged.
const database = Deno.env.get("DATABASE_URL") || "";
const location = new URL(database);
assert.equal(Deno.env.get("REF022_DISPOSABLE_DATABASE"), "1");
assert.ok(["postgres:", "postgresql:"].includes(location.protocol));
assert.ok(["127.0.0.1", "localhost"].includes(location.hostname));
assert.equal(location.port, "54322");
assert.equal(location.pathname, "/postgres");
assert.equal(location.username, "postgres");
assert.equal(
  location.search,
  "",
  "Connection parameters must not override loopback binding",
);
assert.equal(location.hash, "");
const sourceSha = Deno.env.get("RELEASE_COMMIT") || "";
assert.match(sourceSha, /^[a-f0-9]{40}$/);
const decoder = new TextDecoder();
const literal = (value: unknown) => `'${String(value).replaceAll("'", "''")}'`;
const identifier = (value: string) => `"${value.replaceAll('"', '""')}"`;
const checks: Record<string, unknown> = {};
const evidence: Record<string, unknown> = {
  task: "REF-022",
  sourceSha,
  status: "running",
  productionTouched: false,
  transport:
    "Actual Staff adjustment application and unchanged atomic service/RPC; service_role PostgreSQL via psql",
  checks,
};
type Row = Record<string, any>;
type State = Record<string, Row[]>;
type Fixture = { game: string; staff: string; player: string };
let tables: Array<{ table_schema: string; table_name: string }> = [];
let injectionInstalled = false;
const initialStates = new Map<string, State>();
function command(statement: string, app = "ref022-fixture", role = false) {
  return new Deno.Command("psql", {
    args: [
      database,
      "-X",
      "-qAt",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      role
        ? `begin; set local role service_role; ${statement}; commit;`
        : statement,
    ],
    env: {
      PGAPPNAME: app,
      PGOPTIONS: "-c statement_timeout=45000 -c lock_timeout=30000",
    },
    stdout: "piped",
    stderr: "piped",
  });
}
async function sql(
  statement: string,
  app?: string,
  role = false,
): Promise<string> {
  const result = await command(statement, app, role).output();
  if (result.code !== 0) throw new Error(decoder.decode(result.stderr).trim());
  return decoder.decode(result.stdout).trim();
}
async function jsonSql(statement: string, app?: string, role = false) {
  return JSON.parse(await sql(statement, app, role));
}
async function seed(label: string): Promise<Fixture> {
  const f = {
    game: crypto.randomUUID(),
    staff: crypto.randomUUID(),
    player: crypto.randomUUID(),
  };
  await sql(`begin;
    insert into public.staff_users (id,supabase_auth_user_id,email,display_name) values (${
    literal(f.staff)
  },${literal(crypto.randomUUID())},${
    literal(`${f.staff}@example.test`)
  },'REF022 Staff');
    insert into public.game_sessions (id,owner_staff_user_id,name,status) values (${
    literal(f.game)
  },${literal(f.staff)},${literal(`REF022 ${label}`)},'active');
    insert into public.players (id,game_session_id,display_name,status) values (${
    literal(f.player)
  },${literal(f.game)},'REF022 Player','active');
    insert into public.game_settings (game_session_id,stock_market_window) values (${
    literal(f.game)
  },'{"timezone":"Asia/Seoul"}'::jsonb) on conflict do nothing;
    commit;`);
  initialStates.set(f.game, await snapshot(f));
  return f;
}
async function snapshot(f: Fixture): Promise<State> {
  const selects = tables.map((t) =>
    `select ${literal(`${t.table_schema}.${t.table_name}`)} as name,
    coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]'::jsonb) as rows
    from ${identifier(t.table_schema)}.${
      identifier(t.table_name)
    } r where game_session_id=${literal(f.game)}::uuid`
  );
  return await jsonSql(
    `select jsonb_object_agg(name,rows)::text from (${
      selects.join(" union all ")
    }) s`,
  );
}
function service(app: string) {
  const calls: string[] = [], errors: string[] = [];
  return {
    calls,
    errors,
    async rpc(name: string, args: Record<string, unknown>) {
      assert.equal(name, "record_idempotent_staff_ledger_adjustment_v1");
      calls.push(name);
      const values = Object.entries(args).map(([key, value]) => {
        assert.match(key, /^p_[a-z_]+$/);
        return `${identifier(key)} => ${
          value === null
            ? "null"
            : typeof value === "object"
            ? `${literal(JSON.stringify(value))}::jsonb`
            : literal(value)
        }`;
      });
      try {
        return {
          data: await jsonSql(
            `select coalesce(jsonb_agg(r),'[]'::jsonb)::text from public.${
              identifier(name)
            }(${values.join(",")}) r`,
            app,
            true,
          ),
          error: null,
        };
      } catch (error) {
        errors.push(String(error));
        return { data: null, error: { message: String(error) } };
      }
    },
  };
}
function adjust(
  f: Fixture,
  key: string,
  amount = 12.34,
  client = service("ref022-adjust"),
  patch = {},
) {
  return adjustLedgerForAuthorizedStaff({
    gameSessionId: f.game, playerId: f.player, staffUserId: f.staff,
    idempotencyKey: key, amount, accountType: "checking", currencyCode: "ECO",
    reason: "Synthetic correction", ...patch,
  }, input => recordIdempotentStaffLedgerAdjustment(client as never, input));
}
function assertEffects(f: Fixture, state: State, amounts: number[]) {
  const initial = initialStates.get(f.game)!, count = amounts.length;
  // Assert all game-scoped postings so an unexpected duplicate cannot hide behind a source filter.
  for (
    const [table, n] of [["ledger_entries", 2 * count], [
      "bank_transactions",
      count,
    ], ["mutation_idempotency_keys", count]] as const
  ) {
    assert.equal(
      state[`public.${table}`].length - initial[`public.${table}`].length,
      n,
    );
  }
  const entries = state["public.ledger_entries"].filter((r) =>
    r.player_id === f.player
  );
  assert.deepEqual(
    entries.map((r) => Number(r.amount)).sort((a, b) => a - b),
    [...amounts].sort((a, b) => a - b),
  );
  assert.ok(
    entries.every((r) =>
      r.currency_code === "ECO" && r.account_type === "checking" &&
      r.source_action === "staff_player_balance_adjustment"
    ),
  );
  assert.equal(
    state["public.ledger_entries"].reduce((n, r) => n + Number(r.amount), 0),
    0,
  );
  const balance = state["public.account_balances"].find((r) =>
    r.player_id === f.player && r.account_type === "checking" &&
    r.currency_code === "ECO"
  );
  assert.equal(
    Number(balance?.balance),
    Math.round(amounts.reduce((a, b) => a + b, 0) * 100) / 100,
  );
  const audits = state["public.audit_log"].filter((r) =>
    r.action === "ledger.staff_player_balance_adjustment"
  );
  // Balanced Banking records both the posting audit and the legacy player audit.
  assert.equal(audits.length, 2 * count);
  assert.equal(audits.filter(r => r.target_type === "bank_transaction").length, count);
  assert.equal(audits.filter(r => r.target_type === "player").length, count);
  assert.ok(
    audits.every((r) =>
      r.actor_id === f.staff && r.metadata.reason === "Synthetic correction"
    ),
  );
}
async function waitFor(predicate: () => Promise<boolean>, message: string) {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(message);
}
async function race(sameKey: boolean) {
  const f = await seed(sameKey ? "same-key" : "different-key"),
    prefix = sameKey ? "ref022-same" : "ref022-distinct",
    holderName = `${prefix}-holder`;
  // Hold only a disposable fixture table lock until both actual RPC sessions are observed waiting.
  const holder = command(
      "begin; lock table public.mutation_idempotency_keys in exclusive mode; select pg_sleep(35); rollback;",
      holderName,
    ).spawn(),
    held = holder.output();
  const pending: Array<ReturnType<typeof adjust>> = [];
  try {
    await waitFor(
      async () =>
        await sql(
          `select count(*) from pg_stat_activity where application_name=${
            literal(holderName)
          } and wait_event='PgSleep'`,
        ) === "1",
      "Fixture lock was not acquired",
    );
    pending.push(
      adjust(f, `${prefix}-a`, 12.34, service(`${prefix}-a`)),
      adjust(
        f,
        sameKey ? `${prefix}-a` : `${prefix}-b`,
        12.34,
        service(`${prefix}-b`),
      ),
    );
    pending.forEach((p) => {
      void p.catch(() => {});
    });
    await waitFor(
      async () =>
        await sql(
          `select count(*) from pg_stat_activity where application_name in (${
            literal(`${prefix}-a`)
          },${literal(`${prefix}-b`)}) and wait_event_type='Lock'`,
        ) === "2",
      "Both real commands must overlap waiting on database locks",
    );
    await sql(
      `select pg_cancel_backend(pid) from pg_stat_activity where application_name=${
        literal(holderName)
      }`,
    );
    await held;
    const results = await Promise.all(pending);
    assert.equal(
      results.filter((r) => r.outcome === "replayed").length,
      sameKey ? 1 : 0,
    );
    if (sameKey) {
      assert.equal(results[0].ledgerEntryId, results[1].ledgerEntryId);
    }
    assertEffects(f, await snapshot(f), sameKey ? [12.34] : [12.34, 12.34]);
    checks[
      sameKey
        ? "concurrentSameKeySingleAdjustment"
        : "concurrentDistinctKeyNoLostUpdate"
    ] = { pass: true, observedLockWaiters: 2 };
  } finally {
    await sql(
      `select pg_cancel_backend(pid) from pg_stat_activity where application_name=${
        literal(holderName)
      }`,
    );
    await held;
    await Promise.allSettled(pending);
  }
}
async function removeInjection() {
  if (!injectionInstalled) return;
  await sql(
    "begin; drop trigger ref022_injected_failure on public.mutation_idempotency_keys; drop schema ref022_test cascade; commit;",
  );
  injectionInstalled = false;
}
try {
  tables = await jsonSql(
    `select jsonb_agg(jsonb_build_object('table_schema',c.table_schema,'table_name',c.table_name) order by c.table_schema,c.table_name)::text from information_schema.columns c join information_schema.tables t using(table_catalog,table_schema,table_name) where c.column_name='game_session_id' and c.table_schema in ('public','private','economy_private') and t.table_type='BASE TABLE'`,
  );
  assert.ok(tables.length > 10);
  checks.snapshotTableCount = tables.length;
  const f = await seed("serial"), first = await adjust(f, "ref022-replay");
  assert.equal(first.outcome, "applied");
  assertEffects(f, await snapshot(f), [12.34]);
  const after = await snapshot(f), replay = await adjust(f, "ref022-replay");
  assert.deepEqual(replay, { ...first, outcome: "replayed" });
  assert.deepEqual(await snapshot(f), after);
  await assert.rejects(adjust(f, "ref022-replay", 13), {
    code: "ledger_idempotency_conflict",
    status: 409,
  });
  assert.deepEqual(await snapshot(f), after);
  await adjust(f, "ref022-debit", -2.34);
  assertEffects(f, await snapshot(f), [12.34, -2.34]);
  checks.creditDebitReplayConflict = true;
  for (
    const [label, amount, patch] of [
      ["overdraft", -100, {}],
      ["zero", 0, {}],
      ["currency", 1, { currencyCode: "!" }],
      ["empty-account", 1, { accountType: "" }],
      ["wrong-player", 1, { playerId: crypto.randomUUID() }],
    ] as const
  ) {
    const before = await snapshot(f);
    await assert.rejects(
      adjust(f, `ref022-${label}`, amount, service(`ref022-${label}`), patch),
      `${label} must reject without effects`,
    );
    assert.deepEqual(await snapshot(f), before);
    checks[label + "NoEffects"] = true;
  }
  const other = await seed("other-game"),
    otherBefore = await snapshot(other),
    originalBefore = await snapshot(f);
  await assert.rejects(
    adjust(other, "ref022-wrong-game", 1, service("ref022-wrong-game"), {
      playerId: f.player,
    }),
  );
  assert.deepEqual(await snapshot(other), otherBefore);
  assert.deepEqual(await snapshot(f), originalBefore);
  checks.wrongGameNoEffects = true;
  const failed = await seed("rollback");
  // Raise inside the real completion update, after balanced postings and audit exist.
  // Only this disposable database receives the transient fixture trigger; no migration changes.
  await sql(
    `begin; create schema ref022_test; create function ref022_test.fail_completion() returns trigger language plpgsql as $f$ begin
    if new.game_session_id=${
      literal(failed.game)
    }::uuid and new.status='COMPLETED' then
      if (select count(*) from public.ledger_entries where game_session_id=new.game_session_id)<>2 or not exists(select 1 from public.audit_log where game_session_id=new.game_session_id and action='ledger.staff_player_balance_adjustment') then raise exception 'REF022_FAILURE_POINT_NOT_REACHED'; end if;
      raise exception 'REF022_INJECTED_AFTER_LEDGER_AUDIT'; end if;return new;end $f$;
    create trigger ref022_injected_failure before update on public.mutation_idempotency_keys for each row execute function ref022_test.fail_completion();commit;`,
  );
  injectionInstalled = true;
  const before = await snapshot(failed), client = service("ref022-rollback");
  await assert.rejects(adjust(failed, "ref022-rollback", 12.34, client));
  assert.ok(
    client.errors.some((e) => e.includes("REF022_INJECTED_AFTER_LEDGER_AUDIT")),
  );
  assert.deepEqual(await snapshot(failed), before);
  await removeInjection();
  assert.equal((await adjust(failed, "ref022-rollback")).outcome, "applied");
  assertEffects(failed, await snapshot(failed), [12.34]);
  checks.inRpcRollbackAndSameKeyRetry = true;
  await race(true);
  await race(false);
  evidence.status = "pass";
} catch (error) {
  evidence.status = "fail";
  evidence.error = error instanceof Error ? error.name : "UnknownError";
  throw error;
} finally {
  try {
    await removeInjection();
  } catch (error) {
    evidence.status = "fail";
    evidence.cleanupFailed = true;
    throw error;
  } finally {
    await Deno.mkdir("/tmp/ref018", { recursive: true });
    await Deno.writeTextFile(
      "/tmp/ref018/ref022-database-qualification.json",
      JSON.stringify(evidence, null, 2) + "\n",
    );
  }
}
console.log(JSON.stringify(evidence, null, 2));

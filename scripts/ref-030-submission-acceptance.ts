import assert from "node:assert/strict";
import { handlePlayerContractPublicSubmitRequest } from "../backend/src/domains/contracts/api/playerContractPublicSubmitHttpHandler.ts";

// Only the transport is replaced: the real handler, repository, upsert and AFTER
// trigger run together against the replayed disposable database, never production.
const database = Deno.env.get("DATABASE_URL") || "";
const url = new URL(database);
assert.equal(Deno.env.get("REF030_DISPOSABLE_DATABASE"), "1");
assert.ok(["postgres:", "postgresql:"].includes(url.protocol));
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname));
assert.equal(url.port, "54322");
assert.equal(url.pathname, "/postgres");
assert.equal(url.username, "postgres");
assert.equal(url.search + url.hash, "");
const sourceSha = Deno.env.get("RELEASE_COMMIT") || "";
assert.match(sourceSha, /^[a-f0-9]{40}$/);
const q = (v: unknown) => `'${String(v).replaceAll("'", "''")}'`;
const ident = (v: string) => { assert.match(v, /^[a-z_]+$/); return `"${v}"`; };
const checks: Record<string, unknown> = {};
const evidence = { task: "REF-030a", sourceSha, status: "running", productionTouched: false,
  transport: "real submission handler/repository; service_role PostgreSQL upsert via psql", checks };
const decoder = new TextDecoder();
function command(statement: string, app = "ref030-fixture", role = false) {
  return new Deno.Command("psql", {
    args: [database, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c",
      role ? `begin; set local role service_role; ${statement}; commit;` : statement],
    env: { PGAPPNAME: app, PGOPTIONS: "-c statement_timeout=45000 -c lock_timeout=30000" },
    stdout: "piped", stderr: "piped",
  });
}
async function sql(s: string, app?: string, role = false) {
  const result = await command(s, app, role).output();
  if (result.code) throw new Error(decoder.decode(result.stderr).trim());
  return decoder.decode(result.stdout).trim();
}
const json = async (s: string) => JSON.parse(await sql(s));
const keys = ["contract.meridian.compare-financing-governance.v1", "contract.meridian.belonging-long-term-status-decision.v1"];
const rationale = "  Shared governance keeps review rights when participating institutions disagree.  ";
type Fixture = { game: string; player: string; contract: string; progress: string; key: string };
type State = Record<string, Array<Record<string, any>>>;
let tables: Array<{ schema: string; name: string }> = [];
async function snapshot(f: Fixture): Promise<State> {
  const selects = tables.map(t => `select ${q(t.schema + "." + t.name)} name,
    coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]') rows
    from ${ident(t.schema)}.${ident(t.name)} r where game_session_id=${q(f.game)}::uuid`);
  return await json(`select jsonb_object_agg(name,rows)::text from (${selects.join(" union all ")}) s`);
}
async function seed(key = keys[0]): Promise<Fixture> {
  const f = { game: crypto.randomUUID(), player: crypto.randomUUID(), contract: crypto.randomUUID(), progress: crypto.randomUUID(), key };
  const staff = crypto.randomUUID();
  await sql(`begin;
    insert into public.staff_users(id,supabase_auth_user_id,email,display_name)
      values(${q(staff)},${q(crypto.randomUUID())},${q(staff + '@example.test')},'REF030 Staff');
    insert into public.game_sessions(id,owner_staff_user_id,name,status,lifecycle_state)
      values(${q(f.game)},${q(staff)},'REF030 synthetic','active','active');
    insert into public.players(id,game_session_id,display_name,status)
      values(${q(f.player)},${q(f.game)},'REF030 Player','active');
    insert into public.game_session_contracts(id,game_session_id,contract_key,source_type,title,description,instructions,category,status,visibility,targeting_payload,requirements_payload,reward_payload,completion_mode,published_at,metadata)
      values(${q(f.contract)},${q(f.game)},${q(key)},'teacher','REF030 Contract','Synthetic qualification','Choose and explain','story','active','public','{}','{}','{}','manual_review',now()-interval '1 hour','{}');
    insert into public.player_contract_progress(id,game_session_id,contract_id,player_id,status,result_payload)
      values(${q(f.progress)},${q(f.game)},${q(f.contract)},${q(f.player)},'in_progress','{"preserved":true}');
    insert into public.player_story_relationships(game_session_id,player_id,character_key,character_name,relationship_role,trust_score,memory)
      values(${q(f.game)},${q(f.player)},'character.ref030.sponsor','REF030 Sponsor','sponsor',0,'{"preserved":true}');
    commit;`);
  return f;
}
function service(app: string) {
  let writes = 0;
  const errors: string[] = [];
  return { get writes() { return writes; }, errors,
    from(table: string) {
      assert.ok(["game_session_contracts", "player_contract_progress"].includes(table));
      const filters: string[] = [], order: string[] = [];
      let columns = "", row: Record<string, unknown> | null = null;
      async function execute(single: boolean) {
        try {
          let query: string;
          if (row) {
            assert.equal(table, "player_contract_progress");
            writes++;
            const names = Object.keys(row);
            assert.deepEqual(names.sort(), ["contract_id", "evidence_payload", "game_session_id", "player_id", "result_payload", "status", "submitted_at"]);
            const values = names.map(n => `${q(typeof row![n] === 'object' ? JSON.stringify(row![n]) : row![n])}`);
            const update = names.filter(n => !["game_session_id", "contract_id", "player_id"].includes(n));
            query = `with changed as (insert into public.player_contract_progress(${names.map(ident)}) values(${values})
              on conflict(game_session_id,contract_id,player_id) do update set ${update.map(n => `${ident(n)}=excluded.${ident(n)}`)} returning ${columns})
              select coalesce(jsonb_agg(r),'[]')::text from changed r`;
          } else query = `select coalesce(jsonb_agg(r),'[]')::text from (select ${columns} from public.${ident(table)}
            where ${filters.join(' and ')} ${order.length ? 'order by ' + order.join(',') : ''}) r`;
          const rows = JSON.parse(await sql(query, app, true));
          if (single) assert.ok(rows.length <= 1);
          return { data: single ? rows[0] ?? null : rows, error: null };
        } catch (error) { errors.push(String(error)); return { data: null, error: { message: String(error) } }; }
      }
      const builder = {
        select(value: string) { columns = value.split(',').map(v => ident(v.trim())).join(','); return builder; },
        upsert(value: Record<string, unknown>, options: { onConflict: string }) {
          assert.equal(options.onConflict, "game_session_id,contract_id,player_id"); row = value; return builder;
        },
        eq(column: string, value: unknown) { filters.push(`${ident(column)}=${q(value)}`); return builder; },
        in(column: string, values: unknown[]) { filters.push(`${ident(column)} in (${values.map(q)})`); return builder; },
        order(column: string, options: { ascending?: boolean; nullsFirst?: boolean }) {
          order.push(`${ident(column)} ${options.ascending === false ? 'desc' : 'asc'}${options.nullsFirst === false ? ' nulls last' : ''}`); return builder;
        },
        maybeSingle: () => execute(true),
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => execute(false).then(resolve, reject),
      };
      return builder;
    },
  };
}
async function submit(f: Fixture, option = "multilateral", app = "ref030-submit", text = rationale) {
  const client = service(app), submittedAt = new Date().toISOString();
  let renders = 0, renderSawCommit = false;
  const payload = { storyDecision: { optionKey: option, rationale: text }, retained: null };
  const response = await handlePlayerContractPublicSubmitRequest(new Request(`https://ref030.invalid/players/me/contracts/${f.key}/submit`, {
    method: "POST", headers: { "x-player-session-token": "synthetic-token" }, body: JSON.stringify({ evidencePayload: payload }),
  }), { kind: "submit", contractKey: f.key }, {
    readSupabaseEnv: () => ({ ok: true, value: {} as never }), createServiceClient: () => client as never,
    hashSessionToken: async () => "synthetic-hash", resolvePlayerCountryCode: async () => null, now: () => submittedAt,
    resolvePlayerSession: async () => ({ ok: true, session: { id: crypto.randomUUID(), game_session_id: f.game, player_id: f.player,
      status: "active", expires_at: "2099-01-01T00:00:00Z", revoked_at: null },
      player: { id: f.player, display_name: "REF030", roster_label: null, status: "active" },
      gameSession: { id: f.game, name: "REF030", status: "active" } }) as never,
    renderStoryRoleplay: async () => {
      renders++;
      renderSawCommit = (await snapshot(f))["public.player_story_decisions"].length === 1;
      throw new Error("optional renderer unavailable after real commit");
    },
  });
  const body = await response.json();
  for (const id of [f.game, f.player, f.contract, f.progress]) assert.ok(!JSON.stringify(body).includes(id));
  assert.equal(client.writes, response.status === 404 ? 0 : 1);
  assert.equal(renders, response.status === 200 && keys.includes(f.key) ? 1 : 0);
  assert.equal(renderSawCommit, renders === 1);
  assert.equal(body.storyRoleplay, undefined);
  if (response.status === 200) { assert.equal(body.ok, true); assert.equal(body.progress.status, "submitted"); }
  if (response.status === 500) assert.deepEqual(body.error, { code: "contract_repository_query_failed", message: "Player Contract submission failed.", retryable: false });
  return { status: response.status, body, payload, submittedAt, errors: client.errors };
}
function committed(f: Fixture, before: State, after: State, option: string, initial = true) {
  const decisions = after["public.player_story_decisions"], adjustments = after["public.player_story_relationship_adjustments"];
  assert.equal(decisions.length, 1); assert.equal(adjustments.length, 1);
  assert.equal(decisions[0].option_key, option.trim()); assert.equal(decisions[0].rationale, rationale.trim());
  assert.equal(decisions[0].version, 1); assert.equal(decisions[0].relationship_character_key, "character.ref030.sponsor");
  if (initial) assert.equal(decisions[0].decided_at, after["public.player_contract_progress"][0].submitted_at);
  assert.equal(after["public.player_story_relationships"][0].memory.preserved, true);
  assert.equal(after["public.player_story_relationships"][0].memory.lastStoryDecisionOption, option.trim());
  assert.equal(after["public.player_story_relationships"][0].memory.storyDecisions[decisions[0].decision_key], option.trim());
  assert.equal(decisions[0].progress_id, f.progress); assert.equal(adjustments[0].source_id, decisions[0].id);
  assert.equal(adjustments[0].trust_delta, 10); assert.equal(after["public.player_story_relationships"][0].trust_score, 10);
  assert.equal(after["public.player_contract_progress"][0].status, "submitted");
  assert.equal(after["public.player_contract_progress"][0].evidence_payload.storyDecision.optionKey.trim(), decisions[0].option_key);
  assert.equal(after["public.player_story_relationships"][0].stage, "engaged");
  assert.deepEqual(after["public.player_contract_progress"][0].result_payload, { preserved: true });
  const changed = Object.keys(after).filter(t => JSON.stringify(before[t]) !== JSON.stringify(after[t])).sort();
  assert.deepEqual(changed, ["public.player_contract_progress", "public.player_story_decisions", "public.player_story_relationship_adjustments", "public.player_story_relationships"].sort());
}
async function waitFor(predicate: () => Promise<boolean>) {
  const end = Date.now() + 15000;
  while (Date.now() < end) { if (await predicate()) return; await new Promise(r => setTimeout(r, 100)); }
  throw new Error("REF030 database overlap not observed");
}
async function race(same: boolean) {
  const f = await seed(), before = await snapshot(f), name = "ref030-holder", apps = ["ref030-race-a", "ref030-race-b"];
  const held = command(`begin; select id from public.player_contract_progress where id=${q(f.progress)} for update;
    select pg_sleep(35); rollback;`, name).spawn().output();
  const pending: Array<ReturnType<typeof submit>> = [];
  try {
    await waitFor(async () => await sql(`select count(*) from pg_stat_activity where application_name=${q(name)} and wait_event='PgSleep'`) === "1");
    pending.push(submit(f, "multilateral", apps[0]), submit(f, same ? "multilateral" : "hybrid", apps[1]));
    pending.forEach(p => { void p.catch(() => {}); });
    await waitFor(async () => await sql(`select count(*) from pg_stat_activity where application_name in (${apps.map(q)}) and wait_event_type='Lock'`) === "2");
    await sql(`select pg_cancel_backend(pid) from pg_stat_activity where application_name=${q(name)}`); await held;
    const results = await Promise.all(pending), after = await snapshot(f);
    assert.deepEqual(results.map(r => r.status).sort(), same ? [200,200] : [200,500]);
    const winner = results.find(r => r.status === 200)!;
    committed(f, before, after, winner.payload.storyDecision.optionKey, !same);
    // Replays refresh progress time; the first decision time remains immutable.
    assert.ok(results.some(r => Date.parse(r.submittedAt) === Date.parse(after["public.player_story_decisions"][0].decided_at)));
    if (!same) assert.match(results.find(r => r.status === 500)!.errors.join(), /STORY_DECISION_ALREADY_COMMITTED/);
    checks[same ? "concurrentSameOption" : "concurrentConflictingOptions"] = { pass: true, observedLockWaiters: 2 };
  } finally {
    await sql(`select pg_cancel_backend(pid) from pg_stat_activity where application_name=${q(name)}`);
    await held; await Promise.allSettled(pending);
  }
}
let injection = false;
async function removeInjection() {
  if (!injection) return;
  await sql("drop trigger ref030_failure on public.player_story_relationships; drop schema ref030_test cascade;"); injection = false;
}
try {
  tables = await json(`select jsonb_agg(jsonb_build_object('schema',c.table_schema,'name',c.table_name))::text
    from information_schema.columns c join information_schema.tables t using(table_catalog,table_schema,table_name)
    where c.column_name='game_session_id' and c.table_schema in ('public','private','economy_private') and t.table_type='BASE TABLE'`);
  assert.ok(tables.length > 10); checks.snapshotTableCount = tables.length;
  for (const [i, key] of keys.entries()) {
    const f = await seed(key), before = await snapshot(f), option = i ? "defer" : "multilateral";
    const result = await submit(f, ` ${option} `); assert.equal(result.status, 200);
    const after = await snapshot(f); committed(f, before, after, option);
    const definition = await json(`select mechanical_options->${q(option)} from public.story_decision_definitions where contract_key=${q(key)}`);
    assert.deepEqual(after["public.player_story_decisions"][0].semantic_tags, definition.semanticTags.sort());
    assert.deepEqual(after["public.player_story_decisions"][0].dimensions, definition.dimensions);
    assert.deepEqual(after["public.player_contract_progress"][0].evidence_payload, result.payload);
    assert.equal((await submit(f, option)).status, 200);
    const retry = await snapshot(f);
    for (const t of Object.keys(after).filter(t => t !== 'public.player_contract_progress')) assert.deepEqual(retry[t], after[t]);
    assert.equal((await submit(f, option, "ref030-rationale", "An updated explanation retains the same committed option.")).status, 200);
    const edited = await snapshot(f);
    assert.equal(edited["public.player_story_decisions"][0].rationale, "An updated explanation retains the same committed option.");
    for (const t of Object.keys(edited).filter(t => !['public.player_contract_progress','public.player_story_decisions'].includes(t))) assert.deepEqual(edited[t], retry[t]);
    const decision = (state: State) => { const { rationale: _rationale, updated_at: _updated, ...fixed } = state["public.player_story_decisions"][0]; return fixed; };
    assert.deepEqual(decision(edited), decision(retry));
    const stable = await snapshot(f), conflict = await submit(f, i ? "relocate" : "hybrid");
    assert.equal(conflict.status, 500); assert.match(conflict.errors.join(), /STORY_DECISION_ALREADY_COMMITTED/);
    assert.deepEqual(await snapshot(f), stable);
  }
  checks.bothDefinitionsCommitRetryRationaleEditConflictAndRendererFailure = true;
  const normal = await seed("contract.ref030.normal"), normalBefore = await snapshot(normal);
  assert.equal((await submit(normal)).status, 200);
  const normalAfter = await snapshot(normal);
  for (const t of Object.keys(normalAfter).filter(t => t !== 'public.player_contract_progress')) assert.deepEqual(normalAfter[t], normalBefore[t]);
  const invalid = await seed(), invalidBefore = await snapshot(invalid), rejected = await submit(invalid, "unavailable_option");
  assert.equal(rejected.status, 500); assert.match(rejected.errors.join(), /STORY_DECISION_OPTION_INVALID/);
  assert.deepEqual(await snapshot(invalid), invalidBefore);
  const other = await seed(), otherBefore = await snapshot(other);
  assert.equal((await submit({ ...normal, game: other.game, player: other.player })).status, 404);
  assert.deepEqual(await snapshot(other), otherBefore); assert.deepEqual(await snapshot(invalid), invalidBefore);
  checks.normalAndRejectedSubmissionNoExtraEffects = true;
  await sql(`create schema ref030_test; create function ref030_test.fail_adjustment() returns trigger language plpgsql as $f$ begin
    if new.game_session_id=${q(invalid.game)}::uuid then
      if not exists(select 1 from public.player_story_decisions where game_session_id=new.game_session_id and player_id=new.player_id) or new.trust_score <> 10 then raise exception 'REF030_FAILURE_POINT_NOT_REACHED'; end if;
      raise exception 'REF030_INJECTED_AFTER_DECISION'; end if; return new; end $f$;
    create trigger ref030_failure after update on public.player_story_relationships for each row execute function ref030_test.fail_adjustment();`);
  injection = true;
  const failed = await submit(invalid); assert.equal(failed.status, 500); assert.match(failed.errors.join(), /REF030_INJECTED_AFTER_DECISION/);
  assert.deepEqual(await snapshot(invalid), invalidBefore); await removeInjection();
  assert.equal((await submit(invalid)).status, 200); committed(invalid, invalidBefore, await snapshot(invalid), "multilateral");
  checks.triggerRollbackAndRetry = true;
  await race(true); await race(false); evidence.status = "pass";
} catch (error) { evidence.status = "fail"; throw error; }
finally {
  try { await removeInjection(); }
  finally { await Deno.mkdir("/tmp/ref018", { recursive: true });
    await Deno.writeTextFile("/tmp/ref018/ref030-database-qualification.json", JSON.stringify(evidence, null, 2) + "\n"); }
}
console.log(JSON.stringify(evidence, null, 2));

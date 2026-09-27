import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Disposable qualification only: real Auth, PostgREST, cryptography and SQL.
// The retained Edge hop is dispatched in-process; no hosted environment is used.
const database = Deno.env.get("DATABASE_URL") || "";
const location = new URL(database);
assert.equal(Deno.env.get("REF010_DISPOSABLE_DATABASE"), "1");
assert.ok(["postgres:", "postgresql:"].includes(location.protocol));
assert.ok(["127.0.0.1", "localhost"].includes(location.hostname));
assert.equal(location.port, "54322");
assert.equal(location.pathname, "/postgres");
const variant = Deno.env.get("REF010_VARIANT") || "";
assert.ok(["baseline", "current"].includes(variant));
const root = resolve(Deno.env.get("REF010_SOURCE_ROOT") || ".");
const sourceSha = Deno.env.get("REF010_SOURCE_SHA") || "";
assert.match(sourceSha, /^[0-9a-f]{40}$/);
const config = JSON.parse(await Deno.readTextFile(Deno.env.get("REF010_LOCAL_CONFIG") || ""));
const api = String(config.API_URL);
const apiLocation = new URL(api);
assert.equal(apiLocation.protocol, "http:");
assert.ok(["127.0.0.1", "localhost"].includes(apiLocation.hostname));
assert.equal(apiLocation.port, "54321");
const anon = String(config.ANON_KEY || ""), serviceKey = String(config.SERVICE_ROLE_KEY || "");
assert.ok(anon.length > 30 && serviceKey.length > 30, "Disposable local keys are required");
for (const key of ["SUPABASE_PUBLISHABLE_KEY", "PUBLISHABLE_KEY", "SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_SECRET_KEY", "SECRET_KEY", "SUPABASE_SECRET_KEYS"]) Deno.env.delete(key);
for (const [key, value] of Object.entries({
  SUPABASE_URL: api, SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_ROLE_KEY: serviceKey,
  ECONOVARIA_PLAYER_CREDENTIAL_PEPPER: "ref010_disposable_credential_pepper_not_a_hosted_secret_2026",
  ECONOVARIA_RATE_LIMIT_HMAC_SECRET: "abcdefghijklmnopqrstuvwxyz_ABCDEFGHIJKLMNOPQRSTUVWXYZ_0123456789",
  ECONOVARIA_TRUSTED_CLIENT_IP_HEADER: "x-real-ip",
  ECONOVARIA_ALLOWED_ORIGINS: "http://127.0.0.1:4173",
})) Deno.env.set(key, value);
const decoder = new TextDecoder();
const literal = (value: unknown) => `'${String(value).replaceAll("'", "''")}'`;
const identifier = (value: string) => `"${value.replaceAll('"', '""')}"`;
const load = (file: string) => import(pathToFileURL(resolve(root, file)).href);
const rawFetch = globalThis.fetch;
type Handler = (request: Request) => Promise<Response>;
let registered: Handler | undefined;
const originalServe = Deno.serve;
try {
  (Deno as any).serve = (handler: Handler) => { registered = handler; return {}; };
  await load("backend/supabase/functions/classroom-api/index.ts");
} finally { Deno.serve = originalServe; }
assert.ok(registered, "Baseline dispatch must be captured");
const classroom = registered as unknown as Handler;
try {
  registered = undefined;
  (Deno as any).serve = (handler: Handler) => { registered = handler; return {}; };
  await load("backend/supabase/functions/admin-api/index.ts");
} finally { Deno.serve = originalServe; }
assert.ok(registered, "Real Admin entrypoint must be captured");
const admin = registered as unknown as Handler;
const { createServiceClient } = await load("backend/supabase/functions/_shared/econovariaAuth.ts");
const { createPlayerCredentialMaterial, verifyPlayerCredential } = await load("backend/src/security/playerCredentialHashing.ts");
const { sha256Hex } = await load("backend/src/platform/supabase/edgeCrypto.ts");
const { handlePlayerLoginRequest } = await load("backend/src/domains/players/api/playerLoginHttpHandler.ts");
const { handlePlayerSessionBootstrapRequest } = await load("backend/src/domains/players/api/playerSessionBootstrapHttpHandler.ts");
const environment = { supabaseUrl: api, supabaseAnonKey: anon, supabaseServiceRoleKey: serviceKey };
const service = createServiceClient(environment);
const trace: Array<{ path: string; method: string }> = [];
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const request = new Request(input, init), url = new URL(request.url);
  assert.equal(url.origin, apiLocation.origin, "Only disposable local requests are allowed");
  trace.push({ path: url.pathname, method: request.method });
  if (url.pathname.startsWith("/functions/v1/classroom-api/")) return classroom(request);
  return rawFetch(request);
};
const cases: Record<string, unknown> = {};
const evidence: Record<string, unknown> = { task: "REF-010", sourceSha, variant,
  transport: "captured real Admin/Staff handlers with real loopback Auth and PostgREST", productionTouched: false,
  status: "running", cases };
let phase = "fixture setup";
async function sql(statement: string): Promise<string> {
  const result = await new Deno.Command("psql", { args: [database, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", statement],
    env: { PGOPTIONS: "-c statement_timeout=45000 -c lock_timeout=30000" }, stdout: "piped", stderr: "piped" }).output();
  const failureCode = decoder.decode(result.stderr).match(/ERROR:\s+([A-Z][A-Z0-9_]{4,})/)?.[1] || "REDACTED_SQL_ERROR";
  assert.ok(result.code === 0, `${phase}: disposable SQL failed (${failureCode})`);
  return decoder.decode(result.stdout).trim();
}
const jsonSql = async (statement: string) => JSON.parse(await sql(statement));
let tables: Array<{ table_schema: string; table_name: string }> = [];
type Fixture = { game: string; otherGame: string; staff: string; player: string; otherPlayer: string;
  authUser: string; token: string; ip: string; joinCode: string; playerIdentifier: string; code: string };
let fixtureNumber = 0;
async function checkedFetch(path: string, method: string, body: unknown, key = serviceKey, bearer = key) {
  const response = await rawFetch(`${api}${path}`, { method,
    headers: { apikey: key, authorization: `Bearer ${bearer}`, "content-type": "application/json" },
    body: JSON.stringify(body) });
  assert.ok(response.ok, `${phase}: local Auth request returned ${response.status}`);
  return response.json();
}
async function setCredential(f: Fixture, code: string, player = f.player, playerIdentifier = f.playerIdentifier) {
  const material = await createPlayerCredentialMaterial(code);
  const result = await service.rpc("set_player_identity_and_access_credential_v2", {
    p_game_session_id: f.game, p_player_id: player, p_player_identifier: playerIdentifier,
    p_player_identifier_normalized: playerIdentifier, p_lookup_digest: material.lookupDigest,
    p_credential_version: material.credentialVersion, p_credential_salt: material.salt,
    p_credential_verifier: material.verifier, p_credential_iterations: material.iterations,
  });
  assert.ok(!result.error, `${phase}: fixture credential must be created by its existing RPC`);
}
async function seed(): Promise<Fixture> {
  const f = Object.fromEntries(["game", "otherGame", "staff", "player", "otherPlayer"].map(k => [k, crypto.randomUUID()])) as Fixture;
  f.ip = `192.0.2.${++fixtureNumber}`; f.joinCode = `ECO-RESET-TEST-${String(fixtureNumber).padStart(3, "0")}`;
  f.playerIdentifier = "RFID-010"; f.code = "REF010-OLD";
  const email = `ref010-${crypto.randomUUID()}@example.test`, password = `Ref010!${crypto.randomUUID()}`;
  const user = await checkedFetch("/auth/v1/admin/users", "POST", { email, password, email_confirm: true,
    app_metadata: { econovaria_role: "game_admin", permission_version: 1, security_version: 1 } });
  f.authUser = user.id;
  assert.ok(f.authUser, "A real disposable Auth user is required");
  const joinHash = await sha256Hex(f.joinCode);
  await sql(`begin;
    insert into public.staff_users (id,supabase_auth_user_id,email,display_name,status,role,mfa_required)
      values (${literal(f.staff)},${literal(f.authUser)},${literal(email)},'REF010 Staff','active','game_admin',false);
    insert into public.game_sessions (id,owner_staff_user_id,name,status,lifecycle_state)
      values (${literal(f.game)},${literal(f.staff)},'REF010 Game','active','active');
    insert into public.game_settings (game_session_id,stock_market_window)
      values (${literal(f.game)},'{"timezone":"UTC"}'::jsonb);
    update public.game_sessions set provisioning_status='ready',
      provisioning_pack_id='econovaria.beta-seed-pack.v1', provisioning_pack_version='1.0.0-beta',
      provisioning_pack_sha256=repeat('a',64), provisioning_source_game_session_id=id,
      provisioned_at=clock_timestamp(), game_join_code=${literal(f.joinCode)},
      game_join_code_hash=${literal(joinHash)}, game_join_code_status='active'
      where id=${literal(f.game)};
    insert into public.game_sessions (id,owner_staff_user_id,name,status,lifecycle_state)
      values (${literal(f.otherGame)},${literal(f.staff)},'REF010 Other Game','active','active');
    insert into public.players (id,game_session_id,display_name,player_identifier,player_identifier_normalized,status)
      values (${literal(f.player)},${literal(f.game)},'REF010 Player',${literal(f.playerIdentifier)},${literal(f.playerIdentifier)},'active'),
      (${literal(f.otherPlayer)},${literal(f.otherGame)},'REF010 Other Player','RFID-OTHER','RFID-OTHER','active');
    commit;`);
  const claims = await jsonSql(`select jsonb_build_object('econovaria_role',role,'permission_version',permission_version,
    'security_version',security_version)::text from public.staff_users where id=${literal(f.staff)}`);
  await checkedFetch(`/auth/v1/admin/users/${f.authUser}`, "PUT", { app_metadata: claims });
  const session = await checkedFetch("/auth/v1/token?grant_type=password", "POST", { email, password }, anon);
  f.token = session.access_token;
  assert.ok(f.token, "Real Staff sign-in must produce a token");
  await setCredential(f, f.code);
  const banking = await service.rpc("ensure_player_banking_accounts_v1", {
    p_game_session_id: f.game, p_player_id: f.player, p_currency_code: "ECO",
  });
  assert.ok(!banking.error, "Fixture Checking/Savings accounts must use existing Banking authority");
  return f;
}
async function snapshot(f: Fixture) {
  const selects = tables.map(t => `select ${literal(`${t.table_schema}.${t.table_name}`)} as name,
    coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]'::jsonb) as rows
    from ${identifier(t.table_schema)}.${identifier(t.table_name)} r where game_session_id in (${literal(f.game)}::uuid,${literal(f.otherGame)}::uuid)`);
  return jsonSql(`select jsonb_object_agg(name,rows)::text from (${selects.join(" union all ")}) s`);
}
const stateDigest = async (state: unknown) => sha256Hex(JSON.stringify(state));
async function unchanged(before: unknown, after: unknown, label: string) {
  assert.equal(await stateDigest(after), await stateDigest(before), `${label}: scoped persistent state changed`);
}
function delta(before: Record<string, any[]>, after: Record<string, any[]>) {
  return Object.fromEntries(Object.keys(after).sort().map(k => [k, after[k].length - before[k].length]).filter(([, n]) => n !== 0));
}
async function reset(f: Fixture, body: unknown, expectedStatus: number, options: { player?: string; raw?: string; token?: string } = {}) {
  const start = trace.length;
  const response = await admin(new Request(`${api}/functions/v1/admin-api/games/${f.game}/players/${options.player ?? f.player}/access-code/reset`, {
    method: "POST", headers: { authorization: `Bearer ${options.token ?? f.token}`, "content-type": "application/json",
      origin: "http://127.0.0.1:4173", "x-real-ip": f.ip, "x-request-id": "ref010-stable-request", "idempotency-key": "ref010-stable-retry" },
    body: options.raw ?? JSON.stringify(body),
  }));
  const text = await response.text(), result = JSON.parse(text), calls = trace.slice(start);
  assert.equal(response.status, expectedStatus, `${phase}: reset returned ${response.status}/${result.code ?? result.error?.code ?? "no_error_code"}`);
  const hops = calls.filter(c => c.path.startsWith("/functions/v1/classroom-api/")).length;
  if (variant === "current") assert.equal(hops, 0, "Local reset must not use the retained Edge hop");
  for (const value of [f.game, f.player, f.staff, f.token, serviceKey, anon]) assert.ok(!text.includes(value), "Internal identity or token exposed in reset response");
  if (expectedStatus === 200) {
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
    assert.equal(response.headers.get("access-control-allow-origin"), "http://127.0.0.1:4173");
    assert.equal(calls.filter(c => c.path === "/auth/v1/user").length, 2, "Both existing Staff authentication checks must remain");
    assert.equal(calls.filter(c => c.path.endsWith("/consume_request_rate_limits_v1")).length, 2, "Both existing limiter checks must remain");
    if (variant === "baseline") assert.equal(hops, 1, "Baseline must exercise the real forwarding branch");
  }
  return { body: result, calls };
}
async function login(f: Fixture, code: string, expectedStatus: number, playerIdentifier = f.playerIdentifier) {
  const response = await handlePlayerLoginRequest(new Request(`${api}/players/login`, { method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": f.ip, "x-econovaria-device-id": crypto.randomUUID() },
    body: JSON.stringify({ gameJoinCode: f.joinCode, playerIdentifier, accessCode: code }) }), { createServiceClient });
  const body = await response.json();
  assert.equal(response.status, expectedStatus, `${phase}: Player login returned ${response.status}/${body.error?.code ?? "no_error_code"}`);
  return body.session?.token as string | undefined;
}
async function bootstrap(token: string, expectedStatus: number) {
  const response = await handlePlayerSessionBootstrapRequest(new Request(`${api}/players/session`, {
    headers: { "x-player-session-token": token } }), { createServiceClient });
  assert.equal(response.status, expectedStatus, `${phase}: protected bootstrap status mismatch`);
  await response.body?.cancel();
}
async function activeCredential(f: Fixture, code: string, expectedCount: number) {
  const state = await snapshot(f);
  const rows = state["public.player_access_credentials"].filter((r: any) => r.player_id === f.player);
  assert.equal(rows.length, expectedCount, "Credential effect count mismatch");
  const active = rows.filter((r: any) => r.status === "active");
  assert.equal(active.length, 1, "Exactly one credential may remain active");
  assert.equal(active[0].credential_iterations, 600000);
  assert.equal(active[0].credential_version, "pbkdf2-sha256-v2");
  assert.ok(await verifyPlayerCredential(code, active[0]), "Actual retained cryptographic verifier rejected replacement code");
  return state;
}
try {
  tables = await jsonSql(`select jsonb_agg(jsonb_build_object('table_schema',c.table_schema,'table_name',c.table_name) order by c.table_schema,c.table_name)::text
    from information_schema.columns c join information_schema.tables t using(table_catalog,table_schema,table_name)
    where c.column_name='game_session_id' and c.table_schema in ('public','economy_private') and t.table_type='BASE TABLE'`);
  evidence.snapshotTableCount = tables.length;
  assert.ok(tables.length > 100, "Complete scoped table census is required");
  phase = "successful rotation";
  {
    const f = await seed(), oldSession = (await login(f, f.code, 200))!;
    await bootstrap(oldSession, 200);
    const before = await snapshot(f), result = await reset(f, { accessCode: "REF010-NEW" }, 200);
    assert.equal(result.body.sessionsRevoked, true);
    assert.equal(result.body.accessCode.studentCode, "REF010-NEW");
    assert.equal(result.calls.filter(c => c.path.endsWith("/set_player_identity_and_access_credential_v2")).length, 1);
    const after = await activeCredential(f, "REF010-NEW", 2);
    await login(f, f.code, 401); await bootstrap(oldSession, 401);
    await bootstrap((await login(f, "REF010-NEW", 200))!, 200);
    cases.rotation = { passed: true, effects: delta(before, after), oldCodeDenied: true, oldSessionDenied: true, newLoginAndBootstrap: true };
  }
  phase = "identifier-only update";
  {
    const f = await seed(), oldSession = (await login(f, f.code, 200))!, before = await snapshot(f);
    const result = await reset(f, { playerIdentifier: "RFID-UPDATED", accessCode: "   " }, 200);
    assert.equal(result.body.sessionsRevoked, false); assert.equal(result.body.accessCode.studentCode, null);
    const after = await snapshot(f);
    for (const table of ["public.player_access_credentials", "public.player_sessions"]) await unchanged(before[table], after[table], phase);
    await bootstrap(oldSession, 200); await login(f, f.code, 200, "RFID-UPDATED");
    cases.identifierOnly = { passed: true, effects: delta(before, after), sessionsPreserved: true };
  }
  phase = "another game's Player";
  {
    const f = await seed(), before = await snapshot(f);
    const result = await reset(f, { accessCode: "REF010-NEW" }, 404, { player: f.otherPlayer });
    assert.equal(result.body.error.code, "player_not_found");
    await unchanged(before, await snapshot(f), phase);
    cases.crossGameDenial = { passed: true, noScopedEffects: true };
  }
  phase = "revoked Staff security generation";
  {
    const f = await seed();
    const revoke = await service.rpc("complete_staff_password_reset_security_v2", { p_auth_user_id: f.authUser });
    // Retain the failing gate. Only schema-level diagnostics are persisted.
    const sqlstate = String(revoke.error?.code ?? "");
    const typeMismatch = String(revoke.error?.details ?? "").match(
      /Returned type (integer|bigint) does not match expected type (integer|bigint) in column ([0-9]+)\./,
    );
    evidence.staffRevocationDiagnostic = {
      sqlstate: /^[A-Z0-9]{5}$/.test(sqlstate) ? sqlstate : null,
      structureMismatch: revoke.error?.message === "structure of query does not match function result type",
      returnedType: typeMismatch?.[1] ?? null,
      expectedType: typeMismatch?.[2] ?? null,
      resultColumn: typeMismatch ? Number(typeMismatch[3]) : null,
    };
    assert.ok(!revoke.error, "Existing Staff security-generation revocation command must succeed");
    const before = await snapshot(f), result = await reset(f, { accessCode: "REF010-NEW" }, 403);
    assert.equal(result.body.code, "staff_claims_outdated");
    await unchanged(before, await snapshot(f), phase); await login(f, f.code, 200);
    cases.revokedStaffGeneration = { passed: true, noScopedEffects: true };
  }
  phase = "post-revocation persistence failure and retry";
  {
    const f = await seed(), oldSession = (await login(f, f.code, 200))!;
    await sql(`create schema if not exists ref010_test;
      create or replace function ref010_test.reject_credential() returns trigger language plpgsql as $f$
      begin if new.game_session_id=${literal(f.game)}::uuid then raise exception 'REF010_INJECTED_PERSISTENCE_FAILURE'; end if; return new; end $f$;
      create trigger ref010_injected_failure before insert on public.player_access_credentials for each row execute function ref010_test.reject_credential();`);
    const before = await snapshot(f), result = await reset(f, { accessCode: "REF010-NEW" }, 500);
    assert.equal(result.body.error.code, "player_identity_update_failed");
    await unchanged(before, await snapshot(f), phase); await bootstrap(oldSession, 200); await login(f, f.code, 200);
    await sql("drop trigger ref010_injected_failure on public.player_access_credentials; drop schema ref010_test cascade;");
    await reset(f, { accessCode: "REF010-NEW" }, 200); await activeCredential(f, "REF010-NEW", 2); await bootstrap(oldSession, 401);
    cases.rollbackAndRetry = { passed: true, completeRollback: true, retrySucceeded: true };
  }
  phase = "credential conflict";
  {
    const f = await seed(), other = crypto.randomUUID();
    await sql(`insert into public.players (id,game_session_id,display_name,player_identifier,player_identifier_normalized,status)
      values (${literal(other)},${literal(f.game)},'REF010 Conflict Player','RFID-CONFLICT','RFID-CONFLICT','active');`);
    await setCredential(f, "REF010-CONFLICT", other, "RFID-CONFLICT");
    const before = await snapshot(f), result = await reset(f, { accessCode: "REF010-CONFLICT" }, 409);
    assert.equal(result.body.error.code, "player_access_code_conflict");
    await unchanged(before, await snapshot(f), phase); await login(f, f.code, 200);
    cases.conflictingCredential = { passed: true, noScopedEffects: true };
  }
  phase = "existing repeated-key semantics";
  {
    const f = await seed();
    for (const [code, count] of [["REF010-NEW", 2], ["REF010-NEW", 3], ["REF010-CHANGED", 4]] as const) {
      const result = await reset(f, { accessCode: code }, 200);
      assert.equal(result.calls.filter(c => c.path.endsWith("/set_player_identity_and_access_credential_v2")).length, 1);
      await activeCredential(f, code, count);
    }
    await login(f, "REF010-NEW", 401); await login(f, "REF010-CHANGED", 200);
    cases.repeatedTransportKeys = { passed: true, calls: 3, activeCredentials: 1, replayReceiptInvented: false };
  }
  phase = "malformed transport normalization";
  {
    const f = await seed(), before = await snapshot(f);
    const result = await reset(f, {}, 200, { raw: "{" });
    assert.equal(result.body.sessionsRevoked, false);
    const after = await snapshot(f);
    for (const table of ["public.player_access_credentials", "public.player_sessions"]) await unchanged(before[table], after[table], phase);
    cases.malformedTransport = { passed: true, identifierOnlyPreserved: true };
  }
  evidence.status = "pass";
} catch (error) {
  evidence.status = "fail";
  evidence.failedPhase = phase;
  // Never retain database rows, Auth tokens, supplied codes, salts or verifiers.
  evidence.failureClass = error instanceof Error ? error.name : "UnknownError";
  if (error instanceof assert.AssertionError) evidence.failureMessage = error.message.slice(0, 500);
  console.error(`REF-010 ${variant} failed at ${phase}; ${evidence.failureClass}.`);
} finally {
  globalThis.fetch = rawFetch;
  await Deno.mkdir("/tmp/ref010", { recursive: true });
  await Deno.writeTextFile(`/tmp/ref010/${variant}.json`, JSON.stringify(evidence, null, 2) + "\n");
}
console.log(`REF-010 ${variant}: ${evidence.status}; ${Object.keys(cases).length} real-service cases; ${tables.length} scoped tables.`);
if (evidence.status !== "pass") Deno.exit(1);

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const MIGRATION = "backend/supabase/migrations/20261010040738_economic_core_request_claims_v1.sql";
export const OLD_ROLE = "coalesce(current_setting('request.jwt.claim.role', true), '')";
export const NEW_ROLE = `(case
    when nullif(current_setting('request.jwt.claims', true), '') is not null
      then coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
    else coalesce(current_setting('request.jwt.claim.role', true), '')
  end)`;
const TARGETS = ["public.sync_game_item_catalog_v2(uuid,jsonb)", "public.validate_economic_asset_core_v2(uuid)"];
const STAFF = "10000000-0000-4000-8000-000000000001";
const MISSING = "00000000-0000-4000-8000-000000000000";
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
export function assertDisposable(config, environment) {
  assert.equal(environment.ECONOMIC_CORE_DISPOSABLE_TEST, "1", "Explicit disposable qualification required");
  assert.equal(environment.CI, "true", "Exclusive disposable CI runner required");
  assert.equal(config.DB_URL, "postgresql://postgres:postgres@127.0.0.1:54322/postgres");
  assert.equal(config.API_URL, "http://127.0.0.1:54321");
  assert.equal(environment.DATABASE_URL, config.DB_URL);
  assert.match(environment.RELEASE_COMMIT || "", /^[0-9a-f]{40}$/);
  assert.ok(/^sb_secret_[A-Za-z0-9_-]+$/.test(config.SECRET_KEY || ""), "Local secret key unavailable");
  assert.ok(/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.PUBLISHABLE_KEY || ""), "Local publishable key unavailable");
}
async function main() {
  // Never read a hosted credential or accept a URL supplied by a caller.
  assert.equal(process.env.ECONOMIC_CORE_DISPOSABLE_TEST, "1");
  assert.equal(process.env.CI, "true");
  const config = JSON.parse(execFileSync("npx", ["--no-install", "supabase", "status", "--workdir", "backend", "-o", "json"], { encoding: "utf8", timeout: 15000, stdio: ["ignore", "pipe", "pipe"] }));
  assertDisposable(config, process.env);
  assert.equal(execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), process.env.RELEASE_COMMIT);
  const apiDatabase = new URL(config.DB_URL);
  apiDatabase.username = "authenticator"; // Same local password configured by the pinned CLI for PostgREST.
  const sql = (query, allowFailure = false, database = config.DB_URL) => {
    const result = spawnSync("psql", [database, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"], {
      input: query, encoding: "utf8", timeout: 120000, maxBuffer: 8 * 1024 * 1024,
    });
    assert.ifError(result.error);
    if (!allowFailure) assert.equal(result.status, 0, "Disposable SQL failed; no qualification credit");
    return result;
  };
  assert.equal(sql("select session_user;", false, apiDatabase.href).stdout.trim(), "authenticator");
  const json = query => JSON.parse(sql(query).stdout.trim());
  const definitions = () => json(`select jsonb_agg(to_jsonb(p) order by p.oid) from pg_proc p where p.oid in (${TARGETS.map(x => `${literal(x)}::regprocedure`).join(",")});`);
  const installed = definitions();
  assert.equal(installed.length, 2);
  for (const row of installed) assert.ok(row.prosrc.includes(NEW_ROLE));

  // Real SQL execution under the API session principal, including SECURITY DEFINER.
  const roleCases = [
    ["modern service", '{"role":"service_role"}', "", "ECONOMIC_CORE_GAME_NOT_FOUND"],
    ["modern overrides legacy", '{"role":"service_role"}', "anon", "ECONOMIC_CORE_GAME_NOT_FOUND"],
    ["legacy compatibility", "", "service_role", "ECONOMIC_CORE_GAME_NOT_FOUND"],
    ["missing", "", "", "ECONOMIC_CORE_SERVICE_ROLE_REQUIRED"],
    ["conflict", '{"role":"authenticated"}', "service_role", "ECONOMIC_CORE_SERVICE_ROLE_REQUIRED"],
    ["missing modern role", "{}", "service_role", "ECONOMIC_CORE_SERVICE_ROLE_REQUIRED"],
    ["untrusted metadata", '{"user_metadata":{"role":"service_role"}}', "service_role", "ECONOMIC_CORE_SERVICE_ROLE_REQUIRED"],
    ["array", "[]", "service_role", "ECONOMIC_CORE_SERVICE_ROLE_REQUIRED"],
    ["null", "null", "service_role", "ECONOMIC_CORE_SERVICE_ROLE_REQUIRED"],
    ["malformed", "{", "service_role", "22P02"],
  ];
  for (const signature of TARGETS) {
    const call = signature.includes("jsonb") ? `public.sync_game_item_catalog_v2('${MISSING}', null)` : `public.validate_economic_asset_core_v2('${MISSING}')`;
    for (const [label, claims, legacy, expected] of roleCases) {
      const result = sql(`begin; set local role service_role;
        select set_config('request.jwt.claims', ${literal(claims)}, true);
        select set_config('request.jwt.claim.role', ${literal(legacy)}, true);
        select ${call}; rollback;`, true, apiDatabase.href);
      if (!result.stderr.includes(expected)) console.error(JSON.stringify({ phase: "role-matrix", signature, label, databaseError: result.stderr.match(/ERROR:\s+([0-9A-Z]{5}):\s*([^\n]*)/)?.slice(1) || [] }));
      assert.notEqual(result.status, 0, label);
      assert.ok(result.stderr.includes(expected), `${signature}: ${label} failed`);
    }
    for (const role of ["anon", "authenticated"]) {
      const result = sql(`begin; set local role ${role}; select ${call}; rollback;`, true, apiDatabase.href);
      assert.notEqual(result.status, 0);
      assert.ok(result.stderr.includes("42501"), `${role} must not execute the privileged function`);
    }
  }
  console.log(JSON.stringify({ phase: "database-role-matrix", passed: 24 }));
  const rpc = async (name, body, key = config.SECRET_KEY) => {
    const response = await fetch(`${config.API_URL}/rest/v1/rpc/${name}`, {
      method: "POST", headers: { "Content-Type": "application/json", apikey: key },
      body: JSON.stringify(body), signal: AbortSignal.timeout(120000), redirect: "error",
    });
    return { status: response.status, data: await response.json() };
  };
  assert.ok([401, 403].includes((await rpc("sync_game_item_catalog_v2", { p_game_session_id: MISSING }, config.PUBLISHABLE_KEY)).status));
  const primary = randomBytes(32).toString("hex"), legacy = randomBytes(32).toString("hex");
  sql(`insert into public.purchase_codes(code_hash, code_hash_version, status, max_redemptions, redeemed_count)
       values (${literal(primary)}, 'hmac-sha256-v2', 'active', 3, 0);`);
  const request = (key, name) => ({ p_staff_user_id: STAFF, p_purchase_code_hash: `v2.${primary}.${legacy}`,
    p_game_name: name, p_game_settings: { difficulty_preset: "hard", stock_market_window: { timezone: "Asia/Seoul" } },
    p_request_metadata: { request_id: key, source: "disposable-claims-qualification" } });
  // Full-table snapshots are acceptable only in this exclusive synthetic database.
  const snapshot = () => json(`select jsonb_build_object(
    'codes', (select jsonb_agg(to_jsonb(t) order by id) from public.purchase_codes t),
    'games', (select jsonb_agg(to_jsonb(t) order by id) from public.game_sessions t),
    'entitlements', (select jsonb_agg(to_jsonb(t) order by id) from public.entitlements t),
    'items', (select jsonb_agg(to_jsonb(t) order by id) from public.game_items t),
    'balances', (select coalesce(jsonb_agg(to_jsonb(t) order by bank_account_id), '[]') from public.account_balances t));`);
  const input = request("claims.redeem.success.001", "Claims HTTP acceptance");
  const before = snapshot();
  // Reproduce the historical predicate on the actual HTTP path, not as postgres.
  // This is an isolated test database change, never a historical migration edit.
  for (const signature of TARGETS) {
    sql(`do $test$ declare d text := pg_get_functiondef(${literal(signature)}::regprocedure); begin
      if position(${literal(NEW_ROLE)} in d) = 0 then raise exception 'missing corrected guard'; end if;
      execute replace(d, ${literal(NEW_ROLE)}, ${literal(OLD_ROLE)}); end $test$;`);
  }
  const broken = await rpc("redeem_purchase_code_for_game", input);
  console.log(JSON.stringify({ phase: "old-guard-http", status: broken.status, code: broken.data?.code }));
  assert.equal(broken.status, 403);
  assert.equal(broken.data.code, "42501");
  assert.equal(broken.data.message, "ECONOMIC_CORE_SERVICE_ROLE_REQUIRED");
  assert.deepEqual(snapshot(), before, "Failed pre-fix provisioning must not consume a code or retain game effects");
  sql(readFileSync(MIGRATION, "utf8"));
  assert.deepEqual(definitions(), installed, "Migration must restore the exact qualified definitions and metadata");
  const created = await rpc("redeem_purchase_code_for_game", input);
  console.log(JSON.stringify({ phase: "corrected-guard-http", status: created.status, code: created.data?.code }));
  assert.equal(created.status, 200, "Real PostgREST provisioning failed");
  assert.equal(created.data.length, 1);
  assert.equal(created.data[0].redeemed_count, 1);
  const gameId = created.data[0].game_session_id;
  assert.match(gameId, /^[0-9a-f-]{36}$/);
  const ready = await rpc("verify_provisioned_game_v1", { p_game_session_id: gameId, p_staff_user_id: STAFF });
  assert.equal(ready.status, 200);
  assert.equal(ready.data.ready, true);
  const after = snapshot();
  for (const table of ["games", "items", "balances"]) for (const row of before[table] || [])
    assert.ok((after[table] || []).some(candidate => JSON.stringify(candidate) === JSON.stringify(row)), `Existing ${table} changed during provisioning`);
  const replay = await rpc("redeem_purchase_code_for_game", input);
  assert.equal(replay.status, 200);
  for (const key of ["game_session_id", "entitlement_id", "purchase_code_id", "purchase_code_status", "redeemed_count", "max_redemptions"]) assert.equal(replay.data[0][key], created.data[0][key]);
  assert.deepEqual(snapshot(), after, "Replay must not add code consumption or game state");
  // Fail after provisioning and code update, proving the outer transaction rolls back.
  sql(`create function public.claims_test_reject_entitlement() returns trigger language plpgsql as $t$
    begin raise exception 'CLAIMS_TEST_INJECTED_FAILURE'; end $t$;
    create trigger claims_test_reject_entitlement before insert on public.entitlements
    for each row execute function public.claims_test_reject_entitlement();`);
  const failed = await rpc("redeem_purchase_code_for_game", request("claims.redeem.failure.001", "Claims HTTP rollback"));
  assert.notEqual(failed.status, 200);
  assert.equal(failed.data.message, "CLAIMS_TEST_INJECTED_FAILURE");
  assert.deepEqual(snapshot(), after, "Post-provisioning failure must roll back code, entitlement and game effects");
  sql("drop trigger claims_test_reject_entitlement on public.entitlements; drop function public.claims_test_reject_entitlement();");
  console.log(JSON.stringify({ source: process.env.RELEASE_COMMIT, roleCases: 24, actualPostgrest: true,
    oldGuardReproduced: true, provisioning: true, replay: true, failureRollback: true, liveAccess: false }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(JSON.stringify({ error: "Economic-core disposable qualification FAILED", frames: String(error.stack || "").split("\n").filter(line => line.trim().startsWith("at ")).slice(0, 4) })); process.exitCode = 1; });
}

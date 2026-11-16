import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { runPasswordResetCandidateChecks } from "./password-reset-transition-regression.mjs";

const migrationPath = "backend/supabase/migrations/20261103082647_cast_staff_password_reset_permission_version_v2.sql";
const defaultRun = (command, args, input) => execFileSync(command, args, {
  input, encoding: "utf8", timeout: 30000, maxBuffer: 8 * 1024 * 1024,
  stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
}).trim();

export function attestPasswordDatabase(env = process.env, run = defaultRun) {
  assert.equal(env.GITHUB_ACTIONS, "true", "Disposable CI required");
  assert.equal(env.GITHUB_EVENT_NAME, "pull_request", "PR-only qualification");
  assert.equal(env.GITHUB_WORKFLOW, "Password Reset Transition Qualification");
  assert.equal(env.GITHUB_JOB, "password-reset");
  assert.equal(env.PASSWORD_RESET_FULL_SCHEMA, "1", "Full-schema execution must be explicit");
  for (const key of ["DOCKER_HOST", "DOCKER_CONTEXT", "DATABASE_URL", "PGHOST", "PGPORT", "PGSERVICE", "PGOPTIONS", "PGPASSWORD", "PGPASSFILE", "PGUSER"]) {
    assert(!env[key], `Database override forbidden: ${key}`);
  }
  assert.equal(realpathSync(process.cwd()), realpathSync(env.GITHUB_WORKSPACE));
  assert.match(env.PASSWORD_RESET_SOURCE_SHA ?? "", /^[a-f0-9]{40}$/);
  assert.equal(run("git", ["rev-parse", "HEAD"]), env.PASSWORD_RESET_SOURCE_SHA);
  assert.equal(JSON.parse(run("docker", ["context", "inspect"]))[0].Endpoints.docker.Host, "unix:///var/run/docker.sock");
  const container = JSON.parse(run("docker", ["inspect", "supabase_db_econovaria"]))[0];
  assert(container.State.Running && /^[a-f0-9]{64}$/.test(container.Id));
  assert.equal(container.Config.Labels["com.supabase.cli.project"], "econovaria");
  assert.match(container.Config.Image, /^(public\.ecr\.aws|ghcr\.io)\/supabase\/postgres:17\.6\.1\.143$/);
  assert(Date.parse(container.Created) >= statSync(".git").mtimeMs, "Pre-existing database forbidden");
  assert(container.NetworkSettings.Ports["5432/tcp"].some((port) => port.HostPort === "54322"));
  return { containerId: container.Id, image: container.Config.Image };
}

export async function qualifyFullSchema(t) {
  const binding = attestPasswordDatabase(); // Missing server/attestation is a failure, never a skip.
  const sql = (text) => defaultRun("docker", ["exec", "-i", binding.containerId, "psql", "-U", "postgres", "-d", "postgres", "-XqAt", "-v", "ON_ERROR_STOP=1"], text);
  const identitySql = "select json_build_object('system',(pg_control_system()).system_identifier::text,'database',current_database(),'oid',(select oid from pg_database where datname=current_database()))::text;";
  const identity = JSON.parse(sql(identitySql));
  assert.equal(identity.database, "postgres");
  const boundSql = (text) => {
    assert.deepEqual(JSON.parse(sql(identitySql)), identity, "Database identity changed");
    return sql(`set statement_timeout='20s'; set lock_timeout='5s';\n${text}`);
  };
  const expectedVersions = readdirSync("backend/supabase/migrations").filter((name) => name.endsWith(".sql")).sort().map((name) => name.slice(0, 14));
  const versions = JSON.parse(boundSql("select coalesce(json_agg(version order by version),'[]'::json) from supabase_migrations.schema_migrations;"));
  assert.deepEqual(versions, expectedVersions, "Effective database must contain the exact checkout's full migration ledger");
  const migration = readFileSync(migrationPath, "utf8");
  const expectedBody = migration.split("as $$")[1].split("$$;")[0].trim();
  const definition = JSON.parse(boundSql(`select json_build_object(
    'body',prosrc,'definer',prosecdef,'settings',proconfig,'result',pg_get_function_result(oid),
    'columnType',(select data_type from information_schema.columns where table_schema='public' and table_name='staff_users' and column_name='permission_version'),
    'anon',has_function_privilege('anon',oid,'EXECUTE'),
    'authenticated',has_function_privilege('authenticated',oid,'EXECUTE'),
    'service',has_function_privilege('service_role',oid,'EXECUTE'))::text
    from pg_proc where oid='public.complete_staff_password_reset_security_v2(uuid)'::regprocedure;`));
  assert.equal(definition.body.trim(), expectedBody, "Test the effective migrated correction, not a replacement function");
  assert.equal(definition.columnType, "integer");
  assert.equal(definition.definer, true);
  assert.deepEqual(definition.settings, ["search_path=pg_catalog, public"]);
  assert.equal(definition.result, "TABLE(staff_user_id uuid, staff_role text, permission_version bigint, security_version bigint, staff_status text)");
  assert.equal(definition.anon, false);
  assert.equal(definition.authenticated, false);
  assert.equal(definition.service, true);
  const recovery = boundSql("select prosrc from pg_proc where oid='public.system_recovery_password_transition_v1(uuid,uuid,text)'::regprocedure;");
  assert(recovery.includes("public.complete_staff_password_reset_security_v2(p_user)"), "Actual migrated recovery wrapper must delegate to the corrected transition");
  console.log(`Full-schema database: ${binding.image}; source ${process.env.PASSWORD_RESET_SOURCE_SHA}; ${versions.length} exact migrations`);
  // No CREATE/REPLACE of application functions, synthetic dependency tables, or external Auth calls.
  await runPasswordResetCandidateChecks(t, boundSql);
  assert.deepEqual(JSON.parse(sql(identitySql)), identity);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  test("effective full-schema password transition and recovery replay", qualifyFullSchema);
}

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, realpathSync, statSync } from "node:fs";
export const defaultRun = (command, args, input) => execFileSync(command, args, {
  input, encoding: "utf8", timeout: 30000, maxBuffer: 8 * 1024 * 1024,
  stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
}).trim();

export function attestLoanDatabase(env = process.env, run = defaultRun) {
  assert.equal(env.GITHUB_ACTIONS, "true", "Disposable CI required");
  assert.equal(env.GITHUB_EVENT_NAME, "pull_request", "PR-only qualification");
  assert.equal(env.GITHUB_WORKFLOW, "Loan Review Transition Qualification");
  assert.equal(env.GITHUB_JOB, "loan-review");
  assert.equal(env.LOAN_REVIEW_FULL_SCHEMA, "1", "Full-schema execution must be explicit");
  for (const key of ["DOCKER_HOST", "DOCKER_CONTEXT", "DATABASE_URL", "PGHOST", "PGPORT", "PGSERVICE", "PGOPTIONS", "PGPASSWORD", "PGPASSFILE", "PGUSER"]) {
    assert(!env[key], `Database override forbidden: ${key}`);
  }
  assert.equal(realpathSync(process.cwd()), realpathSync(env.GITHUB_WORKSPACE));
  assert.match(env.LOAN_REVIEW_SOURCE_SHA ?? "", /^[a-f0-9]{40}$/);
  assert.equal(run("git", ["rev-parse", "HEAD"]), env.LOAN_REVIEW_SOURCE_SHA);
  assert.equal(JSON.parse(run("docker", ["context", "inspect"]))[0].Endpoints.docker.Host, "unix:///var/run/docker.sock");
  const container = JSON.parse(run("docker", ["inspect", "supabase_db_econovaria"]))[0];
  assert(container.State.Running && /^[a-f0-9]{64}$/.test(container.Id));
  assert.equal(container.Config.Labels["com.supabase.cli.project"], "econovaria");
  assert.match(container.Config.Image, /^(public\.ecr\.aws|ghcr\.io)\/supabase\/postgres:17\.6\.1\.143$/);
  assert(Date.parse(container.Created) >= statSync(".git").mtimeMs, "Pre-existing database forbidden");
  assert(container.NetworkSettings.Ports["5432/tcp"].some((port) => port.HostPort === "54322"));
  return { containerId: container.Id, image: container.Config.Image };
}


export function bindLoanDatabase() {
  const binding = attestLoanDatabase();
  const args = ["exec", "-i", binding.containerId, "psql", "-U", "postgres", "-d", "postgres", "-XqAt", "-v", "ON_ERROR_STOP=1"];
  const raw = (text) => defaultRun("docker", args, text);
  const identitySql = "select json_build_object('system',(pg_control_system()).system_identifier::text,'database',current_database(),'oid',(select oid from pg_database where datname=current_database()))::text;";
  const identity = JSON.parse(raw(identitySql));
  assert.equal(identity.database, "postgres");
  const sql = (text) => {
    assert.deepEqual(JSON.parse(raw(identitySql)), identity, "Database identity changed");
    return raw(`set statement_timeout='20s'; set lock_timeout='5s';\n${text}`);
  };
  const expected = readdirSync("backend/supabase/migrations").filter(n => n.endsWith(".sql")).sort().map(n => n.slice(0,14));
  assert.deepEqual(JSON.parse(sql("select coalesce(json_agg(version order by version),'[]'::json) from supabase_migrations.schema_migrations;")), expected);
  console.log(`Loan full-schema database: ${binding.image}; source ${process.env.LOAN_REVIEW_SOURCE_SHA}; ${expected.length} exact migrations`);
  return { ...binding, sql, args, identity, identitySql };
}

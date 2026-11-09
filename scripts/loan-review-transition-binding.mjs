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
  for (const key of ["DOCKER_HOST", "DOCKER_CONTEXT", "DATABASE_URL", "PGHOST", "PGPORT", "PGSERVICE", "PGOPTIONS", "PGPASSWORD", "PGPASSFILE", "PGUSER", "PGHOSTADDR", "PGDATABASE", "PGSERVICEFILE", "PGSSLMODE", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"]) {
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

// The pinned CLI's PG15+ reset replaces its owned container and volume. This
// explicit boundary permits that replacement, never identity drift within a phase.
export function captureLoanResetBoundary(env = process.env, run = defaultRun, now = Date.now()) {
  const binding = attestLoanDatabase(env, run);
  const metadata = JSON.parse(run("docker", ["inspect", binding.containerId]))[0];
  assert.equal(metadata.Id, binding.containerId);
  assert.equal(metadata.Name, "/supabase_db_econovaria");
  assert.match(metadata.Image, /^sha256:[a-f0-9]{64}$/);
  assert(Date.parse(metadata.Created) <= now);
  const daemonId = run("docker", ["info", "--format", "{{.ID}}"]);
  assert(daemonId.length > 0, "Local daemon identity missing");
  return { ...binding, daemonId, imageId: metadata.Image, sourceSha: env.LOAN_REVIEW_SOURCE_SHA, resetStartedAt: now };
}

export function verifyLoanResetTransition(before, resetExitCode, env = process.env, run = defaultRun, now = Date.now()) {
  assert.equal(resetExitCode, 0, "Ordinary disposable reset must succeed");
  assert.match(before.containerId, /^[a-f0-9]{64}$/);
  assert.match(before.imageId, /^sha256:[a-f0-9]{64}$/);
  assert(typeof before.daemonId === "string" && before.daemonId.length > 0);
  assert.equal(before.sourceSha, env.LOAN_REVIEW_SOURCE_SHA, "Source changed across reset");
  assert(Number.isFinite(before.resetStartedAt) && before.resetStartedAt <= now);
  const binding = attestLoanDatabase(env, run); // endpoint/project/image/port/source/freshness remain mandatory
  assert.equal(run("docker", ["info", "--format", "{{.ID}}"]), before.daemonId, "Local daemon changed across reset");
  const metadata = JSON.parse(run("docker", ["inspect", binding.containerId]))[0];
  assert.equal(metadata.Id, binding.containerId);
  assert.equal(metadata.Name, "/supabase_db_econovaria");
  assert.notEqual(binding.containerId, before.containerId, "Expected the pinned CLI's fresh replacement");
  assert.equal(binding.image, before.image);
  assert.equal(metadata.Image, before.imageId, "Pinned image content changed across reset");
  const created = Date.parse(metadata.Created);
  assert(created >= before.resetStartedAt && created <= now, "Replacement must be created inside the reset boundary");
  // Successful exact-ID listing proves absence, including stopped containers.
  // Daemon/permission/inspection failures throw; they never mean 'not found'.
  assert.equal(run("docker", ["container", "ls", "--all", "--no-trunc", "--filter", `id=${before.containerId}`, "--format", "{{.ID}}"]), "", "Prior container still exists");
  return binding;
}

export function assertLoanResetFixturesCleared(sql) {
  assert.equal(sql("select count(*) from public.currencies where name='Synthetic loan qualification';"), "0");
  assert.equal(sql("select count(*) from public.game_sessions where name in ('Synthetic loan qualification','Synthetic isolation game');"), "0");
}

export function assertLoanPhaseBinding(expected, actual) {
  for (const key of ["containerId", "image", "identity"]) {
    assert.deepEqual(actual[key], expected[key], `Post-reset ${key} drift`);
  }
}

export function runInLoanDatabasePhase(expected, command, bind = bindLoanDatabase) {
  assertLoanPhaseBinding(expected, bind());
  try { return command(); }
  finally { assertLoanPhaseBinding(expected, bind()); }
}

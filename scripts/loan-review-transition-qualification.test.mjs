import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { attestLoanDatabase } from "./loan-review-transition-binding.mjs";

const sha = "a".repeat(40);
const env = {
  GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "pull_request",
  GITHUB_WORKFLOW: "Loan Review Transition Qualification", GITHUB_JOB: "loan-review",
  GITHUB_WORKSPACE: process.cwd(), LOAN_REVIEW_SOURCE_SHA: sha, LOAN_REVIEW_FULL_SCHEMA: "1",
};
const container = {
  Id: "b".repeat(64), State: { Running: true }, Created: new Date(Date.now() + 1000).toISOString(),
  Config: { Image: "public.ecr.aws/supabase/postgres:17.6.1.143", Labels: { "com.supabase.cli.project": "econovaria" } },
  NetworkSettings: { Ports: { "5432/tcp": [{ HostPort: "54322" }] } },
};
function runner(metadata = container, actualSha = sha, host = "unix:///var/run/docker.sock") {
  return (command, args) => {
    if (command === "git") return actualSha;
    if (args[0] === "context") return JSON.stringify([{ Endpoints: { docker: { Host: host } } }]);
    assert.deepEqual(args, ["inspect", "supabase_db_econovaria"]);
    return JSON.stringify([metadata]);
  };
}

test("attestation binds exact PR checkout to a fresh pinned local Supabase container", () => {
  assert.deepEqual(attestLoanDatabase(env, runner()), { containerId: container.Id, image: container.Config.Image });
});
for (const event of ["push", "workflow_dispatch", "pull_request_target"]) {
  test(`full-schema runner rejects ${event}`, () => assert.throws(() => attestLoanDatabase({ ...env, GITHUB_EVENT_NAME: event }, runner())));
}
for (const key of ["DOCKER_HOST", "DOCKER_CONTEXT", "DATABASE_URL", "PGHOST", "PGPORT", "PGSERVICE", "PGOPTIONS", "PGPASSWORD", "PGPASSFILE", "PGUSER"]) {
  test(`reject database override ${key} before any command`, () => {
    assert.throws(() => attestLoanDatabase({ ...env, [key]: "override" }, () => assert.fail("override reached a command")), /override forbidden/);
  });
}
test("missing explicit full-schema selection fails rather than skipping", () => {
  assert.throws(() => attestLoanDatabase({ ...env, LOAN_REVIEW_FULL_SCHEMA: undefined }, runner()));
});
test("wrong source, Docker endpoint, project, image, stopped server, stale server and port reject", () => {
  assert.throws(() => attestLoanDatabase(env, runner(container, "c".repeat(40))));
  assert.throws(() => attestLoanDatabase(env, runner(container, sha, "tcp://remote:2375")));
  for (const mutate of [
    (c) => { c.Config.Labels["com.supabase.cli.project"] = "other"; },
    (c) => { c.Config.Image = "postgres:latest"; },
    (c) => { c.State.Running = false; },
    (c) => { c.Created = "2000-01-01T00:00:00Z"; },
    (c) => { c.NetworkSettings.Ports["5432/tcp"][0].HostPort = "5432"; },
  ]) {
    const wrong = structuredClone(container); mutate(wrong);
    assert.throws(() => attestLoanDatabase(env, runner(wrong)));
  }
});
test("qualification workflow is PR-only, secret-free and runs focused/full-schema tests", () => {
  const workflow = readFileSync(".github/workflows/loan-review-transition-qualification.yml", "utf8");
  assert.match(workflow, /on:\n  pull_request:\n    branches: \[main\]/);
  assert.doesNotMatch(workflow, /secrets\.|workflow_dispatch:|pull_request_target:|^  push:|^  schedule:|environment:|continue-on-error:|--linked|--project-ref|functions deploy|db push|docker (?:system|volume|image) prune/m);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /'backend\/supabase\/migrations\/\*\*'/);
  assert.match(workflow, /'scripts\/loan-review-transition-\*\.mjs'/);
  for (const file of ["loan-review-transition-database.test.mjs", "loan-review-transition-full-schema.test.mjs"]) {
    assert(workflow.includes(`node --test scripts/${file}`));
  }
  assert(workflow.indexOf("supabase db reset") < workflow.indexOf("node --test scripts/loan-review-transition-database.test.mjs"));
  assert(workflow.includes("node --test --test-concurrency=1 scripts/loan-review-transition-race.test.mjs"));
  const race = workflow.indexOf("node --test --test-concurrency=1 scripts/loan-review-transition-race.test.mjs");
  const reset = workflow.indexOf("Reset only this disposable schema after committed race fixtures");
  const banking = workflow.indexOf("node scripts/banking-fx-database-acceptance.mjs");
  assert(race < reset && reset < banking, "Committed race fixtures must be reset before global FX acceptance");
  const isolation = workflow.slice(reset, banking);
  assert(isolation.includes("npx supabase db reset --workdir backend --local"));
  assert.equal(isolation.split("bindLoanDatabase()").length-1, 2);
  assert(isolation.indexOf("bindLoanDatabase()") < isolation.indexOf("npx supabase db reset"));
  assert(isolation.lastIndexOf("bindLoanDatabase()") > isolation.indexOf("npx supabase db reset"));
  assert(isolation.includes("assert.equal(after.containerId, before.containerId)"));
  assert(isolation.includes("assert.equal(after.identity.system, before.identity.system)"));
  assert(isolation.includes("Synthetic loan qualification"));

  assert.match(workflow, /LOAN_REVIEW_FULL_SCHEMA: '1'/);
  assert.match(workflow, /node-version: '22\.23\.1'/);
  assert.match(workflow, /npm@10\.9\.8/);
  assert.match(workflow, /deno-version: v2\.9\.3/);
  assert.match(workflow, /supabase --version\)" = '2\.109\.1'/);
  assert.match(workflow, /supabase db lint --workdir backend --local --level warning/);
  const replay = readFileSync(".github/workflows/database-replay.yml", "utf8");
  assert.match(replay, /for PASS in 1 2/);
  assert.match(replay, /schema-determinism/);
  assert.match(replay, /catalog-determinism/);
  assert.match(replay, /false &&/);
});

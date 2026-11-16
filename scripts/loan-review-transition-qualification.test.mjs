import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { attestLoanDatabase, captureLoanResetBoundary, verifyLoanResetTransition, assertLoanResetFixturesCleared, assertLoanPhaseBinding, runInLoanDatabasePhase } from "./loan-review-transition-binding.mjs";

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
for (const key of ["DOCKER_HOST", "DOCKER_CONTEXT", "DATABASE_URL", "PGHOST", "PGPORT", "PGSERVICE", "PGOPTIONS", "PGPASSWORD", "PGPASSFILE", "PGUSER", "PGHOSTADDR", "PGDATABASE", "PGSERVICEFILE", "PGSSLMODE", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"]) {
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
  const banking = workflow.indexOf("      - name: Preserve Banking FX full and pre-liability upgrade acceptance");
  assert(race < reset && reset < banking, "Committed race fixtures must be reset before global FX acceptance");
  const isolation = workflow.slice(reset, banking);
  assert(isolation.includes("npx supabase db reset --workdir backend --local"));
  assert.equal(isolation.split("bindLoanDatabase()").length-1, 2);
  assert(isolation.indexOf("bindLoanDatabase()") < isolation.indexOf("npx supabase db reset"));
  assert(isolation.lastIndexOf("bindLoanDatabase()") > isolation.indexOf("npx supabase db reset"));
  assert(isolation.includes("captureLoanResetBoundary()"));
  assert(isolation.includes("verifyLoanResetTransition(before, 0)"));
  assert(isolation.includes("assert.equal(after.containerId, replacement.containerId)"));
  assert(isolation.includes("assertLoanResetFixturesCleared(after.sql)"));
  assert.doesNotMatch(isolation, /after\.identity\.system, before\.identity\.system|after\.containerId, before\.containerId/);

  assert.match(workflow, /LOAN_REVIEW_FULL_SCHEMA: '1'/);
  assert.match(workflow, /node-version: '22\.23\.1'/);
  assert.match(workflow, /npm@10\.9\.8/);
  assert.match(workflow, /deno-version: v2\.9\.3/);
  assert.match(workflow, /supabase --version\)" = '2\.109\.1'/);
  assert(workflow.includes("['supabase', 'db', 'lint', '--workdir', 'backend', '--local', '--level', 'warning']"));
  assert.equal(workflow.split("runInLoanDatabasePhase(expected,").length-1, 2);
  assert(workflow.includes("execFileSync(process.execPath, ['scripts/banking-fx-database-acceptance.mjs'], { stdio: 'inherit' })"));
  const replay = readFileSync(".github/workflows/database-replay.yml", "utf8");
  assert.match(replay, /for PASS in 1 2/);
  assert.match(replay, /schema-determinism/);
  assert.match(replay, /catalog-determinism/);
  assert.match(replay, /false &&/);
});

const resetStart = Date.now() + 3000;
const resetNow = resetStart + 3000;
const oldContainer = { ...structuredClone(container), Name: "/supabase_db_econovaria", Image: "sha256:"+"d".repeat(64) };
const newContainer = { ...structuredClone(oldContainer), Id: "e".repeat(64), Created: new Date(resetStart+1000).toISOString() };
function resetRunner(current=oldContainer, oldExists=false, daemon="synthetic-daemon", listingFails=false) {
  return (command,args) => {
    if(command==="git") return sha;
    if(args[0]==="context") return JSON.stringify([{Endpoints:{docker:{Host:"unix:///var/run/docker.sock"}}}]);
    if(args[0]==="info") return daemon;
    if(args[0]==="inspect") return JSON.stringify([current]);
    assert.deepEqual(args,["container","ls","--all","--no-trunc","--filter",`id=${oldContainer.Id}`,"--format","{{.ID}}"]);
    if(listingFails) throw new Error("synthetic daemon inspection failure");
    return oldExists?oldContainer.Id:"";
  };
}
const resetBefore = captureLoanResetBoundary(env,resetRunner(),resetStart);
test("pinned CLI reset accepts only its fresh recreated container boundary",()=>{
  assert.deepEqual(verifyLoanResetTransition(resetBefore,0,env,resetRunner(newContainer),resetNow),{containerId:newContainer.Id,image:newContainer.Config.Image});
});
test("reset failure, retained old container, stale/future replacement and changed daemon reject",()=>{
  assert.throws(()=>verifyLoanResetTransition(resetBefore,1,env,()=>assert.fail("failed reset reached daemon"),resetNow));
  assert.throws(()=>verifyLoanResetTransition(resetBefore,0,env,resetRunner(oldContainer),resetNow));
  assert.throws(()=>verifyLoanResetTransition(resetBefore,0,env,resetRunner(newContainer,true),resetNow));
  assert.throws(()=>verifyLoanResetTransition(resetBefore,0,env,resetRunner(newContainer,false,"different-daemon"),resetNow));
  for(const Created of [new Date(resetStart-1000).toISOString(),new Date(resetNow+1000).toISOString()]){
    assert.throws(()=>verifyLoanResetTransition(resetBefore,0,env,resetRunner({...newContainer,Created}),resetNow));
  }
});
test("replacement image content, project/name/port/source drift and ambiguous inspection reject",()=>{
  for(const mutate of [
    c=>{c.Image="sha256:"+"f".repeat(64);},c=>{c.Config.Image="postgres:latest";},
    c=>{c.Config.Labels["com.supabase.cli.project"]="other";},c=>{c.Name="/unrelated";},
    c=>{c.NetworkSettings.Ports["5432/tcp"][0].HostPort="5432";},
  ]){const wrong=structuredClone(newContainer);mutate(wrong);assert.throws(()=>verifyLoanResetTransition(resetBefore,0,env,resetRunner(wrong),resetNow));}
  assert.throws(()=>verifyLoanResetTransition(resetBefore,0,{...env,LOAN_REVIEW_SOURCE_SHA:"f".repeat(40)},resetRunner(newContainer),resetNow));
  assert.throws(()=>verifyLoanResetTransition(resetBefore,0,env,resetRunner(newContainer,false,"synthetic-daemon",true),resetNow),/inspection failure/);
});
test("synthetic currencies or games surviving reset reject",()=>{
  assert.doesNotThrow(()=>assertLoanResetFixturesCleared(()=>"0"));
  for(const relation of ["currencies","game_sessions"]){
    assert.throws(()=>assertLoanResetFixturesCleared(sql=>sql.includes(relation)?"1":"0"));
  }
});

test("post-reset identity is strict before and after each subsequent command",()=>{
 const phase={containerId:newContainer.Id,image:newContainer.Config.Image,identity:{system:"123",database:"postgres",oid:5}};
 assert.doesNotThrow(()=>assertLoanPhaseBinding(phase,structuredClone(phase)));
 for(const mutate of [p=>{p.containerId="f".repeat(64);},p=>{p.image="postgres:latest";},p=>{p.identity.system="456";},p=>{p.identity.oid=6;},p=>{p.identity.database="other";}]){
  const wrong=structuredClone(phase);mutate(wrong);
  assert.throws(()=>runInLoanDatabasePhase(phase,()=>assert.fail("drift reached command"),()=>wrong));
  let calls=0;assert.throws(()=>runInLoanDatabasePhase(phase,()=>"result",()=>++calls===1?phase:wrong));
 }
 assert.equal(runInLoanDatabasePhase(phase,()=>"success",()=>phase),"success");
 assert.throws(()=>runInLoanDatabasePhase(phase,()=>{throw new Error("synthetic command failure");},()=>phase),/command failure/);
});

for (const key of ["DOCKER_HOST", "DOCKER_CONTEXT", "DATABASE_URL", "PGHOST", "PGPORT", "PGSERVICE", "PGOPTIONS", "PGPASSWORD", "PGPASSFILE", "PGUSER", "PGHOSTADDR", "PGDATABASE", "PGSERVICEFILE", "PGSSLMODE", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"]) {
 test(`reset transition rejects ${key} before any command`,()=>{
  assert.throws(()=>verifyLoanResetTransition(resetBefore,0,{...env,[key]:"override"},()=>assert.fail("override reached a command"),resetNow),/override forbidden/);
 });
}

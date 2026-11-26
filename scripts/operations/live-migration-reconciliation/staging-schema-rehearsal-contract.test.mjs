import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../../../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");
const workflow = read(".github/workflows/econovaria-staging-schema-rehearsal.yml");

test("fresh staging rehearsal is an explicitly authorized, main-only manual job", () => {
  assert.match(workflow, /on:\n  workflow_dispatch:\n    inputs:/);
  assert.doesNotMatch(workflow, /^  (?:push|pull_request|schedule|workflow_run):/m);
  assert.match(workflow, /rehearsal_authorized:[\s\S]*?type: boolean\n        default: false/);
  assert.match(workflow, /if: github\.ref == 'refs\/heads\/main' && github\.run_attempt == 1 && inputs\.rehearsal_authorized == true/);
  assert.match(workflow, /permissions:\n  contents: read\n  actions: read\n/);
  assert.match(workflow, /environment: staging\n/);
  assert.match(workflow, /PHASE15_ENVIRONMENT: staging\n      PHASE15_EXPECTED_PROJECT_REF: eecvbssdvarfcykcfrny/);
  assert.equal([...workflow.matchAll(/\$\{\{ secrets\./g)].length, 1);
  assert.doesNotMatch(workflow, /cgiukdjwicykrmtkhudh|release_authorized|db push|migration repair|functions deploy|run-phase15-live-convergence/);
});

test("workflow binds exact GitHub source and clean-replay artifact before any credential use", () => {
  const bind = workflow.indexOf("Bind approved source and canonical evidence before accessing secrets");
  const capture = workflow.indexOf("Capture staging schema and ledger read-only");
  assert.ok(bind > 0 && capture > bind);
  const guard = workflow.slice(bind, capture);
  assert.ok(guard.includes('test "$APPROVED_SHA" = "$GITHUB_SHA"'));
  assert.ok(guard.includes('commits/main'));
  assert.ok(guard.includes('.head_sha == $sha and .event == "push" and .head_branch == "main"'));
  assert.ok(guard.includes('.conclusion == "success" and .path == ".github/workflows/database-replay.yml"'));
  assert.ok(guard.includes('phase15-clean-replay-$GITHUB_SHA'));
  assert.ok(workflow.slice(capture).includes('--expected-project-ref "$PHASE15_EXPECTED_PROJECT_REF"'));
  assert.ok(workflow.includes("PGSSLMODE=verify-full"));
});

test("raw snapshots and database credentials remain in capture and no hosted secrets reach replay", () => {
  const capture = workflow.indexOf("Capture staging schema and ledger read-only");
  const restore = workflow.indexOf("Restore and rehearse locally without hosted credentials");
  assert.ok(restore > capture);
  const section = workflow.slice(capture, restore);
  assert.match(section, /capture-rehearsal-snapshot\.sh/);
  assert.match(section, /PGPASSFILE/);
  assert.match(section, /rm -f .*connection\.pgpass/);
  const later = workflow.slice(restore);
  assert.doesNotMatch(later, /secrets\.|PHASE15_REMOTE_DATABASE_URL|connection\.env/);
  assert.match(later, /rehearse-live-shaped-upgrade\.sh/);
  assert.match(later, /releaseCertificate:\s*false/);
  assert.match(later, /path: \$\{\{ runner\.temp \}\}\/u1\/sanitized\/result\.json/);
  assert.match(later, /Remove restricted captures and diagnostics\n        if: always\(\)/);
});

test("capture wait sampling requires explicit opt-in and is limited to the read-only capture", () => {
  const match = workflow.match(/capture_wait_diagnostics:\n[^\n]+\n        required: false\n        type: boolean\n        default: false/);
  assert.ok(match);
  const start = workflow.indexOf("Capture staging schema and ledger read-only");
  const end = workflow.indexOf("Restore and rehearse locally without hosted credentials");
  const [before, capture, after] = [workflow.slice(0, start), workflow.slice(start, end), workflow.slice(end)];
  assert.ok(capture.includes("REF032_CAPTURE_OBSERVE: ${{ inputs.capture_wait_diagnostics && '1' || '' }}"));
  assert.ok(capture.includes("-e REF032_CAPTURE_OBSERVE -e PGSSLMODE=verify-full"));
  assert.doesNotMatch(before + after, /REF032_CAPTURE_OBSERVE/);
});

test("merging the diagnostic contract naturally schedules canonical Database Replay on main", () => {
  const replay = read(".github/workflows/database-replay.yml");
  const push = replay.match(/^  push:\n([\s\S]*?)(?=^  [A-Za-z_]+:|^permissions:)/m)?.[1] ?? "";
  assert.match(push, /- main/);
  assert.match(push, /scripts\/operations\/live-migration-reconciliation\/\*\*/);
});

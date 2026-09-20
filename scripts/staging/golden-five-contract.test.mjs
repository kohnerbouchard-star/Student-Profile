import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const SCRIPT_PATHS = Object.freeze([
  "scripts/staging/golden-five-verify.mjs",
  "scripts/staging/golden-five-browser-acceptance.mjs",
  "scripts/staging/codespace-preview.mjs",
]);

const TEXT_PATHS = Object.freeze([
  ...SCRIPT_PATHS,
  ".github/workflows/staging-golden-five-acceptance.yml",
  ".github/workflows/staging-golden-five-contract.yml",
  ".devcontainer/devcontainer.json",
]);

test("Golden Five scripts parse under the repository Node runtime", () => {
  for (const path of SCRIPT_PATHS) {
    const result = spawnSync(process.execPath, ["--check", path], {
      encoding: "utf8",
    });
    assert.equal(
      result.status,
      0,
      `${path} failed syntax validation:\n${result.stderr || result.stdout}`,
    );
  }
});

test("Golden Five package commands remain registered", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  for (const name of [
    "staging:golden:verify",
    "test:staging",
    "test:staging:scripts",
    "preview:staging:codespace",
  ]) {
    assert.equal(typeof packageJson.scripts?.[name], "string", `Missing package command ${name}.`);
  }
});

test("Golden Five verifier matches the current canonical fixture and lifecycle", async () => {
  const verifier = await readFile("scripts/staging/golden-five-verify.mjs", "utf8");
  const workflow = await readFile(
    ".github/workflows/phase15-controlled-staging.yml",
    "utf8",
  );
  const databaseReplayWorkflow = await readFile(
    ".github/workflows/database-replay.yml",
    "utf8",
  );
  assert.match(verifier, /contracts: 35,/u);
  assert.match(verifier, /storyEvents: 15,/u);
  assert.match(workflow, /transition_game_lifecycle_atomic_v1/u);
  assert.match(workflow, /initialize_fx_authority_for_game_v1/u);
  assert.match(workflow, /verify_provisioned_game_v1/u);
  assert.match(workflow, /'resume'/u);
  assert.match(workflow, /fixtureLifecycleState: 'active'/u);
  assert.match(workflow, /fxAuthorityState: 'ready'/u);
  assert.match(workflow, /bankingFxReadiness: 'ready'/u);
  assert.match(workflow, /phase15-staging-golden-fx-alignment-v1/u);
  assert.match(workflow, /bounded-latest-snapshot-copy-v1/u);
  assert.match(verifier, /fxAuthorityReady/u);
  assert.match(verifier, /balance_row\.currency_code = country_row\.currency_code/u);
  assert.match(workflow, /Production database selection is prohibited\./u);
  assert.match(workflow, /PGSSLMODE: verify-full/u);
  assert.match(workflow, /sslmode', 'verify-full'/u);
  assert.doesNotMatch(workflow, /PGSSLMODE=require/u);
  assert.ok(
    workflow.includes("group: phase15-controlled-staging-${{ github.event_name }}-${{ github.ref }}"),
    "Controlled staging must isolate PR concurrency and supersede stale main runs.",
  );
  assert.match(workflow, /cancel-in-progress: true/u);
  for (const path of [
    "scripts/staging/golden-five-contract.test.mjs",
    "scripts/staging/golden-five-verify.mjs",
  ]) {
    assert.equal(
      databaseReplayWorkflow.split(`- \"${path}\"`).length - 1,
      2,
      `${path} must trigger Database Replay for both pull requests and main pushes.`,
    );
  }
});

test("Golden Five source never commits plaintext fixture access codes", async () => {
  const plaintextAccessCode = /GOLD-[1-5]-[A-Z0-9]{8}/;
  for (const path of TEXT_PATHS) {
    const source = await readFile(path, "utf8");
    assert.doesNotMatch(source, plaintextAccessCode, `${path} contains a plaintext fixture Access Code.`);
  }
});

test("connected staging workflow fails closed on production selection", async () => {
  const workflow = await readFile(
    ".github/workflows/staging-golden-five-acceptance.yml",
    "utf8",
  );
  assert.match(workflow, /SUPABASE_PROJECT_REF: eecvbssdvarfcykcfrny/);
  assert.match(workflow, /PRODUCTION_PROJECT_REF:/);
  assert.match(workflow, /Production project selection is prohibited\./);
  assert.match(workflow, /environment: staging/);
  assert.doesNotMatch(workflow, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("Codespaces preview accepts only browser-safe staging identity", async () => {
  const source = await readFile("scripts/staging/codespace-preview.mjs", "utf8");
  assert.match(source, /sb_publishable_/);
  assert.match(source, /Production project selection is prohibited\./);
  assert.doesNotMatch(source, /SERVICE_ROLE|service_role|SUPABASE_DB_PASSWORD|POOLER_URL/);
});

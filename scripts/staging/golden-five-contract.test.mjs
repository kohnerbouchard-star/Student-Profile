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

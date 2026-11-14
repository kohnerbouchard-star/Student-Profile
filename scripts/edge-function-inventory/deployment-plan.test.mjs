import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { deploymentPlan, formatDeploymentPlan } from "./deployment-plan.mjs";

const manifest = JSON.parse(readFileSync("backend/supabase/edge-function-manifest.json", "utf8"));
const workflow = readFileSync(".github/workflows/edge-function-inventory-converge.yml", "utf8");

function stepScript(name) {
  const start = workflow.indexOf(`      - name: ${name}\n`);
  assert.notEqual(start, -1, `Missing workflow step: ${name}`);
  const end = workflow.indexOf("\n      - name:", start + 1);
  const step = workflow.slice(start, end === -1 ? undefined : end);
  return step.slice(step.indexOf("        run: |\n") + "        run: |\n".length)
    .split("\n").map((line) => line.replace(/^          /u, "")).join("\n");
}

function runDeployment(environment, fixture = manifest, failSlug = "") {
  const dir = mkdtempSync(join(tmpdir(), "edge-deployment-test-"));
  try {
    const manifestPath = join(dir, "manifest.json");
    const log = join(dir, "calls.txt");
    writeFileSync(manifestPath, JSON.stringify(fixture));
    writeFileSync(log, "");
    const mock = join(dir, "supabase");
    writeFileSync(mock, '#!/bin/sh\nprintf "%s\\n" "$*" >> "$DEPLOY_LOG"\nif [ "$3" = "$FAIL_SLUG" ]; then exit 23; fi\n');
    chmodSync(mock, 0o700);
    const result = spawnSync("bash", ["-c", stepScript(`Deploy exact ${environment} canonical runtime`)], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        MANIFEST_PATH: manifestPath,
        RUNNER_TEMP: dir,
        DEPLOY_LOG: log,
        FAIL_SLUG: failSlug,
        STAGING_PROJECT_REF: manifest.environments.staging.projectRef,
        PRODUCTION_PROJECT_REF: manifest.environments.production.projectRef,
      },
    });
    return { ...result, calls: readFileSync(log, "utf8").trim().split("\n").filter(Boolean) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("the plan covers all 22 current canonical and compatibility functions with exact JWT settings", () => {
  const plan = deploymentPlan(manifest);
  assert.equal(plan.length, 22);
  assert.equal(plan.filter(({ verifyJwt }) => verifyJwt).length, 4);
  assert.deepEqual(plan, [...manifest.canonicalFunctions, ...manifest.compatibilityFunctions]
    .map(({ slug, verifyJwt }) => ({ slug, verifyJwt })));
  for (const slug of ["banking-fx-orchestrator", "fx-orchestrator"]) {
    assert.deepEqual(plan.find((entry) => entry.slug === slug), { slug, verifyJwt: false });
  }
  const excluded = [...manifest.sourceOnlyFunctions, ...manifest.temporaryStagingFunctions]
    .map(({ slug }) => slug).concat(manifest.retiredFunctions);
  assert.ok(plan.every(({ slug }) => !excluded.includes(slug)));
});

test("the plan follows manifest additions without a second deployment list", () => {
  const fixture = structuredClone(manifest);
  fixture.canonicalFunctions.push({ slug: "future-runtime", verifyJwt: true, entrypoint: "backend/supabase/functions/future-runtime/index.ts" });
  assert.equal(deploymentPlan(fixture).length, 23);
  assert.match(formatDeploymentPlan(fixture), /future-runtime\ttrue\n/u);
  for (const environment of ["staging", "production"]) {
    const result = runDeployment(environment, fixture);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.calls.length, 23);
    assert.ok(result.calls.some((call) => call.includes("deploy future-runtime ") && !call.includes("--no-verify-jwt")));
  }
});

const invalidCases = [
  ["duplicate canonical/compatibility slug", (m) => m.compatibilityFunctions.push(m.canonicalFunctions[0])],
  ["non-boolean JWT", (m) => { m.canonicalFunctions.at(-1).verifyJwt = "false"; }],
  ["option-like slug", (m) => { m.canonicalFunctions.at(-1).slug = "--debug"; }],
  ["tab-delimited slug", (m) => { m.canonicalFunctions.at(-1).slug = "bad\tfalse"; }],
  ["whitespace slug", (m) => { m.canonicalFunctions.at(-1).slug += " "; }],
  ["mismatched source entrypoint", (m) => { m.canonicalFunctions.at(-1).entrypoint = "backend/other.ts"; }],
  ["retired overlap", (m) => m.retiredFunctions.push(m.canonicalFunctions[0].slug)],
  ["source-only overlap", (m) => m.sourceOnlyFunctions.push(m.canonicalFunctions[0])],
  ["temporary overlap", (m) => m.temporaryStagingFunctions.push(m.canonicalFunctions[0])],
  ["missing canonical array", (m) => { delete m.canonicalFunctions; }],
  ["missing compatibility array", (m) => { delete m.compatibilityFunctions; }],
  ["empty deployment inventory", (m) => { m.canonicalFunctions = []; m.compatibilityFunctions = []; }],
  ["disabled JWT validation", (m) => { m.verifyJwtExactMatchRequired = false; }],
  ["unrecognized manifest", (m) => { m.manifestId = "unknown"; }],
];

for (const [name, mutate] of invalidCases) {
  test(`rejects ${name} before either workflow can deploy anything`, () => {
    const fixture = structuredClone(manifest);
    mutate(fixture);
    assert.throws(() => deploymentPlan(fixture));
    for (const environment of ["staging", "production"]) {
      const result = runDeployment(environment, fixture);
      assert.notEqual(result.status, 0);
      assert.deepEqual(result.calls, []);
    }
  });
}

for (const environment of ["staging", "production"]) {
  test(`${environment} workflow executes all planned deploys with exact project and JWT flags`, () => {
    const result = runDeployment(environment);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.calls, deploymentPlan(manifest).map(({ slug, verifyJwt }) =>
      `functions deploy ${slug} --workdir backend --project-ref ${manifest.environments[environment].projectRef}${verifyJwt ? "" : " --no-verify-jwt"}`));
  });

  test(`${environment} stops on deployment failure without continuing the plan`, () => {
    const result = runDeployment(environment, manifest, "banking-fx-orchestrator");
    assert.equal(result.status, 23);
    assert.equal(result.calls.length, deploymentPlan(manifest).findIndex(({ slug }) => slug === "banking-fx-orchestrator") + 1);
  });
}

test("workflow summary derives the deployed count from the executed plan", () => {
  const dir = mkdtempSync(join(tmpdir(), "edge-summary-test-"));
  try {
    writeFileSync(join(dir, "edge-deployment-plan.tsv"), "synthetic\tfalse\n".repeat(25));
    const summary = join(dir, "summary.md");
    const result = spawnSync("bash", ["-c", stepScript("Record bounded convergence result")], {
      encoding: "utf8",
      env: { ...process.env, RUNNER_TEMP: dir, GITHUB_STEP_SUMMARY: summary, GITHUB_SHA: "a".repeat(40) },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(readFileSync(summary, "utf8"), /Canonical\/compat deployed functions: `25`/u);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("static and predeployment workflows register the regression suite", () => {
  for (const path of [".github/workflows/edge-function-inventory.yml", ".github/workflows/edge-function-inventory-converge.yml"]) {
    assert.match(readFileSync(path, "utf8"), /node --test scripts\/edge-function-inventory\/validate.test.mjs scripts\/edge-function-inventory\/deployment-plan.test.mjs/u);
  }
});

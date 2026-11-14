import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assertBusinessWorkerEdgeDeployment } from "./business-store-sales-convergence-contract.mjs";

const workflow = readFileSync(".github/workflows/edge-function-inventory-converge.yml", "utf8");
const manifest = JSON.parse(readFileSync("backend/supabase/edge-function-manifest.json", "utf8"));
const worker = () => manifest.canonicalFunctions.find((entry) => entry.slug === "business-operations-worker");

test("the retained Business contract accepts the manifest-driven deployment and both smoke probes", () => {
  assertBusinessWorkerEdgeDeployment(workflow, manifest);
});

for (const [name, mutate] of [
  ["missing worker", (m) => { m.canonicalFunctions = m.canonicalFunctions.filter((entry) => entry.slug !== worker().slug); }],
  ["duplicate worker", (m) => m.compatibilityFunctions.push(worker())],
  ["wrong JWT boundary", (m) => { m.canonicalFunctions.find((entry) => entry.slug === worker().slug).verifyJwt = true; }],
  ["source-only worker", (m) => { m.canonicalFunctions = m.canonicalFunctions.filter((entry) => entry.slug !== worker().slug); m.sourceOnlyFunctions.push(worker()); }],
]) {
  test(`the retained Business contract rejects ${name}`, () => {
    const fixture = structuredClone(manifest);
    mutate(fixture);
    assert.throws(() => assertBusinessWorkerEdgeDeployment(workflow, fixture));
  });
}

test("the retained Business contract rejects a different manifest binding", () => {
  assert.throws(() => assertBusinessWorkerEdgeDeployment(workflow.replace("MANIFEST_PATH: backend/supabase/edge-function-manifest.json", "MANIFEST_PATH: other.json"), manifest));
});

for (const environment of ["staging", "production"]) {
  for (const [name, before, after] of [
    ["missing deployment step", `Deploy exact ${environment} canonical runtime`, "Missing deployment"],
    ["unvalidated planner", "scripts/edge-function-inventory/deployment-plan.mjs", "other-planner.mjs"],
    ["disconnected plan output", '> "$RUNNER_TEMP/edge-deployment-plan.tsv"', '> "$RUNNER_TEMP/other.tsv"'],
    ["disconnected plan input", 'done < "$RUNNER_TEMP/edge-deployment-plan.tsv"', 'done < "$RUNNER_TEMP/other.tsv"'],
    ["worker-filtering loop", "read -r slug verify_jwt; do", 'read -r slug verify_jwt; do\n            if [ "$slug" = business-operations-worker ]; then continue; fi'],
    ["wrong project", `$${environment.toUpperCase()}_PROJECT_REF`, "$OTHER_PROJECT_REF"],
    ["missing JWT flag", "false) args+=(--no-verify-jwt) ;;", "false) ;;"],
    ["missing fail-fast guard", "set -euo pipefail", "set +e"],
    ["missing deployment invocation", 'supabase functions deploy "$slug" "${args[@]}"', "echo skipped"],
    ["duplicate deployment invocation", 'supabase functions deploy "$slug" "${args[@]}"', 'supabase functions deploy "$slug" "${args[@]}"\n            supabase functions deploy "$slug" "${args[@]}"'],
    ["missing worker smoke", "'POST business-operations-worker'", "'POST other-worker'"],
    ["duplicate worker smoke", "'POST business-operations-worker'", "'POST business-operations-worker' \\\n            'POST business-operations-worker'"],
  ]) {
    test(`${environment} rejects ${name}`, () => {
      const smokeMutation = name.includes("worker smoke");
      const start = smokeMutation ? workflow.indexOf(`\n  ${environment}:\n`)
        : workflow.indexOf(`      - name: Deploy exact ${environment} canonical runtime\n`);
      const end = smokeMutation
        ? (environment === "staging" ? workflow.indexOf("\n  production:\n") : workflow.length)
        : workflow.indexOf("\n      - name:", start + 1);
      const source = workflow.slice(start, end);
      assert.ok(source.includes(before), `Missing mutation target: ${name}`);
      const fixture = workflow.slice(0, start) + source.replace(before, after) + workflow.slice(end);
      assert.throws(() => assertBusinessWorkerEdgeDeployment(fixture, manifest));
    });
  }
}

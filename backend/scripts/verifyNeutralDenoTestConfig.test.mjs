import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CLASSROOM, NEUTRAL, LOCK, SUITES, TSLIB_URL, TSLIB_FILE, TSLIB_SHA256, tslibImports, trustedTslibConfigs, validateConfigs, validateScripts, commandArgs, withConfig, junitCases, runParity } from "./verifyNeutralDenoTestConfig.mjs";

const scripts = () => ({ ...Object.fromEntries(SUITES.map((key) => [key, `deno test --allow-read=fixtures/data.json --config ${NEUTRAL} --lock=${LOCK} --frozen fixtures/example.test.ts`])), "typecheck:edge": `deno check --config ${CLASSROOM} --lock=${LOCK} --frozen supabase/functions/classroom-api/index.ts` });
const report = (name = "example") => `<testsuites><testsuite><testcase name="${name}" classname="fixture" time="0.01"/></testsuite></testsuites>`;

test("all actual Edge configs and the retained typecheck map share one verified tslib", () => {
  const backendRoot = fileURLToPath(new URL("../", import.meta.url));
  const configs = trustedTslibConfigs(backendRoot);
  assert.equal(configs.length, 29);
  const defaults = configs.filter((name) => ![NEUTRAL, CLASSROOM, "supabase/functions/admin-api/deno.json"].some((suffix) => name === join(backendRoot, suffix)));
  assert.equal(defaults.length, 26);
  for (const name of defaults) assert.deepEqual(readFileSync(name), readFileSync(defaults[0]));
  assert.equal(TSLIB_URL, "https://esm.sh/tslib@2.8.1/denonext/tslib.mjs");
  assert.equal(TSLIB_FILE, "supabase/functions/_shared/vendor/tslib-2.8.1/tslib.mjs");
  assert.equal(TSLIB_SHA256, "c38da5dd6da6281964435002ce204cd586634fe3bdfb24a0ee116f48cf3292e9");
});

test("known direct checks and connected startup paths verify the canonical source first", () => {
  const repository = fileURLToPath(new URL("../../", import.meta.url));
  const guard = "node backend/scripts/verifyNeutralDenoTestConfig.mjs --static";
  for (const [name, firstUse] of [
    ["ref-009-contract-reward-qualification.yml", "deno check --config"],
    ["ref-018-attendance-qualification.yml", "deno check --config"],
    ["runtime-stabilization-onboarding.yml", "npx supabase start --workdir backend"],
    ["business-store-seller-offers-v2.yml", "npm --prefix backend run test:player-store-public"],
    ["player-multiplayer-load-e2e.yml", "npx supabase start --workdir backend"],
    ["business-player-store-cutover-v2.yml", "npx supabase start --workdir backend"],
  ]) {
    const source = readFileSync(join(repository, ".github/workflows", name), "utf8");
    assert(source.includes(guard), `${name}: canonical guard missing`);
    if (name !== "business-player-store-cutover-v2.yml") {
      assert(source.indexOf(guard) < source.indexOf(firstUse), `${name}: guard must precede dependency use`);
    } else {
      const start = source.split("      - name: Start full local Player runtime\n")[1];
      assert(start && start.indexOf(guard) >= 0 && start.indexOf(guard) < start.indexOf(firstUse));
    }
  }
});

test("strict neutral configuration matches Classroom except its local task", () => {
  validateConfigs({ compilerOptions: { strict: true }, imports: tslibImports() }, { compilerOptions: { strict: true }, imports: tslibImports(true), tasks: { check: "deno check index.ts" } });
});
for (const delta of [{ compilerOptions: { strict: false } }, { imports: { example: "./local.ts" } }, { extends: "../deno.json" }, { workspace: ["../"] }, { test: { exclude: ["**/*"] } }]) {
  test(`reject resolution/compiler/test-selection drift: ${JSON.stringify(delta)}`, () => {
    assert.throws(() => validateConfigs({ compilerOptions: { strict: true }, imports: tslibImports() }, { compilerOptions: { strict: true }, imports: tslibImports(true), tasks: { check: "deno check index.ts" }, ...delta }));
  });
}
test("all nineteen neutral suites and genuine Classroom root check pass", () => {
  assert.equal(SUITES.length, 19);
  validateScripts(scripts());
});
for (const configFlag of [`--config ${CLASSROOM}`, `--config=${CLASSROOM}`, `-c '${CLASSROOM}'`, '--config "supabase/functions/./classroom-api/deno.json"']) {
  test(`reject a new borrowed-config consumer: ${configFlag}`, () => {
    const values = scripts();
    values["test:new-unrelated"] = `deno test ${configFlag} new.test.ts`;
    assert.throws(() => validateScripts(values));
  });
}
test("preflight permits only known migration keys, never an unrelated borrower", () => {
  const values = scripts();
  values[SUITES[0]] = values[SUITES[0]].replace(NEUTRAL, CLASSROOM);
  assert.throws(() => validateScripts(values));
  validateScripts(values, true);
  values["test:new-unrelated"] = values[SUITES[0]];
  assert.throws(() => validateScripts(values, true));
});
test("reject deleted suite, missing frozen lock, and weakened verification", () => {
  const missing = scripts();
  delete missing[SUITES[0]];
  assert.throws(() => validateScripts(missing));
  for (const replacement of ["", "--allow-net", "--no-check"]) {
    const values = scripts();
    values[SUITES[0]] = values[SUITES[0]].replace("--frozen", replacement);
    assert.throws(() => validateScripts(values));
  }
});
test("only config operand changes; permissions and test files stay identical", () => {
  const args = commandArgs(scripts()[SUITES[0]]);
  const old = withConfig(args, CLASSROOM);
  assert.deepEqual(withConfig(old, NEUTRAL), args);
  assert.equal(old.filter((value, index) => value !== args[index]).length, 1);
  assert(args.includes("--allow-read=fixtures/data.json"));
  assert.throws(() => commandArgs("deno test --config $UNTRUSTED file.test.ts"));
});
test("JUnit compares identities, not variable timing or output order", () => {
  assert.deepEqual(junitCases(report()), junitCases(report().replace("0.01", "8.95")));
  assert.notDeepEqual(junitCases(report()), junitCases(report("different")));
  assert.throws(() => junitCases(""));
  assert.throws(() => junitCases("<testsuites/>"));
  assert.throws(() => junitCases(report().replace("</testsuite>", "<failure/></testsuite>")));
});
test("parity runs both configs for nineteen suites without a shell", () => {
  const root = mkdtempSync(join(tmpdir(), "ref011-test-"));
  try {
    mkdirSync(join(root, "supabase/functions"), { recursive: true });
    writeFileSync(join(root, LOCK), "synthetic lock fixture\n");
    const calls = [];
    const result = runParity(scripts(), root, (exe, args, options) => {
      calls.push(args);
      assert.equal(exe, "deno");
      assert(!options.shell);
      assert.equal(options.cwd, root);
      assert(args.includes("--reporter=junit"));
      return { status: 0, stdout: report(), stderr: "" };
    });
    assert.equal(result.length, 19);
    assert.equal(calls.length, 38);
    for (let index = 0; index < calls.length; index += 2) {
      assert.deepEqual(withConfig(calls[index], NEUTRAL), calls[index + 1]);
    }
    assert.throws(() => runParity(scripts(), root, () => ({ status: 1, stdout: report(), stderr: "failure" })));
    assert.throws(() => runParity(scripts(), root, () => ({ error: new Error("Deno unavailable"), status: null })));
    let count = 0;
    assert.throws(() => runParity(scripts(), root, () => ({ status: 0, stdout: report(String(count++)), stderr: "" })));
    assert.throws(() => runParity(scripts(), root, () => {
      writeFileSync(join(root, LOCK), "mutated fixture");
      return { status: 0, stdout: report(), stderr: "" };
    }));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

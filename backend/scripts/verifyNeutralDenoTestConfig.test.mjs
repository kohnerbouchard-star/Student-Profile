import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CLASSROOM, NEUTRAL, LOCK, SUITES, validateConfigs, validateScripts, commandArgs, withConfig, junitCases, runParity } from "./verifyNeutralDenoTestConfig.mjs";

const scripts = () => ({ ...Object.fromEntries(SUITES.map((key) => [key, `deno test --allow-read=fixtures/data.json --config ${NEUTRAL} --lock=${LOCK} --frozen fixtures/example.test.ts`])), "typecheck:edge": `deno check --config ${CLASSROOM} --lock=${LOCK} --frozen supabase/functions/classroom-api/index.ts` });
const report = (name = "example") => `<testsuites><testsuite><testcase name="${name}" classname="fixture" time="0.01"/></testsuite></testsuites>`;

test("strict neutral configuration matches Classroom except its local task", () => {
  validateConfigs({ compilerOptions: { strict: true } }, { compilerOptions: { strict: true }, tasks: { check: "deno check index.ts" } });
});
for (const delta of [{ compilerOptions: { strict: false } }, { imports: { example: "./local.ts" } }, { extends: "../deno.json" }, { workspace: ["../"] }, { test: { exclude: ["**/*"] } }]) {
  test(`reject resolution/compiler/test-selection drift: ${JSON.stringify(delta)}`, () => {
    assert.throws(() => validateConfigs({ compilerOptions: { strict: true } }, { compilerOptions: { strict: true }, tasks: { check: "deno check index.ts" }, ...delta }));
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

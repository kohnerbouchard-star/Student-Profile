import test from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { edgeRootTypecheckPlan, runEdgeRootTypechecks, validateEdgeRootTypecheckPlan, verifyTypecheckOnlyImports } from "./typecheckAllEdgeRoots.mjs";
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

const backendRoot = fileURLToPath(new URL("../", import.meta.url));
const tslibUrl = "https://esm.sh/tslib@2.8.1/denonext/tslib.mjs";
const mapName = "scripts/typecheck-only/import-map.json";
const vendorName = "scripts/typecheck-only/vendor/tslib-2.8.1/tslib.mjs";
function typecheckFixture() {
  const root = mkdtempSync(join(tmpdir(), "edge-typecheck-import-"));
  for (const name of [LOCK, NEUTRAL, CLASSROOM, "supabase/functions/admin-api/deno.json", mapName, vendorName]) {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    copyFileSync(join(backendRoot, name), join(root, name));
  }
  for (const slug of ["admin-api", "classroom-api", "player-api", "stock-market-runner"]) {
    mkdirSync(join(root, "supabase/functions", slug), { recursive: true });
    writeFileSync(join(root, "supabase/functions", slug, "index.ts"), "export {};\n");
  }
  return root;
}
function withTypecheckFixture(check) {
  const root = typecheckFixture();
  try { check(root); } finally { rmSync(root, { recursive: true, force: true }); }
}
function rejectBeforeDeno(root) {
  let calls = 0;
  assert.throws(() => runEdgeRootTypechecks(root, () => { calls++; return { status: 0 }; }));
  assert.equal(calls, 0, "Rejected trusted-source input must never reach Deno");
}

test("typecheck plan preserves all 28 real roots and their three existing config groups", () => {
  const plan = edgeRootTypecheckPlan(backendRoot);
  validateEdgeRootTypecheckPlan(plan, backendRoot);
  const expected = readdirSync(join(backendRoot, "supabase/functions"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && readdirSync(join(backendRoot, "supabase/functions", entry.name)).includes("index.ts"))
    .map((entry) => join(backendRoot, "supabase/functions", entry.name, "index.ts")).sort();
  assert.equal(expected.length, 28);
  assert.equal(plan.length, 3);
  assert.deepEqual(plan.flatMap((args) => args.slice(5)).sort(), expected);
  assert.equal(plan[0][1], `--config=${join(backendRoot, "supabase/functions/admin-api/deno.json")}`);
  assert.equal(plan[1][1], `--config=${join(backendRoot, NEUTRAL)}`);
  assert.equal(plan[2][1], `--config=${join(backendRoot, CLASSROOM)}`);
});

test("trusted typecheck source keeps the original remote digest and verifies local bytes independently", () => {
  withTypecheckFixture((root) => {
    assert.equal(JSON.parse(readFileSync(join(root, LOCK))).remote[tslibUrl], "c38da5dd6da6281964435002ce204cd586634fe3bdfb24a0ee116f48cf3292e9");
    assert.equal(verifyTypecheckOnlyImports(root), join(root, mapName));
    const calls = [];
    assert.equal(runEdgeRootTypechecks(root, (exe, args, options) => {
      calls.push(args); assert.equal(exe, "deno"); assert.deepEqual(options, { stdio: "inherit" });
      return { status: 0 };
    }), 0);
    assert.equal(calls.length, 3);
    for (const args of calls) assert.equal(args[4], `--import-map=${join(root, mapName)}`);
  });
});

test("missing, truncated and same-length modified local module are rejected before Deno", () => {
  for (const change of [
    (path) => rmSync(path),
    (path) => writeFileSync(path, readFileSync(path).subarray(1)),
    (path) => { const bytes = readFileSync(path); bytes[0] ^= 1; writeFileSync(path, bytes); },
  ]) withTypecheckFixture((root) => { change(join(root, vendorName)); rejectBeforeDeno(root); });
});

test("missing or replaced original remote pin is rejected even when local module is accepted", () => {
  for (const change of [
    (lock) => { delete lock.remote[tslibUrl]; },
    (lock) => { lock.remote[tslibUrl] = "a".repeat(64); },
  ]) withTypecheckFixture((root) => {
    const lock = JSON.parse(readFileSync(join(root, LOCK))); change(lock);
    writeFileSync(join(root, LOCK), JSON.stringify(lock)); rejectBeforeDeno(root);
  });
});

test("typecheck map rejects wrong targets, extra URLs, prefixes, queries and scopes", () => {
  const target = "./vendor/tslib-2.8.1/tslib.mjs";
  for (const map of [
    { imports: {} },
    { imports: { [tslibUrl]: "./other.mjs" } },
    { imports: { [tslibUrl]: target, "https://esm.sh/tslib@2.8.2/denonext/tslib.mjs": target } },
    { imports: { "https://esm.sh/tslib@2.8.1/": "./vendor/tslib-2.8.1/" } },
    { imports: { [`${tslibUrl}?target=deno`]: target } },
    { imports: { [tslibUrl]: target }, scopes: {} },
  ]) withTypecheckFixture((root) => {
    writeFileSync(join(root, mapName), JSON.stringify(map)); rejectBeforeDeno(root);
  });
});

test("typecheck config shapes reject compiler or resolution changes in every retained config", () => {
  for (const name of [NEUTRAL, CLASSROOM, "supabase/functions/admin-api/deno.json"]) {
    for (const change of [
      (config) => { config.imports = { [tslibUrl]: "./other.mjs" }; },
      (config) => { config.compilerOptions.strict = !config.compilerOptions.strict; },
    ]) withTypecheckFixture((root) => {
        const config = JSON.parse(readFileSync(join(root, name))); change(config);
        writeFileSync(join(root, name), JSON.stringify(config)); rejectBeforeDeno(root);
      });
  }
});

test("typecheck plan rejects omitted roots/groups and missing or replaced config, lock, frozen or map operands", () => {
  const changes = [
    (plan) => plan.pop(),
    (plan) => plan[1].pop(),
    (plan) => plan[0].splice(1, 1),
    (plan) => { plan[0][1] = plan[1][1]; },
    (plan) => plan[0].splice(2, 1),
    (plan) => plan[0].splice(3, 1),
    (plan) => { plan[0][3] = "--frozen=false"; },
    (plan) => plan[0].splice(4, 1),
  ];
  withTypecheckFixture((root) => {
    for (const change of changes) {
      const plan = edgeRootTypecheckPlan(root); change(plan);
      assert.throws(() => validateEdgeRootTypecheckPlan(plan, root));
    }
  });
});

test("local integrity is rechecked before each Deno invocation and child failures do not fall back", () => {
  withTypecheckFixture((root) => {
    let calls = 0;
    assert.throws(() => runEdgeRootTypechecks(root, () => {
      calls++; writeFileSync(join(root, vendorName), "changed"); return { status: 0 };
    }));
    assert.equal(calls, 1);
  });
  for (const result of [{ status: 10 }, { status: null, signal: "SIGTERM" }]) {
    withTypecheckFixture((root) => {
      let calls = 0;
      assert.equal(runEdgeRootTypechecks(root, () => { calls++; return result; }), result.status ?? 1);
      assert.equal(calls, 1);
    });
  }
  withTypecheckFixture((root) => {
    const error = new Error("Deno unavailable");
    assert.throws(() => runEdgeRootTypechecks(root, () => ({ error, status: null })), (value) => value === error);
  });
});

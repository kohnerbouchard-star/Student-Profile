import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CLASSROOM, NEUTRAL, LOCK, SUITES, TSLIB_URL, TSLIB_FILE, TSLIB_SHA256, tslibImports, trustedTslibConfigs, verifyTrustedTslibGraphs, validateConfigs, validateScripts, commandArgs, withConfig, junitCases, runParity } from "./verifyNeutralDenoTestConfig.mjs";
import { inspectSdkGraph, expectedLocalFailure, failureExcerpt } from "../../scripts/verify-edge-tslib-bundle-closure.mjs";

const neutralConfig = () => ({ compilerOptions: { strict: true }, imports: tslibImports() });
const classroomConfig = () => ({ ...neutralConfig(), imports: tslibImports(true), tasks: { check: "deno check index.ts" } });

const scripts = () => ({ ...Object.fromEntries(SUITES.map((key) => [key, `deno test --allow-read=fixtures/data.json --config ${NEUTRAL} --lock=${LOCK} --frozen fixtures/example.test.ts`])), "typecheck:edge": `deno check --config ${CLASSROOM} --lock=${LOCK} --frozen supabase/functions/classroom-api/index.ts` });
const report = (name = "example") => `<testsuites><testsuite><testcase name="${name}" classname="fixture" time="0.01"/></testsuite></testsuites>`;

test("strict neutral configuration matches Classroom except its local task", () => {
  validateConfigs(neutralConfig(), classroomConfig());
});
for (const delta of [{ compilerOptions: { strict: false } }, { imports: { example: "./local.ts" } }, { scopes: { "https://esm.sh/": { [TSLIB_URL]: "./different.mjs" } } }, { extends: "../deno.json" }, { workspace: ["../"] }, { test: { exclude: ["**/*"] } }]) {
  test(`reject resolution/compiler/test-selection drift: ${JSON.stringify(delta)}`, () => {
    assert.throws(() => validateConfigs(neutralConfig(), { ...classroomConfig(), ...delta }));
  });
}
test("only the exact pinned URL and repository target may be mapped", () => {
  for (const imports of [{}, { [TSLIB_URL + "?different"]: tslibImports()[TSLIB_URL] },
    { [TSLIB_URL]: "./different.mjs" }, { ...tslibImports(), other: "./different.mjs" },
    { "https://esm.sh/": "./_shared/vendor/" }]) {
    assert.throws(() => validateConfigs({ ...neutralConfig(), imports }, classroomConfig()));
  }
});

test("all actual Edge configs bind the same original module and license", () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const configs = trustedTslibConfigs(root);
  assert.equal(configs.length, 29, "One CI default and all28 current Edge roots must be registered");
  const defaults = configs.slice(1).filter((config) => !/\/(?:admin-api|classroom-api)\/deno\.json$/u.test(config));
  assert.equal(defaults.length, 26);
  for (const config of defaults) assert.deepEqual(readFileSync(config), readFileSync(defaults[0]), "Strict-default function configs must be byte-identical");
  const license = readFileSync(join(root, "supabase/functions/_shared/vendor/tslib-2.8.1/LICENSE"));
  assert.equal(createHash("sha256").update(license).digest("hex"), "210b19e543130388c68654b7497e967119ce17145f66ab7d85688fbd70f08751");
  assert.equal(JSON.parse(readFileSync(join(root, LOCK), "utf8")).remote[TSLIB_URL], TSLIB_SHA256);
});

test("real SDK graph evidence rejects remote, unresolved and wrong-local resolution", () => {
  const local = "file:///source/backend/supabase/functions/_shared/vendor/tslib-2.8.1/tslib.mjs";
  const sdk = "https://esm.sh/@supabase/supabase-js@2.108.2/denonext/supabase-js.mjs";
  const graph = { version: 1, modules: [{ specifier: sdk, dependencies: [{ specifier: TSLIB_URL, code: { specifier: local } }] }, { specifier: local, maybeSourceMapDependency: { dependency: { error: "optional debug map absent" } } }] };
  assert.equal(inspectSdkGraph(graph, local).tslibEdges, 1);
  assert.equal(inspectSdkGraph({ version: 1, modules: [{ specifier: "file:///source/root.ts" }] }, local).dependency, "not-in-this-root");
  for (const target of [TSLIB_URL, "file:///different.mjs"]) {
    assert.throws(() => inspectSdkGraph({ ...graph, modules: [{ specifier: sdk, dependencies: [{ specifier: TSLIB_URL, code: { specifier: target } }] }, { specifier: target }] }, local));
  }
  assert.throws(() => inspectSdkGraph({ ...graph, modules: [{ specifier: sdk, error: "fetch failed" }] }, local));
  assert.throws(() => inspectSdkGraph({ ...graph, modules: [{ specifier: sdk, dependencies: [{ specifier: TSLIB_URL, code: { error: "missing" } }] }] }, local));
});

test("negative bundle credit requires an actual missing-LOCAL-path failure", () => {
  const local = "/source/backend/supabase/functions/_shared/vendor/tslib-2.8.1/tslib.mjs";
  assert(expectedLocalFailure({ status: 1, stderr: `Module not found: file://${local}` }, local));
  assert(expectedLocalFailure({ status: 1, stderr: `Error: Module not found "file://${local}".` }, local));
  assert(expectedLocalFailure({ status: 1, stderr: `Caused by: Module not found '${local}'.` }, local));
  for (const result of [{ status: 0, stderr: `Module not found: ${local}` }, { stderr: `Module not found: ${local}` }, { status: 137, stderr: `Module not found: ${local}` }, { status: 1, stderr: "HTTP403 remote dependency denied" }, { status: 1, error: { code: "ETIMEDOUT" }, stderr: `Module not found: file://${local}` }, { status: 1, stderr: "Module not found: /different.mjs" }, { status: 1, stderr: `Module not found: https://example.test/remote.mjs\nImported from ${local}` }]) assert.equal(expectedLocalFailure(result, local), false);
  for (const stderr of [`Module not found "https://example.test/remote.mjs" (imported from file://${local})`, `Error: Module not found "https://example.test/remote.mjs". Imported from "file://${local}".`, `File not found elsewhere; importer ${local}`, `Module not found: file://${local}\nout of memory`, `Module not found: file://${local}\nFailed to complete the bundle within the given time.`]) assert.equal(expectedLocalFailure({ status: 1, stderr }, local), false);
  assert.equal(expectedLocalFailure({ status: 1, signal: "SIGKILL", stderr: `Module not found: file://${local}` }, local), false);
});

test("failure excerpts retain bounded diagnostic targets/codes without bodies or proxy credentials", () => {
  const output = 'error: Module not found "file:///source/backend/supabase/functions/_shared/vendor/tslib-2.8.1/tslib.mjs".\nHTTP status: 403 https://proxy-user:proxy-password@proxy.example.test/private?token=SECRET\nTS2305 https://proxy-user:proxy-password@esm.sh/user-module.mjs?api_key=SECRET\nAuthorization: Bearer SECRET\n<html>PRIVATE_BODY https://esm.sh/PRIVATE_BODY</html>';
  const receipt = failureExcerpt(output);
  const json = JSON.stringify(receipt);
  assert(json.includes("/backend/supabase/functions/_shared/vendor/tslib-2.8.1/tslib.mjs"));
  assert(json.includes("TS2305"));
  assert(json.includes("https://esm.sh/user-module.mjs"));
  for (const sensitive of ["proxy-user", "proxy-password", "proxy.example.test", "SECRET", "Authorization", "PRIVATE_BODY", "api_key"]) assert(!json.includes(sensitive));
  const bounded = failureExcerpt(output.repeat(2000));
  assert(bounded.outputTruncated);
  assert(bounded.excerpt.length <= 6 && bounded.excerpt.every((line) => line.length <= 256));
  assert.equal(failureExcerpt("<html>PRIVATE_BODY</html>").unrecognizedOutputOmitted, true);
});

test("modified local bytes or a changed remote lock identity fail closed", () => {
  const root = mkdtempSync(join(tmpdir(), "tslib-integrity-fixture-"));
  const actual = fileURLToPath(new URL("../", import.meta.url));
  const write = (relative, content) => {
    const full = join(root, relative);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  };
  try {
    write(NEUTRAL, JSON.stringify(neutralConfig()));
    write(CLASSROOM, JSON.stringify(classroomConfig()));
    const bytes = readFileSync(join(actual, TSLIB_FILE));
    const changed = Buffer.from(bytes);
    changed[changed.length - 1] ^= 1;
    write(TSLIB_FILE, changed);
    write(LOCK, JSON.stringify({ remote: { [TSLIB_URL]: TSLIB_SHA256 } }));
    assert.throws(() => trustedTslibConfigs(root), /ORIGINAL accepted lock identity/u);
    write(TSLIB_FILE, bytes);
    write(LOCK, JSON.stringify({ remote: { [TSLIB_URL]: "e".repeat(64) } }));
    assert.throws(() => trustedTslibConfigs(root), /Original remote lock identity/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("offline graph parity inspects graph errors even when Deno exits zero", () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const module = pathToFileURL(join(root, TSLIB_FILE)).href;
  const calls = [];
  const result = verifyTrustedTslibGraphs(root, (exe, args, options) => {
    assert.equal(exe, "deno");
    for (const flag of ["info", "--json", "--no-remote", "--no-npm", "--frozen"]) assert(args.includes(flag));
    assert(!options.shell);
    calls.push(args);
    return { status: 0, stdout: JSON.stringify({ modules: [{ specifier: module }] }), stderr: "" };
  });
  assert.equal(result.configs, 29);
  assert.equal(calls.length, 29);
  assert.throws(() => verifyTrustedTslibGraphs(root, () => ({ status: 0, stdout: JSON.stringify({ modules: [{ specifier: TSLIB_URL, error: "remote blocked" }] }), stderr: "" })));
  assert.throws(() => verifyTrustedTslibGraphs(root, () => ({ status: 0, stdout: JSON.stringify({ modules: [{ specifier: TSLIB_URL }] }), stderr: "" })));
  assert.throws(() => verifyTrustedTslibGraphs(root, () => ({ status: 1, stdout: "", stderr: "failure" })));
});
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

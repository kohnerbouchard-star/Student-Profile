import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CLASSROOM, NEUTRAL, LOCK, SUITES, TSLIB_URL, TSLIB_FILE, TSLIB_SHA256, tslibImports, trustedTslibConfigs, verifyTrustedTslibGraphs, validateConfigs, validateScripts, commandArgs, withConfig, junitCases, runParity } from "./verifyNeutralDenoTestConfig.mjs";
import { inspectSdkGraph, expectedLocalFailure, failureExcerpt, selectOwnedStackImage, inspectRuntimeCliVersion, preserveDenoInfoStderr, qualificationReceiptJson } from "../../scripts/verify-edge-tslib-bundle-closure.mjs";
import { SDK, inspectClosureUrl, appendOnlyLock, inspectClosureGraph, collectModuleData, inspectResolverVersion } from "../../scripts/collect-sdk2454-runtime-closure.mjs";

const closureLock = () => ({ version: "5", specifiers: { "npm:existing@1.0.0": "1.0.0" }, npm: { "existing@1.0.0": { integrity: "unchanged" } }, redirects: {}, remote: { [SDK]: "1108d69216995335d057dbd15907caaf514a4d1ef082f097050573b9d589a57c", [TSLIB_URL]: TSLIB_SHA256 } });
const closureFixture = () => {
  const alias = "https://esm.sh/@supabase/node-fetch@^2.6.14?target=denonext", selected = "https://esm.sh/@supabase/node-fetch@2.6.15?target=denonext";
  const vendor = "file:///owned/functions/_shared/vendor/tslib-2.8.1/tslib.mjs";
  const before = closureLock(), after = structuredClone(before);
  after.redirects[alias] = selected; after.remote[selected] = "a".repeat(64);
  const graph = { version: 1, roots: [SDK], redirects: { [alias]: selected }, modules: [
    { kind: "esm", specifier: SDK, dependencies: [{ specifier: alias, code: { specifier: selected } }, { specifier: TSLIB_URL, code: { specifier: vendor } }, { specifier: "node:fs", code: { specifier: "node:fs" } }] },
    { kind: "esm", specifier: selected }, { kind: "esm", specifier: vendor }, { kind: "node", specifier: "node:fs" },
  ] };
  return { alias, selected, vendor, before, after, graph };
};

test("SDK2454 collection preserves exact query and range identities without broadening destinations", () => {
  const value = "https://esm.sh/utf-8-validate@%3E=5.0.2?target=denonext";
  assert.equal(inspectClosureUrl(value).url, value);
  assert.equal(inspectClosureUrl(value).selectedVersion, "6.0.6");
  for (const url of [value + "&extra=1", value + "#fragment", value.replace("https:", "http:"), value.replace("esm.sh", "other.invalid"), value.replace("esm.sh", "name:password@esm.sh"), value.replace("%3E=5.0.2", "7.0.0"), "https://esm.sh/unreviewed@1.0.0"]) assert.throws(() => inspectClosureUrl(url));
  assert.throws(() => inspectClosureUrl("https://esm.sh/unreviewed@1.0.0?target=denonext"), (error) => error.reviewIdentity?.url === "https://esm.sh/unreviewed@1.0.0?target=denonext");
});

test("SDK2454 proposal is semantic append-only across every original section/key/value", () => {
  const { before, after, alias, selected } = closureFixture(), original = structuredClone(before);
  assert.deepEqual(appendOnlyLock(before, after), { redirects: { [alias]: selected }, remote: { [selected]: "a".repeat(64) } });
  assert.deepEqual(before, original);
  for (const change of [
    (lock) => { lock.remote[TSLIB_URL] = "b".repeat(64); }, (lock) => { delete lock.remote[SDK]; },
    (lock) => { lock.npm["existing@1.0.0"].integrity = "changed"; }, (lock) => { lock.specifiers.other = "2.0.0"; },
    (lock) => { lock.version = "6"; }, (lock) => { lock.newSection = {}; },
    (lock) => { lock.redirects[alias] = selected.replace("2.6.15", "2.6.16"); },
  ]) { const changed = structuredClone(after); change(changed); assert.throws(() => appendOnlyLock(before, changed)); }
});

test("SDK2454 graph accounts for every literal parent, import, redirect and exact local remap", () => {
  const { before, after, graph, vendor, alias, selected } = closureFixture();
  const result = inspectClosureGraph(graph, after, appendOnlyLock(before, after), vendor);
  assert.equal(result.modules.length, 4);
  assert(result.edges.some((edge) => edge.originalUrl === alias && edge.resolvedUrl === selected));
  assert.deepEqual(result.redirects, { [alias]: selected });
  assert(result.edges.some((edge) => edge.originalUrl === TSLIB_URL && edge.resolvedUrl === vendor));
  assert.deepEqual(result.tslib, { edges: 1, status: "mapped-local" });
  const relativeImport = "/@supabase/node-fetch@^2.6.14?target=denonext";
  graph.modules[0].dependencies[0].specifier = relativeImport;
  const relativeResult = inspectClosureGraph(graph, after, appendOnlyLock(before, after), vendor);
  assert.equal(relativeResult.redirects[alias], selected);
  assert(relativeResult.edges.some((edge) => edge.import === relativeImport && edge.resolvedUrl === selected));
});

test("SDK2454 closure without an original tslib edge reports no mapping proof", () => {
  const { before, after, graph, vendor } = closureFixture();
  graph.modules[0].dependencies = graph.modules[0].dependencies.filter((dependency) => dependency.specifier !== TSLIB_URL);
  graph.modules = graph.modules.filter((module) => module.specifier !== vendor);
  const result = inspectClosureGraph(graph, after, appendOnlyLock(before, after), vendor);
  assert.deepEqual(result.tslib, { edges: 0, status: "not-in-this-sdk" });
  assert.equal(result.modules.length, 3);
  assert(!result.edges.some((edge) => edge.originalUrl === TSLIB_URL || edge.resolvedUrl === vendor));
  assert.equal(after.remote[TSLIB_URL], TSLIB_SHA256);
});

test("SDK2454 collection rejects unresolved graphs, unused new pins and unexpected runtime mapping", () => {
  for (const change of [
    ({ graph }) => { graph.modules.pop(); },
    ({ graph }) => { graph.modules[1].error = "unresolved"; },
    ({ graph }) => { graph.modules[0].dependencies[1].code.specifier = TSLIB_URL; },
    ({ graph, vendor }) => { graph.modules[0].dependencies[0].code.specifier = vendor; },
    ({ after }) => { after.remote["https://esm.sh/ws@8.22.1"] = "b".repeat(64); },
    ({ graph }) => { graph.modules.push({ kind: "esm", specifier: "https://esm.sh/ws@8.22.1" }); },
  ]) { const fixture = closureFixture(); change(fixture); assert.throws(() => inspectClosureGraph(fixture.graph, fixture.after, appendOnlyLock(fixture.before, fixture.after), fixture.vendor)); }
});

test("SDK2454 type edges retain the resolver's distinct declaration target", () => {
  const { before, after, graph, vendor } = closureFixture(), declaration = SDK + "/dist/module/index.d.ts";
  graph.modules[0].dependencies[0].type = { specifier: declaration };
  graph.modules.push({ kind: "esm", specifier: declaration });
  assert(inspectClosureGraph(graph, after, appendOnlyLock(before, after), vendor).edges.some((edge) => edge.kind === "type" && edge.resolvedUrl === declaration));
});

test("SDK2454 data copy rejects escaped/symlinked caches and altered existing bytes", () => {
  const root = mkdtempSync(join(tmpdir(), "sdk2454-data-test-"));
  try {
    const cache = join(root, "cache"), vendor = join(root, "vendor.mjs"), outside = join(root, "outside.bin");
    mkdirSync(cache); writeFileSync(vendor, "not executed"); writeFileSync(outside, "not executed");
    const linked = join(cache, "link"); symlinkSync(outside, linked);
    for (const [number, local] of [outside, linked, join(cache, "altered")].entries()) {
      if (number === 2) writeFileSync(local, "not the locked wrapper");
      const output = join(root, `output-${number}`); mkdirSync(output);
      assert.throws(() => collectModuleData([{ kind: "esm", specifier: SDK, local }], cache, vendor, closureLock(), output));
    }
  } finally { rmSync(root, { recursive: true }); }
});

test("SDK2454 resolver version follows the pinned named three-line display", () => {
  const output = "deno 2.9.3 (stable, release, x86_64-unknown-linux-gnu)\nv8 14.9.1.0-rusty\ntypescript 6.0.3\n";
  assert.deepEqual(inspectResolverVersion(output), { deno: "2.9.3", target: "x86_64-unknown-linux-gnu", v8: "14.9.1.0-rusty", typescript: "6.0.3" });
  for (const value of ["", '{"deno":"2.9.3"}\n', output.replace("2.9.3", "2.9.4"), output.replace("stable", "canary"), output.replace("release", "debug"), output.slice(0, -1), output + "\n", output + "extra\n", output.replaceAll("\n", "\r\n")]) assert.throws(() => inspectResolverVersion(value));
});

test("SDK2454 acquisition venue has no installation/handler/deploy commands and preserves ordinary checks", () => {
  const workflow = readFileSync(new URL("../../.github/workflows/backend-typecheck.yml", import.meta.url), "utf8");
  const job = workflow.split("  sdk2454-runtime-closure:\n")[1].split("  backend-typecheck:\n")[0];
  for (const guard of ["github.event.action == 'synchronize'", "github.event.pull_request.number == 885", "github.event.pull_request.head.repo.full_name == github.repository", "github.run_attempt == 1", "persist-credentials: false", 'node-version: "22.23.1"', "deno-version: v2.9.3", "timeout-minutes: 7", "retention-days: 7"]) assert(job.includes(guard));
  assert(!/npm (?:ci|install)|deno (?:run|serve|test)|supabase|docker|secrets\.|continue-on-error|exit 0/u.test(job));
  assert(workflow.includes("npm run typecheck:all")); assert(workflow.includes("Enforce backend typecheck")); assert(workflow.includes("npm run smoke"));
});

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
  assert.equal(createHash("sha256").update(license).digest("hex"), "0e8d2550baea17eb3072c4f919b36fbf9852bb49dba948549872e713863c0834");
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

test("runtime CLI display follows the tagged producer, separately from image release", () => {
  // v1.74.2 flags.rs uses crate_version!() + Deno/profile/target;
  // locked Clap 4.5.23 prefixes the named program and adds one final LF.
  const stdout = "edge-runtime 0.1.0\ndeno 2.1.4 (release, x86_64-unknown-linux-gnu)\n";
  const success = { status: 0, signal: null, error: undefined, stdout, stderr: "" };
  assert.equal(inspectRuntimeCliVersion(success).accepted, true);
  assert.equal(inspectRuntimeCliVersion({ ...success, stdout: stdout.replace("x86_64", "aarch64") }).accepted, true);
  for (const output of ["", "0.1.0\n", "edge-runtime 0.1.0\n", stdout.replace("edge-runtime", "other-runtime"), stdout.replace("0.1.0", "1.74.2"), stdout.replace("2.1.4", "2.1.5"), stdout.slice(0, -1), stdout + "\n", stdout + "extra\n", "extra\n" + stdout, " " + stdout, stdout.replace("0.1.0", "0.1.0 "), stdout.replaceAll("\n", "\r\n"), stdout.replace("deno ", "Deno "), stdout.replace("release, ", "release,"), stdout.replace("release", ""), stdout.replace("x86_64-unknown-linux-gnu", ""), stdout + "\u0000", "\u001b[0m" + stdout]) {
    assert.equal(inspectRuntimeCliVersion({ ...success, stdout: output }).accepted, false);
  }
  for (const delta of [{ status: 1 }, { status: 137 }, { status: null }, { signal: "SIGKILL" }, { error: { code: "ETIMEDOUT" } }, { error: {} }, { stderr: "unexpected warning\n" }, { stderr: undefined }]) {
    assert.equal(inspectRuntimeCliVersion({ ...success, ...delta }).accepted, false);
  }
});

test("CLI version receipt retains bounded parsed fields and hashes, never unexpected raw output", () => {
  const stdout = "edge-runtime 1.74.2\ndeno 2.1.4 (release, x86_64-unknown-linux-gnu)\n";
  const parsed = inspectRuntimeCliVersion({ status: 0, stdout, stderr: "" });
  assert.deepEqual(parsed.cli, { name: "edge-runtime", version: "1.74.2" });
  assert.equal(parsed.accepted, false);
  assert.equal(parsed.stdoutBytes, Buffer.byteLength(stdout));
  assert.equal(parsed.stdoutSha256, createHash("sha256").update(stdout).digest("hex"));
  const body = "Authorization: Bearer PRIVATE_BODY https://proxy-user:proxy-password@proxy.example.test/?token=SECRET\n";
  const receipt = inspectRuntimeCliVersion({ status: 0, signal: "PRIVATE_SIGNAL", error: { code: "PRIVATE_ERROR", message: body }, stdout: body.repeat(2000), stderr: body });
  assert.equal(receipt.accepted, false);
  assert.equal(receipt.cli, null);
  assert.equal(receipt.signal, "unrecognized"); assert.equal(receipt.error, "unrecognized");
  assert.equal(receipt.stdoutBytes, Buffer.byteLength(body.repeat(2000)));
  assert.equal(receipt.stderrSha256, createHash("sha256").update(body).digest("hex"));
  assert.equal(receipt.rawOutputOmitted, true);
  assert(JSON.stringify(receipt).length < 700);
  for (const value of ["PRIVATE_BODY", "PRIVATE_SIGNAL", "PRIVATE_ERROR", "Authorization", "proxy-user", "proxy-password", "proxy.example.test", "SECRET"]) assert(!JSON.stringify(receipt).includes(value));
  assert.equal(inspectRuntimeCliVersion({ status: null, error: { code: "ETIMEDOUT" }, stdout: "", stderr: "" }).error, "ETIMEDOUT");
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

test("unfamiliar Deno info stderr remains readable as redacted data", () => {
  const proxy = "http://proxy-user:proxy-pass@proxy.invalid:3128";
  const raw = `\u001b[31merror: unfamiliar graph invariant Z37 at module 12\u001b[0m\nhttps://url-user:url-pass@example.invalid/path/module.ts?private=QUERY_PRIVATE#FRAGMENT_PRIVATE\nfile:///source/backend/root.ts?query=FILE_PRIVATE#FILE_FRAGMENT\nproxy ${proxy}\nNO_PROXY=LOCAL_PROXY_PRIVATE\nHeaders: {"X-Private":"HEADER_PRIVATE"}\naccess_token=TOKEN_PRIVATE\nCookie: session=COOKIE_PRIVATE\nBearer BEARER_PRIVATE\n${["ghp", "x".repeat(30)].join("_")}\n::error::untrusted data\n##[warning]untrusted data\n\u001b]0;OSC_PRIVATE\u0007`;
  assert.equal(failureExcerpt(raw).unrecognizedOutputOmitted, true);
  const receipt = preserveDenoInfoStderr(raw, [proxy, "LOCAL_PROXY_PRIVATE"]);
  assert.equal(preserveDenoInfoStderr('{"headers":{"X-Private":"JSON_HEADER_PRIVATE"}}').text, "{[headers-redacted]}");
  assert.equal(preserveDenoInfoStderr("//relative-user:relative-pass@example.invalid/mod.ts?private=RELATIVE_PRIVATE#RELATIVE_FRAGMENT").text, "//example.invalid/mod.ts");
  assert(receipt.text.includes("error: unfamiliar graph invariant Z37 at module 12"));
  assert(receipt.text.includes("https://example.invalid/path/module.ts"));
  assert(receipt.text.includes("file:///source/backend/root.ts"));
  for (const secret of ["url-user", "url-pass", "QUERY_PRIVATE", "FRAGMENT_PRIVATE", "FILE_PRIVATE", "FILE_FRAGMENT", "proxy-user", "proxy-pass", "proxy.invalid", "LOCAL_PROXY_PRIVATE", "HEADER_PRIVATE", "TOKEN_PRIVATE", "COOKIE_PRIVATE", "BEARER_PRIVATE", "OSC_PRIVATE", "x".repeat(30)]) assert(!receipt.text.includes(secret));
  assert.equal(receipt.originalBytes, Buffer.byteLength(raw));
  assert.equal(receipt.originalSha256, createHash("sha256").update(raw).digest("hex"));
  assert.equal(receipt.truncated, false);
  const wire = qualificationReceiptJson({ failures: [{ denoInfoStderr: receipt }] });
  assert.equal(wire.split("\n").length, 1);
  assert(!wire.includes("::") && !wire.includes("##["));
  assert.deepEqual(JSON.parse(wire).failures[0].denoInfoStderr, receipt);
});

test("preserved stderr caps its UTF-8 diagnostic tail without replacement characters", () => {
  const raw = "界".repeat(4000) + "\nunfamiliar final diagnosis Z39\n";
  const receipt = preserveDenoInfoStderr(raw);
  assert(receipt.truncated);
  assert(receipt.retainedBytes <= 8192);
  assert.equal(receipt.retainedBytes, Buffer.byteLength(receipt.text));
  assert.equal(receipt.redactedBytes, Buffer.byteLength(raw));
  assert(receipt.text.endsWith("unfamiliar final diagnosis Z39\n"));
  assert(!receipt.text.includes("\ufffd"));
  const escaped = preserveDenoInfoStderr("::error::".repeat(3000) + "\nfinal diagnosis Z41\n");
  assert(escaped.truncated && escaped.retainedBytes <= 8192 && escaped.retainedJsonBytes <= 8192);
  assert(escaped.text.endsWith("final diagnosis Z41\n"));
});

test("bundle image selection requires this job's recorded runtime ID and official pinned provenance", () => {
  const project = "econovaria", created = "2026-10-31T07:00:01Z", id = "a".repeat(64), networkId = "b".repeat(64), imageId = `sha256:${"c".repeat(64)}`;
  const binding = { sourceSha: "d".repeat(40), project, configHash: "e".repeat(64), workspace: "/source", runId: "123", attempt: "1", job: "connected-player-runtime" };
  const labels = { "com.supabase.cli.project": project };
  const owned = [{ kind: "container", id, name: `supabase_edge_runtime_${project}`, key: `container:${id}`, created, labels }, { kind: "network", id: networkId, name: `supabase_network_${project}`, key: `network:${networkId}`, created, labels }];
  const before = [{ kind: "network", id: "0".repeat(64), name: "bridge", key: `network:${"0".repeat(64)}`, created: "2026-10-30T00:00:00Z", labels: {} }];
  const current = [...before, ...owned];
  const journal = { schemaVersion: 1, status: "stack-owned", binding, startedAt: "2026-10-31T07:00:00Z", before, owned, runtimeId: id };
  const runtime = { Id: id, Name: `/supabase_edge_runtime_${project}`, Created: created, Image: imageId, State: { Running: true }, Config: { Labels: labels, Image: "ghcr.io/supabase/edge-runtime:v1.74.2" }, NetworkSettings: { Networks: { app: { NetworkID: networkId } } } };
  const image = { Id: imageId, RepoTags: [runtime.Config.Image], RepoDigests: [`ghcr.io/supabase/edge-runtime@sha256:${"f".repeat(64)}`], Config: { Entrypoint: ["edge-runtime"] } };
  assert.equal(selectOwnedStackImage(journal, current, runtime, image, binding).imageId, imageId);
  for (const change of [
    (j) => { j.binding.attempt = "2"; }, (j) => { j.binding.sourceSha = "0".repeat(40); },
    (j) => { j.binding.project = "foreign"; }, (j) => { j.runtimeId = "0".repeat(64); },
    (j) => { j.before = [structuredClone(owned[0])]; },
  ]) {
    const changed = structuredClone(journal); change(changed);
    assert.throws(() => selectOwnedStackImage(changed, current, runtime, image, binding));
  }
  for (const change of [
    (r) => { r.Id = "0".repeat(64); }, (r) => { r.Config.Labels = { "com.supabase.cli.project": "foreign" }; },
    (r) => { r.State.Running = false; }, (r) => { r.NetworkSettings.Networks.app.NetworkID = "0".repeat(64); },
    (r) => { r.Config.Image = "example.test/edge-runtime:v1.74.2"; },
    (r) => { r.Config.Image = "ghcr.io/supabase/edge-runtime:v1.74.3"; },
  ]) {
    const changed = structuredClone(runtime); change(changed);
    assert.throws(() => selectOwnedStackImage(journal, current, changed, image, binding));
  }
  for (const change of [(i) => { i.Id = `sha256:${"0".repeat(64)}`; }, (i) => { i.RepoDigests = []; }, (i) => { i.RepoDigests = [`example.test/edge-runtime@sha256:${"f".repeat(64)}`]; }, (i) => { i.RepoTags = []; }]) {
    const changed = structuredClone(image); change(changed);
    assert.throws(() => selectOwnedStackImage(journal, current, runtime, changed, binding));
  }
  assert.throws(() => selectOwnedStackImage(journal, [...current, { kind: "container", name: "unowned", key: "container:foreign" }], runtime, image, binding));
  assert.throws(() => selectOwnedStackImage(journal, [{ ...before[0], labels: { changed: "foreign" } }, ...owned], runtime, image, binding));
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

#!/usr/bin/env node
// REVIEW COLLECTION ONLY: Deno info parses/resolves modules; it never evaluates them.
// No proposed lock entry becomes trusted merely by appearing in this receipt.
import assert from "node:assert/strict";
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { preserveDenoInfoStderr, qualificationReceiptJson } from "./verify-edge-tslib-bundle-closure.mjs";

export const SDK = "https://esm.sh/@supabase/supabase-js@2.45.4";
export const TSLIB = "https://esm.sh/tslib@2.8.1/denonext/tslib.mjs";
export const BASE_LOCK_SHA256 = "66b40862285f9bd9a7426a48671427cde664f17043f02ad88ba4eef85979423b";
const BASE = "ad83219dbbdc87b3fa334626e3e148343617a525";
const SDK_SHA256 = "1108d69216995335d057dbd15907caaf514a4d1ef082f097050573b9d589a57c";
const TSLIB_SHA256 = "c38da5dd6da6281964435002ce204cd586634fe3bdfb24a0ee116f48cf3292e9";
const CONFIG_SHA256 = "ad38ec6cacbd591659bd52cb40dfb6e64faafa8c3ad2b51d233b39279d1bde39";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const inside = (root, path) => { const rel = relative(realpathSync(root), realpathSync(path)); return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel); };
// Observed identities constrain collection, not approval of these versions/pins.
const packages = {
  "@supabase/supabase-js": ["2.45.4"], "@supabase/auth-js": ["2.65.0"],
  "@supabase/functions-js": ["2.4.1"], "@supabase/node-fetch": ["2.6.15", "^2.6.14"],
  "@supabase/postgrest-js": ["1.16.1"], "@supabase/realtime-js": ["2.10.2"],
  "@supabase/storage-js": ["2.7.0"], "@types/ws": ["8.18.2", "~8.18.2"],
  bufferutil: ["4.1.0", "^4.0.1"], "node-gyp-build": ["4.8.4", "^4.3.0"],
  tr46: ["0.0.3", "~0.0.3"], "utf-8-validate": ["6.0.6", ">=5.0.2"],
  "webidl-conversions": ["3.0.1", "^3.0.0"], "whatwg-url": ["5.0.0", "^5.0.0"],
  ws: ["8.22.1", "^8.14.2"], tslib: ["2.8.1"],
};

export function inspectClosureUrl(value) {
  assert.equal(typeof value, "string", "Module URL must be a string");
  assert(value.length <= 512, "Module URL exceeds collection bound");
  assert(/^https:\/\/esm\.sh\//u.test(value) && !/[\\\s\x00-\x1f\x7f]/u.test(value), "Unexpected literal module URL spelling");
  const url = new URL(value);
  assert.equal(url.origin, "https://esm.sh", "Unexpected module host/protocol/port");
  assert(!url.username && !url.password && !url.hash, "Module URL contains userinfo/fragment");
  assert(["", "?target=denonext"].includes(url.search), "Unexpected module query; do not redact it into a pin");
  const match = /^\/((?:@[a-z0-9_-]+\/)?[a-z0-9_.-]+)@([^/]+)(\/[^?#]*)?$/u.exec(url.pathname);
  assert(match, "Unrecognized esm.sh package path");
  const name = match[1], version = decodeURIComponent(match[2]);
  if (!packages[name]?.includes(version)) {
    const error = new Error("Unexpected package/version; stop adoption and review scope");
    error.reviewIdentity = { url: value, package: name, requestedVersion: version };
    throw error;
  }
  return { url: value, name, requestedVersion: version, selectedVersion: packages[name][0] };
}

export function appendOnlyLock(before, after) {
  assert.equal(before.version, "5"); assert.equal(after.version, before.version);
  assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort(), "Lock sections changed");
  const additions = { redirects: {}, remote: {} };
  for (const [section, old] of Object.entries(before)) {
    if (!["redirects", "remote"].includes(section)) { assert.deepEqual(after[section], old, "Existing non-remote pins changed"); continue; }
    for (const [key, value] of Object.entries(old)) assert.deepEqual(after[section][key], value, "Existing lock key/value removed or replaced");
    for (const [key, value] of Object.entries(after[section])) if (!Object.hasOwn(old, key)) {
      inspectClosureUrl(key);
      if (section === "redirects") {
        const from = inspectClosureUrl(key), to = inspectClosureUrl(value);
        assert.equal(from.name, to.name); assert.equal(to.requestedVersion, from.selectedVersion);
      } else assert.match(value, /^[a-f0-9]{64}$/u);
      additions[section][key] = value;
    }
  }
  assert.equal(after.remote[TSLIB], TSLIB_SHA256);
  assert.equal(after.remote[SDK], SDK_SHA256);
  assert(Object.keys(additions.remote).length > 0, "No missing runtime records collected");
  assert(Object.keys(additions.remote).length <= 64 && Object.keys(additions.redirects).length <= 32, "Addition count exceeds reviewed bound");
  return additions;
}

export function inspectClosureGraph(graph, lock, additions, vendorUrl) {
  assert.equal(graph.version, 1); assert.deepEqual(graph.roots, [SDK]);
  assert(Array.isArray(graph.modules) && graph.modules.length > 0 && graph.modules.length <= 128, "Module count exceeds reviewed bound");
  const modules = new Map(graph.modules.map((module) => [module.specifier, module]));
  assert.equal(modules.size, graph.modules.length, "Duplicate graph identity");
  const redirects = graph.redirects ?? {}, edges = [], usedRedirects = {}, reached = new Set();
  const resolved = (url) => {
    const seen = new Set();
    while (true) {
      // URL parsers differ in escaping '^'. Compare full URL identities without
      // rewriting any literal import, query, redirect key, or proposed lock key.
      const candidates = Object.keys(redirects).filter((key) => key === url || new URL(key).href === new URL(url).href);
      assert(candidates.length <= 1, "Ambiguous literal redirect identities");
      if (candidates.length === 0) break;
      const [key] = candidates;
      assert(!seen.has(url), "Cyclic redirect"); seen.add(url);
      const target = redirects[key]; inspectClosureUrl(key); inspectClosureUrl(target);
      assert.equal(lock.redirects[key], target, "Graph/lock redirect disagreement");
      usedRedirects[key] = target; url = target;
    }
    return url;
  };
  const visit = (requested) => {
    const url = resolved(requested); if (reached.has(url)) return; reached.add(url);
    const module = modules.get(url); assert(module && !module.error, "Unresolved graph module");
    if (url.startsWith("https:")) inspectClosureUrl(url);
    else assert(url === vendorUrl || /^node:[a-zA-Z0-9_./-]+$/u.test(url), "Unexpected local/npm/jsr/module identity");
    assert(["esm", "node"].includes(module.kind), "Unexpected module kind");
    const dependencies = (module.dependencies ?? []).flatMap((dependency) => ["code", "type"].filter((kind) => dependency[kind]).map((kind) => ({ import: dependency.specifier, kind, target: dependency[kind] })));
    if (module.typesDependency) dependencies.push({ import: module.typesDependency.specifier, kind: "module-types", target: module.typesDependency.dependency });
    for (const dependency of dependencies) {
      assert(dependency.target && !dependency.target.error && typeof dependency.target.specifier === "string", "Unresolved code/type edge");
      const original = dependency.import.startsWith("https://") ? dependency.import : new URL(dependency.import, url).href;
      if (original.startsWith("https:")) inspectClosureUrl(original);
      else assert(original === vendorUrl || /^node:[a-zA-Z0-9_./-]+$/u.test(original), "Unexpected import scheme");
      const target = resolved(dependency.target.specifier);
      const originalTarget = resolved(original);
      if (original === TSLIB) assert.equal(target, vendorUrl, "Original helper did not resolve to the accepted local file");
      else if (dependency.kind === "code") assert.equal(target, originalTarget, "Runtime import target changed beyond exact tslib mapping");
      edges.push({ parent: url, import: dependency.import, originalUrl: original, kind: dependency.kind, resolvedUrl: target });
      visit(dependency.target.specifier);
    }
  };
  visit(SDK);
  assert.equal(reached.size, modules.size, "Graph contains unaccounted modules");
  const tslibEdges = edges.filter((edge) => edge.originalUrl === TSLIB).length;
  assert.equal(reached.has(vendorUrl), tslibEdges > 0, "Local helper presence disagrees with exact SDK dependency edges");
  for (const key of Object.keys(additions.remote)) assert(reached.has(key), "Added remote pin outside the resolved closure");
  for (const [key, value] of Object.entries(additions.redirects)) assert.equal(usedRedirects[key], value, "Added redirect outside the resolved closure");
  return { edges, redirects: usedRedirects, modules: [...modules.values()], tslib: { edges: tslibEdges, status: tslibEdges > 0 ? "mapped-local" : "not-in-this-sdk" } };
}

export function collectModuleData(modules, cache, vendor, lock, output) {
  const records = [], bodies = new Map(); let totalBytes = 0;
  for (const module of modules) {
    if (module.specifier.startsWith("node:")) continue;
    assert.equal(typeof module.local, "string", "Deno did not provide cached module path");
    assert(lstatSync(module.local).isFile() && !lstatSync(module.local).isSymbolicLink(), "Cached module is not a regular file");
    assert(module.specifier === pathToFileURL(vendor).href ? realpathSync(module.local) === realpathSync(vendor) : inside(cache, module.local), "Module cache path escaped owned source/cache");
    assert(lstatSync(module.local).size <= 2 * 1024 * 1024, "Individual module exceeds2MiB");
    const bytes = readFileSync(module.local), sha256 = hash(bytes);
    totalBytes += bytes.length; assert(totalBytes <= 16 * 1024 * 1024, "Module data exceeds16MiB");
    if (module.specifier === pathToFileURL(vendor).href) assert.equal(sha256, TSLIB_SHA256);
    else if (Object.hasOwn(lock.remote, module.specifier)) assert.equal(sha256, lock.remote[module.specifier], "Downloaded bytes disagree with lock proposal");
    else assert(/\.d\.(?:ts|mts|cts)(?:\?|$)/u.test(module.specifier), "Unpinned non-declaration module");
    const file = `modules/${sha256}.bin`; bodies.set(file, bytes);
    records.push({ url: module.specifier, mediaType: module.mediaType, bytes: bytes.length, sha256, file, lockIntegrity: lock.remote[module.specifier] ?? null });
  }
  assert.equal(records.find((record) => record.url === SDK)?.sha256, SDK_SHA256, "Original locked SDK wrapper not verified");
  mkdirSync(join(output, "modules"));
  for (const [file, bytes] of bodies) writeFileSync(join(output, file), bytes, { mode: 0o600 });
  return { records, totalBytes };
}

export function inspectResolverVersion(stdout) {
  // v2.9.3 cli/args/flags.rs:1498-1545 uses Clap's named long-version
  // display. The root command does not declare a --json version option.
  const match = /^deno (2\.9\.3) \(stable, release, ([a-z0-9_-]{1,80})\)\nv8 ([a-zA-Z0-9.+_-]{1,80})\ntypescript ([a-zA-Z0-9.+_-]{1,80})\n(?![\s\S])/u.exec(stdout);
  assert(match, "Unexpected pinned resolver version display");
  return { deno: match[1], target: match[2], v8: match[3], typescript: match[4] };
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const env = process.env, receipt = { schemaVersion: 1, purpose: "untrusted-sdk2454-closure-review", acceptedPins: false, registryProvenancePending: true, sourceSha: env.RELEASE_COMMIT, phase: "guards" };
  let work, output, sourceLock, original;
  const childEnv = Object.fromEntries(["PATH", "HOME", "TMPDIR", "SSL_CERT_FILE", "SSL_CERT_DIR", "DENO_CERT", "DENO_TLS_CA_STORE", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "all_proxy", "no_proxy"].filter((key) => env[key] !== undefined).map((key) => [key, env[key]]));
  Object.assign(childEnv, { CI: "true", NO_COLOR: "1", DENO_NO_PROMPT: "1", DENO_NO_UPDATE_CHECK: "1" });
  const run = (program, args, cwd, timeout = 10000, maxBuffer = 1024 * 1024) => {
    const result = spawnSync(program, args, { cwd, env: childEnv, encoding: "utf8", timeout, maxBuffer });
    assert(!result.error && !result.signal && result.status === 0, "Tool failed before dependency acquisition"); return result.stdout;
  };
  try {
    assert.equal(env.GITHUB_ACTIONS, "true"); assert.equal(env.RUNNER_ENVIRONMENT, "github-hosted");
    assert.equal(env.GITHUB_EVENT_NAME, "pull_request"); assert.equal(env.GITHUB_JOB, "sdk2454-runtime-closure");
    assert.equal(env.GITHUB_REPOSITORY, "kohnerbouchard-star/Student-Profile"); assert.equal(env.GITHUB_RUN_ATTEMPT, "1");
    assert.match(env.GITHUB_RUN_ID ?? "", /^[0-9]+$/u); assert.match(env.RELEASE_COMMIT ?? "", /^[a-f0-9]{40}$/u);
    assert.equal(process.versions.node, "22.23.1");
    assert.equal(run("git", ["rev-parse", "HEAD"], root).trim(), env.RELEASE_COMMIT);
    assert.equal(run("git", ["rev-parse", "HEAD^"], root).trim(), BASE, "Collection limited to the reviewed direct successor");
    assert.equal(run("git", ["status", "--porcelain"], root), "", "Checkout changed before collection");
    const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8"));
    assert.equal(event.action, "synchronize"); assert.equal(event.number, 885);
    assert.equal(event.pull_request.head.sha, env.RELEASE_COMMIT); assert.equal(event.pull_request.head.ref, "fix/game-provisioning-service-claims-v1");
    assert.equal(event.pull_request.head.repo.full_name, env.GITHUB_REPOSITORY); assert.equal(event.pull_request.base.ref, "main");
    const version = inspectResolverVersion(run("deno", ["--version"], root));
    receipt.tools = { node: process.versions.node, ...version }; receipt.runId = env.GITHUB_RUN_ID;
    sourceLock = join(root, "backend/supabase/functions/deno.lock"); original = readFileSync(sourceLock);
    assert.equal(hash(original), BASE_LOCK_SHA256);
    const before = JSON.parse(original); assert.equal(before.remote[SDK], SDK_SHA256); assert.equal(before.remote[TSLIB], TSLIB_SHA256);
    receipt.originalLockSha256 = hash(original);
    const config = join(root, "backend/supabase/functions/campaign-orchestrator/deno.json");
    const vendor = join(root, "backend/supabase/functions/_shared/vendor/tslib-2.8.1/tslib.mjs");
    assert.equal(hash(readFileSync(config)), CONFIG_SHA256); assert.equal(hash(readFileSync(vendor)), TSLIB_SHA256);
    receipt.originalConfigSha256 = CONFIG_SHA256; receipt.acceptedLocalHelperSha256 = TSLIB_SHA256;
    const temp = realpathSync(env.RUNNER_TEMP); output = join(temp, "sdk2454-runtime-closure"); mkdirSync(output);
    work = mkdtempSync(join(temp, "sdk2454-review-"));
    const configCopy = join(work, "functions/campaign-orchestrator/deno.json"), vendorCopy = join(work, "functions/_shared/vendor/tslib-2.8.1/tslib.mjs"), lockCopy = join(work, "functions/deno.lock"), cache = join(work, "deno-cache");
    mkdirSync(dirname(configCopy), { recursive: true }); mkdirSync(dirname(vendorCopy), { recursive: true }); mkdirSync(cache);
    copyFileSync(config, configCopy); copyFileSync(vendor, vendorCopy); writeFileSync(lockCopy, original);
    childEnv.DENO_DIR = cache; receipt.phase = "non-evaluating-resolution";
    const args = ["info", "--json", "--no-npm", "--node-modules-dir=none", "--allow-import=esm.sh:443", `--config=${configCopy}`, `--lock=${lockCopy}`, "--frozen=false", SDK];
    receipt.command = { program: "deno", args: args.map((arg) => arg.replaceAll(work, "OWNED_TEMP")), graphKind: "All", mutableLock: "owned disposable copy only" };
    const result = spawnSync("deno", args, { cwd: work, env: childEnv, encoding: "utf8", timeout: 180000, maxBuffer: 8 * 1024 * 1024 });
    receipt.process = { status: result.status, signal: result.signal ?? null, error: result.error?.code ?? null, stdoutBytes: Buffer.byteLength(result.stdout ?? ""), stdoutSha256: hash(result.stdout ?? ""), stderr: preserveDenoInfoStderr(result.stderr ?? "", Object.entries(childEnv).filter(([key]) => /proxy/iu.test(key)).map(([, value]) => value)) };
    assert(!result.error && !result.signal && result.status === 0, "Resolution failed; no acquisition retry or alternative route");
    receipt.phase = "review-data-validation";
    const proposed = readFileSync(lockCopy), graph = JSON.parse(result.stdout), after = JSON.parse(proposed);
    receipt.proposedLockSha256 = hash(proposed);
    const additions = appendOnlyLock(before, after), closure = inspectClosureGraph(graph, after, additions, pathToFileURL(vendorCopy).href);
    const data = collectModuleData(closure.modules, cache, vendorCopy, after, output);
    writeFileSync(join(output, "lock.proposed.json"), proposed, { mode: 0o600 });
    const files = { "graph.json": graph, "additions.proposed.json": additions, "index.json": { ...data, edges: closure.edges, redirects: closure.redirects, tslib: closure.tslib } };
    for (const [name, value] of Object.entries(files)) writeFileSync(join(output, name), JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
    receipt.collection = { modules: data.records.length, bytes: data.totalBytes, redirects: Object.keys(additions.redirects).length, remoteAdditions: Object.keys(additions.remote).length, originalWrapperVerified: true, exactQueriesRetained: true, tslib: closure.tslib };
    receipt.limitations = "Static/literal code and type graph only; no evaluation or computed dynamic import proof. Deno-reported redirects are not a raw HTTP hop/header capture. Registry package provenance and transformed-byte review remain pending. No pins accepted.";
    receipt.phase = "collected-for-review";
  } catch (error) {
    receipt.failed = true;
    receipt.error = preserveDenoInfoStderr(String(error.message), Object.entries(childEnv).filter(([key]) => /proxy/iu.test(key)).map(([, value]) => value)).text.slice(0, 1024);
    if (error.reviewIdentity) receipt.scopeStop = error.reviewIdentity;
  } finally {
    if (work) {
      try { rmSync(work, { recursive: true }); } catch { receipt.failed = true; }
      receipt.ownedTemporaryRemoved = !existsSync(work);
    }
    if (original) receipt.sourceLockUnchanged = readFileSync(sourceLock).equals(original);
    if (output) writeFileSync(join(output, "receipt.json"), qualificationReceiptJson(receipt) + "\n", { mode: 0o600 });
    // Metadata/diagnostics only; module bodies are .bin DATA in the review artifact.
    console.log(qualificationReceiptJson(receipt));
    if (receipt.failed || receipt.sourceLockUnchanged !== true || receipt.ownedTemporaryRemoved !== true) process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main();

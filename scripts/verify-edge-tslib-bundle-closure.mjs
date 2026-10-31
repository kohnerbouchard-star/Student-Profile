#!/usr/bin/env node
// Bundle-only qualification. Never start a server or invoke a function handler.
import assert from "node:assert/strict";
import { copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { basename, dirname, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { LOCK, NEUTRAL, TSLIB_FILE, TSLIB_SHA256, TSLIB_URL, trustedTslibConfigs } from "../backend/scripts/verifyNeutralDenoTestConfig.mjs";
import { ownedDelta } from "./ref-046-disposable-qualification.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const officialRuntime = (reference) => /^(?:public\.ecr\.aws\/supabase|ghcr\.io\/supabase|(?:docker\.io\/)?supabase)\/edge-runtime:v1\.74\.2$/u.test(reference);
const canonicalRepo = (reference) => reference.replace(/^docker\.io\//u, "").replace(/:v1\.74\.2$/u, "");

export function selectOwnedStackImage(journal, current, runtime, image, binding) {
  assert.equal(journal.schemaVersion, 1);
  assert.equal(journal.status, "stack-owned");
  assert.deepEqual(journal.binding, binding, "Stack receipt belongs to a different job/source/project");
  assert(!journal.before.some((row) => row.name.endsWith(`_${binding.project}`) || row.labels?.["com.supabase.cli.project"] === binding.project), "Preexisting stack cannot be adopted");
  const owned = ownedDelta(journal.before, current, binding.project);
  assert.deepEqual(owned, journal.owned, "Recorded stack resources changed");
  const matches = owned.filter((row) => row.kind === "container" && row.name === `supabase_edge_runtime_${binding.project}`);
  assert.equal(matches.length, 1, "Expected one recorded runtime resource");
  const [row] = matches;
  assert.match(row.id, /^[a-f0-9]{64}$/u);
  assert.equal(row.id, journal.runtimeId);
  assert.equal(runtime.Id, row.id);
  assert.equal(runtime.Name, `/${row.name}`);
  assert.equal(runtime.Created, row.created);
  assert(Date.parse(row.created) >= Math.floor(Date.parse(journal.startedAt) / 1000) * 1000, "Runtime predates this startup");
  assert.deepEqual(runtime.Config.Labels, row.labels);
  assert.equal(runtime.Config.Labels["com.supabase.cli.project"], binding.project);
  assert.equal(runtime.State.Running, true);
  const networks = owned.filter((item) => item.kind === "network" && item.name === `supabase_network_${binding.project}`);
  assert.equal(networks.length, 1);
  assert.deepEqual(Object.values(runtime.NetworkSettings.Networks).map((network) => network.NetworkID), [networks[0].id], "Runtime is attached to an unrecorded network");
  assert.equal(image.Id, runtime.Image);
  assert.match(image.Id, /^sha256:[a-f0-9]{64}$/u);
  const reference = runtime.Config.Image;
  assert(officialRuntime(reference), "Runtime was not provisioned from a pinned official CLI image reference");
  assert(image.RepoTags.some((tag) => officialRuntime(tag) && canonicalRepo(tag) === canonicalRepo(reference)));
  const digests = image.RepoDigests.filter((digest) => {
    const match = /^(.*)@sha256:[a-f0-9]{64}$/u.exec(digest);
    return match && canonicalRepo(`${match[1]}:v1.74.2`) === canonicalRepo(reference);
  }).sort();
  assert(digests.length > 0, "CLI-selected image lacks matching repository digest provenance");
  assert.equal(image.Config.Entrypoint.length, 1);
  assert.match(image.Config.Entrypoint[0], /(?:^|\/)edge-runtime$/u);
  return { runtimeContainerId: row.id, networkId: networks[0].id, imageId: image.Id, reference, digests };
}

export function inspectSdkGraph(graph, localUrl) {
  assert.equal(graph.version, 1, "Unreviewed Deno graph schema");
  assert(Array.isArray(graph.modules) && graph.modules.length > 0, "Empty graph");
  const modules = new Map(graph.modules.map((module) => [module.specifier, module]));
  const redirects = graph.redirects ?? {};
  const resolved = (value) => {
    const seen = new Set();
    while (redirects[value]) {
      assert(!seen.has(value), "Cyclic graph redirect");
      seen.add(value); value = redirects[value];
    }
    return value;
  };
  let edges = 0;
  const identities = [...modules.keys()].sort();
  for (const module of graph.modules) {
    assert(!module.error && module.specifier !== TSLIB_URL, "Unresolved or remote tslib module");
    for (const dependency of module.dependencies ?? []) {
      let original = dependency.specifier;
      try { original = new URL(original, module.specifier).href; } catch { /* npm/node specifier */ }
      for (const edge of [dependency.code, dependency.type].filter(Boolean)) {
        assert(!edge.error && typeof edge.specifier === "string", "Unresolved code/type edge");
        const target = resolved(edge.specifier);
        assert(modules.has(target), "Dependency target missing from graph");
        identities.push(JSON.stringify([module.specifier, original, target]));
        if (original === TSLIB_URL) {
          assert.equal(target, localUrl, "Original dependency did not resolve to accepted local implementation");
          edges += 1;
        }
      }
    }
    if (module.typesDependency) {
      const edge = module.typesDependency.dependency;
      assert(edge && !edge.error && modules.has(resolved(edge.specifier)), "Unresolved module types");
    }
    // maybeSourceMapDependency is optional debug metadata, not an import edge.
  }
  assert.equal(modules.has(localUrl), edges > 0, "Local helper/expected dependency edge disagree");
  return { modules: modules.size, tslibEdges: edges, dependency: edges ? "mapped-local" : "not-in-this-root", sdk: graph.modules.some((module) => /https:\/\/esm\.sh\/@supabase\/supabase-js@/u.test(module.specifier)), resolutionSha256: hash(JSON.stringify(identities.sort())) };
}

const plain = (text) => String(text ?? "").replace(/\x1b\[[0-9;]*[A-Za-z]/gu, "");
function missingTarget(line) {
  // Deno's named Module-not-found forms, not importer/context text or a body.
  const match = /^(?:(?:error|caused by):\s*|\d+:\s*)?Module not found(?::\s*|\s+)(?:"([^"]+)"|'([^']+)'|(\S+?))\.?$/iu.exec(plain(line).trim());
  return match ? match[1] ?? match[2] ?? match[3] : null;
}

export function expectedLocalFailure(result, localPath) {
  if (result.error || result.signal || result.status !== 1) return false;
  const output = `${result.stderr ?? ""}\n${result.stdout ?? ""}`;
  if (/\b(?:out of memory|allocation failed|heap limit|oomkilled|timed out|given time)\b/iu.test(output)) return false;
  return output.split("\n").some((line) => [localPath, pathToFileURL(localPath).href].includes(missingTarget(line)));
}

export function failureExcerpt(output) {
  const text = plain(output);
  const bounded = text.length > 32768 ? `${text.slice(0, 16384)}\n${text.slice(-16384)}` : text;
  const excerpt = new Set();
  const safeTarget = (target) => {
    try {
      const url = new URL(target);
      if (url.protocol === "file:") target = url.pathname;
      else {
        if (url.protocol !== "https:" || !["esm.sh", "registry.npmjs.org", "public.ecr.aws", "jsr.io", "deno.land"].includes(url.hostname)) return "[remote target redacted]";
        return `${url.origin}${url.pathname}`.slice(0, 192); // No userinfo/query/fragment.
      }
    } catch { /* Only an allowlisted source-relative path may remain. */ }
    const index = target.indexOf("/backend/");
    const path = index < 0 ? "" : target.slice(index);
    return /^\/backend\/(?:src|supabase\/functions)\/[A-Za-z0-9_./-]+$/u.test(path) ? path.slice(0, 192) : "[target redacted]";
  };
  for (const line of bounded.split("\n")) {
    const before = excerpt.size;
    const target = missingTarget(line);
    if (target) excerpt.add(`Module not found: ${safeTarget(target)}`);
    for (const [pattern, category] of [
      [/integrity check failed/iu, "dependency integrity check failed"], [/failed to (?:create|build).*graph/iu, "module graph failed"],
      [/failed to parse|syntaxerror/iu, "module parse failed"], [/panicked at|path seems to be invalid/iu, "runtime/extraction panic"],
      [/permission denied/iu, "permission denied"], [/no such file or directory/iu, "file unavailable"],
      [/certificate|unknown issuer/iu, "TLS certificate failure"], [/connection refused/iu, "connection refused"],
      [/timed out|given time|timeout/iu, "timeout"], [/out of memory|allocation failed|heap limit|oomkilled/iu, "memory failure"],
      [/unexpected argument|unrecognized subcommand/iu, "unsupported runtime option"],
    ]) if (pattern.test(line)) excerpt.add(category);
    for (const code of line.match(/\b(?:TS\d{4}|EACCES|EROFS|ENOENT|ETIMEDOUT|ECONNREFUSED|ENOBUFS|ENOSPC)\b/gu) ?? []) excerpt.add(`diagnostic code: ${code}`);
    const status = /\b(?:HTTP(?:\/\d(?:\.\d)?)?\s+|status(?: code)?[ :=]+)([45]\d\d)\b/iu.exec(line);
    if (status) excerpt.add(`HTTP status: ${status[1]}`);
    if (target || excerpt.size > before) for (const url of line.match(/(?:https?|file):\/\/[^\s"'<>]+/gu) ?? []) excerpt.add(`target: ${safeTarget(url)}`);
  }
  return { excerpt: [...excerpt].slice(0, 6).map((line) => line.slice(0, 256)), outputTruncated: text.length > 32768, unrecognizedOutputOmitted: excerpt.size === 0 };
}

function main() {
  assert.equal(process.env.GITHUB_ACTIONS, "true", "Only the reviewed ephemeral CI venue may execute this helper");
  assert.equal(process.env.RUNNER_ENVIRONMENT, "github-hosted", "Shared/persistent runners are not allowed");
  const mode = process.argv[2] ?? "qualify";
  assert(["qualify", "--stack-baseline", "--stack-receipt"].includes(mode) && process.argv.length <= 3, "Unknown ownership/qualification mode");
  assert.equal(process.env.GITHUB_JOB, "connected-player-runtime");
  assert.match(process.env.GITHUB_RUN_ID ?? "", /^\d+$/u);
  assert.match(process.env.GITHUB_RUN_ATTEMPT ?? "", /^\d+$/u);
  assert(!process.env.DOCKER_HOST && !process.env.DOCKER_CONTEXT && !process.env.DOCKER_TLS_VERIFY, "Remote/custom Docker context is not allowed");
  const repo = realpathSync(fileURLToPath(new URL("../", import.meta.url)));
  assert.equal(realpathSync(process.env.GITHUB_WORKSPACE), repo);
  const backend = join(repo, "backend");
  const functions = join(backend, "supabase/functions");
  const lock = join(backend, LOCK);
  const originalLock = readFileSync(lock);
  assert.equal(hash(originalLock), "66b40862285f9bd9a7426a48671427cde664f17043f02ad88ba4eef85979423b", "Reviewed frozen lock bytes changed");
  const originalModule = readFileSync(join(backend, TSLIB_FILE));
  const configs = trustedTslibConfigs(backend);
  const slugs = configs.slice(1).map((config) => dirname(config).split("/").at(-1));
  assert.equal(slugs.length, 28, "Review changes to the current root inventory");
  for (const slug of slugs) assert(!existsSync(join(functions, slug, "package.json")), "Review package-json discovery before qualifying a new root");
  assert.equal(JSON.parse(readFileSync(join(repo, "package.json"))).devDependencies.supabase, "2.109.1");
  assert.equal(JSON.parse(readFileSync(join(repo, "node_modules/supabase/package.json"))).version, "2.109.1");
  const override = join(backend, "supabase/.temp/edge-runtime-version");
  assert(!existsSync(override) || readFileSync(override, "utf8").trim() === "1.74.2", "Unexpected runtime override");
  const config = readFileSync(join(backend, "supabase/config.toml"), "utf8");
  const projects = [...config.matchAll(/^project_id\s*=\s*"([A-Za-z0-9_-]+)"\s*$/gmu)];
  assert.equal(projects.length, 1); assert.equal(projects[0][1], "econovaria");
  const binding = { sourceSha: process.env.RELEASE_COMMIT, project: projects[0][1], configHash: hash(config), workspace: repo, runId: process.env.GITHUB_RUN_ID, attempt: process.env.GITHUB_RUN_ATTEMPT, job: process.env.GITHUB_JOB };
  const journalPath = join(realpathSync(process.env.RUNNER_TEMP), "econovaria-tslib-stack-ownership.json");
  const env = Object.fromEntries(["PATH", "HOME", "TMPDIR", "SSL_CERT_FILE", "SSL_CERT_DIR", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "no_proxy", "all_proxy"].filter((key) => process.env[key] !== undefined).map((key) => [key, process.env[key]]));
  Object.assign(env, { NO_COLOR: "1", DENO_NO_PROMPT: "1" });
  const work = mkdtempSync(join(tmpdir(), "econovaria-tslib-bundle-"));
  const owner = randomBytes(12).toString("hex");
  const deadline = Date.now() + 25 * 60 * 1000;
  const receipt = { candidate: process.env.RELEASE_COMMIT, cli: "2.109.1", runtime: "1.74.2", lockSha256: hash(originalLock), localHelperSha256: TSLIB_SHA256, graphs: [], bundles: [], controls: [], failures: [], cleanup: "pending" };
  const run = (command, args, options = {}) => {
    const { cleanup = false, ...spawnOptions } = options;
    const timeout = cleanup ? 20000 : Math.min(180000, deadline - Date.now());
    assert(timeout > 0, "Bundle qualification time budget exhausted");
    const result = spawnSync(command, args, { cwd: repo, env, encoding: "utf8", timeout, maxBuffer: 16 * 1024 * 1024, ...spawnOptions });
    const expectedAbsent = cleanup && args[0] === "inspect" && !result.error && result.status === 1 && /no such (object|container)/iu.test(result.stderr);
    if ((result.error || result.status !== 0) && !expectedAbsent) {
      result.failureReceipt = { phase: receipt.phase ?? "preflight", program: basename(command), operation: args.find((arg) => ["bundle", "unbundle", "--version"].includes(arg)) ?? basename(args[0]), status: result.status, signal: result.signal, processError: result.error?.code, stdoutBytes: Buffer.byteLength(result.stdout ?? ""), stderrBytes: Buffer.byteLength(result.stderr ?? ""), ...failureExcerpt(`${result.stderr ?? ""}\n${result.stdout ?? ""}`), expected: false };
      receipt.failures.push(result.failureReceipt);
      if (receipt.failures.length > 8) receipt.failures.shift();
    }
    return result;
  };
  const ok = (command, args, options) => {
    const result = run(command, args, options);
    assert(!result.error && result.status === 0, `${command} ${args[0]} failed (exit ${result.status}, ${result.error?.code ?? "no process error"})`);
    return result.stdout.trim();
  };
  const inventory = (cleanup = false) => {
    const rows = [];
    for (const kind of ["container", "volume", "network"]) {
      const ids = ok("docker", [kind, "ls", ...(kind === "container" ? ["-a"] : []), "-q"], { cleanup }).split(/\s+/u).filter(Boolean);
      assert(ids.length <= 32, "Unexpected resource census in ephemeral job");
      for (const id of ids) {
        const format = `{ "name": {{json .Name}}, "labels": {{json ${kind === "container" ? ".Config.Labels" : ".Labels"}}}, "created": {{json ${kind === "volume" ? ".CreatedAt" : ".Created"}}}${kind === "volume" ? "" : ', "id": {{json .Id}}'} }`;
        const row = JSON.parse(ok("docker", [kind, "inspect", id, "--format", format], { cleanup }));
        row.name = row.name.replace(/^\//u, ""); rows.push({ kind, ...row, key: `${kind}:${row.id || row.name}` });
      }
    }
    return rows.sort((left, right) => left.key.localeCompare(right.key));
  };
  let stackJournal;
  let serial = 0;
  const container = (image, args, source, output, network = "bridge") => {
    const name = `econovaria-tslib-${owner}-${serial++}`;
    const mounts = source ? ["--mount", `type=bind,src=${source},dst=/source,readonly`, "--mount", `type=bind,src=${output},dst=/output`] : [];
    try {
      return run("docker", ["run", "--rm", "--pull=never", "--name", name, "--label", `econovaria.ts-lib-owner=${owner}`, "--user", `${process.getuid()}:${process.getgid()}`, "--read-only", "--network", network, "--tmpfs", "/cache:rw,mode=1777", "--tmpfs", "/tmp:rw,mode=1777", "-e", "DENO_DIR=/cache", "-e", "DENO_NO_PACKAGE_JSON=1", ...mounts, image, ...args]);
    } finally {
      const found = run("docker", ["inspect", "--type", "container", name], { cleanup: true });
      if (found.status === 0) {
        const [item] = JSON.parse(found.stdout);
        assert.equal(item.Config.Labels["econovaria.ts-lib-owner"], owner, "Do not clean up an unowned container");
        assert.equal(item.Image, image);
        if (item.State.Running) ok("docker", ["stop", "--time", "5", item.Id], { cleanup: true });
        ok("docker", ["rm", item.Id], { cleanup: true });
      } else {
        assert(!found.error && /no such (object|container)/iu.test(found.stderr), "Container cleanup outcome uncertain");
      }
    }
  };
  try {
    assert.match(receipt.candidate ?? "", /^[a-f0-9]{40}$/u);
    assert.equal(ok("git", ["rev-parse", "HEAD"]), receipt.candidate);
    assert.equal(ok(join(repo, "node_modules/.bin/supabase"), ["--version"]), "2.109.1");
    assert.match(ok("deno", ["--version"]), /^deno 2\.9\.3\b/u);
    assert.equal(JSON.parse(ok("docker", ["context", "inspect", "--format", "{{json .Endpoints.docker.Host}}"])), "unix:///var/run/docker.sock");
    receipt.phase = mode;
    if (mode === "--stack-baseline") {
      const before = inventory();
      assert(!before.some((row) => row.name.endsWith(`_${binding.project}`) || row.labels?.["com.supabase.cli.project"] === binding.project), "Preexisting project resources");
      writeFileSync(journalPath, JSON.stringify({ schemaVersion: 1, status: "baseline", binding, startedAt: new Date().toISOString(), before }), { flag: "wx", mode: 0o600 });
      receipt.status = "stack-baseline-recorded"; return;
    }
    const journal = JSON.parse(readFileSync(journalPath, "utf8"));
    assert.deepEqual(journal.binding, binding, "Ownership receipt is not from this job/source/config");
    const current = inventory();
    if (mode === "--stack-receipt") {
      assert.equal(journal.status, "baseline");
      journal.owned = ownedDelta(journal.before, current, binding.project);
      const rows = journal.owned.filter((row) => row.kind === "container" && row.name === `supabase_edge_runtime_${binding.project}`);
      assert.equal(rows.length, 1); journal.runtimeId = rows[0].id; journal.status = "stack-owned";
    } else assert(journal.imageIdentity, "Missing verified stack-image receipt");
    assert.match(journal.runtimeId, /^[a-f0-9]{64}$/u);
    const [runtime] = JSON.parse(ok("docker", ["inspect", "--type", "container", journal.runtimeId]));
    assert.match(runtime.Image, /^sha256:[a-f0-9]{64}$/u);
    const [image] = JSON.parse(ok("docker", ["image", "inspect", runtime.Image]));
    const selected = selectOwnedStackImage(journal, current, runtime, image, binding);
    if (mode === "--stack-receipt") {
      journal.imageIdentity = selected;
      writeFileSync(journalPath, JSON.stringify(journal), { mode: 0o600 });
      receipt.status = "stack-ownership-recorded"; receipt.stackImage = selected; return;
    }
    assert.deepEqual(selected, journal.imageIdentity, "Recorded stack image changed");
    stackJournal = journal;
    const version = container(image.Id, ["--version"], null, null, "none");
    assert(!version.error && version.status === 0 && /\b1\.74\.2\b/u.test(version.stdout), "Runtime binary version mismatch");
    Object.assign(receipt, { image: image.Id, imageDigests: selected.digests, stackImage: selected, deno: "2.9.3", runtimeOverride: existsSync(override) ? "matching" : "absent" });
    const graphEnv = { ...env, DENO_DIR: join(work, "fresh-deno-cache") };
    // Preserve the existing three-family CI typecheck command and frozen operands.
    ok(process.execPath, [join(backend, "scripts/typecheckAllEdgeRoots.mjs")], { env: graphEnv });
    const localUrl = pathToFileURL(join(backend, TSLIB_FILE)).href;
    const sourceFiles = new Set([lock, join(backend, TSLIB_FILE), join(backend, NEUTRAL), ...configs]);
    const byRoot = new Map();
    for (const slug of slugs) {
      const adjacent = join(functions, slug, "deno.json");
      const selected = [adjacent, ...(["admin-api", "classroom-api"].includes(slug) ? [] : [join(backend, NEUTRAL)])];
      for (const config of selected) {
        receipt.phase = `graph:${slug}:${relative(repo, config)}`;
        const graph = JSON.parse(ok("deno", ["info", "--json", "--frozen", `--lock=${lock}`, `--config=${config}`, join(functions, slug, "index.ts")], { env: graphEnv }));
        const summary = inspectSdkGraph(graph, localUrl);
        receipt.graphs.push({ slug, config: relative(repo, config), ...summary });
        if (config === adjacent) byRoot.set(slug, summary);
        else assert.equal(summary.resolutionSha256, byRoot.get(slug).resolutionSha256, `${slug}: CI and adjacent config graphs differ`);
        for (const module of graph.modules) if (module.specifier.startsWith("file:")) sourceFiles.add(fileURLToPath(module.specifier));
      }
    }
    const source = join(work, "source");
    for (const file of sourceFiles) {
      assert(file.startsWith(`${repo}/`) && realpathSync(file).startsWith(`${repo}/`) && lstatSync(file).isFile(), "Only real repository source files may be copied");
      const target = join(source, relative(repo, file));
      mkdirSync(dirname(target), { recursive: true }); copyFileSync(file, target);
    }
    assert.equal(hash(readFileSync(join(source, "backend", TSLIB_FILE))), TSLIB_SHA256);
    assert.deepEqual(readFileSync(join(source, "backend", LOCK)), originalLock);
    const bundle = (slug, tree, label) => {
      const output = join(work, label); mkdirSync(output);
      const result = container(image.Id, ["bundle", "--entrypoint", `/source/backend/supabase/functions/${slug}/index.ts`, "--output", "/output/root.eszip", "--timeout", "120"], tree, output);
      return { result, output };
    };
    const files = (folder) => readdirSync(folder, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(join(folder, entry.name)) : [join(folder, entry.name)]);
    for (const slug of slugs) {
      receipt.phase = `bundle:${slug}`;
      const { result, output } = bundle(slug, source, `positive-${slug}`);
      assert(!result.error && result.status === 0, `${slug}: actual runtime bundle failed`);
      const unpacked = container(image.Id, ["unbundle", "--eszip", "/output/root.eszip", "--output", "/output/extracted"], source, output, "none");
      assert(!unpacked.error && unpacked.status === 0, `${slug}: positive extraction failed`);
      const helper = files(join(output, "extracted")).filter((file) => file.endsWith("/_shared/vendor/tslib-2.8.1/tslib.mjs"));
      if (byRoot.get(slug).tslibEdges) {
        assert.equal(helper.length, 1, `${slug}: emitted local helper missing`);
        assert(readFileSync(helper[0]).length > 0, `${slug}: empty emitted helper`);
      }
      receipt.bundles.push({ slug, dependency: byRoot.get(slug).dependency, emittedHelper: helper.map((file) => ({ bytes: readFileSync(file).length, sha256: hash(readFileSync(file)) })), proof: "positive local presence only; not a complete ESZIP index" });
    }
    const strict = slugs.find((slug) => !["admin-api", "classroom-api"].includes(slug) && byRoot.get(slug).tslibEdges && byRoot.get(slug).sdk);
    assert(strict, "No strict-default SDK-bearing representative");
    for (const slug of ["admin-api", "classroom-api", strict]) {
      receipt.phase = `missing-local-control:${slug}`;
      assert(byRoot.get(slug).tslibEdges && byRoot.get(slug).sdk, `${slug}: control must use the real SDK dependency`);
      const tree = join(work, `missing-${slug}`); cpSync(source, tree, { recursive: true });
      const missing = join(tree, "backend", TSLIB_FILE);
      assert.equal(hash(readFileSync(missing)), TSLIB_SHA256); rmSync(missing);
      const { result } = bundle(slug, tree, `negative-${slug}`);
      assert(expectedLocalFailure(result, `/source/backend/${TSLIB_FILE}`), `${slug}: missing helper did not fail at the expected LOCAL path`);
      result.failureReceipt.expected = true;
      receipt.controls.push({ slug, missingLocalPath: `/source/backend/${TSLIB_FILE}`, expectedFailure: true, freshContainerAndCache: true });
    }
    receipt.acceptance = "Original dependency resolves to the byte-identical local implementation through actual CI/deploy-mode config";
    receipt.status = "passed";
  } catch (error) {
    receipt.status = "failed";
    receipt.failure = { name: error.name, ...failureExcerpt(error.message) };
    throw error;
  } finally {
    try {
      assert.equal(ok("docker", ["ps", "-aq", "--filter", `label=econovaria.ts-lib-owner=${owner}`], { cleanup: true }), "", "Owned containers remain; preserve source copies for inspection");
      if (stackJournal) {
        const current = inventory(true);
        const [runtime] = JSON.parse(ok("docker", ["inspect", "--type", "container", stackJournal.runtimeId], { cleanup: true }));
        const [image] = JSON.parse(ok("docker", ["image", "inspect", stackJournal.imageIdentity.imageId], { cleanup: true }));
        assert.deepEqual(selectOwnedStackImage(stackJournal, current, runtime, image, binding), stackJournal.imageIdentity, "Application stack/image changed");
        receipt.applicationStackUnchanged = true;
      }
      rmSync(work, { recursive: true });
      receipt.cleanup = "owned containers and temporary copies removed";
      assert.deepEqual(readFileSync(lock), originalLock, "Original frozen lock changed");
      assert.deepEqual(readFileSync(join(backend, TSLIB_FILE)), originalModule, "Original vendor bytes changed");
    } catch (error) {
      receipt.status = "failed";
      receipt.cleanup = "blocked or uncertain; no forced cleanup";
      receipt.cleanupFailure = { name: error.name, ...failureExcerpt(error.message) };
      throw error;
    } finally { console.log(`${mode === "qualify" ? "TSLIB_BUNDLE_QUALIFICATION" : "TSLIB_STACK_RESOURCE_RECEIPT"} ${JSON.stringify(receipt)}`); }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); } catch {
    console.error("TSLIB_BUNDLE_FAILURE: qualification failed; see the bounded structured receipt. Raw output omitted.");
    process.exitCode = 1;
  }
}

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildImmutableRelease } from "./release-platform-index.mjs";

const TSLIB_URL = "https://esm.sh/tslib@2.8.1/denonext/tslib.mjs";
const TSLIB_FILE = "backend/supabase/functions/_shared/vendor/tslib-2.8.1/tslib.mjs";
const TSLIB_SHA256 = "c38da5dd6da6281964435002ce204cd586634fe3bdfb24a0ee116f48cf3292e9";
const FUNCTIONS = new URL("../backend/supabase/functions/", import.meta.url);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function write(root, relativePath, content) {
  const absolute = path.join(root, relativePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, content);
}

function git(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

async function releaseRepository() {
  const root = await mkdtemp(path.join(os.tmpdir(), "econovaria-build-"));
  await write(root, "index.html", "<!doctype html><title>Player</title>\n");
  await write(root, "frontend/app.js", "export const api = '/functions/v1/classroom-api';\n");
  await write(root, "admin/app.js", "export const api = '/functions/v1/admin-api';\n");
  await write(root, "player-terminal/host-runtime.js", "export const api = '/functions/v1/classroom-api';\n");
  await write(root, "auth/reset-password.js", "export const api = '/auth/v1/recover';\n");
  await write(root, "assets/icon.svg", "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>\n");
  await write(root, "backend/supabase/migrations/20260101000000_init.sql", "select 1;\n");
  for (const entry of await readdir(FUNCTIONS, { withFileTypes: true })) {
    if (!entry.isDirectory() || !existsSync(new URL(`${entry.name}/index.ts`, FUNCTIONS))) continue;
    const config = await readFile(new URL(`${entry.name}/deno.json`, FUNCTIONS));
    await write(root, `backend/supabase/functions/${entry.name}/index.ts`, "export default true;\n");
    await write(root, `backend/supabase/functions/${entry.name}/deno.json`, config);
  }
  await write(root, "backend/supabase/functions/_shared/helper.ts", "export const shared = true;\n");
  await write(root, "backend/supabase/functions/deno.json", await readFile(new URL("deno.json", FUNCTIONS)));
  await write(root, TSLIB_FILE, await readFile(new URL("_shared/vendor/tslib-2.8.1/tslib.mjs", FUNCTIONS)));
  await write(root, "backend/supabase/functions/_shared/vendor/tslib-2.8.1/LICENSE", await readFile(new URL("_shared/vendor/tslib-2.8.1/LICENSE", FUNCTIONS)));
  await write(root, "docs/operations/release-configuration.v1.json", JSON.stringify({
    schemaVersion: 1,
    configurationVersion: "2026-07-20.1",
    featureFlags: { betaReleaseApproved: false },
  }, null, 2));
  await write(root, "docs/operations/production-manifest-2026-07-17.json", JSON.stringify({
    supabase: { projectRef: "prodprojectref" },
    externalRuntime: { cloudflareWorkerOrigin: "https://legacy.example.workers.dev" },
  }, null, 2));
  git(root, ["init"]);
  git(root, ["config", "user.name", "Release Test"]);
  git(root, ["config", "user.email", "release-test@example.invalid"]);
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "fixture"]);
  return { root, commit: git(root, ["rev-parse", "HEAD"]) };
}

function archiveEntries(archivePath) {
  const result = spawnSync("tar", ["-tzf", archivePath], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`unable to inspect frontend archive: ${result.stderr}`);
  return result.stdout.split("\n").filter(Boolean);
}

test("release builder produces identical complete browser and Edge archive hashes", async (t) => {
  const tarHelp = spawnSync("tar", ["--help"], { encoding: "utf8" });
  if (tarHelp.status !== 0 || !tarHelp.stdout.includes("--sort")) {
    t.skip("GNU tar is required for deterministic release archives");
    return;
  }

  const fixture = await releaseRepository();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const previousWorkflow = process.env.GITHUB_WORKFLOW;
  const previousRunId = process.env.GITHUB_RUN_ID;
  const previousAttempt = process.env.GITHUB_RUN_ATTEMPT;
  process.env.GITHUB_WORKFLOW = "Release Artifact Build";
  process.env.GITHUB_RUN_ID = "123";
  process.env.GITHUB_RUN_ATTEMPT = "1";
  t.after(() => {
    if (previousWorkflow === undefined) delete process.env.GITHUB_WORKFLOW;
    else process.env.GITHUB_WORKFLOW = previousWorkflow;
    if (previousRunId === undefined) delete process.env.GITHUB_RUN_ID;
    else process.env.GITHUB_RUN_ID = previousRunId;
    if (previousAttempt === undefined) delete process.env.GITHUB_RUN_ATTEMPT;
    else process.env.GITHUB_RUN_ATTEMPT = previousAttempt;
  });

  const firstRoot = path.join(fixture.root, "dist/release-one");
  const secondRoot = path.join(fixture.root, "dist/release-two");
  const first = await buildImmutableRelease({
    repoRoot: fixture.root,
    outputRoot: firstRoot,
    commit: fixture.commit,
    configurationPath: "docs/operations/release-configuration.v1.json",
  });
  const second = await buildImmutableRelease({
    repoRoot: fixture.root,
    outputRoot: secondRoot,
    commit: fixture.commit,
    configurationPath: "docs/operations/release-configuration.v1.json",
  });

  assert.equal(first.artifactSetSha256, second.artifactSetSha256);
  assert.deepEqual(
    first.artifacts.map(({ file, sha256, sizeBytes }) => ({ file, sha256, sizeBytes })),
    second.artifacts.map(({ file, sha256, sizeBytes }) => ({ file, sha256, sizeBytes })),
  );
  const entries = archiveEntries(path.join(firstRoot, "artifacts/frontend.tar.gz"));
  assert(entries.some((entry) => entry.endsWith("player-terminal/host-runtime.js")));
  assert(entries.some((entry) => entry.endsWith("auth/reset-password.js")));
  assert.equal(first.environmentNeutrality.status, "pass");
  assert.deepEqual(first.environmentNeutrality.scannedRoots, [
    "index.html",
    "frontend",
    "admin",
    "player-terminal",
    "auth",
  ]);
  assert.equal(first.source.commit, fixture.commit);
  const edgeArtifacts = first.artifacts.filter((artifact) => artifact.kind === "edge-function");
  assert.equal(edgeArtifacts.length, 28, "All current Edge roots need an archive-resolution check");
  for (const artifact of edgeArtifacts) {
    const archive = path.join(firstRoot, artifact.file);
    const file = (name) => {
      const result = spawnSync("tar", ["-xOzf", archive, `./${name}`], { encoding: null });
      assert.equal(result.status, 0, `Missing ${name} in ${artifact.name} archive`);
      return result.stdout;
    };
    const configPath = `backend/supabase/functions/${artifact.name}/deno.json`;
    const config = JSON.parse(file(configPath).toString("utf8"));
    assert.deepEqual(config.imports, { [TSLIB_URL]: "../_shared/vendor/tslib-2.8.1/tslib.mjs" });
    assert.equal(path.posix.normalize(path.posix.join(path.posix.dirname(configPath), config.imports[TSLIB_URL])), TSLIB_FILE);
    assert.equal(digest(file(TSLIB_FILE)), TSLIB_SHA256, `${artifact.name} archive changed accepted module bytes`);
    assert.equal(digest(file("backend/supabase/functions/_shared/vendor/tslib-2.8.1/LICENSE")), "210b19e543130388c68654b7497e967119ce17145f66ab7d85688fbd70f08751");
  }
});

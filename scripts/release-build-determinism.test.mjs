import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildImmutableRelease } from "./release-platform-index.mjs";

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
  await write(root, "assets/icon.svg", "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>\n");
  await write(root, "backend/supabase/migrations/20260101000000_init.sql", "select 1;\n");
  await write(root, "backend/supabase/functions/admin-api/index.ts", "export default true;\n");
  await write(root, "backend/supabase/functions/_shared/helper.ts", "export const shared = true;\n");
  await write(root, "backend/supabase/functions/deno.json", "{}\n");
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

test("release builder produces identical frontend and Edge archive hashes", async (t) => {
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

  const first = await buildImmutableRelease({
    repoRoot: fixture.root,
    outputRoot: path.join(fixture.root, "dist/release-one"),
    commit: fixture.commit,
    configurationPath: "docs/operations/release-configuration.v1.json",
  });
  const second = await buildImmutableRelease({
    repoRoot: fixture.root,
    outputRoot: path.join(fixture.root, "dist/release-two"),
    commit: fixture.commit,
    configurationPath: "docs/operations/release-configuration.v1.json",
  });

  assert.equal(first.artifactSetSha256, second.artifactSetSha256);
  assert.deepEqual(
    first.artifacts.map(({ file, sha256, sizeBytes }) => ({ file, sha256, sizeBytes })),
    second.artifacts.map(({ file, sha256, sizeBytes }) => ({ file, sha256, sizeBytes })),
  );
  assert.equal(first.environmentNeutrality.status, "pass");
  assert.equal(first.source.commit, fixture.commit);
});

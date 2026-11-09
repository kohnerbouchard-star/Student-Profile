#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { loadRepositoryMigrations } from "./reconcile-migrations.mjs";
import { assertImmutable, digest } from "./phase15-audit.mjs";

const contractPath = "docs/operations/contracts/database-parity-v1.json";
const contract = JSON.parse(await readFile(contractPath, "utf8"));
const source = await loadRepositoryMigrations(resolve("backend/supabase/migrations"));
const current = source.map(row => ({ ...row, sha256: row.repositorySha256 }));
const baseline = JSON.parse(await readFile(contract.canonicalManifest, "utf8"));
if (digest(baseline.migrations) !== contract.canonicalManifestSha256) throw new Error("BASELINE_DIGEST_MISMATCH");
if (baseline.sourceCommit !== contract.canonicalSourceCommit) throw new Error("BASELINE_SOURCE_MISMATCH");
assertImmutable(baseline.migrations, current);

// Bind every frozen checksum to Git, so editing the manifest with SQL cannot
// silently rewrite history. This contains source bytes only, never credentials.
const { createHash } = await import("node:crypto");
for (const row of baseline.migrations) {
  const bytes = execFileSync("git", ["show", `${contract.canonicalSourceCommit}:${row.path}`], { maxBuffer: 16 * 1024 * 1024 });
  if (createHash("sha256").update(bytes).digest("hex") !== row.sha256) throw new Error(`BASELINE_GIT_MISMATCH:${row.version}`);
}

// Enforce the base branch's frozen baseline too. A candidate cannot bypass the
// ratchet by removing rows from, or replacing, its own manifest/contract.
if (process.env.GITHUB_EVENT_NAME === "pull_request") {
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
  const base = event.pull_request.base.sha;
  const listing = execFileSync("git", ["ls-tree", "--name-only", base, "--", contractPath], { encoding: "utf8" }).trim();
  if (listing) {
    const prior = JSON.parse(execFileSync("git", ["show", `${base}:${contractPath}`], { encoding: "utf8" }));
    const frozen = JSON.parse(execFileSync("git", ["show", `${base}:${prior.canonicalManifest}`], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }));
    if (digest(frozen.migrations) !== prior.canonicalManifestSha256) throw new Error("BASE_BRANCH_BASELINE_INVALID");
    assertImmutable(frozen.migrations, current);
  }
}
console.log(`Immutable migration baseline passed: ${baseline.migrations.length} frozen, ${current.length} current.`);

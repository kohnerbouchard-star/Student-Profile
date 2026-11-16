#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadRepositoryMigrations } from "./reconcile-migrations.mjs";

export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
export const digest = value => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");

export function assertImmutable(baseline, current) {
  const byVersion = new Map(current.map(row => [row.version, row]));
  for (const row of baseline) {
    const next = byVersion.get(row.version);
    if (!next || next.name !== row.name || next.sha256 !== row.sha256) throw new Error(`IMMUTABLE_MIGRATION_CHANGED:${row.version}`);
  }
  const frozen = new Set(baseline.map(row => row.version));
  const head = [...frozen].sort().at(-1);
  for (const row of current) if (!frozen.has(row.version) && row.version <= head) throw new Error(`MIGRATION_NOT_FORWARD_ONLY:${row.version}`);
}

export function classify(repository, live) {
  const repoByVersion = new Map(repository.map(row => [row.version, row]));
  const liveByVersion = new Map();
  for (const row of live) {
    if (!/^\d{14}$/.test(row.version) || !row.name || liveByVersion.has(row.version)) throw new Error("INVALID_LIVE_MIGRATION_IDENTITY");
    liveByVersion.set(row.version, row);
  }
  const rows = repository.map(repo => {
    const exact = liveByVersion.get(repo.version);
    const candidates = live.filter(row => row.name === repo.name || row.name === `source_${repo.version}_${repo.name}`);
    const status = exact ? (exact.name === repo.name ? "EXACT_MATCH" : "CONFLICT") : candidates.length ? "UNKNOWN" : "REPO_PENDING";
    return { identity: `${repo.version}_${repo.name}`, origin: "repository", status,
      liveIdentities: (exact ? [exact] : candidates).map(row => `${row.version}_${row.name}`),
      effectReview: status === "EXACT_MATCH" ? "Identity only; effective schema must be compared." : status === "REPO_PENDING" ? "Candidate pending; absence is not permission to replay." : "Isolated schema-effect and data-effect proof required." };
  });
  for (const row of live) if (!repoByVersion.has(row.version)) {
    const candidates = repository.filter(repo => repo.name === row.name || row.name === `source_${repo.version}_${repo.name}`);
    rows.push({ identity: `${row.version}_${row.name}`, origin: "live", status: "LIVE_ONLY",
      repositoryCandidates: candidates.map(repo => `${repo.version}_${repo.name}`), understood: false,
      effectReview: "Preserve ledger. Content and effective-state review required; names are candidate links only." });
  }
  return { counts: Object.fromEntries(["EXACT_MATCH", "EQUIVALENT_RECONCILED", "REPO_PENDING", "LIVE_ONLY", "CONFLICT", "UNKNOWN"].map(status => [status, rows.filter(row => row.status === status).length])), rows };
}

async function main() {
  const [directory, outputDirectory] = process.argv.slice(2);
  if (!directory || !outputDirectory) throw new Error("Usage: phase15-audit.mjs REPOSITORY_ROOT EVIDENCE_DIRECTORY");
  const root = resolve(directory), out = resolve(outputDirectory);
  const source = await loadRepositoryMigrations(resolve(root, "backend/supabase/migrations"));
  const migrations = source.map((row, index) => ({ version: row.version, name: row.name, filename: row.filename,
    path: relative(root, row.path).replaceAll("\\", "/"), sha256: row.repositorySha256, position: index + 1 }));
  const contract = JSON.parse(await readFile(resolve(root, "docs/operations/contracts/database-parity-v1.json"), "utf8"));
  const baseline = JSON.parse(await readFile(resolve(root, contract.canonicalManifest), "utf8"));
  if (digest(baseline.migrations) !== contract.canonicalManifestSha256) throw new Error("CANONICAL_MANIFEST_DIGEST_MISMATCH");
  assertImmutable(baseline.migrations, migrations);
  await mkdir(out, { recursive: true });
  const write = (name, value) => writeFile(resolve(out, name), JSON.stringify(value, null, 2) + "\n");
  const environments = {};
  for (const name of ["staging", "production"]) {
    const ledger = JSON.parse(await readFile(resolve(out, `${name}-migration-ledger.json`), "utf8"));
    environments[name] = classify(migrations, ledger.migrations);
  }
  await write("three-way-classification.json", { schemaVersion: 1, sourceCommit: baseline.sourceCommit,
    status: "BLOCKED", scope: "Identity classification is preliminary; no equivalence or convergence is certified.", environments });
  await write("manifest-validation.json", { schemaVersion: 1, migrationCount: migrations.length,
    manifestSha256: digest(migrations), uniqueVersions: true, uniqueIdentities: true,
    validSqlFilenames: true, deterministicOrdering: true, immutableBaseline: "PASS" });
  console.log(JSON.stringify({ manifest: digest(migrations), migrationCount: migrations.length,
    classification: Object.fromEntries(Object.entries(environments).map(([key, value]) => [key, value.counts])),
    gate: "BLOCKED" }, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });

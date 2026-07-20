#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";

const MIGRATION_RE = /^(\d{14})_(.+)\.sql$/;

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    if (key === "self-test") {
      args.selfTest = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
    args[key] = value;
    index += 1;
  }
  return args;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function normalizeLiveMigrations(snapshot) {
  const candidates = Array.isArray(snapshot)
    ? snapshot
    : snapshot.migrations ?? snapshot.migration_history ?? snapshot.schema?.migrations;
  if (!Array.isArray(candidates)) {
    throw new Error("Live snapshot must contain a migrations array.");
  }

  return candidates.map((row) => ({
    version: String(row.version ?? row.repository_version ?? "").trim(),
    name: String(row.name ?? row.migration_name ?? "").trim(),
    liveChecksum: row.live_checksum ?? row.statements_md5 ?? row.live_statement_md5 ?? null,
    repositorySha256: row.repository_sha256 ?? null,
    statementCount: Number(row.statement_count ?? 0),
  }));
}

function assertUnique(rows, label) {
  const seen = new Map();
  for (const row of rows) {
    if (!/^\d{14}$/.test(row.version)) {
      throw new Error(`${label} contains invalid migration version: ${row.version}`);
    }
    const existing = seen.get(row.version);
    if (existing) {
      throw new Error(`${label} contains duplicate version ${row.version}: ${existing.name} and ${row.name}`);
    }
    seen.set(row.version, row);
  }
}

async function loadRepositoryMigrations(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const rows = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const match = MIGRATION_RE.exec(entry.name);
    if (!match) continue;
    const path = join(directory, entry.name);
    const bytes = await readFile(path);
    rows.push({
      version: match[1],
      name: match[2],
      filename: entry.name,
      path,
      repositorySha256: sha256(bytes),
    });
  }
  rows.sort((left, right) => left.version.localeCompare(right.version));
  assertUnique(rows, "Repository");
  return rows;
}

function reconcile(repositoryRows, liveRows) {
  assertUnique(liveRows, "Live ledger");
  const repositoryByVersion = new Map(repositoryRows.map((row) => [row.version, row]));
  const liveByVersion = new Map(liveRows.map((row) => [row.version, row]));
  const versions = [...new Set([...repositoryByVersion.keys(), ...liveByVersion.keys()])].sort();

  const rows = versions.map((version) => {
    const repository = repositoryByVersion.get(version);
    const live = liveByVersion.get(version);

    if (!repository) {
      return {
        version,
        repository: null,
        live,
        status: "live-only",
        contentReview: "requires review",
        recommendedDisposition:
          "Do not delete or rewrite the live ledger. Determine the originating change and reproduce it in an isolated copy before creating any forward-only repository correction.",
      };
    }

    if (!live) {
      return {
        version,
        repository,
        live: null,
        status: "repository-only",
        contentReview: "reviewed",
        recommendedDisposition:
          "Apply only in isolated staging in repository order. Capture clean replay, schema diff, runtime probes, rollback rehearsal, and approval before production promotion.",
      };
    }

    if (repository.name !== live.name) {
      return {
        version,
        repository,
        live,
        status: "divergent",
        contentReview: "requires review",
        recommendedDisposition:
          "Treat as migration identity drift. Do not mutate either ledger; reproduce the schema effect in isolation and define a forward-only correction.",
      };
    }

    const checksumComparable = Boolean(live.repositorySha256);
    const checksumMatches = checksumComparable
      ? repository.repositorySha256 === live.repositorySha256
      : null;

    return {
      version,
      repository,
      live,
      status: checksumMatches === false ? "divergent" : "matched",
      contentReview: checksumMatches === true ? "matched" : "requires review",
      recommendedDisposition:
        checksumMatches === false
          ? "Do not rewrite the live ledger. Reproduce the content difference in isolation and propose a forward-only correction."
          : "Retain the identity. Compare the clean-replay schema fingerprint with the live export before promotion.",
    };
  });

  const statusCounts = Object.fromEntries(
    [...new Set(rows.map((row) => row.status))]
      .sort()
      .map((status) => [status, rows.filter((row) => row.status === status).length]),
  );

  return {
    format: "econovaria-migration-reconciliation-v1",
    repositoryMigrationCount: repositoryRows.length,
    liveMigrationCount: liveRows.length,
    statusCounts,
    blocking: rows.some((row) => ["live-only", "divergent"].includes(row.status)),
    rows,
  };
}

async function selfTest() {
  const repository = [
    { version: "20260101000000", name: "one", filename: "20260101000000_one.sql", repositorySha256: "a" },
    { version: "20260102000000", name: "two", filename: "20260102000000_two.sql", repositorySha256: "b" },
  ];
  const live = [
    { version: "20260101000000", name: "one", repositorySha256: "a", liveChecksum: "x", statementCount: 1 },
    { version: "20260103000000", name: "live_only", liveChecksum: "y", statementCount: 1 },
  ];
  const result = reconcile(repository, live);
  if (result.statusCounts.matched !== 1) throw new Error("self-test: expected one matched row");
  if (result.statusCounts["repository-only"] !== 1) throw new Error("self-test: expected one repository-only row");
  if (result.statusCounts["live-only"] !== 1) throw new Error("self-test: expected one live-only row");
  if (!result.blocking) throw new Error("self-test: live-only row must block");
  process.stdout.write("reconcile-migrations self-test passed\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfTest) {
    await selfTest();
    return;
  }

  if (!args["repo-dir"] || !args["live-snapshot"] || !args.out) {
    throw new Error(
      "Usage: reconcile-migrations.mjs --repo-dir backend/supabase/migrations --live-snapshot live-schema.json --out reconciliation.json",
    );
  }

  const repositoryRows = await loadRepositoryMigrations(resolve(args["repo-dir"]));
  const liveSnapshot = JSON.parse(await readFile(resolve(args["live-snapshot"]), "utf8"));
  const liveRows = normalizeLiveMigrations(liveSnapshot);
  const result = reconcile(repositoryRows, liveRows);
  await writeFile(resolve(args.out), `${JSON.stringify(result, null, 2)}\n`, "utf8");

  process.stdout.write(
    `${JSON.stringify({
      repositoryMigrationCount: result.repositoryMigrationCount,
      liveMigrationCount: result.liveMigrationCount,
      statusCounts: result.statusCounts,
      blocking: result.blocking,
      output: resolve(args.out),
    }, null, 2)}\n`,
  );

  if (result.blocking) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});

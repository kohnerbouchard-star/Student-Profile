#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const options = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) fail(`Invalid argument near ${key ?? "<end>"}.`);
    options.set(key.slice(2), value);
  }
  return {
    migration: options.get("migration"),
    output: options.get("output"),
    mode: options.get("mode") ?? "rollback",
    createdBy: options.get("created-by") ?? "exact-migration-bundle-v1",
  };
}

function literal(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function dollarQuote(value, baseTag) {
  let suffix = 0;
  while (true) {
    const tag = suffix === 0 ? `$${baseTag}$` : `$${baseTag}_${suffix}$`;
    if (!value.includes(tag)) return `${tag}${value}${tag}`;
    suffix += 1;
  }
}

function parseMigration(source, migrationPath) {
  const fileName = path.basename(migrationPath);
  const match = /^(\d{14})_([a-z0-9_]+)\.sql$/u.exec(fileName);
  if (!match) fail(`Invalid migration filename: ${fileName}`);
  const normalized = source.replaceAll("\r\n", "\n");
  const lines = normalized.split("\n");
  const beginIndex = lines.findIndex((line) => line.trim().toLowerCase() === "begin;");
  let commitIndex = -1;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (!lines[index].trim()) continue;
    if (lines[index].trim().toLowerCase() === "commit;") commitIndex = index;
    break;
  }
  if (beginIndex < 0 || commitIndex <= beginIndex) fail(`${fileName} must have one outer BEGIN/COMMIT envelope.`);
  if (lines.slice(beginIndex + 1, commitIndex).some((line) => /^\s*(begin|commit);\s*$/iu.test(line))) {
    fail(`${fileName} contains a nested transaction boundary.`);
  }
  const body = lines.slice(beginIndex + 1, commitIndex).join("\n").trim();
  if (!body) fail(`${fileName} has an empty body.`);
  return {
    version: match[1],
    name: match[2],
    source: normalized,
    body,
    sha256: createHash("sha256").update(normalized, "utf8").digest("hex"),
    bytes: Buffer.byteLength(normalized, "utf8"),
  };
}

function verificationSql(migration, createdBy) {
  return `\\set ON_ERROR_STOP on\ndo $verify$\ndeclare\n  v_count integer;\n  v_sha text;\n  v_bytes integer;\n  v_name text;\n  v_created_by text;\n  v_key text;\nbegin\n  select count(*)::integer into v_count from supabase_migrations.schema_migrations where version = ${literal(migration.version)};\n  if v_count <> 1 then raise exception 'EXACT_MIGRATION_LEDGER_COUNT:%', v_count; end if;\n  select name, created_by, idempotency_key, encode(extensions.digest(pg_catalog.convert_to(coalesce(statements[1], ''), 'UTF8'), 'sha256'), 'hex'), octet_length(pg_catalog.convert_to(coalesce(statements[1], ''), 'UTF8'))\n    into v_name, v_created_by, v_key, v_sha, v_bytes\n    from supabase_migrations.schema_migrations where version = ${literal(migration.version)};\n  if v_name is distinct from ${literal(migration.name)} then raise exception 'EXACT_MIGRATION_NAME_MISMATCH'; end if;\n  if v_created_by is distinct from ${literal(createdBy)} then raise exception 'EXACT_MIGRATION_CREATED_BY_MISMATCH'; end if;\n  if v_key is distinct from ${literal(`${createdBy}:${migration.version}`)} then raise exception 'EXACT_MIGRATION_KEY_MISMATCH'; end if;\n  if v_sha is distinct from ${literal(migration.sha256)} or v_bytes is distinct from ${migration.bytes} then raise exception 'EXACT_MIGRATION_SOURCE_MISMATCH'; end if;\nend\n$verify$;\n`;
}

function bundleSql(migration, createdBy, mode) {
  const end = mode === "commit" ? "commit;" : "rollback;";
  return `\\set ON_ERROR_STOP on\nbegin;\nselect pg_advisory_xact_lock(hashtextextended(${literal(`econovaria:exact-migration:${migration.version}`)}, 0));\ndo $preflight$ begin if exists (select 1 from supabase_migrations.schema_migrations where version = ${literal(migration.version)}) then raise exception 'EXACT_MIGRATION_ALREADY_RECORDED:${migration.version}'; end if; end $preflight$;\n${migration.body}\ninsert into supabase_migrations.schema_migrations (version, statements, name, created_by, idempotency_key, rollback) values (${literal(migration.version)}, array[${dollarQuote(migration.source, `migration_${migration.version}`)}]::text[], ${literal(migration.name)}, ${literal(createdBy)}, ${literal(`${createdBy}:${migration.version}`)}, null);\n${end}\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.migration || !options.output) fail("--migration and --output are required.");
  if (!['rollback', 'commit', 'verify'].includes(options.mode)) fail("--mode must be rollback, commit, or verify.");
  if (!/^[a-z0-9][a-z0-9_.:-]{2,80}$/u.test(options.createdBy)) fail("Invalid --created-by value.");
  const source = await readFile(options.migration, "utf8");
  const migration = parseMigration(source, options.migration);
  const sql = options.mode === "verify" ? verificationSql(migration, options.createdBy) : bundleSql(migration, options.createdBy, options.mode);
  await writeFile(options.output, sql, "utf8");
  console.log(JSON.stringify({ ...migration, source: undefined, body: undefined, mode: options.mode, createdBy: options.createdBy, output: options.output }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

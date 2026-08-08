#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      fail(`Invalid argument sequence near ${key ?? "<end>"}.`);
    }
    args.set(key.slice(2), value);
  }
  return {
    migrationsDir: args.get("migrations-dir"),
    prefix: args.get("prefix") ?? "2026080612",
    output: args.get("output"),
    mode: args.get("mode") ?? "rollback",
    afterVersion: args.get("after-version") ?? "",
  };
}

function sqlLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function dollarQuote(value, baseTag) {
  let suffix = 0;
  while (true) {
    const tag = suffix === 0 ? `$${baseTag}$` : `$${baseTag}_${suffix}$`;
    if (!value.includes(tag)) return `${tag}${value}${tag}`;
    suffix += 1;
  }
}

function splitMigrationEnvelope(source, fileName) {
  const lines = source.replaceAll("\r\n", "\n").split("\n");
  const beginIndex = lines.findIndex((line) => line.trim().toLowerCase() === "begin;");
  let commitIndex = -1;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (!lines[index].trim()) continue;
    if (lines[index].trim().toLowerCase() === "commit;") commitIndex = index;
    break;
  }

  if (beginIndex < 0 || commitIndex < 0 || commitIndex <= beginIndex) {
    fail(`${fileName} must contain one outer BEGIN/COMMIT envelope.`);
  }
  if (lines.slice(beginIndex + 1, commitIndex).some((line) => /^\s*(begin|commit);\s*$/iu.test(line))) {
    fail(`${fileName} contains a nested transaction boundary.`);
  }

  const preamble = lines.slice(0, beginIndex).join("\n").trimEnd();
  const body = lines.slice(beginIndex + 1, commitIndex).join("\n").trim();
  if (!body) fail(`${fileName} has an empty migration body.`);
  return { preamble, body };
}

async function loadMigrations(migrationsDir, prefix) {
  if (!migrationsDir) fail("--migrations-dir is required.");
  const entries = await readdir(migrationsDir, { withFileTypes: true });
  const names = entries
    .filter((entry) => entry.isFile() && entry.name.startsWith(prefix) && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();

  if (names.length < 1) fail(`No migrations found for prefix ${prefix}.`);

  const migrations = [];
  const versions = new Set();
  for (const fileName of names) {
    const match = /^(\d{14})_([a-z0-9_]+)\.sql$/u.exec(fileName);
    if (!match) fail(`Invalid migration file name: ${fileName}`);
    const [, version, name] = match;
    if (versions.has(version)) fail(`Duplicate migration version: ${version}`);
    versions.add(version);
    const source = (await readFile(path.join(migrationsDir, fileName), "utf8")).replaceAll("\r\n", "\n");
    const envelope = splitMigrationEnvelope(source, fileName);
    migrations.push({
      fileName,
      version,
      name,
      source,
      sourceSha256: createHash("sha256").update(source, "utf8").digest("hex"),
      sourceBytes: Buffer.byteLength(source, "utf8"),
      ...envelope,
    });
  }
  return migrations;
}

function expectedDigestValues(migrations) {
  return migrations.map((migration) =>
    `(${sqlLiteral(migration.version)}, ${sqlLiteral(migration.name)}, ${sqlLiteral(migration.sourceSha256)}, ${migration.sourceBytes}, ${sqlLiteral(`economic-asset-core-v2:${migration.version}`)})`
  ).join(",\n    ");
}

function mismatchCtes(migrations, prefix, { allowMissingTail = false } = {}) {
  const expectedScope = allowMissingTail
    ? [
      "expected_scope as (",
      "  select e.*",
      "  from expected_ranked e",
      "  cross join remote_state s",
      "  where s.applied_through is not null",
      "    and e.version <= s.applied_through",
      "),",
    ]
    : [
      "expected_scope as (",
      "  select e.* from expected_ranked e",
      "),",
    ];

  return [
    "with expected(version, name, source_sha256, source_bytes, idempotency_key) as (",
    `  values\n    ${expectedDigestValues(migrations)}`,
    "),",
    "expected_ranked as (",
    "  select e.*, row_number() over (order by e.version) as sequence",
    "  from expected e",
    "),",
    "remote_state as (",
    "  select max(m.version) as applied_through",
    "  from supabase_migrations.schema_migrations m",
    `  where m.version like ${sqlLiteral(`${prefix}%`)}`,
    "),",
    ...expectedScope,
    "remote as (",
    "  select",
    "    m.* ,",
    "    row_number() over (order by m.version) as sequence,",
    "    encode(extensions.digest(pg_catalog.convert_to(coalesce(m.statements[1], ''), 'UTF8'), 'sha256'), 'hex') as source_sha256,",
    "    octet_length(pg_catalog.convert_to(coalesce(m.statements[1], ''), 'UTF8')) as source_bytes",
    "  from supabase_migrations.schema_migrations m",
    `  where m.version like ${sqlLiteral(`${prefix}%`)}`,
    "),",
    "mismatches as (",
    "  select",
    "    coalesce(r.version, e.version) as version,",
    "    e.sequence as expected_sequence,",
    "    r.sequence as remote_sequence,",
    "    e.name as expected_name,",
    "    r.name as remote_name,",
    "    e.source_sha256 as expected_sha256,",
    "    r.source_sha256 as remote_sha256,",
    "    e.source_bytes as expected_bytes,",
    "    r.source_bytes as remote_bytes,",
    "    r.created_by,",
    "    e.idempotency_key as expected_idempotency_key,",
    "    r.idempotency_key as remote_idempotency_key,",
    "    cardinality(r.statements) as statement_count",
    "  from expected_scope e",
    "  full join remote r on r.version = e.version",
    "  where e.version is null",
    "     or r.version is null",
    "     or r.sequence is distinct from e.sequence",
    "     or r.name is distinct from e.name",
    "     or cardinality(r.statements) is distinct from 1",
    "     or r.source_sha256 is distinct from e.source_sha256",
    "     or r.source_bytes is distinct from e.source_bytes",
    "     or r.created_by is distinct from 'economic-asset-core-v2'",
    "     or r.idempotency_key is distinct from e.idempotency_key",
    ")",
  ].join("\n");
}

function buildPrefixVerification(migrations, prefix) {
  const ctes = mismatchCtes(migrations, prefix, { allowMissingTail: true });
  return [
    "\\set ON_ERROR_STOP on",
    `${ctes}\nselect * from mismatches order by version;`,
    "do $economic_asset_prefix_verify$",
    "declare",
    "  v_invalid integer;",
    "  v_detail text;",
    "begin",
    `  ${ctes}`,
    "  select count(*)::integer, coalesce(jsonb_agg(to_jsonb(m) order by m.version)::text, '[]')",
    "  into v_invalid, v_detail",
    "  from mismatches m;",
    "  if v_invalid <> 0 then",
    "    raise exception 'ECONOMIC_ASSET_MIGRATION_PREFIX_MISMATCH:%', v_invalid",
    "      using errcode = 'P0001', detail = v_detail;",
    "  end if;",
    "end",
    "$economic_asset_prefix_verify$;",
    "",
    `select coalesce(max(version), '') as applied_through, count(*)::integer as applied_count from supabase_migrations.schema_migrations where version like ${sqlLiteral(`${prefix}%`)};`,
    "",
  ].join("\n");
}

function buildBundle(_allMigrations, selectedMigrations, transactionEnd) {
  if (transactionEnd !== "rollback" && transactionEnd !== "commit") {
    fail("Bundle mode must be rollback or commit.");
  }
  if (selectedMigrations.length === 0) {
    return "\\set ON_ERROR_STOP on\nselect 'ECONOMIC_ASSET_MIGRATION_TAIL_EMPTY' as outcome;\n";
  }

  const selectedVersions = selectedMigrations.map((migration) => sqlLiteral(migration.version)).join(", ");
  const output = [
    "\\set ON_ERROR_STOP on",
    "",
    "begin;",
    "select pg_advisory_xact_lock(hashtextextended('econovaria:economic-asset-core-v2', 0));",
    "",
    "do $economic_asset_preflight$",
    "declare",
    "  v_existing integer;",
    "begin",
    `  select count(*)::integer into v_existing from supabase_migrations.schema_migrations where version = any(array[${selectedVersions}]::text[]);`,
    "  if v_existing <> 0 then",
    "    raise exception 'ECONOMIC_ASSET_MIGRATION_TAIL_ALREADY_APPLIED:%', v_existing using errcode = 'P0001';",
    "  end if;",
    "end",
    "$economic_asset_preflight$;",
    "",
  ];

  for (const migration of selectedMigrations) {
    output.push(`-- BEGIN ${migration.fileName}`);
    if (migration.preamble) output.push(migration.preamble);
    output.push(migration.body);
    output.push(
      "insert into supabase_migrations.schema_migrations (",
      "  version, statements, name, created_by, idempotency_key, rollback",
      ") values (",
      `  ${sqlLiteral(migration.version)},`,
      `  array[${dollarQuote(migration.source, `migration_${migration.version}`)}]::text[],`,
      `  ${sqlLiteral(migration.name)},`,
      "  'economic-asset-core-v2',",
      `  ${sqlLiteral(`economic-asset-core-v2:${migration.version}`)},`,
      "  null",
      ");",
      `-- END ${migration.fileName}`,
      "",
    );
  }

  output.push(transactionEnd === "commit" ? "commit;" : "rollback;");
  output.push("");
  return output.join("\n");
}

function buildFullVerification(migrations, prefix) {
  const ctes = mismatchCtes(migrations, prefix);
  return [
    "\\set ON_ERROR_STOP on",
    `${ctes}\nselect * from mismatches order by version;`,
    "do $economic_asset_verify$",
    "declare",
    "  v_invalid integer;",
    "  v_detail text;",
    "begin",
    `  ${ctes}`,
    "  select count(*)::integer, coalesce(jsonb_agg(to_jsonb(m) order by m.version)::text, '[]')",
    "  into v_invalid, v_detail",
    "  from mismatches m;",
    "  if v_invalid <> 0 then",
    "    raise exception 'ECONOMIC_ASSET_MIGRATION_LEDGER_MISMATCH:%', v_invalid",
    "      using errcode = 'P0001', detail = v_detail;",
    "  end if;",
    "end",
    "$economic_asset_verify$;",
    "",
  ].join("\n");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.output) fail("--output is required.");
  if (!["rollback", "commit", "verify-prefix", "verify-full"].includes(options.mode)) {
    fail("--mode must be rollback, commit, verify-prefix, or verify-full.");
  }

  const migrations = await loadMigrations(options.migrationsDir, options.prefix);
  if (options.afterVersion && !/^\d{14}$/u.test(options.afterVersion)) {
    fail("--after-version must be empty or a 14-digit migration version.");
  }
  if (options.afterVersion && !migrations.some((migration) => migration.version === options.afterVersion)) {
    fail(`--after-version ${options.afterVersion} is not in the migration manifest.`);
  }
  const selected = options.afterVersion
    ? migrations.filter((migration) => migration.version > options.afterVersion)
    : migrations;

  const content = options.mode === "verify-prefix"
    ? buildPrefixVerification(migrations, options.prefix)
    : options.mode === "verify-full"
    ? buildFullVerification(migrations, options.prefix)
    : buildBundle(migrations, selected, options.mode);
  await writeFile(options.output, content, "utf8");
  process.stdout.write(JSON.stringify({
    output: options.output,
    prefix: options.prefix,
    migrationCount: migrations.length,
    selectedMigrationCount: selected.length,
    versions: migrations.map((migration) => migration.version),
    selectedVersions: selected.map((migration) => migration.version),
    sourceDigests: migrations.map((migration) => ({
      version: migration.version,
      sha256: migration.sourceSha256,
      bytes: migration.sourceBytes,
    })),
    mode: options.mode,
    afterVersion: options.afterVersion || null,
  }, null, 2) + "\n");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

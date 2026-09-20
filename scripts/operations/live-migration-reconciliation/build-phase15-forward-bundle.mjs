#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PHASE15_CUTOFF = "20260819062000";
export const PHASE15_COMMON_COUNT = 151;

export const PRODUCTION_PRELUDE = Object.freeze([
  "20260812081410_add_license_expiration_and_purge_confirmation_foundation_v1.sql",
  "20260812081833_restrict_game_purge_to_dedicated_permission_v1.sql",
  "20260812082207_harden_game_purge_grace_and_arm_binding_v1.sql",
  "20260812082436_add_game_purge_dispatch_state_machine_v1.sql",
  "20260812082727_add_resumable_game_purge_database_cursor_v1.sql",
  "20260812082927_add_atomic_game_purge_finalizer_v1.sql",
  "20260812082948_patch_game_purge_failure_recovery_v1.sql",
  "20260812103000_seed_meridian_customs_security_intrusion_v1.sql",
  "20260812111000_seed_meridian_security_center_attack_v1.sql",
  "20260812114000_seed_meridian_emergency_response_v1.sql",
  "20260813090000_add_durable_license_issuance_queue_v1.sql",
  "20260813091500_harden_license_email_idempotency_window_v1.sql",
  "20260813093000_add_license_issuance_scheduler_safety_switch_v1.sql",
  "20260813100000_harden_license_fulfillment_snapshots_v1.sql",
  "20260813103000_add_license_email_outbox_schema_v1.sql",
  "20260813103100_add_atomic_license_materialization_outbox_v2.sql",
  "20260813103200_add_durable_license_email_worker_queue_v1.sql",
  "20260813103300_add_license_delivery_operations_v1.sql",
]);

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../../..");
const migrationsDirectory = path.join(repositoryRoot, "backend/supabase/migrations");

function fail(message) {
  throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function skipLeadingTrivia(source) {
  let index = 0;
  while (index < source.length) {
    const whitespace = source.slice(index).match(/^\s+/u);
    if (whitespace) {
      index += whitespace[0].length;
      continue;
    }
    if (source.startsWith("--", index)) {
      const newline = source.indexOf("\n", index + 2);
      index = newline === -1 ? source.length : newline + 1;
      continue;
    }
    if (source.startsWith("/*", index)) {
      let depth = 1;
      let cursor = index + 2;
      while (cursor < source.length && depth > 0) {
        if (source.startsWith("/*", cursor)) {
          depth += 1;
          cursor += 2;
        } else if (source.startsWith("*/", cursor)) {
          depth -= 1;
          cursor += 2;
        } else {
          cursor += 1;
        }
      }
      if (depth !== 0) fail("Migration contains an unterminated leading block comment.");
      index = cursor;
      continue;
    }
    break;
  }
  return index;
}

export function stripOuterTransaction(source, filename = "migration.sql") {
  const normalized = source.replaceAll("\r\n", "\n").trim();
  const statementOffset = skipLeadingTrivia(normalized);
  const opening = normalized.slice(statementOffset).match(/^begin(?:\s+transaction)?\s*;/iu);
  if (!opening) {
    return Object.freeze({ body: normalized, stripped: false });
  }

  const closing = /(?:^|\n)[ \t]*commit(?:\s+transaction)?\s*;[ \t]*(?:--[^\n]*)?[ \t]*$/iu;
  const match = closing.exec(normalized);
  if (!match) fail(`${filename} opens an outer transaction but has no final COMMIT.`);

  const openingEnd = statementOffset + opening[0].length;
  const closingStart = match.index + (match[0].startsWith("\n") ? 1 : 0);
  if (closingStart <= openingEnd) fail(`${filename} has an invalid outer transaction wrapper.`);

  const body = `${normalized.slice(0, statementOffset)}${normalized.slice(openingEnd, closingStart)}`.trim();
  if (!body) fail(`${filename} became empty after transaction normalization.`);
  return Object.freeze({ body, stripped: true });
}

function dollarQuote(value, version) {
  let suffix = 0;
  while (true) {
    const tag = `$phase15_${version}_${suffix}$`;
    if (!value.includes(tag)) return `${tag}${value}${tag}`;
    suffix += 1;
  }
}

function migrationIdentity(filename) {
  const match = /^(\d{14})_(.+)\.sql$/u.exec(filename);
  if (!match) fail(`Invalid migration filename: ${filename}`);
  return Object.freeze({ version: match[1], name: match[2] });
}

export async function loadPhase15Migrations(environment, directory = migrationsDirectory) {
  if (environment !== "staging" && environment !== "production") {
    fail("Environment must be staging or production.");
  }
  const filenames = (await readdir(directory))
    .filter((name) => /^\d{14}_.+\.sql$/u.test(name))
    .sort((left, right) => left.localeCompare(right));
  const common = filenames.filter((name) => name.slice(0, 14) >= PHASE15_CUTOFF);
  if (common.length !== PHASE15_COMMON_COUNT) {
    fail(`Expected ${PHASE15_COMMON_COUNT} common migrations, found ${common.length}.`);
  }
  const selected = environment === "production" ? [...PRODUCTION_PRELUDE, ...common] : common;
  if (new Set(selected).size !== selected.length) fail("Phase 15 migration selection contains duplicates.");

  return Promise.all(selected.map(async (filename, order) => {
    if (!filenames.includes(filename)) fail(`Required migration is missing: ${filename}`);
    const identity = migrationIdentity(filename);
    const source = (await readFile(path.join(directory, filename), "utf8"))
      .replaceAll("\r\n", "\n")
      .trim();
    if (!source) fail(`Required migration is empty: ${filename}`);
    const normalized = stripOuterTransaction(source, filename);
    return Object.freeze({
      order: order + 1,
      filename,
      ...identity,
      source,
      sourceSha256: sha256(source),
      body: normalized.body,
      outerTransactionStripped: normalized.stripped,
    });
  }));
}

function economicInvariantFunctionSql() {
  return String.raw`
create or replace function pg_temp.phase15_economic_invariants_v1()
returns jsonb
language sql
stable
set search_path = pg_catalog, public, pg_temp
as $phase15_invariants$
  select jsonb_build_object(
    'gameSessions', jsonb_build_object(
      'rows', (select count(*) from public.game_sessions)
    ),
    'players', jsonb_build_object(
      'rows', (select count(*) from public.players)
    ),
    'accountBalances', (
      select jsonb_build_object(
        'rows', count(*),
        'balance', pg_catalog.trim_scale(coalesce(sum(balance), 0)::numeric)::text,
        'digest', pg_catalog.md5(coalesce(pg_catalog.string_agg(
          pg_catalog.concat_ws('|', id::text, game_session_id::text, coalesce(player_id::text, ''),
            account_type, pg_catalog.trim_scale(balance)::text, currency_code,
            coalesce(last_ledger_entry_id::text, '')),
          E'\n' order by id
        ), '')),
        'nonZeroRows', count(*) filter (where balance <> 0),
        'nonZeroDigest', pg_catalog.md5(coalesce(pg_catalog.string_agg(
          pg_catalog.concat_ws('|', id::text, game_session_id::text, coalesce(player_id::text, ''),
            account_type, pg_catalog.trim_scale(balance)::text, currency_code,
            coalesce(last_ledger_entry_id::text, '')),
          E'\n' order by id
        ) filter (where balance <> 0), ''))
      ) from public.account_balances
    ),
    'ledgerEntries', (
      select jsonb_build_object(
        'rows', count(*),
        'amount', pg_catalog.trim_scale(coalesce(sum(amount), 0)::numeric)::text,
        'digest', pg_catalog.md5(coalesce(pg_catalog.string_agg(
          pg_catalog.concat_ws('|', id::text, game_session_id::text, coalesce(player_id::text, ''),
            account_type, pg_catalog.trim_scale(amount)::text, currency_code, entry_type,
            source_domain, source_action,
            coalesce(source_id::text, '')),
          E'\n' order by id
        ), ''))
      ) from public.ledger_entries
    ),
    'inventoryHoldings', (
      select jsonb_build_object(
        'rows', count(*),
        'owned', pg_catalog.trim_scale(coalesce(sum(quantity_owned), 0)::numeric)::text,
        'reserved', pg_catalog.trim_scale(coalesce(sum(quantity_reserved), 0)::numeric)::text,
        'digest', pg_catalog.md5(coalesce(pg_catalog.string_agg(
          pg_catalog.concat_ws('|', id::text, game_session_id::text, player_id::text,
            store_item_id::text, pg_catalog.trim_scale(quantity_owned::numeric)::text,
            pg_catalog.trim_scale(quantity_reserved::numeric)::text),
          E'\n' order by id
        ), ''))
      ) from public.inventory_holdings
    ),
    'stockHoldings', (
      select jsonb_build_object(
        'rows', count(*),
        'quantity', pg_catalog.trim_scale(coalesce(sum(quantity), 0)::numeric)::text,
        'reserved', pg_catalog.trim_scale(coalesce(sum(reserved_quantity), 0)::numeric)::text,
        'digest', pg_catalog.md5(coalesce(pg_catalog.string_agg(
          pg_catalog.concat_ws('|', id::text, game_session_id::text, player_id::text,
            stock_asset_id::text, ticker, pg_catalog.trim_scale(quantity)::text,
            pg_catalog.trim_scale(reserved_quantity)::text,
            pg_catalog.trim_scale(average_cost)::text,
            pg_catalog.trim_scale(realized_pnl)::text),
          E'\n' order by id
        ), ''))
      ) from public.stock_holdings
    )
  );
$phase15_invariants$;`;
}

export function buildForwardBundle({ environment, mode, migrations }) {
  if (mode !== "rollback" && mode !== "apply") fail("Mode must be rollback or apply.");
  const expectedCount = environment === "production"
    ? PHASE15_COMMON_COUNT + PRODUCTION_PRELUDE.length
    : PHASE15_COMMON_COUNT;
  if (migrations.length !== expectedCount) {
    fail(`Expected ${expectedCount} selected migrations, found ${migrations.length}.`);
  }

  const versions = migrations.map(({ version }) => `('${version}')`).join(",\n  ");
  const sections = migrations.map((migration) => {
    const source = dollarQuote(migration.source, migration.version);
    const name = migration.name.replaceAll("'", "''");
    return String.raw`
-- phase15 migration ${migration.order}/${migrations.length}: ${migration.filename}
${migration.body}

insert into supabase_migrations.schema_migrations(version, name, statements)
values ('${migration.version}', '${name}', array[${source}]::text[]);`;
  });

  const terminator = mode === "apply" ? "commit;" : "rollback;";
  return String.raw`\set ON_ERROR_STOP on
begin isolation level repeatable read;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('econovaria.phase15.forward.${environment}', 0));

create temp table phase15_expected_versions(version text primary key) on commit drop;
insert into phase15_expected_versions(version) values
  ${versions};

do $phase15_preflight$
declare
  v_present integer;
begin
  select count(*) into v_present
  from supabase_migrations.schema_migrations as live
  join phase15_expected_versions as expected using (version);
  if v_present <> 0 then
    raise exception 'PHASE15_EXPECTED_LEDGER_VERSION_ALREADY_PRESENT:%', v_present;
  end if;
end;
$phase15_preflight$;

${economicInvariantFunctionSql()}

create temp table phase15_economic_before(payload jsonb not null) on commit drop;
insert into phase15_economic_before(payload)
select pg_temp.phase15_economic_invariants_v1();

-- The banking identity tranche intentionally materializes missing canonical
-- projections at zero. Preserve every pre-existing projection exactly while
-- permitting only new, unposted zero-balance rows.
create temp table phase15_account_balances_before on commit drop as
select
  id,
  game_session_id,
  player_id,
  account_type,
  pg_catalog.trim_scale(balance)::text as balance,
  currency_code,
  last_ledger_entry_id
from public.account_balances;

create unique index phase15_account_balances_before_id_idx
  on phase15_account_balances_before(id);

${sections.join("\n")}

do $phase15_postconditions$
declare
  v_before jsonb;
  v_after jsonb;
  v_ledger_count integer;
  v_existing_account_mismatches bigint;
  v_new_account_count bigint;
  v_invalid_new_accounts bigint;
begin
  select payload into strict v_before from phase15_economic_before;
  v_after := pg_temp.phase15_economic_invariants_v1();

  if (v_before - 'accountBalances') is distinct from (v_after - 'accountBalances')
    or (v_before #> '{accountBalances,balance}') is distinct from
      (v_after #> '{accountBalances,balance}')
    or (v_before #> '{accountBalances,nonZeroRows}') is distinct from
      (v_after #> '{accountBalances,nonZeroRows}')
    or (v_before #> '{accountBalances,nonZeroDigest}') is distinct from
      (v_after #> '{accountBalances,nonZeroDigest}')
  then
    raise exception 'PHASE15_ECONOMIC_INVARIANT_DRIFT before=% after=%', v_before, v_after;
  end if;

  select count(*) into v_existing_account_mismatches
  from pg_temp.phase15_account_balances_before as prior_row
  left join public.account_balances as current_row on current_row.id = prior_row.id
  where current_row.id is null
    or current_row.game_session_id is distinct from prior_row.game_session_id
    or current_row.player_id is distinct from prior_row.player_id
    or current_row.account_type is distinct from prior_row.account_type
    or pg_catalog.trim_scale(current_row.balance)::text is distinct from prior_row.balance
    or current_row.currency_code is distinct from prior_row.currency_code
    or current_row.last_ledger_entry_id is distinct from prior_row.last_ledger_entry_id;
  if v_existing_account_mismatches <> 0 then
    raise exception 'PHASE15_EXISTING_ACCOUNT_PROJECTION_DRIFT:%',
      v_existing_account_mismatches;
  end if;

  select count(*) into v_new_account_count
  from public.account_balances as current_row
  where not exists (
    select 1
    from pg_temp.phase15_account_balances_before as prior_row
    where prior_row.id = current_row.id
  );

  select count(*) into v_invalid_new_accounts
  from public.account_balances as current_row
  where not exists (
    select 1
    from pg_temp.phase15_account_balances_before as prior_row
    where prior_row.id = current_row.id
  )
    and (
      current_row.balance is distinct from 0::numeric
      or current_row.last_ledger_entry_id is not null
      or current_row.bank_account_id is null
    );
  if v_invalid_new_accounts <> 0 then
    raise exception 'PHASE15_INVALID_NEW_ACCOUNT_PROJECTION:%', v_invalid_new_accounts;
  end if;

  if (v_after #>> '{accountBalances,rows}')::integer <>
    (v_before #>> '{accountBalances,rows}')::integer + v_new_account_count
  then
    raise exception 'PHASE15_ACCOUNT_PROJECTION_COUNT_DRIFT';
  end if;

  select count(*) into v_ledger_count
  from supabase_migrations.schema_migrations as live
  join phase15_expected_versions as expected using (version);
  if v_ledger_count <> ${migrations.length} then
    raise exception 'PHASE15_LEDGER_COUNT_MISMATCH:%', v_ledger_count;
  end if;
end;
$phase15_postconditions$;

select jsonb_build_object(
  'schemaVersion', 2,
  'environment', '${environment}',
  'mode', '${mode}',
  'migrationCount', ${migrations.length},
  'economicInvariantsMatched', true,
  'economicInvariants', pg_temp.phase15_economic_invariants_v1(),
  'accountProjectionProof', jsonb_build_object(
    'rowsBefore', (select count(*) from pg_temp.phase15_account_balances_before),
    'rowsAfter', (select count(*) from public.account_balances),
    'newZeroBalanceRows', (
      select count(*)
      from public.account_balances as current_row
      where not exists (
        select 1
        from pg_temp.phase15_account_balances_before as prior_row
        where prior_row.id = current_row.id
      )
    ),
    'existingEconomicFieldsMatched', true,
    'newRowsAreCanonicalUnpostedZeroBalances', true
  )
)::text;

${terminator}
`;
}

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) fail(`Invalid argument near ${key ?? "end"}.`);
    values.set(key, value);
  }
  const environment = values.get("--environment");
  const mode = values.get("--mode") || "rollback";
  const format = values.get("--format") || "sql";
  if (format !== "sql" && format !== "manifest") fail("Format must be sql or manifest.");
  return { environment, mode, format };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const migrations = await loadPhase15Migrations(options.environment);
  if (options.format === "manifest") {
    process.stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      environment: options.environment,
      cutoff: PHASE15_CUTOFF,
      commonMigrationCount: PHASE15_COMMON_COUNT,
      preludeMigrationCount: options.environment === "production" ? PRODUCTION_PRELUDE.length : 0,
      migrationCount: migrations.length,
      migrations: migrations.map(({ order, filename, version, name, sourceSha256, outerTransactionStripped }) => ({
        order,
        filename,
        version,
        name,
        sourceSha256,
        statementCount: 1,
        outerTransactionStripped,
      })),
    }, null, 2)}\n`);
    return;
  }
  process.stdout.write(buildForwardBundle({ ...options, migrations }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}

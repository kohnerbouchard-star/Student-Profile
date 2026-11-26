import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { verifiedRuntimeIdentityProfile } from './runtime-identity-diagnostic.mjs';

const CATALOG_VERSION = 'econovaria.phase15.catalog-supplement.v2';
const MIGRATION_HISTORY = { name: 'supabase_migrations', owner: 'postgres' };
const exporter = new URL('./export-runtime-catalog-v2.sql', import.meta.url);
const schemaRows = rows => rows.filter(row => row.name === MIGRATION_HISTORY.name);
const sqlText = value => `pg_catalog.convert_from(pg_catalog.decode('${Buffer.from(value).toString('base64')}', 'base64'), 'UTF8')`;
const sortedRows = rows => [...rows].sort((left, right) => String(left.name).localeCompare(String(right.name)));

// Use the exact export query in the same transaction that owns the fixture rows.
// The launcher uses another transaction and cannot see these uncommitted jobs.
export function disposableRuntimeCatalogFixture(canonical) {
  const { profile, schedulerCommands } = verifiedRuntimeIdentityProfile();
  const jobs = profile.staticSchedulerRows;
  const exportSql = readFileSync(exporter, 'utf8');
  assert.equal(createHash('sha256').update(exportSql).digest('hex'),
    '883dd715463aac2d30f63c1467a6a6253c80b2b29923a50603af5c804ed7439c');
  const select = exportSql
    .match(/\nbegin transaction read only;\n(select [\s\S]+ as snapshot;)\nrollback;\n$/)?.[1];
  assert(select, 'Exact catalog export transaction boundary changed');
  if (canonical !== undefined) {
    assert.equal(canonical.schemaVersion, CATALOG_VERSION);
    assert.deepEqual(schemaRows(canonical.schemas), [MIGRATION_HISTORY]);
    for (const job of jobs) assert.deepEqual(canonical.cron.filter(row => row.name === job.name), [job]);
  }
  const registrations = jobs.map(job => `
  if not exists (select from cron.job where jobname = ${sqlText(job.name)}) then
    perform cron.schedule(${sqlText(job.name)}, ${sqlText(job.schedule)}, ${sqlText(schedulerCommands.get(job.name))});
  end if;`).join('');
  const sql = `begin isolation level repeatable read;
set local statement_timeout = '15s';
set local lock_timeout = '5s';
set local idle_in_transaction_session_timeout = '20s';
do $authority$
begin
  if current_user <> 'postgres' or session_user <> 'postgres'
     or pg_catalog.current_database() <> 'postgres' or pg_catalog.inet_server_addr() is not null
     or pg_catalog.current_setting('ref032.runtime_catalog_fixture', true)
        is distinct from 'rollback-only-repository-v1'
     or pg_catalog.current_setting('server_version_num')::int / 10000 <> 17
     or not exists (
       select from pg_catalog.pg_extension e join pg_catalog.pg_namespace n on n.oid = e.extnamespace
       where e.extname = 'pg_cron' and e.extversion = '1.6.4' and n.nspname = 'pg_catalog'
     ) then
    raise exception 'DISPOSABLE_RUNTIME_FIXTURE_CONTEXT';
  end if;
end $authority$;
${select}
do $fixture$
begin
  if not exists (select from pg_catalog.pg_namespace where nspname = 'supabase_migrations') then
    -- Supabase CLI v2.109.1 creates this history structure only for nonempty replay.
    create schema supabase_migrations;
    create table supabase_migrations.schema_migrations (
      version text not null primary key, statements text[], name text
    );
  end if;${registrations}
end $fixture$;
${select}
rollback;
`;
  return { sql, jobs };
}

export function verifyDisposableRuntimeCatalogPair(before, after, jobs) {
  assert.equal(before.schemaVersion, CATALOG_VERSION);
  assert.equal(after.schemaVersion, CATALOG_VERSION);
  const bootstrapHistoryAdded = schemaRows(before.schemas).length === 0;
  const additions = jobs.filter(job => !before.cron.some(row => row.name === job.name));
  const expected = { ...before };
  if (bootstrapHistoryAdded) expected.schemas = sortedRows([...before.schemas, MIGRATION_HISTORY]);
  expected.cron = sortedRows([...before.cron, ...additions]);
  assert.deepEqual({
    ...after, schemas: sortedRows(after.schemas), cron: sortedRows(after.cron),
  }, { ...expected, schemas: sortedRows(expected.schemas) }, 'Fixture changed other catalog identities');
  return { schedulerRowsAdded: additions.length, bootstrapHistoryAdded };
}

export function readDisposableRuntimeCatalogOutput(output, jobs) {
  const lines = output.trim().split('\n');
  assert.equal(lines.length, 2, 'Expected two exact catalog exports');
  const [before, after] = lines.map(line => JSON.parse(line));
  const receipt = verifyDisposableRuntimeCatalogPair(before, after, jobs);
  return { catalog: lines[1], receipt };
}

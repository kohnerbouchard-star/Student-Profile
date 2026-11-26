// Test-only pure compiler. No credentials, connection or operational entry point.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { APPROVED_SUFFIXES } from '../live-migration-reconciliation/build-phase15-rehearsal-plan.mjs';
import { stripOuterTransaction } from '../live-migration-reconciliation/build-phase15-forward-bundle.mjs';
import { verifyLedger, verifyLedgerPrefix } from '../live-migration-reconciliation/verify-phase15-ledger.mjs';
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const batch = APPROVED_SUFFIXES.slice(1);
const literal = value => "'" + String(value).replaceAll("'", "''") + "'";
export const batchDigest = sha256(JSON.stringify(batch));

export async function loadBatch(root) {
  assert.equal(batch.length, 15);
  return Promise.all(batch.map(async row => {
    const raw = await readFile(`${root}/backend/supabase/migrations/${row.filename}`);
    assert.equal(sha256(raw), row.rawSha256, `${row.filename}: raw digest drift`);
    const source = raw.toString('utf8').replaceAll('\r\n', '\n').trim();
    assert.equal(sha256(source), row.sourceSha256, `${row.filename}: normalized drift`);
    const { body, stripped } = stripOuterTransaction(source, row.filename);
    assert(stripped, `${row.filename}: explicit transaction wrapper required`);
    return { ...row, source, body };
  }));
}

export function pendingRows(ledger) {
  // Include the already-applied nonce and reject unknown later versions/gaps/digest drift.
  const manifest = { schemaVersion: 1, environment: 'staging', migrations: APPROVED_SUFFIXES };
  assert(ledger.length >= 1, 'Verified nonce baseline required');
  if (ledger.length === APPROVED_SUFFIXES.length) verifyLedger(manifest, ledger);
  else verifyLedgerPrefix(manifest, ledger);
  return batch.slice(ledger.length - 1);
}

// Test-only predicate objects exercise partial synthetic acceptance.
// They do not authorize an operational predicate registry or hosted action.
export function renderAtomicBatch(rows, postconditions, mode = 'rollback') {
  assert(['rollback', 'apply'].includes(mode));
  assert(rows.length > 0 && rows.length <= 15);
  assert.deepEqual(rows.map(r => r.version), batch.slice(15 - rows.length).map(r => r.version));
  const checks = rows.map(row => {
    const check = postconditions[row.version];
    assert(check?.reviewed === true && typeof check.sql === 'string' && check.sql.length > 0, `${row.filename}: reviewed postcondition missing`);
    assert.equal(sha256(check.sql), check.sha256);
    // SQL predicates are reviewed code, never artifact/user-supplied executable SQL.
    return check.sql;
  });
  const expected = rows.map(row => `(${literal(row.version)},${literal(row.name)},${literal(row.sourceSha256)})`).join(',');
  const prefix = APPROVED_SUFFIXES.slice(0, 16 - rows.length);
  const prefixJson = JSON.stringify(prefix.map(r => ({version:r.version,name:r.name,sha256:r.sourceSha256,statementCount:1})));
  const sections = rows.map((row, index) => {
    assert.equal(sha256(row.source), row.sourceSha256);
    assert.equal(stripOuterTransaction(row.source).body, row.body);
    const tag = `$suffix_${row.version}$`;
    assert(!row.source.includes(tag));
    return `\\echo QUALIFICATION_MIGRATION_${row.version}\n${row.body}\n${checks[index]}\ninsert into supabase_migrations.schema_migrations(version,name,statements) values (${literal(row.version)},${literal(row.name)},array[${tag}${row.source}${tag}]);\n`;
  });
  return `\\set ON_ERROR_STOP on
begin isolation level serializable;
set local lock_timeout='5s';
set local statement_timeout='120s';
set local idle_in_transaction_session_timeout='180s';
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('econovaria.staging.suffix.15',0));
lock table supabase_migrations.schema_migrations in exclusive mode;
create temp table suffix_expected(version text,name text,digest text) on commit drop;
insert into suffix_expected values ${expected};
do $pre$ begin
 if (select coalesce(jsonb_agg(jsonb_build_object('version',version,'name',name,'sha256',encode(sha256(convert_to(statements[1],'UTF8')),'hex'),'statementCount',cardinality(statements)) order by version),'[]'::jsonb) from supabase_migrations.schema_migrations where version >= '20260921044500' and version < (select min(version) from suffix_expected)) is distinct from ${literal(prefixJson)}::jsonb then raise exception 'SUFFIX_BASELINE_DRIFT'; end if;
 if exists(select 1 from supabase_migrations.schema_migrations where version >= (select min(version) from suffix_expected)) then raise exception 'SUFFIX_LEDGER_CHANGED'; end if;
 if exists(select 1 from public.player_sessions where revoked_at is null and expires_at>clock_timestamp()) then raise exception 'PLAYER_SESSIONS_PRESENT'; end if;
end $pre$;
${sections.join('\n')}
do $post$ begin
 if exists(select 1 from suffix_expected e left join supabase_migrations.schema_migrations l using(version) where l.name is distinct from e.name or cardinality(l.statements) is distinct from 1 or encode(sha256(convert_to(l.statements[1],'UTF8')),'hex') is distinct from e.digest) then raise exception 'SUFFIX_POST_LEDGER_MISMATCH'; end if;
end $post$;
${mode === 'apply' ? 'commit' : 'rollback'};
`;
}

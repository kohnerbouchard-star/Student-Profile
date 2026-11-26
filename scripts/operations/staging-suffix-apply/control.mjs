import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { APPROVED_SUFFIXES } from '../live-migration-reconciliation/build-phase15-rehearsal-plan.mjs';
import { stripOuterTransaction } from '../live-migration-reconciliation/build-phase15-forward-bundle.mjs';
import { verifyLedger, verifyLedgerPrefix } from '../live-migration-reconciliation/verify-phase15-ledger.mjs';
import { validateDatabaseUrlProjectRef } from '../../release-integrity/database-binding.mjs';
export const PROJECT = 'eecvbssdvarfcykcfrny';
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

export function bindConnection(url) {
  const binding = validateDatabaseUrlProjectRef({ databaseUrl: url, expectedProjectRef: PROJECT });
  const parsed = new URL(url);
  assert(!parsed.port || parsed.port === '5432', 'Session/direct port only');
  assert.equal(parsed.pathname, '/postgres');
  assert.equal([...parsed.searchParams].length, 0, 'Connection query options forbidden');
  return binding;
}

export function pendingRows(ledger) {
  // Include the already-applied nonce and reject unknown later versions/gaps/digest drift.
  const manifest = { schemaVersion: 1, environment: 'staging', migrations: APPROVED_SUFFIXES };
  assert(ledger.length >= 1, 'Verified nonce baseline required');
  if (ledger.length === APPROVED_SUFFIXES.length) verifyLedger(manifest, ledger);
  else verifyLedgerPrefix(manifest, ledger);
  return batch.slice(ledger.length - 1);
}

function fresh(value, maxAge, now) {
  const time = Date.parse(value);
  assert(Number.isFinite(time) && time <= now && now - time <= maxAge, 'Stale/future evidence');
}
// Target identity is database evidence only, never managed-service acceptance.
export function validateRecoveryTarget(recovery) {
 if(recovery.restoreTargetKind === undefined || recovery.restoreTargetKind === 'isolated-supabase-project') {
  assert.equal(recovery.nativeDatabaseRestore, undefined, 'Ambiguous recovery target');
  assert.match(recovery.restoreTargetRef, /^[a-z0-9]{20}$/);
  assert(![PROJECT, 'cgiukdjwicykrmtkhudh'].includes(recovery.restoreTargetRef));
  return;
 }
 assert.equal(recovery.restoreTargetKind, 'isolated-native-supabase-postgres');
 assert.equal(recovery.restoreTargetRef, undefined, 'Native restore must not invent a project ref');
 const evidence=recovery.nativeDatabaseRestore;
 assert.equal(evidence.schemaVersion,1);
 assert.match(evidence.instanceId,/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
 assert.equal(evidence.engine,'supabase-postgres');
 assert.match(evidence.version,/^17\.\d+(?:\.\d+)*$/);
 assert(['arm64','amd64'].includes(evidence.architecture));
 assert.equal(evidence.hosted,false);
 assert.equal(evidence.networkIsolated,true);
 assert.equal(evidence.disposable,true);
 assert.equal(evidence.archiveSha256,recovery.backupSha256);
 assert.match(evidence.archiveSha256,/^[a-f0-9]{64}$/);
 assert.match(evidence.restoreEvidenceSha256,/^[a-f0-9]{64}$/);
 assert.equal(evidence.fullArchiveLoad,'PASS');
 assert.equal(evidence.playerTablePresent,true);
 assert.equal(evidence.authUsersTablePresent,true);
 assert(Number.isSafeInteger(evidence.ledgerRowCount)&&evidence.ledgerRowCount>0);
 // Existing independent Auth/Storage/source/smoke, timing and approval gates below
 // remain mandatory. Table presence is not Auth service or configuration proof.
}
export function validateReceipts({ source, currentMain, replay, rehearsal, artifact, result, recovery, qualification, controlDigest, approvals, now = Date.now() }) {
  assert.match(source, /^[a-f0-9]{40}$/);
  assert.equal(source, currentMain, 'Current-main identity drift');
  for (const [run, path, event] of [[replay, '.github/workflows/database-replay.yml', 'push'], [rehearsal, '.github/workflows/econovaria-staging-schema-rehearsal.yml', 'workflow_dispatch']]) {
    assert.equal(run.head_sha, source); assert.equal(run.head_branch, 'main');
    assert.equal(run.path, path); assert.equal(run.event, event);
    assert.equal(run.status, 'completed'); assert.equal(run.conclusion, 'success');
    assert.equal(run.run_attempt, 1); fresh(run.updated_at, 72 * 3600000, now);
  }
  assert.equal(artifact.expired, false);
  assert.equal(artifact.name, `econovaria-staging-rehearsal-diagnostic-${source}`);
  assert.equal(artifact.workflow_run.head_sha, source);
  assert.equal(artifact.workflow_run.id, rehearsal.id);
  assert.match(artifact.digest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(artifact.digest, `sha256:${sha256(result.archiveBytes)}`, 'Artifact archive digest mismatch');
  const summary = result.summary;
  assert.equal(summary.sourceCommit, source); assert.equal(summary.environment, 'staging');
  assert.equal(summary.status, 'PASS'); assert.equal(summary.exitCode, 0);
  assert.equal(summary.canonicalApplicationSchemaMatched, true);
  assert.equal(summary.runtimeCatalogComparisonExit, 0);
  assert.equal(summary.sourceRowsCopied, false); assert.equal(summary.rawSchemaDumpRetained, false);
  assert.equal(summary.releaseCertificate, false);
  assert.equal(summary.suffix.remoteLedgerPresentCount, 1);
  assert.equal(summary.suffix.appliedMigrationCount, 15);
  assert.equal(summary.suffix.certifiedMigrationCount, 16);
  for (const name of ['sourceSchemaSha256', 'sourceLedgerSha256']) assert.match(summary[name], /^[a-f0-9]{64}$/);
  assert.equal(recovery.status, 'PASS'); assert.equal(recovery.projectRef, PROJECT);
  assert.equal(recovery.sourceCommit, source); assert.equal(recovery.batchDigest, batchDigest);
  assert.equal(recovery.productionModified, false); assert.equal(recovery.containsSecretValues, false);
  assert.match(recovery.backupSha256, /^[a-f0-9]{64}$/);
  validateRecoveryTarget(recovery);
  fresh(recovery.completedAt, 90 * 86400000, now);
  assert(Date.parse(recovery.startedAt) < Date.parse(recovery.completedAt));
  for (const metric of ['Rpo', 'Rto']) {
    assert(Number.isFinite(recovery[`observed${metric}Minutes`]) && recovery[`observed${metric}Minutes`] >= 0);
    assert(Number.isFinite(recovery[`${metric.toLowerCase()}ObjectiveMinutes`]) && recovery[`${metric.toLowerCase()}ObjectiveMinutes`] >= 0);
    assert(recovery[`observed${metric}Minutes`] <= recovery[`${metric.toLowerCase()}ObjectiveMinutes`]);
  }
  for (const name of ['migrationLedger','economicInvariants','authMapping','storageInventory','edgeSource','adminSmoke','playerDesktopSmoke','playerMobileSmoke']) assert.equal(recovery.checks[name], 'PASS');
  assert(Array.isArray(approvals) && approvals.some(row => row.state === 'approved' && row.environments?.some(env => env.name === 'staging') && row.user?.login === recovery.approver && row.user.login !== recovery.operator), 'Named independent staging approval required');
  assert.equal(qualification.status, 'PASS', 'Disposable PostgreSQL qualification NOT_RUN; hosted apply prohibited');
  assert.equal(qualification.batchDigest, batchDigest);
  assert.match(controlDigest, /^[a-f0-9]{64}$/);
  assert.equal(qualification.controlDigest, controlDigest);
  for (const name of ['rollback','resume','ledgerAtomicity','wrongTarget','failureInjection','perMigrationPostconditions']) assert.equal(qualification.checks[name], 'PASS');
  assert.equal(qualification.transactionSafetyReviewed, true);
  assert.equal(qualification.postconditionsReviewed, true);
}

// Only reviewed predicates are accepted; the checked-in registry deliberately has no
// predicates until actual isolated PostgreSQL qualification supplies them.
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
    return `${row.body}\n${checks[index]}\ninsert into supabase_migrations.schema_migrations(version,name,statements) values (${literal(row.version)},${literal(row.name)},array[${tag}${row.source}${tag}]);\n`;
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

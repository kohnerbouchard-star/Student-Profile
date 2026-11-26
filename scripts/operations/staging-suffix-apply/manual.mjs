import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadProtectedRequest, verifyProtectedEvidence } from '../staging-recovery-evidence/protected-transport.mjs';
import { loadBatch, renderAtomicBatch, sha256 } from '../staging-suffix-qualification/compiler.mjs';
import { BASELINE_PROBE, predicates } from '../staging-suffix-qualification/postconditions.mjs';
import { bindConnection, PROJECT } from './control.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const baselineRows = 468;
const committedRows = 483;
const nonce = '20260921044500';
const digest = /^[a-f0-9]{64}$/;
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const ledgerLock = 'lock table supabase_migrations.schema_migrations in exclusive mode;';
const advisory = "select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('econovaria.staging.suffix.15',0));";
const probeTable = 'pg_temp.staging_suffix_purge_before';
const fixtureTable = 'qualification_probe.purge_before';
const campaignBodies = [
  ['staging_campaign.attest_drain(uuid)', '425c5647bea0683e4fa12d016070920d3ec4d0df46924c1aac4f74ad79dbb95e'],
  ['staging_campaign.seal_v2(uuid)', '3758090367511cc52cff3f35e40724a7d0862347e04abfe249c6d404a6a2a76d'],
  ['staging_campaign.require_open(uuid)', 'c2bc877efc664a553e32b2357d43cee9ecfae59aae4a85ae9fe536ae5b336b21'],
  ['public.verify_runtime_scheduler_token_v1(text,text)', '5d01b91191aa866f82673e36b702efb629c4ce54a96636ea2b8102c67742c305'],
];

function replaceOnce(source, marker, replacement) {
  assert.equal(source.split(marker).length, 2, 'Exact SQL carrier changed');
  return source.replace(marker, () => replacement);
}

export function stagedPredicates(rows) {
  const reviewed = predicates(rows);
  const purge = reviewed['20261004202506'];
  const sql = replaceOnce(purge.sql, fixtureTable, probeTable);
  return { ...reviewed, '20261004202506': { ...purge, sql, sha256: sha256(sql) } };
}

function ledgerGuard(total, sha) {
  assert.match(sha, digest);
  return [
    'do $stage_ledger$ begin',
    "  if current_database() <> 'postgres' or current_user <> 'postgres'",
    '     or session_user <> current_user or pg_is_in_recovery()',
    "  then raise exception 'STAGING_PRIMARY_OR_OPERATOR_UNVERIFIED'; end if;",
    '  if (select count(*) from supabase_migrations.schema_migrations) <> ' + total,
    "     or (select count(*) from supabase_migrations.schema_migrations where version > '" + nonce + "') <> " +
      (total - baselineRows),
    "     or (select encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(m) order by m.version collate \"C\")," +
      "'[]'::jsonb)::text,'UTF8')),'hex') from supabase_migrations.schema_migrations m where m.version <= '" +
      nonce + "') is distinct from '" + sha + "'",
    "  then raise exception 'STAGING_SUFFIX_PREDECESSOR_CHANGED'; end if;",
    'end $stage_ledger$;',
  ].join('\n');
}

function literalEpoch(value) {
  assert.match(value, uuid);
  return "'" + value + "'::uuid";
}

function heldChecks(operation) {
  const campaign = literalEpoch(operation.campaignEpoch);
  const writer = literalEpoch(operation.writerEpoch);
  const admission = literalEpoch(operation.admissionEpoch);
  const expected = campaignBodies.map(([signature, sha]) => "('" + signature + "','" + sha + "')").join(',');
  return [
    'do $stage_campaign$ begin',
    '  if (select count(*) from (values ' + expected + ') expected(signature,digest)',
    '      join pg_catalog.pg_proc p on p.oid=pg_catalog.to_regprocedure(expected.signature)',
    "      where pg_catalog.pg_get_userbyid(p.proowner)='postgres'",
    "        and encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')=expected.digest) <> " + campaignBodies.length,
    "  then raise exception 'STAGING_CAMPAIGN_CONTROL_DRIFT'; end if;",
    '  if not exists(select 1 from staging_campaign.fence where singleton and held and not sealed and epoch=' +
      campaign + ' for update)',
    "  then raise exception 'STAGING_CAMPAIGN_HOLD_MISSING'; end if;",
    '  if staging_campaign.attest_drain(' + campaign + ') is distinct from true',
    "  then raise exception 'STAGING_CAMPAIGN_NOT_DRAINED'; end if;",
    'end $stage_campaign$;',
    'select staging_writer_admission.require_drained(' + admission + ');',
    'select staging_writer_hold.require_apply_hold(' + writer + ');',
  ].join('\n');
}

export function renderGuardedBatch(rows, operation) {
  assert.equal(rows.length, 15);
  const base = renderAtomicBatch(rows, stagedPredicates(rows), 'apply');
  const purgeProbe = replaceOnce(BASELINE_PROBE,
    'create schema qualification_probe;\ncreate table ' + fixtureTable + ' as ',
    'create temp table staging_suffix_purge_before on commit drop as ');
  // Lock the ledger before the first snapshot and keep each original SQL body,
  // reviewed predicate and exact migration-ledger identity inside the same tx.
  const held = replaceOnce(base, advisory + '\n' + ledgerLock, [
    ledgerLock,
    advisory,
    ledgerGuard(baselineRows, operation.baselineSha256),
    heldChecks(operation),
    purgeProbe,
    "do $stage_probe$ begin if (select count(*) from " + probeTable + ")<>2 " +
      "then raise exception 'STAGING_PURGE_BASELINE_MISSING'; end if; end $stage_probe$;",
  ].join('\n'));
  assert(held.endsWith('\ncommit;\n'));
  return held.slice(0, -'commit;\n'.length) + [
    ledgerGuard(committedRows, operation.baselineSha256),
    'select staging_writer_hold.seal_recovery(' + literalEpoch(operation.writerEpoch) + ');',
    'select staging_campaign.seal_v2(' + literalEpoch(operation.campaignEpoch) + ');',
    'commit;\n',
  ].join('\n');
}

export function requireAuthorizedOperation(decision, source) {
  // Published #1069 verifies recovery and intentionally issues no live writer
  // authority. Evidence comes from the protected verifier, never dispatch JSON.
  const operation = decision.authorizedStagingOperation;
  if (decision.applyAuthorized !== true || decision.fenceVerified !== true ||
      operation?.phase !== 'apply' || operation.projectRef !== PROJECT || operation.sourceCommit !== source) {
    throw Error('STAGING_LIVE_WRITER_AUTHORITY_NOT_ISSUED');
  }
  assert.match(operation.baselineSha256, digest);
  assert.match(operation.writerEvidenceSha256, digest);
  return operation;
}

function applyOnStaging(databaseUrl, sql) {
  const parsed = new URL(databaseUrl);
  // A pre-existing explicit verify-full option is equivalent to the fixed
  // transport setting. All other connection options remain forbidden.
  if (parsed.searchParams.size === 1 && parsed.searchParams.get('sslmode') === 'verify-full') {
    parsed.search = '';
  }
  const binding = bindConnection(parsed.href);
  const host = parsed.hostname;
  const dnsLabel = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  assert(host.length <= 253 && host.split('.').every(label => dnsLabel.test(label)));
  const user = decodeURIComponent(parsed.username);
  assert.equal(user, binding.connectionType === 'direct' ? 'postgres' : 'postgres.' + PROJECT);
  try {
    execFileSync('psql', ['-X', '-w', '-qAt', '-f', '-'], {
      env: {
        PATH: process.env.PATH,
        PGHOST: host,
        PGPORT: '5432',
        PGDATABASE: 'postgres',
        PGUSER: user,
        PGPASSWORD: decodeURIComponent(parsed.password),
        PGSSLMODE: 'verify-full',
        PGSSLROOTCERT: root + 'scripts/operations/live-migration-reconciliation/supabase-prod-ca-2021.crt',
        PGCONNECT_TIMEOUT: '15',
        PGAPPNAME: 'econovaria-staging-suffix-apply',
      },
      input: sql,
      timeout: 900_000,
      maxBuffer: 64 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    // Inspect the same ledger and hold if the connection is lost at commit.
    throw Error('STAGING_APPLY_OUTCOME_UNCONFIRMED');
  }
}

const publicErrors = new Set([
  'STAGING_SUFFIX_QUALIFICATION_NOT_RUN',
  'STAGING_LIVE_WRITER_AUTHORITY_NOT_ISSUED',
  'STAGING_PSQL_UNAVAILABLE',
  'STAGING_APPLY_OUTCOME_UNCONFIRMED',
]);

async function main() {
  const mode = process.argv[2];
  assert(['verify', 'apply'].includes(mode));
  const request = await loadProtectedRequest('preflight');
  if (request.qualification.status !== 'PASS') throw Error('STAGING_SUFFIX_QUALIFICATION_NOT_RUN');
  const rows = await loadBatch(root);
  const hashes = Object.fromEntries(Object.entries(stagedPredicates(rows)).map(([version, check]) =>
    [version, { reviewed: true, sha256: check.sha256 }]));
  assert.deepEqual(request.qualification.postconditions, hashes, 'Reviewed predicate hashes must match exact source');
  const decision = verifyProtectedEvidence(request);
  if (mode === 'verify' && request.event.inputs.apply_authorized !== 'true') {
    console.log('STAGING_RECOVERY_VERIFIED_APPLY_HELD');
    return;
  }
  assert.equal(request.event.inputs.apply_authorized, 'true');
  const operation = requireAuthorizedOperation(decision, request.head);
  const sql = renderGuardedBatch(rows, operation);
  if (mode === 'verify') {
    try { execFileSync('psql', ['--version'], { stdio: 'ignore', timeout: 5000 }); }
    catch { throw Error('STAGING_PSQL_UNAVAILABLE'); }
    appendFileSync(process.env.GITHUB_OUTPUT, 'apply_ready=true\n');
    return;
  }
  applyOnStaging(process.env.STAGING_DATABASE_URL, sql);
  console.log('STAGING_SUFFIX_COMMITTED_HELD');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { await main(); }
  catch (error) {
    console.error(publicErrors.has(error.message) ? error.message : 'STAGING_PROTECTED_OPERATION_REJECTED');
    process.exitCode = 1;
  }
}

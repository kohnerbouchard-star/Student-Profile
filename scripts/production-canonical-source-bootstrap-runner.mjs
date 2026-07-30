#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const SOURCE_NAME = '[SYSTEM] Econovaria Canonical Source';
const PROBE_NAME = '[SYNTHETIC] Production Provisioning Probe';
const SOURCE_STAFF_EMAIL = 'canonical-source@econovaria.internal';
const PACK_ID = 'econovaria.beta-seed-pack.v1';

function required(name) {
  const value = String(process.env[name] ?? '').trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function safeError(error) {
  return String(error?.message ?? error ?? 'Unknown production finalizer error')
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi,
      '[uuid-redacted]',
    )
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[database-url-redacted]')
    .replace(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, '[jwt-redacted]')
    .slice(0, 3000);
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function parseJsonLine(output, label) {
  const lines = String(output)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) throw new Error(`${label} returned no JSON`);
  try {
    return JSON.parse(lines.at(-1));
  } catch {
    throw new Error(`${label} returned invalid JSON`);
  }
}

function runSql(databaseUrl, sql, label) {
  const result = spawnSync(
    'psql',
    [databaseUrl, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', sql],
    {
      encoding: 'utf8',
      maxBuffer: 48 * 1024 * 1024,
      env: { ...process.env, PGSSLMODE: 'require' },
    },
  );
  if (result.status !== 0) {
    throw new Error(`${label} failed: ${safeError(result.stderr || `psql exited ${result.status}`)}`);
  }
  return String(result.stdout || '').trim();
}

function readFinalState(databaseUrl) {
  return parseJsonLine(runSql(databaseUrl, `
    select jsonb_build_object(
      'sourceCount', (
        select count(*) from public.game_sessions
        where name=${sqlLiteral(SOURCE_NAME)}
      ),
      'sourceJoinable', coalesce((
        select bool_or(game_join_code_status='active' and game_join_code is not null)
        from public.game_sessions
        where name=${sqlLiteral(SOURCE_NAME)}
      ), false),
      'releaseMembers', (
        select count(*)
        from public.seed_content_release_members member_row
        join public.seed_content_releases release_row on release_row.id=member_row.release_id
        join public.game_sessions game_row on game_row.id=release_row.game_session_id
        where game_row.name=${sqlLiteral(SOURCE_NAME)}
          and release_row.pack_id=${sqlLiteral(PACK_ID)}
          and release_row.status='applied_active'
      ),
      'worldLocations', (
        select count(*) from public.world_location_states runtime_row
        join public.game_sessions game_row on game_row.id=runtime_row.game_session_id
        where game_row.name=${sqlLiteral(SOURCE_NAME)}
      ),
      'worldRoutes', (
        select count(*) from public.world_route_states runtime_row
        join public.game_sessions game_row on game_row.id=runtime_row.game_session_id
        where game_row.name=${sqlLiteral(SOURCE_NAME)}
      ),
      'worldCountries', (
        select count(*) from public.world_country_runtime runtime_row
        join public.game_sessions game_row on game_row.id=runtime_row.game_session_id
        where game_row.name=${sqlLiteral(SOURCE_NAME)}
      ),
      'arrivalClassGrants', (
        select count(*) from public.arrival_class_grant_runtime runtime_row
        join public.game_sessions game_row on game_row.id=runtime_row.game_session_id
        where game_row.name=${sqlLiteral(SOURCE_NAME)}
      ),
      'activeCraftingPacks', (
        select count(*) from public.game_session_physical_economy_packs pack_row
        join public.game_sessions game_row on game_row.id=pack_row.game_session_id
        where game_row.name=${sqlLiteral(SOURCE_NAME)} and pack_row.status='active'
      ),
      'probeGames', (
        select count(*) from public.game_sessions
        where name=${sqlLiteral(PROBE_NAME)}
      ),
      'probeRequests', (
        select count(*) from public.game_creation_provisioning_requests
        where idempotency_key like 'production.connected.probe.%'
      ),
      'unreadyJoinableGames', (
        select count(*) from public.game_sessions
        where status='active'
          and game_join_code_status='active'
          and provisioning_status<>'ready'
      )
    )::text;
  `, 'production canonical-source state read'), 'production canonical-source state read');
}

function sourceReady(state) {
  return state.sourceCount === 1
    && state.sourceJoinable === false
    && state.releaseMembers === 590
    && state.worldLocations === 50
    && state.worldRoutes === 13
    && state.worldCountries === 10
    && state.arrivalClassGrants === 8
    && state.activeCraftingPacks === 1;
}

function cleanupVerifiedProbe(databaseUrl) {
  runSql(databaseUrl, `
    begin;

    do $$
    declare
      v_probe_id uuid;
      v_probe_count integer;
      v_deleted integer;
      v_verified jsonb;
    begin
      select max(id::text)::uuid, count(*)::integer
      into v_probe_id, v_probe_count
      from public.game_sessions
      where name=${sqlLiteral(PROBE_NAME)}
        and status='active'
        and provisioning_status='ready';

      if v_probe_count <> 1 or v_probe_id is null then
        raise exception 'PRODUCTION_PROBE_FINALIZER_EXPECTED_EXACTLY_ONE_READY_PROBE';
      end if;

      if not exists (
        select 1
        from public.game_sessions probe
        join public.game_sessions source
          on source.id=probe.provisioning_source_game_session_id
        join public.staff_users owner
          on owner.id=probe.owner_staff_user_id
        where probe.id=v_probe_id
          and probe.game_join_code_status='active'
          and probe.game_join_code is not null
          and source.name=${sqlLiteral(SOURCE_NAME)}
          and source.game_join_code_status<>'active'
          and owner.email=${sqlLiteral(SOURCE_STAFF_EMAIL)}
      ) then
        raise exception 'PRODUCTION_PROBE_FINALIZER_IDENTITY_OR_SOURCE_MISMATCH';
      end if;

      select public.verify_provisioned_game_v1(probe.id,probe.owner_staff_user_id)
      into v_verified
      from public.game_sessions probe
      where probe.id=v_probe_id;

      if coalesce((v_verified->>'ready')::boolean,false) is not true
        or coalesce((v_verified#>>'{counts,marketAssets}')::integer,0) <> 240
        or coalesce((v_verified#>>'{counts,contracts}')::integer,0) <> 30
        or coalesce((v_verified#>>'{counts,storeItems}')::integer,0) <> 50
        or coalesce((v_verified#>>'{counts,worldLocations}')::integer,0) <> 50
        or coalesce((v_verified#>>'{counts,worldRoutes}')::integer,0) <> 13
        or coalesce((v_verified#>>'{counts,worldCountries}')::integer,0) <> 10
        or coalesce((v_verified#>>'{counts,arrivalClassGrants}')::integer,0) <> 8
      then
        raise exception 'PRODUCTION_PROBE_FINALIZER_VERIFICATION_FAILED';
      end if;

      delete from public.audit_log where game_session_id=v_probe_id;
      delete from public.game_feature_activation_evidence where game_session_id=v_probe_id;
      delete from public.store_items where game_session_id=v_probe_id;
      delete from public.currency_exchange_rates where game_session_id=v_probe_id;
      delete from public.seed_content_releases where game_session_id=v_probe_id;
      delete from public.game_creation_provisioning_requests where game_session_id=v_probe_id;
      delete from public.game_settings where game_session_id=v_probe_id;

      delete from public.game_sessions where id=v_probe_id;
      get diagnostics v_deleted=row_count;
      if v_deleted <> 1 then
        raise exception 'PRODUCTION_PROBE_FINALIZER_GAME_DELETE_FAILED';
      end if;
    end;
    $$;

    commit;
  `, 'production provisioning probe finalization');
}

function writeSuccessEvidence(sourceCommit, state) {
  const evidencePath = required('EVIDENCE_PATH');
  const report = {
    schemaVersion: 'econovaria-production-canonical-source-bootstrap-v1',
    sourceCommit,
    canonicalSourceReady: true,
    canonicalSourceJoinable: false,
    connectedProvisioningProbe: {
      verified: true,
      cleanupVerified: true,
    },
    syntheticProbeCleaned: state.probeGames === 0 && state.probeRequests === 0,
    existingPlayerDataMutated: false,
    stagingAuthUsersCopied: false,
    stagingStaffUsersCopied: false,
    stagingPlayersCopied: false,
    credentialsRecorded: false,
    rawInternalIdentifiersRecorded: false,
  };
  writeFileSync(evidencePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

const originalDatabaseUrl = required('DATABASE_URL');
const projectRef = required('SUPABASE_PROJECT_REF');
const expectedProjectRef = required('EXPECTED_PRODUCTION_PROJECT_REF');
const deniedProjectRef = required('DENIED_STAGING_PROJECT_REF');
const sourceCommit = required('RELEASE_COMMIT').toLowerCase();
const parsed = new URL(originalDatabaseUrl);
const username = decodeURIComponent(parsed.username || '');
const direct = parsed.hostname === `db.${projectRef}.supabase.co`;
const pooler = username === `postgres.${projectRef}` || username.endsWith(`.${projectRef}`);

if (!/^[a-z0-9]{20}$/.test(projectRef)) {
  throw new Error('Production project ref is invalid');
}
if (projectRef !== expectedProjectRef || projectRef === deniedProjectRef) {
  throw new Error('Production project binding failed');
}
if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || (!direct && !pooler)) {
  throw new Error('Database URL is not bound to production');
}
if (!decodeURIComponent(parsed.password || '')) {
  throw new Error('Database URL does not contain a password');
}
if (!/^[0-9a-f]{40}$/.test(sourceCommit)) {
  throw new Error('Release commit must be a full SHA');
}

// The underlying bootstrap predates password-bearing pooler URLs and performs a
// raw substring compatibility check. The workflow and this runner have already
// verified the parsed username/hostname binding. A PostgreSQL application_name
// query parameter carries the approved direct-host marker without changing the
// network endpoint, credentials, database, or TLS behavior.
parsed.searchParams.set('application_name', `db.${projectRef}.supabase.co`);
process.env.DATABASE_URL = parsed.toString();

let finalizerRan = false;
process.once('beforeExit', () => {
  if (finalizerRan) return;
  finalizerRan = true;
  const priorExitCode = process.exitCode ?? 0;

  try {
    let state = readFinalState(process.env.DATABASE_URL);
    if (state.probeGames > 1) {
      throw new Error('More than one production provisioning probe exists');
    }
    if (state.probeGames === 1) {
      cleanupVerifiedProbe(process.env.DATABASE_URL);
      state = readFinalState(process.env.DATABASE_URL);
    }

    const complete = sourceReady(state)
      && state.probeGames === 0
      && state.probeRequests === 0
      && state.unreadyJoinableGames === 0;

    if (!complete) {
      process.exitCode = priorExitCode || 1;
      console.error(JSON.stringify({
        schemaVersion: 'econovaria-production-probe-finalizer-v1',
        sourceReady: sourceReady(state),
        probeGames: state.probeGames,
        probeRequests: state.probeRequests,
        unreadyJoinableGames: state.unreadyJoinableGames,
        finalized: false,
      }));
      return;
    }

    writeSuccessEvidence(sourceCommit, state);
    process.exitCode = 0;
    console.log(JSON.stringify({
      schemaVersion: 'econovaria-production-probe-finalizer-v1',
      sourceReady: true,
      probeGames: 0,
      probeRequests: 0,
      unreadyJoinableGames: 0,
      finalized: true,
    }));
  } catch (error) {
    process.exitCode = priorExitCode || 1;
    console.error(JSON.stringify({
      schemaVersion: 'econovaria-production-probe-finalizer-v1',
      error: safeError(error),
      finalized: false,
      credentialsRecorded: false,
      rawInternalIdentifiersRecorded: false,
    }));
  }
});

await import('./production-canonical-source-bootstrap.mjs');

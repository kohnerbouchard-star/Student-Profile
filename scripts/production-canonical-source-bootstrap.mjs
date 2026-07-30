#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import {
  buildCountryRuntime,
  buildWorldPublication,
} from './world-staging-provision-lib.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(SCRIPT_DIR);
const PACK_ROOT = path.join(REPO_ROOT, 'docs', 'seed-content', 'executable', 'beta-pack-v1');
const CONTRACT_PATH = path.join(
  REPO_ROOT,
  'docs',
  'operations',
  'contracts',
  'beta-seed-downstream-consumer-contract-v1.json',
);
const SOURCE_NAME = '[SYSTEM] Econovaria Canonical Source';
const PROBE_NAME = '[SYNTHETIC] Production Provisioning Probe';
const SOURCE_STAFF_EMAIL = 'canonical-source@econovaria.internal';
const SOURCE_STAFF_NAME = 'Econovaria Canonical Provisioner';
const PACK_ID = 'econovaria.beta-seed-pack.v1';
const EVIDENCE_PATH = '/tmp/production-canonical-source-bootstrap.json';

function required(name) {
  const value = String(process.env[name] ?? '').trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function safeError(error) {
  return String(error?.message ?? error ?? 'Unknown production bootstrap error')
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi,
      '[uuid-redacted]',
    )
    .replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, '[key-redacted]')
    .replace(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, '[jwt-redacted]')
    .replace(/postgresql:\/\/[^\s]+/gi, '[database-url-redacted]')
    .slice(0, 4000);
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function jsonSql(value, tag = 'json') {
  const serialized = JSON.stringify(value);
  requireCondition(!serialized.includes(`$${tag}$`), `JSON payload contains reserved ${tag} delimiter`);
  return `$${tag}$${serialized}$${tag}$::jsonb`;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function parseJsonLine(output, label) {
  const lines = String(output)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  requireCondition(lines.length > 0, `${label} returned no JSON`);
  try {
    return JSON.parse(lines.at(-1));
  } catch {
    throw new Error(`${label} returned invalid JSON`);
  }
}

async function runSql(databaseUrl, sql, label) {
  const file = path.join(os.tmpdir(), `econovaria-production-source-${randomUUID()}.sql`);
  await writeFile(file, `${sql.trim()}\n`, 'utf8');
  try {
    const result = spawnSync(
      'psql',
      [databaseUrl, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-f', file],
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
  } finally {
    await unlink(file).catch(() => {});
  }
}

async function callRpc(supabaseUrl, serviceRoleKey, name, payload) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!response.ok) {
    throw new Error(`Supabase RPC ${name} failed with ${response.status}: ${safeError(body)}`);
  }
  return body;
}

async function assertBindings() {
  const projectRef = required('SUPABASE_PROJECT_REF');
  const expectedProjectRef = required('EXPECTED_PRODUCTION_PROJECT_REF');
  const deniedProjectRef = required('DENIED_STAGING_PROJECT_REF');
  const supabaseUrl = required('SUPABASE_URL').replace(/\/$/, '');
  const databaseUrl = required('DATABASE_URL');
  const sourceSha = required('RELEASE_COMMIT').toLowerCase();
  const authorizationPath = required('AUTHORIZATION_PATH');
  const authorization = await readJson(path.resolve(authorizationPath));
  const integrity = await readJson(path.join(PACK_ROOT, 'integrity-manifest-v1.json'));

  requireCondition(/^[a-z0-9]{20}$/.test(projectRef), 'Production project ref is invalid');
  requireCondition(projectRef === expectedProjectRef, 'Selected project is not the approved production project');
  requireCondition(projectRef !== deniedProjectRef, 'Staging project is denied');
  requireCondition(supabaseUrl === `https://${projectRef}.supabase.co`, 'Supabase URL does not match production');
  requireCondition(
    databaseUrl.includes(`postgres.${projectRef}@`) || databaseUrl.includes(`db.${projectRef}.supabase.co`),
    'Database URL does not bind to production',
  );
  requireCondition(/^[0-9a-f]{40}$/.test(sourceSha), 'Release commit must be a full SHA');

  requireCondition(
    authorization.schemaVersion === 'econovaria.production-canonical-source-bootstrap.v1',
    'Authorization schema mismatch',
  );
  requireCondition(authorization.action === 'BOOTSTRAP_NON_JOINABLE_CANONICAL_SOURCE', 'Authorization action mismatch');
  requireCondition(authorization.targetProjectRef === projectRef, 'Authorization target mismatch');
  requireCondition(authorization.deniedProjectRef === deniedProjectRef, 'Authorization denied target mismatch');
  requireCondition(authorization.mergedMainOnly === true, 'Merged-main authorization is required');
  requireCondition(authorization.canonicalSourceJoinable === false, 'Canonical source must remain non-joinable');
  requireCondition(authorization.copyStagingAuthUsers === false, 'Staging Auth copy must be denied');
  requireCondition(authorization.copyStagingStaffUsers === false, 'Staging Staff copy must be denied');
  requireCondition(authorization.copyStagingPlayers === false, 'Staging Player copy must be denied');
  requireCondition(authorization.mutateExistingPlayerData === false, 'Existing Player mutation must be denied');
  requireCondition(authorization.activateDeterministicSeedWorldCrafting === true, 'Content activation is not authorized');
  requireCondition(authorization.runDisposableProvisioningProbe === true, 'Provisioning probe is not authorized');
  requireCondition(authorization.cleanupProvisioningProbe === true, 'Probe cleanup is required');
  requireCondition(authorization.packId === integrity.packId, 'Authorized pack ID mismatch');
  requireCondition(authorization.packVersion === integrity.version, 'Authorized pack version mismatch');
  requireCondition(authorization.packSha256 === integrity.packSha256, 'Authorized pack digest mismatch');
  requireCondition(authorization.sourceEnvironmentLabel === 'staging', 'Canonical source environment label must remain staging');
  requireCondition(integrity.productionAuthorized === false, 'Only the non-production source pack is permitted');

  return {
    authorization,
    databaseUrl,
    deniedProjectRef,
    integrity,
    projectRef,
    sourceSha,
    supabaseUrl,
  };
}

async function resolveSystemIdentities(databaseUrl, projectRef) {
  const output = await runSql(databaseUrl, `
    select jsonb_build_object(
      'staffId', public.seed_content_stable_uuid_v1('econovaria-system-staff|' || ${sqlLiteral(projectRef)}),
      'authId', public.seed_content_stable_uuid_v1('econovaria-system-auth|' || ${sqlLiteral(projectRef)}),
      'sourceGameId', public.seed_content_stable_uuid_v1('econovaria-canonical-source|' || ${sqlLiteral(projectRef)})
    )::text;
  `, 'system identity resolution');
  return parseJsonLine(output, 'system identity resolution');
}

async function sourceState(databaseUrl, sourceGameId) {
  const output = await runSql(databaseUrl, `
    select jsonb_build_object(
      'releaseMembers', coalesce((
        select count(*)
        from public.seed_content_release_members as member_row
        join public.seed_content_releases as release_row on release_row.id = member_row.release_id
        where release_row.game_session_id = ${sqlLiteral(sourceGameId)}::uuid
          and release_row.pack_id = ${sqlLiteral(PACK_ID)}
          and release_row.status = 'applied_active'
      ), 0),
      'worldRuntime', (select count(*) from public.world_runtime_instances where game_session_id = ${sqlLiteral(sourceGameId)}::uuid and revision = 0),
      'worldLocations', (select count(*) from public.world_location_states where game_session_id = ${sqlLiteral(sourceGameId)}::uuid),
      'worldRoutes', (select count(*) from public.world_route_states where game_session_id = ${sqlLiteral(sourceGameId)}::uuid),
      'worldCountries', (select count(*) from public.world_country_runtime where game_session_id = ${sqlLiteral(sourceGameId)}::uuid),
      'arrivalClassGrants', (select count(*) from public.arrival_class_grant_runtime where game_session_id = ${sqlLiteral(sourceGameId)}::uuid),
      'activeCraftingPacks', (select count(*) from public.game_session_physical_economy_packs where game_session_id = ${sqlLiteral(sourceGameId)}::uuid and status = 'active'),
      'joinable', exists (
        select 1 from public.game_sessions
        where id = ${sqlLiteral(sourceGameId)}::uuid
          and game_join_code_status = 'active'
          and game_join_code is not null
      )
    )::text;
  `, 'canonical source completeness read');
  return parseJsonLine(output, 'canonical source completeness read');
}

function sourceIsComplete(state) {
  return state.releaseMembers === 590
    && state.worldRuntime === 1
    && state.worldLocations === 50
    && state.worldRoutes === 13
    && state.worldCountries === 10
    && state.arrivalClassGrants === 8
    && state.activeCraftingPacks === 1
    && state.joinable === false;
}

async function prepareSource(databaseUrl, identities) {
  const initial = await sourceState(databaseUrl, identities.sourceGameId);
  if (sourceIsComplete(initial)) return { created: false, initial };

  await runSql(databaseUrl, `
    begin;

    delete from public.game_sessions
    where id = ${sqlLiteral(identities.sourceGameId)}::uuid
      and name = ${sqlLiteral(SOURCE_NAME)}
      and game_join_code_status <> 'active';

    insert into public.staff_users (id, supabase_auth_user_id, email, display_name)
    values (
      ${sqlLiteral(identities.staffId)}::uuid,
      ${sqlLiteral(identities.authId)}::uuid,
      ${sqlLiteral(SOURCE_STAFF_EMAIL)},
      ${sqlLiteral(SOURCE_STAFF_NAME)}
    )
    on conflict (id) do update
    set display_name = excluded.display_name,
        email = excluded.email,
        updated_at = now();

    insert into public.game_sessions (
      id, owner_staff_user_id, name, status, lifecycle_state,
      game_join_code_hash, game_join_code_status, provisioning_status
    ) values (
      ${sqlLiteral(identities.sourceGameId)}::uuid,
      ${sqlLiteral(identities.staffId)}::uuid,
      ${sqlLiteral(SOURCE_NAME)},
      'active',
      'active',
      null,
      'pending',
      'pending'
    );

    insert into public.game_settings (game_session_id, difficulty_preset, stock_market_window)
    values (
      ${sqlLiteral(identities.sourceGameId)}::uuid,
      'moderate',
      '{"timezone":"Asia/Seoul"}'::jsonb
    );

    commit;
  `, 'canonical source setup');
  return { created: true, initial };
}

async function activateSeed(bindings, identities, serviceRoleKey) {
  const [pack, market, contracts, store] = await Promise.all([
    readJson(path.join(PACK_ROOT, 'pack-v1.json')),
    readJson(path.join(PACK_ROOT, 'market-templates-v1.json')),
    readJson(path.join(PACK_ROOT, 'tutorial-contract-chains-v1.json')),
    readJson(path.join(PACK_ROOT, 'store-catalog-v1.json')),
  ]);

  requireCondition(pack.packId === bindings.integrity.packId, 'Pack ID does not match integrity manifest');
  requireCondition(pack.version === bindings.integrity.version, 'Pack version does not match integrity manifest');
  requireCondition(market.templates.length === 240, 'Market template count must be 240');
  requireCondition(contracts.templates.length === 30, 'Contract template count must be 30');
  requireCondition(store.items.length === 50, 'Store item count must be 50');

  const result = await callRpc(
    bindings.supabaseUrl,
    serviceRoleKey,
    'apply_seed_content_release_revision_v2',
    {
      p_game_session_id: identities.sourceGameId,
      p_pack_id: pack.packId,
      p_version: pack.version,
      p_pack_sha256: bindings.integrity.packSha256,
      p_target_environment: 'staging',
      p_activate: true,
      p_authorization_id: `production-canonical-source-${bindings.sourceSha.slice(0, 12)}`,
      p_approved_by: 'Production canonical source bootstrap V1',
      p_market_templates: market.templates,
      p_contract_templates: contracts.templates,
      p_store_items: store.items,
      p_fail_after_operations: null,
      p_source_sha: bindings.sourceSha,
    },
  );
  requireCondition(
    ['applied', 'replayed', 'resumed'].includes(result?.outcome),
    `Seed activation returned ${result?.outcome ?? 'unknown'}`,
  );
}

async function publishWorld(databaseUrl, identities) {
  const [downstreamContract, locationRegistry, calibration] = await Promise.all([
    readJson(CONTRACT_PATH),
    readJson(path.join(PACK_ROOT, 'location-registry-verified-v1.json')),
    readJson(path.join(PACK_ROOT, 'calibration-scenarios-v1.json')),
  ]);
  const publication = buildWorldPublication({
    downstreamContract,
    locations: locationRegistry,
    calibration,
  });

  await runSql(databaseUrl, `
    select row_to_json(runtime_result)::text
    from public.initialize_world_runtime_v1(
      ${sqlLiteral(identities.sourceGameId)}::uuid,
      ${sqlLiteral(publication.definition.packId)},
      ${sqlLiteral(publication.definition.packVersion)},
      ${sqlLiteral(publication.definition.definitionDigest)},
      ${jsonSql(publication.locations, 'locations')},
      ${jsonSql(publication.routes, 'routes')},
      now()
    ) as runtime_result;
  `, 'canonical World publication');

  const profiles = parseJsonLine(await runSql(databaseUrl, `
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id,
      'country_code', country_code,
      'country_name', country_name,
      'capital_name', capital_name,
      'currency_code', currency_code,
      'status', status
    ) order by country_code), '[]'::jsonb)::text
    from public.country_profiles
    where status = 'active';
  `, 'country profile read'), 'country profile read');
  requireCondition(profiles.length === 10, 'Canonical country profile count is not ten');

  const runtime = buildCountryRuntime({
    downstreamContract,
    locationRegistry,
    countryProfiles: profiles,
  });
  await runSql(databaseUrl, `
    select row_to_json(country_result)::text
    from public.initialize_world_country_runtime_v2(
      ${sqlLiteral(identities.sourceGameId)}::uuid,
      ${jsonSql(runtime.countries, 'countries')},
      ${jsonSql(runtime.classGrants, 'grants')}
    ) as country_result;
  `, 'World country publication');
}

async function activateCrafting(databaseUrl, identities) {
  const packPath = required('PHYSICAL_ECONOMY_PACK');
  const pack = await readJson(packPath);
  requireCondition(
    pack.schemaVersion === 'econovaria-physical-economy-runtime-pack-v1',
    'Physical-economy pack schema is invalid',
  );
  requireCondition(
    pack.activationAuthorization?.productionAuthorized === false,
    'Only the non-production Crafting source pack is permitted',
  );

  const imported = parseJsonLine(await runSql(databaseUrl, `
    select public.import_physical_economy_pack_v1(
      ${sqlLiteral(identities.sourceGameId)}::uuid,
      ${sqlLiteral(identities.staffId)}::uuid,
      ${jsonSql(pack, 'physical_pack')},
      ${sqlLiteral(pack.contentDigest)},
      'production.canonical.pack.import.v1'
    )::text;
  `, 'Crafting source import'), 'Crafting source import');
  requireCondition(['imported', 'replayed'].includes(imported.outcome), `Crafting import returned ${imported.outcome}`);

  const activated = parseJsonLine(await runSql(databaseUrl, `
    select public.activate_physical_economy_pack_v1(
      ${sqlLiteral(identities.sourceGameId)}::uuid,
      ${sqlLiteral(identities.staffId)}::uuid,
      ${sqlLiteral(pack.packKey)},
      ${sqlLiteral(pack.contentVersion)},
      'production.canonical.pack.activate.v1'
    )::text;
  `, 'Crafting source activation'), 'Crafting source activation');
  requireCondition(activated.status === 'active', 'Crafting source is not active');
}

async function connectedProbe(databaseUrl, identities) {
  const key = `production.connected.probe.${Date.now()}`;
  const created = parseJsonLine(await runSql(databaseUrl, `
    select public.create_provisioned_game_v2(
      ${sqlLiteral(identities.staffId)}::uuid,
      ${sqlLiteral(PROBE_NAME)},
      '{"difficulty_preset":"hard","stock_market_window":{"timezone":"Asia/Seoul"}}'::jsonb,
      ${sqlLiteral(key)},
      ${sqlLiteral(PACK_ID)}
    )::text;
  `, 'production provisioning probe'), 'production provisioning probe');

  requireCondition(created.outcome === 'created', `Probe returned ${created.outcome}`);
  requireCondition(created.provisioningStatus === 'ready', 'Probe did not reach ready');
  requireCondition(created.counts?.marketAssets === 240, 'Probe market count failed');
  requireCondition(created.counts?.contracts === 30, 'Probe Contract count failed');
  requireCondition(created.counts?.storeItems === 50, 'Probe Store count failed');
  requireCondition(created.counts?.worldLocations === 50, 'Probe World count failed');
  requireCondition(created.counts?.craftingItems === 144, 'Probe Crafting count failed');
  requireCondition(created.contentGates?.story === 'active', 'Probe Story gate failed');
  requireCondition(created.contentGates?.arrivalGrantProcessor === 'active', 'Probe Arrival gate failed');

  const verified = parseJsonLine(await runSql(databaseUrl, `
    select public.verify_provisioned_game_v1(
      ${sqlLiteral(created.gameSessionId)}::uuid,
      ${sqlLiteral(identities.staffId)}::uuid
    )::text;
  `, 'production provisioning verification'), 'production provisioning verification');
  requireCondition(verified.ready === true, 'Production provisioning probe verification failed');

  await runSql(databaseUrl, `
    begin;
    delete from public.game_sessions where id = ${sqlLiteral(created.gameSessionId)}::uuid;
    delete from public.game_creation_provisioning_requests
    where staff_user_id = ${sqlLiteral(identities.staffId)}::uuid
      and idempotency_key = ${sqlLiteral(key)};
    commit;
  `, 'production provisioning probe cleanup');

  return {
    verified: true,
    counts: verified.counts,
    plaintextGameCodeRecorded: false,
    probeResidue: false,
  };
}

async function main() {
  const bindings = await assertBindings();
  const serviceRoleKey = required('SUPABASE_SERVICE_ROLE_KEY');
  const identities = await resolveSystemIdentities(bindings.databaseUrl, bindings.projectRef);
  const source = await prepareSource(bindings.databaseUrl, identities);

  try {
    let state = await sourceState(bindings.databaseUrl, identities.sourceGameId);
    if (!sourceIsComplete(state)) {
      await activateSeed(bindings, identities, serviceRoleKey);
      await publishWorld(bindings.databaseUrl, identities);
      await activateCrafting(bindings.databaseUrl, identities);
      state = await sourceState(bindings.databaseUrl, identities.sourceGameId);
    }
    requireCondition(sourceIsComplete(state), 'Production canonical source is incomplete');

    const preflight = parseJsonLine(await runSql(bindings.databaseUrl, `
      select public.game_provisioning_preflight_v1(${sqlLiteral(PACK_ID)})::text;
    `, 'game provisioning preflight'), 'game provisioning preflight');
    requireCondition(preflight.ready === true, 'Production provisioning preflight is not ready');

    const probe = await connectedProbe(bindings.databaseUrl, identities);
    const report = {
      schemaVersion: 'econovaria-production-canonical-source-bootstrap-v1',
      sourceCommit: bindings.sourceSha,
      projectRefSha256Bound: true,
      canonicalPack: {
        id: preflight.packId,
        version: preflight.packVersion,
        sha256: preflight.packSha256,
      },
      canonicalSourceReady: true,
      canonicalSourceJoinable: false,
      connectedProvisioningProbe: probe,
      existingPlayerDataMutated: false,
      stagingAuthUsersCopied: false,
      stagingStaffUsersCopied: false,
      stagingPlayersCopied: false,
      syntheticProbeCleaned: true,
      credentialsRecorded: false,
      rawInternalIdentifiersRecorded: false,
    };
    const serialized = JSON.stringify(report);
    requireCondition(
      !/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(serialized),
      'Sanitized report contains a raw UUID',
    );
    await writeFile(EVIDENCE_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    if (source.created) {
      await runSql(bindings.databaseUrl, `
        delete from public.game_sessions
        where id = ${sqlLiteral(identities.sourceGameId)}::uuid
          and name = ${sqlLiteral(SOURCE_NAME)}
          and game_join_code_status <> 'active';
      `, 'failed canonical source cleanup').catch(() => {});
    }
    throw error;
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    error: safeError(error),
    existingPlayerDataMutated: false,
    stagingUsersCopied: false,
    credentialsRecorded: false,
    rawInternalIdentifiersRecorded: false,
  }));
  process.exitCode = 1;
});

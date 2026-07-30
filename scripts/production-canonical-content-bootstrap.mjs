#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { validateSeedBetaPack } from './seed-beta-pack-validator.mjs';
import {
  buildCountryRuntime,
  buildWorldPublication,
} from './world-staging-provision-lib.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(SCRIPT_DIR);
const PACK_ROOT = path.join(REPO_ROOT, 'docs', 'seed-content', 'executable', 'beta-pack-v1');
const DOWNSTREAM_CONTRACT_PATH = path.join(
  REPO_ROOT,
  'docs',
  'operations',
  'contracts',
  'beta-seed-downstream-consumer-contract-v1.json',
);
const PACK_ID = 'econovaria.beta-seed-pack.v1';
const SOURCE_NAME = '[SYSTEM] Econovaria Production Canonical Source';
const SOURCE_STAFF_EMAIL = 'production-canonical-source@econovaria.internal';
const SOURCE_STAFF_NAME = 'Econovaria Production Canonical Provisioner';
const EVIDENCE_PATH = '/tmp/production-canonical-content-bootstrap.json';

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
  const file = path.join(os.tmpdir(), `econovaria-production-bootstrap-${randomUUID()}.sql`);
  await writeFile(file, `${sql.trim()}\n`, 'utf8');
  try {
    const result = spawnSync(
      'psql',
      [databaseUrl, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-f', file],
      {
        encoding: 'utf8',
        maxBuffer: 60 * 1024 * 1024,
        env: process.env,
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

function assertBindings() {
  const projectRef = required('SUPABASE_PROJECT_REF');
  const expectedProjectRef = required('EXPECTED_PRODUCTION_PROJECT_REF');
  const deniedProjectRef = required('DENIED_STAGING_PROJECT_REF');
  const supabaseUrl = required('SUPABASE_URL').replace(/\/$/, '');
  const databaseUrl = required('DATABASE_URL');
  const releaseCommit = required('RELEASE_COMMIT').toLowerCase();

  requireCondition(/^[a-z0-9]{20}$/.test(projectRef), 'Production project ref is invalid');
  requireCondition(projectRef === expectedProjectRef, 'Selected project is not the approved production project');
  requireCondition(projectRef !== deniedProjectRef, 'Staging project is denied');
  requireCondition(supabaseUrl === `https://${projectRef}.supabase.co`, 'Supabase URL does not match production project');
  requireCondition(
    databaseUrl.includes(`postgres.${projectRef}@`) || databaseUrl.includes(`db.${projectRef}.supabase.co`),
    'Database URL does not bind to production project',
  );
  requireCondition(/^[0-9a-f]{40}$/.test(releaseCommit), 'Release commit must be a full SHA');

  return { projectRef, deniedProjectRef, supabaseUrl, databaseUrl, releaseCommit };
}

async function resolveSystemIdentities(databaseUrl, projectRef) {
  const output = await runSql(databaseUrl, `
    select jsonb_build_object(
      'staffId', public.seed_content_stable_uuid_v1(
        'econovaria-system-staff|' || ${sqlLiteral(projectRef)}
      ),
      'authId', public.seed_content_stable_uuid_v1(
        'econovaria-system-auth|' || ${sqlLiteral(projectRef)}
      ),
      'sourceGameId', public.seed_content_stable_uuid_v1(
        'econovaria-canonical-source|' || ${sqlLiteral(projectRef)}
      )
    )::text;
  `, 'system identity resolution');
  return parseJsonLine(output, 'system identity resolution');
}

async function loadAuthority(bindings, identities) {
  const authorizationPath = required('PRODUCTION_CONTENT_AUTHORIZATION');
  const authorization = await readJson(authorizationPath);
  const [pack, integrity] = await Promise.all([
    readJson(path.join(PACK_ROOT, 'pack-v1.json')),
    readJson(path.join(PACK_ROOT, 'integrity-manifest-v1.json')),
  ]);
  const physicalPack = await readJson(required('PHYSICAL_ECONOMY_PACK'));

  requireCondition(
    authorization.schemaVersion === 'econovaria.production-content-promotion.v1',
    'Production authorization schema is invalid',
  );
  requireCondition(authorization.allowProductionContentPromotion === true, 'Production promotion is not allowed');
  requireCondition(authorization.productionAuthorized === true, 'Production authorization flag is missing');
  requireCondition(authorization.projectRef === bindings.projectRef, 'Authorization project ref mismatch');
  requireCondition(authorization.deniedProjectRef === bindings.deniedProjectRef, 'Authorization denied project mismatch');
  requireCondition(authorization.sourceGameSessionId === identities.sourceGameId, 'Authorization source game mismatch');
  requireCondition(authorization.packId === pack.packId, 'Authorization pack ID mismatch');
  requireCondition(authorization.packVersion === pack.version, 'Authorization pack version mismatch');
  requireCondition(authorization.packSha256 === integrity.packSha256, 'Authorization Seed digest mismatch');
  requireCondition(
    authorization.physicalEconomyContentDigest === physicalPack.contentDigest,
    'Authorization physical-economy digest mismatch',
  );
  requireCondition(
    authorization.physicalEconomySourceCommit === physicalPack.sourceCommit,
    'Authorization physical-economy source mismatch',
  );
  requireCondition(
    typeof authorization.ownerStaffUserId === 'string'
      && /^[0-9a-f-]{36}$/i.test(authorization.ownerStaffUserId),
    'Authorization owner Staff ID is invalid',
  );
  requireCondition(
    typeof authorization.targetGameName === 'string'
      && authorization.targetGameName.trim().length >= 1
      && authorization.targetGameName.trim().length <= 120,
    'Authorization target game name is invalid',
  );
  requireCondition(
    typeof authorization.idempotencyKey === 'string'
      && /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(authorization.idempotencyKey),
    'Authorization idempotency key is invalid',
  );
  requireCondition(
    typeof authorization.authorizationId === 'string' && authorization.authorizationId.trim(),
    'Authorization ID is missing',
  );
  requireCondition(
    typeof authorization.authorizedBy === 'string' && authorization.authorizedBy.trim(),
    'Authorization approver is missing',
  );
  const authorizedAt = Date.parse(authorization.authorizedAt);
  const expiresAt = Date.parse(authorization.expiresAt);
  requireCondition(
    Number.isFinite(authorizedAt)
      && Number.isFinite(expiresAt)
      && authorizedAt <= Date.now()
      && expiresAt > Date.now()
      && expiresAt > authorizedAt,
    'Production authorization is future-dated or expired',
  );

  return { authorization, pack, integrity, physicalPack };
}

async function verifyOwner(databaseUrl, authorization) {
  const state = parseJsonLine(await runSql(databaseUrl, `
    select jsonb_build_object(
      'staffExists', exists(
        select 1 from public.staff_users where id = ${sqlLiteral(authorization.ownerStaffUserId)}::uuid
      ),
      'ownsPreservedGame', exists(
        select 1 from public.game_sessions
        where owner_staff_user_id = ${sqlLiteral(authorization.ownerStaffUserId)}::uuid
          and name not like '[SYSTEM]%'
          and name not like '[SYNTHETIC]%'
      )
    )::text;
  `, 'owner verification'), 'owner verification');
  requireCondition(state.staffExists === true, 'Authorized owner Staff row is missing');
  requireCondition(state.ownsPreservedGame === true, 'Authorized owner does not own the preserved production game');
}

async function recordAuthorization(databaseUrl, bindings, identities, authority) {
  const { authorization, integrity, physicalPack } = authority;
  const output = await runSql(databaseUrl, `
    insert into public.production_content_promotions (
      authorization_id, project_ref, denied_project_ref,
      source_game_session_id, target_owner_staff_user_id,
      pack_id, pack_version, pack_sha256,
      physical_economy_content_digest, physical_economy_source_commit,
      authorized_by, authorized_at, expires_at, status, result
    ) values (
      ${sqlLiteral(authorization.authorizationId)},
      ${sqlLiteral(bindings.projectRef)},
      ${sqlLiteral(bindings.deniedProjectRef)},
      ${sqlLiteral(identities.sourceGameId)}::uuid,
      ${sqlLiteral(authorization.ownerStaffUserId)}::uuid,
      ${sqlLiteral(authorization.packId)},
      ${sqlLiteral(authorization.packVersion)},
      ${sqlLiteral(integrity.packSha256)},
      ${sqlLiteral(physicalPack.contentDigest)},
      ${sqlLiteral(physicalPack.sourceCommit)},
      ${sqlLiteral(authorization.authorizedBy)},
      ${sqlLiteral(authorization.authorizedAt)}::timestamptz,
      ${sqlLiteral(authorization.expiresAt)}::timestamptz,
      'authorized',
      jsonb_build_object('releaseCommit', ${sqlLiteral(bindings.releaseCommit)})
    )
    on conflict (authorization_id) do update
    set updated_at = now()
    where public.production_content_promotions.project_ref = excluded.project_ref
      and public.production_content_promotions.source_game_session_id = excluded.source_game_session_id
      and public.production_content_promotions.target_owner_staff_user_id = excluded.target_owner_staff_user_id
      and public.production_content_promotions.pack_id = excluded.pack_id
      and public.production_content_promotions.pack_version = excluded.pack_version
      and public.production_content_promotions.pack_sha256 = excluded.pack_sha256
      and public.production_content_promotions.physical_economy_content_digest = excluded.physical_economy_content_digest
      and public.production_content_promotions.physical_economy_source_commit = excluded.physical_economy_source_commit
    returning jsonb_build_object(
      'status', status,
      'alreadyConsumed', consumed_at is not null,
      'targetGamePresent', target_game_session_id is not null
    )::text;
  `, 'authorization ledger write');
  return parseJsonLine(output, 'authorization ledger write');
}

async function sourceIsComplete(databaseUrl, sourceGameId) {
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
      'activeCraftingPacks', (select count(*) from public.game_session_physical_economy_packs where game_session_id = ${sqlLiteral(sourceGameId)}::uuid and status = 'active')
    )::text;
  `, 'canonical source completeness read');
  const state = parseJsonLine(output, 'canonical source completeness read');
  return {
    complete: state.releaseMembers === 590
      && state.worldRuntime === 1
      && state.worldLocations === 50
      && state.worldRoutes === 13
      && state.worldCountries === 10
      && state.arrivalClassGrants === 8
      && state.activeCraftingPacks === 1,
    state,
  };
}

async function prepareSource(databaseUrl, identities) {
  const state = await sourceIsComplete(databaseUrl, identities.sourceGameId);
  if (state.complete) return { created: false, state: state.state };

  await runSql(databaseUrl, `
    begin;

    delete from public.game_sessions
    where id = ${sqlLiteral(identities.sourceGameId)}::uuid
      and game_join_code_status <> 'active';

    insert into public.staff_users (
      id, supabase_auth_user_id, email, display_name
    ) values (
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

    insert into public.game_settings (
      game_session_id, difficulty_preset, stock_market_window
    ) values (
      ${sqlLiteral(identities.sourceGameId)}::uuid,
      'moderate',
      '{"timezone":"Asia/Seoul"}'::jsonb
    );

    commit;
  `, 'production canonical source setup');

  return { created: true, state: null };
}

async function adoptLegacyStockTemplates(databaseUrl, market, integrity) {
  const marker = {
    packId: PACK_ID,
    version: market.version ?? '1.0.0-beta',
    packSha256: integrity.packSha256,
  };
  const result = parseJsonLine(await runSql(databaseUrl, `
    with canonical as (
      select upper(value->>'ticker') as ticker
      from jsonb_array_elements(${jsonSql(market.templates, 'market_templates')})
    ), conflicts as (
      select st.ticker
      from public.stock_templates st
      join canonical c on c.ticker = upper(st.ticker)
      where st.fundamentals #>> '{_seed,packId}' is not null
        and st.fundamentals #>> '{_seed,packId}' <> ${sqlLiteral(PACK_ID)}
    ), adopted as (
      update public.stock_templates st
      set fundamentals = coalesce(st.fundamentals, '{}'::jsonb)
        || jsonb_build_object('_seed', ${jsonSql(marker, 'seed_marker')})
      from canonical c
      where c.ticker = upper(st.ticker)
        and st.fundamentals #>> '{_seed,packId}' is null
        and not exists (select 1 from conflicts)
      returning st.id
    )
    select jsonb_build_object(
      'conflicts', (select count(*) from conflicts),
      'adopted', (select count(*) from adopted)
    )::text;
  `, 'legacy stock-template adoption'), 'legacy stock-template adoption');
  requireCondition(result.conflicts === 0, 'Foreign Seed-owned stock-template conflict detected');
  return result;
}

async function activateSeed(databaseUrl, identities, authority) {
  const validation = await validateSeedBetaPack({ packRoot: PACK_ROOT });
  requireCondition(validation.valid, `Seed pack validation failed with ${validation.summary.errors} errors`);

  const [market, contracts, store] = await Promise.all([
    readJson(path.join(PACK_ROOT, 'market-templates-v1.json')),
    readJson(path.join(PACK_ROOT, 'tutorial-contract-chains-v1.json')),
    readJson(path.join(PACK_ROOT, 'store-catalog-v1.json')),
  ]);

  const adoption = await adoptLegacyStockTemplates(databaseUrl, market, authority.integrity);
  const outcome = parseJsonLine(await runSql(databaseUrl, `
    select public.apply_seed_content_release_v1(
      ${sqlLiteral(identities.sourceGameId)}::uuid,
      ${sqlLiteral(authority.pack.packId)},
      ${sqlLiteral(authority.pack.version)},
      ${sqlLiteral(authority.integrity.packSha256)},
      'staging',
      true,
      ${sqlLiteral(authority.authorization.authorizationId)},
      ${sqlLiteral(authority.authorization.authorizedBy)},
      ${jsonSql(market.templates, 'market_payload')},
      ${jsonSql(contracts.templates, 'contract_payload')},
      ${jsonSql(store.items, 'store_payload')},
      null
    )::text;
  `, 'production Seed release application'), 'production Seed release application');

  requireCondition(
    ['applied', 'replayed', 'resumed'].includes(outcome.outcome),
    `Seed release returned ${outcome.outcome}`,
  );
  requireCondition(outcome.operationCount === 590, 'Seed release operation count is not 590');
  return { validation: validation.summary, adoption, outcome };
}

async function publishWorld(databaseUrl, identities) {
  const [downstreamContract, locationRegistry, calibration] = await Promise.all([
    readJson(DOWNSTREAM_CONTRACT_PATH),
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
  `, 'production canonical World publication');

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
  `, 'production World country publication');
}

async function activateCrafting(databaseUrl, identities, authority) {
  const pack = authority.physicalPack;
  requireCondition(pack.schemaVersion === 'econovaria-physical-economy-runtime-pack-v1', 'Physical-economy pack schema is invalid');
  requireCondition(pack.packKey === PACK_ID, 'Physical-economy pack key mismatch');
  requireCondition(pack.contentVersion === authority.authorization.packVersion, 'Physical-economy pack version mismatch');
  requireCondition(pack.contentDigest === authority.authorization.physicalEconomyContentDigest, 'Physical-economy digest mismatch');
  requireCondition(pack.sourceCommit === authority.authorization.physicalEconomySourceCommit, 'Physical-economy source mismatch');

  const imported = parseJsonLine(await runSql(databaseUrl, `
    select public.import_physical_economy_pack_v1(
      ${sqlLiteral(identities.sourceGameId)}::uuid,
      ${sqlLiteral(identities.staffId)}::uuid,
      ${jsonSql(pack, 'physical_pack')},
      ${sqlLiteral(pack.contentDigest)},
      'production.canonical.pack.import.v1'
    )::text;
  `, 'production Crafting source import'), 'production Crafting source import');
  requireCondition(['imported', 'replayed'].includes(imported.outcome), `Crafting import returned ${imported.outcome}`);

  const activated = parseJsonLine(await runSql(databaseUrl, `
    select public.activate_physical_economy_pack_v1(
      ${sqlLiteral(identities.sourceGameId)}::uuid,
      ${sqlLiteral(identities.staffId)}::uuid,
      ${sqlLiteral(pack.packKey)},
      ${sqlLiteral(pack.contentVersion)},
      'production.canonical.pack.activate.v1'
    )::text;
  `, 'production Crafting source activation'), 'production Crafting source activation');
  requireCondition(activated.status === 'active', 'Production Crafting source is not active');
  return { imported, activated };
}

async function provisionProductionGame(databaseUrl, authority) {
  const authorization = authority.authorization;
  const created = parseJsonLine(await runSql(databaseUrl, `
    select public.create_provisioned_game_v2(
      ${sqlLiteral(authorization.ownerStaffUserId)}::uuid,
      ${sqlLiteral(authorization.targetGameName.trim())},
      '{"difficulty_preset":"moderate","stock_market_window":{"timezone":"Asia/Seoul"}}'::jsonb,
      ${sqlLiteral(authorization.idempotencyKey)},
      ${sqlLiteral(PACK_ID)}
    )::text;
  `, 'production game provisioning'), 'production game provisioning');

  requireCondition(['created', 'replayed'].includes(created.outcome), `Production game provisioning returned ${created.outcome}`);
  requireCondition(created.provisioningStatus === 'ready', 'Production game did not reach ready');
  requireCondition(created.counts?.marketAssets === 240, 'Production market count failed');
  requireCondition(created.counts?.contracts === 30, 'Production Contract count failed');
  requireCondition(created.counts?.storeItems === 50, 'Production Store count failed');
  requireCondition(created.counts?.worldLocations === 50, 'Production World location count failed');
  requireCondition(created.counts?.worldRoutes === 13, 'Production World route count failed');
  requireCondition(created.counts?.worldCountries === 10, 'Production World country count failed');
  requireCondition(created.counts?.arrivalClassGrants === 8, 'Production Arrival grant count failed');
  requireCondition(created.counts?.craftingItems === 144, 'Production Crafting item count failed');
  requireCondition(created.contentGates?.story === 'active', 'Production Story gate failed');
  requireCondition(created.contentGates?.arrivalGrantProcessor === 'active', 'Production Arrival gate failed');

  const verified = parseJsonLine(await runSql(databaseUrl, `
    select public.verify_provisioned_game_v1(
      ${sqlLiteral(created.gameSessionId)}::uuid,
      ${sqlLiteral(authorization.ownerStaffUserId)}::uuid
    )::text;
  `, 'production provisioning verification'), 'production provisioning verification');
  requireCondition(verified.ready === true, 'Production provisioning verification failed');

  return {
    outcome: created.outcome,
    gameSessionId: created.gameSessionId,
    counts: verified.counts,
    contentGates: created.contentGates,
    joinCodePersisted: typeof created.joinCode === 'string' && created.joinCode.length > 0,
  };
}

async function completePromotion(databaseUrl, authority, provisioned, sourceState) {
  const authorization = authority.authorization;
  const sanitizedResult = {
    ready: true,
    targetGameName: authorization.targetGameName,
    provisioningOutcome: provisioned.outcome,
    counts: provisioned.counts,
    contentGates: provisioned.contentGates,
    joinCodePersisted: provisioned.joinCodePersisted,
    sourceCounts: sourceState,
    plaintextJoinCodeRecorded: false,
    stagingUserRowsCopied: false,
    preservedLegacyGameDeleted: false,
  };

  await runSql(databaseUrl, `
    update public.production_content_promotions
    set target_game_session_id = ${sqlLiteral(provisioned.gameSessionId)}::uuid,
        consumed_at = coalesce(consumed_at, now()),
        status = 'completed',
        result = ${jsonSql(sanitizedResult, 'promotion_result')},
        updated_at = now()
    where authorization_id = ${sqlLiteral(authorization.authorizationId)}
      and project_ref = ${sqlLiteral(authorization.projectRef)}
      and pack_sha256 = ${sqlLiteral(authorization.packSha256)};
  `, 'production promotion ledger completion');

  return sanitizedResult;
}

async function main() {
  const bindings = assertBindings();
  const identities = await resolveSystemIdentities(bindings.databaseUrl, bindings.projectRef);
  const authority = await loadAuthority(bindings, identities);
  await verifyOwner(bindings.databaseUrl, authority.authorization);
  const ledger = await recordAuthorization(bindings.databaseUrl, bindings, identities, authority);

  const existingTarget = parseJsonLine(await runSql(bindings.databaseUrl, `
    select coalesce((
      select jsonb_build_object(
        'ready', game_row.provisioning_status = 'ready' and game_row.status = 'active',
        'gameSessionId', game_row.id,
        'gameName', game_row.name
      )
      from public.production_content_promotions promotion
      join public.game_sessions game_row on game_row.id = promotion.target_game_session_id
      where promotion.authorization_id = ${sqlLiteral(authority.authorization.authorizationId)}
        and promotion.status = 'completed'
    ), '{}'::jsonb)::text;
  `, 'existing promotion read'), 'existing promotion read');

  if (ledger.alreadyConsumed && existingTarget.ready === true) {
    const verified = parseJsonLine(await runSql(bindings.databaseUrl, `
      select public.verify_provisioned_game_v1(
        ${sqlLiteral(existingTarget.gameSessionId)}::uuid,
        ${sqlLiteral(authority.authorization.ownerStaffUserId)}::uuid
      )::text;
    `, 'existing production game verification'), 'existing production game verification');
    requireCondition(verified.ready === true, 'Previously promoted production game is no longer ready');
    const report = {
      schemaVersion: 'econovaria-production-canonical-content-bootstrap-v1',
      projectRefBound: true,
      replayed: true,
      canonicalSourceReady: true,
      productionGameReady: true,
      targetGameName: existingTarget.gameName,
      counts: verified.counts,
      stagingUserRowsCopied: false,
      preservedLegacyGameDeleted: false,
      plaintextJoinCodeRecorded: false,
    };
    await writeFile(EVIDENCE_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(report));
    return;
  }

  await runSql(bindings.databaseUrl, `
    update public.production_content_promotions
    set status = 'running', updated_at = now()
    where authorization_id = ${sqlLiteral(authority.authorization.authorizationId)}
      and consumed_at is null;
  `, 'promotion running marker');

  try {
    const source = await prepareSource(bindings.databaseUrl, identities);
    if (!(await sourceIsComplete(bindings.databaseUrl, identities.sourceGameId)).complete) {
      await activateSeed(bindings.databaseUrl, identities, authority);
      await publishWorld(bindings.databaseUrl, identities);
      await activateCrafting(bindings.databaseUrl, identities, authority);
    }

    const sourceState = await sourceIsComplete(bindings.databaseUrl, identities.sourceGameId);
    requireCondition(sourceState.complete, 'Production canonical source is incomplete');

    const preflight = parseJsonLine(await runSql(bindings.databaseUrl, `
      select public.game_provisioning_preflight_v1(${sqlLiteral(PACK_ID)})::text;
    `, 'production provisioning preflight'), 'production provisioning preflight');
    requireCondition(preflight.ready === true, 'Production provisioning preflight is not ready');

    const provisioned = await provisionProductionGame(bindings.databaseUrl, authority);
    const result = await completePromotion(bindings.databaseUrl, authority, provisioned, sourceState.state);

    const report = {
      schemaVersion: 'econovaria-production-canonical-content-bootstrap-v1',
      projectRefBound: true,
      releaseCommit: bindings.releaseCommit,
      replayed: provisioned.outcome === 'replayed',
      canonicalPack: {
        id: authority.authorization.packId,
        version: authority.authorization.packVersion,
        sha256: authority.authorization.packSha256,
      },
      physicalEconomy: {
        contentDigest: authority.authorization.physicalEconomyContentDigest,
        sourceCommit: authority.authorization.physicalEconomySourceCommit,
      },
      canonicalSourceReady: true,
      productionGameReady: true,
      result,
    };
    const serialized = JSON.stringify(report);
    requireCondition(!serialized.includes(authority.authorization.ownerStaffUserId), 'Sanitized evidence contains owner Staff ID');
    requireCondition(!serialized.includes(identities.sourceGameId), 'Sanitized evidence contains source game ID');
    requireCondition(!/ECO-[A-Z0-9-]{4,}/.test(serialized), 'Sanitized evidence contains a Game Code');
    await writeFile(EVIDENCE_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(report));
  } catch (error) {
    await runSql(bindings.databaseUrl, `
      update public.production_content_promotions
      set status = 'failed',
          result = jsonb_build_object('error', ${sqlLiteral(safeError(error))}),
          updated_at = now()
      where authorization_id = ${sqlLiteral(authority.authorization.authorizationId)}
        and consumed_at is null;
    `, 'promotion failure record').catch(() => {});
    throw error;
  }
}

main().catch((error) => {
  console.error(safeError(error));
  process.exitCode = 1;
});

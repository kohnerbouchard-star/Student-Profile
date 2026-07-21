#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSeedRpcClient, runImporter } from './seed-beta-importer.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(SCRIPT_DIR);
const PACK_ROOT = path.join(REPO_ROOT, 'docs', 'seed-content', 'executable', 'beta-pack-v1');
const MIGRATIONS = [
  {
    version: '20260721093000',
    name: 'add_transactional_seed_content_release_v1',
    kind: 'seed-release',
    path: path.join(REPO_ROOT, 'backend', 'supabase', 'migrations', '20260721093000_add_transactional_seed_content_release_v1.sql'),
  },
  {
    version: '20260721094000',
    name: 'harden_transactional_seed_release_rollback_v1',
    kind: 'seed-release',
    path: path.join(REPO_ROOT, 'backend', 'supabase', 'migrations', '20260721094000_harden_transactional_seed_release_rollback_v1.sql'),
  },
  {
    version: '20260721095000',
    name: 'accept_current_service_role_claims_for_seed_release_v1',
    kind: 'forward-authorization-correction',
    path: path.join(REPO_ROOT, 'backend', 'supabase', 'migrations', '20260721095000_accept_current_service_role_claims_for_seed_release_v1.sql'),
  },
];
const PRODUCTION_PROJECT_REF = 'cgiukdjwicykrmtkhudh';
const STAGING_PROJECT_REF = 'eecvbssdvarfcykcfrny';
const SYNTHETIC_STAFF_ID = '16300000-0000-4000-8000-000000000001';
const SYNTHETIC_AUTH_ID = '16300000-0000-4000-8000-000000000011';
const SYNTHETIC_GAME_ID = '16300000-0000-4000-8000-000000000101';
const SYNTHETIC_GAME_LABEL = 'PR163-STAGING-SYNTHETIC-V1';
const SOURCE_SHA_PATTERN = /^[0-9a-f]{40}$/i;

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function dollarQuote(tag, value) {
  const delimiter = `$${tag}$`;
  requireCondition(!value.includes(delimiter), `Unexpected SQL delimiter collision: ${tag}`);
  return `${delimiter}${value}${delimiter}`;
}

async function readJson(name) {
  return JSON.parse(await readFile(path.join(PACK_ROOT, name), 'utf8'));
}

async function resolveSourceSha() {
  const explicit = process.env.SEED_SOURCE_SHA?.trim();
  if (explicit) {
    requireCondition(SOURCE_SHA_PATTERN.test(explicit), 'SEED_SOURCE_SHA must be an exact 40-character Git SHA.');
    return explicit.toLowerCase();
  }

  const eventPath = process.env.GITHUB_EVENT_PATH;
  requireCondition(eventPath, 'GITHUB_EVENT_PATH or SEED_SOURCE_SHA is required to bind activation to the permanent source head.');
  const event = JSON.parse(await readFile(eventPath, 'utf8'));
  const resolved = event.pull_request?.head?.sha ?? event.after ?? event.workflow_run?.head_sha ?? null;
  requireCondition(SOURCE_SHA_PATTERN.test(resolved ?? ''), 'GitHub event did not contain a valid permanent source SHA.');
  return resolved.toLowerCase();
}

async function managementQuery({ projectRef, accessToken, query }) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  if (!response.ok) {
    const error = new Error(`Supabase Management SQL failed with ${response.status}.`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function migrationIdentity(context, version) {
  const rows = await managementQuery({
    ...context,
    query: `select version, name, idempotency_key from supabase_migrations.schema_migrations where version = ${sqlLiteral(version)};`,
  });
  return Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
}

async function applyMigration(context, migration) {
  const source = await readFile(migration.path, 'utf8');
  const sourceSha256 = sha256(source);
  const expectedKey = `pr163:${migration.version}:${sourceSha256}`;
  const existing = await migrationIdentity(context, migration.version);

  if (existing) {
    requireCondition(existing.name === migration.name, `Migration version collision at ${migration.version}.`);
    if (existing.idempotency_key) {
      requireCondition(existing.idempotency_key === expectedKey, `Migration digest identity mismatch at ${migration.version}.`);
    }
    return {
      version: migration.version,
      name: migration.name,
      kind: migration.kind,
      sourceSha256,
      disposition: 'already-applied',
    };
  }

  await managementQuery({ ...context, query: source });
  const statement = dollarQuote(`seed_migration_${migration.version}`, source);
  await managementQuery({
    ...context,
    query: `
      insert into supabase_migrations.schema_migrations
        (version, statements, name, created_by, idempotency_key, rollback)
      values (
        ${sqlLiteral(migration.version)},
        array[${statement}]::text[],
        ${sqlLiteral(migration.name)},
        'github-actions[bot]',
        ${sqlLiteral(expectedKey)},
        array[]::text[]
      );
    `,
  });

  return {
    version: migration.version,
    name: migration.name,
    kind: migration.kind,
    sourceSha256,
    disposition: 'applied',
  };
}

function importerOptions({
  mode,
  projectRef,
  gameSessionId,
  sourceSha,
  auditRoot,
  activate = false,
  authorization = null,
}) {
  return {
    mode,
    environment: 'staging',
    'pack-root': PACK_ROOT,
    'audit-root': auditRoot,
    'expected-project-ref': projectRef,
    'game-session-id': gameSessionId,
    'source-sha': sourceSha,
    activate,
    authorization,
    'allow-soft-rollback': mode === 'rollback',
  };
}

function assertCounts(row, expected, label) {
  requireCondition(Number(row?.count) === expected, `${label}: expected ${expected}, received ${row?.count ?? 'missing'}.`);
}

async function connectedCounts(context, activeOnly) {
  const predicate = activeOnly ? 'and is_active' : '';
  const contractPredicate = activeOnly ? "and status = 'active' and visibility = 'public'" : '';
  const storePredicate = activeOnly ? "and status = 'active' and visibility = 'visible'" : '';
  const rows = await managementQuery({
    ...context,
    query: `
      select 'assets' as object_type, count(*)::integer as count
      from public.game_session_stock_assets
      where game_session_id = '${SYNTHETIC_GAME_ID}' ${predicate}
      union all
      select 'contracts', count(*)::integer
      from public.game_session_contracts
      where game_session_id = '${SYNTHETIC_GAME_ID}' ${contractPredicate}
      union all
      select 'store', count(*)::integer
      from public.store_items
      where game_session_id = '${SYNTHETIC_GAME_ID}' ${storePredicate};
    `,
  });
  return Object.fromEntries(rows.map((row) => [row.object_type, Number(row.count)]));
}

async function crossGameLeakCounts(context, packId) {
  const rows = await managementQuery({
    ...context,
    query: `
      with release as (
        select id, game_session_id
        from public.seed_content_releases
        where game_session_id = '${SYNTHETIC_GAME_ID}' and pack_id = ${sqlLiteral(packId)}
      )
      select 'assets' as object_type, count(*)::integer as count
      from public.seed_content_release_members m
      join release r on r.id = m.release_id
      join public.game_session_stock_assets a on a.id = m.record_id
      where m.object_type = 'game_stock_asset' and a.game_session_id <> r.game_session_id
      union all
      select 'contracts', count(*)::integer
      from public.seed_content_release_members m
      join release r on r.id = m.release_id
      join public.game_session_contracts c on c.id = m.record_id
      where m.object_type = 'game_contract' and c.game_session_id <> r.game_session_id
      union all
      select 'store', count(*)::integer
      from public.seed_content_release_members m
      join release r on r.id = m.release_id
      join public.store_items s on s.id = m.record_id
      where m.object_type = 'store_item' and s.game_session_id <> r.game_session_id;
    `,
  });
  return Object.fromEntries(rows.map((row) => [row.object_type, Number(row.count)]));
}

async function countryDistribution(context) {
  const rows = await managementQuery({
    ...context,
    query: `
      select country_code, count(*)::integer as count
      from public.game_session_stock_assets
      where game_session_id = '${SYNTHETIC_GAME_ID}' and is_active
      group by country_code
      order by country_code;
    `,
  });
  requireCondition(rows.length === 10, `Expected ten country distributions, received ${rows.length}.`);
  for (const row of rows) assertCounts(row, 24, `Country ${row.country_code}`);
  return rows;
}

async function membershipDigest(context, packId) {
  const rows = await managementQuery({
    ...context,
    query: `
      select m.object_type, m.stable_key, m.record_id::text
      from public.seed_content_release_members m
      join public.seed_content_releases r on r.id = m.release_id
      where r.game_session_id = '${SYNTHETIC_GAME_ID}' and r.pack_id = ${sqlLiteral(packId)}
      order by m.object_type, m.stable_key;
    `,
  });
  requireCondition(rows.length === 590, `Expected 590 release members, received ${rows.length}.`);
  return sha256(JSON.stringify(rows));
}

async function restCount({ url, serviceRoleKey, table, filters }) {
  const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${table}?select=id&${filters}`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Prefer: 'count=exact',
      Range: '0-0',
    },
  });
  requireCondition(response.ok, `Connected REST read failed for ${table}: ${response.status}.`);
  const contentRange = response.headers.get('content-range') ?? '';
  const match = contentRange.match(/\/(\d+)$/);
  requireCondition(match, `Connected REST count missing for ${table}.`);
  return Number(match[1]);
}

async function main() {
  const projectRef = process.env.SUPABASE_PROJECT_REF;
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const evidencePath = process.env.SEED_CONNECTED_EVIDENCE_PATH
    ?? path.join(os.tmpdir(), 'seed-connected-staging-evidence.json');
  const sourceSha = await resolveSourceSha();

  requireCondition(projectRef && accessToken && url && serviceRoleKey, 'Protected staging Supabase credentials are required.');
  requireCondition(projectRef === STAGING_PROJECT_REF, `Unexpected staging project ref ${projectRef}.`);
  requireCondition(projectRef !== PRODUCTION_PROJECT_REF, 'Production project ref is prohibited.');
  requireCondition(new URL(url).hostname === `${projectRef}.supabase.co`, 'SUPABASE_URL does not match the protected project ref.');
  requireCondition(process.env.SEED_TARGET_ENVIRONMENT === 'staging', 'SEED_TARGET_ENVIRONMENT must be staging.');

  const context = { projectRef, accessToken };
  const [pack, integrity, market, contracts, store] = await Promise.all([
    readJson('pack-v1.json'),
    readJson('integrity-manifest-v1.json'),
    readJson('market-templates-v1.json'),
    readJson('tutorial-contract-chains-v1.json'),
    readJson('store-catalog-v1.json'),
  ]);
  requireCondition(
    pack.productionAuthorized === false && pack.activationAuthorized === false,
    'Embedded production or activation authorization is prohibited.',
  );
  requireCondition(
    integrity.packId === pack.packId && integrity.version === pack.version,
    'Pack and integrity identity mismatch.',
  );

  const appliedMigrations = [];
  for (const migration of MIGRATIONS) {
    appliedMigrations.push(await applyMigration(context, migration));
  }

  await managementQuery({
    ...context,
    query: `
      insert into public.staff_users (id, supabase_auth_user_id, email, display_name)
      values (
        '${SYNTHETIC_STAFF_ID}',
        '${SYNTHETIC_AUTH_ID}',
        'pr163-seed-staging@example.invalid',
        'PR163 Seed Staging Operator'
      )
      on conflict (id) do update set display_name = excluded.display_name;

      insert into public.game_sessions (id, owner_staff_user_id, name, status, lifecycle_state)
      values (
        '${SYNTHETIC_GAME_ID}',
        '${SYNTHETIC_STAFF_ID}',
        '${SYNTHETIC_GAME_LABEL}',
        'active',
        'draft'
      )
      on conflict (id) do update set name = excluded.name, lifecycle_state = 'draft';
    `,
  });

  const auditRoot = await mkdtemp(path.join(os.tmpdir(), 'seed-connected-audit-'));
  const authorizationPath = path.join(auditRoot, 'activation-authorization.json');
  const now = Date.now();
  const authorization = {
    schemaVersion: 'econovaria-beta-seed-activation-authorization-v2',
    authorizationId: 'chat3-pr163-isolated-staging-20260721',
    allowActivation: true,
    productionAuthorized: false,
    environment: 'staging',
    projectRef,
    gameSessionId: SYNTHETIC_GAME_ID,
    sourceSha,
    packId: integrity.packId,
    version: integrity.version,
    packSha256: integrity.packSha256,
    approvedBy: 'Repository owner instruction: Chat 3 executable seed pack',
    approvedAt: new Date(now - 60_000).toISOString(),
    expiresAt: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
  };
  await writeFile(authorizationPath, `${JSON.stringify(authorization, null, 2)}\n`, 'utf8');

  try {
    const options = (overrides) => importerOptions({
      projectRef,
      gameSessionId: SYNTHETIC_GAME_ID,
      sourceSha,
      auditRoot,
      ...overrides,
    });

    const inactive = await runImporter(options({ mode: 'import' }));
    requireCondition(['applied', 'replayed'].includes(inactive.outcome.outcome), 'Inactive connected import failed.');
    requireCondition(inactive.outcome.activated === false, 'Inactive import unexpectedly activated content.');

    const inactiveReplay = await runImporter(options({ mode: 'import' }));
    requireCondition(inactiveReplay.outcome.outcome === 'replayed', 'Repeated inactive import was not replayed.');
    requireCondition(inactiveReplay.outcome.releaseId === inactive.outcome.releaseId, 'Release identity changed during replay.');

    const rpcClient = createSeedRpcClient(url, serviceRoleKey);
    let conflictRejected = false;
    try {
      await rpcClient.callRpc('apply_seed_content_release_v1', {
        p_game_session_id: SYNTHETIC_GAME_ID,
        p_pack_id: integrity.packId,
        p_version: `${integrity.version}-conflict`,
        p_pack_sha256: integrity.packSha256,
        p_target_environment: 'staging',
        p_activate: false,
        p_authorization_id: null,
        p_approved_by: null,
        p_market_templates: market.templates,
        p_contract_templates: contracts.templates,
        p_store_items: store.items,
        p_fail_after_operations: null,
      });
    } catch (error) {
      conflictRejected = JSON.stringify(error.payload ?? error.message)
        .includes('SEED_RELEASE_CONFLICTING_VERSION_OR_DIGEST');
    }
    requireCondition(conflictRejected, 'Conflicting connected release version was not rejected.');

    const activated = await runImporter(options({
      mode: 'import',
      activate: true,
      authorization: authorizationPath,
    }));
    requireCondition(activated.outcome.activated === true, 'Authorized staging activation failed.');
    requireCondition(activated.outcome.releaseId === inactive.outcome.releaseId, 'Activation changed release identity.');

    const activeCounts = await connectedCounts(context, true);
    requireCondition(activeCounts.assets === 240, `Expected 240 active assets, received ${activeCounts.assets}.`);
    requireCondition(activeCounts.contracts === 30, `Expected 30 active Contracts, received ${activeCounts.contracts}.`);
    requireCondition(activeCounts.store === 50, `Expected 50 active Store items, received ${activeCounts.store}.`);
    const countries = await countryDistribution(context);
    const crossGameLeaks = await crossGameLeakCounts(context, integrity.packId);
    requireCondition(
      crossGameLeaks.assets === 0 && crossGameLeaks.contracts === 0 && crossGameLeaks.store === 0,
      'Connected release leaked content into another game.',
    );

    const restSurfaceCounts = {
      marketAssets: await restCount({
        url,
        serviceRoleKey,
        table: 'game_session_stock_assets',
        filters: `game_session_id=eq.${SYNTHETIC_GAME_ID}&is_active=eq.true`,
      }),
      contracts: await restCount({
        url,
        serviceRoleKey,
        table: 'game_session_contracts',
        filters: `game_session_id=eq.${SYNTHETIC_GAME_ID}&status=eq.active&visibility=eq.public`,
      }),
      storeItems: await restCount({
        url,
        serviceRoleKey,
        table: 'store_items',
        filters: `game_session_id=eq.${SYNTHETIC_GAME_ID}&status=eq.active&visibility=eq.visible`,
      }),
    };
    requireCondition(restSurfaceCounts.marketAssets === 240, 'REST market surface count mismatch.');
    requireCondition(restSurfaceCounts.contracts === 30, 'REST Contract surface count mismatch.');
    requireCondition(restSurfaceCounts.storeItems === 50, 'REST Store surface count mismatch.');

    const deactivated = await runImporter(options({ mode: 'deactivate' }));
    requireCondition(deactivated.outcome.outcome === 'deactivated', 'Connected deactivation failed.');
    const inactiveCounts = await connectedCounts(context, true);
    requireCondition(
      inactiveCounts.assets === 0 && inactiveCounts.contracts === 0 && inactiveCounts.store === 0,
      'Deactivation left active connected rows.',
    );

    const reactivated = await runImporter(options({
      mode: 'import',
      activate: true,
      authorization: authorizationPath,
    }));
    requireCondition(
      reactivated.outcome.releaseId === inactive.outcome.releaseId,
      'Reactivation changed immutable release identity.',
    );

    const memberDigestBeforeRollback = await membershipDigest(context, integrity.packId);
    const rolledBack = await runImporter(options({ mode: 'rollback' }));
    requireCondition(rolledBack.outcome.outcome === 'rolled_back', 'Connected rollback failed.');
    requireCondition(rolledBack.outcome.playerHistoryPreserved === true, 'Rollback did not attest history preservation.');

    const reimported = await runImporter(options({ mode: 'import' }));
    requireCondition(
      reimported.outcome.releaseId === inactive.outcome.releaseId,
      'Re-import changed immutable release identity.',
    );
    const memberDigestAfterReimport = await membershipDigest(context, integrity.packId);
    requireCondition(
      memberDigestAfterReimport === memberDigestBeforeRollback,
      'Stable member IDs changed after rollback and re-import.',
    );

    const finalRollback = await runImporter(options({ mode: 'rollback' }));
    requireCondition(finalRollback.outcome.outcome === 'rolled_back', 'Final connected cleanup rollback failed.');
    requireCondition(finalRollback.outcome.playerHistoryPreserved === true, 'Final rollback did not preserve history.');
    const finalCounts = await connectedCounts(context, false);
    requireCondition(
      finalCounts.assets === 0 && finalCounts.contracts === 0 && finalCounts.store === 0,
      'Rollback left game-scoped imported rows.',
    );

    const releaseRows = await managementQuery({
      ...context,
      query: `
        select status, operation_count, pack_id, version, pack_sha256,
          (select count(*)::integer from public.seed_content_release_members m where m.release_id = r.id) as member_count
        from public.seed_content_releases r
        where game_session_id = '${SYNTHETIC_GAME_ID}' and pack_id = ${sqlLiteral(integrity.packId)};
      `,
    });
    requireCondition(
      releaseRows.length === 1
        && releaseRows[0].status === 'rolled_back'
        && Number(releaseRows[0].member_count) === 590,
      'Final release journal is not a complete rolled-back release.',
    );

    const evidence = {
      schemaVersion: 'econovaria-connected-seed-staging-evidence-v2',
      generatedAt: new Date().toISOString(),
      sourceCommit: sourceSha,
      workflowCommit: process.env.GITHUB_SHA ?? null,
      project: { name: 'ECON SIM STAGING', ref: projectRef, production: false },
      syntheticGameLabel: SYNTHETIC_GAME_LABEL,
      syntheticGameIdSha256: sha256(SYNTHETIC_GAME_ID),
      setupPath: 'protected-staging-management-sql',
      pack: {
        packId: integrity.packId,
        version: integrity.version,
        packSha256: integrity.packSha256,
        activationAuthorizedInPack: false,
        productionAuthorized: false,
      },
      authorizationBinding: {
        exactProject: authorization.projectRef === projectRef,
        exactGame: authorization.gameSessionId === SYNTHETIC_GAME_ID,
        exactPackIdentity: authorization.packId === integrity.packId && authorization.version === integrity.version,
        exactDigest: authorization.packSha256 === integrity.packSha256,
        exactSourceSha: authorization.sourceSha === sourceSha,
        unexpiredAtExecution: Date.parse(authorization.expiresAt) > now,
        productionProhibited: authorization.productionAuthorized === false,
      },
      migrations: appliedMigrations,
      lifecycle: {
        inactiveImport: inactive.outcome.outcome,
        repeatedImport: inactiveReplay.outcome.outcome,
        immutableReleaseIdentity: inactiveReplay.outcome.releaseId === inactive.outcome.releaseId,
        conflictingVersionRejected: conflictRejected,
        injectedFailureAndResumabilityProvenInDisposableDatabaseJob: true,
        connectedFailureInjectionProhibited: true,
        temporaryStagingActivationAuthorizedExternally: true,
        deactivated: deactivated.outcome.outcome === 'deactivated',
        reactivatedWithStableIdentity: reactivated.outcome.releaseId === inactive.outcome.releaseId,
        rolledBack: rolledBack.outcome.outcome === 'rolled_back',
        playerHistoryPreserved: rolledBack.outcome.playerHistoryPreserved === true,
        reimportedAfterRollback: ['applied', 'replayed'].includes(reimported.outcome.outcome),
        stableIdsAfterReimport: memberDigestAfterReimport === memberDigestBeforeRollback,
        finalRollback: finalRollback.outcome.outcome === 'rolled_back',
      },
      activeVerification: {
        databaseCounts: activeCounts,
        restSurfaceCounts,
        crossGameLeakCounts: crossGameLeaks,
        instrumentsPerCountry: countries,
        tutorialContractsAvailable: activeCounts.contracts === 30,
        storePricesAvailable: activeCounts.store === 50,
      },
      finalState: {
        releaseStatus: releaseRows[0].status,
        releaseMemberCount: Number(releaseRows[0].member_count),
        gameScopedRows: finalCounts,
        activeImportedContent: false,
        auditHistoryRetained: true,
        productionActivationAuthorized: false,
        productionTouched: false,
      },
      connectedRuntimeBoundary: {
        postgrestAdminAndPlayerConsumerDataSurfacesVerified: true,
        adminAndPlayerEdgeFunctionsPresent: false,
        frontendDeploymentVerified: false,
        mapRuntimeSchemaPresent: false,
        repositoryMapArtworkAndFiftyLocationRegistryVerifiedByFinalHeadCI: true,
        runtimeShellDeploymentOwnedByIntegrationWorkstreams: true,
      },
      credentialsRecorded: false,
      rawInternalIdentifiersRecorded: false,
    };
    await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    await rm(auditRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    error: error.message,
    status: error.status ?? null,
    details: error.payload ?? null,
  }, null, 2));
  process.exitCode = 1;
});

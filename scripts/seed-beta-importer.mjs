#!/usr/bin/env node

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { parseCli, readJson, writeJson } from './seed-beta-pack-lib.mjs';
import { validateSeedBetaPack } from './seed-beta-pack-validator.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(SCRIPT_DIR);
const DEFAULT_PACK_ROOT = path.join(REPO_ROOT, 'docs', 'seed-content', 'executable', 'beta-pack-v1');
const DEFAULT_AUDIT_ROOT = path.join(REPO_ROOT, '.seed-audit');
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WRITE_MODES = new Set(['import', 'deactivate', 'rollback']);
const ALLOWED_ENVIRONMENTS = new Set(['local', 'test', 'staging']);
const KNOWN_LIVE_PROJECT_REFS = new Set(['cgiukdjwicykrmtkhudh']);

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function isoNow() {
  return new Date().toISOString();
}

function projectRefFromUrl(url) {
  const hostname = new URL(url).hostname;
  const match = hostname.match(/^([a-z0-9]+)\.supabase\.co$/i);
  return match?.[1] ?? null;
}

async function loadPack(packRoot) {
  const files = [
    'pack-v1.json',
    'market-templates-v1.json',
    'tutorial-contract-chains-v1.json',
    'store-catalog-v1.json',
    'integrity-manifest-v1.json',
  ];
  const [pack, market, contracts, store, integrity] = await Promise.all(
    files.map((name) => readJson(path.join(packRoot, name))),
  );
  return { pack, market, contracts, store, integrity };
}

function buildPlan({ pack, market, contracts, store }, options) {
  const operations = {
    stockTemplates: market.templates.length,
    gameStockAssets: market.templates.length,
    contractTemplates: contracts.templates.length,
    gameSessionContracts: contracts.templates.length,
    storeItems: store.items.length,
  };
  return {
    packId: pack.packId,
    version: pack.version,
    packSha256: options.packSha256,
    environment: options.environment,
    mode: options.mode,
    activate: Boolean(options.activate),
    targetProjectRef: options.expectedProjectRef ?? null,
    targetGameSessionSupplied: Boolean(options.gameSessionId),
    operations,
    totalOperations: Object.values(operations).reduce((sum, count) => sum + count, 0),
    safety: {
      productionProhibited: true,
      fullMarketUniverseExcluded: true,
      boundedActiveInstrumentsPerCountry: 24,
      stableIds: true,
      deterministicReleaseIdentity: true,
      transactionBacked: true,
      databaseReleaseJournal: true,
      exactVersionDigestConflictRejection: true,
      idempotentReplay: true,
      resumableAfterLostResponse: true,
      gameScopedMembership: true,
      playerHistoryPreservingRollback: true,
      activationAuthorizationRequired: Boolean(options.activate),
    },
  };
}

async function validateAuthorization({ authorizationPath, environment, projectRef, integrity }) {
  requireCondition(authorizationPath, '--authorization is required with --activate.');
  const authorization = await readJson(path.resolve(authorizationPath));
  requireCondition(authorization.allowActivation === true, 'Authorization does not permit activation.');
  requireCondition(authorization.productionAuthorized === false, 'Authorization must explicitly prohibit production.');
  requireCondition(authorization.environment === environment, 'Authorization environment does not match the requested environment.');
  requireCondition(authorization.projectRef === projectRef, 'Authorization projectRef does not match the target project.');
  requireCondition(authorization.packId === integrity.packId && authorization.version === integrity.version, 'Authorization pack identity does not match.');
  requireCondition(authorization.packSha256 === integrity.packSha256, 'Authorization pack checksum does not match the integrity manifest.');
  requireCondition(typeof authorization.approvedBy === 'string' && authorization.approvedBy.trim(), 'Authorization requires approvedBy.');
  requireCondition(typeof authorization.authorizationId === 'string' && authorization.authorizationId.trim(), 'Authorization requires authorizationId.');
  const approvedAt = Date.parse(authorization.approvedAt);
  const expiresAt = Date.parse(authorization.expiresAt);
  requireCondition(
    Number.isFinite(approvedAt)
      && Number.isFinite(expiresAt)
      && expiresAt > Date.now()
      && expiresAt > approvedAt,
    'Authorization timestamps are invalid or expired.',
  );
  return {
    approvedBy: authorization.approvedBy.trim(),
    approvedAt: authorization.approvedAt,
    expiresAt: authorization.expiresAt,
    authorizationId: authorization.authorizationId.trim(),
  };
}

export function createSeedRpcClient(url, key, fetchImpl = fetch) {
  const base = url.replace(/\/$/, '');
  return {
    async callRpc(name, body) {
      const response = await fetchImpl(`${base}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
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
        const error = new Error(`Supabase RPC ${name} failed with ${response.status}.`);
        error.status = response.status;
        error.payload = payload;
        throw error;
      }
      return payload;
    },
  };
}

function assertWriteTarget(options, rawOptions) {
  requireCondition(
    process.env.SEED_TARGET_ENVIRONMENT === options.environment || rawOptions.__testBypassEnvironment === true,
    'SEED_TARGET_ENVIRONMENT must exactly match --environment for write modes.',
  );

  let projectRef;
  let client = rawOptions.__client ?? null;
  if (client) {
    projectRef = rawOptions.__projectRef ?? options.expectedProjectRef;
  } else {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    requireCondition(url && key, 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for write modes.');
    projectRef = projectRefFromUrl(url);
    requireCondition(projectRef, 'SUPABASE_URL must use a standard project-ref.supabase.co host.');
    client = createSeedRpcClient(url, key);
  }

  requireCondition(
    options.expectedProjectRef && options.expectedProjectRef === projectRef,
    '--expected-project-ref must exactly match SUPABASE_URL.',
  );
  requireCondition(
    !KNOWN_LIVE_PROJECT_REFS.has(projectRef)
      && projectRef !== process.env.SEED_PRODUCTION_PROJECT_REF,
    `Refusing known production/live project ${projectRef}.`,
  );
  requireCondition(
    options.gameSessionId && UUID_PATTERN.test(options.gameSessionId),
    '--game-session-id must be a valid UUID for write modes.',
  );
  requireCondition(
    options.failAfterOperations === null || options.environment !== 'staging',
    'Failure injection is prohibited against connected staging.',
  );
  return { client, projectRef };
}

function applyPayload(data, options, authorization) {
  return {
    p_game_session_id: options.gameSessionId,
    p_pack_id: data.pack.packId,
    p_version: data.pack.version,
    p_pack_sha256: data.integrity.packSha256,
    p_target_environment: options.environment,
    p_activate: Boolean(options.activate),
    p_authorization_id: authorization?.authorizationId ?? null,
    p_approved_by: authorization?.approvedBy ?? null,
    p_market_templates: data.market.templates,
    p_contract_templates: data.contracts.templates,
    p_store_items: data.store.items,
    p_fail_after_operations: options.failAfterOperations,
  };
}

function releaseIdentityPayload(data, options) {
  return {
    p_game_session_id: options.gameSessionId,
    p_pack_id: data.pack.packId,
    p_version: data.pack.version,
    p_pack_sha256: data.integrity.packSha256,
  };
}

function requireSuccessfulOutcome(outcome) {
  requireCondition(outcome && typeof outcome === 'object', 'Seed release RPC returned an invalid response.');
  if (outcome.outcome === 'failed') {
    const error = new Error(`Seed release transaction failed: ${outcome.failureMessage ?? outcome.failureCode ?? 'unknown failure'}`);
    error.payload = outcome;
    throw error;
  }
  return outcome;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/seed-beta-importer.mjs --mode <validate|dry-run|import|deactivate|rollback|inspect> --environment <local|test|staging> [options]',
    '',
    'Write options:',
    '  --expected-project-ref <ref> --game-session-id <uuid>',
    '  --activate --authorization <external-json>',
    '  --allow-soft-rollback',
    '',
    'Write modes require SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SEED_TARGET_ENVIRONMENT matching --environment.',
    'Production is never accepted. Connected staging failure injection is prohibited.',
  ].join('\n');
}

export async function runImporter(rawOptions) {
  const failAfterRaw = rawOptions['fail-after-operations'];
  const options = {
    mode: rawOptions.mode,
    environment: rawOptions.environment,
    packRoot: path.resolve(rawOptions['pack-root'] ?? DEFAULT_PACK_ROOT),
    auditRoot: path.resolve(rawOptions['audit-root'] ?? DEFAULT_AUDIT_ROOT),
    expectedProjectRef: rawOptions['expected-project-ref'] ?? null,
    gameSessionId: rawOptions['game-session-id'] ?? null,
    activate: Boolean(rawOptions.activate),
    authorization: rawOptions.authorization ?? null,
    allowSoftRollback: Boolean(rawOptions['allow-soft-rollback']),
    failAfterOperations: failAfterRaw === undefined ? null : Number(failAfterRaw),
    packSha256: null,
  };

  requireCondition(
    ['validate', 'dry-run', 'import', 'deactivate', 'rollback', 'inspect'].includes(options.mode),
    '--mode must be validate, dry-run, import, deactivate, rollback, or inspect.',
  );
  requireCondition(
    ALLOWED_ENVIRONMENTS.has(options.environment),
    '--environment must be local, test, or staging. Production is prohibited.',
  );
  if (options.failAfterOperations !== null) {
    requireCondition(Number.isInteger(options.failAfterOperations) && options.failAfterOperations >= 1, '--fail-after-operations must be a positive integer.');
  }

  const validation = await validateSeedBetaPack({ packRoot: options.packRoot });
  requireCondition(validation.valid, `Pack validation failed with ${validation.summary.errors} errors.`);
  const data = await loadPack(options.packRoot);
  options.packSha256 = data.integrity.packSha256;
  const plan = buildPlan(data, options);

  if (options.mode === 'validate') return { result: 'VALID', validation, plan };
  if (options.mode === 'dry-run') return { result: 'DRY_RUN_COMPLETE', validation, plan };

  const { client, projectRef } = assertWriteTarget(options, rawOptions);
  let authorization = null;
  if (options.activate) {
    authorization = await validateAuthorization({
      authorizationPath: options.authorization,
      environment: options.environment,
      projectRef,
      integrity: data.integrity,
    });
  }

  await mkdir(options.auditRoot, { recursive: true });
  const runId = randomUUID();
  const auditPath = path.join(options.auditRoot, `seed-${options.mode}-${runId}.json`);

  let outcome;
  if (options.mode === 'import') {
    outcome = requireSuccessfulOutcome(
      await client.callRpc('apply_seed_content_release_v1', applyPayload(data, options, authorization)),
    );
  } else if (options.mode === 'deactivate') {
    outcome = requireSuccessfulOutcome(
      await client.callRpc('deactivate_seed_content_release_v1', releaseIdentityPayload(data, options)),
    );
  } else if (options.mode === 'rollback') {
    outcome = requireSuccessfulOutcome(
      await client.callRpc('rollback_seed_content_release_v1', {
        ...releaseIdentityPayload(data, options),
        p_allow_soft_rollback: options.allowSoftRollback,
      }),
    );
  } else {
    outcome = await client.callRpc('inspect_seed_content_release_v1', {
      p_game_session_id: options.gameSessionId,
      p_pack_id: data.pack.packId,
    });
  }

  const audit = {
    schemaVersion: 'econovaria-beta-seed-import-audit-v2',
    runId,
    recordedAt: isoNow(),
    packId: data.pack.packId,
    version: data.pack.version,
    packSha256: data.integrity.packSha256,
    environment: options.environment,
    projectRef,
    gameSessionId: options.gameSessionId,
    mode: options.mode,
    activated: Boolean(options.activate),
    authorization,
    plan,
    outcome,
    releaseJournal: 'public.seed_content_releases',
    credentialsRecorded: false,
    productionTouched: false,
    success: true,
  };
  await writeJson(auditPath, audit);
  return { result: 'WRITE_COMPLETE', auditPath, outcome };
}

async function main() {
  const parsed = parseCli(process.argv.slice(2));
  if (parsed.help) {
    console.log(usage());
    return;
  }
  const result = await runImporter(parsed);
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(JSON.stringify({
      error: error.message,
      status: error.status ?? null,
      details: error.payload ?? null,
    }, null, 2));
    process.exitCode = 1;
  });
}

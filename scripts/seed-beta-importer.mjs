#!/usr/bin/env node

import { mkdir, readFile } from 'node:fs/promises';
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

function requireCondition(condition, message) { if (!condition) throw new Error(message); }
function isoNow() { return new Date().toISOString(); }
function restValue(value) { return encodeURIComponent(String(value)); }

function projectRefFromUrl(url) {
  const hostname = new URL(url).hostname;
  const match = hostname.match(/^([a-z0-9]+)\.supabase\.co$/i);
  return match?.[1] ?? null;
}

async function loadPack(packRoot) {
  const files = ['pack-v1.json', 'market-templates-v1.json', 'tutorial-contract-chains-v1.json', 'store-catalog-v1.json', 'integrity-manifest-v1.json'];
  const [pack, market, contracts, store, integrity] = await Promise.all(files.map((name) => readJson(path.join(packRoot, name))));
  return { pack, market, contracts, store, integrity };
}

function buildPlan({ pack, market, contracts, store }, options) {
  return {
    packId: pack.packId,
    version: pack.version,
    environment: options.environment,
    mode: options.mode,
    activate: Boolean(options.activate),
    targetProjectRef: options.expectedProjectRef ?? null,
    targetGameSessionSupplied: Boolean(options.gameSessionId),
    operations: {
      stockTemplates: market.templates.length,
      contractTemplates: contracts.templates.length,
      storeItems: store.items.length,
      gameSessionContracts: contracts.templates.length,
    },
    safety: {
      productionProhibited: true,
      fullMarketUniverseExcluded: true,
      stableIdCollisionChecks: true,
      idempotentNaturalKeyReplay: true,
      rollbackBundleRequiredBeforeWrite: true,
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
  const approvedAt = Date.parse(authorization.approvedAt);
  const expiresAt = Date.parse(authorization.expiresAt);
  requireCondition(Number.isFinite(approvedAt) && Number.isFinite(expiresAt) && expiresAt > Date.now() && expiresAt > approvedAt, 'Authorization timestamps are invalid or expired.');
  return { approvedBy: authorization.approvedBy, approvedAt: authorization.approvedAt, expiresAt: authorization.expiresAt, authorizationId: authorization.authorizationId ?? null };
}

function createClient(url, key) {
  const base = url.replace(/\/$/, '');
  async function request(method, table, { query = '', body = null, prefer = null } = {}) {
    const response = await fetch(`${base}/rest/v1/${table}${query ? `?${query}` : ''}`, {
      method,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...(prefer ? { Prefer: prefer } : {}),
      },
      body: body === null ? null : JSON.stringify(body),
    });
    const text = await response.text();
    let payload = null;
    if (text) {
      try { payload = JSON.parse(text); } catch { payload = text; }
    }
    if (!response.ok) {
      const error = new Error(`Supabase REST ${method} ${table} failed with ${response.status}.`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }
  return { request };
}

async function selectOne(client, table, filters) {
  const query = [`select=*`, ...Object.entries(filters).map(([key, value]) => `${key}=eq.${restValue(value)}`), 'limit=2'].join('&');
  const rows = await client.request('GET', table, { query });
  requireCondition(Array.isArray(rows), `Unexpected ${table} select response.`);
  requireCondition(rows.length <= 1, `${table} natural-key lookup returned multiple rows.`);
  return rows[0] ?? null;
}

async function writeByNaturalKey(client, table, filters, row, rollback) {
  const existing = await selectOne(client, table, filters);
  if (existing) {
    rollback.restores.push({ table, id: existing.id, row: existing });
    const query = Object.entries(filters).map(([key, value]) => `${key}=eq.${restValue(value)}`).join('&');
    const result = await client.request('PATCH', table, { query, body: row, prefer: 'return=representation' });
    return { action: 'updated', id: result?.[0]?.id ?? existing.id };
  }
  const result = await client.request('POST', table, { body: row, prefer: 'return=representation' });
  const inserted = result?.[0];
  requireCondition(inserted?.id, `${table} insert did not return an id.`);
  rollback.deletes.push({ table, id: inserted.id });
  return { action: 'inserted', id: inserted.id };
}

function stockRow(entry, activate) {
  return {
    ticker: entry.ticker,
    company_name: entry.companyName,
    sector_key: entry.sectorKey,
    country_code: entry.countryCode,
    description: `${entry.instrumentType} on ${entry.exchangeCode}; stable seed ${entry.stableId}.`,
    base_price: entry.basePrice,
    beta: entry.beta,
    liquidity: entry.liquidity,
    long_run_volatility: entry.longRunVolatility,
    shares_outstanding: entry.sharesOutstanding,
    fundamentals: entry.fundamentals,
    country_exposure: entry.countryExposure,
    sector_exposure: entry.sectorExposure,
    commodity_exposure: entry.commodityExposure,
    is_active: activate,
  };
}

function contractTemplateRow(entry, activate) {
  return {
    template_key: entry.templateKey,
    title: entry.title,
    description: entry.description,
    instructions: entry.instructions,
    category: entry.category,
    difficulty: entry.difficulty,
    estimated_duration_minutes: entry.estimatedDurationMinutes,
    requirements_payload: entry.requirementsPayload,
    reward_payload: entry.rewardPayload,
    metadata: entry.metadata,
    is_active: activate,
  };
}

function storeRow(entry, gameSessionId, activate) {
  return {
    game_session_id: gameSessionId,
    item_key: entry.itemKey,
    name: entry.name,
    description: entry.description,
    category: entry.category,
    price: entry.price,
    currency_code: entry.currencyCode,
    stock_quantity: entry.stockQuantity,
    status: activate ? 'active' : 'disabled',
    visibility: activate ? 'visible' : 'hidden',
    sort_order: entry.sortOrder,
  };
}

function gameContractRow(entry, gameSessionId, activate) {
  return {
    game_session_id: gameSessionId,
    contract_key: entry.templateKey,
    source_type: 'system',
    title: entry.title,
    description: entry.description,
    instructions: entry.instructions,
    category: entry.category,
    status: activate ? 'active' : 'draft',
    visibility: activate ? 'public' : 'hidden',
    targeting_payload: { country: entry.country, tutorialChain: true },
    requirements_payload: entry.requirementsPayload,
    reward_payload: entry.rewardPayload,
    completion_mode: 'manual_review',
    published_at: activate ? isoNow() : null,
    metadata: entry.metadata,
  };
}

async function importPack(client, data, options, rollback) {
  const counts = { inserted: 0, updated: 0 };
  const record = (result) => { counts[result.action] += 1; };
  for (const entry of data.market.templates) record(await writeByNaturalKey(client, 'stock_templates', { ticker: entry.ticker }, stockRow(entry, options.activate), rollback));
  for (const entry of data.contracts.templates) record(await writeByNaturalKey(client, 'contract_templates', { template_key: entry.templateKey }, contractTemplateRow(entry, options.activate), rollback));
  for (const entry of data.store.items) record(await writeByNaturalKey(client, 'store_items', { game_session_id: options.gameSessionId, item_key: entry.itemKey }, storeRow(entry, options.gameSessionId, options.activate), rollback));
  for (const entry of data.contracts.templates) record(await writeByNaturalKey(client, 'game_session_contracts', { game_session_id: options.gameSessionId, contract_key: entry.templateKey }, gameContractRow(entry, options.gameSessionId, options.activate), rollback));
  return counts;
}

async function patchExisting(client, table, filters, body) {
  const existing = await selectOne(client, table, filters);
  if (!existing) return 'missing';
  const query = Object.entries(filters).map(([key, value]) => `${key}=eq.${restValue(value)}`).join('&');
  await client.request('PATCH', table, { query, body, prefer: 'return=minimal' });
  return 'deactivated';
}

async function deactivatePack(client, data, options) {
  const counts = { deactivated: 0, missing: 0 };
  const count = (result) => { counts[result] += 1; };
  for (const entry of data.market.templates) count(await patchExisting(client, 'stock_templates', { ticker: entry.ticker }, { is_active: false }));
  for (const entry of data.contracts.templates) count(await patchExisting(client, 'contract_templates', { template_key: entry.templateKey }, { is_active: false }));
  for (const entry of data.store.items) count(await patchExisting(client, 'store_items', { game_session_id: options.gameSessionId, item_key: entry.itemKey }, { status: 'disabled', visibility: 'hidden' }));
  for (const entry of data.contracts.templates) count(await patchExisting(client, 'game_session_contracts', { game_session_id: options.gameSessionId, contract_key: entry.templateKey }, { status: 'paused', visibility: 'hidden' }));
  return counts;
}

async function rollbackPack(client, rollbackPath, allowSoftRollback) {
  const bundle = await readJson(path.resolve(rollbackPath));
  requireCondition(bundle.schemaVersion === 'econovaria-beta-seed-rollback-v1', 'Unknown rollback bundle schema.');
  const counts = { restored: 0, deleted: 0, softDeactivated: 0 };
  const restoreOrder = [...bundle.restores].reverse();
  for (const entry of restoreOrder) {
    await client.request('PATCH', entry.table, { query: `id=eq.${restValue(entry.id)}`, body: entry.row, prefer: 'return=minimal' });
    counts.restored += 1;
  }
  for (const entry of [...bundle.deletes].reverse()) {
    try {
      await client.request('DELETE', entry.table, { query: `id=eq.${restValue(entry.id)}`, prefer: 'return=minimal' });
      counts.deleted += 1;
    } catch (error) {
      if (!allowSoftRollback) throw error;
      const body = entry.table === 'store_items' ? { status: 'disabled', visibility: 'hidden' }
        : entry.table === 'game_session_contracts' ? { status: 'paused', visibility: 'hidden' }
          : { is_active: false };
      await client.request('PATCH', entry.table, { query: `id=eq.${restValue(entry.id)}`, body, prefer: 'return=minimal' });
      counts.softDeactivated += 1;
    }
  }
  return counts;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/seed-beta-importer.mjs --mode <validate|dry-run|import|deactivate|rollback> --environment <local|test|staging> [options]',
    '',
    'Write options:',
    '  --expected-project-ref <ref> --game-session-id <uuid>',
    '  --activate --authorization <external-json>',
    '  --rollback-file <path> [--allow-soft-rollback]',
    '',
    'Write modes require SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SEED_TARGET_ENVIRONMENT matching --environment.',
    'Production is never accepted.',
  ].join('\n');
}

export async function runImporter(rawOptions) {
  const options = {
    mode: rawOptions.mode,
    environment: rawOptions.environment,
    packRoot: path.resolve(rawOptions['pack-root'] ?? DEFAULT_PACK_ROOT),
    auditRoot: path.resolve(rawOptions['audit-root'] ?? DEFAULT_AUDIT_ROOT),
    expectedProjectRef: rawOptions['expected-project-ref'] ?? null,
    gameSessionId: rawOptions['game-session-id'] ?? null,
    activate: Boolean(rawOptions.activate),
    authorization: rawOptions.authorization ?? null,
    rollbackFile: rawOptions['rollback-file'] ?? null,
    allowSoftRollback: Boolean(rawOptions['allow-soft-rollback']),
  };
  requireCondition(['validate', 'dry-run', 'import', 'deactivate', 'rollback'].includes(options.mode), '--mode must be validate, dry-run, import, deactivate, or rollback.');
  requireCondition(ALLOWED_ENVIRONMENTS.has(options.environment), '--environment must be local, test, or staging. Production is prohibited.');
  const validation = await validateSeedBetaPack({ packRoot: options.packRoot });
  requireCondition(validation.valid, `Pack validation failed with ${validation.summary.errors} errors.`);
  const data = await loadPack(options.packRoot);
  const plan = buildPlan(data, options);
  if (options.mode === 'validate') return { result: 'VALID', validation, plan };
  if (options.mode === 'dry-run') return { result: 'DRY_RUN_COMPLETE', validation, plan };

  requireCondition(process.env.SEED_TARGET_ENVIRONMENT === options.environment, 'SEED_TARGET_ENVIRONMENT must exactly match --environment for write modes.');
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  requireCondition(url && key, 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for write modes.');
  const projectRef = projectRefFromUrl(url);
  requireCondition(projectRef, 'SUPABASE_URL must use a standard project-ref.supabase.co host.');
  requireCondition(options.expectedProjectRef && options.expectedProjectRef === projectRef, '--expected-project-ref must exactly match SUPABASE_URL.');
  requireCondition(!KNOWN_LIVE_PROJECT_REFS.has(projectRef) && projectRef !== process.env.SEED_PRODUCTION_PROJECT_REF, `Refusing known production/live project ${projectRef}.`);
  if (options.mode !== 'rollback') requireCondition(options.gameSessionId && UUID_PATTERN.test(options.gameSessionId), '--game-session-id must be a valid UUID for import/deactivation.');
  let authorization = null;
  if (options.activate) authorization = await validateAuthorization({ authorizationPath: options.authorization, environment: options.environment, projectRef, integrity: data.integrity });

  await mkdir(options.auditRoot, { recursive: true });
  const runId = randomUUID();
  const auditPath = path.join(options.auditRoot, `seed-${options.mode}-${runId}.json`);
  const rollbackPath = path.join(options.auditRoot, `seed-rollback-${runId}.json`);
  const rollback = {
    schemaVersion: 'econovaria-beta-seed-rollback-v1', runId, packId: data.pack.packId, version: data.pack.version,
    packSha256: data.integrity.packSha256, environment: options.environment, projectRef,
    createdAt: isoNow(), restores: [], deletes: [],
  };
  const client = createClient(url, key);
  let outcome;
  if (options.mode === 'import') {
    await writeJson(rollbackPath, rollback);
    outcome = await importPack(client, data, options, rollback);
    await writeJson(rollbackPath, rollback);
  } else if (options.mode === 'deactivate') {
    outcome = await deactivatePack(client, data, options);
  } else {
    requireCondition(options.rollbackFile, '--rollback-file is required for rollback mode.');
    outcome = await rollbackPack(client, options.rollbackFile, options.allowSoftRollback);
  }
  const audit = {
    schemaVersion: 'econovaria-beta-seed-import-audit-v1', runId, recordedAt: isoNow(),
    packId: data.pack.packId, version: data.pack.version, packSha256: data.integrity.packSha256,
    environment: options.environment, projectRef, mode: options.mode, activated: Boolean(options.activate),
    authorization, plan, outcome, rollbackBundle: options.mode === 'import' ? rollbackPath : options.rollbackFile,
    credentialsRecorded: false, productionTouched: false, success: true,
  };
  await writeJson(auditPath, audit);
  return { result: 'WRITE_COMPLETE', auditPath, rollbackPath: options.mode === 'import' ? rollbackPath : null, outcome };
}

async function main() {
  const parsed = parseCli(process.argv.slice(2));
  if (parsed.help) { console.log(usage()); return; }
  const result = await runImporter(parsed);
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(JSON.stringify({ error: error.message, status: error.status ?? null, details: error.payload ?? null }, null, 2));
    process.exitCode = 1;
  });
}

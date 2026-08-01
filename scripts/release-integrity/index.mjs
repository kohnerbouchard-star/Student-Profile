import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const MIGRATION_FILE_PATTERN = /^(\d{14})_([a-z0-9_]+)\.sql$/;
const EXACT_SHA_PATTERN = /^[0-9a-f]{40}$/;

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function validateExactSourceSha(value, field = 'source SHA') {
  if (!EXACT_SHA_PATTERN.test(String(value ?? ''))) {
    throw new Error(`${field} must be a lowercase 40-character hexadecimal commit SHA.`);
  }
  return value;
}

function parseVersion(value, field) {
  const match = String(value ?? '').trim().match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  if (!match) throw new Error(`${field} must be a complete semantic version.`);
  return match.slice(1).map(Number);
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function satisfiesBoundedRange(version, range, field) {
  const match = String(range ?? '').trim().match(/^>=(\d+\.\d+\.\d+)\s+<(\d+)$/);
  if (!match) {
    throw new Error(`${field} must use the supported bounded range format ">=x.y.z <major".`);
  }
  const parsed = parseVersion(version, field);
  const minimum = parseVersion(match[1], field);
  const exclusiveMajor = Number(match[2]);
  return compareVersions(parsed, minimum) >= 0 && parsed[0] < exclusiveMajor;
}

function npmVersionFromPackageManager(packageManager) {
  const match = String(packageManager ?? '').match(/^npm@(\d+\.\d+\.\d+)$/);
  if (!match) throw new Error('packageManager must pin npm with npm@x.y.z.');
  return match[1];
}

export async function verifyRuntimeContract({
  repoRoot = '.',
  mode = 'exact',
  currentNode = process.versions.node,
  currentNpm,
} = {}) {
  if (!['exact', 'compatible'].includes(mode)) {
    throw new Error('Runtime mode must be exact or compatible.');
  }

  const root = path.resolve(repoRoot);
  const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const exactNode = (await readFile(path.join(root, '.nvmrc'), 'utf8')).trim();
  const npmrc = await readFile(path.join(root, '.npmrc'), 'utf8');
  const exactNpm = npmVersionFromPackageManager(packageJson.packageManager);
  const resolvedNpm = currentNpm ?? execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim();

  parseVersion(exactNode, '.nvmrc');
  parseVersion(exactNpm, 'packageManager');
  parseVersion(currentNode, 'current Node.js');
  parseVersion(resolvedNpm, 'current npm');

  if (!satisfiesBoundedRange(exactNode, packageJson.engines?.node, 'engines.node')) {
    throw new Error('.nvmrc does not satisfy package.json engines.node.');
  }
  if (!satisfiesBoundedRange(exactNpm, packageJson.engines?.npm, 'engines.npm')) {
    throw new Error('packageManager npm does not satisfy package.json engines.npm.');
  }
  if (!/^\s*engine-strict\s*=\s*true\s*$/im.test(npmrc)) {
    throw new Error('.npmrc must contain engine-strict=true.');
  }

  const nodePass = mode === 'exact'
    ? currentNode === exactNode
    : satisfiesBoundedRange(currentNode, packageJson.engines.node, 'engines.node');
  const npmPass = mode === 'exact'
    ? resolvedNpm === exactNpm
    : satisfiesBoundedRange(resolvedNpm, packageJson.engines.npm, 'engines.npm');

  const result = {
    schemaVersion: 'econovaria.release-integrity.runtime-contract.v1',
    status: nodePass && npmPass ? 'PASS' : 'ERROR',
    mode,
    expected: {
      exactNode,
      exactNpm,
      nodeRange: packageJson.engines.node,
      npmRange: packageJson.engines.npm,
    },
    actual: {
      node: currentNode,
      npm: resolvedNpm,
    },
  };

  if (result.status !== 'PASS') {
    throw Object.assign(new Error(
      `Runtime contract failed in ${mode} mode: Node.js ${currentNode}, npm ${resolvedNpm}.`,
    ), { result });
  }

  return result;
}

export async function buildMigrationManifest({
  repoRoot = '.',
  migrationRoot = 'backend/supabase/migrations',
  sourceSha,
} = {}) {
  validateExactSourceSha(sourceSha);
  const root = path.resolve(repoRoot);
  const absoluteMigrationRoot = path.resolve(root, migrationRoot);
  const filenames = (await readdir(absoluteMigrationRoot))
    .filter((filename) => filename.endsWith('.sql'))
    .sort();

  if (filenames.length === 0) throw new Error('Migration root contains no SQL migrations.');

  const seenVersions = new Map();
  const migrations = [];
  for (const filename of filenames) {
    const match = filename.match(MIGRATION_FILE_PATTERN);
    if (!match) {
      throw new Error(`${filename}: expected a 14-digit timestamp and snake_case name.`);
    }
    const [, version, name] = match;
    if (seenVersions.has(version)) {
      throw new Error(`${filename}: duplicate migration version also used by ${seenVersions.get(version)}.`);
    }
    seenVersions.set(version, filename);
    const bytes = await readFile(path.join(absoluteMigrationRoot, filename));
    migrations.push({
      version,
      name,
      filename,
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
    });
  }

  const manifestBody = {
    schemaVersion: 'econovaria.release-integrity.migration-manifest.v1',
    sourceSha,
    migrationRoot: path.relative(root, absoluteMigrationRoot).replaceAll(path.sep, '/'),
    migrations,
  };

  return {
    ...manifestBody,
    manifestSha256: sha256(stableStringify(manifestBody)),
  };
}

function normalizeLiveLedger(liveLedger) {
  const rows = Array.isArray(liveLedger) ? liveLedger : liveLedger?.migrations;
  if (!Array.isArray(rows)) throw new Error('Live ledger must be an array or an object with migrations[].');
  return rows.map((row, index) => {
    const version = String(row?.version ?? '').trim();
    const name = String(row?.name ?? '').trim();
    if (!/^\d{14}$/.test(version)) {
      throw new Error(`Live ledger row ${index + 1} has an invalid migration version.`);
    }
    return { version, name };
  });
}

export function compareMigrationLedger({ manifest, liveLedger, environment }) {
  if (manifest?.schemaVersion !== 'econovaria.release-integrity.migration-manifest.v1') {
    throw new Error('Unsupported migration manifest schema.');
  }
  if (!environment || !/^[a-z][a-z0-9_-]*$/.test(environment)) {
    throw new Error('Environment must be a lowercase identifier.');
  }

  const liveRows = normalizeLiveLedger(liveLedger);
  const duplicateLiveVersions = [];
  const seenLive = new Map();
  for (const row of liveRows) {
    if (seenLive.has(row.version)) {
      duplicateLiveVersions.push({
        version: row.version,
        firstName: seenLive.get(row.version),
        duplicateName: row.name,
      });
    } else {
      seenLive.set(row.version, row.name);
    }
  }

  const orderingViolations = [];
  for (let index = 1; index < liveRows.length; index += 1) {
    if (liveRows[index - 1].version >= liveRows[index].version) {
      orderingViolations.push({
        index,
        previousVersion: liveRows[index - 1].version,
        currentVersion: liveRows[index].version,
      });
    }
  }

  const repositoryByVersion = new Map(manifest.migrations.map((row) => [row.version, row]));
  const liveByVersion = new Map(liveRows.map((row) => [row.version, row]));
  const missingFromLive = manifest.migrations
    .filter((row) => !liveByVersion.has(row.version))
    .map(({ version, name, filename }) => ({ version, name, filename }));
  const liveOnly = liveRows
    .filter((row) => !repositoryByVersion.has(row.version))
    .map(({ version, name }) => ({ version, name }));
  const nameMismatches = manifest.migrations
    .filter((row) => liveByVersion.has(row.version) && liveByVersion.get(row.version).name !== row.name)
    .map((row) => ({
      version: row.version,
      repositoryName: row.name,
      liveName: liveByVersion.get(row.version).name,
    }));

  const driftCount = missingFromLive.length
    + liveOnly.length
    + nameMismatches.length
    + duplicateLiveVersions.length
    + orderingViolations.length;

  return {
    schemaVersion: 'econovaria.release-integrity.ledger-report.v1',
    environment,
    status: driftCount === 0 ? 'PASS' : 'UNAPPROVED_DRIFT',
    repositoryManifestSha256: manifest.manifestSha256,
    repositoryMigrationCount: manifest.migrations.length,
    liveMigrationCount: liveRows.length,
    missingFromLive,
    liveOnly,
    nameMismatches,
    duplicateLiveVersions,
    orderingViolations,
  };
}

function normalizeEvidenceValue(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeEvidenceValue(entry))
      .sort((left, right) => stableStringify(left).localeCompare(stableStringify(right)));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !['capturedAt', 'databaseName', 'databaseHost'].includes(key))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, normalizeEvidenceValue(entry)]),
    );
  }
  if (typeof value === 'string') {
    return value.replaceAll('\r\n', '\n').replace(/[ \t]+$/gm, '').trim();
  }
  return value;
}

export function normalizeSchemaFingerprint(rawEvidence) {
  if (!rawEvidence || typeof rawEvidence !== 'object') {
    throw new Error('Schema evidence must be a JSON object.');
  }
  const structural = normalizeEvidenceValue(rawEvidence.structural ?? {});
  const authorization = normalizeEvidenceValue(rawEvidence.authorization ?? {});
  const structuralSha256 = sha256(stableStringify(structural));
  const authorizationSha256 = sha256(stableStringify(authorization));
  const body = {
    schemaVersion: 'econovaria.release-integrity.schema-fingerprint.v1',
    structural,
    authorization,
    structuralSha256,
    authorizationSha256,
  };
  return {
    ...body,
    overallSha256: sha256(stableStringify(body)),
  };
}

function exactDifferenceAllowed({ scope, stagingSha256, productionSha256, allowlist }) {
  const rows = allowlist?.allowedDifferences;
  if (!Array.isArray(rows)) return false;
  return rows.some((row) => row?.scope === scope
    && row?.stagingSha256 === stagingSha256
    && row?.productionSha256 === productionSha256
    && typeof row?.reason === 'string'
    && row.reason.trim().length >= 20);
}

export function compareSchemaFingerprints({ staging, production, allowlist = null }) {
  for (const [label, value] of [['staging', staging], ['production', production]]) {
    if (value?.schemaVersion !== 'econovaria.release-integrity.schema-fingerprint.v1') {
      throw new Error(`${label} fingerprint has an unsupported schema.`);
    }
  }

  const differences = [];
  for (const [scope, field] of [
    ['structural', 'structuralSha256'],
    ['authorization', 'authorizationSha256'],
  ]) {
    if (staging[field] === production[field]) continue;
    differences.push({
      scope,
      stagingSha256: staging[field],
      productionSha256: production[field],
      allowed: exactDifferenceAllowed({
        scope,
        stagingSha256: staging[field],
        productionSha256: production[field],
        allowlist,
      }),
    });
  }

  const status = differences.length === 0
    ? 'PASS'
    : differences.every((difference) => difference.allowed)
      ? 'EXPECTED_DIFFERENCE'
      : 'UNAPPROVED_DRIFT';

  return {
    schemaVersion: 'econovaria.release-integrity.schema-comparison.v1',
    status,
    staging: {
      structuralSha256: staging.structuralSha256,
      authorizationSha256: staging.authorizationSha256,
      overallSha256: staging.overallSha256,
    },
    production: {
      structuralSha256: production.structuralSha256,
      authorizationSha256: production.authorizationSha256,
      overallSha256: production.overallSha256,
    },
    differences,
  };
}

export function validateDatabaseUrlProjectRef({ databaseUrl, expectedProjectRef }) {
  if (!/^[a-z0-9]{20}$/.test(String(expectedProjectRef ?? ''))) {
    throw new Error('Expected Supabase project reference must be 20 lowercase alphanumeric characters.');
  }
  const parsed = new URL(databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('Database URL must use PostgreSQL.');
  }
  const username = decodeURIComponent(parsed.username || '');
  const direct = parsed.hostname === `db.${expectedProjectRef}.supabase.co`;
  const pooler = username === `postgres.${expectedProjectRef}` || username.endsWith(`.${expectedProjectRef}`);
  if (!direct && !pooler) throw new Error('Database URL is not bound to the expected Supabase project.');
  if (!decodeURIComponent(parsed.password || '')) throw new Error('Database URL must contain a password.');
  return {
    schemaVersion: 'econovaria.release-integrity.database-binding.v1',
    status: 'PASS',
    expectedProjectRef,
    connectionType: direct ? 'direct' : 'pooler',
  };
}

export function createReleaseAttestation({
  sourceSha,
  workflowRunId,
  workflowRunAttempt,
  runtimeContract,
  migrationManifest,
  stagingLedger,
  productionLedger,
  schemaComparison,
}) {
  validateExactSourceSha(sourceSha);
  const componentStatuses = {
    runtimeContract: runtimeContract?.status,
    stagingLedger: stagingLedger?.status,
    productionLedger: productionLedger?.status,
    schemaComparison: schemaComparison?.status,
  };
  const status = Object.values(componentStatuses).every((value) => value === 'PASS') ? 'PASS' : 'BLOCKED';
  return {
    schemaVersion: 'econovaria.release-integrity.attestation.v1',
    status,
    sourceSha,
    workflowRunId: String(workflowRunId ?? ''),
    workflowRunAttempt: String(workflowRunAttempt ?? ''),
    componentStatuses,
    migrationManifestSha256: migrationManifest?.manifestSha256 ?? null,
    staging: {
      ledgerStatus: stagingLedger?.status ?? null,
      structuralSha256: schemaComparison?.staging?.structuralSha256 ?? null,
      authorizationSha256: schemaComparison?.staging?.authorizationSha256 ?? null,
    },
    production: {
      ledgerStatus: productionLedger?.status ?? null,
      structuralSha256: schemaComparison?.production?.structuralSha256 ?? null,
      authorizationSha256: schemaComparison?.production?.authorizationSha256 ?? null,
    },
  };
}

export async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

export async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

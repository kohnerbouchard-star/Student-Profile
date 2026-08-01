#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildMigrationManifest,
  compareMigrationLedger,
  compareSchemaFingerprints,
  createReleaseAttestation,
  normalizeSchemaFingerprint,
  readJson,
  validateDatabaseUrlProjectRef,
  validateExactSourceSha,
  verifyRuntimeContract,
  writeJson,
} from './index.mjs';

function parseArguments(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (!argument.startsWith('--')) throw new Error(`Unexpected argument: ${argument}`);
    const key = argument.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const next = rest[index + 1];
    if (!next || next.startsWith('--')) {
      options[key] = true;
      continue;
    }
    options[key] = next;
    index += 1;
  }
  return { command, options };
}

function required(options, key) {
  const value = options[key];
  if (!value || value === true) {
    throw new Error(`--${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} is required.`);
  }
  return value;
}

async function output(options, value) {
  if (options.output) await writeJson(path.resolve(String(options.output)), value);
  console.log(JSON.stringify(value, null, 2));
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  const repoRoot = path.resolve(String(options.repoRoot ?? '.'));

  if (command === 'runtime') {
    try {
      const result = await verifyRuntimeContract({ repoRoot, mode: String(options.mode ?? 'exact') });
      await output(options, result);
    } catch (error) {
      if (error?.result) await output(options, error.result);
      throw error;
    }
    return;
  }

  if (command === 'manifest') {
    const manifest = await buildMigrationManifest({
      repoRoot,
      migrationRoot: String(options.migrationRoot ?? 'backend/supabase/migrations'),
      sourceSha: required(options, 'sourceSha'),
    });
    await output(options, manifest);
    return;
  }

  if (command === 'ledger') {
    const manifest = await readJson(path.resolve(required(options, 'manifest')));
    const liveLedger = await readJson(path.resolve(required(options, 'liveLedger')));
    const report = compareMigrationLedger({
      manifest,
      liveLedger,
      environment: required(options, 'environment'),
    });
    await output(options, report);
    if (report.status !== 'PASS' && !options.allowFailure) process.exitCode = 2;
    return;
  }

  if (command === 'normalize-schema') {
    const raw = await readJson(path.resolve(required(options, 'input')));
    const normalized = normalizeSchemaFingerprint(raw);
    await output(options, normalized);
    return;
  }

  if (command === 'compare-schema') {
    const staging = await readJson(path.resolve(required(options, 'staging')));
    const production = await readJson(path.resolve(required(options, 'production')));
    const comparison = compareSchemaFingerprints({ staging, production });
    await output(options, comparison);
    if (comparison.status !== 'PASS' && !options.allowFailure) process.exitCode = 2;
    return;
  }

  if (command === 'validate-db-url') {
    const variableName = required(options, 'urlEnv');
    const databaseUrl = process.env[variableName];
    if (!databaseUrl) throw new Error(`Environment variable ${variableName} is required.`);
    const result = validateDatabaseUrlProjectRef({
      databaseUrl,
      expectedProjectRef: required(options, 'expectedProjectRef'),
    });
    await output(options, result);
    return;
  }

  if (command === 'verify-source') {
    const expected = validateExactSourceSha(required(options, 'expectedSha'), 'expected source SHA');
    const actual = validateExactSourceSha(required(options, 'actualSha'), 'actual source SHA');
    if (expected !== actual) throw new Error('Checked-out source SHA does not match the expected source SHA.');
    await output(options, {
      schemaVersion: 'econovaria.release-integrity.source-binding.v1',
      status: 'PASS',
      sourceSha: actual,
    });
    return;
  }

  if (command === 'attestation') {
    const attestation = createReleaseAttestation({
      sourceSha: required(options, 'sourceSha'),
      workflowRunId: required(options, 'workflowRunId'),
      workflowRunAttempt: required(options, 'workflowRunAttempt'),
      runtimeContract: await readJson(path.resolve(required(options, 'runtime'))),
      migrationManifest: await readJson(path.resolve(required(options, 'manifest'))),
      stagingLedger: await readJson(path.resolve(required(options, 'stagingLedger'))),
      productionLedger: await readJson(path.resolve(required(options, 'productionLedger'))),
      schemaComparison: await readJson(path.resolve(required(options, 'schemaComparison'))),
    });
    await output(options, attestation);
    if (attestation.status !== 'PASS' && !options.allowFailure) process.exitCode = 2;
    return;
  }

  if (command === 'enforce-attestation') {
    const attestation = await readJson(path.resolve(required(options, 'input')));
    if (attestation?.schemaVersion !== 'econovaria.release-integrity.attestation.v1') {
      throw new Error('Unsupported release attestation schema.');
    }
    if (attestation.status !== 'PASS') {
      throw new Error(`Release integrity gate is ${attestation.status}; production promotion is blocked.`);
    }
    console.log(JSON.stringify({ status: 'PASS', sourceSha: attestation.sourceSha }, null, 2));
    return;
  }

  throw new Error(`Unknown release-integrity command: ${command ?? '(missing)'}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

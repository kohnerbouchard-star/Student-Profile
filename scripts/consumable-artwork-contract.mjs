#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exists, readJson, sha256File } from './seed-beta-pack-lib.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(SCRIPT_DIR);
const SEED_ROOT = path.join(REPO_ROOT, 'docs', 'seed-content');
const CATALOG_PATH = path.join(SEED_ROOT, 'items', 'catalog', 'consumables-v1.json');
const ARTWORK_PATH = path.join(SEED_ROOT, 'items', 'consumable-artwork-source-v2.json');

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function unique(values) {
  return new Set(values).size === values.length;
}

function expectedAssetPath(record) {
  return `player-terminal/assets/images/items/consumables/${record.country}/${record.itemKey}.webp`;
}

export async function validateConsumableArtworkContract() {
  const [catalog, artwork] = await Promise.all([
    readJson(CATALOG_PATH),
    readJson(ARTWORK_PATH),
  ]);

  requireCondition(catalog.count === 24 && catalog.records?.length === 24, 'Consumable catalog must contain exactly 24 definitions.');
  requireCondition(artwork.recordCount === 24 && artwork.records?.length === 24, 'Consumable artwork source must contain exactly 24 records.');
  requireCondition(artwork.provider === 'Magnific', 'Consumable artwork provider must be Magnific.');
  requireCondition(artwork.artDirection?.aspectRatio === '1:1', 'Consumable artwork must use square framing.');
  requireCondition(artwork.runtimeDelivery?.newBinaryCount === 24, 'Consumable artwork must declare 24 new binaries.');
  requireCondition(unique(artwork.records.map((record) => record.itemKey)), 'Consumable artwork item keys must be unique.');
  requireCondition(unique(artwork.records.map((record) => record.stableId)), 'Consumable artwork stable IDs must be unique.');
  requireCondition(unique(artwork.records.map((record) => record.creationIdentifier)), 'Consumable artwork creation identifiers must be unique.');

  const catalogByKey = new Map(catalog.records.map((record) => [record.itemKey, record]));
  const expectedKeys = [...catalogByKey.keys()].sort();
  const artworkKeys = artwork.records.map((record) => record.itemKey).sort();
  requireCondition(JSON.stringify(artworkKeys) === JSON.stringify(expectedKeys), 'Consumable artwork must exactly cover all consumable identities.');

  const runtimeReady = artwork.runtimeDelivery?.runtimeImagePathsAvailable === true;
  requireCondition(artwork.runtimeDelivery?.binaryFilesCommitted === runtimeReady, 'Consumable binary and runtime readiness flags must agree.');

  for (const record of artwork.records) {
    const definition = catalogByKey.get(record.itemKey);
    requireCondition(definition, `${record.itemKey} is not a consumable definition.`);
    requireCondition(record.country === definition.source, `${record.itemKey} country does not match the consumable source.`);
    requireCondition(record.sourceItemStableId === `item.${record.itemKey}.v1`, `${record.itemKey} source stable ID is invalid.`);
    requireCondition(record.sourcePageUrl === `https://www.magnific.com/app/creation/${record.creationIdentifier}`, `${record.itemKey} Magnific provenance is inconsistent.`);

    if (!runtimeReady) {
      requireCondition(record.runtimeImagePath === null, `${record.itemKey} must not claim a runtime path before import.`);
      requireCondition(record.assetStatus === 'generated-awaiting-repository-export', `${record.itemKey} has an invalid pre-import status.`);
      continue;
    }

    requireCondition(record.runtimeImagePath === expectedAssetPath(record), `${record.itemKey} has an invalid consumable asset path.`);
    requireCondition(record.assetStatus === 'repository-owned', `${record.itemKey} must be repository-owned.`);
    requireCondition(/^[a-f0-9]{64}$/.test(String(record.sha256 ?? '')), `${record.itemKey} is missing a SHA-256 digest.`);
    requireCondition(Number.isInteger(record.bytes) && record.bytes > 0, `${record.itemKey} is missing its byte size.`);
    requireCondition(record.width === 1024 && record.height === 1024, `${record.itemKey} must be 1024x1024.`);
    requireCondition(record.mediaType === 'image/webp', `${record.itemKey} must use WebP.`);
    const assetPath = path.join(REPO_ROOT, record.runtimeImagePath);
    requireCondition(await exists(assetPath), `${record.runtimeImagePath} is missing.`);
    requireCondition(await sha256File(assetPath) === record.sha256, `${record.runtimeImagePath} digest mismatch.`);
    requireCondition((await readFile(assetPath)).byteLength === record.bytes, `${record.runtimeImagePath} byte-size mismatch.`);
  }

  return {
    schemaVersion: 'econovaria-consumable-artwork-contract-report-v1',
    valid: true,
    consumableDefinitions: catalog.records.length,
    artworkRecords: artwork.records.length,
    repositoryAssets: runtimeReady ? artwork.records.length : 0,
    runtimeImagePathsAvailable: runtimeReady,
  };
}

async function main() {
  const report = await validateConsumableArtworkContract();
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}

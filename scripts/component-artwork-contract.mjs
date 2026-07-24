#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exists, readJson, sha256File } from './seed-beta-pack-lib.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(SCRIPT_DIR);
const SEED_ROOT = path.join(REPO_ROOT, 'docs', 'seed-content');
const COMPONENT_CATALOG_PATH = path.join(SEED_ROOT, 'items', 'catalog', 'components-v1.json');
const COMPONENT_ARTWORK_PATH = path.join(SEED_ROOT, 'items', 'component-artwork-source-v2.json');
const STORE_ARTWORK_PATH = path.join(SEED_ROOT, 'items', 'store-artwork-source-v2.json');

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function unique(values) {
  return new Set(values).size === values.length;
}

function expectedNewAssetPath(record) {
  return `player-terminal/assets/images/items/components/${record.country}/${record.itemKey}.webp`;
}

export async function validateComponentArtworkContract() {
  const [catalog, componentArtwork, storeArtwork] = await Promise.all([
    readJson(COMPONENT_CATALOG_PATH),
    readJson(COMPONENT_ARTWORK_PATH),
    readJson(STORE_ARTWORK_PATH),
  ]);

  requireCondition(catalog.count === 30 && catalog.records?.length === 30, 'Component catalog must contain exactly 30 definitions.');
  requireCondition(componentArtwork.recordCount === 30 && componentArtwork.records?.length === 30, 'Component artwork source must contain exactly 30 records.');
  requireCondition(componentArtwork.provider === 'Magnific', 'Component artwork provider must be Magnific.');
  requireCondition(componentArtwork.artDirection?.aspectRatio === '1:1', 'Component artwork must use square framing.');
  requireCondition(unique(componentArtwork.records.map((record) => record.itemKey)), 'Component artwork item keys must be unique.');
  requireCondition(unique(componentArtwork.records.map((record) => record.stableId)), 'Component artwork stable IDs must be unique.');
  requireCondition(unique(componentArtwork.records.map((record) => record.creationIdentifier)), 'Component artwork creation identifiers must be unique.');

  const catalogByKey = new Map(catalog.records.map((record) => [record.itemKey, record]));
  const storeByArtworkStableId = new Map(storeArtwork.records.map((record) => [record.stableId, record]));
  const artworkKeys = componentArtwork.records.map((record) => record.itemKey).sort();
  requireCondition(JSON.stringify(artworkKeys) === JSON.stringify([...catalogByKey.keys()].sort()), 'Component artwork must exactly cover all component identities.');

  const reuseRecords = componentArtwork.records.filter((record) => record.reuseStoreArtworkStableId);
  const newRecords = componentArtwork.records.filter((record) => !record.reuseStoreArtworkStableId);
  requireCondition(reuseRecords.length === 8, `Expected 8 same-identity Store artwork reuses, found ${reuseRecords.length}.`);
  requireCondition(newRecords.length === 22, `Expected 22 new component artwork records, found ${newRecords.length}.`);
  requireCondition(componentArtwork.runtimeDelivery?.sameIdentityReuseCount === 8, 'Component artwork reuse count is incorrect.');
  requireCondition(componentArtwork.runtimeDelivery?.newBinaryCount === 22, 'Component artwork new-binary count is incorrect.');

  const runtimeReady = componentArtwork.runtimeDelivery?.runtimeImagePathsAvailable === true;
  requireCondition(componentArtwork.runtimeDelivery?.binaryFilesCommitted === runtimeReady, 'Component binary and runtime readiness flags must agree.');

  for (const record of componentArtwork.records) {
    const definition = catalogByKey.get(record.itemKey);
    requireCondition(definition, `${record.itemKey} is not a component definition.`);
    requireCondition(record.country === definition.source, `${record.itemKey} country does not match the component source.`);
    requireCondition(record.sourceItemStableId === `item.${record.itemKey}.v1`, `${record.itemKey} source stable ID is invalid.`);
    requireCondition(record.sourcePageUrl === `https://www.magnific.com/app/creation/${record.creationIdentifier}`, `${record.itemKey} Magnific provenance is inconsistent.`);

    if (!runtimeReady) {
      requireCondition(record.runtimeImagePath === null, `${record.itemKey} must not claim a runtime path before import.`);
      continue;
    }

    requireCondition(record.assetStatus === 'repository-owned', `${record.itemKey} must be repository-owned.`);
    requireCondition(/^[a-f0-9]{64}$/.test(String(record.sha256 ?? '')), `${record.itemKey} is missing a SHA-256 digest.`);
    requireCondition(Number.isInteger(record.bytes) && record.bytes > 0, `${record.itemKey} is missing its byte size.`);
    requireCondition(record.width === 1024 && record.height === 1024, `${record.itemKey} must be 1024x1024.`);
    requireCondition(record.mediaType === 'image/webp', `${record.itemKey} must use WebP.`);

    if (record.reuseStoreArtworkStableId) {
      const storeRecord = storeByArtworkStableId.get(record.reuseStoreArtworkStableId);
      requireCondition(storeRecord, `${record.itemKey} references missing Store artwork.`);
      requireCondition(storeRecord.sourceItemStableId === record.sourceItemStableId, `${record.itemKey} may only reuse artwork for the same item identity.`);
      requireCondition(record.runtimeImagePath === storeRecord.runtimeImagePath, `${record.itemKey} reuse path does not match Store artwork.`);
      requireCondition(record.sha256 === storeRecord.sha256, `${record.itemKey} reuse digest does not match Store artwork.`);
      requireCondition(record.bytes === storeRecord.bytes, `${record.itemKey} reuse byte size does not match Store artwork.`);
      requireCondition(record.assetReuse === 'same-item-identity', `${record.itemKey} must explicitly identify same-item artwork reuse.`);
    } else {
      requireCondition(record.runtimeImagePath === expectedNewAssetPath(record), `${record.itemKey} has an invalid component asset path.`);
      requireCondition(record.assetReuse === null, `${record.itemKey} must not claim artwork reuse.`);
    }

    const assetPath = path.join(REPO_ROOT, record.runtimeImagePath);
    requireCondition(await exists(assetPath), `${record.runtimeImagePath} is missing.`);
    requireCondition(await sha256File(assetPath) === record.sha256, `${record.runtimeImagePath} digest mismatch.`);
    requireCondition((await readFile(assetPath)).byteLength === record.bytes, `${record.runtimeImagePath} byte-size mismatch.`);
  }

  return {
    schemaVersion: 'econovaria-component-artwork-contract-report-v1',
    valid: true,
    componentDefinitions: catalog.records.length,
    artworkRecords: componentArtwork.records.length,
    newRepositoryAssets: runtimeReady ? newRecords.length : 0,
    sameIdentityReuses: reuseRecords.length,
    runtimeImagePathsAvailable: runtimeReady,
  };
}

async function main() {
  const report = await validateComponentArtworkContract();
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}

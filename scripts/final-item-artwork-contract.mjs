#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exists, readJson, sha256File } from './seed-beta-pack-lib.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(SCRIPT_DIR);
const SEED_ROOT = path.join(REPO_ROOT, 'docs', 'seed-content');
const BLUEPRINT_CATALOG_PATH = path.join(SEED_ROOT, 'items', 'catalog', 'blueprints-authorizations-v1.json');
const MATERIAL_CATALOG_PATH = path.join(SEED_ROOT, 'items', 'catalog', 'materials-v1.json');
const BLUEPRINT_ARTWORK_PATH = path.join(SEED_ROOT, 'items', 'blueprint-artwork-source-v2.json');
const MATERIAL_ARTWORK_PATH = path.join(SEED_ROOT, 'items', 'material-artwork-expansion-v2.json');
const STORE_ARTWORK_PATH = path.join(SEED_ROOT, 'items', 'store-artwork-source-v2.json');

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function unique(values) {
  return new Set(values).size === values.length;
}

function blueprintAssetPath(record) {
  return `player-terminal/assets/images/items/blueprints/${record.country}/${record.itemKey}.webp`;
}

function materialAssetPath(record) {
  return `player-terminal/assets/images/items/materials/${record.country}/${record.itemKey}.webp`;
}

async function validateRepositoryAsset(record, expectedPath, expectedStatus) {
  requireCondition(record.runtimeImagePath === expectedPath, `${record.itemKey} has an invalid runtime asset path.`);
  requireCondition(record.assetStatus === expectedStatus, `${record.itemKey} has an invalid repository status.`);
  requireCondition(/^[a-f0-9]{64}$/.test(String(record.sha256 ?? '')), `${record.itemKey} is missing a SHA-256 digest.`);
  requireCondition(Number.isInteger(record.bytes) && record.bytes > 0, `${record.itemKey} is missing its byte size.`);
  requireCondition(record.width === 1024 && record.height === 1024, `${record.itemKey} must be 1024x1024.`);
  requireCondition(record.mediaType === 'image/webp', `${record.itemKey} must use WebP.`);
  const assetPath = path.join(REPO_ROOT, record.runtimeImagePath);
  requireCondition(await exists(assetPath), `${record.runtimeImagePath} is missing.`);
  requireCondition(await sha256File(assetPath) === record.sha256, `${record.runtimeImagePath} digest mismatch.`);
  requireCondition((await readFile(assetPath)).byteLength === record.bytes, `${record.runtimeImagePath} byte-size mismatch.`);
}

export async function validateFinalItemArtworkContract() {
  const [blueprintCatalog, materialCatalog, blueprintArtwork, materialArtwork, storeArtwork] = await Promise.all([
    readJson(BLUEPRINT_CATALOG_PATH),
    readJson(MATERIAL_CATALOG_PATH),
    readJson(BLUEPRINT_ARTWORK_PATH),
    readJson(MATERIAL_ARTWORK_PATH),
    readJson(STORE_ARTWORK_PATH),
  ]);

  requireCondition(blueprintCatalog.count === 18 && blueprintCatalog.records?.length === 18, 'Blueprint catalog must contain exactly 18 definitions.');
  requireCondition(blueprintArtwork.recordCount === 18 && blueprintArtwork.records?.length === 18, 'Blueprint artwork must contain exactly 18 records.');
  requireCondition(blueprintArtwork.provider === 'Magnific', 'Blueprint artwork provider must be Magnific.');
  requireCondition(blueprintArtwork.runtimeDelivery?.newBinaryCount === 17, 'Blueprint artwork must declare 17 new binaries.');
  requireCondition(blueprintArtwork.runtimeDelivery?.reusedBinaryCount === 1, 'Blueprint artwork must declare one reused binary.');
  requireCondition(blueprintArtwork.artDirection?.aspectRatio === '1:1', 'Blueprint artwork must use square framing.');
  requireCondition(unique(blueprintArtwork.records.map((record) => record.itemKey)), 'Blueprint artwork item keys must be unique.');
  requireCondition(unique(blueprintArtwork.records.map((record) => record.stableId)), 'Blueprint artwork stable IDs must be unique.');
  requireCondition(unique(blueprintArtwork.records.map((record) => record.creationIdentifier)), 'Blueprint artwork creation identifiers must be unique.');

  const blueprintByKey = new Map(blueprintCatalog.records.map((record) => [record.itemKey, record]));
  requireCondition(
    JSON.stringify(blueprintArtwork.records.map((record) => record.itemKey).sort()) === JSON.stringify([...blueprintByKey.keys()].sort()),
    'Blueprint artwork must exactly cover all blueprint and authorization identities.',
  );

  const storeByKey = new Map(storeArtwork.records.map((record) => [record.itemKey, record]));
  const blueprintReady = blueprintArtwork.runtimeDelivery?.runtimeImagePathsAvailable === true;
  requireCondition(blueprintArtwork.runtimeDelivery?.binaryFilesCommitted === blueprintReady, 'Blueprint binary and runtime readiness flags must agree.');

  for (const record of blueprintArtwork.records) {
    const definition = blueprintByKey.get(record.itemKey);
    requireCondition(definition, `${record.itemKey} is not a blueprint or authorization definition.`);
    requireCondition(record.country === definition.source, `${record.itemKey} country does not match its definition source.`);
    requireCondition(record.sourceItemStableId === `item.${record.itemKey}.v1`, `${record.itemKey} source stable ID is invalid.`);
    requireCondition(record.sourcePageUrl === `https://www.magnific.com/app/creation/${record.creationIdentifier}`, `${record.itemKey} Magnific provenance is inconsistent.`);

    if (record.reuseSource === 'store-artwork-source-v2') {
      const storeRecord = storeByKey.get(record.itemKey);
      requireCondition(storeRecord, `${record.itemKey} does not have a Store artwork source to reuse.`);
      requireCondition(record.creationIdentifier === storeRecord.creationIdentifier, `${record.itemKey} reuse creation identifier drifted.`);
      requireCondition(record.runtimeImagePath === storeRecord.runtimeImagePath, `${record.itemKey} reuse path drifted.`);
      requireCondition(record.sha256 === storeRecord.sha256, `${record.itemKey} reuse digest drifted.`);
      requireCondition(record.bytes === storeRecord.bytes, `${record.itemKey} reuse byte size drifted.`);
      await validateRepositoryAsset(record, storeRecord.runtimeImagePath, 'repository-reused');
      continue;
    }

    if (!blueprintReady) {
      requireCondition(record.runtimeImagePath === null, `${record.itemKey} must not claim a runtime path before import.`);
      requireCondition(record.assetStatus === 'generated-awaiting-repository-export', `${record.itemKey} has an invalid pre-import status.`);
      continue;
    }

    await validateRepositoryAsset(record, blueprintAssetPath(record), 'repository-owned');
  }

  const materialDefinition = materialCatalog.records.find((record) => record.itemKey === 'recycled-electronics-feedstock');
  requireCondition(materialDefinition, 'Recycled Electronics Feedstock must exist in the material catalog.');
  requireCondition(materialArtwork.recordCount === 1 && materialArtwork.records?.length === 1, 'Material artwork expansion must contain exactly one record.');
  requireCondition(materialArtwork.provider === 'Magnific', 'Material artwork provider must be Magnific.');
  requireCondition(materialArtwork.runtimeDelivery?.newBinaryCount === 1, 'Material artwork expansion must declare one new binary.');
  const materialRecord = materialArtwork.records[0];
  requireCondition(materialRecord.itemKey === 'recycled-electronics-feedstock', 'Material artwork expansion covers the wrong item.');
  requireCondition(materialRecord.country === materialDefinition.source, 'Recycled Electronics Feedstock country does not match its definition.');
  requireCondition(materialRecord.sourceItemStableId === 'item.recycled-electronics-feedstock.v1', 'Recycled Electronics Feedstock source stable ID is invalid.');
  requireCondition(materialRecord.sourcePageUrl === `https://www.magnific.com/app/creation/${materialRecord.creationIdentifier}`, 'Material Magnific provenance is inconsistent.');
  const materialReady = materialArtwork.runtimeDelivery?.runtimeImagePathsAvailable === true;
  requireCondition(materialArtwork.runtimeDelivery?.binaryFilesCommitted === materialReady, 'Material binary and runtime readiness flags must agree.');

  if (!materialReady) {
    requireCondition(materialRecord.runtimeImagePath === null, 'Material must not claim a runtime path before import.');
    requireCondition(materialRecord.assetStatus === 'generated-awaiting-repository-export', 'Material has an invalid pre-import status.');
  } else {
    await validateRepositoryAsset(materialRecord, materialAssetPath(materialRecord), 'repository-owned');
  }

  return {
    schemaVersion: 'econovaria-final-item-artwork-contract-report-v1',
    valid: true,
    blueprintDefinitions: blueprintCatalog.records.length,
    blueprintArtworkRecords: blueprintArtwork.records.length,
    blueprintNewAssets: blueprintReady ? 17 : 0,
    blueprintReusedAssets: 1,
    materialArtworkRecords: materialArtwork.records.length,
    materialNewAssets: materialReady ? 1 : 0,
    runtimeImagePathsAvailable: blueprintReady && materialReady,
  };
}

async function main() {
  const report = await validateFinalItemArtworkContract();
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}

#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exists, readJson, sha256File } from './seed-beta-pack-lib.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(SCRIPT_DIR);
const SEED_ROOT = path.join(REPO_ROOT, 'docs', 'seed-content');
const PACK_ROOT = path.join(SEED_ROOT, 'executable', 'beta-pack-v1');
const PLACEHOLDER_PATTERNS = [
  /bounded beta/i,
  /stable source/i,
  /placeholder/i,
  /lorem ipsum/i,
  /\btbd\b/i,
  /\btodo\b/i,
  /replace[- ]?me/i,
];

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function unique(values) {
  return new Set(values).size === values.length;
}

function expectedRuntimeImagePath(record) {
  return `player-terminal/assets/images/items/store/${record.country}/${record.itemKey}.webp`;
}

export async function validateStoreContentArtworkContract() {
  const requiredPaths = {
    contentSource: path.join(SEED_ROOT, 'items', 'store-content-overrides-v2.json'),
    artworkSource: path.join(SEED_ROOT, 'items', 'store-artwork-source-v2.json'),
    store: path.join(PACK_ROOT, 'store-catalog-v1.json'),
    generatedArtwork: path.join(PACK_ROOT, 'store-artwork-v2.json'),
    pack: path.join(PACK_ROOT, 'pack-v1.json'),
    mappings: path.join(PACK_ROOT, 'stable-id-map-v1.json'),
  };
  for (const [name, filePath] of Object.entries(requiredPaths)) {
    requireCondition(await exists(filePath), `${name} is missing at ${path.relative(REPO_ROOT, filePath)}.`);
  }

  const [contentSource, artworkSource, store, generatedArtwork, pack, mappings] = await Promise.all(
    Object.values(requiredPaths).map((filePath) => readJson(filePath)),
  );

  requireCondition(contentSource.count === 50 && contentSource.records?.length === 50, 'Authored Store content must contain exactly 50 records.');
  requireCondition(artworkSource.recordCount === 50 && artworkSource.records?.length === 50, 'Artwork source must contain exactly 50 records.');
  requireCondition(store.itemCount === 50 && store.items?.length === 50, 'Generated Store catalog must contain exactly 50 records.');
  requireCondition(generatedArtwork.recordCount === 50 && generatedArtwork.records?.length === 50, 'Generated Store artwork manifest must contain exactly 50 records.');
  requireCondition(pack.boundedCounts?.storeItemArtwork === 50, 'Pack must bind exactly 50 Store artwork records.');
  requireCondition(pack.domainFiles?.storeArtwork === 'store-artwork-v2.json', 'Pack must bind the generated Store artwork file.');
  requireCondition(pack.contentRevision === 'store-content-v2', 'Pack content revision must identify the authored Store upgrade.');

  const descriptions = store.items.map((item) => String(item.description ?? '').trim());
  requireCondition(descriptions.every((description) => description.length >= 80 && description.length <= 520), 'Every Store description must be substantive and bounded.');
  requireCondition(descriptions.every((description) => !PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(description))), 'Store catalog contains placeholder or internal seed language.');
  requireCondition(store.items.every((item) => item.contentRevision === 'store-content-v2'), 'Every Store item must carry the authored content revision.');

  const creationIdentifiers = artworkSource.records.map((record) => record.creationIdentifier);
  const artworkStableIds = artworkSource.records.map((record) => record.stableId);
  requireCondition(unique(creationIdentifiers), 'Every Store item must use a distinct Magnific creation.');
  requireCondition(unique(artworkStableIds), 'Every Store artwork stable ID must be unique.');
  requireCondition(artworkSource.records.every((record) => record.sourcePageUrl === `https://www.magnific.com/app/creation/${record.creationIdentifier}`), 'Artwork source provenance URLs are inconsistent.');

  const runtimeReady = artworkSource.runtimeDelivery?.runtimeImagePathsAvailable === true;
  requireCondition(artworkSource.runtimeDelivery?.binaryFilesCommitted === runtimeReady, 'Artwork binary and runtime readiness flags must agree.');
  if (runtimeReady) {
    for (const record of artworkSource.records) {
      requireCondition(record.runtimeImagePath === expectedRuntimeImagePath(record), `${record.country}/${record.itemKey} has an invalid runtime image path.`);
      requireCondition(record.assetStatus === 'repository-owned', `${record.country}/${record.itemKey} must be repository-owned.`);
      requireCondition(/^[a-f0-9]{64}$/.test(String(record.sha256 ?? '')), `${record.country}/${record.itemKey} lacks a SHA-256 digest.`);
      requireCondition(record.width === 1024 && record.height === 1024, `${record.country}/${record.itemKey} must be 1024x1024.`);
      const assetPath = path.join(REPO_ROOT, record.runtimeImagePath);
      requireCondition(await exists(assetPath), `${record.runtimeImagePath} is missing.`);
      requireCondition(await sha256File(assetPath) === record.sha256, `${record.runtimeImagePath} digest mismatch.`);
      requireCondition((await readFile(assetPath)).byteLength === record.bytes, `${record.runtimeImagePath} byte-size mismatch.`);
    }
  } else {
    requireCondition(artworkSource.records.every((record) => record.runtimeImagePath === null), 'Pre-export artwork must keep every runtime image path null.');
  }

  const generatedByStore = new Map(generatedArtwork.records.map((record) => [record.storeStableId, record]));
  requireCondition(generatedByStore.size === 50, 'Generated artwork must map to 50 unique Store stable IDs.');
  for (const item of store.items) {
    const artwork = generatedByStore.get(item.stableId);
    requireCondition(artwork, `${item.stableId} has no generated artwork record.`);
    requireCondition(item.artwork?.stableId === artwork.stableId, `${item.stableId} artwork stable ID is inconsistent.`);
    requireCondition(item.artwork?.creationIdentifier === artwork.creationIdentifier, `${item.stableId} artwork creation is inconsistent.`);
    requireCondition(item.artwork?.sourcePageUrl === artwork.sourcePageUrl, `${item.stableId} artwork provenance is inconsistent.`);
    requireCondition(item.artwork?.runtimeImagePath === artwork.runtimeImagePath, `${item.stableId} runtime artwork path is inconsistent.`);
    requireCondition(item.artwork?.sha256 === artwork.sha256, `${item.stableId} artwork digest is inconsistent.`);
  }

  const mappingByStore = new Map((mappings.mappings?.storeItems ?? []).map((entry) => [entry.stableId, entry]));
  requireCondition(mappingByStore.size === 50, 'Stable-ID map must contain 50 Store mappings.');
  for (const item of store.items) {
    const mapping = mappingByStore.get(item.stableId);
    requireCondition(mapping?.artworkStableId === item.artwork.stableId, `${item.stableId} stable-ID mapping does not bind its artwork.`);
    requireCondition(mapping?.artworkRuntimeImagePath === item.artwork.runtimeImagePath, `${item.stableId} stable-ID mapping does not bind its runtime path.`);
  }

  requireCondition(generatedArtwork.runtimeDelivery?.runtimeImagePathsAvailable === runtimeReady, 'Generated artwork readiness must match its source manifest.');
  if (runtimeReady) {
    requireCondition(generatedArtwork.records.every((record) => typeof record.runtimeImagePath === 'string' && record.runtimeImagePath.length > 0), 'Runtime-ready artwork must provide every repository image path.');
  } else {
    requireCondition(generatedArtwork.records.every((record) => record.runtimeImagePath === null), 'Pre-export artwork must keep every runtime image path null.');
  }

  return {
    schemaVersion: 'econovaria-store-content-artwork-contract-report-v1',
    valid: true,
    authoredDescriptions: descriptions.length,
    placeholderDescriptions: 0,
    individualArtworkRecords: generatedArtwork.records.length,
    repositoryOwnedArtwork: runtimeReady ? generatedArtwork.records.length : 0,
    duplicateArtworkAssignments: 0,
    runtimeImagePathsAvailable: runtimeReady,
  };
}

async function main() {
  const report = await validateStoreContentArtworkContract();
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}

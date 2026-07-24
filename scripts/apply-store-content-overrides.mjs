#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canonicalJson,
  exists,
  readJson,
  sha256,
  sha256File,
  walkFiles,
  writeJson,
} from './seed-beta-pack-lib.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(SCRIPT_DIR);
const SEED_ROOT = path.join(REPO_ROOT, 'docs', 'seed-content');
const PACK_ROOT = path.join(SEED_ROOT, 'executable', 'beta-pack-v1');
const CONTENT_SOURCE_PATH = path.join(SEED_ROOT, 'items', 'store-content-overrides-v2.json');
const ARTWORK_SOURCE_PATH = path.join(SEED_ROOT, 'items', 'store-artwork-source-v2.json');
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

function sourceItemKey(stableId) {
  const match = /^item\.(.+)\.v1$/.exec(String(stableId ?? ''));
  return match?.[1] ?? null;
}

function recordKey(country, itemKey) {
  return `${String(country).toLowerCase()}|${String(itemKey).toLowerCase()}`;
}

function expectedRuntimeImagePath(record) {
  return `player-terminal/assets/images/items/store/${record.country}/${record.itemKey}.webp`;
}

function assertPlayerFacingDescription(record) {
  const description = String(record.description ?? '').trim();
  requireCondition(description.length >= 80, `${record.country}/${record.itemKey} description is too short.`);
  requireCondition(description.length <= 520, `${record.country}/${record.itemKey} description is too long.`);
  requireCondition(!PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(description)), `${record.country}/${record.itemKey} description contains placeholder or internal seed language.`);
}

async function assertArtworkDelivery(record, runtimeReady) {
  if (!runtimeReady) {
    requireCondition(record.runtimeImagePath === null, `${record.country}/${record.itemKey} must not claim a runtime path before binary export.`);
    requireCondition(record.assetStatus === 'generated-awaiting-repository-export', `${record.country}/${record.itemKey} has an invalid pre-export status.`);
    return;
  }

  const expectedPath = expectedRuntimeImagePath(record);
  requireCondition(record.runtimeImagePath === expectedPath, `${record.country}/${record.itemKey} runtime path must be ${expectedPath}.`);
  requireCondition(record.assetStatus === 'repository-owned', `${record.country}/${record.itemKey} must be marked repository-owned.`);
  requireCondition(/^[a-f0-9]{64}$/.test(String(record.sha256 ?? '')), `${record.country}/${record.itemKey} must carry a SHA-256 digest.`);
  requireCondition(Number.isInteger(record.bytes) && record.bytes > 0, `${record.country}/${record.itemKey} must carry a positive byte size.`);
  requireCondition(record.width === 1024 && record.height === 1024, `${record.country}/${record.itemKey} must be a 1024x1024 runtime asset.`);
  const assetPath = path.join(REPO_ROOT, record.runtimeImagePath);
  requireCondition(await exists(assetPath), `${record.runtimeImagePath} is missing from the repository.`);
  requireCondition(await sha256File(assetPath) === record.sha256, `${record.runtimeImagePath} digest does not match the artwork manifest.`);
  requireCondition((await readFile(assetPath)).byteLength === record.bytes, `${record.runtimeImagePath} byte size does not match the artwork manifest.`);
}

async function rebuildIntegrityManifest(pack) {
  const files = await walkFiles(PACK_ROOT, (file) => path.basename(file) !== 'integrity-manifest-v1.json');
  const entries = [];
  for (const filePath of files) {
    entries.push({
      path: path.relative(PACK_ROOT, filePath).replaceAll(path.sep, '/'),
      sha256: await sha256File(filePath),
      bytes: (await readFile(filePath)).byteLength,
    });
  }
  entries.sort((left, right) => left.path.localeCompare(right.path));
  const packEntry = entries.find((entry) => entry.path === 'pack-v1.json');
  const manifest = {
    schemaVersion: 'econovaria-beta-integrity-manifest-v1',
    packId: pack.packId,
    version: pack.version,
    status: 'approved-for-isolated-staging',
    productionAuthorized: false,
    activationAuthorized: false,
    hashAlgorithm: 'sha256',
    fileCount: entries.length,
    packSha256: packEntry?.sha256 ?? null,
    files: entries,
    manifestContentSha256: sha256(canonicalJson(entries)),
  };
  await writeJson(path.join(PACK_ROOT, 'integrity-manifest-v1.json'), manifest);
  return manifest;
}

export async function applyStoreContentOverrides() {
  const [contentSource, artworkSource, store, pack, mappings] = await Promise.all([
    readJson(CONTENT_SOURCE_PATH),
    readJson(ARTWORK_SOURCE_PATH),
    readJson(path.join(PACK_ROOT, 'store-catalog-v1.json')),
    readJson(path.join(PACK_ROOT, 'pack-v1.json')),
    readJson(path.join(PACK_ROOT, 'stable-id-map-v1.json')),
  ]);

  requireCondition(contentSource.count === 50 && contentSource.records?.length === 50, 'Store content source must contain exactly 50 records.');
  requireCondition(artworkSource.recordCount === 50 && artworkSource.records?.length === 50, 'Store artwork source must contain exactly 50 records.');
  requireCondition(store.itemCount === 50 && store.items?.length === 50, 'Generated Store catalog must contain exactly 50 records.');
  const runtimeReady = artworkSource.runtimeDelivery?.runtimeImagePathsAvailable === true;
  requireCondition(artworkSource.runtimeDelivery?.binaryFilesCommitted === runtimeReady, 'Store artwork binary and runtime readiness flags must agree.');

  const contentByKey = new Map();
  for (const record of contentSource.records) {
    assertPlayerFacingDescription(record);
    const key = recordKey(record.country, record.itemKey);
    requireCondition(!contentByKey.has(key), `Duplicate Store content record ${key}.`);
    contentByKey.set(key, record);
  }

  const artworkByKey = new Map();
  const creationIdentifiers = new Set();
  for (const record of artworkSource.records) {
    const key = recordKey(record.country, record.itemKey);
    requireCondition(!artworkByKey.has(key), `Duplicate Store artwork record ${key}.`);
    requireCondition(record.provider === 'Magnific', `${key} has an unexpected artwork provider.`);
    requireCondition(/^[A-Za-z0-9_-]{6,64}$/.test(String(record.creationIdentifier ?? '')), `${key} has an invalid Magnific creation identifier.`);
    requireCondition(!creationIdentifiers.has(record.creationIdentifier), `${key} reuses another item's artwork creation.`);
    requireCondition(record.sourcePageUrl === `https://www.magnific.com/app/creation/${record.creationIdentifier}`, `${key} has inconsistent artwork provenance.`);
    await assertArtworkDelivery(record, runtimeReady);
    creationIdentifiers.add(record.creationIdentifier);
    artworkByKey.set(key, record);
  }

  const usedContent = new Set();
  const usedArtwork = new Set();
  const enrichedItems = store.items.map((item) => {
    const itemKey = sourceItemKey(item.sourceItemStableId);
    requireCondition(itemKey, `${item.stableId} has an invalid source item stable ID.`);
    const key = recordKey(item.country, itemKey);
    const content = contentByKey.get(key);
    const artwork = artworkByKey.get(key);
    requireCondition(content, `${item.stableId} has no authored Store description.`);
    requireCondition(artwork, `${item.stableId} has no individual artwork record.`);
    requireCondition(content.name === item.name, `${item.stableId} content name does not match the selected catalog item.`);
    requireCondition(artwork.sourceItemStableId === item.sourceItemStableId, `${item.stableId} artwork source identity does not match.`);
    usedContent.add(key);
    usedArtwork.add(key);
    return {
      ...item,
      description: content.description,
      contentRevision: 'store-content-v2',
      artwork: {
        stableId: artwork.stableId,
        provider: artwork.provider,
        creationIdentifier: artwork.creationIdentifier,
        sourcePageUrl: artwork.sourcePageUrl,
        runtimeImagePath: artwork.runtimeImagePath,
        assetStatus: artwork.assetStatus,
        sha256: artwork.sha256 ?? null,
        bytes: artwork.bytes ?? null,
        width: artwork.width ?? null,
        height: artwork.height ?? null,
        aspectRatio: artworkSource.artDirection.aspectRatio,
        resolution: artworkSource.artDirection.resolution,
        theme: artworkSource.artDirection.theme,
      },
    };
  });

  requireCondition(usedContent.size === 50 && usedArtwork.size === 50, 'Every authored Store content and artwork record must be consumed exactly once.');
  requireCondition(enrichedItems.every((item) => !PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(item.description))), 'Generated Store catalog still contains placeholder descriptions.');
  requireCondition(new Set(enrichedItems.map((item) => item.artwork.creationIdentifier)).size === 50, 'Generated Store artwork must remain one-to-one.');

  const enrichedStore = {
    ...store,
    contentRevision: 'store-content-v2',
    descriptionPolicy: 'player-facing-authored-copy-no-internal-seed-language',
    artworkPolicy: 'one-individual-square-Magnific-creation-per-Store-item',
    artworkRuntimeReady: runtimeReady,
    items: enrichedItems,
  };

  const generatedArtwork = {
    schemaVersion: 'econovaria-beta-store-artwork-v2',
    packId: pack.packId,
    version: pack.version,
    status: 'approved-for-isolated-staging',
    productionAuthorized: false,
    activationAuthorized: false,
    contentRevision: 'store-content-v2',
    recordCount: enrichedItems.length,
    provider: artworkSource.provider,
    artDirection: artworkSource.artDirection,
    runtimeDelivery: artworkSource.runtimeDelivery,
    records: enrichedItems.map((item) => ({
      stableId: item.artwork.stableId,
      storeStableId: item.stableId,
      storeItemKey: item.itemKey,
      sourceItemStableId: item.sourceItemStableId,
      country: item.country,
      provider: item.artwork.provider,
      creationIdentifier: item.artwork.creationIdentifier,
      sourcePageUrl: item.artwork.sourcePageUrl,
      runtimeImagePath: item.artwork.runtimeImagePath,
      assetStatus: item.artwork.assetStatus,
      sha256: item.artwork.sha256,
      bytes: item.artwork.bytes,
      width: item.artwork.width,
      height: item.artwork.height,
    })),
  };

  const artworkByStoreStableId = new Map(generatedArtwork.records.map((entry) => [entry.storeStableId, entry]));
  const updatedMappings = {
    ...mappings,
    contentRevision: 'store-content-v2',
    mappings: {
      ...mappings.mappings,
      storeItems: (mappings.mappings?.storeItems ?? []).map((entry) => {
        const artwork = artworkByStoreStableId.get(entry.stableId);
        requireCondition(artwork, `${entry.stableId} has no artwork mapping.`);
        return {
          ...entry,
          artworkStableId: artwork.stableId,
          artworkRuntimeImagePath: artwork.runtimeImagePath,
          artworkSha256: artwork.sha256,
        };
      }),
    },
  };

  pack.domainFiles.storeArtwork = 'store-artwork-v2.json';
  pack.boundedCounts.storeItemArtwork = 50;
  pack.contentRevision = 'store-content-v2';
  pack.contentQuality = {
    storeDescriptionsAuthored: 50,
    placeholderStoreDescriptions: 0,
    individualStoreArtworkRecords: 50,
    repositoryOwnedStoreArtwork: runtimeReady ? 50 : 0,
    duplicateArtworkAssignments: 0,
    runtimeImagePathsAvailable: runtimeReady,
  };

  await writeJson(path.join(PACK_ROOT, 'store-catalog-v1.json'), enrichedStore);
  await writeJson(path.join(PACK_ROOT, 'store-artwork-v2.json'), generatedArtwork);
  await writeJson(path.join(PACK_ROOT, 'stable-id-map-v1.json'), updatedMappings);
  await writeJson(path.join(PACK_ROOT, 'pack-v1.json'), pack);
  const integrity = await rebuildIntegrityManifest(pack);

  return {
    packId: pack.packId,
    version: pack.version,
    descriptionsApplied: enrichedItems.length,
    artworkRecordsApplied: generatedArtwork.recordCount,
    runtimeImagePathsAvailable: generatedArtwork.runtimeDelivery.runtimeImagePathsAvailable,
    integrityFiles: integrity.fileCount,
  };
}

async function main() {
  const result = await applyStoreContentOverrides();
  console.log(JSON.stringify({ result: 'STORE_CONTENT_APPLIED', ...result }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}

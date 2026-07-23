#!/usr/bin/env node

import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COUNTRY_IDS, readJson } from './seed-beta-pack-lib.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(SCRIPT_DIR);
const SEED_ROOT = path.join(REPO_ROOT, 'docs', 'seed-content');
const CONTENT_PATH = path.join(SEED_ROOT, 'items', 'store-content-overrides-v2.json');
const ARTWORK_PATH = path.join(SEED_ROOT, 'items', 'store-artwork-source-v2.json');
const PLACEHOLDER_PATTERNS = [
  /bounded beta/i,
  /stable source/i,
  /placeholder/i,
  /lorem ipsum/i,
  /\btbd\b/i,
  /\btodo\b/i,
  /replace[- ]?me/i,
];

function key(record) {
  return `${record.country}|${record.itemKey}`;
}

async function sources() {
  return Promise.all([readJson(CONTENT_PATH), readJson(ARTWORK_PATH)]);
}

test('Store content source contains 50 substantive player-facing descriptions', async () => {
  const [content] = await sources();
  assert.equal(content.count, 50);
  assert.equal(content.records.length, 50);
  assert.equal(new Set(content.records.map(key)).size, 50);
  for (const record of content.records) {
    assert.ok(COUNTRY_IDS.includes(record.country));
    assert.ok(record.description.length >= 80 && record.description.length <= 520, `${key(record)} description length is invalid`);
    assert.equal(PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(record.description)), false, `${key(record)} contains placeholder language`);
    assert.ok(record.visualDescription.length >= 25, `${key(record)} lacks a visual brief`);
  }
});

test('Store artwork source assigns one completed individual creation to every item', async () => {
  const [, artwork] = await sources();
  assert.equal(artwork.provider, 'Magnific');
  assert.equal(artwork.recordCount, 50);
  assert.equal(artwork.records.length, 50);
  assert.match(artwork.artDirection.theme, /cyberpunk/i);
  assert.equal(artwork.artDirection.aspectRatio, '1:1');
  assert.equal(artwork.runtimeDelivery.binaryFilesCommitted, false);
  assert.equal(artwork.runtimeDelivery.runtimeImagePathsAvailable, false);
  assert.equal(new Set(artwork.records.map(key)).size, 50);
  assert.equal(new Set(artwork.records.map((record) => record.stableId)).size, 50);
  assert.equal(new Set(artwork.records.map((record) => record.creationIdentifier)).size, 50);
  for (const record of artwork.records) {
    assert.ok(COUNTRY_IDS.includes(record.country));
    assert.match(record.creationIdentifier, /^[A-Za-z0-9_-]{6,64}$/);
    assert.equal(record.sourcePageUrl, `https://www.magnific.com/app/creation/${record.creationIdentifier}`);
    assert.equal(record.runtimeImagePath, null);
    assert.equal(record.assetStatus, 'generated-awaiting-repository-export');
  }
});

test('Store descriptions and artwork sources have exact one-to-one country/item coverage', async () => {
  const [content, artwork] = await sources();
  const contentKeys = content.records.map(key).sort();
  const artworkKeys = artwork.records.map(key).sort();
  assert.deepEqual(artworkKeys, contentKeys);
  for (const country of COUNTRY_IDS) {
    assert.equal(content.records.filter((record) => record.country === country).length, 5, `${country} must have five Store descriptions`);
    assert.equal(artwork.records.filter((record) => record.country === country).length, 5, `${country} must have five Store artwork records`);
  }
});

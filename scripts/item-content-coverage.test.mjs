#!/usr/bin/env node

import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson } from './seed-beta-pack-lib.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(SCRIPT_DIR);
const SEED_ROOT = path.join(REPO_ROOT, 'docs', 'seed-content');
const CATALOG_ROOT = path.join(SEED_ROOT, 'items', 'catalog');
const CATALOG_FILES = [
  ['materials', 'materials-v1.json'],
  ['components', 'components-v1.json'],
  ['equipment', 'equipment-v1.json'],
  ['consumables', 'consumables-v1.json'],
  ['blueprints-authorizations', 'blueprints-authorizations-v1.json'],
];
const PLACEHOLDER_PATTERNS = [
  /bounded beta/i,
  /stable source/i,
  /placeholder/i,
  /lorem ipsum/i,
  /\btbd\b/i,
  /\btodo\b/i,
  /\breplace[- ]?me\b/i,
];

function key(record) {
  return String(record.itemKey).toLowerCase();
}

async function loadCatalogRecords() {
  const records = [];
  for (const [category, filename] of CATALOG_FILES) {
    const document = await readJson(path.join(CATALOG_ROOT, filename));
    assert.equal(document.count, document.records.length, `${filename} count does not match its records`);
    for (const record of document.records) records.push({ ...record, category });
  }
  return records;
}

async function loadContentRecords() {
  const [store, expansion] = await Promise.all([
    readJson(path.join(SEED_ROOT, 'items', 'store-content-overrides-v2.json')),
    readJson(path.join(SEED_ROOT, 'items', 'item-content-expansion-v2.json')),
  ]);
  assert.equal(store.count, store.records.length);
  assert.equal(expansion.count, expansion.records.length);
  return { store: store.records, expansion: expansion.records, all: [...store.records, ...expansion.records] };
}

test('authored item content covers all 144 physical-economy identities exactly once', async () => {
  const catalog = await loadCatalogRecords();
  const content = await loadContentRecords();
  assert.equal(catalog.length, 144);
  assert.equal(content.store.length, 50);
  assert.equal(content.expansion.length, 94);
  assert.equal(content.all.length, 144);
  assert.equal(new Set(catalog.map(key)).size, 144, 'Catalog item keys must be unique');
  assert.equal(new Set(content.all.map(key)).size, 144, 'Authored content item keys must be unique');
  assert.deepEqual(content.all.map(key).sort(), catalog.map(key).sort());
});

test('authored item names and country sources match the mechanical catalog', async () => {
  const catalog = await loadCatalogRecords();
  const content = await loadContentRecords();
  const catalogByKey = new Map(catalog.map((record) => [key(record), record]));
  for (const record of content.all) {
    const definition = catalogByKey.get(key(record));
    assert.ok(definition, `${record.itemKey} is not a catalog identity`);
    assert.equal(record.name, definition.name, `${record.itemKey} name drifted`);
    if (record.source) assert.equal(record.source, definition.source, `${record.itemKey} source drifted`);
    if (record.category) assert.equal(record.category, definition.category, `${record.itemKey} category drifted`);
  }
});

test('all 144 items have substantive descriptions and visual briefs', async () => {
  const content = await loadContentRecords();
  for (const record of content.all) {
    const description = String(record.description ?? '').trim();
    const visualDescription = String(record.visualDescription ?? '').trim();
    assert.ok(description.length >= 80 && description.length <= 520, `${record.itemKey} description length is invalid`);
    assert.equal(PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(description)), false, `${record.itemKey} contains placeholder language`);
    assert.ok(visualDescription.length >= 25 && visualDescription.length <= 260, `${record.itemKey} visual brief length is invalid`);
  }
});

test('the 94-record expansion matches the remaining category totals', async () => {
  const { expansion } = await loadContentRecords();
  const counts = Object.fromEntries(CATALOG_FILES.map(([category]) => [category, expansion.filter((record) => record.category === category).length]));
  assert.deepEqual(counts, {
    materials: 1,
    components: 22,
    equipment: 30,
    consumables: 24,
    'blueprints-authorizations': 17,
  });
});

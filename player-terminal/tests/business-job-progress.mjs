import assert from 'node:assert/strict';
import test from 'node:test';
import { renderBusinessManufacturingProgress } from '../src/pages/business-production-controls.js';
import { renderBusinessWorkspacePage } from '../src/pages/business-workspace-page.js';
import { previewData } from '../src/data/preview-data.js';

for (const [status, title, field] of [
  ['queued', 'Waiting to start', 'queuedAt'], ['in_progress', 'Production in progress', 'completesAt'],
  ['completed', 'Production completed', 'completedAt'], ['cancelled', 'Production cancelled', 'cancelledAt'],
  ['failed', 'Production needs attention', 'failedAt'],
]) {
  test(`Business ${status} job explains recorded lifecycle without submitting commands`, () => {
    const job = Object.freeze({ status, [field]: '2020-01-02T03:04:05Z', completedOutputQuantity: 7, failureCode: '<private-error>' });
    const html = renderBusinessManufacturingProgress(job);
    assert.ok(html.includes(title));
    assert.ok(html.includes('datetime="2020-01-02T03:04:05.000Z"'));
    assert.doesNotMatch(html, /<form|data-endpoint|private-error/);
    if (status === 'completed') {
      assert.match(html, /Recorded completed output: 7 units/);
      assert.match(html, /data-business-workspace-link="stockroom"/);
      assert.match(html, /not current available stock or sales revenue/);
    } else assert.doesNotMatch(html, /Recorded completed output|Review Stockroom/);
    if (status === 'in_progress') assert.match(html, /not a completion receipt/);
  });
}

test('Business completion preserves genuine zero without inventing unavailable output', () => {
  for (const value of [0, '0', ' 0 ']) assert.match(renderBusinessManufacturingProgress({ status: 'completed', completedOutputQuantity: value }), /output: 0 units/);
  for (const value of [undefined, null, '', ' ', false, [], [2], -1, 1.5, Infinity]) {
    assert.match(renderBusinessManufacturingProgress({ status: 'completed', completedOutputQuantity: value }), /output: Unavailable units/);
  }
});

test('Business job timing is optional and cannot inject markup', () => {
  assert.match(renderBusinessManufacturingProgress({ status: 'queued', queuedAt: '2026-11-18T01:02:03.123Z' }), /2026-11-18 01:02:03.123 UTC/);
  for (const value of [null, undefined, '', 'invalid', '<img src=x onerror=alert(1)>']) {
    const html = renderBusinessManufacturingProgress({ status: 'queued', queuedAt: value });
    assert.match(html, /Queued at: Not reported/);
    assert.doesNotMatch(html, /<time|<img|onerror/);
  }
  for (const status of ['unknown', '<script>', 'toString', '__proto__', undefined]) assert.match(renderBusinessManufacturingProgress({ status }), /progress unavailable/);
});

test('Business workspace wires lifecycle disclosure without changing server cancel eligibility', () => {
  const data = structuredClone(previewData);
  data.business.configured = true;
  data.business.manufacturingJobs = [
    { jobKey: 'job-a', status: 'completed', quantity: 10, completedOutputQuantity: 6, canCancel: false },
    { jobKey: 'job-b', status: 'in_progress', quantity: 5, canCancel: true },
  ];
  const html = renderBusinessWorkspacePage(data);
  assert.match(html, /Recorded completed output: 6 units/);
  assert.match(html, /id="business-workspace-stockroom"/);
  assert.equal((html.match(/data-player-form="business-manufacturing-cancel"/g) || []).length, 1);
  assert.match(html, /data-business-job-progress="in_progress"/);
});

test('Business verification keeps progress and existing production command recovery coverage registered', async () => {
  const { readFile } = await import('node:fs/promises');
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(manifest.scripts.verify, /npm run business-workspace-boundary/);
  assert.match(manifest.scripts['business-workspace-boundary'], /node tests\/business-production-loop\.mjs/);
  assert.match(manifest.scripts['business-workspace-boundary'], /node --test tests\/business-job-progress\.mjs/);
});

test('queued browser read fixture satisfies actual normalization before rendering', async () => {
  const { readFile } = await import('node:fs/promises');
  const { normalizeApiResponse } = await import('../src/api/response-normalizer.js');
  const source = await readFile(new URL('./browser/player-business-production-loop.spec.mjs', import.meta.url), 'utf8');
  const scenario = source.slice(source.indexOf("test('manufacturing progress shows"));
  const fixture = scenario.match(/models\.business\.manufacturingJobs = (\[[\s\S]*?\]);/)[1];
  const keys = { business: `biz_${'a'.repeat(32)}`, product: `bpr_${'d'.repeat(32)}` };
  // Bind the exact browser fixture value without executing source text.
  const outputLiteral = fixture.match(/completedOutputQuantity: (null|[0-9]+),/)[1];
  const jobs = [{ jobKey: `mfg_${'f'.repeat(32)}`, businessKey: keys.business, productKey: keys.product,
    status: 'queued', quantity: 10, completedOutputQuantity: JSON.parse(outputLiteral), canCancel: false }];
  const business = structuredClone(previewData.business);
  business.configured = true;
  business.company.id = keys.business;
  business.manufacturingJobs = jobs;
  const normalized = normalizeApiResponse('business', business);
  assert.equal(normalized.manufacturingJobs[0].completedOutputQuantity, 0);
  const data = structuredClone(previewData);
  data.business = normalized;
  const html = renderBusinessWorkspacePage(data);
  assert.match(html, /data-business-job-progress="queued"/);
  assert.match(html, /Waiting to start/);
  assert.doesNotMatch(html, /Recorded completed output:/);
  business.manufacturingJobs[0].completedOutputQuantity = null;
  assert.throws(() => normalizeApiResponse('business', business), { code: 'INVALID_RESPONSE' });
});

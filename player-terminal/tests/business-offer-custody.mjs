import assert from 'node:assert/strict';
import test from 'node:test';
import { renderBusinessOfferCustody } from '../src/pages/business-production-controls.js';
import { renderBusinessWorkspacePage } from '../src/pages/business-workspace-page.js';
import { previewData } from '../src/data/preview-data.js';

for (const [status, message] of [
  ['draft', 'Draft only'], ['active', 'Published offer'], ['paused', 'Paused offer'], ['withdrawal_pending', 'Withdrawal pending'],
]) {
  test(`Business ${status} offer explains custody without submitting commands`, () => {
    const offer = Object.freeze({ status, quantityOwned: 10, quantityReserved: 3, quantityAvailable: 7 });
    const html = renderBusinessOfferCustody(offer);
    assert.ok(html.includes(message));
    assert.match(html, /OWNED IN LISTING<\/dt><dd>10/);
    assert.match(html, /RESERVED IN LISTING<\/dt><dd>3/);
    assert.match(html, /AVAILABLE IN LISTING<\/dt><dd>7/);
    assert.match(html, /Reserved units are not currently available/);
    assert.doesNotMatch(html, /<form|data-endpoint|data-player-form/);
    if (status === 'withdrawal_pending') assert.match(html, /scheduled time is not confirmation/);
  });
}

test('Business zero available does not claim sold-out or returned inventory', () => {
  for (const offer of [
    { status: 'active', quantityOwned: 8, quantityReserved: 8, quantityAvailable: 0 },
    { status: 'active', quantityOwned: 0, quantityReserved: 0, quantityAvailable: 0 },
    { status: 'withdrawal_pending', quantityOwned: 8, quantityReserved: 8, quantityAvailable: 0 },
  ]) {
    const html = renderBusinessOfferCustody(offer);
    assert.match(html, /This does not prove they were sold/);
    assert.doesNotMatch(html, /Sold out|returned to Stockroom|sale completed/);
  }
});

test('Business offer missing quantities are unavailable, not zero', () => {
  for (const value of [undefined, null, '', ' ', true, false, [], [1], -1, 1.5, Infinity, NaN]) {
    const html = renderBusinessOfferCustody({ status: 'draft', quantityOwned: value, quantityReserved: value, quantityAvailable: value });
    assert.equal((html.match(/<dd>Unavailable<\/dd>/g) || []).length, 3);
    assert.doesNotMatch(html, /No listing units|Reserved units are not/);
  }
  for (const value of [0, '0', ' 0 ']) assert.match(renderBusinessOfferCustody({ status: 'draft', quantityAvailable: value }), /AVAILABLE IN LISTING<\/dt><dd>0/);
});

test('Business unknown offer lifecycle does not invent withdrawn or sold states', () => {
  for (const status of ['withdrawn', 'sold', '__proto__', 'toString', '<img src=x>', null]) {
    const html = renderBusinessOfferCustody({ status });
    assert.match(html, /Offer lifecycle unavailable/);
    assert.doesNotMatch(html, /<img|Published offer|Withdrawal pending/);
  }
});

test('Business workspace displays custody without changing pending withdrawal controls', () => {
  const data = structuredClone(previewData);
  data.business.configured = true;
  data.business.salesOffers = [{ offerKey: 'sof_test', itemKey: 'itm_test', status: 'withdrawal_pending', quantityOwned: 8, quantityReserved: 8, quantityAvailable: 0,
    unitPrice: 10, currencyCode: 'ECO', version: 2, purchaseAllowed: false,
    withdrawal: { mode: 'full', effectiveAt: '2020-01-01T00:00:00Z', lastBlockReason: 'inventory_reserved' } }];
  const html = renderBusinessWorkspacePage(data);
  assert.match(html, /data-business-offer-custody/);
  assert.match(html, /RESERVED IN LISTING<\/dt><dd>8/);
  assert.match(html, /Processing due/);
  assert.doesNotMatch(html, /data-business-withdrawal-controls="sof_test"|data-business-offer-stock-controls="sof_test"/);
});

test('Business custody coverage remains in the Player aggregate', async () => {
  const { readFile } = await import('node:fs/promises');
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(manifest.scripts.verify, /npm run business-workspace-boundary/);
  assert.match(manifest.scripts['business-workspace-boundary'], /node --test tests\/business-offer-custody\.mjs/);
});

test('Business reserved-only stock removes reduction even when withdrawal is enabled', () => {
  const data = structuredClone(previewData);
  data.business.configured = true;
  data.capabilities = { actions: { storePurchase: true }, endpointKeys: { businessStorePurchase: true } };
  const offer = { offerKey: 'sof_test', itemKey: 'itm_test', status: 'active', quantityOwned: 8, quantityReserved: 3, quantityAvailable: 5,
    unitPrice: 10, currencyCode: 'ECO', version: 1, purchaseAllowed: true, withdrawal: null };
  data.business.salesOffers = [offer];
  const before = renderBusinessWorkspacePage(data);
  assert.match(before, /data-player-form="business-store-withdrawal-reduce"/);
  Object.assign(offer, { quantityReserved: 8, quantityAvailable: 0, version: 2 });
  const after = renderBusinessWorkspacePage(data);
  assert.doesNotMatch(after, /data-player-form="business-store-withdrawal-reduce"/);
  assert.match(after, /data-player-form="business-store-withdrawal-full"/);
  assert.match(after, /This does not prove they were sold/);
});

 test('actual workspace retains production output and listing custody together without automatic commands', () => {
  const data = structuredClone(previewData);
  data.business.configured = true;
  data.business.manufacturingJobs = [{ jobKey: 'job-complete', status: 'completed', quantity: 10, completedOutputQuantity: 6, canCancel: false }];
  data.business.salesOffers = [{ offerKey: 'sof_combined', itemKey: 'itm_combined', status: 'active', quantityOwned: 6, quantityReserved: 6, quantityAvailable: 0, unitPrice: 10, currencyCode: 'ECO', version: 1, purchaseAllowed: true }];
  const html = renderBusinessWorkspacePage(data);
  assert.match(html, /Recorded completed output: 6 units/);
  assert.match(html, /data-business-workspace-link="stockroom"/);
  assert.match(html, /RESERVED IN LISTING<\/dt><dd>6/);
  assert.match(html, /This does not prove they were sold/);
  assert.doesNotMatch(html, /data-player-form="business-manufacturing-cancel"/);
});

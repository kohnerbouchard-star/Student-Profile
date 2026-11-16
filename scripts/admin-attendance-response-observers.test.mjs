import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { setTimeout as delay } from 'node:timers/promises';
const source = await readFile(new URL('../admin/classroom-write-fallback.js', import.meta.url), 'utf8');
function harness(fetch = async () => Response.json({ reward: { amount: 5 } })) {
  const events = [];
  const window = { EconovariaRuntimeConfig: {}, location: { origin: 'https://example.test', href: 'https://example.test/admin/' }, fetch,
    document: { dispatchEvent(event) { events.push(event.detail); } }, CustomEvent: class { constructor(_, options) { this.detail = options.detail; } } };
  vm.runInNewContext(source, { window, Request, Response, Headers, URL, URLSearchParams, FormData, console });
  return { window, events, observe: window.EconovariaClassroomWriteFallback.observeAttendanceResponses };
}
const scan = '/api/admin/games/game-one/attendance/scan';
const post = { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' };
test('observers receive successful attendance clones without consuming caller response', async () => {
  const h = harness(); const seen = [];
  h.observe(() => payload => { payload.reward.amount = 99; });
  h.observe(() => payload => seen.push(payload.reward.amount));
  const response = await h.window.fetch(scan, post);
  assert.equal((await response.json()).reward.amount, 5);
  await delay(20); assert.deepEqual(seen, [5]);
  assert.deepEqual(h.events.map(e => e.phase), ['started', 'committed']);
});
test('unrelated, external, read and failed requests do not notify', async () => {
  for (const [url, init, status] of [[scan, {}, 200], ['/api/admin/games/g/players', post, 200], ['https://other.test'+scan, post, 200], [scan, post, 400]]) {
    const h = harness(async () => Response.json({}, { status })); let notified = 0;
    h.observe(() => () => notified++); await h.window.fetch(url, init); await delay(10); assert.equal(notified, 0);
  }
});
test('presentation errors cannot turn a successful write into a failure', async () => {
  const h = harness(); let notified = false;
  h.observe(() => { throw Error('capture failed'); });
  h.observe(() => () => { throw Error('render failed'); });
  h.observe(() => () => { notified = true; });
  assert.equal((await h.window.fetch(scan, post)).status, 200); await delay(20);
  assert.equal(notified, true); assert.equal(h.events.at(-1).phase, 'committed');
});
test('network failure retains rejection and lifecycle without notification', async () => {
  const h = harness(async () => { throw Error('offline'); }); let notified = false;
  h.observe(() => () => notified = true);
  await assert.rejects(h.window.fetch(scan, post), /offline/); assert.equal(notified, false); assert.equal(h.events.at(-1).phase, 'failed');
});
test('captures separate request state before repeated requests and unsubscribes future requests', async () => {
  const pending = []; const h = harness(() => new Promise(resolve => pending.push(resolve))); const seen = []; let current = 'one';
  const unsubscribe = h.observe(() => { const captured = current; return () => seen.push(captured); });
  const first = h.window.fetch(scan, post); current = 'two'; const second = h.window.fetch(scan, post);
  while (pending.length < 2) await delay(1);
  pending[1](Response.json({})); await second; pending[0](Response.json({})); await first;
  await delay(20); assert.deepEqual(seen, ['two', 'one']);
  unsubscribe(); const third = h.window.fetch(scan, post); while (pending.length < 3) await delay(1); pending[2](Response.json({})); await third; await delay(10); assert.equal(seen.length, 2);
});
test('malformed success response preserves caller and lifecycle', async () => {
  const h = harness(async () => new Response('not json')); let notified = false; h.observe(() => () => notified = true);
  const response = await h.window.fetch(scan, post); assert.equal(await response.text(), 'not json'); await delay(10); assert.equal(notified, false); assert.equal(h.events.at(-1).phase, 'committed');
});
test('scanner presentation modules do not install global transport wrappers', async () => {
  for (const path of ['scanner-auto-refresh.js', 'scanner-reward-localization.js']) {
    const text = await readFile(new URL('../admin/'+path, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /window\.fetch\s*=/); assert.match(text, /observeAttendanceResponses/);
  }
});
function presentationHarness() {
  const captures = []; const timers = []; const nodes = new Map();
  class Element {}
  const document = { body: {}, querySelector: selector => nodes.get(selector) || null, addEventListener() {} };
  const window = { document, EconovariaClassroomWriteFallback: { observeAttendanceResponses(fn) { captures.push(fn); } }, setTimeout(fn) { timers.push(fn); }, requestAnimationFrame() {} };
  const context = vm.createContext({ window, document, Element, HTMLElement: Element, HTMLInputElement: Element, HTMLButtonElement: Element, MutationObserver: class { observe() {} }, Intl, Date, getComputedStyle: () => ({ display: 'none' }) });
  return { captures, timers, nodes, context, flush() { while (timers.length) timers.shift()(); } };
}
function displayNode() { return { textContent: '', dataset: {}, isConnected: true, classList: { add() {}, remove() {} }, setAttribute() {} }; }
test('reward subscriber preserves currency and ignores navigation before delayed rendering', async () => {
  const h = presentationHarness(); const key = '[data-admin-terminal-last-scan-reward]'; const old = displayNode(); h.nodes.set(key, old);
  vm.runInContext(await readFile(new URL('../admin/scanner-reward-localization.js', import.meta.url), 'utf8'), h.context);
  const receive = h.captures[0](); receive({ reward: { amount: 4, currencyCode: 'KRW', ledgerEntryId: 'entry' } }); h.flush(); assert.equal(old.textContent, '+4.00 KRW');
  const stale = h.captures[0](); stale({ reward: { amount: 9 } }); const replacement = displayNode(); h.nodes.set(key, replacement); h.flush(); assert.equal(replacement.textContent, '');
});
test('identity subscriber captures fallback and ignores replaced scanner console', async () => {
  const h = presentationHarness(); const player = displayNode(); const id = displayNode(); const time = displayNode();
  const selectors = new Map([['[data-admin-terminal-last-scan-player]', player], ['[data-admin-terminal-last-scan-player-id]', id], ['[data-admin-terminal-last-scan-time]', time], ['[data-admin-terminal-auto-scan-input]', { value: 'CARD-1' }]]);
  const consoleNode = { dataset: {}, querySelector: selector => selectors.get(selector) || null };
  h.nodes.set('[data-admin-terminal-scanner-console]', consoleNode);
  vm.runInContext(await readFile(new URL('../admin/scanner-auto-refresh.js', import.meta.url), 'utf8'), h.context);
  h.captures[0]()({ player: { displayName: 'Sample Player' } }); h.flush(); assert.equal(player.textContent, 'Sample Player'); assert.equal(id.textContent, 'Player ID: CARD-1');
  const stale = h.captures[0](); stale({ player: { displayName: 'Wrong page' } }); h.nodes.set('[data-admin-terminal-scanner-console]', { dataset: {}, querySelector: consoleNode.querySelector }); h.flush(); assert.equal(player.textContent, 'Sample Player');
});
test('real create-action wrapper passes attendance synchronously before UI navigation', async () => {
  let release; const h = harness(() => new Promise(resolve => { release = resolve; }));
  let view = 'console A'; const seen = [];
  h.observe(() => { const initial = view; return () => seen.push(initial); });
  vm.runInNewContext(await readFile(new URL('../admin/create-action-adapter.js', import.meta.url), 'utf8'), { window: h.window, Request, Response, Headers, URL, URLSearchParams, FormData });
  const pending = h.window.fetch(scan, post); view = 'console B';
  while (!release) await delay(1); release(Response.json({})); await pending; await delay(20);
  assert.deepEqual(seen, ['console A']);
});

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// Synthetic local responses exercise real browser Fetch/Request/Response and DOM.
// This is not connected database or production acceptance.
const markup = `<section data-admin-terminal-scanner-console>
  <span data-admin-terminal-scanner-state>Ready</span>
  <span data-admin-terminal-last-scan-player>Original</span>
  <small data-admin-terminal-last-scan-player-id></small>
  <time data-admin-terminal-last-scan-time></time>
  <span data-admin-terminal-last-scan-reward>Original reward</span>
  <input data-admin-terminal-auto-scan-input value="CARD-1">
</section>`;
const server = createServer(async (request, response) => {
  if (request.url === '/') {
    response.setHeader('Content-Type', 'text/html');
    response.end(`<!doctype html><html><body>${markup}</body></html>`);
    return;
  }
  response.writeHead(404).end();
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.ADMIN_SCANNER_BROWSER_EXECUTABLE || undefined });
  for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    const requests = [];
    let result = { status: 200, body: { player: { displayName: 'Sample Player' }, reward: { amount: 4, currencyCode: 'KRW', ledgerEntryId: 'demo' } }, delay: 0 };
    await page.route('**/api/**', async route => {
      requests.push({ url: route.request().url(), body: route.request().postData(), method: route.request().method() });
      const response = { ...result };
      if (response.delay) await new Promise(resolve => setTimeout(resolve, response.delay));
      await route.fulfill({ status: response.status, contentType: 'application/json', body: typeof response.body === 'string' ? response.body : JSON.stringify(response.body) }).catch(() => {});
    });
    await page.goto(base);
    await page.evaluate(() => { window.EconovariaRuntimeConfig = {}; window.lifecycle = []; document.addEventListener('econovaria:admin-request-lifecycle', event => window.lifecycle.push(event.detail.phase)); });
    for (const path of ['classroom-write-fallback.js', 'create-action-adapter.js', 'player-access-code-bridge.js']) {
      await page.addScriptTag({ content: await readFile(new URL('../admin/'+path, import.meta.url), 'utf8') });
    }
    await page.evaluate(() => { window.beforeScannerFetch = window.fetch; });
    for (const path of ['scanner-auto-refresh.js', 'scanner-reward-localization.js']) {
      await page.addScriptTag({ content: await readFile(new URL('../admin/'+path, import.meta.url), 'utf8') });
    }
    assert.equal(await page.evaluate(() => window.fetch === window.beforeScannerFetch), true);
    const scan = async (options = {}) => page.evaluate(async ({ options }) => {
      const response = await fetch('/api/admin/games/demo/attendance/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'submit-attendance-scan', playerId: 'CARD-1' }), ...options });
      return { status: response.status, text: await response.text() };
    }, { options });
    const response = await scan();
    assert.equal(response.status, 200); assert.equal(JSON.parse(response.text).player.displayName, 'Sample Player');
    await page.waitForFunction(() => document.querySelector('[data-admin-terminal-last-scan-player]').textContent === 'Sample Player');
    assert.equal(await page.locator('[data-admin-terminal-last-scan-player-id]').textContent(), 'Player ID: CARD-1');
    await page.waitForFunction(() => document.querySelector('[data-admin-terminal-last-scan-reward]').textContent === '+4.00 KRW');
    assert.equal(requests.length, 1);
    assert.equal(JSON.parse(requests[0].body).playerId, 'CARD-1');
    // Repeated requests stay separate and preserve duplicate-ledger presentation.
    result.body = { player: { displayName: 'Second' }, attendance: { wasCreated: false }, reward: { amount: 0 } };
    await scan(); await page.waitForFunction(() => document.querySelector('[data-admin-terminal-last-scan-reward]').textContent === 'Already recorded');
    assert.equal(requests.length, 2);
    // Close/reopen synchronously after initiating a request through the real wrapper chain.
    result.body = { player: { displayName: 'Stale' }, reward: { amount: 99 } }; result.delay = 150;
    await page.evaluate(markup => {
      window.pendingScan = fetch('/api/admin/games/demo/attendance/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(response => response.json());
      document.querySelector('[data-admin-terminal-scanner-console]').outerHTML = markup;
    }, markup);
    await page.evaluate(() => window.pendingScan); await page.waitForTimeout(30);
    assert.equal(await page.locator('[data-admin-terminal-last-scan-player]').textContent(), 'Original');
    assert.equal(await page.locator('[data-admin-terminal-last-scan-reward]').textContent(), 'Original reward');
    result.delay = 0; result.status = 400;
    assert.equal((await scan()).status, 400); await page.waitForTimeout(30);
    assert.equal(await page.locator('[data-admin-terminal-last-scan-player]').textContent(), 'Original');
    result.status = 200; result.body = 'not json';
    assert.equal((await scan()).text, 'not json'); await page.waitForTimeout(30);
    assert.equal(await page.locator('[data-admin-terminal-last-scan-reward]').textContent(), 'Original reward');
    // Abort still rejects as AbortError and never changes presentation.
    result.delay = 150; result.body = { player: { displayName: 'Aborted' } };
    const error = await page.evaluate(async () => { const controller = new AbortController(); const request = fetch('/api/admin/games/demo/attendance/scan', { method: 'POST', body: '{}', signal: controller.signal }); controller.abort(); try { await request; return 'unexpected-success'; } catch (error) { return error.name; } });
    assert.equal(error, 'AbortError'); await page.waitForTimeout(180);
    assert.equal(await page.locator('[data-admin-terminal-last-scan-player]').textContent(), 'Original');
    await page.close();
  }
  console.log('Admin scanner response observers: desktop/mobile real browser success, repeat, UI replacement, failure, malformed response and abort contracts passed.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}

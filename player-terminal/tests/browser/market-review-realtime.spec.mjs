import { test, expect } from '@playwright/test';

async function mountReviewFixture(page) {
  await page.route('**/market-refresh-fixture', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><div id="playerTerminal"></div>',
  }));
  await page.goto('/market-refresh-fixture#market');
  await page.evaluate(async () => {
    const [{ createPlayerTerminal }, { installMarketOrderFlow }, { PlayerApi },
      { installPlayerInvalidationController }, fixture] = await Promise.all([
      import('/src/app.js'), import('/src/features/market/market-order-flow.js'),
      import('/src/api/player-api.js'), import('/src/realtime/player-invalidation-controller.js'),
      import('/tests/fixtures/business-market-fixture.mjs'),
    ]);
    const data = fixture.businessMarketData(), actions = [];
    let reads = 0, delivered = 0, hold = false, release;
    PlayerApi.prototype.bootstrap = async function () {
      return this.freshness.track(structuredClone(data), this.freshness.capture([]));
    };
    PlayerApi.prototype.loadRoute = async function () {
      return this.freshness.track({ data: structuredClone(data), errors: {} }, this.freshness.capture(['market']));
    };
    PlayerApi.prototype.loadResources = async function (keys) {
      if (keys.length !== 1 || keys[0] !== 'market') throw new Error('Unexpected refresh resource');
      const ticket = this.freshness.capture(keys);
      reads += 1;
      if (hold) { hold = false; await new Promise(resolve => { release = resolve; }); }
      delivered += 1;
      return this.freshness.track({ data: { market: structuredClone(data.market) }, errors: {} }, ticket);
    };
    const mount = document.getElementById('playerTerminal');
    const terminal = createPlayerTerminal({ mount, config: {
      usePreviewData: true, environment: 'development', capabilities: data.capabilities,
    } });
    await new Promise(resolve => setTimeout(resolve, 0));
    const config = {
      usePreviewData: false, authenticated: true, csrfToken: 'a'.repeat(43),
      publishableKey: 'sb_publishable_market_fixture', deviceId: '00000000-0000-4000-8000-000000000001',
      requestTimeoutMs: 1000, writeCooldownMs: 0,
      apiCall: async context => {
        if (context.endpointKey === 'marketAsset') return { ok: true, asset: fixture.listedBusiness(), tickIndex: 1, history: [] };
        if (context.payload?.action !== 'create_buy_quote') throw new Error('Unexpected trade mutation');
        actions.push(context.payload.action);
        return fixture.tradeResponse(context.payload.action, context.payload.quantity || 1);
      },
    };
    const flow = installMarketOrderFlow({ mount, terminal, config });
    const controller = installPlayerInvalidationController({
      mount, terminal, config, debounceMs: 5, checkIntervalMs: 60000,
    });
    globalThis.marketRefreshProbe = {
      terminal, flow, controller, actions, reads: () => reads, delivered: () => delivered,
      hold: () => { hold = true; }, release: () => release?.(),
    };
  });
}

for (const side of ['buy-quote', 'sell-review']) {
  for (const inFlight of [false, true]) {
    test(`${side} retains its DOM and focus through ${inFlight ? 'an in-flight' : 'a deferred'} realtime refresh`, async ({ page }) => {
      await mountReviewFixture(page);
      if (inFlight) {
        await page.evaluate(() => { marketRefreshProbe.hold(); marketRefreshProbe.controller.refreshNow(['market']); });
        await expect.poll(() => page.evaluate(() => marketRefreshProbe.reads())).toBe(1);
      }
      await page.locator(`form[data-player-market-order-form="${side}"] button[type="submit"]`).click();
      const dialog = page.locator('[data-player-market-order-dialog]');
      const confirm = dialog.locator('[data-player-market-order-confirm]');
      await expect(dialog).toBeVisible();
      await confirm.focus();
      await page.evaluate(() => {
        marketRefreshProbe.dialog = document.querySelector('[data-player-market-order-dialog]');
        marketRefreshProbe.before = marketRefreshProbe.terminal.getState().data.market;
        if (marketRefreshProbe.reads()) marketRefreshProbe.release();
        else marketRefreshProbe.controller.refreshNow(['market']);
      });
      if (inFlight) await expect.poll(() => page.evaluate(() => marketRefreshProbe.delivered())).toBe(1);
      await page.waitForTimeout(120);
      await expect(confirm).toBeFocused();
      await expect(dialog).toHaveCount(1);
      expect(await page.evaluate(() => ({
        sameDialog: marketRefreshProbe.dialog === document.querySelector('[data-player-market-order-dialog]'),
        sameData: marketRefreshProbe.before === marketRefreshProbe.terminal.getState().data.market,
        modal: marketRefreshProbe.terminal.getState().modal,
        pending: marketRefreshProbe.terminal.freshness.isPending('market'),
        reads: marketRefreshProbe.reads(), actions: marketRefreshProbe.actions,
      }))).toEqual({ sameDialog: true, sameData: true, modal: null, pending: true,
        reads: inFlight ? 1 : 0, actions: side === 'buy-quote' ? ['create_buy_quote'] : [] });
      await dialog.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => ({
        reads: marketRefreshProbe.reads(), pending: marketRefreshProbe.terminal.freshness.isPending('market'),
        changed: marketRefreshProbe.before !== marketRefreshProbe.terminal.getState().data.market,
      }))).toEqual({ reads: inFlight ? 2 : 1, pending: false, changed: true });
      await page.evaluate(() => { marketRefreshProbe.controller.destroy(); marketRefreshProbe.flow.destroy(); });
    });
  }
}

import { test, expect } from '@playwright/test';

async function render(page, holdings, state = 'ready') {
  await page.route('**/portfolio-disclosure-fixture', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><div id="portfolio"></div>',
  }));
  await page.goto('/portfolio-disclosure-fixture');
  await page.evaluate(async ({ holdings, state }) => {
    const { renderPortfolioPositions } = await import('/src/features/market/portfolio-positions-view.js');
    document.querySelector('#portfolio').innerHTML = renderPortfolioPositions({
      portfolio: { holdings }, resourceStatus: { portfolio: { state } },
    });
  }, { holdings, state });
}

test('zero basis is unavailable while a genuine zero return is preserved', async ({ page }) => {
  const base = { quantity: 2, averageCost: 100, marketValue: 200, unrealizedPnl: 0, currencyCode: 'ECO' };
  await render(page, [{ ...base, ticker: 'ZERO', costBasis: 0 }, { ...base, ticker: 'FLAT', costBasis: 200 }]);
  await expect(page.getByRole('button', { name: 'Open ZERO market details' })).toContainText('Return unavailable');
  await expect(page.getByRole('button', { name: 'Open FLAT market details' })).toContainText('+0.00%');
  await expect(page.getByRole('button', { name: 'Refresh portfolio' })).toBeEnabled();
});

test('unavailable empty positions never claim there are no active holdings', async ({ page }) => {
  await render(page, [], 'unavailable');
  await expect(page.getByText('Positions unavailable', { exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('could not be refreshed');
  await expect(page.getByText('No active positions', { exact: true })).toHaveCount(0);
  await render(page, []);
  await expect(page.getByText('No active positions', { exact: true })).toBeVisible();
});

import { test, expect } from '@playwright/test';

test('reviewed response remains readable without write controls at narrow widths', async ({ page }) => {
  await page.route('**/contract-history-fixture', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/css/player-terminal-interior-v2.css"><main id="fixture"></main>' }));
  await page.goto('/contract-history-fixture');
  await page.evaluate(async () => {
    const { renderContractsPage } = await import('/src/pages/contracts-page.js');
    const { normalizePlayerContracts } = await import('/src/features/contracts/contract-read-model.js');
    const contracts = normalizePlayerContracts({ contracts: [{ contractKey: 'recorded', title: 'Reviewed mission' }], progress: [{ contractKey: 'recorded', status: 'completed', evidencePayload: { note: 'Recorded explanation', submissionUrl: `https://example.test/${'x'.repeat(1000)}` }, resultPayload: { feedback: 'Reviewed feedback' } }] });
    document.querySelector('#fixture').innerHTML = renderContractsPage({ contracts, session: { currencyCode: 'ECO' } }, {});
  });
  const recorded = page.getByRole('region', { name: 'Recorded submission' });
  await expect(recorded).toContainText('Recorded explanation');
  await expect(recorded).toContainText('Reviewed feedback');
  await expect(page.locator('[data-player-form="contract-submit"], [data-player-contract-accept]')).toHaveCount(0);
  for (const width of [320, 393, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await recorded.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  }
});

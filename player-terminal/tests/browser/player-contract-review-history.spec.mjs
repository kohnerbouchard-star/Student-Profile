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

test('empty contract status stays selected after click, keyboard and refresh', async ({ page }) => {
  await page.route('**/contract-tab-fixture', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><main id="fixture"></main>' }));
  await page.goto('/contract-tab-fixture');
  await page.evaluate(async () => {
    const { renderContractsPage } = await import('/src/pages/contracts-page.js');
    const { normalizePlayerContracts } = await import('/src/features/contracts/contract-read-model.js');
    const { createPlayerTerminalActions } = await import('/src/core/player-terminal-actions.js');
    const data = { contracts: normalizePlayerContracts({ contracts: [{ contractKey: 'active', title: 'Active mission' }], progress: [{ contractKey: 'active', status: 'accepted' }] }), session: { currencyCode: 'ECO' } };
    const ui = { contractTab: 'Active', contractId: 'active' };
    const mount = document.querySelector('#fixture');
    const render = () => { mount.innerHTML = renderContractsPage(data, ui); };
    const actions = createPlayerTerminalActions({ store: { getState: () => ({ ui, data }) }, mount, config: {}, lifecycle: {}, updateUi: patch => { Object.assign(ui, patch); render(); }, rememberFocus: () => {}, restoreFocus: () => {}, focusElement: () => {} });
    mount.addEventListener('click', actions.handleClick);
    window.refreshContractFixture = render;
    render();
  });
  for (const status of ['Completed', 'Submitted', 'Available']) {
    const button = page.locator(`[data-player-contract-tab="${status}"]`);
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.player-terminal-inline-empty')).toContainText('No contracts in this state.');
    await expect(page.locator('.player-terminal-contract-detail')).toHaveCount(0);
    await page.evaluate(() => window.refreshContractFixture());
    await expect(button).toHaveAttribute('aria-pressed', 'true');
  }
  const active = page.locator('[data-player-contract-tab="Active"]');
  await active.focus();
  await page.keyboard.press('Enter');
  await expect(active).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.player-terminal-contract-detail')).toContainText('Active mission');
});

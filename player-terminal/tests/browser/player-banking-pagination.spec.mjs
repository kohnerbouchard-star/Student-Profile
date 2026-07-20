import { expect, test } from "@playwright/test";

async function mountBankingFixture(page) {
  await page.goto("/#banking");
  await expect(page.locator("#player-main-content .player-terminal-page")).toBeVisible();
  await expect(page.locator(".player-terminal-route-skeleton")).toHaveCount(0);
  await page.evaluate(async () => {
    const { renderBankingPage } = await import("/src/pages/banking-page.js");
    const current = globalThis.Econovaria.playerTerminal.getState().data;
    const data = structuredClone(current);
    data.session.currencyCode = "ECO";
    data.banking = {
      ...data.banking,
      checking: {
        accountId: "CASH",
        balance: 1250,
        available: 1250,
        pending: 0,
        currencyCode: "ECO",
      },
      savings: {
        configured: false,
        accountId: "NOT CONFIGURED",
        balance: null,
        available: null,
        interestRate: null,
        interestEarned: null,
        currencyCode: "",
      },
      balances: [
        { accountType: "cash", balance: 1250, currencyCode: "ECO" },
        { accountType: "cash", balance: 40, currencyCode: "LUM" },
      ],
      stale: false,
      pagination: {
        cursor: null,
        nextCursor: "offset_2",
        hasMore: true,
        limit: 2,
      },
      transactions: [
        {
          id: "ledger_1",
          description: "Contract reward",
          date: "Jul 19, 1:00 PM",
          category: "contracts",
          amount: 25,
          status: "Posted",
          accountType: "cash",
          currencyCode: "ECO",
        },
        {
          id: "ledger_2",
          description: "Currency adjustment",
          date: "Jul 19, 1:01 PM",
          category: "economy",
          amount: -4,
          status: "Posted",
          accountType: "cash",
          currencyCode: "LUM",
        },
      ],
    };
    document.querySelector("#playerBankingBrowserFixture")?.remove();
    const fixture = document.createElement("div");
    fixture.id = "playerBankingBrowserFixture";
    fixture.className = "player-terminal-overview player-terminal-page-host";
    fixture.setAttribute("data-testid", "banking-browser-fixture");
    fixture.innerHTML = renderBankingPage(data);
    document.body.append(fixture);
  });
  return page.getByTestId("banking-browser-fixture");
}

test("Banking renders every balance currency and a usable continuation control", async ({ page }) => {
  const fixture = await mountBankingFixture(page);
  await expect(fixture.locator('[data-player-banking-balance="cash:ECO"]')).toContainText("ECO 1,250");
  await expect(fixture.locator('[data-player-banking-balance="cash:LUM"]')).toContainText("LUM 40");
  await expect(fixture.getByText("+ECO 25")).toBeVisible();
  await expect(fixture.getByText("LUM -4")).toBeVisible();
  const loadMore = fixture.locator("[data-player-banking-load-more]");
  await expect(loadMore).toBeVisible();
  await expect(loadMore).toBeEnabled();
  await loadMore.focus();
  await expect(loadMore).toBeFocused();
  const overflow = await page.evaluate(() => Math.max(
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
    document.body.scrollWidth - document.body.clientWidth,
  ));
  expect(overflow).toBeLessThanOrEqual(1);
});

import { expect, test } from "@playwright/test";

for (const route of ["news", "loans"]) test(`${route} opens cold with its related data`, async ({ page }) => {
  await page.goto("/src/api/resource-plan.js");
  const calls = await page.evaluate(async (route) => {
    const { PlayerApi } = await import("/src/api/player-api.js");
    const { previewData } = await import("/src/data/preview-data.js");
    const { renderNewsPage } = await import("/src/pages/news-page.js");
    const { renderLoansPage } = await import("/src/pages/loans-page.js");
    const calls = [];
    const api = new PlayerApi({ usePreviewData: false, authenticated: true, apiCall: async ({ endpointKey }) => {
      calls.push(endpointKey);
      const model = structuredClone(previewData[endpointKey]);
      if (endpointKey === "business") { model.configured = true; model.company.id = "biz_fixture"; }
      if (endpointKey === "loans") model.offers[0].borrowerType = "business";
      return model;
    }});
    const result = await api.loadRoute(route);
    const data = { ...previewData, ...result.data };
    document.body.innerHTML = route === "news" ? renderNewsPage(data, {}) : renderLoansPage(data, {});
    if (route === "news") {
      data.news.categories.push("Empty");
      document.body.innerHTML = renderNewsPage(data, {});
      document.body.addEventListener("click", (event) => {
        const category = event.target.closest("[data-player-news-category]")?.dataset.playerNewsCategory;
        if (category) document.body.innerHTML = renderNewsPage(data, { newsCategory: category });
      });
    }
    return calls;
  }, route);
  if (route === "news") {
    expect(calls).toEqual(expect.arrayContaining(["news", "countries", "market"]));
    await page.locator('[data-player-news-category="Empty"]').click();
    await expect(page.getByText("No stories in this category", { exact: true })).toBeVisible();
    await expect(page.locator(".player-terminal-news-detail h3")).toHaveCount(0);
    await page.locator('[data-player-news-category="All"]').click();
    await expect(page.locator(".player-terminal-news-detail h3")).toHaveCount(1);
    await page.locator('[data-player-news-category="Empty"]').click();
    await expect(page.locator(".player-terminal-news-analysis")).toHaveCount(0);
  } else {
    expect(calls).toEqual(expect.arrayContaining(["loans", "banking", "business"]));
    await page.getByText("Apply for this offer", { exact: true }).click();
    await expect(page.locator('input[name="businessKey"]')).toHaveValue("biz_fixture");
    await expect(page.getByRole("button", { name: "Submit application" })).toBeEnabled();
  }
});

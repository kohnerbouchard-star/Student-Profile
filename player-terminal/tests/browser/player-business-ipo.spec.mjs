import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const index = await readFile(new URL("../../index.html", import.meta.url), "utf8").catch(() => "");
// Reuse shipped styles and real components/PlayerApi; only the authenticated
// response fixture is substituted. Database/economic execution has its own gate.
async function mount(page, options = {}) {
  const source = index || await readFile(new URL("../../../index.html", import.meta.url), "utf8");
  const links = (source.match(/<link[^>]+rel="stylesheet"[^>]*>/gu) || []).join("\n").replaceAll('href="./', 'href="/');
  await page.route("**/ipo-test", route => route.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">${links}</head><body><div id="playerTerminal" class="player-terminal"><main id="ipo-mount" class="player-terminal-main"></main></div></body></html>` }));
  await page.goto("/ipo-test");
  await page.evaluate(async options => {
    const [{ renderBusinessIpoPanel }, { installBusinessIpoFlow }, { ipoFixture, ipoReceipt }, { resolvePlayerBackendRequest }, { ApiRequestError }] = await Promise.all([
      import("/src/features/business-ipo/business-ipo-panel.js"), import("/src/features/business-ipo/business-ipo-flow.js"), import("/tests/fixtures/business-ipo-fixture.mjs"), import("/src/api/backend-routes.js"), import("/src/api/errors.js"),
    ]);
    const fixture = ipoFixture(); if (!options.issuer) fixture.ownBusiness = null;
    if (options.issuer) fixture.offers = [];
    const endpointKeys = Object.fromEntries(["businessIpos", "businessIpoPropose", "businessIpoVote", "businessIpoSubscribe"].map(key => [key, true]));
    const state = { route: options.issuer ? "business" : "market", data: { businessIpos: options.unavailable ? null : fixture, business: { configured: Boolean(options.issuer) }, resourceStatus: { businessIpos: { state: options.stale ? "stale" : options.unavailable ? "unavailable" : "ready" } }, capabilities: { routes: { business: true, market: true }, endpointKeys, actions: { businessIpoPropose: true, businessIpoVote: true, businessIpoSubscribe: true } } } };
    const host = document.getElementById("ipo-mount"); const render = () => { host.innerHTML = renderBusinessIpoPanel(state.data, { issuer: Boolean(options.issuer) }); };
    const calls = []; let attempts = 0; const toasts = [];
    const config = { usePreviewData: false, authenticated: true, csrfToken: "a".repeat(43), publishableKey: "sb_publishable_ipo_browser_fixture", deviceId: "00000000-0000-4000-8000-000000000001", requestTimeoutMs: 1000, writeCooldownMs: 0,
      apiCall: async context => {
        const request = resolvePlayerBackendRequest({ ...context, payload: { ...context.payload, idempotencyKey: context.idempotencyKey } }); calls.push({ request, key: context.idempotencyKey }); attempts++;
        if (options.uncertain && attempts === 1) throw new ApiRequestError("Fixture timeout", { code: "REQUEST_TIMEOUT" });
        if (context.endpointKey === "businessIpoPropose") {
          const offer = { ...ipoFixture().offers[0], status: "open", canVote: true, canSubscribe: false, approvalBasisPoints: 0 };
          state.data.businessIpos.ownBusiness.canPropose = false; state.data.businessIpos.offers = [offer];
          return { ok: true, schemaVersion: 1, operation: "propose", replayed: false, refreshRequired: true, offer };
        }
        if (context.endpointKey === "businessIpoVote") {
          const offer = state.data.businessIpos.offers[0]; Object.assign(offer, { status: "approved", vote: context.payload.decision, canVote: false, canSubscribe: true, approvalBasisPoints: 10000 });
          return { ok: true, schemaVersion: 1, operation: "vote", replayed: false, refreshRequired: true, offer };
        }
        return ipoReceipt(context.payload.shares);
      } };
    const terminal = { getState: () => state, requestRender: render, showToast: message => toasts.push(message), refreshResources: async () => { if (options.refreshFailure) throw new Error("Fixture read unavailable"); return { errors: {} }; } };
    render(); const flow = installBusinessIpoFlow({ mount: host, terminal, config });
    globalThis.ipoTest = { calls, state, render, flow, toasts };
  }, options);
}
test("issuer reviews exact terms, submits proposal and records a vote by keyboard", async ({ page }) => {
  await mount(page, { issuer: true });
  await page.getByText("Propose a fixed-price IPO", { exact: true }).click();
  await page.locator('[name="unitPrice"]').fill("2.50"); await page.locator('[name="offeredShares"]').fill("20");
  await expect(page.locator("[data-ipo-cost]")).toContainText("NRC 50.00"); await expect(page.locator("[data-ipo-cost]")).toContainText("0.19%");
  await page.getByRole("button", { name: "Submit terms for a vote" }).focus(); await page.keyboard.press("Enter");
  await expect(page.locator("[data-business-ipo-outcome]")).toContainText("submitted for shareholder approval");
  await page.getByRole("button", { name: "Record vote" }).focus(); await page.keyboard.press("Enter");
  await expect(page.locator("[data-business-ipo-outcome]")).toContainText("Your vote was recorded");
  expect(await page.evaluate(() => ipoTest.calls.map(x => x.request.path))).toEqual(["/players/me/business/ipos/proposals", `/players/me/business/ipos/bgp_${"a".repeat(32)}/votes`]);
});
test("subscription recovers an uncertain response and retains committed success after refresh failure", async ({ page }) => {
  await mount(page, { uncertain: true, refreshFailure: true });
  await page.getByText("Subscribe to new shares", { exact: true }).click();
  await page.locator('[name="shares"]').fill("8"); await expect(page.locator("[data-ipo-cost]")).toContainText("NRC 20.00");
  await page.getByRole("button", { name: "Confirm subscription" }).click(); await expect(page.locator("[data-business-ipo-error]")).toContainText("uncertain");
  await page.getByRole("button", { name: "Confirm subscription" }).click(); await expect(page.locator("[data-business-ipo-outcome]")).toContainText("8 shares issued for NRC 20.00");
  await expect(page.locator("[data-business-ipo-outcome]")).toContainText("Committed successfully");
  const calls = await page.evaluate(() => ipoTest.calls); expect(calls).toHaveLength(2); expect(calls[0].key).toBe(calls[1].key);
  expect(calls[0].request.payload).toEqual({ idempotencyKey: calls[0].key, shares: "8" });
  await expect(page.locator("body")).not.toContainText(/00000000-0000-4000/);
});
test("stale and unavailable offerings fail closed and remain readable at compact widths", async ({ page }) => {
  await mount(page, { stale: true }); await page.getByText("Subscribe to new shares", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Confirm subscription" })).toBeDisabled();
  await expect(page.locator("[data-business-ipo-panel]")).toContainText("1,000.123456789123456789");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await mount(page, { unavailable: true }); await expect(page.locator("[data-business-ipo-panel]")).toContainText("Offering data is unavailable");
  await expect(page.locator('button[type="submit"]')).toHaveCount(0);
});

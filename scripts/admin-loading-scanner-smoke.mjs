import { BASE_URL, createQualityHarness } from "./admin-quality-smoke-fixture.mjs";

const h = await createQualityHarness("loading-scanner");
const { page, state, errors, capture, finish } = h;
const fail = (message) => { throw new Error(message); };

try {
  await page.goto(BASE_URL, { waitUntil: "commit", timeout: 30000 });
  await page.waitForSelector("#adminSessionGate .admin-session-skeleton", { timeout: 5000 });
  if (await page.locator("#adminSessionGate .admin-session-skeleton").count() !== 1) fail("Verification skeleton is missing.");
  await page.waitForSelector("#adminPreview:not([hidden])", { timeout: 15000 });
  await page.waitForTimeout(60);
  if (await page.locator(".admin-qol-page-skeleton:not([hidden])").count() !== 1) fail("Initial page skeleton is missing.");
  await page.locator(".admin-qol-page-skeleton").waitFor({ state: "hidden", timeout: 5000 });

  await page.locator('[data-admin-terminal-action="scan-attendance"]').first().click();
  await page.waitForSelector("[data-admin-terminal-scanner-console]", { timeout: 5000 });
  const scanner = page.locator("[data-admin-terminal-scanner-console]");
  await page.locator('[data-admin-terminal-set-mode="manual"]').click();
  const input = scanner.locator("[data-admin-terminal-manual-scan-input]");
  const button = scanner.locator('[data-admin-terminal-action="submit-attendance-scan"]');

  await button.click();
  await page.waitForTimeout(120);
  if (await input.getAttribute("aria-invalid") !== "true") fail("Blank scan was not marked invalid.");
  if (!/error/i.test(await scanner.locator("[data-admin-terminal-scanner-state]").innerText())) fail("Blank scan did not show an error state.");

  await input.fill("QUALITY-01");
  await button.click();
  await page.waitForTimeout(90);
  if (!/scanning/i.test(await scanner.locator("[data-admin-terminal-scanner-state]").innerText())) fail("Scanner did not show Scanning.");
  await capture("processing");
  await page.waitForTimeout(900);
  if (!/completed/i.test(await scanner.locator("[data-admin-terminal-scanner-state]").innerText())) fail("Scanner did not show Completed.");
  await capture("completed");

  state.failScan = true;
  await input.fill("UNKNOWN");
  await button.click();
  await page.waitForTimeout(900);
  if (!/error/i.test(await scanner.locator("[data-admin-terminal-scanner-state]").innerText())) fail("Failed scan did not show Error.");
  if (!(await scanner.innerText()).includes("Player code was not found")) fail("Scanner did not surface the backend error.");
  await capture("error");
  if (errors.length) fail(errors[0]);
  await finish({ passed: true });
  console.log("Verification skeleton and scanner lifecycle passed.");
} catch (error) {
  await capture("failure").catch(() => {});
  await finish({ passed: false, failure: error.stack || error.message || String(error) });
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
}

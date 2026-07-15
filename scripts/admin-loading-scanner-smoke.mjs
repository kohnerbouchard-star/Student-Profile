import { BASE_URL, createQualityHarness } from "./admin-quality-smoke-fixture.mjs";

const h = await createQualityHarness("loading-scanner");
const { page, state, errors, capture, finish } = h;
const fail = (message) => { throw new Error(message); };

async function waitForScannerState(expected) {
  await page.waitForFunction((value) => {
    const state = document.querySelector("[data-admin-terminal-scanner-state]")?.textContent || "";
    return state.trim().toLowerCase() === String(value).toLowerCase();
  }, expected, { timeout: 5000 });
}

try {
  await page.goto(BASE_URL, { waitUntil: "commit", timeout: 30000 });
  await page.waitForSelector("#adminSessionGate .admin-session-skeleton", { timeout: 5000 });
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
  await waitForScannerState("Error");
  if (await input.getAttribute("aria-invalid") !== "true") fail("Blank scan was not marked invalid.");

  await input.fill("QUALITY-01");
  await button.click();
  await waitForScannerState("Scanning");
  await capture("processing");
  await waitForScannerState("Completed");
  await capture("completed");
  await page.waitForFunction(() => {
    const button = document.querySelector('[data-admin-terminal-action="submit-attendance-scan"]');
    return button instanceof HTMLButtonElement && !button.disabled && button.getAttribute("aria-disabled") !== "true";
  }, null, { timeout: 5000 });

  state.failScan = true;
  await input.fill("UNKNOWN");
  await button.click();
  await waitForScannerState("Error");
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

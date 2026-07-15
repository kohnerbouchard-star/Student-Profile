import { BASE_URL, createQualityHarness } from "./admin-quality-smoke-fixture.mjs";

const h = await createQualityHarness("loading-scanner");
const { page, state, errors, capture, finish } = h;
const fail = (message) => { throw new Error(message); };
const buttonPresentations = [];
const timing = {};

async function waitForScannerState(expected, timeout = 5000) {
  await page.waitForFunction((value) => {
    const state = document.querySelector("[data-admin-terminal-scanner-state]")?.textContent || "";
    return state.trim().toLowerCase() === String(value).toLowerCase();
  }, expected, { timeout });
}

async function assertScannerButtonFits(button, expectedLabel) {
  const presentation = await button.evaluate((control) => {
    const status = control.querySelector(":scope > .admin-qol-button-status");
    const buttonRect = control.getBoundingClientRect();
    const statusRect = status?.getBoundingClientRect();
    return {
      width: buttonRect.width,
      statusText: status?.textContent?.trim() || "",
      statusClientWidth: status?.clientWidth || 0,
      statusScrollWidth: status?.scrollWidth || 0,
      contained: Boolean(statusRect && statusRect.left >= buttonRect.left - 1 && statusRect.right <= buttonRect.right + 1),
    };
  });
  buttonPresentations.push({ expectedLabel, ...presentation });
  if (presentation.width < 110) fail(`Scanner action button is too narrow: ${JSON.stringify(presentation)}.`);
  if (presentation.statusText !== expectedLabel) fail(`Scanner action label drifted: ${JSON.stringify(presentation)}.`);
  if (presentation.statusScrollWidth > presentation.statusClientWidth + 1 || !presentation.contained) {
    fail(`Scanner action label is clipped: ${JSON.stringify(presentation)}.`);
  }
}

async function waitForRapidRearm(input, button, startedAt, key) {
  await page.waitForFunction(() => {
    const input = document.querySelector("[data-admin-terminal-manual-scan-input]");
    const button = document.querySelector('[data-admin-terminal-action="submit-attendance-scan"]');
    return input instanceof HTMLInputElement && button instanceof HTMLButtonElement &&
      input.value === "" && document.activeElement === input &&
      !button.disabled && button.getAttribute("aria-disabled") !== "true";
  }, null, { timeout: 1200 });
  timing[key] = Date.now() - startedAt;
  if (timing[key] > 850) fail(`Scanner rearm was too slow: ${key}=${timing[key]}ms.`);
}

async function assertReadyScanner(scanner, input) {
  await waitForScannerState("Ready", 3500);
  const copy = await scanner.innerText();
  if (!copy.includes("Scan a player code. The result appears here.")) fail("Ready guidance was not restored.");
  if (!copy.includes("Listening") || !copy.includes("Auto-submit is active.")) fail("Listening state was not restored.");
  if (await input.inputValue() !== "") fail("Scanner input was not cleared on refresh.");
  if (await scanner.locator("[data-admin-terminal-last-scan-result]").isVisible()) fail("Prior scan result remained visible after refresh.");
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
  await assertReadyScanner(scanner, input);

  await input.fill("QUALITY-01");
  const submittedAt = Date.now();
  await button.click();
  await waitForScannerState("Scanning");
  timing.scanningDisplayedMs = Date.now() - submittedAt;
  if (timing.scanningDisplayedMs > 300) fail(`Scanning state appeared too slowly: ${timing.scanningDisplayedMs}ms.`);
  await assertScannerButtonFits(button, "Scanning…");
  await capture("processing");
  await waitForScannerState("Completed");
  const completedAt = Date.now();
  await assertScannerButtonFits(button, "Completed");
  await capture("completed");
  await waitForRapidRearm(input, button, completedAt, "successRearmMs");
  await assertReadyScanner(scanner, input);
  await capture("success-ready");

  state.failScan = true;
  await input.fill("UNKNOWN");
  await button.click();
  await waitForScannerState("Error");
  const errorAt = Date.now();
  if (!(await scanner.innerText()).includes("Player code was not found")) fail("Scanner did not surface the backend error.");
  await capture("error");
  await waitForRapidRearm(input, button, errorAt, "errorRearmMs");
  await assertReadyScanner(scanner, input);
  await capture("error-ready");

  if (errors.length) fail(errors[0]);
  await finish({ passed: true, buttonPresentations, timing });
  console.log("Verification skeleton, rapid scanner rearm, and automatic refresh passed.");
} catch (error) {
  await capture("failure").catch(() => {});
  await finish({ passed: false, failure: error.stack || error.message || String(error), buttonPresentations, timing });
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
}
import { BASE_URL, createQualityHarness } from "./admin-quality-smoke-fixture.mjs";

const h = await createQualityHarness("loading-scanner");
const { page, state, errors, capture, finish } = h;
const fail = (message) => { throw new Error(message); };
const buttonPresentations = [];
const timing = {};
let identityPresentation = null;

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

async function assertPlayerIdentityHierarchy(scanner) {
  await page.waitForFunction(() => {
    const name = document.querySelector("[data-admin-terminal-last-scan-player]")?.textContent?.trim();
    const playerId = document.querySelector("[data-admin-terminal-last-scan-player-id]")?.textContent?.trim();
    const timestamp = document.querySelector("[data-admin-terminal-last-scan-time]")?.textContent?.trim();
    return name === "Quality Player" &&
      playerId === "Player ID: QUALITY-01" &&
      timestamp === "2026-07-16 · 08:42";
  }, null, { timeout: 3000 });

  identityPresentation = await scanner.evaluate((root) => {
    const name = root.querySelector("[data-admin-terminal-last-scan-player]");
    const playerId = root.querySelector("[data-admin-terminal-last-scan-player-id]");
    const time = root.querySelector("[data-admin-terminal-last-scan-time]");
    const nameStyle = name ? getComputedStyle(name) : null;
    const idStyle = playerId ? getComputedStyle(playerId) : null;
    const timeStyle = time ? getComputedStyle(time) : null;
    return {
      name: name?.textContent?.trim() || "",
      playerId: playerId?.textContent?.trim() || "",
      time: time?.textContent?.trim() || "",
      timeDateTime: time?.getAttribute("datetime") || "",
      timeWhiteSpace: timeStyle?.whiteSpace || "",
      timeClientWidth: time?.clientWidth || 0,
      timeScrollWidth: time?.scrollWidth || 0,
      nameFontSize: Number.parseFloat(nameStyle?.fontSize || "0"),
      idFontSize: Number.parseFloat(idStyle?.fontSize || "0"),
      nameSource: name?.getAttribute("data-admin-scanner-identity-source") || "",
    };
  });

  if (identityPresentation.name !== "Quality Player") fail(`Scanner did not prioritize display name: ${JSON.stringify(identityPresentation)}.`);
  if (identityPresentation.playerId !== "Player ID: QUALITY-01") fail(`Scanner did not show the player ID beneath the name: ${JSON.stringify(identityPresentation)}.`);
  if (identityPresentation.nameFontSize < identityPresentation.idFontSize * 1.8) {
    fail(`Scanner name is not materially larger than the ID: ${JSON.stringify(identityPresentation)}.`);
  }
  if (identityPresentation.nameSource !== "attendance-response") {
    fail(`Scanner identity did not come from the attendance response: ${JSON.stringify(identityPresentation)}.`);
  }
  if (!/^\d{4}-\d{2}-\d{2} · \d{2}:\d{2}$/.test(identityPresentation.time)) {
    fail(`Scanner timestamp is not compact 24-hour format: ${JSON.stringify(identityPresentation)}.`);
  }
  if (identityPresentation.time !== "2026-07-16 · 08:42") {
    fail(`Scanner timestamp did not use the attendance timezone: ${JSON.stringify(identityPresentation)}.`);
  }
  if (identityPresentation.timeWhiteSpace !== "nowrap" ||
      identityPresentation.timeScrollWidth > identityPresentation.timeClientWidth + 1) {
    fail(`Scanner timestamp can overflow its result block: ${JSON.stringify(identityPresentation)}.`);
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
  const emptyCopy = await scanner.locator("[data-admin-terminal-last-scan-empty]").textContent() || "";
  const autoCopy = await scanner.locator("[data-admin-terminal-auto-panel]").textContent() || "";
  const manualCopy = await scanner.locator("[data-admin-terminal-manual-panel]").textContent() || "";
  if (!emptyCopy.includes("Scan a player code. The result appears here.")) fail("Ready guidance was not restored.");
  if (!autoCopy.includes("Listening") || !autoCopy.includes("Auto-submit is active.")) fail("Listening state was not restored.");
  if (!manualCopy.includes("Manual entry") || !manualCopy.includes("Fallback mode")) fail("Manual fallback state was not restored.");
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
  await assertPlayerIdentityHierarchy(scanner);
  await capture("completed");
  await waitForRapidRearm(input, button, completedAt, "successRearmMs");
  await assertReadyScanner(scanner, input);
  await capture("success-ready");

  state.failScan = true;
  await input.fill("UNKNOWN");
  await button.click();
  await waitForScannerState("Error");
  const errorAt = Date.now();
  if (!(await scanner.textContent()).includes("Player code was not found")) fail("Scanner did not surface the backend error.");
  await capture("error");
  await waitForRapidRearm(input, button, errorAt, "errorRearmMs");
  await assertReadyScanner(scanner, input);
  await capture("error-ready");

  if (errors.length) fail(errors[0]);
  await finish({ passed: true, buttonPresentations, timing, identityPresentation });
  console.log("Verification skeleton, rewarded scanner response, compact timestamp, rapid rearm, and automatic refresh passed.");
} catch (error) {
  await capture("failure").catch(() => {});
  await finish({ passed: false, failure: error.stack || error.message || String(error), buttonPresentations, timing, identityPresentation });
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
}

import { BASE_URL, createQualityHarness } from "./admin-quality-smoke-fixture.mjs";

const h = await createQualityHarness("loading-scanner");
const { page, state, errors, capture, finish } = h;
const fail = (message) => { throw new Error(message); };
const buttonPresentations = [];
const timing = {};
const geometryResults = [];
let identityPresentation = null;

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "compact", width: 1024, height: 768 },
  { name: "narrow", width: 768, height: 900 },
];
const ROUTES = [
  ["Overview", "overview"], ["Attendance", "attendance"], ["Players", "players"],
  ["Assignments", "contracts"], ["Store", "store"], ["Market", "marketplace"],
  ["Settings", "settings"], ["Logs", "logs"],
];
const ACCOUNT_ROUTES = [
  ["open-admin-profile", "account-profile"], ["open-admin-settings", "account-settings"],
  ["open-admin-notifications", "account-notifications"], ["open-admin-security", "account-security"],
  ["open-admin-help", "account-help"], ["open-admin-games", "account-games"],
];

function assertDelta(label, loaded, skeleton, tolerance) {
  const delta = Math.abs(Number(loaded || 0) - Number(skeleton || 0));
  if (delta > tolerance) fail(`${label} moved ${delta.toFixed(2)}px; tolerance is ${tolerance}px.`);
}

function assertGeometryStable(label, loaded, skeleton) {
  if (!loaded?.root || !skeleton?.root) fail(`${label} has no root geometry.`);
  const shared = Object.keys(loaded).filter((key) => skeleton[key]);
  if (!shared.length) fail(`${label} has no shared loaded/skeleton geometry.`);
  for (const key of shared) {
    const tolerance = key === "toolbar" ? 2 : 4;
    for (const dimension of ["x", "y", "width", "height", "right", "bottom"]) {
      assertDelta(`${label} ${key}.${dimension}`, loaded[key][dimension], skeleton[key][dimension], tolerance);
    }
  }
  return shared;
}

async function waitForSkeletonApi() {
  await page.waitForFunction(() => Boolean(window.EconovariaAdminShapeSkeletons), null, { timeout: 5000 });
}

async function waitForPageSkeletonHidden() {
  const overlay = page.locator(".admin-qol-page-skeleton");
  if (await overlay.count()) await overlay.waitFor({ state: "hidden", timeout: 5000 });
}

async function verifySessionSkeleton(viewport) {
  const session = await page.evaluate(({ width, height }) => {
    const shell = document.querySelector(".admin-session-skeleton__shell");
    const nav = document.querySelector(".admin-session-skeleton__nav");
    const main = document.querySelector(".admin-session-skeleton__main");
    const metrics = document.querySelectorAll(".admin-session-skeleton__metric");
    const rows = document.querySelectorAll(".admin-session-skeleton__table-row");
    const shellRect = shell?.getBoundingClientRect();
    const navRect = nav?.getBoundingClientRect();
    const mainRect = main?.getBoundingClientRect();
    return {
      width, height,
      shell: shellRect ? { width: shellRect.width, height: shellRect.height } : null,
      nav: navRect ? { width: navRect.width, height: navRect.height } : null,
      main: mainRect ? { width: mainRect.width, height: mainRect.height } : null,
      metrics: metrics.length, rows: rows.length,
      overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth,
      label: document.querySelector("#adminSessionGate")?.getAttribute("aria-label") || "",
    };
  }, viewport);
  if (!session.shell || !session.nav || !session.main) fail(`Session shell is incomplete at ${viewport.name}.`);
  if (session.metrics !== 4 || session.rows < 6) fail(`Session shell lacks expected metric/table geometry at ${viewport.name}.`);
  if (session.shell.width > viewport.width + 1 || session.overflow > 2) fail(`Session shell overflows at ${viewport.name}: ${JSON.stringify(session)}.`);
  if (session.label !== "Verifying administrator access") fail(`Session loading label drifted: ${session.label}.`);
  return session;
}

async function measureRoute(route, label) {
  const result = await page.evaluate(({ route, label }) => {
    const api = window.EconovariaAdminShapeSkeletons;
    const main = document.querySelector(".admin-terminal-shell-main");
    const focusTarget = document.querySelector('[data-admin-section][aria-current="page"], [data-admin-section].active, [data-admin-section].is-active') || document.querySelector("[data-admin-section]");
    focusTarget?.focus?.({ preventScroll: true });
    const focusBefore = document.activeElement;
    const windowScrollBefore = { x: window.scrollX, y: window.scrollY };
    const mainScrollBefore = main?.scrollTop || 0;
    const controller = api.renderPage(route, { show: true });
    const loaded = controller?.loadedGeometry || {};
    const skeleton = controller?.measureSkeleton?.() || {};
    const overlay = document.querySelector(".admin-qol-page-skeleton");
    const textShape = overlay?.querySelector(".admin-shape-skeleton-text");
    const motion = textShape ? getComputedStyle(textShape, "::after").animationName : "";
    const output = {
      route, label, loaded, skeleton, motion,
      ariaBusy: main?.getAttribute("aria-busy") || "",
      overlayLabel: overlay?.getAttribute("aria-label") || "",
      overlayRole: overlay?.getAttribute("role") || "",
      cloneAriaHidden: overlay?.querySelector("[data-admin-shape-skeleton-stage]")?.getAttribute("aria-hidden") || "",
      cloneInert: overlay?.querySelector("[data-admin-shape-skeleton-stage]")?.hasAttribute("inert") || false,
      focusPreservedWhileLoading: document.activeElement === focusBefore,
      windowScrollBefore, windowScrollDuring: { x: window.scrollX, y: window.scrollY },
      mainScrollBefore, mainScrollDuring: main?.scrollTop || 0,
      overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth,
    };
    controller?.hide?.();
    return output;
  }, { route, label });
  const shared = assertGeometryStable(label, result.loaded, result.skeleton);
  if (result.ariaBusy !== "true" || result.overlayRole !== "status" || !result.overlayLabel) fail(`${label} lacks loading semantics.`);
  if (result.cloneAriaHidden !== "true" || !result.cloneInert) fail(`${label} clone is not decorative and inert.`);
  if (!result.focusPreservedWhileLoading) fail(`${label} moved keyboard focus while loading.`);
  if (Math.abs(result.windowScrollBefore.y - result.windowScrollDuring.y) > 1 || Math.abs(result.mainScrollBefore - result.mainScrollDuring) > 1) fail(`${label} changed scroll position while loading.`);
  if (result.overflow > 2) fail(`${label} overflows horizontally by ${result.overflow}px.`);
  await waitForPageSkeletonHidden();
  const after = await page.evaluate(() => ({
    busy: document.querySelector(".admin-terminal-shell-main")?.getAttribute("aria-busy") || "",
    overlayHidden: document.querySelector(".admin-qol-page-skeleton")?.hidden === true,
  }));
  if (after.busy || !after.overlayHidden) fail(`${label} did not clear loading state.`);
  return { ...result, shared };
}

async function auditPrimaryRoutes() {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const [section, route] of ROUTES) {
      await page.locator(`[data-admin-section="${section}"]`).first().click();
      await page.waitForTimeout(900);
      await waitForPageSkeletonHidden();
      geometryResults.push({ viewport: viewport.name, ...(await measureRoute(route, `${viewport.name}:${route}`)) });
    }
  }
}

async function auditAccountRoutes() {
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const [action, route] of ACCOUNT_ROUTES) {
    await page.locator("[data-admin-terminal-user]").first().click();
    const control = page.locator(`[data-admin-terminal-action="${action}"]`).first();
    await control.waitFor({ state: "visible", timeout: 5000 });
    await control.click();
    await page.waitForTimeout(500);
    await waitForPageSkeletonHidden();
    geometryResults.push({ viewport: "desktop", ...(await measureRoute(route, `desktop:${route}`)) });
    await page.locator('[data-admin-section="Overview"]').first().click();
    await page.waitForTimeout(500);
    await waitForPageSkeletonHidden();
  }
}

async function auditReducedMotion() {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const result = await measureRoute("overview", "reduced-motion:overview");
  if (result.motion && result.motion !== "none") fail(`Reduced motion still animates the skeleton: ${result.motion}.`);
  await page.emulateMedia({ reducedMotion: "no-preference" });
}

async function auditBackgroundRefresh() {
  const result = await page.evaluate(() => {
    const api = window.EconovariaAdminShapeSkeletons;
    const overlay = document.querySelector(".admin-qol-page-skeleton");
    const active = document.activeElement;
    const scroll = { x: window.scrollX, y: window.scrollY };
    const indicator = api.beginRefresh("Refreshing current Admin data");
    const output = {
      indicatorVisible: Boolean(indicator && !indicator.hidden), state: indicator?.dataset.state || "",
      overlayHidden: overlay?.hidden === true, focusPreserved: document.activeElement === active,
      scrollPreserved: window.scrollX === scroll.x && window.scrollY === scroll.y,
    };
    api.endRefresh("Admin data updated");
    return output;
  });
  if (!result.indicatorVisible || result.state !== "refreshing") fail(`Background refresh indicator is missing: ${JSON.stringify(result)}.`);
  if (!result.overlayHidden) fail("Background refresh replaced usable content with a skeleton.");
  if (!result.focusPreserved || !result.scrollPreserved) fail("Background refresh moved focus or scroll.");
}

async function waitForScannerState(expected, timeout = 5000) {
  await page.waitForFunction((value) => {
    const scannerState = document.querySelector("[data-admin-terminal-scanner-state]")?.textContent || "";
    return scannerState.trim().toLowerCase() === String(value).toLowerCase();
  }, expected, { timeout });
}

async function assertScannerButtonFits(button, expectedLabel) {
  const presentation = await button.evaluate((control) => {
    const status = control.querySelector(":scope > .admin-qol-button-status");
    const buttonRect = control.getBoundingClientRect();
    const statusRect = status?.getBoundingClientRect();
    return {
      width: buttonRect.width, statusText: status?.textContent?.trim() || "",
      statusClientWidth: status?.clientWidth || 0, statusScrollWidth: status?.scrollWidth || 0,
      contained: Boolean(statusRect && statusRect.left >= buttonRect.left - 1 && statusRect.right <= buttonRect.right + 1),
    };
  });
  buttonPresentations.push({ expectedLabel, ...presentation });
  if (presentation.width < 110) fail(`Scanner action button is too narrow: ${JSON.stringify(presentation)}.`);
  if (presentation.statusText !== expectedLabel) fail(`Scanner action label drifted: ${JSON.stringify(presentation)}.`);
  if (presentation.statusScrollWidth > presentation.statusClientWidth + 1 || !presentation.contained) fail(`Scanner action label is clipped: ${JSON.stringify(presentation)}.`);
}

async function assertPlayerIdentityHierarchy(scanner) {
  await page.waitForFunction(() => {
    const name = document.querySelector("[data-admin-terminal-last-scan-player]")?.textContent?.trim();
    const playerId = document.querySelector("[data-admin-terminal-last-scan-player-id]")?.textContent?.trim();
    const timestamp = document.querySelector("[data-admin-terminal-last-scan-time]")?.textContent?.trim();
    return name === "Quality Player" && playerId === "Player ID: QUALITY-01" && timestamp === "2026-07-16 · 08:42";
  }, null, { timeout: 3000 });
  identityPresentation = await scanner.evaluate((root) => {
    const name = root.querySelector("[data-admin-terminal-last-scan-player]");
    const playerId = root.querySelector("[data-admin-terminal-last-scan-player-id]");
    const time = root.querySelector("[data-admin-terminal-last-scan-time]");
    const nameStyle = name ? getComputedStyle(name) : null;
    const idStyle = playerId ? getComputedStyle(playerId) : null;
    const timeStyle = time ? getComputedStyle(time) : null;
    return {
      name: name?.textContent?.trim() || "", playerId: playerId?.textContent?.trim() || "", time: time?.textContent?.trim() || "",
      timeDateTime: time?.getAttribute("datetime") || "", timeWhiteSpace: timeStyle?.whiteSpace || "",
      timeClientWidth: time?.clientWidth || 0, timeScrollWidth: time?.scrollWidth || 0,
      nameFontSize: Number.parseFloat(nameStyle?.fontSize || "0"), idFontSize: Number.parseFloat(idStyle?.fontSize || "0"),
      nameSource: name?.getAttribute("data-admin-scanner-identity-source") || "",
    };
  });
  if (identityPresentation.name !== "Quality Player" || identityPresentation.playerId !== "Player ID: QUALITY-01") fail(`Scanner identity hierarchy drifted: ${JSON.stringify(identityPresentation)}.`);
  if (identityPresentation.nameFontSize < identityPresentation.idFontSize * 1.8) fail("Scanner name is not materially larger than ID.");
  if (identityPresentation.nameSource !== "attendance-response") fail("Scanner identity source drifted.");
  if (identityPresentation.time !== "2026-07-16 · 08:42" || identityPresentation.timeWhiteSpace !== "nowrap" || identityPresentation.timeScrollWidth > identityPresentation.timeClientWidth + 1) fail("Scanner timestamp geometry drifted.");
}

async function waitForRapidRearm(input, button, startedAt, key) {
  await page.waitForFunction(() => {
    const input = document.querySelector("[data-admin-terminal-manual-scan-input]");
    const button = document.querySelector('[data-admin-terminal-action="submit-attendance-scan"]');
    return input instanceof HTMLInputElement && button instanceof HTMLButtonElement && input.value === "" && document.activeElement === input && !button.disabled && button.getAttribute("aria-disabled") !== "true";
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
  await page.waitForSelector("#adminSessionGate .admin-session-skeleton__shell", { timeout: 5000 });
  const initialSession = await verifySessionSkeleton(VIEWPORTS[0]);
  await page.waitForSelector("#adminPreview:not([hidden])", { timeout: 15000 });
  await waitForSkeletonApi();
  await waitForPageSkeletonHidden();

  await auditPrimaryRoutes();
  await auditAccountRoutes();
  await auditReducedMotion();
  await auditBackgroundRefresh();

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('[data-admin-terminal-action="scan-attendance"]').first().click();
  await page.waitForSelector("[data-admin-terminal-scanner-console]", { timeout: 5000 });
  const scanner = page.locator("[data-admin-terminal-scanner-console]");
  const scannerGeometry = await page.evaluate(() => {
    const api = window.EconovariaAdminShapeSkeletons;
    const target = document.querySelector("[data-admin-terminal-scanner-console]");
    const controller = api.renderSurface("scanner", target);
    const output = { loaded: controller.loadedGeometry, skeleton: controller.measureSkeleton(), busy: target?.getAttribute("aria-busy") || "" };
    controller.hide({ immediate: true });
    return output;
  });
  assertGeometryStable("scanner-surface", scannerGeometry.loaded, scannerGeometry.skeleton);
  if (scannerGeometry.busy !== "true") fail("Scanner surface is not marked busy while loading.");
  await page.waitForTimeout(50);

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

  state.failScan = true;
  await input.fill("UNKNOWN");
  await button.click();
  await waitForScannerState("Error");
  const errorAt = Date.now();
  if (!(await scanner.textContent()).includes("Player code was not found")) fail("Scanner did not surface the backend error.");
  await waitForRapidRearm(input, button, errorAt, "errorRearmMs");
  await assertReadyScanner(scanner, input);

  if (errors.length) fail(errors[0]);
  await finish({ passed: true, initialSession, geometryResults, buttonPresentations, timing, identityPresentation });
  console.log("Shape-accurate route, account, reduced-motion, refresh, scanner geometry, identity, and rapid-rearm checks passed.");
} catch (error) {
  await capture("failure").catch(() => {});
  await finish({ passed: false, failure: error.stack || error.message || String(error), geometryResults, buttonPresentations, timing, identityPresentation });
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
}

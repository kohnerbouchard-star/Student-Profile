import {
  BASE_URL,
  createQualityHarness,
  GAME_ID,
} from "./admin-quality-smoke-fixture.mjs";

function adminUrlForGame(gameId = GAME_ID) {
  const url = new URL(BASE_URL);
  url.searchParams.set("game", gameId);
  return url.toString();
}

const harness = await createQualityHarness("loading-scanner");
const { page, browser, errors, capture, finish } = harness;
const fail = (message) => { throw new Error(message); };
const VIEWPORTS = [
  ["desktop", 1440, 1000],
  ["compact", 1024, 768],
  ["narrow", 768, 900],
];

async function sessionGateContract(name, width, height) {
  const context = await browser.newContext({
    viewport: { width, height },
    javaScriptEnabled: false,
  });
  const staticPage = await context.newPage();
  await staticPage.goto(BASE_URL, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });

  const gate = staticPage.locator("#adminSessionGate");
  await gate.waitFor({ state: "visible", timeout: 5000 });

  const result = {
    label: await gate.getAttribute("aria-label"),
    role: await gate.getAttribute("role"),
    live: await gate.getAttribute("aria-live"),
    startupSkeletonCount: await staticPage.locator(".admin-session-skeleton").count(),
    routeSkeletonCount: await staticPage.locator(".admin-qol-page-skeleton").count(),
    cloneStageCount: await staticPage.locator("[data-admin-shape-skeleton-stage]").count(),
    shapeRuntimeScriptCount: await staticPage.locator(
      'script[src*="shape-accurate-skeleton"]',
    ).count(),
    responsiveGridStylesheetCount: await staticPage.locator(
      'link[rel="stylesheet"][href="./css/responsive-card-grid.css"]',
    ).count(),
    overflow: await staticPage.evaluate(() => Math.max(
      document.body.scrollWidth,
      document.documentElement.scrollWidth,
    ) - document.documentElement.clientWidth),
  };
  await context.close();

  if (
    result.label !== "Verifying administrator access" ||
    result.role !== "status" ||
    result.live !== "polite" ||
    result.startupSkeletonCount !== 1 ||
    result.routeSkeletonCount !== 0 ||
    result.cloneStageCount !== 0 ||
    result.shapeRuntimeScriptCount !== 0 ||
    result.responsiveGridStylesheetCount !== 1
  ) {
    fail(`${name} session-gate contract failed: ${JSON.stringify(result)}.`);
  }
  if (result.overflow > 2) {
    fail(`${name} session gate overflows by ${result.overflow}px.`);
  }

  return result;
}

async function waitForMountedAdmin(targetPage) {
  // Mount visibility precedes the session gate's asynchronous release.
  await Promise.all([
    targetPage.locator("#adminPreview:not([hidden])").waitFor({ state: "visible", timeout: 15000 }),
    targetPage.locator('[data-admin-section="Overview"]').first().waitFor({ state: "visible", timeout: 15000 }),
    targetPage.locator("#adminSessionGate").waitFor({ state: "detached", timeout: 15000 }),
  ]);
}

async function readinessContract() {
  const context = await browser.newContext();
  const fixture = await context.newPage();
  const html = '<div id="adminSessionGate"><div class="admin-session-skeleton">Loading</div></div><div id="adminPreview"><button data-admin-section="Overview">Overview</button></div>';
  try {
    await fixture.setContent(html);
    await fixture.evaluate(() => {
      window.setTimeout(() => document.getElementById("adminSessionGate").remove(), 120);
    });
    await waitForMountedAdmin(fixture);
    if (await fixture.locator("#adminSessionGate").count()) fail("Readiness returned before delayed gate removal.");
    await fixture.setContent(html);
    let rejected = false;
    try {
      await waitForMountedAdmin(fixture);
    } catch (error) {
      if (error.name !== "TimeoutError" || !error.message.includes("#adminSessionGate")) throw error;
      rejected = true;
    }
    if (!rejected || await fixture.locator("#adminSessionGate").count() !== 1) fail("Readiness accepted a stuck gate.");
    return { delayedRemovalAccepted: true, stuckGateRejected: true, timeoutMs: 15000 };
  } finally {
    await context.close();
  }
}

async function mountedAdminContract(name, width, height) {
  await page.setViewportSize({ width, height });
  await page.goto(adminUrlForGame(), {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await waitForMountedAdmin(page);

  const result = {
    shapeRuntimePresent: await page.evaluate(
      () => Boolean(window.EconovariaAdminShapeSkeletons),
    ),
    cloneStageCount: await page.locator("[data-admin-shape-skeleton-stage]").count(),
    visibleGateCount: await page.locator("#adminSessionGate:visible").count(),
    visibleStartupSkeletonCount: await page.locator(
      ".admin-session-skeleton:visible",
    ).count(),
    responsiveGridStylesheetCount: await page.locator(
      'link[rel="stylesheet"][href="./css/responsive-card-grid.css"]',
    ).count(),
    overflow: await page.evaluate(() => Math.max(
      document.body.scrollWidth,
      document.documentElement.scrollWidth,
    ) - document.documentElement.clientWidth),
  };

  if (
    result.shapeRuntimePresent ||
    result.cloneStageCount !== 0 ||
    result.visibleGateCount !== 0 ||
    result.visibleStartupSkeletonCount !== 0 ||
    result.responsiveGridStylesheetCount !== 1
  ) {
    fail(`${name} mounted a duplicate startup loader: ${JSON.stringify(result)}.`);
  }
  if (result.overflow > 2) {
    fail(`${name} mounted Admin shell overflows by ${result.overflow}px.`);
  }

  return result;
}

async function scannerLifecycleSnapshot() {
  await page.locator('[data-admin-section="Overview"]').first().click();
  await page.locator('[data-admin-terminal-action="scan-attendance"]').first().waitFor({
    state: "visible",
    timeout: 10000,
  });
  await page.locator('[data-admin-terminal-action="scan-attendance"]').first().click();
  await page.locator("[data-admin-terminal-scanner-console]").waitFor({
    state: "visible",
    timeout: 5000,
  });

  const result = await page.evaluate(() => {
    const api = window.EconovariaAdminInteractionQuality;
    const scanner = document.querySelector(
      "[data-admin-terminal-scanner-console]",
    );
    const stateNode = scanner?.querySelector(
      "[data-admin-terminal-scanner-state]",
    );
    const read = () => ({
      state: scanner?.dataset.adminQolScannerState || "",
      busy: scanner?.getAttribute("aria-busy") || "",
      label: stateNode?.textContent?.trim() || "",
    });

    api.setScannerProcessing();
    const processing = read();
    api.setScannerCompleted();
    const completed = read();
    api.setScannerError("The test scan was rejected.");
    const failed = read();

    return {
      processing,
      completed,
      failed,
      shapeRuntimePresent: Boolean(window.EconovariaAdminShapeSkeletons),
      shapeSurfaceCount: document.querySelectorAll(
        ".admin-shape-surface-overlay",
      ).length,
    };
  });

  if (
    result.processing.state !== "processing" ||
    result.processing.busy !== "true" ||
    result.processing.label !== "Scanning" ||
    result.completed.state !== "completed" ||
    result.completed.busy ||
    result.completed.label !== "Completed" ||
    result.failed.state !== "error" ||
    result.failed.busy ||
    result.failed.label !== "Error" ||
    result.shapeRuntimePresent ||
    result.shapeSurfaceCount
  ) {
    fail(`Scanner lifecycle contract failed: ${JSON.stringify(result)}.`);
  }

  await page.locator(
    '[data-admin-terminal-modal-close][aria-label="Close scanner"]',
  ).click();
  return result;
}

try {
  const readiness = await readinessContract();
  const viewports = [];
  for (const [name, width, height] of VIEWPORTS) {
    const sessionGate = await sessionGateContract(name, width, height);
    const mountedAdmin = await mountedAdminContract(name, width, height);
    viewports.push({ name, width, height, sessionGate, mountedAdmin });
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(adminUrlForGame(), {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.locator("#adminPreview:not([hidden])").waitFor({
    state: "visible",
    timeout: 15000,
  });
  const scanner = await scannerLifecycleSnapshot();

  if (errors.length) fail(errors[0]);
  await finish({ passed: true, readiness, viewports, scanner });
  console.log(
    "Single CSS-owned Admin startup loader and scanner lifecycle checks passed.",
  );
} catch (error) {
  await capture("failure").catch(() => {});
  await finish({
    passed: false,
    failure: error.stack || error.message || String(error),
  });
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
}

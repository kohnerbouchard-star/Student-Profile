import { BASE_URL, createQualityHarness } from "./admin-quality-smoke-fixture.mjs";

const harness = await createQualityHarness("loading-scanner");
const { page, browser, errors, capture, finish } = harness;
const fail = (message) => { throw new Error(message); };
const VIEWPORTS = [
  ["desktop", 1440, 1000],
  ["compact", 1024, 768],
  ["narrow", 768, 900],
];

function gridColumnCount(value) {
  const text = String(value || "").trim();
  if (!text || text === "none") return 0;
  return text.split(/\s+/u).filter(Boolean).length;
}

function gridAreaName(value) {
  return String(value || "").split("/", 1)[0].trim();
}

async function waitForRouteLoaderCleanup(label) {
  try {
    await page.waitForFunction(() => {
      const main = document.querySelector(".admin-terminal-shell-main");
      const overlay = document.querySelector(".admin-qol-page-skeleton");
      return (!overlay || overlay.hidden) && !main?.hasAttribute("aria-busy");
    }, null, { timeout: 5000 });
  } catch (_) {
    const state = await page.evaluate(() => {
      const main = document.querySelector(".admin-terminal-shell-main");
      const overlay = document.querySelector(".admin-qol-page-skeleton");
      return {
        busy: main?.getAttribute("aria-busy") || "",
        overlayHidden: !overlay || overlay.hidden,
        overlayLabel: overlay?.getAttribute("aria-label") || "",
      };
    });
    fail(`${label} route loader did not clear: ${JSON.stringify(state)}.`);
  }
}

async function sessionGateSnapshot(name, width, height) {
  const context = await browser.newContext({
    viewport: { width, height },
    javaScriptEnabled: false,
  });
  const staticPage = await context.newPage();
  await staticPage.goto(BASE_URL, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await staticPage.waitForFunction(() => {
    const shell = document.querySelector(".admin-session-skeleton__shell");
    if (!(shell instanceof HTMLElement)) return false;
    const style = getComputedStyle(shell);
    return style.display === "grid" && style.gridTemplateColumns !== "none";
  }, null, { timeout: 5000 });

  const result = await staticPage.evaluate(() => {
    const gate = document.querySelector("#adminSessionGate");
    const shell = document.querySelector(".admin-session-skeleton__shell");
    const nav = document.querySelector(".admin-session-skeleton__nav");
    const main = document.querySelector(".admin-session-skeleton__main");
    const grid = document.querySelector(".admin-session-skeleton__metrics");
    const cards = [...document.querySelectorAll(".admin-session-skeleton__metric")];
    const rect = (element) => element?.getBoundingClientRect().toJSON() || null;
    const shellStyle = shell ? getComputedStyle(shell) : null;
    const navStyle = nav ? getComputedStyle(nav) : null;
    const mainStyle = main ? getComputedStyle(main) : null;
    const gridStyle = grid ? getComputedStyle(grid) : null;
    const firstCardStyle = cards[0] ? getComputedStyle(cards[0], "::after") : null;
    return {
      label: gate?.getAttribute("aria-label") || "",
      shell: rect(shell),
      nav: rect(nav),
      main: rect(main),
      metrics: rect(grid),
      cards: cards.map(rect),
      shellDisplay: shellStyle?.display || "",
      shellGridTemplateColumns: shellStyle?.gridTemplateColumns || "",
      shellGridTemplateAreas: shellStyle?.gridTemplateAreas || "",
      shellColumnGap: shellStyle?.columnGap || "",
      navGridArea: navStyle?.gridArea || "",
      mainGridArea: mainStyle?.gridArea || "",
      gridTemplateColumns: gridStyle?.gridTemplateColumns || "",
      columnGap: gridStyle?.columnGap || "",
      animationName: firstCardStyle?.animationName || "",
      overflow: Math.max(
        document.body.scrollWidth,
        document.documentElement.scrollWidth,
      ) - document.documentElement.clientWidth,
    };
  });
  await context.close();

  if (
    result.label !== "Verifying administrator access" ||
    !result.shell ||
    !result.nav ||
    !result.main ||
    !result.metrics ||
    result.cards.length !== 4
  ) {
    fail(`${name} session skeleton is incomplete: ${JSON.stringify(result)}.`);
  }
  if (result.overflow > 2) {
    fail(`${name} session skeleton overflows by ${result.overflow}px.`);
  }

  const stacked = width <= 1100;
  const shellColumns = gridColumnCount(result.shellGridTemplateColumns);
  const expectedShellColumns = stacked ? 1 : 2;
  const navArea = gridAreaName(result.navGridArea);
  const mainArea = gridAreaName(result.mainGridArea);
  if (
    result.shellDisplay !== "grid" ||
    shellColumns !== expectedShellColumns ||
    navArea !== "nav" ||
    mainArea !== "main"
  ) {
    fail(
      `${name} session shell grid contract failed: ` +
      JSON.stringify({
        display: result.shellDisplay,
        columns: result.shellGridTemplateColumns,
        columnCount: shellColumns,
        expectedColumnCount: expectedShellColumns,
        areas: result.shellGridTemplateAreas,
        navArea: result.navGridArea,
        mainArea: result.mainGridArea,
      }) + ".",
    );
  }
  if (result.shellColumnGap !== "20px") {
    fail(`${name} session shell gap drifted to ${result.shellColumnGap}.`);
  }
  if (stacked && result.main.y < result.nav.bottom - 2) {
    fail(`${name} session skeleton still uses a left rail below 1100px: ${JSON.stringify(result)}.`);
  }
  if (!stacked && (result.main.width <= result.nav.width || result.nav.width < 180)) {
    fail(`${name} session skeleton desktop tracks are malformed: ${JSON.stringify(result)}.`);
  }

  const columns = gridColumnCount(result.gridTemplateColumns);
  if (columns < 1 || columns > 4) {
    fail(`${name} session skeleton resolved ${columns} card columns.`);
  }
  for (const card of result.cards) {
    if (!card || card.width <= 0 || card.right > result.metrics.right + 2) {
      fail(`${name} session skeleton card escaped its grid: ${JSON.stringify(result)}.`);
    }
  }

  return { ...result, columns, shellColumns };
}

async function liveGridSnapshot(name, width, height, expectedColumns) {
  await page.setViewportSize({ width, height });
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.locator("#adminPreview:not([hidden])").waitFor({
    state: "visible",
    timeout: 15000,
  });
  await page.waitForFunction(() => {
    const grid = document.querySelector(".admin-terminal-action-grid");
    if (!(grid instanceof HTMLElement) || grid.children.length < 4) return false;
    const rect = grid.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }, null, { timeout: 10000 });
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));

  const initialState = await page.evaluate(() => {
    const main = document.querySelector(".admin-terminal-shell-main");
    const overlay = document.querySelector(".admin-qol-page-skeleton");
    const gate = document.querySelector("#adminSessionGate");
    const isVisible = (element) => {
      if (!(element instanceof HTMLElement) || element.hidden) return false;
      const style = getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden";
    };
    return {
      shapeRuntimePresent: Boolean(window.EconovariaAdminShapeSkeletons),
      duplicateVisible: Boolean(overlay && isVisible(overlay)),
      busy: main?.getAttribute("aria-busy") || "",
      cloneStageCount: document.querySelectorAll("[data-admin-shape-skeleton-stage]").length,
      sessionGateVisible: isVisible(gate),
      visibleStartupSkeletonCount: [...document.querySelectorAll(".admin-session-skeleton")]
        .filter(isVisible).length,
      visiblePageSkeletonCount: [...document.querySelectorAll(".admin-qol-page-skeleton")]
        .filter(isVisible).length,
    };
  });
  if (
    initialState.shapeRuntimePresent ||
    initialState.duplicateVisible ||
    initialState.cloneStageCount ||
    initialState.sessionGateVisible ||
    initialState.visibleStartupSkeletonCount ||
    initialState.visiblePageSkeletonCount
  ) {
    fail(`${name} mounted a second startup loader: ${JSON.stringify(initialState)}.`);
  }

  const live = await page.evaluate(() => {
    const shell = document.querySelector(".admin-terminal-shell");
    const nav = document.querySelector(".admin-terminal-left-menu");
    const main = document.querySelector(".admin-terminal-shell-main");
    const grid = document.querySelector(".admin-terminal-action-grid");
    const cards = grid ? [...grid.children] : [];
    const rect = (element) => element?.getBoundingClientRect().toJSON() || null;
    const style = grid ? getComputedStyle(grid) : null;
    return {
      shell: rect(shell),
      nav: rect(nav),
      main: rect(main),
      grid: rect(grid),
      cards: cards.map(rect),
      gridTemplateColumns: style?.gridTemplateColumns || "",
      columnGap: style?.columnGap || "",
      overflow: Math.max(
        document.body.scrollWidth,
        document.documentElement.scrollWidth,
      ) - document.documentElement.clientWidth,
    };
  });

  if (!live.shell || !live.nav || !live.main || !live.grid || live.cards.length < 4) {
    fail(`${name} live Admin card grid is incomplete: ${JSON.stringify(live)}.`);
  }
  const columns = gridColumnCount(live.gridTemplateColumns);
  if (columns !== expectedColumns) {
    fail(
      `${name} skeleton/live card columns differ: ` +
      `${expectedColumns} versus ${columns}.`,
    );
  }
  if (live.columnGap !== "12px") {
    fail(`${name} live card spacing drifted to ${live.columnGap}.`);
  }
  if (live.overflow > 2) {
    fail(`${name} live Admin shell overflows by ${live.overflow}px.`);
  }
  for (const card of live.cards) {
    if (!card || card.width <= 0 || card.right > live.grid.right + 2) {
      fail(`${name} live card escaped its grid: ${JSON.stringify(live)}.`);
    }
  }

  return { ...live, columns, initialState };
}

async function explicitRouteLoaderSnapshot(name) {
  const result = await page.locator('[data-admin-section="Attendance"]').first()
    .evaluate((control) => {
      control.click();
      const main = document.querySelector(".admin-terminal-shell-main");
      const overlay = document.querySelector(".admin-qol-page-skeleton");
      const grid = overlay?.querySelector(".admin-qol-skeleton-grid");
      return {
        visible: Boolean(overlay && !overlay.hidden),
        busy: main?.getAttribute("aria-busy") || "",
        role: overlay?.getAttribute("role") || "",
        label: overlay?.getAttribute("aria-label") || "",
        cardCount: grid?.children.length || 0,
        cloneStageCount: overlay?.querySelectorAll(
          "[data-admin-shape-skeleton-stage]",
        ).length || 0,
        shapeContract: overlay?.hasAttribute("data-admin-shape-skeleton") || false,
      };
    });

  if (
    !result.visible ||
    result.busy !== "true" ||
    result.role !== "status" ||
    result.label !== "Loading administrator data" ||
    result.cardCount !== 6 ||
    result.cloneStageCount !== 0 ||
    result.shapeContract
  ) {
    fail(`${name} explicit route loader contract failed: ${JSON.stringify(result)}.`);
  }
  await waitForRouteLoaderCleanup(`${name}:attendance`);
  return result;
}

async function scannerLifecycleSnapshot() {
  await page.locator('[data-admin-section="Overview"]').first().click();
  await waitForRouteLoaderCleanup("scanner:return-overview");
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
  const viewports = [];
  for (const [name, width, height] of VIEWPORTS) {
    const session = await sessionGateSnapshot(name, width, height);
    const live = await liveGridSnapshot(name, width, height, session.columns);
    const routeLoader = await explicitRouteLoaderSnapshot(name);
    viewports.push({ name, width, height, session, live, routeLoader });
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.locator("#adminPreview:not([hidden])").waitFor({
    state: "visible",
    timeout: 15000,
  });
  const scanner = await scannerLifecycleSnapshot();

  if (errors.length) fail(errors[0]);
  await finish({ passed: true, viewports, scanner });
  console.log(
    "Single Admin startup loader, responsive card-grid, explicit route loader, and scanner lifecycle checks passed.",
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
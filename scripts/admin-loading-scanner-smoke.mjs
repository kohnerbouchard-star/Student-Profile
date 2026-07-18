import { BASE_URL, createQualityHarness } from "./admin-quality-smoke-fixture.mjs";

const h = await createQualityHarness("loading-scanner");
const { page, browser, errors, capture, finish } = h;
const fail = (message) => { throw new Error(message); };
const results = [];

const VIEWPORTS = [
  ["desktop", 1440, 1000],
  ["compact", 1024, 768],
  ["narrow", 768, 900],
];
const ROUTES = [
  ["Overview", "overview"], ["Attendance", "attendance"],
  ["Players", "players"], ["Assignments", "contracts"],
  ["Store", "store"], ["Market", "marketplace"],
  ["Settings", "settings"], ["Logs", "logs"],
];
const ACCOUNTS = [
  ["open-admin-profile", "account-profile"],
  ["open-admin-settings", "account-settings"],
  ["open-admin-notifications", "account-notifications"],
  ["open-admin-security", "account-security"],
  ["open-admin-help", "account-help"],
  ["open-admin-games", "account-games"],
];

function assertGeometry(label, loaded, skeleton) {
  if (!loaded?.root || !skeleton?.root) fail(`${label} has no root geometry.`);
  const shared = Object.keys(loaded).filter((key) => skeleton[key]);
  if (!shared.length) fail(`${label} has no shared geometry.`);
  for (const key of shared) {
    const tolerance = key === "toolbar" ? 2 : 4;
    for (const dimension of ["x", "y", "width", "height", "right", "bottom"]) {
      const delta = Math.abs(Number(loaded[key][dimension]) - Number(skeleton[key][dimension]));
      if (delta > tolerance) fail(`${label} ${key}.${dimension} moved ${delta.toFixed(2)}px.`);
    }
  }
  return shared;
}

async function waitForCleanup(label) {
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
        removedOrHidden: !overlay || overlay.hidden,
        route: overlay?.dataset.adminShapeSkeletonRoute || "",
      };
    });
    fail(`${label} did not clear: ${JSON.stringify(state)}.`);
  }
}

function validate(label, snapshot) {
  const shared = assertGeometry(label, snapshot.loaded, snapshot.skeleton);
  if (snapshot.busy !== "true" || snapshot.role !== "status" || !snapshot.label) {
    fail(`${label} lacks loading semantics.`);
  }
  if (snapshot.cloneHidden !== "true" || !snapshot.cloneInert) {
    fail(`${label} clone is not decorative and inert.`);
  }
  if (!snapshot.focusPreserved || !snapshot.scrollPreserved) {
    fail(`${label} moved focus or scroll.`);
  }
  if (snapshot.overflow > 2) fail(`${label} has ${snapshot.overflow}px horizontal overflow.`);
  return shared;
}

async function manualSnapshot(route, label) {
  const snapshot = await page.evaluate((route) => {
    const api = window.EconovariaAdminShapeSkeletons;
    const main = document.querySelector(".admin-terminal-shell-main");
    const focus = document.activeElement;
    const scroll = [window.scrollX, window.scrollY, main?.scrollTop || 0];
    const controller = api.renderPage(route, { show: true });
    const overlay = document.querySelector(".admin-qol-page-skeleton");
    const shape = overlay?.querySelector(".admin-shape-skeleton-text");
    const output = {
      loaded: controller?.loadedGeometry || {},
      skeleton: controller?.measureSkeleton?.() || {},
      busy: main?.getAttribute("aria-busy") || "",
      role: overlay?.getAttribute("role") || "",
      label: overlay?.getAttribute("aria-label") || "",
      cloneHidden: overlay?.querySelector("[data-admin-shape-skeleton-stage]")?.getAttribute("aria-hidden") || "",
      cloneInert: overlay?.querySelector("[data-admin-shape-skeleton-stage]")?.hasAttribute("inert") || false,
      focusPreserved: document.activeElement === focus,
      scrollPreserved: window.scrollX === scroll[0] && window.scrollY === scroll[1] && (main?.scrollTop || 0) === scroll[2],
      overflow: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - document.documentElement.clientWidth,
      motion: shape ? getComputedStyle(shape, "::after").animationName : "",
    };
    controller?.hide?.();
    return output;
  }, route);
  const shared = validate(label, snapshot);
  await waitForCleanup(label);
  return { ...snapshot, shared };
}

async function automaticSnapshot(label) {
  await page.locator(".admin-qol-page-skeleton").waitFor({ state: "visible", timeout: 3000 });
  const snapshot = await page.evaluate(() => {
    const api = window.EconovariaAdminShapeSkeletons;
    const controller = api.activePageController();
    const main = document.querySelector(".admin-terminal-shell-main");
    const overlay = document.querySelector(".admin-qol-page-skeleton");
    const probe = window.__adminShapeProbe;
    return {
      loaded: controller?.loadedGeometry || {},
      skeleton: controller?.measureSkeleton?.() || {},
      busy: main?.getAttribute("aria-busy") || "",
      role: overlay?.getAttribute("role") || "",
      label: overlay?.getAttribute("aria-label") || "",
      cloneHidden: overlay?.querySelector("[data-admin-shape-skeleton-stage]")?.getAttribute("aria-hidden") || "",
      cloneInert: overlay?.querySelector("[data-admin-shape-skeleton-stage]")?.hasAttribute("inert") || false,
      focusPreserved: document.activeElement === probe?.focus,
      scrollPreserved: window.scrollX === probe?.x && window.scrollY === probe?.y && (main?.scrollTop || 0) === probe?.main,
      overflow: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - document.documentElement.clientWidth,
      generation: controller?.generation || 0,
    };
  });
  if (!snapshot.generation) fail(`${label} has no automatic skeleton controller.`);
  const shared = validate(label, snapshot);
  await waitForCleanup(label);
  return { ...snapshot, shared };
}

async function sessionSnapshot() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, javaScriptEnabled: false });
  const staticPage = await context.newPage();
  await staticPage.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  const result = await staticPage.evaluate(() => ({
    shell: document.querySelector(".admin-session-skeleton__shell")?.getBoundingClientRect().toJSON(),
    nav: document.querySelector(".admin-session-skeleton__nav")?.getBoundingClientRect().toJSON(),
    main: document.querySelector(".admin-session-skeleton__main")?.getBoundingClientRect().toJSON(),
    metrics: document.querySelectorAll(".admin-session-skeleton__metric").length,
    rows: document.querySelectorAll(".admin-session-skeleton__table-row").length,
    label: document.querySelector("#adminSessionGate")?.getAttribute("aria-label") || "",
    overflow: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - document.documentElement.clientWidth,
  }));
  await context.close();
  if (!result.shell || !result.nav || !result.main || result.metrics !== 4 || result.rows < 6) {
    fail(`Session skeleton is incomplete: ${JSON.stringify(result)}.`);
  }
  if (result.overflow > 2 || result.label !== "Verifying administrator access") {
    fail(`Session skeleton contract drifted: ${JSON.stringify(result)}.`);
  }
  return result;
}

async function scannerSnapshot() {
  await page.locator('[data-admin-terminal-action="scan-attendance"]').first().click();
  await page.waitForSelector("[data-admin-terminal-scanner-console]", { timeout: 5000 });
  const result = await page.evaluate(() => {
    const api = window.EconovariaAdminShapeSkeletons;
    const target = document.querySelector("[data-admin-terminal-scanner-console]");
    const focus = document.activeElement;
    const controller = api.renderSurface("scanner", target);
    const output = {
      loaded: controller?.loadedGeometry || {},
      skeleton: controller?.measureSkeleton?.() || {},
      busy: target?.getAttribute("aria-busy") || "",
      focusPreserved: document.activeElement === focus,
    };
    controller?.hide?.({ immediate: true });
    return output;
  });
  assertGeometry("scanner", result.loaded, result.skeleton);
  if (result.busy !== "true" || !result.focusPreserved) fail("Scanner skeleton semantics drifted.");
  await page.waitForTimeout(50);
  await page.locator('[data-admin-terminal-modal-close="scan-attendance"]').click();
  return result;
}

try {
  const session = await sessionSnapshot();
  await page.goto(BASE_URL, { waitUntil: "commit", timeout: 30000 });
  await page.waitForSelector("#adminPreview:not([hidden])", { timeout: 15000 });
  await page.waitForFunction(() => Boolean(window.EconovariaAdminShapeSkeletons), null, { timeout: 5000 });
  await waitForCleanup("initial load");

  for (const [name, width, height] of VIEWPORTS) {
    await page.setViewportSize({ width, height });
    for (const [section, route] of ROUTES) {
      await page.locator(`[data-admin-section="${section}"]`).first().click();
      await waitForCleanup(`${name}:${route}:navigation`);
      results.push({ viewport: name, route, ...(await manualSnapshot(route, `${name}:${route}`)) });
    }
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const [action, route] of ACCOUNTS) {
    await page.locator("[data-admin-terminal-user]").first().click();
    const control = page.locator(`[data-admin-terminal-action="${action}"]`).first();
    await control.waitFor({ state: "visible", timeout: 5000 });
    await control.click();
    await page.evaluate(() => {
      const main = document.querySelector(".admin-terminal-shell-main");
      window.__adminShapeProbe = { focus: document.activeElement, x: window.scrollX, y: window.scrollY, main: main?.scrollTop || 0 };
    });
    results.push({ viewport: "desktop", route, ...(await automaticSnapshot(`desktop:${route}`)) });
    await page.locator('[data-admin-section="Overview"]').first().click();
    await waitForCleanup(`${route}:return`);
  }

  await page.emulateMedia({ reducedMotion: "reduce" });
  const reduced = await manualSnapshot("overview", "reduced-motion");
  if (reduced.motion && reduced.motion !== "none") fail(`Reduced motion still animates: ${reduced.motion}.`);
  await page.emulateMedia({ reducedMotion: "no-preference" });

  const refresh = await page.evaluate(() => {
    const api = window.EconovariaAdminShapeSkeletons;
    const main = document.querySelector(".admin-terminal-shell-main");
    const overlay = document.querySelector(".admin-qol-page-skeleton");
    const focus = document.activeElement;
    const indicator = api.beginRefresh("Refreshing current Admin data");
    const output = {
      visible: Boolean(indicator && !indicator.hidden),
      state: indicator?.dataset.state || "",
      noSkeleton: !overlay || overlay.hidden,
      focusPreserved: document.activeElement === focus,
      busy: main?.getAttribute("aria-busy") || "",
    };
    api.endRefresh("Admin data updated");
    return output;
  });
  if (!refresh.visible || refresh.state !== "refreshing" || !refresh.noSkeleton || !refresh.focusPreserved || refresh.busy) {
    fail(`Background refresh contract failed: ${JSON.stringify(refresh)}.`);
  }

  const scanner = await scannerSnapshot();
  if (errors.length) fail(errors[0]);
  await finish({ passed: true, session, results, reducedMotion: reduced.motion, refresh, scanner });
  console.log("Shape-accurate Admin loading geometry checks passed.");
} catch (error) {
  await capture("failure").catch(() => {});
  await finish({ passed: false, failure: error.stack || error.message || String(error), results });
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
}

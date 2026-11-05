import { writeFileSync } from "node:fs";
import {
  BASE_URL,
  createQualityHarness,
  GAME_ID,
} from "./admin-quality-smoke-fixture.mjs";

const GAME_CODE = "QUALITY1";
const GAME_NAME = "Quality Game";
const ADMIN_EMAIL = "admin@example.test";
const LOGOUT_SNAPSHOT_KEY = "econovaria.admin.logout-snapshot.v1";
const ORIGIN = "http://127.0.0.1:4173";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function corsHeaders() {
  return {
    "access-control-allow-origin": ORIGIN,
    "access-control-allow-credentials": "true",
    "access-control-allow-headers":
      "apikey,content-type,x-econovaria-device-id",
    "access-control-allow-methods": "POST,OPTIONS",
    "cache-control": "private, no-store",
  };
}

const harness = await createQualityHarness("logout-confirmation");
const { page, errors, dir } = harness;
const requests = [];
let logoutResponseFulfilled = false;

page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text()}`);
});
page.on("request", (request) => {
  requests.push(`${request.method()} ${request.url()}`);
});

// The post-logout destination is the real root login page. Its runtime health
// indicator probes /api/health on load, so the static browser fixture must
// model that same-origin production contract rather than letting Python's
// static server turn the expected probe into an unrelated 404 console error.
await page.route("**/api/health", async (route) => {
  const request = route.request();
  assert(request.method() === "GET", `Runtime health used ${request.method()} instead of GET.`);
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "cache-control": "private, no-store" },
    body: JSON.stringify({
      ok: true,
      status: "ready",
      environment: "development",
      projectRef: "runtimefixture123456",
    }),
  });
});

await page.addInitScript(({ gameId, gameCode, snapshotKey }) => {
  sessionStorage.setItem(`econovaria.admin.game-code.v1:${gameId}`, gameCode);
  if (window.__econovariaLogoutSnapshotInstalled) return;
  window.__econovariaLogoutSnapshotInstalled = true;
  window.addEventListener("beforeunload", () => {
    try {
      localStorage.setItem(snapshotKey, JSON.stringify({
        session: sessionStorage.getItem("econovaria.admin.auth.v1"),
        selectedGame: sessionStorage.getItem("econovaria.admin.selected-game.v1"),
        csrf: sessionStorage.getItem("econovaria.admin.csrf.v1"),
      }));
    } catch (_) {}
  });
}, {
  gameId: GAME_ID,
  gameCode: GAME_CODE,
  snapshotKey: LOGOUT_SNAPSHOT_KEY,
});

await page.route("**/functions/v1/web-session-api/logout", async (route) => {
  const request = route.request();
  assert(!request.headers().authorization, "Admin logout exposed a Staff bearer token.");
  if (request.method() === "OPTIONS") {
    await route.fulfill({ status: 204, headers: corsHeaders(), body: "" });
    return;
  }
  assert(request.method() === "POST", `Admin logout used ${request.method()} instead of POST.`);
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: corsHeaders(),
    body: JSON.stringify({ ok: true, revoked: true }),
  });
  logoutResponseFulfilled = true;
});

async function clickRealAccountLogout() {
  const user = page.locator("[data-admin-terminal-user]").first();
  await user.waitFor({ state: "visible", timeout: 10_000 });
  await user.click();
  const menu = page.locator("[data-admin-terminal-user-menu]").first();
  await menu.waitFor({ state: "visible", timeout: 5_000 });
  const candidates = menu.locator(
    "button, a, [role='button'], [data-admin-terminal-action]",
  );
  const metadata = await candidates.evaluateAll((nodes) => nodes.map((node) => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    const signals = [
      node.getAttribute("data-admin-terminal-action"),
      node.getAttribute("data-action"),
      node.getAttribute("data-econovaria-admin-logout"),
      node.id,
      node.getAttribute("aria-label"),
      node.getAttribute("title"),
      node.textContent,
    ].map((value) => String(value || "").replace(/\s+/g, " ").trim()).filter(Boolean);
    return {
      outerHTML: node.outerHTML.slice(0, 1200),
      signals,
      visible: style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.width > 0 &&
        rect.height > 0,
    };
  }));
  writeFileSync(
    `${dir}/real-account-menu-controls.json`,
    JSON.stringify(metadata, null, 2),
  );
  const index = metadata.findIndex((entry) =>
    entry.visible && entry.signals.some((signal) =>
      /(?:^|[\s_-])(?:sign[\s_-]*out|log[\s_-]*out|logout)(?:$|[\s_-])/i.test(
        ` ${signal} `,
      )
    )
  );
  assert(index >= 0, `No real account-menu logout control found: ${JSON.stringify(metadata)}`);
  await candidates.nth(index).click();
  return metadata[index];
}

const report = {};
try {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    (snapshotKey) => localStorage.removeItem(snapshotKey),
    LOGOUT_SNAPSHOT_KEY,
  );
  await page.locator("#adminPreview:not([hidden])").waitFor({
    state: "visible",
    timeout: 15_000,
  });

  const cdp = await page.context().newCDPSession(page);
  const listenerCounts = {};
  for (const expression of ["window", "document"]) {
    const { result } = await cdp.send("Runtime.evaluate", { expression });
    const { listeners } = await cdp.send("DOMDebugger.getEventListeners", { objectId: result.objectId });
    listenerCounts[expression] = listeners.map(({ type, useCapture }) => `${type}:${useCapture}`).sort();
  }
  await page.waitForLoadState("networkidle");
  const signatures = async () => {
    const { result } = await cdp.send("Runtime.evaluate", { expression: "window" });
    const { listeners } = await cdp.send("DOMDebugger.getEventListeners", { objectId: result.objectId });
    return JSON.stringify(listeners.filter(({ type }) => ["click", "keydown"].includes(type)).map(({ type, useCapture, scriptId, lineNumber, columnNumber }) => [type, useCapture, scriptId, lineNumber, columnNumber]));
  };
  const beforeRepeats = await signatures();
  await page.evaluate(async () => {
    const owner = window.EconovariaAdminLogoutConfirmation, bridge = window.EconovariaAdminLogoutAccountTriggerBridge;
    const script = (src) => new Promise((resolve, reject) => { const node = document.createElement("script"); node.src = src; node.onload = resolve; node.onerror = reject; document.head.append(node); });
    owner.installAccountTriggerBridge();
    await script("./logout-confirmation.js?repeat-owner");
    await import("./logout-account-trigger-bridge.js");
    await import("./logout-account-trigger-bridge.js?repeat-module");
    await script("./logout-account-trigger-bridge.js");
    await script("./logout-account-trigger-bridge.js?repeat-classic");
    owner.installAccountTriggerBridge();
    if (owner !== window.EconovariaAdminLogoutConfirmation || bridge !== window.EconovariaAdminLogoutAccountTriggerBridge) throw new Error("Repeated initialization replaced public APIs.");
  });
  assert(await signatures() === beforeRepeats, "Repeated initialization changed logout listener identities/order.");
  for (const fallbackFirst of [false, true]) {
    const isolated = await page.context().newPage();
    await isolated.setContent("<!doctype html><title>Logout initialization fixture</title>");
    await isolated.addScriptTag({ content: "void 0;" }); // Initialize Playwright instrumentation before counting.
    const probeCdp = await isolated.context().newCDPSession(isolated);
    const { result } = await probeCdp.send("Runtime.evaluate", { expression: "window" });
    const snapshot = async () => (await probeCdp.send("DOMDebugger.getEventListeners", { objectId: result.objectId })).listeners.filter(({ type }) => ["click", "keydown"].includes(type));
    const initialCount = (await snapshot()).length;
    const bridgeUrl = `${ORIGIN}/admin/logout-account-trigger-bridge.js`, ownerUrl = `${ORIGIN}/admin/logout-confirmation.js`;
    if (fallbackFirst) await isolated.addScriptTag({ url: bridgeUrl });
    await isolated.addScriptTag({ url: ownerUrl });
    await isolated.evaluate(() => { window.savedOwner = window.EconovariaAdminLogoutConfirmation; window.savedOwner.installAccountTriggerBridge(); window.savedBridge = window.EconovariaAdminLogoutAccountTriggerBridge; });
    await isolated.addScriptTag({ url: `${ownerUrl}?again` });
    await isolated.addScriptTag({ url: `${bridgeUrl}?again` });
    assert(await isolated.evaluate(() => { window.savedOwner.installAccountTriggerBridge(); return window.savedOwner === window.EconovariaAdminLogoutConfirmation && window.savedBridge === window.EconovariaAdminLogoutAccountTriggerBridge; }), "Standalone repeated initialization replaced APIs.");
    assert((await snapshot()).length === initialCount + 4, `Standalone initialization duplicated listeners: ${JSON.stringify({ fallbackFirst, initialCount, listeners: (await snapshot()).map(({type, useCapture, lineNumber}) => ({type,useCapture,lineNumber})) })}`);
    await probeCdp.detach(); await isolated.close();
  }
  report.repeatedInitializationStable = true;
  await cdp.detach();
  const logoutRequests = () => requests.filter((value) => value.startsWith("POST ") && value.includes("/web-session-api/logout"));
  const realControl = await clickRealAccountLogout();
  assert(logoutRequests().length === 0, "Opening confirmation sent logout.");
  const modal = page.locator("[data-econovaria-admin-logout-confirmation]");
  await modal.waitFor({ state: "visible", timeout: 5_000 });
  const legacyVisible = await page.locator(
    "[data-admin-terminal-modal-backdrop]",
  ).evaluateAll((nodes) => nodes.filter((node) => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return !node.hidden &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      rect.width > 0 &&
      rect.height > 0;
  }).length);
  assert(legacyVisible === 0, "Legacy logout modal remained visible.");

  const state = await modal.evaluate((surface) => {
    const dialog = surface.querySelector('[role="dialog"]');
    const description = surface.querySelector(
      ".econovaria-admin-logout-confirmation__description",
    ).getBoundingClientRect();
    const context = surface.querySelector(
      ".econovaria-admin-logout-confirmation__context",
    ).getBoundingClientRect();
    const title = surface.querySelector("h2").getBoundingClientRect();
    const actionsNode = surface.querySelector(
      ".econovaria-admin-logout-confirmation__actions",
    );
    const actions = actionsNode.getBoundingClientRect();
    const rect = dialog.getBoundingClientRect();
    const buttons = [...actionsNode.querySelectorAll("button")].map((button) => {
      const buttonRect = button.getBoundingClientRect();
      return { y: buttonRect.y, height: buttonRect.height };
    });
    return {
      account: surface.querySelector("[data-econovaria-logout-account]")?.textContent?.trim(),
      game: surface.querySelector("[data-econovaria-logout-game]")?.textContent?.trim(),
      code: surface.querySelector("[data-econovaria-logout-code]")?.textContent?.trim(),
      dialog: { width: rect.width, height: rect.height, top: rect.top, bottom: rect.bottom },
      viewport: { width: innerWidth, height: innerHeight },
      titleBottom: title.bottom,
      descriptionTop: description.top,
      descriptionBottom: description.bottom,
      contextTop: context.top,
      contextBottom: context.bottom,
      actionsTop: actions.top,
      actionsHeight: actions.height,
      actionsDisplay: getComputedStyle(actionsNode).display,
      actionsDirection: getComputedStyle(actionsNode).flexDirection,
      buttons,
      horizontalOverflow: dialog.scrollWidth > dialog.clientWidth + 1,
    };
  });
  assert(state.account === ADMIN_EMAIL, `Logout account drifted: ${state.account}`);
  assert(state.game === GAME_NAME, `Logout game drifted: ${state.game}`);
  assert(state.code === GAME_CODE, `Logout code drifted: ${state.code}`);
  assert(
    state.dialog.width <= 682 && state.dialog.width <= state.viewport.width - 30,
    `Logout modal width is unbounded: ${JSON.stringify(state.dialog)}`,
  );
  assert(
    state.dialog.height <= state.viewport.height - 30 &&
      state.dialog.top >= 14 &&
      state.dialog.bottom <= state.viewport.height - 14,
    `Logout modal exceeds the viewport: ${JSON.stringify(state.dialog)}`,
  );
  assert(state.titleBottom <= state.descriptionTop + 1, "Logout title overlaps description.");
  assert(state.descriptionBottom <= state.contextTop + 1, "Logout description overlaps context.");
  assert(state.contextBottom <= state.actionsTop + 1, "Logout context overlaps actions.");
  assert(
    state.actionsDisplay === "flex" && state.actionsDirection === "row",
    "Logout actions are not a desktop row.",
  );
  assert(state.actionsHeight <= 50, "Logout action row stretched vertically.");
  assert(
    state.buttons.length === 2 &&
      state.buttons.every((button) => button.height >= 43 && button.height <= 45),
    `Logout button dimensions drifted: ${JSON.stringify(state.buttons)}`,
  );
  assert(Math.abs(state.buttons[0].y - state.buttons[1].y) <= 1, "Logout buttons are misaligned.");
  assert(!state.horizontalOverflow, "Logout modal overflows horizontally.");
  await harness.capture("logout-confirmation-real-account-control");

  await modal.locator("[data-econovaria-logout-cancel]").last().click();
  await modal.waitFor({ state: "detached", timeout: 5_000 });
  assert(
    await page.evaluate(() => Boolean(sessionStorage.getItem("econovaria.admin.auth.v1"))),
    "Cancel incorrectly cleared the Admin session.",
  );

  assert(logoutRequests().length === 0, "Cancellation sent logout.");
  for (const tag of ["a", "button"]) {
    await page.evaluate((tag) => { const node = document.createElement(tag); node.id = "repeatLogoutProbe"; node.setAttribute("role", "button"); node.tabIndex = 0; node.textContent = "Logout"; document.body.append(node); }, tag);
    const probe = page.locator("#repeatLogoutProbe");
    for (const key of ["Enter", "Space"]) {
      await probe.focus(); await probe.press(key);
      await modal.waitFor({ state: "visible", timeout: 5_000 });
      assert(logoutRequests().length === 0, "Keyboard opening sent logout.");
      await modal.locator("[data-econovaria-logout-cancel]").last().click();
      await modal.waitFor({ state: "detached", timeout: 5_000 });
      assert(await probe.evaluate((node) => document.activeElement === node), "Cancel lost opener focus.");
      assert(logoutRequests().length === 0, "Keyboard cancellation sent logout.");
    }
    await probe.evaluate((node) => node.remove());
  }
  await clickRealAccountLogout();
  await modal.waitFor({ state: "visible", timeout: 5_000 });
  await Promise.all([
    page.waitForURL((url) =>
      url.searchParams.get("mode") === "admin" &&
      url.searchParams.get("reason") === "signed-out",
    { timeout: 10_000 }),
    modal.locator("[data-econovaria-logout-confirm]").click(),
  ]);
  const storage = await page.evaluate((snapshotKey) => {
    try {
      return JSON.parse(localStorage.getItem(snapshotKey) || "null");
    } catch (_) {
      return null;
    }
  }, LOGOUT_SNAPSHOT_KEY);
  assert(
    storage &&
      storage.session === null &&
      storage.selectedGame === null &&
      storage.csrf === null,
    `Logout left local state before navigation: ${JSON.stringify(storage)}`,
  );
  assert(
    requests.some((entry) =>
      entry.includes("POST") && entry.includes("/web-session-api/logout")
    ),
    `Server-mediated Admin logout was not attempted: ${JSON.stringify(requests)}`,
  );
  assert(logoutRequests().length === 1, "Confirmation did not issue exactly one logout POST.");
  assert(logoutResponseFulfilled, "The mocked Admin logout response did not complete.");

  const expectedNavigationAbort = /POST .*\/functions\/v1\/web-session-api\/logout net::ERR_ABORTED/i;
  const remainingErrors = errors.filter((error) =>
    !(logoutResponseFulfilled && expectedNavigationAbort.test(error))
  );
  assert(remainingErrors.length === 0, remainingErrors.join("\n"));
  Object.assign(report, {
    realControl,
    listenerCounts,
    logoutRequestCount: logoutRequests().length,
    state,
    storage,
    serverMediatedLogoutObserved: true,
    logoutResponseFulfilled,
    ignoredNavigationAbort: errors.length !== remainingErrors.length,
    errors: [...remainingErrors],
  });
  writeFileSync(`${dir}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    realAccountLogoutControl: true,
    boundedLogoutModal: true,
    legacyModalSuppressed: true,
    cancelPreservesSession: true,
    confirmationClearsSession: true,
    confirmationRedirects: true,
    serverMediatedLogoutObserved: true,
    logoutResponseFulfilled: true,
  }, null, 2));
} catch (error) {
  report.failure = String(error?.stack || error?.message || error);
  report.errors = [...errors];
  await harness.capture("failure").catch(() => {});
  writeFileSync(`${dir}/report.json`, JSON.stringify(report, null, 2));
  throw error;
} finally {
  await harness.finish(report);
}
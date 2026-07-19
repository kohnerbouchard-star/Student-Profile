import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE_URL = process.env.ADMIN_SMOKE_BASE_URL || "http://127.0.0.1:4173/admin/";
const ARTIFACT_DIR = process.env.ADMIN_SMOKE_ARTIFACT_DIR || "admin-browser-smoke-artifacts/modal-accessibility";
const GAME_ID = "00000000-0000-4000-8000-000000000001";
const ADMIN_ID = "00000000-0000-4000-8000-000000000002";

mkdirSync(ARTIFACT_DIR, { recursive: true });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function base64Url(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64")
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

const now = Math.floor(Date.now() / 1000);
const token = `${base64Url({ alg: "none", typ: "JWT" })}.${base64Url({
  sub: ADMIN_ID,
  email: "admin@example.test",
  role: "authenticated",
  iat: now,
  exp: now + 3600,
})}.signature`;

const game = {
  id: GAME_ID,
  gameSessionId: GAME_ID,
  title: "Modal Accessibility Game",
  name: "Modal Accessibility Game",
  status: "active",
  gameCode: "MODAL1",
};

const common = {
  gameId: GAME_ID,
  gameSessionId: GAME_ID,
  activeGameId: GAME_ID,
  selectedGameSessionId: GAME_ID,
  permissions: ["*"],
  roles: ["game_admin"],
  adminRole: "game_admin",
  game,
  activeGame: game,
  players: [],
  attendance: [],
  attendanceRows: [],
  attendanceHistory: [],
  attendanceLedger: [],
  attendanceSummary: { presentCount: 0, lateCount: 0, absentCount: 0, activePlayerCount: 0, rewardsIssuedCount: 0, rewardsIssuedTotal: 0 },
  attendanceCounts: { present: 0, late: 0, absent: 0, total: 0 },
  contracts: [],
  store: [],
  storeItems: [],
  assets: [],
  trades: [],
  events: [],
  market: { assets: [], trades: [], events: [] },
  settings: { difficultyPreset: "moderate", backendDifficultyPreset: "moderate", difficultyBasePreset: "moderate", priceMultiplier: 1, incomeMultiplier: 1, shockFrequency: 1, shockSeverity: 1, recoverySupport: 1, tradeMultiplier: 1, configSaveState: "saved" },
  logs: [],
  dashboard: { activePlayerCount: 0, totalPlayers: 0, onlinePlayerCount: 0, attendanceSummary: { presentCount: 0, lateCount: 0, absentCount: 0 }, leaderboard: [], recentActivity: [], marketStatus: "open" },
};

function responseFor(pathname) {
  if (pathname.endsWith("/session/bootstrap")) {
    return {
      data: {
        admin: { id: ADMIN_ID, accountId: ADMIN_ID, displayName: "Modal Administrator", email: "admin@example.test", role: "game_admin", roles: ["game_admin"] },
        activeGame: game,
        games: [game],
        permissions: ["*"],
        roles: ["game_admin"],
        adminRole: "game_admin",
        csrfToken: "",
        session: { id: ADMIN_ID, csrfToken: "", expiresAt: new Date(Date.now() + 3600_000).toISOString() },
        capabilities: { notifications: false, securityHistory: "current_session_only", helpArticles: true, auditLogFlags: true, auditLogExport: true, overallScore: false, marketplaceAdminTrading: false },
      },
    };
  }
  return { data: common };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors = [];
const report = { parent: {}, nested: {}, blocked: {}, fallback: {} };

page.on("pageerror", (error) => errors.push(`pageerror: ${error.stack || error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text()}`);
});
page.on("requestfailed", (request) => {
  const url = request.url();
  const failure = request.failure()?.errorText || "";
  if (url.endsWith("/favicon.ico")) return;
  if (/\/admin\/assets\/videos\/[^/]+\.mp4$/i.test(url) && failure.includes("ERR_ABORTED")) return;
  errors.push(`requestfailed: ${request.method()} ${url} ${failure}`);
});

await page.addInitScript(({ accessToken, gameId, adminId }) => {
  sessionStorage.setItem("econovaria.admin.auth.v1", JSON.stringify({
    accessToken,
    refreshToken: "modal-accessibility-refresh-token",
    user: { id: adminId, email: "admin@example.test" },
  }));
  sessionStorage.setItem("econovaria.admin.selected-game.v1", gameId);
}, { accessToken: token, gameId: GAME_ID, adminId: ADMIN_ID });

await page.route("**/functions/v1/admin-api/**", async (route) => {
  const request = route.request();
  if (request.method() === "OPTIONS") {
    await route.fulfill({
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "authorization, apikey, content-type, x-econovaria-game-id, x-econovaria-csrf",
        "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      },
      body: "",
    });
    return;
  }
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*", "cache-control": "no-store" },
    body: JSON.stringify(responseFor(new URL(request.url()).pathname)),
  });
});

try {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("#adminPreview:not([hidden])", { timeout: 15_000 });
  await page.waitForFunction(() => Boolean(window.EconovariaAdminModalAccessibility), null, { timeout: 10_000 });

  await page.evaluate(() => {
    const original = document.createElement("button");
    original.id = "modal-test-original-opener";
    original.type = "button";
    original.textContent = "Original opener";
    document.body.append(original);
    original.focus();

    const createSurface = (id, labels) => {
      const backdrop = document.createElement("div");
      backdrop.id = `${id}-backdrop`;
      backdrop.tabIndex = -1;
      Object.assign(backdrop.style, { position: "fixed", inset: "0", display: "grid", placeItems: "center" });
      const dialog = document.createElement("section");
      dialog.id = `${id}-dialog`;
      dialog.setAttribute("aria-label", id);
      Object.assign(dialog.style, { display: "block", width: "320px", minHeight: "120px", padding: "16px", background: "white" });
      for (const label of labels) {
        const button = document.createElement("button");
        button.id = `${id}-${label}`;
        button.type = "button";
        button.textContent = label;
        dialog.append(button);
      }
      backdrop.append(dialog);
      document.body.append(backdrop);
      return { backdrop, dialog };
    };

    window.__adminModalTest = { createSurface, original, blockedEvents: [] };
    const parent = createSurface("parent", ["first", "last"]);
    window.__adminModalTest.parent = parent;
    window.__adminModalTest.parentController = window.EconovariaAdminModalAccessibility.activate({
      ...parent,
      opener: original,
      initialFocus: document.querySelector("#parent-first"),
    });
  });

  await page.waitForFunction(() => document.activeElement?.id === "parent-first");
  report.parent.initialFocus = await page.evaluate(() => document.activeElement?.id || "");

  await page.locator("#parent-last").focus();
  await page.keyboard.press("Tab");
  report.parent.forwardWrap = await page.evaluate(() => document.activeElement?.id || "");
  assert(report.parent.forwardWrap === "parent-first", `Parent Tab did not wrap to first: ${report.parent.forwardWrap}.`);

  await page.keyboard.press("Shift+Tab");
  report.parent.reverseWrap = await page.evaluate(() => document.activeElement?.id || "");
  assert(report.parent.reverseWrap === "parent-last", `Parent Shift+Tab did not wrap to last: ${report.parent.reverseWrap}.`);

  await page.locator("#modal-test-original-opener").focus();
  await page.waitForFunction(() => document.activeElement?.id?.startsWith("parent-"));
  report.parent.focusInContainment = await page.evaluate(() => document.activeElement?.id || "");

  await page.evaluate(() => {
    document.querySelector("#parent-last")?.focus();
    const child = window.__adminModalTest.createSurface("child", ["first", "last"]);
    window.__adminModalTest.child = child;
    window.__adminModalTest.childController = window.EconovariaAdminModalAccessibility.activate({
      ...child,
      opener: document.querySelector("#parent-last"),
      initialFocus: document.querySelector("#child-first"),
    });
  });
  await page.waitForFunction(() => document.activeElement?.id === "child-first");
  report.nested.depthWhileOpen = await page.evaluate(() => window.EconovariaAdminModalAccessibility.getStackDepth());
  assert(report.nested.depthWhileOpen === 2, `Expected nested depth 2, received ${report.nested.depthWhileOpen}.`);

  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("#child-backdrop") && window.EconovariaAdminModalAccessibility.getStackDepth() === 1);
  await page.waitForFunction(() => document.activeElement?.id === "parent-last");
  report.nested.restoredToParentOpener = await page.evaluate(() => document.activeElement?.id || "");

  await page.locator("#modal-test-original-opener").focus();
  await page.waitForFunction(() => document.activeElement?.id?.startsWith("parent-"));
  report.nested.parentTrapResumed = await page.evaluate(() => document.activeElement?.id || "");

  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("#parent-backdrop") && window.EconovariaAdminModalAccessibility.getStackDepth() === 0);
  await page.waitForFunction(() => document.activeElement?.id === "modal-test-original-opener");
  report.parent.restoredOriginalOpener = await page.evaluate(() => document.activeElement?.id || "");

  await page.evaluate(() => {
    const locked = window.__adminModalTest.createSurface("locked", ["acknowledge"]);
    locked.backdrop.addEventListener("econovaria:admin-modal-dismiss-blocked", (event) => {
      window.__adminModalTest.blockedEvents.push(event.detail?.reason || "unknown");
    });
    window.__adminModalTest.locked = locked;
    window.__adminModalTest.lockedController = window.EconovariaAdminModalAccessibility.activate({
      ...locked,
      opener: window.__adminModalTest.original,
      dismissOnEscape: false,
      dismissOnBackdrop: false,
    });
  });
  await page.waitForFunction(() => document.activeElement?.id === "locked-acknowledge");
  await page.keyboard.press("Escape");
  report.blocked = await page.evaluate(() => ({
    connected: Boolean(document.querySelector("#locked-backdrop")),
    active: document.activeElement?.id || "",
    events: [...window.__adminModalTest.blockedEvents],
    depth: window.EconovariaAdminModalAccessibility.getStackDepth(),
  }));
  assert(report.blocked.connected, "Locked acknowledgement modal closed on Escape.");
  assert(report.blocked.active === "locked-acknowledge", `Locked modal lost focus: ${report.blocked.active}.`);
  assert(report.blocked.events.includes("escape"), `Locked modal omitted blocked Escape evidence: ${JSON.stringify(report.blocked.events)}.`);
  await page.evaluate(() => window.__adminModalTest.lockedController.close("acknowledged"));
  await page.waitForFunction(() => !document.querySelector("#locked-backdrop") && window.EconovariaAdminModalAccessibility.getStackDepth() === 0);

  await page.evaluate(() => {
    const transient = document.createElement("button");
    transient.id = "transient-opener";
    transient.type = "button";
    transient.textContent = "Transient opener";
    document.body.append(transient);
    transient.focus();
    const fallback = window.__adminModalTest.createSurface("fallback", ["close"]);
    window.__adminModalTest.fallbackController = window.EconovariaAdminModalAccessibility.activate({ ...fallback, opener: transient });
    transient.remove();
  });
  await page.waitForFunction(() => document.activeElement?.id === "fallback-close");
  await page.evaluate(() => window.__adminModalTest.fallbackController.close("close-button"));
  await page.waitForFunction(() => !document.querySelector("#fallback-backdrop") && window.EconovariaAdminModalAccessibility.getStackDepth() === 0);
  await page.waitForFunction(() => Boolean(document.activeElement?.closest?.("#adminPreview")), null, { timeout: 3000 });
  report.fallback.active = await page.evaluate(() => ({
    id: document.activeElement?.id || "",
    section: document.activeElement?.getAttribute?.("data-admin-section") || "",
    inAdmin: Boolean(document.activeElement?.closest?.("#adminPreview")),
  }));
  assert(report.fallback.active.section || report.fallback.active.inAdmin, `Disconnected opener did not restore to Admin fallback: ${JSON.stringify(report.fallback.active)}.`);

  assert(errors.length === 0, `Admin modal accessibility emitted browser errors: ${errors[0]}`);
  report.errors = errors;
  writeFileSync(`${ARTIFACT_DIR}/modal-accessibility.json`, JSON.stringify(report, null, 2));
  console.log("Admin nested modal focus, Escape, blocked dismissal, and restoration smoke passed.");
} catch (error) {
  report.failure = error.stack || error.message || String(error);
  report.errors = errors;
  await page.screenshot({ path: `${ARTIFACT_DIR}/modal-accessibility-failure.png`, fullPage: true });
  writeFileSync(`${ARTIFACT_DIR}/modal-accessibility.json`, JSON.stringify(report, null, 2));
  console.error(report.failure);
  process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
}

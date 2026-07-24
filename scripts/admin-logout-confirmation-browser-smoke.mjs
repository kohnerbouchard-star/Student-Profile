import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE_URL = process.env.ADMIN_SMOKE_BASE_URL || "http://127.0.0.1:4173/admin/";
const ARTIFACT_DIR = "admin-browser-smoke-artifacts/logout-confirmation";
const GAME_ID = "00000000-0000-4000-8000-000000000001";
const ADMIN_ID = "00000000-0000-4000-8000-000000000002";
const GAME_CODE = "SMOKE1";
const GAME_NAME = "Browser Smoke Game";
const ADMIN_EMAIL = "admin@example.test";
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
  sub: ADMIN_ID, email: ADMIN_EMAIL, role: "authenticated", iat: now, exp: now + 3600,
})}.signature`;
const game = {
  id: GAME_ID, gameSessionId: GAME_ID, title: GAME_NAME, name: GAME_NAME,
  status: "active", lifecycleState: "active", gameCode: GAME_CODE, joinCode: GAME_CODE,
};
const common = {
  gameId: GAME_ID, gameSessionId: GAME_ID, activeGameId: GAME_ID,
  selectedGameSessionId: GAME_ID, permissions: ["*"], roles: ["game_admin"],
  adminRole: "game_admin", game, activeGame: game, selectedGame: game, games: [game],
  players: [], attendance: [], attendanceRows: [], attendanceHistory: [], attendanceLedger: [],
  contracts: [], store: [], storeItems: [], assets: [], trades: [], events: [],
  market: { assets: [], trades: [], events: [] },
  settings: { difficultyPreset: "moderate", priceMultiplier: 1, incomeMultiplier: 1 },
  logs: [], dashboard: {
    activePlayerCount: 0, totalPlayers: 0, onlinePlayerCount: 0,
    attendanceSummary: { presentCount: 0, lateCount: 0, absentCount: 0 },
    leaderboard: [], recentActivity: [], marketStatus: "open",
  },
};
function responseFor(pathname) {
  if (pathname.endsWith("/session/bootstrap")) {
    return { data: {
      admin: { id: ADMIN_ID, accountId: ADMIN_ID, displayName: "Smoke Test Administrator",
        email: ADMIN_EMAIL, role: "game_admin", roles: ["game_admin"] },
      activeGame: game, games: [game], permissions: ["*"], roles: ["game_admin"],
      adminRole: "game_admin", csrfToken: "",
      session: { id: ADMIN_ID, csrfToken: "", expiresAt: new Date(Date.now() + 3600_000).toISOString() },
      capabilities: { notifications: false, securityHistory: "current_session_only",
        helpArticles: true, auditLogFlags: true, auditLogExport: true,
        overallScore: false, marketplaceAdminTrading: false },
    } };
  }
  if (pathname.endsWith("/auth/sign-out")) return { data: { signedOut: true } };
  return { data: common };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1728, height: 912 } });
const page = await context.newPage();
const errors = [];
const requests = [];
page.on("pageerror", (error) => errors.push(`pageerror: ${error.stack || error.message}`));
page.on("console", (message) => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
page.on("request", (request) => requests.push(`${request.method()} ${request.url()}`));
page.on("requestfailed", (request) => {
  const url = request.url();
  const failure = request.failure()?.errorText || "";
  if (url.endsWith("/favicon.ico")) return;
  if (/\/admin\/assets\/videos\/[^/]+\.mp4$/i.test(url) && failure.includes("ERR_ABORTED")) return;
  if (url.includes("/auth/v1/logout") && failure.includes("ERR_ABORTED")) return;
  if (failure.includes("ERR_ABORTED") && /\?mode=admin/.test(url)) return;
  errors.push(`requestfailed: ${request.method()} ${url} ${failure}`);
});
await page.addInitScript(({ accessToken, gameId, adminId, gameCode, adminEmail }) => {
  sessionStorage.setItem("econovaria.admin.auth.v1", JSON.stringify({
    accessToken, refreshToken: "smoke-refresh-token", user: { id: adminId, email: adminEmail },
  }));
  sessionStorage.setItem("econovaria.admin.selected-game.v1", gameId);
  sessionStorage.setItem(`econovaria.admin.game-code.v1:${gameId}`, gameCode);
}, { accessToken: token, gameId: GAME_ID, adminId: ADMIN_ID, gameCode: GAME_CODE, adminEmail: ADMIN_EMAIL });
await page.route("**/functions/v1/admin-api/**", async (route) => {
  const request = route.request();
  if (request.method() === "OPTIONS") {
    await route.fulfill({ status: 204, headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, apikey, content-type, x-econovaria-game-id, x-econovaria-csrf",
      "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    }, body: "" });
    return;
  }
  await route.fulfill({ status: 200, contentType: "application/json",
    headers: { "access-control-allow-origin": "*", "cache-control": "no-store" },
    body: JSON.stringify(responseFor(new URL(request.url()).pathname)) });
});
await page.route("**/auth/v1/logout", async (route) => route.fulfill({ status: 204, body: "" }));

async function clickRealAccountLogout() {
  const user = page.locator("[data-admin-terminal-user]").first();
  await user.waitFor({ state: "visible", timeout: 10_000 });
  await user.click();
  const menu = page.locator("[data-admin-terminal-user-menu]").first();
  await menu.waitFor({ state: "visible", timeout: 5_000 });
  const candidates = menu.locator("button, a, [role='button'], [data-admin-terminal-action]");
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
      visible: style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0,
    };
  }));
  writeFileSync(`${ARTIFACT_DIR}/real-account-menu-controls.json`, JSON.stringify(metadata, null, 2));
  const logoutIndex = metadata.findIndex((entry) => entry.visible && entry.signals.some((signal) =>
    /(?:^|[\s_-])(?:sign[\s_-]*out|log[\s_-]*out|logout)(?:$|[\s_-])/i.test(` ${signal} `),
  ));
  assert(logoutIndex >= 0, `No real account-menu logout control found: ${JSON.stringify(metadata)}`);
  const logoutControl = candidates.nth(logoutIndex);
  const selected = metadata[logoutIndex];
  await logoutControl.click();
  return selected;
}

try {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.locator("#adminPreview:not([hidden])").waitFor({ state: "visible", timeout: 15_000 });
  await page.locator("[data-admin-terminal-user]").first().waitFor({ state: "visible", timeout: 10_000 });

  const realControl = await clickRealAccountLogout();
  const modal = page.locator("[data-econovaria-admin-logout-confirmation]");
  await modal.waitFor({ state: "visible", timeout: 5_000 });
  const legacyVisible = await page.locator("[data-admin-terminal-modal-backdrop]").evaluateAll((nodes) => nodes.filter((node) => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return !node.hidden && style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }).length);
  assert(legacyVisible === 0, `Legacy logout modal remained visible alongside the owned confirmation: ${legacyVisible}`);

  const state = await modal.evaluate((surface) => {
    const dialog = surface.querySelector('[role="dialog"]');
    const title = surface.querySelector("h2").getBoundingClientRect();
    const description = surface.querySelector(".econovaria-admin-logout-confirmation__description").getBoundingClientRect();
    const context = surface.querySelector(".econovaria-admin-logout-confirmation__context").getBoundingClientRect();
    const actionsNode = surface.querySelector(".econovaria-admin-logout-confirmation__actions");
    const actions = actionsNode.getBoundingClientRect();
    const dialogRect = dialog.getBoundingClientRect();
    const buttons = [...actionsNode.querySelectorAll("button")].map((button) => {
      const rect = button.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
    return {
      account: surface.querySelector("[data-econovaria-logout-account]")?.textContent?.trim(),
      game: surface.querySelector("[data-econovaria-logout-game]")?.textContent?.trim(),
      code: surface.querySelector("[data-econovaria-logout-code]")?.textContent?.trim(),
      dialog: { width: dialogRect.width, height: dialogRect.height, top: dialogRect.top, bottom: dialogRect.bottom },
      viewport: { width: innerWidth, height: innerHeight },
      titleBottom: title.bottom, descriptionTop: description.top, descriptionBottom: description.bottom,
      contextTop: context.top, contextBottom: context.bottom, actionsTop: actions.top,
      actionsHeight: actions.height, actionsDisplay: getComputedStyle(actionsNode).display,
      actionsDirection: getComputedStyle(actionsNode).flexDirection, buttons,
      horizontalOverflow: dialog.scrollWidth > dialog.clientWidth + 1,
    };
  });
  assert(state.account === ADMIN_EMAIL, `Logout modal account drifted: ${state.account}`);
  assert(state.game === GAME_NAME, `Logout modal game drifted: ${state.game}`);
  assert(state.code === GAME_CODE, `Logout modal code drifted: ${state.code}`);
  assert(state.dialog.width <= 682 && state.dialog.width <= state.viewport.width - 30,
    `Logout modal is not width-bounded: ${JSON.stringify(state.dialog)}`);
  assert(state.dialog.height <= state.viewport.height - 30 && state.dialog.top >= 14 && state.dialog.bottom <= state.viewport.height - 14,
    `Logout modal exceeds the viewport: ${JSON.stringify(state.dialog)}`);
  assert(state.titleBottom <= state.descriptionTop + 1, "Logout title overlaps its description.");
  assert(state.descriptionBottom <= state.contextTop + 1, "Logout description overlaps context cards.");
  assert(state.contextBottom <= state.actionsTop + 1, "Logout context overlaps the action row.");
  assert(state.actionsDisplay === "flex" && state.actionsDirection === "row",
    `Logout actions are not a desktop row: ${state.actionsDisplay}/${state.actionsDirection}`);
  assert(state.actionsHeight <= 50, `Logout action row stretched vertically: ${state.actionsHeight}`);
  assert(state.buttons.length === 2 && state.buttons.every((rect) => rect.height >= 43 && rect.height <= 45),
    `Logout buttons are not fixed at 44px: ${JSON.stringify(state.buttons)}`);
  assert(Math.abs(state.buttons[0].y - state.buttons[1].y) <= 1, "Logout buttons are not aligned.");
  assert(!state.horizontalOverflow, "Logout modal overflows horizontally.");
  await page.screenshot({ path: `${ARTIFACT_DIR}/logout-confirmation-real-account-control.png`, fullPage: true });
  writeFileSync(`${ARTIFACT_DIR}/logout-confirmation.html`, await page.content());

  await modal.locator("[data-econovaria-logout-cancel]").last().click();
  await modal.waitFor({ state: "detached", timeout: 5_000 });
  assert(await page.evaluate(() => Boolean(sessionStorage.getItem("econovaria.admin.auth.v1"))),
    "Cancel incorrectly cleared the Admin session.");

  await clickRealAccountLogout();
  await modal.waitFor({ state: "visible", timeout: 5_000 });
  await Promise.all([
    page.waitForURL((url) => url.searchParams.get("mode") === "admin" && url.searchParams.get("reason") === "signed-out",
      { timeout: 10_000 }),
    modal.locator("[data-econovaria-logout-confirm]").click(),
  ]);
  const storage = await page.evaluate(() => ({
    session: sessionStorage.getItem("econovaria.admin.auth.v1"),
    selectedGame: sessionStorage.getItem("econovaria.admin.selected-game.v1"),
    csrf: sessionStorage.getItem("econovaria.admin.csrf.v1"),
  }));
  assert(storage.session === null && storage.selectedGame === null && storage.csrf === null,
    `Logout left local state: ${JSON.stringify(storage)}`);
  assert(requests.some((entry) => entry.includes("POST") && entry.includes("/auth/v1/logout")),
    `Supabase Auth revocation was not attempted: ${JSON.stringify(requests)}`);
  assert(errors.length === 0, errors.join("\n"));
  writeFileSync(`${ARTIFACT_DIR}/report.json`, JSON.stringify({ realControl, state, storage, errors }, null, 2));
  console.log(JSON.stringify({ realAccountLogoutControl: true, boundedLogoutModal: true,
    legacyModalSuppressed: true, cancelPreservesSession: true,
    confirmationClearsSession: true, confirmationRedirects: true }, null, 2));
} catch (error) {
  await page.screenshot({ path: `${ARTIFACT_DIR}/failure.png`, fullPage: true }).catch(() => {});
  writeFileSync(`${ARTIFACT_DIR}/failure.html`, await page.content().catch(() => ""));
  writeFileSync(`${ARTIFACT_DIR}/failure.txt`, String(error?.stack || error?.message || error));
  throw error;
} finally {
  await browser.close();
}

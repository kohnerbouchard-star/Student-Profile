import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE_URL = process.env.ADMIN_SMOKE_BASE_URL || "http://127.0.0.1:4173/admin/";
const ARTIFACT_DIR = process.env.ADMIN_GAME_SESSION_ARTIFACT_DIR ||
  "admin-browser-smoke-artifacts/game-session-controls";
const GAME_ID = "00000000-0000-4000-8000-000000000001";
const ADMIN_ID = "00000000-0000-4000-8000-000000000002";
const GAME_CODE = "SMOKE1";
const GAME_NAME = "Browser Smoke Game";
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
  title: GAME_NAME,
  name: GAME_NAME,
  status: "active",
  lifecycleState: "active",
  gameCode: GAME_CODE,
  joinCode: GAME_CODE,
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
  selectedGame: game,
  games: [game],
  players: [],
  attendance: [],
  attendanceRows: [],
  attendanceHistory: [],
  attendanceLedger: [],
  contracts: [],
  store: [],
  storeItems: [],
  assets: [],
  trades: [],
  events: [],
  market: { assets: [], trades: [], events: [] },
  settings: {
    difficultyPreset: "moderate",
    priceMultiplier: 1,
    incomeMultiplier: 1,
  },
  logs: [],
  dashboard: {
    activePlayerCount: 0,
    totalPlayers: 0,
    onlinePlayerCount: 0,
    attendanceSummary: { presentCount: 0, lateCount: 0, absentCount: 0 },
    leaderboard: [],
    recentActivity: [],
    marketStatus: "open",
  },
};

function responseFor(pathname) {
  if (pathname.endsWith("/session/bootstrap")) {
    return {
      data: {
        admin: {
          id: ADMIN_ID,
          accountId: ADMIN_ID,
          displayName: "Smoke Test Administrator",
          email: "admin@example.test",
          role: "game_admin",
          roles: ["game_admin"],
        },
        activeGame: game,
        games: [game],
        permissions: ["*"],
        roles: ["game_admin"],
        adminRole: "game_admin",
        csrfToken: "",
        session: {
          id: ADMIN_ID,
          csrfToken: "",
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        },
        capabilities: {
          notifications: false,
          securityHistory: "current_session_only",
          helpArticles: true,
          auditLogFlags: true,
          auditLogExport: true,
          overallScore: false,
          marketplaceAdminTrading: false,
        },
      },
    };
  }
  if (pathname.endsWith("/auth/sign-out")) {
    return { data: { signedOut: true } };
  }
  return { data: common };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors = [];
const requests = [];

page.on("pageerror", (error) => errors.push(`pageerror: ${error.stack || error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text()}`);
});
page.on("request", (request) => requests.push(`${request.method()} ${request.url()}`));
page.on("requestfailed", (request) => {
  const url = request.url();
  const failure = request.failure()?.errorText || "";
  if (url.endsWith("/favicon.ico")) return;
  if (/\/admin\/assets\/videos\/[^/]+\.mp4$/i.test(url) && failure.includes("ERR_ABORTED")) return;
  if (failure.includes("ERR_ABORTED") && /\?mode=admin/.test(url)) return;
  errors.push(`requestfailed: ${request.method()} ${url} ${failure}`);
});

await page.addInitScript(({ accessToken, gameId, adminId, gameCode }) => {
  sessionStorage.setItem("econovaria.admin.auth.v1", JSON.stringify({
    accessToken,
    refreshToken: "smoke-refresh-token",
    user: { id: adminId, email: "admin@example.test" },
  }));
  sessionStorage.setItem("econovaria.admin.selected-game.v1", gameId);
  sessionStorage.setItem(`econovaria.admin.game-code.v1:${gameId}`, gameCode);
}, {
  accessToken: token,
  gameId: GAME_ID,
  adminId: ADMIN_ID,
  gameCode: GAME_CODE,
});

await page.route("**/functions/v1/admin-api/**", async (route) => {
  const request = route.request();
  if (request.method() === "OPTIONS") {
    await route.fulfill({
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers":
          "authorization, apikey, content-type, x-econovaria-game-id, x-econovaria-csrf",
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

await page.route("**/auth/v1/logout", async (route) => {
  await route.fulfill({ status: 204, body: "" });
});

try {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.locator("#adminPreview:not([hidden])").waitFor({ state: "visible", timeout: 15_000 });

  const card = page.locator("[data-econovaria-game-session-card]").first();
  await card.waitFor({ state: "visible", timeout: 10_000 });
  const cardState = await card.evaluate((node) => ({
    gameId: node.dataset.gameId,
    gameCode: node.dataset.gameCode,
    name: node.querySelector("[data-econovaria-selected-game-name]")?.textContent?.trim(),
    code: node.querySelector("[data-econovaria-selected-game-code]")?.textContent?.trim(),
    copy: node.querySelector("[data-econovaria-game-target-copy]")?.textContent?.trim(),
    width: node.getBoundingClientRect().width,
    parentWidth: node.parentElement?.getBoundingClientRect().width || 0,
  }));
  assert(cardState.gameId === GAME_ID, `Selected-game card targeted ${cardState.gameId}.`);
  assert(cardState.gameCode === GAME_CODE, `Selected-game card stored ${cardState.gameCode}.`);
  assert(cardState.name === GAME_NAME, `Selected-game card displayed ${cardState.name}.`);
  assert(cardState.code === GAME_CODE, `Selected-game card displayed code ${cardState.code}.`);
  assert(cardState.copy?.includes(`Players using ${GAME_CODE} join ${GAME_NAME}`),
    `Selected-game card did not explain the multiplayer target: ${cardState.copy}`);
  assert(cardState.width <= cardState.parentWidth + 1, "Selected-game card overflowed its sidebar host.");

  const shareButton = card.locator("[data-econovaria-share-game]");
  assert(await shareButton.isEnabled(), "Share Game Code button is disabled.");
  await shareButton.click();

  const shareSurface = page.locator('[data-modal-id="share-game-access"]:visible').last();
  await shareSurface.waitFor({ state: "visible", timeout: 5_000 });
  const shareState = await shareSurface.evaluate((surface) => {
    const dialog = surface.querySelector('[role="dialog"]') || surface;
    const playerLink = dialog.querySelector(
      "input[id*='share-student-link'], input[id*='share-player-link'], [data-econovaria-player-link]",
    );
    const rect = dialog.getBoundingClientRect();
    return {
      context: dialog.querySelector("[data-econovaria-share-game-context]")?.textContent?.trim(),
      code: dialog.querySelector(".admin-terminal-share-modal-code strong")?.textContent?.trim(),
      playerLink: playerLink?.value || "",
      adminLinkVisible: [...dialog.querySelectorAll("input[id*='share-admin-link']")]
        .some((input) => {
          const field = input.closest("label, .admin-terminal-field, .admin-terminal-share-field");
          return field && !field.hidden && getComputedStyle(field).display !== "none";
        }),
      width: rect.width,
      viewportWidth: innerWidth,
      horizontalOverflow: dialog.scrollWidth > dialog.clientWidth + 1,
    };
  });
  assert(shareState.context?.includes(GAME_CODE) && shareState.context?.includes(GAME_NAME),
    `Share panel omitted the selected game context: ${shareState.context}`);
  assert(shareState.code === GAME_CODE, `Share panel displayed ${shareState.code}.`);
  assert(shareState.playerLink.includes("mode=player"),
    `Player link did not target Player mode: ${shareState.playerLink}`);
  assert(shareState.playerLink.includes(`gameCode=${GAME_CODE}`),
    `Player link did not include the selected code: ${shareState.playerLink}`);
  assert(shareState.adminLinkVisible === false, "Player share panel still exposes the Admin link.");
  assert(shareState.width <= Math.min(622, shareState.viewportWidth - 30),
    `Share dialog width is not bounded: ${shareState.width}.`);
  assert(shareState.horizontalOverflow === false, "Share dialog overflows horizontally.");

  await page.screenshot({ path: `${ARTIFACT_DIR}/share-game-access.png`, fullPage: true });
  writeFileSync(`${ARTIFACT_DIR}/share-game-access.html`, await page.content());

  await page.keyboard.press("Escape");
  await shareSurface.waitFor({ state: "hidden", timeout: 5_000 }).catch(async () => {
    await shareSurface.waitFor({ state: "detached", timeout: 5_000 });
  });

  const logoutButton = card.locator("[data-econovaria-admin-logout]");
  const logoutHitTarget = await logoutButton.evaluate((button) => {
    const rect = button.getBoundingClientRect();
    const point = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return {
      enabled: !button.disabled,
      pointerEvents: getComputedStyle(button).pointerEvents,
      topTargetIsButton: point === button || button.contains(point),
      width: rect.width,
      height: rect.height,
    };
  });
  assert(logoutHitTarget.enabled, "Admin logout button is disabled.");
  assert(logoutHitTarget.pointerEvents !== "none", "Admin logout button ignores pointer input.");
  assert(logoutHitTarget.topTargetIsButton, "Another element covers the Admin logout button.");
  assert(logoutHitTarget.width > 60 && logoutHitTarget.height >= 36,
    `Admin logout hit target is too small: ${JSON.stringify(logoutHitTarget)}.`);

  await Promise.all([
    page.waitForURL((url) =>
      url.searchParams.get("mode") === "admin" &&
      url.searchParams.get("reason") === "signed-out",
    { timeout: 10_000 }),
    logoutButton.click(),
  ]);

  const storageState = await page.evaluate(() => ({
    session: sessionStorage.getItem("econovaria.admin.auth.v1"),
    selectedGame: sessionStorage.getItem("econovaria.admin.selected-game.v1"),
    csrf: sessionStorage.getItem("econovaria.admin.csrf.v1"),
  }));
  assert(storageState.session === null, "Admin logout left the session token in storage.");
  assert(storageState.selectedGame === null, "Admin logout left the selected game in storage.");
  assert(storageState.csrf === null, "Admin logout left the CSRF token in storage.");
  assert(requests.some((entry) => entry.includes("POST") && entry.includes("/auth/sign-out")),
    `Admin logout did not call the authenticated sign-out route: ${JSON.stringify(requests)}`);

  writeFileSync(`${ARTIFACT_DIR}/report.json`, JSON.stringify({
    cardState,
    shareState,
    logoutHitTarget,
    storageState,
    signOutRequestObserved: true,
    errors,
  }, null, 2));
  assert(errors.length === 0, errors.join("\n"));

  console.log(JSON.stringify({
    selectedGameTarget: true,
    gameCode: GAME_CODE,
    shareButtonClickable: true,
    sharePanelBounded: true,
    playerLinkTargetsSelectedGame: true,
    adminLinkHidden: true,
    logoutButtonClickable: true,
    authenticatedSignOutObserved: true,
    sessionCleared: true,
  }, null, 2));
} catch (error) {
  await page.screenshot({ path: `${ARTIFACT_DIR}/failure.png`, fullPage: true }).catch(() => {});
  writeFileSync(`${ARTIFACT_DIR}/failure.html`, await page.content().catch(() => ""));
  writeFileSync(`${ARTIFACT_DIR}/failure.json`, JSON.stringify({
    error: String(error?.stack || error),
    errors,
    requests,
  }, null, 2));
  throw error;
} finally {
  await context.close();
  await browser.close();
}

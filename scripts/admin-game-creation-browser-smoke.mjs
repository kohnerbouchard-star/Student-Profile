import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE_URL = process.env.ADMIN_SMOKE_BASE_URL || "http://127.0.0.1:4173/admin/";
const ARTIFACT_DIR = process.env.ADMIN_GAME_CREATION_ARTIFACT_DIR ||
  "admin-browser-smoke-artifacts/game-creation";
const ADMIN_ID = "00000000-0000-4000-8000-000000000010";
const OLD_GAME_ID = "00000000-0000-4000-8000-000000000011";
const NEW_GAME_ID = "00000000-0000-4000-8000-000000000012";
const OLD_GAME_CODE = "OLD-GAME";
const NEW_GAME_CODE = "ECO-NEW12345";
const NEW_GAME_NAME = "Period 4 Economy";
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

const originalGame = {
  id: OLD_GAME_ID,
  gameId: OLD_GAME_ID,
  gameSessionId: OLD_GAME_ID,
  name: "Original Game",
  title: "Original Game",
  status: "active",
  lifecycleState: "active",
  gameCode: OLD_GAME_CODE,
  joinCode: OLD_GAME_CODE,
};

const createdGame = {
  id: NEW_GAME_ID,
  gameId: NEW_GAME_ID,
  gameSessionId: NEW_GAME_ID,
  name: NEW_GAME_NAME,
  title: NEW_GAME_NAME,
  status: "active",
  lifecycleState: "active",
  provisioningStatus: "ready",
  packId: "econovaria.beta-seed-pack.v1",
  packVersion: "1.0.0-beta",
  joinCodeStatus: "active",
  gameCode: NEW_GAME_CODE,
  joinCode: NEW_GAME_CODE,
};

const common = {
  gameId: OLD_GAME_ID,
  gameSessionId: OLD_GAME_ID,
  activeGameId: OLD_GAME_ID,
  selectedGameSessionId: OLD_GAME_ID,
  permissions: ["*"],
  roles: ["game_admin"],
  adminRole: "game_admin",
  game: originalGame,
  activeGame: originalGame,
  selectedGame: originalGame,
  games: [originalGame],
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
        activeGame: originalGame,
        games: [originalGame],
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
  return { data: common };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors = [];
let createRequest = null;

page.on("pageerror", (error) => errors.push(`pageerror: ${error.stack || error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text()}`);
});
page.on("requestfailed", (request) => {
  const failure = request.failure()?.errorText || "";
  if (request.url().endsWith("/favicon.ico")) return;
  if (/\/admin\/assets\/videos\/[^/]+\.mp4$/i.test(request.url()) && failure.includes("ERR_ABORTED")) return;
  errors.push(`requestfailed: ${request.method()} ${request.url()} ${failure}`);
});

await page.addInitScript(({ accessToken, adminId, gameId, gameCode }) => {
  sessionStorage.setItem("econovaria.admin.auth.v1", JSON.stringify({
    accessToken,
    refreshToken: "smoke-refresh-token",
    user: { id: adminId, email: "admin@example.test" },
  }));
  sessionStorage.setItem("econovaria.admin.selected-game.v1", gameId);
  sessionStorage.setItem(`econovaria.admin.game-code.v1:${gameId}`, gameCode);
}, {
  accessToken: token,
  adminId: ADMIN_ID,
  gameId: OLD_GAME_ID,
  gameCode: OLD_GAME_CODE,
});

async function fulfillAdminRoute(route) {
  const request = route.request();
  const url = new URL(request.url());
  if (request.method() === "OPTIONS") {
    await route.fulfill({
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers":
          "authorization, apikey, content-type, x-idempotency-key, x-request-id, x-econovaria-game-id",
        "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      },
      body: "",
    });
    return;
  }

  const isCreate = request.method() === "POST" &&
    (url.pathname.endsWith("/functions/v1/admin-api/games") ||
      url.pathname.endsWith("/api/admin/games"));
  if (isCreate) {
    createRequest = {
      url: request.url(),
      headers: await request.allHeaders(),
      body: request.postDataJSON(),
    };
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*", "cache-control": "no-store" },
      body: JSON.stringify({
        data: {
          game: createdGame,
          joinCode: NEW_GAME_CODE,
          joinCodeStatus: "active",
          joinCodeReissueRequired: false,
          counts: {
            marketAssets: 240,
            contracts: 30,
            storeItems: 50,
            worldLocations: 50,
            worldRoutes: 13,
            worldCountries: 10,
            arrivalClassGrants: 8,
          },
          contentGates: {
            crafting: "blocked_by_catalog_authority",
            story: "not_published",
            arrivalGrantProcessor: "not_implemented",
          },
          replayed: false,
        },
      }),
    });
    return;
  }

  await route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*", "cache-control": "no-store" },
    body: JSON.stringify(responseFor(url.pathname)),
  });
}

await page.route("**/functions/v1/admin-api/**", fulfillAdminRoute);
await page.route("**/api/admin/**", fulfillAdminRoute);

try {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.locator("#adminPreview:not([hidden])").waitFor({ state: "visible", timeout: 15_000 });

  const card = page.locator("[data-econovaria-game-session-card]").first();
  await card.waitFor({ state: "visible", timeout: 10_000 });
  const createButton = card.locator("[data-econovaria-create-game]");
  await createButton.waitFor({ state: "visible", timeout: 10_000 });

  const hitTarget = await createButton.evaluate((button) => {
    const rect = button.getBoundingClientRect();
    const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return {
      enabled: !button.disabled,
      width: rect.width,
      height: rect.height,
      pointerEvents: getComputedStyle(button).pointerEvents,
      topTargetIsButton: target === button || button.contains(target),
    };
  });
  assert(hitTarget.enabled, "New game button is disabled.");
  assert(hitTarget.height >= 36 && hitTarget.width > 60,
    `New game hit target is too small: ${JSON.stringify(hitTarget)}.`);
  assert(hitTarget.pointerEvents !== "none" && hitTarget.topTargetIsButton,
    `New game button is not clickable: ${JSON.stringify(hitTarget)}.`);

  await createButton.focus();
  assert(await createButton.evaluate((node) => document.activeElement === node),
    "New game button could not receive keyboard focus.");
  await page.keyboard.press("Enter");

  const modal = page.locator('[data-modal-id="create-multiplayer-game"]:visible');
  await modal.waitFor({ state: "visible", timeout: 5_000 });
  const dialogState = await modal.evaluate((surface) => {
    const dialog = surface.querySelector('[role="dialog"]');
    const rect = dialog?.getBoundingClientRect();
    return {
      modal: dialog?.getAttribute("aria-modal"),
      labelledBy: dialog?.getAttribute("aria-labelledby"),
      width: rect?.width || 0,
      viewportWidth: innerWidth,
      overflow: dialog ? dialog.scrollWidth > dialog.clientWidth + 1 : true,
      activeName: document.activeElement?.getAttribute("name"),
    };
  });
  assert(dialogState.modal === "true" && dialogState.labelledBy,
    `Game creation dialog lacks modal semantics: ${JSON.stringify(dialogState)}.`);
  assert(dialogState.activeName === "gameName", "Game name did not receive initial focus.");
  assert(dialogState.width <= Math.min(682, dialogState.viewportWidth - 26),
    `Game creation dialog is not bounded: ${dialogState.width}.`);
  assert(dialogState.overflow === false, "Game creation dialog overflows horizontally.");

  await modal.locator('input[name="gameName"]').fill(NEW_GAME_NAME);
  await modal.locator('select[name="difficultyPreset"]').selectOption("hard");
  await modal.locator('input[name="timezone"]').fill("Asia/Seoul");
  await modal.locator('[data-econovaria-game-create-submit]').click();

  const success = modal.locator("[data-econovaria-game-create-success]");
  await success.waitFor({ state: "visible", timeout: 10_000 });
  assert(createRequest, "Admin create flow did not issue POST /games.");
  assert(/^game\.create\.[0-9a-f-]{36}$/i.test(createRequest.headers["x-idempotency-key"] || ""),
    `Create request omitted a valid idempotency key: ${JSON.stringify(createRequest.headers)}.`);
  assert(createRequest.headers.authorization === `Bearer ${token}`,
    "Create request did not use the authenticated Admin session.");
  assert(createRequest.body.name === NEW_GAME_NAME, "Create request changed the game name.");
  assert(createRequest.body.difficultyPreset === "hard", "Create request changed difficulty.");
  assert(createRequest.body.stockMarketWindow?.timezone === "Asia/Seoul",
    "Create request changed the market timezone.");

  const successState = await success.evaluate((node) => ({
    heading: node.querySelector("h3")?.textContent?.trim(),
    code: node.querySelector(".econovaria-game-create-success__code strong")?.textContent?.trim(),
    counts: [...node.querySelectorAll("dd")].map((entry) => entry.textContent?.trim()),
  }));
  assert(successState.heading === NEW_GAME_NAME, `Success screen displayed ${successState.heading}.`);
  assert(successState.code === NEW_GAME_CODE, `Success screen displayed code ${successState.code}.`);
  assert(JSON.stringify(successState.counts) === JSON.stringify(["240", "30", "50", "50"]),
    `Success counts are incorrect: ${JSON.stringify(successState.counts)}.`);

  const storage = await page.evaluate(({ gameId }) => ({
    selectedGame: sessionStorage.getItem("econovaria.admin.selected-game.v1"),
    cachedCode: sessionStorage.getItem(`econovaria.admin.game-code.v1:${gameId}`),
  }), { gameId: NEW_GAME_ID });
  assert(storage.selectedGame === NEW_GAME_ID, `Created game was not selected: ${storage.selectedGame}.`);
  assert(storage.cachedCode === NEW_GAME_CODE, `Created Game Code was not cached: ${storage.cachedCode}.`);

  await page.waitForFunction(({ gameId, code, name }) => {
    const card = document.querySelector("[data-econovaria-game-session-card]");
    return card?.dataset.gameId === gameId &&
      card?.dataset.gameCode === code &&
      card?.querySelector("[data-econovaria-selected-game-name]")?.textContent?.trim() === name;
  }, { gameId: NEW_GAME_ID, code: NEW_GAME_CODE, name: NEW_GAME_NAME }, { timeout: 5_000 });

  await success.locator("[data-econovaria-created-game-share]").click();
  const shareSurface = page.locator('[data-modal-id="share-game-access"]:visible').last();
  await shareSurface.waitFor({ state: "visible", timeout: 5_000 });
  const shareState = await shareSurface.evaluate((surface) => {
    const dialog = surface.querySelector('[role="dialog"]') || surface;
    const playerLink = dialog.querySelector(
      "input[id*='share-student-link'], input[id*='share-player-link'], [data-econovaria-player-link]",
    );
    return {
      code: dialog.querySelector(".admin-terminal-share-modal-code strong")?.textContent?.trim(),
      context: dialog.querySelector("[data-econovaria-share-game-context]")?.textContent?.trim(),
      playerLink: playerLink?.value || "",
    };
  });
  assert(shareState.code === NEW_GAME_CODE, `Share panel displayed ${shareState.code}.`);
  assert(shareState.context?.includes(NEW_GAME_CODE) && shareState.context?.includes(NEW_GAME_NAME),
    `Share panel lost the created game target: ${shareState.context}.`);
  const playerUrl = new URL(shareState.playerLink);
  assert(playerUrl.pathname === "/play", `Share link targets ${playerUrl.pathname}.`);
  assert(playerUrl.searchParams.get("mode") === "student", "Share link lost Player mode.");
  assert(playerUrl.searchParams.get("gameCode") === NEW_GAME_CODE,
    `Share link targets the wrong Game Code: ${shareState.playerLink}.`);

  await page.screenshot({ path: `${ARTIFACT_DIR}/created-game-share.png`, fullPage: true });
  writeFileSync(`${ARTIFACT_DIR}/report.json`, JSON.stringify({
    hitTarget,
    dialogState,
    createRequest: {
      url: createRequest.url,
      idempotencyKeyPresent: true,
      body: createRequest.body,
    },
    successState,
    storage,
    shareState,
    errors,
  }, null, 2));
  assert(errors.length === 0, errors.join("\n"));

  console.log(JSON.stringify({
    adminCreateButtonClickable: true,
    modalAccessibleAndBounded: true,
    authenticatedProvisioningRequest: true,
    idempotencyKeyPresent: true,
    createdGameSelected: true,
    oneTimeGameCodeDisplayed: true,
    shareTargetsCreatedMultiplayerGame: true,
  }, null, 2));
} catch (error) {
  await page.screenshot({ path: `${ARTIFACT_DIR}/failure.png`, fullPage: true }).catch(() => {});
  writeFileSync(`${ARTIFACT_DIR}/failure.html`, await page.content().catch(() => ""));
  throw error;
} finally {
  await context.close();
  await browser.close();
}

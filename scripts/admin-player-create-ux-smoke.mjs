import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE_URL = process.env.ADMIN_SMOKE_BASE_URL || "http://127.0.0.1:4173/admin/";
const ARTIFACT_DIR = process.env.ADMIN_SMOKE_ARTIFACT_DIR || "admin-browser-smoke-artifacts";
const GAME_ID = "00000000-0000-4000-8000-000000000301";
const ADMIN_ID = "00000000-0000-4000-8000-000000000302";
const MANUAL_IDENTIFIER = "RFID:MANUAL-303";
const MANUAL_ACCESS_CODE = "MANUAL-8246";

mkdirSync(ARTIFACT_DIR, { recursive: true });

function base64Url(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64")
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function flatten(value) {
  const source = value && typeof value === "object" ? value : {};
  const payload = source.payload && typeof source.payload === "object" ? source.payload : {};
  return { ...source, ...payload };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
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
  title: "Player Create UX Smoke Game",
  name: "Player Create UX Smoke Game",
  status: "active",
  gameCode: "CREATE1",
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
  roster: [],
  attendance: [],
  attendanceRows: [],
  attendanceHistory: [],
  attendanceLedger: [],
  attendanceSummary: {
    presentCount: 0,
    lateCount: 0,
    absentCount: 0,
    activePlayerCount: 0,
    rewardsIssuedCount: 0,
    rewardsIssuedTotal: 0,
  },
  attendanceCounts: { present: 0, late: 0, absent: 0, total: 0 },
  contracts: [],
  store: [],
  storeItems: [],
  assets: [],
  trades: [],
  events: [],
  market: { assets: [], trades: [], events: [] },
  settings: {},
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

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
const writes = [];
let createCount = 0;

page.on("pageerror", (error) => errors.push(`pageerror: ${error.stack || error.message}`));
page.on("requestfailed", (request) => {
  const failure = request.failure()?.errorText || "";
  if (request.url().endsWith("/favicon.ico")) return;
  if (/\/admin\/assets\/videos\/[^/]+\.mp4$/i.test(request.url()) && failure.includes("ERR_ABORTED")) return;
  errors.push(`requestfailed: ${request.method()} ${request.url()} ${failure}`);
});

await page.addInitScript(({ accessToken, gameId, adminId }) => {
  sessionStorage.setItem("econovaria.admin.auth.v1", JSON.stringify({
    accessToken,
    refreshToken: "player-create-ux-refresh-token",
    user: { id: adminId, email: "admin@example.test" },
  }));
  sessionStorage.setItem("econovaria.admin.selected-game.v1", gameId);
}, { accessToken: token, gameId: GAME_ID, adminId: ADMIN_ID });

await page.route("**/functions/v1/admin-api/**", async (route) => {
  const request = route.request();
  const pathname = new URL(request.url()).pathname;
  const method = request.method();

  if (method === "OPTIONS") {
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

  if (method === "POST" && pathname.endsWith(`/games/${GAME_ID}/players`)) {
    const body = request.postDataJSON();
    const payload = flatten(body);
    writes.push({ pathname, method, headers: request.headers(), body, payload });
    createCount += 1;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*", "cache-control": "no-store" },
      body: JSON.stringify({
        ok: true,
        player: {
          id: `00000000-0000-4000-8000-${String(300 + createCount).padStart(12, "0")}`,
          displayName: payload.displayName,
          rosterLabel: payload.rosterLabel || null,
          playerIdentifier: payload.playerIdentifier,
          status: "active",
        },
        accessCode: {
          studentCode: payload.accessCode,
          status: "active",
          createdAt: new Date().toISOString(),
        },
      }),
    });
    return;
  }

  const body = pathname.endsWith("/session/bootstrap")
    ? {
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
          capabilities: {},
        },
      }
    : { data: common };

  await route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*", "cache-control": "no-store" },
    body: JSON.stringify(body),
  });
});

await page.route("**/functions/v1/classroom-api/**", async (route) => {
  errors.push(`Unexpected direct classroom request: ${route.request().method()} ${route.request().url()}`);
  await route.fulfill({
    status: 500,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify({ error: { code: "unexpected_direct_request" } }),
  });
});

async function openAddPlayer() {
  await page.locator('[data-admin-section="Overview"]').click();
  await page.locator('[data-admin-terminal-action="add-player"]').first().click();
  const form = page.locator("[data-admin-terminal-player-form]");
  await form.waitFor({ state: "visible", timeout: 5000 });
  await form.locator('[name="playerIdentifier"]').waitFor({ state: "visible", timeout: 5000 });
  await page.waitForFunction(() => {
    const identifier = document.querySelector('[data-admin-terminal-player-form] [name="playerIdentifier"]');
    const accessCode = document.querySelector('[data-admin-terminal-player-form] [name="accessCode"]');
    return Boolean(identifier && accessCode && !identifier.required && !accessCode.required);
  }, null, { timeout: 5000 });
  return form;
}

async function submitPlayer({ displayName, rosterLabel, playerIdentifier = "", accessCode = "" }) {
  const form = await openAddPlayer();
  await form.locator('[name="displayName"]').fill(displayName);
  await form.locator('[name="rosterLabel"]').fill(rosterLabel);
  await form.locator('[name="status"]').selectOption("active");
  await form.locator('[name="startingLocation"]').selectOption("NORTHREACH");
  await form.locator('[name="playerIdentifier"]').fill(playerIdentifier);
  await form.locator('[name="accessCode"]').fill(accessCode);

  const startIndex = writes.length;
  await form.locator('[data-admin-terminal-action="create-player"]').click();
  await page.waitForFunction((index) => window.__unused || index < 0, -1).catch(() => {});
  const started = Date.now();
  while (writes.length === startIndex && Date.now() - started < 5000) {
    await page.waitForTimeout(50);
  }
  assert(writes.length === startIndex + 1, `Expected one create request, received ${writes.length - startIndex}.`);

  const confirmation = page.locator("[data-admin-player-created-confirmation]");
  await confirmation.waitFor({ state: "visible", timeout: 5000 });
  await page.waitForTimeout(50);
  const result = {
    write: writes.at(-1),
    title: await confirmation.locator("h3").textContent(),
    identifier: await confirmation.locator("[data-admin-player-created-identifier]").textContent(),
    accessCode: await confirmation.locator("[data-admin-player-created-access-code]").textContent(),
    modalClass: await confirmation.locator("section").first().getAttribute("class"),
    legacyDialogs: await page.locator("[data-admin-player-access-code-dialog]").count(),
    notes: await confirmation.locator(".admin-terminal-player-created-credential small").allTextContents(),
  };
  await confirmation.locator("[data-admin-player-created-done]").click();
  await confirmation.waitFor({ state: "detached", timeout: 5000 });
  return result;
}

try {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("#adminPreview:not([hidden])", { timeout: 15_000 });

  const auto = await submitPlayer({
    displayName: "Auto Credential Player",
    rosterLabel: "AUTO-301",
  });
  assert(/^PLR-[A-HJ-NP-Z2-9]{8}$/.test(auto.write.payload.playerIdentifier), `Unexpected generated Player ID ${auto.write.payload.playerIdentifier}.`);
  assert(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(auto.write.payload.accessCode), `Unexpected generated Access Code ${auto.write.payload.accessCode}.`);
  assert(auto.identifier === auto.write.payload.playerIdentifier, "Confirmation Player ID does not match the create payload.");
  assert(auto.accessCode === auto.write.payload.accessCode, "Confirmation Access Code does not match the create payload.");
  assert(auto.notes.every((note) => /generated automatically/i.test(note)), `Generated credential notes are incorrect: ${JSON.stringify(auto.notes)}.`);
  assert(auto.legacyDialogs === 0, "Legacy credential overlay remains in the DOM.");
  assert(/admin-terminal-modal/.test(auto.modalClass || ""), "Confirmation does not use the v606 modal class.");

  const manual = await submitPlayer({
    displayName: "Manual Credential Player",
    rosterLabel: "MANUAL-302",
    playerIdentifier: MANUAL_IDENTIFIER,
    accessCode: MANUAL_ACCESS_CODE,
  });
  assert(manual.write.payload.playerIdentifier === MANUAL_IDENTIFIER, "Manual Player ID was overwritten.");
  assert(manual.write.payload.accessCode === MANUAL_ACCESS_CODE, "Manual Access Code was overwritten.");
  assert(manual.identifier === MANUAL_IDENTIFIER && manual.accessCode === MANUAL_ACCESS_CODE, "Manual credentials were not confirmed correctly.");
  assert(manual.notes.every((note) => /custom value saved/i.test(note)), `Manual credential notes are incorrect: ${JSON.stringify(manual.notes)}.`);

  if (errors.length) throw new Error(errors[0]);

  writeFileSync(`${ARTIFACT_DIR}/player-create-ux-runtime.json`, JSON.stringify({ auto, manual, writes, errors }, null, 2));
  await page.screenshot({ path: `${ARTIFACT_DIR}/player-create-ux.png`, fullPage: true });
  console.log("Add Player automatic credentials and v606 confirmation smoke passed.");
} catch (error) {
  writeFileSync(`${ARTIFACT_DIR}/player-create-ux-runtime.json`, JSON.stringify({ writes, errors }, null, 2));
  await page.screenshot({ path: `${ARTIFACT_DIR}/player-create-ux-failure.png`, fullPage: true });
  writeFileSync(`${ARTIFACT_DIR}/player-create-ux-failure.html`, await page.content());
  console.error(error.stack || error.message || String(error));
  console.error("PLAYER_CREATE_WRITES", JSON.stringify(writes, null, 2));
  process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
}
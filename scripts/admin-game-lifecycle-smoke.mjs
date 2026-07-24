import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE_URL = process.env.ADMIN_SMOKE_BASE_URL || "http://127.0.0.1:4173/admin/";
const ARTIFACT_DIR = process.env.ADMIN_SMOKE_ARTIFACT_DIR || "admin-browser-smoke-artifacts/game-lifecycle";
const GAME_ID = "00000000-0000-4000-8000-000000000911";
const ADMIN_ID = "00000000-0000-4000-8000-000000000912";
mkdirSync(ARTIFACT_DIR, { recursive: true });

const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64")
  .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const now = Math.floor(Date.now() / 1000);
const token = `${encode({ alg: "none", typ: "JWT" })}.${encode({
  sub: ADMIN_ID,
  email: "admin@example.test",
  role: "authenticated",
  iat: now,
  exp: now + 3600,
})}.signature`;

const browser = await chromium.launch({ headless: true });
const evidence = [];

try {
  for (const viewport of [
    { name: "desktop", width: 1440, height: 1000, fullFlow: true },
    { name: "compact", width: 1024, height: 768, fullFlow: false },
    { name: "narrow", width: 768, height: 900, fullFlow: false },
  ]) {
    evidence.push(await exerciseViewport(viewport));
  }
  writeFileSync(`${ARTIFACT_DIR}/game-lifecycle-summary.json`, JSON.stringify(evidence, null, 2));
  console.log("Admin game lifecycle controls passed desktop, compact, and narrow verification.");
} catch (error) {
  writeFileSync(`${ARTIFACT_DIR}/game-lifecycle-summary.json`, JSON.stringify({ evidence, failure: error.message }, null, 2));
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
} finally {
  await browser.close();
}

async function exerciseViewport(viewport) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();
  const errors = [];
  const mutationRequests = [];
  const pointerEvents = [];
  let lifecycle = state("draft", 1, 0);

  page.on("pageerror", (error) => errors.push(`pageerror: ${error.stack || error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText || "";
    if (request.url().endsWith("/favicon.ico")) return;
    if (/\/admin\/assets\/videos\/[^/]+[.]mp4$/i.test(request.url()) && failure.includes("ERR_ABORTED")) return;
    if (/\/admin\/assets\/icons\/media-placeholder[.]svg$/i.test(request.url()) && failure.includes("ERR_ABORTED")) return;
    errors.push(`requestfailed: ${request.method()} ${request.url()} ${failure}`);
  });

  await page.addInitScript(({ accessToken, gameId, adminId }) => {
    sessionStorage.setItem("econovaria.admin.auth.v1", JSON.stringify({
      accessToken,
      refreshToken: "game-lifecycle-refresh-token",
      user: { id: adminId, email: "admin@example.test" },
    }));
    sessionStorage.setItem("econovaria.admin.selected-game.v1", gameId);
    window.__gameLifecyclePointerEvents = [];
    for (const type of ["pointerdown", "mousedown", "touchstart"]) {
      window.addEventListener(type, (event) => {
        window.__gameLifecyclePointerEvents.push({ type: event.type, target: event.target?.tagName || "" });
      }, true);
    }
  }, { accessToken: token, gameId: GAME_ID, adminId: ADMIN_ID });

  await page.route("**/functions/v1/admin-api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders(), body: "" });
      return;
    }
    if (url.pathname.endsWith(`/games/${GAME_ID}/lifecycle`) && request.method() === "GET") {
      await json(route, 200, { data: { lifecycle } });
      return;
    }
    const actionMatch = url.pathname.match(new RegExp(`/games/${GAME_ID}/lifecycle/(start|pause|resume|end|archive)$`));
    const revoke = url.pathname.endsWith(`/games/${GAME_ID}/sessions/revoke`);
    if ((actionMatch || revoke) && request.method() === "POST") {
      const body = request.postDataJSON();
      const action = revoke ? "revoke_sessions" : actionMatch[1];
      mutationRequests.push({ action, body, headers: request.headers(), url: url.pathname });
      lifecycle = transition(lifecycle, action);
      await json(route, 200, {
        data: {
          action,
          outcome: "applied",
          previousState: null,
          lifecycle,
        },
      });
      return;
    }

    const game = {
      id: GAME_ID,
      gameId: GAME_ID,
      gameSessionId: GAME_ID,
      title: "Lifecycle Audit Game",
      name: "Lifecycle Audit Game",
      status: lifecycle.operationalStatus,
      gameCode: "LIFE01",
    };
    const model = baseModel(game);
    const payload = url.pathname.endsWith("/session/bootstrap")
      ? { data: bootstrap(game) }
      : { data: model };
    await json(route, 200, payload);
  });

  try {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForSelector("#adminPreview:not([hidden])", { timeout: 15_000 });
    await page.waitForSelector("[data-admin-terminal-user]", { timeout: 15_000 });
    await page.waitForTimeout(1000);

    await keyboardActivate(page.locator("[data-admin-terminal-user]").first());
    const gamesAction = page.locator('[data-admin-terminal-action="open-admin-games"]').first();
    await gamesAction.waitFor({ state: "visible", timeout: 5000 });
    await keyboardActivate(gamesAction);
    const root = page.locator("[data-admin-game-lifecycle]").first();
    await root.waitFor({ state: "visible", timeout: 12_000 });
    await page.waitForFunction(() => document.querySelector("[data-admin-game-lifecycle]")?.getAttribute("aria-busy") !== "true");

    assert(await root.locator(".admin-game-lifecycle__status", { hasText: "Not started" }).isVisible(), `${viewport.name}: lifecycle did not load draft state.`);
    assert(await root.getByRole("button", { name: "Start game" }).isVisible(), `${viewport.name}: start control missing.`);
    await assertLayout(page, root, viewport.name);

    if (viewport.fullFlow) {
      await activateAction(page, root, "Start game");
      await confirmModal(page, "Start game");
      await root.locator(".admin-game-lifecycle__status", { hasText: "Active" }).waitFor({ state: "visible" });

      await activateAction(page, root, "Pause mutations");
      await confirmModal(page, "Pause mutations");
      await root.locator(".admin-game-lifecycle__status", { hasText: "Paused" }).waitFor({ state: "visible" });

      await activateAction(page, root, "Resume game");
      await confirmModal(page, "Resume game");
      await root.locator(".admin-game-lifecycle__status", { hasText: "Active" }).waitFor({ state: "visible" });

      await activateAction(page, root, "Revoke Player sessions");
      await confirmModal(page, "Revoke Player sessions", "REVOKE");
      await root.getByText(/Player session\(s\) revoked/).waitFor({ state: "visible" });

      await activateAction(page, root, "End game");
      await confirmModal(page, "End game", "END");
      await root.locator(".admin-game-lifecycle__status", { hasText: "Ended" }).waitFor({ state: "visible" });

      await activateAction(page, root, "Archive game");
      await confirmModal(page, "Archive game", "ARCHIVE");
      await root.locator(".admin-game-lifecycle__status", { hasText: "Archived" }).waitFor({ state: "visible" });

      assert(mutationRequests.map((item) => item.action).join(",") === "start,pause,resume,revoke_sessions,end,archive", "Lifecycle mutation order was incorrect.");
      for (const item of mutationRequests) {
        assert(Object.keys(item.body).sort().join(",") === "expectedVersion,idempotencyKey", `${item.action}: unexpected request fields.`);
        assert(!JSON.stringify(item.body).includes(GAME_ID), `${item.action}: browser duplicated game scope in the body.`);
        assert(/^admin[.]lifecycle[.]/.test(item.body.idempotencyKey), `${item.action}: safe idempotency key missing.`);
        assert(item.headers["x-idempotency-key"] === item.body.idempotencyKey, `${item.action}: header/body idempotency mismatch.`);
      }
    }

    const browserEvidence = await page.evaluate(() => ({
      pointerEvents: window.__gameLifecyclePointerEvents || [],
      width: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
      modalCount: [...document.querySelectorAll("[data-admin-terminal-modal-backdrop]")].filter((element) => {
        const rect = element.getBoundingClientRect();
        return !element.hidden && rect.width > 0 && rect.height > 0;
      }).length,
      runtimeStyles: document.querySelectorAll("style[id]").length,
    }));
    pointerEvents.push(...browserEvidence.pointerEvents);
    assert(errors.length === 0, errors[0] || `${viewport.name}: browser error.`);
    assert(pointerEvents.length === 0, `${viewport.name}: keyboard flow emitted pointer events.`);
    assert(browserEvidence.width <= browserEvidence.viewport + 2, `${viewport.name}: lifecycle controls overflow horizontally.`);
    assert(browserEvidence.modalCount === 0, `${viewport.name}: modal remained open.`);
    assert(browserEvidence.runtimeStyles === 0, `${viewport.name}: runtime style tag introduced.`);

    await page.screenshot({ path: `${ARTIFACT_DIR}/${viewport.name}.png`, fullPage: true });
    return { viewport, mutationRequests, browserEvidence, finalLifecycle: lifecycle };
  } catch (error) {
    await page.screenshot({ path: `${ARTIFACT_DIR}/${viewport.name}-failure.png`, fullPage: true });
    writeFileSync(`${ARTIFACT_DIR}/${viewport.name}-failure.html`, await page.content());
    throw error;
  } finally {
    await context.close();
  }
}

async function keyboardActivate(locator) {
  await locator.waitFor({ state: "visible", timeout: 5000 });
  await locator.focus();
  await locator.press("Enter");
}

async function activateAction(page, root, name) {
  const button = root.getByRole("button", { name, exact: true });
  await keyboardActivate(button);
  await page.locator("[data-admin-terminal-modal-backdrop]").waitFor({ state: "visible" });
}

async function confirmModal(page, name, phrase = "") {
  const modal = page.locator("[data-admin-terminal-modal-backdrop]").last();
  if (phrase) {
    const input = modal.locator("input").first();
    await input.fill(phrase);
  }
  const confirm = modal.getByRole("button", { name, exact: true }).last();
  await confirm.press("Enter");
  await modal.waitFor({ state: "detached", timeout: 8000 });
  await page.waitForTimeout(2500);
  await page.waitForFunction(() => {
    const root = document.querySelector("[data-admin-game-lifecycle]");
    return root && root.getAttribute("aria-busy") !== "true";
  }, { timeout: 8000 });
}

async function assertLayout(page, root, name) {
  const geometry = await root.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const buttons = [...element.querySelectorAll("button")].map((button) => {
      const box = button.getBoundingClientRect();
      return { width: box.width, height: box.height, left: box.left, right: box.right };
    });
    return { rect: { left: rect.left, right: rect.right, width: rect.width }, buttons };
  });
  assert(geometry.rect.width > 240, `${name}: lifecycle panel collapsed.`);
  assert(geometry.buttons.every((button) => button.height >= 38), `${name}: lifecycle button target is too small.`);
  assert(geometry.buttons.every((button) => button.left >= geometry.rect.left - 1 && button.right <= geometry.rect.right + 1), `${name}: lifecycle button escaped the panel.`);
  assert((await page.locator("[data-admin-game-lifecycle]").count()) === 1, `${name}: duplicate lifecycle panels mounted.`);
}

function transition(current, action) {
  const version = current.version + 1;
  if (action === "pause") return state("paused", version, current.activePlayerSessions);
  if (action === "resume") return state("active", version, current.activePlayerSessions);
  if (action === "revoke_sessions") return { ...state(current.state, version, 0), sessionsRevoked: current.activePlayerSessions };
  if (action === "end") return { ...state("ended", version, 0), sessionsRevoked: current.activePlayerSessions, joinCodeStatus: "revoked" };
  if (action === "archive") return { ...state("archived", version, 0), joinCodeStatus: "revoked" };
  if (action === "start") return state("active", version, 3);
  throw new Error(`Unsupported action: ${action}`);
}

function state(stateName, version, activePlayerSessions) {
  const operationalStatus = stateName === "active" ? "active" : ["draft", "paused"].includes(stateName) ? "disabled" : "archived";
  const allowedActions = {
    draft: ["start", "revoke_sessions"],
    active: ["pause", "end", "revoke_sessions"],
    paused: ["resume", "end", "revoke_sessions"],
    ended: ["archive", "revoke_sessions"],
    archived: ["revoke_sessions"],
  }[stateName];
  return {
    state: stateName,
    operationalStatus,
    version,
    joinCodeStatus: ["ended", "archived"].includes(stateName) ? "revoked" : "active",
    activePlayerSessions,
    sessionsRevoked: 0,
    allowedActions,
    startedAt: "2026-07-19T06:00:00.000Z",
    pausedAt: stateName === "paused" ? new Date().toISOString() : null,
    resumedAt: null,
    endedAt: stateName === "ended" ? new Date().toISOString() : null,
    archivedAt: stateName === "archived" ? new Date().toISOString() : null,
    updatedAt: new Date().toISOString(),
  };
}

function baseModel(game) {
  return {
    gameId: GAME_ID,
    gameSessionId: GAME_ID,
    activeGameId: GAME_ID,
    selectedGameSessionId: GAME_ID,
    permissions: ["*"],
    roles: ["game_admin"],
    adminRole: "game_admin",
    game,
    activeGame: game,
    games: [game],
    players: [], roster: [], attendance: [], attendanceRows: [], attendanceHistory: [], attendanceLedger: [],
    contracts: [], contractSubmissions: [], store: [], storeItems: [], assets: [], trades: [], events: [], logs: [],
    market: { assets: [], trades: [], events: [] },
    notifications: [], adminNotifications: [],
    adminProfile: { id: ADMIN_ID, displayName: "Lifecycle Administrator", email: "admin@example.test", role: "game_admin", avatarUrl: "" },
    adminSettings: {}, adminSecurity: { sessions: [], currentSession: null }, adminHelp: { articles: [] },
    settings: { difficultyPreset: "moderate", backendDifficultyPreset: "moderate", difficultyBasePreset: "moderate", priceMultiplier: 1, incomeMultiplier: 1, shockFrequency: 1, shockSeverity: 1, recoverySupport: 1, tradeMultiplier: 1, configSaveState: "saved" },
    dashboard: { activePlayerCount: 0, totalPlayers: 0, onlinePlayerCount: 0, attendanceSummary: { presentCount: 0, lateCount: 0, absentCount: 0 }, leaderboard: [], recentActivity: [], marketStatus: "open" },
  };
}

function bootstrap(game) {
  return {
    admin: { id: ADMIN_ID, accountId: ADMIN_ID, displayName: "Lifecycle Administrator", email: "admin@example.test", role: "game_admin", roles: ["game_admin"] },
    activeGame: game,
    games: [game],
    permissions: ["*"],
    roles: ["game_admin"],
    adminRole: "game_admin",
    csrfToken: "",
    session: { id: ADMIN_ID, csrfToken: "", expiresAt: new Date(Date.now() + 3600_000).toISOString() },
    capabilities: { notifications: false, securityHistory: "current_session_only", helpArticles: true, auditLogFlags: true, auditLogExport: true, overallScore: false, marketplaceAdminTrading: false },
  };
}

async function json(route, status, body) {
  await route.fulfill({ status, contentType: "application/json", headers: { ...corsHeaders(), "cache-control": "no-store" }, body: JSON.stringify(body) });
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, apikey, content-type, x-econovaria-game-id, x-econovaria-csrf, x-idempotency-key",
    "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

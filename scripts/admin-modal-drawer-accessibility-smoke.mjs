import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE_URL = process.env.ADMIN_SMOKE_BASE_URL || "http://127.0.0.1:4173/admin/";
const ARTIFACT_DIR = process.env.ADMIN_SMOKE_ARTIFACT_DIR || "admin-browser-smoke-artifacts/modal-drawer-accessibility";
const GAME_ID = "00000000-0000-4000-8000-000000002001";
const ADMIN_ID = "00000000-0000-4000-8000-000000002002";
const PLAYER_ID = "00000000-0000-4000-8000-000000002003";
const CONTRACT_ID = "00000000-0000-4000-8000-000000002004";
const PROGRESS_ID = "00000000-0000-4000-8000-000000002005";
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

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
  title: "Accessibility Matrix Game",
  name: "Accessibility Matrix Game",
  status: "active",
  gameCode: "A11Y02",
};

const player = {
  id: PLAYER_ID,
  playerId: PLAYER_ID,
  displayName: "Accessibility Matrix Player",
  name: "Accessibility Matrix Player",
  rosterLabel: "A11Y-PLAYER",
  playerIdentifier: "RFID:A11Y-PLAYER",
  status: "active",
  sessionStatus: "offline",
  countryCode: "NORTHREACH",
  countryName: "Northreach",
  location: "Northreach",
  currencyCode: "NRC",
  cashBalance: 125,
  netWorth: 125,
  balances: [{ accountType: "cash", balance: 125, currencyCode: "NRC" }],
  stockPositions: [],
  inventoryPositions: [],
};

const contract = {
  id: CONTRACT_ID,
  contractId: CONTRACT_ID,
  title: "Accessibility Review Contract",
  description: "Verify stacked dialog accessibility.",
  objective: "Verify stacked dialog accessibility.",
  instructions: "Review the submitted evidence.",
  status: "active",
  visibility: "public",
  submittedCount: 1,
  submissionCount: 1,
  completedCount: 0,
  rewardIssuedCount: 0,
  progressCount: 1,
};

const submission = {
  id: PROGRESS_ID,
  progressId: PROGRESS_ID,
  submissionId: PROGRESS_ID,
  contractId: CONTRACT_ID,
  contract_id: CONTRACT_ID,
  playerId: PLAYER_ID,
  player_id: PLAYER_ID,
  playerName: player.displayName,
  displayName: player.displayName,
  rosterLabel: player.rosterLabel,
  countryCode: player.countryCode,
  status: "submitted",
  summary: "Accessibility evidence submitted.",
  evidence: "Accessibility evidence submitted.",
  before: "—",
  after: "submitted",
  evidencePayload: { writtenResponse: "Accessibility evidence submitted.", answers: [] },
  evidence_payload: { writtenResponse: "Accessibility evidence submitted." },
  resultPayload: {},
  result_payload: {},
  submittedAt: "2026-07-19T00:00:00.000Z",
  submitted_at: "2026-07-19T00:00:00.000Z",
  rewardIssuedAt: null,
  reward_issued_at: null,
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
  games: [game],
  players: [player],
  roster: [player],
  leaderboard: [],
  attendance: [],
  attendanceRows: [],
  attendanceHistory: [],
  attendanceLedger: [],
  attendanceSummary: {
    presentCount: 0,
    lateCount: 0,
    absentCount: 0,
    activePlayerCount: 1,
    rewardsIssuedCount: 0,
    rewardsIssuedTotal: 0,
  },
  attendanceCounts: { present: 0, late: 0, absent: 0, total: 1 },
  contracts: [contract],
  assignments: [contract],
  contractSubmissions: [submission],
  submissions: [submission],
  store: [],
  storeItems: [],
  assets: [],
  trades: [],
  events: [],
  market: { assets: [], trades: [], events: [] },
  settings: {
    difficultyPreset: "moderate",
    backendDifficultyPreset: "moderate",
    difficultyBasePreset: "moderate",
    priceMultiplier: 1,
    incomeMultiplier: 1,
    shockFrequency: 1,
    shockSeverity: 1,
    recoverySupport: 1,
    tradeMultiplier: 1,
    configSaveState: "saved",
  },
  logs: [],
  dashboard: {
    activePlayerCount: 1,
    totalPlayers: 1,
    onlinePlayerCount: 0,
    attendanceSummary: { presentCount: 0, lateCount: 0, absentCount: 0 },
    leaderboard: [],
    recentActivity: [],
    marketStatus: "open",
    contracts: [contract],
  },
};

function bootstrapResponse() {
  return {
    data: {
      admin: {
        id: ADMIN_ID,
        accountId: ADMIN_ID,
        displayName: "Accessibility Matrix Administrator",
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
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
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

async function createPage(browser, label) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];

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

  await page.addInitScript(({ accessToken, gameId, adminId }) => {
    sessionStorage.setItem("econovaria.admin.auth.v1", JSON.stringify({
      accessToken,
      refreshToken: "accessibility-matrix-refresh-token",
      user: { id: adminId, email: "admin@example.test" },
    }));
    sessionStorage.setItem("econovaria.admin.selected-game.v1", gameId);
    window.__adminAccessibilityPointerEvents = [];
    for (const type of ["pointerdown", "mousedown", "touchstart"]) {
      window.addEventListener(type, (event) => {
        window.__adminAccessibilityPointerEvents.push({ type: event.type, target: event.target?.tagName || "" });
      }, true);
    }
  }, { accessToken: token, gameId: GAME_ID, adminId: ADMIN_ID });

  await page.route("**/functions/v1/admin-api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
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

    let body = { data: common };
    if (pathname.endsWith("/session/bootstrap")) body = bootstrapResponse();
    else if (pathname.endsWith(`/games/${GAME_ID}/players`)) body = { data: { ...common, players: [player], roster: [player] } };
    else if (pathname.endsWith(`/games/${GAME_ID}/contracts/${CONTRACT_ID}/submissions`)) {
      body = { data: { contractId: CONTRACT_ID, contractSubmissions: [submission], submissions: [submission] } };
    } else if (pathname.endsWith(`/games/${GAME_ID}/contract-submissions`)) {
      body = { data: { contractSubmissions: [submission], submissions: [submission] } };
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*", "cache-control": "no-store" },
      body: JSON.stringify(body),
    });
  });

  return { context, page, errors, label };
}

async function loadAdmin(page) {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("#adminPreview:not([hidden])", { timeout: 15_000 });
  await page.waitForSelector("[data-admin-section]", { timeout: 15_000 });
  await page.waitForTimeout(500);
}

async function keyboardActivate(page, locator, key = "Enter") {
  await locator.waitFor({ state: "visible", timeout: 10_000 });
  await locator.focus();
  assert(await locator.evaluate((node) => document.activeElement === node), "Keyboard opener did not receive focus.");
  await page.keyboard.press(key);
}

async function navigate(page, section) {
  const control = page.locator(`[data-admin-section="${section}"]:visible`).first();
  await keyboardActivate(page, control, "Enter");
  await page.waitForFunction((expected) => {
    const active = [...document.querySelectorAll("[data-admin-section]")].find((node) =>
      node.getAttribute("aria-current") === "page" ||
      node.getAttribute("aria-selected") === "true" ||
      node.classList.contains("active") ||
      node.classList.contains("is-active")
    );
    return active?.getAttribute("data-admin-section") === expected;
  }, section, { timeout: 5000 });
  await page.waitForTimeout(250);
  return control;
}

async function authoritativeAction(page, action, section = "Overview") {
  if (section !== "Overview") await navigate(page, section);
  await page.evaluate(() => window.EconovariaAdminOverviewQuickActions?.reconcile?.());
  const opener = page.locator(`[data-admin-terminal-action="${action}"]:visible`).first();
  await opener.waitFor({ state: "visible", timeout: 10_000 });
  return opener;
}

async function markBoundary(page, container, label) {
  const result = await container.evaluate((root, selector) => {
    root.querySelectorAll("[data-admin-a11y-boundary]").forEach((node) => node.removeAttribute("data-admin-a11y-boundary"));
    const controls = [...root.querySelectorAll(selector)].filter((node) => {
      if (!(node instanceof HTMLElement) || node.hidden || node.tabIndex < 0) return false;
      if (node.getAttribute("aria-hidden") === "true" || node.closest("[hidden], [inert], [aria-hidden='true']")) return false;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    });
    controls[0]?.setAttribute("data-admin-a11y-boundary", "first");
    controls.at(-1)?.setAttribute("data-admin-a11y-boundary", "last");
    return { count: controls.length };
  }, FOCUSABLE_SELECTOR);
  assert(result.count > 0, `${label} has no visible focusable controls.`);
  return {
    first: container.locator('[data-admin-a11y-boundary="first"]'),
    last: container.locator('[data-admin-a11y-boundary="last"]'),
    count: result.count,
  };
}

async function assertFocusTrap(page, container, label) {
  const activeInside = await container.evaluate((root) => root.contains(document.activeElement));
  assert(activeInside, `${label} did not move initial focus inside the surface.`);
  const boundary = await markBoundary(page, container, label);

  await boundary.first.focus();
  await page.keyboard.press("Shift+Tab");
  assert(await boundary.last.evaluate((node) => document.activeElement === node), `${label} did not wrap Shift+Tab from first to last.`);

  await boundary.last.focus();
  await page.keyboard.press("Tab");
  assert(await boundary.first.evaluate((node) => document.activeElement === node), `${label} did not wrap Tab from last to first.`);
  return boundary.count;
}

async function escapeAndRestore(page, surface, opener, label, options = {}) {
  await page.keyboard.press("Escape");
  if (options.dismiss === false) {
    await page.waitForTimeout(150);
    assert(await surface.isVisible(), `${label} dismissed even though Escape must be blocked.`);
    assert(await surface.evaluate((root) => root.contains(document.activeElement)), `${label} lost focus after blocked Escape.`);
    return;
  }

  await surface.waitFor({ state: "hidden", timeout: 5000 }).catch(async () => {
    await surface.waitFor({ state: "detached", timeout: 5000 });
  });
  await page.waitForTimeout(100);
  assert(await opener.evaluate((node) => document.activeElement === node), `${label} did not restore focus to its opener.`);
}

async function exerciseBasicModal(browser, definition) {
  const runtime = await createPage(browser, definition.label);
  const { context, page, errors } = runtime;
  try {
    await loadAdmin(page);
    const opener = await authoritativeAction(page, definition.action, definition.section);
    await keyboardActivate(page, opener, definition.key || "Enter");
    const backdrop = page.locator(".admin-terminal-modal-backdrop:visible").last();
    const dialog = backdrop.locator('[role="dialog"]').first();
    await dialog.waitFor({ state: "visible", timeout: 5000 });
    const focusableCount = await assertFocusTrap(page, dialog, definition.label);
    await escapeAndRestore(page, backdrop, opener, definition.label);
    assert(errors.length === 0, errors[0] || `${definition.label} emitted an unexpected browser error.`);
    return { label: definition.label, focusableCount, escape: "dismissed", restored: true };
  } finally {
    await context.close();
  }
}

async function exerciseContractStack(browser) {
  const { context, page, errors } = await createPage(browser, "Contract dialog stack");
  try {
    await loadAdmin(page);
    await navigate(page, "Assignments");
    const profileOpener = page.locator(`[data-admin-terminal-action="focus-contract"][data-contract-title="${contract.title}"]:visible`).first();
    await keyboardActivate(page, profileOpener);
    const profileBackdrop = page.locator('[data-modal-id="dashboard-contract-profile"]:visible');
    const profileDialog = profileBackdrop.locator('[role="dialog"]');
    await profileDialog.waitFor({ state: "visible", timeout: 5000 });
    const profileControls = await assertFocusTrap(page, profileDialog, "Contract profile dialog");

    const reviewOpener = profileDialog.locator('[data-admin-terminal-action="review-contract-submissions"]:visible').first();
    await keyboardActivate(page, reviewOpener);
    const reviewBackdrop = page.locator('[data-modal-id="contract-submission-review"]:visible');
    const reviewDialog = reviewBackdrop.locator('[role="dialog"]');
    await reviewDialog.waitFor({ state: "visible", timeout: 5000 });
    const reviewControls = await assertFocusTrap(page, reviewDialog, "Contract submission review dialog");
    await escapeAndRestore(page, reviewBackdrop, reviewOpener, "Contract submission review dialog");
    assert(await profileBackdrop.isVisible(), "Closing the submission review also removed the underlying Contract profile.");

    await escapeAndRestore(page, profileBackdrop, profileOpener, "Contract profile dialog");
    assert(errors.length === 0, errors[0] || "Contract dialog stack emitted an unexpected browser error.");
    return { profileControls, reviewControls, nestedRestore: true };
  } finally {
    await context.close();
  }
}

async function exercisePlayerDrawer(browser) {
  const { context, page, errors } = await createPage(browser, "Player drawer");
  try {
    await loadAdmin(page);
    await navigate(page, "Players");
    const opener = page.locator(`[data-admin-terminal-action="select-player-panel"][data-player-id="${PLAYER_ID}"]:visible`).first();
    await keyboardActivate(page, opener);
    const drawer = page.locator("[data-admin-terminal-player-drawer]:visible").first();
    await drawer.waitFor({ state: "visible", timeout: 5000 });
    const focusableCount = await assertFocusTrap(page, drawer, "Player drawer");
    await escapeAndRestore(page, drawer, opener, "Player drawer");
    assert(errors.length === 0, errors[0] || "Player drawer emitted an unexpected browser error.");
    return { focusableCount, escape: "dismissed", restored: true };
  } finally {
    await context.close();
  }
}

async function exerciseProtectedConfirmation(browser) {
  const { context, page, errors } = await createPage(browser, "Player credential confirmation");
  try {
    await loadAdmin(page);
    const opener = await authoritativeAction(page, "add-player", "Overview");
    await opener.focus();
    await page.evaluate(() => {
      const action = document.querySelector('[data-admin-terminal-action="add-player"]');
      window.EconovariaPlayerCreateUx?.renderConfirmation?.(
        {
          displayName: "Protected Confirmation Player",
          playerIdentifier: "PLR-A11Y02",
          studentCode: "A11Y-0202",
        },
        {
          displayName: "Protected Confirmation Player",
          playerIdentifier: "PLR-A11Y02",
          accessCode: "A11Y-0202",
          generatedIdentifier: true,
          generatedAccessCode: true,
        },
        action,
      );
    });

    const backdrop = page.locator("[data-admin-player-created-confirmation]:visible");
    const dialog = backdrop.locator('[role="dialog"]');
    await dialog.waitFor({ state: "visible", timeout: 5000 });
    const focusableCount = await assertFocusTrap(page, dialog, "Player credential confirmation");
    await escapeAndRestore(page, backdrop, opener, "Player credential confirmation", { dismiss: false });
    const done = dialog.locator("[data-admin-player-created-done]");
    await keyboardActivate(page, done);
    await backdrop.waitFor({ state: "detached", timeout: 5000 });
    await page.waitForTimeout(100);
    assert(await opener.evaluate((node) => document.activeElement === node), "Player credential confirmation did not restore focus after acknowledgement.");
    assert(errors.length === 0, errors[0] || "Player credential confirmation emitted an unexpected browser error.");
    return { focusableCount, escape: "blocked", acknowledged: true, restored: true };
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch({ headless: true });
const report = { basicModals: [], contractStack: null, playerDrawer: null, protectedConfirmation: null };
try {
  for (const definition of [
    { label: "Add Player modal", action: "add-player", section: "Overview", key: "Enter" },
    { label: "Add Contract modal", action: "add-contract", section: "Overview", key: "Space" },
    { label: "Add Store Item modal", action: "add-store-item", section: "Store", key: "Enter" },
    { label: "Attendance scanner modal", action: "scan-attendance", section: "Overview", key: "Space" },
  ]) {
    report.basicModals.push(await exerciseBasicModal(browser, definition));
  }
  report.contractStack = await exerciseContractStack(browser);
  report.playerDrawer = await exercisePlayerDrawer(browser);
  report.protectedConfirmation = await exerciseProtectedConfirmation(browser);
  writeFileSync(`${ARTIFACT_DIR}/modal-drawer-accessibility.json`, JSON.stringify(report, null, 2));
  console.log("Admin modal and drawer focus trap, Escape, and opener restoration matrix passed.");
} catch (error) {
  report.failure = error.stack || error.message || String(error);
  writeFileSync(`${ARTIFACT_DIR}/modal-drawer-accessibility.json`, JSON.stringify(report, null, 2));
  console.error(report.failure);
  process.exitCode = 1;
} finally {
  await browser.close();
}

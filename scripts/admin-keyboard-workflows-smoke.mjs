import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE_URL = process.env.ADMIN_SMOKE_BASE_URL || "http://127.0.0.1:4173/admin/";
const ARTIFACT_DIR = process.env.ADMIN_SMOKE_ARTIFACT_DIR || "admin-browser-smoke-artifacts/keyboard-workflows";
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
  title: "Keyboard Workflow Game",
  name: "Keyboard Workflow Game",
  status: "active",
  gameCode: "KEYWF1",
};

const player = {
  id: "00000000-0000-4000-8000-000000000003",
  playerId: "00000000-0000-4000-8000-000000000003",
  displayName: "Keyboard Workflow Player",
  name: "Keyboard Workflow Player",
  rosterLabel: "KEYBOARD-CREATE",
  status: "active",
  countryCode: "NORTHREACH",
  countryName: "Northreach",
  cashBalance: 0,
  netWorth: 0,
  currencyCode: "NRC",
};

const contract = {
  id: "00000000-0000-4000-8000-000000000004",
  contractId: "00000000-0000-4000-8000-000000000004",
  title: "Keyboard Workflow Contract",
  description: "Keyboard workflow objective",
  instructions: "Complete the keyboard workflow assignment.",
  status: "active",
  visibility: "active",
};

const storeItem = {
  id: "00000000-0000-4000-8000-000000000005",
  storeItemId: "00000000-0000-4000-8000-000000000005",
  itemUuid: "00000000-0000-4000-8000-000000000005",
  name: "Keyboard Workflow Item",
  title: "Keyboard Workflow Item",
  description: "Keyboard-created store item.",
  category: "material",
  price: 25,
  currencyCode: "XAL",
  stockQuantity: 10,
  stock: 10,
  status: "active",
  visibility: "visible",
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
    activePlayerCount: 0,
    totalPlayers: 0,
    onlinePlayerCount: 0,
    attendanceSummary: { presentCount: 0, lateCount: 0, absentCount: 0 },
    leaderboard: [],
    recentActivity: [],
    marketStatus: "open",
  },
};

function bootstrapResponse() {
  return {
    data: {
      admin: {
        id: ADMIN_ID,
        accountId: ADMIN_ID,
        displayName: "Keyboard Workflow Administrator",
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

function responseFor(pathname, method) {
  if (pathname.endsWith("/session/bootstrap")) return bootstrapResponse();
  if (method === "POST" && pathname.endsWith(`/games/${GAME_ID}/players`)) {
    return { data: { created: true, player, accessCode: "KEYBOARD-ACCESS" } };
  }
  if (method === "POST" && pathname.endsWith(`/games/${GAME_ID}/contracts`)) {
    return { data: { created: true, contract } };
  }
  if (method === "POST" && pathname.endsWith(`/games/${GAME_ID}/store/items`)) {
    return { data: { created: true, item: storeItem, storeItem } };
  }
  if (pathname.includes("/players")) return { data: { ...common, players: [player] } };
  if (pathname.includes("/contracts")) return { data: { ...common, contracts: [contract] } };
  if (pathname.includes("/store")) return { data: { ...common, store: [storeItem], storeItems: [storeItem] } };
  return { data: common };
}

function attendanceResponse() {
  return {
    ok: true,
    gameSession: { id: GAME_ID, name: game.name, status: "active" },
    player: {
      id: player.id,
      displayName: "Keyboard Attendance Player",
      rosterLabel: "KEY-ATT-001",
      status: "active",
    },
    attendance: {
      id: "00000000-0000-4000-8000-000000000006",
      status: "present",
      attendanceDate: "2026-07-19",
      clockedInAt: new Date().toISOString(),
      wasCreated: true,
      timezone: "Asia/Seoul",
    },
    reward: { amount: 1, currencyCode: "XAL", ledgerEntryId: null },
  };
}

async function createPage(browser, label) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  const writes = [];

  page.on("pageerror", (error) => errors.push(`pageerror: ${error.stack || error.message}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const messageText = message.text();
    if (label === "scanner" && /Failed to load resource:.*404 \(Not Found\)/i.test(messageText)) return;
    errors.push(`console: ${messageText}`);
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
      refreshToken: "keyboard-workflow-refresh-token",
      user: { id: adminId, email: "admin@example.test" },
    }));
    sessionStorage.setItem("econovaria.admin.selected-game.v1", gameId);
    window.__adminKeyboardPointerEvents = [];
    for (const type of ["pointerdown", "mousedown", "touchstart"]) {
      window.addEventListener(type, (event) => {
        window.__adminKeyboardPointerEvents.push({ type: event.type, target: event.target?.tagName || "" });
      }, true);
    }
  }, { accessToken: token, gameId: GAME_ID, adminId: ADMIN_ID });

  await page.route("**/functions/v1/admin-api/**", async (route) => {
    const request = route.request();
    const method = request.method();
    const pathname = new URL(request.url()).pathname;

    if (method === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "authorization, apikey, content-type, x-econovaria-game-id, x-econovaria-csrf, x-csrf-token",
          "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
        },
        body: "",
      });
      return;
    }

    let body = null;
    if (!["GET", "HEAD"].includes(method)) {
      try {
        body = request.postDataJSON();
      } catch (_) {
        body = request.postData();
      }
      writes.push({ service: "admin-api", method, pathname, body });
    }

    if (method === "POST" && pathname.endsWith(`/games/${GAME_ID}/attendance/scans`)) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({ error: { code: "route_not_found" } }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*", "cache-control": "no-store" },
      body: JSON.stringify(responseFor(pathname, method)),
    });
  });

  await page.route("**/functions/v1/classroom-api/**", async (route) => {
    const request = route.request();
    const method = request.method();
    const pathname = new URL(request.url()).pathname;

    if (method === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "authorization, apikey, content-type, x-econovaria-game-id",
          "access-control-allow-methods": "POST,OPTIONS",
        },
        body: "",
      });
      return;
    }

    writes.push({ service: "classroom-api", method, pathname, body: request.postDataJSON() });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*", "cache-control": "no-store" },
      body: JSON.stringify(attendanceResponse()),
    });
  });

  return { context, page, errors, writes, label };
}

async function loadSection(page, section = "Overview") {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("#adminPreview:not([hidden])", { timeout: 15_000 });
  const sectionControl = page.locator(`[data-admin-section="${section}"]`).first();
  await sectionControl.waitFor({ state: "visible", timeout: 15_000 });
  await sectionControl.focus();
  assert(await sectionControl.evaluate((node) => document.activeElement === node), `${section} navigation did not receive focus.`);
  await page.keyboard.press("Enter");
  await page.waitForFunction((expectedSection) => {
    const active = [...document.querySelectorAll("[data-admin-section]")].find((node) =>
      node.getAttribute("aria-current") === "page" ||
      node.getAttribute("aria-selected") === "true" ||
      node.classList.contains("active") ||
      node.classList.contains("is-active")
    );
    return active?.getAttribute("data-admin-section") === expectedSection;
  }, section, { timeout: 5000 });
  return sectionControl;
}

async function waitForAuthoritativeAction(page, action, section) {
  await page.evaluate(() => window.EconovariaAdminOverviewQuickActions?.reconcile?.());
  await page.waitForFunction(({ action, section }) => {
    const controls = [...document.querySelectorAll(`[data-admin-terminal-action="${CSS.escape(action)}"]`)];
    const control = controls.find((node) => {
      if (!(node instanceof HTMLElement) || node.hidden) return false;
      if (node.closest("[data-admin-shape-skeleton-stage], .admin-shape-surface-overlay")) return false;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 1 && rect.height > 1;
    });
    if (!(control instanceof HTMLElement)) return false;
    if (section === "Overview") return Boolean(control.closest("[data-admin-overview-quick-actions]"));
    if (action === "add-store-item" && section === "Store") {
      return !control.hasAttribute("data-admin-overview-hidden") &&
        !control.closest(".admin-overview-quick-actions-card");
    }
    return true;
  }, { action, section }, { timeout: 10_000 });
}

async function tabToControl(page, sectionControl, control, action) {
  await sectionControl.focus();
  assert(
    await sectionControl.evaluate((node) => document.activeElement === node),
    `${action} section control did not regain focus.`,
  );
  for (let tabs = 0; tabs <= 40; tabs += 1) {
    if (await control.evaluate((node) => document.activeElement === node)) return tabs;
    await page.keyboard.press("Tab");
  }
  throw new Error(`${action} was not reachable through sequential keyboard navigation.`);
}

async function openAction(page, action, key = "Enter", section = "Overview") {
  const sectionControl = await loadSection(page, section);
  await waitForAuthoritativeAction(page, action, section);
  const control = page.locator(`[data-admin-terminal-action="${action}"]:visible`).first();
  await control.waitFor({ state: "visible", timeout: 10_000 });
  const tabs = await tabToControl(page, sectionControl, control, action);
  await page.keyboard.press(key);
  await page.waitForSelector(".admin-terminal-modal:visible", { timeout: 5000 });
  assert(
    await page.evaluate(() => document.documentElement.getAttribute("data-admin-input-modality")) === "keyboard",
    `${action} did not retain keyboard modality.`,
  );
  return tabs;
}

async function keyboardReplace(page, locator, value) {
  await locator.waitFor({ state: "visible", timeout: 5000 });
  await locator.focus();
  assert(await locator.evaluate((node) => document.activeElement === node), `Field ${await locator.getAttribute("name")} did not receive focus.`);
  await page.keyboard.press("Control+A");
  await page.keyboard.type(value);
  assert(await locator.inputValue() === value, `Keyboard entry did not set ${await locator.getAttribute("name")} to ${value}.`);
}

async function keyboardSelectByValue(page, locator, expectedValue) {
  await locator.waitFor({ state: "visible", timeout: 5000 });
  const option = await locator.evaluate((node, value) => {
    if (!(node instanceof HTMLSelectElement)) return null;
    const index = [...node.options].findIndex((item) => item.value === value);
    return index < 0 ? null : { index, label: node.options[index].textContent || "" };
  }, expectedValue);
  assert(option, `Select is missing option value ${expectedValue}.`);

  await locator.focus();
  assert(await locator.evaluate((node) => document.activeElement === node), `Select ${await locator.getAttribute("name")} did not receive focus.`);
  await page.keyboard.press("Home");
  for (let index = 0; index < option.index; index += 1) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  assert(await locator.inputValue() === expectedValue, `Keyboard selection did not choose ${option.label || expectedValue}.`);
}

async function keyboardActivate(page, locator, key = "Enter") {
  await locator.waitFor({ state: "visible", timeout: 5000 });
  await locator.focus();
  assert(await locator.evaluate((node) => document.activeElement === node), "Action control did not receive focus.");
  await page.keyboard.press(key);
}

async function waitForWrite(writes, startIndex, predicate, timeoutMs = 7000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const match = writes.slice(startIndex).find(predicate);
    if (match) return match;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
}

async function assertKeyboardOnly(page, label) {
  const evidence = await page.evaluate(() => ({
    modality: document.documentElement.getAttribute("data-admin-input-modality"),
    pointerEvents: window.__adminKeyboardPointerEvents || [],
  }));
  assert(evidence.modality === "keyboard", `${label} lost keyboard input modality.`);
  assert(evidence.pointerEvents.length === 0, `${label} emitted pointer input: ${JSON.stringify(evidence.pointerEvents)}.`);
  return evidence;
}

function assertCreateWrite(write, suffix, action) {
  assert(write, `${action} sent no write request.`);
  assert(write.method === "POST", `${action} used ${write.method} instead of POST.`);
  assert(write.pathname.endsWith(suffix), `${action} used unexpected path ${write.pathname}.`);
  assert(write.body?.action === action, `${action} sent action ${write.body?.action || "missing"}.`);
  return write.body?.payload || {};
}

async function exercisePlayer(browser) {
  const runtime = await createPage(browser, "player");
  const { context, page, errors, writes } = runtime;
  try {
    const tabs = await openAction(page, "add-player", "Enter");
    const form = page.locator("[data-admin-terminal-player-form]");
    await keyboardReplace(page, form.locator('[name="displayName"]'), "Keyboard Workflow Player");
    await keyboardReplace(page, form.locator('[name="rosterLabel"]'), "KEYBOARD-CREATE");
    await keyboardSelectByValue(page, form.locator('[name="status"]'), "active");
    await keyboardSelectByValue(page, form.locator('[name="startingLocation"]'), "NORTHREACH");
    await keyboardReplace(page, form.locator('[name="notes"]'), "Created without pointer input.");

    const startIndex = writes.length;
    await keyboardActivate(page, form.locator('[data-admin-terminal-action="create-player"]'), "Enter");
    const write = await waitForWrite(writes, startIndex, (item) => item.pathname.endsWith(`/games/${GAME_ID}/players`));
    const payload = assertCreateWrite(write, `/games/${GAME_ID}/players`, "create-player");
    assert(payload.displayName === "Keyboard Workflow Player", `Player display name was not preserved: ${JSON.stringify(payload)}.`);
    assert(payload.startingLocation === "NORTHREACH", `Player starting location was not preserved: ${JSON.stringify(payload)}.`);
    const keyboard = await assertKeyboardOnly(page, "Add Player");
    assert(errors.length === 0, `Add Player emitted browser errors: ${errors[0]}`);
    return { action: "create-player", tabs, write, keyboard };
  } catch (error) {
    await page.screenshot({ path: `${ARTIFACT_DIR}/keyboard-player-failure.png`, fullPage: true });
    throw error;
  } finally {
    await context.close();
  }
}

async function exerciseContract(browser) {
  const runtime = await createPage(browser, "contract");
  const { context, page, errors, writes } = runtime;
  try {
    const tabs = await openAction(page, "add-contract", "Space");
    const form = page.locator("[data-admin-terminal-contract-form]");
    await keyboardReplace(page, form.locator('[name="title"]'), "Keyboard Workflow Contract");
    await keyboardReplace(page, form.locator('[name="objective"]'), "Verify keyboard-only Contract creation.");
    await keyboardReplace(page, form.locator('[name="instructions"]'), "Complete the keyboard workflow assignment.");
    await keyboardReplace(page, form.locator('[name="evidence"]'), "Submit a keyboard-created response.");

    const startIndex = writes.length;
    await keyboardActivate(page, form.locator('[data-admin-terminal-action="create-contract"]'), "Enter");
    const write = await waitForWrite(writes, startIndex, (item) => item.pathname.endsWith(`/games/${GAME_ID}/contracts`));
    const payload = assertCreateWrite(write, `/games/${GAME_ID}/contracts`, "create-contract");
    assert(payload.title === "Keyboard Workflow Contract", `Contract title was not preserved: ${JSON.stringify(payload)}.`);
    assert(payload.publishNow === true, `Contract publish state was not preserved: ${JSON.stringify(payload)}.`);
    const keyboard = await assertKeyboardOnly(page, "Add Contract");
    assert(errors.length === 0, `Add Contract emitted browser errors: ${errors[0]}`);
    return { action: "create-contract", tabs, write, keyboard };
  } catch (error) {
    await page.screenshot({ path: `${ARTIFACT_DIR}/keyboard-contract-failure.png`, fullPage: true });
    throw error;
  } finally {
    await context.close();
  }
}

async function exerciseStore(browser) {
  const runtime = await createPage(browser, "store");
  const { context, page, errors, writes } = runtime;
  try {
    const tabs = await openAction(page, "add-store-item", "Enter", "Store");
    const form = page.locator("[data-admin-terminal-store-form]");
    await keyboardReplace(page, form.locator('[name="itemName"]'), "Keyboard Workflow Item");
    await keyboardReplace(page, form.locator('[name="description"]'), "Keyboard-created store item.");
    await keyboardSelectByValue(page, form.locator('[name="category"]'), "Material");
    await keyboardSelectByValue(page, form.locator('[name="itemType"]'), "One-time use");
    await keyboardSelectByValue(page, form.locator('[name="status"]'), "Active");
    await keyboardReplace(page, form.locator('[name="price"]'), "25");
    await keyboardSelectByValue(page, form.locator('[name="stockMode"]'), "Limited");
    await keyboardReplace(page, form.locator('[name="stockQuantity"]'), "10");
    await keyboardSelectByValue(page, form.locator('[name="visibility"]'), "All players");

    const startIndex = writes.length;
    await keyboardActivate(page, form.locator('[data-admin-terminal-action="save-store-item"]'), "Space");
    const write = await waitForWrite(writes, startIndex, (item) => item.pathname.endsWith(`/games/${GAME_ID}/store/items`));
    const payload = assertCreateWrite(write, `/games/${GAME_ID}/store/items`, "save-store-item");
    assert(payload.name === "Keyboard Workflow Item", `Store item name was not preserved: ${JSON.stringify(payload)}.`);
    assert(payload.category === "material", `Store category was not normalized: ${JSON.stringify(payload)}.`);
    assert(payload.price === 25 && payload.stockQuantity === 10, `Store numeric values were not normalized: ${JSON.stringify(payload)}.`);
    const keyboard = await assertKeyboardOnly(page, "Add Store Item");
    assert(errors.length === 0, `Add Store Item emitted browser errors: ${errors[0]}`);
    return { action: "save-store-item", tabs, write, keyboard };
  } catch (error) {
    await page.screenshot({ path: `${ARTIFACT_DIR}/keyboard-store-failure.png`, fullPage: true });
    throw error;
  } finally {
    await context.close();
  }
}

async function exerciseScanner(browser) {
  const runtime = await createPage(browser, "scanner");
  const { context, page, errors, writes } = runtime;
  try {
    const tabs = await openAction(page, "scan-attendance", "Space");
    await keyboardActivate(page, page.locator('[data-admin-terminal-set-mode="manual"]'), "Enter");
    const panel = page.locator("[data-admin-terminal-manual-panel]");
    await panel.waitFor({ state: "visible", timeout: 5000 });
    const input = panel.locator("[data-admin-terminal-manual-scan-input]");
    await keyboardReplace(page, input, "PLAYER-CODE-123");

    const startIndex = writes.length;
    await keyboardActivate(page, panel.locator('[data-admin-terminal-action="submit-attendance-scan"]'), "Enter");
    const classroomWrite = await waitForWrite(
      writes,
      startIndex,
      (item) => item.service === "classroom-api" && item.pathname.endsWith(`/games/${GAME_ID}/attendance/scan`),
    );
    assert(classroomWrite, `Scanner sent no Classroom API write: ${JSON.stringify(writes)}.`);
    assert(classroomWrite.body?.playerId === "PLAYER-CODE-123", `Scanner sent unexpected player ID: ${JSON.stringify(classroomWrite.body)}.`);

    await page.waitForFunction(() => {
      const state = document.querySelector("[data-admin-terminal-scanner-state]")?.textContent || "";
      return /confirmed|completed/i.test(state);
    }, null, { timeout: 5000 });

    const completed = await page.evaluate(() => ({
      player: document.querySelector("[data-admin-terminal-last-scan-player]")?.textContent?.trim() || "",
      status: document.querySelector("[data-admin-terminal-last-scan-status]")?.textContent?.trim() || "",
      state: document.querySelector("[data-admin-terminal-scanner-state]")?.textContent?.trim() || "",
    }));
    assert(completed.player && completed.status, `Scanner completion omitted player or status: ${JSON.stringify(completed)}.`);

    await page.waitForFunction(() => {
      const input = document.querySelector("[data-admin-terminal-manual-scan-input]");
      const state = document.querySelector("[data-admin-terminal-scanner-state]")?.textContent || "";
      return input instanceof HTMLInputElement && /ready/i.test(state) && input.value === "" && document.activeElement === input;
    }, null, { timeout: 5000 });

    const adminWrites = writes.filter((item) => item.service === "admin-api" && item.pathname.endsWith(`/games/${GAME_ID}/attendance/scans`));
    const classroomWrites = writes.filter((item) => item.service === "classroom-api" && item.pathname.endsWith(`/games/${GAME_ID}/attendance/scan`));
    assert(adminWrites.length === 1, `Scanner expected one Admin API attempt: ${JSON.stringify(writes)}.`);
    assert(classroomWrites.length === 1, `Scanner expected one Classroom API retry: ${JSON.stringify(writes)}.`);
    const keyboard = await assertKeyboardOnly(page, "Attendance scanner");
    assert(errors.length === 0, `Attendance scanner emitted browser errors: ${errors[0]}`);
    return { action: "submit-attendance-scan", tabs, writes, completed, recovered: true, keyboard };
  } catch (error) {
    await page.screenshot({ path: `${ARTIFACT_DIR}/keyboard-scanner-failure.png`, fullPage: true });
    throw error;
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch({ headless: true });
const report = { workflows: [] };

try {
  report.workflows.push(await exercisePlayer(browser));
  report.workflows.push(await exerciseContract(browser));
  report.workflows.push(await exerciseStore(browser));
  report.workflows.push(await exerciseScanner(browser));
  writeFileSync(`${ARTIFACT_DIR}/keyboard-workflows.json`, JSON.stringify(report, null, 2));
  console.log("Admin keyboard-only create workflows and scanner recovery smoke passed.");
} catch (error) {
  report.failure = error.stack || error.message || String(error);
  writeFileSync(`${ARTIFACT_DIR}/keyboard-workflows.json`, JSON.stringify(report, null, 2));
  console.error(report.failure);
  process.exitCode = 1;
} finally {
  await browser.close();
}

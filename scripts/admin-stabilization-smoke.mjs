import { writeFileSync } from "node:fs";
import {
  BASE_URL,
  createQualityHarness,
  GAME_ID,
} from "./admin-quality-smoke-fixture.mjs";

const ADMIN_ID = "00000000-0000-4000-8000-000000000002";
const CSRF_TOKEN = "C".repeat(43);
const ORIGIN = "http://127.0.0.1:4173";

const game = {
  id: GAME_ID,
  gameSessionId: GAME_ID,
  name: "Stabilization Game",
  title: "Stabilization Game",
  status: "active",
  gameCode: "STABLE1",
};
const player = {
  id: "00000000-0000-4000-8000-000000000003",
  playerId: "00000000-0000-4000-8000-000000000003",
  displayName: "Decimal Player",
  name: "Decimal Player",
  rosterLabel: "STABLE-01",
  status: "active",
  sessionStatus: "online",
  online: true,
  countryCode: "XALVORIA",
  countryName: "Xalvoria",
  balance: 2970.84,
  cashBalance: 2970.84,
  inventoryMarketValue: 50,
  stockMarketValue: 0,
  netWorth: 3020.84,
  currencyCode: "XAL",
};
const contract = {
  id: "00000000-0000-4000-8000-000000000004",
  contractId: "00000000-0000-4000-8000-000000000004",
  title: "Stabilization Contract",
  description: "Layout audit",
  instructions: "Complete the audit.",
  status: "active",
  visibility: "public",
  submissionCount: 0,
  completedCount: 0,
};
const item = {
  id: "00000000-0000-4000-8000-000000000005",
  storeItemId: "00000000-0000-4000-8000-000000000005",
  itemUuid: "00000000-0000-4000-8000-000000000005",
  name: "Stabilization Item",
  title: "Stabilization Item",
  description: "Formatting audit",
  category: "material",
  price: 25.5,
  currencyCode: "XAL",
  stockQuantity: 48,
  stock: 48,
  status: "active",
  visibility: "visible",
};
const settings = {
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
};
const attendanceSummary = {
  presentCount: 0,
  lateCount: 0,
  absentCount: 1,
  activePlayerCount: 1,
  totalPlayers: 1,
  presentRate: 0,
  rewardsIssuedCount: 0,
  rewardsIssuedTotal: 0,
};
const common = {
  gameId: GAME_ID,
  gameSessionId: GAME_ID,
  activeGameId: GAME_ID,
  selectedGameSessionId: GAME_ID,
  game,
  activeGame: game,
  players: [player],
  roster: [player],
  totalPlayers: 1,
  attendance: [],
  attendanceRows: [],
  attendanceHistory: [],
  attendanceLedger: [],
  attendanceSummary,
  attendanceCounts: { present: 0, late: 0, absent: 1, total: 1 },
  contracts: [contract],
  assignments: [contract],
  contractSubmissions: [],
  submissions: [],
  store: [item],
  storeItems: [item],
  items: [item],
  assets: [],
  trades: [],
  events: [],
  market: { assets: [], trades: [], events: [] },
  settings,
  logs: [],
  pagination: { page: 1, pageSize: 50, total: 0, totalPages: 1, hasNextPage: false },
  dashboard: {
    activePlayerCount: 1,
    totalPlayers: 1,
    onlinePlayerCount: 1,
    attendanceSummary,
    leaderboard: [{ ...player, rank: 1 }],
    recentActivity: [],
    marketStatus: "open",
  },
  leaderboard: [{ ...player, rank: 1 }],
  recentActivity: [],
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function corsHeaders() {
  return {
    "access-control-allow-origin": ORIGIN,
    "access-control-allow-credentials": "true",
    "access-control-allow-headers":
      "apikey,content-type,x-econovaria-csrf-token,x-econovaria-device-id,x-econovaria-game-id,x-idempotency-key,x-request-id",
    "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS",
    "cache-control": "private, no-store",
  };
}

function proxyPath(url) {
  const pathname = new URL(url).pathname;
  const marker = "/functions/v1/web-session-api/proxy";
  return pathname.startsWith(marker) ? pathname.slice(marker.length) || "/" : pathname;
}

function responseFor(path, method) {
  if (!['GET', 'HEAD'].includes(method)) {
    return { data: { ok: true, saved: true, created: true } };
  }
  if (path.includes('/players')) return { data: { ...common, players: [player], roster: [player] } };
  if (path.includes('/contracts')) return { data: { ...common, contracts: [contract], assignments: [contract] } };
  if (path.includes('/store')) return { data: { ...common, store: [item], storeItems: [item], items: [item] } };
  return { data: common };
}

const harness = await createQualityHarness("stabilization");
const { page, errors, writes, state, dir } = harness;
state.delayReads = false;
state.writeDelay = 0;
const requests = [];
const results = [];

page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text()}`);
});

await page.route("**/functions/v1/web-session-api/proxy/**", async (route) => {
  const request = route.request();
  const path = proxyPath(request.url());
  const method = request.method();
  if (path.endsWith("/session/bootstrap")) return route.fallback();
  if (method === "OPTIONS") {
    await route.fulfill({ status: 204, headers: corsHeaders(), body: "" });
    return;
  }

  const headers = request.headers();
  assert(headers.authorization === undefined, `Stabilization request exposed Staff Authorization: ${path}`);
  assert(Boolean(headers.apikey), `Stabilization request omitted publishable identity: ${path}`);
  assert(headers["x-econovaria-game-id"] === GAME_ID, `Stabilization request omitted game scope: ${path}`);
  if (!['GET', 'HEAD'].includes(method)) {
    assert(
      headers["x-econovaria-csrf-token"] === CSRF_TOKEN,
      `Stabilization mutation omitted cookie-bound CSRF: ${path}`,
    );
    writes.push({
      service: "admin-bff",
      method,
      path,
      body: request.postData() || "",
    });
  }
  requests.push({ method, path });
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: corsHeaders(),
    body: JSON.stringify(responseFor(path, method)),
  });
});

async function audit(name) {
  const result = await page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity || 1) > 0 &&
        rect.width > 1 &&
        rect.height > 1;
    };
    const live = (element) => !element.closest("[data-admin-shape-skeleton-stage]");
    const visibleLive = (element) => live(element) && visible(element);
    const overlap = (a, b) =>
      Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
      Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
    const issues = [];
    const root = document.querySelector("#adminPreview");
    if (!root) issues.push("admin preview missing");
    else if (root.scrollWidth > root.clientWidth + 3) {
      issues.push(`horizontal overflow ${root.scrollWidth}/${root.clientWidth}`);
    }

    for (const button of [...document.querySelectorAll("button")].filter(visibleLive)) {
      const label = String(
        button.getAttribute("aria-label") || button.title || button.innerText || "",
      ).replace(/\s+/g, " ").trim();
      if (!label) issues.push(`visible unnamed button: ${button.outerHTML.slice(0, 200)}`);
      if (/[↗×⌄⌃‹›＋]/u.test(button.innerText || "")) issues.push(`text glyph remains in ${label}`);
      if (
        getComputedStyle(button).pointerEvents === "none" &&
        !button.disabled &&
        button.getAttribute("aria-disabled") !== "true"
      ) issues.push(`enabled button is inert: ${label}`);
    }

    for (const row of [...document.querySelectorAll(".admin-terminal-clickable-row")].filter(visibleLive)) {
      const pseudo = getComputedStyle(row, "::after");
      if (/[↗×⌄⌃‹›＋]/u.test(pseudo.content || "")) {
        issues.push("clickable row still uses a text pseudo-glyph");
      }
      if (
        (pseudo.content === '""' || pseudo.content === "none") &&
        pseudo.backgroundImage === "none"
      ) issues.push("clickable row has no hover affordance icon");
    }

    for (const form of [...document.querySelectorAll("form")].filter(visibleLive)) {
      const controls = [...form.querySelectorAll(
        "input:not([type=hidden]),textarea,select,button",
      )].filter(visibleLive);
      for (const control of controls) {
        const rect = control.getBoundingClientRect();
        if (rect.width < 24 || rect.height < 20) {
          issues.push(`undersized control ${control.name || control.tagName}`);
        }
      }
      for (let i = 0; i < controls.length; i += 1) {
        for (let j = i + 1; j < controls.length; j += 1) {
          if (controls[i].contains(controls[j]) || controls[j].contains(controls[i])) continue;
          if (overlap(controls[i].getBoundingClientRect(), controls[j].getBoundingClientRect())) {
            issues.push(`overlapping controls ${controls[i].name || controls[i].tagName}/${controls[j].name || controls[j].tagName}`);
          }
        }
      }
    }

    const stockMode = document.querySelector('select[name="stockMode"]:not([inert] *)');
    if (stockMode && visibleLive(stockMode) && stockMode.getBoundingClientRect().width < 280) {
      issues.push(`stock mode control is too narrow for its selected value: ${stockMode.getBoundingClientRect().width}`);
    }

    const modal = [...document.querySelectorAll(".admin-terminal-modal")].find(visibleLive);
    if (modal) {
      const rect = modal.getBoundingClientRect();
      if (
        rect.left < -1 || rect.top < -1 ||
        rect.right > innerWidth + 1 || rect.bottom > innerHeight + 1
      ) issues.push("modal exceeds viewport");
      const preview = modal.querySelector(".admin-terminal-contract-preview");
      for (const panel of modal.querySelectorAll(
        ".admin-terminal-contract-main,.admin-terminal-contract-reward",
      )) {
        if (
          preview && visibleLive(preview) && visibleLive(panel) &&
          overlap(preview.getBoundingClientRect(), panel.getBoundingClientRect())
        ) issues.push("contract preview overlaps form content");
      }
    }

    const money = [...document.querySelectorAll(
      ".admin-terminal-currency-number,.admin-terminal-currency-single-amount>b",
    )].filter(visibleLive).map((node) => node.textContent.trim());
    for (const value of money) {
      if (/\d/.test(value) && !/-?\d{1,3}(?:,\d{3})*\.\d{2}/.test(value)) {
        issues.push(`money not two decimals: ${value}`);
      }
    }
    return { issues, money };
  });
  results.push({ name, ...result });
  if (result.issues.length) throw new Error(`${name}: ${result.issues[0]}`);
}

async function section(name) {
  const button = page.locator(`[data-admin-section="${name}"]`).first();
  await button.waitFor({ state: "visible", timeout: 10_000 });
  await button.click();
  await page.waitForTimeout(300);
  await audit(`section-${name}`);
}

async function modal(action) {
  await section(action === "add-store-item" ? "Store" : "Overview");
  const button = page.locator(`[data-admin-terminal-action="${action}"]`).first();
  await button.waitFor({ state: "visible", timeout: 10_000 });
  if (await button.isDisabled()) throw new Error(`${action} is disabled`);
  await button.click();
  await page.waitForSelector(".admin-terminal-modal:visible", { timeout: 5_000 });
  await page.waitForTimeout(250);
  await audit(`modal-${action}`);
  await harness.capture(`modal-${action}`);
  await page.locator('.admin-terminal-modal:visible button[aria-label*="Close" i]').first().click();
  await page.waitForTimeout(150);
}

const report = { results, requests, writes, errors };
try {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("#adminPreview:not([hidden])", { timeout: 15_000 });
  for (const name of [
    "Overview", "Attendance", "Players", "Assignments",
    "Store", "Market", "Settings", "Logs",
  ]) await section(name);
  for (const action of [
    "scan-attendance", "add-contract", "add-player", "add-store-item",
  ]) await modal(action);
  for (const fragment of [
    "dashboard", "attendance", "players", "contracts",
    "store", "market", "settings", "logs",
  ]) {
    if (!requests.some(({ method, path }) => method === "GET" && path.includes(fragment))) {
      throw new Error(`read route not exercised: ${fragment}`);
    }
  }
  if (errors.length) throw new Error(errors[0]);
  writeFileSync(
    `${dir}/admin-stabilization-runtime.json`,
    JSON.stringify(report, null, 2),
  );
  await harness.capture("admin-stabilization-pass");
  console.log("Admin stabilization smoke passed.");
} catch (error) {
  report.failure = error.stack || error.message || String(error);
  writeFileSync(
    `${dir}/admin-stabilization-runtime.json`,
    JSON.stringify(report, null, 2),
  );
  await harness.capture("admin-stabilization-failure").catch(() => {});
  console.error(report.failure);
  process.exitCode = 1;
} finally {
  await harness.finish(report);
}

import { mkdirSync, writeFileSync } from "node:fs";
import {
  BASE_URL,
  createQualityHarness,
  GAME_ID,
} from "./admin-quality-smoke-fixture.mjs";

const ARTIFACT_DIR = process.env.ADMIN_SMOKE_ARTIFACT_DIR ||
  "admin-browser-smoke-artifacts/keyboard-focus-order";
const CSRF_TOKEN = "C".repeat(43);
const ORIGIN = "http://127.0.0.1:4173";

const PAGE_ORDERS = Object.freeze({
  Overview: [
    { selector: '[data-admin-terminal-action="scan-attendance"]' },
    { selector: '[data-admin-terminal-action="add-contract"]' },
    { selector: '[data-admin-terminal-action="add-player"]' },
    { selector: '[data-admin-terminal-action="add-store-item"]' },
  ],
  Attendance: [
    { selector: '[data-admin-terminal-action="scan-attendance"]' },
    { selector: '[data-admin-terminal-action="attendance-open-export"]' },
  ],
  Players: [
    { selector: 'input[aria-label="Search roster by name, player ID, or country"]' },
    { selector: '[data-admin-terminal-action="filter-players-all"]' },
    { selector: '[data-admin-terminal-action="filter-players-online"]' },
    { selector: '[data-admin-terminal-action="filter-players-offline"]' },
    { selector: '[data-admin-terminal-action="filter-players-flagged"]' },
    { selector: '[data-admin-terminal-action="add-player"]' },
  ],
  Assignments: [
    { selector: '[data-admin-terminal-action="add-contract"]' },
    { selector: '[data-admin-terminal-action="filter-contracts"]', text: /^All\b/ },
    { selector: '[data-admin-terminal-action="filter-contracts"]', text: /^Active\b/ },
    { selector: '[data-admin-terminal-action="filter-contracts"]', text: /^Due\b/ },
    { selector: '[data-admin-terminal-action="filter-contracts"]', text: /^Review\b/ },
    { selector: '[data-admin-terminal-action="filter-contracts"]', text: /^Scheduled\b/ },
  ],
  Store: [
    { selector: '[data-admin-terminal-action="add-store-item"]' },
    { selector: '[data-admin-terminal-action="filter-store"]', text: /^All\b/ },
    { selector: '[data-admin-terminal-action="filter-store"]', text: /^System\b/ },
    { selector: '[data-admin-terminal-action="filter-store"]', text: /^Custom\b/ },
    { selector: '[data-admin-terminal-action="filter-store"]', text: /^Materials\b/ },
    { selector: '[data-admin-terminal-action="filter-store"]', text: /^Equipment\b/ },
    { selector: '[data-admin-terminal-action="filter-store"]', text: /^Consumables\b/ },
    { selector: '[data-admin-terminal-action="filter-store"]', text: /^Review\b/ },
  ],
  Market: [
    { selector: ".admin-terminal-shell-main input" },
    { selector: 'select[aria-label="Asset class"]' },
    { selector: 'select[aria-label="Location"]' },
    { selector: 'select[aria-label="Sector"]' },
    { selector: 'select[aria-label="Price band"]' },
    { selector: 'select[aria-label="Sort securities"]' },
    { selector: '[data-admin-terminal-action="marketplace-clear-filters"]' },
  ],
  Settings: [
    { selector: '[data-settings-preset="easy"]' },
    { selector: '[data-settings-preset="moderate"]' },
    { selector: '[data-settings-preset="hard"]' },
    { selector: '[data-settings-preset="insane"]' },
  ],
  Logs: [
    { selector: '[data-admin-terminal-action="open-export-history"]' },
    { selector: '[data-admin-terminal-action="export-logs"]' },
  ],
});

mkdirSync(ARTIFACT_DIR, { recursive: true });

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

const harness = await createQualityHarness("keyboard-focus-order");
const { page, errors, writes, state } = harness;
state.delayReads = false;
state.writeDelay = 0;
const report = { pageOrders: [], inFlight: null };

page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text()}`);
});

await page.addInitScript(() => {
  window.__adminKeyboardPointerEvents = [];
  for (const type of ["pointerdown", "mousedown", "touchstart"]) {
    window.addEventListener(type, (event) => {
      window.__adminKeyboardPointerEvents.push({
        type: event.type,
        target: event.target?.tagName || "",
      });
    }, true);
  }
});

await page.route("**/functions/v1/web-session-api/proxy/**", async (route) => {
  const request = route.request();
  const pathname = new URL(request.url()).pathname;
  const marker = "/functions/v1/web-session-api/proxy";
  const path = pathname.startsWith(marker)
    ? pathname.slice(marker.length) || "/"
    : pathname;

  if (
    request.method() !== "POST" ||
    !path.endsWith(`/games/${GAME_ID}/players`)
  ) {
    return route.fallback();
  }

  const headers = request.headers();
  if (headers.authorization !== undefined) {
    errors.push("Focus-order Player create exposed Staff Authorization.");
  }
  if (!headers.apikey) errors.push("Focus-order Player create omitted publishable identity.");
  if (headers["x-econovaria-game-id"] !== GAME_ID) {
    errors.push("Focus-order Player create omitted game scope.");
  }
  if (headers["x-econovaria-csrf-token"] !== CSRF_TOKEN) {
    errors.push("Focus-order Player create omitted cookie-bound CSRF.");
  }

  writes.push({
    service: "admin-bff",
    method: request.method(),
    path,
    body: request.postData() || "",
  });
  await new Promise((resolve) => setTimeout(resolve, 700));
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: corsHeaders(),
    body: JSON.stringify({
      data: {
        created: true,
        accessCode: "FOCUS-ACCESS",
        player: {
          id: "00000000-0000-4000-8000-000000000003",
          displayName: "In Flight Keyboard Player",
          rosterLabel: "KEY-ORDER",
          status: "active",
          countryCode: "NORTHREACH",
          currencyCode: "NRC",
        },
      },
    }),
  });
});

async function keyboardActivate(locator, key = "Enter") {
  await locator.waitFor({ state: "visible", timeout: 8000 });
  await locator.focus();
  assert(
    await locator.evaluate((node) => document.activeElement === node),
    `Keyboard target did not receive focus: ${await locator.textContent()}`,
  );
  await page.keyboard.press(key);
}

function targetLocator(definition) {
  let locator = page.locator(`${definition.selector}:visible`);
  if (definition.text) locator = locator.filter({ hasText: definition.text });
  return locator.first();
}

async function describe(locator) {
  return locator.evaluate((node) => ({
    tag: node.tagName,
    action: node.getAttribute("data-admin-terminal-action") || "",
    name: node.getAttribute("name") || "",
    ariaLabel: node.getAttribute("aria-label") || "",
    text: (node.textContent || "").trim().replace(/\s+/g, " ").slice(0, 100),
  }));
}

async function proveOrder(section, definitions) {
  await keyboardActivate(page.locator(`[data-admin-section="${section}"]`).first());
  await page.waitForTimeout(450);
  const targets = definitions.map(targetLocator);
  for (const target of targets) {
    await target.waitFor({ state: "visible", timeout: 8000 });
  }

  const transitions = [];
  await targets[0].focus();
  assert(
    await targets[0].evaluate((node) => document.activeElement === node),
    `${section} first focus target did not receive focus.`,
  );

  for (let index = 1; index < targets.length; index += 1) {
    const target = targets[index];
    let tabs = 0;
    while (!(await target.evaluate((node) => document.activeElement === node)) && tabs < 12) {
      await page.keyboard.press("Tab");
      tabs += 1;
    }
    assert(
      await target.evaluate((node) => document.activeElement === node),
      `${section} focus order did not reach target ${index + 1}.`,
    );
    transitions.push({ tabs, target: await describe(target) });
  }

  return {
    section,
    first: await describe(targets[0]),
    transitions,
  };
}

async function proveInFlightExclusion() {
  await keyboardActivate(page.locator('[data-admin-section="Overview"]').first());
  await page.waitForTimeout(300);
  await keyboardActivate(page.locator('[data-admin-terminal-action="add-player"]').first());
  const form = page.locator("[data-admin-terminal-player-form]");
  const displayName = form.locator('[name="displayName"]');
  await displayName.waitFor({ state: "visible", timeout: 5000 });
  await displayName.focus();
  await page.keyboard.press("Control+A");
  await page.keyboard.type("In Flight Keyboard Player");

  const submit = form.locator('[data-admin-terminal-action="create-player"]');
  const startWrites = writes.length;
  await keyboardActivate(submit);
  await page.waitForFunction(() => {
    const button = document.querySelector(
      '[data-admin-terminal-player-form] [data-admin-terminal-action="create-player"]',
    );
    return button instanceof HTMLButtonElement &&
      button.disabled &&
      button.dataset.adminQolState === "loading";
  }, null, { timeout: 3000 });

  const loadingState = await submit.evaluate((button) => ({
    disabled: button.disabled,
    ariaBusy: button.getAttribute("aria-busy"),
    state: button.dataset.adminQolState || "",
  }));
  await page.keyboard.press("Enter");
  await page.waitForTimeout(150);
  const writesDuringLoading = writes.slice(startWrites)
    .filter((write) => write.path?.endsWith(`/games/${GAME_ID}/players`)).length;
  assert(
    writesDuringLoading === 1,
    `Disabled in-flight action replayed: ${JSON.stringify(writes.slice(startWrites))}.`,
  );

  await page.waitForFunction(() => {
    const button = document.querySelector(
      '[data-admin-terminal-player-form] [data-admin-terminal-action="create-player"]',
    );
    return !(button instanceof HTMLButtonElement) ||
      button.dataset.adminQolState !== "loading";
  }, null, { timeout: 5000 });

  const finalWrites = writes.slice(startWrites)
    .filter((write) => write.path?.endsWith(`/games/${GAME_ID}/players`));
  assert(finalWrites.length === 1, `Player create produced ${finalWrites.length} writes instead of one.`);
  return { loadingState, writesDuringLoading, finalWrite: finalWrites[0] };
}

try {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("#adminPreview:not([hidden])", { timeout: 15_000 });
  await page.waitForSelector("[data-admin-section]", { timeout: 15_000 });
  await page.waitForTimeout(900);

  for (const [section, definitions] of Object.entries(PAGE_ORDERS)) {
    report.pageOrders.push(await proveOrder(section, definitions));
  }
  report.inFlight = await proveInFlightExclusion();

  const keyboardEvidence = await page.evaluate(() => ({
    modality: document.documentElement.getAttribute("data-admin-input-modality"),
    pointerEvents: window.__adminKeyboardPointerEvents || [],
  }));
  assert(keyboardEvidence.modality === "keyboard", "Focus-order evidence lost keyboard modality.");
  assert(
    keyboardEvidence.pointerEvents.length === 0,
    `Focus-order evidence emitted pointer input: ${JSON.stringify(keyboardEvidence.pointerEvents)}.`,
  );
  assert(errors.length === 0, errors[0] || "Keyboard focus-order evidence emitted a browser error.");
  report.keyboardEvidence = keyboardEvidence;
  writeFileSync(`${ARTIFACT_DIR}/keyboard-focus-order.json`, JSON.stringify(report, null, 2));
  console.log("Admin page-specific focus order and in-flight keyboard exclusion smoke passed.");
} catch (error) {
  report.failure = error.stack || error.message || String(error);
  report.errors = errors;
  writeFileSync(`${ARTIFACT_DIR}/keyboard-focus-order.json`, JSON.stringify(report, null, 2));
  await harness.capture("keyboard-focus-order-failure").catch(() => {});
  console.error(report.failure);
  process.exitCode = 1;
} finally {
  await harness.finish(report);
}

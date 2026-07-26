import { mkdirSync, writeFileSync } from "node:fs";
import {
  BASE_URL,
  createQualityHarness,
  GAME_ID,
} from "./admin-quality-smoke-fixture.mjs";

const ARTIFACT_DIR = process.env.ADMIN_SMOKE_ARTIFACT_DIR ||
  "admin-browser-smoke-artifacts/keyboard-workflows";
const CSRF_TOKEN = "C".repeat(43);
const ORIGIN = "http://127.0.0.1:4173";
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

function parseBody(value) {
  try {
    return typeof value === "string" ? JSON.parse(value || "{}") : value || {};
  } catch (_) {
    return {};
  }
}

function responseFor(path) {
  if (path.endsWith(`/games/${GAME_ID}/players`)) {
    return {
      data: {
        created: true,
        accessCode: "KEYBOARD-ACCESS",
        player: {
          id: "00000000-0000-4000-8000-000000000003",
          displayName: "Keyboard Workflow Player",
          rosterLabel: "KEYBOARD-CREATE",
          status: "active",
        },
      },
    };
  }
  if (path.endsWith(`/games/${GAME_ID}/contracts`)) {
    return {
      data: {
        created: true,
        contract: {
          id: "00000000-0000-4000-8000-000000000004",
          title: "Keyboard Workflow Contract",
          status: "active",
        },
      },
    };
  }
  if (path.endsWith(`/games/${GAME_ID}/store/items`)) {
    return {
      data: {
        created: true,
        item: {
          id: "00000000-0000-4000-8000-000000000005",
          name: "Keyboard Workflow Item",
          category: "material",
          price: 25,
          stockQuantity: 10,
          status: "active",
        },
      },
    };
  }
  if (/\/games\/[^/]+\/attendance\/(?:scan|scans)$/.test(path)) {
    return {
      ok: true,
      player: {
        id: "00000000-0000-4000-8000-000000000003",
        displayName: "Keyboard Attendance Player",
        rosterLabel: "KEY-ATT-001",
        status: "active",
      },
      attendance: {
        status: "present",
        attendanceDate: "2026-07-19",
        clockedInAt: new Date().toISOString(),
        wasCreated: true,
        timezone: "Asia/Seoul",
      },
      reward: { amount: 1, currencyCode: "XAL", ledgerEntryId: null },
    };
  }
  return null;
}

function assertSecureRequest(request, errors) {
  const headers = request.headers();
  if (headers.authorization !== undefined) {
    errors.push(`${request.method()} ${request.url()} exposed Staff Authorization`);
  }
  if (!headers.apikey) {
    errors.push(`${request.method()} ${request.url()} omitted publishable identity`);
  }
  if (headers["x-econovaria-game-id"] !== GAME_ID) {
    errors.push(`${request.method()} ${request.url()} omitted game scope`);
  }
  if (
    !["GET", "HEAD", "OPTIONS"].includes(request.method()) &&
    headers["x-econovaria-csrf-token"] !== CSRF_TOKEN
  ) {
    errors.push(`${request.method()} ${request.url()} omitted CSRF`);
  }
}

async function createHarness(label) {
  const harness = await createQualityHarness(`keyboard-workflow-${label}`);
  const { page, errors, writes, state } = harness;
  state.delayReads = false;
  state.writeDelay = 0;
  await page.setViewportSize({ width: 1440, height: 1000 });
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
    const path = pathname.startsWith(marker) ? pathname.slice(marker.length) || "/" : pathname;
    const response = responseFor(path);
    if (!response) return route.fallback();
    if (request.method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: corsHeaders(), body: "" });
    }
    assertSecureRequest(request, errors);
    if (!["GET", "HEAD"].includes(request.method())) {
      writes.push({
        service: "admin-bff",
        method: request.method(),
        path,
        body: request.postData() || "",
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: corsHeaders(),
      body: JSON.stringify(response),
    });
  });
  return harness;
}

async function openAction(page, action, key = "Enter") {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("#adminPreview:not([hidden])", { timeout: 15_000 });
  const section = page.locator('[data-admin-section="Overview"]').first();
  await section.focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => {
    const active = [...document.querySelectorAll("[data-admin-section]")].find((node) =>
      node.getAttribute("aria-current") === "page" ||
      node.getAttribute("aria-selected") === "true" ||
      node.classList.contains("active") ||
      node.classList.contains("is-active")
    );
    return active?.getAttribute("data-admin-section") === "Overview";
  }, null, { timeout: 5000 });
  const control = page.locator(`[data-admin-terminal-action="${action}"]:visible`).first();
  await control.waitFor({ state: "visible", timeout: 10_000 });
  await section.focus();
  let tabs = 0;
  while (!(await control.evaluate((node) => document.activeElement === node)) && tabs <= 40) {
    await page.keyboard.press("Tab");
    tabs += 1;
  }
  assert(tabs <= 40, `${action} was not keyboard reachable.`);
  await page.keyboard.press(key);
  await page.waitForSelector(".admin-terminal-modal:visible", { timeout: 5000 });
  assert(
    await page.evaluate(() =>
      document.documentElement.getAttribute("data-admin-input-modality")
    ) === "keyboard",
    `${action} did not preserve keyboard modality.`,
  );
  return tabs;
}

async function replace(page, locator, value) {
  await locator.waitFor({ state: "visible", timeout: 5000 });
  await locator.focus();
  await page.keyboard.press("Control+A");
  await page.keyboard.type(value);
  assert(await locator.inputValue() === value, `Keyboard entry failed for ${await locator.getAttribute("name")}.`);
}

async function selectValue(page, locator, value) {
  await locator.waitFor({ state: "visible", timeout: 5000 });
  const index = await locator.evaluate((node, expected) =>
    node instanceof HTMLSelectElement
      ? [...node.options].findIndex((option) => option.value === expected)
      : -1,
  value);
  assert(index >= 0, `Select is missing ${value}.`);
  await locator.focus();
  await page.keyboard.press("Home");
  for (let position = 0; position < index; position += 1) {
    await page.keyboard.press("ArrowDown");
  }
  await page.keyboard.press("Enter");
  assert(await locator.inputValue() === value, `Keyboard selection failed for ${value}.`);
}

async function activate(page, locator, key = "Enter") {
  await locator.waitFor({ state: "visible", timeout: 5000 });
  await locator.focus();
  await page.keyboard.press(key);
}

async function waitForWrite(writes, startIndex, predicate, timeoutMs = 7000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const match = writes.slice(startIndex).find(predicate);
    if (match) return match;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
}

async function keyboardEvidence(page, label) {
  const evidence = await page.evaluate(() => ({
    modality: document.documentElement.getAttribute("data-admin-input-modality"),
    pointerEvents: window.__adminKeyboardPointerEvents || [],
  }));
  assert(evidence.modality === "keyboard", `${label} lost keyboard modality.`);
  assert(evidence.pointerEvents.length === 0, `${label} emitted pointer input.`);
  return evidence;
}

function createPayload(write, action, suffix) {
  assert(write?.service === "admin-bff", `${action} bypassed the Admin BFF.`);
  assert(write?.method === "POST", `${action} did not use POST.`);
  assert(write?.path.endsWith(suffix), `${action} used ${write?.path || "no path"}.`);
  const body = parseBody(write.body);
  assert(body.action === action, `${action} sent ${body.action || "no action"}.`);
  return body.payload || {};
}

async function exerciseCreate(config) {
  const harness = await createHarness(config.label);
  const { page, writes, errors } = harness;
  let result = null;
  try {
    const tabs = await openAction(page, config.openAction, config.openKey);
    const form = page.locator(config.form);
    for (const field of config.fields) {
      const locator = form.locator(`[name="${field.name}"]`);
      if (field.type === "select") await selectValue(page, locator, field.value);
      else await replace(page, locator, field.value);
    }
    const startIndex = writes.length;
    await activate(page, form.locator(config.submit), config.submitKey);
    const write = await waitForWrite(
      writes,
      startIndex,
      (item) => item.path?.endsWith(config.path),
    );
    const payload = createPayload(write, config.action, config.path);
    config.verify(payload);
    const keyboard = await keyboardEvidence(page, config.label);
    assert(errors.length === 0, `${config.label} emitted browser errors: ${errors[0]}`);
    result = { action: config.action, tabs, write, keyboard };
    return result;
  } catch (error) {
    await harness.capture(`${config.label}-failure`).catch(() => {});
    throw error;
  } finally {
    await harness.finish({ result });
  }
}

async function exerciseScanner() {
  const harness = await createHarness("scanner");
  const { page, writes, errors } = harness;
  let result = null;
  try {
    const tabs = await openAction(page, "scan-attendance", "Space");
    await activate(page, page.locator('[data-admin-terminal-set-mode="manual"]'));
    const panel = page.locator("[data-admin-terminal-manual-panel]");
    await panel.waitFor({ state: "visible", timeout: 5000 });
    await replace(page, panel.locator("[data-admin-terminal-manual-scan-input]"), "PLAYER-CODE-123");
    const startIndex = writes.length;
    await activate(page, panel.locator('[data-admin-terminal-action="submit-attendance-scan"]'));
    const write = await waitForWrite(
      writes,
      startIndex,
      (item) => item.service === "admin-bff" &&
        /\/games\/[^/]+\/attendance\/(?:scan|scans)$/.test(item.path || ""),
    );
    assert(write, `Scanner sent no BFF attendance mutation: ${JSON.stringify(writes)}.`);
    const body = parseBody(write.body);
    const payload = body.payload || body;
    assert(
      payload.playerId === "PLAYER-CODE-123" || payload.playerIdentifier === "PLAYER-CODE-123",
      `Scanner sent the wrong Player identifier: ${JSON.stringify(body)}.`,
    );
    await page.waitForFunction(() =>
      /confirmed|completed/i.test(
        document.querySelector("[data-admin-terminal-scanner-state]")?.textContent || "",
      ), null, { timeout: 5000 });
    await page.waitForFunction(() => {
      const input = document.querySelector("[data-admin-terminal-manual-scan-input]");
      const state = document.querySelector("[data-admin-terminal-scanner-state]")?.textContent || "";
      return input instanceof HTMLInputElement &&
        /ready/i.test(state) &&
        input.value === "" &&
        document.activeElement === input;
    }, null, { timeout: 5000 });
    const attendanceWrites = writes.filter((item) =>
      item.service === "admin-bff" &&
      /\/games\/[^/]+\/attendance\/(?:scan|scans)$/.test(item.path || "")
    );
    assert(attendanceWrites.length === 1, "Scanner issued more than one attendance mutation.");
    const keyboard = await keyboardEvidence(page, "Attendance scanner");
    assert(errors.length === 0, `Attendance scanner emitted browser errors: ${errors[0]}`);
    result = { action: "submit-attendance-scan", tabs, writes: attendanceWrites, keyboard };
    return result;
  } catch (error) {
    await harness.capture("scanner-failure").catch(() => {});
    throw error;
  } finally {
    await harness.finish({ result });
  }
}

const createCases = [
  {
    label: "add-player",
    openAction: "add-player",
    openKey: "Enter",
    action: "create-player",
    form: "[data-admin-terminal-player-form]",
    submit: '[data-admin-terminal-action="create-player"]',
    submitKey: "Enter",
    path: `/games/${GAME_ID}/players`,
    fields: [
      { name: "displayName", value: "Keyboard Workflow Player" },
      { name: "rosterLabel", value: "KEYBOARD-CREATE" },
      { name: "status", value: "active", type: "select" },
      { name: "startingLocation", value: "NORTHREACH", type: "select" },
      { name: "notes", value: "Created without pointer input." },
    ],
    verify: (payload) => {
      assert(payload.displayName === "Keyboard Workflow Player", "Player display name drifted.");
      assert(payload.startingLocation === "NORTHREACH", "Player starting location drifted.");
    },
  },
  {
    label: "add-contract",
    openAction: "add-contract",
    openKey: "Space",
    action: "create-contract",
    form: "[data-admin-terminal-contract-form]",
    submit: '[data-admin-terminal-action="create-contract"]',
    submitKey: "Enter",
    path: `/games/${GAME_ID}/contracts`,
    fields: [
      { name: "title", value: "Keyboard Workflow Contract" },
      { name: "objective", value: "Verify keyboard-only Contract creation." },
      { name: "instructions", value: "Complete the keyboard workflow assignment." },
      { name: "evidence", value: "Submit a keyboard-created response." },
    ],
    verify: (payload) => {
      assert(payload.title === "Keyboard Workflow Contract", "Contract title drifted.");
      assert(payload.publishNow === true, "Contract publish state drifted.");
    },
  },
  {
    label: "add-store-item",
    openAction: "add-store-item",
    openKey: "Enter",
    action: "save-store-item",
    form: "[data-admin-terminal-store-form]",
    submit: '[data-admin-terminal-action="save-store-item"]',
    submitKey: "Space",
    path: `/games/${GAME_ID}/store/items`,
    fields: [
      { name: "itemName", value: "Keyboard Workflow Item" },
      { name: "description", value: "Keyboard-created store item." },
      { name: "category", value: "Material", type: "select" },
      { name: "itemType", value: "One-time use", type: "select" },
      { name: "status", value: "Active", type: "select" },
      { name: "price", value: "25" },
      { name: "stockMode", value: "Limited", type: "select" },
      { name: "stockQuantity", value: "10" },
      { name: "visibility", value: "All players", type: "select" },
    ],
    verify: (payload) => {
      assert(payload.name === "Keyboard Workflow Item", "Store item name drifted.");
      assert(payload.category === "material", "Store item category drifted.");
      assert(payload.price === 25 && payload.stockQuantity === 10, "Store item numbers drifted.");
    },
  },
];

const report = { workflows: [] };
try {
  for (const config of createCases) {
    report.workflows.push(await exerciseCreate(config));
  }
  report.workflows.push(await exerciseScanner());
  writeFileSync(`${ARTIFACT_DIR}/keyboard-workflows.json`, JSON.stringify(report, null, 2));
  console.log("Admin keyboard-only create workflows and secure BFF scanner smoke passed.");
} catch (error) {
  report.failure = error.stack || error.message || String(error);
  writeFileSync(`${ARTIFACT_DIR}/keyboard-workflows.json`, JSON.stringify(report, null, 2));
  console.error(report.failure);
  process.exitCode = 1;
}

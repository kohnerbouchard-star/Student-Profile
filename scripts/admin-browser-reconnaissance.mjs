#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const BASE_URL = process.env.ECONOVARIA_BROWSER_BASE_URL || "http://127.0.0.1:4173";
const OUTPUT_DIR = process.env.ECONOVARIA_BROWSER_OUTPUT_DIR || "/tmp/econovaria-browser";
const LICENSE_CODE = process.env.ECONOVARIA_BROWSER_LICENSE_CODE || "BROWSER-E2E-LICENSE-001";
const ADMIN_EMAIL = process.env.ECONOVARIA_BROWSER_ADMIN_EMAIL || "browser.e2e@example.test";
const ADMIN_PASSWORD = process.env.ECONOVARIA_BROWSER_ADMIN_PASSWORD || "Browser-E2E-Access-2026!";
const GAME_NAME = process.env.ECONOVARIA_BROWSER_GAME_NAME || "Browser E2E Economy";
const PLAYER_NAME = "Browser E2E Player";
const PLAYER_IDENTIFIER = "BROWSER-PLAYER-001";
const PLAYER_ACCESS_CODE = "BROWSER-ACCESS-001";
const MEMORABLE_CODE_PATTERN = /^ECO-[A-Z]{3,12}-[A-Z]{3,12}-[0-9]{3}$/;
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;
const CODE_PATTERN = /ECO-[A-Z]{3,12}-[A-Z]{3,12}-[0-9]{3}/g;

await mkdir(OUTPUT_DIR, { recursive: true });

const evidence = {
  generatedAt: new Date().toISOString(),
  createdThroughRenderedUi: false,
  adminConsoleRendered: false,
  navigation: [],
  shareGameCode: {
    opened: false,
    automatic: false,
    displayed: false,
    formatValid: false,
    persistedAfterReload: false,
    rotated: false,
    rotationPersistedAfterReload: false,
  },
  playerCreation: { opened: false, created: false, persistedAfterReload: false },
  logout: { menuOpened: false, confirmationOpened: false, redirected: false },
  requests: [],
  consoleErrors: [],
  pageErrors: [],
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
const page = await context.newPage();

function sanitize(value) {
  return String(value || "")
    .replaceAll(BASE_URL, "[local-gateway]")
    .replace(UUID_PATTERN, "[uuid-redacted]")
    .replace(CODE_PATTERN, "[game-code-redacted]");
}

page.on("dialog", (dialog) => void dialog.accept());
page.on("console", (message) => {
  if (message.type() === "error") evidence.consoleErrors.push(sanitize(message.text()));
});
page.on("pageerror", (error) => evidence.pageErrors.push(sanitize(error?.message || error)));
page.on("response", (response) => {
  const url = response.url();
  if (!url.includes("/functions/v1/") && !url.includes("/auth/v1/")) return;
  evidence.requests.push({
    method: response.request().method(),
    url: sanitize(url),
    status: response.status(),
  });
});

function failedRequests(startIndex = 0) {
  return evidence.requests.slice(startIndex).filter((request) => request.status >= 400);
}

function assertNoFailedRequests(label, startIndex = 0) {
  const failed = failedRequests(startIndex);
  if (failed.length) throw new Error(`${label} observed failed requests: ${JSON.stringify(failed)}`);
}

async function waitForAdminConsole() {
  await page.waitForURL(/\/admin\/(?:index\.html)?(?:\?.*)?$/, { timeout: 120_000 });
  await page.waitForFunction(() => {
    const preview = document.getElementById("adminPreview");
    return Boolean(preview && !preview.hidden && preview.childElementCount > 0);
  }, undefined, { timeout: 120_000 });
  await page.waitForTimeout(1200);
}

async function navigateSection(name) {
  const requestIndex = evidence.requests.length;
  await page.getByRole("button", { name, exact: true }).click();
  await page.waitForTimeout(900);
  const failed = failedRequests(requestIndex);
  evidence.navigation.push({ name, failedRequests: failed });
  if (failed.length) throw new Error(`${name} navigation failed: ${JSON.stringify(failed)}`);
}

async function openShareModal() {
  const shareButton = page.locator(
    '[data-econovaria-share-game]:visible, button[title="Share game code"]:visible',
  ).first();
  await shareButton.waitFor({ state: "visible", timeout: 20_000 });
  await shareButton.click();

  const modal = page.locator('[data-modal-id="share-game-access"]:visible').last();
  await modal.waitFor({ state: "visible", timeout: 20_000 });
  const label = modal.locator(".admin-terminal-share-modal-code strong");
  await label.waitFor({ state: "visible", timeout: 10_000 });
  await page.waitForFunction((patternSource) => {
    const nodes = [...document.querySelectorAll('[data-modal-id="share-game-access"] .admin-terminal-share-modal-code strong')];
    const visible = nodes.reverse().find((node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    });
    return new RegExp(patternSource).test(String(visible?.textContent || "").trim());
  }, MEMORABLE_CODE_PATTERN.source, { timeout: 30_000 });

  const code = String(await label.textContent() || "").trim();
  if (!MEMORABLE_CODE_PATTERN.test(code)) {
    throw new Error("Share Game Code modal did not display a memorable persisted code.");
  }
  return { modal, label, code };
}

async function closeShareModal(modal) {
  await page.keyboard.press("Escape");
  if (await modal.isVisible().catch(() => false)) {
    const close = modal.locator('[data-admin-terminal-modal-close], button[aria-label*="Close"]:visible').first();
    if (await close.count()) await close.click();
  }
}

async function safeScreenshot(name) {
  const masks = [
    page.locator("[data-econovaria-selected-game-code]"),
    page.locator(".admin-terminal-share-modal-code strong"),
    page.locator("[data-admin-player-created-access-code]"),
  ];
  await page.screenshot({
    path: `${OUTPUT_DIR}/${name}`,
    fullPage: true,
    mask: masks,
  }).catch(() => {});
}

let failure;
try {
  await page.goto(`${BASE_URL}/?mode=create`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.locator("#createForm").waitFor({ state: "visible", timeout: 30_000 });

  const brokenImages = await page.locator("img").evaluateAll((images) => images
    .filter((image) => image.complete && image.naturalWidth === 0)
    .map((image) => image.getAttribute("src") || "[missing-src]"));
  if (brokenImages.length) throw new Error(`Login page has broken images: ${brokenImages.join(", ")}`);

  await page.locator("#licenseCode").fill(LICENSE_CODE);
  await page.locator("#createEmail").fill(ADMIN_EMAIL);
  await page.locator("#createDisplayName").fill("Browser E2E Teacher");
  await page.locator("#sessionName").fill(GAME_NAME);
  await page.locator("#gameTimeZone").selectOption("Asia/Seoul");
  await page.locator("#difficultyLevel").selectOption("moderate");
  await page.locator("#createAccessCode").fill(ADMIN_PASSWORD);
  await page.locator("#confirmAccessCode").fill(ADMIN_PASSWORD);

  const signupResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/functions/v1/classroom-api/staff/signup"),
    { timeout: 180_000 },
  );
  await page.getByRole("button", { name: "Create Game", exact: true }).click();
  const signupResponse = await signupResponsePromise;
  if (signupResponse.status() !== 201) {
    const body = sanitize(await signupResponse.text().catch(() => ""));
    throw new Error(`Rendered Create Game returned ${signupResponse.status()}: ${body.slice(0, 500)}`);
  }
  evidence.createdThroughRenderedUi = true;

  await waitForAdminConsole();
  evidence.adminConsoleRendered = true;
  assertNoFailedRequests("Initial Admin bootstrap");

  for (const section of ["Attendance", "Players", "Contracts", "Store", "Marketplace", "Settings", "Logs", "Overview"]) {
    await navigateSection(section);
  }

  const shareRequestIndex = evidence.requests.length;
  const initialShare = await openShareModal();
  evidence.shareGameCode.opened = true;
  evidence.shareGameCode.automatic = true;
  evidence.shareGameCode.displayed = true;
  evidence.shareGameCode.formatValid = true;
  const initialCode = initialShare.code;
  assertNoFailedRequests("Automatic Share Game Code", shareRequestIndex);
  await closeShareModal(initialShare.modal);

  await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  await waitForAdminConsole();
  const persistedShare = await openShareModal();
  if (persistedShare.code !== initialCode) {
    throw new Error("Game Code changed across reload.");
  }
  evidence.shareGameCode.persistedAfterReload = true;

  const rotateRequestIndex = evidence.requests.length;
  const rotateButton = persistedShare.modal.locator('[data-admin-terminal-action="reset-game-code"]:visible').first();
  await rotateButton.waitFor({ state: "visible", timeout: 10_000 });
  const rotateResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/join-code/reset") && response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await rotateButton.click();
  const rotateResponse = await rotateResponsePromise;
  if (!rotateResponse.ok()) throw new Error(`Rotate Game Code returned ${rotateResponse.status()}`);
  await page.waitForFunction(({ prior, patternSource }) => {
    const nodes = [...document.querySelectorAll('[data-modal-id="share-game-access"] .admin-terminal-share-modal-code strong')];
    const visible = nodes.reverse().find((node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    });
    const value = String(visible?.textContent || "").trim();
    return value !== prior && new RegExp(patternSource).test(value);
  }, { prior: initialCode, patternSource: MEMORABLE_CODE_PATTERN.source }, { timeout: 20_000 });
  const rotatedCode = String(await persistedShare.label.textContent() || "").trim();
  if (!MEMORABLE_CODE_PATTERN.test(rotatedCode) || rotatedCode === initialCode) {
    throw new Error("Explicit Game Code rotation did not produce a new memorable code.");
  }
  evidence.shareGameCode.rotated = true;
  assertNoFailedRequests("Rotate Game Code", rotateRequestIndex);
  await closeShareModal(persistedShare.modal);

  await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  await waitForAdminConsole();
  const rotatedPersistedShare = await openShareModal();
  if (rotatedPersistedShare.code !== rotatedCode) {
    throw new Error("Rotated Game Code did not persist across reload.");
  }
  evidence.shareGameCode.rotationPersistedAfterReload = true;
  await closeShareModal(rotatedPersistedShare.modal);

  await navigateSection("Overview");
  await page.getByRole("button", { name: /Add Player/i }).first().click();
  const playerForm = page.locator("[data-admin-terminal-player-form]:visible");
  await playerForm.waitFor({ state: "visible", timeout: 20_000 });
  evidence.playerCreation.opened = true;
  await playerForm.locator('[name="displayName"]').fill(PLAYER_NAME);
  const roster = playerForm.locator('[name="rosterLabel"]');
  if (await roster.count()) await roster.fill("Browser E2E Roster");
  await playerForm.locator('[name="playerIdentifier"]').fill(PLAYER_IDENTIFIER);
  await playerForm.locator('[name="accessCode"]').fill(PLAYER_ACCESS_CODE);

  const createPlayerRequestIndex = evidence.requests.length;
  const createPlayerResponsePromise = page.waitForResponse(
    (candidate) => /\/functions\/v1\/admin-api\/games\/[^/]+\/players$/.test(new URL(candidate.url()).pathname) &&
      candidate.request().method() === "POST",
    { timeout: 120_000 },
  );
  await playerForm.locator('[data-admin-terminal-action="create-player"], button[type="submit"]').first().click();
  const createPlayerResponse = await createPlayerResponsePromise;
  if (createPlayerResponse.status() !== 201) {
    const body = sanitize(await createPlayerResponse.text().catch(() => ""));
    throw new Error(`Rendered Add Player returned ${createPlayerResponse.status()}: ${body.slice(0, 500)}`);
  }
  evidence.playerCreation.created = true;
  assertNoFailedRequests("Add Player", createPlayerRequestIndex);

  const confirmation = page.locator("[data-admin-player-created-confirmation]:visible");
  await confirmation.waitFor({ state: "visible", timeout: 20_000 });
  await confirmation.locator("[data-admin-player-created-identifier]").waitFor({ state: "visible" });
  await confirmation.locator("[data-admin-player-created-access-code]").waitFor({ state: "visible" });
  await confirmation.locator("[data-admin-player-created-done]").click();

  await navigateSection("Players");
  await page.getByText(PLAYER_NAME, { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await safeScreenshot("players-after-create.png");

  await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  await waitForAdminConsole();
  await navigateSection("Players");
  await page.getByText(PLAYER_NAME, { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  evidence.playerCreation.persistedAfterReload = true;

  const logoutRequestIndex = evidence.requests.length;
  const accountTrigger = page.locator("[data-admin-terminal-user]:visible").first();
  await accountTrigger.click();
  evidence.logout.menuOpened = true;
  const accountMenu = page.locator("[data-admin-terminal-user-menu]:visible").first();
  await accountMenu.waitFor({ state: "visible", timeout: 10_000 });
  const logoutTrigger = accountMenu.locator(
    '[data-econovaria-admin-logout], [data-admin-terminal-action="logout"], [data-admin-terminal-action="sign-out"], button, a',
  ).filter({ hasText: /^(?:Sign out|Log out|Logout)$/i }).last();
  await logoutTrigger.waitFor({ state: "visible", timeout: 10_000 });
  await logoutTrigger.click();
  const logoutConfirmation = page.locator("[data-econovaria-admin-logout-confirmation]:visible");
  await logoutConfirmation.waitFor({ state: "visible", timeout: 10_000 });
  evidence.logout.confirmationOpened = true;
  await logoutConfirmation.locator("[data-econovaria-logout-confirm]").click();
  await page.waitForURL(/reason=signed-out/, { timeout: 60_000 });
  evidence.logout.redirected = true;

  const retainedSession = await page.evaluate(() => sessionStorage.getItem("econovaria.admin.auth.v1"));
  if (retainedSession) throw new Error("Admin session remained in sessionStorage after logout.");
  assertNoFailedRequests("Logout", logoutRequestIndex);

  if (evidence.consoleErrors.length || evidence.pageErrors.length) {
    throw new Error(`Browser emitted errors: ${JSON.stringify({ consoleErrors: evidence.consoleErrors, pageErrors: evidence.pageErrors })}`);
  }
  await safeScreenshot("signed-out.png");
} catch (error) {
  failure = error;
  evidence.failure = sanitize(error?.stack || error);
  await safeScreenshot("browser-failure.png");
} finally {
  evidence.finalUrl = sanitize(page.url());
  await writeFile(`${OUTPUT_DIR}/admin-browser-reconnaissance.json`, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  await context.close();
  await browser.close();
}

if (failure) throw failure;

console.log(JSON.stringify({
  ok: true,
  createdThroughRenderedUi: evidence.createdThroughRenderedUi,
  adminConsoleRendered: evidence.adminConsoleRendered,
  navigationCount: evidence.navigation.length,
  shareGameCode: evidence.shareGameCode,
  playerCreation: evidence.playerCreation,
  logout: evidence.logout,
  runtimeRequestCount: evidence.requests.length,
}));

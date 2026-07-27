#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const BASE_URL = process.env.ECONOVARIA_BROWSER_BASE_URL || "http://127.0.0.1:4173";
const OUTPUT_DIR = process.env.ECONOVARIA_PLAYER_BROWSER_OUTPUT_DIR || "/tmp/econovaria-player-browser";
const ADMIN_EMAIL = process.env.ECONOVARIA_BROWSER_ADMIN_EMAIL || "player.e2e@example.test";
const ADMIN_PASSWORD = process.env.ECONOVARIA_BROWSER_ADMIN_PASSWORD || "Player-E2E-Admin-2026!";
const GAME_NAME = process.env.ECONOVARIA_BROWSER_GAME_NAME || "Player Multiplayer E2E";
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const PLAYERS = Object.freeze([
  { playerIdentifier: "BROWSER-PLAYER-ALPHA", accessCode: "BROWSER-ALPHA-ACCESS-001" },
  { playerIdentifier: "BROWSER-PLAYER-BETA", accessCode: "BROWSER-BETA-ACCESS-002" },
]);

await mkdir(OUTPUT_DIR, { recursive: true });

const evidence = {
  generatedAt: new Date().toISOString(),
  gameResolved: false,
  playersLoggedIn: 0,
  messaging: {
    threadCreated: false,
    initialMessagePersisted: false,
    recipientObservedThread: false,
    recipientMarkedRead: false,
    replySent: false,
    replyPersisted: false,
  },
  requests: [],
  consoleErrors: [],
  pageErrors: [],
  responseUuidLeak: false,
};

function redact(value) {
  return String(value || "")
    .replace(UUID_PATTERN, "[uuid-redacted]")
    .replace(/ECO-[A-Z]{3,12}-[A-Z]{3,12}-[0-9]{3}/g, "[game-code-redacted]")
    .replace(/BROWSER-[A-Z0-9-]+/g, "[credential-redacted]")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[jwt-redacted]");
}

async function runtimeConfig() {
  const response = await fetch(`${BASE_URL}/runtime-config.env.js`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Runtime configuration returned ${response.status}.`);
  const match = (await response.text()).match(/Object\.freeze\((\{[\s\S]*\})\);?/);
  if (!match) throw new Error("Runtime configuration could not be parsed.");
  const publishableKey = String(JSON.parse(match[1]).supabasePublishableKey || "").trim();
  if (!publishableKey || publishableKey.startsWith("sb_secret_")) {
    throw new Error("A browser-safe Supabase publishable key is required.");
  }
  return publishableKey;
}

function platformHeaders(publishableKey, token = publishableKey) {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    apikey: publishableKey,
    Authorization: `Bearer ${token}`,
  };
}

async function jsonRequest(path, { method = "GET", headers = {}, body } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  return { status: response.status, ok: response.ok, payload };
}

async function resolveGameCode() {
  const publishableKey = await runtimeConfig();
  const signIn = await jsonRequest("/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: platformHeaders(publishableKey),
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  if (signIn.status !== 200 || !signIn.payload?.access_token) {
    throw new Error(`Connected Admin sign-in returned ${signIn.status}.`);
  }
  const bootstrap = await jsonRequest("/functions/v1/classroom-api/staff/bootstrap", {
    headers: platformHeaders(publishableKey, signIn.payload.access_token),
  });
  if (bootstrap.status !== 200 || bootstrap.payload?.ok !== true) {
    throw new Error(`Connected staff bootstrap returned ${bootstrap.status}.`);
  }
  const sessions = Array.isArray(bootstrap.payload.activeGameSessions)
    ? bootstrap.payload.activeGameSessions
    : [];
  const game = sessions.find((item) => item?.name === GAME_NAME) || sessions[0];
  const gameCode = String(game?.gameCode || game?.joinCode || "").trim();
  if (!/^ECO-[A-Z]{3,12}-[A-Z]{3,12}-[0-9]{3}$/.test(gameCode)) {
    throw new Error("Connected bootstrap did not return the expected memorable Game Code.");
  }
  evidence.gameResolved = true;
  return gameCode;
}

function instrument(page, playerLabel) {
  page.on("console", (message) => {
    if (message.type() === "error") evidence.consoleErrors.push(`${playerLabel}: ${redact(message.text())}`);
  });
  page.on("pageerror", (error) => evidence.pageErrors.push(`${playerLabel}: ${redact(error?.message || error)}`));
  page.on("response", async (response) => {
    const url = response.url();
    if (!url.includes("/functions/v1/classroom-api/")) return;
    evidence.requests.push({
      player: playerLabel,
      method: response.request().method(),
      path: redact(new URL(url).pathname),
      status: response.status(),
    });
    if (!(response.headers()["content-type"] || "").includes("application/json")) return;
    const body = await response.text().catch(() => "");
    UUID_PATTERN.lastIndex = 0;
    if (UUID_PATTERN.test(body)) evidence.responseUuidLeak = true;
  });
}

function assertNoFailedRequests(label, startIndex) {
  const failed = evidence.requests.slice(startIndex).filter((entry) => entry.status >= 400);
  if (failed.length) throw new Error(`${label} observed failed requests: ${JSON.stringify(failed)}`);
}

async function loginPlayer(browser, gameCode, player, label) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  instrument(page, label);
  await page.goto(`${BASE_URL}/?mode=player&gameCode=${encodeURIComponent(gameCode)}`, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  await page.locator("#gameCode").waitFor({ state: "visible", timeout: 30_000 });
  await page.locator("#playerId").fill(player.playerIdentifier);
  await page.locator("#playerAccessCode").fill(player.accessCode);
  const requestIndex = evidence.requests.length;
  const loginResponse = page.waitForResponse(
    (response) => response.url().includes("/functions/v1/classroom-api/players/login") && response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await page.locator("#playerForm button[type='submit']").click();
  const response = await loginResponse;
  if (response.status() !== 200) throw new Error(`${label} login returned ${response.status()}.`);
  await page.waitForURL(/\/player-terminal\/(?:index\.html)?(?:#.*)?$/, { timeout: 120_000 });
  await page.locator(".player-terminal-app-root").waitFor({ state: "visible", timeout: 120_000 });
  assertNoFailedRequests(`${label} login`, requestIndex);
  evidence.playersLoggedIn += 1;
  return { context, page, label };
}

async function openMessages(session) {
  const requestIndex = evidence.requests.length;
  const route = session.page.locator('[data-route="messages"]:visible').first();
  await route.waitFor({ state: "visible", timeout: 30_000 });
  await route.click();
  await session.page.waitForFunction(() => location.hash === "#messages", undefined, { timeout: 30_000 });
  await session.page.locator(".player-terminal-messages-page").waitFor({ state: "visible", timeout: 30_000 });
  assertNoFailedRequests(`${session.label} Messages route`, requestIndex);
}

async function refreshMessages(session) {
  const { page } = session;
  if (!await page.evaluate(() => location.hash === "#messages")) await openMessages(session);

  const requestIndex = evidence.requests.length;
  const refreshResponse = page.waitForResponse(
    (response) => new URL(response.url()).pathname.endsWith("/players/me/messages") && response.request().method() === "GET",
    { timeout: 60_000 },
  );
  await page.evaluate(() => {
    globalThis.dispatchEvent(new CustomEvent("econovaria:player-resources-invalidated", {
      detail: { resources: ["messages"] },
    }));
  });
  const response = await refreshResponse;
  if (!response.ok()) throw new Error(`${session.label} Messages refresh returned ${response.status()}.`);
  await page.locator(".player-terminal-messages-page").waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForFunction(() => {
    const surface = document.querySelector(".player-terminal-messages-page");
    return Boolean(surface && surface.getAttribute("aria-busy") !== "true");
  }, undefined, { timeout: 60_000 });
  assertNoFailedRequests(`${session.label} Messages route refresh`, requestIndex);
}

async function openThreadCreationForm(page) {
  const form = page.locator('form[data-endpoint="messageThreadCreate"]');
  const details = form.locator("xpath=ancestor::details[1]");
  if (await details.count()) {
    const open = await details.evaluate((node) => node.open === true);
    if (!open) await details.locator("summary").click();
  }
  await form.waitFor({ state: "visible", timeout: 30_000 });
  return form;
}

function threadByTitle(page, title) {
  return page.locator("[data-player-message-thread]").filter({ hasText: title }).first();
}

function messageInLog(page, message) {
  return page.locator(".player-terminal-message-log p").filter({ hasText: message }).first();
}

async function createThread(sender, recipient) {
  await openMessages(sender);
  const message = `Connected mutation message ${Date.now()}`;
  const title = `Connected mutation ${Date.now()}`;
  const form = await openThreadCreationForm(sender.page);
  await form.locator('[name="recipientPlayerId"]').fill(recipient.playerIdentifier);
  await form.locator('[name="title"]').fill(title);
  await form.locator('[name="body"]').fill(message);
  const requestIndex = evidence.requests.length;
  const responsePromise = sender.page.waitForResponse(
    (response) => new URL(response.url()).pathname.endsWith("/players/me/messages/threads") && response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await form.locator('button[type="submit"]').click();
  const response = await responsePromise;
  if (![200, 201].includes(response.status())) {
    throw new Error(`Create message thread returned ${response.status()}: ${redact(await response.text().catch(() => ""))}`);
  }
  assertNoFailedRequests("Create message thread", requestIndex);
  await messageInLog(sender.page, message).waitFor({ state: "visible", timeout: 30_000 });
  evidence.messaging.threadCreated = true;

  await refreshMessages(sender);
  const threadButton = threadByTitle(sender.page, title);
  await threadButton.waitFor({ state: "visible", timeout: 30_000 });
  await threadButton.click();
  await messageInLog(sender.page, message).waitFor({ state: "visible", timeout: 30_000 });
  evidence.messaging.initialMessagePersisted = true;
  return { message, title };
}

async function receiveReadAndReply(recipientSession, initial) {
  const { page } = recipientSession;
  await refreshMessages(recipientSession);

  const threadControl = threadByTitle(page, initial.title);
  await threadControl.waitFor({ state: "visible", timeout: 30_000 });
  const threadId = String(await threadControl.getAttribute("data-player-message-thread") || "").trim();
  if (!/^thr_[0-9a-f]{32}$/.test(threadId)) throw new Error("Unread conversation did not expose a bounded public thread ID.");

  const committedRead = page.evaluate(() => new Promise((resolve, reject) => {
    const mount = document.getElementById("playerTerminal");
    if (!mount) {
      reject(new Error("Player Terminal mount is unavailable."));
      return;
    }
    const timer = setTimeout(() => reject(new Error("Message read reconciliation event timed out.")), 60_000);
    mount.addEventListener("econovaria:player-message-read-committed", (event) => {
      clearTimeout(timer);
      resolve(event.detail || {});
    }, { once: true });
  }));
  const requestIndex = evidence.requests.length;
  const readResponse = page.waitForResponse(
    (response) => /\/players\/me\/messages\/threads\/thr_[0-9a-f]{32}\/read$/.test(new URL(response.url()).pathname) && response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await threadControl.click();
  const read = await readResponse;
  if (!read.ok()) throw new Error(`Mark message thread read returned ${read.status()}.`);
  const committed = await committedRead;
  if (String(committed?.threadId || "") !== threadId) {
    throw new Error("Message read reconciliation committed a different public thread.");
  }
  assertNoFailedRequests("Mark message thread read", requestIndex);
  evidence.messaging.recipientMarkedRead = true;

  await page.waitForFunction((expectedThreadId) => {
    const controls = [...document.querySelectorAll("[data-player-message-thread]")];
    const control = controls.find((item) => item.getAttribute("data-player-message-thread") === expectedThreadId);
    const surface = control?.closest(".player-terminal-messages-page");
    return Boolean(
      control &&
      !control.closest('form[data-endpoint="messageRead"]') &&
      surface?.getAttribute("aria-busy") !== "true",
    );
  }, threadId, { timeout: 60_000 });
  await messageInLog(page, initial.message).waitFor({ state: "visible", timeout: 30_000 });
  evidence.messaging.recipientObservedThread = true;

  const reply = `Connected mutation reply ${Date.now()}`;
  const form = page.locator(`form[data-endpoint="messageSend"][data-thread-id="${threadId}"]:visible`);
  await form.waitFor({ state: "visible", timeout: 30_000 });
  await form.locator('[name="body"]').fill(reply);
  const sendIndex = evidence.requests.length;
  const sendResponse = page.waitForResponse(
    (response) => /\/players\/me\/messages\/threads\/thr_[0-9a-f]{32}\/messages$/.test(new URL(response.url()).pathname) && response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await form.locator('button[type="submit"]').click();
  const sent = await sendResponse;
  if (![200, 201].includes(sent.status())) throw new Error(`Send message returned ${sent.status()}.`);
  assertNoFailedRequests("Send message reply", sendIndex);
  await messageInLog(page, reply).waitFor({ state: "visible", timeout: 30_000 });
  evidence.messaging.replySent = true;
  return reply;
}

async function verifyReply(sender, initial, reply) {
  await refreshMessages(sender);
  const threadControl = threadByTitle(sender.page, initial.title);
  await threadControl.waitFor({ state: "visible", timeout: 30_000 });
  await threadControl.click();
  await messageInLog(sender.page, reply).waitFor({ state: "visible", timeout: 30_000 });
  evidence.messaging.replyPersisted = true;
}

let browser;
const sessions = [];
let failure;
try {
  const gameCode = await resolveGameCode();
  browser = await chromium.launch({ headless: true });
  const alpha = await loginPlayer(browser, gameCode, PLAYERS[0], "Player Alpha");
  const beta = await loginPlayer(browser, gameCode, PLAYERS[1], "Player Beta");
  sessions.push(alpha, beta);
  const initial = await createThread(alpha, PLAYERS[1]);
  const reply = await receiveReadAndReply(beta, initial);
  await verifyReply(alpha, initial, reply);

  if (evidence.consoleErrors.length || evidence.pageErrors.length) {
    throw new Error(`Connected Messaging journey emitted browser errors: ${JSON.stringify({ consoleErrors: evidence.consoleErrors, pageErrors: evidence.pageErrors })}`);
  }
  if (evidence.responseUuidLeak) throw new Error("Connected Messaging responses exposed a raw UUID.");
  if (Object.values(evidence.messaging).some((value) => value !== true)) {
    throw new Error(`Connected Messaging mutation evidence is incomplete: ${JSON.stringify(evidence.messaging)}`);
  }
} catch (error) {
  failure = error;
  evidence.failure = redact(error?.stack || error);
} finally {
  evidence.finalizedAt = new Date().toISOString();
  await writeFile(`${OUTPUT_DIR}/player-connected-mutation-browser-acceptance.json`, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  for (const session of sessions) await session.context.close().catch(() => {});
  await browser?.close().catch(() => {});
}

if (failure) throw failure;
console.log(JSON.stringify({ ok: true, messaging: evidence.messaging }));

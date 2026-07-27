#!/usr/bin/env node

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CORE_URL = new URL("./connected-admin-ledger-runner-v4.mjs", import.meta.url);
const SOURCE_DIRECTORY = new URL("./", import.meta.url);

function replaceExactlyOnce(source, label, before, after) {
  const occurrences = source.split(before).length - 1;
  if (occurrences !== 1) {
    throw new Error(`${label} expected one canonical source match, found ${occurrences}.`);
  }
  return source.replace(before, after);
}

let source = await readFile(CORE_URL, "utf8");
source = replaceExactlyOnce(
  source,
  "TOTP dependency",
  'import { mkdir, writeFile } from "node:fs/promises";',
  'import { createHmac } from "node:crypto";\nimport { mkdir, writeFile } from "node:fs/promises";',
);
source = replaceExactlyOnce(
  source,
  "secure MFA helper insertion",
  `async function jsonResponse(response) {`,
  `function decodeBase32(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const normalized = String(value || "").replace(/=+$/u, "").replace(/\\s+/gu, "").toUpperCase();
  if (!normalized || /[^A-Z2-7]/u.test(normalized)) {
    throw new Error("Admin MFA enrollment did not expose a valid Base32 secret.");
  }
  const output = [];
  let accumulator = 0;
  let bits = 0;
  for (const character of normalized) {
    accumulator = (accumulator << 5) | alphabet.indexOf(character);
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      output.push((accumulator >>> bits) & 0xff);
      accumulator &= (1 << bits) - 1;
    }
  }
  return Buffer.from(output);
}

function generateTotp(secret, timestamp = Date.now()) {
  const key = decodeBase32(secret);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(timestamp / 30_000)));
  let digest;
  try {
    digest = createHmac("sha1", key).update(counter).digest();
    const offset = digest[digest.length - 1] & 0x0f;
    const value = digest.readUInt32BE(offset) & 0x7fffffff;
    return String(value % 1_000_000).padStart(6, "0");
  } finally {
    key.fill(0);
    counter.fill(0);
    digest?.fill(0);
  }
}

async function completeMfaEnrollmentIfRequired(page) {
  const dialog = page.locator(".econovaria-mfa-dialog");
  await dialog.waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});
  if (!await dialog.isVisible().catch(() => false)) return;

  const secretNode = dialog.locator(".econovaria-mfa-secret");
  await secretNode.waitFor({ state: "visible", timeout: 20_000 });
  const secret = String(await secretNode.textContent() || "").trim();
  const remainingSeconds = 30 - (Math.floor(Date.now() / 1000) % 30);
  if (remainingSeconds < 5) {
    await page.waitForTimeout((remainingSeconds + 1) * 1000);
  }
  await dialog.locator(".econovaria-mfa-code").fill(generateTotp(secret));
  await dialog.locator(".econovaria-mfa-submit").click();
  await dialog.waitFor({ state: "detached", timeout: 30_000 });
}

async function jsonResponse(response) {`,
);
source = replaceExactlyOnce(
  source,
  "HttpOnly Admin browser login",
  `try {
  const auth = await authenticate();
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  await context.addInitScript(({ origin, record, gameId }) => {
    if (location.origin !== origin) return;
    sessionStorage.setItem("econovaria.admin.auth.v1", JSON.stringify(record));
    sessionStorage.setItem("econovaria.admin.selected-game.v1", gameId);
  }, { origin: new URL(BASE_URL).origin, record: auth.record, gameId: auth.gameId });

  const page = await context.newPage();
  instrument(page);
  await page.goto(\`${BASE_URL}/admin/\`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await waitForAdmin(page);`,
  `try {
  const auth = await authenticate();
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });

  const page = await context.newPage();
  instrument(page);
  await page.goto(\`${BASE_URL}/?mode=admin\`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.locator("#adminEmail").fill(ADMIN_EMAIL);
  await page.locator("#adminAccessCode").fill(ADMIN_PASSWORD);
  const loginResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/functions/v1/web-session-api/login") && response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await page.locator("#adminForm button[type='submit']").click();
  const loginResponse = await loginResponsePromise;
  if (loginResponse.status() !== 200) {
    throw new Error(\`Admin BFF sign-in returned \${loginResponse.status()}.\`);
  }
  await page.locator("#adminGamesStep:not(.hidden)").waitFor({ state: "visible", timeout: 30_000 });
  const namedGame = page.locator("#adminGameList .game-row").filter({ hasText: GAME_NAME }).first();
  const gameControl = await namedGame.count()
    ? namedGame
    : page.locator("#adminGameList .game-row").first();
  await gameControl.waitFor({ state: "visible", timeout: 30_000 });
  await gameControl.click();
  await waitForAdmin(page);`,
);
source = replaceExactlyOnce(
  source,
  "MFA-aware ledger submission",
  `  await submit.click();
  const response = await responsePromise;`,
  `  await submit.click();
  await completeMfaEnrollmentIfRequired(page);
  const response = await responsePromise;`,
);

const materializedDirectory = await mkdtemp(join(fileURLToPath(SOURCE_DIRECTORY), ".connected-admin-ledger-materialized-"));
const materializedPath = join(materializedDirectory, "connected-admin-ledger-runner.mjs");
try {
  await writeFile(materializedPath, source, "utf8");
  await import(pathToFileURL(materializedPath).href);
} finally {
  await rm(materializedDirectory, { recursive: true, force: true });
}

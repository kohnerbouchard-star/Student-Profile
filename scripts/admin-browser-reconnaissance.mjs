#!/usr/bin/env node

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CORE_URL = new URL("./admin-browser-reconnaissance-core.mjs", import.meta.url);
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
  "In-card MFA enrollment journey",
  `async function completeMfaEnrollmentIfRequired() {
  const dialog = page.locator(".econovaria-mfa-dialog");
  await dialog.waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
  if (!await dialog.isVisible().catch(() => false)) return;

  const secretNode = dialog.locator(".econovaria-mfa-secret");
  await secretNode.waitFor({ state: "visible", timeout: 20_000 });
  const secret = String(await secretNode.textContent() || "").trim();

  const remainingSeconds = 30 - (Math.floor(Date.now() / 1000) % 30);
  if (remainingSeconds < 5) {
    await page.waitForTimeout((remainingSeconds + 1) * 1000);
  }
  const code = generateTotp(secret);

  const verifyResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/functions/v1/web-session-api/mfa/verify") &&
      response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await dialog.locator(".econovaria-mfa-code").fill(code);
  await dialog.locator(".econovaria-mfa-submit").click();
  const verifyResponse = await verifyResponsePromise;
  if (!verifyResponse.ok()) {
    const body = sanitize(await verifyResponse.text().catch(() => ""));
    throw new Error(\`Rendered MFA verification returned \${verifyResponse.status()}: \${body.slice(0, 500)}\`);
  }
  await dialog.waitFor({ state: "detached", timeout: 30_000 });
}`,
  `async function completeMfaEnrollmentIfRequired() {
  const host = page.locator("#econovariaAdminMfaStep:not(.hidden)");
  await host.waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
  if (!await host.isVisible().catch(() => false)) return;

  const secretNode = host.locator(".econovaria-mfa-secret");
  await secretNode.waitFor({ state: "visible", timeout: 20_000 });
  const secret = String(await secretNode.textContent() || "").trim();

  const remainingSeconds = 30 - (Math.floor(Date.now() / 1000) % 30);
  if (remainingSeconds < 5) {
    await page.waitForTimeout((remainingSeconds + 1) * 1000);
  }
  const code = generateTotp(secret);

  await host.locator(".econovaria-mfa-setup-continue").click();
  const form = host.locator(".econovaria-mfa-form:not(.hidden)");
  await form.waitFor({ state: "visible", timeout: 20_000 });
  const verifyResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/functions/v1/web-session-api/mfa/verify") &&
      response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await form.locator(".econovaria-mfa-code").fill(code);
  await form.locator(".econovaria-mfa-submit").click();
  const verifyResponse = await verifyResponsePromise;
  if (!verifyResponse.ok()) {
    const body = sanitize(await verifyResponse.text().catch(() => ""));
    throw new Error(\`Rendered MFA verification returned \${verifyResponse.status()}: \${body.slice(0, 500)}\`);
  }
  await page.locator("#econovariaAdminMfaStep").waitFor({ state: "hidden", timeout: 30_000 });
}`,
);
source = replaceExactlyOnce(
  source,
  "Stepped Create Game journey",
  `  await page.locator("#licenseCode").fill(LICENSE_CODE);
  await page.locator("#createEmail").fill(ADMIN_EMAIL);
  await page.locator("#createDisplayName").fill("Browser E2E Teacher");
  await page.locator("#sessionName").fill(GAME_NAME);
  await page.locator("#gameTimeZone").selectOption("Asia/Seoul");
  await page.locator("#difficultyLevel").selectOption("moderate");
  await page.locator("#createAccessCode").fill(ADMIN_PASSWORD);
  await page.locator("#confirmAccessCode").fill(ADMIN_PASSWORD);`,
  `  await page.locator("#licenseCode").fill(LICENSE_CODE);
  await page.locator("#createEmail").fill(ADMIN_EMAIL);
  await page.locator("#createDisplayName").fill("Browser E2E Teacher");
  await page.locator('.econovaria-create-step[data-step="1"] .econovaria-create-next').click();

  const gameStep = page.locator('.econovaria-create-step[data-step="2"]:not(.hidden)');
  await gameStep.waitFor({ state: "visible", timeout: 20_000 });
  await page.locator("#sessionName").fill(GAME_NAME);
  await page.locator("#gameTimeZone").selectOption("Asia/Seoul");
  await page.locator("#difficultyLevel").selectOption("moderate");
  await gameStep.locator(".econovaria-create-next").click();

  const securityStep = page.locator('.econovaria-create-step[data-step="3"]:not(.hidden)');
  await securityStep.waitFor({ state: "visible", timeout: 20_000 });
  await page.locator("#createAccessCode").fill(ADMIN_PASSWORD);
  await page.locator("#confirmAccessCode").fill(ADMIN_PASSWORD);`,
);
source = replaceExactlyOnce(
  source,
  "Share modal settlement",
  `async function closeShareModal(modal) {
  await page.keyboard.press("Escape");
  if (await modal.isVisible().catch(() => false)) {
    const close = modal.locator('[data-admin-terminal-modal-close], button[aria-label*="Close"]:visible').first();
    if (await close.count()) await close.click();
  }
}`,
  `async function closeShareModal(modal) {
  await page.keyboard.press("Escape");
  if (await modal.isVisible().catch(() => false)) {
    const close = modal.locator('[data-admin-terminal-modal-close], button[aria-label*="Close"]:visible').first();
    if (await close.count()) await close.click();
  }
  await modal.waitFor({ state: "hidden", timeout: 10_000 });
}`,
);
source = replaceExactlyOnce(
  source,
  "Player creation BFF route",
  `(candidate) => /\\/functions\\/v1\\/admin-api\\/games\\/[^/]+\\/players$/.test(new URL(candidate.url()).pathname) &&`,
  `(candidate) => /\\/functions\\/v1\\/web-session-api\\/proxy\\/games\\/[^/]+\\/players$/.test(new URL(candidate.url()).pathname) &&`,
);
source = replaceExactlyOnce(
  source,
  "Logout revocation evidence",
  `  assertNoFailedRequests("Logout", logoutRequestIndex);

  if (evidence.consoleErrors.length || evidence.pageErrors.length) {
    throw new Error(\`Browser emitted errors: \${JSON.stringify({ consoleErrors: evidence.consoleErrors, pageErrors: evidence.pageErrors })}\`);
  }`,
  `  const logoutRequests = evidence.requests.slice(logoutRequestIndex);
  const expectedRevocationProbe = logoutRequests.find((request) =>
    request.method === "GET" &&
    request.status === 401 &&
    request.url.endsWith("/functions/v1/web-session-api/status")
  );
  if (!expectedRevocationProbe) {
    throw new Error("Logout did not prove the revoked Admin session was rejected by the status boundary.");
  }
  const unexpectedLogoutFailures = logoutRequests.filter((request) =>
    request.status >= 400 && request !== expectedRevocationProbe
  );
  if (unexpectedLogoutFailures.length) {
    throw new Error(\`Logout observed unexpected failed requests: \${JSON.stringify(unexpectedLogoutFailures)}\`);
  }
  evidence.logout.statusRejected = true;

  const expectedUnauthorizedConsoleError =
    "Failed to load resource: the server responded with a status of 401 (Unauthorized)";
  const unexpectedConsoleErrors = evidence.consoleErrors.filter((message) =>
    message !== expectedUnauthorizedConsoleError
  );
  if (unexpectedConsoleErrors.length || evidence.pageErrors.length) {
    throw new Error(\`Browser emitted errors: \${JSON.stringify({ consoleErrors: unexpectedConsoleErrors, pageErrors: evidence.pageErrors })}\`);
  }`,
);

const materializedDirectory = await mkdtemp(join(fileURLToPath(SOURCE_DIRECTORY), ".admin-browser-materialized-"));
const materializedPath = join(materializedDirectory, "admin-browser-reconnaissance.mjs");
try {
  await writeFile(materializedPath, source, "utf8");
  await import(pathToFileURL(materializedPath).href);
} finally {
  await rm(materializedDirectory, { recursive: true, force: true });
}

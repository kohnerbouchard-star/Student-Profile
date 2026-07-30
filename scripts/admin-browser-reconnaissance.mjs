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
const legacyPlayerRoute = String.raw`(candidate) => /\/functions\/v1\/admin-api\/games\/[^/]+\/players$/.test(new URL(candidate.url()).pathname) &&`;
const canonicalPlayerRoute = String.raw`(candidate) => /\/functions\/v1\/web-session-api\/proxy\/games\/[^/]+\/players$/.test(new URL(candidate.url()).pathname) &&`;
if (source.includes(legacyPlayerRoute)) {
  source = replaceExactlyOnce(
    source,
    "Player creation BFF route",
    legacyPlayerRoute,
    canonicalPlayerRoute,
  );
} else if (!source.includes(canonicalPlayerRoute)) {
  throw new Error("Player creation BFF route is neither legacy nor canonical.");
}
source = replaceExactlyOnce(
  source,
  "Logout revocation response settlement",
  `  await logoutConfirmation.locator("[data-econovaria-logout-confirm]").click();
  await page.waitForURL(/reason=signed-out/, { timeout: 60_000 });
  evidence.logout.redirected = true;`,
  `  const revokedStatusResponsePromise = page.waitForResponse((response) => {
    const request = response.request();
    return request.method() === "GET" &&
      response.status() === 401 &&
      new URL(response.url()).pathname.endsWith("/functions/v1/web-session-api/status");
  }, { timeout: 60_000 });
  await logoutConfirmation.locator("[data-econovaria-logout-confirm]").click();
  await page.waitForURL(/reason=signed-out/, { timeout: 60_000 });
  await revokedStatusResponsePromise;
  evidence.logout.redirected = true;`,
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

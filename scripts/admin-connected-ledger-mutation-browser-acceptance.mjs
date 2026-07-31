#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resetLocalAcceptanceRateLimits } from "./local-acceptance-rate-limit-reset.mjs";

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
const ADMIN_EMAIL = String(
  process.env.ECONOVARIA_BROWSER_ADMIN_EMAIL || "browser.e2e@example.test",
).trim().toLowerCase();
const TOOL_DIRECTORY = new URL("../player-terminal/tools/", import.meta.url);
const CORE_URL = new URL("connected-admin-ledger-runner-v4.mjs", TOOL_DIRECTORY);
const WRAPPER_URL = new URL("connected-admin-ledger-runner.mjs", TOOL_DIRECTORY);

const LEGACY_MFA = `async function completeMfaEnrollmentIfRequired(page, timeoutMs = 20_000) {
  const dialog = page.locator(".econovaria-mfa-dialog");
  await dialog.waitFor({ state: "visible", timeout: timeoutMs }).catch(() => {});
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
}`;

const IN_CARD_MFA = `async function completeMfaEnrollmentIfRequired(page, timeoutMs = 20_000) {
  const host = page.locator("#econovariaAdminMfaStep:not(.hidden)");
  await host.waitFor({ state: "visible", timeout: timeoutMs }).catch(() => {});
  if (!await host.isVisible().catch(() => false)) return;

  const secretNode = host.locator(".econovaria-mfa-secret");
  await secretNode.waitFor({ state: "visible", timeout: 20_000 });
  const secret = String(await secretNode.textContent() || "").trim();
  const remainingSeconds = 30 - (Math.floor(Date.now() / 1000) % 30);
  if (remainingSeconds < 5) {
    await page.waitForTimeout((remainingSeconds + 1) * 1000);
  }
  await host.locator(".econovaria-mfa-setup-continue").click();
  const form = host.locator(".econovaria-mfa-form:not(.hidden)");
  await form.waitFor({ state: "visible", timeout: 20_000 });
  await form.locator(".econovaria-mfa-code").fill(generateTotp(secret));
  await form.locator(".econovaria-mfa-submit").click();
  await page.locator("#econovariaAdminMfaStep").waitFor({ state: "hidden", timeout: 30_000 });
}`;

function replaceExactlyOnce(source, label, before, after) {
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${label} expected one canonical source match, found ${count}.`);
  }
  return source.replace(before, after);
}

function resetLocalAdminMfaFactor() {
  resetLocalAcceptanceRateLimits();
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@example\.test$/.test(ADMIN_EMAIL)) {
    throw new Error("Local Admin MFA reset is restricted to example.test acceptance accounts.");
  }
  const email = ADMIN_EMAIL.replaceAll("'", "''");
  const sql = `
    do $reset$
    declare
      v_user_id uuid;
    begin
      select id into v_user_id
      from auth.users
      where lower(email) = lower('${email}')
      limit 1;

      if v_user_id is not null then
        delete from auth.mfa_challenges
        where factor_id in (
          select id from auth.mfa_factors where user_id = v_user_id
        );
        delete from auth.mfa_factors where user_id = v_user_id;
      end if;
    end
    $reset$;
  `;
  const result = spawnSync(
    "psql",
    [DATABASE_URL, "-X", "-v", "ON_ERROR_STOP=1", "-qAt", "-c", sql],
    { encoding: "utf8", maxBuffer: 1024 * 1024 },
  );
  if (result.status !== 0) {
    throw new Error("Failed to reset the disposable Admin MFA acceptance factor.");
  }
}

resetLocalAdminMfaFactor();
let materializedDirectory = "";
try {
  const [coreSource, wrapperSource] = await Promise.all([
    readFile(CORE_URL, "utf8"),
    readFile(WRAPPER_URL, "utf8"),
  ]);
  const patchedCore = replaceExactlyOnce(
    coreSource,
    "In-card connected Admin MFA journey",
    LEGACY_MFA,
    IN_CARD_MFA,
  );

  materializedDirectory = await mkdtemp(join(
    fileURLToPath(TOOL_DIRECTORY),
    ".connected-admin-ledger-acceptance-",
  ));
  const corePath = join(materializedDirectory, "connected-admin-ledger-runner-v4.mjs");
  const wrapperPath = join(materializedDirectory, "connected-admin-ledger-runner.mjs");
  await Promise.all([
    writeFile(corePath, patchedCore, "utf8"),
    writeFile(wrapperPath, wrapperSource, "utf8"),
  ]);
  await import(pathToFileURL(wrapperPath).href);
} finally {
  if (materializedDirectory) {
    await rm(materializedDirectory, { recursive: true, force: true });
  }
  resetLocalAcceptanceRateLimits();
}

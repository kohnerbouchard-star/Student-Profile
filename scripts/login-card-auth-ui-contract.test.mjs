import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");

const [mfaSource, mfaStyles, appStyles, loginSource, apiSource, html] = await Promise.all([
  read("frontend/src/core/admin-mfa.js"),
  read("frontend/src/styles/admin-mfa.css"),
  read("frontend/src/styles/app.css"),
  read("frontend/src/core/login.js"),
  read("frontend/src/core/api.js"),
  read("index.html")
]);

test("MFA is rendered as an internal login-card face", () => {
  assert.match(mfaSource, /getElementById\("adminPane"\)/);
  assert.match(mfaSource, /econovariaAdminMfaStep/);
  assert.match(mfaSource, /econovaria-mfa-breadcrumb/);
  assert.match(mfaSource, /runtime\.Econovaria\?\.login\?\.setMode\?\.\("admin"\)/);
  assert.doesNotMatch(mfaSource, /econovaria-mfa-overlay/);
  assert.doesNotMatch(mfaSource, /aria-modal/);
  assert.doesNotMatch(mfaSource, /document\.body\.append/);
});

test("MFA controls remain wired to the existing API adapters", () => {
  for (const adapter of [
    "callAdminMfaStatus",
    "callAdminMfaEnroll",
    "callAdminMfaVerify",
    "callAdminWebSessionLogout"
  ]) {
    assert.match(mfaSource, new RegExp(`api\\(\\)\\.${adapter}`));
  }
  assert.match(apiSource, /callSupabaseJsonRoute\("webSession", "\/mfa"/);
  assert.match(apiSource, /callSupabaseJsonRoute\("webSession", "\/mfa\/enroll"/);
  assert.match(apiSource, /callSupabaseJsonRoute\("webSession", "\/mfa\/verify"/);
  assert.match(apiSource, /callSupabaseJsonRoute\("webSession", "\/logout"/);
});

test("public account creation and authenticated game creation remain separate", () => {
  assert.match(html, /id="createForm"/);
  assert.match(html, /id="adminCreateGameForm"/);
  assert.match(html, /id="createNewAdminGame"/);

  assert.match(
    loginSource,
    /getElementById\("createForm"\)\?\.addEventListener\("submit", handleCreateAccount\)/
  );
  assert.match(
    loginSource,
    /getElementById\("adminCreateGameForm"\)\?\.addEventListener\("submit", handleAdminCreateGame\)/
  );
  assert.match(loginSource, /callStaffSignupApi\?\.\(input\)/);
  assert.match(loginSource, /callLicensingActivationApi\?\.\(null, \{/);
  assert.match(loginSource, /newGameIdempotencyKey\(\)/);

  const accountHandler = loginSource.slice(
    loginSource.indexOf("async function handleCreateAccount"),
    loginSource.indexOf("async function resendCreateVerification")
  );
  assert.doesNotMatch(accountHandler, /licenseCode|sessionName|difficulty|timeZone/);
  assert.doesNotMatch(accountHandler, /callLicensingActivationApi|callSupabasePasswordSignIn/);

  const gameHandler = loginSource.slice(
    loginSource.indexOf("async function handleAdminCreateGame"),
    loginSource.indexOf("async function resetAdminLogin")
  );
  assert.match(gameHandler, /licenseCode: text\("adminNewLicenseCode"\)/);
  assert.match(gameHandler, /sessionName: text\("adminNewGameName"\)/);
  assert.match(gameHandler, /timeZone: text\("adminNewGameTimeZone"\)/);
  assert.match(gameHandler, /difficulty: text\("adminNewGameDifficulty"\)/);
  assert.doesNotMatch(gameHandler, /callStaffSignupApi|createEmail|createAccessCode/);
});

test("Timezone list is complete, silent, and device-first", () => {
  assert.match(mfaSource, /Intl\.supportedValuesOf\("timeZone"\)/);
  assert.match(mfaSource, /Intl\.DateTimeFormat\(\)\.resolvedOptions\(\)\.timeZone/);
  assert.match(mfaSource, /const ordered = \[first, \.\.\.zones\.filter/);
  assert.doesNotMatch(mfaSource, /Detected timezone/i);
});

test("Every login state shares stable card geometry without an internal scrollbar", () => {
  assert.match(appStyles, /@import url\("\.\/admin-mfa\.css"\)/);
  assert.match(mfaStyles, /\.login-panel-frame\s*\{[\s\S]*height:/);
  assert.match(mfaStyles, /height: min\(680px,/);
  assert.match(mfaStyles, /\.login-root \.mode-pane\s*\{[\s\S]*height: 336px/);
  assert.match(mfaStyles, /\.login-root \.mode-pane\s*\{[\s\S]*overflow: visible/);
  assert.doesNotMatch(mfaStyles, /scrollbar-gutter:/);
  assert.doesNotMatch(mfaStyles, /\.login-root \.mode-pane\s*\{[\s\S]*overflow-y: auto/);
  assert.match(mfaStyles, /econovaria-mfa-form\.hidden/);
  assert.match(mfaStyles, /econovaria-create-step\.hidden/);
});

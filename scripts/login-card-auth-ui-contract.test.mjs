import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");

const [mfaSource, mfaStyles, loginSource, apiSource] = await Promise.all([
  read("frontend/src/core/admin-mfa.js"),
  read("frontend/src/styles/admin-mfa.css"),
  read("frontend/src/core/login.js"),
  read("frontend/src/core/api.js")
]);

test("MFA is rendered as an internal login-card face", () => {
  assert.match(mfaSource, /getElementById\("adminPane"\)/);
  assert.match(mfaSource, /econovariaAdminMfaStep/);
  assert.match(mfaSource, /econovaria-mfa-breadcrumb/);
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

test("Create Game navigation cannot invoke signup before the final step", () => {
  assert.match(mfaSource, /button\.type = "button"/);
  assert.match(mfaSource, /const submit = form\.querySelector\("button\[type='submit'\]"\)/);
  assert.match(mfaSource, /stepThreeActions\.append\(stepThreeBack, submit\)/);
  assert.match(mfaSource, /event\.stopImmediatePropagation\(\)/);
  assert.match(loginSource, /addEventListener\(\s*"submit",\s*handleCreateGame/);
  assert.match(loginSource, /callStaffSignupApi\?\.\(input\)/);
  assert.match(loginSource, /callSupabasePasswordSignIn\?\.\(/);
});

test("Timezone list is complete, silent, and device-first", () => {
  assert.match(mfaSource, /Intl\.supportedValuesOf\("timeZone"\)/);
  assert.match(mfaSource, /Intl\.DateTimeFormat\(\)\.resolvedOptions\(\)\.timeZone/);
  assert.match(mfaSource, /const ordered = \[first, \.\.\.zones\.filter/);
  assert.doesNotMatch(mfaSource, /Detected timezone/i);
});

test("Every login state shares stable card geometry", () => {
  assert.match(mfaStyles, /\.login-panel-frame\s*\{[\s\S]*height:/);
  assert.match(mfaStyles, /\.login-root \.mode-pane\s*\{[\s\S]*height: 270px/);
  assert.match(mfaStyles, /scrollbar-gutter: stable/);
  assert.match(mfaStyles, /econovaria-mfa-form\.hidden/);
  assert.match(mfaStyles, /econovaria-create-step\.hidden/);
});

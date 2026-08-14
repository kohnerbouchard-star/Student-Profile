import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const TOKEN_HASH = "abcdefghijklmnopqrstuvwxyzABCDEFG_1234567890";
const STAGING_REF = "eecvbssdvarfcykcfrny";

function loadRecoveryStart({
  search = `?token_hash=${TOKEN_HASH}&type=recovery`,
  fetchImpl = async () => ({ ok: false, json: async () => ({}) }),
} = {}) {
  const listeners = new Map();
  const classes = new Set();
  const navigation = [];
  const historyCalls = [];
  const fetchCalls = [];
  const button = {
    hidden: true,
    disabled: false,
    textContent: "Continue to Password Reset",
    addEventListener(type, listener) { listeners.set(type, listener); },
  };
  const message = {
    textContent: "",
    classList: { toggle(name, active) { active ? classes.add(name) : classes.delete(name); } },
  };
  const intro = { textContent: "" };
  const document = {
    title: "Continue Econovaria Password Recovery",
    getElementById(id) {
      return { continueRecovery: button, recoveryMessage: message, recoveryIntro: intro }[id] || null;
    },
  };
  const location = {
    search,
    pathname: "/auth/recovery-start.html",
    href: `https://www.econovaria.com/auth/recovery-start.html${search}`,
    replace(value) { navigation.push(String(value)); },
  };
  const window = {
    document,
    history: { replaceState(...args) { historyCalls.push(args); } },
    location,
    async fetch(...args) { fetchCalls.push(args); return fetchImpl(...args); },
  };

  vm.runInNewContext(fs.readFileSync("auth/recovery-start.js", "utf8"), {
    window, document, URL, URLSearchParams, JSON, String, RegExp, Error,
  });

  return { button, classes, fetchCalls, historyCalls, intro, listeners, message, navigation };
}

test("scanner page load never consumes the recovery token", () => {
  const fixture = loadRecoveryStart();
  assert.equal(fixture.fetchCalls.length, 0);
  assert.equal(fixture.navigation.length, 0);
  assert.equal(fixture.historyCalls.length, 1);
  assert.equal(fixture.button.hidden, false);
  assert.match(fixture.message.textContent, /ready/i);
});

test("explicit continue reuses same-origin password-reset function and carries resolved project", async () => {
  const accessToken = "header.payload.signature";
  const fixture = loadRecoveryStart({
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ ok: true, verified: true, accessToken, projectRef: STAGING_REF }),
    }),
  });

  await fixture.listeners.get("click")();
  assert.equal(fixture.fetchCalls.length, 1);
  const [url, options] = fixture.fetchCalls[0];
  assert.equal(url, "/api/password-reset?operation=verify-auth");
  assert.equal(options.method, "POST");
  assert.equal(options.credentials, "same-origin");
  assert.deepEqual(JSON.parse(options.body), {
    tokenHash: TOKEN_HASH,
    type: "recovery",
    projectRef: "",
  });

  assert.equal(fixture.navigation.length, 1);
  const target = new URL(fixture.navigation[0]);
  assert.equal(target.origin, "https://www.econovaria.com");
  assert.equal(target.pathname, "/auth/reset-password.html");
  const fragment = new URLSearchParams(target.hash.slice(1));
  assert.equal(fragment.get("access_token"), accessToken);
  assert.equal(fragment.get("type"), "recovery");
  assert.equal(fragment.get("project_ref"), STAGING_REF);
});

test("invalid recovery input is rejected without network activity", () => {
  const fixture = loadRecoveryStart({ search: "?token_hash=bad&type=recovery" });
  assert.equal(fixture.fetchCalls.length, 0);
  assert.equal(fixture.button.hidden, true);
  assert.equal(fixture.classes.has("is-error"), true);
});

test("recovery review stays browser-hosted and never targets Supabase HTML functions", () => {
  const html = fs.readFileSync("auth/recovery-start.html", "utf8");
  const script = fs.readFileSync("auth/recovery-start.js", "utf8");
  assert.match(html, /src="\.\/recovery-start\.js"/u);
  assert.match(html, /id="continueRecovery"[^>]*hidden/u);
  assert.match(script, /window\.history\.replaceState/u);
  assert.match(script, /\/api\/password-reset\?operation=verify-auth/u);
  assert.doesNotMatch(script, /functions\/v1\/admin-password-recovery/u);
  assert.doesNotMatch(script, /\.supabase\.co\/auth\/v1\/verify/u);
});

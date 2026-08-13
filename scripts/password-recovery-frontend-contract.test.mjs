import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

function loadRecoveryStart({
  search = "?token_hash=abcdefghijklmnopqrstuvwxyzABCDEFG_1234567890&type=recovery",
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
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
  };
  const message = {
    textContent: "",
    classList: {
      toggle(name, active) {
        if (active) classes.add(name);
        else classes.delete(name);
      },
    },
  };
  const intro = { textContent: "" };
  const document = {
    title: "Continue Econovaria Password Recovery",
    getElementById(id) {
      return {
        continueRecovery: button,
        recoveryMessage: message,
        recoveryIntro: intro,
      }[id] || null;
    },
  };
  const location = {
    search,
    pathname: "/auth/recovery-start.html",
    href: `https://econovaria.com/auth/recovery-start.html${search}`,
    replace(value) {
      navigation.push(String(value));
    },
  };
  const window = {
    EconovariaRuntimeConfig: {
      supabaseUrl: "https://cgiukdjwicykrmtkhudh.supabase.co",
      supabasePublishableKey: "sb_publishable_test_contract_key",
    },
    document,
    history: {
      replaceState(...args) {
        historyCalls.push(args);
      },
    },
    location,
    async fetch(...args) {
      fetchCalls.push(args);
      return fetchImpl(...args);
    },
  };

  const source = fs.readFileSync("auth/recovery-start.js", "utf8");
  vm.runInNewContext(source, {
    window,
    document,
    URL,
    URLSearchParams,
    JSON,
    String,
    RegExp,
    Error,
  });

  return {
    button,
    classes,
    fetchCalls,
    historyCalls,
    intro,
    listeners,
    message,
    navigation,
  };
}

test("email scanner page load does not consume the recovery token", () => {
  const fixture = loadRecoveryStart();

  assert.equal(fixture.fetchCalls.length, 0);
  assert.equal(fixture.navigation.length, 0);
  assert.equal(fixture.historyCalls.length, 1);
  assert.equal(fixture.button.hidden, false);
  assert.match(fixture.message.textContent, /ready/i);
  assert.equal(typeof fixture.listeners.get("click"), "function");
});

test("explicit continue exchanges token hash and forwards only the recovery session", async () => {
  const accessToken = "header.payload.signature";
  const fixture = loadRecoveryStart({
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ access_token: accessToken }),
    }),
  });

  await fixture.listeners.get("click")();

  assert.equal(fixture.fetchCalls.length, 1);
  const [url, options] = fixture.fetchCalls[0];
  assert.equal(url, "https://cgiukdjwicykrmtkhudh.supabase.co/auth/v1/verify");
  assert.equal(options.method, "POST");
  assert.equal(options.credentials, "omit");
  assert.deepEqual(
    JSON.parse(options.body),
    { token_hash: "abcdefghijklmnopqrstuvwxyzABCDEFG_1234567890", type: "recovery" },
  );
  assert.equal(fixture.navigation.length, 1);
  const target = new URL(fixture.navigation[0]);
  assert.equal(target.origin, "https://econovaria.com");
  assert.equal(target.pathname, "/auth/reset-password.html");
  const fragment = new URLSearchParams(target.hash.slice(1));
  assert.equal(fragment.get("access_token"), accessToken);
  assert.equal(fragment.get("type"), "recovery");
});

test("invalid recovery input is rejected without a network request", () => {
  const fixture = loadRecoveryStart({ search: "?token_hash=bad&type=recovery" });

  assert.equal(fixture.fetchCalls.length, 0);
  assert.equal(fixture.button.hidden, true);
  assert.equal(fixture.classes.has("is-error"), true);
  assert.match(fixture.message.textContent, /invalid or has expired/i);
});

test("recovery confirmation is served by Vercel rather than Supabase Edge HTML", () => {
  const html = fs.readFileSync("auth/recovery-start.html", "utf8");
  const script = fs.readFileSync("auth/recovery-start.js", "utf8");

  assert.match(html, /src="\.\/recovery-start\.js"/u);
  assert.match(html, /id="continueRecovery"[^>]*hidden/u);
  assert.match(script, /window\.history\.replaceState/u);
  assert.match(script, /\/auth\/v1\/verify/u);
  assert.doesNotMatch(script, /functions\/v1\/admin-password-recovery/u);
});

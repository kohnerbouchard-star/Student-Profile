import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const passwordResetProxy = require("../api/password-reset.js");
const TOKEN_HASH = "abcdefghijklmnopqrstuvwxyzABCDEFG_1234567890";
const STAGING_REF = "eecvbssdvarfcykcfrny";
const PRODUCTION_REF = "cgiukdjwicykrmtkhudh";
const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_URL = process.env.ECONOVARIA_SUPABASE_URL;
const ORIGINAL_KEY = process.env.ECONOVARIA_SUPABASE_PUBLISHABLE_KEY;

process.env.ECONOVARIA_SUPABASE_URL = `https://${PRODUCTION_REF}.supabase.co`;
process.env.ECONOVARIA_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_contract_fixture";

test.after(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  restoreEnv("ECONOVARIA_SUPABASE_URL", ORIGINAL_URL);
  restoreEnv("ECONOVARIA_SUPABASE_PUBLISHABLE_KEY", ORIGINAL_KEY);
});

function loadReview({
  search = `?token_hash=${TOKEN_HASH}&type=signup`,
  fetchImpl = async () => ({ ok: false, json: async () => ({}) }),
} = {}) {
  const listeners = new Map();
  const fetchCalls = [];
  const navigation = [];
  const historyCalls = [];
  const classes = new Set();
  const button = {
    hidden: true,
    disabled: false,
    textContent: "Continue",
    addEventListener(type, listener) { listeners.set(type, listener); },
  };
  const message = {
    textContent: "",
    classList: { toggle(name, active) { active ? classes.add(name) : classes.delete(name); } },
  };
  const intro = { textContent: "" };
  const title = { textContent: "" };
  const kicker = { textContent: "" };
  const document = {
    title: "Econovaria Account Security",
    getElementById(id) {
      return {
        continueReview: button,
        reviewMessage: message,
        reviewIntro: intro,
        reviewTitle: title,
        reviewKicker: kicker,
      }[id] || null;
    },
  };
  const location = {
    search,
    pathname: "/auth/security-review.html",
    replace(value) { navigation.push(String(value)); },
  };
  const window = {
    document,
    location,
    history: { replaceState(...args) { historyCalls.push(args); } },
    async fetch(...args) { fetchCalls.push(args); return fetchImpl(...args); },
    setTimeout(fn) { fn(); },
  };
  vm.runInNewContext(fs.readFileSync("auth/security-review.js", "utf8"), {
    window, document, URLSearchParams, JSON, String, RegExp, Error,
  });
  return { button, classes, fetchCalls, historyCalls, intro, listeners, message, navigation };
}

test("email scanner GET renders review UI without consuming signup token", () => {
  const fixture = loadReview();
  assert.equal(fixture.fetchCalls.length, 0);
  assert.equal(fixture.historyCalls.length, 1);
  assert.equal(fixture.button.hidden, false);
  assert.equal(typeof fixture.listeners.get("click"), "function");
});

test("explicit signup confirmation reuses only the same-origin password-reset function", async () => {
  const fixture = loadReview({
    fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true, verified: true }) }),
  });
  await fixture.listeners.get("click")();
  assert.equal(fixture.fetchCalls.length, 1);
  const [url, options] = fixture.fetchCalls[0];
  assert.equal(url, "/api/password-reset?operation=verify-auth");
  assert.equal(options.method, "POST");
  assert.equal(options.credentials, "same-origin");
  assert.deepEqual(JSON.parse(options.body), {
    tokenHash: TOKEN_HASH,
    type: "signup",
    projectRef: "",
  });
  assert.equal(fixture.navigation[0], "../?mode=admin&reason=email-verified");
});

test("server review resolves staging token only after explicit POST and revokes temporary session", async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).includes(`${PRODUCTION_REF}.supabase.co/auth/v1/verify`)) {
      return new Response(JSON.stringify({ error: "invalid" }), { status: 400 });
    }
    if (String(url).includes(`${STAGING_REF}.supabase.co/auth/v1/verify`)) {
      return new Response(JSON.stringify({
        access_token: "header12345.payload12345.signature12345",
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (String(url).includes(`${STAGING_REF}.supabase.co/auth/v1/logout`)) {
      return new Response(null, { status: 204 });
    }
    throw new Error(`unexpected URL ${url}`);
  };

  const response = mockResponse();
  await passwordResetProxy({
    method: "POST",
    url: "/api/password-reset?operation=verify-auth",
    body: { tokenHash: TOKEN_HASH, type: "signup", projectRef: "" },
    headers: {
      host: "www.econovaria.com",
      "x-forwarded-host": "www.econovaria.com",
      origin: "https://www.econovaria.com",
      "content-type": "application/json",
    },
  }, response);

  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.text());
  assert.equal(body.ok, true);
  assert.equal(body.verified, true);
  assert.equal(body.projectRef, STAGING_REF);
  assert.equal(calls.length, 3);
  assert.match(calls[0].url, new RegExp(PRODUCTION_REF));
  assert.match(calls[1].url, new RegExp(STAGING_REF));
  assert.match(calls[2].url, /logout/u);
});

test("review page is served by the application rather than Supabase Edge HTML", () => {
  const html = fs.readFileSync("auth/security-review.html", "utf8");
  const script = fs.readFileSync("auth/security-review.js", "utf8");
  assert.match(html, /src="\.\/security-review\.js"/u);
  assert.match(html, /id="continueReview"[^>]*hidden/u);
  assert.match(script, /window\.history\.replaceState/u);
  assert.match(script, /\/api\/password-reset\?operation=verify-auth/u);
  assert.doesNotMatch(script, /\.supabase\.co\/functions\/v1/u);
});

function mockResponse() {
  const chunks = [];
  return {
    statusCode: 0,
    headers: new Map(),
    setHeader(name, value) { this.headers.set(String(name).toLowerCase(), value); },
    end(value) { if (value !== undefined) chunks.push(Buffer.from(value)); },
    text() { return Buffer.concat(chunks).toString("utf8"); },
  };
}

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

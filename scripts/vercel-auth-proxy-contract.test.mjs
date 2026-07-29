import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  BFF_CLIENT_IP_HEADER,
  BFF_NONCE_HEADER,
  BFF_SIGNATURE_HEADER,
  BFF_TIMESTAMP_HEADER,
  buildAdminBffSignaturePayload,
  proxyAdminBff,
  verifyAdminBffSignature,
} = require("../api/_admin-bff-proxy.js");
const adminProxyRoute = require("../api/admin/[...path].js");
const adminSessionRoute = require("../api/admin-session/[...path].js");
const passwordResetProxy = require("../api/password-reset.js");

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_URL = process.env.ECONOVARIA_SUPABASE_URL;
const ORIGINAL_KEY = process.env.ECONOVARIA_SUPABASE_PUBLISHABLE_KEY;
const OIDC_TOKEN = "header123456.payload123456.signature123456";
const FIXED_NOW = new Date("2026-07-29T22:00:00Z");
const FIXED_NONCE = "123e4567-e89b-42d3-a456-426614174000";

process.env.ECONOVARIA_SUPABASE_URL =
  "https://runtimefixture123456.supabase.co";
process.env.ECONOVARIA_SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_runtime_fixture_contract";

test.after(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  restoreEnv("ECONOVARIA_SUPABASE_URL", ORIGINAL_URL);
  restoreEnv("ECONOVARIA_SUPABASE_PUBLISHABLE_KEY", ORIGINAL_KEY);
});

test("Admin BFF signs exact requests with Vercel OIDC and overwrites browser metadata", async () => {
  let upstreamRequest = null;
  const response = mockResponse();
  await proxyAdminBff(adminRequest(), response, {
    proxyAdmin: false,
    now: () => FIXED_NOW,
    nonceFactory: () => FIXED_NONCE,
    fetchImpl: async (url, options) => {
      upstreamRequest = { url: String(url), options };
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  assert.equal(response.statusCode, 200);
  assert.match(upstreamRequest.url, /web-session-api\/login\?probe=1$/u);
  const headers = upstreamRequest.options.headers;
  assert.equal(headers.get("authorization"), `Bearer ${OIDC_TOKEN}`);
  assert.equal(headers.get(BFF_CLIENT_IP_HEADER), "203.0.113.25");
  assert.equal(headers.get(BFF_NONCE_HEADER), FIXED_NONCE);
  assert.equal(headers.get(BFF_TIMESTAMP_HEADER), "1785362400");
  assert.match(headers.get(BFF_SIGNATURE_HEADER), /^v1=[A-Za-z0-9_-]{43}$/u);
  assert.equal(headers.has("x-real-ip"), false);
  assert.equal(headers.has("x-vercel-forwarded-for"), false);

  const canonicalPayload = buildAdminBffSignaturePayload({
    timestampSeconds: 1785362400,
    nonce: FIXED_NONCE,
    method: "POST",
    targetUrl: upstreamRequest.url,
    browserOrigin: "https://econovaria.example",
    clientIp: "203.0.113.25",
    headers,
    bodyBytes: upstreamRequest.options.body,
  });
  assert.equal(
    verifyAdminBffSignature(
      OIDC_TOKEN,
      canonicalPayload,
      headers.get(BFF_SIGNATURE_HEADER),
    ),
    true,
  );
});

test("Admin session route ignores prefixed Vercel catch-all query shape", async () => {
  let upstreamRequest = null;
  globalThis.fetch = async (url, options) => {
    upstreamRequest = { url: String(url), options };
    return new Response(JSON.stringify({
      ok: false,
      error: { code: "invalid_login_request", retryable: false },
    }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  };

  const response = mockResponse();
  await adminSessionRoute(adminRequest({
    query: { path: ["admin-session", "login"] },
    url: "/api/admin-session/login?path=admin-session%2Flogin&probe=1",
  }), response);

  assert.equal(response.statusCode, 400);
  assert.match(upstreamRequest.url, /web-session-api\/login\?probe=1$/u);
  assert.doesNotMatch(upstreamRequest.url, /web-session-api\/admin-session/u);
});

test("Admin proxy route derives canonical suffix from request URL", async () => {
  let upstreamRequest = null;
  globalThis.fetch = async (url, options) => {
    upstreamRequest = { url: String(url), options };
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const response = mockResponse();
  await adminProxyRoute(adminRequest({
    method: "GET",
    query: { path: ["admin", "games"] },
    url: "/api/admin/games?limit=2",
    body: undefined,
  }), response);

  assert.equal(response.statusCode, 200);
  assert.match(upstreamRequest.url, /web-session-api\/proxy\/games\?limit=2$/u);
});

test("Admin BFF fails closed without Vercel deployment identity", async () => {
  let called = false;
  const response = mockResponse();
  await proxyAdminBff(adminRequest({
    headers: { "x-vercel-oidc-token": "" },
  }), response, {
    fetchImpl: async () => {
      called = true;
      return new Response("{}", { status: 200 });
    },
  });

  assert.equal(response.statusCode, 503);
  assert.equal(called, false);
  assert.match(response.text(), /admin_bff_identity_unavailable/u);
});

test("Admin BFF fails closed without platform-owned client IP", async () => {
  let called = false;
  const response = mockResponse();
  await proxyAdminBff(adminRequest({
    headers: {
      "x-real-ip": "",
      "x-vercel-forwarded-for": "",
    },
  }), response, {
    fetchImpl: async () => {
      called = true;
      return new Response("{}", { status: 200 });
    },
  });

  assert.equal(response.statusCode, 503);
  assert.equal(called, false);
  assert.match(response.text(), /admin_bff_network_metadata_unavailable/u);
});

test("password recovery proxy forwards only verified recovery and trusted IP", async () => {
  let upstreamRequest = null;
  globalThis.fetch = async (url, options) => {
    upstreamRequest = { url: String(url), options };
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const response = mockResponse();
  await passwordResetProxy({
    method: "POST",
    body: { password: "SecurePassword123!" },
    headers: {
      host: "econovaria.example",
      "x-forwarded-host": "econovaria.example",
      "x-vercel-forwarded-for": "2001:db8::25",
      "x-real-ip": "198.51.100.99",
      authorization: `Bearer ${jwt()}`,
      origin: "https://econovaria.example",
      "content-type": "application/json",
    },
    socket: { remoteAddress: "192.0.2.44" },
  }, response);

  assert.equal(response.statusCode, 200);
  assert.match(upstreamRequest.url, /password-reset-api$/u);
  assert.equal(upstreamRequest.options.headers["x-real-ip"], "2001:db8::25");
  assert.equal(upstreamRequest.options.headers.Authorization, `Bearer ${jwt()}`);
  assert.equal(upstreamRequest.options.headers["x-vercel-forwarded-for"], undefined);
});

function adminRequest(overrides = {}) {
  const baseHeaders = {
    host: "econovaria.example",
    "x-forwarded-host": "econovaria.example",
    "x-vercel-forwarded-for": "198.51.100.99",
    "x-real-ip": "203.0.113.25",
    "x-vercel-oidc-token": OIDC_TOKEN,
    origin: "https://econovaria.example",
    "content-type": "application/json",
    "x-econovaria-bff-signature": "browser-forgery",
  };
  return {
    method: "POST",
    query: { path: ["login"] },
    url: "/api/admin-session/login?probe=1",
    body: { email: "admin@example.test", password: "test" },
    socket: { remoteAddress: "192.0.2.44" },
    ...overrides,
    headers: {
      ...baseHeaders,
      ...(overrides.headers || {}),
    },
  };
}

function jwt() {
  return ["header123", "payload123", "signature123"].join(".");
}

function mockResponse() {
  const headers = new Map();
  const chunks = [];
  return {
    statusCode: 0,
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), value);
    },
    getHeader(name) {
      return headers.get(String(name).toLowerCase());
    },
    end(value) {
      if (value !== undefined) chunks.push(Buffer.from(value));
    },
    text() {
      return Buffer.concat(chunks).toString("utf8");
    },
  };
}

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

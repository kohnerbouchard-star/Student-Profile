import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { proxyAdminBff } = require("../api/_admin-bff-proxy.js");
const passwordResetProxy = require("../api/password-reset.js");

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_URL = process.env.ECONOVARIA_SUPABASE_URL;
const ORIGINAL_KEY = process.env.ECONOVARIA_SUPABASE_PUBLISHABLE_KEY;

process.env.ECONOVARIA_SUPABASE_URL =
  "https://runtimefixture123456.supabase.co";
process.env.ECONOVARIA_SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_runtime_fixture_contract";

test.after(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  restoreEnv("ECONOVARIA_SUPABASE_URL", ORIGINAL_URL);
  restoreEnv("ECONOVARIA_SUPABASE_PUBLISHABLE_KEY", ORIGINAL_KEY);
});

test("Admin BFF overwrites browser IP with Vercel trusted IP", async () => {
  let upstreamRequest = null;
  globalThis.fetch = async (url, options) => {
    upstreamRequest = { url: String(url), options };
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const response = mockResponse();
  await proxyAdminBff({
    method: "GET",
    query: { path: ["status"] },
    url: "/api/admin-session/status",
    headers: {
      host: "econovaria.example",
      "x-forwarded-host": "econovaria.example",
      "x-vercel-forwarded-for": "203.0.113.25",
      "x-real-ip": "198.51.100.99",
    },
    socket: { remoteAddress: "192.0.2.44" },
  }, response, { proxyAdmin: false });

  assert.equal(response.statusCode, 200);
  assert.match(upstreamRequest.url, /web-session-api\/status$/u);
  assert.equal(upstreamRequest.options.headers.get("x-real-ip"), "203.0.113.25");
  assert.equal(upstreamRequest.options.headers.has("x-vercel-forwarded-for"), false);
});

test("Admin BFF fails closed without trusted network metadata", async () => {
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return new Response("{}", { status: 200 });
  };

  const response = mockResponse();
  await proxyAdminBff({
    method: "GET",
    query: { path: ["status"] },
    url: "/api/admin-session/status",
    headers: {
      host: "econovaria.example",
      "x-forwarded-host": "econovaria.example",
    },
    socket: {},
  }, response, { proxyAdmin: false });

  assert.equal(response.statusCode, 400);
  assert.equal(called, false);
  assert.match(response.text(), /trusted_client_ip_unavailable/u);
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

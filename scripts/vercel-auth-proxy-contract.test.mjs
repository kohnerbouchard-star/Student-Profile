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
const { proxyPlayerBff } = require("../api/_player-bff-proxy.js");
const { readBoundedResponseBody } = require("../api/_bounded-response-reader.js");
const adminProxyRoute = require("../api/admin/[...path].js");
const adminSessionRoute = require("../api/admin-session/[...path].js");
const passwordResetProxy = require("../api/password-reset.js");

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_URL = process.env.ECONOVARIA_SUPABASE_URL;
const ORIGINAL_KEY = process.env.ECONOVARIA_SUPABASE_PUBLISHABLE_KEY;
const ORIGINAL_OIDC_TOKEN = process.env.VERCEL_OIDC_TOKEN;
const OIDC_TOKEN = "header123456.payload123456.signature123456";
const FIXED_NOW = new Date("2026-07-29T22:00:00Z");
const FIXED_NONCE = "123e4567-e89b-42d3-a456-426614174000";

process.env.ECONOVARIA_SUPABASE_URL =
  "https://runtimefixture123456.supabase.co";
process.env.ECONOVARIA_SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_runtime_fixture_contract";
process.env.VERCEL_OIDC_TOKEN = OIDC_TOKEN;

test.after(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  restoreEnv("ECONOVARIA_SUPABASE_URL", ORIGINAL_URL);
  restoreEnv("ECONOVARIA_SUPABASE_PUBLISHABLE_KEY", ORIGINAL_KEY);
  restoreEnv("VERCEL_OIDC_TOKEN", ORIGINAL_OIDC_TOKEN);
});

const RESPONSE_LIMIT = 1_048_576;
test("shared BFF reader rejects an invalid byte budget before opening the body", async () => {
  const upstream = { get body() { assert.fail("An invalid byte budget must not read upstream"); } };
  for (const limit of [undefined, NaN, Infinity, -1, 1.5]) {
    await assert.rejects(readBoundedResponseBody(upstream, limit), RangeError);
  }
});

for (const target of [
  { name: "Player", cookie: "player", title: "Player", unavailable: "Player session service is unavailable.", retryable: false, cookieAge: 14400 },
  { name: "Admin", cookie: "admin", title: "Administrator", unavailable: "Administrator session service is unavailable.", retryable: true, cookieAge: 28800 },
]) {
  test(`${target.name} BFF preserves exact-limit response bytes, status and headers`, async () => {
    const backing = new Uint8Array(RESPONSE_LIMIT + 8).fill(97);
    backing.set([0, 0xc3, 0xa9, 127], 4);
    const bytes = backing.subarray(4, RESPONSE_LIMIT + 4);
    const stream = responseStream([bytes.subarray(0, 2), bytes.subarray(2, 20001), bytes.subarray(20001)]);
    const envelope = `v1.${"a".repeat(16)}.${"b".repeat(24)}`;
    const response = mockResponse();
    await invokeBff(target.name, new Response(stream, {
      status: 206,
      headers: { "content-type": "application/json", "retry-after": "120", "set-cookie": `econovaria_${target.cookie}_session=${envelope}` },
    }), response);
    assert.equal(response.statusCode, 206);
    assert.deepEqual(response.bytes(), Buffer.from(bytes));
    assert.equal(response.getHeader("content-type"), "application/json; charset=utf-8");
    assert.equal(response.getHeader("retry-after"), "120");
    assert.equal(response.getHeader("cache-control"), "private, no-store, max-age=0");
    assert.equal(response.getHeader("x-content-type-options"), "nosniff");
    assert.deepEqual(response.getHeader("set-cookie"), [`__Host-econovaria_${target.cookie}_session=${envelope}; Path=/; Max-Age=${target.cookieAge}; HttpOnly; Secure; SameSite=Strict`]);
  });

  test(`${target.name} BFF preserves an empty no-body response`, async () => {
    const response = mockResponse();
    await invokeBff(target.name, new Response(null, { status: 204 }), response);
    assert.equal(response.statusCode, 204);
    assert.equal(response.bytes().byteLength, 0);
  });

  test(`${target.name} BFF preserves byte order across many tiny response chunks`, async () => {
    const expected = Uint8Array.from({ length: 65_537 }, (_, index) => index % 251);
    let produced = 0;
    const stream = new ReadableStream({
      pull(controller) {
        if (produced === expected.length) controller.close();
        else controller.enqueue(Uint8Array.of(expected[produced++]));
      },
    }, { highWaterMark: 0 });
    const response = mockResponse();
    await invokeBff(target.name, new Response(stream), response);
    assert.equal(response.statusCode, 200);
    assert.equal(produced, expected.length);
    assert.deepEqual(response.bytes(), Buffer.from(expected));
  });

  test(`${target.name} BFF preserves its oversized response error contract`, async () => {
    const response = mockResponse();
    await invokeBff(target.name, new Response(new Uint8Array(RESPONSE_LIMIT + 1)), response);
    assertOversizeResponse(response, target.title);
  });

  test(`${target.name} BFF preserves a read failure without leaking partial bytes or details`, async () => {
    const response = mockResponse();
    let pulls = 0;
    const stream = new ReadableStream({
      pull(controller) {
        if (pulls++ === 0) controller.enqueue(new TextEncoder().encode("private partial body"));
        else controller.error(new Error("private upstream failure"));
      },
    }, { highWaterMark: 0 });
    await invokeBff(target.name, new Response(stream), response);
    assert.equal(response.statusCode, 502);
    assert.deepEqual(JSON.parse(response.text()), { ok: false, error: { code: `${target.cookie}_bff_unavailable`, message: target.unavailable, retryable: target.retryable } });
    assert.doesNotMatch(response.text(), /private/u);
  });

  test(`${target.name} BFF preserves rejection of non-byte upstream chunks`, async () => {
    const response = mockResponse();
    await invokeBff(target.name, new Response(responseStream(["not a byte chunk"])), response);
    assert.equal(response.statusCode, 502);
    assert.deepEqual(JSON.parse(response.text()), { ok: false, error: { code: `${target.cookie}_bff_unavailable`, message: target.unavailable, retryable: target.retryable } });
  });

  for (const cancellation of ["succeeds", "rejects", "stalls"]) {
    test(`${target.name} BFF stops and cancels above 1 MiB when cancellation ${cancellation}`, { timeout: 1000 }, async () => {
      let pulls = 0, cancellations = 0;
      const stream = responseStream([new Uint8Array(RESPONSE_LIMIT), new Uint8Array(1), new Uint8Array([123])], {
        pull: () => { pulls++; },
        cancel: () => {
          cancellations++;
          if (cancellation === "rejects") throw new Error("private cancellation failure");
          if (cancellation === "stalls") return new Promise(() => {});
        },
      });
      const response = mockResponse();
      await invokeBff(target.name, new Response(stream, { headers: { "content-length": "1" } }), response);
      assertOversizeResponse(response, target.title);
      assert.equal(pulls, 2, "Must stop reading as soon as the body exceeds 1 MiB");
      assert.equal(cancellations, 1, "Oversized upstream must be cancelled");
      assert.equal(stream.locked, false);
    });
  }
}

function responseStream(chunks, observe = {}) {
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      observe.pull?.();
      if (index < chunks.length) controller.enqueue(chunks[index++]);
      else controller.close();
    },
    cancel() { return observe.cancel?.(); },
  }, { highWaterMark: 0 });
}

async function invokeBff(name, upstream, response) {
  if (name === "Admin") return proxyAdminBff(adminRequest(), response, {
    proxyAdmin: false, now: () => FIXED_NOW, nonceFactory: () => FIXED_NONCE,
    fetchImpl: async () => upstream,
  });
  const prior = globalThis.fetch;
  globalThis.fetch = async () => upstream;
  try { await proxyPlayerBff(adminRequest(), response, { proxyPlayer: false }); }
  finally { globalThis.fetch = prior; }
}

function assertOversizeResponse(response, title) {
  assert.equal(response.statusCode, 502);
  assert.deepEqual(JSON.parse(response.text()), { ok: false, error: { code: "upstream_response_too_large", message: `${title} response was too large.`, retryable: false } });
  assert.equal(response.getHeader("set-cookie"), undefined);
}

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
  assert.equal(
    headers.get("x-real-ip"),
    "203.0.113.25",
    "The signed client IP is carried for compatibility with the currently deployed legacy function.",
  );
  assert.equal(headers.has("x-vercel-forwarded-for"), false);
  assert.equal(headers.has("x-forwarded-for"), false);
  assert.equal(headers.get("idempotency-key"), "admin-command-001");
  assert.equal(headers.has("x-idempotency-key"), false);

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
  await proxyAdminBff(adminRequest(), response, {
    oidcToken: "",
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
      "x-forwarded-for": "",
      "x-vercel-forwarded-for": "",
      "x-real-ip": "",
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

test("Admin BFF rejects raw forwarding-header spoofing without Vercel client IP", async () => {
  let called = false;
  const response = mockResponse();
  await proxyAdminBff(adminRequest({
    headers: {
      "x-forwarded-for": "",
      "x-vercel-forwarded-for": "",
      "x-real-ip": "203.0.113.77",
      forwarded: "for=203.0.113.78",
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

test("Admin BFF rejects conflicting canonical and compatibility idempotency headers", async () => {
  let called = false;
  const response = mockResponse();
  await proxyAdminBff(adminRequest({
    headers: {
      "idempotency-key": "admin-command-canonical",
      "x-idempotency-key": "admin-command-compatibility",
    },
  }), response, {
    fetchImpl: async () => {
      called = true;
      return new Response("{}", { status: 200 });
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(called, false);
  assert.match(response.text(), /idempotency_key_header_mismatch/u);
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
    "x-forwarded-for": "203.0.113.25",
    "x-vercel-forwarded-for": "198.51.100.25",
    "x-real-ip": "192.0.2.44",
    origin: "https://econovaria.example",
    "content-type": "application/json",
    "x-econovaria-bff-signature": "browser-forgery",
    "x-idempotency-key": "admin-command-001",
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
    bytes() {
      return Buffer.concat(chunks);
    },
  };
}

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

const RECOVERY_PROJECT = "eecvbssdvarfcykcfrny";
const FACTOR_HANDLE = `mfa1.${"a".repeat(16)}.${"b".repeat(80)}`;
async function recoveryOperation(operation, body = {}, headers = {}) {
  const response = mockResponse();
  await passwordResetProxy({ ...adminRequest(), url: `/api/password-reset?operation=${operation}`,
    body: { projectRef: RECOVERY_PROJECT, ...body },
    headers: { ...adminRequest().headers, authorization: `Bearer ${jwt()}`, ...headers }
  }, response);
  return { status: response.statusCode, body: JSON.parse(response.text()), headers: response };
}

test("recovery MFA keeps project, bearer, Origin and trusted IP; projects only verified factors", async () => {
  let call;
  globalThis.fetch = async (url, options) => {
    call = { url, options };
    return Response.json({ ok: true, factors: [
      { handle: FACTOR_HANDLE, friendlyName: "My authenticator", factorType: "totp", status: "verified", id: "private-id" },
      { handle: "unverified", factorType: "totp", status: "unverified" }
    ], session: { refreshToken: "never-return" } });
  };
  const result = await recoveryOperation("mfa-status");
  assert.equal(result.status, 200);
  assert.equal(call.url, `https://${RECOVERY_PROJECT}.supabase.co/functions/v1/staff-mfa-api/staff/mfa`);
  assert.equal(call.options.method, "GET");
  assert.equal(call.options.headers.Authorization, `Bearer ${jwt()}`);
  assert.equal(call.options.headers.Origin, "https://econovaria.example");
  assert.equal(call.options.headers["x-real-ip"], "198.51.100.25");
  assert.deepEqual(result.body, { ok: true, factors: [{ handle: FACTOR_HANDLE, friendlyName: "My authenticator" }] });
  assert.match(result.headers.getHeader("cache-control"), /no-store/);
});

test("MFA verification returns only elevated bearer and never auto-submits a password", async () => {
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.match(url, /staff-mfa-api\/staff\/mfa\/verify$/);
    assert.deepEqual(JSON.parse(options.body), { factorHandle: FACTOR_HANDLE, code: "123456" });
    return Response.json({ ok: true, session: { assuranceLevel: "aal2", accessToken: jwt(), refreshToken: "never-return" } });
  };
  const result = await recoveryOperation("mfa-verify", { factorHandle: FACTOR_HANDLE, code: "123456" });
  assert.deepEqual(result.body, { ok: true, accessToken: jwt() });
  assert.equal(calls, 1);
});

test("MFA boundary rejects missing project, unknown fields, invalid codes, missing bearer and wrong Origin before fetch", async () => {
  globalThis.fetch = async () => { assert.fail("Rejected input must not reach upstream"); };
  for (const body of [{ projectRef: "" }, { projectRef: "otherproject" }, { password: "forbidden" }]) {
    assert.equal((await recoveryOperation("mfa-status", body)).status, 400);
  }
  assert.equal((await recoveryOperation("mfa-verify", { factorHandle: FACTOR_HANDLE, code: "bad" })).status, 400);
  assert.equal((await recoveryOperation("mfa-status", {}, { origin: "" })).status, 403);
  assert.equal((await recoveryOperation("mfa-status", {}, { origin: "https://evil.example" })).status, 502);
  assert.equal((await recoveryOperation("mfa-status", {}, { authorization: "" })).status, 401);
});

test("expired/wrong-project sessions and invalid MFA remain denied without leaking upstream material", async () => {
  for (const code of ["bad_jwt", "session_expired", "invalid_factor_handle", "mfa_verification_failed"]) {
    globalThis.fetch = async () => Response.json({ error: { code, message: "private upstream material" }, access_token: jwt() }, { status: 401 });
    const result = await recoveryOperation("mfa-verify", { factorHandle: FACTOR_HANDLE, code: "123456" });
    assert.equal(result.status, 401);
    assert.equal(result.body.error.code, code === "mfa_verification_failed" ? code : "recovery_mfa_unavailable");
    assert.doesNotMatch(JSON.stringify(result.body), /private upstream material|header123/);
  }
  globalThis.fetch = async () => Response.json({ ok: true, session: { assuranceLevel: "aal1", accessToken: jwt() } });
  assert.equal((await recoveryOperation("mfa-verify", { factorHandle: FACTOR_HANDLE, code: "123456" })).status, 502);
});

test("an explicitly selected production project never falls back to staging on a denied session", async () => {
  const calls = [];
  globalThis.fetch = async (url) => { calls.push(url); return Response.json({ error: { code: "bad_jwt" } }, { status: 401 }); };
  const result = await recoveryOperation("mfa-status", { projectRef: "cgiukdjwicykrmtkhudh" });
  assert.equal(result.status, 401);
  assert.deepEqual(calls, [`${process.env.ECONOVARIA_SUPABASE_URL}/functions/v1/staff-mfa-api/staff/mfa`]);
});

test('system recovery selects one exact project and rejects mismatched production configuration before fetch',async()=>{
  const prior=process.env.ECONOVARIA_SUPABASE_URL,calls=[];
  globalThis.fetch=async(url)=>{calls.push(url);return Response.json({error:{code:'recovery_unavailable'}},{status:403});};
  try {
    const body={projectRef:'cgiukdjwicykrmtkhudh',grant:'g'.repeat(43)};
    assert.equal((await recoveryOperation('recovery-claim',body)).status,502);
    assert.equal(calls.length,0);
    process.env.ECONOVARIA_SUPABASE_URL='https://cgiukdjwicykrmtkhudh.supabase.co';
    assert.equal((await recoveryOperation('recovery-claim',body)).status,403);
    assert.deepEqual(calls,['https://cgiukdjwicykrmtkhudh.supabase.co/functions/v1/staff-mfa-api/staff/mfa/recovery/claim']);
    calls.length=0;
    for(const projectRef of [undefined,'unknown',['eecvbssdvarfcykcfrny','cgiukdjwicykrmtkhudh']]) {
      assert.equal((await recoveryOperation('recovery-claim',{...body,projectRef})).status,400);
    }
    assert.equal(calls.length,0);
  } finally {restoreEnv('ECONOVARIA_SUPABASE_URL',prior);}
});

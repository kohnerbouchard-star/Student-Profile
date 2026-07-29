import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  ADMIN_BFF_AUTH_HEADERS,
  ADMIN_BFF_LOCAL_SIGNING_MATERIAL,
  authorizeAdminBffRequest,
  buildAdminBffSignaturePayload,
} from "../backend/src/security/adminBffRequestAuth.ts";

const TOKEN = "header123456.payload123456.signature123456";
const NOW = new Date("2026-07-29T22:00:00Z");
const TIMESTAMP_SECONDS = Math.floor(NOW.getTime() / 1000);
const NONCE = "123e4567-e89b-42d3-a456-426614174000";
const BODY = Buffer.from(JSON.stringify({ email: "a@b.co", password: "test" }));
const SIGNING_KEY_CONTEXT = "econovaria-admin-bff-signing-key-v1";

async function signedRequest({
  local = false,
  invalidSignature = false,
  strippedRuntimePath = false,
} = {}) {
  const url = local
    ? strippedRuntimePath
      ? "http://kong:8000/web-session-api/login"
      : "http://127.0.0.1:54321/functions/v1/web-session-api/login"
    : strippedRuntimePath
      ? "https://cgiukdjwicykrmtkhudh.supabase.co/web-session-api/login"
      : "https://cgiukdjwicykrmtkhudh.supabase.co/functions/v1/web-session-api/login";
  const origin = local
    ? "http://127.0.0.1:4173"
    : "https://econovaria.vercel.app";
  const headers = new Headers({
    "content-type": "application/json",
    origin,
    [ADMIN_BFF_AUTH_HEADERS.timestamp]: String(TIMESTAMP_SECONDS),
    [ADMIN_BFF_AUTH_HEADERS.nonce]: NONCE,
    [ADMIN_BFF_AUTH_HEADERS.clientIp]: "203.0.113.25",
  });
  if (local) headers.set(ADMIN_BFF_AUTH_HEADERS.mode, "local");
  else headers.set("authorization", `Bearer ${TOKEN}`);

  const signatureUrl = local
    ? "http://kong:8000/functions/v1/web-session-api/login"
    : "https://cgiukdjwicykrmtkhudh.supabase.co/functions/v1/web-session-api/login";
  const canonicalPayload = await buildAdminBffSignaturePayload({
    timestampSeconds: TIMESTAMP_SECONDS,
    nonce: NONCE,
    method: "POST",
    targetUrl: signatureUrl,
    browserOrigin: origin,
    clientIp: "203.0.113.25",
    headers,
    bodyBytes: BODY,
  });
  const signingMaterial = local ? ADMIN_BFF_LOCAL_SIGNING_MATERIAL : TOKEN;
  const signingKey = createHmac("sha256", Buffer.from(signingMaterial, "utf8"))
    .update(SIGNING_KEY_CONTEXT, "utf8")
    .digest();
  const signature = createHmac("sha256", signingKey)
    .update(canonicalPayload, "utf8")
    .digest("base64url");
  headers.set(
    ADMIN_BFF_AUTH_HEADERS.signature,
    `v1=${invalidSignature ? "A".repeat(43) : signature}`,
  );
  headers.set("x-forwarded-for", "198.51.100.1");
  return new Request(url, { method: "POST", headers, body: BODY });
}

test("accepts an exact hosted Vercel request and rewrites trusted IP", async () => {
  let nonceClaim = null;
  const result = await authorizeAdminBffRequest(await signedRequest(), {
    supabaseUrl: "https://cgiukdjwicykrmtkhudh.supabase.co",
    dependencies: {
      now: () => NOW,
      verifyOidc: async (_token, expectedEnvironment) =>
        expectedEnvironment === "production",
      claimNonce: async (claim) => {
        nonceClaim = claim;
        return true;
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.request.headers.get("x-real-ip"), "203.0.113.25");
  assert.equal(result.request.headers.has("authorization"), false);
  assert.equal(result.request.headers.has("x-forwarded-for"), false);
  assert.equal(result.request.headers.has(ADMIN_BFF_AUTH_HEADERS.signature), false);
  assert.equal(nonceClaim.runnerName, "admin-bff-vercel");
});

test("rejects a request missing the signed BFF envelope as malformed", async () => {
  let claimed = false;
  const result = await authorizeAdminBffRequest(new Request(
    "https://cgiukdjwicykrmtkhudh.supabase.co/functions/v1/web-session-api/login",
    {
      method: "POST",
      headers: {
        origin: "https://econovaria.vercel.app",
        "content-type": "application/json",
      },
      body: BODY,
    },
  ), {
    supabaseUrl: "https://cgiukdjwicykrmtkhudh.supabase.co",
    dependencies: {
      now: () => NOW,
      verifyOidc: async () => true,
      claimNonce: async () => {
        claimed = true;
        return true;
      },
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.response.status, 400);
  assert.equal(claimed, false);
});

test("rejects a modified request before claiming its nonce", async () => {
  let claimed = false;
  const result = await authorizeAdminBffRequest(
    await signedRequest({ invalidSignature: true }),
    {
      supabaseUrl: "https://cgiukdjwicykrmtkhudh.supabase.co",
      dependencies: {
        now: () => NOW,
        verifyOidc: async () => true,
        claimNonce: async () => {
          claimed = true;
          return true;
        },
      },
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.response.status, 401);
  assert.equal(claimed, false);
});

test("denies a replay after signature verification", async () => {
  const result = await authorizeAdminBffRequest(await signedRequest(), {
    supabaseUrl: "https://cgiukdjwicykrmtkhudh.supabase.co",
    dependencies: {
      now: () => NOW,
      verifyOidc: async () => true,
      claimNonce: async () => false,
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.response.status, 409);
});

test("rejects a stale signed request", async () => {
  const result = await authorizeAdminBffRequest(await signedRequest(), {
    supabaseUrl: "https://cgiukdjwicykrmtkhudh.supabase.co",
    dependencies: {
      now: () => new Date(NOW.getTime() + 121_000),
      verifyOidc: async () => true,
      claimNonce: async () => true,
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.response.status, 401);
});

test("accepts runtime-stripped hosted and local paths using one canonical target", async () => {
  const hosted = await authorizeAdminBffRequest(await signedRequest({
    strippedRuntimePath: true,
  }), {
    supabaseUrl: "https://cgiukdjwicykrmtkhudh.supabase.co",
    dependencies: {
      now: () => NOW,
      verifyOidc: async () => true,
      claimNonce: async () => true,
    },
  });
  const local = await authorizeAdminBffRequest(await signedRequest({
    local: true,
    strippedRuntimePath: true,
  }), {
    supabaseUrl: "http://kong:8000",
    dependencies: {
      now: () => NOW,
      claimNonce: async () => true,
    },
  });

  assert.equal(hosted.ok, true);
  assert.equal(local.ok, true);
});

test("accepts local mode only at the loopback boundary", async () => {
  const result = await authorizeAdminBffRequest(await signedRequest({ local: true }), {
    supabaseUrl: "http://kong:8000",
    dependencies: {
      now: () => NOW,
      claimNonce: async () => true,
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.deploymentEnvironment, "local");
});

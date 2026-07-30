import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("password reset fails closed before changing credentials", async () => {
  const source = await read("backend/supabase/functions/password-reset-api/index.ts");
  const revokeIndex = source.indexOf("const sessionsRevoked = await revokeAllSessions");
  const updateIndex = source.indexOf("const passwordUpdate = await service.auth.admin.updateUserById");
  const helperIndex = source.indexOf("async function revokeAllSessions");
  assert.ok(revokeIndex >= 0, "global session revocation must be explicit");
  assert.ok(updateIndex > revokeIndex, "revocation must precede the password mutation");
  assert.ok(helperIndex > updateIndex, "session revocation helper must remain outside the request success path");
  const handlerTail = source.slice(updateIndex, helperIndex);
  assert.match(source, /if \(!sessionsRevoked\)[\s\S]*password_reset_session_revocation_failed/);
  assert.match(source, /if \(response\?\.ok\) return true;/);
  assert.doesNotMatch(
    handlerTail,
    /sessionsRevoked:\s*true[\s\S]*revokeAllSessions/,
    "the success response must not invoke best-effort revocation after the password mutation",
  );
});

test("purchase codes use keyed versioned digests with atomic legacy upgrade", async () => {
  const hasher = await read("backend/src/domains/licensing/infrastructure/purchaseCodeHasher.ts");
  const factory = await read("backend/src/domains/licensing/infrastructure/licensingActivationFactory.ts");
  const migration = await read("backend/supabase/migrations/20260727130000_harden_purchase_code_hmac_upgrade_v1.sql");
  assert.match(hasher, /createPurchaseCodeHmacSha256Hasher/);
  assert.match(hasher, /econovaria-purchase-code-v2\\u0000/);
  assert.match(hasher, /`\$\{PURCHASE_CODE_HASH_VERSION\}\.\$\{primaryHash\}\.\$\{legacyHash\}`/);
  assert.match(factory, /createPurchaseCodeHmacSha256Hasher/);
  assert.doesNotMatch(factory, /createPurchaseCodeSha256Hasher/);
  assert.match(migration, /code_hash_version text not null default 'sha256-v1'/);
  assert.match(migration, /hmac-sha256-v2/);
  assert.match(migration, /PURCHASE_CODE_HASH_UPGRADE_CONFLICT/);
  assert.match(migration, /revoke all on function public\.redeem_purchase_code_for_game/);
});

test("Player browser runtime contains no opaque session token", async () => {
  const paths = [
    "frontend/src/core/api.js",
    "frontend/src/core/login.js",
    "player-terminal/host-runtime.js",
    "player-terminal/src/api/http-transport.js",
    "player-terminal/src/api/session-handoff.js",
    "player-terminal/src/api/adapter-transport.js",
    "player-terminal/src/api/player-api.js",
    "player-terminal/src/config/player-terminal.config.js",
    "player-terminal/src/integrations/student-profile-api-call.js",
    "player-terminal/src/integrations/player-logout-controller.js",
  ];
  for (const path of paths) {
    const source = await read(path);
    assert.doesNotMatch(
      source,
      /x-player-session-token|x-econovaria-player-session-token/iu,
      `${path} must not emit the opaque Player token header`,
    );
    assert.doesNotMatch(
      source,
      /sessionStorage[\s\S]{0,160}playerSessionToken|playerSessionToken[\s\S]{0,160}sessionStorage/iu,
      `${path} must not persist the opaque Player token`,
    );
  }
});

test("Player BFF seals the token in an HttpOnly CSRF-bound cookie", async () => {
  const helper = await read("backend/src/security/webPlayerSession.ts");
  const [entrypoint, runtime] = await Promise.all([
    read("backend/supabase/functions/player-web-session-api/index.ts"),
    read("backend/supabase/functions/player-web-session-api/runtime.ts"),
  ]);
  const edge = `${entrypoint}\n${runtime}`;
  const proxy = await read("api/_player-bff-proxy.js");
  const config = await read("backend/supabase/config.toml");
  assert.match(helper, /AES-GCM/);
  assert.match(helper, /ECONOVARIA_PLAYER_SESSION_ENCRYPTION_KEY/);
  assert.match(helper, /WEB_PLAYER_SESSION_ABSOLUTE_SECONDS = 4 \* 60 \* 60/);
  assert.match(entrypoint, /bindGatewayTrustedClientIp/);
  assert.match(edge, /requireAllowedOrigin\(request\)/);
  assert.match(edge, /requirePublishableRequest\(request\)/);
  assert.match(edge, /constantTimePlayerTextEqual\(suppliedCsrf/);
  assert.match(edge, /HttpOnly;/);
  assert.match(edge, /SameSite=Strict/);
  assert.match(edge, /clearPlayerSessionResponse/);
  assert.match(proxy, /__Host-econovaria_player_session/);
  assert.match(config, /\[functions\.player-web-session-api\][\s\S]*verify_jwt = false/);
});

test("deployment policy is delivered as HTTP security headers", async () => {
  const vercel = JSON.parse(await read("vercel.json"));
  const headers = new Map(vercel.headers[0].headers.map(({ key, value }) => [key, value]));
  const csp = headers.get("Content-Security-Policy") || "";
  const reportOnly = headers.get("Content-Security-Policy-Report-Only") || "";
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(reportOnly, /require-trusted-types-for 'script'/);
  assert.equal(headers.get("X-Frame-Options"), "DENY");
  assert.equal(headers.get("X-Content-Type-Options"), "nosniff");
});

test("internal stock runners remain signed and replay resistant", async () => {
  const entrypoints = await Promise.all([
    read("backend/supabase/functions/stock-market-runner/index.ts"),
    read("backend/supabase/functions/stock-market-seed-copy/index.ts"),
    read("backend/supabase/functions/stock-market-trading/index.ts"),
  ]);
  const auth = await read("backend/src/security/internalRunnerAuth.ts");
  for (const entrypoint of entrypoints) {
    assert.match(entrypoint, /authorizeInternalRunnerRequest/);
    assert.match(entrypoint, /claim_internal_runner_nonce_v2/);
  }
  assert.match(auth, /x-econovaria-runner-signature/);
  assert.match(auth, /x-econovaria-runner-timestamp/);
  assert.match(auth, /x-econovaria-runner-nonce/);
  assert.match(auth, /internal_runner_replay_denied/);
  assert.match(auth, /request\.headers\.has\(options\.internalSecretHeader\)/);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  assertEconovariaCiLogSanitized,
  redactEconovariaCiLog,
} from "./redact-econovaria-ci-log.mjs";

test("CI log redactor removes Supabase credentials, database URLs, and private identifiers", () => {
  const raw = [
    'DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"',
    "DB Password: postgres",
    "JWT secret │ local-jwt-secret-value",
    "ANON_KEY=arbitrary-anon-value",
    "SERVICE_ROLE_KEY='arbitrary-service-value'", // secret-scan: allow — reviewed non-secret redaction fixture
    "SUPABASE_ANON_KEY=arbitrary-prefixed-anon-value",
    "SUPABASE_SERVICE_ROLE_KEY=arbitrary-prefixed-service-value", // secret-scan: allow — reviewed non-secret redaction fixture
    "SUPABASE_JWT_SECRET=arbitrary-prefixed-jwt-value",
    "SUPABASE_DB_PASSWORD=arbitrary-prefixed-database-value",
    "SUPABASE_ACCESS_TOKEN=arbitrary-prefixed-access-value",
    "SECRET_KEY=arbitrary-secret-value",
    "PUBLISHABLE_KEY=arbitrary-publishable-value",
    "S3 Access Key │ local-s3-access-value",
    "S3_SECRET_KEY=local-s3-secret-value",
    "ECONOVARIA_RATE_LIMIT_HMAC_SECRET=local-rate-limit-secret",
    "ECONOVARIA_WEB_SESSION_ENCRYPTION_KEY=local-session-key",
    "ECONOVARIA_PLAYER_CREDENTIAL_PEPPER=local-player-pepper",
    "Authorization: Bearer browser-session-token",
    "Cookie: econovaria_player_session=opaque-session; path=/",
    "Set-Cookie: econovaria_player_session=opaque-response-session; HttpOnly",
    "apikey: opaque-api-key",
    "x-econovaria-csrf-token: opaque-csrf-token",
    "x-econovaria-player-session-token: opaque-player-session-token",
    "GET /rest/v1/player_sessions?session_token_hash=eq.79f230544341c714d292774cf20d756cbae497d4109780e66617fe03008f3f74",
    "GET /rest/v1/player_credentials?access_code_hash=eq.83797a192431acb4807d2263f841c2b3cfed2b78f55eb244ac2af081a1cae8d5",
    "GET /rest/v1/game_sessions?game_join_code_hash=eq.4b6f780148efc2bc462a6ba5b19d7a96b0d2f0b12d0d15c43d2677b7a3d5967b",
    "GET /rest/v1/players?normalized_student_code_hash=eq.2e6b0dd68a2416023af7e5b7f72b23fd890842210fdc70f0b74aae8712022473",
    '{"purchase_codes_code_hash":"ca6d5df93bc765606138f542dc6e13cafed922eac0dc64b3c7f4cab16b8d79ed"}',
    "nonce_hash │ 90652e3123f97617862eb9bf37ca2e52180a7c9ff48a979136e073f9393e67c7",
    '{"JWT_SECRET":"plain-json-secret","SERVICE_ROLE_KEY":"opaque-json-service","S3_SECRET_KEY":"opaque-json-s3","Authorization":"Bearer json-token","Cookie":"session=json-cookie"}',
    "sb_secret_localSecretValue",
    "sb_publishable_localPublishableValue",
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature",
    "2f8f4f02-df7f-4951-a519-30c276f19af1",
    "id=in.%2841b43379-2942-5bb4-8c65-a12e70709dd2%2Cb20c701f-f8e1-482f-afc3-25b862de44b5%29",
    "-----BEGIN PRIVATE KEY-----\nprivate-material\n-----END PRIVATE KEY-----", // secret-scan: allow — reviewed non-secret redaction fixture
    "keep this diagnostic line",
  ].join("\n");

  const sanitized = redactEconovariaCiLog(raw);
  assertEconovariaCiLogSanitized(sanitized, "test fixture");
  assert.match(sanitized, /\[credential-field-redacted\]/u);
  assert.match(sanitized, /\[private-hash-field-redacted\]/u);
  assert.match(sanitized, /\[authorization-redacted\]/u);
  assert.match(sanitized, /\[supabase-key-redacted\]/u);
  assert.match(sanitized, /\[jwt-redacted\]/u);
  assert.match(sanitized, /\[uuid-redacted\]/u);
  assert.match(sanitized, /\[private-key-redacted\]/u);
  assert.match(sanitized, /keep this diagnostic line/u);
});

test("CI log privacy assertion rejects unsanitized named credentials", () => {
  for (const fixture of [
    "S3 Secret Key: still-private",
    "SUPABASE_ANON_KEY=still-private",
    "SUPABASE_SERVICE_ROLE_KEY=still-private", // secret-scan: allow — reviewed non-secret redaction fixture
    "SUPABASE_JWT_SECRET=still-private",
    "SUPABASE_DB_PASSWORD=still-private",
    "SUPABASE_ACCESS_TOKEN=still-private",
  ]) {
    assert.throws(
      () => assertEconovariaCiLogSanitized(fixture),
      /named credential/u,
    );
  }
});

test("CI log privacy assertion rejects URL-encoded UUIDs and private hash fields", () => {
  for (const [fixture, expected] of [
    [
      "id=in.%2841b43379-2942-5bb4-8c65-a12e70709dd2%29",
      /UUID/u,
    ],
    [
      "session_token_hash=eq.79f230544341c714d292774cf20d756cbae497d4109780e66617fe03008f3f74",
      /private hash field/u,
    ],
    [
      "game_join_code_hash=eq.4b6f780148efc2bc462a6ba5b19d7a96b0d2f0b12d0d15c43d2677b7a3d5967b",
      /private hash field/u,
    ],
    [
      '"normalized_student_code_hash":"2e6b0dd68a2416023af7e5b7f72b23fd890842210fdc70f0b74aae8712022473"',
      /private hash field/u,
    ],
    [
      "token_hash=eq.5ed75c13922053396752c71dd9d3e74b7a9a0d94f16d7623c1084507cd9cf9a0",
      /private hash field/u,
    ],
    [
      "code_hash=eq.d3bd7c1c3d1a34fbef0c136665517857f3e6d67d5ef5b483314f6a523e22cc42",
      /private hash field/u,
    ],
  ]) {
    assert.throws(
      () => assertEconovariaCiLogSanitized(fixture),
      expected,
    );
  }
});

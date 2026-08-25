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
    '{"JWT_SECRET":"plain-json-secret","SERVICE_ROLE_KEY":"opaque-json-service","S3_SECRET_KEY":"opaque-json-s3","Authorization":"Bearer json-token","Cookie":"session=json-cookie"}',
    "sb_secret_localSecretValue",
    "sb_publishable_localPublishableValue",
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature",
    "2f8f4f02-df7f-4951-a519-30c276f19af1",
    "-----BEGIN PRIVATE KEY-----\nprivate-material\n-----END PRIVATE KEY-----", // secret-scan: allow — reviewed non-secret redaction fixture
    "keep this diagnostic line",
  ].join("\n");

  const sanitized = redactEconovariaCiLog(raw);
  assertEconovariaCiLogSanitized(sanitized, "test fixture");
  assert.match(sanitized, /\[credential-field-redacted\]/u);
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

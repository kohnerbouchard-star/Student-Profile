import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  "backend/supabase/functions/web-session-api/index.ts",
  "utf8",
);
const authSource = fs.readFileSync(
  "backend/src/security/adminBffRequestAuth.ts",
  "utf8",
);

test("web session accepts client IP only after signed Admin BFF verification", () => {
  assert.match(source, /authorizeAdminBffRequest\(incomingRequest/u);
  assert.match(source, /const INTERNAL_TRUSTED_IP_HEADER = "x-real-ip" as const/u);
  assert.match(
    source,
    /address: readTrustedClientIp\(request, INTERNAL_TRUSTED_IP_HEADER\)/u,
  );
  assert.doesNotMatch(source, /readPlayerRateLimitConfig\(\)\.trustedIpHeader/u);
  assert.match(authSource, /overwriteTrustedClientIpHeaders/u);
  assert.match(authSource, /headers\.delete\("authorization"\)/u);
  assert.match(authSource, /headers\.delete\(BFF_SIGNATURE_HEADER\)/u);
  assert.match(authSource, /headers\.delete\("x-forwarded-for"\)|FORWARDED_IP_HEADERS/u);
});

test("admin and MFA forwarding preserve only the verified internal header", () => {
  const forwardedUses = source.match(/\[clientIp\.header\]: clientIp\.address/g) || [];
  assert.equal(forwardedUses.length, 2);
  assert.match(source, /clientIp: TrustedClientIp/g);
  assert.doesNotMatch(source, /cf-connecting-ip/u);
  assert.match(source, /\["idempotency-key", "Idempotency-Key"\]/u);
  assert.doesNotMatch(source, /\["x-idempotency-key", "X-Idempotency-Key"\]/u);
  assert.match(source, /\$\{DEVICE_HEADER\},idempotency-key,x-request-id/u);
  assert.doesNotMatch(source, /\$\{DEVICE_HEADER\},x-idempotency-key,x-request-id/u);
  assert.match(authSource, /"idempotency-key"/u);
  assert.doesNotMatch(authSource, /SIGNED_CONTEXT_HEADERS[\s\S]{0,300}"x-idempotency-key"/u);
});

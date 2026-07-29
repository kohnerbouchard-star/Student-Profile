import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  "backend/supabase/functions/web-session-api/index.ts",
  "utf8",
);

test("web session MFA uses the reviewed runtime trusted-IP header", () => {
  assert.match(
    source,
    /import \{ readPlayerRateLimitConfig \} from "\.\.\/\.\.\/\.\.\/src\/security\/playerRateLimitService\.ts";/u,
  );
  assert.doesNotMatch(
    source,
    /const TRUSTED_IP_HEADER = "x-real-ip";/u,
  );
  assert.match(
    source,
    /const trustedIpHeader = readPlayerRateLimitConfig\(\)\.trustedIpHeader;/u,
  );
  assert.match(
    source,
    /address: readTrustedClientIp\(request, trustedIpHeader\)/u,
  );
});

test("admin and MFA forwarding preserve the configured header", () => {
  const forwardedUses = source.match(/\[clientIp\.header\]: clientIp\.address/g) || [];
  assert.equal(forwardedUses.length, 2);
  assert.match(source, /clientIp: TrustedClientIp/g);
});

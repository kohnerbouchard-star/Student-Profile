import test from "node:test";
import assert from "node:assert/strict";
import {
  patchSensitiveRateLimitAcceptance,
} from "./pr295-sensitive-rate-limit-harness.mjs";

const LEGACY_SOURCE = `async function runRateLimitProbe() {
  const attempts = 100;
  const batchSize = 10;
  const rampDelayMs = 100;
  const results = [];
  const batches = [];
  for (let offset = 0; offset < attempts; offset += batchSize) {
    const batch = await Promise.all(
      Array.from({ length: Math.min(batchSize, attempts - offset) }, () =>
        http("/functions/v1/classroom-api/players/me/capabilities", {
          playerToken: fixture.directSessionTokens[0],
          expectedStatuses: [200, 429],
        })
      ),
    );
    results.push(...batch);
  }
  const denied = results.filter((result) => result.status === 429);
  if (!denied.length) throw new Error("Rate-limit probe did not produce a bounded 429 denial");
  if (!denied.some((result) => /^\\d+$/.test(String(result.retryAfter ?? "")))) {
    throw new Error("Rate-limit denial did not include Retry-After");
  }
  evidence.metrics.rateLimitProbe = {
    profile: "bounded-abuse-ramp",
    attempts,
    batchSize,
    rampDelayMs,
    batchCount: batches.length,
    batches,
    allowed: results.filter((result) => result.status === 200).length,
    denied: denied.length,
    unexpected: results.filter((result) => ![200, 429].includes(result.status)).length,
  };
  evidence.checks.rateLimitEnforced = true;
}

function captureQueryPlans() {
  return true;
}
`;

test("installs the replay-safe sensitive rate-limit probe", () => {
  const patched = patchSensitiveRateLimitAcceptance(LEGACY_SOURCE);
  assert.match(patched, /player\.messages\.thread\.create/);
  assert.match(patched, /configuredActionLimit: 10/);
  assert.match(patched, /configuredWindowSeconds: 300/);
  assert.match(patched, /expectedStatuses: \[200, 201, 429\]/);
  assert.match(patched, /assertSafePlayerResponse/);
  assert.doesNotMatch(patched, /bounded-abuse-ramp/);
  assert.doesNotMatch(
    patched,
    /players\/me\/capabilities.*expectedStatuses: \[200, 429\]/s,
  );
});

test("patch is idempotent", () => {
  const first = patchSensitiveRateLimitAcceptance(LEGACY_SOURCE);
  const second = patchSensitiveRateLimitAcceptance(first);
  assert.equal(second, first);
});

test("rejects changed legacy semantics", () => {
  assert.throws(
    () =>
      patchSensitiveRateLimitAcceptance(
        LEGACY_SOURCE.replace("const attempts = 100;", "const attempts = 99;"),
      ),
    /missing or changed/,
  );
});

test("rejects conflicting old and new probes", () => {
  const patched = patchSensitiveRateLimitAcceptance(LEGACY_SOURCE);
  assert.throws(
    () =>
      patchSensitiveRateLimitAcceptance(
        `${patched}\nconst conflict = 'profile: "bounded-abuse-ramp"';\n`,
      ),
    /conflicting rate-limit probes/,
  );
});

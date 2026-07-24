import assert from "node:assert/strict";
import test from "node:test";

import { patchConnectedLifecycleAcceptance } from "./pr295-connected-lifecycle-harness.mjs";
import { patchSensitiveRateLimitAcceptance } from "./pr295-sensitive-rate-limit-harness.mjs";

const legacyBlock = `  psql(\`update public.game_sessions set lifecycle_state='paused',paused_at=now() where id=\${sqlLiteral(fixture.gameId)};\`);
  const paused = await http("/functions/v1/classroom-api/players/me/messages/threads", {
    method: "POST",
    playerToken: loginSessionToken,
    body: { ...createBody, idempotencyKey: \`\${fixture.runTag}:message:paused\` },
    expectedStatuses: [409],
  });
  evidence.checks.pausedMutationDenied = paused.status === 409;

  psql(\`update public.game_sessions set lifecycle_state='ended',ended_at=now(),paused_at=null where id=\${sqlLiteral(fixture.gameId)};\`);
  const ended = await http("/functions/v1/classroom-api/players/me/messages/threads", {
    method: "POST",
    playerToken: loginSessionToken,
    body: { ...createBody, idempotencyKey: \`\${fixture.runTag}:message:ended\` },
    expectedStatuses: [409],
  });
  evidence.checks.endedMutationDenied = ended.status === 409;
  psql(\`update public.game_sessions set lifecycle_state='active',ended_at=null,paused_at=null,resumed_at=now() where id=\${sqlLiteral(fixture.gameId)};\`);
`;

const legacyRateLimitProbe = `async function runRateLimitProbe() {
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
`;

const source = `const fixture = createFixtureIdentity();
let loginSessionToken = null;
const evidence = { checks: {}, metrics: {} };

async function runHttpAcceptance() {
  const createBody = {};
${legacyBlock}}

${legacyRateLimitProbe}
function captureQueryPlans() {
  return true;
}

async function main() {
    await runHttpAcceptance();
    await runRateLimitProbe();
    captureQueryPlans();
}
`;

test("lifecycle harness replaces direct writes with atomic transitions", () => {
  const patched = patchConnectedLifecycleAcceptance(source);
  assert.match(patched, /transition_game_lifecycle_atomic_v1/);
  assert.match(patched, /transitionSyntheticLifecycle\("pause"\)/);
  assert.match(patched, /transitionSyntheticLifecycle\("resume"\)/);
  assert.match(patched, /transitionSyntheticLifecycle\("end"\)/);
  assert.match(patched, /expectedStatuses: \[401\]/);
  assert.match(
    patched,
    /await runRateLimitProbe\(\);\n    await runLifecycleAcceptance\(\);\n    captureQueryPlans\(\);/,
  );
  assert.doesNotMatch(
    patched,
    /update public\.game_sessions set lifecycle_state=/,
  );
});

test("lifecycle harness is idempotent after canonicalization", () => {
  const once = patchConnectedLifecycleAcceptance(source);
  const twice = patchConnectedLifecycleAcceptance(once);
  assert.equal(twice, once);
});

test("lifecycle harness fails closed when legacy source drifts", () => {
  assert.throws(
    () =>
      patchConnectedLifecycleAcceptance(
        source.replace("paused_at=now()", "paused_at=clock_timestamp()"),
      ),
    /missing or changed/,
  );
});

test("composed harness installs canonical lifecycle and sensitive throttling", () => {
  const lifecyclePatched = patchConnectedLifecycleAcceptance(source);
  const fullyPatched = patchSensitiveRateLimitAcceptance(lifecyclePatched);

  assert.match(fullyPatched, /transition_game_lifecycle_atomic_v1/);
  assert.match(fullyPatched, /profile: "replay-safe-sensitive-action"/);
  assert.match(fullyPatched, /action: "player\.messages\.thread\.create"/);
  assert.match(fullyPatched, /configuredActionLimit: 10/);
  assert.match(fullyPatched, /expectedStatuses: \[200, 201, 429\]/);
  assert.match(fullyPatched, /assertSafePlayerResponse/);
  assert.doesNotMatch(fullyPatched, /bounded-abuse-ramp/);
  assert.doesNotMatch(
    fullyPatched,
    /update public\.game_sessions set lifecycle_state=/,
  );
});

test("composed harness remains idempotent", () => {
  const first = patchSensitiveRateLimitAcceptance(
    patchConnectedLifecycleAcceptance(source),
  );
  const second = patchSensitiveRateLimitAcceptance(
    patchConnectedLifecycleAcceptance(first),
  );
  assert.equal(second, first);
});

test("sensitive harness fails closed on changed legacy probe semantics", () => {
  const lifecyclePatched = patchConnectedLifecycleAcceptance(
    source.replace("const attempts = 100;", "const attempts = 99;"),
  );
  assert.throws(
    () => patchSensitiveRateLimitAcceptance(lifecyclePatched),
    /missing or changed/,
  );
});

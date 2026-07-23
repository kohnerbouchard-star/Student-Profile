import assert from "node:assert/strict";
import test from "node:test";

import { patchConnectedLifecycleAcceptance } from "./pr295-connected-lifecycle-harness.mjs";

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

const source = `const fixture = createFixtureIdentity();
let loginSessionToken = null;
const evidence = { checks: {} };

async function runHttpAcceptance() {
  const createBody = {};
${legacyBlock}}

async function main() {
    await runHttpAcceptance();
    await runRateLimitProbe();
    captureQueryPlans();
}
`;

test("harness replaces direct lifecycle writes with atomic transitions after load probes", () => {
  const patched = patchConnectedLifecycleAcceptance(source);
  assert.match(patched, /transition_game_lifecycle_atomic_v1/);
  assert.match(patched, /transitionSyntheticLifecycle\("pause"\)/);
  assert.match(patched, /transitionSyntheticLifecycle\("resume"\)/);
  assert.match(patched, /transitionSyntheticLifecycle\("end"\)/);
  assert.match(patched, /expectedStatuses: \[401\]/);
  assert.match(patched, /await runRateLimitProbe\(\);\n    await runLifecycleAcceptance\(\);\n    captureQueryPlans\(\);/);
  assert.doesNotMatch(patched, /update public\.game_sessions set lifecycle_state=/);
});

test("harness is idempotent after canonicalization", () => {
  const once = patchConnectedLifecycleAcceptance(source);
  const twice = patchConnectedLifecycleAcceptance(once);
  assert.equal(twice, once);
});

test("harness fails closed when the legacy source drifts", () => {
  assert.throws(
    () => patchConnectedLifecycleAcceptance(source.replace("paused_at=now()", "paused_at=clock_timestamp()")),
    /missing or changed/,
  );
});

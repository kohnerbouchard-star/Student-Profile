#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FUNCTION_ANCHOR = "async function runHttpAcceptance() {";
const MAIN_ANCHOR = `    await runRateLimitProbe();
    captureQueryPlans();`;
const LEGACY_BLOCK = `  psql(\`update public.game_sessions set lifecycle_state='paused',paused_at=now() where id=\${sqlLiteral(fixture.gameId)};\`);
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

const CANONICAL_HELPERS = `function transitionSyntheticLifecycle(action) {
  const idempotencyKey = \`\${fixture.runTag}:lifecycle:\${action}\`;
  const resultText = psql(\`
    select row_to_json(transition_result)::text
    from public.transition_game_lifecycle_atomic_v1(
      \${sqlLiteral(fixture.gameId)},
      \${sqlLiteral(fixture.staffId)},
      \${sqlLiteral(action)},
      \${sqlLiteral(idempotencyKey)},
      null
    ) as transition_result;
  \`);
  const result = JSON.parse(resultText);
  if (result.transition_action !== action) {
    throw new Error(\`Lifecycle transition action mismatch for \${action}\`);
  }
  if (!["applied", "already_current", "replayed"].includes(result.transition_outcome)) {
    throw new Error(\`Lifecycle transition outcome is invalid for \${action}\`);
  }
  return result;
}

async function runLifecycleAcceptance() {
  const createBody = {
    recipientPlayerId: fixture.playerIdentifiers[1],
    title: "Connected lifecycle acceptance",
    body: "Canonical pause, resume, and end verification.",
  };

  const pauseTransition = transitionSyntheticLifecycle("pause");
  if (
    pauseTransition.lifecycle_state !== "paused" ||
    pauseTransition.operational_status !== "disabled" ||
    Number(pauseTransition.sessions_revoked) !== 0
  ) {
    throw new Error("Canonical pause transition did not preserve the expected projection");
  }
  const paused = await http("/functions/v1/classroom-api/players/me/messages/threads", {
    method: "POST",
    playerToken: loginSessionToken,
    body: { ...createBody, idempotencyKey: \`\${fixture.runTag}:message:paused\` },
    expectedStatuses: [409],
  });
  evidence.checks.pausedMutationDenied = paused.status === 409;

  const resumeTransition = transitionSyntheticLifecycle("resume");
  if (
    resumeTransition.lifecycle_state !== "active" ||
    resumeTransition.operational_status !== "active" ||
    Number(resumeTransition.sessions_revoked) !== 0
  ) {
    throw new Error("Canonical resume transition did not restore the active projection");
  }
  const resumed = await http("/functions/v1/classroom-api/players/me/messages/threads", {
    method: "POST",
    playerToken: loginSessionToken,
    body: { ...createBody, idempotencyKey: \`\${fixture.runTag}:message:resumed\` },
    expectedStatuses: [200, 201],
  });
  assertSafePlayerResponse(resumed.body, fixture, "message after resume");
  evidence.checks.resumedMutationAllowed = [200, 201].includes(resumed.status);

  const endTransition = transitionSyntheticLifecycle("end");
  if (
    endTransition.lifecycle_state !== "ended" ||
    endTransition.operational_status !== "archived" ||
    Number(endTransition.sessions_revoked) < 1
  ) {
    throw new Error("Canonical end transition did not archive the game and revoke sessions");
  }
  const ended = await http("/functions/v1/classroom-api/players/me/messages/threads", {
    method: "POST",
    playerToken: loginSessionToken,
    body: { ...createBody, idempotencyKey: \`\${fixture.runTag}:message:ended\` },
    expectedStatuses: [401],
  });
  evidence.checks.endedSessionRevoked = ended.status === 401;
  evidence.checks.lifecycleTransitionsCanonical = true;
}

`;

export function patchConnectedLifecycleAcceptance(source) {
  if (typeof source !== "string" || !source) throw new TypeError("Connected acceptance source is required");
  if (source.includes("function transitionSyntheticLifecycle(action)")) {
    if (source.includes("update public.game_sessions set lifecycle_state=")) {
      throw new Error("Patched acceptance still contains direct lifecycle mutation");
    }
    return source;
  }
  if (!source.includes(FUNCTION_ANCHOR)) throw new Error("Connected acceptance function anchor is missing");
  if (!source.includes(LEGACY_BLOCK)) throw new Error("Legacy lifecycle acceptance block is missing or changed");
  if (!source.includes(MAIN_ANCHOR)) throw new Error("Connected acceptance main sequence anchor is missing");

  const patched = source
    .replace(FUNCTION_ANCHOR, `${CANONICAL_HELPERS}${FUNCTION_ANCHOR}`)
    .replace(LEGACY_BLOCK, "")
    .replace(MAIN_ANCHOR, `    await runRateLimitProbe();
    await runLifecycleAcceptance();
    captureQueryPlans();`);

  if (patched.includes("update public.game_sessions set lifecycle_state=")) {
    throw new Error("Direct lifecycle mutation remains after patching");
  }
  if (!patched.includes("transition_game_lifecycle_atomic_v1")) {
    throw new Error("Canonical lifecycle RPC is missing after patching");
  }
  if (!patched.includes("await runLifecycleAcceptance();")) {
    throw new Error("Canonical lifecycle acceptance is not in the execution sequence");
  }
  return patched;
}

async function main() {
  const input = process.argv[2];
  if (!input) throw new Error("Usage: node scripts/pr295-connected-lifecycle-harness.mjs <acceptance-file>");
  const target = path.resolve(input);
  const source = await readFile(target, "utf8");
  const patched = patchConnectedLifecycleAcceptance(source);
  await writeFile(target, patched, "utf8");
  console.log("Connected staging lifecycle acceptance now uses canonical atomic transitions.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

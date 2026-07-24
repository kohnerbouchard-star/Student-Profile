#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FUNCTION_ANCHOR = "async function runRateLimitProbe() {";
const END_ANCHOR = "\n}\n\nfunction captureQueryPlans";
const PATCHED_MARKER = 'profile: "replay-safe-sensitive-action"';

const SENSITIVE_PROBE = `async function runRateLimitProbe() {
  const attempts = 16;
  const batchSize = 4;
  const rampDelayMs = 50;
  const results = [];
  const batches = [];
  const body = {
    recipientPlayerId: fixture.playerIdentifiers[1],
    title: "Connected rate-limit acceptance",
    body: "Replay-safe sensitive action probe.",
    idempotencyKey: \`\${fixture.runTag}:message:rate-limit-probe\`,
  };
  for (let offset = 0; offset < attempts; offset += batchSize) {
    const batchStarted = performance.now();
    const batch = await Promise.all(
      Array.from(
        { length: Math.min(batchSize, attempts - offset) },
        () =>
          http("/functions/v1/classroom-api/players/me/messages/threads", {
            method: "POST",
            playerToken: loginSessionToken,
            body,
            expectedStatuses: [200, 201, 429],
          }),
      ),
    );
    results.push(...batch);
    batches.push({
      batchNumber: batches.length + 1,
      requests: batch.length,
      durationMs: Number((performance.now() - batchStarted).toFixed(2)),
      allowed: batch.filter((result) => [200, 201].includes(result.status)).length,
      denied: batch.filter((result) => result.status === 429).length,
    });
    if (offset + batchSize < attempts) {
      await new Promise((resolve) => setTimeout(resolve, rampDelayMs));
    }
  }
  const denied = results.filter((result) => result.status === 429);
  if (!denied.length) {
    throw new Error(
      "Sensitive rate-limit probe did not produce a bounded 429 denial",
    );
  }
  if (
    !denied.some((result) => /^\\d+$/.test(String(result.retryAfter ?? "")))
  ) {
    throw new Error("Sensitive rate-limit denial did not include Retry-After");
  }
  const allowed = results.filter((result) =>
    [200, 201].includes(result.status)
  );
  for (const result of allowed) {
    assertSafePlayerResponse(result.body, fixture, "rate-limit replay probe");
  }
  evidence.metrics.rateLimitProbe = {
    profile: "replay-safe-sensitive-action",
    action: "player.messages.thread.create",
    configuredActionLimit: 10,
    configuredWindowSeconds: 300,
    attempts,
    batchSize,
    rampDelayMs,
    batchCount: batches.length,
    batches,
    allowed: allowed.length,
    denied: denied.length,
    unexpected: results.filter((result) =>
      ![200, 201, 429].includes(result.status)
    ).length,
  };
  evidence.checks.rateLimitEnforced = true;
}`;

export function patchSensitiveRateLimitAcceptance(source) {
  if (typeof source !== "string" || !source) {
    throw new TypeError("Connected acceptance source is required");
  }
  if (source.includes(PATCHED_MARKER)) {
    if (source.includes('profile: "bounded-abuse-ramp"')) {
      throw new Error("Acceptance contains conflicting rate-limit probes");
    }
    return source;
  }

  const startIndex = source.indexOf(FUNCTION_ANCHOR);
  const endAnchorIndex = source.indexOf(END_ANCHOR, startIndex);
  if (startIndex < 0 || endAnchorIndex < 0) {
    throw new Error("Rate-limit acceptance block is missing or changed");
  }
  const endIndex = endAnchorIndex + 2;
  const legacyBlock = source.slice(startIndex, endIndex);
  const requiredTokens = [
    'const attempts = 100;',
    'profile: "bounded-abuse-ramp"',
    '"/functions/v1/classroom-api/players/me/capabilities"',
    'expectedStatuses: [200, 429]',
    'Rate-limit probe did not produce a bounded 429 denial',
    'Rate-limit denial did not include Retry-After',
    'evidence.checks.rateLimitEnforced = true;',
  ];
  for (const token of requiredTokens) {
    if (!legacyBlock.includes(token)) {
      throw new Error("Rate-limit acceptance block is missing or changed");
    }
  }

  const patched = `${source.slice(0, startIndex)}${SENSITIVE_PROBE}${source.slice(endIndex)}`;
  if (!patched.includes(PATCHED_MARKER)) {
    throw new Error("Sensitive rate-limit probe was not installed");
  }
  if (patched.includes('profile: "bounded-abuse-ramp"')) {
    throw new Error("Legacy rate-limit probe remains after patching");
  }
  return patched;
}

async function main() {
  const input = process.argv[2];
  if (!input) {
    throw new Error(
      "Usage: node scripts/pr295-sensitive-rate-limit-harness.mjs <acceptance-file>",
    );
  }
  const target = path.resolve(input);
  const source = await readFile(target, "utf8");
  const patched = patchSensitiveRateLimitAcceptance(source);
  await writeFile(target, patched, "utf8");
  console.log(
    "Connected staging acceptance now uses the replay-safe sensitive rate-limit probe.",
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

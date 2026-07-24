#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const IMPORT_ANCHOR = `import { spawnSync } from "node:child_process";`;
const POLICY_IMPORT = `import {
  MAX_TRANSIENT_READ_ATTEMPTS,
  RATE_LIMIT_CLEANUP_ATTEMPTS,
  RATE_LIMIT_CLEANUP_DELAY_MS,
  RATE_LIMIT_STABLE_ZERO_SCANS,
  nextStableZeroScanCount,
  rateLimitDeltaRows,
  rateLimitRowIdentity,
  retryDelayMs,
  shouldRetryTransientFetchError,
  shouldRetryTransientRead,
} from "./pr295-connected-resilience-policy.mjs";`;

const LEGACY_HTTP = `export async function http(path, {
  method = "GET",
  bearer = env.anonKey,
  playerToken,
  body,
  headers = {},
  expectedStatuses = [200],
} = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  const started = performance.now();
  let response;
  try {
    response = await fetch(\`\${env.supabaseUrl}\${path}\`, {
      method,
      headers: {
        apikey: env.anonKey,
        ...(bearer ? { Authorization: \`Bearer \${bearer}\` } : {}),
        ...(playerToken ? { "x-player-session-token": playerToken } : {}),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!expectedStatuses.includes(response.status)) {
    const safeCode = parsed && typeof parsed === "object"
      ? String(parsed.error?.code ?? parsed.code ?? "unknown")
      : "non_json";
    throw new Error(\`\${method} \${path} returned \${response.status} (\${safeCode})\`);
  }
  return {
    status: response.status,
    body: parsed,
    latencyMs: performance.now() - started,
    retryAfter: response.headers.get("retry-after"),
  };
}`;

const RESILIENT_HTTP = `function waitForRetry(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function http(path, {
  method = "GET",
  bearer = env.anonKey,
  playerToken,
  body,
  headers = {},
  expectedStatuses = [200],
} = {}) {
  const started = performance.now();
  const maxAttempts = String(method).toUpperCase() === "GET"
    ? MAX_TRANSIENT_READ_ATTEMPTS
    : 1;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    let response;
    try {
      response = await fetch(\`\${env.supabaseUrl}\${path}\`, {
        method,
        headers: {
          apikey: env.anonKey,
          ...(bearer ? { Authorization: \`Bearer \${bearer}\` } : {}),
          ...(playerToken ? { "x-player-session-token": playerToken } : {}),
          ...(body === undefined ? {} : { "content-type": "application/json" }),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      lastError = error;
      if (!shouldRetryTransientFetchError({ method, attempt, maxAttempts })) throw error;
      await waitForRetry(retryDelayMs({ attempt, retryAfter: null }));
      continue;
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    const safeCode = parsed && typeof parsed === "object"
      ? String(parsed.error?.code ?? parsed.code ?? "unknown")
      : "non_json";

    if (expectedStatuses.includes(response.status)) {
      return {
        status: response.status,
        body: parsed,
        latencyMs: performance.now() - started,
        retryAfter: response.headers.get("retry-after"),
        transientRetryCount: attempt - 1,
      };
    }

    if (shouldRetryTransientRead({
      method,
      status: response.status,
      code: safeCode,
      expectedStatuses,
      attempt,
      maxAttempts,
    })) {
      await waitForRetry(retryDelayMs({
        attempt,
        retryAfter: response.headers.get("retry-after"),
      }));
      continue;
    }

    throw new Error(\`\${method} \${path} returned \${response.status} (\${safeCode})\`);
  }

  throw lastError ?? new Error(\`\${method} \${path} exhausted transient read retries\`);
}`;

const LEGACY_RATE_CLEANUP = `export function captureRateLimitBaseline(fixture) {
  fixture.baselineRateLimitKeys = readRateLimitKeys();
}

function cleanupRateLimitDelta(fixture, cleanupEvidence) {
  const baseline = new Set(fixture.baselineRateLimitKeys.map((row) => JSON.stringify(row)));
  const delta = readRateLimitKeys().filter((row) => !baseline.has(JSON.stringify(row)));
  for (const row of delta) {
    psql(\`
      delete from public.request_rate_limit_buckets
      where dimension=\${sqlLiteral(row.dimension)}
        and key_hash=\${sqlLiteral(row.keyHash)}
        and window_started_at=\${sqlLiteral(row.windowStartedAt)}::timestamptz
        and window_seconds=\${Number(row.windowSeconds)};
    \`);
  }
  const residual = readRateLimitKeys().filter((row) => !baseline.has(JSON.stringify(row)));
  cleanupEvidence.rateLimitDelta = delta.length;
  cleanupEvidence.residualRateLimitRows = residual.length;
  if (residual.length) throw new Error(\`Rate-limit cleanup left \${residual.length} residual rows\`);
}`;

const RESILIENT_RATE_CLEANUP = `function blockingCleanupDelay(delayMs) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
}

export function captureRateLimitBaseline(fixture) {
  const expiredRows = Number(psql(\`
    select count(*)::integer
    from public.request_rate_limit_buckets
    where expires_at <= now();
  \`) || "0");
  if (expiredRows > 0) {
    psql(\`
      delete from public.request_rate_limit_buckets
      where expires_at <= now();
    \`);
  }
  fixture.expiredRateLimitRowsPruned = expiredRows;
  fixture.rateLimitBaselineCapturedAt = new Date().toISOString();
  fixture.baselineRateLimitKeys = readRateLimitKeys();
}

function cleanupRateLimitDelta(fixture, cleanupEvidence) {
  const removed = new Set();
  let stableZeroScans = 0;
  let attempts = 0;

  for (attempts = 1; attempts <= RATE_LIMIT_CLEANUP_ATTEMPTS; attempts += 1) {
    const delta = rateLimitDeltaRows(readRateLimitKeys(), fixture.baselineRateLimitKeys);
    stableZeroScans = nextStableZeroScanCount(stableZeroScans, delta.length);

    for (const row of delta) {
      removed.add(rateLimitRowIdentity(row));
      psql(\`
        delete from public.request_rate_limit_buckets
        where dimension=\${sqlLiteral(row.dimension)}
          and key_hash=\${sqlLiteral(row.keyHash)}
          and window_started_at=\${sqlLiteral(row.windowStartedAt)}::timestamptz
          and window_seconds=\${Number(row.windowSeconds)};
      \`);
    }

    if (stableZeroScans >= RATE_LIMIT_STABLE_ZERO_SCANS) break;
    blockingCleanupDelay(RATE_LIMIT_CLEANUP_DELAY_MS);
  }

  const residual = rateLimitDeltaRows(readRateLimitKeys(), fixture.baselineRateLimitKeys);
  cleanupEvidence.expiredRateLimitRowsPruned = Number(fixture.expiredRateLimitRowsPruned ?? 0);
  cleanupEvidence.rateLimitDelta = removed.size;
  cleanupEvidence.rateLimitCleanupAttempts = attempts;
  cleanupEvidence.rateLimitStableZeroScans = stableZeroScans;
  cleanupEvidence.residualRateLimitRows = residual.length;
  if (residual.length) throw new Error(\`Rate-limit cleanup left \${residual.length} residual rows after bounded retries\`);
}`;

export function patchConnectedStagingResilience(source) {
  if (typeof source !== "string" || !source) throw new TypeError("Connected staging library source is required");
  if (source.includes("function blockingCleanupDelay(delayMs)")) {
    if (!source.includes(POLICY_IMPORT)) throw new Error("Resilience policy import is missing from transformed source");
    if (source.includes("const controller = new AbortController();\n  const timer")) {
      throw new Error("Legacy single-attempt HTTP implementation remains");
    }
    return source;
  }
  if (!source.includes(IMPORT_ANCHOR)) throw new Error("Connected staging import anchor is missing");
  if (!source.includes(LEGACY_HTTP)) throw new Error("Legacy connected HTTP implementation is missing or changed");
  if (!source.includes(LEGACY_RATE_CLEANUP)) throw new Error("Legacy rate-limit cleanup implementation is missing or changed");

  const patched = source
    .replace(IMPORT_ANCHOR, `${IMPORT_ANCHOR}\n${POLICY_IMPORT}`)
    .replace(LEGACY_HTTP, RESILIENT_HTTP)
    .replace(LEGACY_RATE_CLEANUP, RESILIENT_RATE_CLEANUP);

  if (!patched.includes("shouldRetryTransientRead")) throw new Error("Transient read policy was not installed");
  if (!patched.includes("RATE_LIMIT_STABLE_ZERO_SCANS")) throw new Error("Stable rate-limit cleanup was not installed");
  if (patched.includes(LEGACY_HTTP) || patched.includes(LEGACY_RATE_CLEANUP)) {
    throw new Error("Legacy connected resilience implementation remains after patching");
  }
  return patched;
}

async function main() {
  const input = process.argv[2];
  if (!input) throw new Error("Usage: node scripts/pr295-connected-resilience-harness.mjs <connected-lib-file>");
  const target = path.resolve(input);
  const source = await readFile(target, "utf8");
  const patched = patchConnectedStagingResilience(source);
  await writeFile(target, patched, "utf8");
  console.log("Connected staging reads and rate-limit cleanup now use bounded resilience controls.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

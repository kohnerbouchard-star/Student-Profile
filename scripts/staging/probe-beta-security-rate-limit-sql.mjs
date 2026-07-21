import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const supabaseUrl = requireEnv("SUPABASE_URL").replace(/\/$/u, "");
const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const evidencePath = resolve(
  process.env.ECONOVARIA_SECURITY_EVIDENCE_PATH ??
    "artifacts/security/rate-limit-sql-probe.json",
);

const startedAt = new Date().toISOString();
const authenticatedBuckets = buckets(["action", "game", "identity", "ip"], 10, 60, 60);
const preAuthBuckets = buckets(["action", "ip"], 10, 60, 60);

const authenticatedResults = await concurrentConsume(
  "consume_request_rate_limits_v1",
  authenticatedBuckets,
  40,
);
assertConcurrency("authenticated four-bucket limiter", authenticatedResults, 10, 30);

const preAuthResults = await concurrentConsume(
  "consume_pre_auth_request_rate_limits_v1",
  preAuthBuckets,
  40,
);
assertConcurrency("pre-auth two-bucket limiter", preAuthResults, 10, 30);

const cleanupBuckets = buckets(["action", "game", "identity", "ip"], 100, 1, 1);
await rpc("consume_request_rate_limits_v1", { p_buckets: cleanupBuckets });
await delay(2_500);
const cleanupRows = await rpc("prune_request_rate_limit_buckets_v1", {
  p_batch_limit: 5_000,
});
const cleanup = readSingleRow(cleanupRows, "cleanup");
assertIntegerAtLeast(cleanup.deleted_count, 1, "cleanup deleted_count");
assertIntegerAtLeast(cleanup.remaining_expired_count, 0, "cleanup remaining_expired_count");

const telemetryRows = await rpc("read_request_rate_limit_telemetry_v1", {
  p_since_seconds: 900,
  p_row_limit: 100,
});
if (!Array.isArray(telemetryRows) || telemetryRows.length > 100) {
  throw new Error("Telemetry response is not a bounded array.");
}
for (const row of telemetryRows) assertTelemetryRow(row);

const evidence = {
  schemaVersion: "econovaria-beta-security-rate-limit-sql-probe-v1",
  target: new URL(supabaseUrl).host,
  startedAt,
  completedAt: new Date().toISOString(),
  authenticatedConcurrency: summarize(authenticatedResults),
  preAuthConcurrency: summarize(preAuthResults),
  cleanup: {
    deletedCount: cleanup.deleted_count,
    remainingExpiredCount: cleanup.remaining_expired_count,
    oldestRemainingExpiryPresent: cleanup.oldest_remaining_expiry !== null,
  },
  telemetry: {
    rowCount: telemetryRows.length,
    dimensions: [...new Set(telemetryRows.map((row) => row.dimension))].sort(),
    blockedBucketCount: telemetryRows.reduce(
      (total, row) => total + Number(row.blocked_bucket_count ?? 0),
      0,
    ),
  },
  privacy: {
    containsCredentialMaterial: false,
    containsRawBucketKeys: false,
    containsInternalActorOrGameIds: false,
  },
  passed: true,
};

await mkdir(dirname(evidencePath), { recursive: true });
await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, {
  mode: 0o600,
});
console.log(`Security SQL probe passed; evidence written to ${evidencePath}`);

async function concurrentConsume(rpcName, inputBuckets, count) {
  return Promise.all(
    Array.from({ length: count }, () =>
      rpc(rpcName, { p_buckets: inputBuckets }).then((rows) =>
        readSingleRow(rows, rpcName)
      )
    ),
  );
}

async function rpc(name, body) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      "cache-control": "no-store",
    },
    body: JSON.stringify(body),
    redirect: "error",
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${name} failed with HTTP ${response.status}.`);
  }
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${name} returned malformed JSON.`);
  }
}

function buckets(dimensions, limit, windowSeconds, blockSeconds) {
  return dimensions.map((dimension) => ({
    dimension,
    keyHash: digest(`${dimension}:${randomBytes(32).toString("hex")}`),
    limit,
    windowSeconds,
    blockSeconds,
  }));
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function readSingleRow(value, label) {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") {
    throw new Error(`${label} returned no row.`);
  }
  return row;
}

function assertConcurrency(label, rows, expectedAllowed, expectedDenied) {
  const allowed = rows.filter((row) => row.allowed === true).length;
  const denied = rows.filter((row) => row.allowed === false).length;
  if (allowed !== expectedAllowed || denied !== expectedDenied) {
    throw new Error(
      `${label} lost atomicity: ${allowed} allowed, ${denied} denied.`,
    );
  }
  for (const row of rows.filter((candidate) => candidate.allowed === false)) {
    assertIntegerAtLeast(row.retry_after_seconds, 1, `${label} retry_after_seconds`);
    if (!["action", "game", "identity", "ip"].includes(row.limiting_dimension)) {
      throw new Error(`${label} returned an invalid limiting dimension.`);
    }
  }
}

function assertTelemetryRow(row) {
  if (!row || typeof row !== "object") throw new Error("Telemetry row is invalid.");
  const serialized = JSON.stringify(row).toLowerCase();
  for (const forbidden of ["key_hash", "session_token", "access_code", "player_id", "game_session_id", "ip_address"]) {
    if (serialized.includes(forbidden)) {
      throw new Error(`Telemetry leaked forbidden field ${forbidden}.`);
    }
  }
  if (!["action", "game", "identity", "ip"].includes(row.dimension)) {
    throw new Error("Telemetry returned an invalid dimension.");
  }
  assertIntegerAtLeast(row.active_bucket_count, 0, "active_bucket_count");
  assertIntegerAtLeast(row.blocked_bucket_count, 0, "blocked_bucket_count");
  assertIntegerAtLeast(row.total_request_count, 0, "total_request_count");
}

function summarize(rows) {
  return {
    attempts: rows.length,
    allowed: rows.filter((row) => row.allowed === true).length,
    denied: rows.filter((row) => row.allowed === false).length,
    retryAfterPresent: rows
      .filter((row) => row.allowed === false)
      .every((row) => Number.isInteger(row.retry_after_seconds) && row.retry_after_seconds >= 1),
  };
}

function assertIntegerAtLeast(value, minimum, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum) {
    throw new Error(`${label} must be an integer >= ${minimum}.`);
  }
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}.`);
  return value;
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();

function assertLocalDatabase(databaseUrl) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to isolate local acceptance journeys.");
  }
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL is not a valid PostgreSQL URL.");
  }
  const localHosts = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
  if (!localHosts.has(parsed.hostname) || parsed.port !== "54322") {
    throw new Error("Acceptance rate-limit reset is restricted to local Supabase on port 54322.");
  }
}

export function resetLocalAcceptanceRateLimits() {
  assertLocalDatabase(DATABASE_URL);
  const result = spawnSync(
    "psql",
    [
      DATABASE_URL,
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-qAt",
      "-c",
      "delete from public.request_rate_limit_buckets;",
    ],
    { encoding: "utf8", maxBuffer: 1024 * 1024 },
  );
  if (result.status !== 0) {
    throw new Error("Failed to reset local acceptance rate-limit counters.");
  }
}

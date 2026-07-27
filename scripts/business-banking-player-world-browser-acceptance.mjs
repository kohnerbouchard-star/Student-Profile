#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const CONNECTED_JOURNEYS = Object.freeze([
  "../player-terminal/tools/connected-world-questionnaire-runner.mjs",
  "../player-terminal/tools/connected-banking-loans-mutation-runner.mjs",
  "../player-terminal/tools/connected-marketplace-mutation-runner.mjs",
  "../player-terminal/tools/connected-progression-mutation-runner.mjs",
  "../player-terminal/tools/connected-story-delivery-mutation-runner.mjs",
  "../player-terminal/tools/connected-crafting-mutation-runner.mjs",
]);

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();

function resetLocalAcceptanceRateLimits() {
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is required to isolate connected acceptance journeys.");
  }
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

for (const journey of CONNECTED_JOURNEYS) {
  await import(journey);
  resetLocalAcceptanceRateLimits();
}

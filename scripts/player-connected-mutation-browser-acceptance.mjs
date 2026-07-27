#!/usr/bin/env node

import { resetLocalAcceptanceRateLimits } from "./local-acceptance-rate-limit-reset.mjs";

resetLocalAcceptanceRateLimits();
try {
  await import("../player-terminal/tools/connected-player-mutation-runner.mjs");
} finally {
  resetLocalAcceptanceRateLimits();
}

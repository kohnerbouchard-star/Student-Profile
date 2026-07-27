#!/usr/bin/env node

import { resetLocalAcceptanceRateLimits } from "./local-acceptance-rate-limit-reset.mjs";

resetLocalAcceptanceRateLimits();
try {
  await import("./business-banking-player-state-controls-browser-acceptance-v2.mjs");
} finally {
  resetLocalAcceptanceRateLimits();
}

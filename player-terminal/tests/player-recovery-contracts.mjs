import assert from "node:assert/strict";
import { playerSafeErrorMessage } from "../src/api/errors.js";
import { classifyPlayerRecoverySignal } from "../src/recovery/recovery-policy.js";

for (const code of ["game_mutations_paused", "GAME_MUTATIONS_PAUSED", "paused", "disabled", "draft"]) {
  const state = classifyPlayerRecoverySignal({ code });
  assert.equal(state.kind, "game-paused", `${code} must map to a paused-game recovery state`);
  assert.equal(state.lockMutations, true);
  assert.equal(state.canDismiss, false, "a lifecycle lock cannot be dismissed locally");
}

for (const code of ["game_lifecycle_terminal", "ended", "archived"]) {
  const state = classifyPlayerRecoverySignal({ code });
  assert.equal(state.kind, "game-ended", `${code} must map to a terminal read-only state`);
  assert.equal(state.lockMutations, true);
  assert.equal(state.canRetry, false);
  assert.equal(state.canDismiss, false);
}

{
  const state = classifyPlayerRecoverySignal({ code: "game_lifecycle_unknown" });
  assert.equal(state.kind, "game-paused");
  assert.equal(state.lockMutations, true);
}

{
  const state = classifyPlayerRecoverySignal({ status: 429, retryAfterMs: 7000 });
  assert.equal(state.kind, "rate-limited");
  assert.equal(state.retryAfterMs, 7000);
  assert.equal(state.canDismiss, false, "rate limits cannot be bypassed by dismissing the notice");
}

assert.equal(
  playerSafeErrorMessage({ code: "game_mutations_paused" }),
  "This game is paused. Economic actions are temporarily unavailable.",
);
assert.equal(
  playerSafeErrorMessage({ code: "game_lifecycle_terminal" }),
  "This game has ended. Existing records remain read-only.",
);
assert.equal(
  playerSafeErrorMessage({ status: 423 }),
  "This game is paused. Economic actions are temporarily unavailable.",
);

for (const state of [
  classifyPlayerRecoverySignal({ code: "COMMITTED_REFRESH_PENDING" }),
  classifyPlayerRecoverySignal({ code: "REQUEST_TIMEOUT" }),
  classifyPlayerRecoverySignal({ status: 409 }),
  classifyPlayerRecoverySignal({ status: 503 }),
]) {
  assert.equal(state.lockMutations, true);
  assert.equal(state.canDismiss, false);
}

console.log("Player recovery backend-contract checks passed.");

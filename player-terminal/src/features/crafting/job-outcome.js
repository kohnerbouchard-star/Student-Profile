import { escapeHtml } from "../../core/format.js";
const JOB = /^cft_[0-9a-f]{32}$/;

// Interpret only the public terminal outcome, never equipment quantities,
// private failure metadata, refunds or inferred economic effects.
export function craftingJobOutcome(endpoint, intent, result) {
  if (!["craftCancel", "craftClaim"].includes(endpoint)) return null;
  const jobKey = JOB.test(intent?.jobKey || "") ? intent.jobKey : "";
  const expected = endpoint === "craftCancel" ? ["cancelled"] : ["claimed", "failed"];
  const confirmed = Boolean(jobKey && result?.jobKey === jobKey && result?.committed === true &&
    result?.refreshRequired === true && expected.includes(result?.status) &&
    (result?.outcome === result.status || result?.outcome === "replayed"));
  if (!confirmed) return Object.freeze({ jobKey, status: "unverified", tone: "amber", message: "Crafting response received, but this job's terminal outcome was not verified. Refresh Crafting and Inventory before another action; no output or refund is inferred." });
  const status = result.status;
  const message = status === "failed"
    ? "Crafting job failed. This is a recorded failure, not a successful output claim. Check Crafting and Inventory for the authoritative result; retrying the claim does not create a new job."
    : status === "cancelled" ? "Crafting job cancellation confirmed. Check Inventory for the current available materials; no refund quantity is inferred."
      : "Crafting output claim confirmed. Check Inventory for the recorded output; no quantity or quality is inferred here.";
  return Object.freeze({ jobKey, status, replayed: result.outcome === "replayed", tone: status === "failed" ? "amber" : "green", message });
}

export function renderCraftingJobOutcome(data, ui) {
  const receipt = ui?.craftingJobOutcome;
  if (!receipt || !receipt.session || receipt.session !== data.session) return "";
  const outcome = receipt.outcome;
  return `<section class="player-terminal-panel" data-player-crafting-job-outcome role="status"><h3>Last Crafting job response</h3>${outcome.jobKey ? `<p>Job: ${escapeHtml(outcome.jobKey)}</p>` : ""}<p>${escapeHtml(outcome.message)}</p>${outcome.replayed ? "<p>The server replayed an existing terminal result; this is not evidence of another grant.</p>" : ""}<p>Session-local response, not the full job history. Current balances and availability still come from refreshed records.</p></section>`;
}

import assert from "node:assert/strict";
import test from "node:test";
import { normalizeContracts } from "../src/api/contracts-read-model.js";
import { previewData } from "../src/data/preview-data.js";
import { normalizePlayerContracts } from "../src/features/contracts/contract-read-model.js";
import { renderContractsPage } from "../src/pages/contracts-page.js";

const time = "2026-11-20T08:00:00Z";
const listed = { checking: { amount: "50.00", currencyCode: "ECO" } };
function fixture({ payload, status = "completed", marker = null, result, legacy = false } = {}) {
  const contract = { contractKey: "test-contract", contractId: "test-contract", title: "Reviewed mission", rewardPayload: payload };
  const progress = { contractKey: "test-contract", contractId: "test-contract", status,
    evidencePayload: { note: "Recorded submission contents" }, resultPayload: { feedback: "Latest review", rewardResult: result },
    submittedAt: time, completedAt: time, rewardIssuedAt: marker };
  return legacy ? normalizeContracts({ me: { contracts: { available: [contract], progress: [progress] } } })
    : normalizePlayerContracts({ contracts: [contract], progress: [progress] });
}
function render(contracts, status = "Completed") {
  return renderContractsPage({ contracts, session: { currencyCode: "ECO" } }, { contractTab: status });
}

test("completed without a marker is not a payment receipt", () => {
  const html = render(fixture({ payload: listed }));
  assert.match(html, /Contract completed/);
  assert.match(html, /Awaiting confirmation/);
  assert.match(html, /Recorded submission contents.*Latest review/u);
  assert.doesNotMatch(html, /reward has been issued|Reward issued|<dt>Cash reward/iu);
});
test("a processing timestamp never confirms payout, even with a previously applied result", () => {
  for (const payload of [listed, {}, { cash: null }, undefined]) {
    const html = render(fixture({ payload, marker: time, result: { status: "applied", appliedRewards: [{ rewardType: "checking" }] } }));
    assert.match(html, /Reward processing recorded/);
    assert.match(html, /does not confirm a payout/);
    assert.doesNotMatch(html, /reward has been issued|Reward issued|No reward was configured/iu);
  }
});
test("skip-shaped review data cannot prove a historical skip; empty current configuration is separate", () => {
  const skip = { status: "skipped", appliedRewards: [], skippedRewards: [{ rewardType: "none" }] };
  const html = render(fixture({ payload: listed, marker: time, result: skip }));
  assert.match(html, /Reward processing recorded/);
  assert.match(html, /does not confirm a payout/);
  assert.doesNotMatch(html, /No reward was configured/);
  for (const payload of [{}, { cash: null }, { checking: null, items: [], storyFlagsToSet: [] }]) {
    const html = render(fixture({ payload }));
    assert.match(html, /No reward is currently configured/);
    assert.doesNotMatch(html, /Awaiting confirmation|<dt>Cash reward|0 XP/iu);
  }
});
test("unsupported, malformed and missing reward data do not imply pending or skipped payout", () => {
  for (const payload of [undefined, { xp: 5 }, { cash: {}, checking: null }, { items: "bad" }, { items: [{}] }, { storyFlagsToSet: [{}] }, { cash: { amount: "0" } }]) {
    const html = render(fixture({ payload }));
    assert.match(html, /Reward status is not available/);
    assert.doesNotMatch(html, /Awaiting confirmation|No reward is currently configured/iu);
  }
  const forged = render(fixture({ payload: listed, result: { status: "skipped", appliedRewards: [], skippedRewards: [{ rewardType: "none" }] } }));
  assert.match(forged, /Awaiting confirmation/);
  assert.doesNotMatch(forged, /No reward was configured/);
  assert.match(render(fixture({ payload: listed, marker: "wrong date" })), /Reward status is not available/);
});
test("listed items or Story flags can await processing without a guessed cash payout", () => {
  for (const payload of [{ items: [{ quantity: 2 }] }, { storyFlagsToSet: [{ flagKey: "story_done", value: false }] }]) {
    const html = render(fixture({ payload }));
    assert.match(html, /Awaiting confirmation/);
    assert.doesNotMatch(html, /<dt>Cash reward|reward has been issued/iu);
  }
});
test("approval waits for confirmation, submitted stays under review, and legacy/preview never claim payout", () => {
  const approval = render(fixture({ payload: listed, status: "approved" }), "Approved");
  assert.match(approval, /Submission approved.*Awaiting confirmation/u);
  const submitted = render(fixture({ payload: listed, status: "submitted" }), "Submitted");
  assert.match(submitted, /UNDER REVIEW/);
  assert.doesNotMatch(submitted, /Awaiting confirmation/);
  for (const contracts of [fixture({ payload: listed, legacy: true }), previewData.contracts]) {
    assert.doesNotMatch(render(contracts), /reward has been issued|Reward issued|<dt>Cash reward/iu);
  }
});

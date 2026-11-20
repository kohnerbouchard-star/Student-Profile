import assert from "node:assert/strict";

import { resolvePlayerBackendRequest } from "../src/api/backend-routes.js";
import { normalizeWritePayload } from "../src/api/payload-normalizer.js";
import { normalizePlayerContracts } from "../src/features/contracts/contract-read-model.js";
import { resolveContractInteraction } from "../src/features/contracts/contract-interaction-v2.js";
import { renderContractsPage } from "../src/pages/contracts-page.js";
import { previewData } from "../src/data/preview-data.js";

const GAME_SESSION_ID = "00000000-0000-4000-8000-000000000001";
const INTERNAL_CONTRACT_ID = "00000000-0000-4000-8000-000000000101";
const PLAYER_ID = "00000000-0000-4000-8000-000000000021";
const CONTRACT_KEY = "contract.meridian.compare-financing-governance.v1";
const rationale = "Shared governance is slower, but it gives every participating institution a documented correction path when incentives diverge.";

const contract = {
  contractId: INTERNAL_CONTRACT_ID,
  gameSessionId: GAME_SESSION_ID,
  contractKey: CONTRACT_KEY,
  sourceType: "story",
  title: "Compare Meridian Financing and Governance",
  description: "Compare the four competing Meridian models.",
  instructions: "Choose a recommendation and defend the tradeoff.",
  category: "policy_analysis",
  status: "active",
  visibility: "public",
  targetingPayload: { allPlayers: true },
  requirementsPayload: { manualText: "Compare the four models and defend a recommendation." },
  rewardPayload: { cash: { amount: 300 } },
  completionMode: "manual_review",
  publishedAt: "2026-08-17T00:00:00.000Z",
  deadlineAt: null,
  expiresAt: null,
  metadata: { issuer: "Meridian Forum" }
};

const interaction = resolveContractInteraction(contract);
assert.equal(interaction.type, "story_decision");
assert.equal(interaction.decisionKey, "meridian_model_recommendation");
assert.equal(interaction.options.length, 5);
assert.ok(interaction.options.some((option) => option.optionKey === "multilateral"));

const normalized = normalizeWritePayload("contractSubmit", {
  storyOption: "multilateral",
  storyRationale: rationale,
  gameSessionId: GAME_SESSION_ID,
  playerId: PLAYER_ID,
  contractId: INTERNAL_CONTRACT_ID
});
assert.deepEqual(normalized, {
  evidencePayload: {
    storyDecision: {
      optionKey: "multilateral",
      rationale
    }
  }
});
assert.throws(
  () => normalizeWritePayload("contractSubmit", { storyOption: "multilateral", storyRationale: "Too short" }),
  /storyRationale/i
);

const resolved = resolvePlayerBackendRequest({
  endpointKey: "contractSubmit",
  method: "POST",
  path: `/contracts/${CONTRACT_KEY}/submissions`,
  params: { contractId: CONTRACT_KEY },
  payload: normalized,
  session: { playerSessionToken: "token", gameSessionId: GAME_SESSION_ID }
});
assert.equal(resolved.path, `/players/me/contracts/${CONTRACT_KEY}/submit`);
assert.deepEqual(resolved.payload, normalized, "Story evidence must not be double-wrapped by the Player backend adapter.");

const response = {
  ok: true,
  contracts: [contract],
  progress: [{
    progressId: "00000000-0000-4000-8000-000000000201",
    gameSessionId: GAME_SESSION_ID,
    contractId: INTERNAL_CONTRACT_ID,
    playerId: PLAYER_ID,
    contractKey: CONTRACT_KEY,
    status: "submitted",
    evidencePayload: normalized.evidencePayload,
    resultPayload: {},
    submittedAt: "2026-08-17T01:00:00.000Z",
    completedAt: null,
    rewardIssuedAt: null,
    createdAt: "2026-08-17T00:30:00.000Z",
    updatedAt: "2026-08-17T01:00:00.000Z"
  }]
};
const model = normalizePlayerContracts(response, { now: Date.parse("2026-08-17T02:00:00.000Z") });
const item = model.items[0];
assert.equal(item.status, "Submitted");
assert.deepEqual(item.submission.storyDecision, { optionKey: "multilateral", rationale });
assert.ok(!JSON.stringify(item).includes(GAME_SESSION_ID));
assert.ok(!JSON.stringify(item).includes(INTERNAL_CONTRACT_ID));
assert.ok(!JSON.stringify(item).includes(PLAYER_ID));

const data = structuredClone(previewData);
data.contracts = model;
const html = renderContractsPage(data, { contractTab: "Submitted", contractId: CONTRACT_KEY });
assert.ok(html.includes("Decision committed"));
assert.ok(html.includes("Multilateral governance"));
assert.ok(html.includes("Shared governance is slower"));
assert.ok(!html.includes(GAME_SESSION_ID));
assert.ok(!html.includes(INTERNAL_CONTRACT_ID));
assert.ok(!html.includes(PLAYER_ID));

console.log("Story decision flow passed: semantic choice, rationale, backend payload, committed read model, and UUID privacy are valid.");

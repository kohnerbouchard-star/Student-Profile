import assert from "node:assert/strict";

import { resolvePlayerBackendRequest } from "../src/api/backend-routes.js";
import { normalizeWritePayload } from "../src/api/payload-normalizer.js";
import { normalizePlayerContracts } from "../src/features/contracts/contract-read-model.js";
import { renderContractsPage } from "../src/pages/contracts-page.js";
import { previewData } from "../src/data/preview-data.js";

const now = Date.parse("2026-07-18T12:00:00.000Z");
const GAME_SESSION_ID = "00000000-0000-4000-8000-000000000001";
const PLAYER_ID = "00000000-0000-4000-8000-000000000021";
const internalId = (index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const contract = (key, index, overrides = {}) => ({
  contractId: internalId(index),
  gameSessionId: GAME_SESSION_ID,
  contractKey: key,
  sourceType: "staff",
  title: `Contract ${key}`,
  description: `Objective for ${key}`,
  instructions: `Instructions for ${key}`,
  category: "Operations",
  status: "active",
  visibility: "players",
  targetingPayload: { countryCodes: ["ELD"] },
  requirementsPayload: { items: [{ label: "Attach supporting evidence" }, "Explain the completed work"] },
  rewardPayload: { cashAmount: 50, currencyCode: "ECO", xp: 10 },
  completionMode: "manual_review",
  publishedAt: "2026-07-17T09:00:00.000Z",
  deadlineAt: "2026-07-20T12:00:00.000Z",
  expiresAt: "2026-07-21T12:00:00.000Z",
  metadata: { issuer: "Trade Ministry" },
  ...overrides
});
const progress = (contractId, status, overrides = {}) => ({
  progressId: internalId(900),
  gameSessionId: GAME_SESSION_ID,
  contractId,
  playerId: PLAYER_ID,
  status,
  evidencePayload: { submissionUrl: "https://example.com/evidence", note: `Evidence for ${contractId}` },
  resultPayload: {},
  submittedAt: "2026-07-18T10:00:00.000Z",
  completedAt: null,
  rewardIssuedAt: null,
  createdAt: "2026-07-17T10:00:00.000Z",
  updatedAt: "2026-07-18T11:00:00.000Z",
  ...overrides
});

const contracts = [
  contract("available-contract", 101),
  contract("active-contract", 102),
  contract("submitted-contract", 103),
  contract("revision-contract", 104),
  contract("approved-contract", 105),
  contract("rejected-contract", 106),
  contract("completed-contract", 107),
  contract("expired-contract", 108, { deadlineAt: "2026-07-17T12:00:00.000Z", expiresAt: "2026-07-17T12:00:00.000Z" }),
  { ...contract("internal-only", 109), contractKey: "" }
];
const idByKey = Object.fromEntries(contracts.filter((item) => item.contractKey).map((item) => [item.contractKey, item.contractId]));
const response = {
  ok: true,
  contracts,
  progress: [
    progress(idByKey["active-contract"], "accepted", { submittedAt: null, evidencePayload: {} }),
    progress(idByKey["submitted-contract"], "submitted"),
    progress(idByKey["revision-contract"], "revision_requested", { resultPayload: { feedback: "Add the missing cost breakdown." } }),
    progress(idByKey["approved-contract"], "approved"),
    progress(idByKey["rejected-contract"], "rejected", { resultPayload: { reason: "The evidence does not match the objective." } }),
    progress(idByKey["completed-contract"], "completed", { completedAt: "2026-07-18T11:30:00.000Z", rewardIssuedAt: "2026-07-18T11:35:00.000Z" })
  ]
};

const model = normalizePlayerContracts(response, { now });
const byId = Object.fromEntries(model.items.map((item) => [item.id, item]));
assert.equal(byId["available-contract"].status, "Available");
assert.equal(byId["active-contract"].status, "Active");
assert.equal(byId["submitted-contract"].status, "Submitted");
assert.equal(byId["revision-contract"].status, "Revision Required");
assert.equal(byId["approved-contract"].status, "Approved");
assert.equal(byId["rejected-contract"].status, "Rejected");
assert.equal(byId["completed-contract"].status, "Completed");
assert.equal(byId["expired-contract"].status, "Expired");
assert.equal(byId["revision-contract"].reviewFeedback, "Add the missing cost breakdown.");
assert.deepEqual(byId["available-contract"].requirements, ["Attach supporting evidence", "Explain the completed work"]);
assert.equal(byId["completed-contract"].rewardIssued, true);
assert.equal(model.items.some((item) => item.id === "internal-only"), false, "Contracts without a public contractKey must fail closed.");
assert.ok(model.tabs.includes("Revision Required") && model.tabs.includes("Approved") && model.tabs.includes("Rejected") && model.tabs.includes("Expired"));
for (const privateValue of [GAME_SESSION_ID, PLAYER_ID, ...Object.values(idByKey)]) {
  assert.ok(!JSON.stringify(model).includes(privateValue), `The UI Contract model must not expose ${privateValue}.`);
}
assert.ok(!JSON.stringify(model).includes("[object Object]"));

const data = structuredClone(previewData);
data.contracts = model;
const revisionHtml = renderContractsPage(data, { contractTab: "Revision Required", contractId: "revision-contract" });
assert.ok(revisionHtml.includes("Revision requested"));
assert.ok(revisionHtml.includes("Add the missing cost breakdown."));
assert.ok(revisionHtml.includes("Resubmit for review"));
assert.ok(revisionHtml.includes('name="submissionUrl"'));
assert.ok(!revisionHtml.includes('name="submissionUrl" type="url" placeholder="https://... (optional)" required'));
assert.ok(revisionHtml.includes('name="note" rows="5" required'));

const approvedHtml = renderContractsPage(data, { contractTab: "Approved", contractId: "approved-contract" });
assert.ok(approvedHtml.includes("Reward issuance is pending backend confirmation"));
const rejectedHtml = renderContractsPage(data, { contractTab: "Rejected", contractId: "rejected-contract" });
assert.ok(rejectedHtml.includes("The evidence does not match the objective."));
const expiredHtml = renderContractsPage(data, { contractTab: "Expired", contractId: "expired-contract" });
assert.ok(expiredHtml.includes("can no longer be accepted or submitted"));

const session = { gameSessionId: GAME_SESSION_ID, playerSessionId: "player-session-1", playerSessionToken: "token-1" };
const publicKey = "contract-public-1";
const normalizedAcceptPayload = normalizeWritePayload("contractAccept", {
  gameSessionId: GAME_SESSION_ID,
  playerId: PLAYER_ID,
  playerSessionId: session.playerSessionId
});
assert.deepEqual(normalizedAcceptPayload, {}, "Contract acceptance must strip all browser-owned scope fields.");
const accept = resolvePlayerBackendRequest({
  endpointKey: "contractAccept",
  method: "POST",
  path: `/contracts/${publicKey}/accept`,
  params: { contractId: publicKey },
  payload: normalizedAcceptPayload,
  session
});
assert.equal(accept.path, `/players/me/contracts/${publicKey}/accept`);
assert.equal(accept.payload, undefined, "Contract acceptance scope must be derived from the authenticated Player session.");
const submit = resolvePlayerBackendRequest({
  endpointKey: "contractSubmit",
  method: "POST",
  path: "/contracts/contract-1/submissions",
  params: { contractId: "contract-1" },
  payload: { submissionUrl: "https://example.com/evidence", note: "Completed response" },
  session
});
assert.equal(submit.path, "/players/me/contracts/contract-1/submit");
assert.deepEqual(submit.payload.evidencePayload, { submissionUrl: "https://example.com/evidence", note: "Completed response" });
assert.equal("playerId" in submit.payload, false, "Contract identity must be derived from the authenticated player session.");

console.log("Contracts flow passed: public-key acceptance, scope stripping, lifecycle states, rewards, and UUID privacy are valid.");

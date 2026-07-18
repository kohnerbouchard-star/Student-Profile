import assert from "node:assert/strict";

import { resolvePlayerBackendRequest } from "../src/api/backend-routes.js";
import { normalizePlayerContracts } from "../src/features/contracts/contract-read-model.js";
import { renderContractsPage } from "../src/pages/contracts-page.js";
import { previewData } from "../src/data/preview-data.js";

const now = Date.parse("2026-07-18T12:00:00.000Z");
const contract = (id, overrides = {}) => ({
  contractId: id,
  gameSessionId: "game-1",
  contractKey: id,
  sourceType: "staff",
  title: `Contract ${id}`,
  description: `Objective for ${id}`,
  instructions: `Instructions for ${id}`,
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
  progressId: `progress-${contractId}`,
  gameSessionId: "game-1",
  contractId,
  playerId: "0c80fe6d-e1d9-4e90-90f4-1b174be727f1",
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

const response = {
  ok: true,
  contracts: [
    contract("available"),
    contract("active"),
    contract("submitted"),
    contract("revision"),
    contract("approved"),
    contract("rejected"),
    contract("completed"),
    contract("expired", { deadlineAt: "2026-07-17T12:00:00.000Z", expiresAt: "2026-07-17T12:00:00.000Z" })
  ],
  progress: [
    progress("active", "accepted", { submittedAt: null, evidencePayload: {} }),
    progress("submitted", "submitted"),
    progress("revision", "revision_requested", { resultPayload: { feedback: "Add the missing cost breakdown." } }),
    progress("approved", "approved"),
    progress("rejected", "rejected", { resultPayload: { reason: "The evidence does not match the objective." } }),
    progress("completed", "completed", { completedAt: "2026-07-18T11:30:00.000Z", rewardIssuedAt: "2026-07-18T11:35:00.000Z" })
  ]
};

const model = normalizePlayerContracts(response, { now });
const byId = Object.fromEntries(model.items.map((item) => [item.id, item]));
assert.equal(byId.available.status, "Available");
assert.equal(byId.active.status, "Active");
assert.equal(byId.submitted.status, "Submitted");
assert.equal(byId.revision.status, "Revision Required");
assert.equal(byId.approved.status, "Approved");
assert.equal(byId.rejected.status, "Rejected");
assert.equal(byId.completed.status, "Completed");
assert.equal(byId.expired.status, "Expired");
assert.equal(byId.revision.reviewFeedback, "Add the missing cost breakdown.");
assert.deepEqual(byId.available.requirements, ["Attach supporting evidence", "Explain the completed work"]);
assert.equal(byId.completed.rewardIssued, true);
assert.ok(model.tabs.includes("Revision Required") && model.tabs.includes("Approved") && model.tabs.includes("Rejected") && model.tabs.includes("Expired"));
assert.ok(!JSON.stringify(model).includes("0c80fe6d-e1d9-4e90-90f4-1b174be727f1"), "The player UUID must not be copied into the UI contract model.");
assert.ok(!JSON.stringify(model).includes("[object Object]"));

const data = structuredClone(previewData);
data.contracts = model;
const revisionHtml = renderContractsPage(data, { contractTab: "Revision Required", contractId: "revision" });
assert.ok(revisionHtml.includes("Revision requested"));
assert.ok(revisionHtml.includes("Add the missing cost breakdown."));
assert.ok(revisionHtml.includes("Resubmit for review"));
assert.ok(revisionHtml.includes('name="submissionUrl"'));
assert.ok(!revisionHtml.includes('name="submissionUrl" type="url" placeholder="https://... (optional)" required'));
assert.ok(revisionHtml.includes('name="note" rows="5" required'));

const approvedHtml = renderContractsPage(data, { contractTab: "Approved", contractId: "approved" });
assert.ok(approvedHtml.includes("Reward issuance is pending backend confirmation"));
const rejectedHtml = renderContractsPage(data, { contractTab: "Rejected", contractId: "rejected" });
assert.ok(rejectedHtml.includes("The evidence does not match the objective."));
const expiredHtml = renderContractsPage(data, { contractTab: "Expired", contractId: "expired" });
assert.ok(expiredHtml.includes("can no longer be accepted or submitted"));

const session = { gameSessionId: "game-1", playerSessionId: "player-session-1", playerSessionToken: "token-1" };
const accept = resolvePlayerBackendRequest({
  endpointKey: "contractAccept",
  method: "POST",
  path: "/contracts/contract-1/accept",
  params: { contractId: "contract-1" },
  payload: {},
  session
});
assert.equal(accept.path, "/players/me/contracts/contract-1/accept");
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

console.log("Contracts flow passed: acceptance, submission, review, revision, approval, rejection, expiration, rewards, and UUID privacy are valid.");

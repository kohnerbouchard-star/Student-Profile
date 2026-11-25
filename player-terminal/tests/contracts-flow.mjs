import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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
  evidencePayload: { submissionUrl: "https://example.com/evidence", note: "Player-provided completion evidence." },
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
  contract("approved-contract", 105, { rewardPayload: { cash: { amount: 50 } } }),
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
assert.ok(approvedHtml.includes("Awaiting confirmation. The record does not yet confirm a reward outcome."));
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

const normalizedSubmitPayload = normalizeWritePayload("contractSubmit", {
  gameSessionId: GAME_SESSION_ID,
  playerId: PLAYER_ID,
  playerSessionId: session.playerSessionId,
  contractId: "private-contract-id",
  submissionUrl: "https://example.com/evidence",
  note: "Completed response"
});
assert.deepEqual(normalizedSubmitPayload, {
  submissionUrl: "https://example.com/evidence",
  note: "Completed response"
});
const submit = resolvePlayerBackendRequest({
  endpointKey: "contractSubmit",
  method: "POST",
  path: `/contracts/${publicKey}/submissions`,
  params: { contractId: publicKey },
  payload: normalizedSubmitPayload,
  session
});
assert.equal(submit.path, `/players/me/contracts/${publicKey}/submit`);
assert.deepEqual(submit.payload, {
  evidencePayload: {
    submissionUrl: "https://example.com/evidence",
    note: "Completed response"
  }
});
for (const privateField of ["gameSessionId", "playerId", "playerSessionId", "contractId"]) {
  assert.equal(privateField in submit.payload, false, `Contract submission must not forward ${privateField}.`);
}

console.log("Contracts flow passed: public-key acceptance and submission, scope stripping, lifecycle states, rewards, and UUID privacy are valid.");

await import("./contracts-review-history.mjs");

// Explicit empty status filters must not silently jump to another populated tab.
const onlyActive = { ...data, contracts: { ...model, items: model.items.filter(item => item.status === "Active") } };
for (const tab of ["Available", "Submitted", "Completed"]) {
  const ui = { contractTab: tab, contractId: "active-contract" };
  const before = JSON.stringify({ onlyActive, ui });
  const html = renderContractsPage(onlyActive, ui);
  assert.ok(html.includes(`data-player-contract-tab="${tab}" aria-pressed="true"`));
  assert.ok(html.includes("No contracts in this state."));
  assert.ok(!html.includes('class="player-terminal-panel player-terminal-contract-detail"'));
  assert.ok(!html.includes('data-player-form="contract-submit"'));
  assert.equal(renderContractsPage(onlyActive, ui), html);
  assert.equal(JSON.stringify({ onlyActive, ui }), before);
}
// Unknown/removed tab state still resolves to an existing populated tab.
for (const contractTab of [undefined, "Unknown status"]) {
  assert.ok(renderContractsPage(onlyActive, { contractTab }).includes('data-player-contract-tab="Active" aria-pressed="true"'));
}
const beforeRefresh = renderContractsPage(data, { contractTab: "Completed", contractId: "completed-contract" });
assert.ok(beforeRefresh.includes("Contract completed"));
const afterRefresh = renderContractsPage(onlyActive, { contractTab: "Completed", contractId: "completed-contract" });
assert.ok(afterRefresh.includes("No contracts in this state."));
assert.ok(!afterRefresh.includes("Contract completed"));
const emptyHtml = renderContractsPage({ ...data, contracts: { ...model, items: [] } }, { contractTab: "Submitted" });
assert.ok(emptyHtml.includes('data-player-contract-tab="Submitted" aria-pressed="true"'));
assert.ok(emptyHtml.includes("No contracts in this state."));
console.log("Contracts explicit empty-status navigation checks passed.");

const appSource = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const initialContractTab = appSource.match(/contractTab: "([^"]*)"/)[1];
assert.equal(initialContractTab, "", "The app must not preselect a status before the first read");
const onlyAvailable = { ...data, contracts: { ...model, items: model.items.filter(item => item.status === "Available") } };
assert.ok(renderContractsPage(onlyAvailable, { contractTab: initialContractTab }).includes('data-player-contract-tab="Available" aria-pressed="true"'));
const explicitActive = renderContractsPage(onlyAvailable, { contractTab: "Active" });
assert.ok(explicitActive.includes('data-player-contract-tab="Active" aria-pressed="true"'));
assert.ok(explicitActive.includes("No contracts in this state."));

import assert from "node:assert/strict";

import { PlayerApi } from "../src/api/player-api.js";
import { normalizeWritePayload } from "../src/api/payload-normalizer.js";
import { createStudentProfileApiCall } from "../src/integrations/student-profile-api-call.js";

const manifest = {
  ok: true,
  schemaVersion: 1,
  manifestVersion: "2026-07-19.2",
  service: "classroom-api",
  capabilities: {
    routes: {
      dashboard: false,
      news: false,
      market: false,
      portfolio: false,
      business: false,
      contracts: true,
      store: false,
      marketplace: false,
      inventory: false,
      crafting: false,
      banking: false,
      loans: false,
      messages: false,
      progression: false,
      profile: false
    },
    actions: {
      bankingExport: false,
      bankTransfer: false,
      businessHire: false,
      businessPrice: false,
      businessProduction: false,
      chartRange: false,
      contractAccept: false,
      contractSubmit: true,
      craftItem: false,
      inventoryUse: false,
      loanApply: false,
      loanRepay: false,
      logout: false,
      marketOrder: false,
      marketSearch: false,
      marketWatchlist: false,
      marketplaceCancel: false,
      marketplaceListing: false,
      marketplacePurchase: false,
      messageAttachment: false,
      messageSearch: false,
      messageSend: false,
      notificationsRead: false,
      progressionClaim: false,
      progressionUnlock: false,
      savingsTransfer: false,
      storePurchase: false
    }
  },
  endpoints: [
    { key: "capabilities", operations: [{ method: "GET", pathTemplate: "/players/me/capabilities" }] },
    { key: "contractSubmit", operations: [{ method: "POST", pathTemplate: "/players/me/contracts/:contractKey/submit" }] },
    { key: "contracts", operations: [{ method: "GET", pathTemplate: "/players/me/contracts" }] }
  ]
};

const contract = {
  contractKey: "arrival-orientation",
  sourceType: "teacher",
  title: "Arrival orientation",
  description: "Review the national economy.",
  instructions: "Submit a short response.",
  category: "Orientation",
  status: "active",
  visibility: "public",
  targetingPayload: { countryCodes: ["ELD"] },
  requirementsPayload: { items: [{ label: "Read the briefing" }] },
  rewardPayload: { cashAmount: 25, currencyCode: "ECO" },
  completionMode: "manual_review",
  publishedAt: "2026-07-18T00:00:00.000Z",
  deadlineAt: "2026-07-21T00:00:00.000Z",
  expiresAt: "2026-07-22T00:00:00.000Z",
  metadata: { issuer: "Immigration Office" },
  createdAt: "2026-07-18T00:00:00.000Z",
  updatedAt: "2026-07-19T00:00:00.000Z"
};

let submitted = false;
const calls = [];
const apiCall = createStudentProfileApiCall({
  request: async (request) => {
    calls.push(structuredClone({ ...request, signal: undefined }));
    if (request.path === "/players/me") {
      return {
        gameSession: { id: "game-private-uuid", name: "Econovaria", status: "active" },
        player: { id: "player-private-uuid", playerIdentifier: "CARD-100", displayName: "Alex Rivera" },
        session: { id: "session-private-uuid", status: "active" },
        balances: [{ accountType: "cash", currencyCode: "ECO", balance: 100 }]
      };
    }
    if (request.path === "/players/me/capabilities") return manifest;
    if (request.path === "/players/me/contracts") {
      return {
        ok: true,
        contracts: [contract],
        progress: [{
          contractKey: contract.contractKey,
          status: submitted ? "submitted" : "in_progress",
          evidencePayload: submitted
            ? { submissionUrl: "https://example.test/evidence", note: "Completed response" }
            : {},
          resultPayload: submitted ? { feedback: "Earlier revision feedback remains visible." } : {},
          submittedAt: submitted ? "2026-07-19T01:00:00.000Z" : null,
          completedAt: null,
          rewardIssuedAt: null,
          createdAt: "2026-07-18T00:00:00.000Z",
          updatedAt: "2026-07-19T01:00:00.000Z"
        }]
      };
    }
    if (request.path === "/players/me/contracts/arrival-orientation/submit") {
      submitted = true;
      return {
        ok: true,
        contract,
        progress: {
          contractKey: contract.contractKey,
          status: "submitted",
          evidencePayload: request.payload.evidencePayload,
          resultPayload: { feedback: "Earlier revision feedback remains visible." },
          submittedAt: "2026-07-19T01:00:00.000Z",
          completedAt: null,
          rewardIssuedAt: null,
          createdAt: "2026-07-18T00:00:00.000Z",
          updatedAt: "2026-07-19T01:00:00.000Z"
        }
      };
    }
    throw new Error(`Unexpected request ${request.method} ${request.path}`);
  }
});

const api = new PlayerApi({
  usePreviewData: false,
  playerSessionToken: "token-1",
  gameSessionId: "must-not-be-forwarded",
  playerSessionId: "must-not-be-forwarded",
  requestTimeoutMs: 1000,
  writeCooldownMs: 250,
  apiCall
});

const shell = await api.bootstrap({ force: true });
assert.equal(shell.session.capabilities.actions.contractSubmit, true);

const initial = await api.loadRoute("contracts", { force: true });
assert.equal(initial.data.contracts.items[0].id, "arrival-orientation");
assert.equal(initial.data.contracts.items[0].status, "Active");

const payload = normalizeWritePayload("contractSubmit", {
  gameSessionId: "browser-owned-game",
  playerId: "browser-owned-player",
  playerSessionId: "browser-owned-session",
  contractId: "browser-owned-contract-id",
  submissionUrl: "https://example.test/evidence",
  note: "Completed response"
});
assert.deepEqual(payload, {
  submissionUrl: "https://example.test/evidence",
  note: "Completed response"
});

const operation = await api.execute(
  "contractSubmit",
  payload,
  { contractId: "arrival-orientation" }
);
assert.equal(operation.result.progress.contractKey, "arrival-orientation");
assert.equal(operation.result.progress.status, "submitted");
assert.deepEqual(operation.invalidatedResources, ["dashboard", "contracts"]);

const submitRequest = calls.find((request) => request.endpointKey === "contractSubmit");
assert.equal(submitRequest.method, "POST");
assert.equal(submitRequest.path, "/players/me/contracts/arrival-orientation/submit");
assert.deepEqual(submitRequest.payload, {
  evidencePayload: {
    submissionUrl: "https://example.test/evidence",
    note: "Completed response"
  }
});
assert.equal(submitRequest.headers["x-player-session-token"], "token-1");
for (const privateField of ["gameSessionId", "playerId", "playerSessionId", "contractId"]) {
  assert.equal(privateField in submitRequest.payload, false);
}
assert.equal("x-game-session-id" in submitRequest.headers, false);
assert.equal("x-player-id" in submitRequest.headers, false);

const refreshed = await api.refreshResources(operation.invalidatedResources);
assert.equal(Object.keys(refreshed.errors).length, 0);
assert.equal(refreshed.data.contracts.items[0].status, "Submitted");
assert.equal(
  calls.filter((request) => request.path === "/players/me/contracts").length,
  2,
  "The terminal must perform an authoritative Contract re-read after submission."
);
assert.equal(
  calls.some((request) => request.path.includes("gameSessionId=")),
  false,
  "Contract submission must not forward browser-owned game scope."
);

console.log("Connected Contract submission passed: manifest gating, public-key evidence write, committed success, invalidation, and authoritative refresh are valid.");

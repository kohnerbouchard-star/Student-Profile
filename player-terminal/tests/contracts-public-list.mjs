import assert from "node:assert/strict";

import { normalizePlayerContracts } from "../src/features/contracts/contract-read-model.js";

const response = {
  ok: true,
  contracts: [{
    contractKey: "intro.trade-1",
    sourceType: "staff",
    title: "Introductory trade mission",
    description: "Review the current trade environment.",
    instructions: "Submit a short response.",
    category: "Trade",
    status: "active",
    visibility: "targeted",
    targetingPayload: { countryCodes: ["ELD"], rosterLabels: ["A-1"] },
    requirementsPayload: { items: [{ label: "Attach evidence" }] },
    rewardPayload: { cashAmount: 50, currencyCode: "ECO", xp: 10 },
    completionMode: "manual_review",
    publishedAt: "2026-07-18T09:00:00.000Z",
    deadlineAt: "2026-07-20T12:00:00.000Z",
    expiresAt: "2026-07-21T12:00:00.000Z",
    metadata: { issuer: "Trade Ministry" },
    createdAt: "2026-07-18T09:00:00.000Z",
    updatedAt: "2026-07-18T09:00:00.000Z"
  }],
  progress: [{
    contractKey: "intro.trade-1",
    status: "in_progress",
    evidencePayload: {},
    resultPayload: {},
    submittedAt: null,
    completedAt: null,
    rewardIssuedAt: null,
    createdAt: "2026-07-18T10:00:00.000Z",
    updatedAt: "2026-07-18T10:00:00.000Z"
  }]
};

const model = normalizePlayerContracts(response, {
  now: Date.parse("2026-07-18T12:00:00.000Z")
});

assert.equal(model.items.length, 1);
assert.equal(model.items[0].id, "intro.trade-1");
assert.equal(model.items[0].status, "Active");
assert.equal(model.items[0].issuer, "Trade Ministry");
assert.equal(model.items[0].location, "ELD");
assert.equal(model.items[0].rewardCash, 50);
assert.equal(model.items[0].rewardXp, 10);
assert.equal(model.items[0].timeline[1].complete, true);
assert.ok(!JSON.stringify(model).match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i));

console.log("Public Player Contract list normalization passed.");

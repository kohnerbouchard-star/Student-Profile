import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  AdminInventoryRedemptionError,
  createAdminInventoryRedemptionQueueClient,
  normalizeInventoryRedemptionQueueResponse
} from "../admin/inventory-redemption-queue-client.js";

const requestId = `red_${"a".repeat(32)}`;
const baseRedemption = {
  id: requestId,
  itemId: "meal-pass",
  quantity: 1,
  status: "pending",
  requestNote: "Lunch reward",
  resolutionNote: null,
  requestedAt: "2026-07-18T12:00:00.000Z",
  reviewedAt: null,
  fulfilledAt: null,
  updatedAt: "2026-07-18T12:00:00.000Z",
  player: {
    reference: "P-100",
    displayName: "Test Player",
    rosterLabel: "A1"
  },
  item: {
    id: "meal-pass",
    name: "Meal Pass",
    category: "consumable"
  }
};

const normalized = normalizeInventoryRedemptionQueueResponse({
  data: {
    redemptions: [baseRedemption],
    summary: { returned: 99 },
    pagination: { limit: 25, offset: 0, returned: 1, hasMore: false },
    filters: { status: "pending" }
  }
});
assert.equal(normalized.redemptions.length, 1);
assert.equal(normalized.summary.pending, 1);
assert.equal(normalized.summary.returned, 1, "Summary counts must be derived from validated rows.");
assert.equal(normalized.redemptions[0].player.reference, "P-100");
assert.equal(JSON.stringify(normalized).includes("00000000-0000-4000-8000-000000000000"), false);

assert.throws(
  () => normalizeInventoryRedemptionQueueResponse({
    data: {
      redemptions: [{ ...baseRedemption, quantity: undefined }],
      pagination: { limit: 25, offset: 0, returned: 1 }
    }
  }),
  (error) => error instanceof AdminInventoryRedemptionError && error.code === "invalid_inventory_redemption_response"
);

const requests = [];
const fetchImpl = async (url, init) => {
  requests.push({ url: String(url), init });
  if (init.method === "GET") {
    return new Response(JSON.stringify({
      data: {
        requests: [baseRedemption],
        pagination: { limit: 10, offset: 20, returned: 1, hasMore: true },
        filters: { status: "pending" }
      }
    }), { status: 200, headers: { "content-type": "application/json" } });
  }
  const body = JSON.parse(init.body);
  return new Response(JSON.stringify({
    data: {
      outcome: "applied",
      action: "approve",
      redemption: {
        ...baseRedemption,
        status: "approved",
        resolutionNote: body.note,
        reviewedAt: "2026-07-18T12:05:00.000Z",
        updatedAt: "2026-07-18T12:05:00.000Z"
      },
      effectApplication: "not_automated"
    }
  }), { status: 200, headers: { "content-type": "application/json" } });
};

const client = createAdminInventoryRedemptionQueueClient({ fetchImpl });
const queue = await client.list({
  gameId: "game-public-admin-scope",
  status: "pending",
  limit: 10,
  offset: 20
});
assert.equal(queue.pagination.hasMore, true);
assert.match(requests[0].url, /^\/api\/admin\/games\/game-public-admin-scope\/inventory\/redemptions\?/);
const listUrl = new URL(requests[0].url, "https://example.test");
assert.equal(listUrl.searchParams.get("status"), "pending");
assert.equal(listUrl.searchParams.get("limit"), "10");
assert.equal(listUrl.searchParams.get("offset"), "20");
assert.equal(requests[0].init.method, "GET");
assert.equal(requests[0].init.cache, "no-store");

const key = "admin-redemption:approve:test-1";
const result = await client.review({
  gameId: "game-public-admin-scope",
  requestId,
  action: "approve",
  note: "Approved for classroom fulfillment",
  idempotencyKey: key
});
assert.equal(result.outcome, "applied");
assert.equal(result.redemption.status, "approved");
assert.equal(
  requests[1].url,
  `/api/admin/games/game-public-admin-scope/inventory/redemptions/${requestId}/approve`
);
assert.equal(requests[1].init.headers["x-idempotency-key"], key);
assert.equal(requests[1].init.headers["x-request-id"], key);
const reviewBody = JSON.parse(requests[1].init.body);
assert.deepEqual(Object.keys(reviewBody).sort(), ["idempotencyKey", "note"]);
assert.equal("playerId" in reviewBody, false);
assert.equal("playerUuid" in reviewBody, false);
assert.equal("gameSessionId" in reviewBody, false);

await assert.rejects(
  client.review({
    gameId: "game-public-admin-scope",
    requestId,
    action: "reject",
    note: "",
    idempotencyKey: "admin-redemption:reject:test-1"
  }),
  (error) => error instanceof AdminInventoryRedemptionError && error.code === "invalid_inventory_redemption_request"
);

await assert.rejects(
  client.list({ gameId: "game-public-admin-scope", status: "unknown" }),
  (error) => error instanceof AdminInventoryRedemptionError && error.code === "invalid_inventory_redemption_request"
);

const surface = readFileSync("admin/inventory-redemption-queue-surface.js", "utf8");
const loader = readFileSync("admin/inventory-redemption-queue-loader.js", "utf8");
const stylesheet = readFileSync("admin/css/inventory-redemption-queue.css", "utf8");
const adminIndex = readFileSync("admin/index.html", "utf8");
for (const path of [
  "admin/inventory-redemption-queue-client.js",
  "admin/inventory-redemption-queue-loader.js",
  "admin/inventory-redemption-queue-surface.js",
]) {
  const check = spawnSync(process.execPath, ["--check", path], { encoding: "utf8" });
  assert.equal(check.status, 0, `${path} failed syntax validation:\n${check.stderr || check.stdout}`);
}
assert.match(surface, /EconovariaAdminModalAccessibility/);
assert.match(surface, /data-admin-redemption-filter="pending"/);
assert.match(surface, /data-admin-redemption-filter="all"/);
assert.match(surface, /Queue refresh failed/);
assert.match(surface, /textContent = redemption\.player\.displayName/);
assert.doesNotMatch(surface, /new MutationObserver|MutationObserver\s*\(/);
assert.doesNotMatch(surface, /window\.fetch\s*=/);
assert.doesNotMatch(surface, /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
assert.match(loader, /document\.createElement\("link"\)/);
assert.match(loader, /inventory-redemption-queue\.css/);
assert.match(loader, /await import\("\.\/inventory-redemption-queue-surface\.js"\)/);
assert.doesNotMatch(loader, /createElement\("style"\)|style\.cssText|MutationObserver|window\.fetch\s*=/);
assert.match(stylesheet, /@media \(max-width: 620px\)/);
assert.match(stylesheet, /@media \(forced-colors: active\)/);
assert.doesNotMatch(adminIndex, /<link[^>]+inventory-redemption-queue\.css/);
assert.match(adminIndex, /inventory-redemption-queue-loader\.js/);

console.log("Admin inventory redemption queue contract and source boundaries passed.");

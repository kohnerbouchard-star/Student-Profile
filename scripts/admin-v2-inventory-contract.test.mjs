import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createAdminInventoryRedemptionQueueClient } from "../admin/inventory-redemption-queue-client.js";
import {
  normalizeInventoryReadModel,
  normalizeInventoryRedemption,
} from "../admin/v2/src/routes/inventory/InventoryModel.js";

const GAME_ID = "123e4567-e89b-42d3-a456-426614174000";
const REQUEST_ID = `red_${"a".repeat(32)}`;

function row(overrides = {}) {
  return {
    id: REQUEST_ID,
    itemId: "item_key",
    quantity: 3,
    status: "pending",
    requestNote: "교환 요청",
    resolutionNote: null,
    requestedAt: "2026-08-07T07:00:00.000Z",
    reviewedAt: null,
    fulfilledAt: null,
    updatedAt: "2026-08-07T07:00:00.000Z",
    player: {
      reference: "P-104",
      displayName: "김민준",
      rosterLabel: "Grade 10",
    },
    item: {
      id: "item_key",
      name: "매우 긴 사용자 지정 아이템 이름",
      category: "reward",
    },
    ...overrides,
  };
}

function queue(redemptions, overrides = {}) {
  return {
    redemptions,
    summary: {},
    pagination: { limit: 25, offset: 0, returned: redemptions.length, hasMore: false },
    status: "pending",
    ...overrides,
  };
}

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "x-request-id": "req_inventory_test" },
  });
}

test("inventory model supports empty and many canonical redemption records", () => {
  const empty = normalizeInventoryReadModel(queue([]));
  assert.equal(empty.isEmpty, true);
  assert.equal(empty.contract.exposesOwnedBalanceDirectory, false);
  assert.equal(empty.contract.exposesBusinessRelationship, false);

  const many = normalizeInventoryReadModel(queue(Array.from({ length: 25 }, (_, index) => row({
    id: `red_${index.toString(16).padStart(32, "0")}`,
    quantity: (index % 10) + 1,
    status: ["pending", "approved", "rejected", "fulfilled"][index % 4],
  }))));
  assert.equal(many.redemptions.length, 25);
  assert.equal(many.summary.returned, 25);
  assert.equal(many.redemptions[0].quantity, 1);
});

test("inventory model preserves Korean and long text while redacting UUID-like private values", () => {
  const privateUuid = "123e4567-e89b-42d3-a456-426614174999";
  const normalized = normalizeInventoryRedemption(row({
    player: { reference: privateUuid, displayName: `김민준 ${privateUuid}`, rosterLabel: "10학년" },
    item: { name: `사용자 정의 보상 ${privateUuid}`, category: "보상" },
  }));
  const serialized = JSON.stringify(normalized);
  assert.match(normalized.player.displayName, /김민준/);
  assert.match(normalized.item.name, /사용자 정의 보상/);
  assert.doesNotMatch(serialized, new RegExp(privateUuid));
  assert.match(serialized, /\[redacted\]/);
  assert.equal(Object.hasOwn(normalized.item, "id"), false);
});

test("seeded or custom provenance is displayed only when represented by the authoritative row", () => {
  const absent = normalizeInventoryRedemption(row());
  assert.equal(absent.item.provenance, "");
  assert.equal(absent.item.type, "");

  const represented = normalizeInventoryRedemption(row({
    item: { name: "Custom Medal", category: "reward", provenance: "custom", type: "physical" },
  }));
  assert.equal(represented.item.provenance, "custom");
  assert.equal(represented.item.type, "physical");
});

test("authoritative redemption client reads the pending queue with bounded pagination", async () => {
  let seenUrl = "";
  let seenInit = null;
  const client = createAdminInventoryRedemptionQueueClient({
    fetchImpl: async (url, init) => {
      seenUrl = String(url);
      seenInit = init;
      return response({
        data: {
          redemptions: [row()],
          summary: { returned: 1, pending: 1, approved: 0, rejected: 0, fulfilled: 0 },
          pagination: { limit: 25, offset: 0, returned: 1, hasMore: false },
          filters: { status: "pending" },
        },
      });
    },
  });

  const result = await client.list({ gameId: GAME_ID, status: "pending", limit: 25, offset: 0 });
  assert.match(seenUrl, /\/api\/admin\/games\/.+\/inventory\/redemptions\?/);
  assert.match(seenUrl, /status=pending/);
  assert.match(seenUrl, /limit=25/);
  assert.equal(seenInit.method, "GET");
  assert.equal(result.redemptions[0].player.displayName, "김민준");
  assert.equal(result.redemptions[0].quantity, 3);
});

test("authoritative review client supports approve, reject, and fulfill using idempotency", async () => {
  const calls = [];
  const client = createAdminInventoryRedemptionQueueClient({
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      const action = String(url).split("/").at(-1);
      const status = action === "approve" ? "approved" : action === "reject" ? "rejected" : "fulfilled";
      return response({
        data: {
          outcome: "applied",
          action,
          redemption: row({ status }),
          effectApplication: "not_automated",
        },
      });
    },
  });

  for (const action of ["approve", "reject", "fulfill"]) {
    const result = await client.review({
      gameId: GAME_ID,
      requestId: REQUEST_ID,
      action,
      note: action === "reject" ? "Insufficient documentation" : "",
      idempotencyKey: `inventory:${action}:request-12345678`,
    });
    assert.equal(result.action, action);
  }

  assert.equal(calls.length, 3);
  calls.forEach(({ url, init }) => {
    assert.match(url, new RegExp(`/inventory/redemptions/${REQUEST_ID}/(approve|reject|fulfill)$`));
    assert.equal(init.method, "POST");
    const body = JSON.parse(init.body);
    assert.equal(typeof body.idempotencyKey, "string");
    assert.equal(init.headers["x-idempotency-key"], body.idempotencyKey);
  });
});

test("inventory V2 source keeps Store, Crafting, and Business semantics out of the route and includes responsive states", async () => {
  const [controller, route, model, css] = await Promise.all([
    readFile(new URL("../admin/v2/src/routes/inventory/InventoryController.js", import.meta.url), "utf8"),
    readFile(new URL("../admin/v2/src/routes/inventory/InventoryRoute.js", import.meta.url), "utf8"),
    readFile(new URL("../admin/v2/src/routes/inventory/InventoryModel.js", import.meta.url), "utf8"),
    readFile(new URL("../admin/v2/styles/routes/inventory.css", import.meta.url), "utf8"),
  ]);
  const source = `${controller}\n${route}\n${model}`;
  assert.match(source, /inventory\.redeem/);
  assert.match(source, /approve/);
  assert.match(source, /reject/);
  assert.match(source, /fulfill/);
  assert.match(source, /INITIAL_LOADING|initial-loading/);
  assert.match(source, /STALE/);
  assert.match(source, /FAILED/);
  assert.match(route, /Quantities shown are requested redemption quantities/);
  assert.match(route, /Seeded\/custom provenance is not inferred/);
  assert.doesNotMatch(source, /routes\/(store|crafting|business)|StoreController|CraftingController|BusinessController/);
  assert.match(css, /@media \(max-width: 900px\)/);
  assert.match(css, /@media \(max-width: 620px\)/);
});

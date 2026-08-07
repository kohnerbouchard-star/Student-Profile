import assert from "node:assert/strict";
import test from "node:test";

import { createAdminApiClient } from "../admin/v2/src/api/admin-api-client.js";
import { createAdminBffTransport } from "../admin/v2/src/api/admin-bff-transport.js";
import { isAdminErrorEnvelope } from "../admin/v2/src/core/error-envelope.js";

const GAME_ID = "10000000-0000-4000-8000-000000000001";
const ITEM_ID = "20000000-0000-4000-8000-000000000002";
const DEVICE_ID = "30000000-0000-4000-8000-000000000003";
const CSRF_TOKEN = "C".repeat(43);
const IDEMPOTENCY_KEY = "admin-v2-store-create-0001";

function jsonResponse(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    status: init.status || 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers || {}),
    },
  });
}

function validSession() {
  return {
    authenticated: true,
    csrfToken: CSRF_TOKEN,
  };
}

function transportFixture(fetchImpl, options = {}) {
  const replaced = [];
  const cleared = [];
  const locationLike = {
    href: "https://admin.example.test/admin/v2.html",
    origin: "https://admin.example.test",
    replace(value) { replaced.push(value); },
  };
  const sessionManager = options.sessionManager || {
    read: () => validSession(),
    isExpired: () => false,
    clear: () => cleared.push(true),
  };
  const transport = createAdminBffTransport({
    selectedGameId: GAME_ID,
    runtimeConfig: {
      adminBffApiUrl: "/api/admin",
      supabasePublishableKey: "publishable-test-key",
    },
    sessionManager,
    fetchImpl,
    locationLike,
    storage: {
      getItem: () => DEVICE_ID,
      setItem() {},
    },
    cryptoObject: { randomUUID: () => DEVICE_ID },
    setTimeoutImpl: options.setTimeoutImpl,
  });
  return { transport, cleared, replaced };
}

test("Admin v2 Store transport scopes reads and strips browser-supplied credentials", async () => {
  const calls = [];
  const { transport } = transportFixture(async (url, init) => {
    calls.push({ url, init });
    return jsonResponse({ data: { items: [], storeItems: [] } });
  });

  await transport(`/api/admin/games/${GAME_ID}/store/items`, {
    method: "GET",
    headers: {
      Authorization: "Bearer must-not-leave-browser",
      Cookie: "staff-secret=must-not-leave-browser",
      "X-Econovaria-Csrf-Token": "untrusted",
      "X-Econovaria-Device-Id": "untrusted",
      "X-Econovaria-Game-Id": "untrusted",
      "X-Idempotency-Key": "untrusted-idempotency-key",
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    `https://admin.example.test/api/admin/games/${GAME_ID}/store/items`,
  );
  assert.equal(calls[0].init.credentials, "include");
  assert.equal(calls[0].init.cache, "no-store");
  assert.equal(calls[0].init.redirect, "error");
  assert.equal(calls[0].init.referrerPolicy, "no-referrer");
  assert.equal(calls[0].init.headers.get("authorization"), null);
  assert.equal(calls[0].init.headers.get("cookie"), null);
  assert.equal(calls[0].init.headers.get("x-econovaria-csrf-token"), null);
  assert.equal(calls[0].init.headers.get("idempotency-key"), null);
  assert.equal(calls[0].init.headers.get("x-idempotency-key"), null);
  assert.equal(calls[0].init.headers.get("x-econovaria-device-id"), DEVICE_ID);
  assert.equal(calls[0].init.headers.get("x-econovaria-game-id"), GAME_ID);
  assert.equal(calls[0].init.headers.get("apikey"), "publishable-test-key");
});

test("Admin v2 Store transport preserves one deterministic 401 session exit", async () => {
  const sessionManager = {
    read: () => validSession(),
    isExpired: () => false,
    clearCount: 0,
    clear() { this.clearCount += 1; },
  };
  const scheduled = [];
  const { transport, replaced } = transportFixture(
    async () => jsonResponse({ code: "auth_required" }, { status: 401 }),
    {
      sessionManager,
      setTimeoutImpl(callback, delay) {
        scheduled.push(delay);
        callback();
      },
    },
  );

  await transport(`/api/admin/games/${GAME_ID}/store/items`);
  await transport(`/api/admin/games/${GAME_ID}/store/items`);
  assert.equal(sessionManager.clearCount, 1);
  assert.deepEqual(scheduled, [250]);
  assert.equal(replaced.length, 1);
  assert.match(replaced[0], /[?&]reason=session-expired(?:&|$)/);
});

test("Admin v2 Store transport binds mutation CSRF and canonical idempotency", async () => {
  const calls = [];
  const { transport } = transportFixture(async (url, init) => {
    calls.push({ url, init });
    return jsonResponse({ ok: true, item: { id: ITEM_ID } }, { status: 201 });
  });

  await transport(`/api/admin/games/${GAME_ID}/store/items`, {
    method: "POST",
    headers: {
      Authorization: "Bearer must-not-leave-browser",
      "X-Econovaria-Csrf-Token": "untrusted",
      "X-Idempotency-Key": IDEMPOTENCY_KEY,
    },
    body: JSON.stringify({ name: "Notebook" }),
  });

  assert.equal(calls.length, 1);
  const headers = calls[0].init.headers;
  assert.equal(headers.get("authorization"), null);
  assert.equal(headers.get("x-econovaria-csrf-token"), CSRF_TOKEN);
  assert.equal(headers.get("idempotency-key"), IDEMPOTENCY_KEY);
  assert.equal(headers.get("x-idempotency-key"), null);
  assert.equal(headers.get("content-type"), "application/json");
  assert.equal(headers.get("x-econovaria-device-id"), DEVICE_ID);
  assert.equal(headers.get("x-econovaria-game-id"), GAME_ID);
});

test("Admin v2 Store transport rejects unsafe mutations before fetch", async () => {
  let fetchCount = 0;
  const missingIdentity = transportFixture(async () => {
    fetchCount += 1;
    return jsonResponse({ ok: true, item: {} });
  }).transport;
  await assert.rejects(
    missingIdentity(`/api/admin/games/${GAME_ID}/store/items`, {
      method: "POST",
      body: "{}",
    }),
    (error) => error.code === "INVALID_REQUEST" && error.status === 400,
  );

  const missingSession = transportFixture(async () => {
    fetchCount += 1;
    return jsonResponse({ ok: true, item: {} });
  }, {
    sessionManager: {
      read: () => null,
      isExpired: () => true,
      clear() {},
    },
  }).transport;
  await assert.rejects(
    missingSession(`/api/admin/games/${GAME_ID}/store/items`, {
      method: "POST",
      headers: { "Idempotency-Key": IDEMPOTENCY_KEY },
      body: "{}",
    }),
    (error) => error.code === "SESSION_REQUIRED" && error.status === 401,
  );
  assert.equal(fetchCount, 0);
});

test("Store client uses the authoritative read, create, update, and archive contracts", async () => {
  const calls = [];
  const item = {
    id: ITEM_ID,
    gameSessionId: GAME_ID,
    itemKey: "beta-nort-notebook",
    name: "Notebook",
    description: "A ruled notebook.",
    category: "school-supplies",
    price: 7.5,
    currencyCode: "NRC",
    stockQuantity: 12,
    status: "active",
    visibility: "visible",
    sortOrder: 4,
    createdAt: "2026-08-07T00:00:00.000Z",
    updatedAt: "2026-08-07T00:00:00.000Z",
  };
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (init.method === "GET") {
      return jsonResponse({ data: { storeItems: [item], items: [item] } });
    }
    return jsonResponse({ ok: true, item }, { status: init.method === "POST" ? 201 : 200 });
  };
  const client = createAdminApiClient({ fetchImpl, timeoutMs: 1_000 });

  const read = await client.readStore({ gameId: GAME_ID });
  const created = await client.createStoreItem({
    gameId: GAME_ID,
    idempotencyKey: "admin-v2-store-create-0002",
    item: {
      ...item,
      imageUrl: "https://untrusted.example/item.png",
      itemType: "legacy-display-only",
      countryStock: { Northeld: 12 },
    },
  });
  const updated = await client.updateStoreItem({
    gameId: GAME_ID,
    itemId: ITEM_ID,
    idempotencyKey: "admin-v2-store-update-0001",
    changes: {
      itemKey: "must-not-change",
      name: "Notebook — revised",
      price: 8,
      stockQuantity: 9,
      imageUrl: "https://untrusted.example/revised.png",
    },
  });
  const archived = await client.archiveStoreItem({
    gameId: GAME_ID,
    itemId: ITEM_ID,
    idempotencyKey: "admin-v2-store-archive-0001",
  });

  assert.equal(read.data.items.length, 1);
  assert.equal(created.ok, true);
  assert.equal(updated.ok, true);
  assert.equal(archived.ok, true);
  assert.deepEqual(
    calls.map(({ url, init }) => [init.method, url]),
    [
      ["GET", `/api/admin/games/${GAME_ID}/store/items?include=stock,prices,purchaseStats`],
      ["POST", `/api/admin/games/${GAME_ID}/store/items`],
      ["PATCH", `/api/admin/games/${GAME_ID}/store/items/${ITEM_ID}`],
      ["DELETE", `/api/admin/games/${GAME_ID}/store/items/${ITEM_ID}`],
    ],
  );

  const createBody = JSON.parse(calls[1].init.body);
  assert.deepEqual(Object.keys(createBody), [
    "itemKey",
    "name",
    "description",
    "category",
    "price",
    "currencyCode",
    "stockQuantity",
    "status",
    "visibility",
    "sortOrder",
  ]);
  assert.equal("imageUrl" in createBody, false);
  assert.equal("itemType" in createBody, false);
  assert.equal("countryStock" in createBody, false);

  const updateBody = JSON.parse(calls[2].init.body);
  assert.deepEqual(updateBody, {
    name: "Notebook — revised",
    price: 8,
    stockQuantity: 9,
  });
  assert.equal("itemKey" in updateBody, false);
  assert.equal("imageUrl" in updateBody, false);
  assert.equal("body" in calls[3].init, false);

  for (const { init } of calls) {
    assert.equal(init.credentials, "include");
    assert.equal(init.cache, "no-store");
    assert.equal(init.redirect, "error");
    assert.equal("Authorization" in init.headers, false);
  }
  assert.equal(calls[1].init.headers["Idempotency-Key"], "admin-v2-store-create-0002");
  assert.equal(calls[2].init.headers["Idempotency-Key"], "admin-v2-store-update-0001");
  assert.equal(calls[3].init.headers["Idempotency-Key"], "admin-v2-store-archive-0001");
});

test("Store client coalesces one in-flight logical mutation and rejects key reuse with changed input", async () => {
  let fetchCount = 0;
  let release;
  const responseGate = new Promise((resolve) => { release = resolve; });
  const client = createAdminApiClient({
    fetchImpl: async () => {
      fetchCount += 1;
      await responseGate;
      return jsonResponse({ ok: true, item: { id: ITEM_ID } }, { status: 201 });
    },
    timeoutMs: 1_000,
  });
  const request = {
    gameId: GAME_ID,
    idempotencyKey: "admin-v2-store-create-deduplicated",
    item: { name: "Pencil", currencyCode: "NRC" },
  };

  const first = client.createStoreItem(request);
  const duplicate = client.createStoreItem(request);
  const changed = client.createStoreItem({
    ...request,
    item: { name: "Different item", currencyCode: "NRC" },
  });
  await assert.rejects(
    changed,
    (error) => isAdminErrorEnvelope(error) && error.code === "CONFLICT",
  );
  assert.equal(fetchCount, 1);
  release();
  const [firstResult, duplicateResult] = await Promise.all([first, duplicate]);
  assert.deepEqual(firstResult, duplicateResult);
  assert.equal(fetchCount, 1);
});

test("Store client cancellation prevents or aborts network work without retrying", async () => {
  let fetchCount = 0;
  const client = createAdminApiClient({
    fetchImpl: async (_url, init) => {
      fetchCount += 1;
      return await new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
      });
    },
    timeoutMs: 1_000,
  });

  const alreadyCancelled = new AbortController();
  alreadyCancelled.abort();
  await assert.rejects(
    client.readStore({ gameId: GAME_ID, signal: alreadyCancelled.signal }),
    (error) => isAdminErrorEnvelope(error) && error.code === "REQUEST_ABORTED",
  );
  assert.equal(fetchCount, 0);

  const pending = client.readStore({ gameId: GAME_ID });
  assert.equal(client.cancelStoreRequest(), true);
  assert.equal(client.cancelStoreRequest(), false);
  await assert.rejects(
    pending,
    (error) => isAdminErrorEnvelope(error) && error.code === "REQUEST_ABORTED",
  );
  assert.equal(fetchCount, 1);
});

test("Store client converts AAL2, validation, rate-limit, and malformed responses to safe errors", async () => {
  const rawDetail = "SELECT secret FROM auth.users USING service_role";
  const responses = [
    jsonResponse({
      ok: false,
      error: { code: "staff_mfa_required", message: rawDetail, details: rawDetail },
    }, { status: 403, headers: { "x-request-id": "req-mfa" } }),
    jsonResponse({
      ok: false,
      error: {
        code: "invalid_store_item",
        message: rawDetail,
        fieldErrors: { name: rawDetail, internalId: rawDetail },
      },
    }, { status: 422, headers: { "x-request-id": "req-validation" } }),
    jsonResponse({
      ok: false,
      error: { code: "admin_rate_limit_exceeded", message: rawDetail, retryable: true },
    }, { status: 429, headers: { "retry-after": "12" } }),
    new Response("not json", { status: 200, headers: { "content-type": "text/plain" } }),
  ];
  const client = createAdminApiClient({
    fetchImpl: async () => responses.shift(),
    timeoutMs: 1_000,
  });
  const base = { gameId: GAME_ID, item: { name: "Notebook", currencyCode: "NRC" } };

  await assert.rejects(
    client.createStoreItem({ ...base, idempotencyKey: "admin-v2-store-error-mfa" }),
    (error) => {
      assert.equal(error.code, "MFA_REQUIRED");
      assert.equal(error.requestId, "req-mfa");
      assert.equal(JSON.stringify(error).includes(rawDetail), false);
      return true;
    },
  );
  await assert.rejects(
    client.createStoreItem({ ...base, idempotencyKey: "admin-v2-store-error-validation" }),
    (error) => {
      assert.equal(error.code, "VALIDATION_FAILED");
      assert.deepEqual(error.fieldErrors, { name: "Review this field and try again." });
      assert.equal(JSON.stringify(error).includes(rawDetail), false);
      return true;
    },
  );
  await assert.rejects(
    client.createStoreItem({ ...base, idempotencyKey: "admin-v2-store-error-rate-limit" }),
    (error) => {
      assert.equal(error.code, "RATE_LIMITED");
      assert.equal(error.retryable, true);
      assert.equal(error.retryAfterSeconds, 12);
      assert.equal(JSON.stringify(error).includes(rawDetail), false);
      return true;
    },
  );
  await assert.rejects(
    client.readStore({ gameId: GAME_ID }),
    (error) => isAdminErrorEnvelope(error)
      && error.code === "INVALID_RESPONSE"
      && error.retryable === true,
  );
});

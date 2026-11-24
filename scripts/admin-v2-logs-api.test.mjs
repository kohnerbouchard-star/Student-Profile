import assert from "node:assert/strict";
import test from "node:test";

import { createAccountDocument } from "./admin-account-controls-dom-fixture.mjs";
import { getAdminNavigationRoute } from "../admin/v2/src/core/navigation-registry.js";
import { isAdminErrorEnvelope } from "../admin/v2/src/core/error-envelope.js";
import { createLogsApiClient, logsPath, normalizeLogsQuery } from "../admin/v2/src/routes/logs/LogsApi.js";
import { createLogsController, normalizeLogsReadModel } from "../admin/v2/src/routes/logs/LogsController.js";

const GAME_ID = "10000000-0000-4000-8000-000000000001";
const EVENT_ID = "20000000-0000-4000-8000-000000000002";
const ACTOR_ID = "30000000-0000-4000-8000-000000000003";
const TARGET_ID = "40000000-0000-4000-8000-000000000004";
const FUTURE_UUID = "018f4d2a-7c9b-7abc-bdef-1234567890ab";
const OPAQUE_OWNER = "ownership-record-opaque-123456";
const RAW_DIAGNOSTIC = "SELECT * FROM private.staff_users WHERE id = 'x'; SUPABASE_SERVICE_ROLE_KEY service_role backend/index.ts:99";
const ACCESS_TOKEN = "Bearer test-auth-material-not-for-display";
const API_SECRET = "sk-proj-test-secret-material-123456789";
const DATABASE_SECRET = "postgresql://audit:secret-password@example.invalid/private";

function jsonResponse(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    status: init.status || 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers || {}),
    },
  });
}

function log(overrides = {}) {
  return {
    id: EVENT_ID,
    eventId: EVENT_ID,
    actorType: "staff",
    actorId: ACTOR_ID,
    action: "store.item.updated",
    type: "store.item.updated",
    targetType: "store_item",
    targetId: TARGET_ID,
    relatedRecord: { type: "store_item", id: TARGET_ID },
    metadata: {
      category: "store",
      status: "completed",
      reason: "가격 정책 업데이트 승인",
      count: 3,
      itemKey: "beta-nort-sensor-board",
      owner_id: TARGET_ID,
      ownerId: OPAQUE_OWNER,
      correlation: FUTURE_UUID,
      access_token: ACCESS_TOKEN,
      service_role: "service_role",
      apiKey: API_SECRET,
      diagnosticNote: DATABASE_SECRET,
      raw_sql: RAW_DIAGNOSTIC,
      stack_trace: `Error: backend failed\n    at handler (backend/index.ts:99:1)`,
      malformed: { nested: "do not stringify" },
    },
    flag: { id: EVENT_ID, flaggedByStaffUserId: ACTOR_ID, reason: "review" },
    flagged: true,
    canFlag: true,
    createdAt: "2026-08-07T05:12:00.000Z",
    timestamp: "2026-08-07T05:12:00.000Z",
    ...overrides,
  };
}

function payload(rows = [log()], pagination = {}) {
  return {
    data: {
      logs: rows,
      auditLogs: rows,
      total: pagination.total ?? rows.length,
      pagination: {
        page: pagination.page ?? 1,
        pageSize: pagination.pageSize ?? 50,
        total: pagination.total ?? rows.length,
        totalPages: pagination.totalPages ?? 1,
        hasNextPage: pagination.hasNextPage ?? false,
        hasPreviousPage: pagination.hasPreviousPage ?? false,
      },
      reviewStaffId: ACTOR_ID,
    },
  };
}

test("Logs navigation flips only the Logs route to source-owned V2 semantics", () => {
  const route = getAdminNavigationRoute("logs");
  assert.equal(route.migration, "v2");
  assert.deepEqual(route.permission.allOf, ["audit.read"]);
  assert.equal(route.legacyDestination, null);
});

test("Logs query uses the authoritative server filters and bounded page sizes", () => {
  const filters = normalizeLogsQuery({
    page: 4,
    pageSize: 100,
    search: "store",
    action: "store.item.updated",
    actorType: "staff",
    targetType: "store_item",
    startAt: "2026-08-01T00:00:00Z",
    endAt: "2026-08-07T12:00:00Z",
  });
  const path = logsPath(GAME_ID, filters);
  assert.match(path, new RegExp(`^/games/${GAME_ID}/logs\\?`));
  const query = new URLSearchParams(path.split("?")[1]);
  assert.equal(query.get("page"), "4");
  assert.equal(query.get("pageSize"), "100");
  assert.equal(query.get("search"), "store");
  assert.equal(query.get("action"), "store.item.updated");
  assert.equal(query.get("actorType"), "staff");
  assert.equal(query.get("targetType"), "store_item");
  assert.equal(query.get("startAt"), "2026-08-01T00:00:00.000Z");
  assert.equal(query.get("endAt"), "2026-08-07T12:00:00.000Z");
  assert.equal(query.has("flagged"), false);
});

test("Logs client is read-only and does not add mutation headers", async () => {
  const calls = [];
  const client = createLogsApiClient({
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return jsonResponse(payload());
    },
    timeoutMs: 1_000,
  });

  const result = await client.readLogs({ gameId: GAME_ID, filters: { page: 1, pageSize: 50 } });
  assert.equal(result.current, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, new RegExp(`^/api/admin/games/${GAME_ID}/logs\\?`));
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.credentials, "include");
  assert.equal(calls[0].init.cache, "no-store");
  assert.equal("Authorization" in calls[0].init.headers, false);
  assert.equal("Idempotency-Key" in calls[0].init.headers, false);
  assert.equal("body" in calls[0].init, false);
  assert.equal(client.updateLog, undefined);
  assert.equal(client.deleteLog, undefined);
  assert.equal(client.flagLog, undefined);
  assert.equal(client.exportLogs, undefined);
});

test("Logs client normalizes unsafe backend failures into safe envelopes", async () => {
  const client = createLogsApiClient({
    fetchImpl: async () => jsonResponse({
      code: "upstream_unavailable",
      message: RAW_DIAGNOSTIC,
      details: ACCESS_TOKEN,
      retryable: true,
    }, { status: 503 }),
    timeoutMs: 1_000,
  });

  await assert.rejects(
    () => client.readLogs({ gameId: GAME_ID }),
    (error) => {
      assert.equal(isAdminErrorEnvelope(error), true);
      assert.equal(error.code, "SERVICE_UNAVAILABLE");
      assert.equal(JSON.stringify(error).includes(RAW_DIAGNOSTIC), false);
      assert.equal(JSON.stringify(error).includes(ACCESS_TOKEN), false);
      return true;
    },
  );
});

test("Logs HTTP access status takes precedence over untrusted error bodies", async () => {
  const abortedBody = new Response(null, { status: 403 });
  abortedBody.text = async () => { throw new Error(RAW_DIAGNOSTIC); };
  const failures = [
    [jsonResponse({ error: { code: "REQUEST_FAILED", message: RAW_DIAGNOSTIC }, retryable: true }, { status: 401 }), "SESSION_REQUIRED"],
    [jsonResponse({ error: { code: "SERVICE_UNAVAILABLE", message: RAW_DIAGNOSTIC }, retryable: true }, { status: 403 }), "PERMISSION_DENIED"],
    [new Response(null, { status: 401 }), "SESSION_REQUIRED"],
    [new Response(RAW_DIAGNOSTIC, { status: 403 }), "PERMISSION_DENIED"],
    [jsonResponse({ error: { code: { toString: RAW_DIAGNOSTIC }, requestId: ACCESS_TOKEN } }, { status: 403 }), "PERMISSION_DENIED"],
    [jsonResponse({ error: { code: "MFA_REQUIRED", message: RAW_DIAGNOSTIC } }, { status: 403 }), "MFA_REQUIRED"],
    [abortedBody, "PERMISSION_DENIED"],
  ];
  for (const [response, code] of failures) {
    const client = createLogsApiClient({ fetchImpl: async () => response });
    await assert.rejects(() => client.readLogs({ gameId: GAME_ID }), (error) => {
      assert.equal(isAdminErrorEnvelope(error), true);
      assert.equal(error.code, code);
      assert.equal(error.retryable, false);
      assert.equal(JSON.stringify(error).includes(RAW_DIAGNOSTIC), false);
      assert.equal(JSON.stringify(error).includes(ACCESS_TOKEN), false);
      return true;
    });
  }
});

test("Logs route clears displayed results and recovery controls on real transport access denial", async (t) => {
  const { document, Element } = createAccountDocument();
  document.createElementNS = (_namespace, tag) => document.createElement(tag);
  const globals = { document: globalThis.document, Node: globalThis.Node };
  Object.assign(globalThis, { document, Node: Element });
  t.after(() => Object.assign(globalThis, globals));
  const responses = [
    jsonResponse(payload([log()], { total: 100, totalPages: 2, hasNextPage: true })),
    jsonResponse({ code: "upstream_unavailable", message: RAW_DIAGNOSTIC }, { status: 503 }),
    new Response(RAW_DIAGNOSTIC, { status: 403 }),
  ];
  const calls = [];
  const api = createLogsApiClient({ fetchImpl: async (url, options) => {
    calls.push([url, options.method]);
    return responses.shift();
  } });
  let view;
  const controller = createLogsController({
    api, selectedGameId: GAME_ID, hasPermission: () => true,
    onChange() { view = controller.render().element; },
  });
  t.after(() => controller.destroy());
  await controller.applyFilters({ search: "store" });
  assert.match(view.textContent, /store\.item\.updated/);
  assert.equal(view.querySelectorAll("form").length, 1);
  await controller.load();
  assert.equal(controller.getState().status, "stale");
  assert.match(view.textContent, /store\.item\.updated/);
  assert.match(view.textContent, /Retry logs/);
  await controller.load();
  assert.equal(controller.getState().status, "failed");
  assert.equal(controller.getState().error.code, "PERMISSION_DENIED");
  assert.equal(controller.getState().data, null);
  assert.equal(view.querySelectorAll("form").length, 0);
  assert.doesNotMatch(view.textContent, /store\.item\.updated|Server-reported total|Page 1 of 2|Retry logs|SUPABASE_SERVICE_ROLE_KEY/);
  assert.deepEqual(calls, Array.from({ length: 3 }, () => [`/api/admin${logsPath(GAME_ID, { search: "store" })}`, "GET"]));
});

test("Logs read model preserves useful Korean text while dropping private identifiers and sensitive metadata", () => {
  const model = normalizeLogsReadModel({ payload: payload() });
  assert.equal(model.logs.length, 1);
  assert.equal(model.logs[0].actor, "Staff administrator");
  assert.equal(model.logs[0].action, "store.item.updated");
  assert.equal(model.logs[0].target, "Store Item");
  assert.equal(model.logs[0].category, "Store");
  assert.equal(model.logs[0].outcome, "Completed");
  assert.ok(model.logs[0].metadata.some((entry) => entry.value.includes("가격 정책 업데이트 승인")));

  const serialized = JSON.stringify(model);
  for (const forbidden of [
    EVENT_ID,
    ACTOR_ID,
    TARGET_ID,
    FUTURE_UUID,
    OPAQUE_OWNER,
    ACCESS_TOKEN,
    API_SECRET,
    DATABASE_SECRET,
    RAW_DIAGNOSTIC,
    "service_role",
    "backend/index.ts:99",
  ]) {
    assert.equal(serialized.includes(forbidden), false, `read model leaked ${forbidden}`);
  }
  assert.equal(serialized.includes("[object Object]"), false);
  assert.equal(/actorId|targetId|eventId|reviewStaffId|canFlag|flaggedByStaff/i.test(serialized), false);
});

test("Logs read model handles malformed optional metadata and a maximum server page safely", () => {
  const rows = Array.from({ length: 500 }, (_unused, index) => log({
    id: `${String(index).padStart(8, "0")}-0000-4000-8000-000000000000`,
    eventId: `${String(index).padStart(8, "0")}-0000-4000-8000-000000000000`,
    actorType: index % 2 ? "player" : "system",
    action: `progression.review.${index}`,
    targetType: "achievement",
    metadata: index === 0 ? ["malformed"] : { success: index % 3 !== 0, notes: ["검토", index] },
    createdAt: new Date(Date.UTC(2026, 7, 7, 5, 12, index % 60)).toISOString(),
  }));
  const model = normalizeLogsReadModel({ payload: payload(rows, {
    page: 3,
    pageSize: 500,
    total: 1500,
    totalPages: 3,
    hasPreviousPage: true,
    hasNextPage: false,
  }) });
  assert.equal(model.logs.length, 500);
  assert.equal(model.pagination.page, 3);
  assert.equal(model.pagination.total, 1500);
  assert.equal(model.pagination.hasPreviousPage, true);
  assert.equal(model.pagination.hasNextPage, false);
  assert.equal(JSON.stringify(model).includes("[object Object]"), false);
});

test("Logs controller fails closed on audit.read and preserves resolved data as stale after refresh failure", async () => {
  let allowed = false;
  let reads = 0;
  let fail = false;
  const changes = [];
  const api = {
    async readLogs() {
      reads += 1;
      if (fail) {
        const error = new Error(RAW_DIAGNOSTIC);
        error.code = "UPSTREAM_UNAVAILABLE";
        error.status = 503;
        error.retryable = true;
        throw error;
      }
      return { current: true, payload: payload() };
    },
    cancelLogsRequest() { return true; },
  };
  const controller = createLogsController({
    api,
    selectedGameId: GAME_ID,
    hasPermission: (permission) => allowed && permission === "audit.read",
    onChange: (state) => changes.push(state.status),
  });

  await controller.load();
  assert.equal(reads, 0);
  assert.equal(controller.getState().hasResolved, false);

  allowed = true;
  await controller.load();
  assert.equal(reads, 1);
  assert.equal(controller.getState().status, "ready");
  assert.equal(controller.getState().data.logs.length, 1);

  fail = true;
  await controller.load();
  assert.equal(reads, 2);
  assert.equal(controller.getState().status, "stale");
  assert.equal(controller.getState().data.logs.length, 1);
  assert.equal(JSON.stringify(controller.getState()).includes(RAW_DIAGNOSTIC), false);
  assert.ok(changes.includes("refreshing"));
});

test("Logs controller resets paging on filters and requests authoritative next pages", async () => {
  const seen = [];
  const api = {
    async readLogs({ filters }) {
      seen.push(filters);
      return {
        current: true,
        payload: payload([], {
          page: filters.page,
          pageSize: filters.pageSize,
          total: 250,
          totalPages: 5,
          hasPreviousPage: filters.page > 1,
          hasNextPage: filters.page < 5,
        }),
      };
    },
    cancelLogsRequest() { return true; },
  };
  const controller = createLogsController({
    api,
    selectedGameId: GAME_ID,
    hasPermission: (permission) => permission === "audit.read",
  });

  await controller.applyFilters({ search: "attendance", actorType: "staff", pageSize: 50 });
  assert.equal(seen.at(-1).page, 1);
  assert.equal(seen.at(-1).search, "attendance");
  await controller.setPage(2);
  assert.equal(seen.at(-1).page, 2);
  assert.equal(seen.at(-1).actorType, "staff");
});

test("Logs route withholds a prior query's rows, summary and paging while new filters load or fail", async (t) => {
  const { document, Element } = createAccountDocument();
  document.createElementNS = (_namespace, tag) => document.createElement(tag);
  const globals = { document: globalThis.document, Node: globalThis.Node };
  Object.assign(globalThis, { document, Node: Element });
  t.after(() => Object.assign(globalThis, globals));
  const seen = [];
  let finish;
  let view;
  const controller = createLogsController({
    api: {
      readLogs({ filters }) {
        seen.push(filters);
        return new Promise((resolve, reject) => { finish = { resolve, reject }; });
      },
    },
    selectedGameId: GAME_ID,
    hasPermission: () => true,
    onChange() { view = controller.render().element; },
  });
  const prior = controller.applyFilters({ search: "store" });
  finish.resolve({ payload: payload([log()], { total: 100, totalPages: 2, hasNextPage: true }) });
  await prior;
  assert.match(view.textContent, /store\.item\.updated/);
  assert.match(view.textContent, /Server-reported total/);
  const oldNext = view.querySelectorAll("button").find((button) => button.textContent === "Next");
  assert.ok(oldNext);
  const next = controller.applyFilters({ search: "attendance" });
  assert.doesNotMatch(view.textContent, /store\.item\.updated|Server-reported total|Page 1 of 2/);
  assert.equal(view.querySelectorAll("input").find((input) => input.getAttribute("name") === "logs-search").getAttribute("value"), "attendance");
  finish.reject(Object.assign(new Error(RAW_DIAGNOSTIC), { status: 503 }));
  await next;
  assert.equal(controller.getState().status, "failed");
  assert.equal(controller.getState().data, null);
  assert.doesNotMatch(view.textContent, /store\.item\.updated|Server-reported total|Page 1 of 2|SUPABASE_SERVICE_ROLE_KEY/);
  oldNext.click();
  await controller.setPage(2);
  assert.equal(seen.length, 2);
  view.querySelectorAll("button").find((button) => button.textContent === "Retry logs").click();
  assert.deepEqual(seen.at(-1), seen[1]);
  finish.resolve({ payload: payload([log({ action: "attendance.check_in" })], { total: 1, totalPages: 1 }) });
  await Promise.resolve();
  assert.match(view.textContent, /attendance\.check_in/);
  assert.doesNotMatch(view.textContent, /store\.item\.updated/);

  const denied = controller.load();
  finish.reject(Object.assign(new Error("Forbidden"), { status: 403 }));
  await denied;
  assert.equal(view.querySelectorAll("form").length, 0);
  assert.doesNotMatch(view.textContent, /attendance\.check_in|Server-reported total/);
});

test("Logs page failure and retry retain the requested page, not the previous page's data", async () => {
  const seen = [];
  const controller = createLogsController({
    api: {
      async readLogs({ filters }) {
        seen.push(filters);
        if (seen.length === 2) throw Object.assign(new Error("Unavailable"), { status: 503 });
        return { payload: payload([log()], {
          page: filters.page, pageSize: filters.pageSize, total: 100, totalPages: 4, hasNextPage: true,
        }) };
      },
    },
    selectedGameId: GAME_ID,
    hasPermission: () => true,
  });
  await controller.applyFilters({ pageSize: 25, startAt: "2026-08-01T00:00:00Z" });
  await controller.setPage(2);
  assert.equal(controller.getFilters().page, 2);
  assert.equal(controller.getState().data, null);
  await controller.setPage(3);
  assert.equal(seen.length, 2);
  await controller.load();
  assert.deepEqual(seen[2], seen[1]);
  assert.equal(controller.getState().data.pagination.page, 2);
});

test("Logs reentrant loading does not dispatch the superseded API request", async () => {
  const seen = [];
  let replace = true;
  let replacement;
  const controller = createLogsController({
    api: { async readLogs({ filters }) { seen.push(filters); return { payload: payload() }; } },
    selectedGameId: GAME_ID,
    hasPermission: () => true,
    onChange() {
      if (!replace) return;
      replace = false;
      replacement = controller.applyFilters({ action: "attendance.check_in" });
    },
  });
  await controller.applyFilters({ action: "store.item.updated" });
  await replacement;
  assert.deepEqual(seen.map((query) => query.action), ["attendance.check_in"]);
});

test("Logs discards late results and resets interrupted reads for route re-entry", async () => {
  const calls = [];
  let publications = 0;
  const controller = createLogsController({
    api: {
      readLogs({ filters }) {
        return new Promise((resolve) => calls.push({ filters, resolve }));
      },
    },
    selectedGameId: GAME_ID,
    hasPermission: () => true,
    onChange() { publications += 1; },
  });

  const first = controller.applyFilters({ search: "store", endAt: "2026-08-01" });
  const second = controller.applyFilters({ search: "attendance", endAt: "2026-08-02" });
  calls[1].resolve({ payload: payload([log({ action: "attendance.check_in" })]) });
  await second;
  calls[0].resolve({ payload: payload([log()]) });
  await first;
  assert.equal(controller.getState().data.logs[0].action, "attendance.check_in");
  assert.equal(controller.getFilters().endAt, "2026-08-02T00:00:00.000Z");

  const pending = controller.applyFilters({ startAt: "2026-08-01" });
  const beforeLeave = publications;
  controller.deactivate();
  assert.equal(controller.getState().requestVersion, 0);
  assert.equal(controller.getState().data, null);
  calls[2].resolve({ payload: payload([log()]) });
  await pending;
  assert.equal(publications, beforeLeave);
  const returned = controller.load();
  assert.deepEqual(calls[3].filters, calls[2].filters);
  calls[3].resolve({ payload: payload([], { page: 2, pageSize: 100, hasPreviousPage: true }) });
  await returned;
  assert.equal(controller.getState().data.pagination.page, 2);
  assert.equal(controller.getFilters().page, 2);
  assert.equal(controller.getFilters().pageSize, 100);
  assert.equal(controller.getState().status, "empty");
});

test("Logs retains identical normalized refresh data but withholds it on access failures", async () => {
  const controller = createLogsController({
    api: {
      async readLogs() {
        if (rejectWith) throw Object.assign(new Error("Unavailable"), { status: rejectWith });
        return { payload: payload([log()]) };
      },
    },
    selectedGameId: GAME_ID,
    hasPermission: () => allowed,
  });
  let allowed = true;
  let rejectWith = 0;
  await controller.applyFilters({ search: "store  items" });
  const data = controller.getState().data;
  rejectWith = 503;
  await controller.applyFilters({ search: "  store items  " });
  assert.equal(controller.getState().status, "stale");
  assert.equal(controller.getState().data, data);
  rejectWith = 403;
  await controller.load();
  assert.equal(controller.getState().status, "failed");
  assert.equal(controller.getState().data, null);
  rejectWith = 0;
  await controller.load();
  assert.equal(controller.getState().status, "ready");
  allowed = false;
  await controller.load();
  assert.equal(controller.getState().data, null);
});

test("Logs does not publish an in-flight refresh result after permission is revoked", async () => {
  let allowed = true;
  let finish;
  const controller = createLogsController({
    api: { readLogs: () => new Promise((resolve) => { finish = resolve; }) },
    selectedGameId: GAME_ID,
    hasPermission: () => allowed,
  });
  const initial = controller.load();
  finish({ payload: payload() });
  await initial;
  const pending = controller.load();
  allowed = false;
  finish({ payload: payload([log({ action: "attendance.check_in" })]) });
  await pending;
  assert.equal(controller.getState().status, "failed");
  assert.equal(controller.getState().error.code, "PERMISSION_DENIED");
  assert.equal(controller.getState().data, null);
});

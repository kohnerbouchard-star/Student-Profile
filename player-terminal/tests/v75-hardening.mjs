import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

import { PLAYER_ENDPOINTS } from "../src/api/endpoints.js";
import { AdapterTransport } from "../src/api/adapter-transport.js";
import { HttpTransport } from "../src/api/http-transport.js";
import { PlayerApi } from "../src/api/player-api.js";
import { normalizeWritePayload } from "../src/api/payload-normalizer.js";
import { normalizeApiResponse } from "../src/api/response-normalizer.js";
import { resolveCapabilities } from "../src/api/capabilities.js";
import { ROUTE_RESOURCE_PLAN, WRITE_INVALIDATIONS } from "../src/api/resource-plan.js";
import { buildPlayerTerminalConfig } from "../src/config/player-terminal.config.js";
import { renderShell } from "../src/components/layout.js";
import { previewData } from "../src/data/preview-data.js";

const productionConfig = buildPlayerTerminalConfig(
  { usePreviewData: true, allowPreviewMode: true },
  { hostname: "play.econovaria.example", search: "?preview=1" }
);
assert.equal(productionConfig.environment, "production");
assert.equal(productionConfig.allowPreviewMode, false, "Production must disable preview mode.");
assert.equal(productionConfig.usePreviewData, false, "Production must never fail open to preview data.");

const localPreviewConfig = buildPlayerTerminalConfig({}, { hostname: "localhost", search: "" });
assert.equal(localPreviewConfig.usePreviewData, true, "Local development should retain the explicit preview workflow.");
const localApiConfig = buildPlayerTerminalConfig({}, { hostname: "localhost", search: "?api=1" });
assert.equal(localApiConfig.usePreviewData, false, "The local API query must opt out of preview mode.");
const stagingConfig = buildPlayerTerminalConfig(
  { environment: "staging", usePreviewData: true, allowPreviewMode: true, developerDiagnostics: true },
  { hostname: "staging.econovaria.example", search: "?preview=1" }
);
assert.equal(stagingConfig.usePreviewData, false, "Staging must also fail closed instead of displaying preview records.");
assert.equal(stagingConfig.developerDiagnostics, false, "Staging must not expose development diagnostics.");
const localDiagnosticsConfig = buildPlayerTerminalConfig(
  { environment: "development", developerDiagnostics: true },
  { hostname: "localhost", search: "" }
);
assert.equal(localDiagnosticsConfig.developerDiagnostics, true, "Explicit diagnostics remain available in local development.");

const connectedCapabilities = resolveCapabilities({
  config: { usePreviewData: false, capabilities: null },
  session: {},
  dashboard: {
    capabilities: {
      routes: { store: true, inventory: true },
      actions: { storePurchase: true }
    }
  }
});
assert.equal(connectedCapabilities.routes.dashboard, true);
assert.equal(connectedCapabilities.routes.profile, true);
assert.equal(connectedCapabilities.routes.store, true);
assert.equal(connectedCapabilities.routes.marketplace, false, "Undeclared routes must fail closed.");
assert.equal(connectedCapabilities.actions.storePurchase, true);
assert.equal(connectedCapabilities.actions.bankTransfer, false, "Undeclared writes must fail closed.");

const previewCapabilities = resolveCapabilities({ config: { usePreviewData: true }, session: {}, dashboard: {} });
assert.ok(Object.values(previewCapabilities.routes).every(Boolean), "Preview must keep all routes available for visual verification.");
assert.ok(Object.values(previewCapabilities.actions).every(Boolean), "Preview must keep all action boundaries testable.");

const calls = [];
const readModels = {
  session: structuredClone(previewData.session),
  dashboard: structuredClone(previewData.dashboard),
  notifications: [],
  store: structuredClone(previewData.store),
  banking: structuredClone(previewData.banking),
  news: structuredClone(previewData.news)
};
const api = new PlayerApi({
  usePreviewData: false,
  requestTimeoutMs: 1000,
  writeCooldownMs: 300,
  allowedImageHosts: [],
  capabilities: null,
  playerSessionToken: "ps_test",
  gameSessionId: "game_test",
  playerSessionId: "session_test",
  accessToken: "",
  apiCall: async (context) => {
    calls.push(context.endpointKey);
    if (!(context.endpointKey in readModels)) throw Object.assign(new Error("unsupported"), { status: 404 });
    return structuredClone(readModels[context.endpointKey]);
  }
});

await api.bootstrap();
assert.deepEqual(calls, ["session", "dashboard", "notifications"], "Bootstrap must load only shell resources.");
await api.loadRoute("store");
assert.deepEqual(calls.slice(3).sort(), ["banking", "store"], "Store navigation must load only its route resource plan.");
assert.ok(!calls.includes("business") && !calls.includes("marketplace"), "Unvisited systems must not load during bootstrap.");

let newsReads = 0;
const dedupeApi = new PlayerApi({
  usePreviewData: false,
  requestTimeoutMs: 1000,
  writeCooldownMs: 300,
  allowedImageHosts: [],
  playerSessionToken: "ps_test",
  apiCall: async ({ endpointKey }) => {
    if (endpointKey === "news") {
      newsReads += 1;
      await delay(25);
      return structuredClone(previewData.news);
    }
    return structuredClone(readModels[endpointKey]);
  }
});
await Promise.all([dedupeApi.request("news", { force: true }), dedupeApi.request("news", { force: true })]);
assert.equal(newsReads, 1, "Concurrent identical reads must share one in-flight request.");

let releaseOldRead;
let releaseNewRead;
let markOldReadStarted;
let markNewReadStarted;
const oldReadGate = new Promise((resolve) => { releaseOldRead = resolve; });
const newReadGate = new Promise((resolve) => { releaseNewRead = resolve; });
const oldReadStarted = new Promise((resolve) => { markOldReadStarted = resolve; });
const newReadStarted = new Promise((resolve) => { markNewReadStarted = resolve; });
const sessionReadTokens = [];
const sessionRaceApi = new PlayerApi({
  usePreviewData: false,
  requestTimeoutMs: 1000,
  writeCooldownMs: 300,
  allowedImageHosts: [],
  playerSessionToken: "ps_old",
  apiCall: async ({ endpointKey, session, signal }) => {
    assert.equal(endpointKey, "news");
    sessionReadTokens.push(session.playerSessionToken);
    if (session.playerSessionToken === "ps_old") {
      markOldReadStarted();
      await oldReadGate;
      assert.equal(signal.aborted, true, "Replacing the host session must abort old transport work.");
      return { items: [{ id: "old-session-news" }] };
    }
    markNewReadStarted();
    await newReadGate;
    return { items: [{ id: "new-session-news" }] };
  }
});
const oldSessionRead = sessionRaceApi.request("news", { force: true });
await oldReadStarted;
sessionRaceApi.setSession({ playerSessionToken: "ps_new" });
const newSessionRead = sessionRaceApi.request("news", { force: true });
await newReadStarted;
releaseOldRead();
await assert.rejects(oldSessionRead, (error) => error.code === "REQUEST_ABORTED");
assert.equal(sessionRaceApi.inFlightReads.size, 1, "An old completion must not remove the new session's in-flight read.");
releaseNewRead();
const newSessionNews = await newSessionRead;
assert.equal(newSessionNews.items[0].id, "new-session-news");
assert.deepEqual(sessionReadTokens, ["ps_old", "ps_new"]);
assert.equal((await sessionRaceApi.request("news")).items[0].id, "new-session-news", "Only the new session result may remain cached.");

const isolationApi = new PlayerApi({
  usePreviewData: false,
  requestTimeoutMs: 1000,
  writeCooldownMs: 300,
  allowedImageHosts: [],
  playerSessionToken: "ps_test",
  apiCall: async ({ endpointKey }) => {
    if (endpointKey === "business") throw Object.assign(new Error("internal table detail"), { status: 503 });
    if (endpointKey === "news") return structuredClone(previewData.news);
    return structuredClone(readModels[endpointKey]);
  }
});
await assert.rejects(
  isolationApi.loadRoute("business"),
  (error) => error.code === "ROUTE_DATA_UNAVAILABLE" && !error.message.includes("table")
);
const isolatedNews = await isolationApi.loadRoute("news");
assert.equal(isolatedNews.data.news.items.length, previewData.news.items.length, "One route failure must not poison another route.");

const malformedApi = new PlayerApi({
  usePreviewData: false,
  requestTimeoutMs: 1000,
  writeCooldownMs: 300,
  allowedImageHosts: [],
  playerSessionToken: "ps_test",
  apiCall: async () => "not-an-object"
});
await assert.rejects(malformedApi.request("market"), (error) => error.code === "INVALID_RESPONSE");

let writeContext = null;
let storeReads = 0;
const writeApi = new PlayerApi({
  usePreviewData: false,
  requestTimeoutMs: 1000,
  writeCooldownMs: 500,
  allowedImageHosts: [],
  playerSessionToken: "ps_test",
  gameSessionId: "game_test",
  apiCall: async (context) => {
    if (context.endpointKey === "store") {
      storeReads += 1;
      return structuredClone(previewData.store);
    }
    if (context.endpointKey === "storePurchase") {
      writeContext = context;
      await delay(30);
      return { ok: true, purchaseId: "purchase-1" };
    }
    return structuredClone(readModels[context.endpointKey]);
  }
});
await writeApi.request("store");
const firstWrite = writeApi.execute("storePurchase", { storeItemId: "market-lens", quantity: 1 }, {});
const duplicateWrite = writeApi.execute("storePurchase", { storeItemId: "market-lens", quantity: 1 }, {});
assert.equal(firstWrite, duplicateWrite, "Repeated in-flight clicks must resolve through one logical write.");
const writeResult = await firstWrite;
assert.ok(writeContext.idempotencyKey.startsWith("ptr_storePurchase_"), "Critical writes require an idempotency key.");
assert.ok(writeContext.requestId.startsWith("ptr_"), "Every write requires a request ID.");
assert.deepEqual(writeResult.invalidatedResources, WRITE_INVALIDATIONS.storePurchase);
await writeApi.request("store");
assert.equal(storeReads, 2, "A successful purchase must invalidate the Store read cache.");
await assert.rejects(
  writeApi.execute("storePurchase", { storeItemId: "market-lens", quantity: 1 }, {}),
  (error) => error.code === "ACTION_COOLDOWN"
);

let releaseOldWrite;
let markOldWriteStarted;
const oldWriteGate = new Promise((resolve) => { releaseOldWrite = resolve; });
const oldWriteStarted = new Promise((resolve) => { markOldWriteStarted = resolve; });
let sessionStoreReads = 0;
const sessionWriteApi = new PlayerApi({
  usePreviewData: false,
  requestTimeoutMs: 1000,
  writeCooldownMs: 500,
  allowedImageHosts: [],
  playerSessionToken: "ps_old",
  apiCall: async ({ endpointKey, session, signal }) => {
    if (endpointKey === "store") {
      sessionStoreReads += 1;
      return { items: [{ id: session.playerSessionToken }] };
    }
    markOldWriteStarted();
    await oldWriteGate;
    assert.equal(signal.aborted, true, "A session replacement must abort an outstanding write signal.");
    return { ok: true, purchaseId: "old-session-purchase" };
  }
});
await sessionWriteApi.request("store");
const oldSessionWrite = sessionWriteApi.execute("storePurchase", { storeItemId: "market-lens", quantity: 1 }, {});
await oldWriteStarted;
sessionWriteApi.setSession({ playerSessionToken: "ps_new" });
assert.equal((await sessionWriteApi.request("store")).items[0].id, "ps_new");
releaseOldWrite();
await assert.rejects(oldSessionWrite, (error) => error.code === "REQUEST_ABORTED");
assert.equal(sessionWriteApi.writeCompletedAt.size, 0, "An old write must not create a cooldown in the new session.");
assert.equal((await sessionWriteApi.request("store")).items[0].id, "ps_new");
assert.equal(sessionStoreReads, 2, "An old write completion must not invalidate the new session cache.");

let adapterContext = null;
const adapter = new AdapterTransport(async (context) => {
  adapterContext = context;
  return { ok: true };
}, {
  requestTimeoutMs: 1000,
  playerSessionToken: "ps_header",
  gameSessionId: "game_header",
  playerSessionId: "session_header",
  accessToken: ""
});
await adapter.request({ endpointKey: "dashboard", method: "GET", path: "/dashboard", requestId: "ptr_adapter" });
assert.equal(adapterContext.session.playerSessionToken, "ps_header");
assert.equal(adapterContext.requestId, "ptr_adapter");
assert.ok(adapterContext.signal instanceof AbortSignal, "Host adapters must receive a cancellation signal.");

const timeoutAdapter = new AdapterTransport(() => new Promise(() => {}), {
  requestTimeoutMs: 20,
  playerSessionToken: "ps_timeout"
});
await assert.rejects(
  timeoutAdapter.request({ endpointKey: "dashboard", method: "GET", path: "/dashboard", requestId: "ptr_timeout" }),
  (error) => error.code === "REQUEST_TIMEOUT" && error.requestId === "ptr_timeout"
);

const secretAdapter = new AdapterTransport(async () => {
  throw Object.assign(new Error("SQL relation secret_table does not exist"), { status: 500 });
}, { requestTimeoutMs: 1000, playerSessionToken: "ps_safe" });
await assert.rejects(
  secretAdapter.request({ endpointKey: "dashboard", method: "GET", path: "/dashboard", requestId: "ptr_safe" }),
  (error) => error.status === 500 && !error.message.includes("secret_table")
);

const originalFetch = globalThis.fetch;
let capturedFetch = null;
try {
  globalThis.fetch = async (url, options) => {
    capturedFetch = { url, options };
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const http = new HttpTransport({
    apiBaseUrl: "https://api.econovaria.example/player",
    requestTimeoutMs: 1000,
    playerSessionToken: "ps_http",
    gameSessionId: "game_http",
    accessToken: ""
  });
  await http.request({
    endpointKey: "storePurchase",
    method: "POST",
    path: "/store/purchases",
    payload: { storeItemId: "market-lens", quantity: 1 },
    requestId: "ptr_http",
    idempotencyKey: "ptr_storePurchase_http"
  });
  assert.equal(capturedFetch.options.headers["x-econovaria-player-session-token"], "ps_http");
  assert.equal(capturedFetch.options.headers["x-request-id"], "ptr_http");
  assert.equal(capturedFetch.options.headers["idempotency-key"], "ptr_storePurchase_http");

  globalThis.fetch = async () => new Response(
    JSON.stringify({ message: "private database detail" }),
    { status: 429, headers: { "content-type": "application/json", "retry-after": "2" } }
  );
  await assert.rejects(
    http.request({ endpointKey: "market", method: "GET", path: "/market/assets", requestId: "ptr_rate" }),
    (error) => error.status === 429 && error.retryAfterMs === 2000 && !error.message.includes("database")
  );
} finally {
  globalThis.fetch = originalFetch;
}

assert.throws(
  () => normalizeWritePayload("marketOrder", { quantity: "Infinity" }),
  (error) => error.code === "INVALID_REQUEST"
);
assert.throws(
  () => normalizeWritePayload("contractSubmit", { submissionUrl: "javascript:alert(1)" }),
  (error) => error.code === "INVALID_REQUEST"
);
assert.equal(normalizeWritePayload("messageSend", { body: "x".repeat(5000) }).body.length, 4000);

const sanitizedStore = normalizeApiResponse("store", {
  items: [
    { image: "javascript:alert(1)", price: Number.POSITIVE_INFINITY },
    { image: "./assets/store-items/market-lens.svg", price: 10 }
  ]
}, { config: { allowedImageHosts: [] }, requestId: "ptr_schema", path: "/store/items" });
assert.equal(sanitizedStore.items[0].image, "");
assert.equal(sanitizedStore.items[0].price, null);
assert.equal(sanitizedStore.items[1].image, "./assets/store-items/market-lens.svg");

assert.equal("logout" in PLAYER_ENDPOINTS, false, "The terminal must not expose a logout API endpoint.");
assert.deepEqual(ROUTE_RESOURCE_PLAN.profile.required, ["session"]);

const capabilityData = structuredClone(previewData);
capabilityData.capabilities = connectedCapabilities;
const shell = renderShell({
  route: "store",
  data: capabilityData,
  pageHtml: '<section class="player-terminal-page">Store</section>',
  ui: { sidebarCollapsed: false, notificationsOpen: false, mobileMenuOpen: false },
  config: { usePreviewData: false }
});
assert.ok(shell.includes('data-route="store"'));
assert.ok(!shell.includes('data-route="marketplace"'), "Disabled routes must not appear in navigation.");
assert.ok(!shell.includes('data-route="business"'), "Unsupported route groups must be removed from navigation.");

console.log("v7.5 hardening passed: lazy reads, capability gates, fail-closed preview, session isolation, transport controls, safe errors, idempotency, invalidation, and schema guards are valid.");

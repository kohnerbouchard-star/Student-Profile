import assert from "node:assert/strict";
import { test } from "node:test";
import { createResourceFreshnessCoordinator } from "../src/api/resource-freshness-coordinator.js";
import { PlayerApi } from "../src/api/player-api.js";
import { previewData } from "../src/data/preview-data.js";
import { renderNewsPage } from "../src/pages/news-page.js";
import { renderLoansPage } from "../src/pages/loans-page.js";
import { normalizeTerminalBootstrap, mergeTerminalRead } from "../src/api/read-model.js";
import { resolveMessagingBackendRequest } from "../src/api/messaging-backend-routes.js";
import { createStudentProfileApiCall } from "../src/integrations/student-profile-api-call.js";

for (const [route, dependencies] of [["news", ["news", "countries", "market"]], ["loans", ["loans", "banking", "business"]]]) {
  test(`${route} cold entry reads its own dependencies without another route visit`, async () => {
    const calls = [];
    const api = new PlayerApi({ usePreviewData: false, authenticated: true, apiCall: async ({ endpointKey }) => {
      calls.push(endpointKey);
      const value = structuredClone(previewData[endpointKey]);
      if (endpointKey === "business") { value.configured = true; value.company.id = "biz_fixture"; }
      return value;
    }});
    const result = await api.loadRoute(route);
    assert.deepEqual(calls.sort(), [...dependencies].sort());
    for (const key of dependencies) assert.ok(result.data[key], key);
    if (route === "news") assert.match(renderNewsPage({ ...previewData, ...result.data }, {}), /News Terminal/);
    else {
      const loans = structuredClone(result.data.loans);
      loans.offers[0].borrowerType = "business";
      const html = renderLoansPage({ ...previewData, ...result.data, loans }, {});
      assert.match(html, /name="businessKey"/);
      assert.doesNotMatch(html, /Create or recover an active business/);
    }
  });
}
for (const category of ["Missing", "Retired category"]) test(`empty News category ${category} never shows an unrelated detail`, () => {
  const html = renderNewsPage(previewData, { newsCategory: category, newsId: previewData.news.items[0].id });
  assert.match(html, /No stories in this category/);
  for (const item of previewData.news.items) assert.ok(!html.includes(item.title));
  assert.doesNotMatch(html, /PLAYER ANALYSIS|EXPECTED EFFECTS/);
});
test("News stale selection chooses the first story in the selected category", () => {
  const item = previewData.news.items.at(-1);
  const html = renderNewsPage(previewData, { newsCategory: item.category, newsId: "missing" });
  const selected = previewData.news.items.find((entry) => entry.category === item.category);
  assert.ok(html.includes(`<h3>${selected.title}</h3>`));
});
for (const marketFirst of [true, false]) test(`News ticker links survive ${marketFirst ? "Market" : "News"} completing first`, () => {
  let data = normalizeTerminalBootstrap({}, null);
  const news = { items: [{ id: "story", headline: "Ticker story", scope: "ticker", targetKey: "TST" }] };
  const market = { assets: [{ assetId: "public-asset", ticker: "TST", currentPrice: 10 }] };
  for (const key of marketFirst ? ["market", "news"] : ["news", "market"]) data = mergeTerminalRead(data, key, key === "news" ? news : market);
  assert.match(renderNewsPage(data, {}), /data-player-market-link="public-asset"/);
});
const cursor = `2026-11-14T12:30:00.000Z|thr_${"a".repeat(32)}`;
for (const endpointKey of ["messages", "messageSearch"]) test(`${endpointKey} preserves cursor and page limits`, () => {
  const result = resolveMessagingBackendRequest({ endpointKey, payload: { query: "trade & schools", cursor, threadLimit: 7, messageLimit: 11 } });
  const url = new URL(result.path, "https://fixture.invalid");
  assert.equal(url.searchParams.get("cursor"), cursor);
  assert.equal(url.searchParams.get("threadLimit"), "7");
  assert.equal(url.searchParams.get("messageLimit"), "11");
  if (endpointKey === "messageSearch") assert.equal(url.searchParams.get("q"), "trade & schools");
});
test("thread reads preserve the requested message window", () => {
  const result = resolveMessagingBackendRequest({ endpointKey: "messageThread", params: { threadId: `thr_${"b".repeat(32)}` }, payload: { messageLimit: 17 } });
  assert.equal(new URL(result.path, "https://fixture.invalid").searchParams.get("messageLimit"), "17");
});
test("connected search continuation keeps query, cursor, response metadata and cache isolation", async () => {
  const calls = [];
  const api = new PlayerApi({ usePreviewData: false, authenticated: true, apiCall: createStudentProfileApiCall({ request: async (request) => {
    calls.push(request); const url = new URL(request.path, "https://fixture.invalid");
    return { ok: true, data: { query: url.searchParams.get("q"), nextCursor: cursor, unread: 4, pageUnread: 0, threads: [] } };
  }}) });
  for (const payload of [{ query: "trade" }, { query: "trade", cursor }, { q: "school", cursor }]) {
    const result = await api.request("messageSearch", { payload });
    assert.equal(result.query, payload.query || payload.q);
    assert.equal(result.nextCursor, cursor);
    assert.equal(result.unread, 4);
  }
  assert.equal(calls.length, 3);
  assert.equal(new URL(calls[1].path, "https://fixture.invalid").searchParams.get("cursor"), cursor);
});

for (const [route, unavailable] of [["news", "market"], ["news", "countries"], ["loans", "business"]]) test(`${route} remains readable when optional ${unavailable} fails`, async () => {
  const api = new PlayerApi({ usePreviewData: false, authenticated: true, apiCall: async ({ endpointKey }) => {
    if (endpointKey === unavailable) throw Object.assign(new Error("Unavailable"), { status: 503 });
    return structuredClone(previewData[endpointKey]);
  }});
  const result = await api.loadRoute(route);
  assert.ok(result.data[route]);
  assert.equal(result.resourceStatus[unavailable].state, "unavailable");
});
test("same query with reordered properties reuses a completed read", async () => {
  let calls = 0;
  const api = new PlayerApi({ usePreviewData: false, authenticated: true, apiCall: async () => { calls++; return { threads: [] }; } });
  await api.request("messages", { payload: { cursor, threadLimit: 4 } });
  await api.request("messages", { payload: { threadLimit: 4, cursor } });
  assert.equal(calls, 1);
});
test("concurrent different filters stay separate while equal reordered filters coalesce", async () => {
  const resolvers = [];
  const api = new PlayerApi({ usePreviewData: false, authenticated: true, apiCall: ({ payload }) => new Promise((resolve) => resolvers.push(() => resolve({ query: payload.query }))) });
  const first = api.request("messageSearch", { payload: { query: "first", cursor } });
  const same = api.request("messageSearch", { payload: { cursor, query: "first" } });
  const second = api.request("messageSearch", { payload: { query: "second", cursor } });
  await new Promise(setImmediate);
  resolvers.forEach((resolve) => resolve());
  const values = await Promise.all([first, same, second]);
  assert.equal(resolvers.length, 2);
  assert.deepEqual(values.map((value) => value.query), ["first", "first", "second"]);
});
test("session changes cannot reuse the previous session's filtered read", async () => {
  let calls = 0;
  const config = { usePreviewData: false, authenticated: true, gameSessionId: "first", apiCall: async () => ({ count: ++calls }) };
  const api = new PlayerApi(config);
  await api.request("messageSearch", { payload: { query: "school" } });
  api.setSession({ ...config, gameSessionId: "second" });
  assert.equal((await api.request("messageSearch", { payload: { query: "school" } })).count, 2);
});

for (const coordinated of [false, true]) test(`filtered read cache and coalescing with freshness=${coordinated}`, async () => {
  const resolvers = [], calls = [];
  const api = new PlayerApi({ usePreviewData: false, authenticated: true, apiCall: ({ payload }) => {
    calls.push(payload);
    return new Promise((resolve) => resolvers.push(() => resolve({ query: payload.query })));
  }}, { freshness: coordinated ? createResourceFreshnessCoordinator() : null });
  const first = api.request("messageSearch", { payload: { query: "first", cursor } });
  const same = api.request("messageSearch", { payload: { cursor, query: "first" } });
  const other = api.request("messageSearch", { payload: { cursor, query: "other" } });
  await new Promise(setImmediate);
  resolvers.forEach((resolve) => resolve());
  const values = await Promise.all([first, same, other]);
  assert.equal(calls.length, 2);
  assert.deepEqual(values.map((item) => item.query), ["first", "first", "other"]);
  assert.equal((await api.request("messageSearch", { payload: { cursor, query: "first" } })).query, "first");
  assert.equal(calls.length, 2);
});

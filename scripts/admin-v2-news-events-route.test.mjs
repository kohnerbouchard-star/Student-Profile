import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { normalizeNewsEventsReadModel } from "../admin/v2/src/routes/news-events/NewsEventsController.js";
import { createNewsEventsHarness, newsEventsModel } from "./fixtures/admin-news-events-route-harness.mjs";

function ready({ model = newsEventsModel(), status = "ready", ...options } = {}) {
  const h = createNewsEventsHarness();
  const route = h.NewsEventsRoute({ state: { status, data: model }, ...options });
  return { ...h, route, model };
}
function detail(h, index = 0) { return h.tables[0].cells[index].at(-1); }
function recovery(h) { return h.nodes.findLast((node) => node.textContent === "Recover failed publication"); }

test("News & Events public module retains only the original route export", async () => {
  assert.deepEqual(Object.keys(await import("../admin/v2/src/routes/news-events/NewsEventsRoute.js")), ["NewsEventsRoute"]);
});

test("News & Events retained function digests and UUID text guard", () => {
  // Original extraction digests are retained except for the intentional checkpoint visibility change.
  const expected = JSON.parse(readFileSync("scripts/fixtures/admin-news-events-function-hashes.json", "utf8"));
  const directory = "admin/v2/src/routes/news-events", actual = {}; let combined = "";
  for (const file of readdirSync(directory).filter((name) => /^NewsEvents(?:Route|Timeline|Detail|Panels|ViewHelpers)\.js$/.test(name))) {
    const source = readFileSync(`${directory}/${file}`, "utf8"); combined += source;
    for (const match of source.matchAll(/^(?:export )?function (\w+)\(/gm)) {
      const end = match.index + source.slice(match.index).match(/^}$/m).index + 1;
      assert.equal(actual[match[1]], undefined, `Duplicate ${match[1]}`);
      actual[match[1]] = createHash("sha256").update(source.slice(match.index, end).replace(/^export /, "")).digest("hex");
    }
  }
  assert.deepEqual(actual, expected);
  assert.equal(combined.match(/const UUID_IN_TEXT_PATTERN = .*;/g)?.length, 1);
  assert.ok(combined.includes('const UUID_IN_TEXT_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;'));
});

for (const status of ["initial-loading", "failed", "empty", "ready", "refreshing", "stale"]) {
  test(`News & Events ${status} retains accessible route, content and refresh ownership`, async () => {
    const h = createNewsEventsHarness(); let calls = 0;
    const route = h.NewsEventsRoute({ state: { status, data: newsEventsModel(), error: { userMessage: "Unavailable", requestId: "safe-request", retryable: true, retryAfterSeconds: 7 } }, onRefresh: () => { calls += 1; } });
    assert.equal(Object.isFrozen(route), true); assert.deepEqual(Object.keys(route), ["element"]);
    assert.equal(route.element.dataset.newsEventsState, status);
    assert.match(route.element.className, /admin-news-events/);
    const frame = h.frames[0]; assert.equal(frame.options.title, "News & Event Monitor");
    assert.equal(frame.options.actions.attrs.disabled, status === "refreshing");
    await frame.options.actions.dispatch("click"); assert.equal(calls, 1);
    if (status === "initial-loading") assert.equal(frame.options.content.attrs["aria-label"], "Loading News & Events");
    if (status === "failed") {
      assert.equal(frame.options.content.kind, "error"); assert.equal(frame.options.content.options.retryAfterSeconds, 7);
      assert.equal(frame.options.content.options.message, "Unavailable"); await frame.options.content.options.retry.onClick(); assert.equal(calls, 2);
    }
    if (status === "stale") { assert.equal(frame.options.content.kind, "stale"); await frame.options.content.options.retry.onClick(); assert.equal(calls, 2); }
  });
}

test("News & Events missing state defaults to loading and nonretryable errors stay closed", () => {
  const h = createNewsEventsHarness();
  assert.equal(h.NewsEventsRoute().element.dataset.newsEventsState, "initial-loading");
  h.NewsEventsRoute({ state: { status: "failed", error: { retryable: false } } });
  assert.equal(h.frames[1].options.content.options.retry, null);
});

test("News & Events panel/column ordering and descending authoritative timeline remain intact", () => {
  const h = ready(); const panels = h.frames[0].options.content.children;
  assert.deepEqual(panels.map((node) => node.className), ["admin-news-events__summary", "admin-news-events__contract-note", "admin-news-events__schedule", "admin-news-events__timeline"]);
  const table = h.tables[0];
  assert.equal(table.options.caption, "Authoritative world event and news publication timeline");
  assert.deepEqual(table.options.columns.map((c) => c.key), ["type", "title", "status", "scope", "timestamp", "detailAction"]);
  assert.equal(table.options.columns[1].rowHeader, true);
  assert.deepEqual(table.rows.map((row) => row.rowKey), ["news-1", "news-2", "news-3", "event-1"]);
  assert.equal(table.options.rowKey(table.rows[0]), "news-1");
  assert.equal(table.cells[3][1].children[1].textContent, "가상 물류 소식");
  assert.equal(table.cells[0][2].dataset.status, "failed");
  assert.equal(panels[2].attrs["aria-labelledby"], "admin-news-events-schedule");
  assert.equal(panels[3].attrs["aria-labelledby"], "admin-news-events-timeline");
});

test("News & Events empty data preserves schedule/timeline absence without invented entries", () => {
  const model = newsEventsModel(); model.events = []; model.news = []; model.checkpoints = [];
  const h = ready({ model, status: "empty" }); const panels = h.frames[0].options.content.children;
  assert.equal(panels[2].children.at(-1).options.title, "No campaign checkpoint exposed");
  assert.equal(panels[3].children.at(-1).options.title, "No authoritative news or events yet");
  assert.deepEqual(h.tables[0].rows, []);
});

const CHECKPOINT_AT = "2026-11-11T01:00:00.000Z";
const CHECKPOINT_TIME = Date.parse(CHECKPOINT_AT);
const activeCheckpoint = { status: "active", current_phase: "shortage", scheduled_at: CHECKPOINT_AT };

function monitorSnapshot({ due, now = CHECKPOINT_TIME, campaigns = [activeCheckpoint], history = [], effects = [], campaignFailed = false } = {}) {
  const fulfilled = (data) => ({ status: "fulfilled", value: { data } });
  return normalizeNewsEventsReadModel({ panels: {
    campaign: campaignFailed ? { status: "rejected", reason: new Error("Campaign unavailable") } : fulfilled({ campaigns, scheduler: { due } }),
    history: fulfilled({ history }),
    effects: fulfilled({ effects }),
  } }, now).model;
}

for (const [offset, due] of [[-1, 0], [0, 1], [1, 1]]) {
  test(`News & Events mounts the stored active checkpoint at schedule boundary ${offset} ms`, () => {
    const model = monitorSnapshot({ due, now: CHECKPOINT_TIME + offset });
    const h = ready({ model, status: model.isEmpty ? "empty" : "ready" });
    const times = h.nodes.filter((node) => node.tag === "time");
    assert.deepEqual(times.map((node) => node.attrs.datetime), [CHECKPOINT_AT]);
    assert.equal(h.route.element.dataset.newsEventsState, "ready");
    const schedule = h.frames[0].options.content.children[2];
    assert.equal(schedule.children.at(-1).children.length, 1);
    assert.equal(schedule.children.at(-1).children[0].children[0].children[1].textContent, "Active");
    assert.equal(h.nodes.find((node) => node.dataset.newsEventsDue === "count")?.textContent, String(due));
    assert.equal(model.summary.upcomingCount, offset < 0 ? 1 : 0);
    assert.deepEqual(h.tables[0].rows, []);
  });
}

test("News & Events mounted scheduler separates a bounded count from rows and authoritative outcome history", () => {
  const campaigns = [
    activeCheckpoint,
    { ...activeCheckpoint, current_phase: "adaptation", scheduled_at: "2026-11-12T01:00:00.000Z" },
    ...["paused", "emergency_disabled", "completed"].map((status) => ({ ...activeCheckpoint, status })),
    { ...activeCheckpoint, scheduled_at: null },
  ];
  const model = monitorSnapshot({
    due: 1, campaigns,
    history: [{ event_key: "shortage.executed", to_phase: "shortage", occurred_at: CHECKPOINT_AT }],
    effects: [{ effect_kind: "publish_news", status: "failed", payload: { newsDefinitionId: "news.shortage" }, created_at: CHECKPOINT_AT }],
  });
  const h = ready({ model });
  const checkpointRows = h.nodes.find((node) => node.className === "admin-news-events__schedule-list").children;
  assert.deepEqual(checkpointRows.map((row) => row.children[0].children[1].textContent), ["Active", "Active", "Paused", "Emergency disabled", "Completed"]);
  assert.equal(h.nodes.find((node) => node.dataset.newsEventsDue === "count")?.textContent, "1");
  assert.deepEqual(h.tables[0].rows.map(({ kind, lifecycle }) => [kind, lifecycle]).sort(), [["event", "past"], ["news", "failed"]]);
  assert.equal(model.summary.failedCount, 1);
});

test("News & Events shows missing or invalid scheduler counts as unknown, never explicit zero", () => {
  for (const value of [undefined, null, false, "0", -1, 0.5, Number.NaN, 2]) {
    const h = ready({ model: monitorSnapshot({ due: value }) });
    assert.equal(h.nodes.find((node) => node.dataset.newsEventsDue === "count")?.textContent, "Not available");
  }
  const stale = ready({ model: monitorSnapshot({ due: 1 }), status: "stale" });
  assert.equal(stale.frames[0].options.content.kind, "stale");
  assert.match(stale.frames[0].options.content.options.message, /most recently resolved/);
  assert.equal(stale.nodes.find((node) => node.dataset.newsEventsDue === "count")?.textContent, "1");
  const zero = ready({ model: monitorSnapshot({ due: 0 }) });
  assert.equal(zero.nodes.find((node) => node.dataset.newsEventsDue === "count")?.textContent, "0");
  for (const options of [{ campaignFailed: true }, { campaigns: {} }]) {
    const h = ready({ model: monitorSnapshot({ ...options, due: 0 }) });
    assert.equal(h.nodes.find((node) => node.dataset.newsEventsDue === "count")?.textContent, "Not available");
    assert.equal(h.frames[0].options.content.children[2].children[0].options.title, "Campaign schedule status is unavailable");
    assert.deepEqual(h.tables[0].rows, []);
  }
});

test("News & Events initial filter normalization is silent and scope options deduplicate", () => {
  const calls = []; const h = ready({ filters: { query: "  NEWS  ", type: "news", status: "all", scope: "missing" }, onFiltersChange: (value) => calls.push(value) });
  assert.deepEqual(calls, []); assert.equal(h.fields.get("news-events-search").value, "NEWS");
  assert.equal(h.fields.get("news-events-scope").value, "all");
  assert.deepEqual(h.fields.get("news-events-scope").options.options.map((option) => option.value), ["all", "affected_locations", "all_players", "shortage"]);
  assert.equal(h.tables[0].rows.length, 3);
});

for (const [field, value, expected] of [["search", "  ＬＯＧＩＳＴＩＣＳ  ", ["event-1"]], ["type", "event", ["event-1"]], ["status", "failed", ["news-1"]], ["scope", "affected_locations", ["news-3"]]]) {
  test(`News & Events ${field} filtering preserves normalization and frozen callback`, async () => {
    const calls = []; const h = ready({ onFiltersChange: (value) => calls.push(value) });
    h.fields.get(`news-events-${field}`).value = value;
    await h.fields.get(`news-events-${field}`).control.dispatch(field === "search" ? "input" : "change");
    assert.deepEqual(h.tables[0].rows.map((row) => row.rowKey), expected);
    assert.equal(calls.length, 1); assert.equal(Object.isFrozen(calls[0]), true);
    assert.equal(calls[0][field === "search" ? "query" : field], field === "search" ? value.trimStart() : value);
  });
}

test("News & Events partial feed errors preserve safe detail, retry policy and ordering", async () => {
  const model = newsEventsModel(); let calls = 0;
  model.panels = { history: { status: "failed", error: { userMessage: "History unavailable", retryable: true, retryAfterSeconds: 8 } }, effects: { status: "failed", error: { retryable: false } }, campaign: { status: "failed", error: { retryable: true } } };
  const h = ready({ model, onRefresh: () => { calls += 1; } });
  const warnings = h.frames[0].options.content.children[2].children;
  assert.deepEqual(warnings.map((node) => node.options.title), ["World event history is unavailable", "News publication status is unavailable", "Campaign schedule status is unavailable"]);
  assert.equal(warnings[0].options.retryAfterSeconds, 8); assert.equal(warnings[1].options.retry, null);
  await warnings[0].options.retry.onClick(); await warnings[2].options.retry.onClick(); assert.equal(calls, 2);
});

test("News & Events event and publication detail preserve opener and close cleanup", async () => {
  const h = ready();
  await detail(h, 3).dispatch("click");
  assert.equal(h.drawers[0].options.title, "World event detail"); assert.strictEqual(h.drawers[0].opens[0], detail(h, 3));
  assert.equal(h.drawers[0].options.content.children[1].children[5].children[1].textContent, "가상 물류 소식");
  assert.equal(recovery(h), undefined); h.drawers[0].close(); assert.equal(h.drawers[0].destroyed, 1);
  await detail(h, 1).dispatch("click"); assert.equal(h.drawers[1].options.title, "News publication detail");
  assert.match(h.drawers[1].options.content.children[1].children[1].children[1].textContent, /does not expose the rendered headline/);
  assert.equal(recovery(h), undefined);
});

test("News & Events private UUID-bearing text is suppressed in display and detail", async () => {
  const model = newsEventsModel(); const privateId = "10000000-0000-4000-8000-000000000001";
  model.news[0].newsDefinitionId = privateId; model.events[0].reason = privateId;
  const h = ready({ model });
  assert.equal(h.tables[0].cells[0][1].children[0].textContent, "Record unavailable");
  assert.equal(h.tables[0].cells[3][1].children[1].textContent, "No additional detail exposed");
  await detail(h).dispatch("click");
  assert.equal(h.drawers[0].options.description, "News publication");
  assert.equal(h.drawers[0].options.content.children[1].children[0].children[1].textContent, "Not available");
});

test("News & Events recovery validates reason before controller action", async () => {
  const calls = []; const h = ready({ onRecover: (...args) => calls.push(args) }); await detail(h).dispatch("click");
  const field = h.fields.get("news-recovery-reason-news-1");
  assert.equal(field.control.minLength, 12); assert.equal(field.control.maxLength, 1000); assert.equal(field.control.rows, 5);
  field.value = "too short"; await recovery(h).dispatch("click");
  assert.match(field.error, /at least 12/); assert.equal(field.focused, 1); assert.deepEqual(calls, []);
});

for (const succeeded of [false, true]) {
  test(`News & Events recovery ${succeeded ? "success closes" : "failure retains"} the originating drawer`, async () => {
    let resolve; const pending = new Promise((yes) => { resolve = yes; }); const calls = [];
    const h = ready({ onRecover: (...args) => { calls.push(args); return pending; } }); await detail(h).dispatch("click");
    h.fields.get("news-recovery-reason-news-1").value = "  Synthetic recovery reason  ";
    const result = recovery(h).dispatch("click"); assert.equal(recovery(h).disabled, true);
    assert.deepEqual(calls, [["news-1", "Synthetic recovery reason"]]);
    resolve(succeeded); await result;
    assert.equal(h.drawers[0].closed, succeeded ? 1 : 0); assert.equal(h.drawers[0].destroyed, succeeded ? 1 : 0);
    if (!succeeded) assert.equal(recovery(h).disabled, false);
  });
}

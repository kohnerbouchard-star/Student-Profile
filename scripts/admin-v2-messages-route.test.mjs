import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { createMessagesRouteHarness } from "./fixtures/admin-messages-route-harness.mjs";

function model() {
  return {
    isEmpty: false,
    summary: { returned: 1, active: 1, restricted: 0, hiddenMessages: 0 },
    pagination: { offset: 0, limit: 25, returned: 1, hasMore: false },
    threads: [{
      id: "thr_synthetic", title: "가상 대화", type: "player_thread", status: "active",
      createdAt: "2026-11-10T01:00:00Z", updatedAt: "invalid", retentionUntil: "2026-12-01T01:00:00Z",
      expired: false, allowPlayerReplies: true, contractKey: "", moderationReason: "",
      participants: [{ displayName: "가상 학생", rosterLabel: "Class A", reference: "PUBLIC-1" }],
      messages: [{ id: "msg_synthetic", senderName: "Sample Sender", senderType: "player", body: "Synthetic message", hidden: false, hiddenReason: "", createdAt: "2026-11-10T01:00:00Z" }],
    }],
  };
}
function ready({ data = model(), status = "ready", ...options } = {}) {
  const h = createMessagesRouteHarness();
  const route = h.MessagesRoute({ state: { status, data }, ...options });
  return { ...h, route, data };
}
const nodesWith = (h, suffix) => h.nodes.filter((node) => node.className === `admin-messages-route__${suffix}`);
const text = (node) => typeof node === "string" ? node : [node?.textContent || "", ...(node?.children || []).map(text)].join("");

test("Messages preserves its sole public route export", async () => {
  assert.deepEqual(Object.keys(await import("../admin/v2/src/routes/messages/MessagesRoute.js")), ["MessagesRoute"]);
});

test("Messages read-panel extraction preserves every complete original function", () => {
  // Recorded before extraction from unchanged main b77c9610.
  const expected = JSON.parse(readFileSync("scripts/fixtures/admin-messages-function-hashes.json", "utf8"));
  const directory = "admin/v2/src/routes/messages", actual = {};
  for (const file of readdirSync(directory).filter((name) => /^Messages(?:Route|ReadPanels)\.js$/.test(name))) {
    const source = readFileSync(`${directory}/${file}`, "utf8");
    for (const match of source.matchAll(/^(?:export )?function (\w+)\(/gm)) {
      const end = match.index + source.slice(match.index).match(/^}$/m).index + 1;
      assert.equal(actual[match[1]], undefined, `Duplicate ${match[1]}`);
      actual[match[1]] = createHash("sha256").update(source.slice(match.index, end).replace(/^export /, "")).digest("hex");
    }
  }
  assert.deepEqual(actual, expected);
});

for (const status of ["initial-loading", "failed", "empty", "ready", "refreshing", "stale"]) {
  test(`Messages ${status} retains markup, accessible state and retry`, async () => {
    const h = createMessagesRouteHarness(), data = model(); let refreshes = 0;
    if (status === "empty") { data.isEmpty = true; data.threads = []; }
    const route = h.MessagesRoute({ state: { status, data, error: { userMessage: "Unavailable", requestId: "safe-request", retryAfterSeconds: 7, retryable: true } }, onRefresh: () => { refreshes += 1; } });
    const frame = h.frames[0], content = frame.options.content;
    assert.equal(frame.options.title, "Messages Moderation");
    assert.equal(content.dataset.adminV2State, status);
    assert.equal(content.attrs["aria-busy"], ["initial-loading", "refreshing"].includes(status));
    assert.equal(frame.options.actions[0].disabled, status === "refreshing");
    await frame.options.actions[0].dispatch("click"); assert.equal(refreshes, 1);
    if (status === "initial-loading") assert.equal(content.children[0].className, "admin-messages-route__loading-layout");
    if (status === "failed") {
      assert.equal(content.children[0].kind, "error");
      assert.equal(content.children[0].options.requestId, "safe-request");
      assert.equal(content.children[0].options.retryAfterSeconds, 7);
      await content.children[0].options.retry.onClick(); assert.equal(refreshes, 2);
    }
    if (status === "empty") assert.equal(nodesWith(h, "thread-list")[0].children[0].options.title, "No messages yet");
    if (status === "refreshing") assert.equal(content.children[0].attrs.role, "status");
    if (status === "stale") {
      assert.equal(content.children[0].kind, "stale");
      await content.children[0].options.retry.onClick(); assert.equal(refreshes, 2);
    }
    route.destroy(); route.destroy(); assert.equal(h.confirmations.length, 0);
  });
}

test("Messages non-retryable failure has no retry action", () => {
  const h = createMessagesRouteHarness(); h.MessagesRoute({ state: { status: "failed", error: { retryable: false } } });
  assert.equal(h.frames[0].options.content.children[0].options.retry, null);
});

test("Messages read presentation preserves summary, status, time and Unicode", () => {
  const data = model(); data.threads[0].contractKey = "PUBLIC-CONTRACT"; data.threads[0].moderationReason = "Synthetic review";
  const h = ready({ data }), resolved = nodesWith(h, "resolved")[0];
  assert.deepEqual(resolved.children.map((node) => node.className), ["summary", "controls", "thread-list", "pagination"].map((name) => `admin-messages-route__${name}`));
  const summary = resolved.children[0]; assert.equal(summary.attrs["aria-label"], "Messages moderation summary");
  assert.deepEqual(summary.children.map((node) => node.children[0].textContent), ["Returned", "Active", "Restricted", "Hidden messages"]);
  assert.deepEqual(summary.children.map((node) => node.children[1].textContent), ["1", "1", "0", "0"]);
  assert.equal(nodesWith(h, "status")[0].dataset.status, "active");
  assert.equal(text(nodesWith(h, "participants")[0]), "1 participant가상 학생 · Class A");
  const metadata = nodesWith(h, "metadata")[0];
  assert.deepEqual(metadata.children.map((node) => node.children[0].textContent), ["Created", "Updated", "Retention", "Replies"]);
  assert.equal(metadata.children[0].children[1].textContent, new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(data.threads[0].createdAt)));
  assert.equal(metadata.children[1].children[1].textContent, "Time unavailable");
  assert.equal(nodesWith(h, "type")[0].textContent, "Player Thread");
  assert.equal(text(nodesWith(h, "contract")[0]), "Contract contextPUBLIC-CONTRACT");
  assert.equal(nodesWith(h, "thread-list")[0].attrs["aria-label"], "Message conversations");
  assert.equal(nodesWith(h, "pagination")[0].attrs["aria-label"], "Messages pages");
});

test("Messages participant labels retain six-label limit, reference fallback and duplicates", () => {
  const data = model(); data.threads[0].participants = [
    { displayName: "Same", rosterLabel: "Same", reference: "PUBLIC-1" },
    { displayName: "Second", rosterLabel: "", reference: "PUBLIC-2" },
    ...Array.from({ length: 6 }, (_, index) => ({ displayName: `Sample ${index}`, reference: "", rosterLabel: "" })),
  ];
  const h = ready({ data });
  assert.equal(text(nodesWith(h, "participants")[0]), "8 participantsSame · Second · PUBLIC-2 · Sample 0 · Sample 1 · Sample 2 · Sample 3 · +2 more");
});

test("Messages fallback labels, bodies, times and empty conversations remain explicit", () => {
  const data = model(), thread = data.threads[0]; thread.status = ""; thread.type = ""; thread.participants = []; thread.allowPlayerReplies = false;
  thread.messages[0] = { ...thread.messages[0], body: "", hidden: true, createdAt: "", senderType: "", hiddenReason: "" };
  const h = ready({ data });
  assert.equal(nodesWith(h, "status")[0].dataset.status, "unknown");
  assert.equal(nodesWith(h, "status")[0].textContent, "Not available");
  assert.equal(text(nodesWith(h, "participants")[0]), "0 participantsNo visible participant labels");
  assert.equal(nodesWith(h, "body")[0].textContent, "Message body unavailable.");
  assert.equal(text(nodesWith(h, "moderation-note")[0]), "This message is hidden by moderation.");
  assert.equal(h.nodes.find((node) => node.tag === "time").attrs.datetime, null);
  thread.messages = []; const empty = ready({ data });
  assert.equal(nodesWith(empty, "message-list")[0].children[0].options.title, "No messages in this conversation");
});

test("Messages filters preserve button, Enter and clear callback payloads", async () => {
  const calls = [], h = ready({ filters: { query: "original", status: "disabled" }, onApplyFilters: (value) => calls.push(value) });
  const search = h.fields.get("messagesSearch"), status = h.fields.get("messagesStatus");
  assert.equal(search.control.maxLength, 100); assert.equal(search.options.autocomplete, "off");
  assert.deepEqual(status.options.options.map((option) => option.value), ["all", "active", "disabled", "closed"]);
  search.value = "new query"; status.value = "closed";
  await h.button("Apply filters").dispatch("click");
  let prevented = false;
  await search.control.dispatch("keydown", { key: "Escape" }); assert.equal(calls.length, 1);
  await search.control.dispatch("keydown", { key: "Enter", preventDefault() { prevented = true; } });
  await h.button("Clear filters").dispatch("click");
  assert.equal(prevented, true);
  assert.deepEqual(calls, [{ query: "new query", status: "closed" }, { query: "new query", status: "closed" }, { query: "", status: "all" }]);
});

test("Messages pagination preserves page bounds, disabled attributes and offsets", async () => {
  const data = model(); data.pagination = { offset: 25, limit: 25, returned: 10, hasMore: true };
  const calls = [], h = ready({ data, onPage: (offset) => calls.push(offset) });
  assert.equal(nodesWith(h, "pagination")[0].children[1].textContent, "26–35");
  assert.equal(h.button("Previous").disabled, false); assert.equal(h.button("Next").disabled, false);
  await h.button("Previous").dispatch("click"); await h.button("Next").dispatch("click"); assert.deepEqual(calls, [0, 50]);
  const first = ready(); assert.equal(first.button("Previous").disabled, true); assert.equal(first.button("Next").disabled, true);
});

test("Messages filtered empty state retains its distinct explanation", () => {
  const data = model(); data.isEmpty = true; data.threads = []; data.pagination.returned = 0;
  const h = ready({ data, filters: { query: "missing", status: "all" } });
  assert.equal(nodesWith(h, "thread-list")[0].children[0].options.title, "No conversations match");
  assert.equal(nodesWith(h, "pagination")[0].children[1].textContent, "0–0");
});

for (const scenario of [
  { label: "Disable conversation", action: "disable", kind: "thread", required: true, reasonLabel: "Conversation moderation reason" },
  { label: "Enable conversation", action: "enable", kind: "thread", required: false, status: "disabled" },
  { label: "Close conversation", action: "close", kind: "thread", required: true, reasonLabel: "Conversation close reason" },
  { label: "Hide message", action: "hide", kind: "message", required: true, reasonLabel: "Message moderation reason" },
  { label: "Restore message", action: "unhide", kind: "message", required: false, hidden: true },
  { label: "Delete expired content", action: "delete", kind: "retention", required: true, expired: true, reasonLabel: "Retention deletion reason" },
]) {
  test(`Messages ${scenario.label} preserves explicit confirmation and callback identity`, async () => {
    const data = model(), thread = data.threads[0], message = thread.messages[0], calls = [];
    thread.status = scenario.status || "active"; thread.expired = Boolean(scenario.expired); message.hidden = Boolean(scenario.hidden);
    const h = ready({ data,
      onModerateThread: (...args) => { calls.push(["thread", ...args]); return { ok: true }; },
      onModerateMessage: (...args) => { calls.push(["message", ...args]); return { ok: true }; },
      onDeleteExpiredThread: (...args) => { calls.push(["retention", ...args]); return { ok: true }; },
    });
    const opener = h.button(scenario.label); await opener.dispatch("click"); assert.equal(calls.length, 0);
    const dialog = h.confirmations[0]; assert.strictEqual(dialog.opens[0], opener);
    assert.equal(dialog.tone, scenario.required ? "danger" : "neutral");
    if (scenario.required) {
      const reason = h.fields.get("moderationReason"); assert.equal(reason.options.label, scenario.reasonLabel);
      assert.equal(reason.control.maxLength, 1000); assert.equal(reason.control.rows, 2);
      reason.value = "   "; assert.equal(await dialog.options.onConfirm(), false); assert.equal(calls.length, 0);
      assert.equal(reason.focused, 1); assert.equal(reason.error, "Enter a specific reason for this moderation action.");
      reason.value = "  Synthetic policy reason  ";
    } else { assert.equal(dialog.content, null); assert.equal(h.fields.has("moderationReason"), false); }
    assert.equal(await dialog.options.onConfirm(), true);
    const reason = scenario.required ? "Synthetic policy reason" : "";
    const expected = scenario.kind === "message" ? ["message", thread, message, scenario.action, reason]
      : scenario.kind === "retention" ? ["retention", thread, reason] : ["thread", thread, scenario.action, reason];
    assert.deepEqual(calls, [expected]); assert.strictEqual(calls[0][1], thread);
    if (scenario.kind === "message") assert.strictEqual(calls[0][2], message);
    dialog.settle(true); await Promise.resolve(); assert.equal(dialog.content, null);
    assert.equal(await dialog.options.onConfirm(), false);
    h.route.destroy(); h.route.destroy(); assert.equal(dialog.destroyed, 1);
  });
}

test("Messages closed and unexpired threads offer no status or retention action", () => {
  const data = model(); data.threads[0].status = "closed";
  const h = ready({ data });
  for (const label of ["Disable conversation", "Enable conversation", "Close conversation", "Delete expired content"]) assert.equal(h.button(label), undefined);
});

test("Messages failure does not claim success and cancellation clears pending action before reuse", async () => {
  let calls = 0;
  const h = ready({ onModerateThread: () => { calls += 1; return { ok: false }; } });
  await h.button("Disable conversation").dispatch("click");
  const dialog = h.confirmations[0]; h.fields.get("moderationReason").value = "Synthetic reason";
  await assert.rejects(dialog.options.onConfirm(), /MESSAGES_MODERATION_FAILED/); assert.equal(calls, 1);
  dialog.settle(false); await Promise.resolve(); assert.equal(dialog.content, null); assert.equal(await dialog.options.onConfirm(), false);
  await h.button("Close conversation").dispatch("click"); assert.equal(h.confirmations.length, 1); assert.equal(dialog.opens.length, 2);
  h.route.destroy(); await Promise.resolve(); assert.equal(await dialog.options.onConfirm(), false); assert.equal(calls, 1);
});

import test from "node:test";
import assert from "node:assert/strict";
import { createMessagesAdminClient } from "../admin/v2/src/routes/messages/MessagesApi.js";
import { normalizeMessagesPolicy } from "../admin/v2/src/routes/messages/MessagesPolicyPanel.js";
import { createMessagesRouteHarness } from "./fixtures/admin-messages-route-harness.mjs";
const gameId = "10000000-0000-4000-8000-000000000001";
const payload = { data: { policy: { playerThreadsEnabled: true, defaultRetentionDays: 365, maxParticipants: 2, attachmentsEnabled: false } } };
function panel(options = {}) {
  const h = createMessagesRouteHarness();
  const calls = [];
  const api = { readPolicy: async (args) => { calls.push(["read", args]); return payload; },
    updatePolicy: async (args) => { calls.push(["write", args]); return payload; }, ...options.api };
  const view = h.createPolicyPanel({ api, gameId, hasPermission: options.hasPermission || (() => true) });
  return { ...h, calls, view, form: h.nodes.find(n => n.tag === "form") };
}
function draft(h, days = "30") {
  h.fields.get("defaultRetentionDays").value = days;
  h.fields.get("playerThreadsEnabled").value = "false";
}
test("policy adapter sends only bounded settings to same-origin game BFF", async () => {
  const calls = [];
  const api = createMessagesAdminClient({ fetchImpl: async (...args) => { calls.push(args); return new Response(JSON.stringify(payload)); } });
  await api.readPolicy({ gameId });
  await api.updatePolicy({ gameId, policy: { playerThreadsEnabled: false, defaultRetentionDays: 30, privateId: "discard" } });
  assert.equal(calls[0][0], `/api/admin/games/${gameId}/messages/policy`);
  assert.equal(calls[1][1].credentials, "include");
  assert.deepEqual(JSON.parse(calls[1][1].body), { playerThreadsEnabled: false, defaultRetentionDays: 30 });
  for (const days of [0, 731, 1.5, "30", NaN]) await assert.rejects(api.updatePolicy({ gameId, policy: { playerThreadsEnabled: true, defaultRetentionDays: days } }));
  assert.equal(calls.length, 2);
});
test("policy projection fails closed and discards unknown fields", () => {
  assert.deepEqual(Object.keys(normalizeMessagesPolicy(payload)), ["playerThreadsEnabled", "defaultRetentionDays", "maxParticipants"]);
  for (const patch of [{ playerThreadsEnabled: "true" }, { attachmentsEnabled: true }, { defaultRetentionDays: 0 }, { defaultRetentionDays: 731 }, { maxParticipants: 1 }]) {
    assert.throws(() => normalizeMessagesPolicy({ data: { policy: { ...payload.data.policy, ...patch } } }));
  }
});
test("policy cannot load without moderation permission", async () => {
  const h = panel({ hasPermission: () => false }); await h.view.load(); assert.equal(h.calls.length, 0); h.view.destroy();
});
test("retention copy identifies future Player conversations and distinguishes expiry from deletion", async () => {
  const h = panel();
  const help = () => h.form.children.find((node) => node.textContent.includes("Attachments remain disabled")).textContent;
  const checkHelp = () => {
    assert.match(help(), /default expiry for new Player-created conversations in this game/);
    assert.match(help(), /existing expiry dates or the expiry used for teacher-created conversations/);
    assert.match(help(), /Expiry limits Player access; it does not by itself delete messages/);
  };
  assert.equal(h.fields.get("defaultRetentionDays").options.label, "Default retention for new Player conversations (days)");
  checkHelp();
  await h.view.load();
  checkHelp();
  draft(h);
  const submitting = h.form.dispatch("submit");
  const review = h.confirmations[0];
  assert.match(review.options.message, /Default retention for new Player-created conversations: 30 days/);
  assert.match(review.options.detail, /selected game/);
  assert.match(review.options.detail, /Existing expiry dates and teacher-created conversation expiry are unchanged/);
  assert.equal(await review.options.onConfirm(), true);
  checkHelp();
  assert.equal(h.nodes.find((node) => node.attrs.role === "status").textContent, "Messaging policy saved.");
  review.settle(true);
  await submitting;
  assert.equal(h.calls.length, 2);
  h.view.destroy();
});
test("policy requires loaded authoritative settings, valid days and explicit confirmation", async () => {
  const h = panel(); await h.form.dispatch("submit"); assert.equal(h.confirmations.length, 0);
  await h.view.load(); draft(h, ""); await h.form.dispatch("submit"); assert.equal(h.confirmations.length, 0);
  draft(h); const submitting = h.form.dispatch("submit"); assert.equal(h.calls.length, 1);
  await h.form.dispatch("submit"); assert.equal(h.confirmations.length, 1);
  await h.confirmations[0].options.onConfirm();
  assert.deepEqual(h.calls[1][1].policy, { playerThreadsEnabled: false, defaultRetentionDays: 30 });
  h.confirmations[0].settle(true); await submitting; h.view.destroy();
});
test("canceling policy review sends no mutation", async () => {
  const h = panel(); await h.view.load(); draft(h); const submitting = h.form.dispatch("submit");
  h.confirmations[0].settle(false); await submitting; assert.equal(h.calls.length, 1); h.view.destroy();
});
test("route exit aborts policy request and ignores its late result", async () => {
  let resolve, signal;
  const h = panel({ api: { readPolicy: args => { signal = args.signal; return new Promise(r => { resolve = r; }); } } });
  const loading = h.view.load(); h.view.destroy(); assert.equal(signal.aborted, true); resolve(payload); await loading;
  assert.equal(h.fields.get("defaultRetentionDays").control.value, "");
});
test("revoked permission at confirmation prevents policy mutation", async () => {
  let allowed = true; const h = panel({ hasPermission: () => allowed }); await h.view.load(); draft(h);
  const submitting = h.form.dispatch("submit"); allowed = false;
  assert.equal(await h.confirmations[0].options.onConfirm(), false); assert.equal(h.calls.length, 1);
  h.view.destroy(); await submitting;
});
test("failed load never enables default-value writes", async () => {
  const h = panel({ api: { readPolicy: async () => { throw new Error("private detail"); } } });
  await h.view.load(); draft(h); await h.form.dispatch("submit"); assert.equal(h.confirmations.length, 0);
  assert.ok(!JSON.stringify(h.nodes.map(n => n.textContent)).includes("private detail")); h.view.destroy();
});

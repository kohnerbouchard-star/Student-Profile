import assert from "node:assert/strict";
import test from "node:test";
import { createInventoryRouteHarness } from "./fixtures/admin-inventory-route-harness.mjs";
const row = { rowKey: "public-row", status: "pending", quantity: 2, requestNote: "Synthetic request",
  player: { displayName: "Sample", reference: "P-1", rosterLabel: "A" }, item: { name: "Reward" } };
function fixture({ status = "pending", onReview = async () => ({ outcome: "committed" }), onReviewCommitted = () => {} } = {}) {
  const h = createInventoryRouteHarness();
  const view = h.InventoryRoute({ state: { status: "loaded", data: {
    summary: { pending: 1, approved: 0, rejected: 0, fulfilled: 0 }, contract: {},
    redemptions: [{ ...row, status }], pagination: { offset: 0, returned: 1, hasMore: false },
  } }, filters: { query: "", status: "all" }, onReview, onReviewCommitted,
    onQueryChange() {}, onStatusChange() {}, onPage() {}, onRefresh() {} });
  return { ...h, view,
    async open(action) { const button = h.button(action); await button.dispatch("click"); return h.dialogs.at(-1); },
    form() { return h.nodes.filter((n) => n.tag === "form").at(-1); },
    status() { return h.nodes.filter((n) => n.className === "admin-inventory-route__review-status").at(-1); },
  };
}
for (const [status, actions] of [["pending", ["approve", "reject"]], ["approved", ["fulfill"]], ["rejected", []], ["fulfilled", []]]) {
  test(`${status} exposes only its existing review actions`, () => {
    const f = fixture({ status });
    assert.deepEqual(f.nodes.filter((n) => n.dataset.inventoryAction).map((n) => n.dataset.inventoryAction), actions);
  });
}
test("reject requires trimmed reason before invoking review", async () => {
  let calls = 0; const f = fixture({ onReview: async () => { calls++; } }); const dialog = await f.open("reject");
  const note = f.fields.get("note"); note.setValue("  "); await f.form().dispatch("submit");
  assert.equal(calls, 0); assert.equal(note.error, "A rejection reason is required."); assert.equal(note.focused, 1);
  assert.equal(note.options.required, true); assert.equal(note.control.maxLength, 1000); assert.equal(note.control.rows, 5);
  assert.equal(dialog.options.closeOnBackdrop, false); assert.equal(dialog.options.initialFocus(), note.control);
});
for (const action of ["approve", "reject", "fulfill"]) test(`${action} preserves pending lock, public payload and committed recovery ordering`, async () => {
  const events = []; let resolve; const result = { outcome: "replayed" };
  const f = fixture({ status: action === "fulfill" ? "approved" : "pending",
    onReview: (payload) => { events.push(payload); return new Promise((done) => { resolve = done; }); },
    onReviewCommitted: (value) => { assert.deepEqual(f.dialogs[0].closes, ["committed"]); events.push(value); } });
  const opener = f.button(action); const dialog = await f.open(action); const note = f.fields.get("note"); note.setValue("  reviewed  ");
  const pending = f.form().dispatch("submit");
  assert.deepEqual(dialog.opens, [opener]); assert.deepEqual(dialog.busy, [true]); assert.equal(note.control.disabled, true);
  assert.deepEqual(events, [{ rowKey: "public-row", action, note: "reviewed" }]);
  resolve(result); await pending; await Promise.resolve();
  assert.deepEqual(events[1], result); assert.equal(dialog.destroyed, 1);
});
for (const userMessage of ["Server says unavailable", undefined]) test(`failure preserves note and enables retry: ${userMessage}`, async () => {
  let calls = 0; const f = fixture({ onReview: async () => { calls++; throw { userMessage }; } });
  const dialog = await f.open("approve"); const note = f.fields.get("note"); note.setValue("Keep me");
  await f.form().dispatch("submit");
  assert.deepEqual(dialog.busy, [true, false]); assert.equal(note.control.disabled, false); assert.equal(note.getValue(), "Keep me");
  assert.equal(f.status().dataset.tone, "error");
  assert.equal(f.status().textContent, userMessage || "The inventory redemption action could not be completed.");
  assert.deepEqual(dialog.closes, []); await f.form().dispatch("submit"); assert.equal(calls, 2);
});
test("cancel and route destruction retain dialog ownership", async () => {
  const f = fixture(); const first = await f.open("approve"); await f.open("reject");
  assert.equal(first.destroyed, 1);
  const last = f.dialogs.at(-1); f.view.destroy(); assert.equal(last.destroyed, 1);
  const g = fixture(); const dialog = await g.open("approve");
  await g.nodes.find((n) => n.dataset.dialogAction === "cancel").dispatch("click"); await Promise.resolve();
  assert.deepEqual(dialog.closes, ["cancelled"]); assert.equal(dialog.destroyed, 1);
});

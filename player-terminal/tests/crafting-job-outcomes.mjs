import assert from "node:assert/strict";
import test from "node:test";
import { craftingJobOutcome, renderCraftingJobOutcome } from "../src/features/crafting/job-outcome.js";
import { createPlayerTerminalLifecycle } from "../src/core/player-terminal-lifecycle.js";
import { createPlayerTerminalForms } from "../src/core/player-terminal-forms.js";
import { PlayerApi } from "../src/api/player-api.js";
import { createStore } from "../src/core/store.js";
import { createResourceFreshnessCoordinator } from "../src/api/resource-freshness-coordinator.js";
import { createStudentProfileApiCall } from "../src/integrations/student-profile-api-call.js";
import { previewData } from "../src/data/preview-data.js";
const JOB = "cft_" + "a".repeat(32);
const result = (status, outcome = status) => ({ jobKey: JOB, status, outcome, committed: true, refreshRequired: true });
for (const [endpoint, status] of [["craftCancel", "cancelled"], ["craftClaim", "claimed"], ["craftClaim", "failed"]]) {
  for (const replay of [false, true]) test(`${endpoint} ${status} ${replay ? "replay" : "initial"} interprets actual public terminal outcome`, () => {
    const output = craftingJobOutcome(endpoint, { jobKey: JOB }, { ...result(status, replay ? "replayed" : status), privateId: "secret", equipment: [{ internalId: "secret" }] });
    assert.equal(output.status, status); assert.equal(output.replayed, replay); assert.equal(output.tone, status === "failed" ? "amber" : "green");
    assert.ok(!JSON.stringify(output).includes("secret"));
  });
}
test("mismatched or malformed responses cannot certify a claim, cancellation or refund", () => {
  for (const patch of [{ jobKey: "cft_" + "b".repeat(32) }, { committed: false }, { committed: "true" }, { refreshRequired: false }, { outcome: "unknown" }, { status: "cancelled" }]) {
    assert.equal(craftingJobOutcome("craftClaim", { jobKey: JOB }, { ...result("claimed"), ...patch }).status, "unverified");
  }
  assert.equal(craftingJobOutcome("craftClaim", {}, result("claimed")).status, "unverified");
  assert.equal(craftingJobOutcome("craftCancel", { jobKey: JOB }, result("failed")).status, "unverified");
  assert.equal(craftingJobOutcome("craftItem", {}, {}), null);
});
test("receipt renders only for the owning session and excludes raw failure metadata", () => {
  const session = {}, outcome = craftingJobOutcome("craftClaim", { jobKey: JOB }, { ...result("failed"), failureCode: '<script>private</script>' });
  const ui = { craftingJobOutcome: { session, outcome } };
  assert.match(renderCraftingJobOutcome({ session }, ui), /recorded failure/);
  assert.doesNotMatch(renderCraftingJobOutcome({ session }, ui), /script|private/);
  assert.equal(renderCraftingJobOutcome({ session: {} }, ui), "");
});

function fixture(t, { endpoint = "craftClaim", response = result("failed"), readFailure = false, hold } = {}) {
  const saved = new Map(["HTMLButtonElement", "CustomEvent", "FormData"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.defineProperty(globalThis, "HTMLButtonElement", { configurable: true, value: class {} });
  Object.defineProperty(globalThis, "CustomEvent", { configurable: true, value: class extends Event { constructor(type, init) { super(type); this.detail = init.detail; } } });
  Object.defineProperty(globalThis, "FormData", { configurable: true, value: class { entries() { return [["jobKey", JOB]]; } } });
  const writes = [], toasts = [], reads = [];
  const connected = createStudentProfileApiCall({ request: async request => { writes.push(request); if (hold) await hold; return { ok: true, data: response, committed: true, refreshRequired: true }; } });
  const config = { authenticated: true, usePreviewData: false, csrfToken: "C".repeat(43), gameSessionId: "craft-fixture", writeCooldownMs: 0,
    apiCall: context => { if (context.method === "POST") return connected(context); reads.push(context.endpointKey); if (readFailure && context.endpointKey === "crafting") throw Object.assign(new Error("read failed"), { status: 400 }); return structuredClone(previewData[context.endpointKey]); } };
  const freshness = createResourceFreshnessCoordinator(), api = new PlayerApi(config, { freshness });
  const store = createStore({ ui: {}, data: { ...structuredClone(previewData), capabilities: { actions: { [endpoint]: true }, endpointKeys: { [endpoint === "craftClaim" ? "craftingJobClaim" : "craftingJobCancel"]: true } } } });
  const mount = new EventTarget(); mount.querySelector = () => null;
  const lifecycle = createPlayerTerminalLifecycle({ api, store, config, freshness, mount, showToast: (...args) => toasts.push(args), openConnectionModal() {} });
  const forms = createPlayerTerminalForms({ store, mount, showToast: (...args) => toasts.push(args), executeEndpoint: lifecycle.executeEndpoint });
  const form = { dataset: { endpoint, playerForm: "craft-claim" }, elements: [], classList: { add() {}, remove() {} }, checkValidity: () => true, querySelector: () => null };
  const submit = () => forms.handleSubmit({ target: { closest: () => form }, preventDefault() {} });
  t.after(() => { lifecycle.destroy(); api.setSession({ authenticated: false }); for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  return { submit, store, freshness, lifecycle, writes, toasts, reads };
}
for (const [status, readFailure] of [["failed", false], ["failed", true], ["claimed", false], ["claimed", true]]) test(`installed form/API/adapter ${status} outcome survives refresh=${!readFailure}`, async t => {
  const f = fixture(t, { response: result(status), readFailure }); await f.submit();
  assert.equal(f.writes.length, 1); assert.equal(f.writes[0].path, `/players/me/crafting/jobs/${JOB}/claim`);
  assert.deepEqual(Object.keys(f.writes[0].payload), ["idempotencyKey"]);
  assert.ok(f.writes[0].payload.idempotencyKey);
  assert.equal(f.store.getState().ui.craftingJobOutcome.outcome.status, status);
  assert.match(renderCraftingJobOutcome(f.store.getState().data, f.store.getState().ui), status === "failed" ? /recorded failure/ : /claim confirmed/);
  assert.equal(f.toasts.at(-1)[1], status === "failed" || readFailure ? "amber" : "green");
  assert.ok(f.reads.includes("crafting") && f.reads.includes("inventory"));
});
test("installed mismatched job response refreshes but reports unverified instead of success", async t => {
  const f = fixture(t, { response: { ...result("claimed"), jobKey: "cft_" + "b".repeat(32) } }); await f.submit();
  assert.equal(f.store.getState().ui.craftingJobOutcome.outcome.status, "unverified"); assert.equal(f.toasts.at(-1)[1], "amber");
});
test("retired lifecycle cannot publish delayed Crafting receipt", async t => {
  let resolve; const hold = new Promise(done => { resolve = done; }); const f = fixture(t, { hold });
  const pending = f.submit(); await new Promise(setImmediate); f.lifecycle.destroy(); resolve(); await pending;
  assert.equal(f.store.getState().ui.craftingJobOutcome, undefined); assert.equal(f.toasts.length, 0);
});

test("installed cancellation replay is job-bound and does not invent refunds", async t => {
  const f = fixture(t, { endpoint: "craftCancel", response: result("cancelled", "replayed") }); await f.submit();
  assert.equal(f.writes[0].path, `/players/me/crafting/jobs/${JOB}/cancel`);
  const state = f.store.getState(); assert.equal(state.ui.craftingJobOutcome.outcome.replayed, true);
  assert.match(renderCraftingJobOutcome(state.data, state.ui), /cancellation confirmed/);
  assert.match(renderCraftingJobOutcome(state.data, state.ui), /no refund quantity is inferred/);
  assert.equal(f.toasts.at(-1)[1], "green");
});
test("an unbound missing session cannot render a receipt", () => {
  assert.equal(renderCraftingJobOutcome({}, { craftingJobOutcome: { outcome: craftingJobOutcome("craftClaim", { jobKey: JOB }, result("failed")) } }), "");
});

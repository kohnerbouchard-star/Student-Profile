import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { createResourceFreshnessCoordinator } from "../src/api/resource-freshness-coordinator.js";
import { createStore } from "../src/core/store.js";
import { previewData } from "../src/data/preview-data.js";
import { installPlayerInvalidationController } from "../src/realtime/player-invalidation-controller.js";

async function until(predicate) {
  const deadline = Date.now() + 3000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Market refresh fixture did not settle");
    await delay(5);
  }
}

function fixture() {
  const freshness = createResourceFreshnessCoordinator();
  const documentRef = new EventTarget(), eventTarget = new EventTarget();
  documentRef.visibilityState = "visible";
  documentRef.activeElement = { matches: () => false }; // The dialog's focused button is not an editable field.
  const store = createStore({ status: "ready", route: "market", data: structuredClone(previewData), modal: null });
  let open = false, publications = 0, release = null, holdNext = false, delivered = 0;
  const reads = [];
  const mount = {
    contains: () => true,
    querySelector: (selector) => open && selector.includes("[data-player-market-order-dialog]") ? {} : null,
  };
  const config = {
    usePreviewData: false, authenticated: true, csrfToken: "C".repeat(43),
    deviceId: "11111111-1111-4111-8111-111111111111", publishableKey: "sb_publishable_market_pause_fixture",
    gameSessionId: "game-1", requestTimeoutMs: 2000, allowedImageHosts: [],
    apiCall: async ({ endpointKey, method }) => {
      assert.equal(method, "GET", "The refresh fixture must never submit a trade");
      reads.push(endpointKey);
      if (holdNext) { holdNext = false; await new Promise(resolve => { release = resolve; }); }
      delivered += 1;
      return structuredClone(previewData[endpointKey]);
    },
  };
  const terminal = { freshness, getState: store.getState, subscribe: store.subscribe, navigate() {} };
  const controller = installPlayerInvalidationController({
    terminal, config, mount, eventTarget, documentRef, debounceMs: 5, checkIntervalMs: 60000,
  });
  const unsubscribe = store.subscribe(() => { if (open) publications += 1; });
  return {
    store, freshness, controller, reads,
    open() { open = true; }, closeDialog() { open = false; },
    publications: () => publications, delivered: () => delivered,
    hold() { holdNext = true; }, release() { release?.(); },
    destroy() { controller.destroy(); unsubscribe(); release?.(); },
  };
}

{
  const f = fixture();
  try {
    const before = f.store.getState().data.market;
    f.open(); f.controller.refreshNow(["market"]);
    await delay(50);
    assert.equal(f.store.getState().modal, null, "Imperative Market dialogs are outside terminal modal state");
    assert.deepEqual(f.reads, [], "An open Market review defers realtime reads even with a button focused");
    assert.equal(f.publications(), 0, "The active dialog must not be replaced by a live-state render");
    assert.equal(f.store.getState().data.market, before);
    assert.equal(f.freshness.isPending("market"), true, "Deferred invalidation remains pending");
    f.closeDialog();
    await until(() => f.reads.length === 1 && !f.freshness.isPending("market"));
    assert.notEqual(f.store.getState().data.market, before, "Closing the review allows normal refresh to resume");
  } finally { f.destroy(); }
}

{
  const f = fixture();
  try {
    const before = f.store.getState().data.market;
    f.hold(); f.controller.refreshNow(["market"]);
    await until(() => f.reads.length === 1);
    f.open(); f.release();
    await until(() => f.delivered() === 1);
    await delay(20);
    assert.equal(f.publications(), 0, "A read begun before the review cannot publish into the open dialog");
    assert.equal(f.store.getState().data.market, before);
    assert.equal(f.freshness.isPending("market"), true);
    f.closeDialog();
    await until(() => f.reads.length === 2 && !f.freshness.isPending("market"));
    assert.notEqual(f.store.getState().data.market, before);
  } finally { f.destroy(); }
}

{
  const f = fixture();
  f.open(); f.controller.refreshNow(["market"]);
  await delay(30);
  f.destroy(); f.closeDialog();
  await delay(950);
  assert.deepEqual(f.reads, [], "Destroy clears the deferred retry without starting a late request");
}
console.log("Market dialog refresh passed: open/in-flight deferral, pending invalidations, close resume and destroy cleanup.");

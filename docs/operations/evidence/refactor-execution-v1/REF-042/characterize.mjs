// Diagnostic evidence, not an acceptance suite: known defects below are observed,
// never blessed as desired behavior. Run from the repository root with Node 22.
// The real terminal, flow, API, and realtime controller run with synthetic DOM
// and transport fixtures. This does not qualify browser focus or live economics.
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { createPlayerTerminal } from "../../../../../player-terminal/src/app.js";
import { installInventoryActionFlow } from "../../../../../player-terminal/src/features/inventory/inventory-action-flow.js";
import { installPlayerInvalidationController } from "../../../../../player-terminal/src/realtime/player-invalidation-controller.js";
import { previewData } from "../../../../../player-terminal/src/data/preview-data.js";
import { abortPlayerApiSessionRequests } from "../../../../../player-terminal/src/api/player-api.js";
import { WRITE_INVALIDATIONS } from "../../../../../player-terminal/src/api/resource-plan.js";

class Element extends EventTarget {
  constructor() {
    super();
    this.dataset = {};
    this.attrs = new Map();
    this.childNodes = [];
    this.disabled = false;
    this.classList = { add() {}, remove() {} };
    this.innerHTML = "";
  }
  setAttribute(key, value) { this.attrs.set(key, value); }
  getAttribute(key) { return this.attrs.get(key) ?? null; }
  removeAttribute(key) { this.attrs.delete(key); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  contains() { return true; }
  append(node) { this.childNodes.push(node); }
  replaceChildren(...nodes) { this.childNodes = nodes; }
  remove() {}
  matches() { return false; }
  closest(selector) {
    if (selector === "[data-player-inventory-effect-use]" && this.dataset.playerInventoryEffectUse) return this;
    if (selector === "[data-player-inventory-redeem]" && this.dataset.playerInventoryRedeem) return this;
    return null;
  }
}
globalThis.HTMLElement = Element;
globalThis.HTMLButtonElement = Element;
globalThis.document = Object.assign(new EventTarget(), {
  createElement: () => new Element(), visibilityState: "visible", activeElement: null
});
globalThis.location = { hash: "#inventory" };
const events = new EventTarget();
for (const name of ["addEventListener", "removeEventListener", "dispatchEvent"]) {
  globalThis[name] = events[name].bind(events);
}
globalThis.requestAnimationFrame = () => 0;
globalThis.CustomEvent = class extends Event {
  constructor(type, options = {}) { super(type); this.detail = options.detail; }
};
globalThis.prompt = () => "1";

async function waitFor(predicate) {
  for (let index = 0; index < 100; index++) {
    if (predicate()) return;
    await delay(2);
  }
  throw new Error("Diagnostic condition did not settle");
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const targeted = process.argv.includes("--targeted");
async function fixture() {
  location.hash = "#inventory";
  const requests = [];
  let mutation, readHold, holdNextInventory = false, version = 0, outcome = "created";
  const config = {
    usePreviewData: false, authenticated: true, csrfToken: "C".repeat(43), gameSessionId: "game-1",
    deviceId: "11111111-1111-4111-8111-111111111111", publishableKey: "sb_publishable_ref042_fixture",
    requestTimeoutMs: 5000, writeCooldownMs: 0, allowedImageHosts: [],
    resourceFreshnessMs: { inventory: 60000 },
    sessionReadyEvent: "test:ready", sessionInvalidEvent: "test:invalid", sessionRequiredEvent: "test:required",
    apiCall: async (context) => {
      requests.push({ key: context.endpointKey, method: context.method, session: context.session.gameSessionId });
      if (context.method === "POST") {
        await mutation.promise;
        if (outcome !== "replayed") version++;
        return { ok: true, outcome };
      }
      const data = structuredClone(previewData[context.endpointKey]);
      if (context.endpointKey === "inventory") {
        // Capture the authoritative value when the request starts, not resolves.
        data.marker = version;
        if (holdNextInventory) {
          holdNextInventory = false;
          readHold = deferred();
          await readHold.promise;
        }
      }
      return data;
    }
  };
  const mount = new Element();
  const terminal = createPlayerTerminal({ mount, config });
  const toasts = [];
  terminal.showToast = (...args) => toasts.push(args);
  await waitFor(() => terminal.getState().status === "ready" && !terminal.getState().routeLoading.inventory);
  const flow = installInventoryActionFlow({ mount, terminal, config });
  function dispatch(button) {
    const event = new Event("click", { cancelable: true });
    Object.defineProperty(event, "target", { value: button });
    mount.dispatchEvent(event);
  }
  function click(kind = "use") {
    // Model only the proposed call-site substitution, without editing runtime.
    // Resource ownership remains the production registry, never a copied list.
    if (targeted) terminal.refresh = () => terminal.refreshResources(
      WRITE_INVALIDATIONS[kind === "use" ? "itemEffectUse" : "inventoryUse"]
    );
    const button = new Element();
    button.dataset[kind === "use" ? "playerInventoryEffectUse" : "playerInventoryRedeem"] = "fixture-item";
    button.replaceChildren({ textContent: "Original" });
    dispatch(button);
    return button;
  }
  return {
    requests, config, mount, terminal, toasts, flow, click, dispatch,
    begin(nextOutcome = "created") {
      outcome = nextOutcome;
      if (outcome === "replayed") version = 1; // Prior committed state, no second economic effect.
      mutation = deferred();
      return mutation;
    },
    hold() { holdNextInventory = true; },
    getReadHold() { return readHold; },
    getVersion() { return version; },
    close() { flow.destroy(); terminal.destroy(); abortPlayerApiSessionRequests(config); }
  };
}

const report = { mode: targeted ? "targeted-refresh candidate via terminal adapter" : "unchanged baseline" };
for (const kind of ["use", "redeem", "replay"]) {
  const f = await fixture();
  f.requests.length = 0;
  const receipt = f.begin(kind === "replay" ? "replayed" : "created");
  const button = f.click(kind === "redeem" ? "redeem" : "use");
  await waitFor(() => f.requests.length === 1);
  assert.equal(button.disabled, true);
  f.dispatch(button); // A duplicate click on the disabled control must not write.
  await delay(2);
  assert.equal(f.requests.length, 1);
  assert.equal(f.toasts.length, 0, "No success before the authoritative receipt");
  receipt.resolve();
  await waitFor(() => !button.disabled);
  assert.equal(button.childNodes[0].textContent, "Original");
  report[kind] = {
    calls: f.requests, toasts: f.toasts,
    visibleInventoryMarker: f.terminal.getState().data.inventory.marker,
    authoritativeMarker: f.getVersion()
  };
  f.close();
}
for (const kind of ["rejection", "abort", "destroy", "sessionSwitch"]) {
  const f = await fixture();
  f.requests.length = 0;
  const receipt = f.begin();
  const button = f.click();
  await waitFor(() => f.requests.length === 1);
  if (kind === "rejection") receipt.reject(Object.assign(new Error("rejected"), { status: 409, code: "CONFLICT" }));
  if (kind === "abort") abortPlayerApiSessionRequests(f.config);
  if (kind === "destroy") { f.flow.destroy(); receipt.resolve(); }
  if (kind === "sessionSwitch") {
    await f.terminal.connectSession({ authenticated: true, csrfToken: "D".repeat(43), gameSessionId: "game-2" });
    receipt.resolve();
  }
  await waitFor(() => !button.disabled);
  report[kind] = { calls: f.requests, toasts: f.toasts, status: f.terminal.getState().status };
  f.close();
}
{
  const f = await fixture();
  const controller = installPlayerInvalidationController({
    terminal: f.terminal, config: f.config, mount: f.mount, eventTarget: new EventTarget(),
    documentRef: document, debounceMs: 0, checkIntervalMs: 60000
  });
  f.requests.length = 0;
  f.hold();
  controller.refreshNow(["inventory"]);
  await waitFor(() => f.getReadHold());
  const receipt = f.begin();
  const button = f.click();
  await waitFor(() => f.requests.some((request) => request.method === "POST"));
  receipt.resolve();
  await waitFor(() => !button.disabled);
  const before = f.terminal.getState().data.inventory.marker;
  f.getReadHold().resolve();
  await waitFor(() => f.terminal.getState().live.status === "connected");
  report.concurrentRealtime = {
    calls: f.requests, before, after: f.terminal.getState().data.inventory.marker,
    authoritativeMarker: f.getVersion()
  };
  controller.destroy();
  f.close();
}
console.log(JSON.stringify(report, null, 2));

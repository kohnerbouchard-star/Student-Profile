import assert from "node:assert/strict";
import { installPlayerRecoveryController } from "../src/recovery/player-recovery-controller.js";
import {
  classifyPlayerRecoverySignal,
  restoredPlayerRecoveryState,
  retrySeconds,
} from "../src/recovery/recovery-policy.js";

class FakeCustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
    this.target = null;
  }
}

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.dataset = {};
    this.attributes = new Map();
    this.children = [];
    this.listeners = new Map();
    this.parentNode = null;
    this.hidden = false;
    this.disabled = false;
    this.className = "";
    this.type = "";
    this._textContent = "";
    this.ownerDocument = null;
  }

  get textContent() {
    if (this._textContent) return this._textContent;
    return this.children.map((child) => child.textContent || "").join(" ").trim();
  }

  set textContent(value) {
    this._textContent = String(value || "");
    this.children = [];
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  addEventListener(name, handler) {
    const handlers = this.listeners.get(name) || [];
    handlers.push(handler);
    this.listeners.set(name, handlers);
  }

  removeEventListener(name, handler) {
    const handlers = this.listeners.get(name) || [];
    this.listeners.set(name, handlers.filter((candidate) => candidate !== handler));
  }

  append(...nodes) {
    for (const node of nodes) {
      node.parentNode = this;
      node.ownerDocument = node.ownerDocument || this.ownerDocument;
      this.children.push(node);
    }
  }

  replaceChildren(...nodes) {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    this._textContent = "";
    this.append(...nodes);
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }

  find(predicate) {
    if (predicate(this)) return this;
    for (const child of this.children) {
      const match = child.find?.(predicate);
      if (match) return match;
    }
    return null;
  }

  querySelector(selector) {
    if (selector === "[data-player-recovery-region]") {
      return this.find((node) => node.dataset?.playerRecoveryRegion === "true");
    }
    if (selector === "[data-player-recovery-action=\"retry\"]") {
      return this.find((node) => node.dataset?.playerRecoveryAction === "retry");
    }
    return null;
  }

  querySelectorAll() {
    return [];
  }
}

class FakeMount extends FakeElement {
  constructor(documentLike) {
    super("main");
    this.ownerDocument = documentLike;
    this.mutationControls = [];
    this.toasts = [];
    this.routeError = null;
  }

  querySelector(selector) {
    if (selector === ".player-terminal-route-error:not([data-player-recovery-region])") return this.routeError;
    return super.querySelector(selector);
  }

  querySelectorAll(selector) {
    if (selector === ".player-terminal-toast") return this.toasts;
    if (selector.includes("[data-player-form][data-endpoint]")) return this.mutationControls;
    return [];
  }
}

class FakeDocument {
  createElement(tagName) {
    const element = new FakeElement(tagName);
    element.ownerDocument = this;
    return element;
  }
}

function createHarness() {
  const listeners = new Map();
  const intervals = new Map();
  const timeouts = new Map();
  const stateEvents = [];
  let timerId = 0;
  let refreshCount = 0;
  let session = {};

  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.connected = false;
      this.options = null;
      runtime.observer = this;
    }

    observe(_target, options) {
      this.connected = true;
      this.options = options;
    }

    disconnect() {
      this.connected = false;
    }
  }

  const runtime = {
    CustomEvent: FakeCustomEvent,
    MutationObserver: FakeMutationObserver,
    navigator: { onLine: true },
    addEventListener(name, handler) {
      const handlers = listeners.get(name) || [];
      handlers.push(handler);
      listeners.set(name, handlers);
    },
    removeEventListener(name, handler) {
      const handlers = listeners.get(name) || [];
      listeners.set(name, handlers.filter((candidate) => candidate !== handler));
    },
    dispatchEvent(event) {
      if (event.type === "econovaria:player-recovery-state-changed") stateEvents.push(event.detail);
      for (const handler of listeners.get(event.type) || []) handler(event);
      return true;
    },
    setInterval(handler, delay) {
      timerId += 1;
      intervals.set(timerId, { handler, delay });
      return timerId;
    },
    clearInterval(id) {
      intervals.delete(id);
    },
    setTimeout(handler, delay) {
      timerId += 1;
      timeouts.set(timerId, { handler, delay });
      return timerId;
    },
    clearTimeout(id) {
      timeouts.delete(id);
    },
  };

  const documentLike = new FakeDocument();
  runtime.document = documentLike;
  const mount = new FakeMount(documentLike);
  const control = new FakeElement("button");
  control.ownerDocument = documentLike;
  mount.mutationControls.push(control);

  const terminal = {
    getState() {
      return { status: "ready", data: { session } };
    },
    async refresh() {
      refreshCount += 1;
    },
  };

  return {
    control,
    intervals,
    listeners,
    mount,
    runtime,
    stateEvents,
    terminal,
    timeouts,
    setSession(value) {
      session = value;
    },
    get refreshCount() {
      return refreshCount;
    },
  };
}

{
  const offline = classifyPlayerRecoverySignal({ online: false });
  assert.equal(offline.kind, "offline");
  assert.equal(offline.lockMutations, true);
  assert.equal(offline.canDismiss, false);

  const paused = classifyPlayerRecoverySignal({ code: "GAME_MUTATIONS_PAUSED" });
  assert.equal(paused.kind, "game-paused");
  assert.equal(paused.lockMutations, true);

  const ended = classifyPlayerRecoverySignal({ message: "This game has ended." });
  assert.equal(ended.kind, "game-ended");
  assert.equal(ended.canRetry, false);

  const rateLimited = classifyPlayerRecoverySignal({ status: 429, message: "Try again in 9 seconds." });
  assert.equal(rateLimited.kind, "rate-limited");
  assert.equal(rateLimited.retryAfterMs, 9000);
  assert.equal(rateLimited.lockMutations, true);

  const committed = classifyPlayerRecoverySignal({ message: "Action completed. Some information will refresh when the service is available." });
  assert.equal(committed.kind, "committed-refresh-pending");
  assert.equal(committed.lockMutations, true);
  assert.match(committed.message, /Do not submit the action again/);

  for (const input of [
    { code: "REQUEST_TIMEOUT" },
    { status: 409 },
    { status: 503 },
  ]) {
    assert.equal(classifyPlayerRecoverySignal(input).lockMutations, true);
  }
  assert.equal(classifyPlayerRecoverySignal({ code: "ROUTE_DATA_UNAVAILABLE" }).lockMutations, false);
  assert.equal(classifyPlayerRecoverySignal({ message: "ordinary validation error" }), null);
  assert.equal(restoredPlayerRecoveryState().persistent, false);
  assert.equal(retrySeconds(5500, 501), 5);
  assert.equal(retrySeconds(1000, 1000), 0);
}

{
  const harness = createHarness();
  const controller = installPlayerRecoveryController({
    terminal: harness.terminal,
    mount: harness.mount,
    runtime: harness.runtime,
    config: {
      playerRecoveryEvent: "econovaria:player-recovery-signal",
      sessionInvalidEvent: "econovaria:player-session-invalid",
      sessionReadyEvent: "econovaria:player-session-ready",
    },
  });

  assert.equal(harness.listeners.get("offline")?.length, 1);
  assert.equal(harness.runtime.observer.connected, true);
  assert.deepEqual(harness.runtime.observer.options, { childList: true, subtree: true });

  harness.runtime.navigator.onLine = false;
  harness.runtime.dispatchEvent(new FakeCustomEvent("offline"));
  assert.equal(controller.getState().kind, "offline");
  assert.equal(harness.control.disabled, true);
  let region = harness.mount.querySelector("[data-player-recovery-region]");
  assert.equal(region.dataset.playerRecoveryState, "offline");
  assert.equal(region.getAttribute("role"), "alert");

  harness.runtime.navigator.onLine = true;
  harness.runtime.dispatchEvent(new FakeCustomEvent("online"));
  assert.equal(controller.getState().kind, "restored");
  assert.equal(harness.control.disabled, false);
  assert.ok(region.querySelector("[data-player-recovery-action=\"retry\"]"));

  harness.runtime.dispatchEvent(new FakeCustomEvent("econovaria:player-recovery-signal", {
    detail: { code: "GAME_PAUSED" },
  }));
  assert.equal(controller.getState().kind, "game-paused");
  assert.equal(harness.control.disabled, true);

  harness.runtime.navigator.onLine = false;
  harness.runtime.dispatchEvent(new FakeCustomEvent("offline"));
  harness.runtime.navigator.onLine = true;
  harness.runtime.dispatchEvent(new FakeCustomEvent("online"));
  assert.equal(controller.getState().kind, "game-paused", "connectivity restoration must not clear a lifecycle lock");

  region.remove();
  assert.equal(harness.mount.querySelector("[data-player-recovery-region]"), null);
  controller.inspect();
  region = harness.mount.querySelector("[data-player-recovery-region]");
  assert.ok(region, "the recovery region must survive terminal rerenders");
  assert.equal(region.dataset.playerRecoveryState, "game-paused");

  harness.runtime.dispatchEvent(new FakeCustomEvent("econovaria:player-recovery-signal", {
    detail: { code: "GAME_RESUMED" },
  }));
  assert.equal(controller.getState().kind, "restored");
  assert.equal(harness.control.disabled, false);

  harness.runtime.dispatchEvent(new FakeCustomEvent("econovaria:player-session-invalid", {
    detail: { code: "SESSION_INVALID", status: 401 },
  }));
  assert.equal(controller.getState(), null);
  assert.equal(region.hidden, true);

  controller.show(classifyPlayerRecoverySignal({ status: 409 }));
  assert.equal(harness.control.disabled, true);
  assert.equal(await controller.retry(), true);
  assert.equal(harness.refreshCount, 1);
  assert.equal(controller.getState().kind, "restored");
  assert.equal(harness.control.disabled, false);

  const toast = new FakeElement("div");
  toast.textContent = "Action completed. Some information will refresh when the service is available.";
  harness.mount.toasts.push(toast);
  controller.inspect();
  assert.equal(controller.getState().kind, "committed-refresh-pending");
  assert.equal(harness.control.disabled, true);

  harness.mount.routeError = new FakeElement("section");
  harness.mount.routeError.textContent = "This section encountered a data problem.";
  controller.inspect();
  assert.equal(controller.getState().kind, "route-unavailable");
  assert.equal(harness.control.disabled, false);

  harness.setSession({ gameLifecycleStatus: "GAME_ENDED" });
  harness.runtime.dispatchEvent(new FakeCustomEvent("econovaria:player-session-ready"));
  assert.equal(controller.getState().kind, "game-ended");
  assert.equal(harness.control.disabled, true);

  controller.destroy();
  assert.equal(harness.runtime.observer.connected, false);
  assert.equal(harness.control.disabled, false);
  assert.equal(harness.mount.querySelector("[data-player-recovery-region]"), null);
  assert.equal(harness.listeners.get("offline")?.length, 0);
  assert.ok(harness.stateEvents.some((event) => event.kind === "offline"));
}

console.log("Player recovery state checks passed.");

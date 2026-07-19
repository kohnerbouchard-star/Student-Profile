import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("admin/session-gate.js", "utf8");
const authSource = await readFile("admin/admin-auth.js", "utf8");
const EVENT_NAME = "econovaria:admin-route-mounted";

assert.match(source, new RegExp(EVENT_NAME));
assert.match(source, /event\.target !== mount/);
assert.match(source, /mountIsReady/);
assert.match(source, /MOUNT_TIMEOUT_MS = 10000/);
assert.doesNotMatch(source, /MutationObserver\s*\(/);
assert.match(authSource, /EconovariaAdminSessionGate\?\.release\(\)/);

const renderPosition = authSource.indexOf("mount.innerHTML = feature.renderShell()");
const bootstrapPosition = authSource.indexOf("completeInitialBootstrapRender(feature)", renderPosition);
const signalPosition = authSource.indexOf("EconovariaAdminSessionGate?.release()", bootstrapPosition);
assert.ok(renderPosition >= 0 && bootstrapPosition > renderPosition && signalPosition > bootstrapPosition,
  "The authenticated mount signal must remain after shell rendering and bootstrap completion.");

class FakeCustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
    this.bubbles = options.bubbles === true;
    this.target = null;
  }
}

function createRuntime({ mounted = false } = {}) {
  const listeners = new Map();
  const timeouts = new Map();
  const storage = new Map([
    ["econovaria.admin.selected-game.v1", "game-1"],
  ]);
  const emitted = [];
  let timeoutSequence = 0;
  let gateRemoved = 0;

  const document = {
    readyState: "complete",
    addEventListener(name, handler) {
      const handlers = listeners.get(name) || new Set();
      handlers.add(handler);
      listeners.set(name, handlers);
    },
    removeEventListener(name, handler) {
      listeners.get(name)?.delete(handler);
    },
    getElementById(id) {
      if (id === "adminPreview") return mount;
      if (id === "adminSessionGate") return gate;
      return null;
    },
    createElement() {
      return {
        className: "",
        textContent: "",
        type: "",
        addEventListener() {},
        append() {},
      };
    },
  };

  function bubble(event) {
    emitted.push(event);
    for (const handler of listeners.get(event.type) || []) handler(event);
  }

  const mount = {
    hidden: !mounted,
    childElementCount: mounted ? 1 : 0,
    dispatchEvent(event) {
      event.target = mount;
      bubble(event);
      return true;
    },
  };

  const gate = {
    classList: { add() {} },
    replaceChildren() {},
    appendChild() {},
    remove() { gateRemoved += 1; },
  };

  const sessionManager = {
    read() { return { accessToken: "valid" }; },
    async getUsableSession() { return { accessToken: "valid" }; },
    clear() {},
  };

  const window = {
    document,
    EconovariaAdminAuthSession: sessionManager,
    sessionStorage: {
      getItem(key) { return storage.get(key) ?? null; },
      removeItem(key) { storage.delete(key); },
    },
    location: {
      href: "https://example.test/admin/",
      replace() {},
      reload() {},
    },
    setTimeout(handler, delay = 0) {
      timeoutSequence += 1;
      timeouts.set(timeoutSequence, { handler, delay });
      return timeoutSequence;
    },
    clearTimeout(id) { timeouts.delete(id); },
  };
  window.window = window;

  vm.runInNewContext(source, {
    window,
    document,
    CustomEvent: FakeCustomEvent,
    URL,
    performance: { now: () => 1000 },
    Math,
    Object,
    String,
  });

  return {
    window,
    document,
    mount,
    emitted,
    listeners,
    timeouts,
    get gateRemoved() { return gateRemoved; },
    async settle() {
      await Promise.resolve();
      await Promise.resolve();
    },
    runReleaseTimers() {
      for (const [id, timer] of [...timeouts]) {
        if (timer.delay < 10000) {
          timeouts.delete(id);
          timer.handler();
        }
      }
    },
    emitFrom(target, detail = {}) {
      const event = new FakeCustomEvent(EVENT_NAME, { bubbles: true, detail });
      event.target = target;
      bubble(event);
    },
  };
}

{
  const runtime = createRuntime();
  await runtime.settle();

  assert.equal(runtime.window.EconovariaAdminSessionGate.mountedEvent, EVENT_NAME);
  assert.equal(runtime.listeners.get(EVENT_NAME)?.size, 1, "The gate must wait on one explicit mounted-event listener.");
  assert.equal(runtime.window.EconovariaAdminSessionGate.release(), false, "An empty or hidden mount must not publish readiness.");

  runtime.emitFrom({}, { route: "Overview" });
  runtime.runReleaseTimers();
  assert.equal(runtime.gateRemoved, 0, "An event from outside #adminPreview must not release the gate.");

  runtime.mount.hidden = false;
  runtime.mount.childElementCount = 1;
  assert.equal(runtime.window.EconovariaAdminSessionGate.release(), true);
  runtime.runReleaseTimers();

  assert.equal(runtime.gateRemoved, 1, "The explicit mounted event must release the verification gate.");
  assert.equal(runtime.listeners.get(EVENT_NAME)?.size, 0, "The mounted-event listener must be removed after release.");
  const mountedEvent = runtime.emitted.find((event) => event.type === EVENT_NAME && event.target === runtime.mount);
  assert.equal(mountedEvent?.detail?.mountId, "adminPreview");
  assert.equal(mountedEvent?.detail?.initial, true);
}

{
  const runtime = createRuntime({ mounted: true });
  await runtime.settle();
  runtime.runReleaseTimers();
  assert.equal(runtime.gateRemoved, 1, "A mount completed before listener installation must still release without observation.");
  assert.equal(runtime.listeners.get(EVENT_NAME)?.size || 0, 0);
}

console.log("Admin session mount uses a target-validated explicit event, handles the pre-listener race, and adds no DOM observer.");

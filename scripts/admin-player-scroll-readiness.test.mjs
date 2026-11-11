import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import vm from "node:vm";
import test from "node:test";
import { createPlayerScrollProbe } from "./admin-player-scroll-probe.mjs";

// Execute the actual installed, lockfile-pinned Playwright polling function.
// This is deterministic lifecycle coverage, not a native DOM/scroll replay.
const require = createRequire(import.meta.url);
const packagePath = require.resolve("playwright-core/package.json");
const installed = JSON.parse(await readFile(packagePath, "utf8"));
const lock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));
assert.equal(installed.version, lock.packages["node_modules/playwright-core"].version);
const core = await readFile(new URL("lib/coreBundle.js", pathToFileURL(packagePath)), "utf8");
const start = core.indexOf("injectedScript.evaluateHandle((injected, { expression:");
const end = core.indexOf("\n          }, { expression: expression2, isFunction: isFunction2, polling:", start);
assert.ok(start >= 0 && end > start, "Review the pinned Playwright extraction if its implementation changes.");
const pollSource = `(${core.slice(start + "injectedScript.evaluateHandle(".length, end)}\n})`;
const bundle = await readFile(new URL("../admin/dist/admin-overview-terminal.js", import.meta.url), "utf8");
const bindingStart = bundle.indexOf("function bindPlayerModalControls(root) {");
const bindingEnd = bundle.indexOf("\nfunction bindScannerModeHardSwitch()", bindingStart);
assert.ok(bindingStart >= 0 && bindingEnd > bindingStart);
const bindSource = bundle.slice(bindingStart, bindingEnd).trim();
const flush = () => new Promise(setImmediate);
const SELECTORS = {
  modal: ".admin-terminal-modal.is-player-modal", root: "[data-admin-terminal-player-console]",
  pane: ".admin-terminal-player-main", input: "[data-admin-terminal-player-display-name]",
  filler: "[data-admin-scroll-test-filler]",
};

function harness() {
  let frames = [];
  const handles = [];
  const waits = [];
  const events = [];
  const document = { activeElement: null, scrollingElement: { scrollTop: 0 } };
  const node = () => ({
    isConnected: true, dataset: {}, children: new Map(), parentElement: null,
    clientHeight: 400, scrollHeight: 400, scrollTop: 0, overflowY: "auto", visible: true,
    rect: { top: 10, bottom: 410, left: 20, right: 620, width: 600, height: 400 },
    querySelectorAll(selector) { return this.children.get(selector) || []; },
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
    getClientRects() { return this.visible ? [this.rect] : []; },
    getBoundingClientRect() { return this.rect; },
    addEventListener() {},
    focus() { events.push("runtime-focus"); document.activeElement = this; },
  });
  function surface() {
    const modal = node(), root = node(), pane = node(), input = node();
    modal.specialized = false;
    modal.classList = { add(value) { assert.equal(value, "is-player-modal"); modal.specialized = true; } };
    root.dataset.controlsBound = "false";
    modal.children.set(SELECTORS.root, [root]);
    root.children.set(SELECTORS.pane, [pane]);
    root.children.set(SELECTORS.input, [input]);
    pane.children.set(SELECTORS.input, [input]);
    const host = { addEventListener() {}, querySelector(selector) {
      if (selector === ".admin-terminal-modal") return modal;
      if (selector === SELECTORS.root) return root;
      return null;
    } };
    return { modal, root, pane, input, host };
  }
  let current = surface();
  let modals = [current.modal];
  document.querySelectorAll = selector => {
    assert.equal(selector, SELECTORS.modal);
    return modals.filter(modal => modal.specialized);
  };
  const enqueue = callback => { frames.push(callback); };
  const context = vm.createContext({ document, window: { requestAnimationFrame: enqueue, scrollY: 0 },
    getComputedStyle: target => ({ overflowY: target.overflowY }), updatePlayerPreview() {} });
  const run = (callback, args) => {
    context.args = args;
    try { return vm.runInContext(`(${callback})(...args)`, context); }
    finally { delete context.args; }
  };
  const handle = value => {
    const result = { value, disposed: false,
      async evaluate(callback, arg) { return run(callback.toString(), [value, arg?.value ?? arg]); },
      async evaluateHandle(callback, arg) { return handle(run(callback.toString(), [value, arg])); },
      async dispose() { this.disposed = true; },
    };
    handles.push(result); return result;
  };
  const browserPolling = vm.runInContext(pollSource, context);
  const injected = { utils: { builtins: { requestAnimationFrame: enqueue,
    setTimeout: () => assert.fail("Polling must not use fixed sleeps."),
  } } };
  const page = {
    async evaluateHandle(callback) { return handle(run(callback.toString(), [])); },
    waitForFunction(callback, argument, options) {
      const poll = browserPolling(injected, { expression: callback.toString(), isFunction: true,
        arg: argument?.value ?? argument });
      let expire;
      // Model only Playwright's outer progress deadline. Predicate truthiness,
      // frame scheduling and abort behavior execute its real installed code.
      const deadline = new Promise((_, reject) => { expire = () => {
        poll.abort(); reject(new Error("readiness timeout"));
      }; });
      waits.push({ callback, options, expire });
      return Promise.race([poll.result, deadline]).then(handle);
    },
  };
  return {
    page, handles, waits, events, document, context, node, surface,
    get current() { return current; },
    setModals(value) { modals = value; },
    replace(value = surface()) { current = value; modals = [value.modal]; return value; },
    bind(target = current) { run(`(${bindSource})`, [target.host]); },
    focus() { document.activeElement = current.input; },
    async advance() { const callbacks = frames; frames = []; callbacks.forEach(callback => callback()); await flush(); },
    get pendingFrames() { return frames.length; },
    expire() { waits.forEach(wait => wait.expire()); },
    async start(timeout = 5000) {
      const probe = await createPlayerScrollProbe(page);
      const result = { settled: false, probe };
      result.ready = probe.waitUntilReady(timeout);
      result.ready.then(() => { result.settled = true; }, () => { result.settled = true; });
      await flush();
      assert.equal(waits.at(-1).options.timeout, timeout);
      assert.notEqual(waits.at(-1).callback.constructor.name, "AsyncFunction");
      return result;
    },
    addFiller() {
      const filler = node(); filler.parentElement = current.pane;
      current.pane.children.set(SELECTORS.filler, [filler]); current.pane.scrollHeight = 1300;
      return filler;
    },
  };
}
async function timeout(h, result) {
  assert.equal(result.settled, false);
  h.expire();
  await assert.rejects(result.ready, /readiness timeout/);
  await result.probe.dispose();
  assert.ok(h.handles.every(handle => handle.disposed));
}

test("old visible Player selector is ready while exact runtime binding still has initial focus queued", async () => {
  const h = harness();
  h.bind();
  const oldReady = await h.page.waitForFunction(() =>
    document.querySelectorAll(".admin-terminal-modal.is-player-modal").length === 1, null, { timeout: 5000 });
  assert.equal(oldReady.value, true);
  assert.equal(h.current.root.dataset.controlsBound, "true");
  assert.equal(h.document.activeElement, null);
  assert.equal(h.pendingFrames, 1, "The actual source binding still owes its initial focus callback.");
  const result = await h.start();
  assert.equal(result.settled, false, "The new barrier must not permit filler/scroll actions here.");
  await h.advance(); await result.ready;
  assert.deepEqual(h.events, ["runtime-focus"]);
  assert.equal(h.document.activeElement, h.current.input);
  await oldReady.dispose(); await result.probe.dispose();
  assert.ok(h.handles.every(handle => handle.disposed));
});

test("pinned polling demonstrates why an async false predicate cannot be a barrier", async () => {
  const h = harness();
  const handle = await h.page.waitForFunction(async () => false, null, { timeout: 5000 });
  assert.equal(handle.value, false);
  assert.equal(h.pendingFrames, 0);
  await handle.dispose();
});

test("late binding and natural focus require the candidate's completed frame", async () => {
  const h = harness();
  const result = await h.start(1234);
  await h.advance(); assert.equal(result.settled, false);
  h.bind();
  await h.advance();
  assert.equal(h.document.activeElement, h.current.input);
  assert.equal(result.settled, false, "Binding discovered in this frame must earn its own frame barrier.");
  await h.advance(); await result.ready;
  const pane = await result.probe.pane();
  assert.equal(pane.value, h.current.pane);
  await pane.dispose(); await result.probe.dispose();
  assert.ok(h.handles.every(handle => handle.disposed));
});

test("an already focused input still waits a frame and wrong focus stays pending", async () => {
  for (const focused of [true, false]) {
    const h = harness(); h.bind(); await h.advance();
    h.document.activeElement = focused ? h.current.input : h.node();
    const result = await h.start();
    assert.equal(result.settled, false);
    await h.advance();
    if (!focused) { assert.equal(result.settled, false); h.focus(); await h.advance(); }
    await result.ready; await result.probe.dispose();
  }
});

const invalidations = [
  ["missing modal", h => h.setModals([])],
  ["duplicate modal", h => h.setModals([h.current.modal, h.current.modal])],
  ["disconnected modal", h => { h.current.modal.isConnected = false; }],
  ["missing console", h => h.current.modal.children.set(SELECTORS.root, [])],
  ["duplicate console", h => h.current.modal.children.set(SELECTORS.root, [h.current.root, h.current.root])],
  ["unbound console", h => { h.current.root.dataset.controlsBound = "false"; }],
  ["disconnected console", h => { h.current.root.isConnected = false; }],
  ["missing pane", h => h.current.root.children.set(SELECTORS.pane, [])],
  ["duplicate pane", h => h.current.root.children.set(SELECTORS.pane, [h.current.pane, h.current.pane])],
  ["disconnected pane", h => { h.current.pane.isConnected = false; }],
  ["hidden pane", h => { h.current.pane.visible = false; }],
  ["missing input", h => h.current.pane.children.set(SELECTORS.input, [])],
  ["duplicate input", h => h.current.pane.children.set(SELECTORS.input, [h.current.input, h.current.input])],
  ["disconnected input", h => { h.current.input.isConnected = false; }],
  ["hidden input", h => { h.current.input.visible = false; }],
];
for (const [name, invalidate] of invalidations) {
  test(`readiness rejects ${name}, including invalidation after candidate scheduling`, async () => {
    for (const afterScheduling of [false, true]) {
      const h = harness(); h.bind(); await h.advance();
      if (!afterScheduling) invalidate(h);
      const result = await h.start();
      if (afterScheduling) invalidate(h);
      await h.advance(); await timeout(h, result);
    }
  });
}

for (const key of ["modal", "root", "pane", "input"]) {
  test(`a replaced ${key} cannot borrow the prior candidate's completed frame`, async () => {
    const h = harness(); h.bind(); await h.advance();
    const result = await h.start();
    const replacement = h.surface();
    replacement.modal.specialized = true; replacement.root.dataset.controlsBound = "true";
    if (key === "modal") replacement.modal.children.set(SELECTORS.root, [h.current.root]);
    if (key === "root") h.current.modal.children.set(SELECTORS.root, [replacement.root]);
    if (key === "pane") h.current.root.children.set(SELECTORS.pane, [replacement.pane]);
    if (key === "input") h.current.pane.children.set(SELECTORS.input, [replacement.input]);
    if (key === "modal") h.setModals([replacement.modal]);
    h.document.activeElement = key === "modal" ? h.current.input : replacement.input;
    await h.advance(); assert.equal(result.settled, false);
    await h.advance(); await result.ready; await result.probe.dispose();
  });
}

test("unbinding and rebinding the same nodes requires a new frame", async () => {
  const h = harness(); h.bind(); await h.advance();
  const result = await h.start();
  h.current.root.dataset.controlsBound = "false";
  await h.advance();
  h.current.root.dataset.controlsBound = "true";
  await h.advance(); assert.equal(result.settled, false);
  await h.advance(); await result.ready; await result.probe.dispose();
});

test("stalled frames time out, abort polling and permit disposal without leaking shared state", async () => {
  const h = harness(); h.bind();
  const beforeKeys = Object.keys(h.context);
  const result = await h.start(37);
  await timeout(h, result);
  await h.advance();
  assert.equal(h.pendingFrames, 0);
  assert.deepEqual(Object.keys(h.context), beforeKeys);
  assert.equal(h.current.pane.children.has(SELECTORS.filler), false);
});

test("concurrent waits isolate candidate frames, deadlines and handles", async () => {
  const h = harness(); h.bind(); await h.advance();
  const first = await h.start(), second = await h.start();
  assert.notEqual(h.handles[0].value, h.handles[1].value);
  h.waits[0].expire(); await assert.rejects(first.ready, /readiness timeout/);
  await first.probe.dispose(); await h.advance(); await second.ready;
  await second.probe.dispose();
  assert.ok(h.handles.every(handle => handle.disposed));
});

test("post-barrier replacement or focus loss fails pane acquisition instead of targeting a new surface", async () => {
  for (const replace of [false, true]) {
    const h = harness(); h.bind(); await h.advance();
    const result = await h.start(); await h.advance(); await result.ready;
    if (replace) { h.replace(); h.bind(); await h.advance(); } else h.document.activeElement = h.node();
    await assert.rejects(result.probe.pane(), /surface changed after readiness/);
    await result.probe.dispose();
  }
});

test("diagnostics distinguish geometry/focus change, lost filler and replaced nodes without repairs", async () => {
  const h = harness(); h.bind(); await h.advance();
  const result = await h.start(); await h.advance(); await result.ready;
  const filler = h.addFiller();
  const before = await result.probe.capture();
  h.current.pane.scrollTop = 220;
  const immediate = await result.probe.capture();
  h.current.pane.scrollTop = 0; h.current.pane.clientHeight = 450;
  h.current.pane.rect = { ...h.current.pane.rect, bottom: 460, height: 450 };
  h.document.activeElement = h.node();
  filler.isConnected = false; filler.parentElement = null;
  h.current.pane.children.set(SELECTORS.filler, []);
  const after = await result.probe.capture();
  assert.equal(before.observed.pane.scrollTop, 0); assert.equal(immediate.observed.pane.scrollTop, 220);
  assert.equal(after.observed.pane.scrollTop, 0); assert.equal(after.observed.pane.height, 450);
  assert.equal(after.observed.pane.clientHeight, 450);
  assert.equal(after.focus.isCurrentInput, false); assert.notEqual(before.focus.id, after.focus.id);
  assert.equal(before.filler.retained, true); assert.equal(after.filler.retained, false);
  assert.equal(after.filler.connected, false); assert.equal(after.filler.count, 0);
  assert.equal(before.filler.id, after.filler.id); assert.equal(after.filler.parentIsObservedPane, false);
  const old = h.current; h.replace(); h.bind(); await h.advance();
  old.modal.isConnected = old.root.isConnected = old.pane.isConnected = old.input.isConnected = false;
  const replaced = await result.probe.capture();
  assert.ok(Object.values(replaced.sameNodes).every(value => value === false));
  assert.equal(replaced.observed.pane.id, before.observed.pane.id);
  assert.notEqual(replaced.current.pane.id, before.observed.pane.id);
  assert.equal(replaced.observed.pane.connected, false);
  assert.equal(old.pane.children.get(SELECTORS.filler).length, 0, "Diagnostics must not reinsert filler.");
  assert.equal(old.pane.scrollTop, 0, "Diagnostics must not repair scroll.");
  assert.equal(JSON.parse(JSON.stringify(replaced)).observed.pane.id, before.observed.pane.id);
  await result.probe.dispose();
});

test("readiness and capture failures propagate without suppressing the original failure", async () => {
  await assert.rejects(createPlayerScrollProbe({ evaluateHandle: async () => { throw new Error("context closed"); } }), /context closed/);
  const h = harness(); h.bind(); await h.advance();
  const result = await h.start(); await h.advance(); await result.ready;
  h.current.pane.getBoundingClientRect = () => { throw new Error("geometry unavailable"); };
  await assert.rejects(result.probe.capture(), /geometry unavailable/);
  await result.probe.dispose();
  assert.ok(h.handles.every(handle => handle.disposed));
});

test("scroll runner preserves original assertions and one write after readiness, recording all stages", async () => {
  const source = await readFile(new URL("./admin-scroll-integrity-smoke.mjs", import.meta.url), "utf8");
  const section = source.slice(source.indexOf('  const addPlayer ='), source.indexOf('  report.playerModal ='));
  assert.ok(section.indexOf("await playerScrollProbe.waitUntilReady()") < section.indexOf("await injectScrollableFiller(playerMain, 900)"));
  assert.equal((section.match(/injectScrollableFiller\(/g) || []).length, 1);
  assert.equal((section.match(/node\.scrollTop = 220/g) || []).length, 1);
  assert.equal((section.match(/waitForTimeout\(/g) || []).length, 1);
  assert.match(section, /await page\.waitForTimeout\(100\)/);
  for (const assertion of [
    '["auto", "scroll"].includes(modalBefore.overflowY)',
    'modalBefore.scrollHeight > modalBefore.clientHeight',
    'modalScrollTop > 0', '(await shellGeometry()).windowScrollY === 0',
  ]) assert.ok(section.includes(`assert(${assertion},`));
  for (const stage of ["ready", "before", "after", "failure"]) {
    assert.ok(source.includes(`playerModalDiagnostics.${stage} = await playerScrollProbe.capture()`));
  }
  assert.match(source, /playerModalDiagnostics\.captureFailure = String/);
  assert.match(source, /await playerMain\?\.dispose\(\)/);
  assert.match(source, /await playerScrollProbe\?\.dispose\(\)/);
});


test("atomic immediate evidence retains the single scroll result before a queued reset", async () => {
  const h = harness(); h.bind(); await h.advance();
  const result = await h.start(); await h.advance(); await result.ready;
  const pane = await result.probe.pane(); h.addFiller();
  const before = await result.probe.capture();
  h.context.window.requestAnimationFrame(() => { h.current.pane.scrollTop = 0; });
  const source = await readFile(new URL("./admin-scroll-integrity-smoke.mjs", import.meta.url), "utf8");
  const callback = source.match(/report\.playerModalDiagnostics\.immediate = await playerMain\.evaluate\(([\s\S]*?), playerScrollProbe\.observation\);/);
  assert.ok(callback, "The runner must capture in the exact scroll assignment evaluation.");
  const immediate = await pane.evaluate(vm.runInNewContext(`(${callback[1]})`), result.probe.observation);
  assert.equal(before.observed.pane.scrollTop, 0);
  assert.equal(immediate.observed.pane.scrollTop, 220);
  assert.equal(immediate.filler.retained, true);
  await h.advance();
  const after = await result.probe.capture();
  assert.equal(after.observed.pane.scrollTop, 0);
  assert.equal(immediate.observed.pane.scrollTop, 220, "Later reset cannot rewrite serialized immediate evidence.");
  await pane.dispose(); await result.probe.dispose();
});

test("absent input and absent focus are not reported as matching focus", async () => {
  const h = harness();
  const probe = await createPlayerScrollProbe(h.page);
  const diagnostic = await probe.capture();
  assert.equal(diagnostic.focus.isCurrentInput, false);
  assert.equal(diagnostic.focus.isObservedInput, false);
  await probe.dispose();
});

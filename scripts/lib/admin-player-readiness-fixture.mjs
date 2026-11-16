import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import vm from "node:vm";
import { createPlayerScrollProbe } from "../admin-player-scroll-probe.mjs";

// Execute the actual installed, lockfile-pinned Playwright polling function.
// This is deterministic lifecycle coverage, not a native DOM/scroll replay.
const require = createRequire(import.meta.url);
const packagePath = require.resolve("playwright-core/package.json");
const installed = JSON.parse(await readFile(packagePath, "utf8"));
const lock = JSON.parse(await readFile(new URL("../../package-lock.json", import.meta.url), "utf8"));
assert.equal(installed.version, lock.packages["node_modules/playwright-core"].version);
const core = await readFile(new URL("lib/coreBundle.js", pathToFileURL(packagePath)), "utf8");
const start = core.indexOf("injectedScript.evaluateHandle((injected, { expression:");
const end = core.indexOf("\n          }, { expression: expression2, isFunction: isFunction2, polling:", start);
assert.ok(start >= 0 && end > start, "Review the pinned Playwright extraction if its implementation changes.");
const pollSource = `(${core.slice(start + "injectedScript.evaluateHandle(".length, end)}\n})`;
const bundle = await readFile(new URL("../../admin/dist/admin-overview-terminal.js", import.meta.url), "utf8");
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
export { harness, flush, SELECTORS, bindSource };

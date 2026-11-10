import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../admin/modal-accessibility.js", import.meta.url), "utf8");
const bridge = await readFile(new URL("../admin/modal-lifecycle-bridge.js", import.meta.url), "utf8");
const drawer = await readFile(new URL("../admin/player-drawer-accessibility.js", import.meta.url), "utf8");
const index = await readFile(new URL("../admin/index.html", import.meta.url), "utf8");
const bootstrap = await readFile(new URL("../admin/admin-bootstrap.js", import.meta.url), "utf8");

for (const required of [
  "controllerStack",
  "document.addEventListener(\"focusin\"",
  "parentController?.suspend?.()",
  "parent?.resume?.()",
  "semanticFocusReplacement",
  "econovaria:admin-modal-dismiss-blocked",
  "econovaria:admin-modal-activated",
  "econovaria:admin-modal-closed",
  "getActiveController",
  "getStackDepth",
]) {
  assert.ok(source.includes(required), `Admin modal accessibility must include ${required}.`);
}

assert.match(source, /if \(!backdrop\.contains\(dialog\)\)/, "Dialog containment must be validated.");
assert.match(source, /stackTop\(\) !== controller/, "Only the top modal may own keyboard and focus containment.");
assert.match(source, /dismissOnEscape = options\.dismissOnEscape !== false/, "Escape dismissal must remain configurable.");
assert.match(source, /dismissOnBackdrop = options\.dismissOnBackdrop !== false/, "Backdrop dismissal must remain configurable.");
assert.match(source, /trapFocus = options\.trapFocus !== false/, "Focus trapping must remain configurable for drawer-style surfaces.");
assert.match(source, /stableFocusTarget\(opener\)/, "Close and destroy paths must restore a stable opener or fallback target.");
assert.match(source, /window\.requestAnimationFrame\(\(\) => \{[\s\S]*?stableFocusTarget\(opener\)[\s\S]*?focusStableTarget\(target\)/, "Rerendered opener replacement must be resolved inside the scheduled restoration frame.");
assert.match(source, /focusInside\(lastFocusedInside\)/, "Blocked dismissal and nested resume must retain the last valid focus target.");

for (const required of [
  "window.EconovariaAdminModalAccessibility",
  "accessibility.activate",
  "bindingForDialog",
  "bindingForTarget",
  "delegatedBundleCloseControls",
  "sharedBackdrop",
  "backdrop.dataset.adminModalAccessibilityBound",
  "econovaria:admin-mounted-modal-bound",
  "econovaria:admin-request-lifecycle",
  "econovaria:admin-route-mounted",
  "closeControl.click()",
  "getBindingCount",
]) {
  assert.ok(bridge.includes(required), `Admin modal lifecycle bridge must include ${required}.`);
}
assert.match(bridge, /document\.addEventListener\("click"/, "Bundle-owned modal binding must use delegated click lifecycle evidence.");
assert.match(bridge, /const opener = lastOpener instanceof HTMLElement \? lastOpener : null/, "Disconnected opener elements must retain their semantic identity for rerender restoration.");
assert.doesNotMatch(bridge, /lastOpener instanceof HTMLElement && lastOpener\.isConnected/, "The bridge must not discard an opener solely because the accepted renderer disconnected it.");
assert.match(bridge, /action instanceof HTMLElement && !closeControl/, "Nested modal actions must remain eligible as child restoration openers.");
assert.doesNotMatch(bridge, /action instanceof HTMLElement && !action\.closest\(DIALOG_SELECTOR\)/, "Actions inside parent dialogs must not be excluded from child opener capture.");
assert.match(bridge, /requestAnimationFrame\(\(\) => window\.requestAnimationFrame\(reconcile\)\)/, "Modal binding must reconcile after mounted renderer frames.");
assert.match(bridge, /if \(action instanceof HTMLElement && !closeControl\) reconcileAfterCurrentEvent\(\)/, "Nested child reconciliation must be deferred through the post-handler microtask path.");
assert.doesNotMatch(bridge, /if \(action instanceof HTMLElement && !closeControl\) \{\s*reconcile\(\);/, "Admin actions must not trigger a synchronous full-dialog scan that can hide request lifecycle states.");

for (const required of [
  "EconovariaAdminModalAccessibility",
  "data-admin-terminal-player-drawer",
  "data-player-id",
  "trapFocus: true",
  "dismissOnEscape: true",
  "dismissOnBackdrop: false",
  "adminPlayerDrawerAccessibilityBound",
  "econovaria:admin-player-drawer-accessibility-bound",
  "getBindingCount",
]) {
  assert.ok(drawer.includes(required), `Player drawer accessibility must include ${required}.`);
}
assert.match(drawer, /semanticOpener\(opener\)/, "Player drawer close must restore the exact or semantic player-row opener.");
assert.match(drawer, /initialFocus: drawer\.querySelector\('\[role="tab"\]\[aria-selected="true"\]'\)/, "Player drawer must initially focus the selected authoritative tab.");

assert.ok(index.includes("./admin-bootstrap.js"), "Admin index must load the external bootstrap.");
const modalBridgeIndex = bootstrap.indexOf("./modal-lifecycle-bridge.js");
const keyboardIndex = bootstrap.indexOf("./keyboard-navigation.js");
const drawerIndex = bootstrap.indexOf("./player-drawer-accessibility.js");
assert.ok(modalBridgeIndex >= 0 && keyboardIndex > modalBridgeIndex, "Admin bootstrap must load the modal lifecycle bridge before keyboard navigation.");
assert.ok(drawerIndex > keyboardIndex, "Admin bootstrap must load Player drawer accessibility after modal keyboard support.");

for (const [label, content] of [["controller", source], ["bridge", bridge], ["drawer", drawer]]) {
  assert.doesNotMatch(content, /MutationObserver/, `The modal ${label} must not add DOM observation.`);
  assert.doesNotMatch(content, /window\.fetch\s*=/, `The modal ${label} must not wrap transport.`);
  assert.doesNotMatch(content, /document\.createElement\(["']style["']\)/, `The modal ${label} must not generate runtime styles.`);
  assert.doesNotMatch(content, /\.style\.[A-Za-z]+\s*=/, `The modal ${label} must not mutate inline visual styles.`);
}

console.log("Admin modal, nested-dialog, and Player drawer accessibility source contracts passed.");

// The contract payload journey must start after real control binding and its
// initial-focus frame, not just after the form becomes visible.
const { waitForContractCreateReady } = await import("./admin-quality-smoke-fixture.mjs");
let predicate;
let options;
waitForContractCreateReady({ waitForFunction(fn, argument, settings) {
  predicate = fn;
  options = settings;
  assert.equal(argument, null);
} });
assert.equal(options.timeout, 5000, "Contract readiness must remain bounded.");
assert.doesNotMatch(predicate.toString(), /\.focus\s*\(|\.value\s*=(?!=)|setTimeout/, "The barrier must observe, not repair or sleep through, field state.");
const oldDocument = globalThis.document;
const oldWindow = globalThis.window;
const title = { isConnected: true };
let currentTitle = title;
let roots = [];
let frames = [];
const root = { dataset: { controlsBound: "false" }, isConnected: true, querySelector: () => currentTitle };
globalThis.document = { querySelectorAll: () => roots, activeElement: null };
globalThis.window = { requestAnimationFrame: (callback) => frames.push(callback) };
try {
  assert.equal(await predicate(), false, "A missing console must not be ready.");
  roots = [root, root];
  assert.equal(await predicate(), false, "Duplicate consoles must not be ready.");
  roots = [root];
  assert.equal(await predicate(), false, "A visible but unbound console must not be ready.");
  assert.equal(frames.length, 0);
  root.dataset.controlsBound = "true";
  currentTitle = null;
  assert.equal(await predicate(), false, "A missing title must not be ready.");
  currentTitle = title;
  document.activeElement = title; // Earlier accessibility focus is insufficient.
  let settled = false;
  const ready = predicate().then((result) => { settled = true; return result; });
  await new Promise(setImmediate);
  assert.equal(settled, false, "Even an active title must await the binding's focus frame.");
  frames.shift()();
  assert.equal(await ready, true);
  document.activeElement = {};
  const wrongFocus = predicate();
  frames.shift()();
  assert.equal(await wrongFocus, false, "Unrelated focus must not be accepted.");
  const focusAfterFrame = predicate();
  document.activeElement = title;
  frames.shift()();
  assert.equal(await focusAfterFrame, true);
  for (const invalidate of [
    () => { root.isConnected = false; },
    () => { roots = [root, root]; },
    () => { roots = [{ ...root }]; },
    () => { root.dataset.controlsBound = "false"; },
    () => { title.isConnected = false; },
    () => { currentTitle = { isConnected: true }; document.activeElement = currentTitle; },
  ]) {
    root.isConnected = true; roots = [root]; root.dataset.controlsBound = "true";
    title.isConnected = true; currentTitle = title; document.activeElement = title;
    const interrupted = predicate();
    invalidate();
    frames.shift()();
    assert.equal(await interrupted, false, "Detached, replaced, duplicate or unbound consoles must fail after the frame.");
  }
  await assert.rejects(waitForContractCreateReady({ waitForFunction() {
    return Promise.reject(new Error("readiness timeout"));
  } }), /readiness timeout/, "A browser readiness failure must propagate.");
} finally {
  if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
  if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
}
const contractSmoke = await readFile(new URL("./admin-contract-end-to-end-smoke.mjs", import.meta.url), "utf8");
const readinessAt = contractSmoke.indexOf("await waitForContractCreateReady(page)");
assert.ok(readinessAt > contractSmoke.indexOf('await form.waitFor({ state: "visible" })'));
assert.ok(readinessAt < contractSmoke.indexOf('.fill("Contract Wiring Audit")'));
assert.match(contractSmoke, /assert\(payload.title === "Contract Wiring Audit", "Title was not preserved."\)/);
assert.match(contractSmoke, /assert\(writes.length === initialWrites, "Contract editing caused an early write."\)/);
assert.match(contractSmoke, /Initial title entry was redirected/);
assert.match(contractSmoke, /Initial objective entry was redirected/);
console.log("Contract create readiness waits for bound controls and completed initial focus, preserves exact input assertions and rejects stale surfaces.");

// Execute the mounted harness's real pre-boundary sequence with a deterministic
// binding/frame queue. Visibility and bridge close-focus precede Contract binding.
const mountedSmoke = await readFile(new URL("./admin-mounted-operational-modal-focus-smoke.mjs", import.meta.url), "utf8");
const setupStart = mountedSmoke.indexOf('    await modal.waitFor({ state: "visible", timeout: 5000 });');
const setupEnd = mountedSmoke.indexOf("    const bounds = await boundary(modal, true);", setupStart);
assert.ok(setupStart >= 0 && setupEnd > setupStart);
const mountedSetup = mountedSmoke.slice(setupStart, setupEnd) + "return await boundary(modal, true);";
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
async function simulateMountedSetup(setup) {
  const saved = { document: globalThis.document, window: globalThis.window, HTMLElement: globalThis.HTMLElement };
  class Element {}
  const close = { tagName: "BUTTON", getAttribute: () => "close-modal", closest: () => dialog };
  const title = { isConnected: true, tagName: "INPUT", getAttribute: () => null, closest: () => dialog };
  const objective = {};
  const cash = {};
  const last = {};
  const dialog = new Element();
  dialog.contains = (node) => [close, title, objective, last].includes(node);
  const root = { dataset: {}, isConnected: true, querySelector: () => title };
  let queue = [() => {
    root.dataset.controlsBound = "true";
    // Reward setup focuses its cash input before binding queues title focus.
    queue.push(() => { document.activeElement = cash; });
    queue.push(() => { document.activeElement = title; });
  }];
  const advance = () => { const frame = queue; queue = []; frame.forEach(callback => callback()); };
  globalThis.HTMLElement = Element;
  globalThis.document = { querySelector: () => dialog, querySelectorAll: () => [root], activeElement: close };
  globalThis.window = { requestAnimationFrame: callback => queue.push(callback) };
  const page = {
    evaluate: callback => callback(),
    async waitForFunction(callback) {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const result = callback();
        if (result instanceof Promise) advance();
        if (await result) return;
        advance();
      }
      throw new Error("readiness timeout");
    },
  };
  try {
    await new AsyncFunction("page", "modal", "action", "boundary", "waitForContractCreateReady", setup)(
      page, { waitFor: async () => {} }, "add-contract",
      async () => { document.activeElement = last; }, waitForContractCreateReady,
    );
    while (queue.length) advance();
    // The browser Tab starts from the actual owner after queued startup work.
    document.activeElement = document.activeElement === last ? close : objective;
    return document.activeElement === close;
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
}
const mountedBarrier = '    if (action === "add-contract") await waitForContractCreateReady(page);\n';
assert.equal(await simulateMountedSetup(mountedSetup.replace(mountedBarrier, "")), false,
  "Visibility and inside-focus alone must reproduce the queued Contract focus stealing the boundary.");
assert.equal(await simulateMountedSetup(mountedSetup), true,
  "Mounted Contract readiness must complete initial focus before the harness chooses the last control.");
assert.ok(mountedSmoke.includes(mountedBarrier), "Only Contract startup should use the Contract readiness barrier.");
console.log("Mounted Contract boundary ordering reproduces the old race and waits for initial focus without changing wrap assertions.");

await import("./admin-scanner-focus-ownership.test.mjs");

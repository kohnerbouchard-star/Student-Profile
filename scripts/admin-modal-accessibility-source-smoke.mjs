import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

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
// Execute the installed, lockfile-pinned browser polling function itself. An
// async predicate is truthy before resolution in this version; awaiting it in a
// stub would conceal the defect these regressions must catch.
const require = createRequire(import.meta.url);
const playwrightPackage = require.resolve("playwright-core/package.json");
const playwrightVersion = JSON.parse(await readFile(playwrightPackage, "utf8")).version;
const lock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));
assert.equal(playwrightVersion, lock.packages["node_modules/playwright-core"].version);
const playwrightSource = await readFile(new URL("lib/coreBundle.js", pathToFileURL(playwrightPackage)), "utf8");
const pollingStartMarker = "injectedScript.evaluateHandle((injected, { expression:";
const pollingEndMarker = "\n          }, { expression: expression2, isFunction: isFunction2, polling:";
const pollingStart = playwrightSource.indexOf(pollingStartMarker);
const pollingEnd = playwrightSource.indexOf(pollingEndMarker, pollingStart);
assert.ok(pollingStart >= 0 && pollingEnd > pollingStart, "Pinned Playwright polling extraction must be reviewed when its implementation changes.");
const browserPolling = new Function(`return (${playwrightSource.slice(
  pollingStart + "injectedScript.evaluateHandle(".length, pollingEnd,
)}\n});`)();
const flush = () => new Promise(setImmediate);
function pollingPage(enqueue) {
  const handles = [];
  const waits = [];
  const handle = (value) => {
    const result = { value, disposed: false, async dispose() { this.disposed = true; } };
    handles.push(result);
    return result;
  };
  const injected = { utils: { builtins: {
    requestAnimationFrame: enqueue,
    setTimeout: () => assert.fail("Readiness must retain animation-frame polling, not fixed sleeps."),
  } } };
  return {
    handles, waits,
    evaluate: callback => callback(),
    evaluateHandle: async callback => handle(callback()),
    waitForFunction(callback, argument, options) {
      const poll = browserPolling(injected, {
        expression: callback.toString(), isFunction: true,
        arg: argument?.value ?? argument,
      });
      let expire;
      const deadline = new Promise((_, reject) => { expire = () => {
        poll.abort();
        reject(new Error("readiness timeout"));
      }; });
      waits.push({ callback, options, expire });
      // This models Playwright's outer progress deadline, not its predicate.
      // The actual polling implementation above decides truthiness and frames.
      return Promise.race([poll.result, deadline]).then(handle);
    },
    expire() { waits.forEach(wait => wait.expire()); },
  };
}
const oldDocument = globalThis.document;
const oldWindow = globalThis.window;
const title = { isConnected: true };
let currentTitle = title;
let roots = [];
let frames = [];
const root = { dataset: { controlsBound: "false" }, isConnected: true, querySelector: () => currentTitle };
globalThis.document = { querySelectorAll: () => roots, activeElement: null };
globalThis.window = { requestAnimationFrame: (callback) => frames.push(callback) };
const advance = async () => {
  const frame = frames; frames = [];
  frame.forEach(callback => callback());
  await flush();
};
const reset = () => {
  frames = []; roots = [root]; root.isConnected = true;
  root.dataset.controlsBound = "true"; title.isConnected = true;
  currentTitle = title; document.activeElement = title;
};
async function startReadiness(timeoutMs) {
  const page = pollingPage(callback => frames.push(callback));
  const outcome = { settled: false };
  const ready = waitForContractCreateReady(page, timeoutMs);
  ready.then(() => { outcome.settled = true; }, () => { outcome.settled = true; });
  await flush();
  assert.equal(page.waits[0].options.timeout, timeoutMs ?? 5000, "Contract readiness must retain its caller's single bounded deadline.");
  assert.notEqual(page.waits[0].callback.constructor.name, "AsyncFunction", "A Promise must never be used as readiness truthiness.");
  assert.doesNotMatch(page.waits[0].callback.toString(), /\.focus\s*\(|\.value\s*=(?!=)|setTimeout/, "The barrier must observe, not repair or sleep through, field state.");
  return { page, outcome, ready };
}
async function rejectPending(observation, message) {
  assert.equal(observation.outcome.settled, false, message);
  observation.page.expire();
  await assert.rejects(observation.ready, /readiness timeout/, "A browser readiness failure must propagate.");
  assert.ok(observation.page.handles.every(handle => handle.disposed), "Timeout must dispose private observation state.");
}
try {
  const brokenPage = pollingPage(callback => frames.push(callback));
  const falseHandle = await brokenPage.waitForFunction(async () => false, null, { timeout: 5000 });
  assert.equal(falseHandle.value, false, "Pinned Playwright must reproduce the original false-Promise early completion.");
  assert.equal(frames.length, 0, "The original async predicate stops before scheduling a second poll.");
  await falseHandle.dispose();

  for (const [message, invalidate] of [
    ["A missing console must not be ready.", () => { roots = []; }],
    ["Duplicate consoles must not be ready.", () => { roots = [root, root]; }],
    ["A visible but unbound console must not be ready.", () => { root.dataset.controlsBound = "false"; }],
    ["A missing title must not be ready.", () => { currentTitle = null; }],
    ["A disconnected console must not be ready.", () => { root.isConnected = false; }],
    ["A disconnected title must not be ready.", () => { title.isConnected = false; }],
  ]) {
    reset(); invalidate();
    const observation = await startReadiness();
    assert.equal(frames.length, 1, "Only polling, not a candidate focus frame, is scheduled before valid binding.");
    await advance();
    await rejectPending(observation, message);
  }
  reset();
  const alreadyFocused = await startReadiness();
  assert.equal(alreadyFocused.outcome.settled, false, "Even an active title must await the binding's focus frame.");
  await advance();
  await alreadyFocused.ready;
  assert.ok(alreadyFocused.page.handles.every(handle => handle.disposed), "Success must dispose observation and result handles.");

  reset(); document.activeElement = {};
  const wrongFocus = await startReadiness();
  await advance();
  assert.equal(wrongFocus.outcome.settled, false, "Unrelated focus must not be accepted.");
  document.activeElement = title;
  await advance();
  await wrongFocus.ready;

  reset(); root.dataset.controlsBound = "false"; document.activeElement = {};
  const lateBinding = await startReadiness();
  root.dataset.controlsBound = "true";
  await advance();
  assert.equal(lateBinding.outcome.settled, false, "Later binding must start its own frame barrier.");
  document.activeElement = title;
  await advance();
  await lateBinding.ready;

  for (const invalidate of [
    () => { root.isConnected = false; },
    () => { roots = []; },
    () => { roots = [root, root]; },
    () => { roots = [{ ...root }]; },
    () => { root.dataset.controlsBound = "false"; },
    () => { title.isConnected = false; },
    () => { currentTitle = null; },
    () => { currentTitle = { isConnected: true }; document.activeElement = currentTitle; },
  ]) {
    reset();
    const interrupted = await startReadiness();
    invalidate();
    await advance();
    await rejectPending(interrupted, "Detached, replaced, duplicate or unbound consoles must fail after the frame.");
  }

  reset();
  const replaced = await startReadiness();
  roots = [{ ...root }];
  currentTitle = { isConnected: true }; document.activeElement = currentTitle;
  await advance();
  assert.equal(replaced.outcome.settled, false, "The old candidate's frame must not qualify a replacement.");
  await advance();
  await replaced.ready;

  reset();
  const stalled = await startReadiness(37);
  await rejectPending(stalled, "A stalled focus frame must remain pending until the same browser deadline rejects.");
  await advance();
  assert.equal(frames.length, 0, "A timeout must abort polling even when a stale frame later runs.");

  reset();
  const first = await startReadiness();
  const second = await startReadiness();
  assert.notEqual(first.page.handles[0].value, second.page.handles[0].value, "Concurrent calls must not share browser observation state.");
  await rejectPending(first, "One wait can time out independently.");
  await advance();
  await second.ready;
  assert.ok(second.page.handles.every(handle => handle.disposed));

  await assert.rejects(waitForContractCreateReady({ evaluateHandle() {
    return Promise.reject(new Error("observation context closed"));
  } }), /observation context closed/, "Browser context failures must propagate.");
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
  const page = pollingPage(callback => queue.push(callback));
  try {
    let settled = false;
    const running = new AsyncFunction("page", "modal", "action", "boundary", "waitForContractCreateReady", setup)(
      page, { waitFor: async () => {} }, "add-contract",
      async () => { document.activeElement = last; }, waitForContractCreateReady,
    );
    running.then(() => { settled = true; }, () => { settled = true; });
    for (let attempt = 0; !settled && attempt < 8; attempt += 1) {
      await flush();
      if (!settled) advance();
    }
    if (!settled) page.expire();
    await running;
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

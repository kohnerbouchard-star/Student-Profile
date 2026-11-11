import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import { waitForPlayerCreateReady } from "./admin-player-scroll-probe.mjs";
import { harness, flush, SELECTORS } from "./lib/admin-player-readiness-fixture.mjs";
import { runFocusSequence, focusSequence, playerBarrier, operationalSource } from "./lib/admin-operational-modal-focus-fixture.mjs";

const runtime = await readFile(new URL("../admin/modal-accessibility.js", import.meta.url), "utf8");
const trapStart = runtime.indexOf("    function onKeyDown(event) {");
const trapEnd = runtime.indexOf("\n    function onBackdropClick(event) {", trapStart);
assert.ok(trapStart >= 0 && trapEnd > trapStart);
const trapSource = runtime.slice(trapStart, trapEnd);

function setup({ breakTrap = false, breakReverse = false } = {}) {
  const h = harness();
  const close = h.node(), roster = h.node(), last = h.node();
  const controls = [close, h.current.input, roster, last];
  const listeners = new Set();
  const dialog = h.current.modal;
  dialog.contains = node => controls.includes(node);
  dialog.addEventListener = (type, callback) => { assert.equal(type, "focusin"); listeners.add(callback); };
  dialog.removeEventListener = (type, callback) => { assert.equal(type, "focusin"); listeners.delete(callback); };
  for (const node of controls) {
    const original = node.focus;
    node.focus = () => { original.call(node); for (const listener of [...listeners]) listener({ target: node }); };
    node.closest = () => dialog;
  }
  h.document.querySelector = selector => { assert.equal(selector, ".admin-terminal-modal:not([hidden])"); return dialog; };
  Object.assign(h.context, {
    HTMLElement: { [Symbol.hasInstance]: node => node === dialog },
    backdrop: { isConnected: true }, dialog, closed: false, trapFocus: !breakTrap,
    controller: {}, focusableElements: () => controls,
    focusInside: target => (target || close).focus(),
  });
  h.context.stackTop = () => h.context.controller;
  h.context.window.EconovariaAdminModalAccessibility = { focusableElements: () => controls };
  vm.runInContext(`${trapSource}\nglobalThis.trap = onKeyDown;`, h.context);
  const evaluate = (fn, args) => {
    h.context.args = args;
    try { return vm.runInContext(`(${fn.toString()})(...args)`, h.context); }
    finally { delete h.context.args; }
  };
  h.page.evaluate = async (fn, arg) => evaluate(fn, [arg]);
  const modal = { waitFor: async () => {}, evaluate: async (fn, arg) => evaluate(fn, [dialog, arg]) };
  const keys = [];
  h.page.keyboard = { async press(key) {
    keys.push(key);
    // The inherited failure occurs between harness positioning and native Tab.
    // Run the actual queued runtime callback, then the actual modal trap.
    await h.advance();
    const shiftKey = key === "Shift+Tab";
    if (shiftKey && breakReverse) h.context.trapFocus = false;
    const event = { key: "Tab", shiftKey, prevented: false, preventDefault() { this.prevented = true; } };
    h.context.trap(event);
    if (!event.prevented) {
      const next = controls.indexOf(h.document.activeElement) + (shiftKey ? -1 : 1);
      if (next < 0 || next >= controls.length) h.document.activeElement = h.node();
      else controls[next].focus();
    }
  } };
  h.bind();
  h.document.activeElement = close;
  return { h, modal, controls, keys };
}
async function start(h, operation = () => waitForPlayerCreateReady(h.page)) {
  const result = { settled: false };
  result.promise = operation();
  result.promise.then(() => { result.settled = true; }, () => { result.settled = true; });
  await flush();
  return result;
}
async function rejectReadiness(h, result) {
  assert.equal(result.settled, false);
  assert.equal(h.waits.at(-1).options.timeout, 5000);
  assert.notEqual(h.waits.at(-1).callback.constructor.name, "AsyncFunction");
  h.expire();
  await assert.rejects(result.promise, /readiness timeout/);
  assert.ok(h.handles.every(handle => handle.disposed));
}

test("actual direct-entrypoint baseline is red: queued Player focus prevents testing the last-control wrap", async () => {
  const { h, modal, keys, controls } = setup();
  const result = await start(h, () => runFocusSequence(h.page, modal, { baseline: true }));
  await flush();
  assert.deepEqual(keys, ["Tab"]);
  assert.equal(h.document.activeElement, controls[2], "Real runtime focus followed by Tab reaches the interior roster input.");
  assert.equal(h.current.modal.contains(h.document.activeElement), true, "No actual focus escape occurred.");
  assert.equal(result.settled, false, "The unchanged forward boundary assertion must reject the race.");
  h.expire();
  await assert.rejects(result.promise, /readiness timeout/);
});

test("actual smoke readiness precedes positioning and both unchanged trap assertions execute", async () => {
  const { h, modal, keys } = setup();
  const result = await start(h, () => runFocusSequence(h.page, modal));
  assert.deepEqual(keys, []);
  assert.equal(result.settled, false);
  await h.advance();
  const report = await result.promise;
  assert.deepEqual(keys, ["Tab", "Shift+Tab"]);
  assert.equal(report.bounds.activeIsLast, true);
  assert.equal(report.forward.activeIsFirst, true);
  assert.equal(report.reverse.activeIsLast, true);
  assert.equal(report.forward.forwardBoundaryReached, true);
  assert.equal(report.reverse.reverseBoundaryReached, true);
});

test("readiness does not hide an actual broken forward focus trap", async () => {
  const { h, modal, keys } = setup({ breakTrap: true });
  const result = await start(h, () => runFocusSequence(h.page, modal));
  await h.advance(); await flush();
  assert.deepEqual(keys, ["Tab"]);
  assert.equal(h.current.modal.contains(h.document.activeElement), false);
  assert.equal(result.settled, false);
  h.expire(); await assert.rejects(result.promise, /readiness timeout/);
});

test("readiness does not hide an actual broken reverse focus trap", async () => {
  const { h, modal, keys } = setup({ breakReverse: true });
  const result = await start(h, () => runFocusSequence(h.page, modal));
  await h.advance(); await flush(); await flush();
  assert.deepEqual(keys, ["Tab", "Shift+Tab"]);
  assert.equal(h.current.modal.contains(h.document.activeElement), false);
  assert.equal(result.settled, false);
  h.expire(); await assert.rejects(result.promise, /readiness timeout/);
});

test("delayed binding and initial focus remain pending until the bound surface earns its frame", async () => {
  const h = harness();
  const result = await start(h);
  await h.advance(); assert.equal(result.settled, false);
  h.bind(); await h.advance(); assert.equal(result.settled, false);
  await h.advance(); await result.promise;
  assert.equal(h.document.activeElement, h.current.input);
  assert.deepEqual(h.events, ["runtime-focus"], "The helper must never focus anything itself.");
  assert.ok(h.handles.every(handle => handle.disposed));
});

for (const [name, invalidate] of [
  ["missing modal", h => h.setModals([])],
  ["unbound controls", h => { h.current.root.dataset.controlsBound = "false"; }],
  ["missing input", h => h.current.pane.children.set(SELECTORS.input, [])],
  ["hidden surface", h => { h.current.pane.visible = false; }],
  ["wrong focus", h => { h.document.activeElement = h.node(); }],
]) test(`Player operational readiness fails closed for ${name}`, async () => {
  const h = harness(); h.bind(); await h.advance(); invalidate(h);
  const result = await start(h); await h.advance();
  await rejectReadiness(h, result);
});

test("stuck frames use the same bounded 5000ms deadline and dispose the observation", async () => {
  const h = harness(); h.bind(); const result = await start(h);
  await rejectReadiness(h, result);
  await h.advance(); assert.equal(h.pendingFrames, 0);
});

test("replaced bound surface cannot inherit completed readiness from detached nodes", async () => {
  const h = harness(); h.bind(); await h.advance();
  const result = await start(h);
  const old = h.current; h.replace(); h.bind();
  old.modal.isConnected = old.root.isConnected = old.pane.isConnected = old.input.isConnected = false;
  await h.advance(); assert.equal(result.settled, false);
  await h.advance(); await result.promise;
  assert.equal(h.document.activeElement, h.current.input);
  assert.ok(h.handles.every(handle => handle.disposed));
});

for (const change of ["replace", "focus"]) test(`post-readiness ${change} fails exact-surface revalidation`, async () => {
  const h = harness(); h.bind(); await h.advance();
  const originalWait = h.page.waitForFunction;
  h.page.waitForFunction = async (...args) => {
    const result = await originalWait(...args);
    if (change === "replace") { h.replace(); h.bind(); }
    else h.document.activeElement = h.node();
    return result;
  };
  const result = await start(h); await h.advance();
  await assert.rejects(result.promise, /surface changed after readiness/);
  assert.ok(h.handles.every(handle => handle.disposed));
});

test("the seam remains Add Player-only and retains all operational keyboard assertions", () => {
  assert.ok(focusSequence.indexOf(playerBarrier) < focusSequence.indexOf("boundary(modal, true)"));
  for (const retained of [
    'if (action === "add-contract") await waitForContractCreateReady(page);',
    'if (action === "scan-attendance")',
    'Scanner autofocus stole Refocus keyboard focus.',
    'forward.activeIsFirst || forward.forwardBoundaryReached',
    'reverse.activeIsLast || reverse.reverseBoundaryReached',
    'await page.keyboard.press("Escape");',
    'await modal.waitFor({ state: "hidden", timeout: 5000 });',
    'keyboard.modality === "keyboard"', 'keyboard.pointerEvents.length === 0',
    'errors.length === 0', 'expected => document.activeElement?.getAttribute?.("data-admin-terminal-action") === expected',
  ]) assert.ok(operationalSource.includes(retained), `Retain ${retained}`);
});

test("context failure propagates and readiness contains no focus, timeout extension or mutation", async () => {
  await assert.rejects(waitForPlayerCreateReady({ evaluateHandle: async () => { throw new Error("context closed"); } }), /context closed/);
  const source = await readFile(new URL("./admin-player-scroll-probe.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\.focus\(|waitForTimeout|setTimeout|\.scrollTop\s*=(?!=)|\.dataset\.\w+\s*=(?!=)/);
});

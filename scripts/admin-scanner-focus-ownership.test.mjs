import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import {
  originalScannerFocus,
  guardedScannerFocus,
  guardedScannerBinding,
  normalizeScannerFocusSource,
} from "./admin-scanner-focus-patch-contract.mjs";

const source = readFileSync(new URL("../admin/dist/admin-overview-terminal.js", import.meta.url), "utf8");
const sourceStart = source.indexOf("  function getActiveScannerInput() {");
const runtime = source.slice(sourceStart, source.indexOf("  function scheduleAutoScannerCapture(input) {", sourceStart));
assert.equal(runtime, guardedScannerFocus, "Execute the real runtime focus implementation, not a test copy.");

function fixture(code = runtime) {
  const frames = [];
  const focusCalls = [];
  const document = { body: {}, activeElement: null };
  let owner = null;
  const elements = new Map();
  const dialog = { contains: (node) => node === dialog || node === consoleRoot || [...elements.values()].includes(node) };
  const consoleRoot = {
    isConnected: true, dataset: { scanMode: "auto" },
    contains: (node) => [...elements.values()].includes(node),
    querySelector: (selector) => elements.get(selector) || null,
    closest: (selector) => selector === ".admin-terminal-modal" ? dialog : null,
  };
  let current = consoleRoot;
  document.querySelector = () => current;
  const make = (selector, panel = null) => {
    const attributes = new Map();
    const node = {
      isConnected: true, disabled: false, style: {}, dataset: {}, classList: { remove() {} },
      setAttribute: (key, value) => { attributes.set(key, value); },
      matches: (selectors) => selectors.split(", ").includes(selector),
      closest: (selectors) => {
        if (selectors.includes("[inert]") && consoleRoot.inert) return consoleRoot;
        if (selectors.includes("[hidden]") && panel?.hidden) return panel;
        return null;
      },
      focus: () => { document.activeElement = node; focusCalls.push(selector); },
    };
    let hidden = false;
    Object.defineProperty(node, "hidden", {
      get: () => hidden,
      set: (value) => {
        hidden = value;
        if (value && document.activeElement?.panel === node) document.activeElement = document.body;
      },
    });
    node.panel = panel;
    elements.set(selector, node);
    return node;
  };
  const autoPanel = make("[data-admin-terminal-auto-panel]");
  const manualPanel = make("[data-admin-terminal-manual-panel]");
  manualPanel.hidden = true;
  const auto = make("[data-admin-terminal-auto-scan-input]", autoPanel);
  const manual = make("[data-admin-terminal-manual-scan-input]", manualPanel);
  const autoButton = make('[data-admin-terminal-set-mode="auto"]');
  const manualButton = make('[data-admin-terminal-set-mode="manual"]');
  const refocus = make('[data-admin-terminal-action="refocus-attendance-scanner"]');
  const close = make('[data-admin-terminal-action="close-modal"]');
  make("[data-admin-terminal-mode-label]");
  make("[data-admin-terminal-scanner-state]");
  const opener = {};
  document.activeElement = opener;
  const context = vm.createContext({
    document,
    window: {
      requestAnimationFrame: (callback) => frames.push(callback), clearTimeout() {},
      Econovaria: { features: { adminOverviewTerminal: {} } },
      EconovariaAdminModalAccessibility: { getActiveController: () => owner },
    },
  });
  vm.runInContext(`${code}\nglobalThis.setMode = setScannerMode; globalThis.refocus = focusActiveScannerInput;`, context);
  return {
    document, auto, manual, autoButton, manualButton, refocus, close, opener, consoleRoot, dialog, focusCalls,
    setMode: context.setMode, focus: context.refocus,
    flush: () => { while (frames.length) frames.shift()(); },
    flushOne: () => frames.shift()(),
    replace: () => { current = { ...consoleRoot }; },
    setOwner: (value) => { owner = value; },
  };
}

let cases = 0;
function check(name, run) { run(); cases += 1; console.log(`Scanner focus: ${name}`); }
check("the original callback reproduces newer Refocus theft", () => {
  const f = fixture(originalScannerFocus);
  f.setMode("auto", { preserveFocus: true }); f.document.activeElement = f.refocus; f.flush();
  assert.equal(f.document.activeElement, f.auto);
});
check("the original delayed binding also steals already-chosen Refocus", () => {
  const f = fixture(originalScannerFocus);
  f.document.activeElement = f.refocus; f.setMode("auto", { preserveFocus: true }); f.flush();
  assert.equal(f.document.activeElement, f.auto);
});
for (const mode of ["auto", "manual"]) {
  check(`initial ${mode} autofocus remains`, () => {
    const f = fixture(); f.setMode(mode, { preserveFocus: true }); f.flush();
    assert.equal(f.document.activeElement, f[mode]);
  });
  check(`explicit ${mode} selection focuses its input`, () => {
    const f = fixture(); f.document.activeElement = f[`${mode}Button`]; f.setMode(mode); f.flush();
    assert.equal(f.document.activeElement, f[mode]);
  });
}
for (const target of ["refocus", "close", "manualButton"]) {
  for (const beforeBinding of [false, true]) {
    check(`${target} focus selected ${beforeBinding ? "before binding" : "after queueing"} wins`, () => {
      const f = fixture();
      if (beforeBinding) f.document.activeElement = f[target];
      f.setMode("auto", { preserveFocus: true });
      f.document.activeElement = f[target]; f.flush();
      assert.equal(f.document.activeElement, f[target]); assert.equal(f.focusCalls.length, 0);
    });
  }
}
check("explicit mode switch survives browser blur of the newly hidden old input", () => {
  const f = fixture(); f.document.activeElement = f.auto; f.setMode("manual");
  assert.equal(f.document.activeElement, f.document.body); f.flush();
  assert.equal(f.document.activeElement, f.manual);
});
check("explicit mode switch loses to a newer focus choice", () => {
  const f = fixture(); f.document.activeElement = f.manualButton; f.setMode("manual");
  f.document.activeElement = f.close; f.flush(); assert.equal(f.document.activeElement, f.close);
});
check("explicit Refocus wins over an older initial request", () => {
  const f = fixture(); f.setMode("auto", { preserveFocus: true }); f.document.activeElement = f.refocus; f.focus();
  f.flushOne(); assert.equal(f.focusCalls.length, 0); f.flush();
  assert.equal(f.document.activeElement, f.auto); assert.equal(f.focusCalls.length, 1);
});
check("queued Refocus also loses to newer keyboard focus", () => {
  const f = fixture(); f.document.activeElement = f.refocus; f.focus(); f.document.activeElement = f.close; f.flush();
  assert.equal(f.document.activeElement, f.close); assert.equal(f.focusCalls.length, 0);
});
check("auto to manual to auto keeps only the last request", () => {
  const f = fixture(); f.setMode("auto"); f.setMode("manual"); f.setMode("auto");
  f.flushOne(); f.flushOne(); assert.equal(f.focusCalls.length, 0); f.flush();
  assert.equal(f.document.activeElement, f.auto); assert.equal(f.focusCalls.length, 1);
});
for (const [name, invalidate] of [
  ["removed scanner", (f) => { f.consoleRoot.isConnected = false; }],
  ["removed input", (f) => { f.auto.isConnected = false; }],
  ["replaced scanner", (f) => f.replace()],
  ["changed mode", (f) => { f.consoleRoot.dataset.scanMode = "manual"; }],
  ["disabled input", (f) => { f.auto.disabled = true; }],
  ["inert scanner", (f) => { f.consoleRoot.inert = true; }],
  ["nested modal", (f) => f.setOwner({ dialog: {} })],
]) {
  check(`${name} invalidates pending focus`, () => {
    const f = fixture(); f.setMode("auto", { preserveFocus: true }); invalidate(f); f.flush();
    assert.equal(f.document.activeElement, f.opener); assert.equal(f.focusCalls.length, 0);
  });
}
check("the current modal owner permits normal focus", () => {
  const f = fixture(); f.setOwner({ dialog: f.dialog }); f.setMode("auto", { preserveFocus: true }); f.flush();
  assert.equal(f.document.activeElement, f.auto);
});

const gitBlobSha = (content) => createHash("sha1").update(`blob ${Buffer.byteLength(content)}\0`).update(content).digest("hex");
const acceptedHash = "763f6c1af68eb985a77f36fed412a2ec7e6e819d";
check("exact runtime correction reconstructs the original immutable terminal", () => {
  assert.equal(gitBlobSha(normalizeScannerFocusSource(source)), acceptedHash);
});
for (const [name, mutated] of [
  ["changed focus guard", source.replace("request !== scannerFocusRequest", "request === scannerFocusRequest")],
  ["missing passive binding", source.replace(guardedScannerBinding, "")],
  ["duplicated focus block", source + guardedScannerFocus],
  ["duplicated passive binding", source + guardedScannerBinding],
]) {
  check(`${name} fails the exact integrity exception`, () => assert.throws(() => normalizeScannerFocusSource(mutated)));
}
check("unrelated terminal drift still fails its historical hash", () => {
  const mutated = source.replace('"admin-overview-terminal-style-v47"', '"unauthorized-style-drift"');
  assert.notEqual(gitBlobSha(normalizeScannerFocusSource(mutated)), acceptedHash);
});
const audit = readFileSync(new URL("./admin-v606-full-drift-audit.mjs", import.meta.url), "utf8");
for (const [path, hash] of [
  ["admin/css/admin-overview-terminal.css", "7a609ccff33d61fee96d2ea944e0d1a6059a6081"],
  ["admin/css/page-shell.css", "a9644c2af3d2851f49c5f0354ed80d31784cf397"],
  ["admin/css/admin-overview-integrity.css", "887ae8ffaff27e9013093f6aae92529134b80c18"],
]) {
  check(`${path} retains its original audit and exact bytes`, () => {
    assert.ok(audit.includes(`"${path}": "${hash}"`));
    assert.equal(gitBlobSha(readFileSync(new URL(`../${path}`, import.meta.url), "utf8")), hash);
  });
}
assert.ok(source.includes(guardedScannerBinding));
console.log(`Scanner focus ownership and immutable-baseline regressions passed: ${cases} cases.`);

#!/usr/bin/env node
// Source-bound synthetic Chromium proof. No account, backend or student fixture.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { bindSource } from "./lib/admin-player-readiness-fixture.mjs";
import { runFocusSequence, focusSequence, boundaryHelpers } from "./lib/admin-operational-modal-focus-fixture.mjs";
import { waitForPlayerCreateReady } from "./admin-player-scroll-probe.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const inputs = [
  "admin/dist/admin-overview-terminal.js", "admin/modal-accessibility.js", "admin/keyboard-navigation.js",
  "package-lock.json", "scripts/admin-player-scroll-probe.mjs",
  "scripts/lib/admin-player-readiness-fixture.mjs", "scripts/lib/admin-operational-modal-focus-fixture.mjs",
  "scripts/admin-mounted-operational-modal-focus-smoke.mjs", "scripts/admin-mounted-modal-focus-reconciled-smoke.mjs",
  "scripts/admin-operational-modal-readiness-browser.mjs",
];
const git = args => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const sourceSha = git(["rev-parse", "HEAD"]);
assert.match(sourceSha, /^[0-9a-f]{40}$/);
if (process.env.ADMIN_FOCUS_SOURCE_SHA) assert.equal(sourceSha, process.env.ADMIN_FOCUS_SOURCE_SHA);
git(["ls-files", "--error-unmatch", "--", ...inputs]);
assert.equal(git(["status", "--porcelain", "--untracked-files=all", "--", ...inputs]), "", "Proof inputs must match committed source");
const digest = value => createHash("sha256").update(value).digest("hex");
const evidence = { sourceSha, sourceTree: git(["rev-parse", "HEAD^{tree}"]),
  inputSha256: Object.fromEntries(await Promise.all(inputs.map(async file => [file, digest(await readFile(new URL(`../${file}`, import.meta.url)))]))),
  focusSequenceSha256: digest(focusSequence), boundaryHelpersSha256: digest(boundaryHelpers),
  bindingSha256: digest(bindSource), nativeChromium: true, cases: [], passed: false };
const output = new URL("../admin-browser-smoke-artifacts/player-modal-readiness/", import.meta.url);
const modalRuntime = await readFile(new URL("../admin/modal-accessibility.js", import.meta.url), "utf8");
const keyboardRuntime = await readFile(new URL("../admin/keyboard-navigation.js", import.meta.url), "utf8");
const browser = await chromium.launch({ headless: true });
const errors = [];

async function fixture() {
  const page = await browser.newPage();
  page.on("pageerror", () => errors.push("pageerror"));
  await page.route("**/*", route => { errors.push("unexpected-network"); return route.abort(); });
  await page.setContent(`<!doctype html><html><body>
    <button id="opener" data-admin-terminal-action="add-player">Add Player</button>
    <div id="backdrop"><section class="admin-terminal-modal" aria-label="Synthetic Player dialog">
      <button id="close">Close</button>
      <div data-admin-terminal-player-console><div class="admin-terminal-player-main">
        <input id="display-name" data-admin-terminal-player-display-name aria-label="Display name">
        <input id="roster" aria-label="Roster label">
        <button id="create" data-admin-terminal-action="create-player">Create Player</button>
      </div></div>
    </section></div>
  </body></html>`);
  await page.addScriptTag({ content: modalRuntime });
  await page.addScriptTag({ content: keyboardRuntime });
  await page.addScriptTag({ content: `const updatePlayerPreview = () => {};\n${bindSource}` });
  await page.evaluate(() => {
    const dialog = document.querySelector(".admin-terminal-modal");
    const opener = document.querySelector("#opener");
    opener.focus();
    window.EconovariaAdminModalAccessibility.activate({
      backdrop: document.querySelector("#backdrop"), dialog, opener,
    });
    document.querySelector("#close").focus();
    window.fixture = { release: false, completed: false, delayedFrames: 0, pointerEvents: 0 };
    for (const type of ["pointerdown", "mousedown", "touchstart"]) {
      document.addEventListener(type, () => { window.fixture.pointerEvents++; }, true);
    }
    // Delay only this synthetic binding's real initial-focus callback. Restore
    // native scheduling immediately; the tested observer and trap are untouched.
    const nativeFrame = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => nativeFrame(function delayed(time) {
      window.fixture.delayedFrames++;
      if (!window.fixture.release) return nativeFrame(delayed);
      callback(time);
      window.fixture.completed = true;
    });
    try { bindPlayerModalControls(document.querySelector("#backdrop")); }
    finally { window.requestAnimationFrame = nativeFrame; }
  });
  return { page, modal: page.locator(".admin-terminal-modal") };
}
async function release(page) {
  await page.evaluate(() => { window.fixture.release = true; });
  await page.waitForFunction(() => window.fixture.completed, null, { timeout: 5000 });
}
try {
  {
    const { page, modal } = await fixture();
    const facade = {
      evaluate: page.evaluate.bind(page), waitForFunction: page.waitForFunction.bind(page),
      keyboard: { async press(key) { await release(page); await page.keyboard.press(key); } },
    };
    await assert.rejects(runFocusSequence(facade, modal, { baseline: true }), error => error.name === "TimeoutError");
    const state = await page.evaluate(() => ({
      inside: document.querySelector(".admin-terminal-modal").contains(document.activeElement),
      roster: document.activeElement === document.querySelector("#roster"),
      completed: window.fixture.completed,
    }));
    assert.deepEqual(state, { inside: true, roster: true, completed: true });
    evidence.cases.push({ baselineForwardRejected: true, initialFocusCompleted: true, activeStayedInside: true });
    await page.close();
  }
  {
    const { page, modal } = await fixture();
    let entered;
    const started = new Promise(resolve => { entered = resolve; });
    let settled = false;
    const running = runFocusSequence(page, modal, { wait: async target => {
      entered(); return waitForPlayerCreateReady(target);
    } });
    running.then(() => { settled = true; }, () => { settled = true; });
    await started;
    const previous = await page.evaluate(() => window.fixture.delayedFrames);
    await page.waitForFunction(before => window.fixture.delayedFrames >= before + 2, previous, { timeout: 5000 });
    assert.equal(settled, false, "The actual smoke must remain pending while runtime focus is delayed");
    assert.equal(await page.evaluate(() => document.activeElement.id), "close");
    await release(page);
    const result = await running;
    assert.equal(result.bounds.activeIsLast, true);
    assert.equal(result.forward.activeIsFirst, true);
    assert.equal(result.reverse.activeIsLast, true);
    assert.equal(await modal.getAttribute("role"), "dialog");
    assert.equal(await modal.getAttribute("aria-modal"), "true");
    await page.keyboard.press("Escape");
    await modal.waitFor({ state: "hidden", timeout: 5000 });
    await page.waitForFunction(() => document.activeElement.id === "opener", null, { timeout: 5000 });
    const keyboard = await page.evaluate(() => ({
      modality: document.documentElement.getAttribute("data-admin-input-modality"),
      pointers: window.fixture.pointerEvents,
    }));
    assert.deepEqual(keyboard, { modality: "keyboard", pointers: 0 });
    evidence.cases.push({ delayedInitialFocusWaited: true, forwardWrapped: true, reverseWrapped: true,
      escaped: true, openerRestored: true, accessibleDialog: true, keyboardOnly: true });
    await page.close();
  }
  {
    const { page } = await fixture();
    const started = performance.now();
    await assert.rejects(waitForPlayerCreateReady(page), error => error.name === "TimeoutError");
    const elapsedMs = Math.round(performance.now() - started);
    assert.ok(elapsedMs >= 4900 && elapsedMs < 10000, `Readiness must retain its bounded deadline: ${elapsedMs}`);
    assert.equal(await page.evaluate(() => window.fixture.completed), false);
    evidence.cases.push({ neverFocusedRejected: true, elapsedMs, timeoutMs: 5000 });
    await page.close();
  }
  assert.deepEqual(errors, []);
  evidence.passed = true;
} finally {
  evidence.browserErrorCount = errors.length;
  await browser.close();
  await mkdir(output, { recursive: true });
  await writeFile(new URL("qualification.json", output), `${JSON.stringify(evidence, null, 2)}\n`);
}
console.log(JSON.stringify(evidence));

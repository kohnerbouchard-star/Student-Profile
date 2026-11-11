import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { waitForPlayerCreateReady } from "../admin-player-scroll-probe.mjs";

export const operationalSource = await readFile(new URL("../admin-mounted-operational-modal-focus-smoke.mjs", import.meta.url), "utf8");
const entry = await readFile(new URL("../admin-mounted-modal-focus-reconciled-smoke.mjs", import.meta.url), "utf8");
// The actual Shell entrypoint imports this source directly. Do not accidentally
// certify the older, unused wrapper's transformed/relaxed scanner assertions.
assert.equal(entry, 'import "./admin-mounted-operational-modal-focus-smoke.mjs";\nimport "./admin-terminal-permission-source-diagnostic.mjs";\n');
export const playerBarrier = '    if (action === "add-player") await waitForPlayerCreateReady(page);\n';
assert.equal(operationalSource.split(playerBarrier).length, 2);
const section = (start, end) => {
  const from = operationalSource.indexOf(start), to = operationalSource.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Missing operational smoke source boundary: ${start}`);
  return operationalSource.slice(from, to);
};
export const boundaryHelpers = section("async function boundary(", "\nasync function exercise(");
export const focusSequence = section('    await modal.waitFor({ state: "visible", timeout: 5000 });', '    await page.keyboard.press("Escape");');
const helpers = new Function(`${boundaryHelpers}\nreturn { boundary, waitForBoundaryFocus, traceBoundary };`)();
export const { boundary, waitForBoundaryFocus, traceBoundary } = helpers;
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
export function runFocusSequence(page, modal, { baseline = false, wait = waitForPlayerCreateReady } = {}) {
  const source = baseline ? focusSequence.replace(playerBarrier, "") : focusSequence;
  return new AsyncFunction("page", "modal", "action", "waitForPlayerCreateReady", "waitForContractCreateReady",
    "assert", "boundary", "waitForBoundaryFocus", "traceBoundary", `${source}\nreturn { initial, bounds, forward, reverse };`)(
    page, modal, "add-player", wait, () => { throw new Error("Player must not use Contract readiness"); },
    (value, message) => assert.ok(value, message), boundary, waitForBoundaryFocus, traceBoundary,
  );
}

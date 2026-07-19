import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../admin/modal-accessibility.js", import.meta.url), "utf8");
const bridge = await readFile(new URL("../admin/modal-lifecycle-bridge.js", import.meta.url), "utf8");
const index = await readFile(new URL("../admin/index.html", import.meta.url), "utf8");

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
assert.match(bridge, /action instanceof HTMLElement && !closeControl/, "Nested modal actions must remain eligible as child restoration openers.");
assert.doesNotMatch(bridge, /action instanceof HTMLElement && !action\.closest\(DIALOG_SELECTOR\)/, "Actions inside parent dialogs must not be excluded from child opener capture.");
assert.match(bridge, /requestAnimationFrame\(\(\) => window\.requestAnimationFrame\(reconcile\)\)/, "Modal binding must reconcile after mounted renderer frames.");
assert.ok(index.includes("import('./modal-lifecycle-bridge.js').then(() =&gt; import('./keyboard-navigation.js'))"), "Admin index must load the modal lifecycle bridge before keyboard navigation.");

for (const [label, content] of [["controller", source], ["bridge", bridge]]) {
  assert.doesNotMatch(content, /MutationObserver/, `The modal ${label} must not add DOM observation.`);
  assert.doesNotMatch(content, /window\.fetch\s*=/, `The modal ${label} must not wrap transport.`);
  assert.doesNotMatch(content, /document\.createElement\(["']style["']\)/, `The modal ${label} must not generate runtime styles.`);
  assert.doesNotMatch(content, /\.style\.[A-Za-z]+\s*=/, `The modal ${label} must not mutate inline visual styles.`);
}

console.log("Admin modal accessibility and lifecycle bridge source contracts passed.");

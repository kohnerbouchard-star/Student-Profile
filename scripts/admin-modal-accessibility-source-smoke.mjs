import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../admin/modal-accessibility.js", import.meta.url), "utf8");

for (const required of [
  "controllerStack",
  "document.addEventListener(\"focusin\"",
  "parentController?.suspend?.()",
  "parent?.resume?.()",
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
assert.match(source, /focusInside\(lastFocusedInside\)/, "Blocked dismissal and nested resume must retain the last valid focus target.");

assert.doesNotMatch(source, /MutationObserver/, "The modal controller must not add DOM observation.");
assert.doesNotMatch(source, /window\.fetch\s*=/, "The modal controller must not wrap transport.");
assert.doesNotMatch(source, /document\.createElement\(["']style["']\)/, "The modal controller must not generate runtime styles.");
assert.doesNotMatch(source, /\.style\.[A-Za-z]+\s*=/, "The modal controller must not mutate inline visual styles.");

console.log("Admin modal accessibility source contracts passed.");

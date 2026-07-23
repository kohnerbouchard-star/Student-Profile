import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/core/dom.js", import.meta.url), "utf8");

assert.doesNotMatch(
  source,
  /\b(?:innerHTML|outerHTML|insertAdjacentHTML)\b/,
  "Player processing controls must not construct HTML strings.",
);
assert.match(source, /textContent\s*=/, "Processing labels must be assigned as text.");
assert.match(source, /replaceChildren\(/, "Button contents must be replaced with DOM nodes.");
assert.match(source, /cloneNode\(true\)/, "The original button contents must be restored structurally.");
assert.match(source, /setAttribute\("aria-busy",\s*"true"\)/, "Processing state must remain accessible.");
assert.match(source, /removeAttribute\("aria-busy"\)/, "Processing cleanup must remove busy state.");

console.log("Player DOM safety contract passed.");

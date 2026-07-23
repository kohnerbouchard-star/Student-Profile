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
assert.match(source, /const previousNodes = \[\.\.\.button\.childNodes\]/, "The original button nodes must be retained by identity.");
assert.doesNotMatch(source, /cloneNode\(/, "Processing cleanup must not replace original child-node identities.");
assert.match(source, /button\.replaceChildren\(\.\.\.previousNodes\)/, "The exact original button nodes must be restored.");
assert.match(source, /setAttribute\("aria-busy",\s*"true"\)/, "Processing state must remain accessible.");
assert.match(source, /removeAttribute\("aria-busy"\)/, "Processing cleanup must remove busy state.");

console.log("Player DOM safety contract passed.");

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const indexPath = "admin/index.html";
const guardPath = "admin/modal-focus-order-guard.js";

test("modal accessibility and focus ordering load before the preserved terminal bundle", async () => {
  const html = await readFile(indexPath, "utf8");
  const accessibilityIndex = html.indexOf('./modal-accessibility.js');
  const guardIndex = html.indexOf('./modal-focus-order-guard.js');
  const bundleIndex = html.indexOf('./dist/admin-overview-terminal.js');

  assert.ok(accessibilityIndex >= 0, "Modal accessibility script is missing.");
  assert.ok(guardIndex > accessibilityIndex, "Focus-order guard must load after the shared modal controller.");
  assert.ok(bundleIndex > guardIndex, "Focus-order guard must load before the preserved terminal bundle.");
  assert.equal(html.match(/\.\/modal-accessibility\.js/gu)?.length, 1);
  assert.equal(html.match(/\.\/modal-focus-order-guard\.js/gu)?.length, 1);
});

test("focus guard is narrowly scoped to bundle-owned inert background transitions", async () => {
  const source = await readFile(guardPath, "utf8");

  assert.match(source, /data-admin-terminal-was-inert/u);
  assert.match(source, /focusDialogBeforeBackgroundInert\(this\)/u);
  assert.match(source, /descriptor\.set\.call\(this, value\)/u);
  assert.match(source, /normalizedName === "aria-hidden"/u);
  assert.match(source, /this\.hasAttribute\(BUNDLE_INERT_MARKER\)/u);
  assert.match(source, /this\.inert === true/u);
  assert.match(source, /!background\.contains\(element\)/u);
  assert.doesNotMatch(source, /querySelectorAll\("\[aria-hidden='true'\]"\)/u);
  assert.doesNotMatch(source, /removeAttribute\("aria-hidden"\)/u);
});

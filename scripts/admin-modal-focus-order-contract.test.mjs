import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const indexPath = "admin/index.html";
const guardPath = "admin/modal-focus-order-guard.js";

test("focus ordering loads before the preserved terminal bundle without moving shared modal ownership", async () => {
  const html = await readFile(indexPath, "utf8");
  const authIndex = html.indexOf('./admin-auth.js');
  const guardIndex = html.indexOf('./modal-focus-order-guard.js');
  const bundleIndex = html.indexOf('./dist/admin-overview-terminal.js');
  const credentialBridgeIndex = html.indexOf('./player-access-code-bridge.js');
  const accessibilityIndex = html.indexOf('./modal-accessibility.js');

  assert.ok(authIndex >= 0, "Admin authentication script is missing.");
  assert.ok(guardIndex > authIndex, "Focus-order guard must load after Admin authentication.");
  assert.ok(bundleIndex > guardIndex, "Focus-order guard must load before the preserved terminal bundle.");
  assert.ok(
    accessibilityIndex > credentialBridgeIndex,
    "Shared modal accessibility must retain its canonical shell position.",
  );
  assert.equal(html.match(/\.\/modal-accessibility\.js/gu)?.length, 1);
  assert.equal(html.match(/\.\/modal-focus-order-guard\.js/gu)?.length, 1);
});

test("focus guard changes only the inert transition and leaves the global attribute API intact", async () => {
  const source = await readFile(guardPath, "utf8");

  assert.match(source, /focusDialogBeforeBackgroundInert\(this\)/u);
  assert.match(source, /descriptor\.set\.call\(this, value\)/u);
  assert.match(source, /descriptorOwner\(HTMLElement\.prototype, "inert"\)/u);
  assert.match(source, /!background\.contains\(element\)/u);
  assert.match(source, /dialog\.contains\(document\.activeElement\)/u);
  assert.doesNotMatch(source, /Element\.prototype\.setAttribute\s*=/u);
  assert.doesNotMatch(source, /removeAttribute\("aria-hidden"\)/u);
  assert.doesNotMatch(source, /data-admin-terminal-was-inert/u);
});

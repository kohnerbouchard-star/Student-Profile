import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../frontend/src/core/admin-game-selection.js", import.meta.url), "utf8");

function install(name = "") {
  const window = { name };
  vm.runInNewContext(source, { window });
  return window;
}

test("selected game is tab-scoped and validated without Web Storage", () => {
  const window = install();
  const id = "50b44055-4958-441c-81b5-851d79214cd6";
  assert.equal(window.EconovariaAdminGameSelection.write(id), id);
  assert.equal(window.EconovariaAdminGameSelection.read(), id);
  assert.match(window.name, /^econovaria:admin-game:v1:/);
  window.EconovariaAdminGameSelection.clear();
  assert.equal(window.name, "");
});

test("invalid or foreign window.name content is not accepted", () => {
  assert.equal(install("https://untrusted.example/").EconovariaAdminGameSelection.read(), "");
  const window = install("econovaria:admin-game:v1:<script>");
  assert.equal(window.EconovariaAdminGameSelection.read(), "");
  assert.equal(window.name, "");
});

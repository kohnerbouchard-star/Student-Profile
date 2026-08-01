import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../frontend/src/core/admin-game-selection.js", import.meta.url), "utf8");

function install(
  href = "https://econovaria.example/admin/",
  name = "",
) {
  const location = { href };
  const history = {
    state: null,
    replaceState(state, _title, destination) {
      this.state = state;
      location.href = String(destination);
    },
  };
  const window = { location, history, name, URL };
  vm.runInNewContext(source, { window, URL });
  return window;
}

test("selected game is explicit route state and validated without Web Storage", () => {
  const window = install();
  const id = "50b44055-4958-441c-81b5-851d79214cd6";
  assert.equal(window.EconovariaAdminGameSelection.write(id), id);
  assert.equal(window.EconovariaAdminGameSelection.read(), id);
  assert.equal(new URL(window.location.href).searchParams.get("game"), id);
  window.EconovariaAdminGameSelection.clear();
  assert.equal(new URL(window.location.href).searchParams.has("game"), false);
});

test("urlFor transfers the selected game to an Admin destination", () => {
  const window = install("https://econovaria.example/?mode=admin");
  const id = "50b44055-4958-441c-81b5-851d79214cd6";
  const destination = window.EconovariaAdminGameSelection.urlFor(
    id,
    "https://econovaria.example/admin/",
  );
  assert.equal(destination, `https://econovaria.example/admin/?game=${id}`);
  assert.equal(window.location.href, "https://econovaria.example/?mode=admin");
});

test("legacy tab transfer is consumed once and migrated into the URL", () => {
  const id = "50b44055-4958-441c-81b5-851d79214cd6";
  const window = install(
    "https://econovaria.example/admin/",
    `econovaria:admin-game:v1:${id}`,
  );
  assert.equal(window.EconovariaAdminGameSelection.read(), id);
  assert.equal(window.name, "");
  assert.equal(new URL(window.location.href).searchParams.get("game"), id);
});

test("invalid route and legacy content are not accepted", () => {
  assert.equal(
    install("https://econovaria.example/admin/?game=%3Cscript%3E")
      .EconovariaAdminGameSelection.read(),
    "",
  );
  const legacy = install(
    "https://econovaria.example/admin/",
    "econovaria:admin-game:v1:<script>",
  );
  assert.equal(legacy.EconovariaAdminGameSelection.read(), "");
  assert.equal(legacy.name, "");
  const window = install();
  assert.throws(
    () => window.EconovariaAdminGameSelection.write("<script>"),
    /invalid/i,
  );
});

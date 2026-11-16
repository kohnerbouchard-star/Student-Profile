import "./settings-presenter-source.test.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { browserModuleDependencies } from "./lib/browser-module-source.mjs";

const classicEntries = Object.entries(browserModuleDependencies)
  .filter(([owner]) => !owner.includes("/v2/") && !owner.startsWith("player-terminal/"));

for (const [owner, dependencies] of classicEntries) {
  test(`${owner}: extracted definitions are inert and preserve named function identities`, () => {
    const runtime = {};
    const context = vm.createContext({ window: runtime });
    for (const file of dependencies) {
      const before = new Set(Object.keys(runtime));
      // No DOM, timers, fetch, or storage exists until the owning script boots.
      vm.runInContext(readFileSync(file, "utf8"), context, { filename: file });
      const names = Object.keys(runtime).filter(name => !before.has(name));
      assert.equal(names.length, 1, `${file} must install only its dependency factory`);
      const members = runtime[names[0]](new Proxy({}, { get: () => undefined }));
      for (const [name, member] of Object.entries(members)) {
        assert.equal(typeof member, "function", `${file}: ${name}`);
        assert.equal(member.name, name);
      }
    }
  });
}

test("classic HTML dependencies retain synchronous and deferred ordering", () => {
  for (const html of ["index.html", "admin/index.html"]) {
    const source = readFileSync(html, "utf8");
    const scripts = [...source.matchAll(/<script([^>]+)src="([^"]+)"[^>]*><\/script>/g)];
    for (const [owner, dependencies] of classicEntries) {
      const ref = html === "index.html" ? owner : `./${path.posix.relative("admin", owner)}`;
      const index = scripts.findIndex(match => match[2] === ref);
      if (index < 0) continue;
      const expected = dependencies.map(file => html === "index.html" ? file : `./${path.posix.relative("admin", file)}`);
      assert.deepEqual(scripts.slice(index - expected.length, index).map(match => match[2]), expected);
      for (const dependency of scripts.slice(index - expected.length, index)) {
        assert.equal(dependency[1].includes("defer"), scripts[index][1].includes("defer"));
        assert.equal(dependency[1].includes("async"), false);
      }
    }
  }
});

test("dynamic owners await dependencies before beginning their original boot", () => {
  for (const [loader, owner] of [
    ["admin/world-runtime-console-loader.js", "admin/world-runtime-console.js"],
    ["admin/inventory-redemption-queue-loader.js", "admin/inventory-redemption-queue-surface.js"],
  ]) {
    const source = readFileSync(loader, "utf8");
    const refs = [...browserModuleDependencies[owner], owner].map(file => `await import("./${path.posix.basename(file)}");`);
    let previous = -1;
    for (const ref of refs) {
      const current = source.indexOf(ref);
      assert.ok(current > previous, `${loader}: ${ref} must remain ordered`);
      previous = current;
    }
  }
  const bootstrap = readFileSync("admin/admin-bootstrap.js", "utf8");
  assert.match(bootstrap, /"\.\/settings-copy\.js",\s*"\.\/settings-presentation\.js",\s*"\.\/settings-simplified\.js"/);
  assert.match(bootstrap, /for \(const modulePath of phase\.modules\)/);
});

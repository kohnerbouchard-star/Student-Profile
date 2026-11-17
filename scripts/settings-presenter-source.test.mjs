import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { browserModuleDependencies } from "./lib/browser-module-source.mjs";
import { readSettingsPresenterSource, settingsPresenterSourceFiles } from "./lib/settings-presenter-source.mjs";

const root = path.resolve(import.meta.dirname, "..");
const script = readFileSync(path.join(root, "scripts/admin-settings-disclosure-smoke.mjs"), "utf8");
const start = script.indexOf("  if (\n    /forceAutomaticAttendancePolicy/.test(presenterText)");
const end = script.indexOf("  const attendanceSource", start);
assert.ok(start >= 0 && end > start, "The unchanged Settings negative probe must remain identifiable.");
const probe = new Function("presenterText", script.slice(start, end));
const files = new Map(settingsPresenterSourceFiles.map(file => [file, readFileSync(path.join(root, "admin", file), "utf8")]));
function request(contents, missing = null) {
  return { get: async (url) => {
    const file = new URL(url).pathname.split("/").at(-1);
    assert.ok(contents.has(file), `Unexpected source request: ${file}`);
    return { ok: () => file !== missing, text: async () => contents.get(file) };
  } };
}
const base = "https://settings.invalid/admin";

test("Settings remote probe covers exactly its installed Browser owner closure", async () => {
  assert.deepEqual(settingsPresenterSourceFiles, [
    ...browserModuleDependencies["admin/settings-simplified.js"].map(file => path.posix.basename(file)),
    "settings-simplified.js",
  ]);
  const text = await readSettingsPresenterSource(request(files), base);
  assert.equal(text, [...files.values()].join("\n"));
  assert.doesNotThrow(() => probe(text));
  assert.match(script, /const presenterText = await readSettingsPresenterSource\(page\.request, BASE_URL\);/);
});

for (const file of settingsPresenterSourceFiles) {
  test(`Settings remote probe fails closed for missing ${file}`, async () => {
    await assert.rejects(readSettingsPresenterSource(request(files, file), base), /Missing Settings presenter source/);
  });
  for (const forbidden of ["forceAutomaticAttendancePolicy()", 'difficulty.value = "true"', 'currency.value = "player_country"']) {
    test(`Settings remote probe rejects ${forbidden} in ${file}`, async () => {
      const changed = new Map(files);
      changed.set(file, `${changed.get(file)}\n${forbidden};\n`);
      const text = await readSettingsPresenterSource(request(changed), base);
      assert.throws(() => probe(text), /Shared Settings presenter still mutates attendance policy values/);
    });
  }
}

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const registeredTests = [
  "scripts/admin-v2-test-registration.test.mjs",
  "scripts/admin-v2-world-management.test.mjs",
  "scripts/admin-v2-inventory-contract.test.mjs",
  "scripts/admin-v2-marketplace.test.mjs",
];
// Its runtime extraction is a separate lane; select test-only changes when it lands.
const workflowPaths = [
  ...registeredTests,
  "scripts/admin-v2-marketplace-read-model.test.mjs",
  "package.json",
  "package-lock.json",
];
const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const workflow = await readFile(new URL("../.github/workflows/admin-shell-smoke.yml", import.meta.url), "utf8");

test("retained Admin tests remain registered in the focused CI suite", () => {
  const command = manifest.scripts["test:admin-v2"];
  assert.match(command, /^node --test /);
  const argumentsList = command.split(/\s+/);
  for (const file of registeredTests) assert.ok(argumentsList.includes(file), `${file} must run in test:admin-v2`);
  assert.match(workflow, /^\s+npm run test:admin-v2(?:\s|$)/m);
});

for (const event of ["pull_request", "push"]) {
  test(`Admin Shell Smoke selects retained and Marketplace test-only changes on ${event}`, () => {
    // This workflow uses two-space event keys and quoted, six-space path entries.
    const lines = workflow.split("\n");
    const start = lines.indexOf(`  ${event}:`);
    assert.notEqual(start, -1, `${event} trigger must remain present`);
    const end = lines.findIndex((line, index) => index > start && (/^  [a-z_]+:/.test(line) || /^\S/.test(line)));
    const section = lines.slice(start + 1, end < 0 ? undefined : end).join("\n");
    const paths = [...section.matchAll(/^      - "([^"\n]+)"$/gm)].map((match) => match[1]);
    for (const file of workflowPaths) assert.ok(paths.includes(file), `${event} must select ${file}`);
  });
}

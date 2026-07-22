import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(
  new URL("../.github/workflows/crafting-item-runtime.yml", import.meta.url),
  "utf8",
);

test("Crafting workflow is strictly read-only", () => {
  assert.doesNotMatch(
    workflow,
    /pull_request_target|write-all|contents:\s*write|actions:\s*write|checks:\s*write|pull-requests:\s*write|statuses:\s*write|git\s+(push|commit|merge)|update-ref/i,
  );
  assert.match(workflow, /permissions:\s*\n\s*contents:\s*read/i);
  assert.match(workflow, /persist-credentials:\s*false/i);
});

test("temporary Crafting transport architecture is absent", async () => {
  const roots = [
    new URL("../.github/", import.meta.url),
    new URL("../scripts/", import.meta.url),
    new URL("../docs/workstreams/", import.meta.url),
  ];
  const files = (await Promise.all(roots.map(walk))).flat();
  const prohibited = files.filter((path) =>
    /crafting.*(payload|transport|materializ|generator|reconstruct|snapshot|finaliz)|(payload|transport|materializ|generator|reconstruct|snapshot|finaliz).*crafting/i.test(path)
  );
  assert.deepEqual(prohibited, []);
});

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const url = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
    if (entry.isDirectory()) results.push(...await walk(url));
    else results.push(url.pathname);
  }
  return results;
}

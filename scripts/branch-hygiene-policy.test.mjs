import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowPath = new URL("../.github/workflows/branch-hygiene.yml", import.meta.url);
const workflow = await readFile(workflowPath, "utf8");

test("branch hygiene runs only for closed pull requests with write-scoped contents permission", () => {
  assert.match(workflow, /pull_request:\s*\n\s*types: \[closed\]/);
  assert.match(workflow, /permissions:\s*\n\s*contents: write/);
});

test("branch hygiene is restricted to same-repository non-default heads", () => {
  assert.match(workflow, /head\.repo\.full_name == github\.repository/);
  assert.match(workflow, /head\.ref != github\.event\.repository\.default_branch/);
});

test("branch hygiene deletes only merged or explicitly duplicated work", () => {
  assert.match(workflow, /pullRequest\.merged === true \|\| labels\.has\("duplicate"\)/);
  assert.match(workflow, /Retaining closed unmerged branch/);
});

test("branch hygiene preserves the default and accepted Admin source branches", () => {
  assert.match(workflow, /context\.payload\.repository\.default_branch/);
  assert.match(workflow, /"frontend\/admin-terminal-source-v1"/);
});

test("branch hygiene treats already absent or protected refs as an idempotent success", () => {
  assert.match(workflow, /error\.status === 422/);
  assert.match(workflow, /already absent or protected/);
});

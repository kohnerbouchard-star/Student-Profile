import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const workflow = readFileSync(
  new URL("../.github/workflows/beta-security-contract.yml", import.meta.url),
  "utf8",
);

function typecheckStep(source) {
  const start = source.indexOf("      - name: Typecheck all security surfaces");
  const end = source.indexOf(
    "      - name: Upload Beta Security typecheck diagnostics",
    start,
  );
  assert.notEqual(start, -1, "security typecheck step must exist");
  assert.notEqual(end, -1, "security typecheck diagnostics step must exist");
  return source.slice(start, end);
}

test("security typecheck pipeline fails closed on every command", () => {
  const step = typecheckStep(workflow);
  assert.match(step, /set -o pipefail/);
  assert.doesNotMatch(step, /set \+e/);
  assert.doesNotMatch(step, /PIPESTATUS/);
  assert.doesNotMatch(step, /exit 0/);
  assert.match(step, /npm --prefix backend run typecheck:all &&/);
  assert.match(step, /password-reset-api\/index\.ts &&/);
  assert.match(step, /node --check frontend\/src\/core\/login\.js\s*\n\s*\}/);
});

test("security workflow runs its integrity contract before typechecking", () => {
  const integrity = workflow.indexOf(
    "      - name: Validate security typecheck workflow integrity",
  );
  const typecheck = workflow.indexOf(
    "      - name: Typecheck all security surfaces",
  );
  assert.ok(integrity >= 0 && integrity < typecheck);
  assert.match(
    workflow,
    /node --test scripts\/beta-security-typecheck-workflow\.test\.mjs/,
  );
});

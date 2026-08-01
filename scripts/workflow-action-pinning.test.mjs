import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const WORKFLOWS = Object.freeze([
  ".github/workflows/admin-scroll-integrity.yml",
  ".github/workflows/beta-security-contract.yml",
  ".github/workflows/database-replay.yml",
  ".github/workflows/player-terminal-verify.yml",
  ".github/workflows/production-web-session-secrets.yml",
  ".github/workflows/workflow-action-pinning.yml",
]);

const IMMUTABLE_REVISION = /^[0-9a-f]{40}$/u;
const USES_LINE = /^\s*uses:\s*([^\s#]+)(?:\s+#.*)?$/gmu;

function thirdPartyActionReferences(source) {
  return [...source.matchAll(USES_LINE)]
    .map((match) => match[1])
    .filter((reference) => !reference.startsWith("./") && !reference.startsWith("docker://"));
}

test("merge-critical workflows pin third-party actions to full commit SHAs", () => {
  for (const workflow of WORKFLOWS) {
    const source = readFileSync(workflow, "utf8");
    const references = thirdPartyActionReferences(source);
    assert.ok(references.length > 0, `${workflow} must contain at least one third-party action.`);

    for (const reference of references) {
      const separator = reference.lastIndexOf("@");
      assert.ok(separator > 0, `${workflow} has an invalid action reference: ${reference}`);
      const revision = reference.slice(separator + 1);
      assert.match(
        revision,
        IMMUTABLE_REVISION,
        `${workflow} must pin ${reference.slice(0, separator)} to a full 40-character commit SHA.`,
      );
    }
  }
});

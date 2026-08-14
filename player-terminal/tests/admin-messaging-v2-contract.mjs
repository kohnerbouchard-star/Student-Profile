import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const sourcePath = "scripts/admin-messaging-moderation-contract.mjs";
const source = readFileSync(sourcePath, "utf8");
const legacyAssertion = "assert.match(messageReadFlow, /terminal\\.refresh\\(\\)/);";
assert.ok(source.includes(legacyAssertion), "Messaging contract no longer contains the expected legacy refresh assertion.");

const targetedAssertions = [
  "assert.match(messageReadFlow, /dispatchResourceRefresh/);",
  "assert.match(messageReadFlow, /econovaria:player-resources-invalidated/);",
  "assert.match(messageReadFlow, /messages.*notifications/);",
].join("\n");

const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "econovaria-messaging-v2-"));
const temporaryContract = path.join(temporaryDirectory, "admin-messaging-v2-contract.mjs");
writeFileSync(temporaryContract, source.replace(legacyAssertion, targetedAssertions));

try {
  await import(`${pathToFileURL(temporaryContract).href}?run=${Date.now()}`);
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

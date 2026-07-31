import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { sanitizeEvidencePaths } from "./sanitize-admin-browser-evidence.mjs";

test("Admin browser evidence sanitizer removes credentials and durable identifiers", async () => {
  const directory = await mkdtemp(join(tmpdir(), "econovaria-evidence-"));
  const path = join(directory, "evidence.log");
  try {
    await writeFile(path, [
      "sb_secret_localSecretValue",
      "sb_publishable_localPublishableValue",
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature",
      "Authorization: Bearer sensitive-token",
      "2f8f4f02-df7f-4951-a519-30c276f19af1",
      "ECO-ALPHA-BETA-001",
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      "Browser-E2E-Access-2026!",
      "BROWSER-E2E-LICENSE-001",
    ].join("\n"), "utf8");

    const result = await sanitizeEvidencePaths([directory]);
    assert.equal(result.scannedFiles, 1);
    assert.equal(result.changedFiles, 1);

    const sanitized = await readFile(path, "utf8");
    assert.match(sanitized, /\[supabase-key-redacted\]/);
    assert.match(sanitized, /\[jwt-redacted\]/);
    assert.match(sanitized, /Authorization: \[bearer-redacted\]/);
    assert.match(sanitized, /\[uuid-redacted\]/);
    assert.match(sanitized, /\[game-code-redacted\]/);
    assert.match(sanitized, /postgresql:\/\/\[credentials-redacted\]@/);
    assert.match(sanitized, /\[test-password-redacted\]/);
    assert.match(sanitized, /\[test-license-redacted\]/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Admin browser evidence sanitizer ignores missing and binary paths", async () => {
  const directory = await mkdtemp(join(tmpdir(), "econovaria-evidence-"));
  try {
    await writeFile(join(directory, "screenshot.png"), Buffer.from([0, 1, 2, 3]));
    const result = await sanitizeEvidencePaths([
      directory,
      join(directory, "missing.log"),
    ]);
    assert.deepEqual(result, { scannedFiles: 0, changedFiles: 0 });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

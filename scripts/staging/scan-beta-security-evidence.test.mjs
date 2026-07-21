import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const scanner = resolve("scripts/staging/scan-beta-security-evidence.mjs");

test("privacy scanner ignores configuration names without secret values", async () => {
  const directory = await mkdtemp(join(tmpdir(), "econovaria-security-scan-clean-"));
  try {
    const evidence = join(directory, "clean.log");
    const output = join(directory, "report.json");
    await writeFile(
      evidence,
      [
        "Checking SUPABASE_SERVICE_ROLE_KEY configuration name only.",
        "Checking ECONOVARIA_RATE_LIMIT_HMAC_SECRET configuration name only.",
        "No Authorization header value was retained.",
      ].join("\n"),
    );

    const result = runScanner(evidence, output);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(await readFile(output, "utf8"));
    assert.equal(report.passed, true);
    assert.equal(report.totals.findings, 0);
    assert.equal(report.totals.filesScanned, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("privacy scanner fails on credential-shaped values without copying them into its report", async () => {
  const directory = await mkdtemp(join(tmpdir(), "econovaria-security-scan-leak-"));
  const serviceRoleValue = "service-role-live-secret-value-123456789";
  const bearerValue = "bearer-secret-value-abcdefghijklmnopqrstuvwxyz";
  const canary = "ECO-CANARY-ACCESS-7F4A2D";
  try {
    const evidence = join(directory, "leak.log");
    const output = join(directory, "report.json");
    await writeFile(
      evidence,
      [
        `SUPABASE_SERVICE_ROLE_KEY=${serviceRoleValue}`,
        `Authorization: Bearer ${bearerValue}`,
        `request body contained ${canary}`,
      ].join("\n"),
    );

    const result = runScanner(evidence, output);
    assert.notEqual(result.status, 0);
    const reportText = await readFile(output, "utf8");
    const report = JSON.parse(reportText);
    assert.equal(report.passed, false);
    assert.equal(report.totals.findings, 3);
    assert.deepEqual(
      report.findings.map((finding) => finding.category).sort(),
      [
        "access-code-canary",
        "authorization-bearer",
        "service-role-value",
      ],
    );
    for (const sensitive of [serviceRoleValue, bearerValue, canary]) {
      assert.equal(reportText.includes(sensitive), false);
    }
    assert(report.findings.every((finding) => Number.isInteger(finding.line)));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

function runScanner(input, output) {
  return spawnSync(process.execPath, [scanner, input], {
    encoding: "utf8",
    env: {
      ...process.env,
      ECONOVARIA_SECURITY_SCAN_OUTPUT: output,
    },
  });
}

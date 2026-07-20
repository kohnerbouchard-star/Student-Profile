import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scanner = resolve(repositoryRoot, "scripts/supply-chain-secret-scan.mjs");
const sbomGenerator = resolve(repositoryRoot, "scripts/generate-supply-chain-sbom.mjs");

function runNode(script, arguments_ = []) {
  return spawnSync(process.execPath, [script, ...arguments_], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" }
  });
}

function digest(content) {
  return createHash("sha256").update(content).digest("hex");
}

test("repository secret scan passes for committed source", () => {
  const result = runNode(scanner);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Secret scan passed/);
});

test("secret scan rejects a generated GitHub token", () => {
  const directory = mkdtempSync(join(tmpdir(), "econovaria-secret-scan-"));
  const fixture = join(directory, "leaked-token.txt");
  const token = ["ghp", "_", "A".repeat(36)].join("");
  writeFileSync(fixture, `TOKEN=${token}\n`, "utf8");

  const result = runNode(scanner, [fixture]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /github-token/);
  assert.doesNotMatch(result.stderr, new RegExp(token));
});

test("secret scan rejects private key material", () => {
  const directory = mkdtempSync(join(tmpdir(), "econovaria-secret-scan-"));
  const fixture = join(directory, "private-key.pem");
  const header = ["-----BEGIN ", "PRIVATE KEY-----"].join("");
  writeFileSync(fixture, `${header}\nreview-only-fixture\n`, "utf8");

  const result = runNode(scanner, [fixture]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /private-key/);
});

test("reviewed allow marker suppresses only its own fixture line", () => {
  const directory = mkdtempSync(join(tmpdir(), "econovaria-secret-scan-"));
  const fixture = join(directory, "allowed-fixture.txt");
  const token = ["ghp", "_", "B".repeat(36)].join("");
  writeFileSync(fixture, `${token} // secret-scan: allow\n`, "utf8");

  const result = runNode(scanner, [fixture]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("SBOM generation is deterministic and checksums match", () => {
  const firstDirectory = mkdtempSync(join(tmpdir(), "econovaria-sbom-first-"));
  const secondDirectory = mkdtempSync(join(tmpdir(), "econovaria-sbom-second-"));

  const firstRun = runNode(sbomGenerator, ["--output", firstDirectory]);
  assert.equal(firstRun.status, 0, firstRun.stderr || firstRun.stdout);
  const secondRun = runNode(sbomGenerator, ["--output", secondDirectory]);
  assert.equal(secondRun.status, 0, secondRun.stderr || secondRun.stdout);

  const filenames = ["econovaria-backend.cdx.json", "econovaria-root.cdx.json", "SHA256SUMS"];
  for (const filename of filenames) {
    assert.equal(
      readFileSync(join(firstDirectory, filename), "utf8"),
      readFileSync(join(secondDirectory, filename), "utf8"),
      `${filename} must be reproducible`
    );
  }

  const manifest = readFileSync(join(firstDirectory, "SHA256SUMS"), "utf8").trim().split("\n");
  assert.equal(manifest.length, 2);
  for (const line of manifest) {
    const match = line.match(/^([a-f0-9]{64})  (.+\.cdx\.json)$/);
    assert.ok(match, `invalid checksum line: ${line}`);
    const [, expected, filename] = match;
    const content = readFileSync(join(firstDirectory, filename));
    assert.equal(digest(content), expected);

    const sbom = JSON.parse(content.toString("utf8"));
    assert.equal(sbom.bomFormat, "CycloneDX");
    assert.ok(Array.isArray(sbom.components));
    assert.equal("serialNumber" in sbom, false);
    assert.equal("timestamp" in (sbom.metadata || {}), false);
  }
});

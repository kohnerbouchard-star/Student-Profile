#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readOutputDirectory(arguments_) {
  const index = arguments_.indexOf("--output");
  if (index === -1) return resolve(repositoryRoot, "artifacts/supply-chain");
  const value = arguments_[index + 1];
  if (!value || value.startsWith("--")) throw new TypeError("--output requires a directory path.");
  return resolve(process.cwd(), value);
}

function sortKey(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return String(value ?? "");
  return String(value["bom-ref"] || value.ref || value.name || value.version || JSON.stringify(value));
}

function normalizeValue(value, key = "") {
  if (Array.isArray(value)) {
    const normalized = value.map((item) => normalizeValue(item, key));
    if (["components", "dependencies", "dependsOn", "hashes", "licenses", "properties"].includes(key)) {
      normalized.sort((left, right) => sortKey(left).localeCompare(sortKey(right)));
    }
    return normalized;
  }
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.keys(value)
      .filter((childKey) => !(key === "" && childKey === "serialNumber"))
      .filter((childKey) => !(key === "metadata" && childKey === "timestamp"))
      .sort()
      .map((childKey) => [childKey, normalizeValue(value[childKey], childKey)])
  );
}

function generateSbom(cwd) {
  const stdout = execFileSync(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["sbom", "--package-lock-only", "--sbom-format", "cyclonedx", "--sbom-type", "application"],
    {
      cwd,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      stdio: ["ignore", "pipe", "inherit"]
    }
  );
  const parsed = JSON.parse(stdout);
  if (parsed.bomFormat !== "CycloneDX" || !Array.isArray(parsed.components)) {
    throw new Error(`npm sbom returned an invalid CycloneDX document for ${cwd}.`);
  }
  return `${JSON.stringify(normalizeValue(parsed), null, 2)}\n`;
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

const outputDirectory = readOutputDirectory(process.argv.slice(2));
mkdirSync(outputDirectory, { recursive: true });

const outputs = [
  ["econovaria-root.cdx.json", generateSbom(repositoryRoot)],
  ["econovaria-backend.cdx.json", generateSbom(resolve(repositoryRoot, "backend"))]
].sort(([left], [right]) => left.localeCompare(right));

for (const [filename, content] of outputs) {
  writeFileSync(join(outputDirectory, filename), content, "utf8");
}

const checksumManifest = `${outputs
  .map(([filename, content]) => `${sha256(content)}  ${filename}`)
  .join("\n")}\n`;
writeFileSync(join(outputDirectory, "SHA256SUMS"), checksumManifest, "utf8");

console.log(`Generated ${outputs.length} deterministic CycloneDX SBOMs and SHA256SUMS in ${outputDirectory}.`);

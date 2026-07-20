#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const IGNORED_KEYS = new Set(["captured_at", "generated_at", "capturedAt", "generatedAt"]);

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--")) throw new Error(`Unexpected argument: ${key}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${key}`);
    args[key.slice(2)] = value;
    index += 1;
  }
  return args;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !IGNORED_KEYS.has(key))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function collectDifferences(left, right, path = "$", output = [], limit = 100) {
  if (output.length >= limit || Object.is(left, right)) return output;

  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) {
      output.push({ path, kind: "array-length", left: left.length, right: right.length });
    }
    const length = Math.min(left.length, right.length);
    for (let index = 0; index < length && output.length < limit; index += 1) {
      collectDifferences(left[index], right[index], `${path}[${index}]`, output, limit);
    }
    return output;
  }

  if (left && right && typeof left === "object" && typeof right === "object") {
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])]
      .filter((key) => !IGNORED_KEYS.has(key))
      .sort();
    for (const key of keys) {
      if (!(key in left)) output.push({ path: `${path}.${key}`, kind: "missing-left" });
      else if (!(key in right)) output.push({ path: `${path}.${key}`, kind: "missing-right" });
      else collectDifferences(left[key], right[key], `${path}.${key}`, output, limit);
      if (output.length >= limit) break;
    }
    return output;
  }

  output.push({ path, kind: "value", left, right });
  return output;
}

async function load(path) {
  return JSON.parse(await readFile(resolve(path), "utf8"));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.left || !args.right) {
    throw new Error("Usage: compare-schema-snapshots.mjs --left clean-replay.json --right live-or-isolated.json");
  }

  const left = canonicalize(await load(args.left));
  const right = canonicalize(await load(args.right));
  const leftSha256 = digest(left);
  const rightSha256 = digest(right);
  const differences = collectDifferences(left, right);
  const matched = leftSha256 === rightSha256;

  process.stdout.write(`${JSON.stringify({
    matched,
    left: { path: resolve(args.left), sha256: leftSha256 },
    right: { path: resolve(args.right), sha256: rightSha256 },
    differenceCountShown: differences.length,
    differences,
  }, null, 2)}\n`);
  if (!matched) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});

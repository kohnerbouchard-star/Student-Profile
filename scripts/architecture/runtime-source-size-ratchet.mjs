import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Preserve the inventory's existing comparator and split-based counting exactly.
// These roots add api/, auth/ and the Player host to the inventoried JS/TS roots.
// Tooling, styles, HTML, generated bundles, migrations and dependencies are not
// claimed by this guard; they need separate, appropriate budgets.
export const RUNTIME_SOURCE_ROOTS = Object.freeze([
  "backend/src", "backend/supabase/functions", "admin", "frontend/src",
  "player-terminal/src", "api", "auth", "player-terminal/host-runtime.js",
]);
export const POLICY_PATH = "scripts/architecture/runtime-source-size-policy.json";
const EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx", ".mts", ".cts"]);
const GENERATED = new Set(["node_modules", "dist", "coverage"]);
const FAILURE_METADATA = ["owner", "reason", "reviewEvidence", "removalCondition"];
const isText = (value) => typeof value === "string" && value.trim().length > 0;

export function measuredLines(source) {
  return source.split(/\r?\n/u).length;
}

function exactRelativePath(value) {
  return isText(value) && value === value.trim() && !value.startsWith("/") &&
    !value.includes("\\") && !/[?*\[\]{}]/u.test(value) &&
    value.split("/").every((segment) => segment && segment !== "." && segment !== "..");
}

function requireEvidence(root, evidence) {
  if (!exactRelativePath(evidence) || !/^docs\/operations\/evidence\/.+\.md$/u.test(evidence)) {
    throw new Error(`Invalid review evidence path: ${String(evidence)}`);
  }
  const info = lstatSync(path.join(root, evidence));
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Review evidence must be a regular file: ${evidence}`);
}

export function auditRuntimeSourceSize({ root, policy, roots = RUNTIME_SOURCE_ROOTS }) {
  if (policy?.schemaVersion !== 1 || policy.oversizedAtLines !== 500 || !Array.isArray(policy.exceptions)) {
    throw new Error("Runtime size policy must retain schema 1 and the existing 500-line threshold.");
  }
  const files = new Map();
  function walk(relative) {
    if (relative.split("/").some((segment) => GENERATED.has(segment))) return;
    const info = lstatSync(path.join(root, relative));
    if (info.isSymbolicLink()) throw new Error(`Source symlink requires review: ${relative}`);
    if (info.isDirectory()) {
      for (const name of readdirSync(path.join(root, relative)).sort()) walk(`${relative}/${name}`);
    } else if (info.isFile() && EXTENSIONS.has(path.extname(relative))) {
      files.set(relative, measuredLines(readFileSync(path.join(root, relative), "utf8")));
    }
  }
  for (const sourceRoot of roots) {
    if (!exactRelativePath(sourceRoot)) throw new Error(`Invalid source root: ${sourceRoot}`);
    walk(sourceRoot);
  }

  const failures = [];
  const exceptions = new Map();
  for (const record of policy.exceptions) {
    if (!record || !exactRelativePath(record.path) || exceptions.has(record.path) ||
        !Number.isSafeInteger(record.maxLines) || record.maxLines < policy.oversizedAtLines ||
        FAILURE_METADATA.some((field) => !isText(record[field]))) {
      throw new Error(`Invalid or duplicate runtime size exception: ${JSON.stringify(record)}`);
    }
    requireEvidence(root, record.reviewEvidence);
    exceptions.set(record.path, record);
  }
  for (const [file, lines] of files) {
    if (lines < policy.oversizedAtLines) continue;
    const exception = exceptions.get(file);
    if (!exception) failures.push(`${file} has ${lines} measured lines (limit: fewer than ${policy.oversizedAtLines}).`);
    else if (lines > exception.maxLines) failures.push(`${file} grew to ${lines} measured lines (reviewed maximum: ${exception.maxLines}).`);
    else if (lines < exception.maxLines) failures.push(`${file} was reduced to ${lines} measured lines; lower its exception maximum from ${exception.maxLines} in the same change.`);
  }
  for (const [file] of exceptions) {
    if (!files.has(file) || files.get(file) < policy.oversizedAtLines) {
      failures.push(`Stale runtime size exception for ${file}; remove it after deletion or reduction.`);
    }
  }
  const approvedExceptionPaths = [...exceptions].filter(([file, record]) =>
    files.has(file) && files.get(file) >= policy.oversizedAtLines && files.get(file) === record.maxLines
  ).map(([file]) => file);
  return { files: files.size, exceptions: exceptions.size, approvedExceptionPaths, failures };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const root = process.cwd();
    const policy = JSON.parse(readFileSync(path.join(root, POLICY_PATH), "utf8"));
    const result = auditRuntimeSourceSize({ root, policy });
    if (result.failures.length) {
      console.error(`Runtime source-size ratchet failed:\n- ${result.failures.join("\n- ")}`);
      process.exitCode = 1;
    } else console.log(`Runtime source-size ratchet passed: ${result.files} JS/TS files; ${result.exceptions} bounded exceptions.`);
  } catch (error) {
    console.error(`Runtime source-size ratchet failed: ${error.message}`);
    process.exitCode = 1;
  }
}

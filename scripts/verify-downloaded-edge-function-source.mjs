import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const [stagingRoot, productionRoot, functionName] = process.argv.slice(2);
if (!stagingRoot || !productionRoot || !/^[a-z0-9-]{1,64}$/u.test(functionName || "")) {
  throw new Error(
    "Usage: node verify-downloaded-edge-function-source.mjs <staging-root> <production-root> <function-name>",
  );
}

const staging = canonicalTree(stagingRoot, functionName);
const production = canonicalTree(productionRoot, functionName);

if (staging.digest !== production.digest) {
  const stagingNames = new Set(staging.rows.map((row) => row.name));
  const productionNames = new Set(production.rows.map((row) => row.name));
  const missingInProduction = [...stagingNames].filter((name) => !productionNames.has(name));
  const unexpectedInProduction = [...productionNames].filter((name) => !stagingNames.has(name));
  throw new Error(
    `Production downloaded source differs from staging. ` +
      `missing=${JSON.stringify(missingInProduction.slice(0, 10))} ` +
      `unexpected=${JSON.stringify(unexpectedInProduction.slice(0, 10))}`,
  );
}

process.stdout.write(`${production.digest}\n`);

function canonicalTree(root, expectedFunctionName) {
  const absoluteRoot = path.resolve(root);
  if (!fs.statSync(absoluteRoot, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`Downloaded source root is missing: ${absoluteRoot}`);
  }

  const names = new Set();
  const rows = [];
  walk(absoluteRoot, absoluteRoot, (absolutePath, relativePath) => {
    const name = canonicalName(relativePath, expectedFunctionName);
    if (!name) return;
    if (names.has(name)) {
      throw new Error(`Downloaded source contains duplicate canonical path: ${name}`);
    }
    names.add(name);
    const content = fs.readFileSync(absolutePath);
    rows.push({
      name,
      bytes: content.byteLength,
      sha256: crypto.createHash("sha256").update(content).digest("hex"),
    });
  });

  rows.sort((left, right) => left.name.localeCompare(right.name));
  const entrypoint = `supabase/functions/${expectedFunctionName}/index.ts`;
  if (!rows.some((row) => row.name === entrypoint)) {
    throw new Error(`Downloaded source entrypoint is missing: ${entrypoint}`);
  }
  if (rows.length < 8) {
    throw new Error(`Downloaded source graph is unexpectedly small: ${rows.length}`);
  }

  return {
    rows,
    digest: crypto.createHash("sha256").update(JSON.stringify(rows)).digest("hex"),
  };
}

function walk(root, current, visit) {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const absolutePath = path.join(current, entry.name);
    const relativePath = path.relative(root, absolutePath);
    const normalized = relativePath.split(path.sep).join("/");
    if (ignoredPath(normalized)) continue;
    if (entry.isSymbolicLink()) {
      throw new Error(`Downloaded source contains a symlink: ${normalized}`);
    }
    if (entry.isDirectory()) {
      walk(root, absolutePath, visit);
      continue;
    }
    if (!entry.isFile()) {
      throw new Error(`Downloaded source contains an unsupported entry: ${normalized}`);
    }
    visit(absolutePath, normalized);
  }
}

function ignoredPath(value) {
  return value === ".DS_Store" ||
    value === "supabase/config.toml" ||
    value.startsWith(".git/") ||
    value.startsWith(".temp/") ||
    value.startsWith("supabase/.temp/");
}

function canonicalName(value, expectedFunctionName) {
  let name = String(value || "").replaceAll("\\", "/").replace(/^\.\//u, "");
  if (ignoredPath(name)) return "";

  const cliOutputPrefix = `supabase/functions/${expectedFunctionName}/`;
  if (name.startsWith(cliOutputPrefix)) {
    const remainder = name.slice(cliOutputPrefix.length);
    if (
      remainder.startsWith("backend/") ||
      remainder.startsWith("src/") ||
      remainder.startsWith("supabase/")
    ) {
      name = remainder;
    }
  }
  if (name.startsWith("backend/")) name = name.slice("backend/".length);

  if (
    !name ||
    name.startsWith("/") ||
    name.split("/").includes("..") ||
    /[\u0000-\u001f\u007f]/u.test(name)
  ) {
    throw new Error(`Downloaded source contains an invalid path: ${JSON.stringify(name)}`);
  }
  return name;
}

#!/usr/bin/env node

import { lstat, readdir, readFile, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TEXT_EXTENSIONS = new Set([".json", ".log", ".txt", ".env"]);
const TEST_ADMIN_PASSWORD = "Browser-E2E-Access-2026!";
const TEST_LICENSE_CODE = "BROWSER-E2E-LICENSE-001";

const REPLACEMENTS = Object.freeze([
  {
    pattern: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
    replacement: "[jwt-redacted]",
  },
  {
    pattern: /sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g,
    replacement: "[supabase-key-redacted]",
  },
  {
    pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
    replacement: "[uuid-redacted]",
  },
  {
    pattern: /\bECO-[A-Z]{3,12}-[A-Z]{3,12}-[0-9]{3}\b/g,
    replacement: "[game-code-redacted]",
  },
  {
    pattern: /authorization\s*:\s*bearer\s+[^\s"']+/gi,
    replacement: "Authorization: [bearer-redacted]",
  },
  {
    pattern: /postgres(?:ql)?:\/\/[^\s"']+/gi,
    replacement: "[database-url-redacted]",
  },
  {
    pattern: new RegExp(escapeRegex(TEST_ADMIN_PASSWORD), "g"),
    replacement: "[test-password-redacted]",
  },
  {
    pattern: new RegExp(escapeRegex(TEST_LICENSE_CODE), "g"),
    replacement: "[test-license-redacted]",
  },
]);

const FORBIDDEN = Object.freeze([
  { name: "JWT", pattern: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/ },
  { name: "Supabase key", pattern: /sb_(?:secret|publishable)_[A-Za-z0-9_-]+/ },
  {
    name: "UUID",
    pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
  },
  { name: "game code", pattern: /\bECO-[A-Z]{3,12}-[A-Z]{3,12}-[0-9]{3}\b/ },
  { name: "Bearer credential", pattern: /authorization\s*:\s*bearer\s+[^\s"']+/i },
  { name: "private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: "database URL", pattern: /postgres(?:ql)?:\/\/[^\s"']+/i },
  { name: "test Admin password", pattern: new RegExp(escapeRegex(TEST_ADMIN_PASSWORD)) },
  { name: "test license code", pattern: new RegExp(escapeRegex(TEST_LICENSE_CODE)) },
]);

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function collectTextFiles(path) {
  let metadata;
  try {
    metadata = await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }

  if (metadata.isDirectory()) {
    const entries = await readdir(path, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map((entry) => collectTextFiles(resolve(path, entry.name))),
    );
    return nested.flat();
  }

  if (!metadata.isFile()) return [];
  return TEXT_EXTENSIONS.has(extname(path).toLowerCase()) ? [path] : [];
}

function sanitizeText(value) {
  return REPLACEMENTS.reduce(
    (current, rule) => current.replace(rule.pattern, rule.replacement),
    String(value),
  );
}

function assertSanitized(path, value) {
  for (const rule of FORBIDDEN) {
    if (rule.pattern.test(value)) {
      throw new Error(`Sanitized evidence still contains ${rule.name}: ${path}`);
    }
  }
}

export async function sanitizeEvidencePaths(paths) {
  const files = [...new Set((await Promise.all(
    paths.map((path) => collectTextFiles(resolve(path))),
  )).flat())].sort();

  let changedFiles = 0;
  for (const path of files) {
    const source = await readFile(path, "utf8");
    const sanitized = sanitizeText(source);
    assertSanitized(path, sanitized);
    if (sanitized !== source) {
      await writeFile(path, sanitized, "utf8");
      changedFiles += 1;
    }
  }

  return { scannedFiles: files.length, changedFiles };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const paths = process.argv.slice(2);
  if (!paths.length) {
    throw new Error("At least one evidence path is required.");
  }
  const result = await sanitizeEvidencePaths(paths);
  console.log(
    `Sanitized Admin browser evidence: ${result.scannedFiles} files scanned, ${result.changedFiles} files changed.`,
  );
}

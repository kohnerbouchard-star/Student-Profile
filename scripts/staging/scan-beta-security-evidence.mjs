import { createHash } from "node:crypto";
import { lstat, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";

const inputs = process.argv.slice(2).map((value) => resolve(value));
if (inputs.length === 0) {
  throw new Error("Provide one or more evidence files or directories to scan.");
}

const outputPath = resolve(
  process.env.ECONOVARIA_SECURITY_SCAN_OUTPUT ??
    "artifacts/security/privacy-evidence-scan.json",
);
const maximumFiles = boundedInteger(
  "ECONOVARIA_SECURITY_SCAN_MAX_FILES",
  2_000,
  1,
  10_000,
);
const maximumBytes = boundedInteger(
  "ECONOVARIA_SECURITY_SCAN_MAX_BYTES",
  50 * 1024 * 1024,
  1,
  250 * 1024 * 1024,
);
const allowedExtensions = new Set([
  ".csv",
  ".har",
  ".html",
  ".json",
  ".jsonl",
  ".log",
  ".md",
  ".ndjson",
  ".sql",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
]);

const canaries = new Map([
  ["access-code-canary", "ECO-CANARY-ACCESS-7F4A2D"],
  ["credential-hash-canary", "a".repeat(64)],
  ["internal-uuid-canary", "11111111-2222-4333-8444-555555555555"],
  ["player-identifier-canary", "ECO-CANARY-PLAYER-9B81"],
  ["session-token-canary", "eco_canary_session_token_6b75c7a8d4"],
]);
const suppliedCanaries = process.env.ECONOVARIA_SECURITY_CANARIES_JSON?.trim();
if (suppliedCanaries) {
  const parsed = JSON.parse(suppliedCanaries);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("ECONOVARIA_SECURITY_CANARIES_JSON must be an object.");
  }
  for (const [name, value] of Object.entries(parsed)) {
    if (typeof value !== "string" || !value || value.length > 4_096) {
      throw new Error(`Canary ${name} must be a non-empty bounded string.`);
    }
    canaries.set(`supplied:${name}`, value);
  }
}

const assignment = String.raw`["'\s:=]+`;
const forbiddenPatterns = [
  [
    "service-role-value",
    new RegExp(
      String.raw`supabase_(?:service_role|secret)_key${assignment}[a-z0-9._~-]{16,}`,
      "giu",
    ),
  ],
  [
    "rate-limit-secret-value",
    new RegExp(
      String.raw`econovaria_rate_limit_hmac_secret${assignment}[a-z0-9_-]{43,128}`,
      "giu",
    ),
  ],
  [
    "session-token-hash-value",
    new RegExp(String.raw`session_token_hash${assignment}[0-9a-f]{64}`, "giu"),
  ],
  [
    "access-code-hash-value",
    new RegExp(
      String.raw`normalized_student_code_hash${assignment}[0-9a-f]{64}`,
      "giu",
    ),
  ],
  [
    "password-hash-value",
    new RegExp(String.raw`password_hash${assignment}[^\s,}"']{20,}`, "giu"),
  ],
  [
    "refresh-token-value",
    new RegExp(String.raw`refresh_token${assignment}[a-z0-9._~-]{16,}`, "giu"),
  ],
  [
    "authorization-bearer",
    /authorization["'\s:=]+bearer\s+[a-z0-9._~-]{16,}/giu,
  ],
  [
    "jwt-shaped-secret",
    /eyj[a-z0-9_-]{12,}\.[a-z0-9_-]{12,}\.[a-z0-9_-]{12,}/giu,
  ],
  ["supabase-secret-key", /sb_secret_[a-z0-9_-]{20,}/giu],
];

const files = [];
for (const input of inputs) await collect(input, files);
if (files.length > maximumFiles) {
  throw new Error(`Evidence set exceeds ${maximumFiles} files.`);
}

let scannedBytes = 0;
const findings = [];
const scannedFiles = [];
for (const filePath of files.sort()) {
  const info = await lstat(filePath);
  if (!info.isFile()) continue;
  scannedBytes += info.size;
  if (scannedBytes > maximumBytes) {
    throw new Error(`Evidence set exceeds ${maximumBytes} bytes.`);
  }
  const content = await readFile(filePath, "utf8");
  const relativeName = displayName(filePath);
  scannedFiles.push({
    path: relativeName,
    bytes: info.size,
    sha256: createHash("sha256").update(content).digest("hex"),
  });

  for (const [category, value] of canaries) {
    recordLiteralFindings(relativeName, content, category, value, findings);
  }
  for (const [category, pattern] of forbiddenPatterns) {
    recordPatternFindings(relativeName, content, category, pattern, findings);
  }
}

const report = {
  schemaVersion: "econovaria-beta-security-privacy-evidence-scan-v1",
  completedAt: new Date().toISOString(),
  bounds: { maximumFiles, maximumBytes },
  totals: {
    filesScanned: scannedFiles.length,
    bytesScanned: scannedBytes,
    findings: findings.length,
  },
  files: scannedFiles,
  findings,
  passed: findings.length === 0,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, {
  mode: 0o600,
});
if (findings.length > 0) {
  throw new Error(
    `Privacy evidence scan found ${findings.length} potential leak(s); see ${outputPath}.`,
  );
}
console.log(`Privacy evidence scan passed; report written to ${outputPath}`);

async function collect(target, collected) {
  const info = await lstat(target);
  if (info.isSymbolicLink()) throw new Error(`Refusing symbolic link ${target}.`);
  if (info.isFile()) {
    if (allowedExtensions.has(extname(target).toLowerCase())) {
      collected.push(target);
    }
    return;
  }
  if (!info.isDirectory()) return;
  for (const entry of await readdir(target, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    await collect(resolve(target, entry.name), collected);
  }
}

function recordLiteralFindings(file, content, category, value, findingsList) {
  let offset = content.indexOf(value);
  while (offset >= 0) {
    findingsList.push({ file, category, line: lineNumber(content, offset) });
    offset = content.indexOf(value, offset + Math.max(1, value.length));
  }
}

function recordPatternFindings(file, content, category, pattern, findingsList) {
  pattern.lastIndex = 0;
  for (const match of content.matchAll(pattern)) {
    findingsList.push({
      file,
      category,
      line: lineNumber(content, match.index ?? 0),
    });
  }
}

function lineNumber(content, offset) {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (content.charCodeAt(index) === 10) line += 1;
  }
  return line;
}

function displayName(filePath) {
  const cwd = `${resolve(".")}/`;
  return filePath.startsWith(cwd) ? filePath.slice(cwd.length) : filePath;
}

function boundedInteger(name, fallback, minimum, maximum) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}.`);
  }
  return value;
}

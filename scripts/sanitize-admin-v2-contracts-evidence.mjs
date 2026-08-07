import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIRECTORY, "..");
const RESULT_PATH = path.join(
  REPOSITORY_ROOT,
  "docs",
  "operations",
  "evidence",
  "admin-ui-v2-contracts",
  "admin-v2-contracts-browser-results.json",
);
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;
const SHA_PATTERN = /^[0-9a-f]{40}$/i;

function sanitize(value) {
  if (typeof value === "string") return value.replace(UUID_PATTERN, ":resource");
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [key, sanitize(nested)]),
  );
}

const parsed = JSON.parse(readFileSync(RESULT_PATH, "utf8"));
const sanitized = sanitize(parsed);
const reconciledBase = String(process.env.ADMIN_V2_CONTRACTS_BASE_SHA || "").trim();
if (reconciledBase && !SHA_PATTERN.test(reconciledBase)) {
  throw new Error("ADMIN_V2_CONTRACTS_BASE_SHA must be a full commit SHA.");
}
if (reconciledBase) sanitized.baseSha = reconciledBase.toLowerCase();

const serialized = `${JSON.stringify(sanitized, null, 2)}\n`;
UUID_PATTERN.lastIndex = 0;
if (UUID_PATTERN.test(serialized)) {
  throw new Error("Contracts evidence still contains an internal UUID after sanitization.");
}
writeFileSync(RESULT_PATH, serialized);
process.stdout.write("Sanitized Admin V2 Contracts evidence: no UUIDs remain.\n");

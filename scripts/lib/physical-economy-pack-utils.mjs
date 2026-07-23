import path from "node:path";
import { COUNTRY_CODES } from "./physical-economy-pack-policy.mjs";

export function parseArgs(argv) {
  const result = {
    sourceRoot: ".",
    output: "physical-economy-runtime-pack.json",
    packKey: "econovaria.beta-seed-pack.v1",
    contentVersion: "1.0.0-beta",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[++index];
    if (key === "--source-root") result.sourceRoot = value;
    else if (key === "--output") result.output = value;
    else if (key === "--source-commit") result.sourceCommit = value;
    else if (key === "--approved-source-commit") result.approvedSourceCommit = value;
    else if (key === "--pack-key") result.packKey = value;
    else if (key === "--content-version") result.contentVersion = value;
    else throw new Error(`Unknown argument: ${key}`);
  }
  if (!/^[a-f0-9]{40}$/.test(result.sourceCommit ?? "")) {
    throw new Error("--source-commit must be a full lowercase Git SHA");
  }
  if (!/^[a-f0-9]{40}$/.test(result.approvedSourceCommit ?? "")) {
    throw new Error("--approved-source-commit must be a full lowercase Git SHA");
  }
  if (result.sourceCommit !== result.approvedSourceCommit) {
    throw new Error("--source-commit must match --approved-source-commit");
  }
  return result;
}

export function arrayFrom(value, keys) {
  if (Array.isArray(value)) return value;
  for (const key of keys) if (Array.isArray(value?.[key])) return value[key];
  return [];
}
export function requiredArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}
export function inferClass(file, raw) {
  const name = path.basename(file).toLowerCase();
  if (name.includes("material")) return "material";
  if (name.includes("component")) return "component";
  if (name.includes("equipment")) return "equipment";
  if (name.includes("consumable")) return "consumable";
  if (name.includes("blueprint")) {
    return String(raw.subtype ?? "").toLowerCase() === "blueprint" ? "blueprint" : "authorization";
  }
  return String(raw.category ?? "material").toLowerCase();
}
export function text(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("Required text is missing");
  return value.trim();
}
export function nullableText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
export function nullableCountry(value) {
  const country = nullableText(value)?.toUpperCase() ?? null;
  return country && COUNTRY_CODES.has(country) ? country : null;
}
export function stringArray(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim())
    : [];
}
export function objectValue(value, fallback) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}
export function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
}
export function boundedInteger(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, Math.round(number)));
}
export function normalizeEnum(value, allowed, fallback) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return allowed.includes(normalized) ? normalized : fallback;
}
export function assertUnique(values, key) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value[key])) throw new Error(`Duplicate ${key}: ${value[key]}`);
    seen.add(value[key]);
  }
}
export function by(key) {
  return (left, right) => String(left[key]).localeCompare(String(right[key]));
}
export function tierFromFile(file) {
  const match = path.basename(file).match(/tier[-_ ]?(\d+)/i);
  return match ? Number(match[1]) : 1;
}
export function assertSchema(document, expected, file) {
  if (document?.schemaVersion !== expected) {
    throw new Error(`${file} schema mismatch: expected ${expected}, got ${document?.schemaVersion}`);
  }
}
export function decimalRatio(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > 10) {
    throw new Error(`Invalid substitution ratio ${value}`);
  }
  const scaled = Math.round(number * 1000);
  const divisor = gcd(scaled, 1000);
  return [scaled / divisor, 1000 / divisor];
}
export function gcd(left, right) {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}
export function relative(file, sourceRoot) {
  return path.relative(sourceRoot, file).split(path.sep).join("/");
}

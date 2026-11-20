import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PLAYER_ENDPOINTS } from "../../player-terminal/src/api/endpoints.js";
import { IDEMPOTENT_WRITE_ENDPOINTS, WRITE_INVALIDATIONS } from "../../player-terminal/src/api/resource-plan.js";

export const POLICY_PATH = "scripts/architecture/player-write-policy-baseline.json";
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const SAFE_METHODS = new Set(["GET", "HEAD"]);
const MISSING_KINDS = new Set(["idempotency", "invalidations"]);
const METADATA = ["owner", "reason", "reviewEvidence", "removalCondition"];
const isText = (value) => typeof value === "string" && value.trim().length > 0;

function requireEvidence(root, file) {
  if (!isText(file) || file !== file.trim() || !/^docs\/operations\/evidence\/[a-zA-Z0-9_./-]+\.md$/u.test(file) ||
      file.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`Invalid write-policy review evidence: ${String(file)}`);
  }
  const info = lstatSync(path.join(root, file));
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Write-policy evidence must be a regular file: ${file}`);
}

export function auditPlayerWritePolicies({ root, endpoints, invalidations, idempotent, policy }) {
  if (policy?.schemaVersion !== 1 || !Array.isArray(policy.exceptions) || !(idempotent instanceof Set)) {
    throw new Error("Invalid Player write-policy inputs.");
  }
  const failures = [];
  const exceptions = new Map();
  for (const record of policy.exceptions) {
    if (!record || !/^[A-Za-z][A-Za-z0-9]*$/u.test(record.endpoint || "") || exceptions.has(record.endpoint) ||
        !WRITE_METHODS.has(record.method) || !isText(record.path) ||
        !Array.isArray(record.missing) || record.missing.length === 0 ||
        new Set(record.missing).size !== record.missing.length ||
        record.missing.some((kind) => !MISSING_KINDS.has(kind)) ||
        METADATA.some((field) => !isText(record[field]))) {
      throw new Error(`Invalid or duplicate Player write-policy exception: ${JSON.stringify(record)}`);
    }
    requireEvidence(root, record.reviewEvidence);
    exceptions.set(record.endpoint, record);
  }
  for (const [key, endpoint] of Object.entries(endpoints)) {
    const method = endpoint?.method;
    if (![...WRITE_METHODS, ...SAFE_METHODS].includes(method) || !isText(endpoint?.path)) {
      failures.push(`Endpoint ${key} has an invalid method or path.`);
      continue;
    }
    if (SAFE_METHODS.has(method)) continue;
    const missing = [];
    if (!idempotent.has(key)) missing.push("idempotency");
    if (!Object.hasOwn(invalidations, key)) missing.push("invalidations");
    const exception = exceptions.get(key);
    if (missing.length && !exception) failures.push(`Write endpoint ${key} lacks ${missing.join(" and ")} policy.`);
    if (exception && (exception.method !== method || exception.path !== endpoint.path)) {
      failures.push(`Exception for ${key} does not match its reviewed method and path.`);
    }
    if (exception && JSON.stringify([...exception.missing].sort()) !== JSON.stringify(missing.sort())) {
      failures.push(`Exception for ${key} does not match current missing policy; remove or narrow it after a reduction.`);
    }
  }
  for (const [key] of exceptions) {
    if (!Object.hasOwn(endpoints, key) || !WRITE_METHODS.has(endpoints[key]?.method)) {
      failures.push(`Stale Player write-policy exception: ${key}.`);
    }
  }
  for (const [key, resources] of Object.entries(invalidations)) {
    if (!Object.hasOwn(endpoints, key) || !WRITE_METHODS.has(endpoints[key]?.method)) {
      failures.push(`Invalidation policy has no write endpoint: ${key}.`);
    }
    if (!Array.isArray(resources) || new Set(resources).size !== resources.length ||
        resources.some((resource) => typeof resource !== "string" || !Object.hasOwn(endpoints, resource) || !SAFE_METHODS.has(endpoints[resource]?.method))) {
      failures.push(`Invalid or duplicate invalidation resources for ${key}.`);
    }
  }
  for (const key of idempotent) {
    if (!Object.hasOwn(endpoints, key) || !WRITE_METHODS.has(endpoints[key]?.method)) failures.push(`Idempotency policy has no write endpoint: ${key}.`);
  }
  return { endpoints: Object.keys(endpoints).length, exceptions: exceptions.size, failures };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const root = process.cwd();
    const policy = JSON.parse(readFileSync(path.join(root, POLICY_PATH), "utf8"));
    const result = auditPlayerWritePolicies({ root, endpoints: PLAYER_ENDPOINTS, invalidations: WRITE_INVALIDATIONS, idempotent: IDEMPOTENT_WRITE_ENDPOINTS, policy });
    if (result.failures.length) {
      console.error(`Player write-policy ratchet failed:\n- ${result.failures.join("\n- ")}`);
      process.exitCode = 1;
    } else console.log(`Player write-policy ratchet passed: ${result.endpoints} endpoints; ${result.exceptions} exact documented exceptions.`);
  } catch (error) {
    console.error(`Player write-policy ratchet failed: ${error.message}`);
    process.exitCode = 1;
  }
}

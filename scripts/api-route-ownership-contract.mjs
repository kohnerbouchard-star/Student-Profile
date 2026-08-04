import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  discoverApiBoundaryFindings,
  loadApiRouteOwnershipLedger,
  resolveApiBoundaryDependency,
} from "./lib/api-boundary-inventory.mjs";

export function validateApiRouteOwnershipLedger(ledger, authLedger) {
  const violations = [];
  if (ledger.schemaVersion !== "econovaria.api-route-ownership.v1") {
    violations.push("schemaVersion must be econovaria.api-route-ownership.v1");
  }
  if (ledger.status !== "inventory_seed") {
    violations.push("status must remain inventory_seed until the route audit is complete");
  }
  if (!Array.isArray(ledger.knownLimitations) || ledger.knownLimitations.length === 0) {
    violations.push("inventory_seed must declare knownLimitations");
  }
  if (!ledger.auditedSourceSha || !/^[0-9a-f]{40}$/u.test(ledger.auditedSourceSha)) {
    violations.push("auditedSourceSha must be a full Git SHA");
  }

  const authBoundaryIds = new Set(
    (authLedger.boundaries ?? []).map((entry) => entry.id),
  );
  const routeKeys = new Set();
  const methodPaths = new Set();
  const allowedStates = new Set([
    "canonical",
    "transitional",
    "compatibility",
    "retired",
  ]);
  const requiredResolvedFields = [
    "current",
    "domainOwner",
    "authBoundaryId",
    "authorization",
    "operation",
    "idempotency",
    "rateLimitKey",
    "compatibility",
    "canonicalTarget",
    "migrationState",
    "removalGates",
    "tests",
    "discoveryMatchers",
  ];

  if (!Array.isArray(ledger.routeFamilies) || ledger.routeFamilies.length === 0) {
    violations.push("routeFamilies must not be empty");
  }

  for (const route of ledger.routeFamilies ?? []) {
    if (!route.routeKey || routeKeys.has(route.routeKey)) {
      violations.push(`duplicate or missing routeKey ${route.routeKey || "(missing)"}`);
    }
    routeKeys.add(route.routeKey);
    const resolved = deepMerge(ledger.surfaceDefaults?.[route.surface] ?? {}, route);
    for (const field of requiredResolvedFields) {
      if (resolved[field] === undefined || resolved[field] === null) {
        violations.push(`${route.routeKey} is missing ${field}`);
      }
    }
    for (const field of [
      "current",
      "authorization",
      "idempotency",
      "compatibility",
      "canonicalTarget",
    ]) {
      if (!isNonEmptyObject(resolved[field])) {
        violations.push(`${route.routeKey} has empty ${field}`);
      }
    }
    for (const field of ["removalGates", "tests", "discoveryMatchers"]) {
      if (!Array.isArray(resolved[field]) || resolved[field].length === 0) {
        violations.push(`${route.routeKey} has empty ${field}`);
      }
    }
    for (const field of ["domainOwner", "operation", "rateLimitKey"]) {
      if (typeof resolved[field] !== "string" || !resolved[field].trim()) {
        violations.push(`${route.routeKey} has empty ${field}`);
      }
    }
    if (!authBoundaryIds.has(resolved.authBoundaryId)) {
      violations.push(`${route.routeKey} has unknown authBoundaryId ${resolved.authBoundaryId}`);
    }
    if (!allowedStates.has(resolved.migrationState)) {
      violations.push(`${route.routeKey} has invalid migrationState ${resolved.migrationState}`);
    }
    if (!Array.isArray(route.methods) || route.methods.length === 0) {
      violations.push(`${route.routeKey} must declare methods`);
    }
    if (!route.publicPath) violations.push(`${route.routeKey} must declare publicPath`);
    for (const method of route.methods ?? []) {
      const identity = `${method} ${route.publicPath}`;
      if (methodPaths.has(identity)) violations.push(`duplicate method/path ${identity}`);
      methodPaths.add(identity);
    }
    if (
      resolved.migrationState === "retired" &&
      (resolved.compatibility?.service || resolved.compatibility?.path)
    ) {
      violations.push(`${route.routeKey} is retired but retains compatibility routing`);
    }
  }

  const matcherIds = new Set();
  for (const matcher of ledger.dependencyMatchers ?? []) {
    if (!matcher.id || matcherIds.has(matcher.id)) {
      violations.push(`duplicate or missing matcher ${matcher.id || "(missing)"}`);
    }
    matcherIds.add(matcher.id);
    if (!matcher.scan?.roots?.length) violations.push(`${matcher.id} has no scan roots`);
    if (!new Set(["literal", "regex"]).has(matcher.kind)) {
      violations.push(`${matcher.id} has invalid kind ${matcher.kind}`);
    }
  }

  const dependencyKeys = new Set();
  for (const dependency of ledger.dependencies ?? []) {
    const resolved = resolveApiBoundaryDependency(ledger, dependency);
    if (!dependency.key || dependencyKeys.has(dependency.key)) {
      violations.push(`duplicate or missing dependency ${dependency.key || "(missing)"}`);
    }
    dependencyKeys.add(dependency.key);
    if (!matcherIds.has(dependency.matcherId) && dependency.matcherId !== "classroom-dispatch") {
      violations.push(`${dependency.key} uses unknown matcher ${dependency.matcherId}`);
    }
    if (!Number.isSafeInteger(dependency.maxOccurrences) || dependency.maxOccurrences < 0) {
      violations.push(`${dependency.key} has invalid maxOccurrences`);
    }
    for (const field of [
      "category",
      "path",
      "justification",
      "removalWorkstream",
      "retirementBlocking",
      "referenceClass",
    ]) {
      if (resolved[field] === undefined || resolved[field] === null || resolved[field] === "") {
        violations.push(`${dependency.key} is missing ${field}`);
      }
    }
    if (!dependency.key.includes(`|${dependency.path}`)) {
      violations.push(`${dependency.key} does not encode path ${dependency.path}`);
    }
    if (typeof resolved.retirementBlocking !== "boolean") {
      violations.push(`${dependency.key} has invalid retirementBlocking`);
    }
  }

  return violations;
}

export async function runApiRouteOwnershipContract() {
  const ledger = await loadApiRouteOwnershipLedger();
  const authLedger = JSON.parse(
    await readFile("docs/security/auth-boundary-ledger-v1.json", "utf8"),
  );
  const violations = validateApiRouteOwnershipLedger(ledger, authLedger);
  violations.push(...await validateRouteSourceFingerprints(ledger));
  const findings = await discoverApiBoundaryFindings(ledger);
  const declared = new Set((ledger.dependencies ?? []).map((entry) => entry.key));
  for (const finding of findings) {
    if (!declared.has(finding.key)) {
      violations.push(`discovered compatibility dependency is not owned: ${finding.key}`);
    }
  }
  if (violations.length > 0) {
    throw new Error(`API route ownership contract failed:\n- ${violations.join("\n- ")}`);
  }
  return { routes: ledger.routeFamilies.length, findings: findings.length };
}

export async function validateRouteSourceFingerprints(
  ledger,
  root = process.cwd(),
) {
  const violations = [];
  const seen = new Set();
  const dependencyKeys = new Set(
    (ledger.dependencies ?? []).map((dependency) => dependency.key),
  );
  for (const entry of ledger.routeSourceFingerprints ?? []) {
    if (!entry.path || seen.has(entry.path)) {
      violations.push(`duplicate or missing route source ${entry.path || "(missing)"}`);
      continue;
    }
    seen.add(entry.path);
    if (!/^[0-9a-f]{64}$/u.test(entry.sha256 ?? "")) {
      violations.push(`${entry.path} has invalid sha256`);
    }
    if (!Array.isArray(entry.dispatchKeys) || entry.dispatchKeys.length === 0) {
      violations.push(`${entry.path} has no dispatchKeys`);
    }
    for (const dispatchKey of entry.dispatchKeys ?? []) {
      if (dispatchKey !== "*" && !dependencyKeys.has(dispatchKey)) {
        violations.push(`${entry.path} has unknown dispatchKey ${dispatchKey}`);
      }
    }
    try {
      const source = (await readFile(`${root}/${entry.path}`, "utf8"))
        .replaceAll("\r\n", "\n");
      const actual = createHash("sha256").update(source).digest("hex");
      if (actual !== entry.sha256) {
        violations.push(`${entry.path} route source fingerprint changed`);
      }
    } catch {
      violations.push(`${entry.path} route source is missing`);
    }
  }
  return violations;
}

function deepMerge(base, override) {
  if (!isObject(base) || !isObject(override)) return override;
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    result[key] = isObject(value) && isObject(result[key])
      ? deepMerge(result[key], value)
      : value;
  }
  return result;
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyObject(value) {
  return isObject(value) && Object.keys(value).length > 0;
}

if (process.argv[1]?.endsWith("api-route-ownership-contract.mjs")) {
  const result = await runApiRouteOwnershipContract();
  console.log(JSON.stringify({ status: "pass", ...result }, null, 2));
}

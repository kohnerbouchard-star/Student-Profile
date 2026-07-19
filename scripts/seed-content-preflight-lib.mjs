import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

export const REPORT_SCHEMA_VERSION = "econovaria-seed-preflight-report-v1";

const ENVIRONMENTS = new Set(["local", "test", "staging", "production"]);
const MODES = new Set(["design", "staging"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROHIBITED_RUNTIME_KEYS = new Set([
  "accesscode",
  "gamesessionid",
  "holdingid",
  "notificationid",
  "password",
  "playerid",
  "playersessionid",
  "playeruuid",
  "redemptionid",
  "secret",
  "servicerolekey",
  "sessiontoken",
  "storeitemid",
]);
const ACTIVATION_KEYS = new Set([
  "activationAuthorized",
  "productionAuthorized",
  "runtimeActivationAllowed",
]);
const ISSUE_ORDER = { error: 0, blocker: 1, warning: 2 };

function issue(severity, code, filePath, message) {
  return { severity, code, path: filePath, message };
}

function relativePath(repoRoot, filePath) {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function sha256(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

async function listFiles(root, suffix) {
  const output = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) output.push(...(await listFiles(entryPath, suffix)));
    else if (entry.isFile() && entry.name.endsWith(suffix)) output.push(entryPath);
  }
  return output.sort();
}

export function validateEnvironment(environment, mode) {
  if (!ENVIRONMENTS.has(environment)) {
    throw new Error(`Unknown environment ${JSON.stringify(environment)}. Expected local, test, staging, or production.`);
  }
  if (!MODES.has(mode)) {
    throw new Error(`Unknown preflight mode ${JSON.stringify(mode)}. Expected design or staging.`);
  }
}

export function resolveDeclaredPath(root, declaredPath) {
  if (typeof declaredPath !== "string" || declaredPath.trim() === "" || path.isAbsolute(declaredPath)) {
    throw new Error("Declared content path must be a non-empty relative path.");
  }
  const normalizedRoot = path.resolve(root);
  const resolved = path.resolve(normalizedRoot, declaredPath);
  if (resolved !== normalizedRoot && !resolved.startsWith(`${normalizedRoot}${path.sep}`)) {
    throw new Error(`Declared content path escapes its root: ${declaredPath}`);
  }
  return resolved;
}

export function validateDocumentPrivacy(document, filePath = "<memory>") {
  const issues = [];

  function visit(value, jsonPath) {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => visit(entry, `${jsonPath}[${index}]`));
      return;
    }
    if (!isObject(value)) {
      if (typeof value === "string" && UUID_PATTERN.test(value)) {
        issues.push(issue("error", "RUNTIME_UUID_EMBEDDED", filePath, `${jsonPath} contains a runtime-shaped UUID.`));
      }
      return;
    }

    for (const [key, entry] of Object.entries(value)) {
      const nextPath = `${jsonPath}.${key}`;
      if (PROHIBITED_RUNTIME_KEYS.has(key.toLowerCase())) {
        issues.push(issue("error", "PROHIBITED_RUNTIME_FIELD", filePath, `${nextPath} is not allowed in reusable seed definitions.`));
      }
      if (ACTIVATION_KEYS.has(key) && entry !== false) {
        issues.push(issue("error", "ACTIVATION_NOT_FAIL_CLOSED", filePath, `${nextPath} must remain false on PR #163.`));
      }
      visit(entry, nextPath);
    }
  }

  visit(document, "$");
  return issues;
}

export function validateDefinitionArrayUniqueness(records, fields, filePath = "<memory>") {
  const issues = [];
  for (const field of fields) {
    const seen = new Map();
    records.forEach((record, index) => {
      if (!isObject(record) || typeof record[field] !== "string" || record[field].trim() === "") return;
      const value = record[field];
      if (seen.has(value)) {
        issues.push(issue(
          "error",
          "DUPLICATE_DEFINITION_KEY",
          filePath,
          `${field} ${JSON.stringify(value)} is duplicated at indexes ${seen.get(value)} and ${index}.`,
        ));
      } else {
        seen.set(value, index);
      }
    });
  }
  return issues;
}

function validateDeclaredCount(document, filePath) {
  const issues = [];
  const candidates = [
    ["count", "records"],
    ["recordCount", "locations"],
    ["recordCount", "packages"],
    ["recordCount", "issuers"],
    ["issuerCount", "issuers"],
    ["instrumentCount", "instruments"],
  ];
  for (const [countKey, recordsKey] of candidates) {
    if (!Number.isInteger(document?.[countKey]) || !Array.isArray(document?.[recordsKey])) continue;
    if (document[countKey] !== document[recordsKey].length) {
      issues.push(issue(
        "error",
        "DECLARED_COUNT_MISMATCH",
        filePath,
        `${countKey} declares ${document[countKey]} but ${recordsKey} contains ${document[recordsKey].length}.`,
      ));
    }
  }
  return issues;
}

function definitionArrays(document) {
  const arrays = [];
  for (const key of [
    "records",
    "locations",
    "packages",
    "instruments",
    "issuers",
    "groups",
    "exchanges",
    "parentSectors",
    "benchmarks",
  ]) {
    if (Array.isArray(document?.[key])) arrays.push(document[key]);
  }
  if (isObject(document?.market) && Array.isArray(document.market.instruments)) arrays.push(document.market.instruments);
  if (isObject(document?.issuerRegistry) && Array.isArray(document.issuerRegistry.issuers)) arrays.push(document.issuerRegistry.issuers);
  return arrays;
}

async function loadJson(filePath, repoRoot, issues, documents) {
  const displayPath = relativePath(repoRoot, filePath);
  try {
    const document = JSON.parse(await readFile(filePath, "utf8"));
    documents.set(filePath, document);
    issues.push(...validateDocumentPrivacy(document, displayPath));
    issues.push(...validateDeclaredCount(document, displayPath));
    for (const records of definitionArrays(document)) {
      issues.push(...validateDefinitionArrayUniqueness(
        records,
        ["id", "itemKey", "recipeKey", "groupKey", "symbol", "name"],
        displayPath,
      ));
    }
    return document;
  } catch (error) {
    issues.push(issue("error", "INVALID_JSON", displayPath, error.message));
    return null;
  }
}

async function validateDesignManifest({ repoRoot, seedRoot, environment, mode, issues, documents }) {
  const manifestPath = path.join(seedRoot, "manifests", "design-manifest-v1.json");
  const manifest = documents.get(manifestPath);
  const displayPath = relativePath(repoRoot, manifestPath);
  if (!manifest) return null;

  const requiredKeys = [
    "packId",
    "version",
    "maturity",
    "sourcePr",
    "allowedEnvironments",
    "productionAuthorized",
    "runtimeActivationAllowed",
    "domains",
    "rollbackStrategy",
  ];
  for (const key of requiredKeys) {
    if (!hasOwn(manifest, key)) {
      issues.push(issue("error", "MANIFEST_FIELD_MISSING", displayPath, `Required field ${key} is missing.`));
    }
  }
  if (!Array.isArray(manifest.allowedEnvironments) || !manifest.allowedEnvironments.includes(environment)) {
    issues.push(issue("error", "ENVIRONMENT_NOT_ALLOWED", displayPath, `${environment} is not allowed by this pack.`));
  }
  if (environment === "production" && manifest.productionAuthorized !== true) {
    issues.push(issue("error", "PRODUCTION_NOT_AUTHORIZED", displayPath, "This design pack is not authorized for production."));
  }
  if (mode === "staging" && manifest.runtimeActivationAllowed !== true) {
    issues.push(issue("blocker", "RUNTIME_ACTIVATION_DISABLED", displayPath, "The pack cannot pass staging readiness while runtime activation is disabled."));
  }
  if (Array.isArray(manifest.domains)) {
    for (const domain of manifest.domains) {
      if (!isObject(domain) || typeof domain.domain !== "string") {
        issues.push(issue("error", "INVALID_DOMAIN_DESCRIPTOR", displayPath, "Every domain descriptor must have a domain name."));
        continue;
      }
      if (["blocked", "definition-only"].includes(domain.activationState)) {
        issues.push(issue(
          "blocker",
          "DESIGN_DOMAIN_BLOCKED",
          displayPath,
          `${domain.domain} is ${domain.activationState}; dependencies: ${(domain.blockingDependencies ?? []).join(", ") || "not declared"}.`,
        ));
      }
    }
  }
  return manifest;
}

async function validateItemCatalog({ repoRoot, seedRoot, issues, documents }) {
  const manifestPath = path.join(seedRoot, "items", "catalog-manifest-v1.json");
  const manifest = documents.get(manifestPath);
  if (!manifest) return new Set();
  const displayPath = relativePath(repoRoot, manifestPath);
  const itemKeys = new Set();
  let total = 0;

  if (!Array.isArray(manifest.files)) {
    issues.push(issue("error", "ITEM_MANIFEST_FILES_INVALID", displayPath, "files must be an array."));
    return itemKeys;
  }

  for (const descriptor of manifest.files) {
    let filePath;
    try {
      filePath = resolveDeclaredPath(seedRoot, descriptor?.path);
    } catch (error) {
      issues.push(issue("error", "UNSAFE_DECLARED_PATH", displayPath, error.message));
      continue;
    }
    const document = documents.get(filePath);
    if (!document) {
      issues.push(issue("error", "ITEM_CATALOG_FILE_MISSING", displayPath, `Missing catalog file ${descriptor.path}.`));
      continue;
    }
    if (!Array.isArray(document.records)) {
      issues.push(issue("error", "ITEM_RECORDS_INVALID", relativePath(repoRoot, filePath), "records must be an array."));
      continue;
    }
    if (descriptor.count !== document.records.length) {
      issues.push(issue("error", "ITEM_MANIFEST_COUNT_MISMATCH", displayPath, `${descriptor.path} declares ${descriptor.count} records but contains ${document.records.length}.`));
    }
    total += document.records.length;
    for (const record of document.records) {
      if (typeof record?.itemKey !== "string" || record.itemKey.trim() === "") {
        issues.push(issue("error", "ITEM_KEY_MISSING", relativePath(repoRoot, filePath), "Every item definition requires itemKey."));
      } else if (itemKeys.has(record.itemKey)) {
        issues.push(issue("error", "DUPLICATE_ITEM_KEY", relativePath(repoRoot, filePath), `Duplicate itemKey ${record.itemKey}.`));
      } else {
        itemKeys.add(record.itemKey);
      }
    }
  }
  if (manifest.totalItemDefinitions !== total) {
    issues.push(issue("error", "ITEM_TOTAL_MISMATCH", displayPath, `Manifest total ${manifest.totalItemDefinitions} does not match ${total} catalog records.`));
  }
  return itemKeys;
}

async function validateRecipes({ repoRoot, seedRoot, issues, documents, itemKeys }) {
  const recipeRoot = path.join(seedRoot, "items", "recipes");
  const manifestPath = path.join(recipeRoot, "recipe-manifest-v1.json");
  const manifest = documents.get(manifestPath);
  if (!manifest) return;
  const displayPath = relativePath(repoRoot, manifestPath);
  const recipes = [];
  const tiers = [
    ["tier1", "tier1"],
    ["tier2", "tier2"],
    ["tier3", "tier3"],
    ["regulated", "regulated"],
  ];
  for (const [fileKey, allocationKey] of tiers) {
    let filePath;
    try {
      filePath = resolveDeclaredPath(recipeRoot, manifest.files?.[fileKey]);
    } catch (error) {
      issues.push(issue("error", "UNSAFE_DECLARED_PATH", displayPath, error.message));
      continue;
    }
    const document = documents.get(filePath);
    if (!document || !Array.isArray(document.records)) {
      issues.push(issue("error", "RECIPE_FILE_MISSING", displayPath, `Missing recipe file ${manifest.files?.[fileKey]}.`));
      continue;
    }
    if (manifest.allocation?.[allocationKey] !== document.records.length) {
      issues.push(issue("error", "RECIPE_ALLOCATION_MISMATCH", displayPath, `${fileKey} allocation does not match its record count.`));
    }
    recipes.push(...document.records);
  }
  if (manifest.totalRecipes !== recipes.length) {
    issues.push(issue("error", "RECIPE_TOTAL_MISMATCH", displayPath, `Manifest total ${manifest.totalRecipes} does not match ${recipes.length} recipes.`));
  }
  const recipeKeys = new Set();
  for (const recipe of recipes) {
    if (typeof recipe.recipeKey !== "string" || recipeKeys.has(recipe.recipeKey)) {
      issues.push(issue("error", "RECIPE_KEY_INVALID", displayPath, `Recipe key is missing or duplicated: ${recipe.recipeKey ?? "<missing>"}.`));
    } else {
      recipeKeys.add(recipe.recipeKey);
    }
    const references = [
      ...(recipe.ingredients ?? []).map((entry) => entry?.itemKey),
      ...(recipe.outputs ?? []).map((entry) => entry?.itemKey),
      ...(recipe.requiredEntitlements ?? []),
    ];
    for (const itemKey of references) {
      if (typeof itemKey !== "string" || !itemKeys.has(itemKey)) {
        issues.push(issue("error", "RECIPE_ITEM_REFERENCE_MISSING", displayPath, `${recipe.recipeKey ?? "<unknown>"} references unknown item ${itemKey ?? "<missing>"}.`));
      }
    }
  }
}

function candidateShape(document) {
  if (isObject(document?.market) && isObject(document?.issuerRegistry)) {
    return {
      country: document.country,
      instruments: document.market.instruments,
      instrumentCount: document.market.instrumentCount,
      issuers: document.issuerRegistry.issuers,
      issuerCount: document.issuerRegistry.issuerCount,
    };
  }
  return {
    country: document?.country,
    instruments: document?.instruments,
    instrumentCount: document?.instrumentCount,
    issuers: null,
    issuerCount: null,
  };
}

async function validateActiveMarkets({ repoRoot, seedRoot, issues, documents }) {
  const subsetRoot = path.join(seedRoot, "markets", "active-subsets");
  const candidateFiles = (await listFiles(subsetRoot, ".json")).filter((filePath) => filePath.includes("active-market-candidate"));
  const globalIds = new Set();
  const globalSymbols = new Set();
  const countries = new Set();

  for (const filePath of candidateFiles) {
    const document = documents.get(filePath);
    if (!document) continue;
    const displayPath = relativePath(repoRoot, filePath);
    const candidate = candidateShape(document);
    if (!Array.isArray(candidate.instruments) || candidate.instrumentCount !== candidate.instruments.length) {
      issues.push(issue("error", "ACTIVE_MARKET_COUNT_MISMATCH", displayPath, "instrumentCount must match the active candidate records."));
      continue;
    }
    countries.add(candidate.country);
    const issuers = candidate.issuers ?? [];
    if (candidate.issuers && candidate.issuerCount !== issuers.length) {
      issues.push(issue("error", "ISSUER_COUNT_MISMATCH", displayPath, "issuerCount must match the candidate issuer records."));
    }
    const issuerIds = new Set(issuers.map((entry) => entry?.id));
    for (const instrument of candidate.instruments) {
      for (const [field, globalSet] of [["id", globalIds], ["symbol", globalSymbols]]) {
        if (typeof instrument?.[field] !== "string" || globalSet.has(instrument[field])) {
          issues.push(issue("error", "ACTIVE_MARKET_KEY_INVALID", displayPath, `${field} is missing or duplicated: ${instrument?.[field] ?? "<missing>"}.`));
        } else {
          globalSet.add(instrument[field]);
        }
      }
      if (candidate.issuers && !issuerIds.has(instrument.issuerId)) {
        issues.push(issue("error", "ACTIVE_MARKET_ISSUER_MISSING", displayPath, `${instrument.id} references unknown issuer ${instrument.issuerId}.`));
      }
    }
  }

  const rolloutPath = path.join(subsetRoot, "active-market-rollout-status-v1.json");
  const rollout = documents.get(rolloutPath);
  if (rollout && rollout.targetCountries !== countries.size) {
    issues.push(issue(
      "blocker",
      "ACTIVE_MARKET_COUNTRIES_INCOMPLETE",
      relativePath(repoRoot, rolloutPath),
      `${countries.size} country candidates are committed; ${rollout.targetCountries} are required.`,
    ));
  }
}

async function validateUniverse({ repoRoot, seedRoot, mode, issues, documents }) {
  const manifestPath = path.join(seedRoot, "markets", "universe", "manifest-v1.json");
  const manifest = documents.get(manifestPath);
  if (!manifest) return;
  const displayPath = relativePath(repoRoot, manifestPath);
  const countryEntries = Object.entries(manifest.countries ?? {});
  const allocationTotal = Object.values(manifest.allocationPerCountry ?? {}).reduce((sum, value) => sum + value, 0);
  const typeTotal = Object.values(manifest.instrumentTypeCounts ?? {}).reduce((sum, value) => sum + value, 0);
  if (allocationTotal !== 320 || typeTotal !== manifest.totalInstrumentCount || countryEntries.length * allocationTotal !== manifest.totalInstrumentCount) {
    issues.push(issue("error", "UNIVERSE_MANIFEST_ARITHMETIC_INVALID", displayPath, "Universe allocation does not reconcile to the declared total."));
  }

  const records = [];
  for (const [country, descriptor] of countryEntries) {
    let filePath;
    try {
      filePath = resolveDeclaredPath(path.join(seedRoot, "markets"), descriptor?.file);
    } catch (error) {
      issues.push(issue("error", "UNSAFE_DECLARED_PATH", displayPath, error.message));
      continue;
    }
    if (!(await exists(filePath))) {
      issues.push(issue("blocker", "UNIVERSE_FILE_MISSING", displayPath, `${country} references absent source file ${descriptor?.file}.`));
      continue;
    }
    const lines = (await readFile(filePath, "utf8")).split(/\r?\n/).filter((line) => line.trim() !== "");
    if (lines.length !== descriptor.instrumentCount) {
      issues.push(issue("error", "UNIVERSE_COUNTRY_COUNT_MISMATCH", relativePath(repoRoot, filePath), `${country} declares ${descriptor.instrumentCount} records but has ${lines.length}.`));
    }
    for (let index = 0; index < lines.length; index += 1) {
      try {
        records.push(JSON.parse(lines[index]));
      } catch (error) {
        issues.push(issue("error", "INVALID_JSONL", relativePath(repoRoot, filePath), `Line ${index + 1}: ${error.message}`));
      }
    }
  }
  if (records.length === 0 && manifest.totalInstrumentCount > 0) {
    issues.push(issue("blocker", "UNIVERSE_CLAIMS_UNVERIFIED", displayPath, "The manifest's 3,200 uniqueness claims cannot be verified until the ten JSONL sources are committed."));
  }
  if (records.length > 0) {
    issues.push(...validateDefinitionArrayUniqueness(records, ["id", "symbol", "name"], displayPath));
    if (records.length !== manifest.totalInstrumentCount) {
      issues.push(issue("error", "UNIVERSE_TOTAL_MISMATCH", displayPath, `Loaded ${records.length} records; expected ${manifest.totalInstrumentCount}.`));
    }
  }
  if (mode === "staging" && records.length !== manifest.totalInstrumentCount) {
    issues.push(issue("blocker", "UNIVERSE_NOT_STAGING_READY", displayPath, "The market universe is not staging-ready."));
  }
}

async function validateWorldRecords({ repoRoot, seedRoot, issues, documents }) {
  const locationPath = path.join(seedRoot, "locations", "location-registry-v1.json");
  const locations = documents.get(locationPath);
  const locationIds = new Set((locations?.locations ?? []).map((entry) => entry?.id));
  const pendingLocations = (locations?.locations ?? []).filter((entry) => entry?.mapPoint === null || entry?.mapVerificationStatus !== "verified");
  if (pendingLocations.length > 0) {
    issues.push(issue("blocker", "LOCATION_MAP_PENDING", relativePath(repoRoot, locationPath), `${pendingLocations.length} locations still lack verified map points.`));
  }

  const arrivalPath = path.join(seedRoot, "players", "arrival-packages-v1.json");
  const arrivals = documents.get(arrivalPath);
  const requiredMechanicalFields = [
    "startingCashBand",
    "housingCostBand",
    "ordinaryExpenseBand",
    "firstMessageId",
    "firstContractId",
    "firstTutorialId",
  ];
  let incomplete = 0;
  for (const arrival of arrivals?.packages ?? []) {
    if (!locationIds.has(arrival.startingLocationId)) {
      issues.push(issue("error", "ARRIVAL_LOCATION_MISSING", relativePath(repoRoot, arrivalPath), `${arrival.id} references unknown location ${arrival.startingLocationId}.`));
    }
    if (requiredMechanicalFields.some((field) => arrival[field] === null || arrival[field] === undefined)) incomplete += 1;
  }
  if (incomplete > 0) {
    issues.push(issue("blocker", "ARRIVAL_PACKAGES_INCOMPLETE", relativePath(repoRoot, arrivalPath), `${incomplete} arrival packages lack one or more required mechanical values or introductory references.`));
  }
}

export function describeSimulationFiles(manifest) {
  if (isObject(manifest?.files)) {
    return Object.entries(manifest.files).map(([declaredPath, checksum]) => ({
      declaredPath,
      checksum,
    }));
  }

  if (typeof manifest?.scriptSha256 !== "string" || !isObject(manifest?.rawOutputChecksums)) {
    return null;
  }

  const command = typeof manifest.runCommand === "string" ? manifest.runCommand : "";
  const scriptMatch = command.match(/(?:^|\s)python(?:3)?\s+(?:"([^"]+)"|'([^']+)'|(\S+))/);
  const inputMatch = command.match(/--input\s+(?:"([^"]+)"|'([^']+)'|(\S+))/);
  const scriptName = scriptMatch?.[1] ?? scriptMatch?.[2] ?? scriptMatch?.[3];
  const inputName = inputMatch?.[1] ?? inputMatch?.[2] ?? inputMatch?.[3];
  const descriptors = [];

  if (scriptName) descriptors.push({ declaredPath: scriptName, checksum: manifest.scriptSha256 });
  if (inputName) descriptors.push({ declaredPath: inputName, checksum: manifest.inputSha256 });
  for (const [outputName, checksum] of Object.entries(manifest.rawOutputChecksums)) {
    descriptors.push({ declaredPath: path.join("output", outputName), checksum });
  }
  return descriptors;
}

async function validateSimulations({ repoRoot, seedRoot, mode, issues, documents }) {
  const simulationRoot = path.join(seedRoot, "simulation");
  const manifests = [...documents.entries()]
    .filter(([filePath]) =>
      path.dirname(filePath).startsWith(`${simulationRoot}${path.sep}`) &&
      path.basename(filePath) === "run-manifest-v1.json"
    )
    .sort(([left], [right]) => left.localeCompare(right));

  for (const [manifestPath, manifest] of manifests) {
    const displayPath = relativePath(repoRoot, manifestPath);
    const runRoot = path.dirname(manifestPath);
    const descriptors = describeSimulationFiles(manifest);
    if (!descriptors || descriptors.length === 0) {
      issues.push(issue("error", "SIMULATION_MANIFEST_SCHEMA_UNSUPPORTED", displayPath, "The run manifest does not declare a supported checksummed file set."));
      continue;
    }

    const mismatchSeverity = mode === "staging" ? "error" : "blocker";
    for (const descriptor of descriptors) {
      let filePath;
      try {
        filePath = resolveDeclaredPath(runRoot, descriptor.declaredPath);
      } catch (error) {
        issues.push(issue("error", "UNSAFE_SIMULATION_PATH", displayPath, error.message));
        continue;
      }

      if (typeof descriptor.checksum !== "string" || !/^[0-9a-f]{64}$/i.test(descriptor.checksum)) {
        issues.push(issue("error", "SIMULATION_CHECKSUM_INVALID", displayPath, `${descriptor.declaredPath} does not declare a valid SHA-256 checksum.`));
        continue;
      }
      if (!(await exists(filePath))) {
        issues.push(issue("blocker", "SIMULATION_DECLARED_FILE_MISSING", displayPath, `${descriptor.declaredPath} is recorded but absent from the repository.`));
        continue;
      }
      if (await sha256(filePath) !== descriptor.checksum.toLowerCase()) {
        issues.push(issue(mismatchSeverity, "SIMULATION_CHECKSUM_MISMATCH", displayPath, `${descriptor.declaredPath} does not match its recorded SHA-256.`));
      }
    }

    const retention = manifest?.evidenceRetention;
    if (retention?.status === "immutable-artifact-pending") {
      issues.push(issue(
        "blocker",
        "SIMULATION_RAW_EVIDENCE_NOT_RETAINED",
        displayPath,
        "The deterministic summary is retained, but raw simulation rows still require immutable workflow-artifact retention.",
      ));
    } else if (retention?.status === "immutable-workflow-artifact-retained") {
      const artifact = retention.artifact;
      const artifactValid =
        retention.immutableArtifactRetained === true &&
        isObject(artifact) &&
        artifact.provider === "github-actions" &&
        typeof artifact.name === "string" && artifact.name.trim() !== "" &&
        typeof artifact.artifactId === "string" && /^\d+$/.test(artifact.artifactId) &&
        typeof artifact.workflowRunId === "string" && /^\d+$/.test(artifact.workflowRunId) &&
        typeof artifact.artifactUrl === "string" && /^https:\/\/github\.com\//.test(artifact.artifactUrl) &&
        typeof artifact.artifactDigest === "string" && /^(sha256:)?[0-9a-f]{64}$/i.test(artifact.artifactDigest) &&
        typeof artifact.sourceCommit === "string" && /^[0-9a-f]{40}$/i.test(artifact.sourceCommit) &&
        Number.isInteger(artifact.retentionDays) && artifact.retentionDays > 0;
      if (!artifactValid) {
        issues.push(issue(
          "error",
          "SIMULATION_ARTIFACT_EVIDENCE_INVALID",
          displayPath,
          "Raw simulation evidence claims immutable retention without complete GitHub artifact identity, digest, source commit, workflow run, and retention metadata.",
        ));
      }
    } else if (retention?.requiredForApproval === true) {
      issues.push(issue(
        "blocker",
        "SIMULATION_RAW_EVIDENCE_RETENTION_UNRESOLVED",
        displayPath,
        "Raw simulation evidence is required for approval but its retention state is unresolved.",
      ));
    }
  }
}

function sortIssues(issues) {
  return issues.sort((left, right) =>
    ISSUE_ORDER[left.severity] - ISSUE_ORDER[right.severity] ||
    left.code.localeCompare(right.code) ||
    left.path.localeCompare(right.path) ||
    left.message.localeCompare(right.message));
}

export async function preflightSeedContent({ repoRoot, environment, mode = "design" }) {
  validateEnvironment(environment, mode);
  const absoluteRepoRoot = path.resolve(repoRoot);
  const seedRoot = path.join(absoluteRepoRoot, "docs", "seed-content");
  if (!(await exists(seedRoot))) throw new Error(`Seed-content root not found: ${seedRoot}`);

  const issues = [];
  const documents = new Map();
  const jsonFiles = await listFiles(seedRoot, ".json");
  for (const filePath of jsonFiles) await loadJson(filePath, absoluteRepoRoot, issues, documents);

  const manifest = await validateDesignManifest({ repoRoot: absoluteRepoRoot, seedRoot, environment, mode, issues, documents });
  const itemKeys = await validateItemCatalog({ repoRoot: absoluteRepoRoot, seedRoot, issues, documents });
  await validateRecipes({ repoRoot: absoluteRepoRoot, seedRoot, issues, documents, itemKeys });
  await validateActiveMarkets({ repoRoot: absoluteRepoRoot, seedRoot, issues, documents });
  await validateUniverse({ repoRoot: absoluteRepoRoot, seedRoot, mode, issues, documents });
  await validateWorldRecords({ repoRoot: absoluteRepoRoot, seedRoot, issues, documents });
  await validateSimulations({ repoRoot: absoluteRepoRoot, seedRoot, mode, issues, documents });

  sortIssues(issues);
  const summary = {
    jsonFilesChecked: jsonFiles.length,
    errors: issues.filter((entry) => entry.severity === "error").length,
    blockers: issues.filter((entry) => entry.severity === "blocker").length,
    warnings: issues.filter((entry) => entry.severity === "warning").length,
  };
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    environment,
    mode,
    pack: manifest ? { packId: manifest.packId, version: manifest.version, sourcePr: manifest.sourcePr } : null,
    summary,
    issues,
    stagingReady: summary.errors === 0 && summary.blockers === 0 && mode === "staging",
  };
}

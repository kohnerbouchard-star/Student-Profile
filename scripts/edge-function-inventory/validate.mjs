import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const DIGEST_PATTERN = /^[a-f0-9]{64}$/u;
const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/u;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/u;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizedSlug(value, label) {
  const slug = String(value || "").trim();
  assert(slug, `${label} contains an empty function slug.`);
  return slug;
}

function readRows(value, label) {
  assert(Array.isArray(value), `${label} must be a JSON array.`);
  const bySlug = new Map();
  for (const row of value) {
    const slug = normalizedSlug(row?.slug, label);
    assert(!bySlug.has(slug), `${label} contains duplicate function: ${slug}`);
    bySlug.set(slug, {
      slug,
      verifyJwt: row.verify_jwt,
      digest: String(row.ezbr_sha256 || "").trim().toLowerCase(),
      version: Number(row.version),
    });
  }
  return bySlug;
}

function canonicalEntries(manifest) {
  const rows = [
    ...(manifest.canonicalFunctions || []),
    ...(manifest.compatibilityFunctions || []),
  ];
  const bySlug = new Map();
  for (const entry of rows) {
    const slug = normalizedSlug(entry?.slug, "Manifest canonical inventory");
    assert(!bySlug.has(slug), `Manifest contains duplicate canonical function: ${slug}`);
    assert(typeof entry.verifyJwt === "boolean", `${slug} verifyJwt must be boolean.`);
    assert(String(entry.entrypoint || "").trim(), `${slug} entrypoint is required.`);
    bySlug.set(slug, entry);
  }
  return bySlug;
}

function stagingTemporaryEntries(manifest) {
  const bySlug = new Map();
  for (const entry of manifest.temporaryStagingFunctions || []) {
    const slug = normalizedSlug(entry?.slug, "Manifest temporary inventory");
    assert(!bySlug.has(slug), `Manifest contains duplicate temporary function: ${slug}`);
    assert(typeof entry.verifyJwt === "boolean", `${slug} verifyJwt must be boolean.`);
    bySlug.set(slug, entry);
  }
  return bySlug;
}

function retiredEntries(manifest) {
  const retired = new Set();
  for (const value of manifest.retiredFunctions || []) {
    const slug = normalizedSlug(value, "Manifest retired inventory");
    assert(!retired.has(slug), `Manifest contains duplicate retired function: ${slug}`);
    retired.add(slug);
  }
  return retired;
}

function sourceOnlyEntries(manifest) {
  const sourceOnly = new Set();
  for (const entry of manifest.sourceOnlyFunctions || []) {
    const slug = normalizedSlug(entry?.slug, "Manifest source-only inventory");
    assert(!sourceOnly.has(slug), `Manifest contains duplicate source-only function: ${slug}`);
    assert(String(entry.entrypoint || "").trim(), `${slug} source-only entrypoint is required.`);
    sourceOnly.add(slug);
  }
  return sourceOnly;
}

function validateManifest(manifest) {
  assert(manifest?.schemaVersion === 1, "Unsupported Edge Function manifest version.");
  assert(
    manifest?.manifestId === "econovaria.edge-functions.v2",
    "Unexpected Edge Function manifest identity.",
  );
  assert(
    manifest.productionUnexpectedFunctionsAllowed === false,
    "Production unexpected functions must fail closed.",
  );
  assert(manifest.sourceDigestRequired === true, "Source digests must be required.");
  assert(
    manifest.crossEnvironmentDigestMatchRequired === true,
    "Cross-environment source digests must match.",
  );
  assert(
    manifest.verifyJwtExactMatchRequired === true,
    "verify_jwt settings must match exactly.",
  );
  for (const environment of ["staging", "production"]) {
    assert(
      PROJECT_REF_PATTERN.test(String(manifest.environments?.[environment]?.projectRef || "")),
      `Manifest ${environment} project ref is invalid.`,
    );
  }
  assert(
    manifest.environments.staging.projectRef !== manifest.environments.production.projectRef,
    "Staging and production project refs must differ.",
  );

  const canonical = canonicalEntries(manifest);
  const temporary = stagingTemporaryEntries(manifest);
  const retired = retiredEntries(manifest);
  const sourceOnly = sourceOnlyEntries(manifest);
  for (const slug of temporary.keys()) {
    assert(!canonical.has(slug), `Temporary function overlaps canonical inventory: ${slug}`);
    assert(!retired.has(slug), `Temporary function overlaps retired inventory: ${slug}`);
    assert(!sourceOnly.has(slug), `Temporary function overlaps source-only inventory: ${slug}`);
  }
  for (const slug of canonical.keys()) {
    assert(!retired.has(slug), `Canonical function overlaps retired inventory: ${slug}`);
    assert(!sourceOnly.has(slug), `Canonical function overlaps source-only inventory: ${slug}`);
  }
  for (const slug of sourceOnly) {
    assert(!retired.has(slug), `Source-only function overlaps retired inventory: ${slug}`);
  }
  return { canonical, temporary, retired, sourceOnly };
}

export function validateInventory({ manifest, environment, inventory }) {
  assert(
    environment === "staging" || environment === "production",
    "Environment must be staging or production.",
  );
  const { canonical, temporary: allTemporary, retired } = validateManifest(manifest);
  const temporary = environment === "staging" ? allTemporary : new Map();
  const actual = readRows(inventory, `${environment} inventory`);
  const missing = [];
  const unexpected = [];
  const jwtMismatches = [];
  const invalidDigests = [];
  const invalidVersions = [];
  const retiredPresent = [];

  for (const [slug, expected] of canonical) {
    const row = actual.get(slug);
    if (!row) {
      missing.push(slug);
      continue;
    }
    if (row.verifyJwt !== expected.verifyJwt) {
      jwtMismatches.push({ slug, expected: expected.verifyJwt, actual: row.verifyJwt });
    }
    if (!DIGEST_PATTERN.test(row.digest)) invalidDigests.push(slug);
    if (!Number.isSafeInteger(row.version) || row.version < 1) invalidVersions.push(slug);
  }

  for (const [slug, row] of actual) {
    if (retired.has(slug)) retiredPresent.push(slug);
    const expected = canonical.get(slug) || temporary.get(slug);
    if (!expected) {
      unexpected.push(slug);
      continue;
    }
    if (
      row.verifyJwt !== expected.verifyJwt &&
      !jwtMismatches.some((entry) => entry.slug === slug)
    ) {
      jwtMismatches.push({ slug, expected: expected.verifyJwt, actual: row.verifyJwt });
    }
    if (!DIGEST_PATTERN.test(row.digest) && !invalidDigests.includes(slug)) {
      invalidDigests.push(slug);
    }
    if (
      (!Number.isSafeInteger(row.version) || row.version < 1) &&
      !invalidVersions.includes(slug)
    ) {
      invalidVersions.push(slug);
    }
  }

  const ok =
    missing.length === 0 &&
    unexpected.length === 0 &&
    jwtMismatches.length === 0 &&
    invalidDigests.length === 0 &&
    invalidVersions.length === 0 &&
    retiredPresent.length === 0;

  return Object.freeze({
    ok,
    environment,
    projectRef: manifest.environments[environment].projectRef,
    canonicalCount: canonical.size,
    temporaryCount: temporary.size,
    actualCount: actual.size,
    missing: Object.freeze(missing.sort()),
    unexpected: Object.freeze(unexpected.sort()),
    jwtMismatches: Object.freeze(jwtMismatches.sort((a, b) => a.slug.localeCompare(b.slug))),
    invalidDigests: Object.freeze(invalidDigests.sort()),
    invalidVersions: Object.freeze(invalidVersions.sort()),
    retiredPresent: Object.freeze(retiredPresent.sort()),
    rows: actual,
  });
}

export function compareCanonicalDigests({ manifest, stagingInventory, productionInventory }) {
  const staging = validateInventory({ manifest, environment: "staging", inventory: stagingInventory });
  const production = validateInventory({ manifest, environment: "production", inventory: productionInventory });
  const { canonical } = validateManifest(manifest);
  const digestMismatches = [];
  for (const slug of canonical.keys()) {
    const stagingRow = staging.rows.get(slug);
    const productionRow = production.rows.get(slug);
    if (!stagingRow || !productionRow) continue;
    if (stagingRow.digest !== productionRow.digest) {
      digestMismatches.push({
        slug,
        stagingDigest: stagingRow.digest,
        productionDigest: productionRow.digest,
      });
    }
  }
  return Object.freeze({
    ok: staging.ok && production.ok && digestMismatches.length === 0,
    staging,
    production,
    digestMismatches: Object.freeze(digestMismatches.sort((a, b) => a.slug.localeCompare(b.slug))),
  });
}

function compact(result) {
  return {
    ok: result.ok,
    environment: result.environment,
    projectRef: result.projectRef,
    canonicalCount: result.canonicalCount,
    temporaryCount: result.temporaryCount,
    actualCount: result.actualCount,
    missing: result.missing,
    unexpected: result.unexpected,
    jwtMismatches: result.jwtMismatches,
    invalidDigests: result.invalidDigests,
    invalidVersions: result.invalidVersions,
    retiredPresent: result.retiredPresent,
  };
}

async function main() {
  const args = new Map();
  for (let index = 2; index < process.argv.length; index += 2) {
    const key = process.argv[index];
    const value = process.argv[index + 1];
    if (!value) throw new Error(`Missing value for ${key}.`);
    args.set(key, value);
  }
  const manifestPath = args.get("--manifest");
  assert(manifestPath, "--manifest is required.");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

  const environment = args.get("--environment");
  const inventoryPath = args.get("--inventory");
  if (environment || inventoryPath) {
    assert(environment && inventoryPath, "--environment and --inventory must be provided together.");
    const inventory = JSON.parse(await readFile(inventoryPath, "utf8"));
    const result = validateInventory({ manifest, environment, inventory });
    process.stdout.write(`${JSON.stringify(compact(result), null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
    return;
  }

  const stagingPath = args.get("--staging");
  const productionPath = args.get("--production");
  const sourceCommit = String(args.get("--source-commit") || "").trim();
  assert(stagingPath && productionPath, "--staging and --production are required.");
  assert(COMMIT_PATTERN.test(sourceCommit), "--source-commit must be an exact commit SHA.");
  const [stagingInventory, productionInventory] = await Promise.all([
    readFile(stagingPath, "utf8").then(JSON.parse),
    readFile(productionPath, "utf8").then(JSON.parse),
  ]);
  const result = compareCanonicalDigests({ manifest, stagingInventory, productionInventory });
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    manifestId: manifest.manifestId,
    sourceCommit,
    generatedAt: new Date().toISOString(),
    ok: result.ok,
    staging: compact(result.staging),
    production: compact(result.production),
    digestMismatches: result.digestMismatches,
  }, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

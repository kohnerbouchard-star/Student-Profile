import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  compareCanonicalDigests,
  validateInventory,
} from "./validate.mjs";

const manifest = JSON.parse(
  await readFile(
    new URL("../../backend/supabase/edge-function-manifest.json", import.meta.url),
    "utf8",
  ),
);
const config = await readFile(
  new URL("../../backend/supabase/config.toml", import.meta.url),
  "utf8",
);
const digest = "a".repeat(64);

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function configuredVerifyJwt(slug) {
  const pattern = new RegExp(
    `(?:^|\\n)\\[functions\\.${escapeRegExp(slug)}\\]\\s*\\nverify_jwt\\s*=\\s*(true|false)(?=\\s|$)`,
    "u",
  );
  const match = config.match(pattern);
  return match ? match[1] === "true" : null;
}

function canonicalRows(environment, digestValue = digest) {
  const rows = [
    ...manifest.canonicalFunctions,
    ...manifest.compatibilityFunctions,
  ].map((entry, index) => ({
    slug: entry.slug,
    verify_jwt: entry.verifyJwt,
    ezbr_sha256: digestValue,
    version: index + 1,
  }));
  if (environment === "staging") {
    for (const [index, entry] of manifest.temporaryStagingFunctions.entries()) {
      rows.push({
        slug: entry.slug,
        verify_jwt: entry.verifyJwt,
        ezbr_sha256: digestValue,
        version: index + 100,
      });
    }
  }
  return rows;
}

test("repository config matches every canonical and compatibility JWT boundary", () => {
  for (const entry of [
    ...manifest.canonicalFunctions,
    ...manifest.compatibilityFunctions,
  ]) {
    assert.equal(
      configuredVerifyJwt(entry.slug),
      entry.verifyJwt,
      `${entry.slug} config.toml verify_jwt mismatch`,
    );
  }
  for (const slug of manifest.retiredFunctions) {
    assert.equal(
      configuredVerifyJwt(slug),
      null,
      `${slug} must not remain configured as a deployed function`,
    );
  }
});

test("accepts exact canonical inventories and matching source digests", () => {
  const result = compareCanonicalDigests({
    manifest,
    stagingInventory: canonicalRows("staging"),
    productionInventory: canonicalRows("production"),
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.digestMismatches, []);
});

test("rejects a missing canonical function", () => {
  const inventory = canonicalRows("production");
  inventory.pop();
  const result = validateInventory({ manifest, environment: "production", inventory });
  assert.equal(result.ok, false);
  assert.equal(result.missing.length, 1);
});

test("rejects production debris and retired functions", () => {
  const inventory = canonicalRows("production");
  inventory.push({
    slug: "server",
    verify_jwt: false,
    ezbr_sha256: digest,
    version: 999,
  });
  const result = validateInventory({ manifest, environment: "production", inventory });
  assert.equal(result.ok, false);
  assert.deepEqual(result.unexpected, ["server"]);
  assert.deepEqual(result.retiredPresent, ["server"]);
});

test("rejects verify_jwt, digest, and version drift", () => {
  const inventory = canonicalRows("production");
  inventory[0].verify_jwt = !inventory[0].verify_jwt;
  inventory[1].ezbr_sha256 = "invalid";
  inventory[2].version = 0;
  const result = validateInventory({ manifest, environment: "production", inventory });
  assert.equal(result.ok, false);
  assert.equal(result.jwtMismatches.length, 1);
  assert.equal(result.invalidDigests.length, 1);
  assert.equal(result.invalidVersions.length, 1);
});

test("rejects cross-environment source digest differences", () => {
  const staging = canonicalRows("staging");
  const production = canonicalRows("production");
  production[0].ezbr_sha256 = "b".repeat(64);
  const result = compareCanonicalDigests({
    manifest,
    stagingInventory: staging,
    productionInventory: production,
  });
  assert.equal(result.ok, false);
  assert.equal(result.digestMismatches.length, 1);
  assert.equal(result.digestMismatches[0].slug, production[0].slug);
});

test("rejects manifest overlap between canonical and retired inventories", () => {
  const malformed = structuredClone(manifest);
  malformed.retiredFunctions.push(malformed.canonicalFunctions[0].slug);
  assert.throws(
    () => validateInventory({
      manifest: malformed,
      environment: "production",
      inventory: canonicalRows("production"),
    }),
    /overlaps retired inventory/u,
  );
});

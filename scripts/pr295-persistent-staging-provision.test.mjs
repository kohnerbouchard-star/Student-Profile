import assert from "node:assert/strict";
import test from "node:test";

import {
  EXPECTED_COUNTRIES,
  EXPECTED_RELEASE_MEMBER_COUNTS,
  assertExactStagingBindings,
  buildSanitizedProvisioningEvidence,
  selectExactTargetGame,
  sha256,
  summarizeCountryCounts,
  summarizeMemberCounts,
  validatePackBundle,
  validateProvisionedState,
} from "./pr295-persistent-staging-provision-lib.mjs";

const stagingRef = "eecvbssdvarfcykcfrny";
const productionRef = "cgiukdjwicykrmtkhudh";
const releaseCommit = "a".repeat(40);
const gameId = "414cf4e6-ffa4-4668-93c8-e001f3043e54";
const gameName = "Econovaria Staging Preview";
const gameHash = sha256(gameId);

function validBindings(overrides = {}) {
  return {
    supabaseUrl: `https://${stagingRef}.supabase.co`,
    projectRef: stagingRef,
    expectedProjectRef: stagingRef,
    productionProjectRef: productionRef,
    releaseCommit,
    targetGameName: gameName,
    targetGameIdSha256: gameHash,
    ...overrides,
  };
}

function packBundle() {
  const templates = EXPECTED_COUNTRIES.flatMap((countryCode) =>
    Array.from({ length: 24 }, (_, index) => ({
      countryCode,
      stableId: `instrument.${countryCode.toLowerCase()}.${String(index + 1).padStart(4, "0")}.v1`,
    })),
  );
  return {
    pack: {
      packId: "econovaria.beta-seed-pack.v1",
      version: "1.0.0-beta",
      productionAuthorized: false,
      activationAuthorized: false,
    },
    integrity: {
      packId: "econovaria.beta-seed-pack.v1",
      version: "1.0.0-beta",
      packSha256: "b".repeat(64),
    },
    market: { templates },
    contracts: { templates: Array.from({ length: 30 }, (_, index) => ({ stableId: `contract.${index}` })) },
    store: { items: Array.from({ length: 50 }, (_, index) => ({ stableId: `store.${index}` })) },
  };
}

test("exact staging bindings reject production and drift", () => {
  assert.equal(assertExactStagingBindings(validBindings()).projectRef, stagingRef);
  assert.throws(
    () => assertExactStagingBindings(validBindings({ projectRef: productionRef, expectedProjectRef: productionRef })),
    /Production project selection is prohibited/,
  );
  assert.throws(
    () => assertExactStagingBindings(validBindings({ expectedProjectRef: "x".repeat(20) })),
    /exact staging project/,
  );
  assert.throws(
    () => assertExactStagingBindings(validBindings({ releaseCommit: "main" })),
    /exact Git SHA/,
  );
});

test("target game resolution requires unique active hash-bound game", () => {
  const game = selectExactTargetGame([
    { id: gameId, name: gameName, status: "active", lifecycle_state: "active" },
  ], validBindings());
  assert.equal(game.name, gameName);
  assert.throws(
    () => selectExactTargetGame([
      { id: gameId, name: gameName, status: "active", lifecycle_state: "active" },
      { id: "00000000-0000-4000-8000-000000000001", name: gameName, status: "active", lifecycle_state: "active" },
    ], validBindings()),
    /exactly one row/,
  );
  assert.throws(
    () => selectExactTargetGame([
      { id: gameId, name: gameName, status: "active", lifecycle_state: "active" },
    ], validBindings({ targetGameIdSha256: "c".repeat(64) })),
    /hash binding failed/,
  );
});

test("canonical bounded pack requires 240, 30, 50 and 24 instruments per country", () => {
  const identity = validatePackBundle(packBundle());
  assert.equal(identity.packId, "econovaria.beta-seed-pack.v1");
  assert.equal(Object.values(identity.countryCounts).reduce((sum, count) => sum + count, 0), 240);
  const broken = packBundle();
  broken.market.templates.pop();
  assert.throws(() => validatePackBundle(broken), /Expected 240 market templates/);
});

test("connected verification preserves staff content and accepts canonical applied-active status", () => {
  const memberRows = Object.entries(EXPECTED_RELEASE_MEMBER_COUNTS).flatMap(([object_type, count]) =>
    Array.from({ length: count }, () => ({ object_type })),
  );
  const marketRows = EXPECTED_COUNTRIES.flatMap((country_code) =>
    Array.from({ length: 24 }, () => ({ country_code })),
  );
  const memberCounts = summarizeMemberCounts(memberRows);
  const countryCounts = summarizeCountryCounts(marketRows);
  assert.equal(validateProvisionedState({
    release: { status: "applied_active", operation_count: 590 },
    memberCounts,
    countryCounts,
    activeAssetCount: 240,
    activePublicContractCount: 31,
    activeVisibleStoreItemCount: 50,
  }), true);
  assert.throws(() => validateProvisionedState({
    release: { status: "applied_active", operation_count: 590 },
    memberCounts,
    countryCounts,
    activeAssetCount: 240,
    activePublicContractCount: 29,
    activeVisibleStoreItemCount: 50,
  }), /at least 30 active public Contracts/);
});

test("evidence records only hashed game identity and denies production", () => {
  const memberCounts = { ...EXPECTED_RELEASE_MEMBER_COUNTS };
  const countryCounts = Object.fromEntries(EXPECTED_COUNTRIES.map((code) => [code, 24]));
  const evidence = buildSanitizedProvisioningEvidence({
    generatedAt: "2026-07-24T00:00:00.000Z",
    releaseCommit,
    workflowCommit: "d".repeat(40),
    projectRef: stagingRef,
    targetGameName: gameName,
    targetGameIdSha256: gameHash,
    pack: {
      packId: "econovaria.beta-seed-pack.v1",
      version: "1.0.0-beta",
      packSha256: "b".repeat(64),
      countryCounts,
    },
    outcome: { outcome: "applied", activated: true },
    memberCounts,
    countryCounts,
    activeAssetCount: 240,
    activePublicContractCount: 31,
    activeVisibleStoreItemCount: 50,
  });
  const text = JSON.stringify(evidence);
  assert.equal(evidence.safety.productionDenied, true);
  assert.equal(evidence.targetGame.idSha256, gameHash);
  assert.equal(evidence.targetGame.rawIdRecorded, false);
  assert.doesNotMatch(text, new RegExp(gameId));
  assert.doesNotMatch(text, /sb_(?:secret|publishable)_/);
});

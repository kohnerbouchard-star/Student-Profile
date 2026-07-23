import assert from "node:assert/strict";
import test from "node:test";

import {
  assertGameplayProvisionBindings,
  buildGameplayEvidence,
  selectGameplayTargetGame,
  sha256,
  validateGameplayProvisionedState,
  validatePhysicalEconomyPack,
} from "./pr295-gameplay-state-provision-lib.mjs";

const stagingRef = "eecvbssdvarfcykcfrny";
const productionRef = "cgiukdjwicykrmtkhudh";
const releaseCommit = "a".repeat(40);
const gameId = "00000000-0000-4000-8000-000000000001";
const gameHash = sha256(gameId);
const gameName = "Econovaria Staging Preview";

function bindings(overrides = {}) {
  return {
    projectRef: stagingRef,
    expectedProjectRef: stagingRef,
    productionProjectRef: productionRef,
    supabaseUrl: `https://${stagingRef}.supabase.co`,
    releaseCommit,
    targetGameName: gameName,
    targetGameIdSha256: gameHash,
    ...overrides,
  };
}

function pack() {
  return {
    schemaVersion: "econovaria-physical-economy-runtime-pack-v1",
    packKey: "econovaria.beta-seed-pack.v1",
    contentVersion: "1.0.0-beta",
    sourceCommit: releaseCommit,
    contentDigest: "b".repeat(64),
    activationAuthorization: {
      catalogAuthorized: true,
      recipeAuthorized: true,
      calibrationAuthorized: true,
      downstreamContractValidated: true,
      productionAuthorized: false,
    },
    items: [{ itemKey: "item.one" }, { itemKey: "item.two" }],
    recipes: [{ recipeKey: "recipe.one", regulated: false }, { recipeKey: "recipe.two", regulated: true }],
    counts: { items: 2, recipes: 2 },
  };
}

test("bindings reject production and source drift", () => {
  assert.equal(assertGameplayProvisionBindings(bindings()).projectRef, stagingRef);
  assert.throws(() => assertGameplayProvisionBindings(bindings({ projectRef: productionRef, expectedProjectRef: productionRef })), /Production gameplay provisioning is prohibited/);
  assert.throws(() => assertGameplayProvisionBindings(bindings({ releaseCommit: "main" })), /exact Git SHA/);
});

test("target game is exact, active, and owner-bound", () => {
  const selected = selectGameplayTargetGame([{
    id: gameId,
    name: gameName,
    owner_staff_user_id: "00000000-0000-4000-8000-000000000002",
    status: "active",
    lifecycle_state: "active",
  }], bindings());
  assert.equal(selected.name, gameName);
  assert.throws(() => selectGameplayTargetGame([], bindings()), /resolve exactly once/);
});

test("physical pack requires exact authorization and derives enabled recipes", () => {
  const identity = validatePhysicalEconomyPack(pack(), releaseCommit);
  assert.equal(identity.itemCount, 2);
  assert.equal(identity.recipeCount, 2);
  assert.equal(identity.expectedEnabledRecipes, 1);
  assert.equal(identity.regulatedRecipeCount, 1);
  const invalid = pack();
  invalid.activationAuthorization.productionAuthorized = true;
  assert.throws(() => validatePhysicalEconomyPack(invalid, releaseCommit), /prohibit production/);
});

test("connected state requires active pack and one baseline profile per Player", () => {
  const identity = validatePhysicalEconomyPack(pack(), releaseCommit);
  assert.equal(validateGameplayProvisionedState({
    packLink: { status: "active" },
    contentPack: {
      status: "active",
      pack_key: identity.packKey,
      content_version: identity.contentVersion,
      content_digest: identity.contentDigest,
    },
    itemCount: 2,
    activeItemCount: 2,
    recipeCount: 2,
    enabledRecipeCount: 1,
    supplyCount: 2,
    activePlayerCount: 1,
    progressionProfileCount: 1,
    reputationCount: 4,
    packIdentity: identity,
  }), true);
});

test("evidence excludes internal IDs and gameplay rewards", () => {
  const identity = validatePhysicalEconomyPack(pack(), releaseCommit);
  const evidence = buildGameplayEvidence({
    generatedAt: "2026-07-24T00:00:00.000Z",
    sourceCommit: releaseCommit,
    workflowCommit: "c".repeat(40),
    projectRef: stagingRef,
    targetGameName: gameName,
    targetGameIdSha256: gameHash,
    packIdentity: identity,
    importOutcome: { replayed: false },
    activationOutcome: { replayed: false },
    verification: {
      activePlayers: 1,
      physicalItems: 2,
      activePhysicalItems: 2,
      recipes: 2,
      enabledRecipes: 1,
      regulatedRecipes: 1,
      supplyRows: 2,
      progressionProfiles: 1,
      reputationRows: 4,
    },
  });
  assert.equal(evidence.progression.experienceAwarded, false);
  assert.equal(evidence.crafting.inventoryFabricated, false);
  assert.doesNotMatch(JSON.stringify(evidence), new RegExp(gameId));
});

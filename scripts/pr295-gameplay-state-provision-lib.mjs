import { createHash } from "node:crypto";

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

export function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export function assertGameplayProvisionBindings({
  projectRef,
  expectedProjectRef,
  productionProjectRef,
  supabaseUrl,
  releaseCommit,
  targetGameName,
  targetGameIdSha256,
}) {
  requireCondition(/^[a-z0-9]{20}$/.test(projectRef), "SUPABASE_PROJECT_REF is invalid");
  requireCondition(projectRef === expectedProjectRef, "Gameplay provisioning is not bound to exact staging");
  requireCondition(projectRef !== productionProjectRef, "Production gameplay provisioning is prohibited");
  requireCondition(supabaseUrl === `https://${projectRef}.supabase.co`, "SUPABASE_URL does not match staging");
  requireCondition(/^[a-f0-9]{40}$/.test(releaseCommit), "RELEASE_COMMIT must be an exact Git SHA");
  requireCondition(typeof targetGameName === "string" && targetGameName.trim().length >= 3, "TARGET_GAME_NAME is invalid");
  requireCondition(/^[a-f0-9]{64}$/.test(targetGameIdSha256), "TARGET_GAME_ID_SHA256 is invalid");
  return Object.freeze({
    projectRef,
    supabaseUrl,
    releaseCommit,
    targetGameName: targetGameName.trim(),
    targetGameIdSha256,
  });
}

export function selectGameplayTargetGame(rows, bindings) {
  requireCondition(Array.isArray(rows), "Game response is invalid");
  const matching = rows.filter((row) => row?.name === bindings.targetGameName);
  requireCondition(matching.length === 1, "Gameplay target game must resolve exactly once");
  const game = matching[0];
  requireCondition(typeof game.id === "string" && sha256(game.id) === bindings.targetGameIdSha256, "Gameplay target game hash mismatch");
  requireCondition(typeof game.owner_staff_user_id === "string" && game.owner_staff_user_id, "Gameplay target owner is missing");
  requireCondition(game.status === "active" && game.lifecycle_state === "active", "Gameplay target game is inactive");
  return game;
}

export function inspectPhysicalEconomyPack(pack, releaseCommit) {
  requireCondition(pack?.schemaVersion === "econovaria-physical-economy-runtime-pack-v1", "Physical economy schema mismatch");
  requireCondition(pack?.packKey === "econovaria.beta-seed-pack.v1", "Physical economy pack identity mismatch");
  requireCondition(pack?.contentVersion === "1.0.0-beta", "Physical economy version mismatch");
  requireCondition(pack?.sourceCommit === releaseCommit, "Physical economy source binding mismatch");
  requireCondition(/^[a-f0-9]{64}$/.test(pack?.contentDigest ?? ""), "Physical economy digest is invalid");
  requireCondition(Array.isArray(pack?.items) && pack.items.length > 0, "Physical economy items are missing");
  requireCondition(Array.isArray(pack?.recipes) && pack.recipes.length > 0, "Physical economy recipes are missing");
  requireCondition(Number(pack?.counts?.items) === pack.items.length, "Physical economy item count mismatch");
  requireCondition(Number(pack?.counts?.recipes) === pack.recipes.length, "Physical economy recipe count mismatch");
  requireCondition(pack?.activationAuthorization?.productionAuthorized === false, "Physical economy pack must prohibit production");

  const authorizationChecks = Object.freeze({
    catalogAuthorized: pack?.activationAuthorization?.catalogAuthorized === true,
    recipeAuthorized: pack?.activationAuthorization?.recipeAuthorized === true,
    calibrationAuthorized: pack?.activationAuthorization?.calibrationAuthorized === true,
    downstreamContractValidated: pack?.activationAuthorization?.downstreamContractValidated === true,
    balanceGateAuthorized: pack?.calibrationEvidence?.balanceGateSummary?.activationAuthorized === true,
    zeroBalanceGateFailures: Array.isArray(pack?.calibrationEvidence?.balanceGateSummary?.failures) &&
      pack.calibrationEvidence.balanceGateSummary.failures.length === 0,
  });
  const blockers = Object.entries(authorizationChecks)
    .filter(([, passed]) => !passed)
    .map(([key]) => key);
  const expectedEnabledRecipes = pack.recipes.filter((recipe) => recipe?.regulated !== true).length;

  return Object.freeze({
    packKey: pack.packKey,
    contentVersion: pack.contentVersion,
    contentDigest: pack.contentDigest,
    itemCount: pack.items.length,
    recipeCount: pack.recipes.length,
    expectedEnabledRecipes,
    regulatedRecipeCount: pack.recipes.length - expectedEnabledRecipes,
    activationAuthorized: blockers.length === 0,
    authorizationChecks,
    blockers: Object.freeze(blockers),
  });
}

export const validatePhysicalEconomyPack = inspectPhysicalEconomyPack;

export function validateProgressionBaseline({
  activePlayerCount,
  progressionProfiles,
  reputationRows,
  experienceTotal,
  earnedSkillPointsTotal,
  spentSkillPointsTotal,
  bonusSkillPointsTotal,
  nonzeroReputationRows,
  completedAchievements,
  claimedRewards,
}) {
  requireCondition(Number(activePlayerCount) >= 1, "No active Players exist for Progression initialization");
  requireCondition(Number(progressionProfiles) === Number(activePlayerCount), "Progression profile count mismatch");
  requireCondition(Number(reputationRows) === Number(activePlayerCount) * 4, "Progression reputation baseline count mismatch");
  requireCondition(Number(experienceTotal) === 0, "Progression baseline must not award experience");
  requireCondition(Number(earnedSkillPointsTotal) === 0, "Progression baseline must not award earned skill points");
  requireCondition(Number(spentSkillPointsTotal) === 0, "Progression baseline must not spend skill points");
  requireCondition(Number(bonusSkillPointsTotal) === 0, "Progression baseline must not award bonus skill points");
  requireCondition(Number(nonzeroReputationRows) === 0, "Progression baseline must not award reputation");
  requireCondition(Number(completedAchievements) === 0, "Progression baseline must not complete achievements");
  requireCondition(Number(claimedRewards) === 0, "Progression baseline must not claim rewards");
  return true;
}

export function validateGameplayProvisionedState({
  packLink,
  contentPack,
  itemCount,
  activeItemCount,
  recipeCount,
  enabledRecipeCount,
  supplyCount,
  packIdentity,
}) {
  requireCondition(packIdentity?.activationAuthorized === true, "Crafting activation is not authorized");
  requireCondition(packLink?.status === "active", "Game physical economy pack is not active");
  requireCondition(contentPack?.status === "active", "Physical economy content pack is not active");
  requireCondition(contentPack?.pack_key === packIdentity.packKey, "Physical economy pack key mismatch");
  requireCondition(contentPack?.content_version === packIdentity.contentVersion, "Physical economy pack version mismatch");
  requireCondition(contentPack?.content_digest === packIdentity.contentDigest, "Physical economy pack digest mismatch");
  requireCondition(Number(itemCount) === packIdentity.itemCount, "Physical economy item definition count mismatch");
  requireCondition(Number(activeItemCount) === packIdentity.itemCount, "Not every physical economy item is active");
  requireCondition(Number(recipeCount) === packIdentity.recipeCount, "Physical economy recipe availability count mismatch");
  requireCondition(Number(enabledRecipeCount) === packIdentity.expectedEnabledRecipes, "Enabled recipe count mismatch");
  requireCondition(Number(supplyCount) === packIdentity.itemCount, "Physical economy supply projection count mismatch");
  return true;
}

export function buildGameplayEvidence({
  generatedAt,
  sourceCommit,
  workflowCommit,
  projectRef,
  targetGameName,
  targetGameIdSha256,
  packIdentity,
  importOutcome,
  activationOutcome,
  craftingActive,
  verification,
}) {
  const evidence = {
    schemaVersion: "econovaria-gameplay-state-provision-v2",
    generatedAt,
    sourceCommit,
    workflowCommit,
    project: { ref: projectRef, environment: "staging", production: false },
    targetGame: { name: targetGameName, idSha256: targetGameIdSha256, rawIdRecorded: false },
    crafting: {
      pack: packIdentity,
      activationAuthorized: packIdentity.activationAuthorized,
      activationBlocked: !packIdentity.activationAuthorized,
      blockers: packIdentity.blockers,
      importAttempted: packIdentity.activationAuthorized,
      activationAttempted: packIdentity.activationAuthorized,
      importReplayed: importOutcome?.replayed === true,
      activationReplayed: activationOutcome?.replayed === true,
      active: craftingActive === true,
      authorizationBypassed: false,
      inventoryFabricated: false,
    },
    progression: {
      definitionsCreated: false,
      profilesInitialized: verification.progressionProfiles,
      reputationRowsInitialized: verification.reputationRows,
      experienceAwarded: false,
      achievementsAwarded: false,
      rewardsClaimed: false,
    },
    verification,
    safety: {
      exactProjectBinding: true,
      exactGameHashBinding: true,
      exactSourceBinding: true,
      productionDenied: true,
      playerHistoryDeleted: false,
      credentialsRecorded: false,
      rawInternalIdentifiersRecorded: false,
    },
  };
  const serialized = JSON.stringify(evidence);
  requireCondition(!/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(serialized), "Gameplay evidence contains raw UUID");
  requireCondition(!/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/.test(serialized), "Gameplay evidence contains a key");
  return evidence;
}

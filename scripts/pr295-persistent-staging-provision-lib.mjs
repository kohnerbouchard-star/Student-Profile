import { createHash } from "node:crypto";

export const EXPECTED_COUNTRIES = Object.freeze([
  "DRAVENLOK",
  "ELDORAN",
  "LUMENOR",
  "NORTHREACH",
  "SOLVEND",
  "SYNDALIS",
  "THALORIS",
  "VALERION",
  "XALVORIA",
  "YRETHIA",
]);

export const EXPECTED_RELEASE_MEMBER_COUNTS = Object.freeze({
  stock_template: 240,
  game_stock_asset: 240,
  contract_template: 30,
  game_contract: 30,
  store_item: 50,
});

export const EXPECTED_RELEASE_MEMBER_TOTAL = 590;

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

export function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export function assertExactStagingBindings({
  supabaseUrl,
  projectRef,
  expectedProjectRef,
  productionProjectRef,
  releaseCommit,
  targetGameName,
  targetGameIdSha256,
}) {
  requireCondition(/^[a-z0-9]{20}$/.test(projectRef), "SUPABASE_PROJECT_REF is invalid");
  requireCondition(projectRef === expectedProjectRef, "Provisioning is not bound to the exact staging project");
  requireCondition(projectRef !== productionProjectRef, "Production project selection is prohibited");
  requireCondition(
    supabaseUrl === `https://${projectRef}.supabase.co`,
    "SUPABASE_URL does not match the exact staging project",
  );
  requireCondition(/^[a-f0-9]{40}$/.test(releaseCommit), "RELEASE_COMMIT must be an exact Git SHA");
  requireCondition(
    typeof targetGameName === "string" && targetGameName.trim().length >= 3 && targetGameName.trim().length <= 120,
    "TARGET_GAME_NAME is invalid",
  );
  requireCondition(/^[a-f0-9]{64}$/.test(targetGameIdSha256), "TARGET_GAME_ID_SHA256 is invalid");
  return Object.freeze({
    supabaseUrl,
    projectRef,
    releaseCommit,
    targetGameName: targetGameName.trim(),
    targetGameIdSha256,
  });
}

export function selectExactTargetGame(rows, { targetGameName, targetGameIdSha256 }) {
  requireCondition(Array.isArray(rows), "Game lookup returned an invalid response");
  const matching = rows.filter((row) => row?.name === targetGameName);
  requireCondition(matching.length === 1, "Target staging game must resolve to exactly one row");
  const game = matching[0];
  requireCondition(typeof game.id === "string" && game.id, "Target staging game identity is missing");
  requireCondition(sha256(game.id) === targetGameIdSha256, "Target staging game hash binding failed");
  requireCondition(game.status === "active", "Target staging game is not active");
  requireCondition(game.lifecycle_state === "active", "Target staging game lifecycle is not active");
  return game;
}

export function validatePackBundle({ pack, integrity, market, contracts, store }) {
  requireCondition(pack?.packId === "econovaria.beta-seed-pack.v1", "Unexpected seed pack identity");
  requireCondition(pack?.version === integrity?.version, "Seed pack version mismatch");
  requireCondition(pack?.packId === integrity?.packId, "Seed pack integrity identity mismatch");
  requireCondition(/^[a-f0-9]{64}$/.test(integrity?.packSha256 ?? ""), "Seed pack digest is invalid");
  requireCondition(pack?.productionAuthorized === false, "Seed pack must prohibit production");
  requireCondition(pack?.activationAuthorized === false, "Seed pack must not embed activation authorization");
  requireCondition(Array.isArray(market?.templates) && market.templates.length === 240, "Expected 240 market templates");
  requireCondition(Array.isArray(contracts?.templates) && contracts.templates.length === 30, "Expected 30 Contract templates");
  requireCondition(Array.isArray(store?.items) && store.items.length === 50, "Expected 50 Store items");
  const countryCounts = Object.fromEntries(EXPECTED_COUNTRIES.map((code) => [code, 0]));
  for (const template of market.templates) {
    const countryCode = String(template?.countryCode ?? "").toUpperCase();
    requireCondition(Object.hasOwn(countryCounts, countryCode), `Unexpected market country ${countryCode || "missing"}`);
    countryCounts[countryCode] += 1;
  }
  for (const code of EXPECTED_COUNTRIES) {
    requireCondition(countryCounts[code] === 24, `Expected 24 templates for ${code}`);
  }
  return Object.freeze({
    packId: pack.packId,
    version: pack.version,
    packSha256: integrity.packSha256,
    countryCounts: Object.freeze(countryCounts),
  });
}

export function summarizeMemberCounts(rows) {
  requireCondition(Array.isArray(rows), "Release membership response is invalid");
  const counts = {};
  for (const row of rows) {
    const type = String(row?.object_type ?? "");
    if (!type) continue;
    counts[type] = (counts[type] ?? 0) + 1;
  }
  return counts;
}

export function summarizeCountryCounts(rows) {
  requireCondition(Array.isArray(rows), "Active market response is invalid");
  const counts = Object.fromEntries(EXPECTED_COUNTRIES.map((code) => [code, 0]));
  for (const row of rows) {
    const code = String(row?.country_code ?? "").toUpperCase();
    requireCondition(Object.hasOwn(counts, code), `Unexpected active market country ${code || "missing"}`);
    counts[code] += 1;
  }
  return counts;
}

export function validateProvisionedState({
  release,
  memberCounts,
  countryCounts,
  activeAssetCount,
  activePublicContractCount,
  activeVisibleStoreItemCount,
}) {
  requireCondition(
    new Set(["active", "applied_active"]).has(String(release?.status ?? "")),
    "Seed release is not active",
  );
  requireCondition(Number(release?.operation_count) === EXPECTED_RELEASE_MEMBER_TOTAL, "Seed release operation count mismatch");
  let memberTotal = 0;
  for (const [type, expected] of Object.entries(EXPECTED_RELEASE_MEMBER_COUNTS)) {
    requireCondition(Number(memberCounts?.[type] ?? 0) === expected, `Release member count mismatch for ${type}`);
    memberTotal += Number(memberCounts[type]);
  }
  requireCondition(memberTotal === EXPECTED_RELEASE_MEMBER_TOTAL, "Seed release member total mismatch");
  requireCondition(Number(activeAssetCount) === 240, "Expected exactly 240 active game assets");
  requireCondition(Number(activePublicContractCount) >= 30, "Expected at least 30 active public Contracts");
  requireCondition(Number(activeVisibleStoreItemCount) === 50, "Expected exactly 50 active visible Store items");
  for (const code of EXPECTED_COUNTRIES) {
    requireCondition(Number(countryCounts?.[code] ?? 0) === 24, `Active market distribution mismatch for ${code}`);
  }
  return true;
}

export function buildSanitizedProvisioningEvidence({
  generatedAt,
  releaseCommit,
  workflowCommit,
  projectRef,
  targetGameName,
  targetGameIdSha256,
  pack,
  outcome,
  memberCounts,
  countryCounts,
  activeAssetCount,
  activePublicContractCount,
  activeVisibleStoreItemCount,
}) {
  const evidence = {
    schemaVersion: "econovaria-persistent-staging-provision-v1",
    generatedAt,
    sourceCommit: releaseCommit,
    workflowCommit,
    environment: "staging",
    project: {
      ref: projectRef,
      production: false,
    },
    targetGame: {
      name: targetGameName,
      idSha256: targetGameIdSha256,
      rawIdRecorded: false,
    },
    pack,
    activation: {
      outcome: String(outcome?.outcome ?? "unknown"),
      activated: outcome?.activated === true,
      replaySafe: ["applied", "replayed"].includes(String(outcome?.outcome ?? "")),
      persistentAfterWorkflow: true,
      automaticRollbackExecuted: false,
    },
    verification: {
      releaseMemberCounts: memberCounts,
      activeMarketAssets: activeAssetCount,
      activePublicContracts: activePublicContractCount,
      activeVisibleStoreItems: activeVisibleStoreItemCount,
      activeInstrumentsPerCountry: countryCounts,
    },
    safety: {
      exactProjectBinding: true,
      exactGameHashBinding: true,
      exactSourceBinding: true,
      productionDenied: true,
      credentialsRecorded: false,
      rawInternalIdentifiersRecorded: false,
      existingStaffContentPreserved: true,
    },
  };
  const serialized = JSON.stringify(evidence);
  requireCondition(!/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(serialized), "Sanitized evidence contains a raw UUID");
  requireCondition(!/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/.test(serialized), "Sanitized evidence contains a Supabase key");
  return evidence;
}

import type { WorldRouteMode } from "../contracts/worldRuntimeContracts.ts";
import {
  adaptBetaSeedPackForRuntime,
  BETA_SEED_PACK_ID,
  BETA_SEED_PACK_VERSION,
  publicLocationIdFromStableId,
  type BetaPackRuntimeInput,
} from "./betaSeedPackRuntimeAdapter.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("adapter derives runtime references from the merged downstream contract", () => {
  const input = fixture();
  const result = adaptBetaSeedPackForRuntime(input);
  assertEquals(result.packId, BETA_SEED_PACK_ID);
  assertEquals(result.packVersion, BETA_SEED_PACK_VERSION);
  assertEquals(result.packDigest, input.downstreamContract.packDigest);
  assertEquals(result.world.definition.definitionDigest, `sha256:${input.downstreamContract.packDigest}`);
  assertEquals(result.world.locations.length, 50);
  assertEquals(result.world.routes.length, 13);
  assertEquals(Object.keys(result.arrivalPackageDefinitionIds).sort(), [...input.downstreamContract.contentIdentifiers.countries].sort());
  assertEquals(new Set(result.world.routes.map((route) => route.mode)), new Set(["land", "sea", "air", "meridian"]));
  assertEquals("approvedStartingBalance" in result.arrivalPackageDefinitionIds, false);
});

Deno.test("adapter rejects digest drift, copied-catalog policy, identity drift, and incomplete mode coverage", () => {
  const base = fixture();
  assertThrowsCode(() => adaptBetaSeedPackForRuntime({
    ...base,
    downstreamContract: { ...base.downstreamContract, packDigest: `sha256:${"a".repeat(64)}` },
  }), "world_definition_invalid");
  assertThrowsCode(() => adaptBetaSeedPackForRuntime({
    ...base,
    downstreamContract: {
      ...base.downstreamContract,
      consumerRules: { ...base.downstreamContract.consumerRules, copySeedCatalogFiles: true },
    },
  }), "world_definition_invalid");
  assertThrowsCode(() => adaptBetaSeedPackForRuntime({
    ...base,
    approvedRoutes: base.approvedRoutes.map((route, index) =>
      index === 0 ? { ...route, seedRouteDefinitionId: "route.foreign.v1" } : route
    ),
  }), "world_definition_invalid");
  assertThrowsCode(() => adaptBetaSeedPackForRuntime({
    ...base,
    approvedRoutes: base.approvedRoutes.map((route) => ({ ...route, mode: "land" as const })),
  }), "world_definition_invalid");
});

Deno.test("stable location identifiers map deterministically and reject internal forms", () => {
  assertEquals(
    publicLocationIdFromStableId("location.yrethia.sableport.v1"),
    "loc_yrethia_sableport_v1",
  );
  assertThrowsCode(
    () => publicLocationIdFromStableId("00000000-0000-4000-8000-000000000001"),
    "world_definition_invalid",
  );
});

function fixture(): BetaPackRuntimeInput {
  const countries = Array.from({ length: 10 }, (_, index) => `country-${index}`);
  const locations = countries.flatMap((country, countryIndex) =>
    Array.from({ length: 5 }, (_, locationIndex) => ({
      id: `location.${country}.location-${locationIndex}.v1`,
      country,
      name: `${country} location ${locationIndex}`,
      category: locationIndex === 0 ? "capital-port" : "economic-site",
      mapVerificationStatus: "verified-against-player-artwork-and-polygons",
      runtimeSupport: "bounded-pack-reference",
      mapPoint: {
        coordinateSpace: "1672x941",
        x: 100 + countryIndex * 100 + locationIndex,
        y: 100 + countryIndex * 50 + locationIndex,
      },
    }))
  );
  const routeIds = Array.from({ length: 13 }, (_, index) => `route.meridian.segment-${index}.v1`);
  const modes: readonly WorldRouteMode[] = ["land", "sea", "air", "meridian"];
  const approvedRoutes = routeIds.map((seedRouteDefinitionId, index) => ({
    seedRouteDefinitionId,
    publicRouteId: `rte_segment_${index}`,
    fromLocationId: publicLocationIdFromStableId(locations[index]!.id),
    toLocationId: publicLocationIdFromStableId(locations[index + 1]!.id),
    mode: modes[index % modes.length]!,
    bidirectional: true,
    baseCostMinor: 100 + index,
    baseDurationMinutes: 30 + index,
  }));
  const fileBindings = Object.fromEntries(
    ["pack", "locations", "campaign", "arrivalCalibration", "calibrationScenarios"].map((key, index) => [key, {
      path: `docs/seed-content/${key}.json`,
      sha256: String(index + 1).repeat(64).slice(0, 64),
    }]),
  );
  return {
    downstreamContract: {
      schemaVersion: "econovaria-beta-seed-downstream-consumer-contract-v1",
      packId: BETA_SEED_PACK_ID,
      packVersion: BETA_SEED_PACK_VERSION,
      packDigest: "a".repeat(64),
      productionAuthorized: false,
      boundedRelease: {
        arrivalPackages: 10,
        locations: 50,
        routeCalibrations: 13,
        stableReleaseMembers: 590,
      },
      consumerRules: {
        copySeedCatalogFiles: false,
        failClosedWhenDefinitionMissingOrInactive: true,
        requireExactDigest: true,
        requireExactPackIdAndVersion: true,
        stableIdReimportCompatible: true,
        treatDeploymentAsActivation: false,
      },
      contentIdentifiers: {
        countries,
        arrivalPackages: {
          identifiers: countries.map((country) => `arrival-package.${country}.capital-immigrant.v1`),
          source: "arrival-packages.json#/packages/*/id",
        },
        locations: { count: 50, source: "locations.json#/locations/*/id" },
        routes: { count: 13, identifiers: routeIds, source: "routes.json#/routes/*/routeId" },
      },
      fileBindings,
    },
    manifest: {
      activationAuthorized: false,
      productionAuthorized: false,
      allowedEnvironments: ["staging"],
      boundedCounts: { arrivalPackages: 10, locationsVerified: 50 },
      domainFiles: {
        arrival: "arrival-calibration-v1.json",
        campaign: "campaign-v1.json",
        locations: "location-registry-verified-v1.json",
      },
      maturity: "executable-bounded-beta-pack",
      packId: BETA_SEED_PACK_ID,
      schemaVersion: "econovaria-beta-seed-pack-v1",
      status: "approved-for-isolated-staging",
      version: BETA_SEED_PACK_VERSION,
    },
    locations: {
      activationAuthorized: false,
      productionAuthorized: false,
      countryPolygonCount: 10,
      locations,
      status: "approved-for-isolated-staging",
      version: BETA_SEED_PACK_VERSION,
    },
    campaign: {
      activationAuthorized: false,
      packId: BETA_SEED_PACK_ID,
      policy: "bounded references only; no unreviewed mutations",
      productionAuthorized: false,
      recoveryPolicy: "Every event preserves a named recovery route.",
      schemaVersion: "econovaria-beta-campaign-selection-v1",
      selectedEventStableIds: ["event.core.opening.v1"],
      selectedNewsTemplateStableIds: ["news-template.core.opening.v1"],
      status: "approved-for-isolated-staging",
      version: BETA_SEED_PACK_VERSION,
    },
    approvedRoutes,
  };
}

function assertThrowsCode(run: () => unknown, expectedCode: string): void {
  try {
    run();
  } catch (error) {
    assertEquals((error as { code?: string }).code, expectedCode);
    return;
  }
  throw new Error(`Expected error ${expectedCode}`);
}

function assertEquals(actual: unknown, expected: unknown): void {
  const normalize = (value: unknown) => value instanceof Set ? [...value].sort() : value;
  if (JSON.stringify(normalize(actual)) !== JSON.stringify(normalize(expected))) {
    throw new Error(`Actual ${JSON.stringify(normalize(actual))} Expected ${JSON.stringify(normalize(expected))}`);
  }
}

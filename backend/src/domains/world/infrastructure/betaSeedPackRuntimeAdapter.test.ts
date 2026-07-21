import type { WorldRouteDefinition } from "../contracts/worldRuntimeContracts.ts";
import {
  adaptBetaSeedPackForRuntime,
  BETA_COUNTRY_IDS,
  BETA_SEED_PACK_ID,
  BETA_SEED_PACK_VERSION,
  publicLocationIdFromStableId,
  type BetaPackRuntimeInput,
} from "./betaSeedPackRuntimeAdapter.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("adapter consumes the bounded PR 163 contract without copying seed values", () => {
  const input = fixture();
  const result = adaptBetaSeedPackForRuntime(input);
  assertEquals(result.packId, BETA_SEED_PACK_ID);
  assertEquals(result.packVersion, BETA_SEED_PACK_VERSION);
  assertEquals(result.world.locations.length, 50);
  assertEquals(result.world.routes.length, 9);
  assertEquals(Object.keys(result.arrivalPackageDefinitionIds), BETA_COUNTRY_IDS);
  assertEquals(
    result.world.locations[0]?.publicLocationId,
    "loc_northreach_location_0_v1",
  );
  assertEquals(
    result.selectedCampaignEventIds,
    input.campaign.selectedEventStableIds,
  );
  assertEquals(
    "approvedStartingBalance" in result.arrivalPackageDefinitionIds,
    false,
  );
});

Deno.test("adapter rejects activation flags, count drift, unverified locations, and inferred routes", () => {
  assertThrowsCode(() => adaptBetaSeedPackForRuntime({
    ...fixture(),
    manifest: { ...fixture().manifest, activationAuthorized: true },
  }), "world_definition_invalid");

  assertThrowsCode(() => adaptBetaSeedPackForRuntime({
    ...fixture(),
    locations: {
      ...fixture().locations,
      locations: fixture().locations.locations.slice(0, 49),
    },
  }), "world_definition_invalid");

  const unverified = fixture();
  assertThrowsCode(() => adaptBetaSeedPackForRuntime({
    ...unverified,
    locations: {
      ...unverified.locations,
      locations: unverified.locations.locations.map((location, index) =>
        index === 0
          ? { ...location, mapVerificationStatus: "pending" }
          : location
      ),
    },
  }), "world_definition_invalid");

  assertThrowsCode(() => adaptBetaSeedPackForRuntime({
    ...fixture(),
    approvedRoutes: [],
  }), "world_definition_invalid");
});

Deno.test("stable location identifiers map deterministically and reject foreign forms", () => {
  assertEquals(
    publicLocationIdFromStableId("location.yrethia.sableport.v1"),
    "loc_yrethia_sableport_v1",
  );
  assertThrowsCode(
    () => publicLocationIdFromStableId("internal-uuid-or-free-text"),
    "world_definition_invalid",
  );
});

function fixture(): BetaPackRuntimeInput {
  const locations = BETA_COUNTRY_IDS.flatMap((country, countryIndex) =>
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
  const routes: WorldRouteDefinition[] = Array.from({ length: 9 }, (_, index) => ({
    publicRouteId: `rte_meridian_${index}`,
    fromLocationId: publicLocationIdFromStableId(
      `location.${BETA_COUNTRY_IDS[index]}.location-0.v1`,
    ),
    toLocationId: publicLocationIdFromStableId(
      `location.${BETA_COUNTRY_IDS[index + 1]}.location-0.v1`,
    ),
    mode: "meridian",
    bidirectional: true,
    baseCostMinor: 500,
    baseDurationMinutes: 90,
  }));
  return {
    packDigest: `sha256:${"a".repeat(64)}`,
    manifest: {
      activationAuthorized: false,
      productionAuthorized: false,
      allowedEnvironments: ["local", "test", "staging"],
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
    arrival: {
      activationAuthorized: false,
      productionAuthorized: false,
      status: "approved-for-isolated-staging",
      version: BETA_SEED_PACK_VERSION,
      calibrations: BETA_COUNTRY_IDS.map((country) => ({
        country,
        currencyCode: country.slice(0, 3).toUpperCase(),
        approvedStartingBalance: 500,
        recoveryRoute: `Reviewed recovery route for ${country}`,
        viability: { approved: true },
      })),
    },
    campaign: {
      activationAuthorized: false,
      packId: BETA_SEED_PACK_ID,
      policy: "bounded references only; no unreviewed mutations",
      productionAuthorized: false,
      recoveryPolicy: "Every event preserves a named recovery route.",
      schemaVersion: "econovaria-beta-campaign-selection-v1",
      selectedEventStableIds: ["event.core.northreach.opening.v1"],
      selectedNewsTemplateStableIds: ["news-template.northreach.opening.v1"],
      status: "approved-for-isolated-staging",
      version: BETA_SEED_PACK_VERSION,
    },
    approvedRoutes: routes,
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
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`);
  }
}

import type {
  WorldDefinitionBundle,
  WorldLocationDefinition,
  WorldRouteDefinition,
} from "../contracts/worldRuntimeContracts.ts";
import { WorldRuntimeError } from "../contracts/worldRuntimeContracts.ts";

export const BETA_SEED_PACK_ID = "econovaria.beta-seed-pack.v1";
export const BETA_SEED_PACK_VERSION = "1.0.0-beta";
export const BETA_COUNTRY_IDS = Object.freeze([
  "northreach",
  "yrethia",
  "thaloris",
  "solvend",
  "eldoran",
  "valerion",
  "lumenor",
  "xalvoria",
  "dravenlok",
  "syndalis",
] as const);

export interface BetaPackManifestInput {
  readonly activationAuthorized: boolean;
  readonly productionAuthorized: boolean;
  readonly allowedEnvironments: readonly string[];
  readonly boundedCounts: {
    readonly arrivalPackages: number;
    readonly locationsVerified: number;
  };
  readonly domainFiles: {
    readonly arrival: string;
    readonly campaign: string;
    readonly locations: string;
  };
  readonly maturity: string;
  readonly packId: string;
  readonly schemaVersion: string;
  readonly status: string;
  readonly version: string;
}

export interface BetaLocationRegistryInput {
  readonly activationAuthorized: boolean;
  readonly countryPolygonCount: number;
  readonly locations: readonly {
    readonly id: string;
    readonly country: string;
    readonly name: string;
    readonly category: string;
    readonly mapVerificationStatus: string;
    readonly runtimeSupport: string;
    readonly mapPoint: {
      readonly coordinateSpace: string;
      readonly x: number;
      readonly y: number;
    };
  }[];
  readonly productionAuthorized: boolean;
  readonly status: string;
  readonly version: string;
}

export interface BetaArrivalCalibrationInput {
  readonly activationAuthorized: boolean;
  readonly productionAuthorized: boolean;
  readonly status: string;
  readonly version: string;
  readonly calibrations: readonly {
    readonly country: string;
    readonly currencyCode: string;
    readonly approvedStartingBalance: number;
    readonly recoveryRoute: string;
    readonly viability: {
      readonly approved: boolean;
    };
  }[];
}

export interface BetaCampaignSelectionInput {
  readonly activationAuthorized: boolean;
  readonly packId: string;
  readonly policy: string;
  readonly productionAuthorized: boolean;
  readonly recoveryPolicy: string;
  readonly schemaVersion: string;
  readonly selectedEventStableIds: readonly string[];
  readonly selectedNewsTemplateStableIds: readonly string[];
  readonly status: string;
  readonly version: string;
}

export interface BetaPackRuntimeInput {
  readonly manifest: BetaPackManifestInput;
  readonly locations: BetaLocationRegistryInput;
  readonly arrival: BetaArrivalCalibrationInput;
  readonly campaign: BetaCampaignSelectionInput;
  readonly packDigest: string;
  readonly approvedRoutes: readonly WorldRouteDefinition[];
}

export interface BetaPackRuntimeReference {
  readonly packId: typeof BETA_SEED_PACK_ID;
  readonly packVersion: typeof BETA_SEED_PACK_VERSION;
  readonly packDigest: string;
  readonly world: WorldDefinitionBundle;
  readonly arrivalPackageDefinitionIds: Readonly<Record<string, string>>;
  readonly selectedCampaignEventIds: readonly string[];
  readonly selectedNewsTemplateIds: readonly string[];
}

export function adaptBetaSeedPackForRuntime(
  input: BetaPackRuntimeInput,
): BetaPackRuntimeReference {
  validateManifest(input.manifest, input.packDigest);
  validateArrival(input.arrival);
  const locations = adaptLocations(input.locations);
  validateCampaign(input.campaign);
  validateApprovedRoutes(input.approvedRoutes, locations);

  return Object.freeze({
    packId: BETA_SEED_PACK_ID,
    packVersion: BETA_SEED_PACK_VERSION,
    packDigest: input.packDigest,
    world: Object.freeze({
      definition: Object.freeze({
        packId: BETA_SEED_PACK_ID,
        packVersion: BETA_SEED_PACK_VERSION,
        definitionDigest: input.packDigest,
      }),
      locations,
      routes: Object.freeze([...input.approvedRoutes]),
    }),
    arrivalPackageDefinitionIds: Object.freeze(Object.fromEntries(
      BETA_COUNTRY_IDS.map((countryId) => [countryId, `arrival.${countryId}.v1`]),
    )),
    selectedCampaignEventIds: Object.freeze([...input.campaign.selectedEventStableIds]),
    selectedNewsTemplateIds: Object.freeze([
      ...input.campaign.selectedNewsTemplateStableIds,
    ]),
  });
}

export function publicLocationIdFromStableId(stableId: string): string {
  if (!/^location\.[a-z0-9-]+\.[a-z0-9-]+\.v[0-9]+$/.test(stableId)) {
    throw invalid(`Location stable ID ${stableId} is invalid.`);
  }
  const [, country, location, version] = stableId.split(".");
  return `loc_${country}_${location.replaceAll("-", "_")}_${version}`;
}

function validateManifest(
  manifest: BetaPackManifestInput,
  packDigest: string,
): void {
  if (
    manifest.packId !== BETA_SEED_PACK_ID ||
    manifest.version !== BETA_SEED_PACK_VERSION ||
    manifest.schemaVersion !== "econovaria-beta-seed-pack-v1" ||
    manifest.maturity !== "executable-bounded-beta-pack" ||
    manifest.status !== "approved-for-isolated-staging" ||
    manifest.activationAuthorized ||
    manifest.productionAuthorized ||
    !manifest.allowedEnvironments.includes("staging") ||
    manifest.boundedCounts.arrivalPackages !== 10 ||
    manifest.boundedCounts.locationsVerified !== 50 ||
    manifest.domainFiles.arrival !== "arrival-calibration-v1.json" ||
    manifest.domainFiles.campaign !== "campaign-v1.json" ||
    manifest.domainFiles.locations !== "location-registry-verified-v1.json" ||
    !/^sha256:[0-9a-f]{64}$/.test(packDigest)
  ) {
    throw invalid("Seed pack manifest does not match the approved bounded staging contract.");
  }
}

function validateArrival(arrival: BetaArrivalCalibrationInput): void {
  if (
    arrival.activationAuthorized ||
    arrival.productionAuthorized ||
    arrival.status !== "approved-for-isolated-staging" ||
    arrival.version !== BETA_SEED_PACK_VERSION ||
    arrival.calibrations.length !== BETA_COUNTRY_IDS.length
  ) {
    throw invalid("Arrival calibration does not match the approved staging pack.");
  }
  const countries = new Set<string>();
  for (const calibration of arrival.calibrations) {
    if (
      !BETA_COUNTRY_IDS.includes(calibration.country as never) ||
      countries.has(calibration.country) ||
      !/^[A-Z]{3}$/.test(calibration.currencyCode) ||
      !Number.isSafeInteger(calibration.approvedStartingBalance) ||
      calibration.approvedStartingBalance <= 0 ||
      !calibration.recoveryRoute.trim() ||
      !calibration.viability.approved
    ) {
      throw invalid(`Arrival calibration for ${calibration.country} is invalid.`);
    }
    countries.add(calibration.country);
  }
}

function adaptLocations(
  registry: BetaLocationRegistryInput,
): readonly WorldLocationDefinition[] {
  if (
    registry.activationAuthorized ||
    registry.productionAuthorized ||
    registry.status !== "approved-for-isolated-staging" ||
    registry.version !== BETA_SEED_PACK_VERSION ||
    registry.countryPolygonCount !== 10 ||
    registry.locations.length !== 50
  ) {
    throw invalid("Location registry is not the approved verified staging registry.");
  }
  const stableIds = new Set<string>();
  const publicIds = new Set<string>();
  const countryCounts = new Map<string, number>();
  const adapted: WorldLocationDefinition[] = [];
  for (const location of registry.locations) {
    const publicLocationId = publicLocationIdFromStableId(location.id);
    if (
      stableIds.has(location.id) ||
      publicIds.has(publicLocationId) ||
      !BETA_COUNTRY_IDS.includes(location.country as never) ||
      !location.name.trim() ||
      location.mapVerificationStatus !==
        "verified-against-player-artwork-and-polygons" ||
      location.runtimeSupport !== "bounded-pack-reference" ||
      location.mapPoint.coordinateSpace !== "1672x941" ||
      !Number.isInteger(location.mapPoint.x) ||
      !Number.isInteger(location.mapPoint.y) ||
      location.mapPoint.x < 0 ||
      location.mapPoint.x > 1672 ||
      location.mapPoint.y < 0 ||
      location.mapPoint.y > 941
    ) {
      throw invalid(`Verified location ${location.id} is invalid.`);
    }
    stableIds.add(location.id);
    publicIds.add(publicLocationId);
    countryCounts.set(
      location.country,
      (countryCounts.get(location.country) ?? 0) + 1,
    );
    adapted.push(Object.freeze({
      publicLocationId,
      countryId: location.country,
      name: location.name,
      kind: classifyLocation(location.category),
      enabled: true,
    }));
  }
  for (const countryId of BETA_COUNTRY_IDS) {
    if (countryCounts.get(countryId) !== 5) {
      throw invalid(`Country ${countryId} must contribute exactly five locations.`);
    }
  }
  return Object.freeze(adapted);
}

function validateCampaign(campaign: BetaCampaignSelectionInput): void {
  if (
    campaign.activationAuthorized ||
    campaign.productionAuthorized ||
    campaign.packId !== BETA_SEED_PACK_ID ||
    campaign.version !== BETA_SEED_PACK_VERSION ||
    campaign.schemaVersion !== "econovaria-beta-campaign-selection-v1" ||
    campaign.status !== "approved-for-isolated-staging" ||
    !campaign.recoveryPolicy.trim() ||
    !campaign.policy.includes("bounded references only") ||
    campaign.selectedEventStableIds.length === 0 ||
    campaign.selectedNewsTemplateStableIds.length === 0 ||
    new Set(campaign.selectedEventStableIds).size !==
      campaign.selectedEventStableIds.length ||
    new Set(campaign.selectedNewsTemplateStableIds).size !==
      campaign.selectedNewsTemplateStableIds.length ||
    campaign.selectedEventStableIds.some((id) =>
      !/^event\.[a-z0-9.-]+\.v[0-9]+$/.test(id)
    ) ||
    campaign.selectedNewsTemplateStableIds.some((id) =>
      !/^news-template\.[a-z0-9.-]+\.v[0-9]+$/.test(id)
    )
  ) {
    throw invalid("Campaign selection is not a valid bounded runtime reference set.");
  }
}

function validateApprovedRoutes(
  routes: readonly WorldRouteDefinition[],
  locations: readonly WorldLocationDefinition[],
): void {
  if (routes.length === 0) {
    throw invalid(
      "No approved executable route definitions were supplied; proposed seed routes cannot be activated by inference.",
    );
  }
  const locationIds = new Set(locations.map((location) => location.publicLocationId));
  const routeIds = new Set<string>();
  for (const route of routes) {
    if (
      routeIds.has(route.publicRouteId) ||
      !/^rte_[a-z0-9_]+$/.test(route.publicRouteId) ||
      !locationIds.has(route.fromLocationId) ||
      !locationIds.has(route.toLocationId)
    ) {
      throw invalid(`Approved route ${route.publicRouteId} is invalid.`);
    }
    routeIds.add(route.publicRouteId);
  }
}

function classifyLocation(
  category: string,
): WorldLocationDefinition["kind"] {
  const normalized = category.toLowerCase();
  if (normalized.includes("airport") || normalized.includes("aerospace")) {
    return "airport";
  }
  if (
    normalized.includes("port") ||
    normalized.includes("harbor") ||
    normalized.includes("coast")
  ) {
    return "port";
  }
  if (normalized.includes("meridian") || normalized.includes("junction")) {
    return "meridian_hub";
  }
  if (
    normalized.includes("industrial") ||
    normalized.includes("manufacturing") ||
    normalized.includes("works") ||
    normalized.includes("energy") ||
    normalized.includes("mineral")
  ) {
    return "industrial";
  }
  if (normalized.includes("capital")) return "capital";
  return "city";
}

function invalid(message: string): WorldRuntimeError {
  return new WorldRuntimeError("world_definition_invalid", message, false);
}

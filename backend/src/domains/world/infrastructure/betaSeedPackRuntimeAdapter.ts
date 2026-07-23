import type {
  WorldDefinitionBundle,
  WorldLocationDefinition,
  WorldRouteDefinition,
} from "../contracts/worldRuntimeContracts.ts";
import { WorldRuntimeError } from "../contracts/worldRuntimeContracts.ts";

export const BETA_SEED_PACK_ID = "econovaria.beta-seed-pack.v1";
export const BETA_SEED_PACK_VERSION = "1.0.0-beta";
export const BETA_SEED_STABLE_MEMBER_COUNT = 590;

export interface BetaSeedDownstreamContractInput {
  readonly schemaVersion: string;
  readonly packId: string;
  readonly packVersion: string;
  readonly packDigest: string;
  readonly productionAuthorized: boolean;
  readonly boundedRelease: {
    readonly arrivalPackages: number;
    readonly locations: number;
    readonly routeCalibrations: number;
    readonly stableReleaseMembers: number;
  };
  readonly consumerRules: {
    readonly copySeedCatalogFiles: boolean;
    readonly failClosedWhenDefinitionMissingOrInactive: boolean;
    readonly requireExactDigest: boolean;
    readonly requireExactPackIdAndVersion: boolean;
    readonly stableIdReimportCompatible: boolean;
    readonly treatDeploymentAsActivation: boolean;
  };
  readonly contentIdentifiers: {
    readonly countries: readonly string[];
    readonly arrivalPackages: {
      readonly identifiers: readonly string[];
      readonly source: string;
    };
    readonly locations: {
      readonly count: number;
      readonly source: string;
    };
    readonly routes: {
      readonly count: number;
      readonly identifiers: readonly string[];
      readonly source: string;
    };
  };
  readonly fileBindings: Readonly<Record<string, {
    readonly path: string;
    readonly sha256: string;
  }>>;
}

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

export interface BetaApprovedRouteInput extends WorldRouteDefinition {
  readonly seedRouteDefinitionId: string;
}

export interface BetaPackRuntimeInput {
  readonly downstreamContract: BetaSeedDownstreamContractInput;
  readonly manifest: BetaPackManifestInput;
  readonly locations: BetaLocationRegistryInput;
  readonly campaign: BetaCampaignSelectionInput;
  readonly approvedRoutes: readonly BetaApprovedRouteInput[];
}

export interface BetaPackRuntimeReference {
  readonly packId: typeof BETA_SEED_PACK_ID;
  readonly packVersion: typeof BETA_SEED_PACK_VERSION;
  readonly packDigest: string;
  readonly world: WorldDefinitionBundle;
  readonly arrivalPackageDefinitionIds: Readonly<Record<string, string>>;
  readonly selectedCampaignEventIds: readonly string[];
  readonly selectedNewsTemplateIds: readonly string[];
  readonly sourceFileBindings: BetaSeedDownstreamContractInput["fileBindings"];
}

export function adaptBetaSeedPackForRuntime(
  input: BetaPackRuntimeInput,
): BetaPackRuntimeReference {
  const countries = validateDownstreamContract(input.downstreamContract);
  validateManifest(input.manifest, input.downstreamContract);
  const locations = adaptLocations(input.locations, countries);
  validateCampaign(input.campaign);
  const routes = validateApprovedRoutes(
    input.approvedRoutes,
    input.downstreamContract,
    locations,
  );
  const arrivalPackageDefinitionIds = bindArrivalPackages(
    input.downstreamContract.contentIdentifiers.arrivalPackages.identifiers,
    countries,
  );

  return Object.freeze({
    packId: BETA_SEED_PACK_ID,
    packVersion: BETA_SEED_PACK_VERSION,
    packDigest: input.downstreamContract.packDigest,
    world: Object.freeze({
      definition: Object.freeze({
        packId: BETA_SEED_PACK_ID,
        packVersion: BETA_SEED_PACK_VERSION,
        definitionDigest: `sha256:${input.downstreamContract.packDigest}`,
      }),
      locations,
      routes,
    }),
    arrivalPackageDefinitionIds,
    selectedCampaignEventIds: Object.freeze([...input.campaign.selectedEventStableIds]),
    selectedNewsTemplateIds: Object.freeze([
      ...input.campaign.selectedNewsTemplateStableIds,
    ]),
    sourceFileBindings: Object.freeze({ ...input.downstreamContract.fileBindings }),
  });
}

export function publicLocationIdFromStableId(stableId: string): string {
  if (!/^location\.[a-z0-9-]+\.[a-z0-9-]+\.v[0-9]+$/.test(stableId)) {
    throw invalid(`Location stable ID ${stableId} is invalid.`);
  }
  const [, country, location, version] = stableId.split(".");
  return `loc_${country}_${location.replaceAll("-", "_")}_${version}`;
}

function validateDownstreamContract(
  contract: BetaSeedDownstreamContractInput,
): readonly string[] {
  if (
    contract.schemaVersion !== "econovaria-beta-seed-downstream-consumer-contract-v1" ||
    contract.packId !== BETA_SEED_PACK_ID ||
    contract.packVersion !== BETA_SEED_PACK_VERSION ||
    !/^[0-9a-f]{64}$/.test(contract.packDigest) ||
    contract.productionAuthorized ||
    contract.boundedRelease.arrivalPackages !== 10 ||
    contract.boundedRelease.locations !== 50 ||
    contract.boundedRelease.routeCalibrations !== 13 ||
    contract.boundedRelease.stableReleaseMembers !== BETA_SEED_STABLE_MEMBER_COUNT ||
    contract.consumerRules.copySeedCatalogFiles ||
    !contract.consumerRules.failClosedWhenDefinitionMissingOrInactive ||
    !contract.consumerRules.requireExactDigest ||
    !contract.consumerRules.requireExactPackIdAndVersion ||
    !contract.consumerRules.stableIdReimportCompatible ||
    contract.consumerRules.treatDeploymentAsActivation
  ) {
    throw invalid("Merged Seed downstream contract does not match the approved bounded release.");
  }
  const countries = contract.contentIdentifiers.countries;
  if (
    countries.length !== 10 ||
    new Set(countries).size !== 10 ||
    countries.some((country) => !/^[a-z0-9][a-z0-9-]{1,63}$/.test(country)) ||
    contract.contentIdentifiers.locations.count !== 50 ||
    contract.contentIdentifiers.routes.count !== 13 ||
    contract.contentIdentifiers.routes.identifiers.length !== 13 ||
    contract.contentIdentifiers.arrivalPackages.identifiers.length !== 10
  ) {
    throw invalid("Merged Seed identifier counts are invalid.");
  }
  for (const binding of Object.values(contract.fileBindings)) {
    if (!binding.path.trim() || !/^[0-9a-f]{64}$/.test(binding.sha256)) {
      throw invalid("Merged Seed file binding is invalid.");
    }
  }
  for (const required of ["pack", "locations", "campaign", "arrivalCalibration", "calibrationScenarios"]) {
    if (!contract.fileBindings[required]) {
      throw invalid(`Merged Seed file binding ${required} is missing.`);
    }
  }
  return Object.freeze([...countries]);
}

function validateManifest(
  manifest: BetaPackManifestInput,
  contract: BetaSeedDownstreamContractInput,
): void {
  if (
    manifest.packId !== contract.packId ||
    manifest.version !== contract.packVersion ||
    manifest.schemaVersion !== "econovaria-beta-seed-pack-v1" ||
    manifest.maturity !== "executable-bounded-beta-pack" ||
    manifest.status !== "approved-for-isolated-staging" ||
    manifest.activationAuthorized ||
    manifest.productionAuthorized ||
    !manifest.allowedEnvironments.includes("staging") ||
    manifest.boundedCounts.arrivalPackages !== contract.boundedRelease.arrivalPackages ||
    manifest.boundedCounts.locationsVerified !== contract.boundedRelease.locations ||
    manifest.domainFiles.arrival !== "arrival-calibration-v1.json" ||
    manifest.domainFiles.campaign !== "campaign-v1.json" ||
    manifest.domainFiles.locations !== "location-registry-verified-v1.json"
  ) {
    throw invalid("Seed pack manifest does not match the merged downstream contract.");
  }
}

function adaptLocations(
  registry: BetaLocationRegistryInput,
  countries: readonly string[],
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
  const allowedCountries = new Set(countries);
  const stableIds = new Set<string>();
  const publicIds = new Set<string>();
  const countryCounts = new Map<string, number>();
  const adapted: WorldLocationDefinition[] = [];
  for (const location of registry.locations) {
    const publicLocationId = publicLocationIdFromStableId(location.id);
    if (
      stableIds.has(location.id) ||
      publicIds.has(publicLocationId) ||
      !allowedCountries.has(location.country) ||
      !location.name.trim() ||
      location.mapVerificationStatus !== "verified-against-player-artwork-and-polygons" ||
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
    countryCounts.set(location.country, (countryCounts.get(location.country) ?? 0) + 1);
    adapted.push(Object.freeze({
      publicLocationId,
      countryId: location.country,
      name: location.name,
      kind: classifyLocation(location.category),
      enabled: true,
    }));
  }
  for (const countryId of countries) {
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
    new Set(campaign.selectedEventStableIds).size !== campaign.selectedEventStableIds.length ||
    new Set(campaign.selectedNewsTemplateStableIds).size !== campaign.selectedNewsTemplateStableIds.length ||
    campaign.selectedEventStableIds.some((id) => !/^event\.[a-z0-9.-]+\.v[0-9]+$/.test(id)) ||
    campaign.selectedNewsTemplateStableIds.some((id) => !/^news-template\.[a-z0-9.-]+\.v[0-9]+$/.test(id))
  ) {
    throw invalid("Campaign selection is not a valid bounded runtime reference set.");
  }
}

function validateApprovedRoutes(
  routes: readonly BetaApprovedRouteInput[],
  contract: BetaSeedDownstreamContractInput,
  locations: readonly WorldLocationDefinition[],
): readonly WorldRouteDefinition[] {
  if (routes.length !== contract.contentIdentifiers.routes.count) {
    throw invalid("Approved route count does not match the merged Seed contract.");
  }
  const expected = new Set(contract.contentIdentifiers.routes.identifiers);
  const supplied = new Set(routes.map((route) => route.seedRouteDefinitionId));
  if (supplied.size !== expected.size || [...expected].some((id) => !supplied.has(id))) {
    throw invalid("Approved route identities do not match the merged Seed contract.");
  }
  const locationIds = new Set(locations.map((location) => location.publicLocationId));
  const publicRouteIds = new Set<string>();
  const modes = new Set<string>();
  const result: WorldRouteDefinition[] = [];
  for (const route of routes) {
    if (
      !expected.has(route.seedRouteDefinitionId) ||
      publicRouteIds.has(route.publicRouteId) ||
      !/^rte_[a-z0-9_]+$/.test(route.publicRouteId) ||
      !locationIds.has(route.fromLocationId) ||
      !locationIds.has(route.toLocationId) ||
      route.fromLocationId === route.toLocationId ||
      !Number.isSafeInteger(route.baseCostMinor) ||
      route.baseCostMinor < 0 ||
      !Number.isSafeInteger(route.baseDurationMinutes) ||
      route.baseDurationMinutes <= 0
    ) {
      throw invalid(`Approved route ${route.publicRouteId} is invalid.`);
    }
    publicRouteIds.add(route.publicRouteId);
    modes.add(route.mode);
    const { seedRouteDefinitionId: _seedRouteDefinitionId, ...runtimeRoute } = route;
    result.push(Object.freeze(runtimeRoute));
  }
  for (const mode of ["land", "sea", "air", "meridian"]) {
    if (!modes.has(mode)) throw invalid(`Approved route set is missing ${mode} coverage.`);
  }
  return Object.freeze(result);
}

function bindArrivalPackages(
  identifiers: readonly string[],
  countries: readonly string[],
): Readonly<Record<string, string>> {
  const result = new Map<string, string>();
  for (const identifier of identifiers) {
    const match = identifier.match(/^arrival-package\.([a-z0-9-]+)\.[a-z0-9-]+\.v[0-9]+$/);
    if (!match || !countries.includes(match[1]!) || result.has(match[1]!)) {
      throw invalid(`Arrival package ${identifier} is invalid or duplicated.`);
    }
    result.set(match[1]!, identifier);
  }
  if (result.size !== countries.length) throw invalid("Arrival package coverage is incomplete.");
  return Object.freeze(Object.fromEntries(result));
}

function classifyLocation(category: string): WorldLocationDefinition["kind"] {
  const normalized = category.toLowerCase();
  if (normalized.includes("airport") || normalized.includes("aerospace")) return "airport";
  if (normalized.includes("port") || normalized.includes("harbor") || normalized.includes("coast")) return "port";
  if (normalized.includes("meridian") || normalized.includes("junction")) return "meridian_hub";
  if (
    normalized.includes("industrial") || normalized.includes("manufacturing") ||
    normalized.includes("works") || normalized.includes("energy") ||
    normalized.includes("mineral")
  ) return "industrial";
  if (normalized.includes("capital")) return "capital";
  return "city";
}

function invalid(message: string): WorldRuntimeError {
  return new WorldRuntimeError("world_definition_invalid", message, false);
}

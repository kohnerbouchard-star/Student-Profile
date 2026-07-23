import { createHash } from "node:crypto";

export const PACK_ID = "econovaria.beta-seed-pack.v1";
export const PACK_VERSION = "1.0.0-beta";
export const COUNTRY_IDS = Object.freeze([
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
]);
export const CLASS_IDS = Object.freeze([
  "analyst",
  "builder",
  "maker",
  "mediator",
  "navigator",
  "operator",
  "steward",
  "trader",
]);

const MODE_PROFILE = Object.freeze({
  land: Object.freeze({ costPerPixel: 8, minutesPerPixel: 1.1 }),
  sea: Object.freeze({ costPerPixel: 6, minutesPerPixel: 1.45 }),
  air: Object.freeze({ costPerPixel: 14, minutesPerPixel: 0.42 }),
  meridian: Object.freeze({ costPerPixel: 10, minutesPerPixel: 0.3 }),
});

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

export function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function publicLocationId(stableId) {
  const match = /^location\.([a-z0-9-]+)\.([a-z0-9-]+)\.v([0-9]+)$/.exec(String(stableId));
  requireCondition(match, `Invalid location stable ID ${stableId}`);
  return `loc_${match[1]}_${match[2].replaceAll("-", "_")}_v${match[3]}`;
}

export function publicRouteId(stableId) {
  const match = /^route\.meridian\.([a-z0-9-]+)\.v([0-9]+)$/.exec(String(stableId));
  requireCondition(match, `Invalid route stable ID ${stableId}`);
  return `rte_meridian_${match[1].replaceAll("-", "_")}_v${match[2]}`;
}

export function classifyLocation(category) {
  const normalized = String(category ?? "").toLowerCase();
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

export function routeMode(modes) {
  const normalized = new Set((Array.isArray(modes) ? modes : []).map((value) => String(value).toLowerCase()));
  if (normalized.has("air-freight")) return "air";
  if (normalized.has("maritime")) return "sea";
  if (normalized.has("data") && !normalized.has("rail")) return "meridian";
  return "land";
}

export function buildWorldPublication({ downstreamContract, locations, calibration }) {
  requireCondition(downstreamContract?.packId === PACK_ID, "Unexpected downstream pack ID");
  requireCondition(downstreamContract?.packVersion === PACK_VERSION, "Unexpected downstream pack version");
  requireCondition(/^[a-f0-9]{64}$/.test(downstreamContract?.packDigest ?? ""), "Invalid downstream pack digest");
  requireCondition(downstreamContract?.productionAuthorized === false, "World publication must prohibit production");
  requireCondition(Array.isArray(locations?.locations) && locations.locations.length === 50, "World publication requires 50 locations");
  requireCondition(Array.isArray(calibration?.routes?.routes) && calibration.routes.routes.length === 13, "World publication requires 13 routes");

  const worldLocations = locations.locations.map((location) => ({
    publicLocationId: publicLocationId(location.id),
    countryId: String(location.country).toLowerCase(),
    name: String(location.name).trim(),
    kind: classifyLocation(location.category),
    enabled: true,
  }));
  requireCondition(new Set(worldLocations.map((entry) => entry.publicLocationId)).size === 50, "World location IDs are not unique");
  const locationIds = new Set(worldLocations.map((entry) => entry.publicLocationId));

  const worldRoutes = calibration.routes.routes.map((route) => {
    const mode = routeMode(route.modes);
    const distance = Number(route?.geometry?.straightLinePixelLength);
    requireCondition(Number.isFinite(distance) && distance > 0, `Route ${route.routeId} has invalid geometry`);
    const fromLocationId = publicLocationId(route.originLocationId);
    const toLocationId = publicLocationId(route.destinationLocationId);
    requireCondition(locationIds.has(fromLocationId) && locationIds.has(toLocationId), `Route ${route.routeId} has an unknown endpoint`);
    const profile = MODE_PROFILE[mode];
    return {
      publicRouteId: publicRouteId(route.routeId),
      fromLocationId,
      toLocationId,
      mode,
      bidirectional: true,
      baseCostMinor: Math.max(100, Math.round(distance * profile.costPerPixel)),
      baseDurationMinutes: Math.max(30, Math.round(distance * profile.minutesPerPixel)),
    };
  });
  requireCondition(new Set(worldRoutes.map((entry) => entry.publicRouteId)).size === 13, "World route IDs are not unique");
  for (const mode of Object.keys(MODE_PROFILE)) {
    requireCondition(worldRoutes.some((route) => route.mode === mode), `World route set is missing ${mode}`);
  }

  const definition = {
    packId: PACK_ID,
    packVersion: PACK_VERSION,
    definitionDigest: `sha256:${downstreamContract.packDigest}`,
  };
  const publicationDigest = sha256(canonicalJson({ definition, locations: worldLocations, routes: worldRoutes }));
  return Object.freeze({
    definition: Object.freeze(definition),
    locations: Object.freeze(worldLocations.map(Object.freeze)),
    routes: Object.freeze(worldRoutes.map(Object.freeze)),
    publicationDigest,
  });
}

export function buildCountryRuntime({ downstreamContract, locationRegistry, countryProfiles }) {
  requireCondition(Array.isArray(countryProfiles) && countryProfiles.length === 10, "Expected ten country profiles");
  const profileByCode = new Map(countryProfiles.map((profile) => [String(profile.country_code).toLowerCase(), profile]));
  const locationByCountry = new Map();
  for (const location of locationRegistry.locations ?? []) {
    if (String(location.category).toLowerCase().includes("capital")) {
      locationByCountry.set(String(location.country).toLowerCase(), publicLocationId(location.id));
    }
  }
  const arrivalByCountry = new Map();
  for (const identifier of downstreamContract?.contentIdentifiers?.arrivalPackages?.identifiers ?? []) {
    const match = /^arrival-package\.([a-z0-9-]+)\.[a-z0-9-]+\.v[0-9]+$/.exec(identifier);
    requireCondition(match, `Invalid Arrival Package identifier ${identifier}`);
    arrivalByCountry.set(match[1], identifier);
  }

  const countries = COUNTRY_IDS.map((countryId) => {
    const profile = profileByCode.get(countryId);
    requireCondition(profile?.id, `Missing country profile for ${countryId}`);
    requireCondition(profile.status === "active", `Country profile ${countryId} is not active`);
    requireCondition(/^[A-Z]{3}$/.test(profile.currency_code ?? ""), `Country profile ${countryId} has invalid currency`);
    const arrivalLocationId = locationByCountry.get(countryId);
    const arrivalPackageDefinitionId = arrivalByCountry.get(countryId);
    requireCondition(arrivalLocationId, `Missing capital arrival location for ${countryId}`);
    requireCondition(arrivalPackageDefinitionId, `Missing Arrival Package for ${countryId}`);
    return {
      countryUuid: profile.id,
      countryId,
      currencyCode: profile.currency_code,
      arrivalLocationId,
      arrivalPackageDefinitionId,
    };
  });

  const classGrants = CLASS_IDS.map((classId) => ({
    classId,
    grantDefinitionId: `class-grant-v1:${classId}`,
  }));
  return Object.freeze({ countries: Object.freeze(countries.map(Object.freeze)), classGrants: Object.freeze(classGrants.map(Object.freeze)) });
}

export function validateWorldConnectedState({ runtimeCount, locationCount, routeCount, countryCount, grantCount, assignmentMirror }) {
  requireCondition(Number(runtimeCount) === 1, "Expected one World runtime instance");
  requireCondition(Number(locationCount) === 50, "Expected 50 World locations");
  requireCondition(Number(routeCount) === 13, "Expected 13 World routes");
  requireCondition(Number(countryCount) === 10, "Expected ten World country bindings");
  requireCondition(Number(grantCount) === 8, "Expected eight Arrival Class grants");
  requireCondition(Number(assignmentMirror?.active_assignment_count) >= 1, "Expected at least one active country assignment");
  requireCondition(Number(assignmentMirror?.mirrored_player_count) === Number(assignmentMirror?.active_assignment_count), "Not every assigned Player has a country mirror");
  requireCondition(Number(assignmentMirror?.mismatch_count) === 0, "Player country mirror mismatch detected");
  return true;
}

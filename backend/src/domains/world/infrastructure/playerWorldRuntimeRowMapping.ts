import type { PlayerRequestScope } from "../../players/index.ts";
import type {
  ArrivalClassAssignment,
  ArrivalClassId,
  ArrivalClassScoreResult,
} from "../../arrival/index.ts";
import type { PlayerCampaignProjectionSource } from "../../campaign/index.ts";
import type {
  PlayerResidencyState,
  PlayerTravelJourney,
  PlayerTravelState,
  StoredTravelQuote,
  WorldLocationDefinition,
  WorldLocationState,
  WorldRouteDefinition,
  WorldRouteState,
  WorldRuntimeState,
} from "../contracts/worldRuntimeContracts.ts";
import { WorldRuntimeError } from "../contracts/worldRuntimeContracts.ts";
import type {
  ArrivalAssignmentRow,
  LocationRow,
  ResidencyRow,
  ResidencyRpcRow,
  RouteRow,
  TravelJourneyRow,
  TravelJourneyRpcRow,
  TravelQuoteRow,
  TravelStateRow,
  WorldRuntimeRow,
} from "./playerWorldRuntimeRows.ts";

type CampaignPhase = PlayerCampaignProjectionSource["currentPhase"];
type CampaignStatus = PlayerCampaignProjectionSource["status"];

export function mapWorldRuntime(
  runtime: WorldRuntimeRow,
  locations: readonly LocationRow[],
  routes: readonly RouteRow[],
  gameId: string,
): WorldRuntimeState {
  return Object.freeze({
    gameId,
    definition: Object.freeze({
      packId: runtime.pack_id,
      packVersion: runtime.pack_version,
      definitionDigest: runtime.definition_digest,
    }),
    locationStates: Object.freeze(locations.map(mapLocationState)),
    routeStates: Object.freeze(routes.map(mapRouteState)),
    executedCommandKeys: Object.freeze([]),
    revision: requireNonnegativeInteger(runtime.revision, "world revision"),
    updatedAt: requireTimestamp(runtime.updated_at, "world update"),
  });
}

export function mapArrivalAssignment(
  row: ArrivalAssignmentRow,
  scope: PlayerRequestScope,
): ArrivalClassAssignment {
  const score = isRecord(row.score_result)
    ? row.score_result as unknown as ArrivalClassScoreResult
    : null;
  return Object.freeze({
    assignmentId: row.public_id,
    gameId: scope.gameId,
    gameSessionId: scope.gameId,
    playerUuid: scope.playerUuid,
    countryId: row.country_id,
    classId: requireClassId(row.class_id),
    source: row.source === "admin_override" ? "admin_override" : "questionnaire",
    questionnaireId: row.questionnaire_id,
    questionnaireVersion: row.questionnaire_version,
    scoreResult: score,
    overrideReason: typeof row.override_reason === "string" ? row.override_reason : null,
    revision: requireNonnegativeInteger(row.revision, "arrival revision"),
    assignedAt: requireTimestamp(row.assigned_at, "arrival assignment"),
    updatedAt: requireTimestamp(row.updated_at, "arrival assignment update"),
    economicRestrictions: Object.freeze([]),
  });
}

export function mapTravelState(
  row: TravelStateRow,
  scope: PlayerRequestScope,
): PlayerTravelState {
  return Object.freeze({
    gameId: scope.gameId,
    gameSessionId: scope.gameId,
    playerUuid: scope.playerUuid,
    currentLocationId: row.current_location_id,
    status: row.status === "in_transit" ? "in_transit" : "available",
    activeJourneyId: typeof row.active_journey_id === "string"
      ? row.active_journey_id
      : null,
    arrivalAt: nullableTimestamp(row.arrival_at),
    revision: requireNonnegativeInteger(row.revision, "travel revision"),
    updatedAt: requireTimestamp(row.updated_at, "travel update"),
  });
}

export function mapResidency(
  row: ResidencyRow,
  scope: PlayerRequestScope,
): PlayerResidencyState {
  return Object.freeze({
    gameId: scope.gameId,
    gameSessionId: scope.gameId,
    playerUuid: scope.playerUuid,
    currentCountryId: row.current_country_id,
    currencyCode: requireCurrency(row.currency_code),
    eligibleCountryIds: Object.freeze(readStringArray(row.eligible_country_ids)),
    pendingCountryId: typeof row.pending_country_id === "string"
      ? row.pending_country_id
      : null,
    revision: requireNonnegativeInteger(row.revision, "residency revision"),
    updatedAt: requireTimestamp(row.updated_at, "residency update"),
  });
}

export function mapResidencyRpc(
  row: ResidencyRpcRow,
  scope: PlayerRequestScope,
): PlayerResidencyState {
  return Object.freeze({
    gameId: scope.gameId,
    gameSessionId: scope.gameId,
    playerUuid: scope.playerUuid,
    currentCountryId: row.current_country_id,
    currencyCode: requireCurrency(row.currency_code),
    eligibleCountryIds: Object.freeze(readStringArray(row.eligible_country_ids)),
    pendingCountryId: typeof row.pending_country_id === "string"
      ? row.pending_country_id
      : null,
    revision: requireNonnegativeInteger(row.revision, "residency revision"),
    updatedAt: requireTimestamp(row.updated_at, "residency update"),
  });
}

export function mapStoredTravelQuote(
  row: TravelQuoteRow,
  scope: PlayerRequestScope,
): StoredTravelQuote {
  const legs = Array.isArray(row.legs) ? row.legs : [];
  return Object.freeze({
    publicQuoteId: row.public_id,
    gameId: scope.gameId,
    playerUuid: scope.playerUuid,
    fromLocationId: row.from_location_id,
    toLocationId: row.to_location_id,
    currencyCode: requireCurrency(row.currency_code),
    totalCostMinor: requireNonnegativeInteger(row.total_cost_minor, "travel cost"),
    totalDurationMinutes: requirePositiveInteger(row.total_duration_minutes, "travel duration"),
    routeStateRevision: requireNonnegativeInteger(row.route_state_revision, "route revision"),
    legs: Object.freeze(legs.map(mapStoredLeg)),
    status: row.status === "consumed"
      ? "consumed"
      : row.status === "expired"
      ? "expired"
      : "created",
    expiresAt: requireTimestamp(row.expires_at, "quote expiry"),
  });
}

function mapStoredLeg(value: unknown): StoredTravelQuote["legs"][number] {
  if (!isRecord(value)) throw unavailable("Stored travel leg is malformed.");
  const mode = String(value.mode);
  if (!["land", "sea", "air", "meridian"].includes(mode)) {
    throw unavailable("Stored travel leg mode is invalid.");
  }
  return Object.freeze({
    publicRouteId: requireString(value.publicRouteId, "route id"),
    fromLocationId: requireString(value.fromLocationId, "route origin"),
    toLocationId: requireString(value.toLocationId, "route destination"),
    mode: mode as StoredTravelQuote["legs"][number]["mode"],
    costMinor: requireNonnegativeInteger(value.costMinor, "leg cost"),
    durationMinutes: requirePositiveInteger(value.durationMinutes, "leg duration"),
    routeRevision: requireNonnegativeInteger(value.routeRevision, "leg revision"),
  });
}

export function mapTravelJourney(row: TravelJourneyRpcRow): PlayerTravelJourney {
  return Object.freeze({
    publicJourneyId: row.journey_id,
    publicQuoteId: row.quote_id,
    fromLocationId: row.from_location_id,
    toLocationId: row.to_location_id,
    currencyCode: requireCurrency(row.currency_code),
    totalCostMinor: requireNonnegativeInteger(row.total_cost_minor, "journey cost"),
    totalDurationMinutes: requirePositiveInteger(row.total_duration_minutes, "journey duration"),
    status: row.status === "completed" ? "completed" : "in_transit",
    departedAt: requireTimestamp(row.departed_at, "journey departure"),
    arrivalAt: requireTimestamp(row.arrival_at, "journey arrival"),
    completedAt: nullableTimestamp(row.completed_at),
  });
}

export function mapTravelJourneyRow(row: TravelJourneyRow): PlayerTravelJourney {
  return Object.freeze({
    publicJourneyId: row.public_id,
    publicQuoteId: requireString(row.quote.public_id, "quote id"),
    fromLocationId: row.from_location_id,
    toLocationId: row.to_location_id,
    currencyCode: requireCurrency(row.currency_code),
    totalCostMinor: requireNonnegativeInteger(row.total_cost_minor, "journey cost"),
    totalDurationMinutes: requirePositiveInteger(row.total_duration_minutes, "journey duration"),
    status: row.status === "completed" ? "completed" : "in_transit",
    departedAt: requireTimestamp(row.departed_at, "journey departure"),
    arrivalAt: requireTimestamp(row.arrival_at, "journey arrival"),
    completedAt: nullableTimestamp(row.completed_at),
  });
}

export function mapLocationDefinition(row: LocationRow): WorldLocationDefinition {
  const kind = String(row.location_kind);
  if (![
    "capital",
    "city",
    "port",
    "airport",
    "industrial",
    "meridian_hub",
  ].includes(kind)) {
    throw unavailable(`Location ${row.public_location_id} has no reviewed kind.`);
  }
  return Object.freeze({
    publicLocationId: row.public_location_id,
    countryId: row.country_id,
    name: requireString(row.display_name, "location name"),
    kind: kind as WorldLocationDefinition["kind"],
    enabled: row.availability !== "closed",
  });
}

export function mapRouteDefinition(row: RouteRow): WorldRouteDefinition {
  const mode = String(row.mode);
  if (!["land", "sea", "air", "meridian"].includes(mode)) {
    throw unavailable(`Route ${row.public_route_id} has an invalid mode.`);
  }
  return Object.freeze({
    publicRouteId: row.public_route_id,
    fromLocationId: row.from_location_id,
    toLocationId: row.to_location_id,
    mode: mode as WorldRouteDefinition["mode"],
    bidirectional: Boolean(row.bidirectional),
    baseCostMinor: requireNonnegativeInteger(row.base_cost_minor, "route base cost"),
    baseDurationMinutes: requirePositiveInteger(row.base_duration_minutes, "route base duration"),
  });
}

function mapLocationState(row: LocationRow): WorldLocationState {
  const availability = String(row.availability);
  if (!["normal", "shortage", "conflict", "closed"].includes(availability)) {
    throw unavailable(`Location ${row.public_location_id} has invalid state.`);
  }
  return Object.freeze({
    publicLocationId: row.public_location_id,
    availability: availability as WorldLocationState["availability"],
    revision: requireNonnegativeInteger(row.revision, "location revision"),
    updatedAt: requireTimestamp(row.updated_at, "location update"),
  });
}

function mapRouteState(row: RouteRow): WorldRouteState {
  const status = String(row.status);
  const reason = String(row.reason);
  if (![
    "open",
    "restricted",
    "closed",
  ].includes(status) || ![
    "normal",
    "shortage",
    "meridian_disruption",
    "war",
    "recovery",
  ].includes(reason)) {
    throw unavailable(`Route ${row.public_route_id} has invalid state.`);
  }
  return Object.freeze({
    publicRouteId: row.public_route_id,
    status: status as WorldRouteState["status"],
    reason: reason as WorldRouteState["reason"],
    costMultiplierBasisPoints: requirePositiveInteger(
      row.cost_multiplier_basis_points,
      "route cost multiplier",
    ),
    durationMultiplierBasisPoints: requirePositiveInteger(
      row.duration_multiplier_basis_points,
      "route duration multiplier",
    ),
    revision: requireNonnegativeInteger(row.revision, "route revision"),
    updatedAt: requireTimestamp(row.updated_at, "route update"),
  });
}

export function unavailable(message: string): WorldRuntimeError {
  return new WorldRuntimeError("world_travel_unavailable", message, true);
}

function requireClassId(value: unknown): ArrivalClassId {
  const classId = String(value);
  if (![
    "analyst",
    "builder",
    "maker",
    "mediator",
    "navigator",
    "operator",
    "steward",
    "trader",
  ].includes(classId)) throw unavailable("Stored arrival class is invalid.");
  return classId as ArrivalClassId;
}

export function requireCampaignStatus(value: unknown): CampaignStatus {
  const status = String(value);
  if (!["active", "paused", "emergency_disabled", "completed"].includes(status)) {
    throw unavailable("Stored campaign status is invalid.");
  }
  return status as CampaignStatus;
}

export function requirePhase(value: unknown): CampaignPhase {
  const phase = String(value);
  if (![
    "arrival",
    "opportunity",
    "rivalry",
    "shortage",
    "meridian_disruption",
    "open_conflict",
    "adaptation",
    "reconstruction",
    "continued_conflict",
  ].includes(phase)) throw unavailable("Stored campaign phase is invalid.");
  return phase as CampaignPhase;
}

export function requireCurrency(value: unknown): string {
  const currency = String(value ?? "");
  if (!/^[A-Z]{3}$/.test(currency)) throw unavailable("Settlement currency is invalid.");
  return currency;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw unavailable(`${label} is invalid.`);
  }
  return value;
}

export function requireTimestamp(value: unknown, label: string): string {
  const timestamp = String(value ?? "");
  if (!Number.isFinite(Date.parse(timestamp))) throw unavailable(`${label} is invalid.`);
  return timestamp;
}

export function nullableTimestamp(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return requireTimestamp(value, "timestamp");
}

export function requireNonnegativeInteger(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw unavailable(`${label} is invalid.`);
  }
  return number;
}

function requirePositiveInteger(value: unknown, label: string): number {
  const number = requireNonnegativeInteger(value, label);
  if (number === 0) throw unavailable(`${label} must be positive.`);
  return number;
}

export function readStringArray(
  value: unknown,
  property?: string,
): readonly string[] {
  const candidate = property && isRecord(value) ? value[property] : value;
  if (!Array.isArray(candidate)) return Object.freeze([]);
  return Object.freeze(candidate.filter((item): item is string =>
    typeof item === "string"
  ));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

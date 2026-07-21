export const WORLD_ROUTE_MODES = ["land", "sea", "air", "meridian"] as const;
export type WorldRouteMode = typeof WORLD_ROUTE_MODES[number];

export interface WorldDefinitionRef {
  readonly packId: string;
  readonly packVersion: string;
  readonly definitionDigest: string;
}

export interface WorldLocationDefinition {
  readonly publicLocationId: string;
  readonly countryId: string;
  readonly name: string;
  readonly kind: "capital" | "city" | "port" | "airport" | "industrial" | "meridian_hub";
  readonly enabled: boolean;
}

export interface WorldRouteDefinition {
  readonly publicRouteId: string;
  readonly fromLocationId: string;
  readonly toLocationId: string;
  readonly mode: WorldRouteMode;
  readonly bidirectional: boolean;
  readonly baseCostMinor: number;
  readonly baseDurationMinutes: number;
}

export interface WorldDefinitionBundle {
  readonly definition: WorldDefinitionRef;
  readonly locations: readonly WorldLocationDefinition[];
  readonly routes: readonly WorldRouteDefinition[];
}

export interface WorldLocationState {
  readonly publicLocationId: string;
  readonly availability: "normal" | "shortage" | "conflict" | "closed";
  readonly revision: number;
  readonly updatedAt: string;
}

export interface WorldRouteState {
  readonly publicRouteId: string;
  readonly status: "open" | "restricted" | "closed";
  readonly reason: "normal" | "shortage" | "meridian_disruption" | "war" | "recovery";
  readonly costMultiplierBasisPoints: number;
  readonly durationMultiplierBasisPoints: number;
  readonly revision: number;
  readonly updatedAt: string;
}

export interface WorldRuntimeState {
  readonly gameId: string;
  readonly definition: WorldDefinitionRef;
  readonly locationStates: readonly WorldLocationState[];
  readonly routeStates: readonly WorldRouteState[];
  readonly executedCommandKeys: readonly string[];
  readonly revision: number;
  readonly updatedAt: string;
}

export interface PlayerResidencyState {
  readonly gameId: string;
  readonly gameSessionId: string;
  readonly playerUuid: string;
  readonly currentCountryId: string;
  readonly eligibleCountryIds: readonly string[];
  readonly pendingCountryId: string | null;
  readonly revision: number;
  readonly updatedAt: string;
}

export interface PlayerTravelState {
  readonly gameId: string;
  readonly gameSessionId: string;
  readonly playerUuid: string;
  readonly currentLocationId: string;
  readonly status: "available" | "in_transit";
  readonly activeJourneyId: string | null;
  readonly arrivalAt: string | null;
  readonly revision: number;
  readonly updatedAt: string;
}

export interface PlayerTravelContext {
  readonly gameId: string;
  readonly gameSessionId: string;
  readonly playerUuid: string;
  readonly currentLocationId: string;
  readonly settlementCurrencyCode?: string;
  readonly residency: PlayerResidencyState;
  readonly allowedModes: readonly WorldRouteMode[];
}

export interface TravelLegQuote {
  readonly publicRouteId: string;
  readonly fromLocationId: string;
  readonly toLocationId: string;
  readonly mode: WorldRouteMode;
  readonly costMinor: number;
  readonly durationMinutes: number;
}

export interface TravelQuote {
  readonly gameId: string;
  readonly playerUuid: string;
  readonly fromLocationId: string;
  readonly toLocationId: string;
  readonly currencyCode?: string;
  readonly totalCostMinor: number;
  readonly totalDurationMinutes: number;
  readonly legs: readonly TravelLegQuote[];
  readonly routeStateRevision: number;
}

export interface StoredTravelQuote extends TravelQuote {
  readonly publicQuoteId: string;
  readonly currencyCode: string;
  readonly status: "created" | "consumed" | "expired";
  readonly expiresAt: string;
}

export interface PlayerTravelJourney {
  readonly publicJourneyId: string;
  readonly publicQuoteId: string;
  readonly fromLocationId: string;
  readonly toLocationId: string;
  readonly currencyCode: string;
  readonly totalCostMinor: number;
  readonly totalDurationMinutes: number;
  readonly status: "in_transit" | "completed";
  readonly departedAt: string;
  readonly arrivalAt: string;
  readonly completedAt: string | null;
}

export interface WorldRouteStateCommand {
  readonly commandKey: string;
  readonly gameId: string;
  readonly publicRouteIds: readonly string[];
  readonly status: "open" | "restricted" | "closed";
  readonly reason: WorldRouteState["reason"];
  readonly costMultiplierBasisPoints: number;
  readonly durationMultiplierBasisPoints: number;
  readonly expectedRevision: number;
  readonly occurredAt: string;
}

export class WorldRuntimeError extends Error {
  constructor(
    readonly code:
      | "world_definition_invalid"
      | "world_game_scope_mismatch"
      | "world_revision_conflict"
      | "world_route_not_found"
      | "world_location_unavailable"
      | "world_route_unavailable"
      | "world_travel_mode_forbidden"
      | "world_travel_unavailable"
      | "world_travel_quote_invalid"
      | "world_travel_quote_expired"
      | "world_travel_balance_insufficient"
      | "world_command_invalid",
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "WorldRuntimeError";
  }
}

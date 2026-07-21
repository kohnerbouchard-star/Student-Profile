import type {
  PlayerTravelContext,
  StoredTravelQuote,
  TravelQuote,
  WorldRuntimeState,
} from "../contracts/worldRuntimeContracts.ts";
import { WorldRuntimeError } from "../contracts/worldRuntimeContracts.ts";

export function prepareStoredTravelQuote(input: {
  readonly quote: TravelQuote;
  readonly state: WorldRuntimeState;
  readonly context: PlayerTravelContext;
  readonly publicQuoteId: string;
  readonly createdAt: string;
  readonly ttlSeconds?: number;
}): StoredTravelQuote {
  const createdAtMs = Date.parse(input.createdAt);
  const ttlSeconds = input.ttlSeconds ?? 120;
  if (
    !/^trq_[0-9a-f]{32}$/.test(input.publicQuoteId) ||
    !Number.isFinite(createdAtMs) ||
    !Number.isInteger(ttlSeconds) ||
    ttlSeconds < 30 ||
    ttlSeconds > 600 ||
    !input.context.settlementCurrencyCode ||
    !/^[A-Z]{3}$/.test(input.context.settlementCurrencyCode) ||
    input.quote.gameId !== input.state.gameId ||
    input.quote.gameId !== input.context.gameId ||
    input.quote.playerUuid !== input.context.playerUuid ||
    input.quote.fromLocationId !== input.context.currentLocationId ||
    input.quote.fromLocationId === input.quote.toLocationId ||
    input.quote.totalCostMinor < 0 ||
    input.quote.totalDurationMinutes <= 0 ||
    input.quote.legs.length === 0 ||
    input.quote.legs.length > 20 ||
    input.quote.routeStateRevision !== input.state.revision
  ) {
    throw new WorldRuntimeError(
      "world_travel_quote_invalid",
      "Travel quote cannot be persisted because its scope, currency, route revision, or bounds are invalid.",
      false,
    );
  }

  const routeStateById = new Map(
    input.state.routeStates.map((routeState) => [
      routeState.publicRouteId,
      routeState,
    ]),
  );
  const storedLegs = input.quote.legs.map((leg) => {
    const routeState = routeStateById.get(leg.publicRouteId);
    if (!routeState || routeState.status === "closed") {
      throw new WorldRuntimeError(
        "world_travel_quote_invalid",
        `Route ${leg.publicRouteId} is not available for a stored quote.`,
        true,
      );
    }
    return Object.freeze({
      ...leg,
      routeRevision: routeState.revision,
    });
  });

  return Object.freeze({
    ...input.quote,
    publicQuoteId: input.publicQuoteId,
    currencyCode: input.context.settlementCurrencyCode,
    legs: Object.freeze(storedLegs),
    status: "created",
    expiresAt: new Date(createdAtMs + ttlSeconds * 1_000).toISOString(),
  });
}

export function validateStoredTravelQuoteForExecution(input: {
  readonly quote: StoredTravelQuote;
  readonly gameId: string;
  readonly playerUuid: string;
  readonly currentLocationId: string;
  readonly now: string;
}): void {
  const nowMs = Date.parse(input.now);
  if (
    input.quote.gameId !== input.gameId ||
    input.quote.playerUuid !== input.playerUuid
  ) {
    throw new WorldRuntimeError(
      "world_game_scope_mismatch",
      "Travel quote belongs to another game or player.",
      false,
    );
  }
  if (input.quote.status !== "created") {
    throw new WorldRuntimeError(
      "world_travel_quote_invalid",
      `Travel quote is ${input.quote.status}.`,
      false,
    );
  }
  if (!Number.isFinite(nowMs) || Date.parse(input.quote.expiresAt) <= nowMs) {
    throw new WorldRuntimeError(
      "world_travel_quote_expired",
      "Travel quote has expired.",
      true,
    );
  }
  if (input.quote.fromLocationId !== input.currentLocationId) {
    throw new WorldRuntimeError(
      "world_travel_quote_invalid",
      "Travel quote origin no longer matches the player location.",
      true,
    );
  }
}

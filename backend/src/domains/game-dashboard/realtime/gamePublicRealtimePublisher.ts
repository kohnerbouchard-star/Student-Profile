import type {
  GamePublicRealtimeEvent,
} from "../contracts/playerGameDashboardContracts.ts";

export const GAME_PUBLIC_REALTIME_PUBLISHER_EVENTS = [
  "stock_tick",
  "market_news_posted",
  "market_status_changed",
] as const satisfies readonly GamePublicRealtimeEvent[];

export type GamePublicRealtimePublisherEvent =
  typeof GAME_PUBLIC_REALTIME_PUBLISHER_EVENTS[number];

export type GamePublicRealtimeChannel = `game:${string}:public`;

export interface GamePublicRealtimeStockTickStockPayload {
  readonly stockAssetId: string;
  readonly ticker: string;
  readonly companyName: string;
  readonly sector: string;
  readonly countryCode: string;
  readonly currentPrice: number;
  readonly previousClose: number;
  readonly changePct: number;
  readonly volume: number;
}

export interface GamePublicRealtimeMarketNewsPayload {
  readonly id: string;
  readonly headline: string;
  readonly explanation: string;
  readonly category: string;
  readonly sentiment: string;
  readonly source: string;
  readonly scope: string;
  readonly targetKey: string | null;
  readonly createdTick: number;
  readonly expiresTick: number | null;
  readonly createdAt: string;
}

export interface GamePublicRealtimePayloadByEvent {
  readonly stock_tick: {
    readonly tick: number;
    readonly stocks: readonly GamePublicRealtimeStockTickStockPayload[];
  };
  readonly market_news_posted: {
    readonly news: GamePublicRealtimeMarketNewsPayload;
  };
  readonly market_status_changed: {
    readonly marketStatus: "open" | "closed" | string;
    readonly currentTick: number | null;
  };
}

export interface GamePublicRealtimeEnvelope<
  TEvent extends GamePublicRealtimePublisherEvent = GamePublicRealtimePublisherEvent,
> {
  readonly gameSessionId: string;
  readonly channel: GamePublicRealtimeChannel;
  readonly sequence: number | null;
  readonly eventType: TEvent;
  readonly occurredAt: string;
  readonly payload: GamePublicRealtimePayloadByEvent[TEvent];
}

export interface GamePublicRealtimeEnvelopeInput<
  TEvent extends GamePublicRealtimePublisherEvent,
> {
  readonly gameSessionId: string;
  readonly sequence?: number | null;
  readonly eventType: TEvent;
  readonly occurredAt: string;
  readonly payload: GamePublicRealtimePayloadByEvent[TEvent];
}

export interface GamePublicRealtimeBroadcastMessage<
  TEvent extends GamePublicRealtimePublisherEvent = GamePublicRealtimePublisherEvent,
> {
  readonly channel: GamePublicRealtimeChannel;
  readonly event: TEvent;
  readonly payload: GamePublicRealtimeEnvelope<TEvent>;
}

export interface GamePublicRealtimeTransport {
  send(
    message: GamePublicRealtimeBroadcastMessage,
  ): Promise<GamePublicRealtimeTransportResult>;
}

export type GamePublicRealtimeTransportResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: string;
        readonly message: string;
        readonly retryable: boolean;
      };
    };

export type GamePublicRealtimePublishResult<
  TEvent extends GamePublicRealtimePublisherEvent = GamePublicRealtimePublisherEvent,
> =
  | {
      readonly ok: true;
      readonly message: GamePublicRealtimeBroadcastMessage<TEvent>;
    }
  | {
      readonly ok: false;
      readonly error: GamePublicRealtimePublishError;
    };

export interface GamePublicRealtimePublishError {
  readonly code:
    | "invalid_game_public_realtime_event"
    | "game_public_realtime_broadcast_failed";
  readonly message: string;
  readonly retryable: boolean;
}

type ValidationResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly error: GamePublicRealtimePublishError;
    };

const PRIVATE_PUBLIC_CHANNEL_FIELD_NAMES = new Set([
  "accesscode",
  "accountbalance",
  "accountbalances",
  "accountid",
  "accountids",
  "balance",
  "balances",
  "cash",
  "cashbalance",
  "contractprogress",
  "contractsubmission",
  "contractsubmissions",
  "holding",
  "holdings",
  "idempotencykey",
  "inventory",
  "ledger",
  "ledgerentries",
  "ledgerentry",
  "ledgerentryid",
  "order",
  "orders",
  "playercash",
  "playerholding",
  "playerholdings",
  "playerid",
  "playerinventory",
  "playerorder",
  "playerorders",
  "playerpurchase",
  "playerpurchases",
  "playersession",
  "playersessionid",
  "playersessiontoken",
  "purchase",
  "purchases",
  "runnersecret",
  "sessionid",
  "sessiontoken",
  "sessiontokenhash",
  "stockorder",
  "stockorders",
  "stocktrade",
  "stocktrades",
  "trade",
  "trades",
]);

export function buildGamePublicRealtimeChannel(
  gameSessionId: string,
): GamePublicRealtimeChannel {
  return `game:${readNonEmptyText(gameSessionId)}:public`;
}

export function buildGamePublicRealtimeEnvelope<
  TEvent extends GamePublicRealtimePublisherEvent,
>(
  input: GamePublicRealtimeEnvelopeInput<TEvent>,
): GamePublicRealtimeEnvelope<TEvent> {
  return {
    gameSessionId: readNonEmptyText(input.gameSessionId),
    channel: buildGamePublicRealtimeChannel(input.gameSessionId),
    sequence: input.sequence ?? null,
    eventType: input.eventType,
    occurredAt: input.occurredAt,
    payload: input.payload,
  };
}

export function toGamePublicRealtimeBroadcastMessage<
  TEvent extends GamePublicRealtimePublisherEvent,
>(
  envelope: GamePublicRealtimeEnvelope<TEvent>,
): GamePublicRealtimeBroadcastMessage<TEvent> {
  return {
    channel: envelope.channel,
    event: envelope.eventType,
    payload: envelope,
  };
}

export function validateGamePublicRealtimeEnvelope(
  envelope: GamePublicRealtimeEnvelope,
): ValidationResult {
  const gameSessionId = normalizeText(envelope.gameSessionId);

  if (!gameSessionId) {
    return invalidEvent("gameSessionId is required.");
  }

  if (envelope.channel !== buildGamePublicRealtimeChannel(gameSessionId)) {
    return invalidEvent("Public realtime channel must match the game session.");
  }

  if (!GAME_PUBLIC_REALTIME_PUBLISHER_EVENTS.includes(envelope.eventType)) {
    return invalidEvent("Unsupported public realtime event type.");
  }

  if (
    envelope.sequence !== null &&
    (!Number.isInteger(envelope.sequence) || envelope.sequence < 0)
  ) {
    return invalidEvent("sequence must be a non-negative integer or null.");
  }

  if (!normalizeText(envelope.occurredAt)) {
    return invalidEvent("occurredAt is required.");
  }

  const privateFieldPath = findPrivatePublicChannelField(envelope.payload);

  if (privateFieldPath) {
    return invalidEvent(
      `Public realtime payload contains private field ${privateFieldPath}.`,
    );
  }

  return validatePayloadForEvent(envelope);
}

export class GamePublicRealtimePublisher {
  constructor(private readonly transport: GamePublicRealtimeTransport) {}

  async publish<TEvent extends GamePublicRealtimePublisherEvent>(
    envelope: GamePublicRealtimeEnvelope<TEvent>,
  ): Promise<GamePublicRealtimePublishResult<TEvent>> {
    const validation = validateGamePublicRealtimeEnvelope(envelope);

    if (!validation.ok) {
      return validation;
    }

    const message = toGamePublicRealtimeBroadcastMessage(envelope);

    try {
      const result = await this.transport.send(message);

      if (!result.ok) {
        return {
          ok: false,
          error: {
            code: "game_public_realtime_broadcast_failed",
            message: result.error.message,
            retryable: result.error.retryable,
          },
        };
      }

      return {
        ok: true,
        message,
      };
    } catch (_error) {
      return {
        ok: false,
        error: {
          code: "game_public_realtime_broadcast_failed",
          message: "Game public realtime event could not be published.",
          retryable: true,
        },
      };
    }
  }
}

function validatePayloadForEvent(
  envelope: GamePublicRealtimeEnvelope,
): ValidationResult {
  if (envelope.eventType === "stock_tick") {
    return validateStockTickPayload(envelope.payload);
  }

  if (envelope.eventType === "market_news_posted") {
    return validateMarketNewsPayload(envelope.payload);
  }

  if (envelope.eventType === "market_status_changed") {
    return validateMarketStatusPayload(envelope.payload);
  }

  return invalidEvent("Unsupported public realtime event type.");
}

function validateStockTickPayload(payload: unknown): ValidationResult {
  if (!isRecord(payload)) {
    return invalidEvent("stock_tick payload must be an object.");
  }

  if (!isNonNegativeInteger(payload.tick)) {
    return invalidEvent("stock_tick payload.tick must be a non-negative integer.");
  }

  if (!Array.isArray(payload.stocks)) {
    return invalidEvent("stock_tick payload.stocks must be an array.");
  }

  for (const stock of payload.stocks) {
    if (!isRecord(stock)) {
      return invalidEvent("stock_tick stocks must be objects.");
    }

    for (
      const fieldName of [
        "stockAssetId",
        "ticker",
        "companyName",
        "sector",
        "countryCode",
      ]
    ) {
      if (!normalizeText(stock[fieldName])) {
        return invalidEvent(`stock_tick stock.${fieldName} is required.`);
      }
    }

    for (
      const fieldName of [
        "currentPrice",
        "previousClose",
        "changePct",
        "volume",
      ]
    ) {
      if (!isFiniteNumber(stock[fieldName])) {
        return invalidEvent(`stock_tick stock.${fieldName} must be a number.`);
      }
    }
  }

  return { ok: true };
}

function validateMarketNewsPayload(payload: unknown): ValidationResult {
  if (!isRecord(payload) || !isRecord(payload.news)) {
    return invalidEvent("market_news_posted payload.news is required.");
  }

  const news = payload.news;

  for (
    const fieldName of [
      "id",
      "headline",
      "explanation",
      "category",
      "sentiment",
      "source",
      "scope",
      "createdAt",
    ]
  ) {
    if (!normalizeText(news[fieldName])) {
      return invalidEvent(`market_news_posted news.${fieldName} is required.`);
    }
  }

  if (news.targetKey !== null && news.targetKey !== undefined && !normalizeText(news.targetKey)) {
    return invalidEvent("market_news_posted news.targetKey must be text or null.");
  }

  if (!isNonNegativeInteger(news.createdTick)) {
    return invalidEvent("market_news_posted news.createdTick must be a non-negative integer.");
  }

  if (news.expiresTick !== null && news.expiresTick !== undefined) {
    if (!isNonNegativeInteger(news.expiresTick)) {
      return invalidEvent("market_news_posted news.expiresTick must be a non-negative integer or null.");
    }
  }

  return { ok: true };
}

function validateMarketStatusPayload(payload: unknown): ValidationResult {
  if (!isRecord(payload)) {
    return invalidEvent("market_status_changed payload must be an object.");
  }

  if (!normalizeText(payload.marketStatus)) {
    return invalidEvent("market_status_changed payload.marketStatus is required.");
  }

  if (payload.currentTick !== null && payload.currentTick !== undefined) {
    if (!isNonNegativeInteger(payload.currentTick)) {
      return invalidEvent("market_status_changed payload.currentTick must be a non-negative integer or null.");
    }
  }

  return { ok: true };
}

function findPrivatePublicChannelField(
  value: unknown,
  path = "payload",
): string | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const nestedPath = findPrivatePublicChannelField(value[index], `${path}[${index}]`);

      if (nestedPath) {
        return nestedPath;
      }
    }

    return null;
  }

  if (!isRecord(value)) {
    return null;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const keyPath = `${path}.${key}`;

    if (PRIVATE_PUBLIC_CHANNEL_FIELD_NAMES.has(normalizeFieldName(key))) {
      return keyPath;
    }

    const nestedPath = findPrivatePublicChannelField(nestedValue, keyPath);

    if (nestedPath) {
      return nestedPath;
    }
  }

  return null;
}

function invalidEvent(message: string): ValidationResult {
  return {
    ok: false,
    error: {
      code: "invalid_game_public_realtime_event",
      message,
      retryable: false,
    },
  };
}

function readNonEmptyText(value: string): string {
  const text = normalizeText(value);

  if (!text) {
    throw new Error("gameSessionId is required.");
  }

  return text;
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeFieldName(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

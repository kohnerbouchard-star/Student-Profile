export const STOCK_MARKET_NEWS_CATEGORIES = [
  "geopolitical",
  "war_conflict",
  "natural_disaster",
  "supply_chain",
  "resource_shock",
  "policy",
  "macro",
  "sector",
  "country",
  "company",
  "technology",
  "infrastructure",
  "energy",
  "agriculture",
  "finance",
] as const;

export const STOCK_MARKET_NEWS_SCOPES = [
  "global",
  "country",
  "sector",
  "ticker",
] as const;

export const STOCK_MARKET_NEWS_SENTIMENTS = [
  "positive",
  "negative",
  "neutral",
  "mixed",
] as const;

export const STOCK_MARKET_NEWS_IMPACT_STRENGTHS = [
  "low",
  "medium",
  "high",
] as const;

export const STOCK_MARKET_NEWS_SOURCES = [
  "runner",
  "staff",
  "admin",
  "system",
] as const;

export type StockMarketNewsCategory =
  typeof STOCK_MARKET_NEWS_CATEGORIES[number];

export type StockMarketNewsScope = typeof STOCK_MARKET_NEWS_SCOPES[number];

export type StockMarketNewsSentiment =
  typeof STOCK_MARKET_NEWS_SENTIMENTS[number];

export type StockMarketNewsImpactStrength =
  typeof STOCK_MARKET_NEWS_IMPACT_STRENGTHS[number];

export type StockMarketNewsSource = typeof STOCK_MARKET_NEWS_SOURCES[number];

export interface StockMarketNewsCreateRequestBody {
  readonly action?: string;
  readonly gameSessionId?: string;
  readonly headline?: string;
  readonly explanation?: string;
  readonly category?: string;
  readonly scope?: string;
  readonly targetKey?: string | null;
  readonly sentiment?: string;
  readonly impactStrength?: string;
  readonly durationTicks?: number;
  readonly source?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface StockMarketNewsCreateInput {
  readonly gameSessionId: string;
  readonly headline: string;
  readonly explanation: string;
  readonly category: StockMarketNewsCategory;
  readonly scope: StockMarketNewsScope;
  readonly targetKey: string | null;
  readonly sentiment: StockMarketNewsSentiment;
  readonly impactStrength: StockMarketNewsImpactStrength;
  readonly durationTicks: number;
  readonly source: StockMarketNewsSource;
  readonly metadata: Record<string, unknown>;
}

export interface StockMarketNewsInsertInput extends StockMarketNewsCreateInput {
  readonly shockId: string;
  readonly createdTick: number;
}

export interface StockMarketNewsInsertRow {
  readonly game_session_id: string;
  readonly shock_id: string;
  readonly category: StockMarketNewsCategory;
  readonly sentiment: StockMarketNewsSentiment;
  readonly source: StockMarketNewsSource;
  readonly visibility: "public";
  readonly scope: StockMarketNewsScope;
  readonly target_key: string | null;
  readonly headline: string;
  readonly explanation: string;
  readonly magnitude: number;
  readonly decay: number;
  readonly confidence: number;
  readonly volatility_impact: number;
  readonly volume_impact: number;
  readonly created_tick: number;
  readonly expires_tick: number;
  readonly is_active: true;
  readonly metadata: Record<string, unknown>;
}

export interface StockMarketNewsDto {
  readonly id: string;
  readonly shockId: string;
  readonly category: StockMarketNewsCategory | string;
  readonly sentiment: StockMarketNewsSentiment | string;
  readonly source: StockMarketNewsSource | string;
  readonly scope: StockMarketNewsScope | string;
  readonly targetKey: string | null;
  readonly headline: string;
  readonly explanation: string;
  readonly createdTick: number;
  readonly expiresTick: number | null;
  readonly createdAt: string;
}

export interface StockMarketNewsCreateResult {
  readonly news: StockMarketNewsDto;
}

export interface StockMarketNewsRepository {
  create(input: StockMarketNewsInsertInput): Promise<StockMarketNewsCreateResult>;
  readCurrentTick(gameSessionId: string): Promise<number>;
}

export type StockMarketNewsErrorCode =
  | "invalid_market_news_request"
  | "market_news_schema_not_applied"
  | "market_news_game_session_not_found"
  | "market_news_create_failed";

export class StockMarketNewsError extends Error {
  readonly code: StockMarketNewsErrorCode;
  readonly status: number;

  constructor(
    code: StockMarketNewsErrorCode,
    message: string,
    status = 400,
  ) {
    super(message);
    this.name = "StockMarketNewsError";
    this.code = code;
    this.status = status;
  }
}

export function parseStockMarketNewsCreateRequest(
  value: unknown,
): StockMarketNewsCreateInput {
  if (!isRecord(value)) {
    throw invalid("Request body must be a JSON object.");
  }

  const gameSessionId = readRequiredText(value.gameSessionId, "gameSessionId");
  const headline = readRequiredText(value.headline, "headline");
  const explanation = readRequiredText(value.explanation, "explanation");
  const category = readEnum(
    value.category,
    "category",
    STOCK_MARKET_NEWS_CATEGORIES,
  );
  const scope = readEnum(value.scope, "scope", STOCK_MARKET_NEWS_SCOPES);
  const sentiment = readEnum(
    value.sentiment,
    "sentiment",
    STOCK_MARKET_NEWS_SENTIMENTS,
  );
  const impactStrength = readEnum(
    value.impactStrength,
    "impactStrength",
    STOCK_MARKET_NEWS_IMPACT_STRENGTHS,
  );
  const source = readOptionalEnum(
    value.source,
    "source",
    STOCK_MARKET_NEWS_SOURCES,
    "runner",
  );
  const targetKey = readTargetKey(value.targetKey, scope);
  const durationTicks = readDurationTicks(value.durationTicks);
  const metadata = readMetadata(value.metadata);

  return {
    gameSessionId,
    headline,
    explanation,
    category,
    scope,
    targetKey,
    sentiment,
    impactStrength,
    durationTicks,
    source,
    metadata,
  };
}

export function buildStockMarketNewsInsertRow(
  input: StockMarketNewsInsertInput,
): StockMarketNewsInsertRow {
  const magnitude = readMagnitude(input.sentiment, input.impactStrength);
  const volatilityImpact = readVolatilityImpact(input.impactStrength);
  const volumeImpact = readVolumeImpact(input.impactStrength);

  return {
    game_session_id: input.gameSessionId,
    shock_id: input.shockId,
    category: input.category,
    sentiment: input.sentiment,
    source: input.source,
    visibility: "public",
    scope: input.scope,
    target_key: input.targetKey,
    headline: input.headline,
    explanation: input.explanation,
    magnitude,
    decay: readDecay(input.durationTicks),
    confidence: readConfidence(input.impactStrength),
    volatility_impact: volatilityImpact,
    volume_impact: volumeImpact,
    created_tick: input.createdTick,
    expires_tick: input.createdTick + input.durationTicks,
    is_active: true,
    metadata: input.metadata,
  };
}

function readMagnitude(
  sentiment: StockMarketNewsSentiment,
  impactStrength: StockMarketNewsImpactStrength,
): number {
  const absolute = impactStrength === "low"
    ? 0.0125
    : impactStrength === "medium"
    ? 0.0275
    : 0.05;

  if (sentiment === "positive") {
    return absolute;
  }

  if (sentiment === "negative") {
    return -absolute;
  }

  return 0;
}

function readVolatilityImpact(
  impactStrength: StockMarketNewsImpactStrength,
): number {
  return impactStrength === "low"
    ? 0.005
    : impactStrength === "medium"
    ? 0.0125
    : 0.025;
}

function readVolumeImpact(
  impactStrength: StockMarketNewsImpactStrength,
): number {
  return impactStrength === "low"
    ? 0.05
    : impactStrength === "medium"
    ? 0.12
    : 0.25;
}

function readConfidence(
  impactStrength: StockMarketNewsImpactStrength,
): number {
  return impactStrength === "low"
    ? 0.6
    : impactStrength === "medium"
    ? 0.75
    : 0.9;
}

function readDecay(durationTicks: number): number {
  if (durationTicks <= 3) {
    return 0.35;
  }

  if (durationTicks <= 6) {
    return 0.22;
  }

  return 0.14;
}

function readDurationTicks(value: unknown): number {
  if (value === undefined || value === null) {
    return 5;
  }

  if (!Number.isInteger(value) || typeof value !== "number") {
    throw invalid("durationTicks must be an integer.");
  }

  if (value < 1 || value > 12) {
    throw invalid("durationTicks must be between 1 and 12.");
  }

  return value;
}

function readTargetKey(value: unknown, scope: StockMarketNewsScope): string | null {
  const text = typeof value === "string" ? value.trim() : "";

  if (scope === "global") {
    if (text) {
      throw invalid("targetKey must be omitted for global news.");
    }

    return null;
  }

  if (!text) {
    throw invalid("targetKey is required for country, sector, and ticker news.");
  }

  return scope === "ticker" ? text.toUpperCase() : text;
}

function readMetadata(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null) {
    return {};
  }

  if (!isRecord(value) || Array.isArray(value)) {
    throw invalid("metadata must be a JSON object when provided.");
  }

  return value;
}

function readRequiredText(value: unknown, fieldName: string): string {
  const text = typeof value === "string" ? value.trim() : "";

  if (!text) {
    throw invalid(`${fieldName} is required.`);
  }

  return text;
}

function readEnum<T extends readonly string[]>(
  value: unknown,
  fieldName: string,
  allowed: T,
): T[number] {
  const text = typeof value === "string" ? value.trim() : "";

  if (!allowed.includes(text)) {
    throw invalid(`${fieldName} is invalid.`);
  }

  return text as T[number];
}

function readOptionalEnum<T extends readonly string[]>(
  value: unknown,
  fieldName: string,
  allowed: T,
  fallback: T[number],
): T[number] {
  if (value === undefined || value === null) {
    return fallback;
  }

  return readEnum(value, fieldName, allowed);
}

function invalid(message: string): StockMarketNewsError {
  return new StockMarketNewsError(
    "invalid_market_news_request",
    message,
    400,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

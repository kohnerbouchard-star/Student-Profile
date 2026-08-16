import { number } from "./common.ts";

interface MarketService {
  from(table: string): any;
  rpc(functionName: string, args?: unknown): PromiseLike<{ data: any; error: any }>;
}

export interface MarketAssetOperationResult {
  readonly handled: boolean;
  readonly status?: number;
  readonly body?: unknown;
}

const MARKET_ASSET_SELECT = [
  "id",
  "ticker",
  "company_name",
  "sector_key",
  "country_code",
  "description",
  "current_price",
  "previous_close",
  "open_price",
  "day_high",
  "day_low",
  "market_cap",
  "beta",
  "current_volatility",
  "fundamentals",
  "is_active",
  "created_at",
  "updated_at",
].join(",");
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function handleMarketAssetReadOperation(
  service: MarketService,
  input: {
    readonly request: Request;
    readonly gameId: string;
    readonly suffix: string;
  },
): Promise<MarketAssetOperationResult> {
  if (input.request.method !== "GET") return { handled: false };

  if (input.suffix === "/market/assets") {
    const result = await service.from("game_session_stock_assets")
      .select(MARKET_ASSET_SELECT)
      .eq("game_session_id", input.gameId)
      .eq("is_active", true)
      .order("ticker", { ascending: true });
    if (result.error) return failed();
    const assets = (result.data || []).map(toAssetDto);
    return {
      handled: true,
      status: 200,
      body: { data: { assets, marketplaceSecurities: assets } },
    };
  }

  const profileMatch = input.suffix.match(/^\/market\/assets\/([^/]+)\/profile$/u);
  if (profileMatch) {
    const assetId = safeAssetId(profileMatch[1]);
    if (!assetId) return invalid();
    const result = await readAsset(service, input.gameId, assetId, MARKET_ASSET_SELECT);
    if (result.error) return failed();
    if (!result.data) return notFound();
    const asset = toAssetDto(result.data);
    return {
      handled: true,
      status: 200,
      body: { data: { asset, profile: asset } },
    };
  }

  const chartMatch = input.suffix.match(/^\/market\/assets\/([^/]+)\/chart$/u);
  if (chartMatch) {
    const assetId = safeAssetId(chartMatch[1]);
    if (!assetId) return invalid();
    const result = await service.rpc("read_stock_market_history_v2", {
      p_game_session_id: input.gameId,
      p_stock_asset_id: assetId,
      p_ticker: null,
      p_limit: 500,
    });
    if (result.error) return failed();
    const candles = (result.data || []).map(toChartPoint)
      .sort((left: any, right: any) =>
        number(left.tickIndex) - number(right.tickIndex) ||
        Date.parse(left.timestamp || "") - Date.parse(right.timestamp || "")
      );
    return {
      handled: true,
      status: 200,
      body: { data: { candles, chart: candles } },
    };
  }

  const financialsMatch = input.suffix.match(/^\/market\/assets\/([^/]+)\/financials$/u);
  if (financialsMatch) {
    const assetId = safeAssetId(financialsMatch[1]);
    if (!assetId) return invalid();
    const result = await readAsset(service, input.gameId, assetId, "id,fundamentals");
    if (result.error) return failed();
    if (!result.data) return notFound();
    const fundamentals = record(result.data.fundamentals);
    return {
      handled: true,
      status: 200,
      body: {
        data: {
          assetId: result.data.id,
          financials: fundamentals,
          fundamentals,
        },
      },
    };
  }

  return { handled: false };
}

function readAsset(
  service: MarketService,
  gameId: string,
  assetId: string,
  columns: string,
): PromiseLike<{ data: any; error: any }> {
  return service.from("game_session_stock_assets")
    .select(columns)
    .eq("game_session_id", gameId)
    .eq("id", assetId)
    .maybeSingle();
}

function safeAssetId(raw: string): string {
  try {
    const value = decodeURIComponent(raw).trim().toLowerCase();
    return UUID_PATTERN.test(value) ? value : "";
  } catch {
    return "";
  }
}

function toAssetDto(row: any) {
  const currentPrice = number(row.current_price);
  const previousClose = number(row.previous_close, currentPrice);
  const change = currentPrice - previousClose;
  const fundamentals = record(row.fundamentals);
  return {
    id: row.id,
    assetId: row.id,
    symbol: row.ticker,
    ticker: row.ticker,
    name: row.company_name,
    companyName: row.company_name,
    type: "stock",
    assetType: "stock",
    sector: row.sector_key,
    countryCode: row.country_code,
    description: row.description,
    price: currentPrice,
    currentPrice,
    previousClose,
    open: number(row.open_price),
    high: number(row.day_high),
    low: number(row.day_low),
    change,
    changePct: previousClose ? (change / previousClose) * 100 : 0,
    marketCap: number(row.market_cap),
    beta: number(row.beta),
    volatility: number(row.current_volatility),
    chartHistory: [],
    financials: fundamentals,
    fundamentals,
    isActive: row.is_active === true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toChartPoint(row: any) {
  const close = number(row.close, number(row.price));
  const open = number(row.open, number(row.previous_price, close));
  return {
    tickIndex: number(row.tick_index),
    time: row.created_at,
    timestamp: row.created_at,
    close,
    open,
    high: number(row.high, Math.max(close, open)),
    low: number(row.low, Math.min(close, open)),
    volume: number(row.volume),
    changePct: number(row.change_pct),
    sourceKind: String(row.source_kind || "tick"),
    timeframe: String(row.timeframe || "tick"),
    firstTickIndex: number(row.first_tick_index, number(row.tick_index)),
    lastTickIndex: number(row.last_tick_index, number(row.tick_index)),
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function failed(): MarketAssetOperationResult {
  return {
    handled: true,
    status: 500,
    body: {
      code: "market_asset_read_failed",
      message: "Market assets could not be loaded.",
      retryable: true,
    },
  };
}
function invalid(): MarketAssetOperationResult {
  return {
    handled: true,
    status: 400,
    body: {
      code: "invalid_market_asset_id",
      message: "Market asset identifier is invalid.",
      retryable: false,
    },
  };
}
function notFound(): MarketAssetOperationResult {
  return {
    handled: true,
    status: 404,
    body: {
      code: "asset_not_found",
      message: "Market asset was not found.",
      retryable: false,
    },
  };
}

// Internal Dashboard projection only: consume authoritative scoped rows without I/O.
// Shared numeric helpers keep the repository's other projections on the same policy.
import type {
  PlayerGameDashboardCashBalanceDto,
  PlayerGameDashboardSnapshot,
} from "../contracts/playerGameDashboardContracts.ts";

// Reuse the owning read model's types rather than adding cross-domain imports.
type StockMarketBoardStockDto =
  PlayerGameDashboardSnapshot["public"]["market"]["stocks"][number];
type StockMarketPlayerHoldingDto =
  PlayerGameDashboardSnapshot["me"]["stocks"]["holdings"][number];
type StockMarketPlayerPortfolioSummaryDto =
  PlayerGameDashboardSnapshot["me"]["stocks"]["portfolio"];

export interface AccountBalanceRow {
  readonly player_id: string;
  readonly account_type: string;
  readonly balance: number | string;
  readonly currency_code: string;
}

export interface StockHoldingRow {
  readonly game_session_id: string;
  readonly listing_currency_code: string;
  readonly player_id: string;
  readonly stock_asset_id: string;
  readonly ticker: string;
  readonly quantity: number | string;
  readonly average_cost: number | string;
  readonly realized_pnl: number | string;
}

export function toCashDto(
  rows: readonly AccountBalanceRow[],
  preferredCurrencyCode: string | null,
): {
  readonly balances: readonly PlayerGameDashboardCashBalanceDto[];
  readonly primaryCurrencyCode: string | null;
  readonly totalBalance: number;
} {
  const balances = rows.map((row) => ({
    accountType: row.account_type,
    currencyCode: row.currency_code,
    balance: toNumber(row.balance),
  }));
  const primaryCurrencyCode = resolveValuationCurrency(
    balances.map((balance) => balance.currencyCode),
    preferredCurrencyCode,
  );

  return {
    balances,
    primaryCurrencyCode,
    totalBalance: primaryCurrencyCode
      ? round(sum(
        balances.filter((balance) =>
          normalizeCurrencyCode(balance.currencyCode) === primaryCurrencyCode
        ),
        (balance) => balance.balance,
      ))
      : 0,
  };
}

export function toHoldingDto(
  holding: StockHoldingRow,
  stock: StockMarketBoardStockDto | undefined,
): StockMarketPlayerHoldingDto {
  const quantity = toNumber(holding.quantity);
  const averageCost = toNumber(holding.average_cost);
  const currentPrice = stock?.currentPrice ?? 0;
  const marketValue = round(quantity * currentPrice);
  const costBasis = round(quantity * averageCost);
  const unrealizedPnl = round(marketValue - costBasis);

  return {
    stockAssetId: holding.stock_asset_id,
    ticker: stock?.ticker ?? holding.ticker,
    companyName: stock?.companyName ?? holding.ticker,
    sector: stock?.sector ?? "",
    countryCode: stock?.countryCode ?? "",
    currencyCode: holding.listing_currency_code,
    quantity,
    averageCost,
    currentPrice,
    marketValue,
    costBasis,
    unrealizedPnl,
    unrealizedPnlPct: costBasis > 0
      ? round((unrealizedPnl / costBasis) * 100)
      : 0,
    realizedPnl: toNumber(holding.realized_pnl),
  };
}

export function summarizePortfolio(
  cash: ReturnType<typeof toCashDto>,
  holdings: readonly StockMarketPlayerHoldingDto[],
): StockMarketPlayerPortfolioSummaryDto {
  const currencyCode = cash.primaryCurrencyCode ?? "UNKNOWN";
  const byCurrency = [
    ...new Set(holdings.map((h) => h.currencyCode ?? "UNKNOWN")),
  ].sort().map((code) => {
    const rows = holdings.filter((h) => (h.currencyCode ?? "UNKNOWN") === code);
    return {
      currencyCode: code,
      marketValue: round(sum(rows, (h) => h.marketValue)),
      costBasis: round(sum(rows, (h) => h.costBasis)),
      unrealizedPnl: round(sum(rows, (h) => h.unrealizedPnl)),
      realizedPnl: round(sum(rows, (h) => h.realizedPnl)),
    };
  });
  const value = byCurrency.find((v) => v.currencyCode === currencyCode);
  const holdingsMarketValue = value?.marketValue ?? 0;
  return {
    currencyCode,
    byCurrency,
    valuationStatus: byCurrency.some((v) => v.currencyCode !== currencyCode)
      ? "partial_unconverted"
      : "complete",
    cashBalance: cash.totalBalance,
    holdingsMarketValue,
    totalEquity: round(cash.totalBalance + holdingsMarketValue),
    totalCostBasis: value?.costBasis ?? 0,
    unrealizedPnl: value?.unrealizedPnl ?? 0,
    realizedPnl: value?.realizedPnl ?? 0,
    positionsCount: holdings.filter((holding) => holding.quantity > 0).length,
  };
}

export function balanceTotalForCurrency(
  balances: readonly AccountBalanceRow[],
  preferredCurrencyCode: string | null,
): number {
  const valuationCurrencyCode = resolveValuationCurrency(
    balances.map((balance) => balance.currency_code),
    preferredCurrencyCode,
  );
  if (!valuationCurrencyCode) return 0;

  return round(sum(
    balances.filter((balance) =>
      normalizeCurrencyCode(balance.currency_code) === valuationCurrencyCode
    ),
    (balance) => toNumber(balance.balance),
  ));
}

function resolveValuationCurrency(
  currencyCodes: readonly string[],
  preferredCurrencyCode: string | null,
): string | null {
  const preferred = normalizeCurrencyCode(preferredCurrencyCode);
  if (preferred) return preferred;

  const available = unique(
    currencyCodes
      .map((currencyCode) => normalizeCurrencyCode(currencyCode))
      .filter((currencyCode): currencyCode is string => Boolean(currencyCode)),
  );
  return available.length === 1 ? available[0] : null;
}

export function normalizeCurrencyCode(
  value: string | null | undefined,
): string | null {
  const normalized = value?.trim().toUpperCase();
  return normalized && /^[A-Z0-9]{3,16}$/.test(normalized) ? normalized : null;
}

export function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value) => value))];
}

export function sum<T>(
  values: readonly T[],
  select: (value: T) => number,
): number {
  return values.reduce((total, value) => total + select(value), 0);
}

export function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

export function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

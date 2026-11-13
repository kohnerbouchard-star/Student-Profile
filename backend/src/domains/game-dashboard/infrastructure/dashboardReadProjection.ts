// Pure Dashboard row interpretation; persistence and read ordering stay in the repository.
import {
  type AccountBalanceRow,
  balanceTotalForCurrency,
  normalizeCurrencyCode,
  round,
  type StockHoldingRow,
  sum,
  toNumber,
} from "./dashboardFinancialProjection.ts";
import type {
  CountryInfo,
  InventoryHoldingRow,
  PlayerRow,
  StockMarketEventRow,
  StockOrderRow,
  StockTradeRow,
  StorePurchaseRow,
} from "./dashboardReadRows.ts";
import type {
  PlayerGameDashboardInventoryItemDto,
  PlayerGameDashboardLeaderboardEntryDto,
  PlayerGameDashboardMarketNewsDto,
  PlayerGameDashboardPublicPlayerDto,
  PlayerGameDashboardPublicStoreListingDto,
  PlayerGameDashboardSnapshot,
} from "../contracts/playerGameDashboardContracts.ts";
import type {
  StockMarketBoardStockDto,
  StockMarketPlayerOrderDto,
  StockMarketPlayerOrderStatus,
  StockMarketPlayerTradeDto,
} from "../../stocks/index.ts";
// Use the existing snapshot contract for DTO shapes; do not add foreign imports.
type StoreItemDto =
  PlayerGameDashboardSnapshot["me"]["store"]["listings"][number];
type StorePurchaseHistoryItemDto =
  PlayerGameDashboardSnapshot["me"]["store"]["recentPurchases"][number];

export function toOrderDto(row: StockOrderRow): StockMarketPlayerOrderDto {
  return {
    orderId: row.id,
    stockAssetId: row.stock_asset_id,
    ticker: row.ticker,
    side: normalizeSide(row.side),
    quantity: toNumber(row.quantity),
    executionPrice: toNumber(row.execution_price),
    grossValue: toNumber(row.gross_value),
    status: normalizeOrderStatus(row.status),
    rejectionReason: row.rejection_reason ?? null,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
  };
}

export function toTradeDto(row: StockTradeRow): StockMarketPlayerTradeDto {
  return {
    tradeId: row.id,
    orderId: row.order_id,
    stockAssetId: row.stock_asset_id,
    ticker: row.ticker,
    side: normalizeSide(row.side),
    quantity: toNumber(row.quantity),
    executionPrice: toNumber(row.execution_price),
    grossValue: toNumber(row.gross_value),
    createdAt: row.created_at,
  };
}

export function toInventoryDto(
  row: InventoryHoldingRow,
  storeItemById: ReadonlyMap<string, StoreItemDto>,
): PlayerGameDashboardInventoryItemDto {
  const item = storeItemById.get(row.store_item_id);

  return {
    inventoryId: row.id,
    itemId: row.store_item_id,
    itemName: item?.name ?? "Unknown item",
    quantityOwned: Math.trunc(toNumber(row.quantity_owned)),
    quantityReserved: Math.trunc(toNumber(row.quantity_reserved)),
    updatedAt: row.updated_at,
  };
}

export function toPurchaseHistoryDto(
  row: StorePurchaseRow,
  storeItemById: ReadonlyMap<string, StoreItemDto>,
): StorePurchaseHistoryItemDto {
  const item = storeItemById.get(row.store_item_id);

  return {
    purchaseId: row.id,
    itemId: row.store_item_id,
    itemName: item?.name ?? "Unknown item",
    quantity: Math.trunc(toNumber(row.quantity)),
    finalTotalPrice: toNumber(row.final_total_price),
    currencyCode: row.currency_code,
    status: row.status,
    createdAt: row.created_at,
  };
}

export function toPublicStoreListingDto(
  item: StoreItemDto,
): PlayerGameDashboardPublicStoreListingDto {
  return {
    itemId: item.id,
    itemKey: item.itemKey,
    name: item.name,
    description: item.description,
    category: item.category,
    stockQuantity: item.stockQuantity,
    status: item.status,
    visibility: item.visibility,
    sortOrder: item.sortOrder,
    updatedAt: item.updatedAt,
  };
}

export function toMarketNewsDto(
  row: StockMarketEventRow,
): PlayerGameDashboardMarketNewsDto {
  return {
    id: row.id,
    shockId: row.shock_id,
    category: row.category ?? "sector",
    sentiment: row.sentiment ?? "neutral",
    source: row.source ?? "runner",
    scope: row.scope,
    targetKey: row.target_key ?? null,
    headline: row.headline,
    explanation: row.explanation,
    createdTick: Math.trunc(toNumber(row.created_tick)),
    expiresTick: row.expires_tick === null || row.expires_tick === undefined
      ? null
      : Math.trunc(toNumber(row.expires_tick)),
    createdAt: row.created_at,
  };
}

export function toPublicPlayerDto(
  player: PlayerRow,
  country: CountryInfo | undefined,
): PlayerGameDashboardPublicPlayerDto {
  return {
    playerId: player.id,
    displayName: player.display_name,
    rosterLabel: player.roster_label ?? null,
    countryCode: country?.countryCode ?? null,
  };
}

export function toLeaderboard(
  players: readonly PlayerRow[],
  countryByPlayerId: ReadonlyMap<string, CountryInfo>,
  financialBalances: readonly AccountBalanceRow[],
  holdings: readonly StockHoldingRow[],
  stockByAssetId: ReadonlyMap<string, StockMarketBoardStockDto>,
): readonly PlayerGameDashboardLeaderboardEntryDto[] {
  const financialByPlayerId = groupBy(
    financialBalances,
    (balance) => balance.player_id,
  );
  const holdingsByPlayerId = groupBy(holdings, (holding) => holding.player_id);
  const entries = players.map((player) => {
    const valuationCurrencyCode = normalizeCurrencyCode(
      countryByPlayerId.get(player.id)?.currencyCode,
    );
    const financialTotal = balanceTotalForCurrency(
      financialByPlayerId.get(player.id) ?? [],
      valuationCurrencyCode,
    );
    const holdingsMarketValue = sum(
      (holdingsByPlayerId.get(player.id) ?? []).filter((h) =>
        h.listing_currency_code === valuationCurrencyCode
      ),
      (holding) => {
        const stock = stockByAssetId.get(holding.stock_asset_id);
        return toNumber(holding.quantity) * (stock?.currentPrice ?? 0);
      },
    );

    return {
      ...toPublicPlayerDto(player, countryByPlayerId.get(player.id)),
      rank: 0,
      netWorth: round(financialTotal + holdingsMarketValue),
      valuationCurrencyCode,
      rankScope: "currency" as const,
    };
  }).sort((left, right) =>
    (left.valuationCurrencyCode ?? "~").localeCompare(
      right.valuationCurrencyCode ?? "~",
    ) ||
    right.netWorth - left.netWorth ||
    left.displayName.localeCompare(right.displayName) ||
    left.playerId.localeCompare(right.playerId)
  );

  const rankByCurrency = new Map<string, number>();
  return entries.map((entry) => {
    const scopeKey = entry.valuationCurrencyCode ?? "unvalued";
    const rank = (rankByCurrency.get(scopeKey) ?? 0) + 1;
    rankByCurrency.set(scopeKey, rank);
    return { ...entry, rank };
  });
}

function normalizeSide(value: string): "buy" | "sell" {
  return value === "sell" ? "sell" : "buy";
}

function normalizeOrderStatus(value: string): StockMarketPlayerOrderStatus {
  return value === "rejected" ? "rejected" : "filled";
}

function groupBy<T>(
  values: readonly T[],
  keyForValue: (value: T) => string,
): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  for (const value of values) {
    const key = keyForValue(value);
    const group = groups.get(key) ?? [];
    group.push(value);
    groups.set(key, group);
  }

  return groups;
}

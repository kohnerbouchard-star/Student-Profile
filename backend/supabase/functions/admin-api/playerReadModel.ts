import { number, object, text, todayIsoDate } from "./common.ts";
import {
  type DbService,
  type DbRow,
  pushByKey,
  newestByKey,
  presenceForSession,
} from "./playerReadSupport.ts";


export async function loadPlayers(
  service: DbService,
  gameId: string,
  now = new Date(),
): Promise<any[]> {
  const [
    playersResult,
    balancesResult,
    assignmentsResult,
    countriesResult,
    sessionsResult,
    holdingsResult,
    assetsResult,
    inventoryResult,
    storeItemsResult,
  ] = await Promise.all([
    service.from("players")
      .select("id,display_name,roster_label,status,created_at,updated_at")
      .eq("game_session_id", gameId)
      .order("created_at", { ascending: true }),
    service.from("account_balances")
      .select("player_id,account_type,balance,currency_code,updated_at")
      .eq("game_session_id", gameId),
    service.from("player_country_assignments")
      .select("player_id,country_profile_id,status,assigned_at")
      .eq("game_session_id", gameId)
      .eq("status", "active"),
    service.from("country_profiles")
      .select("id,country_code,country_name,currency_code,status"),
    service.from("player_sessions")
      .select("id,player_id,status,created_at,updated_at,expires_at,revoked_at")
      .eq("game_session_id", gameId)
      .order("updated_at", { ascending: false }),
    service.from("stock_holdings")
      .select("player_id,stock_asset_id,ticker,quantity,reserved_quantity,average_cost,realized_pnl,updated_at")
      .eq("game_session_id", gameId),
    service.from("game_session_stock_assets")
      .select("id,ticker,company_name,current_price,is_active,updated_at")
      .eq("game_session_id", gameId),
    service.from("inventory_holdings")
      .select("player_id,store_item_id,quantity_owned,quantity_reserved,updated_at")
      .eq("game_session_id", gameId),
    service.from("store_items")
      .select("id,name,price,currency_code,status,visibility,updated_at")
      .eq("game_session_id", gameId),
  ]);

  const error = playersResult.error || balancesResult.error ||
    assignmentsResult.error || countriesResult.error || sessionsResult.error ||
    holdingsResult.error || assetsResult.error || inventoryResult.error ||
    storeItemsResult.error;
  if (error) throw error;

  const players: DbRow[] = playersResult.data || [];
  const balancesRows: DbRow[] = balancesResult.data || [];
  const assignments: DbRow[] = assignmentsResult.data || [];
  const countriesRows: DbRow[] = countriesResult.data || [];
  const sessions: DbRow[] = sessionsResult.data || [];
  const holdings: DbRow[] = holdingsResult.data || [];
  const assetsRows: DbRow[] = assetsResult.data || [];
  const inventoryRows: DbRow[] = inventoryResult.data || [];
  const storeItemsRows: DbRow[] = storeItemsResult.data || [];

  const balancesByPlayer = new Map<string, DbRow[]>();
  for (const row of balancesRows) pushByKey(balancesByPlayer, row.player_id, row);

  const holdingsByPlayer = new Map<string, DbRow[]>();
  for (const row of holdings) pushByKey(holdingsByPlayer, row.player_id, row);

  const inventoryByPlayer = new Map<string, DbRow[]>();
  for (const row of inventoryRows) pushByKey(inventoryByPlayer, row.player_id, row);

  const countries = new Map<string, DbRow>(
    countriesRows.map((row) => [String(row.id), row]),
  );
  const assignmentByPlayer = new Map<string, DbRow>(
    assignments.map((row) => [String(row.player_id), row]),
  );
  const latestSessionByPlayer = newestByKey(
    sessions,
    "player_id",
    "updated_at",
  );
  const assetsById = new Map<string, DbRow>(
    assetsRows.map((row) => [String(row.id), row]),
  );
  const storeItemsById = new Map<string, DbRow>(
    storeItemsRows.map((row) => [String(row.id), row]),
  );
  const nowMs = now.getTime();

  return players.map((player) => {
    const playerId = String(player.id);
    const rawBalances = balancesByPlayer.get(playerId) || [];
    const balances = rawBalances.map((entry) => ({
      accountType: entry.account_type,
      balance: number(entry.balance),
      currencyCode: entry.currency_code,
      updatedAt: entry.updated_at,
    }));
    const cashBalance = rawBalances
      .filter((entry) => String(entry.account_type).toLowerCase() === "checking")
      .reduce((sum, entry) => sum + number(entry.balance), 0);
    const savingsBalance = rawBalances
      .filter((entry) => String(entry.account_type).toLowerCase() === "savings")
      .reduce((sum, entry) => sum + number(entry.balance), 0);

    const stockPositions = (holdingsByPlayer.get(playerId) || []).map(
      (holding) => {
        const asset = assetsById.get(String(holding.stock_asset_id));
        const quantity = number(holding.quantity);
        const currentPrice = number(asset?.current_price);
        return {
          stockAssetId: holding.stock_asset_id,
          ticker: holding.ticker || asset?.ticker || "",
          companyName: asset?.company_name || holding.ticker || "Unknown asset",
          quantity,
          reservedQuantity: number(holding.reserved_quantity),
          averageCost: number(holding.average_cost),
          currentPrice,
          marketValue: quantity * currentPrice,
          realizedPnl: number(holding.realized_pnl),
          updatedAt: holding.updated_at,
        };
      },
    );
    const stockMarketValue = stockPositions.reduce(
      (sum, position) => sum + position.marketValue,
      0,
    );

    const inventoryPositions = (inventoryByPlayer.get(playerId) || []).map(
      (holding) => {
        const item = storeItemsById.get(String(holding.store_item_id));
        const quantityOwned = number(holding.quantity_owned);
        const quantityReserved = number(holding.quantity_reserved);
        const availableQuantity = Math.max(0, quantityOwned - quantityReserved);
        const unitValue = number(item?.price);
        return {
          storeItemId: holding.store_item_id,
          itemName: item?.name || "Unknown item",
          quantityOwned,
          quantityReserved,
          availableQuantity,
          unitValue,
          marketValue: availableQuantity * unitValue,
          updatedAt: holding.updated_at,
        };
      },
    );
    const inventoryMarketValue = inventoryPositions.reduce(
      (sum, position) => sum + position.marketValue,
      0,
    );
    const depositBalance = cashBalance + savingsBalance;
    const netWorth = depositBalance + stockMarketValue + inventoryMarketValue;

    const assignment = assignmentByPlayer.get(playerId);
    const country = assignment
      ? countries.get(String(assignment.country_profile_id))
      : null;
    const presence = presenceForSession(
      latestSessionByPlayer.get(playerId),
      nowMs,
    );

    return {
      id: player.id,
      playerId: player.id,
      name: player.display_name,
      displayName: player.display_name,
      rosterLabel: player.roster_label,
      status: player.status,
      ...presence,
      balances,
      balance: cashBalance,
      cashBalance,
      stockMarketValue,
      inventoryMarketValue,
      netWorth,
      netWorthBreakdown: {
        cash: depositBalance,
        stocks: stockMarketValue,
        inventory: inventoryMarketValue,
      },
      stockPositions,
      inventoryPositions,
      overallScore: null,
      overallScoreStatus: "not_configured",
      scoreFormulaVersion: null,
      currencyCode: balances.find((entry) =>
        String(entry.accountType).toLowerCase() === "checking"
      )?.currencyCode || country?.currency_code || "ECO",
      countryCode: country?.country_code || "",
      countryName: country?.country_name || "Unassigned",
      location: country?.country_name || "Unassigned",
      createdAt: player.created_at,
      updatedAt: player.updated_at,
    };
  });
}

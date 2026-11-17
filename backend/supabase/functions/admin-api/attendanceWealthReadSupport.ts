import { number, text, todayIsoDate } from "./common.ts";


export function validIsoDate(value: unknown, fallback: string): string {
  const normalized = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return fallback;
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== normalized
    ? fallback
    : normalized;
}


export function periodRange(url: URL): { startDate: string; endDate: string } {
  const today = todayIsoDate();
  const selected = validIsoDate(url.searchParams.get("date"), today);
  const period = text(url.searchParams.get("period"), "day").toLowerCase();
  let startDate = validIsoDate(
    url.searchParams.get("startDate") || url.searchParams.get("from"),
    selected,
  );
  let endDate = validIsoDate(
    url.searchParams.get("endDate") || url.searchParams.get("to"),
    selected,
  );
  if (
    !url.searchParams.get("startDate") && !url.searchParams.get("from") &&
    !url.searchParams.get("endDate") && !url.searchParams.get("to")
  ) {
    const start = new Date(`${selected}T00:00:00.000Z`);
    if (period === "week") {
      const day = start.getUTCDay();
      start.setUTCDate(start.getUTCDate() - ((day + 6) % 7));
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 6);
      startDate = start.toISOString().slice(0, 10);
      endDate = end.toISOString().slice(0, 10);
    } else if (period === "month") {
      start.setUTCDate(1);
      const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
      startDate = start.toISOString().slice(0, 10);
      endDate = end.toISOString().slice(0, 10);
    }
  }
  if (startDate > endDate) [startDate, endDate] = [endDate, startDate];
  return { startDate, endDate };
}


export async function attendanceRewards(
  service: any,
  gameId: string,
  attendanceIds: string[],
): Promise<Map<string, any>> {
  const map = new Map<string, any>();
  if (!attendanceIds.length) return map;
  const result = await service
    .from("ledger_entries")
    .select("id,player_id,amount,currency_code,source_id,source_action,created_at")
    .eq("game_session_id", gameId)
    .eq("source_domain", "attendance")
    .in("source_id", attendanceIds)
    .order("created_at", { ascending: true });
  if (result.error) throw result.error;
  for (const row of result.data || []) {
    const key = String(row.source_id || "");
    const code = currencyCode(row.currency_code);
    if (!key || !code) continue;
    const current = map.get(key) || {
      amountsByCurrency: {},
      entries: [],
    };
    current.amountsByCurrency[code] = number(
      current.amountsByCurrency[code],
    ) + number(row.amount);
    current.entries.push(row);
    map.set(key, current);
  }
  return map;
}


export function currencyCode(value: unknown): string {
  const normalized = text(value).toUpperCase();
  return /^[A-Z0-9]{3,16}$/.test(normalized) ? normalized : "";
}


export function attendanceRewardSummary(reward: any): Record<string, any> {
  const source = reward?.amountsByCurrency &&
      typeof reward.amountsByCurrency === "object" &&
      !Array.isArray(reward.amountsByCurrency)
    ? reward.amountsByCurrency
    : {};
  const amountsByCurrency = Object.fromEntries(
    Object.entries(source)
      .map(([code, amount]) => [currencyCode(code), number(amount)] as const)
      .filter(([code]) => Boolean(code)),
  );
  const currencies = Object.keys(amountsByCurrency).sort();
  const singleCurrency = currencies.length === 1 ? currencies[0] : null;
  const singleAmount = singleCurrency
    ? number(amountsByCurrency[singleCurrency])
    : null;
  return {
    rewardAmount: singleAmount,
    rewardCurrencyCode: singleCurrency,
    rewardAmountsByCurrency: amountsByCurrency,
    rewardValuationStatus: currencies.length === 0
      ? "none"
      : currencies.length === 1
      ? "single_currency"
      : "multi_currency_unconverted",
    rewardBreakdown: currencies
      .map((code) => `${code} ${number(amountsByCurrency[code]).toFixed(2)}`)
      .join("; "),
    rewardEntries: reward?.entries || [],
  };
}


export function resolveValuationCurrency(
  player: any,
  authoritativeCountryCurrency: string,
): string {
  if (authoritativeCountryCurrency) return authoritativeCountryCurrency;
  const currencies = [...new Set(
    (Array.isArray(player?.balances) ? player.balances : [])
      .filter((entry: any) =>
        ["checking", "savings"].includes(text(entry?.accountType).toLowerCase())
      )
      .map((entry: any) => currencyCode(entry?.currencyCode))
      .filter(Boolean),
  )];
  return currencies.length === 1 ? String(currencies[0] || "") : "";
}


export function balanceTotal(
  player: any,
  accountType: string,
  valuationCurrencyCode: string,
): number {
  if (!valuationCurrencyCode) return 0;
  return (Array.isArray(player?.balances) ? player.balances : [])
    .filter((entry: any) =>
      text(entry?.accountType).toLowerCase() === accountType &&
      currencyCode(entry?.currencyCode) === valuationCurrencyCode
    )
    .reduce((sum: number, entry: any) => sum + number(entry?.balance), 0);
}


export function currencyScopedPlayerWealth(
  player: any,
  authoritativeCountryCurrency: string,
  storeCurrencyById: ReadonlyMap<string, string>,
): any {
  const valuationCurrencyCode = resolveValuationCurrency(
    player,
    authoritativeCountryCurrency,
  );
  const checkingBalance = balanceTotal(
    player,
    "checking",
    valuationCurrencyCode,
  );
  const savingsBalance = balanceTotal(
    player,
    "savings",
    valuationCurrencyCode,
  );
  const inventoryPositions = Array.isArray(player?.inventoryPositions)
    ? player.inventoryPositions
    : [];
  let inventoryMarketValue = 0;
  let excludedInventoryMarketValue = 0;
  for (const position of inventoryPositions) {
    const positionValue = number(position?.marketValue);
    const itemCurrencyCode = storeCurrencyById.get(String(position?.storeItemId || "")) || "";
    if (
      valuationCurrencyCode &&
      itemCurrencyCode === valuationCurrencyCode
    ) {
      inventoryMarketValue += positionValue;
    } else if (positionValue !== 0) {
      excludedInventoryMarketValue += positionValue;
    }
  }
  const rawStockMarketValue = number(player?.stockMarketValue);
  const stockMarketValue = valuationCurrencyCode === "ECO"
    ? rawStockMarketValue
    : 0;
  const excludedStockMarketValue = stockMarketValue === rawStockMarketValue
    ? 0
    : rawStockMarketValue;
  const depositBalance = checkingBalance + savingsBalance;
  const netWorth = depositBalance + stockMarketValue + inventoryMarketValue;

  return {
    ...player,
    balance: checkingBalance,
    cashBalance: checkingBalance,
    checkingBalance,
    savingsBalance,
    currencyCode: valuationCurrencyCode || null,
    stockMarketValue,
    inventoryMarketValue,
    netWorth,
    netWorthBreakdown: {
      cash: depositBalance,
      stocks: stockMarketValue,
      inventory: inventoryMarketValue,
    },
    netWorthValuation: {
      currencyCode: valuationCurrencyCode || null,
      status:
        valuationCurrencyCode &&
          excludedInventoryMarketValue === 0 &&
          excludedStockMarketValue === 0
          ? "complete"
          : "partial_unconverted",
      excludedInventoryMarketValue,
      excludedStockMarketValue,
    },
  };
}

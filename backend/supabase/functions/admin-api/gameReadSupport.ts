import {
  corsHeaders,
  gameDto,
  json,
  number,
} from "./common.ts";


export function csvResponse(
  request: Request,
  csv: string,
  filename: string,
): Response {
  return new Response(csv, {
    status: 200,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}


export async function readPlayerAdminSettings(
  service: any,
  gameId: string,
  playerId: string,
): Promise<any> {
  const result = await service.from("player_admin_settings").select("*")
    .eq("game_session_id", gameId).eq("player_id", playerId).maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}


export async function readPlayerFlags(
  service: any,
  gameId: string,
  playerId: string,
): Promise<any[]> {
  const result = await service.from("player_admin_flags").select("*")
    .eq("game_session_id", gameId).eq("player_id", playerId)
    .order("created_at", { ascending: false });
  if (result.error) throw result.error;
  return result.data || [];
}


export function leaderboardCurrencyCode(player: any): string | null {
  const value = String(
    player?.netWorthValuation?.currencyCode || player?.currencyCode || "",
  ).trim().toUpperCase();
  return /^[A-Z0-9]{3,16}$/.test(value) ? value : null;
}


export function currencyScopedLeaderboard(players: any[]): any[] {
  const entries = players.map((player) => ({
    ...player,
    valuationCurrencyCode: leaderboardCurrencyCode(player),
    rankScope: "currency",
    leaderboardBasis: "net_worth",
  })).sort((left, right) => {
    const currencyOrder = (left.valuationCurrencyCode || "~").localeCompare(
      right.valuationCurrencyCode || "~",
    );
    if (currencyOrder !== 0) return currencyOrder;
    const wealthOrder = number(right.netWorth) - number(left.netWorth);
    if (wealthOrder !== 0) return wealthOrder;
    const nameOrder = String(left.displayName || left.name || "").localeCompare(
      String(right.displayName || right.name || ""),
    );
    if (nameOrder !== 0) return nameOrder;
    return String(left.id || left.playerId || "").localeCompare(
      String(right.id || right.playerId || ""),
    );
  });

  const rankByCurrency = new Map<string, number>();
  return entries.map((entry) => {
    const scopeKey = entry.valuationCurrencyCode || "unvalued";
    const rank = (rankByCurrency.get(scopeKey) || 0) + 1;
    rankByCurrency.set(scopeKey, rank);
    return { ...entry, rank };
  });
}

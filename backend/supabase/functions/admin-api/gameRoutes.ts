import {
  corsHeaders,
  gameDto,
  json,
  number,
} from "./common.ts";
import {
  loadContracts,
  loadMarket,
  loadSettings,
  loadStore,
} from "./readModels.ts";
import {
  attendanceRowsToCsv,
  loadAttendanceEnhanced,
  loadAttendanceHistoryEnhanced,
  loadPlayersEnhanced,
} from "./readExtensions.ts";
import { loadLogsPage, logsToCsv, updateAuditLogFlag } from "./logs.ts";
import {
  loadContractRewardAudit,
  loadContractSubmissions,
  loadMarketChart,
  loadRelatedAuditRecord,
} from "./routeData.ts";
import {
  handleAttendancePlayerOperation,
  loadPlayerHistoryAudit,
} from "./attendancePlayerOperations.ts";
import { handleGameJoinCodeReadOperation } from "./gameJoinCodeOperations.ts";
import { handleContractProgressReadOperation } from "./contractProgressReadOperation.ts";
import type { AdminRequestApplicationContext } from "./adminRequestApplicationContext.ts";
import { createSupabaseGameSettingsReadRepository } from "../../../src/domains/game-sessions/infrastructure/supabaseGameSettingsReadRepository.ts";
import {
  currencyScopedLeaderboard,
  readPlayerAdminSettings,
  readPlayerFlags,
  csvResponse,
} from "./gameReadSupport.ts";


export interface AdminDashboardReadDependencies {
  readonly loadPlayers?: typeof loadPlayersEnhanced;
  readonly loadAttendance?: typeof loadAttendanceEnhanced;
  readonly loadContracts?: typeof loadContracts;
}

export async function handleGameRead(
  request: Request,
  context: any,
  url: URL,
  game: any,
  gameId: string,
  suffix: string,
  applicationContext: AdminRequestApplicationContext,
  dashboardDependencies: AdminDashboardReadDependencies = {},
): Promise<Response | null> {
  if (request.method !== "GET") return null;

  if (suffix === "" || suffix === "/") {
    return json(request, 200, { data: { game: gameDto(game) } });
  }

  if (suffix === "/join-code/reset") {
    const operation = await handleGameJoinCodeReadOperation(
      context.service,
      {
        applicationContext,
        gameSession: {
          id: game.id,
          name: game.name,
          status: game.status,
        },
      },
    );
    return json(request, operation.status, operation.body);
  }

  if (suffix === "/dashboard") {
    const loadDashboardPlayers = dashboardDependencies.loadPlayers ??
      loadPlayersEnhanced;
    const loadDashboardAttendance = dashboardDependencies.loadAttendance ??
      loadAttendanceEnhanced;
    const loadDashboardContracts = dashboardDependencies.loadContracts ??
      loadContracts;
    const players = await loadDashboardPlayers(context.service, gameId);
    const [attendance, contracts] = await Promise.all([
      loadDashboardAttendance(context.service, gameId, players),
      loadDashboardContracts(context.service, gameId),
    ]);
    const leaderboard = currencyScopedLeaderboard(players);
    return json(request, 200, {
      data: {
        game: gameDto(game),
        leaderboard,
        leaderboardBasis: "net_worth",
        leaderboardRankScope: "currency",
        leaderboardComparison: "same_currency_only",
        overallScoreStatus: "not_configured",
        contracts: contracts.filter((item: any) =>
          ["active", "scheduled", "draft"].includes(item.status)
        ),
        notifications: [],
        notificationCount: 0,
        ...attendance,
      },
    });
  }

  if (suffix === "/players") {
    const players = await loadPlayersEnhanced(context.service, gameId);
    return json(request, 200, {
      data: { players, roster: players, totalPlayers: players.length },
    });
  }

  const playerMatch = suffix.match(/^\/players\/([^/]+)$/);
  if (playerMatch) {
    const playerId = decodeURIComponent(playerMatch[1]);
    const players = await loadPlayersEnhanced(context.service, gameId);
    const player = players.find((item) => String(item.id) === playerId);
    return player
      ? json(request, 200, { data: { player } })
      : json(request, 404, {
        code: "player_not_found",
        message: "Player was not found for this game.",
      });
  }

  const playerHistoryMatch = suffix.match(
    /^\/players\/([^/]+)\/history-audit$/,
  );
  if (playerHistoryMatch) {
    const playerId = decodeURIComponent(playerHistoryMatch[1]);
    const history = await loadPlayerHistoryAudit(
      context.service,
      gameId,
      playerId,
    );
    return history
      ? json(request, 200, { data: history })
      : json(request, 404, {
        code: "player_not_found",
        message: "Player was not found for this game.",
      });
  }

  const playerSettingsMatch = suffix.match(/^\/players\/([^/]+)\/settings$/);
  if (playerSettingsMatch) {
    const playerId = decodeURIComponent(playerSettingsMatch[1]);
    const settings = await readPlayerAdminSettings(
      context.service,
      gameId,
      playerId,
    );
    return json(request, 200, {
      data: { playerId, settings: settings?.settings || {}, record: settings },
    });
  }

  const playerFlagsMatch = suffix.match(/^\/players\/([^/]+)\/flags$/);
  if (playerFlagsMatch) {
    const playerId = decodeURIComponent(playerFlagsMatch[1]);
    const flags = await readPlayerFlags(context.service, gameId, playerId);
    return json(request, 200, { data: { playerId, flags } });
  }

  if (suffix === "/attendance/today") {
    const players = await loadPlayersEnhanced(context.service, gameId);
    return json(request, 200, {
      data: await loadAttendanceEnhanced(context.service, gameId, players),
    });
  }

  if (suffix === "/attendance/history") {
    const players = await loadPlayersEnhanced(context.service, gameId);
    return json(request, 200, {
      data: await loadAttendanceHistoryEnhanced(
        context.service,
        gameId,
        players,
        url,
      ),
    });
  }

  if (["/attendance/export", "/attendance/exports"].includes(suffix)) {
    const players = await loadPlayersEnhanced(context.service, gameId);
    const exportUrl = new URL(url);
    exportUrl.searchParams.set("page", "1");
    exportUrl.searchParams.set("pageSize", "200");
    const rows: any[] = [];
    let page = 1;
    let hasNext = true;
    while (hasNext && page <= 50) {
      exportUrl.searchParams.set("page", String(page));
      const result = await loadAttendanceHistoryEnhanced(
        context.service,
        gameId,
        players,
        exportUrl,
      );
      rows.push(...(result.rows || []));
      hasNext = Boolean(result.pagination?.hasNextPage);
      page += 1;
    }
    return csvResponse(
      request,
      attendanceRowsToCsv(rows),
      `econovaria-attendance-${gameId}.csv`,
    );
  }

  if (suffix === "/contracts") {
    const contracts = await loadContracts(context.service, gameId);
    return json(request, 200, {
      data: { contracts, assignments: contracts },
    });
  }

  if (suffix === "/contracts/reward-audit") {
    const rewardAudit = await loadContractRewardAudit(context.service, gameId);
    return json(request, 200, {
      data: { rewardAudit, contractRewardAudit: rewardAudit },
    });
  }

  const contractRewardAuditMatch = suffix.match(
    /^\/contracts\/([^/]+)\/reward-audit$/,
  );
  if (contractRewardAuditMatch) {
    const contractId = decodeURIComponent(contractRewardAuditMatch[1]);
    const rewardAudit = await loadContractRewardAudit(
      context.service,
      gameId,
      contractId,
    );
    return json(request, 200, {
      data: { contractId, rewardAudit, contractRewardAudit: rewardAudit },
    });
  }

  const contractProgressMatch = suffix.match(
    /^\/contracts\/([^/]+)\/progress$/,
  );
  if (contractProgressMatch) {
    return handleContractProgressReadOperation(request, context.service, {
      applicationContext,
      gameSessionId: gameId,
      contractId: decodeURIComponent(contractProgressMatch[1]),
    });
  }

  if (suffix === "/contract-submissions") {
    const submissions = await loadContractSubmissions(context.service, gameId);
    return json(request, 200, {
      data: { contractSubmissions: submissions, submissions },
    });
  }

  const contractSubmissionsMatch = suffix.match(
    /^\/contracts\/([^/]+)\/submissions$/,
  );
  if (contractSubmissionsMatch) {
    const contractId = decodeURIComponent(contractSubmissionsMatch[1]);
    const submissions = await loadContractSubmissions(
      context.service,
      gameId,
      contractId,
    );
    return json(request, 200, {
      data: { contractId, contractSubmissions: submissions, submissions },
    });
  }

  if (suffix === "/store/items") {
    const storeItems = await loadStore(context.service, gameId);
    return json(request, 200, { data: { storeItems, items: storeItems } });
  }

  if (suffix === "/market/assets") {
    const market = await loadMarket(context.service, gameId);
    return json(request, 200, {
      data: { assets: market.assets, marketplaceSecurities: market.assets },
    });
  }

  const marketProfileMatch = suffix.match(
    /^\/market\/assets\/([^/]+)\/profile$/,
  );
  if (marketProfileMatch) {
    const market = await loadMarket(context.service, gameId);
    const assetId = decodeURIComponent(marketProfileMatch[1]);
    const asset = market.assets.find((item: any) =>
      String(item.id) === assetId
    );
    return asset
      ? json(request, 200, { data: { asset, profile: asset } })
      : json(request, 404, {
        code: "asset_not_found",
        message: "Market asset was not found.",
      });
  }

  const marketChartMatch = suffix.match(
    /^\/market\/assets\/([^/]+)\/chart$/,
  );
  if (marketChartMatch) {
    const candles = await loadMarketChart(
      context.service,
      gameId,
      decodeURIComponent(marketChartMatch[1]),
    );
    return json(request, 200, { data: { candles, chart: candles } });
  }

  const marketFinancialsMatch = suffix.match(
    /^\/market\/assets\/([^/]+)\/financials$/,
  );
  if (marketFinancialsMatch) {
    const market = await loadMarket(context.service, gameId);
    const assetId = decodeURIComponent(marketFinancialsMatch[1]);
    const asset = market.assets.find((item: any) =>
      String(item.id) === assetId
    );
    return asset
      ? json(request, 200, {
        data: {
          assetId: asset.id,
          financials: asset.financials || {},
          fundamentals: asset.fundamentals || {},
        },
      })
      : json(request, 404, {
        code: "asset_not_found",
        message: "Market asset was not found.",
      });
  }

  if (suffix === "/market/trades/recent") {
    const market = await loadMarket(context.service, gameId);
    return json(request, 200, {
      data: { trades: market.trades, marketplaceTrades: market.trades },
    });
  }

  if (["/market/events", "/market/news"].includes(suffix)) {
    const market = await loadMarket(context.service, gameId);
    return json(request, 200, {
      data: {
        events: market.events,
        marketEvents: market.events,
        news: market.events,
      },
    });
  }

  if (suffix === "/market/impact-audit") {
    const result = await context.service.from("audit_log").select("*")
      .eq("game_session_id", gameId)
      .ilike("action", "market.%")
      .order("created_at", { ascending: false }).limit(250);
    if (result.error) throw result.error;
    return json(request, 200, { data: { impactAudit: result.data || [] } });
  }

  if (suffix === "/settings") {
    return json(request, 200, {
      data: {
        settings: await loadSettings(
          createSupabaseGameSettingsReadRepository(context.service),
          applicationContext,
        ),
      },
    });
  }

  if (suffix === "/settings/audit") {
    const result = await context.service.from("audit_log").select("*")
      .eq("game_session_id", gameId)
      .ilike("action", "settings.%")
      .order("created_at", { ascending: false }).limit(250);
    if (result.error) throw result.error;
    return json(request, 200, { data: { settingsAudit: result.data || [] } });
  }

  const settingsGroupMatch = suffix.match(/^\/settings\/([^/]+)$/);
  if (settingsGroupMatch) {
    const group = decodeURIComponent(settingsGroupMatch[1]);
    const settings = await loadSettings(
      createSupabaseGameSettingsReadRepository(context.service),
      applicationContext,
    );
    return json(request, 200, {
      data: { group, settings, value: settings?.[group] ?? null },
    });
  }

  if (["/logs", "/player-logs"].includes(suffix)) {
    return json(request, 200, {
      data: await loadLogsPage(
        context.service,
        gameId,
        context.staff.id,
        url,
      ),
    });
  }

  if (
    ["/logs/export", "/logs/exports", "/player-logs/exports"].includes(suffix)
  ) {
    const exportUrl = new URL(url);
    exportUrl.searchParams.set("page", "1");
    exportUrl.searchParams.set("pageSize", "500");
    const page = await loadLogsPage(
      context.service,
      gameId,
      context.staff.id,
      exportUrl,
      { page: 1, pageSize: 500 },
    );
    return csvResponse(
      request,
      logsToCsv(page.logs),
      `econovaria-audit-log-${gameId}.csv`,
    );
  }

  const relatedMatch = suffix.match(
    /^\/(?:logs|player-logs)\/([^/]+)\/related-record$/,
  );
  if (relatedMatch) {
    const record = await loadRelatedAuditRecord(
      context.service,
      gameId,
      decodeURIComponent(relatedMatch[1]),
    );
    return record ? json(request, 200, { data: record }) : json(request, 404, {
      code: "audit_log_not_found",
      message: "Audit-log event was not found for this game.",
    });
  }

  return null;
}
export { handleGameWrite } from "./gameWriteRoutes.ts";

import {
  corsHeaders,
  gameDto,
  json,
  number,
  proxyClassroom,
  todayIsoDate,
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
import {
  loadLogsPage,
  logsToCsv,
  updateAuditLogFlag,
} from "./logs.ts";
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

function classroomGamePath(gameId: string, suffix: string): string {
  return `/games/${encodeURIComponent(gameId)}${suffix}`;
}

function classroomContractPath(gameId: string, suffix = ""): string {
  return `/staff/game-sessions/${encodeURIComponent(gameId)}/contracts${suffix}`;
}

function csvResponse(request: Request, csv: string, filename: string): Response {
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

async function readPlayerAdminSettings(
  service: any,
  gameId: string,
  playerId: string,
): Promise<any> {
  const result = await service.from("player_admin_settings").select("*")
    .eq("game_session_id", gameId).eq("player_id", playerId).maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

async function readPlayerFlags(
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

async function ensureAttendanceUnlocked(
  service: any,
  gameId: string,
): Promise<any | null> {
  const date = todayIsoDate();
  const result = await service.from("attendance_day_locks").select("*")
    .eq("game_session_id", gameId).eq("attendance_date", date).maybeSingle();
  if (result.error) throw result.error;
  return result.data?.status === "locked" ? result.data : null;
}

export async function handleGameRead(
  request: Request,
  context: any,
  url: URL,
  game: any,
  gameId: string,
  suffix: string,
): Promise<Response | null> {
  if (request.method !== "GET") return null;

  if (suffix === "" || suffix === "/") {
    return json(request, 200, { data: { game: gameDto(game) } });
  }

  if (suffix === "/dashboard") {
    const players = await loadPlayersEnhanced(context.service, gameId);
    const [attendance, contracts] = await Promise.all([
      loadAttendanceEnhanced(context.service, gameId, players),
      loadContracts(context.service, gameId),
    ]);
    const leaderboard = [...players]
      .sort((a, b) => number(b.netWorth) - number(a.netWorth))
      .map((player, index) => ({
        ...player,
        rank: index + 1,
        leaderboardBasis: "net_worth",
      }));
    return json(request, 200, {
      data: {
        game: gameDto(game),
        leaderboard,
        leaderboardBasis: "net_worth",
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
    return proxyClassroom(
      request,
      context,
      classroomContractPath(
        gameId,
        `/${encodeURIComponent(decodeURIComponent(contractProgressMatch[1]))}/progress`,
      ),
      "GET",
    );
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
    const asset = market.assets.find((item: any) => String(item.id) === assetId);
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
    const asset = market.assets.find((item: any) => String(item.id) === assetId);
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
      data: { events: market.events, marketEvents: market.events, news: market.events },
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
      data: { settings: await loadSettings(context.service, gameId) },
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
    const settings = await loadSettings(context.service, gameId);
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

  if (["/logs/export", "/logs/exports", "/player-logs/exports"].includes(suffix)) {
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
    return record
      ? json(request, 200, { data: record })
      : json(request, 404, {
        code: "audit_log_not_found",
        message: "Audit-log event was not found for this game.",
      });
  }

  return null;
}

export async function handleGameWrite(
  request: Request,
  context: any,
  url: URL,
  gameId: string,
  suffix: string,
): Promise<Response | null> {
  if (["GET", "HEAD"].includes(request.method)) return null;
  const body = await request.clone().json().catch(() => ({}));
  const direct = await handleAttendancePlayerOperation(context.service, {
    gameSessionId: gameId,
    staffUserId: context.staff.id,
    path: `/games/${encodeURIComponent(gameId)}${suffix}`,
    method: request.method,
    body,
  });
  if (direct.handled) return json(request, direct.status, direct.body);

  if (suffix === "/join-code/reset" && request.method === "POST") {
    return proxyClassroom(
      request,
      context,
      classroomGamePath(gameId, "/join-code/reset"),
      "POST",
    );
  }

  if (suffix === "/players" && request.method === "POST") {
    return proxyClassroom(
      request,
      context,
      classroomGamePath(gameId, "/players"),
      "POST",
    );
  }

  const accessResetMatch = suffix.match(
    /^\/players\/([^/]+)\/access-code\/reset$/,
  );
  if (accessResetMatch && request.method === "POST") {
    return proxyClassroom(
      request,
      context,
      classroomGamePath(
        gameId,
        `/players/${encodeURIComponent(decodeURIComponent(accessResetMatch[1]))}/access-code/reset`,
      ),
      "POST",
    );
  }

  if (suffix === "/attendance/scans" && request.method === "POST") {
    const lock = await ensureAttendanceUnlocked(context.service, gameId);
    if (lock) {
      return json(request, 423, {
        code: "attendance_period_locked",
        message: "Attendance for today is locked. Unlock it before scanning.",
        data: { lock },
      });
    }
    return proxyClassroom(
      request,
      context,
      classroomGamePath(gameId, "/attendance/scan"),
      "POST",
    );
  }

  if (suffix === "/contracts" && request.method === "POST") {
    return proxyClassroom(
      request,
      context,
      classroomContractPath(gameId),
      "POST",
    );
  }

  const publishMatch = suffix.match(/^\/contracts\/([^/]+)\/publish$/);
  if (publishMatch && request.method === "POST") {
    return proxyClassroom(
      request,
      context,
      classroomContractPath(
        gameId,
        `/${encodeURIComponent(decodeURIComponent(publishMatch[1]))}/publish`,
      ),
      "POST",
    );
  }

  const contractCompatibilityMatch = suffix.match(
    /^\/contracts\/([^/]+)\/(archive|duplicate)$/,
  );
  if (contractCompatibilityMatch && request.method === "POST") {
    return proxyClassroom(
      request,
      context,
      classroomGamePath(gameId, suffix),
      "POST",
    );
  }

  const submissionDecisionMatch = suffix.match(
    /^\/contract-submissions\/([^/]+)\/decision$/,
  );
  if (submissionDecisionMatch && ["POST", "PATCH"].includes(request.method)) {
    const submissionId = decodeURIComponent(submissionDecisionMatch[1]);
    const progress = await context.service.from("player_contract_progress")
      .select("id,contract_id").eq("game_session_id", gameId)
      .eq("id", submissionId).maybeSingle();
    if (progress.error) throw progress.error;
    if (!progress.data) {
      return json(request, 404, {
        code: "contract_submission_not_found",
        message: "Contract submission was not found.",
      });
    }
    return proxyClassroom(
      request,
      context,
      classroomContractPath(
        gameId,
        `/${encodeURIComponent(progress.data.contract_id)}/progress/${encodeURIComponent(submissionId)}/review`,
      ),
      "POST",
    );
  }

  const submissionReviewMatch = suffix.match(
    /^\/contracts\/([^/]+)\/submissions\/([^/]+)\/review$/,
  );
  if (submissionReviewMatch && ["POST", "PATCH"].includes(request.method)) {
    return proxyClassroom(
      request,
      context,
      classroomContractPath(
        gameId,
        `/${encodeURIComponent(decodeURIComponent(submissionReviewMatch[1]))}/progress/${encodeURIComponent(decodeURIComponent(submissionReviewMatch[2]))}/review`,
      ),
      "POST",
    );
  }

  const progressReviewMatch = suffix.match(
    /^\/contracts\/([^/]+)\/progress\/([^/]+)\/review$/,
  );
  if (progressReviewMatch && request.method === "POST") {
    return proxyClassroom(
      request,
      context,
      classroomContractPath(
        gameId,
        `/${encodeURIComponent(decodeURIComponent(progressReviewMatch[1]))}/progress/${encodeURIComponent(decodeURIComponent(progressReviewMatch[2]))}/review`,
      ),
      "POST",
    );
  }

  const rewardMatch = suffix.match(
    /^\/contracts\/([^/]+)\/progress\/([^/]+)\/rewards\/issue$/,
  );
  if (rewardMatch && request.method === "POST") {
    return proxyClassroom(
      request,
      context,
      classroomContractPath(
        gameId,
        `/${encodeURIComponent(decodeURIComponent(rewardMatch[1]))}/progress/${encodeURIComponent(decodeURIComponent(rewardMatch[2]))}/rewards/issue`,
      ),
      "POST",
    );
  }

  if (suffix === "/store/items" && request.method === "POST") {
    return proxyClassroom(
      request,
      context,
      classroomGamePath(gameId, "/store/items"),
      "POST",
    );
  }

  const storeCompatibilityMatch = suffix.match(
    /^\/store\/items\/([^/]+)\/(restock|rebalance-price)$/,
  );
  if (storeCompatibilityMatch && request.method === "POST") {
    return proxyClassroom(
      request,
      context,
      classroomGamePath(gameId, suffix),
      "POST",
    );
  }

  const storeStatusMatch = suffix.match(/^\/store\/items\/([^/]+)\/status$/);
  if (storeStatusMatch && ["POST", "PATCH", "PUT"].includes(request.method)) {
    return proxyClassroom(
      request,
      context,
      classroomGamePath(
        gameId,
        `/store/items/${encodeURIComponent(decodeURIComponent(storeStatusMatch[1]))}`,
      ),
      "PATCH",
      body,
    );
  }

  const storeItemMatch = suffix.match(/^\/store\/items\/([^/]+)$/);
  if (storeItemMatch && ["PUT", "PATCH", "DELETE"].includes(request.method)) {
    return proxyClassroom(
      request,
      context,
      classroomGamePath(
        gameId,
        `/store/items/${encodeURIComponent(decodeURIComponent(storeItemMatch[1]))}`,
      ),
      request.method,
    );
  }

  const playerDeleteMatch = suffix.match(/^\/players\/([^/]+)$/);
  if (playerDeleteMatch && request.method === "DELETE") {
    return proxyClassroom(
      request,
      context,
      classroomGamePath(gameId, suffix),
      "DELETE",
    );
  }

  const settingsResetMatch = suffix.match(/^\/settings\/([^/]+)\/reset$/);
  if (settingsResetMatch && request.method === "POST") {
    return proxyClassroom(
      request,
      context,
      classroomGamePath(gameId, suffix),
      "POST",
    );
  }

  const settingsGroupMatch = suffix.match(/^\/settings\/([^/]+)$/);
  if (settingsGroupMatch && ["POST", "PUT", "PATCH"].includes(request.method)) {
    return proxyClassroom(
      request,
      context,
      classroomGamePath(gameId, "/settings"),
      request.method,
      body,
    );
  }

  if (suffix === "/settings" && ["POST", "PUT", "PATCH"].includes(request.method)) {
    return proxyClassroom(
      request,
      context,
      classroomGamePath(gameId, "/settings"),
      request.method,
    );
  }

  if (suffix === "/attendance/exports" && request.method === "POST") {
    const params = new URLSearchParams();
    const filters = body.filters && typeof body.filters === "object"
      ? body.filters
      : body;
    for (const key of [
      "date",
      "period",
      "startDate",
      "endDate",
      "from",
      "to",
      "playerId",
      "status",
      "search",
    ]) {
      const value = filters?.[key];
      if (value != null && String(value).trim()) {
        params.set(key, String(value).trim());
      }
    }
    const query = params.toString();
    const downloadPath = `/api/admin/games/${encodeURIComponent(gameId)}/attendance/export${query ? `?${query}` : ""}`;
    return json(request, 200, {
      data: {
        jobId: crypto.randomUUID(),
        status: "completed",
        exportType: "attendance",
        downloadPath,
        downloadUrl: downloadPath,
        fileName: `econovaria-attendance-${gameId}.csv`,
        createdAt: new Date().toISOString(),
      },
    });
  }

  if (["/logs/exports", "/player-logs/exports"].includes(suffix) && request.method === "POST") {
    return json(request, 200, {
      data: {
        jobId: crypto.randomUUID(),
        status: "completed",
        exportType: suffix.startsWith("/player-logs") ? "player_logs" : "admin_logs",
        downloadPath: `/api/admin/games/${encodeURIComponent(gameId)}/logs/export`,
        createdAt: new Date().toISOString(),
      },
    });
  }

  const logFlagMatch = suffix.match(/^\/(?:logs|player-logs)\/([^/]+)\/flag$/);
  if (logFlagMatch && ["POST", "PATCH", "DELETE"].includes(request.method)) {
    const auditLogId = decodeURIComponent(logFlagMatch[1]);
    const result = await updateAuditLogFlag(
      context.service,
      gameId,
      auditLogId,
      context.staff.id,
      request,
    );
    return result.found
      ? json(request, 200, {
        data: {
          auditLogId,
          flag: result.flag,
          flagged: result.flag?.status === "open",
        },
      })
      : json(request, 404, {
        code: "audit_log_not_found",
        message: "Audit-log event was not found for this game.",
      });
  }

  return null;
}

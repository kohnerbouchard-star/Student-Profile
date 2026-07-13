import {
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL,
  corsHeaders,
  ensureOwnedGame,
  gameDto,
  json,
  number,
  proxyClassroom,
  resolveContext,
  selectGame,
} from "./common.ts";
import {
  loadAttendance,
  loadAttendanceHistory,
  loadContracts,
  loadLogs,
  loadMarket,
  loadPlayers,
  loadSettings,
  loadStore,
} from "./readModels.ts";

function routePath(url) {
  const marker = "/admin-api";
  const markerIndex = url.pathname.indexOf(marker);
  return markerIndex >= 0
    ? url.pathname.slice(markerIndex + marker.length) || "/"
    : url.pathname;
}

function classroomGamePath(gameId, suffix) {
  return `/games/${encodeURIComponent(gameId)}${suffix}`;
}

function classroomContractPath(gameId, suffix = "") {
  return `/staff/game-sessions/${encodeURIComponent(gameId)}/contracts${suffix}`;
}

async function loadContractSubmissions(service, gameId) {
  const result = await service
    .from("player_contract_progress")
    .select("*")
    .eq("game_session_id", gameId)
    .order("updated_at", { ascending: false });
  if (result.error) throw result.error;
  return result.data || [];
}

async function loadMarketChart(service, gameId, assetId) {
  const ticks = await service
    .from("stock_price_ticks")
    .select("tick_index,price,previous_price,change_pct,volume,created_at")
    .eq("game_session_id", gameId)
    .eq("stock_asset_id", assetId)
    .order("tick_index", { ascending: true })
    .limit(500);
  if (ticks.error) throw ticks.error;
  return (ticks.data || []).map((row) => {
    const close = number(row.price);
    const open = number(row.previous_price, close);
    return {
      time: row.created_at,
      timestamp: row.created_at,
      close,
      open,
      high: Math.max(close, open),
      low: Math.min(close, open),
      volume: number(row.volume),
      changePct: number(row.change_pct),
    };
  });
}

async function handleGlobalRoute(request, context, path) {
  if (path === "/session/bootstrap" && request.method === "GET") {
    const selected = selectGame(context, request);
    const claims = context.user || {};
    return json(request, 200, {
      data: {
        admin: {
          id: context.staff.id,
          accountId: context.staff.id,
          displayName: context.staff.display_name,
          email: context.staff.email,
          role: "game_admin",
          roles: ["game_admin"],
        },
        activeGame: selected ? gameDto(selected) : {},
        games: context.games.map(gameDto),
        permissions: ["*"],
        roles: ["game_admin"],
        csrfToken: "",
        session: {
          id: claims.id || context.staff.id,
          csrfToken: "",
          expiresAt: null,
        },
      },
    });
  }

  if (path === "/games" && request.method === "GET") {
    return json(request, 200, { data: { games: context.games.map(gameDto) } });
  }

  if (path === "/account/profile" && request.method === "GET") {
    return json(request, 200, {
      data: {
        profile: {
          id: context.staff.id,
          accountId: context.staff.id,
          displayName: context.staff.display_name,
          name: context.staff.display_name,
          email: context.staff.email,
          role: "game_admin",
        },
      },
    });
  }

  if (path === "/account/preferences" && request.method === "GET") {
    return json(request, 200, { data: { preferences: {} } });
  }
  if (path === "/notifications" && request.method === "GET") {
    return json(request, 200, {
      data: {
        notifications: [],
        notificationCount: 0,
        notificationPreferences: {},
        implementationStatus: "not_configured",
      },
    });
  }
  if (path.startsWith("/account/security") && request.method === "GET") {
    return json(request, 200, {
      data: {
        security: {
          twoFactorEnabled: false,
          sessions: [],
          events: [],
          implementationStatus: "not_configured",
        },
      },
    });
  }
  if (path === "/help/admin-console" && request.method === "GET") {
    return json(request, 200, {
      data: { articles: [], implementationStatus: "not_configured" },
    });
  }
  if (path === "/auth/sign-out" && request.method === "POST") {
    return json(request, 200, { data: { signedOut: true } });
  }

  const switchMatch = path.match(/^\/games\/([^/]+)\/switch$/);
  if (switchMatch && request.method === "POST") {
    const game = ensureOwnedGame(context, decodeURIComponent(switchMatch[1]));
    if (!game) {
      return json(request, 404, {
        code: "game_not_found",
        message: "That game is not available to this administrator.",
      });
    }
    return json(request, 200, { data: { activeGame: gameDto(game) } });
  }

  return null;
}

async function handleGameReads(request, context, url, game, gameId, suffix) {
  if (request.method !== "GET") return null;

  if (suffix === "/dashboard") {
    const players = await loadPlayers(context.service, gameId);
    const [attendance, contracts] = await Promise.all([
      loadAttendance(context.service, gameId, players),
      loadContracts(context.service, gameId),
    ]);
    const leaderboard = [...players]
      .sort((a, b) => number(b.netWorth) - number(a.netWorth))
      .map((player, index) => ({ ...player, rank: index + 1 }));
    return json(request, 200, {
      data: {
        game: gameDto(game),
        leaderboard,
        contracts: contracts.filter((item) => ["active", "scheduled", "draft"].includes(item.status)),
        notifications: [],
        notificationCount: 0,
        ...attendance,
      },
    });
  }

  if (suffix === "/players") {
    const players = await loadPlayers(context.service, gameId);
    return json(request, 200, {
      data: { players, roster: players, totalPlayers: players.length },
    });
  }

  if (suffix === "/attendance/today") {
    const players = await loadPlayers(context.service, gameId);
    return json(request, 200, {
      data: await loadAttendance(context.service, gameId, players),
    });
  }

  if (suffix === "/attendance/history") {
    const players = await loadPlayers(context.service, gameId);
    return json(request, 200, {
      data: await loadAttendanceHistory(context.service, gameId, players, url),
    });
  }

  if (suffix === "/contracts") {
    const contracts = await loadContracts(context.service, gameId);
    return json(request, 200, { data: { contracts, assignments: contracts } });
  }

  const progressMatch = suffix.match(/^\/contracts\/([^/]+)\/progress$/);
  if (progressMatch) {
    return proxyClassroom(
      request,
      context,
      classroomContractPath(
        gameId,
        `/${encodeURIComponent(decodeURIComponent(progressMatch[1]))}/progress`,
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

  const profileMatch = suffix.match(/^\/market\/assets\/([^/]+)\/profile$/);
  if (profileMatch) {
    const market = await loadMarket(context.service, gameId);
    const asset = market.assets.find((item) => String(item.id) === decodeURIComponent(profileMatch[1]));
    if (!asset) {
      return json(request, 404, {
        code: "asset_not_found",
        message: "Market asset was not found.",
      });
    }
    return json(request, 200, { data: { asset, profile: asset } });
  }

  const chartMatch = suffix.match(/^\/market\/assets\/([^/]+)\/chart$/);
  if (chartMatch) {
    const candles = await loadMarketChart(
      context.service,
      gameId,
      decodeURIComponent(chartMatch[1]),
    );
    return json(request, 200, { data: { candles, chart: candles } });
  }

  const financialsMatch = suffix.match(/^\/market\/assets\/([^/]+)\/financials$/);
  if (financialsMatch) {
    const market = await loadMarket(context.service, gameId);
    const asset = market.assets.find((item) => String(item.id) === decodeURIComponent(financialsMatch[1]));
    if (!asset) {
      return json(request, 404, {
        code: "asset_not_found",
        message: "Market asset was not found.",
      });
    }
    return json(request, 200, {
      data: {
        assetId: asset.id,
        financials: asset.financials || {},
        fundamentals: asset.fundamentals || {},
      },
    });
  }

  if (suffix === "/market/trades/recent") {
    const market = await loadMarket(context.service, gameId);
    return json(request, 200, {
      data: { trades: market.trades, marketplaceTrades: market.trades },
    });
  }

  if (suffix === "/market/events") {
    const market = await loadMarket(context.service, gameId);
    return json(request, 200, {
      data: { events: market.events, marketEvents: market.events },
    });
  }

  if (suffix === "/settings") {
    return json(request, 200, {
      data: { settings: await loadSettings(context.service, gameId) },
    });
  }

  if (suffix === "/logs") {
    const limit = number(url.searchParams.get("limit"), 200);
    const auditLogs = await loadLogs(context.service, gameId, limit);
    return json(request, 200, { data: { auditLogs, logs: auditLogs } });
  }

  return null;
}

async function handleGameWrites(request, context, gameId, suffix) {
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

  const resetCodeMatch = suffix.match(/^\/players\/([^/]+)\/access-code\/reset$/);
  if (resetCodeMatch && request.method === "POST") {
    return proxyClassroom(
      request,
      context,
      classroomGamePath(
        gameId,
        `/players/${encodeURIComponent(decodeURIComponent(resetCodeMatch[1]))}/access-code/reset`,
      ),
      "POST",
    );
  }

  if (suffix === "/attendance/scans" && request.method === "POST") {
    return proxyClassroom(
      request,
      context,
      classroomGamePath(gameId, "/attendance/scan"),
      "POST",
    );
  }

  if (suffix === "/contracts" && request.method === "POST") {
    return proxyClassroom(request, context, classroomContractPath(gameId), "POST");
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

  const reviewMatch = suffix.match(/^\/contracts\/([^/]+)\/progress\/([^/]+)\/review$/);
  if (reviewMatch && request.method === "POST") {
    return proxyClassroom(
      request,
      context,
      classroomContractPath(
        gameId,
        `/${encodeURIComponent(decodeURIComponent(reviewMatch[1]))}/progress/${encodeURIComponent(decodeURIComponent(reviewMatch[2]))}/review`,
      ),
      "POST",
    );
  }

  const rewardMatch = suffix.match(/^\/contracts\/([^/]+)\/progress\/([^/]+)\/rewards\/issue$/);
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

  if (suffix === "/settings" && ["PUT", "PATCH", "POST"].includes(request.method)) {
    return proxyClassroom(
      request,
      context,
      classroomGamePath(gameId, "/settings"),
      request.method,
    );
  }

  return null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(request, 500, {
      code: "missing_runtime_config",
      message: "Admin API runtime configuration is incomplete.",
    });
  }

  const context = await resolveContext(request);
  if (!context.ok) {
    return json(request, context.status, {
      code: "auth_failed",
      message: context.message,
    });
  }

  const url = new URL(request.url);
  const path = routePath(url);

  try {
    const globalResponse = await handleGlobalRoute(request, context, path);
    if (globalResponse) return globalResponse;

    const gameMatch = path.match(/^\/games\/([^/]+)(\/.*)?$/);
    if (!gameMatch) {
      return json(request, 404, {
        code: "route_not_found",
        message: "Admin API route was not found.",
      });
    }

    const gameId = decodeURIComponent(gameMatch[1]);
    const suffix = gameMatch[2] || "";
    const game = ensureOwnedGame(context, gameId);
    if (!game) {
      return json(request, 404, {
        code: "game_not_found",
        message: "That game is not available to this administrator.",
      });
    }

    const readResponse = await handleGameReads(request, context, url, game, gameId, suffix);
    if (readResponse) return readResponse;

    const writeResponse = await handleGameWrites(request, context, gameId, suffix);
    if (writeResponse) return writeResponse;

    return json(request, 501, {
      code: "admin_route_not_implemented",
      message: "This administrator operation is not connected yet.",
      path,
    });
  } catch (error) {
    console.error("admin-api failure", {
      path,
      error: String(error?.message || error),
    });
    return json(request, 500, {
      code: "admin_api_failed",
      message: "Administrator data could not be loaded.",
    });
  }
});

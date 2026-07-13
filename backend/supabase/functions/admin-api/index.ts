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
  readJson,
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
} from "./reads.ts";
import {
  archiveContract,
  normalizeAttendanceScanBody,
  normalizeContractBody,
  normalizeCreatePlayerBody,
  normalizeStoreBody,
  updateSettings,
} from "./writes.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(request, 500, { code: "missing_runtime_config", message: "Admin API runtime configuration is incomplete." });
  }

  const context = await resolveContext(request);
  if (!context.ok) return json(request, context.status, { code: "auth_failed", message: context.message });

  const url = new URL(request.url);
  const marker = "/admin-api";
  const markerIndex = url.pathname.indexOf(marker);
  const path = markerIndex >= 0 ? url.pathname.slice(markerIndex + marker.length) || "/" : url.pathname;

  try {
    if (path === "/session/bootstrap" && request.method === "GET") {
      const selected = selectGame(context, request);
      return json(request, 200, { data: {
        admin: { id: context.staff.id, accountId: context.staff.id, displayName: context.staff.display_name, email: context.staff.email, role: "game_admin", roles: ["game_admin"] },
        activeGame: selected ? gameDto(selected) : {},
        games: context.games.map(gameDto),
        permissions: ["*"],
        roles: ["game_admin"],
        csrfToken: "",
        session: { id: context.user.id || context.staff.id, csrfToken: "", expiresAt: null },
      } });
    }
    if (path === "/games" && request.method === "GET") return json(request, 200, { data: { games: context.games.map(gameDto) } });
    if (path === "/account/profile" && request.method === "GET") return json(request, 200, { data: { profile: { id: context.staff.id, accountId: context.staff.id, displayName: context.staff.display_name, name: context.staff.display_name, email: context.staff.email, role: "game_admin" } } });
    if (path === "/account/preferences" && request.method === "GET") return json(request, 200, { data: { preferences: {}, implementationStatus: "not_configured" } });
    if (path === "/notifications" && request.method === "GET") return json(request, 200, { data: { notifications: [], notificationCount: 0, notificationPreferences: {}, implementationStatus: "not_implemented" } });
    if (path.startsWith("/account/security") && request.method === "GET") return json(request, 200, { data: { security: { twoFactorEnabled: false, sessions: [], events: [], implementationStatus: "not_implemented" } } });
    if (path === "/help/admin-console" && request.method === "GET") return json(request, 200, { data: { articles: [], implementationStatus: "not_implemented" } });
    if (path === "/auth/sign-out" && request.method === "POST") return json(request, 200, { data: { signedOut: true } });

    const switchMatch = path.match(/^\/games\/([^/]+)\/switch$/);
    if (switchMatch && request.method === "POST") {
      const game = ensureOwnedGame(context, decodeURIComponent(switchMatch[1]));
      if (!game) return json(request, 404, { code: "game_not_found", message: "That game is not available to this administrator." });
      return json(request, 200, { data: { activeGame: gameDto(game) } });
    }

    const gameMatch = path.match(/^\/games\/([^/]+)(\/.*)?$/);
    if (!gameMatch) return json(request, 404, { code: "route_not_found", message: "Admin API route was not found." });
    const gameId = decodeURIComponent(gameMatch[1]);
    const suffix = gameMatch[2] || "";
    const game = ensureOwnedGame(context, gameId);
    if (!game) return json(request, 404, { code: "game_not_found", message: "That game is not available to this administrator." });

    if (suffix === "/dashboard" && request.method === "GET") {
      const players = await loadPlayers(context.service, gameId);
      const [attendance, contracts] = await Promise.all([loadAttendance(context.service, gameId, players), loadContracts(context.service, gameId)]);
      const leaderboard = [...players].sort((a, b) => number(b.netWorth) - number(a.netWorth)).map((player, index) => ({ ...player, rank: index + 1 }));
      return json(request, 200, { data: { game: gameDto(game), leaderboard, contracts: contracts.filter((item) => ["active", "scheduled", "draft"].includes(item.status)), notifications: [], notificationCount: 0, ...attendance } });
    }

    if (suffix === "/players" && request.method === "GET") {
      const players = await loadPlayers(context.service, gameId);
      return json(request, 200, { data: { players, roster: players, totalPlayers: players.length } });
    }
    if (suffix === "/players" && request.method === "POST") {
      const body = normalizeCreatePlayerBody(await readJson(request));
      if (!body.displayName) return json(request, 400, { code: "player_display_name_required", message: "Enter a player name." });
      return proxyClassroom(request, context, `/games/${encodeURIComponent(gameId)}/players`, "POST", body);
    }
    const resetCodeMatch = suffix.match(/^\/players\/([^/]+)\/access-code\/reset$/);
    if (resetCodeMatch && request.method === "POST") return proxyClassroom(request, context, `/games/${encodeURIComponent(gameId)}/players/${encodeURIComponent(decodeURIComponent(resetCodeMatch[1]))}/access-code/reset`, "POST");

    if (suffix === "/attendance/today" && request.method === "GET") {
      const players = await loadPlayers(context.service, gameId);
      return json(request, 200, { data: await loadAttendance(context.service, gameId, players) });
    }
    if (suffix === "/attendance/history" && request.method === "GET") {
      const players = await loadPlayers(context.service, gameId);
      return json(request, 200, { data: await loadAttendanceHistory(context.service, gameId, players, url) });
    }
    if (suffix === "/attendance/scans" && request.method === "POST") {
      const body = normalizeAttendanceScanBody(await readJson(request));
      if (!body.playerId) return json(request, 400, { code: "player_id_required", message: "Scan or enter a player access code." });
      return proxyClassroom(request, context, `/games/${encodeURIComponent(gameId)}/attendance/scan`, "POST", body);
    }

    if (suffix === "/contracts" && request.method === "GET") {
      const contracts = await loadContracts(context.service, gameId);
      return json(request, 200, { data: { contracts, assignments: contracts } });
    }
    if (suffix === "/contracts" && request.method === "POST") return proxyClassroom(request, context, `/staff/game-sessions/${encodeURIComponent(gameId)}/contracts`, "POST", normalizeContractBody(await readJson(request)));
    if (suffix === "/contract-submissions" && request.method === "GET") {
      const result = await context.service.from("player_contract_progress").select("*").eq("game_session_id", gameId).order("updated_at", { ascending: false });
      if (result.error) throw result.error;
      return json(request, 200, { data: { contractSubmissions: result.data || [], submissions: result.data || [] } });
    }
    const publishMatch = suffix.match(/^\/contracts\/([^/]+)\/publish$/);
    if (publishMatch && request.method === "POST") return proxyClassroom(request, context, `/staff/game-sessions/${encodeURIComponent(gameId)}/contracts/${encodeURIComponent(decodeURIComponent(publishMatch[1]))}/publish`, "POST", await readJson(request));
    const progressMatch = suffix.match(/^\/contracts\/([^/]+)\/progress$/);
    if (progressMatch && request.method === "GET") return proxyClassroom(request, context, `/staff/game-sessions/${encodeURIComponent(gameId)}/contracts/${encodeURIComponent(decodeURIComponent(progressMatch[1]))}/progress${url.search}`, "GET");
    const reviewMatch = suffix.match(/^\/contracts\/([^/]+)\/progress\/([^/]+)\/review$/);
    if (reviewMatch && request.method === "POST") return proxyClassroom(request, context, `/staff/game-sessions/${encodeURIComponent(gameId)}/contracts/${encodeURIComponent(decodeURIComponent(reviewMatch[1]))}/progress/${encodeURIComponent(decodeURIComponent(reviewMatch[2]))}/review`, "POST", await readJson(request));
    const rewardMatch = suffix.match(/^\/contracts\/([^/]+)\/progress\/([^/]+)\/rewards\/issue$/);
    if (rewardMatch && request.method === "POST") return proxyClassroom(request, context, `/staff/game-sessions/${encodeURIComponent(gameId)}/contracts/${encodeURIComponent(decodeURIComponent(rewardMatch[1]))}/progress/${encodeURIComponent(decodeURIComponent(rewardMatch[2]))}/rewards/issue`, "POST", await readJson(request));
    const archiveMatch = suffix.match(/^\/contracts\/([^/]+)\/archive$/);
    if (archiveMatch && ["POST", "PATCH", "DELETE"].includes(request.method)) {
      const contract = await archiveContract(context, gameId, decodeURIComponent(archiveMatch[1]));
      if (!contract) return json(request, 404, { code: "contract_not_found", message: "Contract was not found." });
      return json(request, 200, { data: { contract } });
    }

    if (suffix === "/store/items" && request.method === "GET") {
      const items = await loadStore(context.service, gameId);
      return json(request, 200, { data: { storeItems: items, items } });
    }
    if (suffix === "/store/items" && request.method === "POST") {
      const body = normalizeStoreBody(await readJson(request), "create");
      if (!body.name) return json(request, 400, { code: "store_item_name_required", message: "Enter an item name." });
      return proxyClassroom(request, context, `/games/${encodeURIComponent(gameId)}/store/items`, "POST", body);
    }
    const storeItemMatch = suffix.match(/^\/store\/items\/([^/]+)$/);
    if (storeItemMatch && ["PATCH", "PUT"].includes(request.method)) return proxyClassroom(request, context, `/games/${encodeURIComponent(gameId)}/store/items/${encodeURIComponent(decodeURIComponent(storeItemMatch[1]))}`, "PATCH", normalizeStoreBody(await readJson(request), "update"));
    if (storeItemMatch && request.method === "DELETE") return proxyClassroom(request, context, `/games/${encodeURIComponent(gameId)}/store/items/${encodeURIComponent(decodeURIComponent(storeItemMatch[1]))}`, "PATCH", { status: "archived", visibility: "hidden" });

    if (suffix === "/market/assets" && request.method === "GET") {
      const market = await loadMarket(context.service, gameId);
      return json(request, 200, { data: { assets: market.assets, marketplaceSecurities: market.assets } });
    }
    const profileMatch = suffix.match(/^\/market\/assets\/([^/]+)\/profile$/);
    if (profileMatch && request.method === "GET") {
      const market = await loadMarket(context.service, gameId);
      const asset = market.assets.find((item) => String(item.id) === decodeURIComponent(profileMatch[1]));
      if (!asset) return json(request, 404, { code: "asset_not_found", message: "Market asset was not found." });
      return json(request, 200, { data: { asset, profile: asset } });
    }
    const chartMatch = suffix.match(/^\/market\/assets\/([^/]+)\/chart$/);
    if (chartMatch && request.method === "GET") {
      const assetId = decodeURIComponent(chartMatch[1]);
      const ticks = await context.service.from("stock_price_ticks").select("tick_index,price,previous_price,change_pct,volume,created_at").eq("game_session_id", gameId).eq("stock_asset_id", assetId).order("tick_index", { ascending: true }).limit(500);
      if (ticks.error) throw ticks.error;
      const candles = (ticks.data || []).map((row) => ({ time: row.created_at, timestamp: row.created_at, close: number(row.price), open: number(row.previous_price, number(row.price)), high: Math.max(number(row.price), number(row.previous_price, number(row.price))), low: Math.min(number(row.price), number(row.previous_price, number(row.price))), volume: number(row.volume), changePct: number(row.change_pct) }));
      return json(request, 200, { data: { candles, chart: candles } });
    }
    const financialsMatch = suffix.match(/^\/market\/assets\/([^/]+)\/financials$/);
    if (financialsMatch && request.method === "GET") {
      const market = await loadMarket(context.service, gameId);
      const asset = market.assets.find((item) => String(item.id) === decodeURIComponent(financialsMatch[1]));
      if (!asset) return json(request, 404, { code: "asset_not_found", message: "Market asset was not found." });
      return json(request, 200, { data: { assetId: asset.id, financials: asset.financials || {}, fundamentals: asset.fundamentals || {} } });
    }
    if (suffix === "/market/trades/recent" && request.method === "GET") {
      const market = await loadMarket(context.service, gameId);
      return json(request, 200, { data: { trades: market.trades, marketplaceTrades: market.trades } });
    }
    if (suffix === "/market/events" && request.method === "GET") {
      const market = await loadMarket(context.service, gameId);
      return json(request, 200, { data: { events: market.events, marketEvents: market.events } });
    }

    if (suffix === "/settings" && request.method === "GET") return json(request, 200, { data: { settings: await loadSettings(context.service, gameId) } });
    if ((suffix === "/settings" || suffix.startsWith("/settings/")) && ["POST", "PUT", "PATCH"].includes(request.method)) return json(request, 200, { data: { settings: await updateSettings(request, context, gameId) } });
    if (suffix === "/logs" && request.method === "GET") {
      const logs = await loadLogs(context.service, gameId);
      return json(request, 200, { data: { auditLogs: logs, logs } });
    }
    if (suffix === "/join-code/reset" && request.method === "POST") return proxyClassroom(request, context, `/games/${encodeURIComponent(gameId)}/join-code/reset`, "POST");

    return json(request, 501, { code: "admin_route_not_implemented", message: "This administrator operation is not connected yet.", path });
  } catch (error) {
    console.error("admin-api failure", { path, error: String(error?.message || error) });
    return json(request, 500, { code: "admin_api_failed", message: "Administrator data could not be loaded." });
  }
});

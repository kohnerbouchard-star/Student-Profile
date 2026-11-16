import { handlePlayerBusinessRequest } from "./playerBusinessHttpHandler.ts";
import { readPlayerBusinessRoutePath } from "./playerBusinessRoutePaths.ts";
import { EdgeActivationError } from "../../../platform/supabase/edgeResponse.ts";
import { projectBusinessIpoMutation } from "../application/businessIpoProjection.ts";
const game = "00000000-0000-4000-8000-000000000001", player = "00000000-0000-4000-8000-000000000002";
const ipo = `bgp_${"a".repeat(32)}`, business = `biz_${"b".repeat(32)}`;
const assert = (ok: unknown, message = "Assertion failed") => { if (!ok) throw new Error(message); };
const same = (a: unknown, b: unknown) => assert(JSON.stringify(a) === JSON.stringify(b), `${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
function receipt() { return { schemaVersion: 1, operation: "subscribe", replayed: false, receipt: { receiptKey: `bot_${"c".repeat(32)}`, ipoKey: ipo, businessKey: business, shares: "8", unitPrice: "2.5", total: "20.00", currencyCode: "NRC", createdAt: "2026-09-18T00:00:00Z", offeringCompleted: false, player_id: player } }; }
async function execute({ method = "POST", path = `/players/me/business/ipos/${ipo}/subscriptions`, body = { shares: "8", idempotencyKey: "phase14c-request-001" } as unknown, error = "", denied = false, headers = {} as Record<string,string> } = {}) {
  const calls: unknown[] = [];
  const request = new Request(`https://example.test${path}`, { method, headers: { "content-type": "application/json", "x-player-session-token": "opaque-test-session", ...headers }, ...(method === "GET" ? {} : { body: JSON.stringify(body) }) });
  const route = readPlayerBusinessRoutePath(new URL(request.url).pathname); assert(route);
  const response = await handlePlayerBusinessRequest(request, route!, {
    readEnvironment: () => ({ ok: true, value: { supabaseUrl: "https://example.test", supabaseAnonKey: "fixture-publishable", supabaseServiceRoleKey: "fixture-service" } }),
    createServiceClient: () => ({ rpc: (command: string, args: unknown) => { calls.push({ command, args }); return Promise.resolve({ data: method === "GET" ? { schemaVersion: 1, offerLimit: 100, truncated: false, ownBusiness: null, offers: [] } : receipt(), error: error ? { message: error } : null }); } }) as never,
    resolveScope: () => { if (denied) throw new EdgeActivationError("invalid_player_session", "Reconnect to your game.", 401); return Promise.resolve({ gameId: game, playerUuid: player }); },
  });
  return { response, body: await response.json(), calls };
}
Deno.test("IPO routes use both canonical Player roots and exact public offering paths", async () => {
  for (const root of ["", "/player-api", "/classroom-api", "/functions/v1/player-api", "/functions/v1/classroom-api"]) {
    same(readPlayerBusinessRoutePath(`${root}/players/me/business/ipos`), { kind: "businessIposRead" });
    same(readPlayerBusinessRoutePath(`${root}/players/me/business/ipos/proposals`), { kind: "businessIpoPropose" });
    const result = await execute({ path: `${root}/players/me/business/ipos/${ipo}/subscriptions` });
    same(result.response.status, 200); same(result.body.receipt.total, "20.00");
    same(result.calls, [{ command: "subscribe_business_primary_ipo_v1", args: { p_game_session_id: game, p_player_id: player, p_idempotency_key: "phase14c-request-001", p_ipo_key: ipo, p_shares: "8" } }]);
    assert(!JSON.stringify(result.body).includes(player)); same(result.response.headers.get("cache-control"), "private, no-store, max-age=0");
  }
  same(readPlayerBusinessRoutePath(`/players/me/business/ipos/${game}/subscriptions`), null);
});
Deno.test("IPO HTTP rejects scope injection, wrong method and malformed amounts without RPC writes", async () => {
  for (const input of [
    { body: { shares: "8", idempotencyKey: "phase14c-request-001", playerId: player } },
    { body: { shares: 8, idempotencyKey: "phase14c-request-001" } },
    { body: { shares: "1.5", idempotencyKey: "phase14c-request-001" } },
    { path: "/players/me/business/ipos/proposals", body: { unitPrice: "0.001", offeredShares: "20", idempotencyKey: "phase14c-request-001" } },
    { headers: { "x-game-session-id": game } }, { method: "PUT" },
  ]) { const result = await execute(input); assert([400,405].includes(result.response.status)); same(result.calls, []); }
});
Deno.test("IPO HTTP auth and database denials preserve privacy and scope", async () => {
  const denied = await execute({ denied: true }); same(denied.response.status, 401); same(denied.calls, []);
  for (const [message,status] of [["BUSINESS_IPO_NOT_FOUND",404],["BUSINESS_IPO_PLAYER_UNAVAILABLE",403],["BUSINESS_IPO_IDEMPOTENCY_CONFLICT",409],["BUSINESS_IPO_ALLOCATION_UNAVAILABLE",409],[`SQL detail ${game}`,500]] as const) {
    const result = await execute({ error: message }); same(result.response.status, status); assert(!JSON.stringify(result.body).includes(game));
  }
  const result = await execute({ method: "GET", path: "/players/me/business/ipos" }); same(result.body.offers, []);
});
Deno.test("IPO receipt projection rejects zero shares, wrong total and internal-key contamination", () => {
  for (const patch of [{ total: "19.99" }, { shares: "0" }, { businessKey: game }]) {
    const value = receipt(); Object.assign(value.receipt, patch); let caught = false;
    try { projectBusinessIpoMutation(value, "subscribe"); } catch { caught = true; } assert(caught);
  }
});

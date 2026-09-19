import { jsonResponse } from "../../../platform/supabase/edgeResponse.ts";
import type { EdgeSupabaseClient } from "../../../platform/supabase/edgeStaffSession.ts";
import { PlayerBusinessError, type PlayerBusinessRoute } from "../contracts/playerBusinessContracts.ts";
import { projectBusinessIpos, projectBusinessIpoMutation } from "../application/businessIpoProjection.ts";

const IPO_KINDS = new Set(["businessIposRead", "businessIpoPropose", "businessIpoVote", "businessIpoSubscribe"]);
function invalid(): never { throw new PlayerBusinessError("business_ipo_request_invalid", "Use a valid fixed price, whole share quantity and idempotency key.", 400); }
function shares(value: unknown): string {
  if (typeof value !== "string" || !/^[1-9][0-9]{0,6}$/u.test(value) || BigInt(value) > 1000000n) invalid();
  return value;
}
function price(value: unknown): string {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]{0,6})(?:\.[0-9]{1,2})?$/u.test(value)) invalid();
  const [whole, fraction = ""] = value.split("."); const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (cents <= 0n || cents > 100000000n) invalid();
  return value;
}
function replayKey(value: unknown): string { if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/u.test(value)) invalid(); return value; }
function databaseError(message: string): PlayerBusinessError {
  if (/IDEMPOTENCY_CONFLICT/.test(message)) return new PlayerBusinessError("business_ipo_idempotency_conflict", "This request key was already used for different terms.", 409);
  if (/NOT_FOUND/.test(message)) return new PlayerBusinessError("business_ipo_not_found", "This offering is unavailable in your game.", 404);
  if (/AUTHORITY_REQUIRED|VOTER_NOT_ELIGIBLE|PLAYER_UNAVAILABLE|GAME_UNAVAILABLE/.test(message)) return new PlayerBusinessError("business_ipo_access_denied", "Your current session cannot perform this offering action.", 403);
  if (/REQUEST_INVALID|TERMS_INVALID/.test(message)) return new PlayerBusinessError("business_ipo_request_invalid", "Check the price and whole share quantity.", 400);
  if (/INSUFFICIENT|HOLD|ACCOUNT.*(FROZEN|SUSPENDED|CLOSED)|NOT_OPEN|VOTING_CLOSED|VOTE_ALREADY_CAST|ALREADY_OFFERED|INELIGIBLE|ALLOCATION_UNAVAILABLE|CURRENCY_CHANGED/.test(message)) return new PlayerBusinessError("business_ipo_state_conflict", "The offering or available Checking funds changed. Refresh and review before trying again.", 409);
  return new PlayerBusinessError("business_ipo_request_failed", "The offering request could not be completed.", 500);
}
export async function dispatchPlayerBusinessIpoRequest(input: {
  readonly route: PlayerBusinessRoute; readonly body: Record<string, unknown>; readonly client: EdgeSupabaseClient;
  readonly publicScope: { readonly gameSessionId: string; readonly playerId: string };
}): Promise<Response | null> {
  const { route, body, client, publicScope } = input;
  if (!IPO_KINDS.has(route.kind)) return null;
  const args: Record<string, unknown> = { p_game_session_id: publicScope.gameSessionId, p_player_id: publicScope.playerId };
  let rpc: string; let operation: "propose" | "vote" | "subscribe" | null = null;
  if (route.kind === "businessIposRead") rpc = "read_player_business_ipos_v1";
  else {
    args.p_idempotency_key = replayKey(body.idempotencyKey);
    if (route.kind === "businessIpoPropose") {
      operation = "propose"; rpc = "propose_business_primary_ipo_v1";
      args.p_unit_price = price(body.unitPrice); args.p_offered_shares = shares(body.offeredShares);
    } else if (route.kind === "businessIpoVote" || route.kind === "businessIpoSubscribe") {
      if (!/^bgp_[0-9a-f]{32}$/u.test(route.ipoKey)) invalid();
      args.p_ipo_key = route.ipoKey;
      if (route.kind === "businessIpoVote") {
        if (body.decision !== "approve" && body.decision !== "reject") invalid();
        operation = "vote"; rpc = "vote_business_primary_ipo_v1"; args.p_decision = body.decision;
      } else { operation = "subscribe"; rpc = "subscribe_business_primary_ipo_v1"; args.p_shares = shares(body.shares); }
    } else invalid();
  }
  const result = await client.rpc<unknown>(rpc, args);
  if (result.error) throw databaseError(result.error.message);
  const projected = operation ? projectBusinessIpoMutation(result.data, operation) : projectBusinessIpos(result.data);
  return jsonResponse(200, { ok: true, ...projected, ...(operation ? { refreshRequired: true } : {}) }, {
    "cache-control": "private, no-store, max-age=0", "pragma": "no-cache",
    "vary": "Origin, Authorization, X-Player-Session-Token, X-Econovaria-Device-Id",
  });
}

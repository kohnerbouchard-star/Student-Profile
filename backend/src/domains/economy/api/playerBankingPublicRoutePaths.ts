import { readPlayerApiRouteSegments } from "../../players/api/playerApiRouteSegments.ts";

export type PlayerBankingPublicRoute = { readonly kind: "banking" };

export function readPlayerBankingPublicRoutePath(pathname: string): PlayerBankingPublicRoute | null {
  const segments = readPlayerApiRouteSegments(pathname);
  if (
    !segments ||
    segments.length !== 3 ||
    segments[0] !== "players" ||
    segments[1] !== "me" ||
    segments[2] !== "ledger"
  ) {
    return null;
  }
  return { kind: "banking" };
}

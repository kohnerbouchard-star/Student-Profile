import { readPlayerApiRouteSegments } from "../../players/api/playerApiRouteSegments.ts";

export interface PlayerContractPublicListRoute {
  readonly kind: "contracts";
}

export function readPlayerContractPublicListRoutePath(
  pathname: string,
): PlayerContractPublicListRoute | null {
  const segments = readPlayerApiRouteSegments(pathname);
  if (!segments) return null;
  return segments.length === 3 &&
      segments[0] === "players" &&
      segments[1] === "me" &&
      segments[2] === "contracts"
    ? { kind: "contracts" }
    : null;
}

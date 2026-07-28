import { readPlayerApiRouteSegments } from "../../players/api/playerApiRouteSegments.ts";

const PUBLIC_CONTRACT_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export type PlayerContractPublicSubmitRoute =
  | {
      readonly kind: "submit";
      readonly contractKey: string;
    }
  | {
      readonly kind: "malformed";
    };

export function readPlayerContractPublicSubmitRoutePath(
  pathname: string,
): PlayerContractPublicSubmitRoute | null {
  const routeSegments = readPlayerApiRouteSegments(pathname);

  if (
    !routeSegments ||
    routeSegments[0] !== "players" ||
    routeSegments[1] !== "me" ||
    routeSegments[2] !== "contracts"
  ) {
    return null;
  }

  if (routeSegments.length === 5 && routeSegments[4] === "accept") {
    return null;
  }
  if (routeSegments.length !== 5 || routeSegments[4] !== "submit") {
    return routeSegments.length > 3 ? { kind: "malformed" } : null;
  }

  let contractKey = "";
  try {
    contractKey = decodeURIComponent(routeSegments[3] ?? "").trim();
  } catch {
    return { kind: "malformed" };
  }

  return PUBLIC_CONTRACT_KEY_PATTERN.test(contractKey)
    ? { kind: "submit", contractKey }
    : { kind: "malformed" };
}

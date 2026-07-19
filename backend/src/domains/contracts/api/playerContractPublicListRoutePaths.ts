export interface PlayerContractPublicListRoute {
  readonly kind: "contracts";
}

export function readPlayerContractPublicListRoutePath(
  pathname: string,
): PlayerContractPublicListRoute | null {
  const segments = readExactRouteSegments(pathname.split("/").filter(Boolean));
  if (!segments) return null;
  return segments.length === 3 &&
      segments[0] === "players" &&
      segments[1] === "me" &&
      segments[2] === "contracts"
    ? { kind: "contracts" }
    : null;
}

function readExactRouteSegments(
  segments: readonly string[],
): readonly string[] | null {
  if (segments[0] === "players") return segments;
  if (
    segments[0] === "functions" &&
    segments[1] === "v1" &&
    segments[2] === "classroom-api"
  ) {
    return segments.slice(3);
  }
  return null;
}

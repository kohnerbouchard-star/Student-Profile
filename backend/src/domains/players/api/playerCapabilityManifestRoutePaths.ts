import type {
  PlayerCapabilityManifestRoute,
} from "../contracts/playerCapabilityManifestContracts.ts";

export function readPlayerCapabilityManifestRoutePath(
  pathname: string,
): PlayerCapabilityManifestRoute | null {
  const segments = pathname.split("/").filter(Boolean);
  const routeSegments = readExactRouteSegments(segments);

  if (
    !routeSegments ||
    routeSegments[0] !== "players" ||
    routeSegments[1] !== "me" ||
    routeSegments[2] !== "capabilities"
  ) {
    return null;
  }

  return routeSegments.length === 3
    ? { kind: "manifest" }
    : { kind: "malformed" };
}

function readExactRouteSegments(
  segments: readonly string[],
): readonly string[] | null {
  if (segments[0] === "players") return segments;

  if (
    segments[0] === "classroom-api" &&
    segments[1] === "players"
  ) {
    return segments.slice(1);
  }

  if (
    segments[0] === "functions" &&
    segments[1] === "v1" &&
    segments[2] === "classroom-api"
  ) {
    return segments.slice(3);
  }

  return null;
}

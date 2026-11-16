const PLAYER_EDGE_SERVICES = new Set(["player-api", "classroom-api"]);

export function readPlayerApiRouteSegments(
  pathname: string,
): readonly string[] | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] === "players") return segments;

  if (
    PLAYER_EDGE_SERVICES.has(segments[0] || "") &&
    segments[1] === "players"
  ) {
    return segments.slice(1);
  }

  if (
    segments[0] === "functions" &&
    segments[1] === "v1" &&
    PLAYER_EDGE_SERVICES.has(segments[2] || "") &&
    segments[3] === "players"
  ) {
    return segments.slice(3);
  }

  return null;
}

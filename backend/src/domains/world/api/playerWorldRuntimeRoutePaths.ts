export type PlayerWorldRuntimeOperation =
  | "context"
  | "arrivalClass"
  | "travelQuote"
  | "travelExecute"
  | "travelComplete"
  | "residencyRequest";

export interface ParsedPlayerWorldRuntimeRoute {
  readonly operation: PlayerWorldRuntimeOperation;
  readonly journeyId: string | null;
}

export function parsePlayerWorldRuntimeRoute(
  pathname: string,
): ParsedPlayerWorldRuntimeRoute | null {
  const normalized = normalize(pathname);
  const routePath = readPlayerRoutePath(normalized);
  if (!routePath) return null;

  if (routePath === "/players/me/world-runtime") {
    return Object.freeze({ operation: "context", journeyId: null });
  }
  if (routePath === "/players/me/arrival-class") {
    return Object.freeze({ operation: "arrivalClass", journeyId: null });
  }
  if (routePath === "/players/me/travel/quotes") {
    return Object.freeze({ operation: "travelQuote", journeyId: null });
  }
  if (routePath === "/players/me/travel") {
    return Object.freeze({ operation: "travelExecute", journeyId: null });
  }
  if (routePath === "/players/me/residency") {
    return Object.freeze({ operation: "residencyRequest", journeyId: null });
  }
  const completion = routePath.match(
    /^\/players\/me\/travel\/(trj_[0-9a-f]{32})\/complete$/,
  );
  if (completion) {
    return Object.freeze({
      operation: "travelComplete",
      journeyId: completion[1] ?? null,
    });
  }
  return null;
}

export function playerWorldRuntimeAllowedMethods(
  operation: PlayerWorldRuntimeOperation,
): readonly string[] {
  return operation === "context" ? Object.freeze(["GET"]) : Object.freeze(["POST"]);
}

function readPlayerRoutePath(pathname: string): string | null {
  if (pathname.startsWith("/players/")) return pathname;
  const marker = "/classroom-api/";
  const markerIndex = pathname.lastIndexOf(marker);
  if (markerIndex < 0) return null;
  const suffix = pathname.slice(markerIndex + marker.length);
  return suffix ? `/${suffix}` : null;
}

function normalize(pathname: string): string {
  const trimmed = pathname.trim().replace(/\/{2,}/g, "/");
  if (trimmed.length > 1 && trimmed.endsWith("/")) return trimmed.slice(0, -1);
  return trimmed || "/";
}

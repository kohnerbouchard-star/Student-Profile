import { readPlayerApiRouteSegments } from "../../players/api/playerApiRouteSegments.ts";

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
  const segments = readPlayerApiRouteSegments(normalize(pathname));
  if (!segments || segments[0] !== "players" || segments[1] !== "me") {
    return null;
  }

  const routePath = `/${segments.join("/")}`;
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

function normalize(pathname: string): string {
  const trimmed = pathname.trim().replace(/\/{2,}/g, "/");
  if (trimmed.length > 1 && trimmed.endsWith("/")) return trimmed.slice(0, -1);
  return trimmed || "/";
}

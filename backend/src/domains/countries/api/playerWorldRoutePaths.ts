import { readPlayerApiRouteSegments } from "../../players/api/playerApiRouteSegments.ts";
import type { PlayerWorldRoute } from "../contracts/playerWorldReadContracts.ts";

export function readPlayerWorldRoutePath(pathname: string): PlayerWorldRoute | null {
  const routeSegments = readPlayerApiRouteSegments(pathname);

  if (!routeSegments) return null;

  if (matches(routeSegments, ["players", "me", "world", "countries"])) {
    return { kind: "countries" };
  }

  if (matches(routeSegments, ["players", "me", "world", "news"])) {
    return { kind: "news" };
  }

  if (
    routeSegments.length === 5 &&
    matches(routeSegments.slice(0, 4), ["players", "me", "world", "countries"])
  ) {
    return {
      kind: "country",
      countryIdentifier: safeDecode(routeSegments[4] ?? ""),
    };
  }

  return null;
}

function matches(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length &&
    expected.every((segment, index) => actual[index] === segment);
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

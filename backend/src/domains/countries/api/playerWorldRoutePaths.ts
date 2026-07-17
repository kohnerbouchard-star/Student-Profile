import type { PlayerWorldRoute } from "../contracts/playerWorldReadContracts.ts";

export function readPlayerWorldRoutePath(
  pathname: string,
): PlayerWorldRoute | null {
  const segments = pathname.split("/").filter(Boolean);
  const routeSegments = readRouteSegments(segments);

  if (!routeSegments) {
    return null;
  }

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

function readRouteSegments(
  segments: readonly string[],
): readonly string[] | null {
  if (segments[0] === "players") {
    return segments;
  }

  const classroomApiIndex = segments.lastIndexOf("classroom-api");

  if (classroomApiIndex < 0) {
    return null;
  }

  return segments.slice(classroomApiIndex + 1);
}

function matches(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
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

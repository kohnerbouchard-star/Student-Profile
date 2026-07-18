const PUBLIC_CONTRACT_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export type PlayerContractAcceptanceRoute =
  | {
    readonly kind: "accept";
    readonly contractKey: string;
  }
  | {
    readonly kind: "malformed";
  };

export function readPlayerContractAcceptanceRoutePath(
  pathname: string,
): PlayerContractAcceptanceRoute | null {
  const routeSegments = readExactRouteSegments(
    pathname.split("/").filter(Boolean),
  );

  if (
    !routeSegments ||
    routeSegments[0] !== "players" ||
    routeSegments[1] !== "me" ||
    routeSegments[2] !== "contracts"
  ) {
    return null;
  }

  if (routeSegments.length !== 5 || routeSegments[4] !== "accept") {
    return routeSegments.length > 3 ? { kind: "malformed" } : null;
  }

  let contractKey = "";
  try {
    contractKey = decodeURIComponent(routeSegments[3] ?? "").trim();
  } catch {
    return { kind: "malformed" };
  }

  return PUBLIC_CONTRACT_KEY_PATTERN.test(contractKey)
    ? { kind: "accept", contractKey }
    : { kind: "malformed" };
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

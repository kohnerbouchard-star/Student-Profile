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

  if (routeSegments.length < 5) return null;

  const action = routeSegments[4];
  if (action === "accept") return null;

  if (routeSegments.length !== 5) {
    return action === "submit" || routeSegments.at(-1) === "submit"
      ? { kind: "malformed" }
      : null;
  }
  if (action !== "submit") return { kind: "malformed" };

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

function readExactRouteSegments(
  segments: readonly string[],
): readonly string[] | null {
  if (segments[0] === "players") return segments;
  if (segments[0] === "classroom-api") return segments.slice(1);
  if (
    segments[0] === "functions" &&
    segments[1] === "v1" &&
    segments[2] === "classroom-api"
  ) {
    return segments.slice(3);
  }
  return null;
}

import { readPlayerApiRouteSegments } from "../../players/api/playerApiRouteSegments.ts";
import { isUuid } from "../../../platform/supabase/uuid.ts";

export type PlayerContractRoute =
  | {
    readonly kind: "contracts";
  }
  | {
    readonly kind: "submit";
    readonly contractId: string;
  };

export function readPlayerContractRoutePath(
  pathname: string,
): PlayerContractRoute | null {
  const segments = readPlayerApiRouteSegments(pathname);

  if (
    !segments ||
    segments[0] !== "players" ||
    segments[1] !== "me" ||
    segments[2] !== "contracts"
  ) {
    return null;
  }

  if (segments.length === 3) {
    return {
      kind: "contracts",
    };
  }

  const contractId = segments[3];
  if (
    contractId &&
    isUuid(contractId) &&
    segments[4] === "submit" &&
    segments.length === 5
  ) {
    return {
      kind: "submit",
      contractId,
    };
  }

  return null;
}

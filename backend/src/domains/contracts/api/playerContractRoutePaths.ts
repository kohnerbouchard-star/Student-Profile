import { isUuid } from "../../../platform/supabase/uuid.ts";

export type PlayerContractRoute =
  | {
    readonly kind: "contracts";
  }
  | {
    readonly kind: "accept";
    readonly contractId: string;
  }
  | {
    readonly kind: "submit";
    readonly contractId: string;
  };

export function readPlayerContractRoutePath(
  pathname: string,
): PlayerContractRoute | null {
  const segments = pathname.split("/").filter(Boolean);
  const playersIndex = segments.lastIndexOf("players");

  if (playersIndex < 0) {
    return null;
  }

  const meSegment = segments[playersIndex + 1];
  const contractsSegment = segments[playersIndex + 2];
  const contractId = segments[playersIndex + 3];
  const actionSegment = segments[playersIndex + 4];

  if (meSegment !== "me" || contractsSegment !== "contracts") {
    return null;
  }

  if (playersIndex + 3 === segments.length) {
    return {
      kind: "contracts",
    };
  }

  if (
    contractId &&
    isUuid(contractId) &&
    (actionSegment === "accept" || actionSegment === "submit") &&
    playersIndex + 5 === segments.length
  ) {
    return {
      kind: actionSegment,
      contractId,
    };
  }

  return null;
}

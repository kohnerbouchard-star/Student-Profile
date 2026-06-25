import { isUuid } from "../../../platform/supabase/uuid.ts";

export type StaffContractRoute =
  | {
    readonly kind: "contracts";
    readonly gameSessionId: string;
  }
  | {
    readonly kind: "publish";
    readonly gameSessionId: string;
    readonly contractId: string;
  };

export function readStaffContractRoutePath(
  pathname: string,
): StaffContractRoute | null {
  const segments = pathname.split("/").filter(Boolean);
  const staffIndex = segments.lastIndexOf("staff");

  if (staffIndex < 0) {
    return null;
  }

  const gameSessionsSegment = segments[staffIndex + 1];
  const gameSessionId = segments[staffIndex + 2];
  const contractsSegment = segments[staffIndex + 3];
  const contractId = segments[staffIndex + 4];
  const publishSegment = segments[staffIndex + 5];

  if (
    gameSessionsSegment !== "game-sessions" ||
    !gameSessionId ||
    !isUuid(gameSessionId) ||
    contractsSegment !== "contracts"
  ) {
    return null;
  }

  if (staffIndex + 4 === segments.length) {
    return {
      kind: "contracts",
      gameSessionId,
    };
  }

  if (
    contractId &&
    isUuid(contractId) &&
    publishSegment === "publish" &&
    staffIndex + 6 === segments.length
  ) {
    return {
      kind: "publish",
      gameSessionId,
      contractId,
    };
  }

  return null;
}

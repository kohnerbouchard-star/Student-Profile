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
  }
  | {
    readonly kind: "progress";
    readonly gameSessionId: string;
    readonly contractId: string;
  }
  | {
    readonly kind: "review";
    readonly gameSessionId: string;
    readonly contractId: string;
    readonly progressId: string;
  }
  | {
    readonly kind: "issueRewards";
    readonly gameSessionId: string;
    readonly contractId: string;
    readonly progressId: string;
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
  const actionSegment = segments[staffIndex + 5];
  const progressId = segments[staffIndex + 6];
  const rewardSegment = segments[staffIndex + 7];
  const issueSegment = segments[staffIndex + 8];

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
    actionSegment === "publish" &&
    staffIndex + 6 === segments.length
  ) {
    return {
      kind: "publish",
      gameSessionId,
      contractId,
    };
  }

  if (
    contractId &&
    isUuid(contractId) &&
    actionSegment === "progress" &&
    staffIndex + 6 === segments.length
  ) {
    return {
      kind: "progress",
      gameSessionId,
      contractId,
    };
  }

  if (
    contractId &&
    isUuid(contractId) &&
    actionSegment === "progress" &&
    progressId &&
    isUuid(progressId) &&
    rewardSegment === "review" &&
    staffIndex + 8 === segments.length
  ) {
    return {
      kind: "review",
      gameSessionId,
      contractId,
      progressId,
    };
  }

  if (
    contractId &&
    isUuid(contractId) &&
    actionSegment === "progress" &&
    progressId &&
    isUuid(progressId) &&
    rewardSegment === "rewards" &&
    issueSegment === "issue" &&
    staffIndex + 9 === segments.length
  ) {
    return {
      kind: "issueRewards",
      gameSessionId,
      contractId,
      progressId,
    };
  }

  return null;
}

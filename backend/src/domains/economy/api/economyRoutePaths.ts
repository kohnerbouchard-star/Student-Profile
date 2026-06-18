import { isUuid } from "../../../platform/supabase/uuid.ts";

export interface InitialBalanceSeedRoute {
  readonly gameSessionId: string;
}

export interface StaffLedgerAdjustmentRoute {
  readonly gameSessionId: string;
  readonly playerId: string;
}

export interface StaffPlayerLedgerHistoryRoute {
  readonly gameSessionId: string;
  readonly playerId: string;
}

export function readInitialBalanceSeedRoutePath(
  pathname: string,
): InitialBalanceSeedRoute | null {
  const segments = pathname.split("/").filter(Boolean);
  const gamesIndex = segments.lastIndexOf("games");

  if (gamesIndex < 0) {
    return null;
  }

  const gameSessionId = segments[gamesIndex + 1];
  const playersSegment = segments[gamesIndex + 2];
  const seedBalancesSegment = segments[gamesIndex + 3];

  if (
    gameSessionId &&
    isUuid(gameSessionId) &&
    playersSegment === "players" &&
    seedBalancesSegment === "seed-balances" &&
    gamesIndex + 4 === segments.length
  ) {
    return { gameSessionId };
  }

  return null;
}

export function readStaffPlayerLedgerHistoryRoutePath(
  pathname: string,
): StaffPlayerLedgerHistoryRoute | null {
  const segments = pathname.split("/").filter(Boolean);
  const gamesIndex = segments.lastIndexOf("games");

  if (gamesIndex < 0) {
    return null;
  }

  const gameSessionId = segments[gamesIndex + 1];
  const playersSegment = segments[gamesIndex + 2];
  const playerId = segments[gamesIndex + 3];
  const ledgerSegment = segments[gamesIndex + 4];

  if (
    gameSessionId &&
    isUuid(gameSessionId) &&
    playersSegment === "players" &&
    playerId &&
    isUuid(playerId) &&
    ledgerSegment === "ledger" &&
    gamesIndex + 5 === segments.length
  ) {
    return { gameSessionId, playerId };
  }

  return null;
}

export function readStaffLedgerAdjustmentRoutePath(
  pathname: string,
): StaffLedgerAdjustmentRoute | null {
  const segments = pathname.split("/").filter(Boolean);
  const gamesIndex = segments.lastIndexOf("games");

  if (gamesIndex < 0) {
    return null;
  }

  const gameSessionId = segments[gamesIndex + 1];
  const playersSegment = segments[gamesIndex + 2];
  const playerId = segments[gamesIndex + 3];
  const ledgerAdjustmentsSegment = segments[gamesIndex + 4];

  if (
    gameSessionId &&
    isUuid(gameSessionId) &&
    playersSegment === "players" &&
    playerId &&
    isUuid(playerId) &&
    ledgerAdjustmentsSegment === "ledger-adjustments" &&
    gamesIndex + 5 === segments.length
  ) {
    return {
      gameSessionId,
      playerId,
    };
  }

  return null;
}

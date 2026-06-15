import type { AccessIdentity, PlayerIdentity, UUID } from "./types";

export const V1_PERMISSIONS = {
  manageGame: "manage_game",
  managePlayers: "manage_players",
  readOwnPlayerProfile: "read_own_player_profile",
  writeLedgerEntry: "write_ledger_entry",
  readLedger: "read_ledger",
  writeAuditLog: "write_audit_log",
} as const;

export type V1Permission =
  (typeof V1_PERMISSIONS)[keyof typeof V1_PERMISSIONS];

export interface PermissionContext {
  readonly gameSessionId?: UUID;
  readonly playerId?: UUID;
}

export function canManageGame(identity: AccessIdentity): boolean {
  return identity.kind === "staff" || identity.kind === "system";
}

export function canManagePlayers(identity: AccessIdentity): boolean {
  return identity.kind === "staff" || identity.kind === "system";
}

export function canReadOwnPlayerProfile(
  identity: AccessIdentity,
  context: PermissionContext,
): boolean {
  if (identity.kind === "staff" || identity.kind === "system") {
    return true;
  }

  return isOwnPlayerContext(identity, context);
}

export function canWriteLedgerEntry(identity: AccessIdentity): boolean {
  return identity.kind === "staff" || identity.kind === "system";
}

export function canReadLedger(
  identity: AccessIdentity,
  context: PermissionContext = {},
): boolean {
  if (identity.kind === "staff" || identity.kind === "system") {
    return true;
  }

  return isOwnPlayerContext(identity, context);
}

export function canWriteAuditLog(
  identity: AccessIdentity,
  context: PermissionContext = {},
): boolean {
  if (identity.kind === "staff" || identity.kind === "system") {
    return true;
  }

  return isSameGame(identity, context);
}

export function canPerformPermission(
  identity: AccessIdentity,
  permission: V1Permission,
  context: PermissionContext = {},
): boolean {
  switch (permission) {
    case V1_PERMISSIONS.manageGame:
      return canManageGame(identity);
    case V1_PERMISSIONS.managePlayers:
      return canManagePlayers(identity);
    case V1_PERMISSIONS.readOwnPlayerProfile:
      return canReadOwnPlayerProfile(identity, context);
    case V1_PERMISSIONS.writeLedgerEntry:
      return canWriteLedgerEntry(identity);
    case V1_PERMISSIONS.readLedger:
      return canReadLedger(identity, context);
    case V1_PERMISSIONS.writeAuditLog:
      return canWriteAuditLog(identity, context);
  }

  return false;
}

function isOwnPlayerContext(
  identity: PlayerIdentity,
  context: PermissionContext,
): boolean {
  return isSameGame(identity, context) && context.playerId === identity.playerId;
}

function isSameGame(identity: PlayerIdentity, context: PermissionContext): boolean {
  return context.gameSessionId === identity.gameSessionId;
}

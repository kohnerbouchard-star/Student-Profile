import type { PlayerCredentialMaterial } from "../../../security/playerCredentialHashing.ts";

export interface RosterImportCommand {
  readonly gameSessionId: string;
  readonly staffUserId: string;
  readonly studentNames: readonly string[];
  readonly identity: {
    readonly idempotencyKey: string;
    readonly requestId: string;
  };
}
export interface RosterImportStudent {
  readonly row: number;
  readonly displayName: string;
  readonly playerIdentifier: string;
}
export interface RosterImportReceipt {
  readonly status: number;
  readonly replayed: boolean;
  readonly createdCount: number;
  readonly students: readonly RosterImportStudent[];
}
export interface RosterImportCredential extends PlayerCredentialMaterial {
  readonly playerIdentifier: string;
}
export interface PlayerRosterImportRepository {
  readReplay(command: RosterImportCommand): Promise<RosterImportReceipt | null>;
  create(
    command: RosterImportCommand,
    credentials: readonly RosterImportCredential[],
  ): Promise<RosterImportReceipt>;
}

export interface RosterImportStaffContext {
  readonly gameSessionId: string;
  readonly actor: { readonly kind: "staff"; readonly staffUserId: string };
  readonly role: "game_admin";
  readonly assuranceLevel: "aal1" | "aal2" | "unknown";
  readonly permissions: readonly string[];
  readonly requestId: string;
}

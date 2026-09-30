export interface PlayerRosterReadRecord {
  readonly id: string;
  readonly displayName: string;
  readonly rosterLabel: string | null;
  readonly playerIdentifier: string | null;
  readonly status: string;
  readonly hasActiveAccessCode: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PlayerRosterReadRepository {
  readRoster(gameSessionId: string): Promise<readonly PlayerRosterReadRecord[]>;
}

export class PlayerRosterReadPersistenceError extends Error {
  constructor() {
    super("Player roster could not be loaded.");
    this.name = "PlayerRosterReadPersistenceError";
  }
}

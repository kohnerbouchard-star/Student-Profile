import type { GameSessionsStaffApplicationContext } from "./gameSessionsStaffApplicationContext.ts";

export interface GameSessionMutationIdentity {
  readonly idempotencyKey: string;
  readonly requestId: string;
}

export interface GameJoinCodeRotationCommand {
  readonly applicationContext: GameSessionsStaffApplicationContext;
  readonly requestPayload: Readonly<Record<string, unknown>>;
  readonly mutation: GameSessionMutationIdentity;
}

export interface GameSettingsMutationCommand {
  readonly applicationContext: GameSessionsStaffApplicationContext;
  readonly gameSettingsPatch: Readonly<Record<string, unknown>>;
  readonly difficultyPolicyPatch: Readonly<Record<string, unknown>>;
  readonly requestPayload: Readonly<Record<string, unknown>>;
  readonly mutation: GameSessionMutationIdentity;
}

export interface GameSessionMutationPersistenceResult {
  readonly status: number;
  readonly body: Record<string, unknown>;
  readonly replayed: boolean;
}

export interface GameSessionMutationRepository {
  rotateGameJoinCode(
    command: GameJoinCodeRotationCommand,
  ): Promise<GameSessionMutationPersistenceResult>;
  updateGameSettings(
    command: GameSettingsMutationCommand,
  ): Promise<GameSessionMutationPersistenceResult>;
}

import type { PlayerStoryContext } from "./playerStoryContext.ts";

export interface PlayerStoryContextRepository {
  listPlayerStoryContexts(
    gameSessionId: string,
  ): Promise<readonly PlayerStoryContext[]>;
}

export class PlayerStoryContextRepositoryError extends Error {
  readonly code: string;
  readonly tableName: string;
  readonly operation: string;

  constructor(
    code: string,
    message: string,
    tableName: string,
    operation: string,
  ) {
    super(message);
    this.name = "PlayerStoryContextRepositoryError";
    this.code = code;
    this.tableName = tableName;
    this.operation = operation;
  }
}

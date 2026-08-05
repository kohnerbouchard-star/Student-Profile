export interface GameJoinCodeReadScope {
  readonly gameSessionId: string;
  readonly staffUserId: string;
}

export interface ReadGameJoinCodeInput extends GameJoinCodeReadScope {
  readonly gameSession: {
    readonly id: string;
    readonly name: string;
    readonly status: string;
  };
}

export interface GameJoinCodeReadRecord {
  readonly gameSessionId: string;
  readonly ownerStaffUserId: string;
  readonly gameJoinCode: string | null;
  readonly joinCodeStatus: string;
  readonly updatedAt: string | null;
}

export interface GameJoinCodeReadRepository {
  readOwnedGameJoinCode(
    input: GameJoinCodeReadScope,
  ): Promise<GameJoinCodeReadRecord | null>;
}

export interface ReadGameJoinCodeResult {
  readonly gameSession: {
    readonly id: string;
    readonly name: string;
    readonly status: string;
  };
  readonly joinCode: {
    readonly gameJoinCode: string;
    readonly status: "active";
    readonly updatedAt: string;
  };
}

export class GameJoinCodeReadPersistenceError extends Error {
  constructor() {
    super("Game join code persistence read failed.");
    this.name = "GameJoinCodeReadPersistenceError";
  }
}

export class GameJoinCodeReadError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "GameJoinCodeReadError";
  }
}

export async function readGameJoinCode(
  input: ReadGameJoinCodeInput,
  repository: GameJoinCodeReadRepository,
): Promise<ReadGameJoinCodeResult> {
  if (input.gameSession.id !== input.gameSessionId) {
    throw readFailure();
  }

  let record: GameJoinCodeReadRecord | null;
  try {
    record = await repository.readOwnedGameJoinCode({
      gameSessionId: input.gameSessionId,
      staffUserId: input.staffUserId,
    });
  } catch {
    throw readFailure();
  }

  if (
    record && (
      record.gameSessionId !== input.gameSessionId ||
      record.ownerStaffUserId !== input.staffUserId
    )
  ) {
    throw readFailure();
  }

  if (
    !record?.gameJoinCode ||
    record.joinCodeStatus !== "active" ||
    !record.updatedAt
  ) {
    throw new GameJoinCodeReadError(
      "join_code_not_available",
      "This legacy game does not have a persisted readable code yet. Rotate it once to create one.",
      409,
    );
  }

  return {
    gameSession: {
      id: input.gameSession.id,
      name: input.gameSession.name,
      status: input.gameSession.status,
    },
    joinCode: {
      gameJoinCode: record.gameJoinCode,
      status: "active",
      updatedAt: record.updatedAt,
    },
  };
}

function readFailure(): GameJoinCodeReadError {
  return new GameJoinCodeReadError(
    "join_code_read_failed",
    "Game join code could not be loaded.",
    500,
  );
}

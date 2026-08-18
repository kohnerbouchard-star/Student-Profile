import {
  GameJoinCodeReadError,
  readGameJoinCode,
  type ReadGameJoinCodeInput,
  type ReadGameJoinCodeResult,
} from "../../../src/domains/game-sessions/application/readGameJoinCode.ts";
import {
  createSupabaseGameJoinCodeReadRepository,
  type GameJoinCodeSupabaseClient,
} from "../../../src/domains/game-sessions/infrastructure/supabaseGameJoinCodeReadRepository.ts";

interface GameJoinCodeReadOperationResult {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

interface GameJoinCodeReadOperationDependencies {
  readonly read?: (
    input: ReadGameJoinCodeInput,
  ) => Promise<ReadGameJoinCodeResult>;
}

export async function handleGameJoinCodeReadOperation(
  service: GameJoinCodeSupabaseClient,
  input: ReadGameJoinCodeInput,
  dependencies: GameJoinCodeReadOperationDependencies = {},
): Promise<GameJoinCodeReadOperationResult> {
  try {
    const read = dependencies.read ?? ((scope) =>
      readGameJoinCode(
        scope,
        createSupabaseGameJoinCodeReadRepository(service),
      ));
    const result = await read(input);

    return {
      status: 200,
      body: {
        ok: true,
        gameSession: result.gameSession,
        joinCode: result.joinCode,
      },
    };
  } catch (error) {
    const safeError = error instanceof GameJoinCodeReadError
      ? error
      : new GameJoinCodeReadError(
        "join_code_read_failed",
        "Game join code could not be loaded.",
        500,
      );

    return {
      status: safeError.status,
      body: {
        ok: false,
        error: {
          code: safeError.code,
          message: safeError.message,
          retryable: safeError.retryable,
        },
      },
    };
  }
}

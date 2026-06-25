import {
  DemoStorylineInitializationError,
  type DemoStorylineInitializationInput,
  type DemoStorylineInitializationRepository,
  type DemoStorylineInitializationResult,
  type InitializeDemoStorylineForGameRpcArgs,
  type InitializeDemoStorylineForGameRpcRow,
} from "../contracts/demoStorylineInitializationContracts.ts";

interface SupabaseDemoStorylineInitializationQueryError {
  readonly message: string;
  readonly code?: string;
  readonly details?: string | null;
  readonly hint?: string | null;
}

interface SupabaseDemoStorylineInitializationQueryResponse<T = unknown> {
  readonly data: T | null;
  readonly error: SupabaseDemoStorylineInitializationQueryError | null;
}

interface SupabaseDemoStorylineInitializationClient {
  rpc<Data = unknown>(
    functionName: string,
    args?: unknown,
  ): PromiseLike<SupabaseDemoStorylineInitializationQueryResponse<Data>>;
}

export class SupabaseDemoStorylineInitializationRepository
  implements DemoStorylineInitializationRepository {
  constructor(
    private readonly client: SupabaseDemoStorylineInitializationClient,
  ) {}

  async initialize(
    input: DemoStorylineInitializationInput,
  ): Promise<DemoStorylineInitializationResult> {
    const args: InitializeDemoStorylineForGameRpcArgs = {
      p_game_session_id: input.gameSessionId,
      p_mode: input.mode,
    };
    const response = await this.client.rpc<
      readonly InitializeDemoStorylineForGameRpcRow[]
    >("initialize_demo_storyline_for_game", args);

    if (response.error) {
      throw mapDemoStorylineInitializationError(response.error);
    }

    const row = response.data?.[0];

    if (!row) {
      throw new DemoStorylineInitializationError(
        "demo_storyline_initialization_failed",
        "Demo storyline initialization returned no result.",
        500,
      );
    }

    return {
      gameSessionId: row.game_session_id,
      storylineKey: row.storyline_key,
      storylineEventsAvailable: Number(row.storyline_events_available),
      gameSessionStorylinesBefore: Number(row.game_session_storylines_before),
      gameSessionStorylinesInserted: Number(
        row.game_session_storylines_inserted,
      ),
      gameSessionStorylinesAfter: Number(row.game_session_storylines_after),
    };
  }
}

function mapDemoStorylineInitializationError(
  error: SupabaseDemoStorylineInitializationQueryError,
): DemoStorylineInitializationError {
  const message = error.message.toUpperCase();

  if (isSchemaNotAppliedError(error)) {
    return new DemoStorylineInitializationError(
      "storyline_schema_not_applied",
      "Storyline schema is not applied.",
      500,
    );
  }

  if (message.includes("GAME_SESSION_NOT_FOUND")) {
    return new DemoStorylineInitializationError(
      "game_session_not_found",
      "Game session could not be found.",
      404,
    );
  }

  if (message.includes("DEMO_STORYLINE_RESET_EMPTY_ONLY_CONFLICT")) {
    return new DemoStorylineInitializationError(
      "demo_storyline_already_initialized",
      "Demo storyline is already initialized for this game session.",
      409,
    );
  }

  if (message.includes("DEMO_STORYLINE_UNKNOWN_SEED_COPY_MODE")) {
    return new DemoStorylineInitializationError(
      "invalid_demo_storyline_initialization_request",
      "mode must be missing_only or reset_empty_only when provided.",
      400,
    );
  }

  return new DemoStorylineInitializationError(
    "demo_storyline_initialization_failed",
    "Demo storyline initialization could not be completed.",
    500,
  );
}

function isSchemaNotAppliedError(
  error: SupabaseDemoStorylineInitializationQueryError,
): boolean {
  const message = error.message.toLowerCase();

  return error.code === "42P01" ||
    error.code === "42703" ||
    message.includes("does not exist") ||
    message.includes("schema cache");
}

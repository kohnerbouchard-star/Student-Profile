export const DEMO_STORYLINE_INITIALIZATION_MODES = [
  "missing_only",
  "reset_empty_only",
] as const;

export type DemoStorylineInitializationMode =
  typeof DEMO_STORYLINE_INITIALIZATION_MODES[number];

export interface DemoStorylineInitializationInput {
  readonly gameSessionId: string;
  readonly mode: DemoStorylineInitializationMode;
}

export interface DemoStorylineInitializationResult {
  readonly gameSessionId: string;
  readonly storylineKey: string;
  readonly storylineEventsAvailable: number;
  readonly gameSessionStorylinesBefore: number;
  readonly gameSessionStorylinesInserted: number;
  readonly gameSessionStorylinesAfter: number;
}

export interface DemoStorylineInitializationRepository {
  initialize(
    input: DemoStorylineInitializationInput,
  ): Promise<DemoStorylineInitializationResult>;
}

export interface InitializeDemoStorylineForGameRpcArgs {
  readonly p_game_session_id: string;
  readonly p_mode: DemoStorylineInitializationMode;
}

export interface InitializeDemoStorylineForGameRpcRow {
  readonly game_session_id: string;
  readonly storyline_key: string;
  readonly storyline_events_available: number | string;
  readonly game_session_storylines_before: number | string;
  readonly game_session_storylines_inserted: number | string;
  readonly game_session_storylines_after: number | string;
}

export interface DemoStorylineInitializationSuccessBody {
  readonly ok: true;
  readonly demoStoryline: DemoStorylineInitializationResult;
}

export type DemoStorylineInitializationErrorCode =
  | "invalid_demo_storyline_initialization_request"
  | "game_session_not_found"
  | "storyline_schema_not_applied"
  | "demo_storyline_already_initialized"
  | "demo_storyline_initialization_failed";

export class DemoStorylineInitializationError extends Error {
  readonly code: DemoStorylineInitializationErrorCode;
  readonly status: number;

  constructor(
    code: DemoStorylineInitializationErrorCode,
    message: string,
    status = 500,
  ) {
    super(message);
    this.name = "DemoStorylineInitializationError";
    this.code = code;
    this.status = status;
  }
}

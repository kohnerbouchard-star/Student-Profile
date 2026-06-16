import type { GameSessionRecord, SupabaseAuthUser } from "../../../auth/types";
import type { GameSettingsRecord, JsonObject } from "../../../supabase/tableTypes";

export interface CreateGameRouteRequest {
  readonly supabaseAuthUser?: SupabaseAuthUser | null;
  readonly body?: unknown;
  readonly requestId?: string | null;
  readonly source?: string | null;
}

export type CreateGameRouteResult =
  | CreateGameRouteSuccessResult
  | CreateGameRouteErrorResult;

export interface CreateGameRouteSuccessResult {
  readonly ok: true;
  readonly status: 201;
  readonly body: CreateGameRouteSuccessBody;
}

export interface CreateGameRouteSuccessBody {
  readonly gameSession: GameSessionRecord;
  readonly gameSettings: GameSettingsRecord;
  readonly auditLogged: boolean;
}

export interface CreateGameRouteErrorResult {
  readonly ok: false;
  readonly status: number;
  readonly body: CreateGameRouteErrorBody;
}

export interface CreateGameRouteErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: Record<string, unknown>;
  };
}

export interface NormalizedCreateGameRouteBody {
  readonly name: string;
  readonly difficultyPreset?: string | null;
  readonly attendanceWindow?: JsonObject | null;
  readonly businessMarketWindow?: JsonObject | null;
  readonly stockMarketWindow?: JsonObject | null;
  readonly newsSchedule?: JsonObject | null;
}

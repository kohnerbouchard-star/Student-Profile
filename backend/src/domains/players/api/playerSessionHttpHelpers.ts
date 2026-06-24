import {
  type EdgeErrorBody,
  jsonError,
} from "../../../platform/supabase/edgeResponse.ts";
import type { EdgeSupabaseClient } from "../../../platform/supabase/edgeStaffSession.ts";

export async function resolveActivePlayerSession(
  serviceClient: EdgeSupabaseClient,
  sessionTokenHash: string,
): Promise<
  | {
      readonly ok: true;
      readonly session: {
        readonly id: string;
        readonly game_session_id: string;
        readonly player_id: string;
        readonly status: string;
        readonly expires_at: string;
        readonly revoked_at: string | null;
      };
      readonly gameSession: {
        readonly id: string;
        readonly name: string;
        readonly status: string;
      };
      readonly player: {
        readonly id: string;
        readonly display_name: string;
        readonly roster_label: string | null;
        readonly status: string;
      };
    }
  | {
      readonly ok: false;
      readonly status: number;
      readonly error: EdgeErrorBody["error"];
    }
> {
  const sessionResponse = await serviceClient
    .from("player_sessions")
    .select("id,game_session_id,player_id,status,expires_at,revoked_at")
    .eq("session_token_hash", sessionTokenHash)
    .maybeSingle();

  if (sessionResponse.error) {
    return {
      ok: false,
      status: 500,
      error: {
        code: "player_session_lookup_failed",
        message: "Player session lookup failed.",
        retryable: false,
      },
    };
  }

  const session = sessionResponse.data as {
    readonly id: string;
    readonly game_session_id: string;
    readonly player_id: string;
    readonly status: string;
    readonly expires_at: string;
    readonly revoked_at: string | null;
  } | null;

  if (
    !session?.id ||
    session.status !== "active" ||
    session.revoked_at !== null ||
    Date.parse(session.expires_at) <= Date.now()
  ) {
    return {
      ok: false,
      status: 401,
      error: {
        code: "invalid_player_session",
        message: "Player session is invalid or expired.",
        retryable: false,
      },
    };
  }

  const gameResponse = await serviceClient
    .from("game_sessions")
    .select("id,name,status")
    .eq("id", session.game_session_id)
    .eq("status", "active")
    .maybeSingle();

  if (gameResponse.error) {
    return {
      ok: false,
      status: 500,
      error: {
        code: "player_session_lookup_failed",
        message: "Player session lookup failed.",
        retryable: false,
      },
    };
  }

  const gameSession = gameResponse.data as {
    readonly id: string;
    readonly name: string;
    readonly status: string;
  } | null;

  if (!gameSession?.id) {
    return {
      ok: false,
      status: 401,
      error: {
        code: "invalid_player_session",
        message: "Player session is invalid or expired.",
        retryable: false,
      },
    };
  }

  const playerResponse = await serviceClient
    .from("players")
    .select("id,display_name,roster_label,status")
    .eq("game_session_id", session.game_session_id)
    .eq("id", session.player_id)
    .maybeSingle();

  if (playerResponse.error) {
    return {
      ok: false,
      status: 500,
      error: {
        code: "player_session_lookup_failed",
        message: "Player session lookup failed.",
        retryable: false,
      },
    };
  }

  const player = playerResponse.data as {
    readonly id: string;
    readonly display_name: string;
    readonly roster_label: string | null;
    readonly status: string;
  } | null;

  if (!player?.id || player.status !== "active") {
    return {
      ok: false,
      status: 401,
      error: {
        code: "invalid_player_session",
        message: "Player session is invalid or expired.",
        retryable: false,
      },
    };
  }

  return {
    ok: true,
    session,
    gameSession,
    player,
  };
}

export function readPlayerSessionTokenFromRequest(request: Request): string | null {
  return readPlayerSessionTokenHeader(request.headers.get("x-player-session-token"));
}

export function readPlayerSessionTokenHeader(headerValue: string | null): string | null {
  const token = headerValue?.trim() ?? "";
  return token ? token : null;
}

export function invalidPlayerSessionResponse(): Response {
  return jsonError(401, {
    code: "invalid_player_session",
    message: "Player session is invalid or expired.",
    retryable: false,
  });
}

import { EdgeActivationError } from "../../../platform/supabase/edgeResponse.ts";

const PLAYER_IDENTITY_QUERY_FIELDS = [
  "playerId",
  "player_id",
  "playerSessionId",
  "player_session_id",
] as const;

const PLAYER_IDENTITY_HEADERS = [
  "x-player-id",
  "x-player-session-id",
  "x-player-session",
] as const;

const GAME_SESSION_HEADERS = [
  "x-econovaria-game-session-id",
  "x-econovaria-game-id",
] as const;

export function rejectClientSuppliedPlayerIdentity(request: Request): void {
  const url = new URL(request.url);

  for (const fieldName of PLAYER_IDENTITY_QUERY_FIELDS) {
    if (url.searchParams.has(fieldName)) {
      throw invalidPlayerRequest(
        "Player identity must be derived from x-player-session-token.",
      );
    }
  }

  for (const headerName of PLAYER_IDENTITY_HEADERS) {
    if (request.headers.has(headerName)) {
      throw invalidPlayerRequest(
        "Player identity must be derived from x-player-session-token.",
      );
    }
  }
}

export function readRequestedGameSessionId(request: Request): string | null {
  const url = new URL(request.url);
  const values = url.searchParams.getAll("gameSessionId");

  for (const headerName of GAME_SESSION_HEADERS) {
    const value = request.headers.get(headerName);

    if (value !== null) {
      values.push(value);
    }
  }

  if (values.length === 0) {
    return null;
  }

  const normalizedValues = values.map((value) => value.trim());

  if (
    normalizedValues.some((value) => !value) ||
    new Set(normalizedValues).size !== 1
  ) {
    throw invalidPlayerRequest(
      "At most one consistent game session scope may be supplied.",
    );
  }

  return normalizedValues[0];
}

export function requireMatchingPlayerGameSession(
  requestedGameSessionId: string | null,
  authenticatedGameSessionId: string,
): void {
  if (
    requestedGameSessionId !== null &&
    requestedGameSessionId !== authenticatedGameSessionId
  ) {
    throw new EdgeActivationError(
      "invalid_player_session_scope",
      "Requested game session does not match the authenticated player session.",
      401,
      false,
    );
  }
}

export function rejectClientSuppliedBodyIdentity(
  body: Record<string, unknown>,
): void {
  for (
    const fieldName of [
      ...PLAYER_IDENTITY_QUERY_FIELDS,
      "gameSessionId",
      "game_session_id",
    ]
  ) {
    if (fieldName in body) {
      throw invalidPlayerRequest(
        "Player and game identity must be derived from x-player-session-token.",
      );
    }
  }
}

function invalidPlayerRequest(message: string): EdgeActivationError {
  return new EdgeActivationError(
    "invalid_player_request",
    message,
    400,
    false,
  );
}

import { EdgeActivationError } from "../../../platform/supabase/edgeResponse.ts";
import { isRecord, parseRequiredText } from "../../../platform/supabase/edgeParsing.ts";

interface PlayerLoginRequestBody {
  readonly gameJoinCode: string;
  readonly playerIdentifier: string;
  readonly accessCode: string;
}

export async function readPlayerLoginRequestBody(
  request: Request,
): Promise<PlayerLoginRequestBody> {
  let value: unknown;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 4_096) {
      throw new EdgeActivationError(
        "request_body_too_large",
        "Player login requests are limited to 4096 bytes.",
        413,
      );
    }
    value = JSON.parse(raw);
  } catch (error) {
    if (error instanceof EdgeActivationError) throw error;
    throw new EdgeActivationError(
      "invalid_request_body",
      "Request body must be a JSON object.",
      400,
    );
  }

  if (!isRecord(value)) {
    throw new EdgeActivationError(
      "invalid_request_body",
      "Request body must be a JSON object.",
      400,
    );
  }

  const allowedKeys = new Set([
    "gameJoinCode",
    "gameCode",
    "sessionCode",
    "playerIdentifier",
    "playerId",
    "rfidCardId",
    "rfidId",
    "cardId",
    "externalPlayerId",
    "accessCode",
    "studentCode",
    "playerAccessCode",
    "pin",
  ]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    throw new EdgeActivationError(
      "unknown_request_field",
      "Request body contains an unsupported field.",
      400,
    );
  }

  const gameJoinCode = parseRequiredText(
    value.gameJoinCode ?? value.gameCode ?? value.sessionCode,
    "game_join_code_required",
    "gameJoinCode is required.",
  );
  const playerIdentifier = parseRequiredText(
    value.playerIdentifier ?? value.playerId ?? value.rfidCardId ??
      value.rfidId ?? value.cardId ?? value.externalPlayerId,
    "player_identifier_required",
    "playerIdentifier is required.",
  );
  const accessCode = parseRequiredText(
    value.accessCode ?? value.studentCode ?? value.playerAccessCode ?? value.pin,
    "player_access_code_required",
    "accessCode is required.",
  );

  if (
    gameJoinCode.length > 32 ||
    playerIdentifier.length > 128 ||
    accessCode.length > 128
  ) {
    throw new EdgeActivationError(
      "login_field_too_long",
      "One or more login fields exceed the allowed length.",
      400,
    );
  }

  return { gameJoinCode, playerIdentifier, accessCode };
}

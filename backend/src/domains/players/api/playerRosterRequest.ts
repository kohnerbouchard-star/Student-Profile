import { EdgeActivationError } from "../../../platform/supabase/edgeResponse.ts";
import {
  isRecord,
  parseOptionalText,
  parseRequiredText,
} from "../../../platform/supabase/edgeParsing.ts";
import type { CreatePlayerRequestBody } from "../application/createPlayerForAuthorizedStaff.ts";

export async function readCreatePlayerRequestBody(
  request: Request,
): Promise<CreatePlayerRequestBody> {
  return parseCreatePlayerRequestBody(await readPlayerRosterJsonBody(request));
}

export function parseCreatePlayerRequestBody(
  value: unknown,
): CreatePlayerRequestBody {
  if (!isRecord(value)) {
    throw new EdgeActivationError(
      "invalid_request_body",
      "Request body must be a JSON object.",
      400,
    );
  }

  const payload = normalizedPayload(value);
  return {
    displayName: parseRequiredText(
      firstDefined(payload, [
        "displayName",
        "name",
        "playerName",
        "studentName",
        "fullName",
        "username",
      ]),
      "player_display_name_required",
      "displayName is required.",
    ),
    rosterLabel: parseOptionalText(
      firstDefined(payload, [
        "rosterLabel",
        "roster",
        "label",
        "studentLabel",
        "classLabel",
      ]),
    ),
    playerIdentifier: parseRequiredText(
      firstDefined(payload, [
        "playerIdentifier",
        "playerId",
        "rfidCardId",
        "rfidId",
        "cardId",
        "externalPlayerId",
      ]),
      "player_identifier_required",
      "playerIdentifier is required.",
    ),
    accessCode: parseRequiredText(
      firstDefined(payload, [
        "accessCode",
        "studentCode",
        "playerAccessCode",
        "pin",
      ]),
      "player_access_code_required",
      "accessCode is required.",
    ),
  };
}

export async function readPlayerRosterJsonBody(
  request: Request,
): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new EdgeActivationError(
      "invalid_request_body",
      "Request body must be a JSON object.",
      400,
    );
  }
}

function firstDefined(
  record: Record<string, unknown>,
  keys: readonly string[],
): unknown {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function normalizedPayload(
  value: Record<string, unknown>,
): Record<string, unknown> {
  for (const key of ["player", "data", "payload"] as const) {
    const nested = value[key];
    if (isRecord(nested)) return { ...value, ...nested };
  }
  return value;
}

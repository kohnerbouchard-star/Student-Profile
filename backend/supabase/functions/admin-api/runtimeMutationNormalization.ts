export interface NormalizedRuntimeMutation {
  readonly classroomPath: string;
  readonly body: Record<string, unknown>;
}

export type RuntimeMutationResult =
  | { readonly ok: true; readonly mutation: NormalizedRuntimeMutation }
  | {
      readonly ok: false;
      readonly status: number;
      readonly code: string;
      readonly message: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string {
  return String(value ?? "").trim();
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

function flattenPayload(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (!isRecord(value)) return {};
  for (const key of keys) {
    const nested = value[key];
    if (isRecord(nested)) return { ...value, ...nested };
  }
  return value;
}

export function normalizeRuntimeMutation(
  gameId: string,
  suffix: string,
  method: string,
  value: unknown,
): RuntimeMutationResult | null {
  if (method !== "POST") return null;

  if (suffix === "/players") {
    const payload = flattenPayload(value, ["player", "data", "payload"]);
    const displayName = text(firstDefined(payload, [
      "displayName",
      "name",
      "playerName",
      "studentName",
      "fullName",
      "username",
    ]));

    if (!displayName) {
      return {
        ok: false,
        status: 400,
        code: "player_display_name_required",
        message: "A player display name is required.",
      };
    }

    const rosterLabel = text(firstDefined(payload, [
      "rosterLabel",
      "roster",
      "label",
      "studentLabel",
      "classLabel",
    ]));
    const playerIdentifier = text(firstDefined(payload, [
      "playerIdentifier",
      "playerId",
      "rfidCardId",
      "rfidId",
      "cardId",
      "externalPlayerId",
    ]));
    const accessCode = text(firstDefined(payload, [
      "accessCode",
      "studentCode",
      "playerAccessCode",
      "pin",
    ]));

    if (!playerIdentifier) {
      return {
        ok: false,
        status: 400,
        code: "player_identifier_required",
        message: "A Player ID / RFID card value is required.",
      };
    }

    if (!accessCode) {
      return {
        ok: false,
        status: 400,
        code: "player_access_code_required",
        message: "An Access Code is required.",
      };
    }

    return {
      ok: true,
      mutation: {
        classroomPath: `/games/${encodeURIComponent(gameId)}/players`,
        body: {
          displayName,
          rosterLabel: rosterLabel || null,
          playerIdentifier,
          accessCode,
        },
      },
    };
  }

  if (["/attendance/scans", "/attendance/scan"].includes(suffix)) {
    const payload = flattenPayload(value, ["scan", "player", "data", "payload"]);
    const playerId = text(firstDefined(payload, [
      "playerId",
      "studentCode",
      "accessCode",
      "playerCode",
      "scannedCode",
      "scanValue",
      "qrCode",
      "code",
      "value",
      "scan",
    ]));

    if (!playerId) {
      return {
        ok: false,
        status: 400,
        code: "attendance_player_code_required",
        message: "Scan or enter a player access code.",
      };
    }

    const deviceTimezone = text(firstDefined(payload, [
      "deviceTimezone",
      "timezone",
      "timeZone",
    ]));

    return {
      ok: true,
      mutation: {
        classroomPath: `/games/${encodeURIComponent(gameId)}/attendance/scan`,
        body: {
          playerId,
          deviceTimezone: deviceTimezone || null,
        },
      },
    };
  }

  return null;
}

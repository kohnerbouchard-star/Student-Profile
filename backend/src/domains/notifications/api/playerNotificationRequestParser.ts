/// <reference lib="dom" />

import { isRecord } from "../../../platform/supabase/edgeParsing.ts";
import { rejectClientSuppliedBodyIdentity } from "../../players/api/playerRequestScope.ts";
import {
  PLAYER_NOTIFICATION_STATUSES,
  type PlayerNotificationCursor,
  PlayerNotificationError,
  type PlayerNotificationListQuery,
  type PlayerNotificationReadCommand,
  type PlayerNotificationRoute,
  type PlayerNotificationStatus,
} from "../contracts/playerNotificationContracts.ts";

export const DEFAULT_PLAYER_NOTIFICATION_LIMIT = 20;
export const MAX_PLAYER_NOTIFICATION_LIMIT = 50;
export const MAX_PLAYER_NOTIFICATION_READ_IDS = 50;
export const MAX_PLAYER_NOTIFICATION_READ_BODY_BYTES = 4_096;

const PUBLIC_DELIVERY_ID_PATTERN = /^ndl_[0-9a-f]{32}$/;
const GAME_SCOPE_HEADERS = [
  "x-econovaria-game-session-id",
  "x-econovaria-game-id",
] as const;

export function parsePlayerNotificationListRequest(
  request: Request,
  route: PlayerNotificationRoute,
): PlayerNotificationListQuery {
  if (route.kind !== "list") {
    throw invalidRequest("Player notification list route is malformed.");
  }
  rejectGameScopeHeaders(request);

  const searchParams = new URL(request.url).searchParams;
  const supported = new Set(["status", "limit", "cursor"]);
  searchParams.forEach((_value, key) => {
    if (!supported.has(key)) {
      throw invalidRequest(`Unsupported notification query field: ${key}.`);
    }
  });

  return {
    status: parseStatus(readSingleQueryValue(searchParams, "status")),
    limit: parseLimit(readSingleQueryValue(searchParams, "limit")),
    cursor: parseCursor(readSingleQueryValue(searchParams, "cursor")),
  };
}

export async function parsePlayerNotificationReadRequest(
  request: Request,
  route: PlayerNotificationRoute,
): Promise<PlayerNotificationReadCommand> {
  if (route.kind !== "markRead") {
    throw invalidRequest("Player notification read route is malformed.");
  }
  rejectGameScopeHeaders(request);

  const searchParams = new URL(request.url).searchParams;
  let unexpectedQuery: string | null = null;
  searchParams.forEach((_value, key) => {
    unexpectedQuery ??= key;
  });
  if (unexpectedQuery) {
    throw invalidRequest(
      `Notification read does not accept query parameter: ${unexpectedQuery}.`,
    );
  }

  const text = await readBoundedRequestText(
    request,
    MAX_PLAYER_NOTIFICATION_READ_BODY_BYTES,
  );
  if (!text.trim()) {
    throw invalidRequest("Request body must be a JSON object.");
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw invalidRequest("Request body must be valid JSON.");
  }
  if (!isRecord(value)) {
    throw invalidRequest("Request body must be a JSON object.");
  }
  rejectClientSuppliedBodyIdentity(value);

  const fields = Object.keys(value);
  if (fields.length !== 1 || fields[0] !== "deliveryIds") {
    throw invalidRequest("Provide exactly one deliveryIds field.");
  }
  if (!Array.isArray(value.deliveryIds)) {
    throw invalidRequest("deliveryIds must be an array.");
  }
  if (
    value.deliveryIds.length < 1 ||
    value.deliveryIds.length > MAX_PLAYER_NOTIFICATION_READ_IDS
  ) {
    throw invalidRequest(
      `Provide between 1 and ${MAX_PLAYER_NOTIFICATION_READ_IDS} delivery IDs.`,
    );
  }

  const publicDeliveryIds = value.deliveryIds.map((candidate) =>
    typeof candidate === "string" ? candidate.trim().toLowerCase() : ""
  );
  if (publicDeliveryIds.some((candidate) => !isPublicDeliveryId(candidate))) {
    throw invalidRequest("Every delivery ID must be a public notification delivery ID.");
  }
  if (new Set(publicDeliveryIds).size !== publicDeliveryIds.length) {
    throw invalidRequest("deliveryIds must not contain duplicates.");
  }

  return { publicDeliveryIds };
}

export function encodePlayerNotificationCursor(
  cursor: PlayerNotificationCursor,
): string {
  const deliveredAt = normalizeCursorTimestamp(cursor.deliveredAt);
  const publicDeliveryId = cursor.publicDeliveryId.trim().toLowerCase();
  if (!isPublicDeliveryId(publicDeliveryId)) {
    throw invalidRequest("Notification cursor is invalid.");
  }

  const encoded = new TextEncoder().encode(
    `${deliveredAt}\n${publicDeliveryId}`,
  );
  let binary = "";
  for (const byte of encoded) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

export function parsePlayerNotificationCursor(
  value: string,
): PlayerNotificationCursor {
  if (!value || value.length > 256 || !/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw invalidRequest("Notification cursor is invalid.");
  }

  try {
    const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
    const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const [deliveredAt, publicDeliveryId, extra] = new TextDecoder()
      .decode(bytes)
      .split("\n");
    if (
      extra !== undefined ||
      !publicDeliveryId ||
      !isPublicDeliveryId(publicDeliveryId)
    ) {
      throw invalidRequest("Notification cursor is invalid.");
    }
    return {
      deliveredAt: normalizeCursorTimestamp(deliveredAt ?? ""),
      publicDeliveryId: publicDeliveryId.toLowerCase(),
    };
  } catch (error) {
    if (error instanceof PlayerNotificationError) throw error;
    throw invalidRequest("Notification cursor is invalid.");
  }
}

export function isPublicDeliveryId(value: string): boolean {
  return PUBLIC_DELIVERY_ID_PATTERN.test(value);
}

function parseStatus(value: string | null): PlayerNotificationStatus {
  const status = value?.trim().toLowerCase() || "unread";
  if (!PLAYER_NOTIFICATION_STATUSES.includes(status as PlayerNotificationStatus)) {
    throw invalidRequest(
      `status must be one of: ${PLAYER_NOTIFICATION_STATUSES.join(", ")}.`,
    );
  }
  return status as PlayerNotificationStatus;
}

function parseLimit(value: string | null): number {
  if (value === null || value.trim() === "") {
    return DEFAULT_PLAYER_NOTIFICATION_LIMIT;
  }
  if (!/^\d+$/u.test(value.trim())) {
    throw invalidRequest("limit must be a positive integer.");
  }
  const limit = Number(value);
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > MAX_PLAYER_NOTIFICATION_LIMIT
  ) {
    throw invalidRequest(
      `limit must be between 1 and ${MAX_PLAYER_NOTIFICATION_LIMIT}.`,
    );
  }
  return limit;
}

function parseCursor(value: string | null): PlayerNotificationCursor | null {
  return value === null || value.trim() === ""
    ? null
    : parsePlayerNotificationCursor(value.trim());
}

function readSingleQueryValue(
  searchParams: URLSearchParams,
  fieldName: string,
): string | null {
  const values = searchParams.getAll(fieldName);
  if (values.length > 1) {
    throw invalidRequest(`${fieldName} may only be supplied once.`);
  }
  return values[0] ?? null;
}

function normalizeCursorTimestamp(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw invalidRequest("Notification cursor is invalid.");
  }
  return new Date(parsed).toISOString();
}

function rejectGameScopeHeaders(request: Request): void {
  if (GAME_SCOPE_HEADERS.some((header) => request.headers.has(header))) {
    throw invalidRequest(
      "Player notifications derive game scope from x-player-session-token.",
    );
  }
}

async function readBoundedRequestText(
  request: Request,
  maxBytes: number,
): Promise<string> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const normalized = contentLength.trim();
    if (!/^\d+$/u.test(normalized) || Number(normalized) > maxBytes) {
      throw invalidRequest(
        `Notification read body must not exceed ${maxBytes} bytes.`,
      );
    }
  }
  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return text + decoder.decode();
      bytesRead += value.byteLength;
      if (bytesRead > maxBytes) {
        await reader.cancel();
        throw invalidRequest(
          `Notification read body must not exceed ${maxBytes} bytes.`,
        );
      }
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

function invalidRequest(message: string): PlayerNotificationError {
  return new PlayerNotificationError(
    "invalid_player_notification_request",
    message,
    400,
    false,
  );
}

/// <reference lib="dom" />

import { EdgeActivationError } from "../../../platform/supabase/edgeResponse.ts";
import { isRecord } from "../../../platform/supabase/edgeParsing.ts";
import { isUuid } from "../../../platform/supabase/uuid.ts";
import { rejectClientSuppliedBodyIdentity } from "../../players/api/playerRequestScope.ts";
import {
  PLAYER_NOTIFICATION_STATUSES,
  type PlayerNotificationCursor,
  type PlayerNotificationStatus,
} from "../contracts/playerNotificationContracts.ts";

export const DEFAULT_PLAYER_NOTIFICATION_LIMIT = 20;
export const MAX_PLAYER_NOTIFICATION_LIMIT = 50;
export const MAX_PLAYER_NOTIFICATION_READ_IDS = 50;
export const MAX_PLAYER_NOTIFICATION_READ_BODY_BYTES = 4_096;

export interface PlayerNotificationListRequest {
  readonly status: PlayerNotificationStatus;
  readonly limit: number;
  readonly cursor: PlayerNotificationCursor | null;
}

export interface PlayerNotificationReadRequest {
  readonly deliveryIds: readonly string[];
  readonly compatibilityFieldUsed: boolean;
}

const LIST_QUERY_FIELDS = new Set([
  "status",
  "limit",
  "cursor",
  "gameSessionId",
]);

export function parsePlayerNotificationListRequest(
  request: Request,
): PlayerNotificationListRequest {
  const searchParams = new URL(request.url).searchParams;

  searchParams.forEach((_value, fieldName) => {
    if (!LIST_QUERY_FIELDS.has(fieldName)) {
      throw invalidRequest(
        `Unsupported notification query field: ${fieldName}.`,
      );
    }
  });

  if (searchParams.getAll("gameSessionId").length > 1) {
    throw invalidRequest("gameSessionId may only be supplied once.");
  }

  return {
    status: parseStatus(readSingleQueryValue(searchParams, "status")),
    limit: parseLimit(readSingleQueryValue(searchParams, "limit")),
    cursor: parseCursor(readSingleQueryValue(searchParams, "cursor")),
  };
}

export async function parsePlayerNotificationReadRequest(
  request: Request,
): Promise<PlayerNotificationReadRequest> {
  const searchParams = new URL(request.url).searchParams;

  searchParams.forEach((_value, fieldName) => {
    if (fieldName !== "gameSessionId") {
      throw invalidRequest(
        `Unsupported notification read query field: ${fieldName}.`,
      );
    }
  });

  if (searchParams.getAll("gameSessionId").length > 1) {
    throw invalidRequest("gameSessionId may only be supplied once.");
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

  for (const fieldName of Object.keys(value)) {
    if (fieldName !== "deliveryIds" && fieldName !== "notificationIds") {
      throw invalidRequest(
        `Unsupported notification read field: ${fieldName}.`,
      );
    }
  }

  const hasDeliveryIds = Object.hasOwn(value, "deliveryIds");
  const hasCompatibilityIds = Object.hasOwn(value, "notificationIds");

  if (hasDeliveryIds === hasCompatibilityIds) {
    throw invalidRequest(
      "Provide exactly one of deliveryIds or notificationIds.",
    );
  }

  const rawIds = hasDeliveryIds ? value.deliveryIds : value.notificationIds;

  if (!Array.isArray(rawIds)) {
    throw invalidRequest("Notification delivery IDs must be an array.");
  }

  if (rawIds.length === 0 || rawIds.length > MAX_PLAYER_NOTIFICATION_READ_IDS) {
    throw invalidRequest(
      `Provide between 1 and ${MAX_PLAYER_NOTIFICATION_READ_IDS} notification delivery IDs.`,
    );
  }

  const deliveryIds = rawIds.map((value) =>
    typeof value === "string" ? value.trim().toLowerCase() : ""
  );

  if (deliveryIds.some((deliveryId) => !isUuid(deliveryId))) {
    throw invalidRequest("Every notification delivery ID must be a UUID.");
  }

  return {
    deliveryIds: [...new Set(deliveryIds)],
    compatibilityFieldUsed: hasCompatibilityIds,
  };
}

export function encodePlayerNotificationCursor(
  cursor: PlayerNotificationCursor,
): string {
  const deliveredAt = normalizeCursorTimestamp(cursor.deliveredAt);
  const deliveryId = cursor.deliveryId.trim().toLowerCase();

  if (!isUuid(deliveryId)) {
    throw invalidRequest("Notification cursor is invalid.");
  }

  const encoded = new TextEncoder().encode(`${deliveredAt}\n${deliveryId}`);
  let binary = "";

  for (const byte of encoded) {
    binary += String.fromCharCode(byte);
  }

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
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(
      binary,
      (character) => character.charCodeAt(0),
    );
    const [deliveredAt, deliveryId, extra] = new TextDecoder()
      .decode(bytes)
      .split("\n");

    if (extra !== undefined || !deliveryId || !isUuid(deliveryId)) {
      throw invalidRequest("Notification cursor is invalid.");
    }

    return {
      deliveredAt: normalizeCursorTimestamp(deliveredAt ?? ""),
      deliveryId: deliveryId.toLowerCase(),
    };
  } catch (error) {
    if (error instanceof EdgeActivationError) {
      throw error;
    }

    throw invalidRequest("Notification cursor is invalid.");
  }
}

function parseStatus(value: string | null): PlayerNotificationStatus {
  const status = value?.trim().toLowerCase() || "unread";

  if (
    !PLAYER_NOTIFICATION_STATUSES.includes(
      status as PlayerNotificationStatus,
    )
  ) {
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
  if (value === null || value.trim() === "") {
    return null;
  }

  return parsePlayerNotificationCursor(value.trim());
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

async function readBoundedRequestText(
  request: Request,
  maxBytes: number,
): Promise<string> {
  const contentLength = request.headers.get("content-length");

  if (contentLength !== null) {
    const normalizedLength = contentLength.trim();

    if (
      !/^\d+$/u.test(normalizedLength) ||
      Number(normalizedLength) > maxBytes
    ) {
      throw invalidRequest(
        `Notification read body must not exceed ${maxBytes} bytes.`,
      );
    }
  }

  if (!request.body) {
    return "";
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        return text + decoder.decode();
      }

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

function invalidRequest(message: string): EdgeActivationError {
  return new EdgeActivationError(
    "invalid_player_notification_request",
    message,
    400,
    false,
  );
}

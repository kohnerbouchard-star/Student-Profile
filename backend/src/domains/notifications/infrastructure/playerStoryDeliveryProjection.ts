import {
  type PlayerStoryCutsceneContentDto,
  type PlayerStoryDeliveryAction,
  PlayerStoryDeliveryError,
  PlayerStoryDeliveryPersistenceError,
  type PlayerStoryDeliveryRecord,
  type PlayerStoryDeliveryStateRecord,
} from "../contracts/playerStoryDeliveryContracts.ts";
import type { QueryError, QueryResponse } from "./playerStoryDeliveryRows.ts";

export function toDeliveryRecord(
  delivery: Record<string, unknown>,
  notification: Record<string, unknown>,
): PlayerStoryDeliveryRecord {
  const content = readContent(notification.payload);
  return {
    internalDeliveryUuid: requireUuid(delivery.id),
    internalNotificationUuid: requireUuid(delivery.notification_id),
    publicDeliveryId: requirePublicId(
      delivery.public_delivery_id,
      /^ndl_[0-9a-f]{32}$/,
    ),
    publicNotificationId: requirePublicId(
      notification.public_notification_id,
      /^ntf_[0-9a-f]{32}$/,
    ),
    gameId: requireUuid(delivery.game_session_id),
    playerUuid: requireUuid(delivery.player_id),
    category: "story",
    title: boundedText(notification.title, 180),
    summary: boundedText(notification.summary, 1200),
    priority: boundedToken(notification.priority, 32),
    displayMode: requireDisplayMode(notification.display_mode),
    publishedAt: requireIsoDateTime(notification.published_at),
    deliveredAt: requireIsoDateTime(delivery.delivered_at),
    seenAt: optionalIsoDateTime(delivery.seen_at),
    dismissedAt: optionalIsoDateTime(delivery.dismissed_at),
    acknowledgedAt: optionalIsoDateTime(delivery.acknowledged_at),
    requiresAcknowledgement: readBoolean(
      asRecord(notification.payload).requiresAcknowledgement,
      false,
    ),
    content,
  };
}

export function mergeDeliveryState(
  current: PlayerStoryDeliveryRecord,
  row: Record<string, unknown>,
): PlayerStoryDeliveryRecord {
  assertDeliveryScope(row, current.gameId, current.playerUuid);
  return {
    ...current,
    seenAt: optionalIsoDateTime(row.seen_at),
    dismissedAt: optionalIsoDateTime(row.dismissed_at),
    acknowledgedAt: optionalIsoDateTime(row.acknowledged_at),
  };
}

export function toStateRecord(
  record: PlayerStoryDeliveryRecord,
): PlayerStoryDeliveryStateRecord {
  return {
    publicDeliveryId: record.publicDeliveryId,
    publicNotificationId: record.publicNotificationId,
    deliveredAt: record.deliveredAt,
    seenAt: record.seenAt,
    dismissedAt: record.dismissedAt,
    acknowledgedAt: record.acknowledgedAt,
    requiresAcknowledgement: record.requiresAcknowledgement,
  };
}

function readContent(value: unknown): PlayerStoryCutsceneContentDto {
  const payload = asRecord(value);
  return {
    videoAssetKey: boundedAssetKey(payload.videoAssetKey, true),
    posterAssetKey: boundedAssetKey(payload.posterAssetKey, false),
    tone: optionalToken(payload.tone, 64),
    act: optionalPositiveInteger(payload.act, 1000),
    sequence: optionalPositiveInteger(payload.sequence, 100000),
  };
}

export function isPending(record: PlayerStoryDeliveryRecord): boolean {
  return !record.dismissedAt && !record.acknowledgedAt;
}

export function compareDeliveries(
  left: PlayerStoryDeliveryRecord,
  right: PlayerStoryDeliveryRecord,
): number {
  const priorityDelta = priorityRank(right.priority) - priorityRank(left.priority);
  if (priorityDelta !== 0) return priorityDelta;
  const publishedDelta = Date.parse(right.publishedAt) - Date.parse(left.publishedAt);
  if (publishedDelta !== 0) return publishedDelta;
  return right.publicDeliveryId.localeCompare(left.publicDeliveryId);
}

function priorityRank(priority: string): number {
  if (priority === "critical") return 4;
  if (priority === "major") return 3;
  if (priority === "normal") return 2;
  return 1;
}


export function terminalConflict(): PlayerStoryDeliveryError {
  return new PlayerStoryDeliveryError(
    "player_story_delivery_conflict",
    "Story delivery is no longer active.",
    409,
    false,
  );
}

export function fieldForAction(
  action: PlayerStoryDeliveryAction,
): "seenAt" | "dismissedAt" | "acknowledgedAt" {
  if (action === "seen") return "seenAt";
  if (action === "dismissed") return "dismissedAt";
  return "acknowledgedAt";
}

export function fieldToColumn(field: "seenAt" | "dismissedAt" | "acknowledgedAt"):
  "seen_at" | "dismissed_at" | "acknowledged_at" {
  if (field === "seenAt") return "seen_at";
  if (field === "dismissedAt") return "dismissed_at";
  return "acknowledged_at";
}

export function valuesForAction(
  action: PlayerStoryDeliveryAction,
  markedAt: string,
  seenAt: string | null,
): Record<string, string> {
  if (action === "seen") return { seen_at: markedAt };
  if (action === "dismissed") {
    return { dismissed_at: markedAt, seen_at: seenAt ?? markedAt };
  }
  return { acknowledged_at: markedAt, seen_at: seenAt ?? markedAt };
}

export function assertReadResponse(
  response: QueryResponse<readonly Record<string, unknown>[]>,
): void {
  if (response.error) throw mapPersistenceError(response.error);
}

export function assertDeliveryScope(
  row: Record<string, unknown>,
  gameId: string,
  playerUuid: string,
): void {
  if (
    requireUuid(row.game_session_id) !== gameId ||
    requireUuid(row.player_id) !== playerUuid
  ) throw readFailed();
}

export function assertNotificationScope(
  rows: readonly Record<string, unknown>[],
  gameId: string,
): void {
  if (rows.some((row) => requireUuid(row.game_session_id) !== gameId)) {
    throw readFailed();
  }
}

export function mapPersistenceError(
  error: QueryError,
  write = false,
): PlayerStoryDeliveryPersistenceError {
  const message = error.message.toLowerCase();
  const schemaMissing = error.code === "42P01" || error.code === "42703" ||
    message.includes("does not exist") || message.includes("schema cache");
  return new PlayerStoryDeliveryPersistenceError(
    schemaMissing
      ? "player_story_delivery_schema_not_applied"
      : write
      ? "player_story_delivery_write_failed"
      : "player_story_delivery_read_failed",
    write
      ? "Story delivery state could not be updated."
      : "Story deliveries could not be loaded.",
  );
}

export function readFailed(): PlayerStoryDeliveryPersistenceError {
  return new PlayerStoryDeliveryPersistenceError(
    "player_story_delivery_read_failed",
    "Story deliveries could not be loaded.",
  );
}

function invalidPayload(): PlayerStoryDeliveryPersistenceError {
  return new PlayerStoryDeliveryPersistenceError(
    "player_story_delivery_payload_invalid",
    "Story delivery content is invalid.",
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw invalidPayload();
}

function boundedText(value: unknown, limit: number): string {
  if (typeof value !== "string" || !value.trim()) throw readFailed();
  return value.trim().slice(0, limit);
}

function boundedToken(value: unknown, limit: number): string {
  const token = boundedText(value, limit).toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(token)) throw readFailed();
  return token;
}

function optionalToken(value: unknown, limit: number): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw invalidPayload();
  const token = value.trim().toLowerCase().slice(0, limit);
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(token)) throw invalidPayload();
  return token;
}

function boundedAssetKey(value: unknown, required: true): string;
function boundedAssetKey(value: unknown, required: false): string | null;
function boundedAssetKey(value: unknown, required: boolean): string | null {
  if (value === null || value === undefined || value === "") {
    if (required) throw invalidPayload();
    return null;
  }
  if (typeof value !== "string") throw invalidPayload();
  const key = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{0,159}$/.test(key)) throw invalidPayload();
  return key;
}

function optionalPositiveInteger(value: unknown, max: number): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0 || number > max) {
    throw invalidPayload();
  }
  return number;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "boolean") throw invalidPayload();
  return value;
}

function requireDisplayMode(
  value: unknown,
): "modal_immediate" | "modal_on_next_login" {
  const mode = boundedToken(value, 40);
  if (mode === "modal_immediate" || mode === "modal_on_next_login") return mode;
  throw readFailed();
}

function requirePublicId(value: unknown, pattern: RegExp): string {
  const text = boundedText(value, 64).toLowerCase();
  if (!pattern.test(text)) throw readFailed();
  return text;
}

export function requireUuid(value: unknown): string {
  const text = boundedText(value, 64).toLowerCase();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      .test(text)
  ) throw readFailed();
  return text;
}

function requireIsoDateTime(value: unknown): string {
  const text = boundedText(value, 80);
  if (Number.isNaN(Date.parse(text))) throw readFailed();
  return text;
}

function optionalIsoDateTime(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return requireIsoDateTime(value);
}

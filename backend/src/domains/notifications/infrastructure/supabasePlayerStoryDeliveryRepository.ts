import {
  type PlayerStoryCutsceneContentDto,
  type PlayerStoryDeliveryAction,
  PlayerStoryDeliveryError,
  PlayerStoryDeliveryPersistenceError,
  type PlayerStoryDeliveryRecord,
  type PlayerStoryDeliveryRepository,
  type PlayerStoryDeliveryStateRecord,
} from "../contracts/playerStoryDeliveryContracts.ts";

interface QueryError {
  readonly message: string;
  readonly code?: string;
}

interface QueryResponse<T> {
  readonly data: T | null;
  readonly error: QueryError | null;
}

interface FilterBuilder
  extends PromiseLike<QueryResponse<readonly Record<string, unknown>[]>> {
  eq(column: string, value: unknown): FilterBuilder;
  in(column: string, values: readonly unknown[]): FilterBuilder;
  is(column: string, value: null): FilterBuilder;
  order(
    column: string,
    options?: { readonly ascending?: boolean },
  ): FilterBuilder;
  limit(count: number): FilterBuilder;
  maybeSingle(): PromiseLike<QueryResponse<Record<string, unknown>>>;
}

interface UpdateBuilder {
  eq(column: string, value: unknown): UpdateBuilder;
  is(column: string, value: null): UpdateBuilder;
  select(columns: string): {
    maybeSingle(): PromiseLike<QueryResponse<Record<string, unknown>>>;
  };
}

interface QueryBuilder {
  select(columns: string): FilterBuilder;
  update(values: unknown): UpdateBuilder;
}

interface PlayerStoryDeliveryClient {
  from(tableName: "notifications" | "notification_deliveries"): QueryBuilder;
}

const DELIVERY_SELECT = [
  "id",
  "public_delivery_id",
  "notification_id",
  "game_session_id",
  "player_id",
  "delivered_at",
  "seen_at",
  "dismissed_at",
  "acknowledged_at",
].join(",");

const NOTIFICATION_SELECT = [
  "id",
  "public_notification_id",
  "game_session_id",
  "notification_type",
  "title",
  "summary",
  "priority",
  "display_mode",
  "payload",
  "published_at",
].join(",");

const MODAL_DISPLAY_MODES = [
  "modal_immediate",
  "modal_on_next_login",
] as const;

const MAX_NOTIFICATION_CANDIDATES = 50;

export class SupabasePlayerStoryDeliveryRepository
  implements PlayerStoryDeliveryRepository {
  constructor(private readonly client: PlayerStoryDeliveryClient) {}

  async listPendingDeliveries(input: {
    readonly gameId: string;
    readonly playerUuid: string;
    readonly limit: number;
  }): Promise<readonly PlayerStoryDeliveryRecord[]> {
    const notificationResponse = await this.client
      .from("notifications")
      .select(NOTIFICATION_SELECT)
      .eq("game_session_id", input.gameId)
      .eq("notification_type", "story_cutscene")
      .in("display_mode", MODAL_DISPLAY_MODES)
      .order("published_at", { ascending: false })
      .limit(MAX_NOTIFICATION_CANDIDATES);
    assertReadResponse(notificationResponse);

    const notifications = notificationResponse.data ?? [];
    if (notifications.length === 0) return [];
    assertNotificationScope(notifications, input.gameId);

    const notificationIds = notifications.map((row) => requireUuid(row.id));
    const deliveryResponse = await this.client
      .from("notification_deliveries")
      .select(DELIVERY_SELECT)
      .eq("game_session_id", input.gameId)
      .eq("player_id", input.playerUuid)
      .in("notification_id", notificationIds)
      .is("dismissed_at", null)
      .order("delivered_at", { ascending: false })
      .limit(MAX_NOTIFICATION_CANDIDATES);
    assertReadResponse(deliveryResponse);

    const notificationById = new Map(
      notifications.map((row) => [requireUuid(row.id), row]),
    );
    return (deliveryResponse.data ?? [])
      .map((delivery) => {
        assertDeliveryScope(delivery, input.gameId, input.playerUuid);
        const notification = notificationById.get(
          requireUuid(delivery.notification_id),
        );
        if (!notification) throw readFailed();
        return toDeliveryRecord(delivery, notification);
      })
      .filter((record) => isPending(record))
      .sort(compareDeliveries)
      .slice(0, Math.max(1, Math.min(10, input.limit)));
  }

  async updateDeliveryState(input: {
    readonly gameId: string;
    readonly playerUuid: string;
    readonly publicDeliveryId: string;
    readonly action: PlayerStoryDeliveryAction;
    readonly markedAt: string;
  }): Promise<PlayerStoryDeliveryStateRecord> {
    const current = await this.readDelivery(
      input.gameId,
      input.playerUuid,
      input.publicDeliveryId,
    );
    if (current.dismissedAt) {
      if (input.action === "dismissed") return toStateRecord(current);
      throw terminalConflict();
    }
    if (current.acknowledgedAt) {
      if (input.action === "acknowledged") return toStateRecord(current);
      throw terminalConflict();
    }
    if (
      input.action === "dismissed" && current.requiresAcknowledgement
    ) {
      throw new PlayerStoryDeliveryError(
        "player_story_delivery_acknowledgement_required",
        "This story delivery must be acknowledged.",
        409,
        false,
      );
    }

    const field = fieldForAction(input.action);
    if (current[field]) return toStateRecord(current);

    const values = valuesForAction(input.action, input.markedAt, current.seenAt);
    let updateBuilder = this.client
      .from("notification_deliveries")
      .update(values)
      .eq("public_delivery_id", input.publicDeliveryId)
      .eq("game_session_id", input.gameId)
      .eq("player_id", input.playerUuid)
      .is(fieldToColumn(field), null);
    if (input.action === "dismissed") {
      updateBuilder = updateBuilder.is("acknowledged_at", null);
    } else if (input.action === "acknowledged") {
      updateBuilder = updateBuilder.is("dismissed_at", null);
    }
    const updateResponse = await updateBuilder
      .select(DELIVERY_SELECT)
      .maybeSingle();
    if (updateResponse.error) throw mapPersistenceError(updateResponse.error, true);

    if (updateResponse.data) {
      const updated = mergeDeliveryState(current, updateResponse.data);
      return toStateRecord(updated);
    }

    const afterRace = await this.readDelivery(
      input.gameId,
      input.playerUuid,
      input.publicDeliveryId,
    );
    if (afterRace[field]) return toStateRecord(afterRace);
    throw new PlayerStoryDeliveryError(
      "player_story_delivery_conflict",
      "Story delivery state changed concurrently.",
      409,
      true,
    );
  }

  private async readDelivery(
    gameId: string,
    playerUuid: string,
    publicDeliveryId: string,
  ): Promise<PlayerStoryDeliveryRecord> {
    const deliveryResponse = await this.client
      .from("notification_deliveries")
      .select(DELIVERY_SELECT)
      .eq("public_delivery_id", publicDeliveryId)
      .eq("game_session_id", gameId)
      .eq("player_id", playerUuid)
      .maybeSingle();
    if (deliveryResponse.error) throw mapPersistenceError(deliveryResponse.error);
    if (!deliveryResponse.data) {
      throw new PlayerStoryDeliveryError(
        "player_story_delivery_not_found",
        "Story delivery was not found.",
        404,
        false,
      );
    }
    assertDeliveryScope(deliveryResponse.data, gameId, playerUuid);

    const notificationResponse = await this.client
      .from("notifications")
      .select(NOTIFICATION_SELECT)
      .eq("id", requireUuid(deliveryResponse.data.notification_id))
      .eq("game_session_id", gameId)
      .eq("notification_type", "story_cutscene")
      .in("display_mode", MODAL_DISPLAY_MODES)
      .maybeSingle();
    if (notificationResponse.error) {
      throw mapPersistenceError(notificationResponse.error);
    }
    if (!notificationResponse.data) {
      throw new PlayerStoryDeliveryError(
        "player_story_delivery_not_found",
        "Story delivery was not found.",
        404,
        false,
      );
    }
    assertNotificationScope([notificationResponse.data], gameId);
    return toDeliveryRecord(deliveryResponse.data, notificationResponse.data);
  }
}

function toDeliveryRecord(
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

function mergeDeliveryState(
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

function toStateRecord(
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

function isPending(record: PlayerStoryDeliveryRecord): boolean {
  return !record.dismissedAt && !record.acknowledgedAt;
}

function compareDeliveries(
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


function terminalConflict(): PlayerStoryDeliveryError {
  return new PlayerStoryDeliveryError(
    "player_story_delivery_conflict",
    "Story delivery is no longer active.",
    409,
    false,
  );
}

function fieldForAction(
  action: PlayerStoryDeliveryAction,
): "seenAt" | "dismissedAt" | "acknowledgedAt" {
  if (action === "seen") return "seenAt";
  if (action === "dismissed") return "dismissedAt";
  return "acknowledgedAt";
}

function fieldToColumn(field: "seenAt" | "dismissedAt" | "acknowledgedAt"):
  "seen_at" | "dismissed_at" | "acknowledged_at" {
  if (field === "seenAt") return "seen_at";
  if (field === "dismissedAt") return "dismissed_at";
  return "acknowledged_at";
}

function valuesForAction(
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

function assertReadResponse(
  response: QueryResponse<readonly Record<string, unknown>[]>,
): void {
  if (response.error) throw mapPersistenceError(response.error);
}

function assertDeliveryScope(
  row: Record<string, unknown>,
  gameId: string,
  playerUuid: string,
): void {
  if (
    requireUuid(row.game_session_id) !== gameId ||
    requireUuid(row.player_id) !== playerUuid
  ) throw readFailed();
}

function assertNotificationScope(
  rows: readonly Record<string, unknown>[],
  gameId: string,
): void {
  if (rows.some((row) => requireUuid(row.game_session_id) !== gameId)) {
    throw readFailed();
  }
}

function mapPersistenceError(
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

function readFailed(): PlayerStoryDeliveryPersistenceError {
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

function requireUuid(value: unknown): string {
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

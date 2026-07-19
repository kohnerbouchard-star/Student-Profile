import {
  type PlayerNotificationDeliveryStateRecord,
  PlayerNotificationPersistenceError,
  type PlayerNotificationRecord,
  type PlayerNotificationRepository,
  type PlayerNotificationStatus,
} from "../contracts/playerNotificationContracts.ts";

interface QueryError {
  readonly message: string;
  readonly code?: string;
}

interface QueryResponse<T> {
  readonly data: T | null;
  readonly error: QueryError | null;
  readonly count?: number | null;
}

interface FilterBuilder
  extends PromiseLike<QueryResponse<readonly Record<string, unknown>[]>> {
  eq(column: string, value: unknown): FilterBuilder;
  in(column: string, values: readonly unknown[]): FilterBuilder;
  is(column: string, value: null): FilterBuilder;
  not(column: string, operator: string, value: unknown): FilterBuilder;
  or(filters: string): FilterBuilder;
  order(
    column: string,
    options?: { readonly ascending?: boolean },
  ): FilterBuilder;
  limit(count: number): FilterBuilder;
}

interface UpdateBuilder
  extends PromiseLike<QueryResponse<readonly Record<string, unknown>[]>> {
  eq(column: string, value: unknown): UpdateBuilder;
  in(column: string, values: readonly unknown[]): UpdateBuilder;
  is(column: string, value: null): UpdateBuilder;
  select(columns: string): UpdateBuilder;
}

interface QueryBuilder {
  select(
    columns: string,
    options?: { readonly count?: "exact"; readonly head?: boolean },
  ): FilterBuilder;
  update(values: unknown): UpdateBuilder;
}

interface PlayerNotificationClient {
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
  "source_type",
  "notification_type",
  "title",
  "summary",
  "priority",
  "display_mode",
  "published_at",
].join(",");

export class SupabasePlayerNotificationRepository
  implements PlayerNotificationRepository {
  constructor(private readonly client: PlayerNotificationClient) {}

  async listNotifications(input: {
    readonly gameId: string;
    readonly playerUuid: string;
    readonly status: PlayerNotificationStatus;
    readonly limit: number;
    readonly cursor: {
      readonly deliveredAt: string;
      readonly publicDeliveryId: string;
    } | null;
  }): Promise<readonly PlayerNotificationRecord[]> {
    let query = this.client
      .from("notification_deliveries")
      .select(DELIVERY_SELECT)
      .eq("game_session_id", input.gameId)
      .eq("player_id", input.playerUuid);

    query = applyStatusFilter(query, input.status);
    if (input.cursor) query = query.or(toCursorFilter(input.cursor));

    const deliveryResponse = await query
      .order("delivered_at", { ascending: false })
      .order("public_delivery_id", { ascending: false })
      .limit(input.limit);
    if (deliveryResponse.error) {
      throw mapPersistenceError(deliveryResponse.error);
    }

    const deliveries = deliveryResponse.data ?? [];
    if (deliveries.length === 0) return [];
    assertDeliveryScope(deliveries, input.gameId, input.playerUuid);

    const internalNotificationUuids = [
      ...new Set(
        deliveries.map((row) => requireUuid(row.notification_id)),
      ),
    ];
    const notificationResponse = await this.client
      .from("notifications")
      .select(NOTIFICATION_SELECT)
      .eq("game_session_id", input.gameId)
      .in("id", internalNotificationUuids)
      .limit(internalNotificationUuids.length + 1);
    if (notificationResponse.error) {
      throw mapPersistenceError(notificationResponse.error);
    }

    const notificationRows = notificationResponse.data ?? [];
    if (notificationRows.length > internalNotificationUuids.length) {
      throw readFailed();
    }
    const notificationByUuid = new Map(
      notificationRows.map((row) => [requireUuid(row.id), row]),
    );
    if (
      internalNotificationUuids.some((id) => !notificationByUuid.has(id)) ||
      notificationRows.some((row) =>
        requireUuid(row.game_session_id) !== input.gameId
      )
    ) {
      throw metadataMissing();
    }

    return deliveries.map((delivery) => {
      const notification = notificationByUuid.get(
        requireUuid(delivery.notification_id),
      );
      if (!notification) throw metadataMissing();
      return toNotificationRecord(delivery, notification);
    });
  }
  async countUnreadNotifications(input: {
    readonly gameId: string;
    readonly playerUuid: string;
  }): Promise<number> {
    const response = await this.client
      .from("notification_deliveries")
      .select("id", { count: "exact", head: true })
      .eq("game_session_id", input.gameId)
      .eq("player_id", input.playerUuid)
      .is("seen_at", null)
      .is("dismissed_at", null);
    if (response.error) throw mapPersistenceError(response.error);
    if (
      typeof response.count !== "number" ||
      !Number.isSafeInteger(response.count) || response.count < 0
    ) {
      throw readFailed();
    }
    return response.count;
  }

  async readDeliveriesByPublicIds(input: {
    readonly gameId: string;
    readonly playerUuid: string;
    readonly publicDeliveryIds: readonly string[];
  }): Promise<readonly PlayerNotificationDeliveryStateRecord[]> {
    if (input.publicDeliveryIds.length === 0) return [];

    const deliveryResponse = await this.client
      .from("notification_deliveries")
      .select(DELIVERY_SELECT)
      .eq("game_session_id", input.gameId)
      .eq("player_id", input.playerUuid)
      .in("public_delivery_id", input.publicDeliveryIds)
      .limit(input.publicDeliveryIds.length + 1);
    if (deliveryResponse.error) {
      throw mapPersistenceError(deliveryResponse.error);
    }

    const deliveries = deliveryResponse.data ?? [];
    if (deliveries.length > input.publicDeliveryIds.length) throw readFailed();
    assertDeliveryScope(deliveries, input.gameId, input.playerUuid);
    return await this.attachPublicNotificationIds(deliveries, input.gameId);
  }

  async markDeliveriesRead(input: {
    readonly gameId: string;
    readonly playerUuid: string;
    readonly publicDeliveryIds: readonly string[];
    readonly seenAt: string;
  }): Promise<readonly PlayerNotificationDeliveryStateRecord[]> {
    if (input.publicDeliveryIds.length === 0) return [];

    const deliveryResponse = await this.client
      .from("notification_deliveries")
      .update({ seen_at: input.seenAt })
      .eq("game_session_id", input.gameId)
      .eq("player_id", input.playerUuid)
      .in("public_delivery_id", input.publicDeliveryIds)
      .is("seen_at", null)
      .select(DELIVERY_SELECT);
    if (deliveryResponse.error) {
      throw mapPersistenceError(deliveryResponse.error, true);
    }

    const deliveries = deliveryResponse.data ?? [];
    assertDeliveryScope(deliveries, input.gameId, input.playerUuid);
    if (
      deliveries.some((row) => requireIsoDateTime(row.seen_at) !== input.seenAt)
    ) {
      throw writeFailed();
    }
    return await this.attachPublicNotificationIds(deliveries, input.gameId);
  }

  private async attachPublicNotificationIds(
    deliveries: readonly Record<string, unknown>[],
    gameId: string,
  ): Promise<readonly PlayerNotificationDeliveryStateRecord[]> {
    if (deliveries.length === 0) return [];
    const internalNotificationUuids = [
      ...new Set(
        deliveries.map((row) => requireUuid(row.notification_id)),
      ),
    ];
    const notificationResponse = await this.client
      .from("notifications")
      .select("id,public_notification_id,game_session_id")
      .eq("game_session_id", gameId)
      .in("id", internalNotificationUuids)
      .limit(internalNotificationUuids.length + 1);
    if (notificationResponse.error) {
      throw mapPersistenceError(notificationResponse.error);
    }

    const rows = notificationResponse.data ?? [];
    if (rows.length > internalNotificationUuids.length) throw readFailed();
    const publicIdByUuid = new Map(
      rows.map((row) => {
        if (requireUuid(row.game_session_id) !== gameId) {
          throw metadataMissing();
        }
        return [
          requireUuid(row.id),
          requirePublicNotificationId(row.public_notification_id),
        ];
      }),
    );
    if (internalNotificationUuids.some((id) => !publicIdByUuid.has(id))) {
      throw metadataMissing();
    }

    return deliveries.map((delivery) => ({
      internalDeliveryUuid: requireUuid(delivery.id),
      internalNotificationUuid: requireUuid(delivery.notification_id),
      publicDeliveryId: requirePublicDeliveryId(delivery.public_delivery_id),
      publicNotificationId: publicIdByUuid.get(
        requireUuid(delivery.notification_id),
      ) as string,
      gameId: requireUuid(delivery.game_session_id),
      playerUuid: requireUuid(delivery.player_id),
      deliveredAt: requireIsoDateTime(delivery.delivered_at),
      seenAt: optionalIsoDateTime(delivery.seen_at),
      dismissedAt: optionalIsoDateTime(delivery.dismissed_at),
      acknowledgedAt: optionalIsoDateTime(delivery.acknowledged_at),
    }));
  }
}

function applyStatusFilter(
  query: FilterBuilder,
  status: PlayerNotificationStatus,
): FilterBuilder {
  if (status === "unread") {
    return query.is("seen_at", null).is("dismissed_at", null);
  }
  if (status === "read") {
    return query.not("seen_at", "is", null).is("dismissed_at", null);
  }
  if (status === "dismissed") {
    return query.not("dismissed_at", "is", null);
  }
  return query;
}

function toCursorFilter(cursor: {
  readonly deliveredAt: string;
  readonly publicDeliveryId: string;
}): string {
  return `delivered_at.lt.${cursor.deliveredAt},and(delivered_at.eq.${cursor.deliveredAt},public_delivery_id.lt.${cursor.publicDeliveryId})`;
}

function toNotificationRecord(
  delivery: Record<string, unknown>,
  notification: Record<string, unknown>,
): PlayerNotificationRecord {
  return {
    internalDeliveryUuid: requireUuid(delivery.id),
    internalNotificationUuid: requireUuid(delivery.notification_id),
    publicDeliveryId: requirePublicDeliveryId(delivery.public_delivery_id),
    publicNotificationId: requirePublicNotificationId(
      notification.public_notification_id,
    ),
    gameId: requireUuid(delivery.game_session_id),
    playerUuid: requireUuid(delivery.player_id),
    sourceType: requireText(notification.source_type),
    notificationType: requireText(notification.notification_type),
    title: requireText(notification.title),
    summary: requireText(notification.summary),
    priority: requireText(notification.priority).toLowerCase(),
    displayMode: requireText(notification.display_mode).toLowerCase(),
    publishedAt: requireIsoDateTime(notification.published_at),
    deliveredAt: requireIsoDateTime(delivery.delivered_at),
    seenAt: optionalIsoDateTime(delivery.seen_at),
    dismissedAt: optionalIsoDateTime(delivery.dismissed_at),
    acknowledgedAt: optionalIsoDateTime(delivery.acknowledged_at),
  };
}

function assertDeliveryScope(
  rows: readonly Record<string, unknown>[],
  gameId: string,
  playerUuid: string,
): void {
  if (
    rows.some((row) =>
      requireUuid(row.game_session_id) !== gameId ||
      requireUuid(row.player_id) !== playerUuid
    )
  ) {
    throw readFailed();
  }
}

function mapPersistenceError(
  error: QueryError,
  write = false,
): PlayerNotificationPersistenceError {
  const message = error.message.toLowerCase();
  const schemaMissing = error.code === "42P01" ||
    error.code === "42703" ||
    message.includes("does not exist") ||
    message.includes("schema cache");
  return new PlayerNotificationPersistenceError(
    schemaMissing
      ? "player_notification_schema_not_applied"
      : write
      ? "player_notification_write_failed"
      : "player_notification_read_failed",
    write
      ? "Notifications could not be marked read."
      : "Player notifications could not be loaded.",
  );
}

function metadataMissing(): PlayerNotificationPersistenceError {
  return new PlayerNotificationPersistenceError(
    "player_notification_metadata_missing",
    "Player notifications could not be loaded.",
  );
}

function readFailed(): PlayerNotificationPersistenceError {
  return new PlayerNotificationPersistenceError(
    "player_notification_read_failed",
    "Player notifications could not be loaded.",
  );
}

function writeFailed(): PlayerNotificationPersistenceError {
  return new PlayerNotificationPersistenceError(
    "player_notification_write_failed",
    "Notifications could not be marked read.",
  );
}

function requireText(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  throw readFailed();
}

function requireUuid(value: unknown): string {
  const text = requireText(value).toLowerCase();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      .test(text)
  ) {
    throw readFailed();
  }
  return text;
}

function requirePublicDeliveryId(value: unknown): string {
  const text = requireText(value).toLowerCase();
  if (!/^ndl_[0-9a-f]{32}$/.test(text)) throw readFailed();
  return text;
}

function requirePublicNotificationId(value: unknown): string {
  const text = requireText(value).toLowerCase();
  if (!/^ntf_[0-9a-f]{32}$/.test(text)) throw readFailed();
  return text;
}

function requireIsoDateTime(value: unknown): string {
  const text = requireText(value);
  if (Number.isNaN(Date.parse(text))) throw readFailed();
  return text;
}

function optionalIsoDateTime(value: unknown): string | null {
  return value === null || value === undefined
    ? null
    : requireIsoDateTime(value);
}

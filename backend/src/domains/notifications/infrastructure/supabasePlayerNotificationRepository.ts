import type {
  ListPlayerNotificationsInput,
  MarkPlayerNotificationDeliveriesReadInput,
  PlayerNotificationPage,
  PlayerNotificationRecord,
  PlayerNotificationStatus,
  ReadPlayerNotificationDeliveriesInput,
} from "../contracts/playerNotificationContracts.ts";
import type {
  PlayerNotificationDeliveryStateRecord,
  PlayerNotificationRepository,
} from "./playerNotificationRepository.ts";

type PlayerNotificationTableName =
  | "notifications"
  | "notification_deliveries";

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
  select(columns: string): FilterBuilder;
  update(values: unknown): UpdateBuilder;
}

interface PlayerNotificationClient {
  from(tableName: PlayerNotificationTableName): QueryBuilder;
}

interface NotificationDeliveryRow {
  readonly id: string;
  readonly notification_id: string;
  readonly game_session_id: string;
  readonly player_id: string;
  readonly delivered_at: string;
  readonly seen_at: string | null;
  readonly dismissed_at: string | null;
  readonly acknowledged_at: string | null;
}

interface NotificationRow {
  readonly id: string;
  readonly game_session_id: string;
  readonly source_type: string;
  readonly source_id: string | null;
  readonly notification_type: string;
  readonly title: string;
  readonly summary: string;
  readonly priority: string;
  readonly display_mode: string;
  readonly published_at: string;
}

const DELIVERY_SELECT = [
  "id",
  "notification_id",
  "game_session_id",
  "player_id",
  "delivered_at",
  "seen_at",
  "dismissed_at",
  "acknowledged_at",
].join(",");

// The generic inbox deliberately excludes notifications.payload. Cutscene
// payloads remain available only through the purpose-built dashboard flow.
const NOTIFICATION_INBOX_SELECT = [
  "id",
  "game_session_id",
  "source_type",
  "source_id",
  "notification_type",
  "title",
  "summary",
  "priority",
  "display_mode",
  "published_at",
].join(",");

export class PlayerNotificationPersistenceError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PlayerNotificationPersistenceError";
    this.code = code;
  }
}

export class SupabasePlayerNotificationRepository
  implements PlayerNotificationRepository {
  constructor(private readonly client: PlayerNotificationClient) {}

  async listPlayerNotifications(
    input: ListPlayerNotificationsInput,
  ): Promise<PlayerNotificationPage> {
    let query = this.client
      .from("notification_deliveries")
      .select(DELIVERY_SELECT)
      .eq("game_session_id", input.gameSessionId)
      .eq("player_id", input.playerId);

    query = applyStatusFilter(query, input.status);

    if (input.cursor) {
      query = query.or(toCursorFilter(input.cursor));
    }

    const deliveryResponse = await query
      .order("delivered_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(input.limit + 1);

    assertNoQueryError(deliveryResponse);

    const deliveryRows = (deliveryResponse.data ??
      []) as unknown as readonly NotificationDeliveryRow[];
    assertDeliveryScope(deliveryRows, input.gameSessionId, input.playerId);

    const hasMore = deliveryRows.length > input.limit;
    const pageRows = deliveryRows.slice(0, input.limit);

    if (pageRows.length === 0) {
      return { records: [], hasMore: false, nextCursor: null };
    }

    const notificationIds = [
      ...new Set(pageRows.map((row) => row.notification_id)),
    ];
    const notificationResponse = await this.client
      .from("notifications")
      .select(NOTIFICATION_INBOX_SELECT)
      .eq("game_session_id", input.gameSessionId)
      .in("id", notificationIds);

    assertNoQueryError(notificationResponse);

    const notifications = (notificationResponse.data ??
      []) as unknown as readonly NotificationRow[];
    const notificationById = new Map(
      notifications.map((notification) => [notification.id, notification]),
    );

    if (
      notifications.some((row) =>
        row.game_session_id !== input.gameSessionId
      ) ||
      notificationIds.some((notificationId) =>
        !notificationById.has(notificationId)
      )
    ) {
      throw new PlayerNotificationPersistenceError(
        "player_notification_metadata_missing",
        "Player notifications could not be loaded.",
      );
    }

    const records = pageRows.map((delivery) =>
      toPlayerNotificationRecord(
        delivery,
        notificationById.get(delivery.notification_id) as NotificationRow,
      )
    );
    const finalRecord = records.at(-1);

    return {
      records,
      hasMore,
      nextCursor: hasMore && finalRecord
        ? {
          deliveredAt: finalRecord.deliveredAt,
          deliveryId: finalRecord.deliveryId,
        }
        : null,
    };
  }

  async readPlayerDeliveriesByIds(
    input: ReadPlayerNotificationDeliveriesInput,
  ): Promise<readonly PlayerNotificationDeliveryStateRecord[]> {
    if (input.deliveryIds.length === 0) {
      return [];
    }

    const response = await this.client
      .from("notification_deliveries")
      .select(DELIVERY_SELECT)
      .eq("game_session_id", input.gameSessionId)
      .eq("player_id", input.playerId)
      .in("id", input.deliveryIds);

    assertNoQueryError(response);

    const rows =
      (response.data ?? []) as unknown as readonly NotificationDeliveryRow[];
    assertDeliveryScope(rows, input.gameSessionId, input.playerId);

    return rows.map(toDeliveryStateRecord);
  }

  async markPlayerDeliveriesRead(
    input: MarkPlayerNotificationDeliveriesReadInput,
  ): Promise<readonly PlayerNotificationDeliveryStateRecord[]> {
    if (input.deliveryIds.length === 0) {
      return [];
    }

    const response = await this.client
      .from("notification_deliveries")
      .update({ seen_at: input.seenAt })
      .eq("game_session_id", input.gameSessionId)
      .eq("player_id", input.playerId)
      .in("id", input.deliveryIds)
      .is("seen_at", null)
      .select(DELIVERY_SELECT);

    assertNoQueryError(response);

    const rows =
      (response.data ?? []) as unknown as readonly NotificationDeliveryRow[];
    assertDeliveryScope(rows, input.gameSessionId, input.playerId);

    if (rows.some((row) => row.seen_at !== input.seenAt)) {
      throw new PlayerNotificationPersistenceError(
        "player_notification_read_state_invalid",
        "Notifications could not be marked read.",
      );
    }

    return rows.map(toDeliveryStateRecord);
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

function toCursorFilter(
  cursor: { readonly deliveredAt: string; readonly deliveryId: string },
): string {
  return `delivered_at.lt.${cursor.deliveredAt},and(delivered_at.eq.${cursor.deliveredAt},id.lt.${cursor.deliveryId})`;
}

function toPlayerNotificationRecord(
  delivery: NotificationDeliveryRow,
  notification: NotificationRow,
): PlayerNotificationRecord {
  return {
    deliveryId: delivery.id,
    notificationId: delivery.notification_id,
    gameSessionId: delivery.game_session_id,
    playerId: delivery.player_id,
    sourceType: notification.source_type,
    sourceId: notification.source_id ?? null,
    notificationType: notification.notification_type,
    title: notification.title,
    summary: notification.summary,
    priority: notification.priority,
    displayMode: notification.display_mode,
    publishedAt: notification.published_at,
    deliveredAt: delivery.delivered_at,
    seenAt: delivery.seen_at ?? null,
    dismissedAt: delivery.dismissed_at ?? null,
    acknowledgedAt: delivery.acknowledged_at ?? null,
  };
}

function toDeliveryStateRecord(
  row: NotificationDeliveryRow,
): PlayerNotificationDeliveryStateRecord {
  return {
    deliveryId: row.id,
    notificationId: row.notification_id,
    gameSessionId: row.game_session_id,
    playerId: row.player_id,
    deliveredAt: row.delivered_at,
    seenAt: row.seen_at ?? null,
    dismissedAt: row.dismissed_at ?? null,
    acknowledgedAt: row.acknowledged_at ?? null,
  };
}

function assertDeliveryScope(
  rows: readonly NotificationDeliveryRow[],
  gameSessionId: string,
  playerId: string,
): void {
  if (
    rows.some((row) =>
      row.game_session_id !== gameSessionId || row.player_id !== playerId
    )
  ) {
    throw new PlayerNotificationPersistenceError(
      "player_notification_scope_violation",
      "Player notifications could not be loaded.",
    );
  }
}

function assertNoQueryError(response: QueryResponse<unknown>): void {
  if (response.error) {
    throw new PlayerNotificationPersistenceError(
      "player_notification_query_failed",
      "Player notification request failed.",
    );
  }
}

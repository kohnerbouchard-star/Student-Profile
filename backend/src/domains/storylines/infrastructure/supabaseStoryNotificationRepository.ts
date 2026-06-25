import type { JsonObject } from "../../../supabase/tableTypes.ts";
import type {
  CreateNotificationDeliveriesInput,
  CreateNotificationDeliveriesResult,
  CreateStoryNotificationInput,
  CreateStoryNotificationResult,
  ListUnseenStoryCutsceneDeliveriesInput,
  MarkNotificationDeliveryInput,
  StoryNotificationDeliveryRecord,
  StoryNotificationDeliveryWithNotification,
  StoryNotificationRecord,
  StoryNotificationRepository,
} from "../contracts/storyNotificationContracts.ts";
import { StoryNotificationRepositoryError } from "../contracts/storyNotificationContracts.ts";

type StoryNotificationTableName = "notifications" | "notification_deliveries";

interface SupabaseStoryNotificationQueryError {
  readonly message: string;
  readonly code?: string;
  readonly details?: string | null;
  readonly hint?: string | null;
}

interface SupabaseStoryNotificationQueryResponse<T = unknown> {
  readonly data: T | null;
  readonly error: SupabaseStoryNotificationQueryError | null;
}

interface SupabaseStoryNotificationClient {
  from(
    tableName: StoryNotificationTableName,
  ): SupabaseStoryNotificationQueryBuilder;
}

interface SupabaseStoryNotificationQueryBuilder {
  select(columns: string): SupabaseStoryNotificationFilterBuilder;
  insert(row: unknown): SupabaseStoryNotificationWriteBuilder;
  update(row: unknown): SupabaseStoryNotificationUpdateBuilder;
}

interface SupabaseStoryNotificationFilterBuilder
  extends PromiseLike<SupabaseStoryNotificationQueryResponse<unknown[]>> {
  eq(column: string, value: unknown): SupabaseStoryNotificationFilterBuilder;
  in(
    column: string,
    values: readonly unknown[],
  ): SupabaseStoryNotificationFilterBuilder;
  is(column: string, value: null): SupabaseStoryNotificationFilterBuilder;
  order(
    column: string,
    options?: { readonly ascending?: boolean },
  ): SupabaseStoryNotificationFilterBuilder;
  maybeSingle(): PromiseLike<SupabaseStoryNotificationQueryResponse<unknown>>;
}

interface SupabaseStoryNotificationWriteBuilder {
  select(columns: string): SupabaseStoryNotificationWriteSelectBuilder;
}

interface SupabaseStoryNotificationWriteSelectBuilder {
  maybeSingle(): PromiseLike<SupabaseStoryNotificationQueryResponse<unknown>>;
}

interface SupabaseStoryNotificationUpdateBuilder {
  eq(column: string, value: unknown): SupabaseStoryNotificationUpdateBuilder;
  select(columns: string): SupabaseStoryNotificationWriteSelectBuilder;
}

interface NotificationRow {
  readonly id: string;
  readonly game_session_id: string;
  readonly source_type: string;
  readonly source_id?: string | null;
  readonly notification_type: string;
  readonly title: string;
  readonly summary: string;
  readonly priority: string;
  readonly display_mode: string;
  readonly payload: JsonObject;
  readonly published_at: string;
}

interface NotificationDeliveryRow {
  readonly id: string;
  readonly notification_id: string;
  readonly game_session_id: string;
  readonly player_id: string;
  readonly delivered_at: string;
  readonly seen_at?: string | null;
  readonly dismissed_at?: string | null;
  readonly acknowledged_at?: string | null;
}

const NOTIFICATION_SELECT = [
  "id",
  "game_session_id",
  "source_type",
  "source_id",
  "notification_type",
  "title",
  "summary",
  "priority",
  "display_mode",
  "payload",
  "published_at",
].join(",");

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

const MODAL_CUTSCENE_DISPLAY_MODES = [
  "modal_immediate",
  "modal_on_next_login",
] as const;

export class SupabaseStoryNotificationRepository
  implements StoryNotificationRepository {
  constructor(private readonly client: SupabaseStoryNotificationClient) {}

  async createStoryNotification(
    input: CreateStoryNotificationInput,
  ): Promise<CreateStoryNotificationResult> {
    const row = {
      game_session_id: input.gameSessionId,
      source_type: input.sourceType,
      source_id: input.sourceId,
      notification_type: input.notificationType,
      title: input.title,
      summary: input.summary,
      priority: input.priority,
      display_mode: input.displayMode,
      payload: input.payload,
      published_at: input.publishedAt,
    };
    const response = await this.client
      .from("notifications")
      .insert(row)
      .select(NOTIFICATION_SELECT)
      .maybeSingle();

    if (response.error?.code === "23505" && input.sourceId) {
      return {
        status: "existing",
        notification: await this.readExistingNotification(input),
      };
    }

    assertNoError(response, "notifications", "insert");

    if (!response.data) {
      throw repositoryError(
        "story_notification_insert_missing_row",
        "Story notification insert returned no row.",
        "notifications",
        "insert",
      );
    }

    return {
      status: "inserted",
      notification: toNotificationRecord(response.data as NotificationRow),
    };
  }

  async createNotificationDeliveries(
    input: CreateNotificationDeliveriesInput,
  ): Promise<CreateNotificationDeliveriesResult> {
    const deliveryIds: string[] = [];
    let insertedCount = 0;
    let existingCount = 0;

    for (const playerId of uniquePlayerIds(input.playerIds)) {
      const response = await this.client
        .from("notification_deliveries")
        .insert({
          notification_id: input.notificationId,
          game_session_id: input.gameSessionId,
          player_id: playerId,
          delivered_at: input.deliveredAt,
        })
        .select(DELIVERY_SELECT)
        .maybeSingle();

      if (response.error?.code === "23505") {
        const existing = await this.readExistingDelivery(
          input.gameSessionId,
          input.notificationId,
          playerId,
        );
        deliveryIds.push(existing.id);
        existingCount += 1;
        continue;
      }

      assertNoError(response, "notification_deliveries", "insert");

      if (!response.data) {
        throw repositoryError(
          "story_notification_delivery_insert_missing_row",
          "Notification delivery insert returned no row.",
          "notification_deliveries",
          "insert",
        );
      }

      deliveryIds.push(
        toDeliveryRecord(response.data as NotificationDeliveryRow).id,
      );
      insertedCount += 1;
    }

    return {
      deliveryIds,
      insertedCount,
      existingCount,
    };
  }

  async listUnseenStoryCutsceneDeliveries(
    input: ListUnseenStoryCutsceneDeliveriesInput,
  ): Promise<readonly StoryNotificationDeliveryWithNotification[]> {
    const deliveryResponse = await this.client
      .from("notification_deliveries")
      .select(DELIVERY_SELECT)
      .eq("game_session_id", input.gameSessionId)
      .eq("player_id", input.playerId)
      .is("seen_at", null)
      .is("dismissed_at", null);

    assertNoError(
      deliveryResponse,
      "notification_deliveries",
      "select",
    );

    const deliveries = (deliveryResponse.data ?? [])
      .map((row) => toDeliveryRecord(row as NotificationDeliveryRow));
    const notificationIds = deliveries.map((delivery) =>
      delivery.notificationId
    );

    if (notificationIds.length === 0) {
      return [];
    }

    const notificationResponse = await this.client
      .from("notifications")
      .select(NOTIFICATION_SELECT)
      .eq("game_session_id", input.gameSessionId)
      .in("id", notificationIds);

    assertNoError(notificationResponse, "notifications", "select");

    const notificationById = new Map(
      (notificationResponse.data ?? [])
        .map((row) => toNotificationRecord(row as NotificationRow))
        .filter((notification) =>
          notification.notificationType === "story_cutscene" &&
          MODAL_CUTSCENE_DISPLAY_MODES.includes(
            notification
              .displayMode as typeof MODAL_CUTSCENE_DISPLAY_MODES[number],
          )
        )
        .map((notification) => [notification.id, notification]),
    );

    return deliveries
      .flatMap((delivery) => {
        const notification = notificationById.get(delivery.notificationId);

        return notification ? [{ ...delivery, notification }] : [];
      })
      .sort(compareUnseenCutsceneDeliveries);
  }

  markNotificationDeliverySeen(
    input: MarkNotificationDeliveryInput,
  ): Promise<StoryNotificationDeliveryRecord> {
    return this.markDelivery(input, { seen_at: input.markedAt }, "seen");
  }

  markNotificationDeliveryDismissed(
    input: MarkNotificationDeliveryInput,
  ): Promise<StoryNotificationDeliveryRecord> {
    return this.markDelivery(
      input,
      { dismissed_at: input.markedAt },
      "dismissed",
    );
  }

  markNotificationDeliveryAcknowledged(
    input: MarkNotificationDeliveryInput,
  ): Promise<StoryNotificationDeliveryRecord> {
    return this.markDelivery(
      input,
      { acknowledged_at: input.markedAt },
      "acknowledged",
    );
  }

  private async markDelivery(
    input: MarkNotificationDeliveryInput,
    values: Record<string, string>,
    operation: string,
  ): Promise<StoryNotificationDeliveryRecord> {
    const response = await this.client
      .from("notification_deliveries")
      .update(values)
      .eq("id", input.deliveryId)
      .eq("game_session_id", input.gameSessionId)
      .eq("player_id", input.playerId)
      .select(DELIVERY_SELECT)
      .maybeSingle();

    assertNoError(response, "notification_deliveries", operation);

    if (!response.data) {
      throw repositoryError(
        "story_notification_delivery_not_found",
        "Notification delivery was not found.",
        "notification_deliveries",
        operation,
      );
    }

    return toDeliveryRecord(response.data as NotificationDeliveryRow);
  }

  private async readExistingNotification(
    input: CreateStoryNotificationInput,
  ): Promise<StoryNotificationRecord> {
    const response = await this.client
      .from("notifications")
      .select(NOTIFICATION_SELECT)
      .eq("game_session_id", input.gameSessionId)
      .eq("source_type", input.sourceType)
      .eq("source_id", input.sourceId)
      .eq("notification_type", input.notificationType)
      .maybeSingle();

    assertNoError(response, "notifications", "select");

    if (!response.data) {
      throw repositoryError(
        "story_notification_conflict_missing_row",
        "Story notification already exists but could not be loaded.",
        "notifications",
        "select",
      );
    }

    return toNotificationRecord(response.data as NotificationRow);
  }

  private async readExistingDelivery(
    gameSessionId: string,
    notificationId: string,
    playerId: string,
  ): Promise<StoryNotificationDeliveryRecord> {
    const response = await this.client
      .from("notification_deliveries")
      .select(DELIVERY_SELECT)
      .eq("game_session_id", gameSessionId)
      .eq("notification_id", notificationId)
      .eq("player_id", playerId)
      .maybeSingle();

    assertNoError(response, "notification_deliveries", "select");

    if (!response.data) {
      throw repositoryError(
        "story_notification_delivery_conflict_missing_row",
        "Notification delivery already exists but could not be loaded.",
        "notification_deliveries",
        "select",
      );
    }

    return toDeliveryRecord(response.data as NotificationDeliveryRow);
  }
}

function toNotificationRecord(row: NotificationRow): StoryNotificationRecord {
  return {
    id: row.id,
    gameSessionId: row.game_session_id,
    sourceType: row.source_type,
    sourceId: row.source_id ?? null,
    notificationType: row.notification_type,
    title: row.title,
    summary: row.summary,
    priority: row.priority,
    displayMode: row.display_mode,
    payload: row.payload,
    publishedAt: row.published_at,
  };
}

function toDeliveryRecord(
  row: NotificationDeliveryRow,
): StoryNotificationDeliveryRecord {
  return {
    id: row.id,
    notificationId: row.notification_id,
    gameSessionId: row.game_session_id,
    playerId: row.player_id,
    deliveredAt: row.delivered_at,
    seenAt: row.seen_at ?? null,
    dismissedAt: row.dismissed_at ?? null,
    acknowledgedAt: row.acknowledged_at ?? null,
  };
}

function compareUnseenCutsceneDeliveries(
  left: StoryNotificationDeliveryWithNotification,
  right: StoryNotificationDeliveryWithNotification,
): number {
  const priorityDelta = priorityRank(right.notification.priority) -
    priorityRank(left.notification.priority);

  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  return Date.parse(right.notification.publishedAt) -
    Date.parse(left.notification.publishedAt);
}

function priorityRank(priority: string): number {
  if (priority === "critical") {
    return 4;
  }

  if (priority === "major") {
    return 3;
  }

  if (priority === "normal") {
    return 2;
  }

  return 1;
}

function uniquePlayerIds(playerIds: readonly string[]): readonly string[] {
  return [...new Set(playerIds.filter((playerId) => playerId.trim()))];
}

function assertNoError(
  response: SupabaseStoryNotificationQueryResponse<unknown>,
  tableName: StoryNotificationTableName,
  operation: string,
): void {
  if (response.error) {
    throw repositoryError(
      "story_notification_repository_query_failed",
      response.error.message || "Story notification repository query failed.",
      tableName,
      operation,
    );
  }
}

function repositoryError(
  code: string,
  message: string,
  tableName: StoryNotificationTableName,
  operation: string,
): StoryNotificationRepositoryError {
  return new StoryNotificationRepositoryError(
    code,
    message,
    tableName,
    operation,
  );
}

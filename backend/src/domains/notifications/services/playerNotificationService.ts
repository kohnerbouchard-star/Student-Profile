import {
  type PlayerNotificationCursor,
  type PlayerNotificationDeliveryStateRecord,
  PlayerNotificationError,
  type PlayerNotificationItemDto,
  type PlayerNotificationListQuery,
  type PlayerNotificationReadCommand,
  type PlayerNotificationReadResponseBody,
  type PlayerNotificationRecord,
  type PlayerNotificationRepository,
  type PlayerNotificationScope,
  PlayerNotificationPersistenceError,
} from "../contracts/playerNotificationContracts.ts";

export interface PlayerNotificationListServiceResult {
  readonly items: readonly PlayerNotificationItemDto[];
  readonly unreadCount: number;
  readonly hasMore: boolean;
  readonly nextCursor: PlayerNotificationCursor | null;
}

export class PlayerNotificationService {
  constructor(private readonly repository: PlayerNotificationRepository) {}

  async listNotifications(
    scope: PlayerNotificationScope,
    query: PlayerNotificationListQuery,
  ): Promise<PlayerNotificationListServiceResult> {
    try {      const [records, unreadCount] = await Promise.all([
      this.repository.listNotifications({
        gameId: scope.gameId,
        playerUuid: scope.playerUuid,
        status: query.status,
        limit: query.limit + 1,
        cursor: query.cursor,
      }),
      this.repository.countUnreadNotifications
        ? this.repository.countUnreadNotifications({
          gameId: scope.gameId,
          playerUuid: scope.playerUuid,
        })
        : Promise.resolve<number | null>(null),
    ]);
    validateRecordScope(records, scope);

      const ordered = [...records].sort(compareNotifications);
      if (ordered.length > query.limit + 1) throw scopeViolation();
      const publicDeliveryIds = ordered.map((record) => record.publicDeliveryId);
      if (new Set(publicDeliveryIds).size !== publicDeliveryIds.length) {
        throw scopeViolation();
      }
      for (const record of ordered) validateStatus(record, query.status);

      const hasMore = ordered.length > query.limit;
      const page = ordered.slice(0, query.limit);
      const last = page.at(-1);      const fallbackUnreadCount = query.status === "unread" && !hasMore
      ? page.length
      : 0;
    return {
      items: page.map(toItemDto),
      unreadCount: requireUnreadCount(unreadCount ?? fallbackUnreadCount),
      hasMore,
      nextCursor: hasMore && last
        ? {
          deliveredAt: last.deliveredAt,
          publicDeliveryId: last.publicDeliveryId,
        }
        : null,
    };
    } catch (error) {
      throw mapServiceError(error);
    }
  }

  async markNotificationsRead(
    scope: PlayerNotificationScope,
    command: PlayerNotificationReadCommand,
  ): Promise<PlayerNotificationReadResponseBody> {
    try {
      const existing = await this.repository.readDeliveriesByPublicIds({
        gameId: scope.gameId,
        playerUuid: scope.playerUuid,
        publicDeliveryIds: command.publicDeliveryIds,
      });
      validateDeliveryScope(existing, scope);
      requireExactDeliverySet(existing, command.publicDeliveryIds);

      const unreadIds = existing
        .filter((delivery) => delivery.seenAt === null)
        .map((delivery) => delivery.publicDeliveryId);
      const updated = await this.repository.markDeliveriesRead({
        gameId: scope.gameId,
        playerUuid: scope.playerUuid,
        publicDeliveryIds: unreadIds,
        seenAt: scope.effectiveAt,
      });
      validateDeliveryScope(updated, scope);
      if (
        updated.some((delivery) =>
          !unreadIds.includes(delivery.publicDeliveryId) ||
          delivery.seenAt !== scope.effectiveAt
        )
      ) {
        throw scopeViolation();
      }

      const finalDeliveries = await this.repository.readDeliveriesByPublicIds({
        gameId: scope.gameId,
        playerUuid: scope.playerUuid,
        publicDeliveryIds: command.publicDeliveryIds,
      });
      validateDeliveryScope(finalDeliveries, scope);
      requireExactDeliverySet(finalDeliveries, command.publicDeliveryIds);
      if (finalDeliveries.some((delivery) => delivery.seenAt === null)) {
        throw new PlayerNotificationError(
          "player_notification_read_conflict",
          "Notification delivery state changed during the request.",
          409,
          true,
        );
      }

      const finalByPublicId = new Map(
        finalDeliveries.map((delivery) => [
          delivery.publicDeliveryId,
          delivery,
        ]),
      );
      const updatedIds = new Set(
        updated.map((delivery) => delivery.publicDeliveryId),
      );

      return {
        ok: true,
        message: "Notifications marked read.",
        requestedCount: command.publicDeliveryIds.length,
        newlyReadCount: updatedIds.size,
        alreadyReadCount: command.publicDeliveryIds.length - updatedIds.size,
        processedAt: scope.effectiveAt,
        deliveries: command.publicDeliveryIds.map((publicDeliveryId) => {
          const delivery = finalByPublicId.get(publicDeliveryId);
          if (!delivery?.seenAt) throw scopeViolation();
          return {
            deliveryId: delivery.publicDeliveryId,
            notificationId: delivery.publicNotificationId,
            seenAt: delivery.seenAt,
          };
        }),
      };
    } catch (error) {
      throw mapServiceError(error);
    }
  }
}

function toItemDto(record: PlayerNotificationRecord): PlayerNotificationItemDto {
  return {
    id: record.publicDeliveryId,
    deliveryId: record.publicDeliveryId,
    notificationId: record.publicNotificationId,
    sourceType: record.sourceType,
    notificationType: record.notificationType,
    title: record.title,
    summary: record.summary,
    priority: record.priority,
    displayMode: record.displayMode,
    status: record.dismissedAt
      ? "dismissed"
      : record.seenAt
      ? "read"
      : "unread",
    publishedAt: record.publishedAt,
    deliveredAt: record.deliveredAt,
    seenAt: record.seenAt,
    dismissedAt: record.dismissedAt,
    acknowledgedAt: record.acknowledgedAt,
  };
}

function requireUnreadCount(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw scopeViolation();
  return value;
}

function compareNotifications(
  left: PlayerNotificationRecord,
  right: PlayerNotificationRecord,
): number {
  const timeOrder = Date.parse(right.deliveredAt) - Date.parse(left.deliveredAt);
  return timeOrder || right.publicDeliveryId.localeCompare(left.publicDeliveryId);
}

function validateStatus(
  record: PlayerNotificationRecord,
  status: PlayerNotificationListQuery["status"],
): void {
  if (
    (status === "unread" &&
      (record.seenAt !== null || record.dismissedAt !== null)) ||
    (status === "read" &&
      (record.seenAt === null || record.dismissedAt !== null)) ||
    (status === "dismissed" && record.dismissedAt === null)
  ) {
    throw scopeViolation();
  }
}

function validateRecordScope(
  records: readonly PlayerNotificationRecord[],
  scope: PlayerNotificationScope,
): void {
  if (
    records.some((record) =>
      record.gameId !== scope.gameId || record.playerUuid !== scope.playerUuid
    )
  ) {
    throw scopeViolation();
  }
}

function validateDeliveryScope(
  records: readonly PlayerNotificationDeliveryStateRecord[],
  scope: PlayerNotificationScope,
): void {
  if (
    records.some((record) =>
      record.gameId !== scope.gameId || record.playerUuid !== scope.playerUuid
    )
  ) {
    throw scopeViolation();
  }
}

function requireExactDeliverySet(
  records: readonly PlayerNotificationDeliveryStateRecord[],
  expectedPublicIds: readonly string[],
): void {
  const actual = new Set(records.map((record) => record.publicDeliveryId));
  if (
    actual.size !== expectedPublicIds.length ||
    expectedPublicIds.some((publicId) => !actual.has(publicId))
  ) {
    throw new PlayerNotificationError(
      "player_notification_deliveries_not_found",
      "One or more notification deliveries were not found for the authenticated player.",
      404,
      false,
    );
  }
}

function mapServiceError(error: unknown): Error {
  if (error instanceof PlayerNotificationError) return error;
  if (error instanceof PlayerNotificationPersistenceError) {
    return new PlayerNotificationError(
      "player_notification_service_unavailable",
      "Player notifications are temporarily unavailable.",
      503,
      true,
    );
  }
  return error instanceof Error ? error : new Error("Player notification failure.");
}

function scopeViolation(): PlayerNotificationError {
  return new PlayerNotificationError(
    "player_notification_scope_violation",
    "Player notification request failed.",
    500,
    false,
  );
}

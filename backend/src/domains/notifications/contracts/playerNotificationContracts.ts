export const PLAYER_NOTIFICATION_STATUSES = [
  "unread",
  "read",
  "dismissed",
  "all",
] as const;

export type PlayerNotificationStatus =
  typeof PLAYER_NOTIFICATION_STATUSES[number];

export type PlayerNotificationRoute =
  | { readonly kind: "list" }
  | { readonly kind: "markRead" }
  | { readonly kind: "malformed" };

export interface PlayerNotificationCursor {
  readonly deliveredAt: string;
  readonly publicDeliveryId: string;
}

export interface PlayerNotificationScope {
  readonly gameId: string;
  readonly playerUuid: string;
  readonly effectiveAt: string;
}

export interface PlayerNotificationListQuery {
  readonly status: PlayerNotificationStatus;
  readonly limit: number;
  readonly cursor: PlayerNotificationCursor | null;
}

export interface PlayerNotificationReadCommand {
  readonly publicDeliveryIds: readonly string[];
}

export interface PlayerNotificationRecord {
  readonly internalDeliveryUuid: string;
  readonly internalNotificationUuid: string;
  readonly publicDeliveryId: string;
  readonly publicNotificationId: string;
  readonly gameId: string;
  readonly playerUuid: string;
  readonly sourceType: string;
  readonly notificationType: string;
  readonly title: string;
  readonly summary: string;
  readonly priority: string;
  readonly displayMode: string;
  readonly publishedAt: string;
  readonly deliveredAt: string;
  readonly seenAt: string | null;
  readonly dismissedAt: string | null;
  readonly acknowledgedAt: string | null;
}

export interface PlayerNotificationDeliveryStateRecord {
  readonly internalDeliveryUuid: string;
  readonly internalNotificationUuid: string;
  readonly publicDeliveryId: string;
  readonly publicNotificationId: string;
  readonly gameId: string;
  readonly playerUuid: string;
  readonly deliveredAt: string;
  readonly seenAt: string | null;
  readonly dismissedAt: string | null;
  readonly acknowledgedAt: string | null;
}

export interface PlayerNotificationRepository {
  listNotifications(input: {
    readonly gameId: string;
    readonly playerUuid: string;
    readonly status: PlayerNotificationStatus;
    readonly limit: number;
    readonly cursor: PlayerNotificationCursor | null;
  }): Promise<readonly PlayerNotificationRecord[]>;

  countUnreadNotifications?(input: {
    readonly gameId: string;
    readonly playerUuid: string;
  }): Promise<number>;

  readDeliveriesByPublicIds(input: {
    readonly gameId: string;
    readonly playerUuid: string;
    readonly publicDeliveryIds: readonly string[];
  }): Promise<readonly PlayerNotificationDeliveryStateRecord[]>;

  markDeliveriesRead(input: {
    readonly gameId: string;
    readonly playerUuid: string;
    readonly publicDeliveryIds: readonly string[];
    readonly seenAt: string;
  }): Promise<readonly PlayerNotificationDeliveryStateRecord[]>;
}

export interface PlayerNotificationItemDto {
  readonly id: string;
  readonly deliveryId: string;
  readonly notificationId: string;
  readonly sourceType: string;
  readonly notificationType: string;
  readonly title: string;
  readonly summary: string;
  readonly priority: string;
  readonly displayMode: string;
  readonly status: Exclude<PlayerNotificationStatus, "all">;
  readonly publishedAt: string;
  readonly deliveredAt: string;
  readonly seenAt: string | null;
  readonly dismissedAt: string | null;
  readonly acknowledgedAt: string | null;
}

export interface PlayerNotificationListResponseBody {
  readonly ok: true;
  readonly generatedAt: string;
  readonly availability: "available";
  readonly filter: {
    readonly status: PlayerNotificationStatus;
    readonly limit: number;
  };
  readonly page: {
    readonly returned: number;
    readonly hasMore: boolean;
    readonly nextCursor: string | null;
  };
  readonly summary: {
    readonly unreadCount: number;
  };
  readonly items: readonly PlayerNotificationItemDto[];
  readonly emptyState: {
    readonly reason: "notifications_empty";
  } | null;
}

export interface PlayerNotificationReadDeliveryDto {
  readonly deliveryId: string;
  readonly notificationId: string;
  readonly seenAt: string;
}

export interface PlayerNotificationReadResponseBody {
  readonly ok: true;
  readonly message: "Notifications marked read.";
  readonly requestedCount: number;
  readonly newlyReadCount: number;
  readonly alreadyReadCount: number;
  readonly processedAt: string;
  readonly deliveries: readonly PlayerNotificationReadDeliveryDto[];
}

export class PlayerNotificationError extends Error {
  constructor(
    readonly code:
      | "invalid_player_notification_request"
      | "player_notification_scope_violation"
      | "player_notification_deliveries_not_found"
      | "player_notification_read_conflict"
      | "player_notification_service_unavailable",
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "PlayerNotificationError";
  }
}

export class PlayerNotificationPersistenceError extends Error {
  constructor(
    readonly code:
      | "player_notification_schema_not_applied"
      | "player_notification_read_failed"
      | "player_notification_metadata_missing"
      | "player_notification_write_failed",
    message: string,
  ) {
    super(message);
    this.name = "PlayerNotificationPersistenceError";
  }
}

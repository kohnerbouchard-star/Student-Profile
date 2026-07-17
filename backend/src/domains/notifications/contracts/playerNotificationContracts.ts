export const PLAYER_NOTIFICATION_STATUSES = [
  "unread",
  "read",
  "dismissed",
  "all",
] as const;

export type PlayerNotificationStatus =
  typeof PLAYER_NOTIFICATION_STATUSES[number];

export interface PlayerNotificationCursor {
  readonly deliveredAt: string;
  readonly deliveryId: string;
}

export interface ListPlayerNotificationsInput {
  readonly gameSessionId: string;
  readonly playerId: string;
  readonly status: PlayerNotificationStatus;
  readonly limit: number;
  readonly cursor: PlayerNotificationCursor | null;
}

export interface ReadPlayerNotificationDeliveriesInput {
  readonly gameSessionId: string;
  readonly playerId: string;
  readonly deliveryIds: readonly string[];
}

export interface MarkPlayerNotificationDeliveriesReadInput
  extends ReadPlayerNotificationDeliveriesInput {
  readonly seenAt: string;
}

export interface PlayerNotificationRecord {
  readonly deliveryId: string;
  readonly notificationId: string;
  readonly gameSessionId: string;
  readonly playerId: string;
  readonly sourceType: string;
  readonly sourceId: string | null;
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

export interface PlayerNotificationPage {
  readonly records: readonly PlayerNotificationRecord[];
  readonly hasMore: boolean;
  readonly nextCursor: PlayerNotificationCursor | null;
}

export interface PlayerNotificationItemDto {
  readonly id: string;
  readonly deliveryId: string;
  readonly notificationId: string;
  readonly sourceType: string;
  readonly sourceId: string | null;
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
  readonly gameSession: {
    readonly id: string;
    readonly name: string;
    readonly status: string;
  };
  readonly player: {
    readonly id: string;
    readonly displayName: string;
    readonly rosterLabel: string | null;
    readonly status: string;
  };
  readonly generatedAt: string;
  readonly filter: {
    readonly status: PlayerNotificationStatus;
    readonly limit: number;
  };
  readonly page: {
    readonly hasMore: boolean;
    readonly nextCursor: string | null;
  };
  readonly items: readonly PlayerNotificationItemDto[];
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

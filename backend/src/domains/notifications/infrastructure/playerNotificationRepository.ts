import type {
  ListPlayerNotificationsInput,
  MarkPlayerNotificationDeliveriesReadInput,
  PlayerNotificationPage,
  ReadPlayerNotificationDeliveriesInput,
} from "../contracts/playerNotificationContracts.ts";

export interface PlayerNotificationDeliveryStateRecord {
  readonly deliveryId: string;
  readonly notificationId: string;
  readonly gameSessionId: string;
  readonly playerId: string;
  readonly deliveredAt: string;
  readonly seenAt: string | null;
  readonly dismissedAt: string | null;
  readonly acknowledgedAt: string | null;
}

export interface PlayerNotificationRepository {
  readonly listPlayerNotifications: (
    input: ListPlayerNotificationsInput,
  ) => Promise<PlayerNotificationPage>;

  readonly readPlayerDeliveriesByIds: (
    input: ReadPlayerNotificationDeliveriesInput,
  ) => Promise<readonly PlayerNotificationDeliveryStateRecord[]>;

  readonly markPlayerDeliveriesRead: (
    input: MarkPlayerNotificationDeliveriesReadInput,
  ) => Promise<readonly PlayerNotificationDeliveryStateRecord[]>;
}

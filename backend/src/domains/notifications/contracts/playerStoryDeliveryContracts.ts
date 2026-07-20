export const PLAYER_STORY_DELIVERY_ACTIONS = [
  "seen",
  "dismissed",
  "acknowledged",
] as const;

export type PlayerStoryDeliveryAction =
  typeof PLAYER_STORY_DELIVERY_ACTIONS[number];

export type PlayerStoryDeliveryRoute =
  | { readonly kind: "list" }
  | {
      readonly kind: "state";
      readonly publicDeliveryId: string;
    }
  | { readonly kind: "malformed" };

export interface PlayerStoryDeliveryScope {
  readonly gameId: string;
  readonly playerUuid: string;
  readonly effectiveAt: string;
}

export interface PlayerStoryCutsceneContentDto {
  readonly videoAssetKey: string;
  readonly posterAssetKey: string | null;
  readonly tone: string | null;
  readonly act: number | null;
  readonly sequence: number | null;
}

export type PlayerStoryDeliveryCategory = "story";

export interface PlayerStoryDeliveryRecord {
  readonly internalDeliveryUuid: string;
  readonly internalNotificationUuid: string;
  readonly publicDeliveryId: string;
  readonly publicNotificationId: string;
  readonly gameId: string;
  readonly playerUuid: string;
  readonly category: PlayerStoryDeliveryCategory;
  readonly title: string;
  readonly summary: string;
  readonly priority: string;
  readonly displayMode: "modal_immediate" | "modal_on_next_login";
  readonly publishedAt: string;
  readonly deliveredAt: string;
  readonly seenAt: string | null;
  readonly dismissedAt: string | null;
  readonly acknowledgedAt: string | null;
  readonly requiresAcknowledgement: boolean;
  readonly content: PlayerStoryCutsceneContentDto;
}

export interface PlayerStoryDeliveryStateRecord {
  readonly publicDeliveryId: string;
  readonly publicNotificationId: string;
  readonly deliveredAt: string;
  readonly seenAt: string | null;
  readonly dismissedAt: string | null;
  readonly acknowledgedAt: string | null;
  readonly requiresAcknowledgement: boolean;
}

export interface PlayerStoryDeliveryRepository {
  listPendingDeliveries(input: {
    readonly gameId: string;
    readonly playerUuid: string;
    readonly limit: number;
  }): Promise<readonly PlayerStoryDeliveryRecord[]>;

  updateDeliveryState(input: {
    readonly gameId: string;
    readonly playerUuid: string;
    readonly publicDeliveryId: string;
    readonly action: PlayerStoryDeliveryAction;
    readonly markedAt: string;
  }): Promise<PlayerStoryDeliveryStateRecord>;
}

export interface PlayerStoryDeliveryItemDto {
  readonly deliveryId: string;
  readonly notificationId: string;
  readonly category: PlayerStoryDeliveryCategory;
  readonly title: string;
  readonly summary: string;
  readonly priority: string;
  readonly displayMode: "modal_immediate" | "modal_on_next_login";
  readonly publishedAt: string;
  readonly deliveredAt: string;
  readonly seenAt: string | null;
  readonly acknowledgedAt: string | null;
  readonly requiresAcknowledgement: boolean;
  readonly content: PlayerStoryCutsceneContentDto;
}

export interface PlayerStoryDeliveryListResponseBody {
  readonly ok: true;
  readonly generatedAt: string;
  readonly items: readonly PlayerStoryDeliveryItemDto[];
  readonly emptyState: {
    readonly reason: "story_deliveries_empty";
  } | null;
}

export interface PlayerStoryDeliveryStateResponseBody {
  readonly ok: true;
  readonly action: PlayerStoryDeliveryAction;
  readonly processedAt: string;
  readonly delivery: {
    readonly deliveryId: string;
    readonly notificationId: string;
    readonly deliveredAt: string;
    readonly seenAt: string | null;
    readonly dismissedAt: string | null;
    readonly acknowledgedAt: string | null;
    readonly requiresAcknowledgement: boolean;
  };
}

export class PlayerStoryDeliveryError extends Error {
  constructor(
    readonly code:
      | "invalid_player_story_delivery_request"
      | "player_story_delivery_not_found"
      | "player_story_delivery_acknowledgement_required"
      | "player_story_delivery_conflict"
      | "player_story_delivery_service_unavailable",
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "PlayerStoryDeliveryError";
  }
}

export class PlayerStoryDeliveryPersistenceError extends Error {
  constructor(
    readonly code:
      | "player_story_delivery_schema_not_applied"
      | "player_story_delivery_read_failed"
      | "player_story_delivery_write_failed"
      | "player_story_delivery_payload_invalid",
    message: string,
  ) {
    super(message);
    this.name = "PlayerStoryDeliveryPersistenceError";
  }
}

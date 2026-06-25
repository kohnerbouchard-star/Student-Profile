import type { JsonObject } from "../../../supabase/tableTypes.ts";
import type { StoryRevealPayload } from "./storyEffectContracts.ts";

export const STORY_NOTIFICATION_TYPES = [
  "story_cutscene",
  "story_impact",
  "policy_changed",
  "contract_unlocked",
] as const;

export const STORY_NOTIFICATION_DISPLAY_MODES = [
  "notification_only",
  "modal_immediate",
  "modal_on_next_login",
] as const;

export const STORY_NOTIFICATION_PRIORITIES = [
  "low",
  "normal",
  "major",
  "critical",
] as const;

export type StoryNotificationType = typeof STORY_NOTIFICATION_TYPES[number];
export type StoryNotificationDisplayMode =
  typeof STORY_NOTIFICATION_DISPLAY_MODES[number];
export type StoryNotificationPriority =
  typeof STORY_NOTIFICATION_PRIORITIES[number];

export interface StoryNotificationRepository {
  createStoryNotification(
    input: CreateStoryNotificationInput,
  ): Promise<CreateStoryNotificationResult>;

  createNotificationDeliveries(
    input: CreateNotificationDeliveriesInput,
  ): Promise<CreateNotificationDeliveriesResult>;

  listUnseenStoryCutsceneDeliveries(
    input: ListUnseenStoryCutsceneDeliveriesInput,
  ): Promise<readonly StoryNotificationDeliveryWithNotification[]>;

  markNotificationDeliverySeen(
    input: MarkNotificationDeliveryInput,
  ): Promise<StoryNotificationDeliveryRecord>;

  markNotificationDeliveryDismissed(
    input: MarkNotificationDeliveryInput,
  ): Promise<StoryNotificationDeliveryRecord>;

  markNotificationDeliveryAcknowledged(
    input: MarkNotificationDeliveryInput,
  ): Promise<StoryNotificationDeliveryRecord>;
}

export interface CreateStoryNotificationInput {
  readonly gameSessionId: string;
  readonly sourceType: string;
  readonly sourceId: string | null;
  readonly notificationType: StoryNotificationType;
  readonly title: string;
  readonly summary: string;
  readonly priority: StoryNotificationPriority;
  readonly displayMode: StoryNotificationDisplayMode;
  readonly payload: JsonObject;
  readonly publishedAt: string;
}

export type CreateStoryNotificationStatus = "inserted" | "existing";

export interface CreateStoryNotificationResult {
  readonly status: CreateStoryNotificationStatus;
  readonly notification: StoryNotificationRecord;
}

export interface CreateNotificationDeliveriesInput {
  readonly notificationId: string;
  readonly gameSessionId: string;
  readonly playerIds: readonly string[];
  readonly deliveredAt: string;
}

export interface CreateNotificationDeliveriesResult {
  readonly deliveryIds: readonly string[];
  readonly insertedCount: number;
  readonly existingCount: number;
}

export interface ListUnseenStoryCutsceneDeliveriesInput {
  readonly gameSessionId: string;
  readonly playerId: string;
}

export interface MarkNotificationDeliveryInput {
  readonly deliveryId: string;
  readonly gameSessionId: string;
  readonly playerId: string;
  readonly markedAt: string;
}

export interface StoryNotificationRecord {
  readonly id: string;
  readonly gameSessionId: string;
  readonly sourceType: string;
  readonly sourceId: string | null;
  readonly notificationType: StoryNotificationType | string;
  readonly title: string;
  readonly summary: string;
  readonly priority: StoryNotificationPriority | string;
  readonly displayMode: StoryNotificationDisplayMode | string;
  readonly payload: JsonObject;
  readonly publishedAt: string;
}

export interface StoryNotificationDeliveryRecord {
  readonly id: string;
  readonly notificationId: string;
  readonly gameSessionId: string;
  readonly playerId: string;
  readonly deliveredAt: string;
  readonly seenAt: string | null;
  readonly dismissedAt: string | null;
  readonly acknowledgedAt: string | null;
}

export interface StoryNotificationDeliveryWithNotification
  extends StoryNotificationDeliveryRecord {
  readonly notification: StoryNotificationRecord;
}

export interface CreateStoryCutsceneNotificationForPlayersInput {
  readonly gameSessionId: string;
  readonly storylineEventId: string;
  readonly targetPlayerIds: readonly string[];
  readonly reveal: StoryRevealPayload;
  readonly priority: StoryNotificationPriority;
  readonly now: string;
  readonly repository: StoryNotificationRepository;
}

export interface CreateStoryCutsceneNotificationForPlayersResult {
  readonly notificationId: string;
  readonly deliveryCount: number;
  readonly insertedDeliveryCount: number;
  readonly existingDeliveryCount: number;
}

export class StoryNotificationRepositoryError extends Error {
  readonly code: string;
  readonly tableName: string;
  readonly operation: string;

  constructor(
    code: string,
    message: string,
    tableName: string,
    operation: string,
  ) {
    super(message);
    this.name = "StoryNotificationRepositoryError";
    this.code = code;
    this.tableName = tableName;
    this.operation = operation;
  }
}

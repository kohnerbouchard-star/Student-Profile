import type { StoryNotificationRepository } from "../contracts/storyNotificationContracts.ts";
import { SupabaseStoryNotificationRepository } from "../infrastructure/supabaseStoryNotificationRepository.ts";

export { StoryNotificationRepositoryError } from "../contracts/storyNotificationContracts.ts";
export type {
  MarkNotificationDeliveryInput,
  StoryNotificationDeliveryRecord,
} from "../contracts/storyNotificationContracts.ts";

export type StoryNotificationPublisher = Pick<
  StoryNotificationRepository,
  "createStoryNotification" | "createNotificationDeliveries"
>;
export type StoryNotificationDeliveryState = Pick<
  StoryNotificationRepository,
  | "markNotificationDeliverySeen"
  | "markNotificationDeliveryDismissed"
  | "markNotificationDeliveryAcknowledged"
>;
type Client = ConstructorParameters<
  typeof SupabaseStoryNotificationRepository
>[0];

/** Server composition only; no persistence work occurs until a capability is used. */
export function createStoryNotificationPublisher(
  client: Client,
): StoryNotificationPublisher {
  const repository = new SupabaseStoryNotificationRepository(client);
  return {
    createStoryNotification: (input) =>
      repository.createStoryNotification(input),
    createNotificationDeliveries: (input) =>
      repository.createNotificationDeliveries(input),
  };
}

/** Dashboard receives delivery-state actions without notification read/write authority. */
export function createStoryNotificationDeliveryState(
  client: Client,
): StoryNotificationDeliveryState {
  const repository = new SupabaseStoryNotificationRepository(client);
  return {
    markNotificationDeliverySeen: (input) =>
      repository.markNotificationDeliverySeen(input),
    markNotificationDeliveryDismissed: (input) =>
      repository.markNotificationDeliveryDismissed(input),
    markNotificationDeliveryAcknowledged: (input) =>
      repository.markNotificationDeliveryAcknowledged(input),
  };
}

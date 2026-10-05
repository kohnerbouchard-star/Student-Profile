import type { StoryNotificationRepository } from "../../storylines/contracts/storyNotificationContracts.ts";
import { SupabaseStoryNotificationRepository } from "../../storylines/infrastructure/supabaseStoryNotificationRepository.ts";

/** Notifications-owned write port; read/acknowledgement operations stay private. */
export type StoryNotificationPublisher = Pick<
  StoryNotificationRepository,
  "createStoryNotification" | "createNotificationDeliveries"
>;

/** Reuse the existing writer and its awaited writes, conflicts and errors. */
export function createStoryNotificationPublisher(
  client: ConstructorParameters<typeof SupabaseStoryNotificationRepository>[0],
): StoryNotificationPublisher {
  return new SupabaseStoryNotificationRepository(client);
}

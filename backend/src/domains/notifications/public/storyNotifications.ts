import { createStoryNotificationPublisher as createStoryPublisher } from "../../storylines/server/notificationCapabilities.ts";
export type { StoryNotificationPublisher } from "../../storylines/server/notificationCapabilities.ts";

/** Notifications-owned write port; read/acknowledgement operations stay private. */
export function createStoryNotificationPublisher(
  client: Parameters<typeof createStoryPublisher>[0],
): ReturnType<typeof createStoryPublisher> {
  return createStoryPublisher(client);
}

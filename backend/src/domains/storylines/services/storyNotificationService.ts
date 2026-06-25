import type { JsonObject } from "../../../supabase/tableTypes.ts";
import type {
  CreateStoryCutsceneNotificationForPlayersInput,
  CreateStoryCutsceneNotificationForPlayersResult,
} from "../contracts/storyNotificationContracts.ts";

export async function createStoryCutsceneNotificationForPlayers(
  input: CreateStoryCutsceneNotificationForPlayersInput,
): Promise<CreateStoryCutsceneNotificationForPlayersResult> {
  const notificationResult = await input.repository.createStoryNotification({
    gameSessionId: input.gameSessionId,
    sourceType: "storyline_event",
    sourceId: input.storylineEventId,
    notificationType: "story_cutscene",
    title: input.reveal.headline,
    summary: input.reveal.summary,
    priority: input.priority,
    displayMode: input.reveal.displayMode,
    payload: toCutsceneNotificationPayload(input),
    publishedAt: input.now,
  });
  const deliveryResult = await input.repository.createNotificationDeliveries({
    notificationId: notificationResult.notification.id,
    gameSessionId: input.gameSessionId,
    playerIds: input.targetPlayerIds,
    deliveredAt: input.now,
  });

  return {
    notificationId: notificationResult.notification.id,
    deliveryCount: deliveryResult.deliveryIds.length,
    insertedDeliveryCount: deliveryResult.insertedCount,
    existingDeliveryCount: deliveryResult.existingCount,
  };
}

function toCutsceneNotificationPayload(
  input: CreateStoryCutsceneNotificationForPlayersInput,
): JsonObject {
  return {
    ...input.reveal.payload,
    storylineEventId: input.storylineEventId,
    videoAssetKey: input.reveal.videoAssetKey,
    posterAssetKey: input.reveal.posterAssetKey,
    requiresAcknowledgement: input.reveal.requiresAcknowledgement,
  };
}

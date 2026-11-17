import {
  type PlayerStoryDeliveryAction,
  PlayerStoryDeliveryError,
  type PlayerStoryDeliveryRecord,
  type PlayerStoryDeliveryRepository,
  type PlayerStoryDeliveryStateRecord,
} from "../contracts/playerStoryDeliveryContracts.ts";
import {
  DELIVERY_SELECT,
  MAX_NOTIFICATION_CANDIDATES,
  MODAL_DISPLAY_MODES,
  NOTIFICATION_SELECT,
  type PlayerStoryDeliveryClient,
} from "./playerStoryDeliveryRows.ts";
import {
  toDeliveryRecord,
  mergeDeliveryState,
  toStateRecord,
  isPending,
  compareDeliveries,
  terminalConflict,
  fieldForAction,
  fieldToColumn,
  valuesForAction,
  assertReadResponse,
  assertDeliveryScope,
  assertNotificationScope,
  mapPersistenceError,
  readFailed,
  requireUuid,
} from "./playerStoryDeliveryProjection.ts";

export class SupabasePlayerStoryDeliveryRepository
  implements PlayerStoryDeliveryRepository {
  constructor(private readonly client: PlayerStoryDeliveryClient) {}

  async listPendingDeliveries(input: {
    readonly gameId: string;
    readonly playerUuid: string;
    readonly limit: number;
  }): Promise<readonly PlayerStoryDeliveryRecord[]> {
    const notificationResponse = await this.client
      .from("notifications")
      .select(NOTIFICATION_SELECT)
      .eq("game_session_id", input.gameId)
      .eq("notification_type", "story_cutscene")
      .in("display_mode", MODAL_DISPLAY_MODES)
      .order("published_at", { ascending: false })
      .limit(MAX_NOTIFICATION_CANDIDATES);
    assertReadResponse(notificationResponse);

    const notifications = notificationResponse.data ?? [];
    if (notifications.length === 0) return [];
    assertNotificationScope(notifications, input.gameId);

    const notificationIds = notifications.map((row) => requireUuid(row.id));
    const deliveryResponse = await this.client
      .from("notification_deliveries")
      .select(DELIVERY_SELECT)
      .eq("game_session_id", input.gameId)
      .eq("player_id", input.playerUuid)
      .in("notification_id", notificationIds)
      .is("dismissed_at", null)
      .order("delivered_at", { ascending: false })
      .limit(MAX_NOTIFICATION_CANDIDATES);
    assertReadResponse(deliveryResponse);

    const notificationById = new Map(
      notifications.map((row) => [requireUuid(row.id), row]),
    );
    return (deliveryResponse.data ?? [])
      .map((delivery) => {
        assertDeliveryScope(delivery, input.gameId, input.playerUuid);
        const notification = notificationById.get(
          requireUuid(delivery.notification_id),
        );
        if (!notification) throw readFailed();
        return toDeliveryRecord(delivery, notification);
      })
      .filter((record) => isPending(record))
      .sort(compareDeliveries)
      .slice(0, Math.max(1, Math.min(10, input.limit)));
  }

  async updateDeliveryState(input: {
    readonly gameId: string;
    readonly playerUuid: string;
    readonly publicDeliveryId: string;
    readonly action: PlayerStoryDeliveryAction;
    readonly markedAt: string;
  }): Promise<PlayerStoryDeliveryStateRecord> {
    const current = await this.readDelivery(
      input.gameId,
      input.playerUuid,
      input.publicDeliveryId,
    );
    if (current.dismissedAt) {
      if (input.action === "dismissed") return toStateRecord(current);
      throw terminalConflict();
    }
    if (current.acknowledgedAt) {
      if (input.action === "acknowledged") return toStateRecord(current);
      throw terminalConflict();
    }
    if (
      input.action === "dismissed" && current.requiresAcknowledgement
    ) {
      throw new PlayerStoryDeliveryError(
        "player_story_delivery_acknowledgement_required",
        "This story delivery must be acknowledged.",
        409,
        false,
      );
    }

    const field = fieldForAction(input.action);
    if (current[field]) return toStateRecord(current);

    const values = valuesForAction(input.action, input.markedAt, current.seenAt);
    let updateBuilder = this.client
      .from("notification_deliveries")
      .update(values)
      .eq("public_delivery_id", input.publicDeliveryId)
      .eq("game_session_id", input.gameId)
      .eq("player_id", input.playerUuid)
      .is(fieldToColumn(field), null);
    if (input.action === "dismissed") {
      updateBuilder = updateBuilder.is("acknowledged_at", null);
    } else if (input.action === "acknowledged") {
      updateBuilder = updateBuilder.is("dismissed_at", null);
    }
    const updateResponse = await updateBuilder
      .select(DELIVERY_SELECT)
      .maybeSingle();
    if (updateResponse.error) throw mapPersistenceError(updateResponse.error, true);

    if (updateResponse.data) {
      const updated = mergeDeliveryState(current, updateResponse.data);
      return toStateRecord(updated);
    }

    const afterRace = await this.readDelivery(
      input.gameId,
      input.playerUuid,
      input.publicDeliveryId,
    );
    if (afterRace[field]) return toStateRecord(afterRace);
    throw new PlayerStoryDeliveryError(
      "player_story_delivery_conflict",
      "Story delivery state changed concurrently.",
      409,
      true,
    );
  }

  private async readDelivery(
    gameId: string,
    playerUuid: string,
    publicDeliveryId: string,
  ): Promise<PlayerStoryDeliveryRecord> {
    const deliveryResponse = await this.client
      .from("notification_deliveries")
      .select(DELIVERY_SELECT)
      .eq("public_delivery_id", publicDeliveryId)
      .eq("game_session_id", gameId)
      .eq("player_id", playerUuid)
      .maybeSingle();
    if (deliveryResponse.error) throw mapPersistenceError(deliveryResponse.error);
    if (!deliveryResponse.data) {
      throw new PlayerStoryDeliveryError(
        "player_story_delivery_not_found",
        "Story delivery was not found.",
        404,
        false,
      );
    }
    assertDeliveryScope(deliveryResponse.data, gameId, playerUuid);

    const notificationResponse = await this.client
      .from("notifications")
      .select(NOTIFICATION_SELECT)
      .eq("id", requireUuid(deliveryResponse.data.notification_id))
      .eq("game_session_id", gameId)
      .eq("notification_type", "story_cutscene")
      .in("display_mode", MODAL_DISPLAY_MODES)
      .maybeSingle();
    if (notificationResponse.error) {
      throw mapPersistenceError(notificationResponse.error);
    }
    if (!notificationResponse.data) {
      throw new PlayerStoryDeliveryError(
        "player_story_delivery_not_found",
        "Story delivery was not found.",
        404,
        false,
      );
    }
    assertNotificationScope([notificationResponse.data], gameId);
    return toDeliveryRecord(deliveryResponse.data, notificationResponse.data);
  }
}

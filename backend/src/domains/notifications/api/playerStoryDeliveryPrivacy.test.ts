import { handlePlayerStoryDeliveryRequest } from "./playerStoryDeliveryHttpHandler.ts";
import type { PlayerStoryDeliveryRecord, PlayerStoryDeliveryRepository } from "../contracts/playerStoryDeliveryContracts.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };
const GAME = "00000000-0000-4000-8000-000000000001";
const PLAYER = "00000000-0000-4000-8000-000000000021";
const NOW = "2026-07-20T03:00:00.000Z";

Deno.test("Player story response recursively excludes ownership UUIDs and raw payload keys", async () => {
  const record: PlayerStoryDeliveryRecord = {
    internalDeliveryUuid: "00000000-0000-4000-8000-000000000101",
    internalNotificationUuid: "00000000-0000-4000-8000-000000000201",
    publicDeliveryId: "ndl_00000000000000000000000000000001",
    publicNotificationId: "ntf_00000000000000000000000000000001",
    gameId: GAME,
    playerUuid: PLAYER,
    category: "story",
    title: "Briefing",
    summary: "Update",
    priority: "major",
    displayMode: "modal_immediate",
    publishedAt: NOW,
    deliveredAt: NOW,
    seenAt: null,
    dismissedAt: null,
    acknowledgedAt: null,
    requiresAcknowledgement: true,
    content: { videoAssetKey: "cutscene-1", posterAssetKey: null, tone: "briefing", act: 1, sequence: 1 },
  };
  const repository: PlayerStoryDeliveryRepository = {
    listPendingDeliveries: async () => [record],
    updateDeliveryState: async () => ({ ...record, publicDeliveryId: record.publicDeliveryId, publicNotificationId: record.publicNotificationId }),
  } as never;
  const response = await handlePlayerStoryDeliveryRequest(
    new Request("https://example.test/players/me/story-deliveries", { headers: { "x-player-session-token": "super-secret-session-token" } }),
    { kind: "list" },
    {
      readSupabaseEnv: () => ({ ok: true as const, value: { supabaseUrl: "https://example.supabase.co", supabaseServiceRoleKey: "service", supabaseAnonKey: "anon" } }),
      createServiceClient: () => ({}) as never,
      resolveScope: async () => ({ gameId: GAME, playerUuid: PLAYER, activeSessionId: GAME, sessionValid: true as const, sessionExpiresAt: NOW, authorizationContext: { actorType: "player" as const, source: "player_session" as const, gameScope: "session" as const, resourceScope: "own_player" as const } }),
      createRepository: () => repository,
      now: () => new Date(NOW),
    },
  );
  const body = await response.json();
  const serialized = JSON.stringify(body);
  for (const forbidden of [GAME, PLAYER, record.internalDeliveryUuid, record.internalNotificationUuid, "super-secret-session-token", "payload", "playerUuid", "gameId", "internalDeliveryUuid", "internalNotificationUuid"]) {
    if (serialized.includes(forbidden)) throw new Error(`Forbidden story data leaked: ${forbidden}`);
  }
});

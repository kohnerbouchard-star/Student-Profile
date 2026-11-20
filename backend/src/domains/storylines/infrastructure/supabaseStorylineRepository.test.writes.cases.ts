import { SupabaseStorylineRepository } from "./supabaseStorylineRepository.ts";
import {
  assertEquals,
  baseTables,
  FakeClient,
} from "./supabaseStorylineRepository.test.fixtures.support.ts";
declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("storyline repository creates story event resolution idempotently", async () => {
  const client = new FakeClient(baseTables());
  const repository = new SupabaseStorylineRepository(client as never);
  const input = {
    gameSessionId: "game-1",
    storylineEventId: "event-1",
    resolvedAt: "2026-06-25T12:00:00.000Z",
    resolvedMarketTick: 7,
    resultPayload: { applied: true },
  };

  const inserted = await repository.createStoryEventResolution(input);
  const existing = await repository.createStoryEventResolution(input);

  assertEquals(inserted.status, "inserted");
  assertEquals(existing.status, "existing");
  assertEquals(inserted.resolution.id, existing.resolution.id);
  assertEquals(client.tables.story_event_resolutions.length, 1);
  assertEquals(
    client.tables.story_event_resolutions[0]?.result_payload,
    { applied: true },
  );
});

Deno.test("storyline repository inserts player story impact using effect dependency shape", async () => {
  const client = new FakeClient(baseTables());
  const repository = new SupabaseStorylineRepository(client as never);

  const result = await repository.createPlayerImpact({
    gameSessionId: "game-1",
    playerId: "player-1",
    storylineEventId: "event-1",
    effectType: "cash_debit",
    impactLabel: "Emergency security levy",
    impactReason: "You were located in Northreach.",
    amount: -150,
    payload: { source: "test" },
    idempotencyKey: "impact-key",
  });

  assertEquals(result.id, "player_story_impacts-1");
  assertEquals(client.tables.player_story_impacts[0], {
    game_session_id: "game-1",
    player_id: "player-1",
    storyline_event_id: "event-1",
    effect_type: "cash_debit",
    impact_label: "Emergency security levy",
    impact_reason: "You were located in Northreach.",
    amount: -150,
    payload: { source: "test" },
    id: "player_story_impacts-1",
    created_at: "2026-06-25T12:00:00.000Z",
  });
});

Deno.test("storyline repository upserts game session policy using effect dependency shape", async () => {
  const client = new FakeClient(baseTables());
  const repository = new SupabaseStorylineRepository(client as never);

  const first = await repository.upsertPolicy({
    gameSessionId: "game-1",
    policyKey: "northreach-outbound-freeze",
    policyType: "immigration_lock",
    scopeType: "country",
    scopeKey: "NORTHREACH",
    startsAt: "2026-06-25T12:00:00.000Z",
    expiresAt: "2026-06-25T12:20:00.000Z",
    durationSeconds: 1200,
    payload: { blockedDirection: "outbound" },
    sourceStoryEventId: "event-1",
    idempotencyKey: "policy-key",
  });
  const second = await repository.upsertPolicy({
    gameSessionId: "game-1",
    policyKey: "northreach-outbound-freeze",
    policyType: "immigration_lock",
    scopeType: "country",
    scopeKey: "NORTHREACH",
    startsAt: "2026-06-25T12:05:00.000Z",
    expiresAt: null,
    durationSeconds: null,
    payload: { blockedDirection: "both" },
    sourceStoryEventId: "event-2",
    idempotencyKey: "policy-key-2",
  });

  assertEquals(first.id, "game_session_policies-1");
  assertEquals(second.id, "game_session_policies-1");
  assertEquals(client.tables.game_session_policies.length, 1);
  assertEquals(
    client.tables.game_session_policies[0]?.starts_at,
    "2026-06-25T12:05:00.000Z",
  );
  assertEquals(client.tables.game_session_policies[0]?.expires_at, null);
  assertEquals(client.tables.game_session_policies[0]?.payload, {
    blockedDirection: "both",
  });
});

Deno.test("storyline repository upserts and lists game session story flags", async () => {
  const client = new FakeClient(baseTables());
  const repository = new SupabaseStorylineRepository(client as never);

  const first = await repository.setStoryFlag({
    gameSessionId: "game-1",
    flagKey: "northreach_border_closed",
    value: true,
    sourceStoryEventId: "event-1",
    idempotencyKey: "flag-key",
  });
  const second = await repository.setStoryFlag({
    gameSessionId: "game-1",
    flagKey: "northreach_border_closed",
    value: { phase: "warning" },
    sourceStoryEventId: "event-2",
    idempotencyKey: "flag-key-2",
  });
  await repository.setStoryFlag({
    gameSessionId: "game-2",
    flagKey: "other_game_flag",
    value: true,
    sourceStoryEventId: "event-3",
    idempotencyKey: "flag-key-3",
  });

  assertEquals(first.id, "game_session_story_flags-1");
  assertEquals(second.id, "game_session_story_flags-1");
  assertEquals(client.tables.game_session_story_flags.length, 2);
  assertEquals(await repository.listGameSessionStoryFlags("game-1"), {
    northreach_border_closed: { phase: "warning" },
  });
});

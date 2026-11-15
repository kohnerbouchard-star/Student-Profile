import { SupabaseStorylineRepository } from "./supabaseStorylineRepository.ts";
import {
  assertEquals,
  baseTables,
  FakeClient,
  storylineEvent,
} from "./supabaseStorylineRepository.test.fixtures.support.ts";
declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("storyline repository lists active game session storyline activations", async () => {
  const client = new FakeClient(baseTables());
  const repository = new SupabaseStorylineRepository(client as never);

  const rows = await repository.listActiveGameSessionStorylines("game-1");

  assertEquals(rows.map((row) => row.id), ["activation-1"]);
  assertEquals(rows[0]?.gameSessionId, "game-1");
  assertEquals(rows[0]?.storylineId, "storyline-1");
  assertEquals(rows[0]?.status, "active");
});

Deno.test("storyline repository lists unresolved automatic active and game-overridden event candidates", async () => {
  const tables = baseTables();
  tables.storyline_events.push(
    storylineEvent({
      id: "elapsed-due",
      event_key: "elapsed-due",
      trigger_type: "elapsed_time",
      scheduled_offset_seconds: 300,
    }),
    storylineEvent({
      id: "wall-clock-due",
      event_key: "wall-clock-due",
      trigger_type: "wall_clock_time",
      scheduled_at: "2026-06-25T12:04:00.000Z",
    }),
    storylineEvent({
      id: "market-tick-due",
      event_key: "market-tick-due",
      trigger_type: "market_tick",
      scheduled_market_tick: 9,
    }),
    storylineEvent({
      id: "condition-candidate",
      event_key: "condition-candidate",
      trigger_type: "condition",
      trigger_condition: {
        type: "story_flag_equals",
        flagKey: "northreach_border_closed",
        value: true,
      },
    }),
    storylineEvent({
      id: "manual-not-auto",
      event_key: "manual-not-auto",
      trigger_type: "manual",
    }),
    storylineEvent({
      id: "market-tick-future",
      event_key: "market-tick-future",
      trigger_type: "market_tick",
      scheduled_market_tick: 10,
    }),
    storylineEvent({
      id: "inactive-event",
      event_key: "inactive-event",
      trigger_type: "condition",
      is_active: false,
    }),
    storylineEvent({
      id: "inactive-overridden",
      event_key: "inactive-overridden",
      trigger_type: "elapsed_time",
      scheduled_offset_seconds: 120,
      is_active: false,
    }),
    storylineEvent({
      id: "resolved-event",
      event_key: "resolved-event",
      trigger_type: "elapsed_time",
      scheduled_offset_seconds: 1,
    }),
  );
  tables.game_session_story_event_overrides.push(
    {
      game_session_id: "game-1",
      storyline_event_id: "inactive-overridden",
      enabled: true,
    },
    {
      game_session_id: "game-2",
      storyline_event_id: "inactive-event",
      enabled: true,
    },
  );
  tables.story_event_resolutions.push({
    id: "resolution-1",
    game_session_id: "game-1",
    storyline_event_id: "resolved-event",
    resolved_at: "2026-06-25T12:01:00.000Z",
    resolved_market_tick: null,
    status: "resolved",
    result_payload: {},
    created_at: "2026-06-25T12:01:00.000Z",
  });
  const client = new FakeClient(tables);
  const repository = new SupabaseStorylineRepository(client as never);

  const rows = await repository.listUnresolvedActiveStorylineEvents({
    gameSessionId: "game-1",
    now: "2026-06-25T12:07:00.000Z",
    currentMarketTick: 9,
  });

  assertEquals(rows.map((row) => row.eventKey), [
    "elapsed-due",
    "wall-clock-due",
    "market-tick-due",
    "condition-candidate",
    "inactive-overridden",
  ]);
  assertEquals(rows[0]?.gameSessionId, "game-1");
  assertEquals(rows[0]?.gameSessionStorylineId, "activation-1");
});

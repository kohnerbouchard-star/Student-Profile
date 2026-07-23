import {
  PROGRESSION_PREDECESSOR_EVENT_FIXTURES_V1,
  ProgressionError,
} from "../contracts/progressionContracts.ts";
import { recordTrustedProgressionEventV1 } from "./progressionIntegrationEventService.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };
const GAME = "00000000-0000-4000-8000-000000000001";
const PLAYER = "00000000-0000-4000-8000-000000000021";
const EVENT = `pev_${"a".repeat(32)}`;

Deno.test("trusted Progression event maps versioned public contract without UUID output", async () => {
  const client = successfulClient({
    event_outcome: "applied",
    event_id: EVENT,
    experience_awarded: 120,
    resulting_experience: 120,
    resulting_level: 2,
    achievements_completed: 1,
  });
  const result = await recordTrustedProgressionEventV1(client as never, {
    gameId: GAME,
    playerUuid: PLAYER,
    sourceDomain: "contracts",
    eventType: "contract.completed",
    sourcePublicId: "contract_completion_arrival_orientation_001",
    idempotencyKey: "contract-completion:001",
    occurredAt: "2026-07-21T01:00:00.000Z",
  });
  assertEquals(result, {
    outcome: "applied",
    eventId: EVENT,
    experienceAwarded: 120,
    resultingExperience: 120,
    resultingLevel: 2,
    achievementsCompleted: 1,
  });
  assertEquals(client.calls[0], {
    name: "record_progression_integration_event_v1",
    args: {
      p_game_session_id: GAME,
      p_player_id: PLAYER,
      p_source_domain: "contracts",
      p_event_type: "contract.completed",
      p_source_public_id: "contract_completion_arrival_orientation_001",
      p_idempotency_key: "contract-completion:001",
      p_occurred_at: "2026-07-21T01:00:00.000Z",
    },
  });
  assertNoUuid(JSON.stringify(result));
});

Deno.test("trusted Progression event preserves replay outcome", async () => {
  const client = successfulClient({
    event_outcome: "replayed",
    event_id: EVENT,
    experience_awarded: 120,
    resulting_experience: 120,
    resulting_level: 2,
    achievements_completed: 0,
  });
  const result = await recordTrustedProgressionEventV1(client as never, {
    gameId: GAME,
    playerUuid: PLAYER,
    sourceDomain: "contracts",
    eventType: "contract.completed",
    sourcePublicId: "contract_completion_arrival_orientation_001",
    idempotencyKey: "contract-completion:001",
    occurredAt: "2026-07-21T01:00:00.000Z",
  });
  assertEquals(result.outcome, "replayed");
});

Deno.test("stable predecessor fixtures remain explicit and consumable without predecessor internals", async () => {
  for (const fixture of PROGRESSION_PREDECESSOR_EVENT_FIXTURES_V1) {
    const client = successfulClient({
      event_outcome: "applied",
      event_id: EVENT,
      experience_awarded: 40,
      resulting_experience: 160,
      resulting_level: 2,
      achievements_completed: 0,
    });
    await recordTrustedProgressionEventV1(client as never, {
      gameId: GAME,
      playerUuid: PLAYER,
      ...fixture,
    });
    assertEquals(client.calls[0], {
      name: "record_progression_integration_event_v1",
      args: {
        p_game_session_id: GAME,
        p_player_id: PLAYER,
        p_source_domain: fixture.sourceDomain,
        p_event_type: fixture.eventType,
        p_source_public_id: fixture.sourcePublicId,
        p_idempotency_key: fixture.idempotencyKey,
        p_occurred_at: fixture.occurredAt,
      },
    });
  }
});

Deno.test("trusted Progression contract accepts bounded World and Messaging events", async () => {
  for (const [sourceDomain, eventType, sourcePublicId] of [
    ["world", "world.travel.completed", "journey_completion_001"],
    ["world", "world.arrival.completed", "arrival_completion_001"],
    ["messaging", "messaging.contribution.approved", "message_contribution_001"],
  ] as const) {
    const client = successfulClient({
      event_outcome: "applied",
      event_id: EVENT,
      experience_awarded: 40,
      resulting_experience: 160,
      resulting_level: 2,
      achievements_completed: 0,
    });
    await recordTrustedProgressionEventV1(client as never, {
      gameId: GAME,
      playerUuid: PLAYER,
      sourceDomain,
      eventType,
      sourcePublicId,
      idempotencyKey: `${sourceDomain}:${sourcePublicId}`,
      occurredAt: "2026-07-21T01:00:00.000Z",
    });
    assertEquals((client.calls[0]?.args as { p_source_domain?: string }).p_source_domain, sourceDomain);
    assertEquals((client.calls[0]?.args as { p_event_type?: string }).p_event_type, eventType);
  }
});

Deno.test("trusted Progression event rejects source and event mismatches before RPC", async () => {
  const client = successfulClient({});
  const errors = await capture(() => recordTrustedProgressionEventV1(client as never, {
    gameId: GAME,
    playerUuid: PLAYER,
    sourceDomain: "business",
    eventType: "story.chapter.completed",
    sourcePublicId: "story_chapter_completion_fixture_001",
    idempotencyKey: "story.chapter.completed:fixture:001",
    occurredAt: "2026-07-21T01:00:00.000Z",
  }));
  assertEquals(errors.code, "progression_event_invalid");
  assertEquals(errors.status, 400);
  assertEquals(client.calls.length, 0);
});

Deno.test("trusted Progression event rejects client-shaped event types before RPC", async () => {
  const client = successfulClient({});
  const errors = await capture(() => recordTrustedProgressionEventV1(client as never, {
    gameId: GAME,
    playerUuid: PLAYER,
    sourceDomain: "contracts",
    eventType: "award.arbitrary" as never,
    sourcePublicId: "event",
    idempotencyKey: "event:001",
    occurredAt: "2026-07-21T01:00:00.000Z",
  }));
  assertEquals(errors.code, "progression_event_invalid");
  assertEquals(client.calls.length, 0);
});

Deno.test("source-event mutation conflicts fail closed with a stable public error", async () => {
  const client = new FakeClient([], { message: "PROGRESSION_SOURCE_EVENT_CONFLICT" });
  const fixture = PROGRESSION_PREDECESSOR_EVENT_FIXTURES_V1[0];
  const errors = await capture(() => recordTrustedProgressionEventV1(client as never, {
    gameId: GAME,
    playerUuid: PLAYER,
    ...fixture,
  }));
  assertEquals(errors.code, "progression_source_event_conflict");
  assertEquals(errors.status, 409);
  assertEquals(errors.retryable, false);
});

class FakeClient {
  readonly calls: Array<{ name: string; args: unknown }> = [];
  constructor(private readonly data: unknown, private readonly error: { message: string } | null = null) {}
  rpc(name: string, args: unknown) {
    this.calls.push({ name, args });
    return Promise.resolve({ data: this.data, error: this.error });
  }
}

function successfulClient(row: Record<string, unknown>): FakeClient {
  return new FakeClient([row]);
}

async function capture(run: () => Promise<unknown>): Promise<ProgressionError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof ProgressionError) return error;
    throw error;
  }
  throw new Error("Expected ProgressionError");
}

function assertNoUuid(value: string): void {
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(value)) throw new Error(`UUID leaked: ${value}`);
}
function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`);
}

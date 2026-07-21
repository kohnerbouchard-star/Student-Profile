import { recordTrustedProgressionEventV1 } from "./progressionIntegrationEventService.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };
const GAME = "00000000-0000-4000-8000-000000000001";
const PLAYER = "00000000-0000-4000-8000-000000000021";
const EVENT = `pev_${"a".repeat(32)}`;

Deno.test("trusted Progression event maps versioned public contract without UUID output", async () => {
  const client = new FakeClient([{
    event_outcome: "applied",
    event_id: EVENT,
    experience_awarded: 120,
    resulting_experience: 120,
    resulting_level: 2,
    achievements_completed: 1,
  }]);
  const result = await recordTrustedProgressionEventV1(client as never, {
    gameId: GAME,
    playerUuid: PLAYER,
    sourceDomain: "contracts",
    eventType: "contract.completed",
    sourcePublicId: "contract_arrival_orientation_v1",
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
      p_source_public_id: "contract_arrival_orientation_v1",
      p_idempotency_key: "contract-completion:001",
      p_occurred_at: "2026-07-21T01:00:00.000Z",
    },
  });
  assertNoUuid(JSON.stringify(result));
});

Deno.test("trusted Progression event preserves replay outcome", async () => {
  const client = new FakeClient([{
    event_outcome: "replayed",
    event_id: EVENT,
    experience_awarded: 120,
    resulting_experience: 120,
    resulting_level: 2,
    achievements_completed: 0,
  }]);
  const result = await recordTrustedProgressionEventV1(client as never, {
    gameId: GAME,
    playerUuid: PLAYER,
    sourceDomain: "contracts",
    eventType: "contract.completed",
    sourcePublicId: "contract_arrival_orientation_v1",
    idempotencyKey: "contract-completion:001",
    occurredAt: "2026-07-21T01:00:00.000Z",
  });
  assertEquals(result.outcome, "replayed");
});

Deno.test("trusted Progression contract accepts bounded World and Messaging events", async () => {
  for (const [sourceDomain, eventType, sourcePublicId] of [
    ["world", "world.travel.completed", "journey_001"],
    ["world", "world.arrival.completed", "arrival_001"],
    ["messaging", "messaging.contribution.approved", "message_001"],
  ] as const) {
    const client = new FakeClient([{
      event_outcome: "applied",
      event_id: EVENT,
      experience_awarded: 40,
      resulting_experience: 160,
      resulting_level: 2,
      achievements_completed: 0,
    }]);
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

Deno.test("trusted Progression event rejects client-shaped event types before RPC", async () => {
  const client = new FakeClient([]);
  let failed = false;
  try {
    await recordTrustedProgressionEventV1(client as never, {
      gameId: GAME,
      playerUuid: PLAYER,
      sourceDomain: "contracts",
      eventType: "award.arbitrary" as never,
      sourcePublicId: "event",
      idempotencyKey: "event:001",
      occurredAt: "2026-07-21T01:00:00.000Z",
    });
  } catch {
    failed = true;
  }
  assertEquals(failed, true);
  assertEquals(client.calls.length, 0);
});

class FakeClient {
  readonly calls: Array<{ name: string; args: unknown }> = [];
  constructor(private readonly data: unknown) {}
  rpc(name: string, args: unknown) {
    this.calls.push({ name, args });
    return Promise.resolve({ data: this.data, error: null });
  }
}
function assertNoUuid(value: string): void {
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(value)) throw new Error(`UUID leaked: ${value}`);
}
function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`);
}

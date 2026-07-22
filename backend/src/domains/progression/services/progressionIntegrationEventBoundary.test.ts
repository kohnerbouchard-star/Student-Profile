import {
  PROGRESSION_PREDECESSOR_EVENT_FIXTURES_V1,
  ProgressionError,
  type ProgressionIntegrationCompatibilityFixtureV1,
  type TrustedProgressionEventV1,
} from "../contracts/progressionContracts.ts";
import { recordTrustedProgressionEventV1 } from "./progressionIntegrationEventService.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };
const GAME = "00000000-0000-4000-8000-000000000001";
const PLAYER = "00000000-0000-4000-8000-000000000021";
const EVENT_ID = `pev_${"a".repeat(32)}`;
const NOW = new Date("2026-07-22T00:00:00.000Z");

Deno.test("Progression predecessor fixtures preserve exact source contracts", async () => {
  for (const fixture of PROGRESSION_PREDECESSOR_EVENT_FIXTURES_V1) {
    const client = successClient("applied");
    const result = await recordTrustedProgressionEventV1(
      client as never,
      event(fixture),
      { now: NOW },
    );
    assertEquals(result.outcome, "applied");
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

Deno.test("Progression rejects malformed, stale, future, and source-mismatched events before RPC", async () => {
  const base = event(PROGRESSION_PREDECESSOR_EVENT_FIXTURES_V1[0]);
  for (const candidate of [
    { ...base, gameId: "not-a-uuid" },
    { ...base, playerUuid: "not-a-uuid" },
    { ...base, sourcePublicId: "unsafe source id" },
    { ...base, sourceDomain: "story" as const },
    { ...base, occurredAt: "2026-06-01T00:00:00.000Z" },
    { ...base, occurredAt: "2026-07-22T00:06:00.000Z" },
  ]) {
    const client = successClient("applied");
    const error = await capture(() =>
      recordTrustedProgressionEventV1(
        client as never,
        candidate as never,
        { now: NOW },
      )
    );
    assertEquals(error.code, "progression_event_invalid");
    assertEquals(error.status, 400);
    assertEquals(client.calls.length, 0);
  }
});

Deno.test("Progression committed-success retries remain replayable", async () => {
  const client = successClient("replayed");
  const result = await recordTrustedProgressionEventV1(
    client as never,
    event({
      ...PROGRESSION_PREDECESSOR_EVENT_FIXTURES_V1[2],
      idempotencyKey: "market.order.settled:retry:002",
    }),
    { now: NOW },
  );
  assertEquals(result.outcome, "replayed");
  assertEquals(result.experienceAwarded, 30);
});

Deno.test("Progression maps wrong-game, conflicting replay, paused, ended, and unavailable games", async () => {
  for (const [message, code, status, retryable] of [
    ["PROGRESSION_PLAYER_NOT_FOUND", "progression_player_not_found", 404, false],
    ["PROGRESSION_IDEMPOTENCY_CONFLICT", "progression_idempotency_conflict", 409, false],
    ["PROGRESSION_SOURCE_EVENT_CONFLICT", "progression_source_event_conflict", 409, false],
    ["GAME_SESSION_DISABLED", "progression_game_paused", 409, true],
    ["GAME_SESSION_ARCHIVED", "progression_game_ended", 409, false],
    ["GAME_SESSION_NOT_ACTIVE", "progression_game_unavailable", 409, false],
    ["GAME_SESSION_NOT_FOUND", "progression_game_unavailable", 409, false],
  ] as const) {
    const client = errorClient(message);
    const error = await capture(() =>
      recordTrustedProgressionEventV1(
        client as never,
        event(PROGRESSION_PREDECESSOR_EVENT_FIXTURES_V1[1]),
        { now: NOW },
      )
    );
    assertEquals(error.code, code);
    assertEquals(error.status, status);
    assertEquals(error.retryable, retryable);
  }
});

function event(
  fixture: ProgressionIntegrationCompatibilityFixtureV1,
): TrustedProgressionEventV1 {
  return { gameId: GAME, playerUuid: PLAYER, ...fixture };
}

class FakeClient {
  readonly calls: Array<{ name: string; args: unknown }> = [];
  constructor(
    private readonly data: unknown,
    private readonly error: { message: string } | null,
  ) {}
  rpc(name: string, args: unknown) {
    this.calls.push({ name, args });
    return Promise.resolve({ data: this.data, error: this.error });
  }
}

function successClient(outcome: "applied" | "replayed") {
  return new FakeClient([{
    event_outcome: outcome,
    event_id: EVENT_ID,
    experience_awarded: 30,
    resulting_experience: 300,
    resulting_level: 3,
    achievements_completed: 0,
  }], null);
}
function errorClient(message: string) {
  return new FakeClient(null, { message });
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
function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`);
  }
}

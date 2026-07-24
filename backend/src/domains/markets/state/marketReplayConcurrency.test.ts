import {
  applyOptimisticMarketTransition,
  replayMarketEvents,
  type MarketReplayEvent,
} from "./marketReplayConcurrency.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("market replay is deterministic and ignores byte-identical duplicate delivery", () => {
  const admitted = event(1, 0, 1, "admitted", "admit-1");
  const filled = event(2, 1, 2, "filled", "fill-1");
  const first = replayMarketEvents([admitted, filled, admitted]);
  const second = replayMarketEvents([filled, admitted]);
  assertEquals(first, second);
  assertEquals(first.status, "filled");
  assertEquals(first.eventCount, 2);
  assertEquals(first.version, 2);
});

Deno.test("market replay rejects gaps, version drift, and conflicting duplicate ids", () => {
  assertThrows(() => replayMarketEvents([
    event(1, 0, 1, "admitted", "admit-1"),
    event(3, 1, 2, "filled", "fill-1"),
  ]), "market_replay_sequence_gap");
  assertThrows(() => replayMarketEvents([
    event(1, 0, 1, "admitted", "admit-1"),
    event(2, 0, 2, "filled", "fill-1"),
  ]), "market_replay_version_conflict");
  assertThrows(() => replayMarketEvents([
    event(1, 0, 1, "admitted", "admit-1"),
    { ...event(1, 0, 1, "admitted", "admit-1"), transitionKey: "other" },
  ]), "market_replay_event_id_conflict");
});

Deno.test("optimistic concurrency admits one terminal transition and rejects stale writers", () => {
  const initial = replayMarketEvents([
    event(1, 0, 1, "admitted", "admit-1"),
  ]);
  const winner = applyOptimisticMarketTransition(initial, {
    aggregatePublicId: initial.aggregatePublicId,
    expectedVersion: 1,
    eventPublicId: "market-event.order-a.filled.v1",
    transitionKey: "fill-1",
    eventKind: "filled",
    occurredAt: "2026-07-21T10:00:01.000Z",
    payloadDigestSha256: digest("2"),
  });
  assertEquals(winner.snapshot.status, "filled");
  assertEquals(winner.snapshot.version, 2);
  assertThrows(() => applyOptimisticMarketTransition(winner.snapshot, {
    aggregatePublicId: initial.aggregatePublicId,
    expectedVersion: 1,
    eventPublicId: "market-event.order-a.cancelled.v1",
    transitionKey: "cancel-1",
    eventKind: "cancelled",
    occurredAt: "2026-07-21T10:00:02.000Z",
    payloadDigestSha256: digest("3"),
  }), "market_command_stale_version");
});

Deno.test("terminal replay states reject later transitions and duplicate keys", () => {
  const open = replayMarketEvents([
    event(1, 0, 1, "admitted", "admit-1"),
  ]);
  assertThrows(() => applyOptimisticMarketTransition(open, {
    aggregatePublicId: open.aggregatePublicId,
    expectedVersion: 1,
    eventPublicId: "market-event.order-a.cancelled.v1",
    transitionKey: "admit-1",
    eventKind: "cancelled",
    occurredAt: "2026-07-21T10:00:02.000Z",
    payloadDigestSha256: digest("3"),
  }), "market_command_duplicate_transition");
  const terminal = replayMarketEvents([
    event(1, 0, 1, "admitted", "admit-1"),
    event(2, 1, 2, "expired", "expire-1"),
  ]);
  assertThrows(() => applyOptimisticMarketTransition(terminal, {
    aggregatePublicId: terminal.aggregatePublicId,
    expectedVersion: 2,
    eventPublicId: "market-event.order-a.filled.v1",
    transitionKey: "fill-after-expiry",
    eventKind: "filled",
    occurredAt: "2026-07-21T10:00:03.000Z",
    payloadDigestSha256: digest("4"),
  }), "market_command_terminal_aggregate");
});

function event(
  sequence: number,
  priorVersion: number,
  nextVersion: number,
  eventKind: MarketReplayEvent["eventKind"],
  transitionKey: string,
): MarketReplayEvent {
  return {
    eventPublicId: `market-event.order-a.${sequence}.v1`,
    aggregatePublicId: "market-order.order-a.v1",
    sequence,
    priorVersion,
    nextVersion,
    transitionKey,
    eventKind,
    occurredAt: `2026-07-21T10:00:0${sequence}.000Z`,
    payloadDigestSha256: digest(String(sequence)),
  };
}

function digest(seed: string): string {
  return seed.repeat(64).slice(0, 64).replace(/[^0-9a-f]/g, "a");
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`,
    );
  }
}

function assertThrows(run: () => unknown, expectedMessage: string): void {
  try {
    run();
  } catch (error) {
    if (error instanceof Error && error.message.includes(expectedMessage)) return;
    throw error;
  }
  throw new Error(`Expected error containing ${expectedMessage}.`);
}

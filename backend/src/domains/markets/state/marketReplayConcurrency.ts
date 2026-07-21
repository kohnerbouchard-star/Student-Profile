export type MarketReplayStatus = "empty" | "open" | "filled" | "cancelled" | "expired";
export type MarketReplayEventKind = "admitted" | "filled" | "cancelled" | "expired";

export interface MarketReplayEvent {
  readonly eventPublicId: string;
  readonly aggregatePublicId: string;
  readonly sequence: number;
  readonly priorVersion: number;
  readonly nextVersion: number;
  readonly transitionKey: string;
  readonly eventKind: MarketReplayEventKind;
  readonly occurredAt: string;
  readonly payloadDigestSha256: string;
}

export interface MarketReplaySnapshot {
  readonly aggregatePublicId: string;
  readonly version: number;
  readonly eventCount: number;
  readonly status: MarketReplayStatus;
  readonly terminalAt: string | null;
  readonly processedEventPublicIds: readonly string[];
  readonly processedTransitionKeys: readonly string[];
  readonly replayDigestFnv1a64: string;
  readonly deterministic: true;
}

export interface OptimisticMarketTransitionCommand {
  readonly aggregatePublicId: string;
  readonly expectedVersion: number;
  readonly eventPublicId: string;
  readonly transitionKey: string;
  readonly eventKind: Exclude<MarketReplayEventKind, "admitted">;
  readonly occurredAt: string;
  readonly payloadDigestSha256: string;
}

export interface OptimisticMarketTransitionResult {
  readonly event: MarketReplayEvent;
  readonly snapshot: MarketReplaySnapshot;
}

export function replayMarketEvents(
  events: readonly MarketReplayEvent[],
): MarketReplaySnapshot {
  if (events.length === 0) {
    throw new Error("market_replay_events_required");
  }
  const deduplicated = deduplicateEvents(events);
  const ordered = [...deduplicated].sort((left, right) =>
    left.sequence - right.sequence ||
    left.eventPublicId.localeCompare(right.eventPublicId)
  );
  const aggregatePublicId = ordered[0].aggregatePublicId;
  let version = 0;
  let status: MarketReplayStatus = "empty";
  let terminalAt: string | null = null;
  const transitionKeys = new Set<string>();

  for (let index = 0; index < ordered.length; index += 1) {
    const event = ordered[index];
    validateReplayEvent(event);
    if (event.aggregatePublicId !== aggregatePublicId) {
      throw new Error("market_replay_aggregate_mismatch");
    }
    if (event.sequence !== index + 1) {
      throw new Error("market_replay_sequence_gap");
    }
    if (event.priorVersion !== version || event.nextVersion !== version + 1) {
      throw new Error("market_replay_version_conflict");
    }
    if (transitionKeys.has(event.transitionKey)) {
      throw new Error("market_replay_transition_key_conflict");
    }
    transitionKeys.add(event.transitionKey);
    status = transitionStatus(status, event.eventKind);
    version = event.nextVersion;
    if (isTerminal(status)) terminalAt = event.occurredAt;
  }

  return {
    aggregatePublicId,
    version,
    eventCount: ordered.length,
    status,
    terminalAt,
    processedEventPublicIds: ordered.map((event) => event.eventPublicId),
    processedTransitionKeys: ordered.map((event) => event.transitionKey),
    replayDigestFnv1a64: stableReplayDigest(
      ordered.map(canonicalReplayEvent),
    ),
    deterministic: true,
  };
}

export function applyOptimisticMarketTransition(
  snapshot: MarketReplaySnapshot,
  command: OptimisticMarketTransitionCommand,
): OptimisticMarketTransitionResult {
  if (snapshot.aggregatePublicId !== command.aggregatePublicId) {
    throw new Error("market_command_aggregate_mismatch");
  }
  if (command.expectedVersion !== snapshot.version) {
    throw new Error("market_command_stale_version");
  }
  if (isTerminal(snapshot.status)) {
    throw new Error("market_command_terminal_aggregate");
  }
  if (snapshot.processedEventPublicIds.includes(command.eventPublicId)) {
    throw new Error("market_command_duplicate_event");
  }
  if (snapshot.processedTransitionKeys.includes(command.transitionKey)) {
    throw new Error("market_command_duplicate_transition");
  }
  if (
    command.eventKind === "filled" ||
    command.eventKind === "cancelled" ||
    command.eventKind === "expired"
  ) {
    const event: MarketReplayEvent = {
      eventPublicId: command.eventPublicId,
      aggregatePublicId: command.aggregatePublicId,
      sequence: snapshot.eventCount + 1,
      priorVersion: snapshot.version,
      nextVersion: snapshot.version + 1,
      transitionKey: command.transitionKey,
      eventKind: command.eventKind,
      occurredAt: command.occurredAt,
      payloadDigestSha256: command.payloadDigestSha256,
    };
    validateReplayEvent(event);
    const nextStatus = transitionStatus(snapshot.status, command.eventKind);
    const nextCanonical = canonicalReplayEvent(event);
    return {
      event,
      snapshot: {
        aggregatePublicId: snapshot.aggregatePublicId,
        version: event.nextVersion,
        eventCount: snapshot.eventCount + 1,
        status: nextStatus,
        terminalAt: event.occurredAt,
        processedEventPublicIds: [
          ...snapshot.processedEventPublicIds,
          event.eventPublicId,
        ],
        processedTransitionKeys: [
          ...snapshot.processedTransitionKeys,
          event.transitionKey,
        ],
        replayDigestFnv1a64: stableReplayDigest([
          snapshot.replayDigestFnv1a64,
          nextCanonical,
        ]),
        deterministic: true,
      },
    };
  }
  throw new Error("market_command_event_kind_invalid");
}

export function stableReplayDigest(parts: readonly string[]): string {
  let hash = 14_695_981_039_346_656_037n;
  const prime = 1_099_511_628_211n;
  const mask = (1n << 64n) - 1n;
  const bytes = new TextEncoder().encode(parts.join("\u001f"));
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}

function deduplicateEvents(
  events: readonly MarketReplayEvent[],
): readonly MarketReplayEvent[] {
  const byEventId = new Map<string, MarketReplayEvent>();
  for (const event of events) {
    const prior = byEventId.get(event.eventPublicId);
    if (!prior) {
      byEventId.set(event.eventPublicId, event);
      continue;
    }
    if (canonicalReplayEvent(prior) !== canonicalReplayEvent(event)) {
      throw new Error("market_replay_event_id_conflict");
    }
  }
  return [...byEventId.values()];
}

function transitionStatus(
  current: MarketReplayStatus,
  kind: MarketReplayEventKind,
): MarketReplayStatus {
  if (current === "empty" && kind === "admitted") return "open";
  if (current === "open" && kind === "filled") return "filled";
  if (current === "open" && kind === "cancelled") return "cancelled";
  if (current === "open" && kind === "expired") return "expired";
  throw new Error("market_replay_invalid_transition");
}

function validateReplayEvent(event: MarketReplayEvent): void {
  for (const [field, value] of [
    ["event_public_id", event.eventPublicId],
    ["aggregate_public_id", event.aggregatePublicId],
    ["transition_key", event.transitionKey],
  ] as const) {
    if (!value.trim() || value.length > 180) {
      throw new Error(`${field}_invalid`);
    }
  }
  if (!Number.isSafeInteger(event.sequence) || event.sequence < 1) {
    throw new Error("market_replay_sequence_invalid");
  }
  if (
    !Number.isSafeInteger(event.priorVersion) ||
    event.priorVersion < 0 ||
    !Number.isSafeInteger(event.nextVersion) ||
    event.nextVersion < 1
  ) {
    throw new Error("market_replay_version_invalid");
  }
  if (!Number.isFinite(Date.parse(event.occurredAt))) {
    throw new Error("market_replay_occurred_at_invalid");
  }
  if (!/^[0-9a-f]{64}$/.test(event.payloadDigestSha256)) {
    throw new Error("market_replay_payload_digest_invalid");
  }
}

function canonicalReplayEvent(event: MarketReplayEvent): string {
  return [
    event.eventPublicId,
    event.aggregatePublicId,
    String(event.sequence),
    String(event.priorVersion),
    String(event.nextVersion),
    event.transitionKey,
    event.eventKind,
    event.occurredAt,
    event.payloadDigestSha256,
  ].join("|");
}

function isTerminal(status: MarketReplayStatus): boolean {
  return status === "filled" || status === "cancelled" || status === "expired";
}

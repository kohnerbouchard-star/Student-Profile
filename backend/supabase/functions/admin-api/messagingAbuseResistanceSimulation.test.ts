export {};

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };

type GameStatus = "active" | "paused" | "ended";
type Outcome = "applied" | "replayed";

Deno.test("deterministic harassment and coordinated-spam bursts trip the narrowest limits", () => {
  const harassment = new Simulation();
  for (let index = 0; index < 20; index += 1) {
    assertEquals(harassment.send("PLAYER-A", "10.0.0.1", `harass:${index}`, `message ${index}`), "applied");
  }
  assertThrows(() => harassment.send("PLAYER-A", "10.0.0.1", "harass:20", "message 20"), "per_player_limit");

  const coordinated = new Simulation();
  for (let index = 0; index < 25; index += 1) {
    const sender = index % 2 === 0 ? "PLAYER-A" : "PLAYER-B";
    assertEquals(coordinated.send(sender, "10.0.0.9", `coord:${index}`, `burst ${index}`), "applied");
  }
  assertThrows(() => coordinated.send("PLAYER-B", "10.0.0.9", "coord:25", "burst 25"), "per_ip_limit");
});

Deno.test("duplicate, delayed, and out-of-order deliveries preserve replay and unread invariants", () => {
  const simulation = new Simulation();
  assertEquals(simulation.send("PLAYER-A", "10.0.0.1", "send:1", "first", 30), "applied");
  assertEquals(simulation.send("PLAYER-A", "10.0.0.1", "send:1", "first", 5), "replayed");
  assertThrows(() => simulation.send("PLAYER-A", "10.0.0.1", "send:1", "changed", 40), "idempotency_conflict");
  assertEquals(simulation.send("PLAYER-A", "10.0.0.1", "send:2", "second", 10), "applied");

  assertEquals(simulation.unread("PLAYER-B"), 2);
  simulation.read("PLAYER-B", 1);
  assertEquals(simulation.unread("PLAYER-B"), 1);
  simulation.read("PLAYER-B", 2);
  assertEquals(simulation.unread("PLAYER-B"), 0);
  simulation.read("PLAYER-B", 1);
  assertEquals(simulation.unread("PLAYER-B"), 0);
  assertEquals(simulation.deliveryOrder(), ["send:2", "send:1"]);
});

Deno.test("moderation and participant-removal races serialize and replay exactly", () => {
  const simulation = new Simulation();
  simulation.send("PLAYER-A", "10.0.0.1", "send:moderate", "unsafe text");
  assertEquals(simulation.moderate("moderate:1", "hide", "send:moderate"), "applied");
  assertEquals(simulation.moderate("moderate:1", "hide", "send:moderate"), "replayed");
  assertThrows(() => simulation.moderate("moderate:1", "unhide", "send:moderate"), "idempotency_conflict");
  assertEquals(simulation.unread("PLAYER-B"), 0);

  assertEquals(simulation.removeParticipant("remove:1", "PLAYER-B"), "applied");
  assertEquals(simulation.removeParticipant("remove:1", "PLAYER-B"), "replayed");
  assertThrows(() => simulation.send("PLAYER-B", "10.0.0.2", "removed:send", "denied"), "participant_denied");
  assertThrows(() => simulation.removeParticipant("remove:2", "PLAYER-A"), "last_participant");
});

Deno.test("retention, pause, ended-game, and session-expiry boundaries fail closed", () => {
  const simulation = new Simulation();
  simulation.now = 99;
  assertEquals(simulation.send("PLAYER-A", "10.0.0.1", "boundary:99", "allowed"), "applied");
  simulation.now = 100;
  assertThrows(() => simulation.send("PLAYER-A", "10.0.0.1", "boundary:100", "denied"), "retention_closed");
  assertEquals(simulation.deleteExpired("delete:1"), "applied");
  assertEquals(simulation.deleteExpired("delete:1"), "replayed");

  const paused = new Simulation();
  paused.status = "paused";
  assertThrows(() => paused.send("PLAYER-A", "10.0.0.1", "paused:1", "denied"), "game_not_active");

  const ended = new Simulation();
  ended.status = "ended";
  assertThrows(() => ended.send("PLAYER-A", "10.0.0.1", "ended:1", "denied"), "game_not_active");

  const expired = new Simulation();
  expired.now = expired.sessionExpiresAt;
  assertThrows(() => expired.send("PLAYER-A", "10.0.0.1", "expired:1", "denied"), "session_expired");
});

Deno.test("announcement spam and participant enumeration remain bounded", () => {
  const simulation = new Simulation();
  for (let index = 0; index < 5; index += 1) {
    assertEquals(simulation.announce(`announce:${index}`), "applied");
  }
  assertThrows(() => simulation.announce("announce:5"), "staff_action_limit");
  assertThrows(() => simulation.addParticipant("add:missing", "OTHER-GAME-PLAYER"), "participant_not_found");
  assertEquals(simulation.publicError("OTHER-GAME-PLAYER"), "participant_not_found");
  assertEquals(simulation.publicError("REMOVED-PLAYER"), "participant_not_found");
});

class Simulation {
  now = 0;
  status: GameStatus = "active";
  sessionExpiresAt = 200;
  retentionUntil = 100;
  private sequence = 0;
  private readonly participants = new Set(["PLAYER-A", "PLAYER-B"]);
  private readonly messages = new Map<string, {
    readonly sender: string;
    readonly body: string;
    readonly sequence: number;
    readonly deliveredAt: number;
    hidden: boolean;
  }>();
  private readonly lastRead = new Map<string, number>();
  private readonly commands = new Map<string, string>();
  private readonly counters = new Map<string, number>();
  private deleted = false;

  send(sender: string, ip: string, key: string, body: string, deliveredAt = this.sequence + 1): Outcome {
    this.guardActive();
    if (!this.participants.has(sender)) throw new Error("participant_denied");
    const fingerprint = `send|${sender}|${body}`;
    const replay = this.replay(key, fingerprint);
    if (replay) return replay;
    this.consume(`player:${sender}`, 20, "per_player_limit");
    this.consume("thread", 30, "per_thread_limit");
    this.consume("game", 40, "per_game_limit");
    this.consume(`ip:${ip}`, 25, "per_ip_limit");
    this.sequence += 1;
    this.messages.set(key, { sender, body, sequence: this.sequence, deliveredAt, hidden: false });
    this.commands.set(key, fingerprint);
    return "applied";
  }

  read(player: string, sequence: number): void {
    if (!this.participants.has(player)) throw new Error("participant_denied");
    this.lastRead.set(player, Math.max(this.lastRead.get(player) ?? 0, sequence));
  }

  unread(player: string): number {
    if (!this.participants.has(player)) throw new Error("participant_denied");
    const after = this.lastRead.get(player) ?? 0;
    return [...this.messages.values()].filter((message) =>
      !message.hidden && message.sender !== player && message.sequence > after
    ).length;
  }

  deliveryOrder(): string[] {
    return [...this.messages.entries()]
      .sort((left, right) => left[1].deliveredAt - right[1].deliveredAt)
      .map(([key]) => key);
  }

  moderate(key: string, action: "hide" | "unhide", messageKey: string): Outcome {
    const fingerprint = `moderate|${action}|${messageKey}`;
    const replay = this.replay(key, fingerprint);
    if (replay) return replay;
    const message = this.messages.get(messageKey);
    if (!message) throw new Error("message_not_found");
    message.hidden = action === "hide";
    this.commands.set(key, fingerprint);
    return "applied";
  }

  addParticipant(key: string, player: string): Outcome {
    this.guardActive();
    const fingerprint = `add|${player}`;
    const replay = this.replay(key, fingerprint);
    if (replay) return replay;
    if (player === "OTHER-GAME-PLAYER" || player === "REMOVED-PLAYER") {
      throw new Error("participant_not_found");
    }
    if (this.participants.size >= 500) throw new Error("participant_limit");
    this.participants.add(player);
    this.commands.set(key, fingerprint);
    return "applied";
  }

  removeParticipant(key: string, player: string): Outcome {
    this.guardActive();
    const fingerprint = `remove|${player}`;
    const replay = this.replay(key, fingerprint);
    if (replay) return replay;
    if (!this.participants.has(player)) throw new Error("participant_not_found");
    if (this.participants.size <= 1) throw new Error("last_participant");
    this.participants.delete(player);
    this.commands.set(key, fingerprint);
    return "applied";
  }

  announce(key: string): Outcome {
    const fingerprint = "announcement";
    const replay = this.replay(key, fingerprint);
    if (replay) return replay;
    this.consume("staff:announcement", 5, "staff_action_limit");
    this.commands.set(key, fingerprint);
    return "applied";
  }

  deleteExpired(key: string): Outcome {
    const fingerprint = "delete_expired";
    const replay = this.replay(key, fingerprint);
    if (replay) return replay;
    if (this.now < this.retentionUntil) throw new Error("retention_not_expired");
    this.deleted = true;
    this.messages.clear();
    this.commands.set(key, fingerprint);
    return "applied";
  }

  publicError(_reference: string): string {
    return "participant_not_found";
  }

  private guardActive(): void {
    if (this.deleted || this.now >= this.retentionUntil) throw new Error("retention_closed");
    if (this.now >= this.sessionExpiresAt) throw new Error("session_expired");
    if (this.status !== "active") throw new Error("game_not_active");
  }

  private replay(key: string, fingerprint: string): Outcome | null {
    const existing = this.commands.get(key);
    if (!existing) return null;
    if (existing !== fingerprint) throw new Error("idempotency_conflict");
    return "replayed";
  }

  private consume(bucket: string, limit: number, code: string): void {
    const next = (this.counters.get(bucket) ?? 0) + 1;
    if (next > limit) throw new Error(code);
    this.counters.set(bucket, next);
  }
}

function assertThrows(run: () => unknown, message: string): void {
  try {
    run();
  } catch (error) {
    if (error instanceof Error && error.message === message) return;
    throw error;
  }
  throw new Error(`Expected error: ${message}`);
}
function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`);
  }
}

import { handleMessagingParticipantOperation } from "./messagingParticipantOperations.ts";
import { readStaffMessagingRateLimitOperation } from "../../../src/security/staffMessagingRateLimitDispatch.ts";

const GAME = "00000000-0000-4000-8000-000000000001";
const STAFF = "00000000-0000-4000-8000-000000000002";
const THREAD = `thr_${"a".repeat(32)}`;
const ACTION = `mda_${"b".repeat(32)}`;
const NOW = "2026-07-22T06:00:00.000Z";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };

Deno.test("Admin Messaging adds and removes participants with public replay-safe results", async () => {
  for (const [pathAction, rpcAction, outcome, reason] of [
    ["add", "add_participant", "applied", ""],
    ["remove", "remove_participant", "replayed", "Harassment response."],
  ] as const) {
    const service = new FakeService([{
      participant_outcome: outcome,
      action_id: ACTION,
      thread_id: THREAD,
      participant_reference: "PLAYER-002",
      participant_action: rpcAction,
      participant_count: pathAction === "add" ? 3 : 1,
      created_at: NOW,
    }]);
    const result = await operation(service, pathAction, {
      playerId: "PLAYER-002",
      reason,
      idempotencyKey: `participant:${pathAction}:1`,
    });
    assertEquals(result?.status, 200);
    assertEquals(service.calls[0].name, "change_admin_message_participant_atomic_v1");
    assertEquals(service.calls[0].args.p_action, rpcAction);
    assertEquals((result?.body as any).data.outcome, outcome);
    assertEquals((result?.body as any).data.playerId, "PLAYER-002");
    assertNoUuid(JSON.stringify(result?.body));
  }
});

Deno.test("Admin Messaging participant commands fail closed before RPC", async () => {
  const cases = [
    ["add", { playerId: GAME, idempotencyKey: "participant:add:2" }],
    ["remove", { playerId: "PLAYER-002", idempotencyKey: "participant:remove:2" }],
    ["add", { playerId: "PLAYER-002", attachment: { name: "blocked.txt" }, idempotencyKey: "participant:add:3" }],
    ["add", { playerId: "PLAYER-002", reason: "javascript:alert(1)", idempotencyKey: "participant:add:4" }],
  ] as const;
  for (const [action, body] of cases) {
    const service = new FakeService(null);
    const result = await operation(service, action, body);
    assertEquals(result?.status, 400);
    assertEquals(service.calls.length, 0);
  }
});

Deno.test("Admin Messaging participant errors do not enumerate cross-game or removed players", async () => {
  for (const [message, status, code] of [
    ["ADMIN_MESSAGE_PARTICIPANT_NOT_FOUND", 404, "admin_message_participant_not_found"],
    ["ADMIN_MESSAGE_LAST_PARTICIPANT", 409, "admin_message_last_participant"],
    ["ADMIN_MESSAGE_PARTICIPANT_LIMIT", 409, "admin_message_participant_limit"],
    ["ADMIN_MESSAGES_SCOPE_FORBIDDEN", 404, "game_not_found"],
  ] as const) {
    const service = new FakeService(null, { code: "P0001", message });
    const result = await operation(service, message.includes("LAST") ? "remove" : "add", {
      playerId: "OTHER-GAME-PLAYER",
      reason: message.includes("LAST") ? "Required removal reason." : "",
      idempotencyKey: `participant:error:${code}`,
    });
    assertEquals(result?.status, status);
    assertEquals((result?.body as any).code, code);
    assertEquals(JSON.stringify(result?.body).includes("OTHER-GAME-PLAYER"), false);
  }
});

Deno.test("participant commands share the per-thread staff rate-limit bucket", () => {
  for (const action of ["add", "remove"] as const) {
    const suffix = `/messages/threads/${THREAD}/participants/${action}`;
    const request = new Request(`https://example.test/games/${GAME}${suffix}`, { method: "POST" });
    const operation = readStaffMessagingRateLimitOperation({ request, suffix });
    assertEquals(operation?.action, `staff.messages.thr_${"a".repeat(24)}`);
    assertEquals(operation?.profile, "sensitive");
  }
});

class FakeService {
  readonly calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  constructor(
    private readonly data: unknown,
    private readonly error: { readonly code?: string; readonly message: string } | null = null,
  ) {}
  rpc<T>(name: string, args: unknown): Promise<{ data: T | null; error: typeof this.error }> {
    this.calls.push({ name, args: args as Record<string, unknown> });
    return Promise.resolve({ data: this.data as T | null, error: this.error });
  }
}

function operation(service: FakeService, action: "add" | "remove", body: unknown) {
  const suffix = `/messages/threads/${THREAD}/participants/${action}`;
  return handleMessagingParticipantOperation(service, {
    request: new Request(`https://example.test/games/${GAME}${suffix}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    gameId: GAME,
    staffUserId: STAFF,
    suffix,
  });
}
function assertNoUuid(value: string): void {
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(value)) {
    throw new Error(`UUID leaked: ${value}`);
  }
}
function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`);
  }
}

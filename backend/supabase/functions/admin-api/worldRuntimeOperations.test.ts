import { handleWorldRuntimeAdminOperation } from "./worldRuntimeOperations.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const STAFF_ID = "00000000-0000-4000-8000-000000000002";
const CAMPAIGN_ID = `cmp_${"a".repeat(32)}`;
const EFFECT_ID = `cec_${"b".repeat(32)}`;
const ASSIGNMENT_ID = `acl_${"c".repeat(32)}`;

Deno.test("Admin World manual trigger sends only reviewed effects and server scope", async () => {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const result = await handleWorldRuntimeAdminOperation(service(calls), {
    request: jsonRequest("/world/campaign/manual-trigger", {
      campaignId: CAMPAIGN_ID,
      completeCampaign: false,
      effects: [{
        effectKind: "set_route_state",
        payload: {
          routeDefinitionIds: ["rte_meridian_1"],
          state: "closed",
          reason: "war",
        },
      }],
      eventKey: "campaign.war.route-close.v1",
      expectedPhase: "open_conflict",
      expectedRevision: 4,
      nextPhase: "adaptation",
      nextScheduledAt: "2026-07-22T00:00:00.000Z",
      prerequisiteEventKeys: ["campaign.war.open.v1"],
      reason: "Teacher approved the reviewed wartime route transition.",
      requestId: "manual-trigger-0001",
    }),
    gameId: GAME_ID,
    staffUserId: STAFF_ID,
    suffix: "/world/campaign/manual-trigger",
  });
  assertEquals(result.status, 200);
  assertEquals(calls.length, 1);
  assertEquals(calls[0]?.name, "execute_campaign_event_atomic_v2");
  assertEquals(calls[0]?.args.p_game_session_id, GAME_ID);
  assertEquals(calls[0]?.args.p_actor_staff_user_id, STAFF_ID);
  const commands = calls[0]?.args.p_effect_commands as readonly Record<string, unknown>[];
  assertEquals(commands[0]?.effectKind, "set_route_state");
  assertEquals(JSON.stringify(commands).includes("rawSql"), false);
});

Deno.test("Admin World rejects generic or extra manual effect payload fields", async () => {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const result = await handleWorldRuntimeAdminOperation(service(calls), {
    request: jsonRequest("/world/campaign/manual-trigger", {
      campaignId: CAMPAIGN_ID,
      completeCampaign: false,
      effects: [{
        effectKind: "set_route_state",
        payload: {
          routeDefinitionIds: ["rte_meridian_1"],
          state: "closed",
          reason: "war",
          rawSql: "update players set balance=999999",
        },
      }],
      eventKey: "campaign.war.route-close.v1",
      expectedPhase: "open_conflict",
      expectedRevision: 4,
      nextPhase: "adaptation",
      nextScheduledAt: "2026-07-22T00:00:00.000Z",
      prerequisiteEventKeys: [],
      reason: "Teacher approved the reviewed wartime route transition.",
      requestId: "manual-trigger-0002",
    }),
    gameId: GAME_ID,
    staffUserId: STAFF_ID,
    suffix: "/world/campaign/manual-trigger",
  });
  assertEquals(result.status, 400);
  assertEquals(calls.length, 0);
});

Deno.test("Admin World route state and correction operations preserve public IDs", async () => {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const route = await handleWorldRuntimeAdminOperation(service(calls), {
    request: jsonRequest("/world/routes/state", {
      costMultiplierBasisPoints: 12500,
      durationMultiplierBasisPoints: 15000,
      expectedRevision: 7,
      reason: "war",
      requestId: "route-state-0001",
      routeIds: ["rte_meridian_1"],
      status: "restricted",
    }),
    gameId: GAME_ID,
    staffUserId: STAFF_ID,
    suffix: "/world/routes/state",
  });
  assertEquals(route.status, 200);
  assertEquals(calls[0]?.name, "apply_world_route_state_v1");

  const correction = await handleWorldRuntimeAdminOperation(service(calls), {
    request: jsonRequest(`/world/arrival-classes/${ASSIGNMENT_ID}/correct`, {
      classId: "navigator",
      expectedRevision: 2,
      reason: "Reviewed correction after an invalid imported class assignment.",
      requestId: "arrival-correction-0001",
    }),
    gameId: GAME_ID,
    staffUserId: STAFF_ID,
    suffix: `/world/arrival-classes/${ASSIGNMENT_ID}/correct`,
  });
  assertEquals(correction.status, 200);
  assertEquals(calls[1]?.name, "correct_arrival_class_assignment_v1");
  assertEquals(calls[1]?.args.p_assignment_public_id, ASSIGNMENT_ID);
});

Deno.test("Admin World effect recovery is public-ID and audit scoped", async () => {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const result = await handleWorldRuntimeAdminOperation(service(calls), {
    request: jsonRequest(`/world/campaign/effects/${EFFECT_ID}/recover`, {
      reason: "Retry approved after the dependent notification runtime recovered.",
      requestId: "effect-recovery-0001",
    }),
    gameId: GAME_ID,
    staffUserId: STAFF_ID,
    suffix: `/world/campaign/effects/${EFFECT_ID}/recover`,
  });
  assertEquals(result.status, 200);
  assertEquals(calls[0]?.name, "recover_campaign_effect_command_v1");
  assertEquals(calls[0]?.args.p_command_public_id, EFFECT_ID);
  assertEquals(calls[0]?.args.p_actor_staff_user_id, STAFF_ID);
});

function service(calls: { name: string; args: Record<string, unknown> }[]) {
  return {
    from: () => {
      throw new Error("read path not expected in this test");
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return { data: [{ outcome: "applied" }], error: null };
    },
  } as never;
}

function jsonRequest(path: string, body: unknown): Request {
  return new Request(`https://example.test/admin-api/games/${GAME_ID}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`);
  }
}

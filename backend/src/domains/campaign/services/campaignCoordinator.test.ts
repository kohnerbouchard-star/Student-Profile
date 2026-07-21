import type {
  CampaignEventDefinition,
  CampaignExecutionCommand,
  CampaignInstance,
} from "../contracts/campaignRuntimeContracts.ts";
import { createCampaignInstance } from "./campaignStateMachine.ts";
import {
  applyCampaignControl,
  buildPlayerCampaignContext,
  type CampaignAuditEntry,
  type CampaignGameLifecycleState,
  type CampaignRepository,
  type CampaignTransaction,
  dispatchCampaignCommand,
  executeManualCampaignEvent,
  executeScheduledCampaignEvent,
  selectDueCampaignInstances,
} from "./campaignCoordinator.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const NOW = "2026-07-21T00:00:00.000Z";
const EVENT: CampaignEventDefinition = {
  eventKey: "arrival.welcome",
  phase: "arrival",
  nextPhase: "opportunity",
  completeCampaign: false,
  prerequisites: [],
  effects: [
    { kind: "publish_news", newsDefinitionId: "news.arrival", audience: "all_players" },
    { kind: "create_contract", contractDefinitionId: "contract.arrival", targetLocationIds: ["loc_c0_capital"] },
  ],
};

Deno.test("scheduler selects due active instances deterministically and within bounds", () => {
  const instances = [
    instance("campaign-b", "2026-07-21T00:00:00.000Z"),
    instance("campaign-a", "2026-07-21T00:00:00.000Z"),
    { ...instance("campaign-paused", "2026-07-20T00:00:00.000Z"), status: "paused" as const },
    instance("campaign-future", "2026-07-22T00:00:00.000Z"),
  ];
  assertEquals(
    selectDueCampaignInstances(instances, "2026-07-21T00:00:01.000Z", 2)
      .map((item) => item.campaignInstanceId),
    ["campaign-a", "campaign-b"],
  );
});

Deno.test("scheduled execution persists outbox, state, and audit in one transaction", async () => {
  const repository = memoryRepository(instance("campaign-1", NOW));
  const result = await executeScheduledCampaignEvent({
    repository,
    campaignInstanceId: "campaign-1",
    gameId: "game-1",
    event: EVENT,
    scheduledFor: NOW,
    occurredAt: "2026-07-21T00:00:01.000Z",
  });
  assertEquals(result.commands.length, 2);
  assertEquals(repository.state.instance.currentPhase, "opportunity");
  assertEquals(repository.state.commands.length, 2);
  assertEquals(repository.state.audit.length, 1);

  const replayRepository = memoryRepository({
    ...repository.state.instance,
    currentPhase: "arrival",
    status: "active",
  });
  const replay = await executeScheduledCampaignEvent({
    repository: replayRepository,
    campaignInstanceId: "campaign-1",
    gameId: "game-1",
    event: EVENT,
    scheduledFor: NOW,
    occurredAt: "2026-07-21T00:00:02.000Z",
  });
  assertEquals(replay.replayed, true);
  assertEquals(replayRepository.state.commands.length, 0);
  assertEquals(replayRepository.state.audit.length, 0);
});

Deno.test("cross-domain enqueue failure leaves campaign, commands, and audit unchanged", async () => {
  const original = instance("campaign-2", NOW);
  const repository = memoryRepository(original, true);
  await assertRejectsCode(async () => {
    await executeScheduledCampaignEvent({
      repository,
      campaignInstanceId: "campaign-2",
      gameId: "game-1",
      event: EVENT,
      scheduledFor: NOW,
      occurredAt: "2026-07-21T00:00:01.000Z",
    });
  }, "simulated_enqueue_failure");
  assertEquals(repository.state.instance.revision, 0);
  assertEquals(repository.state.commands.length, 0);
  assertEquals(repository.state.audit.length, 0);
});

Deno.test("draft, paused, ended, and archived games reject campaign mutation", async () => {
  for (const lifecycle of ["draft", "paused", "ended", "archived"] as const) {
    const repository = memoryRepository(instance(`campaign-${lifecycle}`, NOW), false, lifecycle);
    await assertRejectsCode(async () => {
      await executeScheduledCampaignEvent({
        repository,
        campaignInstanceId: `campaign-${lifecycle}`,
        gameId: "game-1",
        event: EVENT,
        scheduledFor: NOW,
        occurredAt: "2026-07-21T00:00:01.000Z",
      });
    }, "campaign_game_not_active");
    assertEquals(repository.state.instance.revision, 0);
    assertEquals(repository.state.commands.length, 0);
    assertEquals(repository.state.audit.length, 0);
  }
});

Deno.test("manual trigger requires server-resolved game permission and reviewable reason", async () => {
  const repository = memoryRepository(instance("campaign-3", NOW));
  const result = await executeManualCampaignEvent({
    repository,
    campaignInstanceId: "campaign-3",
    gameId: "game-1",
    event: EVENT,
    requestId: "manual-request-1",
    reason: "Teacher approved this bounded campaign trigger.",
    occurredAt: "2026-07-21T00:00:01.000Z",
    actor: { staffUserId: "staff-1", gameId: "game-1", permission: "campaign_control" },
  });
  assertEquals(result.replayed, false);
  assertEquals(repository.state.audit[0]?.actorType, "staff_user");

  await assertRejectsCode(async () => {
    await executeManualCampaignEvent({
      repository: memoryRepository(instance("campaign-4", NOW)),
      campaignInstanceId: "campaign-4",
      gameId: "game-1",
      event: EVENT,
      requestId: "manual-request-2",
      reason: "Too short",
      occurredAt: NOW,
      actor: { staffUserId: "staff-1", gameId: "game-2", permission: "campaign_control" },
    });
  }, "campaign_event_invalid");
});

Deno.test("Admin pause, resume, emergency disable, and bounded correction are audited", () => {
  const original = instance("campaign-5", NOW);
  const actor = { staffUserId: "staff-1", gameId: "game-1", permission: "campaign_control" as const };
  const paused = applyCampaignControl(original, {
    gameId: "game-1",
    expectedRevision: 0,
    action: "pause",
    reason: "Pause campaign while reviewing classroom conditions.",
    actor,
    occurredAt: "2026-07-21T01:00:00.000Z",
  });
  assertEquals(paused.instance.status, "paused");
  assertEquals(paused.audit.action, "pause");
  const resumed = applyCampaignControl(paused.instance, {
    gameId: "game-1",
    expectedRevision: 1,
    action: "resume",
    reason: "Resume after the classroom review completed.",
    actor,
    occurredAt: "2026-07-21T02:00:00.000Z",
  });
  assertEquals(resumed.instance.status, "active");
  const corrected = applyCampaignControl(resumed.instance, {
    gameId: "game-1",
    expectedRevision: 2,
    action: "correct_phase",
    correctedPhase: "opportunity",
    reason: "Correct one phase after verified event recovery.",
    actor,
    occurredAt: "2026-07-21T03:00:00.000Z",
  });
  assertEquals(corrected.instance.currentPhase, "opportunity");
  const disabled = applyCampaignControl(corrected.instance, {
    gameId: "game-1",
    expectedRevision: 3,
    action: "emergency_disable",
    reason: "Emergency disable after an integrity alert.",
    actor,
    occurredAt: "2026-07-21T04:00:00.000Z",
  });
  assertEquals(disabled.instance.status, "emergency_disabled");
  assertThrowsCode(() => applyCampaignControl(resumed.instance, {
    gameId: "game-1",
    expectedRevision: 2,
    action: "correct_phase",
    correctedPhase: "open_conflict",
    reason: "This attempted correction skips multiple phases.",
    actor,
    occurredAt: "2026-07-21T03:00:00.000Z",
  }), "campaign_transition_invalid");
});

Deno.test("purpose-built command dispatch and Player context expose no ownership UUIDs", async () => {
  const calls: string[] = [];
  const ports = {
    publishNews: async () => { calls.push("publish_news"); },
    createContract: async () => { calls.push("create_contract"); },
    notifyPlayers: async () => { calls.push("notify_players"); },
    applyMarketShock: async () => { calls.push("apply_market_shock"); },
    setStoreScarcity: async () => { calls.push("set_store_scarcity"); },
    setRouteState: async () => { calls.push("set_route_state"); },
  };
  for (const command of commandFixtures()) await dispatchCampaignCommand(command, ports);
  assertEquals(calls, [
    "publish_news",
    "create_contract",
    "notify_players",
    "apply_market_shock",
    "set_store_scarcity",
    "set_route_state",
  ]);
  const campaign = { ...instance("campaign-6", NOW), eventSequence: 2, currentPhase: "shortage" as const };
  const context = buildPlayerCampaignContext({
    instance: campaign,
    playerLocationId: "loc_c0_capital",
    affectedLocationIds: ["loc_c0_capital"],
    history: [
      { publicEventId: "evt_1", eventKey: "arrival", phase: "arrival", sequence: 1, occurredAt: NOW, summaryDefinitionId: "summary.arrival" },
      { publicEventId: "evt_3", eventKey: "future", phase: "rivalry", sequence: 3, occurredAt: NOW, summaryDefinitionId: "summary.future" },
      { publicEventId: "evt_2", eventKey: "opportunity", phase: "opportunity", sequence: 2, occurredAt: NOW, summaryDefinitionId: "summary.opportunity" },
    ],
  });
  assertEquals(context.currentLocationAffected, true);
  assertEquals(context.history.map((item) => item.publicEventId), ["evt_1", "evt_2"]);
  assertEquals("campaignInstanceId" in context, false);
  assertEquals("gameId" in context, false);
});

function instance(id: string, scheduledAt: string | null): CampaignInstance {
  return createCampaignInstance({
    campaignInstanceId: id,
    gameId: "game-1",
    definition: {
      packId: "econovaria.beta-seed-pack.v1",
      packVersion: "1.0.0-beta",
      definitionId: "campaign.beta.primary",
      definitionDigest: "sha256:campaign",
    },
    now: NOW,
    scheduledAt,
  });
}

function memoryRepository(
  initial: CampaignInstance,
  failEnqueue = false,
  lifecycle: CampaignGameLifecycleState = "active",
): CampaignRepository & {
  readonly state: { instance: CampaignInstance; commands: CampaignExecutionCommand[]; audit: CampaignAuditEntry[] };
} {
  const state = { instance: initial, commands: [] as CampaignExecutionCommand[], audit: [] as CampaignAuditEntry[] };
  return {
    state,
    withTransaction: async <T>(work: (transaction: CampaignTransaction) => Promise<T>) => {
      const staged = { instance: state.instance, commands: [...state.commands], audit: [...state.audit] };
      const transaction: CampaignTransaction = {
        loadGameLifecycleForUpdate: async ({ gameId }) => {
          if (gameId !== staged.instance.gameId) {
            throw Object.assign(new Error("scope"), { code: "campaign_game_scope_mismatch" });
          }
          return lifecycle;
        },
        loadCampaignForUpdate: async ({ gameId, campaignInstanceId }) => {
          if (gameId !== staged.instance.gameId || campaignInstanceId !== staged.instance.campaignInstanceId) {
            throw Object.assign(new Error("scope"), { code: "campaign_game_scope_mismatch" });
          }
          return staged.instance;
        },
        saveCampaign: async (next) => { staged.instance = next; },
        enqueueCommands: async (commands) => {
          if (failEnqueue) throw Object.assign(new Error("enqueue"), { code: "simulated_enqueue_failure" });
          staged.commands.push(...commands);
        },
        appendAudit: async (entry) => { staged.audit.push(entry); },
      };
      const result = await work(transaction);
      state.instance = staged.instance;
      state.commands.splice(0, state.commands.length, ...staged.commands);
      state.audit.splice(0, state.audit.length, ...staged.audit);
      return result;
    },
  };
}

function commandFixtures(): readonly CampaignExecutionCommand[] {
  const effects: CampaignExecutionCommand["effect"][] = [
    { kind: "publish_news", newsDefinitionId: "news", audience: "all_players" },
    { kind: "create_contract", contractDefinitionId: "contract", targetLocationIds: [] },
    { kind: "notify_players", notificationDefinitionId: "notification", audience: "all_players" },
    { kind: "apply_market_shock", marketShockDefinitionId: "shock", magnitudeBasisPoints: -500 },
    { kind: "set_store_scarcity", scarcityDefinitionId: "scarcity", targetLocationIds: [] },
    { kind: "set_route_state", routeDefinitionIds: ["rte_1"], state: "closed", reason: "war" },
  ];
  return effects.map((effect, index) => ({
    idempotencyKey: `command-${index}`,
    campaignInstanceId: "campaign-1",
    gameId: "game-1",
    eventKey: "event-1",
    sequence: 1,
    effect,
  }));
}

async function assertRejectsCode(run: () => Promise<unknown>, expectedCode: string): Promise<void> {
  try {
    await run();
  } catch (error) {
    assertEquals((error as { code?: string }).code, expectedCode);
    return;
  }
  throw new Error(`Expected rejection ${expectedCode}`);
}

function assertThrowsCode(run: () => unknown, expectedCode: string): void {
  try {
    run();
  } catch (error) {
    assertEquals((error as { code?: string }).code, expectedCode);
    return;
  }
  throw new Error(`Expected error ${expectedCode}`);
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`);
  }
}

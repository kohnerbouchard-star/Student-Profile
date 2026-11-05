import type {
  CampaignEventDefinition,
  CampaignInstance,
} from "../../../src/domains/campaign/contracts/campaignRuntimeContracts.ts";
import {
  runCampaignEffectWorker,
  type CampaignEffectPorts,
  type CampaignEffectWorkerRepository,
  type ClaimedCampaignEffectCommand,
} from "../../../src/domains/campaign/services/campaignEffectWorker.ts";
import type {
  CampaignProgramDefinition,
} from "../../../src/domains/campaign/services/campaignProgram.ts";
import {
  executeProtectedManualCampaignTrigger,
  runCampaignScheduler,
  type CampaignProgramProvider,
  type CampaignSchedulerRepository,
} from "../../../src/domains/campaign/services/campaignScheduler.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const NOW = "2026-07-21T00:00:00.000Z";

Deno.test("scheduler orders campaigns, records replay, and isolates one failure", async () => {
  const calls: string[] = [];
  const repository: CampaignSchedulerRepository = {
    listDueCampaigns: async () => [instance("cmp_b"), instance("cmp_a"), instance("cmp_c")],
    executeEventAtomic: async ({ instance: campaign, triggerKey }) => {
      calls.push(`${campaign.campaignInstanceId}:${triggerKey}`);
      if (campaign.campaignInstanceId === "cmp_c") {
        throw Object.assign(new Error("storage"), { code: "campaign_storage_unavailable" });
      }
      return {
        executionOutcome: campaign.campaignInstanceId === "cmp_b" ? "replayed" : "executed",
        campaignId: campaign.campaignInstanceId,
        eventId: `evt_${campaign.campaignInstanceId}`,
        status: "active",
        currentPhase: "opportunity",
        revision: 1,
        eventSequence: 1,
        outcome: null,
      };
    },
  };
  const result = await runCampaignScheduler({
    repository,
    programs: provider(),
    dueAt: NOW,
    runId: "scheduler-run-0001",
  });
  assertEquals(calls.map((call) => call.split(":")[0]), ["cmp_a", "cmp_b", "cmp_c"]);
  assertEquals(result, {
    dueCount: 3,
    executedCount: 1,
    replayedCount: 1,
    failedCount: 1,
    failures: [{ campaignId: "cmp_c", code: "campaign_storage_unavailable" }],
  });
});

Deno.test("scheduler empty discovery preserves the bounded clock and performs no work", async () => {
  let discovery: unknown;
  const unexpected = async (): Promise<never> => { throw new Error("unexpected work"); };
  const result = await runCampaignScheduler({
    repository: {
      listDueCampaigns: async (input) => { discovery = input; return []; },
      executeEventAtomic: unexpected,
    },
    programs: { readProgram: unexpected, readOutcomeEvidence: unexpected },
    dueAt: NOW,
    runId: "scheduler-empty-0001",
    limit: 25,
  });
  assertEquals(discovery, { dueAt: NOW, limit: 25 });
  assertEquals(result, {
    dueCount: 0, executedCount: 0, replayedCount: 0, failedCount: 0, failures: [],
  });
});

Deno.test("scheduler isolates a missing program and continues the next campaign", async () => {
  const executed: string[] = [];
  const result = await runCampaignScheduler({
    repository: {
      listDueCampaigns: async () => [instance("cmp_missing"), instance("cmp_next")],
      executeEventAtomic: async (input) => {
        executed.push(input.instance.campaignInstanceId);
        return execution(input);
      },
    },
    programs: {
      ...provider(),
      readProgram: async (campaign) => {
        if (campaign.campaignInstanceId === "cmp_missing") {
          throw Object.assign(new Error("missing synthetic program"), {
            code: "campaign_program_not_found",
          });
        }
        return program();
      },
    },
    dueAt: NOW,
    runId: "scheduler-missing-0001",
  });
  assertEquals(executed, ["cmp_next"]);
  assertEquals(result, {
    dueCount: 2, executedCount: 1, replayedCount: 0, failedCount: 1,
    failures: [{ campaignId: "cmp_missing", code: "campaign_program_not_found" }],
  });
});

Deno.test("scheduler rejects paused candidates before program reads or atomic execution", async () => {
  let programReads = 0;
  let executions = 0;
  const result = await runCampaignScheduler({
    repository: {
      listDueCampaigns: async () => [{ ...instance("cmp_paused"), status: "paused", pausedAt: NOW }],
      executeEventAtomic: async (input) => { executions += 1; return execution(input); },
    },
    programs: {
      ...provider(),
      readProgram: async () => { programReads += 1; return program(); },
    },
    dueAt: NOW,
    runId: "scheduler-paused-0001",
  });
  assertEquals([programReads, executions], [0, 0]);
  assertEquals(result, {
    dueCount: 1, executedCount: 0, replayedCount: 0, failedCount: 1,
    failures: [{ campaignId: "cmp_paused", code: "campaign_event_invalid" }],
  });
});

Deno.test("scheduler keeps two games at different stages scoped to their own event and evidence", async () => {
  const arrival = instance("cmp_arrival");
  const adaptation: CampaignInstance = {
    ...instance("cmp_adaptation"), gameId: "game-2", currentPhase: "adaptation",
    revision: 6, eventSequence: 6,
  };
  const candidates = [arrival, adaptation];
  const before = JSON.stringify(candidates);
  const calls: unknown[] = [];
  const evidenceGames: string[] = [];
  const result = await runCampaignScheduler({
    repository: {
      listDueCampaigns: async () => candidates,
      executeEventAtomic: async (input) => {
        calls.push({ game: input.instance.gameId, phase: input.event.phase,
          next: input.event.nextPhase, event: input.event.eventKey,
          effects: input.event.effects, trigger: input.triggerKey,
          revision: input.instance.revision, at: input.occurredAt, actor: input.actorStaffUserId });
        return execution(input);
      },
    },
    programs: {
      ...provider(),
      readOutcomeEvidence: async (campaign) => {
        evidenceGames.push(campaign.gameId);
        return { recoveryReadinessBasisPoints: 7_000, evidenceRevision: 7, evidenceDigest: digest("e") };
      },
    },
    dueAt: NOW,
    runId: "scheduler-two-games-0001",
  });
  assertEquals(evidenceGames, ["game-2"]);
  assertEquals(calls, [
    { game: "game-2", phase: "adaptation", next: "reconstruction",
      event: "campaign.reconstruction.v1", effects: program().terminalEvents.reconstruction.effects,
      trigger: "scheduler:scheduler-two-games-0001:7", revision: 6, at: NOW, actor: null },
    { game: "game-1", phase: "arrival", next: "opportunity",
      event: "campaign.arrival.v1", effects: program().eventsByPhase.arrival.effects,
      trigger: "scheduler:scheduler-two-games-0001:1", revision: 0, at: NOW, actor: null },
  ]);
  assertEquals(result, {
    dueCount: 2, executedCount: 2, replayedCount: 0, failedCount: 0, failures: [],
  });
  assertEquals(JSON.stringify(candidates), before);
});

function execution(input: Parameters<CampaignSchedulerRepository["executeEventAtomic"]>[0]) {
  return {
    executionOutcome: "executed" as const,
    campaignId: input.instance.campaignInstanceId,
    eventId: `evt_${input.instance.campaignInstanceId}`,
    status: input.instance.status,
    currentPhase: input.event.nextPhase ?? input.instance.currentPhase,
    revision: input.instance.revision + 1,
    eventSequence: input.instance.eventSequence + 1,
    outcome: null,
  };
}

Deno.test("protected manual trigger uses server-owned actor game and request key", async () => {
  let captured: unknown = null;
  const repository: CampaignSchedulerRepository = {
    listDueCampaigns: async () => [],
    executeEventAtomic: async (input) => {
      captured = input;
      return {
        executionOutcome: "executed",
        campaignId: input.instance.campaignInstanceId,
        eventId: "evt_manual",
        status: "active",
        currentPhase: "opportunity",
        revision: 1,
        eventSequence: 1,
        outcome: null,
      };
    },
  };
  await executeProtectedManualCampaignTrigger({
    repository,
    programs: provider(),
    instance: instance("cmp_manual"),
    requestId: "manual-request-0001",
    actorStaffUserId: "staff-1",
    actorGameId: "game-1",
    reason: "Teacher approved this bounded campaign trigger.",
    occurredAt: NOW,
  });
  assertEquals((captured as { triggerKey: string }).triggerKey, "manual:manual-request-0001");
  assertEquals((captured as { actorStaffUserId: string }).actorStaffUserId, "staff-1");

  await assertRejectsCode(async () => {
    await executeProtectedManualCampaignTrigger({
      repository,
      programs: provider(),
      instance: instance("cmp_manual_wrong"),
      requestId: "manual-request-0002",
      actorStaffUserId: "staff-1",
      actorGameId: "game-2",
      reason: "Teacher approved this bounded campaign trigger.",
      occurredAt: NOW,
    });
  }, "campaign_event_invalid");
});

Deno.test("effect worker completes all reviewed kinds, records failures, and never runs generic payloads", async () => {
  const completed: string[] = [];
  const failed: { commandId: string; errorCode: string }[] = [];
  const delivered: string[] = [];
  const repository: CampaignEffectWorkerRepository = {
    claim: async () => commands(),
    complete: async ({ commandId }) => { completed.push(commandId); },
    fail: async (input) => { failed.push(input); },
  };
  const ports: CampaignEffectPorts = {
    publishNews: async ({ idempotencyKey }) => { delivered.push(`news:${idempotencyKey}`); },
    publishCutscene: async ({ idempotencyKey }) => { delivered.push(`cutscene:${idempotencyKey}`); },
    createContract: async ({ idempotencyKey }) => { delivered.push(`contract:${idempotencyKey}`); },
    notifyPlayers: async ({ idempotencyKey }) => { delivered.push(`notify:${idempotencyKey}`); },
    applyMarketShock: async ({ idempotencyKey }) => { delivered.push(`market:${idempotencyKey}`); },
    setStoreScarcity: async () => {
      throw Object.assign(new Error("catalog missing"), { code: "scarcity_definition_missing" });
    },
    setRouteState: async ({ idempotencyKey }) => { delivered.push(`route:${idempotencyKey}`); },
    applyPlayerImpact: async ({ idempotencyKey }) => { delivered.push(`impact:${idempotencyKey}`); },
  };
  const result = await runCampaignEffectWorker({
    repository,
    ports,
    claimedAt: NOW,
  });
  assertEquals(result.claimedCount, 8);
  assertEquals(result.completedCount, 7);
  assertEquals(result.failedCount, 1);
  assertEquals(completed.length, 7);
  assertEquals(failed, [{
    commandId: id("f"),
    errorCode: "scarcity_definition_missing",
  }]);
  assertEquals(delivered, [
    "news:effect-news",
    "cutscene:effect-cutscene",
    "contract:effect-contract",
    "notify:effect-notify",
    "market:effect-market",
    "route:effect-route",
    "impact:effect-impact",
  ]);
});

Deno.test("malformed effect payload fails closed before any domain port", async () => {
  let portCalls = 0;
  const failed: string[] = [];
  const repository: CampaignEffectWorkerRepository = {
    claim: async () => [{
      commandId: id("a"),
      gameId: "game-1",
      campaignId: campaignId("a"),
      idempotencyKey: "effect-malformed",
      effectKind: "set_route_state",
      payload: { routeDefinitionIds: ["internal-uuid"], state: "closed", reason: "war" },
      attemptCount: 1,
    }],
    complete: async () => { throw new Error("must not complete"); },
    fail: async ({ commandId }) => { failed.push(commandId); },
  };
  const ports: CampaignEffectPorts = {
    publishNews: async () => { portCalls += 1; },
    publishCutscene: async () => { portCalls += 1; },
    createContract: async () => { portCalls += 1; },
    notifyPlayers: async () => { portCalls += 1; },
    applyMarketShock: async () => { portCalls += 1; },
    setStoreScarcity: async () => { portCalls += 1; },
    setRouteState: async () => { portCalls += 1; },
    applyPlayerImpact: async () => { portCalls += 1; },
  };
  const result = await runCampaignEffectWorker({ repository, ports, claimedAt: NOW });
  assertEquals(result.failedCount, 1);
  assertEquals(portCalls, 0);
  assertEquals(failed, [id("a")]);
});

function provider(): CampaignProgramProvider {
  return {
    readProgram: async () => program(),
    readOutcomeEvidence: async () => ({
      recoveryReadinessBasisPoints: 7_000,
      evidenceRevision: 1,
      evidenceDigest: digest("e"),
    }),
  };
}

function program(): CampaignProgramDefinition {
  return {
    programId: "campaign.beta.primary.v1",
    packId: "econovaria.beta-seed-pack.v1",
    packVersion: "1.0.0-beta",
    definitionDigest: digest("a"),
    recoveryThresholdBasisPoints: 6_000,
    eventsByPhase: {
      arrival: event("arrival", "arrival", "opportunity"),
      opportunity: event("opportunity", "opportunity", "rivalry"),
      rivalry: event("rivalry", "rivalry", "shortage"),
      shortage: event("shortage", "shortage", "meridian_disruption"),
      meridian_disruption: event("meridian", "meridian_disruption", "open_conflict"),
      open_conflict: event("conflict", "open_conflict", "adaptation"),
      adaptation: event("adaptation", "adaptation", null),
    },
    terminalEvents: {
      reconstruction: {
        ...event("reconstruction", "adaptation", "reconstruction"),
        completeCampaign: true,
      },
      continuedConflict: {
        ...event("continued-conflict", "adaptation", "continued_conflict"),
        completeCampaign: true,
      },
    },
  };
}

function event(
  suffix: string,
  phase: CampaignEventDefinition["phase"],
  nextPhase: CampaignEventDefinition["nextPhase"],
): CampaignEventDefinition {
  return {
    eventKey: `campaign.${suffix}.v1`,
    phase,
    nextPhase,
    completeCampaign: false,
    prerequisites: [],
    effects: [{
      kind: "publish_news",
      newsDefinitionId: `news.${suffix}.v1`,
      audience: "all_players",
    }],
  };
}

function instance(campaignInstanceId: string): CampaignInstance {
  return {
    campaignInstanceId,
    gameId: "game-1",
    definition: {
      packId: "econovaria.beta-seed-pack.v1",
      packVersion: "1.0.0-beta",
      definitionId: "campaign.beta.primary.v1",
      definitionDigest: digest("a"),
    },
    status: "active",
    currentPhase: "arrival",
    revision: 0,
    eventSequence: 0,
    executedEventKeys: [],
    completedEffectKeys: [],
    outcome: null,
    scheduledAt: NOW,
    pausedAt: null,
    disabledAt: null,
    completedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function commands(): readonly ClaimedCampaignEffectCommand[] {
  return [
    command("a", "effect-news", "publish_news", {
      newsDefinitionId: "news.arrival.v1",
      audience: "all_players",
    }),
    command("0", "effect-cutscene", "publish_cutscene", {
      cutsceneDefinitionId: "cutscene.arrival.v1",
      audience: "all_players",
    }),
    command("b", "effect-contract", "create_contract", {
      contractDefinitionId: "contract.arrival.v1",
      targetLocationIds: ["loc_eldoran_capital_v1"],
    }),
    command("c", "effect-notify", "notify_players", {
      notificationDefinitionId: "notification.arrival.v1",
      audience: "all_players",
    }),
    command("d", "effect-market", "apply_market_shock", {
      marketShockDefinitionId: "market-shock.shortage.v1",
      magnitudeBasisPoints: -500,
    }),
    command("f", "effect-scarcity", "set_store_scarcity", {
      scarcityDefinitionId: "scarcity.shortage.v1",
      targetLocationIds: ["loc_eldoran_capital_v1"],
    }),
    command("e", "effect-route", "set_route_state", {
      routeDefinitionIds: ["rte_eldoran_valerion_v1"],
      state: "closed",
      reason: "war",
    }),
    command("1", "effect-impact", "apply_player_impact", {
      playerImpactDefinitionId: "player-impact.conflict.v1",
      audience: "affected_locations",
      magnitudeBasisPoints: -750,
    }),
  ];
}

function command(
  character: string,
  idempotencyKey: string,
  effectKind: ClaimedCampaignEffectCommand["effectKind"],
  payload: unknown,
): ClaimedCampaignEffectCommand {
  return {
    commandId: id(character),
    gameId: "game-1",
    campaignId: campaignId(character),
    idempotencyKey,
    effectKind,
    payload,
    attemptCount: 1,
  };
}

function id(character: string): string {
  return `cec_${character.repeat(32)}`;
}

function campaignId(character: string): string {
  return `cmp_${character.repeat(32)}`;
}

function digest(character: string): string {
  return `sha256:${character.repeat(64)}`;
}

async function assertRejectsCode(
  run: () => Promise<unknown>,
  expectedCode: string,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    assertEquals((error as { code?: string }).code, expectedCode);
    return;
  }
  throw new Error(`Expected rejection ${expectedCode}`);
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`);
  }
}

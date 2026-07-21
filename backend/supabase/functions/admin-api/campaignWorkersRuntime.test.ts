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

Deno.test("effect worker completes successes, records failures, and never runs generic payloads", async () => {
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
    createContract: async ({ idempotencyKey }) => { delivered.push(`contract:${idempotencyKey}`); },
    notifyPlayers: async ({ idempotencyKey }) => { delivered.push(`notify:${idempotencyKey}`); },
    applyMarketShock: async ({ idempotencyKey }) => { delivered.push(`market:${idempotencyKey}`); },
    setStoreScarcity: async () => {
      throw Object.assign(new Error("catalog missing"), { code: "scarcity_definition_missing" });
    },
    setRouteState: async ({ idempotencyKey }) => { delivered.push(`route:${idempotencyKey}`); },
  };
  const result = await runCampaignEffectWorker({
    repository,
    ports,
    claimedAt: NOW,
  });
  assertEquals(result.claimedCount, 6);
  assertEquals(result.completedCount, 5);
  assertEquals(result.failedCount, 1);
  assertEquals(completed.length, 5);
  assertEquals(failed, [{
    commandId: id("f"),
    errorCode: "scarcity_definition_missing",
  }]);
  assertEquals(delivered, [
    "news:effect-news",
    "contract:effect-contract",
    "notify:effect-notify",
    "market:effect-market",
    "route:effect-route",
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
    createContract: async () => { portCalls += 1; },
    notifyPlayers: async () => { portCalls += 1; },
    applyMarketShock: async () => { portCalls += 1; },
    setStoreScarcity: async () => { portCalls += 1; },
    setRouteState: async () => { portCalls += 1; },
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

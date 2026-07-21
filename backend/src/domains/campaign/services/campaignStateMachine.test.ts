import type { CampaignEventDefinition } from "../contracts/campaignRuntimeContracts.ts";
import {
  createCampaignInstance,
  executeCampaignEvent,
} from "./campaignStateMachine.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME = "00000000-0000-4000-8000-000000000001";
const OTHER_GAME = "00000000-0000-4000-8000-000000000002";
const NOW = "2026-07-21T00:00:00.000Z";

Deno.test("campaign state machine executes effects once and replays safely", () => {
  const instance = createCampaignInstance({
    campaignInstanceId: "00000000-0000-4000-8000-000000000101",
    gameId: GAME,
    definition: {
      packId: "econovaria.beta-seed-pack.v1",
      packVersion: "1.0.0-beta",
      definitionId: "campaign.beta.primary",
      definitionDigest: "sha256:campaign-definition",
    },
    now: NOW,
  });
  const event: CampaignEventDefinition = {
    eventKey: "arrival.intro",
    phase: "arrival",
    nextPhase: "opportunity",
    completeCampaign: false,
    prerequisites: [],
    effects: [
      {
        kind: "publish_news",
        newsDefinitionId: "news.arrival.welcome",
        audience: "all_players",
      },
      {
        kind: "notify_players",
        notificationDefinitionId: "notification.arrival.welcome",
        audience: "all_players",
      },
    ],
  };

  const first = executeCampaignEvent(instance, event, {
    gameId: GAME,
    expectedRevision: 0,
    triggerKey: "scheduler:2026-07-21T00:00:00Z",
    occurredAt: "2026-07-21T00:00:01.000Z",
  });
  assertEquals(first.replayed, false);
  assertEquals(first.instance.currentPhase, "opportunity");
  assertEquals(first.instance.revision, 1);
  assertEquals(first.commands.length, 2);
  assertEquals(new Set(first.commands.map((command) => command.idempotencyKey)).size, 2);

  const replay = executeCampaignEvent(
    { ...first.instance, currentPhase: "arrival", status: "active" },
    event,
    {
      gameId: GAME,
      expectedRevision: 1,
      triggerKey: "scheduler:2026-07-21T00:00:00Z",
      occurredAt: "2026-07-21T00:00:02.000Z",
    },
  );
  assertEquals(replay.replayed, true);
  assertEquals(replay.commands.length, 0);
  assertEquals(replay.instance.revision, 1);
});

Deno.test("campaign rejects cross-game, stale, skipped, and premature terminal execution", () => {
  const instance = createCampaignInstance({
    campaignInstanceId: "00000000-0000-4000-8000-000000000102",
    gameId: GAME,
    definition: {
      packId: "econovaria.beta-seed-pack.v1",
      packVersion: "1.0.0-beta",
      definitionId: "campaign.beta.primary",
      definitionDigest: "sha256:campaign-definition",
    },
    now: NOW,
  });
  const event: CampaignEventDefinition = {
    eventKey: "arrival.invalid-terminal",
    phase: "arrival",
    nextPhase: "opportunity",
    completeCampaign: true,
    prerequisites: [],
    effects: [{
      kind: "create_contract",
      contractDefinitionId: "contract.arrival.first-step",
      targetLocationIds: ["loc_arrival_port"],
    }],
  };

  assertThrowsCode(
    () => executeCampaignEvent(instance, event, {
      gameId: OTHER_GAME,
      expectedRevision: 0,
      triggerKey: "manual:test",
      occurredAt: NOW,
    }),
    "campaign_game_scope_mismatch",
  );
  assertThrowsCode(
    () => executeCampaignEvent(instance, event, {
      gameId: GAME,
      expectedRevision: 9,
      triggerKey: "manual:test",
      occurredAt: NOW,
    }),
    "campaign_revision_conflict",
  );
  assertThrowsCode(
    () => executeCampaignEvent(instance, event, {
      gameId: GAME,
      expectedRevision: 0,
      triggerKey: "manual:test",
      occurredAt: NOW,
    }),
    "campaign_transition_invalid",
  );
});

Deno.test("campaign branches only from adaptation to approved outcomes", () => {
  const base = createCampaignInstance({
    campaignInstanceId: "00000000-0000-4000-8000-000000000103",
    gameId: GAME,
    definition: {
      packId: "econovaria.beta-seed-pack.v1",
      packVersion: "1.0.0-beta",
      definitionId: "campaign.beta.primary",
      definitionDigest: "sha256:campaign-definition",
    },
    now: NOW,
  });
  const adaptation = {
    ...base,
    currentPhase: "adaptation" as const,
    revision: 7,
    eventSequence: 7,
  };
  for (const outcome of ["reconstruction", "continued_conflict"] as const) {
    const result = executeCampaignEvent(adaptation, {
      eventKey: `adaptation.${outcome}`,
      phase: "adaptation",
      nextPhase: outcome,
      completeCampaign: true,
      prerequisites: [],
      effects: [{
        kind: "set_route_state",
        routeDefinitionIds: ["route_meridian_primary"],
        state: outcome === "reconstruction" ? "open" : "restricted",
        reason: outcome === "reconstruction" ? "recovery" : "war",
      }],
    }, {
      gameId: GAME,
      expectedRevision: 7,
      triggerKey: `outcome:${outcome}`,
      occurredAt: "2026-07-22T00:00:00.000Z",
    });
    assertEquals(result.instance.status, "completed");
    assertEquals(result.instance.outcome, outcome);
  }
});

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
    throw new Error(
      `Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`,
    );
  }
}

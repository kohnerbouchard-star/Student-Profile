import type {
  CampaignEventDefinition,
  CampaignInstance,
} from "../contracts/campaignRuntimeContracts.ts";
import { createVersionedCampaignSchedulePolicy } from "./supabaseCampaignProgramProvider.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const BASE_TIME = "2026-08-18T00:00:00.000Z";

Deno.test("beta campaign schedule is immutable and totals 52 weeks before the terminal decision", () => {
  const policy = createVersionedCampaignSchedulePolicy();
  const delays: readonly [CampaignEventDefinition["phase"], number][] = [
    ["arrival", 6],
    ["opportunity", 8],
    ["rivalry", 8],
    ["shortage", 8],
    ["meridian_disruption", 10],
    ["open_conflict", 12],
  ];

  let occurredAt = BASE_TIME;
  let totalWeeks = 0;
  for (const [phase, weeks] of delays) {
    const next = policy.nextScheduledAt({
      instance: instance(phase),
      event: event(phase, false),
      occurredAt,
    });
    if (!next) throw new Error(`Expected next schedule for ${phase}.`);
    totalWeeks += weeks;
    assertEquals(
      Date.parse(next) - Date.parse(occurredAt),
      weeks * 7 * 24 * 60 * 60 * 1000,
    );
    occurredAt = next;
  }
  assertEquals(totalWeeks, 52);
});

Deno.test("terminal campaign events do not receive another schedule", () => {
  const policy = createVersionedCampaignSchedulePolicy();
  const next = policy.nextScheduledAt({
    instance: instance("adaptation"),
    event: event("adaptation", true),
    occurredAt: BASE_TIME,
  });
  assertEquals(next, null);
});

function instance(phase: CampaignEventDefinition["phase"]): CampaignInstance {
  return {
    campaignInstanceId: "cmp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    gameId: "00000000-0000-0000-0000-000000000001",
    definition: {
      packId: "econovaria.beta-seed-pack.v1",
      packVersion: "1.0.0-beta",
      definitionId: "campaign.beta.primary.v1",
      definitionDigest: `sha256:${"a".repeat(64)}`,
    },
    status: "active",
    currentPhase: phase,
    revision: 0,
    eventSequence: 0,
    executedEventKeys: [],
    completedEffectKeys: [],
    outcome: null,
    scheduledAt: BASE_TIME,
    pausedAt: null,
    disabledAt: null,
    completedAt: null,
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
  };
}

function event(
  phase: CampaignEventDefinition["phase"],
  completeCampaign: boolean,
): CampaignEventDefinition {
  return {
    eventKey: `campaign.test.${phase}.v1`,
    phase,
    nextPhase: completeCampaign ? "reconstruction" : nextPhase(phase),
    completeCampaign,
    prerequisites: [],
    effects: [{
      kind: "publish_news",
      newsDefinitionId: "news.test.v1",
      audience: "all_players",
    }],
  };
}

function nextPhase(
  phase: CampaignEventDefinition["phase"],
): CampaignEventDefinition["nextPhase"] {
  switch (phase) {
    case "arrival": return "opportunity";
    case "opportunity": return "rivalry";
    case "rivalry": return "shortage";
    case "shortage": return "meridian_disruption";
    case "meridian_disruption": return "open_conflict";
    case "open_conflict": return "adaptation";
    default: return null;
  }
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`);
  }
}

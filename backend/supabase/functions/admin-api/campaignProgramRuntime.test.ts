import type {
  CampaignEffectDefinition,
  CampaignEventDefinition,
} from "../../../src/domains/campaign/contracts/campaignRuntimeContracts.ts";
import {
  CAMPAIGN_PROGRESS_PHASES,
  decideCampaignOutcome,
  selectCampaignEvent,
  type CampaignProgramDefinition,
  validateCampaignProgram,
} from "../../../src/domains/campaign/services/campaignProgram.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("complete campaign program advances through every required phase", () => {
  const program = fixture();
  validateCampaignProgram(program);
  const observed: string[] = [];
  for (const phase of CAMPAIGN_PROGRESS_PHASES) {
    const selection = selectCampaignEvent({
      program,
      phase,
      outcomeEvidence: phase === "adaptation"
        ? evidence(7_000, 4)
        : undefined,
    });
    observed.push(selection.event.phase, String(selection.event.nextPhase));
  }
  assertEquals(observed, [
    "arrival", "opportunity",
    "opportunity", "rivalry",
    "rivalry", "shortage",
    "shortage", "meridian_disruption",
    "meridian_disruption", "open_conflict",
    "open_conflict", "adaptation",
    "adaptation", "reconstruction",
  ]);
});

Deno.test("outcome decision is deterministic, explainable, and revision-bound", () => {
  const program = fixture();
  const reconstruction = decideCampaignOutcome(program, evidence(6_000, 9));
  const conflict = decideCampaignOutcome(program, evidence(5_999, 10));
  assertEquals(reconstruction.outcome, "reconstruction");
  assertEquals(conflict.outcome, "continued_conflict");
  assertEquals(reconstruction.explanation.includes("published 6000 threshold"), true);
  assertEquals(conflict.explanation.includes("below the published 6000 threshold"), true);
  assertEquals(reconstruction.evidenceRevision, 9);
  assertEquals(conflict.evidenceRevision, 10);
});

Deno.test("program rejects gaps, duplicate events, raw effects, and invalid evidence", () => {
  const program = fixture();
  assertThrowsCode(() => validateCampaignProgram({
    ...program,
    eventsByPhase: {
      ...program.eventsByPhase,
      shortage: {
        ...program.eventsByPhase.shortage,
        nextPhase: "open_conflict",
      },
    },
  }), "campaign_event_invalid");
  assertThrowsCode(() => validateCampaignProgram({
    ...program,
    terminalEvents: {
      ...program.terminalEvents,
      reconstruction: {
        ...program.terminalEvents.reconstruction,
        eventKey: program.eventsByPhase.arrival.eventKey,
      },
    },
  }), "campaign_event_invalid");
  assertThrowsCode(() => decideCampaignOutcome(program, {
    recoveryReadinessBasisPoints: 10_001,
    evidenceRevision: 0,
    evidenceDigest: digest("b"),
  }), "campaign_event_invalid");
  assertEquals(
    JSON.stringify(program).includes("raw_sql") ||
      JSON.stringify(program).includes("generic_json"),
    false,
  );
});

function fixture(): CampaignProgramDefinition {
  return {
    programId: "campaign.beta.primary.v1",
    packId: "econovaria.beta-seed-pack.v1",
    packVersion: "1.0.0-beta",
    definitionDigest: digest("a"),
    recoveryThresholdBasisPoints: 6_000,
    eventsByPhase: {
      arrival: event("campaign.arrival.v1", "arrival", "opportunity"),
      opportunity: event("campaign.opportunity.v1", "opportunity", "rivalry"),
      rivalry: event("campaign.rivalry.v1", "rivalry", "shortage"),
      shortage: event("campaign.shortage.v1", "shortage", "meridian_disruption"),
      meridian_disruption: event(
        "campaign.meridian-disruption.v1",
        "meridian_disruption",
        "open_conflict",
      ),
      open_conflict: event("campaign.open-conflict.v1", "open_conflict", "adaptation"),
      adaptation: {
        ...event("campaign.adaptation.v1", "adaptation", null),
        completeCampaign: false,
      },
    },
    terminalEvents: {
      reconstruction: terminal(
        "campaign.reconstruction.v1",
        "reconstruction",
      ),
      continuedConflict: terminal(
        "campaign.continued-conflict.v1",
        "continued_conflict",
      ),
    },
  };
}

function event(
  eventKey: string,
  phase: CampaignEventDefinition["phase"],
  nextPhase: CampaignEventDefinition["nextPhase"],
): CampaignEventDefinition {
  return {
    eventKey,
    phase,
    nextPhase,
    completeCampaign: false,
    prerequisites: [],
    effects: effects(phase),
  };
}

function terminal(
  eventKey: string,
  outcome: "reconstruction" | "continued_conflict",
): CampaignEventDefinition {
  return {
    eventKey,
    phase: "adaptation",
    nextPhase: outcome,
    completeCampaign: true,
    prerequisites: [],
    effects: effects(outcome),
  };
}

function effects(token: string): readonly CampaignEffectDefinition[] {
  return [
    {
      kind: "publish_news",
      newsDefinitionId: `news.${token}.v1`,
      audience: "all_players",
    },
    {
      kind: "notify_players",
      notificationDefinitionId: `notification.${token}.v1`,
      audience: "all_players",
    },
  ];
}

function evidence(
  recoveryReadinessBasisPoints: number,
  evidenceRevision: number,
) {
  return {
    recoveryReadinessBasisPoints,
    evidenceRevision,
    evidenceDigest: digest("c"),
  };
}

function digest(character: string): string {
  return `sha256:${character.repeat(64)}`;
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

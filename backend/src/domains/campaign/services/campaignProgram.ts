import type {
  CampaignEventDefinition,
  CampaignPhase,
} from "../contracts/campaignRuntimeContracts.ts";
import { CampaignRuntimeError } from "../contracts/campaignRuntimeContracts.ts";

export const CAMPAIGN_PROGRESS_PHASES = Object.freeze([
  "arrival",
  "opportunity",
  "rivalry",
  "shortage",
  "meridian_disruption",
  "open_conflict",
  "adaptation",
] as const);

export interface CampaignProgramDefinition {
  readonly programId: string;
  readonly packId: string;
  readonly packVersion: string;
  readonly definitionDigest: string;
  readonly recoveryThresholdBasisPoints: number;
  readonly eventsByPhase: Readonly<
    Record<typeof CAMPAIGN_PROGRESS_PHASES[number], CampaignEventDefinition>
  >;
  readonly terminalEvents: Readonly<{
    reconstruction: CampaignEventDefinition;
    continuedConflict: CampaignEventDefinition;
  }>;
}

export interface CampaignOutcomeEvidence {
  readonly recoveryReadinessBasisPoints: number;
  readonly evidenceRevision: number;
  readonly evidenceDigest: string;
}

export interface CampaignOutcomeDecision {
  readonly outcome: "reconstruction" | "continued_conflict";
  readonly thresholdBasisPoints: number;
  readonly recoveryReadinessBasisPoints: number;
  readonly evidenceRevision: number;
  readonly evidenceDigest: string;
  readonly explanation: string;
}

export function validateCampaignProgram(
  program: CampaignProgramDefinition,
): CampaignProgramDefinition {
  if (
    !/^[a-z0-9][a-z0-9._:-]{0,127}$/.test(program.programId) ||
    !/^[a-z0-9][a-z0-9._-]{0,127}$/.test(program.packId) ||
    !program.packVersion.trim() ||
    !/^sha256:[0-9a-f]{64}$/.test(program.definitionDigest) ||
    !Number.isInteger(program.recoveryThresholdBasisPoints) ||
    program.recoveryThresholdBasisPoints < 0 ||
    program.recoveryThresholdBasisPoints > 10_000
  ) {
    throw invalid("Campaign program identity or recovery threshold is invalid.");
  }

  for (let index = 0; index < CAMPAIGN_PROGRESS_PHASES.length; index += 1) {
    const phase = CAMPAIGN_PROGRESS_PHASES[index]!;
    const event = program.eventsByPhase[phase];
    const expectedNext = CAMPAIGN_PROGRESS_PHASES[index + 1] ?? null;
    validateEvent(event, phase);
    if (phase === "adaptation") {
      if (event.nextPhase !== null || event.completeCampaign) {
        throw invalid("Adaptation decision event must defer the terminal branch.");
      }
    } else if (event.nextPhase !== expectedNext || event.completeCampaign) {
      throw invalid(`Campaign event ${event.eventKey} does not advance ${phase} correctly.`);
    }
  }

  validateTerminalEvent(
    program.terminalEvents.reconstruction,
    "reconstruction",
  );
  validateTerminalEvent(
    program.terminalEvents.continuedConflict,
    "continued_conflict",
  );

  const keys = [
    ...CAMPAIGN_PROGRESS_PHASES.map((phase) =>
      program.eventsByPhase[phase].eventKey
    ),
    program.terminalEvents.reconstruction.eventKey,
    program.terminalEvents.continuedConflict.eventKey,
  ];
  if (new Set(keys).size !== keys.length) {
    throw invalid("Campaign program event keys must be unique.");
  }

  return Object.freeze(program);
}

export function selectCampaignEvent(input: {
  readonly program: CampaignProgramDefinition;
  readonly phase: CampaignPhase;
  readonly outcomeEvidence?: CampaignOutcomeEvidence;
}): {
  readonly event: CampaignEventDefinition;
  readonly outcomeDecision: CampaignOutcomeDecision | null;
} {
  const program = validateCampaignProgram(input.program);
  if (input.phase === "reconstruction" || input.phase === "continued_conflict") {
    throw invalid("Completed campaign phases have no next event.");
  }
  if (input.phase !== "adaptation") {
    return Object.freeze({
      event: program.eventsByPhase[input.phase],
      outcomeDecision: null,
    });
  }
  if (!input.outcomeEvidence) {
    throw invalid("Adaptation requires versioned recovery evidence.");
  }
  const decision = decideCampaignOutcome(
    program,
    input.outcomeEvidence,
  );
  const base = decision.outcome === "reconstruction"
    ? program.terminalEvents.reconstruction
    : program.terminalEvents.continuedConflict;
  return Object.freeze({
    event: Object.freeze({
      ...base,
      phase: "adaptation",
      nextPhase: decision.outcome,
      completeCampaign: true,
    }),
    outcomeDecision: decision,
  });
}

export function decideCampaignOutcome(
  program: CampaignProgramDefinition,
  evidence: CampaignOutcomeEvidence,
): CampaignOutcomeDecision {
  validateCampaignProgram(program);
  if (
    !Number.isInteger(evidence.recoveryReadinessBasisPoints) ||
    evidence.recoveryReadinessBasisPoints < 0 ||
    evidence.recoveryReadinessBasisPoints > 10_000 ||
    !Number.isSafeInteger(evidence.evidenceRevision) ||
    evidence.evidenceRevision < 0 ||
    !/^sha256:[0-9a-f]{64}$/.test(evidence.evidenceDigest)
  ) {
    throw invalid("Campaign outcome evidence is invalid.");
  }
  const outcome = evidence.recoveryReadinessBasisPoints >=
      program.recoveryThresholdBasisPoints
    ? "reconstruction"
    : "continued_conflict";
  return Object.freeze({
    outcome,
    thresholdBasisPoints: program.recoveryThresholdBasisPoints,
    recoveryReadinessBasisPoints: evidence.recoveryReadinessBasisPoints,
    evidenceRevision: evidence.evidenceRevision,
    evidenceDigest: evidence.evidenceDigest,
    explanation: outcome === "reconstruction"
      ? `Recovery readiness ${evidence.recoveryReadinessBasisPoints} met the published ${program.recoveryThresholdBasisPoints} threshold.`
      : `Recovery readiness ${evidence.recoveryReadinessBasisPoints} remained below the published ${program.recoveryThresholdBasisPoints} threshold.`,
  });
}

function validateTerminalEvent(
  event: CampaignEventDefinition,
  outcome: "reconstruction" | "continued_conflict",
): void {
  validateEvent(event, "adaptation");
  if (event.nextPhase !== outcome || !event.completeCampaign) {
    throw invalid(`Terminal event ${event.eventKey} must complete as ${outcome}.`);
  }
}

function validateEvent(
  event: CampaignEventDefinition,
  phase: CampaignPhase,
): void {
  if (
    !event ||
    !/^[a-z0-9][a-z0-9._:-]{0,127}$/.test(event.eventKey) ||
    event.phase !== phase ||
    event.effects.length < 1 ||
    event.effects.length > 32 ||
    event.prerequisites.length > 64 ||
    new Set(event.prerequisites).size !== event.prerequisites.length
  ) {
    throw invalid(`Campaign event for ${phase} is invalid.`);
  }
}

function invalid(message: string): CampaignRuntimeError {
  return new CampaignRuntimeError(
    "campaign_event_invalid",
    message,
    false,
  );
}

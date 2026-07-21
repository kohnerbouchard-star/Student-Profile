import type {
  CampaignEventDefinition,
  CampaignInstance,
} from "../contracts/campaignRuntimeContracts.ts";
import { CampaignRuntimeError } from "../contracts/campaignRuntimeContracts.ts";
import type {
  CampaignOutcomeEvidence,
  CampaignProgramDefinition,
} from "./campaignProgram.ts";
import { selectCampaignEvent } from "./campaignProgram.ts";

export interface AtomicCampaignExecutionResult {
  readonly executionOutcome: "executed" | "replayed";
  readonly campaignId: string;
  readonly eventId: string;
  readonly status: CampaignInstance["status"];
  readonly currentPhase: CampaignInstance["currentPhase"];
  readonly revision: number;
  readonly eventSequence: number;
  readonly outcome: CampaignInstance["outcome"];
}

export interface CampaignSchedulerRepository {
  listDueCampaigns(input: {
    readonly dueAt: string;
    readonly limit: number;
  }): Promise<readonly CampaignInstance[]>;
  executeEventAtomic(input: {
    readonly instance: CampaignInstance;
    readonly event: CampaignEventDefinition;
    readonly triggerKey: string;
    readonly actorStaffUserId: string | null;
    readonly reason: string | null;
    readonly occurredAt: string;
  }): Promise<AtomicCampaignExecutionResult>;
}

export interface CampaignProgramProvider {
  readProgram(
    instance: CampaignInstance,
  ): Promise<CampaignProgramDefinition>;
  readOutcomeEvidence(
    instance: CampaignInstance,
  ): Promise<CampaignOutcomeEvidence>;
}

export interface CampaignSchedulerRunResult {
  readonly dueCount: number;
  readonly executedCount: number;
  readonly replayedCount: number;
  readonly failedCount: number;
  readonly failures: readonly {
    readonly campaignId: string;
    readonly code: string;
  }[];
}

export async function runCampaignScheduler(input: {
  readonly repository: CampaignSchedulerRepository;
  readonly programs: CampaignProgramProvider;
  readonly dueAt: string;
  readonly runId: string;
  readonly limit?: number;
}): Promise<CampaignSchedulerRunResult> {
  const limit = input.limit ?? 50;
  if (
    !Number.isFinite(Date.parse(input.dueAt)) ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(input.runId) ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {
    throw invalid("Campaign scheduler input is invalid.");
  }

  const due = await input.repository.listDueCampaigns({
    dueAt: input.dueAt,
    limit,
  });
  const ordered = [...due].sort((left, right) =>
    String(left.scheduledAt).localeCompare(String(right.scheduledAt)) ||
    left.campaignInstanceId.localeCompare(right.campaignInstanceId)
  );
  let executedCount = 0;
  let replayedCount = 0;
  const failures: { campaignId: string; code: string }[] = [];

  for (const instance of ordered) {
    try {
      if (
        instance.status !== "active" ||
        !instance.scheduledAt ||
        Date.parse(instance.scheduledAt) > Date.parse(input.dueAt)
      ) {
        throw invalid("Scheduler repository returned an ineligible campaign.");
      }
      const program = await input.programs.readProgram(instance);
      const selected = selectCampaignEvent({
        program,
        phase: instance.currentPhase,
        outcomeEvidence: instance.currentPhase === "adaptation"
          ? await input.programs.readOutcomeEvidence(instance)
          : undefined,
      });
      const result = await input.repository.executeEventAtomic({
        instance,
        event: selected.event,
        triggerKey: `scheduler:${input.runId}:${instance.eventSequence + 1}`,
        actorStaffUserId: null,
        reason: selected.outcomeDecision?.explanation ?? null,
        occurredAt: input.dueAt,
      });
      if (result.executionOutcome === "replayed") replayedCount += 1;
      else executedCount += 1;
    } catch (error) {
      failures.push({
        campaignId: instance.campaignInstanceId,
        code: readErrorCode(error),
      });
    }
  }

  return Object.freeze({
    dueCount: ordered.length,
    executedCount,
    replayedCount,
    failedCount: failures.length,
    failures: Object.freeze(failures),
  });
}

export async function executeProtectedManualCampaignTrigger(input: {
  readonly repository: CampaignSchedulerRepository;
  readonly programs: CampaignProgramProvider;
  readonly instance: CampaignInstance;
  readonly requestId: string;
  readonly actorStaffUserId: string;
  readonly actorGameId: string;
  readonly reason: string;
  readonly occurredAt: string;
  readonly outcomeEvidence?: CampaignOutcomeEvidence;
}): Promise<AtomicCampaignExecutionResult> {
  if (
    input.actorGameId !== input.instance.gameId ||
    !input.actorStaffUserId.trim() ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(input.requestId) ||
    input.reason.trim().length < 12 ||
    input.reason.trim().length > 1000 ||
    !Number.isFinite(Date.parse(input.occurredAt)) ||
    input.instance.status !== "active"
  ) {
    throw invalid("Manual campaign trigger authorization or audit input is invalid.");
  }
  const program = await input.programs.readProgram(input.instance);
  const selected = selectCampaignEvent({
    program,
    phase: input.instance.currentPhase,
    outcomeEvidence: input.instance.currentPhase === "adaptation"
      ? input.outcomeEvidence ??
        await input.programs.readOutcomeEvidence(input.instance)
      : undefined,
  });
  return input.repository.executeEventAtomic({
    instance: input.instance,
    event: selected.event,
    triggerKey: `manual:${input.requestId}`,
    actorStaffUserId: input.actorStaffUserId,
    reason: input.reason.trim(),
    occurredAt: input.occurredAt,
  });
}

function invalid(message: string): CampaignRuntimeError {
  return new CampaignRuntimeError(
    "campaign_event_invalid",
    message,
    false,
  );
}

function readErrorCode(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { code?: unknown }).code === "string" &&
    /^[a-z0-9][a-z0-9._:-]{0,127}$/.test(
      (error as { code: string }).code,
    )
  ) {
    return (error as { code: string }).code;
  }
  return "campaign_scheduler_failure";
}

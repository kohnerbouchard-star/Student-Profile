import type {
  CampaignEventDefinition,
  CampaignInstance,
} from "../contracts/campaignRuntimeContracts.ts";
import type {
  CampaignOutcomeEvidence,
  CampaignProgramDefinition,
} from "../services/campaignProgram.ts";
import { validateCampaignProgram } from "../services/campaignProgram.ts";
import type { CampaignProgramProvider } from "../services/campaignScheduler.ts";

interface SupabaseResponse<T = unknown> {
  readonly data: T | null;
  readonly error: { readonly message: string; readonly code?: string } | null;
}

interface QueryBuilder extends PromiseLike<SupabaseResponse<unknown[]>> {
  select(columns: string): QueryBuilder;
  eq(column: string, value: unknown): QueryBuilder;
  order(column: string, options?: { readonly ascending?: boolean }): QueryBuilder;
  limit(count: number): QueryBuilder;
  maybeSingle(): PromiseLike<SupabaseResponse<unknown>>;
}

export interface CampaignProgramSupabaseClient {
  from(
    tableName:
      | "campaign_program_definitions"
      | "campaign_outcome_evidence_snapshots",
  ): QueryBuilder;
}

export interface CampaignSchedulePolicy {
  nextScheduledAt(input: {
    readonly instance: CampaignInstance;
    readonly event: CampaignEventDefinition;
    readonly occurredAt: string;
  }): string | null;
}

interface ProgramRow {
  readonly pack_id: string;
  readonly pack_version: string;
  readonly definition_id: string;
  readonly definition_digest: string;
  readonly program: unknown;
  readonly status: string;
}

interface EvidenceRow {
  readonly evidence_revision: number | string;
  readonly recovery_readiness_basis_points: number | string;
  readonly evidence_digest: string;
}

const PROGRAM_SELECT =
  "pack_id,pack_version,definition_id,definition_digest,program,status";
const EVIDENCE_SELECT =
  "evidence_revision,recovery_readiness_basis_points,evidence_digest";

export function createSupabaseCampaignProgramProvider(
  client: CampaignProgramSupabaseClient,
): CampaignProgramProvider {
  return {
    async readProgram(instance) {
      const response = await client
        .from("campaign_program_definitions")
        .select(PROGRAM_SELECT)
        .eq("pack_id", instance.definition.packId)
        .eq("pack_version", instance.definition.packVersion)
        .eq("definition_id", instance.definition.definitionId)
        .eq("definition_digest", instance.definition.definitionDigest)
        .maybeSingle();

      if (response.error) {
        throw failure("campaign_program_read_failed", response.error.message);
      }
      if (!response.data) {
        throw failure(
          "campaign_program_not_found",
          "The campaign is pinned to a program definition that is not available.",
        );
      }

      const row = response.data as ProgramRow;
      const program = validateCampaignProgram(
        row.program as CampaignProgramDefinition,
      );
      if (
        program.packId !== row.pack_id ||
        program.packVersion !== row.pack_version ||
        program.programId !== row.definition_id ||
        program.definitionDigest !== row.definition_digest ||
        program.packId !== instance.definition.packId ||
        program.packVersion !== instance.definition.packVersion ||
        program.programId !== instance.definition.definitionId ||
        program.definitionDigest !== instance.definition.definitionDigest
      ) {
        throw failure(
          "campaign_program_identity_mismatch",
          "Campaign program identity does not match the pinned runtime definition.",
        );
      }
      return program;
    },

    async readOutcomeEvidence(instance) {
      const response = await client
        .from("campaign_outcome_evidence_snapshots")
        .select(EVIDENCE_SELECT)
        .eq("game_session_id", instance.gameId)
        .order("evidence_revision", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (response.error) {
        throw failure(
          "campaign_outcome_evidence_read_failed",
          response.error.message,
        );
      }
      if (!response.data) {
        throw failure(
          "campaign_outcome_evidence_missing",
          "No reviewed recovery evidence exists for the campaign terminal decision.",
        );
      }

      const row = response.data as EvidenceRow;
      const evidence: CampaignOutcomeEvidence = {
        recoveryReadinessBasisPoints: integer(
          row.recovery_readiness_basis_points,
          0,
          10_000,
          "recovery readiness",
        ),
        evidenceRevision: integer(
          row.evidence_revision,
          1,
          Number.MAX_SAFE_INTEGER,
          "evidence revision",
        ),
        evidenceDigest: String(row.evidence_digest),
      };
      if (!/^sha256:[0-9a-f]{64}$/.test(evidence.evidenceDigest)) {
        throw failure(
          "campaign_outcome_evidence_invalid",
          "Campaign outcome evidence digest is invalid.",
        );
      }
      return Object.freeze(evidence);
    },
  };
}

const VERSIONED_PHASE_DELAYS_MS: Readonly<
  Record<string, Readonly<Record<string, number>>>
> = Object.freeze({
  "econovaria.beta-seed-pack.v1|1.0.0-beta|campaign.beta.primary.v1":
    Object.freeze({
      arrival: 6 * 7 * 24 * 60 * 60 * 1000,
      opportunity: 8 * 7 * 24 * 60 * 60 * 1000,
      rivalry: 8 * 7 * 24 * 60 * 60 * 1000,
      shortage: 8 * 7 * 24 * 60 * 60 * 1000,
      meridian_disruption: 10 * 7 * 24 * 60 * 60 * 1000,
      open_conflict: 12 * 7 * 24 * 60 * 60 * 1000,
    }),
});

export function createVersionedCampaignSchedulePolicy(): CampaignSchedulePolicy {
  return {
    nextScheduledAt({ instance, event, occurredAt }) {
      if (event.completeCampaign) return null;
      const identity = [
        instance.definition.packId,
        instance.definition.packVersion,
        instance.definition.definitionId,
      ].join("|");
      const delay = VERSIONED_PHASE_DELAYS_MS[identity]?.[event.phase];
      if (!Number.isFinite(delay) || Number(delay) <= 0) {
        throw failure(
          "campaign_schedule_policy_missing",
          `No immutable schedule policy is registered for ${identity}:${event.phase}.`,
        );
      }
      const occurred = Date.parse(occurredAt);
      if (!Number.isFinite(occurred)) {
        throw failure(
          "campaign_schedule_time_invalid",
          "Campaign occurrence time is invalid.",
        );
      }
      return new Date(occurred + Number(delay)).toISOString();
    },
  };
}

function integer(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
): number {
  const parsed = Number(value);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < minimum ||
    parsed > maximum
  ) {
    throw failure("campaign_program_data_invalid", `${label} is invalid.`);
  }
  return parsed;
}

function failure(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

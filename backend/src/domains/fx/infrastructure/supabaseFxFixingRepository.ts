import type { FxFixingEngineResult } from "../contracts/fxFixingContracts.ts";
import {
  type FxFixingApplyResult,
  type FxFixingClaim,
  type FxFixingLoadedInput,
  FxFixingRunnerError,
  type FxFixingRunnerRepository,
} from "../services/fxFixingRunner.ts";
import { mapEngineInput } from "./fxFixingProjection.ts";
import {
  type SupabaseRpcResponse,
  firstRow,
  invalidRpcResult,
  isRecord,
  mapRpcError,
  requiredCount,
  requiredHash,
  requiredLocalDate,
  requiredSafeId,
  requiredTimestamp,
  requiredTimezone,
  requiredUuid,
} from "./fxFixingValidation.ts";

export interface FxFixingSupabaseClient {
  rpc<T = unknown>(
    functionName: string,
    args?: Readonly<Record<string, unknown>>,
  ): PromiseLike<SupabaseRpcResponse<T>>;
}

export interface FxFixingOrchestratorRepository extends FxFixingRunnerRepository {
  verifySchedulerToken(input: {
    readonly schedulerName: string;
    readonly tokenSha256: string;
  }): Promise<boolean>;
}

interface ClaimRpcRow {
  readonly game_session_id?: unknown;
  readonly fixing_local_date?: unknown;
  readonly fixing_effective_at?: unknown;
  readonly game_timezone?: unknown;
  readonly lease_token?: unknown;
}

interface LoadRpcRow {
  readonly input_hash?: unknown;
  readonly engine_input?: unknown;
  readonly load_fx_fixing_input_v1?: unknown;
}

interface ApplyRpcRow {
  readonly outcome?: unknown;
  readonly fixing_public_id?: unknown;
  readonly currency_values_inserted?: unknown;
  readonly shocks_consumed?: unknown;
}

export class SupabaseFxFixingRepository
  implements FxFixingOrchestratorRepository {
  constructor(private readonly client: FxFixingSupabaseClient) {}

  async verifySchedulerToken(input: {
    readonly schedulerName: string;
    readonly tokenSha256: string;
  }): Promise<boolean> {
    const response = await this.client.rpc<boolean>(
      "verify_runtime_scheduler_token_v1",
      {
        p_scheduler_name: input.schedulerName,
        p_token_sha256: input.tokenSha256,
      },
    );
    if (response.error) {
      throw mapRpcError(response.error, "fx_scheduler_authorization_failed");
    }
    return response.data === true;
  }

  async claimDueFixings(input: {
    readonly claimedAt: string;
    readonly limit: number;
    readonly leaseOwner: string;
    readonly leaseSeconds: number;
  }): Promise<readonly FxFixingClaim[]> {
    const response = await this.client.rpc<readonly ClaimRpcRow[]>(
      "claim_due_fx_games_v1",
      {
        p_now: input.claimedAt,
        p_limit: input.limit,
        p_lease_owner: input.leaseOwner,
        p_lease_seconds: input.leaseSeconds,
      },
    );
    if (response.error) {
      throw mapRpcError(response.error, "fx_fixing_claim_failed");
    }
    if (!Array.isArray(response.data)) {
      throw invalidRpcResult("FX fixing claim returned an invalid result.");
    }
    if (response.data.length > input.limit) {
      throw invalidRpcResult("FX fixing claim exceeded the requested limit.");
    }
    return Object.freeze(response.data.map(mapClaim));
  }

  async loadFixingInput(
    claim: FxFixingClaim,
  ): Promise<FxFixingLoadedInput> {
    const response = await this.client.rpc<readonly LoadRpcRow[] | LoadRpcRow>(
      "load_fx_fixing_input_v1",
      {
        p_game_session_id: claim.gameSessionId,
        p_fixing_local_date: claim.fixingLocalDate,
        p_lease_token: claim.leaseToken,
      },
    );
    if (response.error) {
      throw mapRpcError(response.error, "fx_fixing_input_load_failed");
    }

    const row = firstRow(response.data);
    const nested = isRecord(row.load_fx_fixing_input_v1)
      ? row.load_fx_fixing_input_v1
      : row;
    const inputHash = requiredHash(nested.input_hash, "input_hash");
    const engineInput = mapEngineInput(nested.engine_input);

    if (
      engineInput.gameSessionId !== claim.gameSessionId ||
      engineInput.fixingLocalDate !== claim.fixingLocalDate
    ) {
      throw new FxFixingRunnerError(
        "fx_fixing_input_scope_mismatch",
        "FX fixing input did not match its claimed game/date scope.",
        500,
        false,
      );
    }

    return Object.freeze({ engineInput, inputHash });
  }

  async applyFixing(input: {
    readonly claim: FxFixingClaim;
    readonly fixing: FxFixingEngineResult;
    readonly inputHash: string;
    readonly calculatedAt: string;
  }): Promise<FxFixingApplyResult> {
    const response = await this.client.rpc<
      readonly ApplyRpcRow[] | ApplyRpcRow
    >(
      "apply_fx_fixing_v1",
      {
        p_game_session_id: input.claim.gameSessionId,
        p_fixing_local_date: input.claim.fixingLocalDate,
        p_fixing_effective_at: input.claim.fixingEffectiveAt,
        p_lease_token: input.claim.leaseToken,
        p_input_hash: input.inputHash,
        p_calculated_at: input.calculatedAt,
        p_fixing_result: input.fixing,
      },
    );
    if (response.error) {
      throw mapRpcError(response.error, "fx_fixing_apply_failed");
    }

    const row = firstRow(response.data);
    const outcome = row.outcome;
    if (outcome !== "applied" && outcome !== "replayed") {
      throw invalidRpcResult("FX fixing apply returned an invalid outcome.");
    }

    return Object.freeze({
      outcome,
      fixingPublicId: requiredSafeId(
        row.fixing_public_id,
        "fixing_public_id",
      ),
      currencyValuesInserted: requiredCount(
        row.currency_values_inserted,
        "currency_values_inserted",
      ),
      shocksConsumed: requiredCount(row.shocks_consumed, "shocks_consumed"),
    });
  }

  async failFixingClaim(input: {
    readonly claim: FxFixingClaim;
    readonly errorCode: string;
    readonly failedAt: string;
  }): Promise<void> {
    const response = await this.client.rpc<boolean>(
      "fail_fx_fixing_claim_v1",
      {
        p_game_session_id: input.claim.gameSessionId,
        p_fixing_local_date: input.claim.fixingLocalDate,
        p_lease_token: input.claim.leaseToken,
        p_error_code: input.errorCode,
        p_failed_at: input.failedAt,
      },
    );
    if (response.error) {
      throw mapRpcError(response.error, "fx_fixing_failure_record_failed");
    }
    if (response.data !== true) {
      throw invalidRpcResult(
        "FX fixing failure record did not confirm the claimed scope.",
      );
    }
  }
}

function mapClaim(row: ClaimRpcRow): FxFixingClaim {
  return Object.freeze({
    gameSessionId: requiredUuid(row.game_session_id, "game_session_id"),
    fixingLocalDate: requiredLocalDate(
      row.fixing_local_date,
      "fixing_local_date",
    ),
    fixingEffectiveAt: requiredTimestamp(
      row.fixing_effective_at,
      "fixing_effective_at",
    ),
    gameTimezone: requiredTimezone(row.game_timezone, "game_timezone"),
    leaseToken: requiredUuid(row.lease_token, "lease_token"),
  });
}

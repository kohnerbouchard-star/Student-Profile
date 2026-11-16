import {
  normalizeProcessDueStoreWithdrawalsCommand,
  normalizeStoreWithdrawalRequestCommand,
  parseProcessDueStoreWithdrawalsResult,
  parseStoreWithdrawalRequestResult,
  StoreWithdrawalContractError,
  type ProcessDueStoreWithdrawalsCommand,
  type ProcessDueStoreWithdrawalsResult,
  type RequestBusinessStoreOfferWithdrawalCommand,
  type StoreWithdrawalRepository,
  type StoreWithdrawalRequestResult,
} from "../contracts/storeWithdrawalContracts.ts";

interface StoreWithdrawalQueryError {
  readonly message?: string;
  readonly code?: string;
}

interface StoreWithdrawalQueryResponse<T> {
  readonly data: T | null;
  readonly error: StoreWithdrawalQueryError | null;
}

interface StoreWithdrawalClient {
  rpc<T = unknown>(
    functionName: string,
    args: Record<string, unknown>,
  ): PromiseLike<StoreWithdrawalQueryResponse<T>>;
}

export class SupabaseStoreWithdrawalRepository
  implements StoreWithdrawalRepository {
  private readonly client: StoreWithdrawalClient;

  constructor(client: StoreWithdrawalClient) {
    this.client = client;
  }

  async requestBusinessWithdrawal(
    command: RequestBusinessStoreOfferWithdrawalCommand,
  ): Promise<StoreWithdrawalRequestResult> {
    const normalized = normalizeStoreWithdrawalRequestCommand(command);
    const response = await this.client.rpc<unknown>(
      "request_business_store_offer_withdrawal_v2",
      {
        p_game_session_id: normalized.gameSessionId,
        p_business_key: normalized.businessKey,
        p_offer_key: normalized.offerKey,
        p_mode: normalized.mode,
        p_quantity: normalized.quantity,
        p_expected_offer_version: normalized.expectedOfferVersion,
        p_idempotency_key: normalized.idempotencyKey,
      },
    );

    if (response.error || response.data === null) {
      throw new StoreWithdrawalContractError(
        mapWithdrawalRequestErrorCode(response.error?.message),
        "Business Store withdrawal could not be requested.",
      );
    }

    return parseStoreWithdrawalRequestResult(response.data);
  }

  async processDueWithdrawals(
    command: ProcessDueStoreWithdrawalsCommand,
  ): Promise<ProcessDueStoreWithdrawalsResult> {
    const normalized = normalizeProcessDueStoreWithdrawalsCommand(command);
    const response = await this.client.rpc<unknown>(
      "process_due_store_offer_withdrawals_v2",
      { p_limit: normalized.limit },
    );

    if (response.error || response.data === null) {
      throw new StoreWithdrawalContractError(
        mapWithdrawalProcessorErrorCode(response.error?.message),
        "Due Store withdrawals could not be processed.",
      );
    }

    return parseProcessDueStoreWithdrawalsResult(response.data);
  }
}

function mapWithdrawalRequestErrorCode(message: string | undefined): string {
  const normalized = message?.toUpperCase() ?? "";
  if (normalized.includes("IDEMPOTENCY_CONFLICT")) {
    return "store_withdrawal_idempotency_conflict";
  }
  if (normalized.includes("VERSION_CONFLICT")) {
    return "store_withdrawal_version_conflict";
  }
  if (normalized.includes("REDUCTION_EXCEEDS_AVAILABLE")) {
    return "store_withdrawal_reduction_exceeds_available";
  }
  if (
    normalized.includes("PENDING_EXISTS") ||
    normalized.includes("OFFER_STATUS_INVALID")
  ) {
    return "store_withdrawal_offer_unavailable";
  }
  if (normalized.includes("CUSTODY") || normalized.includes("ACCOUNT")) {
    return "store_withdrawal_custody_unavailable";
  }
  return "store_withdrawal_request_failed";
}

function mapWithdrawalProcessorErrorCode(message: string | undefined): string {
  const normalized = message?.toUpperCase() ?? "";
  if (normalized.includes("LIMIT_INVALID")) {
    return "store_withdrawal_process_limit_invalid";
  }
  if (normalized.includes("TOO_EARLY")) {
    return "store_withdrawal_process_too_early";
  }
  if (normalized.includes("PROJECTION")) {
    return "store_withdrawal_projection_mismatch";
  }
  if (normalized.includes("SCOPE_INVALID")) {
    return "store_withdrawal_scope_invalid";
  }
  return "store_withdrawal_process_failed";
}

import {
  type StandardFxOrderClaim,
  type StandardFxOrderCommandResult,
  StandardFxOrderSettlementError,
  type StandardFxOrderSettlementRepository,
} from "../services/standardFxOrderSettlementRunner.ts";

interface RpcError {
  readonly code?: string;
  readonly message?: string;
  readonly details?: string | null;
  readonly hint?: string | null;
}

interface RpcResponse<T> {
  readonly data: T | null;
  readonly error: RpcError | null;
}

export interface StandardFxOrderSettlementClient {
  rpc<T = unknown>(
    functionName: string,
    args?: Readonly<Record<string, unknown>>,
  ): PromiseLike<RpcResponse<T>>;
}

export interface StandardFxOrderSettlementOrchestratorRepository
  extends StandardFxOrderSettlementRepository {
  verifySchedulerToken(input: {
    readonly schedulerName: string;
    readonly tokenSha256: string;
  }): Promise<boolean>;
}

interface ClaimRow {
  readonly game_session_id?: unknown;
  readonly order_key?: unknown;
  readonly lease_token?: unknown;
  readonly settles_at?: unknown;
}

const TERMINAL_SETTLEMENT_CODES = new Set([
  "BANK_ACCOUNT_NOT_FOUND",
  "BUSINESS_ACCOUNT_OWNER_INVALID",
  "BUSINESS_NOT_FOUND",
  "FUNDING_INSUFFICIENT",
  "FX_ORDER_OWNER_INVALID",
  "FX_ORDER_OWNER_MISSING",
  "FX_ORDER_PRODUCT_INVALID",
  "FX_ORDER_RESERVATION_CONFLICT",
  "FX_SAME_CURRENCY_NOT_REQUIRED",
]);

export class SupabaseStandardFxOrderSettlementRepository
  implements StandardFxOrderSettlementOrchestratorRepository {
  constructor(private readonly client: StandardFxOrderSettlementClient) {}

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
      throw mapRpcError(
        response.error,
        "banking_fx_scheduler_authorization_failed",
      );
    }
    return response.data === true;
  }

  async claimDueOrders(input: {
    readonly workerName: string;
    readonly limit: number;
    readonly leaseSeconds: number;
    readonly now: string;
  }): Promise<readonly StandardFxOrderClaim[]> {
    // The claim RPC intentionally receives no owner selector. The database
    // leases Player- and Business-owned orders from the same ordered queue.
    const response = await this.client.rpc<readonly ClaimRow[]>(
      "claim_due_standard_fx_orders_v1",
      {
        p_worker_name: input.workerName,
        p_limit: input.limit,
        p_lease_seconds: input.leaseSeconds,
        p_now: input.now,
      },
    );
    if (response.error) {
      throw mapRpcError(response.error, "standard_fx_order_claim_failed");
    }
    if (!Array.isArray(response.data) || response.data.length > input.limit) {
      throw invalidResult("Standard FX order claim");
    }
    return Object.freeze(response.data.map(projectClaim));
  }

  async settleOrder(input: {
    readonly claim: StandardFxOrderClaim;
    readonly now: string;
  }): Promise<StandardFxOrderCommandResult> {
    const response = await this.client.rpc<unknown>(
      "settle_standard_fx_order_v1",
      {
        p_game_session_id: input.claim.gameSessionId,
        p_order_key: input.claim.orderKey,
        p_lease_token: input.claim.leaseToken,
        p_now: input.now,
      },
    );
    if (response.error) {
      throw mapRpcError(response.error, "standard_fx_order_settlement_failed");
    }
    return projectCommandResult(
      response.data,
      input.claim.orderKey,
      "settled",
    );
  }

  async failOrder(input: {
    readonly claim: StandardFxOrderClaim;
    readonly errorCode: string;
    readonly now: string;
  }): Promise<StandardFxOrderCommandResult> {
    const response = await this.client.rpc<unknown>(
      "fail_standard_fx_order_v1",
      {
        p_game_session_id: input.claim.gameSessionId,
        p_order_key: input.claim.orderKey,
        p_lease_token: input.claim.leaseToken,
        p_error_code: input.errorCode,
        p_now: input.now,
      },
    );
    if (response.error) {
      throw mapRpcError(
        response.error,
        "standard_fx_order_failure_record_failed",
      );
    }
    return projectCommandResult(response.data, input.claim.orderKey, "failed");
  }
}

function projectClaim(row: ClaimRow): StandardFxOrderClaim {
  const gameSessionId = uuid(row.game_session_id, "claim game scope");
  const orderKey = publicKey(row.order_key, /^fxo_[0-9a-f]{32}$/u, "order key");
  const leaseToken = uuid(row.lease_token, "claim lease token");
  const settlesAt = timestamp(row.settles_at, "claim settlement time");
  return Object.freeze({ gameSessionId, orderKey, leaseToken, settlesAt });
}

function projectCommandResult(
  value: unknown,
  expectedOrderKey: string,
  expectedStatus: "settled" | "failed",
): StandardFxOrderCommandResult {
  const root = oneObject(value, "Standard FX order command");
  const outcome = lowerText(root.outcome);
  const order = oneObject(root.order, "Standard FX order");
  const orderKey = publicKey(
    first(order, "order_key", "orderKey", "public_key", "publicKey"),
    /^fxo_[0-9a-f]{32}$/u,
    "order key",
  );
  const status = lowerText(
    first(order, "status", "order_status", "orderStatus"),
  );
  if (
    (outcome !== "applied" && outcome !== "replayed") ||
    orderKey !== expectedOrderKey ||
    status !== expectedStatus
  ) throw invalidResult("Standard FX order command");

  if (expectedStatus === "settled") {
    publicKey(
      first(order, "receipt_key", "receiptKey"),
      /^fxr_[0-9a-f]{32}$/u,
      "settlement receipt key",
    );
  }
  return { outcome, orderKey, status: expectedStatus };
}

function oneObject(value: unknown, label: string): Record<string, unknown> {
  const candidate = Array.isArray(value) && value.length === 1
    ? value[0]
    : value;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw invalidResult(label);
  }
  return candidate as Record<string, unknown>;
}

function first(
  row: Readonly<Record<string, unknown>>,
  ...keys: readonly string[]
): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
  }
  return undefined;
}

function publicKey(value: unknown, pattern: RegExp, label: string): string {
  const result = lowerText(value);
  if (!pattern.test(result)) throw invalidResult(label);
  return result;
}

function uuid(value: unknown, label: string): string {
  const result = lowerText(value);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
      .test(result)
  ) throw invalidResult(label);
  return result;
}

function timestamp(value: unknown, label: string): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result || result.length > 40 || !Number.isFinite(Date.parse(result))) {
    throw invalidResult(label);
  }
  return result;
}

function lowerText(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function mapRpcError(
  error: RpcError,
  defaultCode: string,
): StandardFxOrderSettlementError {
  const source = [error.code, error.message, error.details, error.hint]
    .filter((part): part is string => typeof part === "string")
    .join(" ")
    .toUpperCase();
  if (/\b(?:42883|42P01)\b/u.test(source)) {
    return new StandardFxOrderSettlementError(
      "banking_fx_worker_schema_not_applied",
      "Banking FX settlement schema is unavailable.",
      503,
      true,
    );
  }
  const domainCode = source.match(
    /\b(?:BANK|BUSINESS|FUNDING|FX)_[A-Z0-9_]{2,95}\b/u,
  )?.[0];
  if (domainCode && TERMINAL_SETTLEMENT_CODES.has(domainCode)) {
    return new StandardFxOrderSettlementError(
      domainCode,
      "Standard FX order cannot settle and requires terminal release.",
      500,
      false,
      true,
    );
  }
  return new StandardFxOrderSettlementError(
    domainCode ?? defaultCode,
    "Standard FX settlement persistence is temporarily unavailable.",
    500,
    true,
  );
}

function invalidResult(label: string): StandardFxOrderSettlementError {
  return new StandardFxOrderSettlementError(
    "standard_fx_order_rpc_result_invalid",
    `${label} returned an invalid result.`,
    500,
    true,
  );
}

interface OperationResult {
  readonly handled: boolean;
  readonly status?: number;
  readonly body?: unknown;
}

interface Input {
  readonly request: Request;
  readonly gameId: string;
  readonly staffUserId: string;
  readonly suffix: string;
}

type ServiceClient = {
  from(table: string): any;
  rpc(functionName: string, args: Record<string, unknown>): PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>;
};

export async function handleBusinessBankingAdminOperation(
  service: ServiceClient,
  input: Input,
): Promise<OperationResult> {
  if (input.suffix === "/businesses" && input.request.method === "GET") {
    const { data, error } = await service.from("business_entities").select(
      "public_key,owner_player_id,legal_name,entity_type,industry_code,country_code,currency_code,status,capitalization,revenue_total,expense_total,profit_total,valuation,reputation_score,failure_count,updated_at",
    ).eq("game_session_id", input.gameId).order("updated_at", { ascending: false });
    if (error) return failure(error.message);
    return success({ businesses: data ?? [] });
  }

  if (input.suffix === "/loan-applications" && input.request.method === "GET") {
    const { data, error } = await service.from("loan_applications").select(
      "public_key,player_id,business_id,loan_product_id,amount,purpose,repayment_source,credit_score,projected_payment,affordability_ratio,status,reviewed_at,review_reason,created_at",
    ).eq("game_session_id", input.gameId).order("created_at", { ascending: false });
    if (error) return failure(error.message);
    return success({ applications: data ?? [] });
  }

  const body = await readBody(input.request);
  const loanReview = input.suffix.match(/^\/loan-applications\/(lna_[0-9a-f]{32})\/review$/u);
  if (loanReview && input.request.method === "POST") {
    return rpc(service, "review_player_loan_application_v1", {
      p_game_session_id: input.gameId,
      p_staff_user_id: input.staffUserId,
      p_application_key: loanReview[1],
      p_decision: enumValue(body.decision, ["approve", "decline"]),
      p_reason: text(body.reason, 2, 1000),
      p_idempotency_key: idempotency(body.idempotencyKey),
    });
  }

  const productReview = input.suffix.match(/^\/business-products\/(bpr_[0-9a-f]{32})\/review$/u);
  if (productReview && input.request.method === "POST") {
    return rpc(service, "review_business_product_v1", {
      p_game_session_id: input.gameId,
      p_staff_user_id: input.staffUserId,
      p_product_key: productReview[1],
      p_decision: enumValue(body.decision, ["approve", "pause", "retire"]),
      p_reason: text(body.reason, 2, 1000),
      p_idempotency_key: idempotency(body.idempotencyKey),
    });
  }

  const compliance = input.suffix.match(/^\/businesses\/(biz_[0-9a-f]{32})\/compliance$/u);
  if (compliance && input.request.method === "POST") {
    return rpc(service, "set_business_compliance_v1", {
      p_game_session_id: input.gameId,
      p_staff_user_id: input.staffUserId,
      p_business_key: compliance[1],
      p_requirement_key: text(body.requirementKey, 2, 120),
      p_requirement_type: enumValue(body.requirementType, ["license", "tax", "regulation"]),
      p_status: enumValue(body.status, ["pending", "approved", "suspended", "expired", "waived"]),
      p_fee_amount: money(body.feeAmount ?? 0, 0, 10_000_000),
      p_policy_effects: record(body.policyEffects),
      p_expires_at: optionalTimestamp(body.expiresAt),
      p_reason: text(body.reason, 2, 1000),
      p_idempotency_key: idempotency(body.idempotencyKey),
    });
  }

  const settle = input.suffix.match(/^\/businesses\/(biz_[0-9a-f]{32})\/settle$/u);
  if (settle && input.request.method === "POST") {
    return rpc(service, "settle_business_cycle_v1", {
      p_game_session_id: input.gameId,
      p_business_key: settle[1],
      p_settlement_key: text(body.settlementKey, 8, 160),
      p_inflation_index: bounded(body.inflationIndex ?? 1, 0.1, 5),
      p_exchange_index: bounded(body.exchangeIndex ?? 1, 0.1, 5),
      p_interest_index: bounded(body.interestIndex ?? 1, 0, 5),
      p_difficulty_multiplier: bounded(body.difficultyMultiplier ?? 1, 0.5, 2),
    });
  }

  if (input.suffix === "/banking/savings/accrue" && input.request.method === "POST") {
    return rpc(service, "accrue_player_savings_interest_v1", {
      p_game_session_id: input.gameId,
      p_accrual_date: date(body.accrualDate),
      p_annual_rate: bounded(body.annualRate, 0, 0.25),
      p_max_interest_per_player: money(body.maxInterestPerPlayer ?? 10_000, 0, 1_000_000),
    });
  }

  if (input.suffix === "/loans/service" && input.request.method === "POST") {
    return rpc(service, "service_player_loan_status_v1", {
      p_game_session_id: input.gameId,
      p_as_of: optionalTimestamp(body.asOf) ?? new Date().toISOString(),
    });
  }

  if (input.suffix === "/business-banking/corrections" && input.request.method === "POST") {
    return rpc(service, "admin_business_banking_correction_v1", {
      p_game_session_id: input.gameId,
      p_staff_user_id: input.staffUserId,
      p_player_id: uuid(body.playerId),
      p_account_type: text(body.accountType, 1, 80),
      p_currency_code: text(body.currencyCode, 3, 16).toUpperCase(),
      p_amount: signedMoney(body.amount, 10_000_000),
      p_target_type: text(body.targetType, 2, 80),
      p_target_public_key: text(body.targetPublicKey, 2, 160),
      p_reason: text(body.reason, 8, 1000),
      p_idempotency_key: idempotency(body.idempotencyKey),
    });
  }

  return { handled: false };
}

async function rpc(
  service: ServiceClient,
  functionName: string,
  args: Record<string, unknown>,
): Promise<OperationResult> {
  const { data, error } = await service.rpc(functionName, args);
  if (error) return failure(error.message);
  return success({ result: Array.isArray(data) ? data[0] ?? null : data });
}

function success(data: unknown): OperationResult {
  return { handled: true, status: 200, body: { data } };
}
function failure(message: string): OperationResult {
  const code = String(message || "admin_business_banking_failed").split(/\s+/u)[0].toLowerCase();
  const status = code.includes("not_found") ? 404 : code.includes("denied") ? 403 : code.includes("conflict") ? 409 : 400;
  return {
    handled: true,
    status,
    body: {
      code,
      message: "The Business or Banking administrator operation could not be completed.",
    },
  };
}
async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (["GET", "HEAD"].includes(request.method)) return {};
  const value = await request.clone().json().catch(() => null);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_JSON_BODY");
  return value as Record<string, unknown>;
}
function text(value: unknown, minimum: number, maximum: number): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (result.length < minimum || result.length > maximum) throw new Error("INVALID_TEXT_FIELD");
  return result;
}
function enumValue(value: unknown, allowed: readonly string[]): string {
  const result = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!allowed.includes(result)) throw new Error("INVALID_ENUM_FIELD");
  return result;
}
function bounded(value: unknown, minimum: number, maximum: number): number {
  const result = Number(value);
  if (!Number.isFinite(result) || result < minimum || result > maximum) throw new Error("INVALID_NUMBER_FIELD");
  return result;
}
function money(value: unknown, minimum: number, maximum: number): number {
  return Math.round(bounded(value, minimum, maximum) * 100) / 100;
}
function signedMoney(value: unknown, maximum: number): number {
  const result = Number(value);
  if (!Number.isFinite(result) || result === 0 || Math.abs(result) > maximum) throw new Error("INVALID_AMOUNT");
  return Math.round(result * 100) / 100;
}
function idempotency(value: unknown): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z0-9._:-]{8,160}$/u.test(result)) throw new Error("INVALID_IDEMPOTENCY_KEY");
  return result;
}
function uuid(value: unknown): string {
  const result = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(result)) throw new Error("INVALID_UUID");
  return result;
}
function optionalTimestamp(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const timestamp = typeof value === "string" ? Date.parse(value) : NaN;
  if (!Number.isFinite(timestamp)) throw new Error("INVALID_TIMESTAMP");
  return new Date(timestamp).toISOString();
}
function date(value: unknown): string {
  const result = text(value, 10, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(result) || !Number.isFinite(Date.parse(`${result}T00:00:00Z`))) throw new Error("INVALID_DATE");
  return result;
}
function record(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_OBJECT");
  return value as Record<string, unknown>;
}

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

type Row = Record<string, unknown>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function handleBusinessBankingAdminOperation(
  service: ServiceClient,
  input: Input,
): Promise<OperationResult> {
  try {
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

    if (input.suffix === "/loan-products" && input.request.method === "GET") {
      const { data, error } = await service.from("loan_products").select(
        "public_key,name,borrower_type,status,currency_code,minimum_amount,maximum_amount,annual_rate,origination_fee_rate,term_cycles,payment_frequency_cycles,minimum_credit_score,maximum_payment_to_income,delinquency_grace_days,default_after_days,disclosure_text,updated_at",
      ).eq("game_session_id", input.gameId).order("minimum_amount", { ascending: true });
      if (error) return failure(error.message);
      return success({ products: data ?? [] });
    }

    if (input.suffix === "/economy/loans" && input.request.method === "GET") {
      return success(await readLoanSupervision(service, input.gameId));
    }

    const body = await readBody(input.request);

    const loanReview = input.suffix.match(/^\/(?:economy\/)?loan-applications\/(lna_[0-9a-f]{32})\/review$/u);
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

    if (["/loan-products", "/economy/loan-products"].includes(input.suffix) && input.request.method === "POST") {
      return rpc(service, "upsert_loan_product_v1", {
        p_game_session_id: input.gameId,
        p_staff_user_id: input.staffUserId,
        p_product_key: optionalPublicKey(body.productKey, "lop"),
        p_name: text(body.name, 2, 120),
        p_borrower_type: enumValue(body.borrowerType, ["player", "business"]),
        p_status: enumValue(body.status ?? "active", ["active", "paused", "retired"]),
        p_currency_code: text(body.currencyCode, 3, 16).toUpperCase(),
        p_minimum_amount: money(body.minimumAmount, 0.01, 10_000_000),
        p_maximum_amount: money(body.maximumAmount, 0.01, 10_000_000),
        p_annual_rate: bounded(body.annualRate, 0, 1),
        p_origination_fee_rate: bounded(body.originationFeeRate ?? 0, 0, 0.25),
        p_term_cycles: integer(body.termCycles, 1, 240),
        p_payment_frequency_cycles: integer(body.paymentFrequencyCycles ?? 1, 1, 240),
        p_minimum_credit_score: integer(body.minimumCreditScore, 300, 850),
        p_maximum_payment_to_income: bounded(body.maximumPaymentToIncome, 0.05, 0.75),
        p_delinquency_grace_days: integer(body.delinquencyGraceDays ?? 7, 0, 90),
        p_default_after_days: integer(body.defaultAfterDays ?? 30, 0, 365),
        p_disclosure_text: text(body.disclosureText, 20, 4000),
        p_reason: text(body.reason, 2, 1000),
        p_idempotency_key: idempotency(body.idempotencyKey),
      });
    }

    const loanRecovery = input.suffix.match(/^\/(?:economy\/)?loans\/(lon_[0-9a-f]{32})\/restructure$/u);
    if (loanRecovery && input.request.method === "POST") {
      return rpc(service, "restructure_player_loan_v1", {
        p_game_session_id: input.gameId,
        p_staff_user_id: input.staffUserId,
        p_loan_key: loanRecovery[1],
        p_scheduled_payment: money(body.scheduledPayment, 0.01, 10_000_000),
        p_next_due_at: requiredTimestamp(body.nextDueAt),
        p_reason: text(body.reason, 8, 1000),
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

    if (["/loans/service", "/economy/loans/service"].includes(input.suffix) && input.request.method === "POST") {
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
  } catch (error) {
    return failure(error instanceof Error ? error.message : "INVALID_ADMIN_BUSINESS_BANKING_REQUEST");
  }
}

async function readLoanSupervision(service: ServiceClient, gameId: string): Promise<Record<string, unknown>> {
  const [loanResult, paymentResult, applicationResult, productResult, businessResult] = await Promise.all([
    service.from("player_loans").select("id,public_key,player_id,business_id,loan_product_id,application_id,currency_code,original_principal,principal_balance,accrued_interest,annual_rate,origination_fee,scheduled_payment,status,next_due_at,last_accrued_at,delinquent_at,defaulted_at,closed_at,created_at,updated_at").eq("game_session_id", gameId).order("created_at", { ascending: false }).limit(2_000),
    service.from("loan_payments").select("id,public_key,player_id,loan_id,amount,principal_amount,interest_amount,status,created_at").eq("game_session_id", gameId).order("created_at", { ascending: false }).limit(5_000),
    service.from("loan_applications").select("id,public_key,player_id,business_id,loan_product_id,amount,purpose,credit_score,projected_payment,affordability_ratio,status,reviewed_at,created_at,updated_at").eq("game_session_id", gameId).order("created_at", { ascending: false }).limit(2_000),
    service.from("loan_products").select("id,public_key,name,borrower_type,status,currency_code,minimum_amount,maximum_amount,annual_rate,origination_fee_rate,term_cycles,payment_frequency_cycles,minimum_credit_score,maximum_payment_to_income,delinquency_grace_days,default_after_days,disclosure_text,created_at,updated_at").eq("game_session_id", gameId).order("minimum_amount", { ascending: true }).limit(500),
    service.from("business_entities").select("id,public_key,legal_name,status").eq("game_session_id", gameId).order("created_at", { ascending: true }).limit(2_000),
  ]);
  const loans = resultRows(loanResult);
  const payments = resultRows(paymentResult);
  const applications = resultRows(applicationResult);
  const products = resultRows(productResult);
  const businesses = resultRows(businessResult);
  const playerIds = uniqueInternalIds([...loans.map((row) => row.player_id), ...payments.map((row) => row.player_id), ...applications.map((row) => row.player_id)]);
  const playerResult = playerIds.length ? await service.from("players").select("id,display_name,player_identifier,roster_label,status").eq("game_session_id", gameId).in("id", playerIds) : { data: [], error: null };
  const players = resultRows(playerResult);
  const playerById = new Map(players.map((row) => [internalUuid(row.id), playerReference(row)]));
  const businessById = new Map(businesses.map((row) => [internalUuid(row.id), businessReference(row)]));
  const productById = new Map(products.map((row) => [internalUuid(row.id), productReference(row)]));
  const applicationKeyById = new Map(applications.map((row) => [internalUuid(row.id), publicKey(row.public_key, "lna")]));
  const loanKeyById = new Map(loans.map((row) => [internalUuid(row.id), publicKey(row.public_key, "lon")]));
  const loanCurrencyById = new Map(loans.map((row) => [internalUuid(row.id), currency(row.currency_code)]));
  const safeLoans = loans.map((row) => {
    const principalBalance = nonnegative(row.principal_balance);
    const accruedInterest = nonnegative(row.accrued_interest);
    return { id: publicKey(row.public_key, "lon"), borrower: playerById.get(internalUuid(row.player_id)) ?? unavailablePlayer(), business: optionalInternalReference(row.business_id, businessById), product: productById.get(internalUuid(row.loan_product_id)) ?? unavailableProduct(), applicationId: applicationKeyById.get(internalUuid(row.application_id)) ?? null, currencyCode: currency(row.currency_code), originalPrincipal: positive(row.original_principal), principalBalance, accruedInterest, outstanding: round(principalBalance + accruedInterest, 2), annualRate: boundedNumber(row.annual_rate, 0, 1), originationFee: nonnegative(row.origination_fee), scheduledPayment: positive(row.scheduled_payment), status: token(row.status, 40), nextDueAt: iso(row.next_due_at), lastAccruedAt: iso(row.last_accrued_at), delinquentAt: nullableIso(row.delinquent_at), defaultedAt: nullableIso(row.defaulted_at), closedAt: nullableIso(row.closed_at), createdAt: iso(row.created_at), updatedAt: nullableIso(row.updated_at) };
  });
  const safePayments = payments.map((row) => { const loanId = internalUuid(row.loan_id); return { id: publicKey(row.public_key, "pay"), loanId: loanKeyById.get(loanId) ?? null, borrower: playerById.get(internalUuid(row.player_id)) ?? unavailablePlayer(), currencyCode: loanCurrencyById.get(loanId) ?? "", amount: positive(row.amount), principalAmount: nonnegative(row.principal_amount), interestAmount: nonnegative(row.interest_amount), status: token(row.status, 40), createdAt: iso(row.created_at) }; });
  const safeApplications = applications.map((row) => ({ id: publicKey(row.public_key, "lna"), borrower: playerById.get(internalUuid(row.player_id)) ?? unavailablePlayer(), business: optionalInternalReference(row.business_id, businessById), product: productById.get(internalUuid(row.loan_product_id)) ?? unavailableProduct(), amount: positive(row.amount), purpose: nullableText(row.purpose, 500), creditScore: integerNumber(row.credit_score, 0, 1_000), projectedPayment: nonnegative(row.projected_payment), affordabilityRatio: boundedNumber(row.affordability_ratio, 0, 100), status: token(row.status, 40), reviewedAt: nullableIso(row.reviewed_at), createdAt: iso(row.created_at), updatedAt: nullableIso(row.updated_at) }));
  const safeProducts = products.map((row) => ({ ...productReference(row), minimumAmount: nonnegative(row.minimum_amount), maximumAmount: positive(row.maximum_amount), annualRate: boundedNumber(row.annual_rate, 0, 1), originationFeeRate: boundedNumber(row.origination_fee_rate, 0, 1), termCycles: integerNumber(row.term_cycles, 1, 240), paymentFrequencyCycles: integerNumber(row.payment_frequency_cycles, 1, 240), minimumCreditScore: integerNumber(row.minimum_credit_score, 0, 1_000), maximumPaymentToIncome: boundedNumber(row.maximum_payment_to_income, 0, 10), delinquencyGraceDays: integerNumber(row.delinquency_grace_days, 0, 365), defaultAfterDays: integerNumber(row.default_after_days, 0, 1_000), disclosureText: safeText(row.disclosure_text, 4_000, "Disclosure unavailable"), createdAt: nullableIso(row.created_at), updatedAt: nullableIso(row.updated_at) }));
  const currencyTotals = new Map<string, { currencyCode: string; principal: number; accruedInterest: number; outstanding: number }>();
  for (const loan of safeLoans) {
    if (!["active", "delinquent", "restructured"].includes(loan.status)) continue;
    const current = currencyTotals.get(loan.currencyCode) ?? { currencyCode: loan.currencyCode, principal: 0, accruedInterest: 0, outstanding: 0 };
    current.principal = round(current.principal + loan.principalBalance, 2);
    current.accruedInterest = round(current.accruedInterest + loan.accruedInterest, 2);
    current.outstanding = round(current.outstanding + loan.outstanding, 2);
    currencyTotals.set(loan.currencyCode, current);
  }
  return { summary: { loanCount: safeLoans.length, openLoanCount: safeLoans.filter((loan) => ["active", "delinquent", "restructured"].includes(loan.status)).length, delinquentCount: safeLoans.filter((loan) => loan.status === "delinquent").length, defaultedCount: safeLoans.filter((loan) => loan.status === "defaulted").length, paidCount: safeLoans.filter((loan) => loan.status === "paid").length, pendingApplicationCount: safeApplications.filter((application) => application.status === "pending_review").length, paymentCount: safePayments.filter((payment) => payment.status === "posted").length }, currencyTotals: [...currencyTotals.values()].sort((a, b) => a.currencyCode.localeCompare(b.currencyCode)), loans: safeLoans, payments: safePayments, applications: safeApplications, products: safeProducts };
}

async function rpc(service: ServiceClient, functionName: string, args: Record<string, unknown>): Promise<OperationResult> {
  const { data, error } = await service.rpc(functionName, args);
  if (error) return failure(error.message);
  return success({ result: Array.isArray(data) ? data[0] ?? null : data });
}
function success(data: unknown): OperationResult { return { handled: true, status: 200, body: { data } }; }
function failure(message: string): OperationResult {
  const code = String(message || "admin_business_banking_failed").split(/\s+/u)[0].toLowerCase();
  const status = code.includes("not_found") ? 404 : code.includes("denied") ? 403 : code.includes("conflict") ? 409 : 400;
  return { handled: true, status, body: { code, message: "The Business, Banking, or Loans administrator operation could not be completed." } };
}
async function readBody(request: Request): Promise<Record<string, unknown>> { if (["GET", "HEAD"].includes(request.method)) return {}; const value = await request.clone().json().catch(() => null); if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_JSON_BODY"); return value as Record<string, unknown>; }
function text(value: unknown, minimum: number, maximum: number): string { const result = typeof value === "string" ? value.trim() : ""; if (result.length < minimum || result.length > maximum) throw new Error("INVALID_TEXT_FIELD"); return result; }
function enumValue(value: unknown, allowed: readonly string[]): string { const result = typeof value === "string" ? value.trim().toLowerCase() : ""; if (!allowed.includes(result)) throw new Error("INVALID_ENUM_FIELD"); return result; }
function bounded(value: unknown, minimum: number, maximum: number): number { const result = Number(value); if (!Number.isFinite(result) || result < minimum || result > maximum) throw new Error("INVALID_NUMBER_FIELD"); return result; }
function integer(value: unknown, minimum: number, maximum: number): number { const result = bounded(value, minimum, maximum); if (!Number.isInteger(result)) throw new Error("INVALID_INTEGER_FIELD"); return result; }
function money(value: unknown, minimum: number, maximum: number): number { return Math.round(bounded(value, minimum, maximum) * 100) / 100; }
function signedMoney(value: unknown, maximum: number): number { const result = Number(value); if (!Number.isFinite(result) || result === 0 || Math.abs(result) > maximum) throw new Error("INVALID_AMOUNT"); return Math.round(result * 100) / 100; }
function idempotency(value: unknown): string { const result = typeof value === "string" ? value.trim() : ""; if (!/^[A-Za-z0-9._:-]{8,160}$/u.test(result)) throw new Error("INVALID_IDEMPOTENCY_KEY"); return result; }
function uuid(value: unknown): string { const result = typeof value === "string" ? value.trim().toLowerCase() : ""; if (!UUID_PATTERN.test(result)) throw new Error("INVALID_UUID"); return result; }
function publicKey(value: unknown, prefix: string): string { const result = typeof value === "string" ? value.trim().toLowerCase() : ""; if (!new RegExp(`^${prefix}_[0-9a-f]{32}$`, "u").test(result)) throw new Error("INVALID_PUBLIC_KEY"); return result; }
function optionalPublicKey(value: unknown, prefix: string): string | null { if (value === null || value === undefined || value === "") return null; return publicKey(value, prefix); }
function optionalTimestamp(value: unknown): string | null { if (value === null || value === undefined || value === "") return null; return requiredTimestamp(value); }
function requiredTimestamp(value: unknown): string { const timestamp = typeof value === "string" ? Date.parse(value) : NaN; if (!Number.isFinite(timestamp)) throw new Error("INVALID_TIMESTAMP"); return new Date(timestamp).toISOString(); }
function date(value: unknown): string { const result = text(value, 10, 10); if (!/^\d{4}-\d{2}-\d{2}$/u.test(result) || !Number.isFinite(Date.parse(`${result}T00:00:00Z`))) throw new Error("INVALID_DATE"); return result; }
function record(value: unknown): Record<string, unknown> { if (value === null || value === undefined) return {}; if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_OBJECT"); return value as Record<string, unknown>; }
function resultRows(result: { data?: unknown; error?: { message: string } | null }): Row[] { if (result?.error) throw new Error(result.error.message); if (result?.data == null) return []; if (!Array.isArray(result.data)) throw new Error("LOAN_SUPERVISION_RESPONSE_INVALID"); return result.data.filter((row): row is Row => Boolean(row && typeof row === "object" && !Array.isArray(row))); }
function internalUuid(value: unknown): string { const result = String(value ?? "").trim().toLowerCase(); if (!UUID_PATTERN.test(result)) throw new Error("LOAN_SUPERVISION_SCOPE_INVALID"); return result; }
function uniqueInternalIds(values: unknown[]): string[] { return [...new Set(values.filter((value) => value !== null && value !== undefined && value !== "").map(internalUuid))]; }
function safeText(value: unknown, maximum: number, fallback = ""): string { const result = String(value ?? "").trim().slice(0, maximum); return result || fallback; }
function nullableText(value: unknown, maximum: number): string | null { const result = safeText(value, maximum); return result || null; }
function token(value: unknown, maximum: number): string { const result = String(value ?? "").trim().toLowerCase(); if (!result || result.length > maximum || !/^[a-z0-9][a-z0-9_-]*$/u.test(result)) throw new Error("LOAN_SUPERVISION_TOKEN_INVALID"); return result; }
function currency(value: unknown): string { const result = String(value ?? "").trim().toUpperCase(); if (!/^[A-Z0-9]{3,16}$/u.test(result)) throw new Error("LOAN_SUPERVISION_CURRENCY_INVALID"); return result; }
function finiteNumber(value: unknown): number { const result = Number(value); if (!Number.isFinite(result)) throw new Error("LOAN_SUPERVISION_NUMBER_INVALID"); return result; }
function nonnegative(value: unknown): number { const result = finiteNumber(value); if (result < 0) throw new Error("LOAN_SUPERVISION_NUMBER_INVALID"); return round(result, 2); }
function positive(value: unknown): number { const result = finiteNumber(value); if (result <= 0) throw new Error("LOAN_SUPERVISION_NUMBER_INVALID"); return round(result, 2); }
function boundedNumber(value: unknown, minimum: number, maximum: number): number { const result = finiteNumber(value); if (result < minimum || result > maximum) throw new Error("LOAN_SUPERVISION_NUMBER_INVALID"); return result; }
function integerNumber(value: unknown, minimum: number, maximum: number): number { const result = finiteNumber(value); if (!Number.isSafeInteger(result) || result < minimum || result > maximum) throw new Error("LOAN_SUPERVISION_INTEGER_INVALID"); return result; }
function round(value: number, digits = 2): number { const factor = 10 ** digits; return Math.round((value + Number.EPSILON) * factor) / factor; }
function iso(value: unknown): string { const timestamp = Date.parse(String(value ?? "")); if (!Number.isFinite(timestamp)) throw new Error("LOAN_SUPERVISION_TIMESTAMP_INVALID"); return new Date(timestamp).toISOString(); }
function nullableIso(value: unknown): string | null { if (value === null || value === undefined || value === "") return null; return iso(value); }
function playerReference(row: Row): Record<string, unknown> { return { displayName: safeText(row.display_name, 180, "Player"), playerIdentifier: nullableText(row.player_identifier, 80), rosterLabel: nullableText(row.roster_label, 80), status: token(row.status, 40) }; }
function unavailablePlayer(): Record<string, unknown> { return { displayName: "Player unavailable", playerIdentifier: null, rosterLabel: null, status: "unknown" }; }
function businessReference(row: Row): Record<string, unknown> { return { id: publicKey(row.public_key, "biz"), name: safeText(row.legal_name, 160, "Business"), status: token(row.status, 40) }; }
function productReference(row: Row): Record<string, unknown> { return { id: publicKey(row.public_key, "lop"), name: safeText(row.name, 160, "Loan product"), borrowerType: token(row.borrower_type, 40), status: token(row.status, 40), currencyCode: currency(row.currency_code) }; }
function unavailableProduct(): Record<string, unknown> { return { id: null, name: "Loan product unavailable", borrowerType: "unknown", status: "unknown", currencyCode: "" }; }
function optionalInternalReference<T>(value: unknown, mapping: Map<string, T>): T | null { if (value === null || value === undefined || value === "") return null; return mapping.get(internalUuid(value)) ?? null; }

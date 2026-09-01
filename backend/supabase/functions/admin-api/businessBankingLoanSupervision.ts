type ServiceClient = {
  from(table: string): any;
};

type Row = Record<string, unknown>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function readLoanSupervision(
  service: ServiceClient,
  gameId: string,
): Promise<Record<string, unknown>> {
  const [
    loanResult,
    paymentResult,
    applicationResult,
    productResult,
    businessResult,
  ] = await Promise.all([
    service.from("player_loans").select(
      "id,public_key,player_id,business_id,loan_product_id,application_id,currency_code,original_principal,principal_balance,accrued_interest,annual_rate,origination_fee,scheduled_payment,status,next_due_at,last_accrued_at,delinquent_at,defaulted_at,closed_at,created_at,updated_at",
    ).eq("game_session_id", gameId).order("created_at", { ascending: false })
      .limit(2_000),
    service.from("loan_payments").select(
      "id,public_key,player_id,loan_id,amount,principal_amount,interest_amount,status,created_at",
    ).eq("game_session_id", gameId).order("created_at", { ascending: false })
      .limit(5_000),
    service.from("loan_applications").select(
      "id,public_key,player_id,business_id,loan_product_id,amount,purpose,credit_score,projected_payment,affordability_ratio,status,reviewed_at,created_at,updated_at",
    ).eq("game_session_id", gameId).order("created_at", { ascending: false })
      .limit(2_000),
    service.from("loan_products").select(
      "id,public_key,name,borrower_type,status,currency_code,minimum_amount,maximum_amount,annual_rate,origination_fee_rate,term_cycles,payment_frequency_cycles,minimum_credit_score,maximum_payment_to_income,delinquency_grace_days,default_after_days,disclosure_text,created_at,updated_at",
    ).eq("game_session_id", gameId).order("minimum_amount", { ascending: true })
      .limit(500),
    service.from("business_entities").select("id,public_key,legal_name,status")
      .eq("game_session_id", gameId).order("created_at", { ascending: true })
      .limit(2_000),
  ]);
  const loans = resultRows(loanResult);
  const payments = resultRows(paymentResult);
  const applications = resultRows(applicationResult);
  const products = resultRows(productResult);
  const businesses = resultRows(businessResult);
  const playerIds = uniqueInternalIds([
    ...loans.map((row) => row.player_id),
    ...payments.map((row) => row.player_id),
    ...applications.map((row) => row.player_id),
  ]);
  const playerResult = playerIds.length
    ? await service.from("players").select(
      "id,display_name,player_identifier,roster_label,status",
    ).eq("game_session_id", gameId).in("id", playerIds)
    : { data: [], error: null };
  const players = resultRows(playerResult);
  const playerById = new Map(
    players.map((row) => [internalUuid(row.id), playerReference(row)]),
  );
  const businessById = new Map(
    businesses.map((row) => [internalUuid(row.id), businessReference(row)]),
  );
  const productById = new Map(
    products.map((row) => [internalUuid(row.id), productReference(row)]),
  );
  const applicationKeyById = new Map(
    applications.map((row) => [
      internalUuid(row.id),
      publicKey(row.public_key, "lna"),
    ]),
  );
  const loanKeyById = new Map(
    loans.map((row) => [
      internalUuid(row.id),
      publicKey(row.public_key, "lon"),
    ]),
  );
  const loanCurrencyById = new Map(
    loans.map((row) => [internalUuid(row.id), currency(row.currency_code)]),
  );
  const safeLoans = loans.map((row) => {
    const principalBalance = nonnegative(row.principal_balance);
    const accruedInterest = nonnegative(row.accrued_interest);
    return {
      id: publicKey(row.public_key, "lon"),
      borrower: playerById.get(internalUuid(row.player_id)) ??
        unavailablePlayer(),
      business: optionalInternalReference(row.business_id, businessById),
      product: productById.get(internalUuid(row.loan_product_id)) ??
        unavailableProduct(),
      applicationId: applicationKeyById.get(internalUuid(row.application_id)) ??
        null,
      currencyCode: currency(row.currency_code),
      originalPrincipal: positive(row.original_principal),
      principalBalance,
      accruedInterest,
      outstanding: round(principalBalance + accruedInterest, 2),
      annualRate: boundedNumber(row.annual_rate, 0, 1),
      originationFee: nonnegative(row.origination_fee),
      scheduledPayment: positive(row.scheduled_payment),
      status: token(row.status, 40),
      nextDueAt: iso(row.next_due_at),
      lastAccruedAt: iso(row.last_accrued_at),
      delinquentAt: nullableIso(row.delinquent_at),
      defaultedAt: nullableIso(row.defaulted_at),
      closedAt: nullableIso(row.closed_at),
      createdAt: iso(row.created_at),
      updatedAt: nullableIso(row.updated_at),
    };
  });
  const safePayments = payments.map((row) => {
    const loanId = internalUuid(row.loan_id);
    return {
      id: publicKey(row.public_key, "pay"),
      loanId: loanKeyById.get(loanId) ?? null,
      borrower: playerById.get(internalUuid(row.player_id)) ??
        unavailablePlayer(),
      currencyCode: loanCurrencyById.get(loanId) ?? "",
      amount: positive(row.amount),
      principalAmount: nonnegative(row.principal_amount),
      interestAmount: nonnegative(row.interest_amount),
      status: token(row.status, 40),
      createdAt: iso(row.created_at),
    };
  });
  const safeApplications = applications.map((row) => ({
    id: publicKey(row.public_key, "lna"),
    borrower: playerById.get(internalUuid(row.player_id)) ??
      unavailablePlayer(),
    business: optionalInternalReference(row.business_id, businessById),
    product: productById.get(internalUuid(row.loan_product_id)) ??
      unavailableProduct(),
    amount: positive(row.amount),
    purpose: nullableText(row.purpose, 500),
    creditScore: integerNumber(row.credit_score, 0, 1_000),
    projectedPayment: nonnegative(row.projected_payment),
    affordabilityRatio: boundedNumber(row.affordability_ratio, 0, 100),
    status: token(row.status, 40),
    reviewedAt: nullableIso(row.reviewed_at),
    createdAt: iso(row.created_at),
    updatedAt: nullableIso(row.updated_at),
  }));
  const safeProducts = products.map((row) => ({
    ...productReference(row),
    minimumAmount: nonnegative(row.minimum_amount),
    maximumAmount: positive(row.maximum_amount),
    annualRate: boundedNumber(row.annual_rate, 0, 1),
    originationFeeRate: boundedNumber(row.origination_fee_rate, 0, 1),
    termCycles: integerNumber(row.term_cycles, 1, 240),
    paymentFrequencyCycles: integerNumber(row.payment_frequency_cycles, 1, 240),
    minimumCreditScore: integerNumber(row.minimum_credit_score, 0, 1_000),
    maximumPaymentToIncome: boundedNumber(row.maximum_payment_to_income, 0, 10),
    delinquencyGraceDays: integerNumber(row.delinquency_grace_days, 0, 365),
    defaultAfterDays: integerNumber(row.default_after_days, 0, 1_000),
    disclosureText: safeText(
      row.disclosure_text,
      4_000,
      "Disclosure unavailable",
    ),
    createdAt: nullableIso(row.created_at),
    updatedAt: nullableIso(row.updated_at),
  }));
  const currencyTotals = new Map<
    string,
    {
      currencyCode: string;
      principal: number;
      accruedInterest: number;
      outstanding: number;
    }
  >();
  for (const loan of safeLoans) {
    if (!["active", "delinquent", "restructured"].includes(loan.status)) {
      continue;
    }
    const current = currencyTotals.get(loan.currencyCode) ?? {
      currencyCode: loan.currencyCode,
      principal: 0,
      accruedInterest: 0,
      outstanding: 0,
    };
    current.principal = round(current.principal + loan.principalBalance, 2);
    current.accruedInterest = round(
      current.accruedInterest + loan.accruedInterest,
      2,
    );
    current.outstanding = round(current.outstanding + loan.outstanding, 2);
    currencyTotals.set(loan.currencyCode, current);
  }
  return {
    summary: {
      loanCount: safeLoans.length,
      openLoanCount:
        safeLoans.filter((loan) =>
          ["active", "delinquent", "restructured"].includes(loan.status)
        ).length,
      delinquentCount:
        safeLoans.filter((loan) => loan.status === "delinquent").length,
      defaultedCount:
        safeLoans.filter((loan) => loan.status === "defaulted").length,
      paidCount: safeLoans.filter((loan) => loan.status === "paid").length,
      pendingApplicationCount:
        safeApplications.filter((application) =>
          application.status === "pending_review"
        ).length,
      paymentCount:
        safePayments.filter((payment) => payment.status === "posted").length,
    },
    currencyTotals: [...currencyTotals.values()].sort((a, b) =>
      a.currencyCode.localeCompare(b.currencyCode)
    ),
    loans: safeLoans,
    payments: safePayments,
    applications: safeApplications,
    products: safeProducts,
  };
}

function resultRows(
  result: { data?: unknown; error?: { message: string } | null },
): Row[] {
  if (result?.error) throw new Error(result.error.message);
  if (result?.data == null) return [];
  if (!Array.isArray(result.data)) {
    throw new Error("LOAN_SUPERVISION_RESPONSE_INVALID");
  }
  return result.data.filter((row): row is Row =>
    Boolean(row && typeof row === "object" && !Array.isArray(row))
  );
}

function internalUuid(value: unknown): string {
  const result = String(value ?? "").trim().toLowerCase();
  if (!UUID_PATTERN.test(result)) {
    throw new Error("LOAN_SUPERVISION_SCOPE_INVALID");
  }
  return result;
}

function uniqueInternalIds(values: unknown[]): string[] {
  return [
    ...new Set(
      values.filter((value) =>
        value !== null && value !== undefined && value !== ""
      ).map(internalUuid),
    ),
  ];
}

function safeText(value: unknown, maximum: number, fallback = ""): string {
  const result = String(value ?? "").trim().slice(0, maximum);
  return result || fallback;
}

function nullableText(value: unknown, maximum: number): string | null {
  const result = safeText(value, maximum);
  return result || null;
}

function token(value: unknown, maximum: number): string {
  const result = String(value ?? "").trim().toLowerCase();
  if (
    !result || result.length > maximum ||
    !/^[a-z0-9][a-z0-9_-]*$/u.test(result)
  ) {
    throw new Error("LOAN_SUPERVISION_TOKEN_INVALID");
  }
  return result;
}

function currency(value: unknown): string {
  const result = String(value ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{3,16}$/u.test(result)) {
    throw new Error("LOAN_SUPERVISION_CURRENCY_INVALID");
  }
  return result;
}

function finiteNumber(value: unknown): number {
  const result = Number(value);
  if (!Number.isFinite(result)) {
    throw new Error("LOAN_SUPERVISION_NUMBER_INVALID");
  }
  return result;
}

function nonnegative(value: unknown): number {
  const result = finiteNumber(value);
  if (result < 0) throw new Error("LOAN_SUPERVISION_NUMBER_INVALID");
  return round(result, 2);
}

function positive(value: unknown): number {
  const result = finiteNumber(value);
  if (result <= 0) throw new Error("LOAN_SUPERVISION_NUMBER_INVALID");
  return round(result, 2);
}

function boundedNumber(
  value: unknown,
  minimum: number,
  maximum: number,
): number {
  const result = finiteNumber(value);
  if (result < minimum || result > maximum) {
    throw new Error("LOAN_SUPERVISION_NUMBER_INVALID");
  }
  return result;
}

function integerNumber(
  value: unknown,
  minimum: number,
  maximum: number,
): number {
  const result = finiteNumber(value);
  if (!Number.isSafeInteger(result) || result < minimum || result > maximum) {
    throw new Error("LOAN_SUPERVISION_INTEGER_INVALID");
  }
  return result;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function iso(value: unknown): string {
  const timestamp = Date.parse(String(value ?? ""));
  if (!Number.isFinite(timestamp)) {
    throw new Error("LOAN_SUPERVISION_TIMESTAMP_INVALID");
  }
  return new Date(timestamp).toISOString();
}

function nullableIso(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return iso(value);
}

function publicKey(value: unknown, prefix: string): string {
  const result = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!new RegExp(`^${prefix}_[0-9a-f]{32}$`, "u").test(result)) {
    throw new Error("INVALID_PUBLIC_KEY");
  }
  return result;
}

function playerReference(row: Row): Record<string, unknown> {
  return {
    displayName: safeText(row.display_name, 180, "Player"),
    playerIdentifier: nullableText(row.player_identifier, 80),
    rosterLabel: nullableText(row.roster_label, 80),
    status: token(row.status, 40),
  };
}

function unavailablePlayer(): Record<string, unknown> {
  return {
    displayName: "Player unavailable",
    playerIdentifier: null,
    rosterLabel: null,
    status: "unknown",
  };
}

function businessReference(row: Row): Record<string, unknown> {
  return {
    id: publicKey(row.public_key, "biz"),
    name: safeText(row.legal_name, 160, "Business"),
    status: token(row.status, 40),
  };
}

function productReference(row: Row): Record<string, unknown> {
  return {
    id: publicKey(row.public_key, "lop"),
    name: safeText(row.name, 160, "Loan product"),
    borrowerType: token(row.borrower_type, 40),
    status: token(row.status, 40),
    currencyCode: currency(row.currency_code),
  };
}

function unavailableProduct(): Record<string, unknown> {
  return {
    id: null,
    name: "Loan product unavailable",
    borrowerType: "unknown",
    status: "unknown",
    currencyCode: "",
  };
}

function optionalInternalReference<T>(
  value: unknown,
  mapping: Map<string, T>,
): T | null {
  if (value === null || value === undefined || value === "") return null;
  return mapping.get(internalUuid(value)) ?? null;
}

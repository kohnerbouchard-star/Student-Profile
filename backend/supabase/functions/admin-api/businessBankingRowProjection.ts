import { safeBusinessValue } from "./businessSupervisionProjection.ts";

type Row = Record<string, unknown>;

// The operation retains ownership of scalar validation; projections cannot call RPCs.
export function createBusinessBankingRowProjection(
  publicKey: (value: unknown, prefix: string) => string,
) {
  function projectBusinessRows(value: unknown): Row[] {
    if (value === null || value === undefined) return [];
    if (!Array.isArray(value)) {
      throw new Error("BUSINESS_SUPERVISION_RESPONSE_INVALID");
    }
    return value.filter((row): row is Row =>
      Boolean(row && typeof row === "object" && !Array.isArray(row))
    ).map(projectBusinessRow);
  }

  function projectBusinessRow(row: Row): Row {
    const status = typeof row.status === "string"
      ? row.status.trim().toLowerCase()
      : "";
    const failureCount = Number(row.failure_count);
    const attentionFlags: string[] = [];
    if (status && status !== "active") attentionFlags.push(`status:${status}`);
    if (Number.isSafeInteger(failureCount) && failureCount > 0) {
      attentionFlags.push("recorded-failures");
    }
    const operationalReadiness = row.closed_at || status === "closed"
      ? "closed"
      : status === "active" && attentionFlags.length === 0
      ? "unknown"
      : status
      ? "attention"
      : "unknown";

    return Object.fromEntries(
      Object.entries({
        public_key: publicKey(row.public_key, "biz"),
        legal_name: row.legal_name,
        entity_type: row.entity_type,
        industry_code: row.industry_code,
        country_code: row.country_code,
        currency_code: row.currency_code,
        status: row.status,
        capitalization: row.capitalization,
        reputation_score: row.reputation_score,
        failure_count: row.failure_count,
        created_at: row.created_at,
        updated_at: row.updated_at,
        closed_at: row.closed_at,
        operational_readiness: operationalReadiness,
        attention_flags: attentionFlags,
      }).map((
        [key, value],
      ) => [key, key === "attention_flags" ? value : safeBusinessValue(value)]),
    );
  }

  function projectLoanApplicationRows(value: unknown): Row[] {
    if (value === null || value === undefined) return [];
    if (!Array.isArray(value)) {
      throw new Error("LOAN_APPLICATION_SUPERVISION_RESPONSE_INVALID");
    }
    return value.filter((row): row is Row =>
      Boolean(row && typeof row === "object" && !Array.isArray(row))
    ).map((row) => ({
      public_key: publicKey(row.public_key, "lna"),
      amount: row.amount,
      purpose: row.purpose,
      credit_score: row.credit_score,
      projected_payment: row.projected_payment,
      affordability_ratio: row.affordability_ratio,
      status: row.status,
      reviewed_at: row.reviewed_at,
      review_reason: row.review_reason,
      created_at: row.created_at,
    }));
  }

  return { projectBusinessRows, projectBusinessRow, projectLoanApplicationRows };
}

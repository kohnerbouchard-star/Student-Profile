import type { EdgeSupabaseClient } from "../../../platform/supabase/edgeStaffSession.ts";
import {
  type LoansSnapshotDto,
  PlayerBusinessBankingError,
  type PlayerBusinessBankingRepository,
  type PlayerEconomicContext,
} from "../contracts/playerBusinessBankingContracts.ts";

type Row = Record<string, unknown>;

export class SupabasePlayerBusinessBankingRepository
  implements PlayerBusinessBankingRepository {
  constructor(private readonly client: EdgeSupabaseClient) {}

  async readEconomicContext(input: {
    readonly gameSessionId: string;
    readonly playerId: string;
  }): Promise<PlayerEconomicContext> {
    const context = await rpcMaybeRow(
      this.client,
      "resolve_player_economic_context_v1",
      {
        p_game_session_id: input.gameSessionId,
        p_player_id: input.playerId,
      },
    );
    const countryCode = text(context?.country_code).toUpperCase();
    const currencyCode = text(context?.currency_code).toUpperCase();
    if (!countryCode || !currencyCode) {
      throw new PlayerBusinessBankingError(
        "player_economic_context_missing",
        "Player country and currency must be assigned before this action.",
        409,
      );
    }
    return { countryCode, currencyCode };
  }

  async readLoans(input: {
    readonly gameSessionId: string;
    readonly playerId: string;
  }): Promise<LoansSnapshotDto> {
    const context = await this.readEconomicContext(input);
    const localCurrency = context.currencyCode;

    const [products, loans, profileRows, paymentRows, businesses] = await Promise.all([
      rows(this.client.from("loan_products").select("*")
        .eq("game_session_id", input.gameSessionId)
        .eq("currency_code", localCurrency)
        .order("minimum_amount", { ascending: true })),
      rows(this.client.from("player_loans").select("*")
        .eq("game_session_id", input.gameSessionId).eq("player_id", input.playerId)
        .order("created_at", { ascending: false })),
      rows(this.client.from("credit_profiles").select("*")
        .eq("game_session_id", input.gameSessionId).eq("player_id", input.playerId)
        .limit(1)),
      rows(this.client.from("loan_payments").select("*")
        .eq("game_session_id", input.gameSessionId).eq("player_id", input.playerId)
        .order("created_at", { ascending: false }).limit(500)),
      rows(this.client.from("business_entities").select("id,public_key,status")
        .eq("game_session_id", input.gameSessionId).eq("owner_player_id", input.playerId)),
    ]);
    const businessKeys = new Map(businesses.map((row) => [text(row.id), text(row.public_key)]));
    const productById = new Map(products.map((row) => [text(row.id), row]));
    const profile = profileRows[0] ?? {};
    const creditScore = integer(profile.score, 600);
    const active = loans.filter((row) => ["active", "delinquent", "restructured"].includes(text(row.status)));
    const outstanding = active.reduce(
      (sum, row) => sum + number(row.principal_balance) + number(row.accrued_interest),
      0,
    );
    const next = [...active].sort(
      (a, b) => Date.parse(text(a.next_due_at)) - Date.parse(text(b.next_due_at)),
    )[0];
    const eligibleProducts = products.filter((row) => {
      if (text(row.status) !== "active") return false;
      if (integer(row.minimum_credit_score, 550) > creditScore) return false;
      return text(row.borrower_type) !== "business" || businesses.some(
        (business) => ["active", "restructuring"].includes(text(business.status)),
      );
    });

    return {
      configured: true,
      creditScore,
      availableCredit: eligibleProducts.reduce((sum, row) => sum + number(row.maximum_amount), 0),
      outstanding: round(outstanding, 2),
      nextPayment: next
        ? { amount: number(next.scheduled_payment), due: text(next.next_due_at) }
        : { amount: 0, due: "No payment scheduled" },
      onTimeRate: round(number(profile.on_time_payment_rate, 1) * 100, 1),
      paymentsMade: paymentRows.filter((row) => text(row.status) === "posted").length,
      offers: eligibleProducts.map((row) => ({
        id: text(row.public_key),
        name: text(row.name, "Credit facility"),
        purpose: text(row.borrower_type) === "business" ? "Business finance" : "Player finance",
        description: text(row.disclosure_text),
        limit: number(row.maximum_amount),
        minimumAmount: number(row.minimum_amount),
        apr: round(number(row.annual_rate) * 100, 2),
        fee: round(number(row.origination_fee_rate) * 100, 2),
        termCycles: integer(row.term_cycles),
        risk: integer(row.minimum_credit_score) >= 700 ? "Low" : "Moderate",
        borrowerType: text(row.borrower_type),
        disclosure: text(row.disclosure_text),
        icon: text(row.borrower_type) === "business" ? "business" : "banking",
      })),
      activeLoans: active.map((row) => {
        const original = number(row.original_principal);
        const balance = number(row.principal_balance) + number(row.accrued_interest);
        const product = productById.get(text(row.loan_product_id)) ?? {};
        return {
          id: text(row.public_key),
          name: text(product.name, "Credit facility"),
          status: title(text(row.status)),
          balance: round(balance, 2),
          originalAmount: original,
          nextPayment: number(row.scheduled_payment),
          nextDue: text(row.next_due_at),
          repaidPercent: original > 0
            ? Math.max(0, Math.min(100, round(
              ((original - number(row.principal_balance)) / original) * 100,
              1,
            )))
            : 0,
          accruedInterest: number(row.accrued_interest),
          businessId: businessKeys.get(text(row.business_id)) ?? null,
        };
      }),
      schedule: active.flatMap((row) => {
        const product = productById.get(text(row.loan_product_id)) ?? {};
        const frequencyCycles = Math.max(1, integer(product.payment_frequency_cycles, 1));
        const paymentCount = Math.min(
          Math.ceil(integer(product.term_cycles, 1) / frequencyCycles),
          24,
        );
        const nextDue = Date.parse(text(row.next_due_at));
        if (!Number.isFinite(nextDue)) return [];
        return Array.from({ length: paymentCount }, (_, index) => ({
          cycle: `Payment ${index + 1}`,
          due: new Date(nextDue + index * frequencyCycles * 7 * 86_400_000).toISOString(),
          amount: number(row.scheduled_payment),
          status: index === 0 && text(row.status) === "delinquent" ? "Late" : "Scheduled",
        }));
      }),
    };
  }

  async execute(
    command: string,
    args: Readonly<Record<string, unknown>>,
  ): Promise<Record<string, unknown>> {
    const response = await this.client.rpc<unknown>(command, args);
    if (response.error) throw mapDatabaseError(response.error.message);
    const value = Array.isArray(response.data) ? response.data[0] : response.data;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new PlayerBusinessBankingError(
        "banking_result_invalid",
        "The Banking operation completed without a valid result.",
        500,
      );
    }
    return value as Record<string, unknown>;
  }
}

async function rows(
  builder: PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<Row[]> {
  const response = await builder;
  if (response.error) throw mapDatabaseError(response.error.message);
  return Array.isArray(response.data)
    ? response.data.filter(
      (value): value is Row => Boolean(value && typeof value === "object" && !Array.isArray(value)),
    )
    : [];
}

async function rpcMaybeRow(
  client: EdgeSupabaseClient,
  command: string,
  args: Readonly<Record<string, unknown>>,
): Promise<Row | null> {
  const response = await client.rpc<unknown>(command, args);
  if (response.error) throw mapDatabaseError(response.error.message);
  const value = Array.isArray(response.data) ? response.data[0] : response.data;
  if (value === null || value === undefined) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new PlayerBusinessBankingError(
      "banking_result_invalid",
      "The Banking operation completed without a valid result.",
      500,
    );
  }
  return value as Row;
}

function mapDatabaseError(message: string): PlayerBusinessBankingError {
  const code = message.trim().split(/\s+/u)[0] || "BANKING_FAILED";
  const mappings: Record<string, [number, string]> = {
    PLAYER_SCOPE_REQUIRED: [401, "Player session scope is required."],
    PLAYER_NOT_FOUND: [404, "Player was not found in this game."],
    PLAYER_ECONOMIC_CONTEXT_REQUIRED: [409, "Player country and currency must be assigned first."],
    RECIPIENT_NOT_FOUND: [404, "Recipient Player ID was not found in this game."],
    SELF_TRANSFER_NOT_ALLOWED: [409, "A player cannot transfer funds to the same account."],
    INSUFFICIENT_FUNDS: [409, "Available funds are insufficient."],
    IDEMPOTENCY_KEY_CONFLICT: [409, "This idempotency key was already used for a different request."],
    ACCOUNT_CURRENCY_MISMATCH: [409, "Checking and savings transfers must use the player's current local currency."],
    LOAN_PRODUCT_NOT_FOUND: [404, "Loan offer was not found."],
    LOAN_CURRENCY_MISMATCH: [409, "Loan offers must use the player's current local currency."],
    LOAN_NOT_FOUND: [404, "Loan was not found."],
    CREDIT_SCORE_INELIGIBLE: [409, "Current economic behavior does not meet this offer's credit requirement."],
    LOAN_UNAFFORDABLE: [409, "Projected payments exceed the affordability limit."],
    AUTHORITATIVE_BUSINESS_BORROWER_REQUIRED: [409, "An active authoritative business borrower is required."],
  };
  const mapped = mappings[code];
  return new PlayerBusinessBankingError(
    code.toLowerCase(),
    mapped?.[1] ?? "The Banking or Loans operation could not be completed.",
    mapped?.[0] ?? 400,
  );
}

function text(value: unknown, defaultValue = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : defaultValue;
}
function number(value: unknown, defaultValue = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}
function integer(value: unknown, defaultValue = 0): number {
  return Math.trunc(number(value, defaultValue));
}
function round(value: number, digits = 2): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
function title(value: string): string {
  return value.replace(/[_-]+/gu, " ").replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

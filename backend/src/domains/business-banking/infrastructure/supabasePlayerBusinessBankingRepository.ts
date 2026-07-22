import type { EdgeSupabaseClient } from "../../../platform/supabase/edgeStaffSession.ts";
import {
  type BusinessSnapshotDto,
  type LoansSnapshotDto,
  PlayerBusinessBankingError,
  type PlayerBusinessBankingRepository,
} from "../contracts/playerBusinessBankingContracts.ts";

type Row = Record<string, unknown>;

export class SupabasePlayerBusinessBankingRepository
  implements PlayerBusinessBankingRepository {
  constructor(private readonly client: EdgeSupabaseClient) {}

  async readBusiness(input: {
    readonly gameSessionId: string;
    readonly playerId: string;
  }): Promise<BusinessSnapshotDto> {
    const business = await maybeRow(
      this.client.from("business_entities").select("*")
        .eq("game_session_id", input.gameSessionId)
        .eq("owner_player_id", input.playerId)
        .order("created_at", { ascending: false })
        .limit(1),
    );
    if (!business) return emptyBusiness();

    const businessId = text(business.id);
    const [products, employees, inventory, runs, balanceRows] = await Promise.all([
      rows(this.client.from("business_products").select("*")
        .eq("game_session_id", input.gameSessionId).eq("business_id", businessId)
        .order("created_at", { ascending: true })),
      rows(this.client.from("business_employees").select("*")
        .eq("game_session_id", input.gameSessionId).eq("business_id", businessId)
        .order("hired_at", { ascending: true })),
      rows(this.client.from("business_inventory").select("*")
        .eq("game_session_id", input.gameSessionId).eq("business_id", businessId)
        .order("item_key", { ascending: true })),
      rows(this.client.from("business_production_runs").select("*")
        .eq("game_session_id", input.gameSessionId).eq("business_id", businessId)
        .order("created_at", { ascending: false }).limit(100)),
      rows(this.client.from("account_balances").select("*")
        .eq("game_session_id", input.gameSessionId).eq("player_id", input.playerId)),
    ]);

    const businessAccount = `business:${text(business.public_key).toLowerCase()}`;
    const cash = number(
      balanceRows.find((row) => text(row.account_type) === businessAccount)?.balance,
    );
    const completedOutput = runs.filter((row) => text(row.status) === "completed")
      .reduce((sum, row) => sum + number(row.output_quantity), 0);
    const finished = inventory.filter((row) => text(row.inventory_kind) === "finished_good")
      .reduce((sum, row) => sum + number(row.quantity), 0);
    const activeEmployees = employees.filter((row) => text(row.status) === "active");
    const capacity = Math.max(0, number(business.capacity_units, 100));
    const latestOutput = runs.length ? number(runs[0].output_quantity) : 0;
    const capacityUse = capacity > 0
      ? Math.min(100, Math.round((latestOutput / capacity) * 100))
      : 0;
    const revenue = number(business.revenue_total);
    const profit = number(business.profit_total);

    return {
      configured: true,
      company: {
        id: text(business.public_key),
        name: text(business.legal_name, "Unnamed business"),
        registration: text(business.public_key).toUpperCase(),
        status: title(text(business.status, "active")),
        industry: title(text(business.industry_code, "general")),
        headquarters: text(business.country_code, "Unassigned"),
        valuation: number(business.valuation),
        valuationChange: 0,
        cash,
        revenue,
        margin: revenue > 0 ? round((profit / revenue) * 100, 1) : 0,
        reputation: number(business.reputation_score, 50),
        reputationLabel: reputationLabel(number(business.reputation_score, 50)),
        summary: `Ledger-backed ${title(text(business.entity_type))} operating in ${text(business.country_code)}.`,
      },
      operations: {
        employees: activeEmployees.length,
        output: completedOutput,
        backlog: Math.round(finished),
        capacityUse,
        maxRun: Math.max(0, Math.floor(capacity * activeEmployees.reduce(
          (sum, row) => sum + number(row.productivity_index, 1),
          activeEmployees.length ? 0 : 1,
        ))),
        capacityNote: capacityUse >= 90
          ? "Capacity is constrained. Additional labor or equipment may be required."
          : "Capacity remains within the reviewed operating range.",
      },
      products: products.filter((row) => text(row.status) !== "retired").map((row) => {
        const price = number(row.unit_price);
        const cost = number(row.unit_input_cost) + number(row.unit_labor_cost);
        return {
          id: text(row.public_key),
          category: title(text(row.category, "general")),
          name: text(row.name, "Unnamed product"),
          description: `${number(row.quality_score, 50)}/100 quality · ${number(row.base_demand_units)} baseline demand`,
          price,
          margin: price > 0 ? round(((price - cost) / price) * 100, 1) : 0,
          demand: demandLabel(price, number(row.reference_price, price)),
          icon: "factory",
          version: integer(row.version, 1),
        };
      }),
      suppliers: [],
      employees: employees.map((row) => ({
        id: text(row.public_key),
        role: text(row.role_name),
        contractType: text(row.contract_type),
        wage: number(row.wage_per_cycle),
        productivity: number(row.productivity_index, 1),
        status: title(text(row.status)),
      })),
      inventory: inventory.map((row) => ({
        itemKey: text(row.item_key),
        kind: text(row.inventory_kind),
        quantity: number(row.quantity),
        unitCost: number(row.unit_cost),
      })),
    };
  }

  async readLoans(input: {
    readonly gameSessionId: string;
    readonly playerId: string;
  }): Promise<LoansSnapshotDto> {
    const [products, loans, profileRows, paymentRows, businesses] = await Promise.all([
      rows(this.client.from("loan_products").select("*")
        .eq("game_session_id", input.gameSessionId).eq("status", "active")
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
    const next = [...active].sort((a, b) => Date.parse(text(a.next_due_at)) - Date.parse(text(b.next_due_at)))[0];
    const eligibleProducts = products.filter((row) => {
      if (integer(row.minimum_credit_score, 550) > creditScore) return false;
      return text(row.borrower_type) !== "business" || businesses.some((business) => ["active", "restructuring"].includes(text(business.status)));
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
            ? Math.max(0, Math.min(100, round(((original - number(row.principal_balance)) / original) * 100, 1)))
            : 0,
          accruedInterest: number(row.accrued_interest),
          businessId: businessKeys.get(text(row.business_id)) ?? null,
        };
      }),
      schedule: active.flatMap((row) => {
        const product = productById.get(text(row.loan_product_id)) ?? {};
        const term = Math.min(integer(product.term_cycles, 1), 24);
        const nextDue = Date.parse(text(row.next_due_at));
        if (!Number.isFinite(nextDue)) return [];
        return Array.from({ length: term }, (_, index) => ({
          cycle: `Cycle ${index + 1}`,
          due: new Date(nextDue + index * 7 * 86_400_000).toISOString(),
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
    if (response.error) {
      throw mapDatabaseError(response.error.message);
    }
    const value = Array.isArray(response.data) ? response.data[0] : response.data;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new PlayerBusinessBankingError(
        "business_banking_result_invalid",
        "The operation completed without a valid result.",
        500,
      );
    }
    return value as Record<string, unknown>;
  }
}

async function rows(builder: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<Row[]> {
  const response = await builder;
  if (response.error) throw mapDatabaseError(response.error.message);
  return Array.isArray(response.data)
    ? response.data.filter((value): value is Row => Boolean(value && typeof value === "object" && !Array.isArray(value)))
    : [];
}

async function maybeRow(builder: { maybeSingle(): PromiseLike<{ data: unknown; error: { message: string } | null }> }): Promise<Row | null> {
  const response = await builder.maybeSingle();
  if (response.error) throw mapDatabaseError(response.error.message);
  return response.data && typeof response.data === "object" && !Array.isArray(response.data)
    ? response.data as Row
    : null;
}

function mapDatabaseError(message: string): PlayerBusinessBankingError {
  const code = message.trim().split(/\s+/u)[0] || "BUSINESS_BANKING_FAILED";
  const mappings: Record<string, [number, string]> = {
    PLAYER_SCOPE_REQUIRED: [401, "Player session scope is required."],
    PLAYER_NOT_FOUND: [404, "Player was not found in this game."],
    RECIPIENT_NOT_FOUND: [404, "Recipient Player ID was not found in this game."],
    SELF_TRANSFER_NOT_ALLOWED: [409, "A player cannot transfer funds to the same account."],
    INSUFFICIENT_FUNDS: [409, "Available funds are insufficient."],
    IDEMPOTENCY_KEY_CONFLICT: [409, "This idempotency key was already used for a different request."],
    BUSINESS_NOT_FOUND: [404, "Business was not found or is not owned by this player."],
    PRODUCT_NOT_FOUND: [404, "Business product was not found."],
    EMPLOYEE_NOT_FOUND: [404, "Business employee was not found."],
    CAPACITY_EXCEEDED: [409, "The production run exceeds available capacity."],
    PRODUCTION_UNAFFORDABLE: [409, "Business funds are insufficient for this production run."],
    INSUFFICIENT_INPUT_INVENTORY: [409, "Business input inventory is insufficient."],
    WAGE_UNAFFORDABLE: [409, "The business cannot afford the proposed wage."],
    LOAN_PRODUCT_NOT_FOUND: [404, "Loan offer was not found."],
    LOAN_NOT_FOUND: [404, "Loan was not found."],
    CREDIT_SCORE_INELIGIBLE: [409, "Current economic behavior does not meet this offer's credit requirement."],
    LOAN_UNAFFORDABLE: [409, "Projected payments exceed the affordability limit."],
    AUTHORITATIVE_BUSINESS_BORROWER_REQUIRED: [409, "An active authoritative business borrower is required."],
    STALE_PRODUCT_VERSION: [409, "Product pricing changed. Reload before retrying."],
    CLOSED_BUSINESS_IMMUTABLE: [409, "A closed business cannot be reopened through this action."],
  };
  const mapped = mappings[code];
  return new PlayerBusinessBankingError(
    code.toLowerCase(),
    mapped?.[1] ?? "The business or banking operation could not be completed.",
    mapped?.[0] ?? 400,
  );
}

function emptyBusiness(): BusinessSnapshotDto {
  return {
    configured: false,
    company: {
      id: "",
      name: "Business not configured",
      registration: "—",
      status: "Unavailable",
      industry: "Not configured",
      headquarters: "Not configured",
      valuation: 0,
      valuationChange: 0,
      cash: 0,
      revenue: 0,
      margin: 0,
      reputation: 0,
      reputationLabel: "No business profile",
      summary: "Create or acquire a business to begin operating.",
    },
    operations: {
      employees: 0,
      output: 0,
      backlog: 0,
      capacityUse: 0,
      maxRun: 0,
      capacityNote: "No production capacity is configured.",
    },
    products: [],
    suppliers: [],
    employees: [],
    inventory: [],
  };
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}
function number(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function integer(value: unknown, fallback = 0): number {
  return Math.trunc(number(value, fallback));
}
function round(value: number, digits = 2): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
function title(value: string): string {
  return value.replace(/[_-]+/gu, " ").replace(/\b\w/gu, (letter) => letter.toUpperCase());
}
function reputationLabel(score: number): string {
  if (score >= 80) return "Trusted operator";
  if (score >= 60) return "Established operator";
  if (score >= 40) return "Developing operator";
  return "At-risk operator";
}
function demandLabel(price: number, reference: number): string {
  const ratio = reference > 0 ? price / reference : 1;
  if (ratio <= 0.85) return "High";
  if (ratio <= 1.15) return "Stable";
  return "Low";
}

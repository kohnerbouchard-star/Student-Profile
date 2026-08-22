import type { EdgeSupabaseClient } from "../../../platform/supabase/edgeStaffSession.ts";
import {
  type BusinessSnapshotDto,
  type BusinessWorkforceSnapshotDto,
  PlayerBusinessError,
  type PlayerBusinessRepository,
  type PlayerEconomicContext,
} from "../contracts/playerBusinessContracts.ts";
import { parseBusinessWorkforceSnapshot } from "../application/workforce/businessWorkforceResultParser.ts";

type Row = Record<string, unknown>;

export class SupabasePlayerBusinessRepository implements PlayerBusinessRepository {
  constructor(private readonly client: EdgeSupabaseClient) {}

  async readEconomicContext(input: {
    readonly gameSessionId: string;
    readonly playerId: string;
  }): Promise<PlayerEconomicContext> {
    const context = await rpcMaybeRow(this.client, "resolve_player_economic_context_v1", {
      p_game_session_id: input.gameSessionId,
      p_player_id: input.playerId,
    });
    const countryCode = text(context?.country_code).toUpperCase();
    const currencyCode = text(context?.currency_code).toUpperCase();
    if (!countryCode || !currencyCode) {
      throw new PlayerBusinessError(
        "player_economic_context_missing",
        "Player country and currency must be assigned before this action.",
        409,
      );
    }
    return { countryCode, currencyCode };
  }

  async assertBusinessCreationAllowed(input: {
    readonly gameSessionId: string;
    readonly playerId: string;
    readonly idempotencyKey: string;
  }): Promise<void> {
    const replayRows = await rows(
      this.client.from("audit_log")
        .select("id")
        .eq("game_session_id", input.gameSessionId)
        .eq("actor_id", input.playerId)
        .eq("action", "business.create_or_acquire")
        .eq("metadata->>idempotency_key", input.idempotencyKey)
        .limit(1),
    );
    if (replayRows.length === 1) return;

    const ownedBusinesses = (await rows(
      this.client.from("business_entities").select("id,status,created_at")
        .eq("game_session_id", input.gameSessionId)
        .eq("owner_player_id", input.playerId)
        .order("created_at", { ascending: true }),
    )).filter((row) => text(row.status) !== "closed");
    if (ownedBusinesses.length > 1) {
      throw new PlayerBusinessError(
        "business_ownership_ambiguous",
        "Multiple open businesses are owned by this player. Resolve ownership before continuing.",
        409,
      );
    }
    if (ownedBusinesses.length === 1) {
      throw new PlayerBusinessError(
        "business_already_owned",
        "Close the current business before creating or acquiring another one.",
        409,
      );
    }
  }

  async readBusiness(input: {
    readonly gameSessionId: string;
    readonly playerId: string;
  }): Promise<BusinessSnapshotDto> {
    const ownedBusinesses = (await rows(
      this.client.from("business_entities").select("*")
        .eq("game_session_id", input.gameSessionId)
        .eq("owner_player_id", input.playerId)
        .order("created_at", { ascending: true }),
    )).filter((row) => text(row.status) !== "closed");
    if (ownedBusinesses.length > 1) {
      throw new PlayerBusinessError(
        "business_ownership_ambiguous",
        "Multiple open businesses are owned by this player. Resolve ownership before continuing.",
        409,
      );
    }
    const business = ownedBusinesses[0];
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
    const cash = number(balanceRows.find((row) => text(row.account_type) === businessAccount)?.balance);
    const completedOutput = runs.filter((row) => text(row.status) === "completed")
      .reduce((sum, row) => sum + number(row.output_quantity), 0);
    const finished = inventory.filter((row) => text(row.inventory_kind) === "finished_good")
      .reduce((sum, row) => sum + number(row.quantity), 0);
    const activeEmployees = employees.filter((row) => text(row.status) === "active");
    const capacity = Math.max(0, number(business.capacity_units, 100));
    const latestOutput = runs.length ? number(runs[0].output_quantity) : 0;
    const capacityUse = capacity > 0 ? Math.min(100, Math.round((latestOutput / capacity) * 100)) : 0;
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

  async readWorkforceCandidates(input: {
    readonly gameSessionId: string;
    readonly playerId: string;
  }): Promise<BusinessWorkforceSnapshotDto> {
    const response = await this.client.rpc<unknown>(
      "read_owned_business_workforce_candidates_v2",
      {
        p_game_session_id: input.gameSessionId,
        p_player_id: input.playerId,
      },
    );
    if (response.error) throw mapDatabaseError(response.error.message);
    return parseBusinessWorkforceSnapshot(response.data);
  }

  async execute(
    command: string,
    args: Readonly<Record<string, unknown>>,
  ): Promise<Record<string, unknown>> {
    const response = await this.client.rpc<unknown>(command, args);
    if (response.error) throw mapDatabaseError(response.error.message);
    const value = Array.isArray(response.data) ? response.data[0] : response.data;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new PlayerBusinessError(
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
    throw new PlayerBusinessError("business_banking_result_invalid", "The operation completed without a valid result.", 500);
  }
  return value as Row;
}

function mapDatabaseError(message: string): PlayerBusinessError {
  const code = message.trim().split(/\s+/u)[0] || "BUSINESS_FAILED";
  const mappings: Record<string, [number, string, boolean?]> = {
    PLAYER_SCOPE_REQUIRED: [401, "Player session scope is required."],
    PLAYER_NOT_FOUND: [404, "Player was not found in this game."],
    PLAYER_ECONOMIC_CONTEXT_REQUIRED: [409, "Player country and currency must be assigned first."],
    BUSINESS_NOT_FOUND: [404, "Business was not found or is not owned by this player."],
    PRODUCT_NOT_FOUND: [404, "Business product was not found."],
    EMPLOYEE_NOT_FOUND: [404, "Business employee was not found."],
    CAPACITY_EXCEEDED: [409, "The production run exceeds available capacity."],
    PRODUCTION_UNAFFORDABLE: [409, "Business funds are insufficient for this production run."],
    INSUFFICIENT_INPUT_INVENTORY: [409, "Business input inventory is insufficient."],
    WAGE_UNAFFORDABLE: [409, "The business cannot afford the proposed wage."],
    STALE_PRODUCT_VERSION: [409, "Product pricing changed. Reload before retrying."],
    CLOSED_BUSINESS_IMMUTABLE: [409, "A closed business cannot be reopened through this action."],
    IDEMPOTENCY_KEY_CONFLICT: [409, "This idempotency key was already used for a different request."],
    BUSINESS_ALREADY_OWNED: [409, "Close the current business before creating or acquiring another one."],
    BUSINESS_FORMATION_ALREADY_PENDING: [409, "A Business formation is already awaiting completion."],
    BUSINESS_PROPOSED_OWNER_NOT_FOUND: [404, "A proposed Business owner was not found in this game."],
    BUSINESS_FORMATION_NOT_FOUND: [404, "Business formation was not found."],
    BUSINESS_FORMATION_OWNER_REQUIRED: [403, "Only a proposed owner may respond to this formation."],
    BUSINESS_FORMATION_OWNER_ALREADY_RESPONDED: [409, "This proposed owner already responded."],
    BUSINESS_FORMATION_NOT_AWAITING_APPROVAL: [409, "This formation is not awaiting owner approval."],
    BUSINESS_FORMATION_PROPOSER_REQUIRED: [403, "Only the formation proposer may activate this Business."],
    BUSINESS_FORMATION_NOT_READY_FOR_CAPITALIZATION: [409, "This formation is not ready for capitalization."],
    BUSINESS_FORMATION_UNANIMOUS_APPROVAL_REQUIRED: [409, "All proposed owners must approve before activation."],
    BUSINESS_FORMATION_INSUFFICIENT_OWNER_FUNDS: [409, "One or more owners do not have enough funds for the agreed contribution."],
    BUSINESS_OWNERSHIP_AMBIGUOUS: [409, "Multiple open Businesses are associated with this Player."],
    BUSINESS_NOT_ACTIVE: [409, "The Business must be active before hiring."],
    BUSINESS_WORKFORCE_CANDIDATE_KEY_INVALID: [400, "Workforce candidate key is invalid."],
    BUSINESS_WORKFORCE_CANDIDATE_NOT_FOUND: [404, "Workforce candidate was not found."],
    BUSINESS_WORKFORCE_CANDIDATE_NOT_AVAILABLE: [409, "Workforce candidate is no longer available."],
    BUSINESS_WORKFORCE_CANDIDATE_EXPIRED: [409, "Workforce candidate availability has expired."],
    BUSINESS_WORKFORCE_CANDIDATE_COUNTRY_MISMATCH: [409, "Workforce candidate is not available in the Business country."],
    BUSINESS_WORKFORCE_CANDIDATE_CURRENCY_MISMATCH: [409, "Workforce candidate wage currency does not match the Business."],
    BUSINESS_WORKFORCE_ROLE_NOT_ACTIVE: [409, "The workforce role is not active."],
    BUSINESS_WORKFORCE_PLAYER_ALREADY_EMPLOYED: [409, "This candidate is already actively employed by the Business."],
    BUSINESS_OWNER_CANNOT_HIRE_SELF: [409, "The Business owner cannot hire themselves through the candidate market."],
    BUSINESS_WORKFORCE_HIRE_CONFLICT: [409, "The workforce candidate was hired by another request."],
    BUSINESS_WORKFORCE_HIRE_REPLAY_MISSING: [500, "Workforce hire replay evidence is incomplete.", true],
    STORE_ITEM_KEY_INVALID: [400, "Store item key is invalid."],
    STORE_QUOTE_QUANTITY_INVALID: [400, "Store quote quantity is invalid."],
    IDEMPOTENCY_KEY_REQUIRED: [400, "A valid idempotency key is required."],
    STORE_ITEM_NOT_FOUND: [404, "Store item is not available."],
    BUSINESS_COUNTRY_PROFILE_NOT_FOUND: [409, "The Business country is not configured for Store pricing."],
    BUSINESS_CURRENCY_MISMATCH: [409, "The Business currency does not match this procurement quote."],
    COUNTRY_PROFILE_NOT_FOUND: [409, "The Business country is not configured for Store pricing."],
    COUNTRY_SNAPSHOT_NOT_FOUND: [409, "A current country economic snapshot is required for Store pricing."],
    STORE_QUOTE_CURRENCY_INVALID: [409, "The Business settlement currency is invalid."],
    INSUFFICIENT_STOCK: [409, "Store stock is insufficient for this purchase."],
    QUOTE_NOT_FOUND: [404, "Business Store quote was not found."],
    QUOTE_NOT_USABLE: [409, "Business Store quote can no longer be used."],
    QUOTE_EXPIRED: [409, "Business Store quote has expired."],
    INSUFFICIENT_BUSINESS_BALANCE: [409, "Business cash is insufficient for this purchase."],
    ITEM_CANONICAL_CONTEXT_UNAVAILABLE: [409, "Store item is not connected to canonical inventory."],
    BUSINESS_STOCKROOM_COST_CURRENCY_MISMATCH: [409, "Existing Stockroom cost basis uses another currency."],
    INVENTORY_POSTING_RESULT_MISSING: [500, "Canonical inventory settlement did not produce a Stockroom result.", true],
    IDEMPOTENCY_IN_PROGRESS: [409, "This Business Store purchase is still processing.", true],
    GAME_SESSION_DISABLED: [409, "Business Store purchases are paused for this game.", true],
    GAME_SESSION_ARCHIVED: [409, "Business Store purchases are closed because this game has ended."],
    GAME_SESSION_NOT_ACTIVE: [409, "Business Store purchases are unavailable for this game."],
    GAME_SESSION_NOT_FOUND: [409, "Business Store purchases are unavailable for this game."],
  };
  const mapped = mappings[code];
  return new PlayerBusinessError(
    code.toLowerCase(),
    mapped?.[1] ?? "The business operation could not be completed.",
    mapped?.[0] ?? 400,
    mapped?.[2] ?? false,
  );
}

function emptyBusiness(): BusinessSnapshotDto {
  return {
    configured: false,
    company: {
      id: "", name: "Business not configured", registration: "—", status: "Unavailable",
      industry: "Not configured", headquarters: "Not configured", valuation: 0,
      valuationChange: 0, cash: 0, revenue: 0, margin: 0, reputation: 0,
      reputationLabel: "No business profile", summary: "Create or acquire a business to begin operating.",
    },
    operations: {
      employees: 0, output: 0, backlog: 0, capacityUse: 0, maxRun: 0,
      capacityNote: "No production capacity is configured.",
    },
    products: [], suppliers: [], employees: [], inventory: [],
  };
}

function text(value: unknown, defaultValue = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : defaultValue;
}
function number(value: unknown, defaultValue = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}
function integer(value: unknown, defaultValue = 0): number { return Math.trunc(number(value, defaultValue)); }
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

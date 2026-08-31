import type { EdgeSupabaseClient } from "../../../platform/supabase/edgeStaffSession.ts";
import {
  type BusinessSnapshotDto,
  type BusinessWorkforceSnapshotDto,
  PlayerBusinessError,
  type PlayerBusinessRepository,
  type PlayerEconomicContext,
} from "../contracts/playerBusinessContracts.ts";
import {
  parseBusinessWorkforceSnapshot,
  parseBusinessWorkforceUtilization,
} from "../application/workforce/businessWorkforceResultParser.ts";
import {
  type BusinessRepositoryRow,
  emptyBusinessStoreSales,
  projectBusinessStoreSalesSnapshot as businessStoreSalesSnapshot,
} from "./supabasePlayerBusinessStoreSalesProjection.ts";
import { mapPlayerBusinessDatabaseError } from "./playerBusinessDatabaseErrors.ts";

export class SupabasePlayerBusinessRepository
  implements PlayerBusinessRepository {
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
    const [
      products,
      employees,
      inventory,
      runs,
      balanceRows,
      utilization,
      storeReceiptRows,
      storeActivityRows,
    ] = await Promise.all([
      rows(
        this.client.from("business_products").select("*")
          .eq("game_session_id", input.gameSessionId).eq(
            "business_id",
            businessId,
          )
          .order("created_at", { ascending: true }),
      ),
      rows(
        this.client.from("business_employees").select("*")
          .eq("game_session_id", input.gameSessionId).eq(
            "business_id",
            businessId,
          )
          .order("hired_at", { ascending: true }),
      ),
      rows(
        this.client.from("business_inventory").select("*")
          .eq("game_session_id", input.gameSessionId).eq(
            "business_id",
            businessId,
          )
          .order("item_key", { ascending: true }),
      ),
      rows(
        this.client.from("business_production_runs").select("*")
          .eq("game_session_id", input.gameSessionId).eq(
            "business_id",
            businessId,
          )
          .order("created_at", { ascending: false }).limit(100),
      ),
      rows(
        this.client.from("account_balances").select("*")
          .eq("game_session_id", input.gameSessionId).eq(
            "player_id",
            input.playerId,
          ),
      ),
      rpcMaybeRow(this.client, "read_owned_business_workforce_utilization_v2", {
        p_game_session_id: input.gameSessionId,
        p_player_id: input.playerId,
      }),
      rows(
        this.client.from("store_offer_purchase_receipts")
          .select(
            "public_key,quote_key,offer_key,store_item_key,quantity,gross_revenue,cost_of_goods_sold,gross_margin,currency_code,completed_at",
          )
          .eq("game_session_id", input.gameSessionId).eq(
            "business_id",
            businessId,
          )
          .order("completed_at", { ascending: false }).limit(50),
      ),
      rows(
        this.client.from("business_activity_events")
          .select("public_key,event_type,reason_code,metadata,occurred_at")
          .eq("game_session_id", input.gameSessionId).eq(
            "business_id",
            businessId,
          )
          .eq("event_type", "business.store.sale.completed")
          .order("occurred_at", { ascending: false }).limit(50),
      ),
    ]);

    const businessAccount = `business:${
      text(business.public_key).toLowerCase()
    }`;
    const cash = number(
      balanceRows.find((row) => text(row.account_type) === businessAccount)
        ?.balance,
    );
    const completedOutput = runs.filter((row) =>
      text(row.status) === "completed"
    )
      .reduce((sum, row) => sum + number(row.output_quantity), 0);
    const finished = inventory.filter((row) =>
      text(row.inventory_kind) === "finished_good"
    )
      .reduce((sum, row) => sum + number(row.quantity), 0);
    const activeEmployees = employees.filter((row) =>
      text(row.status) === "active"
    );
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
        summary: `Ledger-backed ${
          title(text(business.entity_type))
        } operating in ${text(business.country_code)}.`,
      },
      operations: {
        employees: activeEmployees.length,
        output: completedOutput,
        backlog: Math.round(finished),
        capacityUse,
        maxRun: Math.max(
          0,
          Math.floor(
            capacity * activeEmployees.reduce(
              (sum, row) => sum + number(row.productivity_index, 1),
              activeEmployees.length ? 0 : 1,
            ),
          ),
        ),
        capacityNote: capacityUse >= 90
          ? "Capacity is constrained. Additional labor or equipment may be required."
          : "Capacity remains within the reviewed operating range.",
      },
      products: products.filter((row) => text(row.status) !== "retired").map(
        (row) => {
          const price = number(row.unit_price);
          const cost = number(row.unit_input_cost) +
            number(row.unit_labor_cost);
          return {
            id: text(row.public_key),
            category: title(text(row.category, "general")),
            name: text(row.name, "Unnamed product"),
            description: `${number(row.quality_score, 50)}/100 quality · ${
              number(row.base_demand_units)
            } baseline demand`,
            price,
            margin: price > 0 ? round(((price - cost) / price) * 100, 1) : 0,
            demand: demandLabel(price, number(row.reference_price, price)),
            icon: "factory",
            version: integer(row.version, 1),
          };
        },
      ),
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
      storeSales: businessStoreSalesSnapshot(
        text(business.public_key),
        text(business.currency_code).toUpperCase(),
        storeReceiptRows,
        storeActivityRows,
      ),
      workforceUtilization: utilization
        ? parseBusinessWorkforceUtilization(utilization)
        : null,
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
    if (response.error) {
      throw mapPlayerBusinessDatabaseError(response.error.message);
    }
    return parseBusinessWorkforceSnapshot(response.data);
  }

  async execute(
    command: string,
    args: Readonly<Record<string, unknown>>,
  ): Promise<Record<string, unknown>> {
    const response = await this.client.rpc<unknown>(command, args);
    if (response.error) {
      throw mapPlayerBusinessDatabaseError(response.error.message);
    }
    const value = Array.isArray(response.data)
      ? response.data[0]
      : response.data;
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

async function rows(
  builder: PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<BusinessRepositoryRow[]> {
  const response = await builder;
  if (response.error) {
    throw mapPlayerBusinessDatabaseError(response.error.message);
  }
  return Array.isArray(response.data)
    ? response.data.filter((value): value is BusinessRepositoryRow =>
      Boolean(value && typeof value === "object" && !Array.isArray(value))
    )
    : [];
}

async function rpcMaybeRow(
  client: EdgeSupabaseClient,
  command: string,
  args: Readonly<Record<string, unknown>>,
): Promise<BusinessRepositoryRow | null> {
  const response = await client.rpc<unknown>(command, args);
  if (response.error) {
    throw mapPlayerBusinessDatabaseError(response.error.message);
  }
  const value = Array.isArray(response.data) ? response.data[0] : response.data;
  if (value === null || value === undefined) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new PlayerBusinessError(
      "business_banking_result_invalid",
      "The operation completed without a valid result.",
      500,
    );
  }
  return value as BusinessRepositoryRow;
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
    storeSales: emptyBusinessStoreSales("", ""),
    workforceUtilization: null,
  };
}

function text(value: unknown, defaultValue = ""): string {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : defaultValue;
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
  return value.replace(/[_-]+/gu, " ").replace(
    /\b\w/gu,
    (letter) => letter.toUpperCase(),
  );
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

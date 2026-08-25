import {
  PLAYER_STORE_OFFER_KEY_PATTERN,
  type PlayerStoreOfferPublicBusinessIdentity,
  type PlayerStoreOfferPublicScope,
} from "../contracts/playerStoreOfferPublicContracts.ts";
import { playerStoreOfferUnavailable } from "./playerStoreOfferPublicRepositoryErrors.ts";

interface QueryError {
  readonly message?: string;
  readonly code?: string;
}

export interface PlayerStoreOfferQueryResponse<T> {
  readonly data: T | null;
  readonly error: QueryError | null;
}

export interface PlayerStoreOfferQuery
  extends PromiseLike<PlayerStoreOfferQueryResponse<unknown>> {
  select(selection: string): PlayerStoreOfferQuery;
  eq(column: string, value: unknown): PlayerStoreOfferQuery;
  in(column: string, values: readonly unknown[]): PlayerStoreOfferQuery;
  maybeSingle(): PlayerStoreOfferQuery;
}

export interface PlayerStoreOfferClient {
  from(table: string): PlayerStoreOfferQuery;
  rpc<T = unknown>(
    functionName: string,
    args: Record<string, unknown>,
  ): PromiseLike<PlayerStoreOfferQueryResponse<T>>;
}

interface BusinessIdentityRelationRow {
  readonly id?: unknown;
  readonly public_key?: unknown;
  readonly legal_name?: unknown;
  readonly owner_player_id?: unknown;
  readonly status?: unknown;
  readonly currency_code?: unknown;
}

interface BusinessPartyIdentityRow {
  readonly public_key?: unknown;
  readonly business?:
    | BusinessIdentityRelationRow
    | readonly BusinessIdentityRelationRow[]
    | null;
}

interface PlayerCountryAssignmentRow {
  readonly country_profile_id?: unknown;
}

interface CountryProfileRow {
  readonly currency_code?: unknown;
}

interface StoreOfferCustodyRow {
  readonly public_key?: unknown;
  readonly inventory_account_id?: unknown;
  readonly game_item_id?: unknown;
}

interface InventoryHoldingReservationRow {
  readonly inventory_account_id?: unknown;
  readonly game_item_id?: unknown;
  readonly quantity_reserved?: unknown;
}

interface BusinessOwnershipPositionRow {
  readonly business_id?: unknown;
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const IDENTITY_KEY = {
  business: /^biz_[0-9a-f]{32}$/u,
  party: /^pty_[0-9a-f]{32}$/u,
} as const;

const BUSINESS_IDENTITY_SELECTION =
  "public_key,business:business_entities!economic_parties_business_scope_fk(id,public_key,legal_name,owner_player_id,status,currency_code)";

export class PlayerStoreOfferPublicReadStore {
  constructor(private readonly client: PlayerStoreOfferClient) {}

  async requireBusinessIdentity(
    gameSessionId: string,
    sellerPartyKey: string,
    businessKey: string,
    options: { readonly requireActive?: boolean } = {},
  ): Promise<PlayerStoreOfferPublicBusinessIdentity> {
    const identities = await this.readBusinessIdentities(
      gameSessionId,
      [sellerPartyKey],
      options,
    );
    const identity = identities.get(sellerPartyKey);
    if (!identity || identity.businessKey !== businessKey) {
      throw identityUnavailable();
    }
    return identity;
  }

  async readBuyerCurrencyCode(
    scope: PlayerStoreOfferPublicScope,
  ): Promise<string> {
    const assignmentResponse = await this.client
      .from("player_country_assignments")
      .select("country_profile_id")
      .eq("game_session_id", scope.gameSessionId)
      .eq("player_id", scope.playerId)
      .eq("status", "active")
      .maybeSingle() as PlayerStoreOfferQueryResponse<
        PlayerCountryAssignmentRow
      >;
    if (assignmentResponse.error || !assignmentResponse.data) {
      throw new Error("Buyer country assignment is unavailable");
    }
    const countryProfileId = requireUuid(
      assignmentResponse.data.country_profile_id,
      "countryProfileId",
    );
    const profileResponse = await this.client
      .from("country_profiles")
      .select("currency_code")
      .eq("id", countryProfileId)
      .eq("status", "active")
      .maybeSingle() as PlayerStoreOfferQueryResponse<CountryProfileRow>;
    if (profileResponse.error || !profileResponse.data) {
      throw new Error("Buyer country currency is unavailable");
    }
    return requireCurrencyCode(profileResponse.data.currency_code);
  }

  async readUnreservedBusinessOfferKeys(
    gameSessionId: string,
    offerKeys: readonly string[],
  ): Promise<ReadonlySet<string>> {
    if (offerKeys.length === 0) return new Set();
    const offerResponse = await this.client
      .from("store_seller_offers")
      .select("public_key,inventory_account_id,game_item_id")
      .eq("game_session_id", gameSessionId)
      .eq("seller_kind", "business")
      .eq("status", "active")
      .in("public_key", offerKeys) as PlayerStoreOfferQueryResponse<
        StoreOfferCustodyRow[]
      >;
    if (offerResponse.error || !Array.isArray(offerResponse.data)) {
      throw new Error("Store offer custody is unavailable");
    }

    const expectedOfferKeys = new Set(offerKeys);
    const custodyByPair = new Map<
      string,
      { readonly offerKey: string; readonly accountId: string }
    >();
    const accountIds = new Set<string>();
    for (const row of offerResponse.data) {
      const offerKey = requirePattern(
        row.public_key,
        PLAYER_STORE_OFFER_KEY_PATTERN,
        "offerKey",
      );
      const accountId = requireUuid(
        row.inventory_account_id,
        "inventoryAccountId",
      );
      const gameItemId = requireUuid(row.game_item_id, "gameItemId");
      const pairKey = `${accountId}:${gameItemId}`;
      if (
        !expectedOfferKeys.has(offerKey) || accountIds.has(accountId) ||
        custodyByPair.has(pairKey)
      ) {
        throw new Error("Store offer custody is invalid");
      }
      accountIds.add(accountId);
      custodyByPair.set(pairKey, { offerKey, accountId });
    }
    if (custodyByPair.size !== expectedOfferKeys.size) {
      throw new Error("Store offer custody is incomplete");
    }

    const holdingResponse = await this.client
      .from("inventory_holdings")
      .select("inventory_account_id,game_item_id,quantity_reserved")
      .eq("game_session_id", gameSessionId)
      .in(
        "inventory_account_id",
        [...accountIds].sort(),
      ) as PlayerStoreOfferQueryResponse<InventoryHoldingReservationRow[]>;
    if (holdingResponse.error || !Array.isArray(holdingResponse.data)) {
      throw new Error("Store offer reservation state is unavailable");
    }

    const seenPairs = new Set<string>();
    const unreservedOfferKeys = new Set<string>();
    for (const row of holdingResponse.data) {
      const accountId = requireUuid(
        row.inventory_account_id,
        "inventoryAccountId",
      );
      const gameItemId = requireUuid(row.game_item_id, "gameItemId");
      const pairKey = `${accountId}:${gameItemId}`;
      const custody = custodyByPair.get(pairKey);
      if (!custody || seenPairs.has(pairKey)) {
        throw new Error("Store offer reservation state is invalid");
      }
      seenPairs.add(pairKey);
      if (
        requireNonnegativeInteger(
          row.quantity_reserved,
          "quantityReserved",
        ) === 0
      ) {
        unreservedOfferKeys.add(custody.offerKey);
      }
    }
    if (seenPairs.size !== custodyByPair.size) {
      throw new Error("Store offer reservation state is incomplete");
    }
    return unreservedOfferKeys;
  }

  async readBuyerOwnedBusinessIds(
    scope: PlayerStoreOfferPublicScope,
    businessIds: readonly string[],
  ): Promise<ReadonlySet<string>> {
    if (businessIds.length === 0) return new Set();
    const expectedBusinessIds = new Set(businessIds);
    if (expectedBusinessIds.size !== businessIds.length) {
      throw new Error("Store offer Business identity is invalid");
    }
    const response = await this.client
      .from("business_ownership_positions")
      .select("business_id")
      .eq("game_session_id", scope.gameSessionId)
      .eq("player_id", scope.playerId)
      .eq("status", "active")
      .in(
        "business_id",
        [...expectedBusinessIds].sort(),
      ) as PlayerStoreOfferQueryResponse<BusinessOwnershipPositionRow[]>;
    if (response.error || !Array.isArray(response.data)) {
      throw new Error("Buyer Business ownership is unavailable");
    }
    const ownedBusinessIds = new Set<string>();
    for (const row of response.data) {
      const businessId = requireUuid(row.business_id, "businessId");
      if (
        !expectedBusinessIds.has(businessId) ||
        ownedBusinessIds.has(businessId)
      ) {
        throw new Error("Buyer Business ownership is invalid");
      }
      ownedBusinessIds.add(businessId);
    }
    return ownedBusinessIds;
  }

  async readBusinessIdentities(
    gameSessionId: string,
    sellerPartyKeys: readonly string[],
    options: { readonly requireActive?: boolean } = {},
  ): Promise<ReadonlyMap<string, PlayerStoreOfferPublicBusinessIdentity>> {
    if (sellerPartyKeys.length === 0) return new Map();

    let query = this.client
      .from("economic_parties")
      .select(BUSINESS_IDENTITY_SELECTION)
      .eq("game_session_id", gameSessionId)
      .eq("party_kind", "business");
    if (options.requireActive !== false) {
      query = query.eq("status", "active");
    }
    const response = await query.in(
      "public_key",
      sellerPartyKeys,
    ) as PlayerStoreOfferQueryResponse<BusinessPartyIdentityRow[]>;
    if (response.error || !Array.isArray(response.data)) {
      throw identityUnavailable();
    }

    const expected = new Set(sellerPartyKeys);
    const identities = new Map<
      string,
      PlayerStoreOfferPublicBusinessIdentity
    >();
    for (const row of response.data) {
      const sellerPartyKey = requirePattern(
        row.public_key,
        IDENTITY_KEY.party,
        "sellerPartyKey",
      );
      if (!expected.has(sellerPartyKey) || identities.has(sellerPartyKey)) {
        throw identityUnavailable();
      }
      const relation = Array.isArray(row.business)
        ? row.business.length === 1 ? row.business[0] : null
        : row.business;
      if (!relation) throw identityUnavailable();
      identities.set(sellerPartyKey, {
        sellerPartyKey,
        businessId: requireUuid(relation.id, "businessId"),
        businessKey: requirePattern(
          relation.public_key,
          IDENTITY_KEY.business,
          "businessKey",
        ),
        businessName: requireText(relation.legal_name, "businessName"),
        ownerPlayerId: requireUuid(
          relation.owner_player_id,
          "ownerPlayerId",
        ),
        businessStatus: requireBusinessStatus(relation.status),
        currencyCode: requireCurrencyCode(relation.currency_code),
      });
    }
    if (identities.size !== expected.size) throw identityUnavailable();
    return identities;
  }
}

function identityUnavailable() {
  return playerStoreOfferUnavailable(
    "player_store_offer_identity_failed",
    "Store offer seller identity could not be loaded.",
  );
}

function requirePattern(
  value: unknown,
  pattern: RegExp,
  label: string,
): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!pattern.test(text)) throw new Error(`${label} is invalid`);
  return text;
}

function requireText(value: unknown, label: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > 120) throw new Error(`${label} is invalid`);
  return text;
}

function requireUuid(value: unknown, label: string): string {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!UUID.test(text)) throw new Error(`${label} is invalid`);
  return text;
}

function requireBusinessStatus(
  value: unknown,
): PlayerStoreOfferPublicBusinessIdentity["businessStatus"] {
  const status = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (
    status !== "active" && status !== "restructuring" &&
    status !== "distressed" && status !== "closed"
  ) {
    throw new Error("businessStatus is invalid");
  }
  return status;
}

function requireCurrencyCode(value: unknown): string {
  const currencyCode = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Z0-9_]{3,16}$/u.test(currencyCode)) {
    throw new Error("currencyCode is invalid");
  }
  return currencyCode;
}

function requireNonnegativeInteger(value: unknown, label: string): number {
  const parsed = typeof value === "number" || typeof value === "string"
    ? Number(value)
    : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${label} is invalid`);
  }
  return parsed;
}

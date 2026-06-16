import {
  normalizeMaybeQueryRow,
  normalizeQueryRows,
  normalizeRequiredQueryRow,
  SupabaseRepositoryError,
  type SupabaseRepositoryClient,
  type SupabaseRpcClient,
} from "../../../supabase/queryResult";
import {
  mapEntitlementRow,
  mapPurchaseCodeRow,
  type CoreSupabaseFunctions,
  type CoreSupabaseTables,
  type EntitlementInsert,
  type EntitlementRecord,
  type JsonObject,
  type PurchaseCodeRecord,
  type RedeemPurchaseCodeForGameRpcRow,
} from "../../../supabase/tableTypes";

type LicensingRepositoryTables = Pick<
  CoreSupabaseTables,
  "purchase_codes" | "entitlements"
>;

export type SupabaseLicensingRepositoryClient =
  SupabaseRepositoryClient<LicensingRepositoryTables>;

type LicensingActivationFunctions = Pick<
  CoreSupabaseFunctions,
  "redeem_purchase_code_for_game"
>;

export type SupabaseLicensingActivationRepositoryClient =
  SupabaseLicensingRepositoryClient &
    SupabaseRpcClient<LicensingActivationFunctions>;

export type MarkPurchaseCodeRedeemedStatus = "active" | "exhausted";

export interface MarkPurchaseCodeRedeemedInput {
  readonly purchaseCodeId: string;
  readonly expectedRedeemedCount: number;
  readonly nextRedeemedCount: number;
  readonly nextStatus: MarkPurchaseCodeRedeemedStatus;
}

export interface RedeemPurchaseCodeForGameRpcInput {
  readonly staffUserId: string;
  readonly purchaseCodeHash: string;
  readonly gameName: string;
  readonly gameSettings?: JsonObject;
  readonly requestMetadata?: JsonObject;
}

export interface LicensingActivationRepository {
  redeemPurchaseCodeForGame(
    input: RedeemPurchaseCodeForGameRpcInput,
  ): Promise<RedeemPurchaseCodeForGameRpcRow>;
}

export interface LicensingRepository {
  findPurchaseCodeByHash(codeHash: string): Promise<PurchaseCodeRecord | null>;
  markPurchaseCodeRedeemed(
    input: MarkPurchaseCodeRedeemedInput,
  ): Promise<PurchaseCodeRecord | null>;
  createEntitlement(input: EntitlementInsert): Promise<EntitlementRecord>;
}

export const PURCHASE_CODE_REDEMPTION_COLUMNS =
  "id,code_hash,status,max_redemptions,redeemed_count,expires_at,created_at,updated_at";

export const ENTITLEMENT_CREATION_COLUMNS =
  "id,purchase_code_id,staff_user_id,game_session_id,status,created_at,updated_at";

export const LICENSING_ACTIVATION_RPC_NAME =
  "redeem_purchase_code_for_game";

export function createSupabaseLicensingRepository(
  client: SupabaseLicensingRepositoryClient,
): LicensingRepository {
  return {
    findPurchaseCodeByHash: (codeHash) => findPurchaseCodeByHash(client, codeHash),
    markPurchaseCodeRedeemed: (input) =>
      markPurchaseCodeRedeemed(client, input),
    createEntitlement: (input) => createEntitlement(client, input),
  };
}

export function createSupabaseLicensingActivationRepository(
  client: SupabaseLicensingActivationRepositoryClient,
): LicensingActivationRepository {
  return {
    redeemPurchaseCodeForGame: (input) =>
      redeemPurchaseCodeForGame(client, input),
  };
}

export async function findPurchaseCodeByHash(
  client: SupabaseLicensingRepositoryClient,
  codeHash: string,
): Promise<PurchaseCodeRecord | null> {
  const normalizedCodeHash = codeHash.trim();

  if (!normalizedCodeHash) {
    return null;
  }

  const response = await client
    .from("purchase_codes")
    .select(PURCHASE_CODE_REDEMPTION_COLUMNS)
    .eq("code_hash", normalizedCodeHash)
    .limit(1)
    .maybeSingle();

  const row = normalizeMaybeQueryRow(response, {
    tableName: "purchase_codes",
    operation: "find purchase code by hash",
  });

  return row ? mapPurchaseCodeRow(row) : null;
}

export async function markPurchaseCodeRedeemed(
  client: SupabaseLicensingRepositoryClient,
  input: MarkPurchaseCodeRedeemedInput,
): Promise<PurchaseCodeRecord | null> {
  const response = await client
    .from("purchase_codes")
    .update({
      redeemed_count: input.nextRedeemedCount,
      status: input.nextStatus,
    })
    .eq("id", input.purchaseCodeId)
    .eq("status", "active")
    .eq("redeemed_count", input.expectedRedeemedCount)
    .select(PURCHASE_CODE_REDEMPTION_COLUMNS)
    .maybeSingle();

  const row = normalizeMaybeQueryRow(response, {
    tableName: "purchase_codes",
    operation: "mark purchase code redeemed",
  });

  return row ? mapPurchaseCodeRow(row) : null;
}

export async function createEntitlement(
  client: SupabaseLicensingRepositoryClient,
  input: EntitlementInsert,
): Promise<EntitlementRecord> {
  const response = await client
    .from("entitlements")
    .insert({
      purchase_code_id: input.purchase_code_id,
      staff_user_id: input.staff_user_id,
      game_session_id: input.game_session_id,
      status: input.status ?? "active",
    })
    .select(ENTITLEMENT_CREATION_COLUMNS)
    .single();

  const row = normalizeRequiredQueryRow(response, {
    tableName: "entitlements",
    operation: "create entitlement",
  });

  return mapEntitlementRow(row);
}

export async function redeemPurchaseCodeForGame(
  client: SupabaseLicensingActivationRepositoryClient,
  input: RedeemPurchaseCodeForGameRpcInput,
): Promise<RedeemPurchaseCodeForGameRpcRow> {
  const response = await client.rpc(LICENSING_ACTIVATION_RPC_NAME, {
    p_staff_user_id: input.staffUserId,
    p_purchase_code_hash: input.purchaseCodeHash,
    p_game_name: input.gameName,
    p_game_settings: input.gameSettings ?? {},
    p_request_metadata: input.requestMetadata ?? {},
  });

  const rows = normalizeQueryRows(response, {
    tableName: LICENSING_ACTIVATION_RPC_NAME,
    operation: "redeem purchase code for game",
  });

  const activationResult = rows[0];

  if (!activationResult) {
    throw new SupabaseRepositoryError(
      {
        tableName: LICENSING_ACTIVATION_RPC_NAME,
        operation: "redeem purchase code for game",
      },
      {
        message: "Expected activation result row, but Supabase returned no data.",
      },
    );
  }

  return activationResult;
}

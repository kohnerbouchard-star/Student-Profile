import {
  normalizeMaybeQueryRow,
  normalizeRequiredQueryRow,
  type SupabaseRepositoryClient,
} from "../../../supabase/queryResult";
import {
  mapEntitlementRow,
  mapPurchaseCodeRow,
  type CoreSupabaseTables,
  type EntitlementInsert,
  type EntitlementRecord,
  type PurchaseCodeRecord,
} from "../../../supabase/tableTypes";

type LicensingRepositoryTables = Pick<
  CoreSupabaseTables,
  "purchase_codes" | "entitlements"
>;

export type SupabaseLicensingRepositoryClient =
  SupabaseRepositoryClient<LicensingRepositoryTables>;

export type MarkPurchaseCodeRedeemedStatus = "active" | "exhausted";

export interface MarkPurchaseCodeRedeemedInput {
  readonly purchaseCodeId: string;
  readonly expectedRedeemedCount: number;
  readonly nextRedeemedCount: number;
  readonly nextStatus: MarkPurchaseCodeRedeemedStatus;
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

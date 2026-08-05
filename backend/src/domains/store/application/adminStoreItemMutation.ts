import {
  AdminMutationError,
  type AdminMutationIdentity,
  type AdminMutationRpcClient,
  executeAdminMutationRpc,
} from "../../../platform/supabase/adminMutation.ts";
import type {
  CreateStoreItemInput,
  StoreItemDto,
  StoreItemRecord,
  UpdateStoreItemInput,
} from "../contracts/storeCatalogContracts.ts";
import {
  normalizeCreateStoreItemInput,
  normalizeUpdateStoreItemInput,
} from "../domain/storeCatalogRules.ts";
import { toStoreItemDto } from "../infrastructure/storeCatalogRepository.ts";

export type AdminStoreItemMutationOperation =
  | "create"
  | "update"
  | "archive"
  | "restock"
  | "rebalance";

export interface AdminStoreItemMutationInput {
  readonly gameSessionId: string;
  readonly staffUserId: string;
  readonly operation: AdminStoreItemMutationOperation;
  readonly itemId?: string | null;
  readonly body: Record<string, unknown>;
  readonly identity: AdminMutationIdentity;
}

export interface AdminStoreItemMutationResult {
  readonly status: number;
  readonly item: StoreItemDto;
  readonly replayed: boolean;
  readonly quantityAdded?: number;
}

export async function mutateAdminStoreItem(
  client: AdminMutationRpcClient,
  input: AdminStoreItemMutationInput,
): Promise<AdminStoreItemMutationResult> {
  const normalized = normalizeMutation(input);
  const mutation = await executeAdminMutationRpc(
    client,
    "admin_mutate_store_item_v1",
    {
      p_game_session_id: input.gameSessionId,
      p_staff_user_id: input.staffUserId,
      p_operation: input.operation,
      p_item_id: normalized.itemId,
      p_item_payload: normalized.itemPayload,
      p_request_payload: {
        operation: input.operation,
        itemId: normalized.itemId,
        item: normalized.itemPayload,
      },
      p_idempotency_key: input.identity.idempotencyKey,
      p_request_id: input.identity.requestId,
    },
    {
      code: "store_item_mutation_failed",
      message: "Store item could not be saved.",
    },
  );

  const item = readStoreItemRecord(mutation.body.item);
  const metadata = input.operation === "restock"
    ? { quantityAdded: normalized.itemPayload.quantity as number }
    : {};
  return {
    status: mutation.status,
    item: toStoreItemDto(item),
    replayed: mutation.replayed,
    ...metadata,
  };
}

function normalizeMutation(input: AdminStoreItemMutationInput): {
  readonly itemId: string | null;
  readonly itemPayload: Record<string, unknown>;
} {
  if (input.operation === "create") {
    const normalized = normalizeCreateStoreItemInput({
      ...input.body,
      gameSessionId: input.gameSessionId,
    } as unknown as CreateStoreItemInput);
    const { gameSessionId: _gameSessionId, ...itemPayload } = normalized;
    return { itemId: null, itemPayload };
  }

  const itemId = String(input.itemId ?? "").trim();
  if (!itemId) {
    throw new AdminMutationError(
      "missing_store_item_id",
      "A store item id is required.",
      400,
    );
  }

  if (input.operation === "restock") {
    const rawQuantity = input.body.quantity ?? input.body.amount ??
      input.body.restockQuantity ?? input.body.stockDelta;
    const quantity = Math.trunc(Number(rawQuantity));
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new AdminMutationError(
        "invalid_restock_quantity",
        "Restock quantity must be a positive integer.",
        400,
      );
    }
    return { itemId, itemPayload: { quantity } };
  }

  if (input.operation === "rebalance") {
    const rawPrice = input.body.price ?? input.body.newPrice ??
      input.body.targetPrice;
    const price = Number(rawPrice);
    if (!Number.isFinite(price) || price < 0) {
      throw new AdminMutationError(
        "store_rebalance_price_required",
        "A non-negative target price is required. Automatic repricing is not configured.",
        400,
      );
    }
    const normalized = normalizeUpdateStoreItemInput({
      gameSessionId: input.gameSessionId,
      itemId,
      price,
    });
    return { itemId: normalized.itemId, itemPayload: { ...normalized.values } };
  }

  const normalized = normalizeUpdateStoreItemInput({
    ...(input.operation === "archive"
      ? { status: "archived", visibility: "hidden" }
      : input.body),
    gameSessionId: input.gameSessionId,
    itemId,
  } as UpdateStoreItemInput);

  return {
    itemId: normalized.itemId,
    itemPayload: { ...normalized.values },
  };
}

function readStoreItemRecord(value: unknown): StoreItemRecord {
  if (
    !isRecord(value) ||
    !isText(value.id) ||
    !isText(value.game_session_id) ||
    !isText(value.item_key) ||
    !isText(value.name) ||
    !(value.description === null || typeof value.description === "string") ||
    !isText(value.category) ||
    !isFiniteNumber(value.price) ||
    !isText(value.currency_code) ||
    !Number.isSafeInteger(value.stock_quantity) ||
    !["active", "disabled", "archived"].includes(String(value.status)) ||
    !["visible", "hidden"].includes(String(value.visibility)) ||
    !Number.isSafeInteger(value.sort_order) ||
    !isText(value.created_at) ||
    !isText(value.updated_at)
  ) {
    throw new AdminMutationError(
      "store_item_mutation_failed",
      "Store item could not be saved.",
      500,
    );
  }

  return value as unknown as StoreItemRecord;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

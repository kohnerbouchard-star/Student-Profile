import type {
  InventoryEventRecord,
  InventoryHoldingRecord,
  StorePurchaseHistoryItemDto,
  StorePurchaseQuoteRecord,
  StorePurchaseRecord,
} from "../contracts/storePurchaseContracts.ts";

export function toStorePurchaseQuoteRecord(
  row: unknown,
): StorePurchaseQuoteRecord {
  const value = row as StorePurchaseQuoteRow;

  return {
    id: value.id,
    gameSessionId: value.game_session_id,
    playerId: value.player_id,
    storeItemId: value.store_item_id,
    quantity: value.quantity,
    pricing: {
      baseUnitPrice: Number(value.base_unit_price),
      inflationMultiplier: Number(value.inflation_multiplier),
      locationMultiplier: Number(value.location_multiplier),
      scarcityMultiplier: Number(value.scarcity_multiplier),
      discountAmount: Number(value.discount_amount),
      finalUnitPrice: Number(value.final_unit_price),
      finalTotalPrice: Number(value.final_total_price),
      currencyCode: value.currency_code,
      itemCurrencyCode: value.item_currency_code ?? value.currency_code,
      playerCurrencyCode: value.player_currency_code ?? value.currency_code,
      exchangeRate: Number(value.exchange_rate ?? 1),
      itemLocalFinalUnitPrice: Number(
        value.item_local_final_unit_price ?? value.final_unit_price,
      ),
      itemLocalFinalTotalPrice: Number(
        value.item_local_final_total_price ?? value.final_total_price,
      ),
      pricingVersion: value.pricing_version,
    },
    status: value.status,
    createdAt: value.created_at,
    expiresAt: value.expires_at,
    usedAt: value.used_at ?? null,
    cancelledAt: value.cancelled_at ?? null,
  };
}

export function toStorePurchaseRecord(row: unknown): StorePurchaseRecord {
  const value = row as StorePurchaseRow;

  return {
    id: value.id,
    gameSessionId: value.game_session_id,
    playerId: value.player_id,
    storeItemId: value.store_item_id,
    quoteId: value.quote_id ?? null,
    quantity: value.quantity,
    finalUnitPrice: Number(value.final_unit_price),
    finalTotalPrice: Number(value.final_total_price),
    currencyCode: value.currency_code,
    ledgerEntryId: value.ledger_entry_id ?? null,
    idempotencyKey: value.idempotency_key,
    status: value.status,
    clientSubmittedAt: value.client_submitted_at ?? null,
    createdAt: value.created_at,
  };
}

export function toInventoryHoldingRecord(row: unknown): InventoryHoldingRecord {
  const value = row as InventoryHoldingRow;

  return {
    id: value.id,
    gameSessionId: value.game_session_id,
    playerId: value.player_id,
    storeItemId: value.store_item_id,
    quantityOwned: value.quantity_owned,
    quantityReserved: value.quantity_reserved,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  };
}

export function toInventoryEventRecord(row: unknown): InventoryEventRecord {
  const value = row as InventoryEventRow;

  return {
    id: value.id,
    gameSessionId: value.game_session_id,
    playerId: value.player_id,
    storeItemId: value.store_item_id,
    quantityDelta: value.quantity_delta,
    eventType: value.event_type,
    sourceDomain: value.source_domain,
    sourceAction: value.source_action,
    sourceId: value.source_id ?? null,
    metadata: value.metadata ?? {},
    createdAt: value.created_at,
  };
}

export function toStorePurchaseHistoryItemDto(
  row: unknown,
): StorePurchaseHistoryItemDto {
  const value = row as StorePurchaseHistoryRow;

  return {
    purchaseId: value.id,
    itemId: value.store_item_id,
    itemName: value.store_items?.name ?? "Unknown item",
    quantity: value.quantity,
    finalTotalPrice: Number(value.final_total_price),
    currencyCode: value.currency_code,
    status: value.status,
    createdAt: value.created_at,
  };
}

interface StorePurchaseQuoteRow {
  readonly id: string;
  readonly game_session_id: string;
  readonly player_id: string;
  readonly store_item_id: string;
  readonly quantity: number;
  readonly currency_code: string;
  readonly item_currency_code?: string | null;
  readonly player_currency_code?: string | null;
  readonly exchange_rate?: number | string | null;
  readonly item_local_final_unit_price?: number | string | null;
  readonly item_local_final_total_price?: number | string | null;
  readonly base_unit_price: number | string;
  readonly inflation_multiplier: number | string;
  readonly location_multiplier: number | string;
  readonly scarcity_multiplier: number | string;
  readonly discount_amount: number | string;
  readonly final_unit_price: number | string;
  readonly final_total_price: number | string;
  readonly pricing_version: string;
  readonly status: StorePurchaseQuoteRecord["status"];
  readonly created_at: string;
  readonly expires_at: string;
  readonly used_at?: string | null;
  readonly cancelled_at?: string | null;
}

interface StorePurchaseRow {
  readonly id: string;
  readonly game_session_id: string;
  readonly player_id: string;
  readonly store_item_id: string;
  readonly quote_id?: string | null;
  readonly quantity: number;
  readonly currency_code: string;
  readonly final_unit_price: number | string;
  readonly final_total_price: number | string;
  readonly ledger_entry_id?: string | null;
  readonly idempotency_key: string;
  readonly status: StorePurchaseRecord["status"];
  readonly client_submitted_at?: string | null;
  readonly created_at: string;
}

interface InventoryHoldingRow {
  readonly id: string;
  readonly game_session_id: string;
  readonly player_id: string;
  readonly store_item_id: string;
  readonly quantity_owned: number;
  readonly quantity_reserved: number;
  readonly created_at: string;
  readonly updated_at: string;
}

interface InventoryEventRow {
  readonly id: string;
  readonly game_session_id: string;
  readonly player_id: string;
  readonly store_item_id: string;
  readonly quantity_delta: number;
  readonly event_type: InventoryEventRecord["eventType"];
  readonly source_domain: string;
  readonly source_action: string;
  readonly source_id?: string | null;
  readonly metadata?: Record<string, unknown> | null;
  readonly created_at: string;
}

interface StorePurchaseHistoryRow {
  readonly id: string;
  readonly store_item_id: string;
  readonly quantity: number;
  readonly final_total_price: number | string;
  readonly currency_code: string;
  readonly status: StorePurchaseHistoryItemDto["status"];
  readonly created_at: string;
  readonly store_items?: {
    readonly name?: string | null;
  } | null;
}

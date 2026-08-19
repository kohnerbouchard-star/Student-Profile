import type { EdgeSupabaseClient } from "../../../platform/supabase/edgeStaffSession.ts";
import {
  type BusinessStockroomItemDto,
  PlayerBusinessError,
} from "../contracts/playerBusinessContracts.ts";

type Row = Record<string, unknown>;

export async function readBusinessStockroom(
  client: EdgeSupabaseClient,
  input: {
    readonly gameSessionId: string;
    readonly playerId: string;
  },
): Promise<readonly BusinessStockroomItemDto[]> {
  const response = await client.rpc<unknown>("read_owned_business_stockroom_v2", {
    p_game_session_id: input.gameSessionId,
    p_player_id: input.playerId,
  });

  if (response.error) throw mapStockroomError(response.error.message);
  const rows = Array.isArray(response.data)
    ? response.data.filter(isRow)
    : [];

  return rows.map((row) => ({
    itemKey: text(row.item_key),
    canonicalKey: text(row.canonical_key),
    name: text(row.item_name, "Unnamed item"),
    itemClass: text(row.item_class, "legacy"),
    subtype: text(row.item_subtype, "general"),
    quantityOwned: number(row.quantity_owned),
    quantityReserved: number(row.quantity_reserved),
    quantityAvailable: number(row.quantity_available),
    averageUnitCost: number(row.average_unit_cost),
    costCurrencyCode: nullableText(row.cost_currency_code),
    version: integer(row.holding_version, 1),
  }));
}

function mapStockroomError(message: string): PlayerBusinessError {
  const code = message.trim().split(/\s+/u)[0] || "BUSINESS_STOCKROOM_READ_FAILED";
  const mappings: Record<string, [number, string]> = {
    PLAYER_REQUIRED: [401, "Player session scope is required."],
    BUSINESS_NOT_FOUND: [404, "Business was not found for this player."],
    BUSINESS_OWNERSHIP_AMBIGUOUS: [409, "Multiple active Business ownership positions require resolution."],
  };
  const mapped = mappings[code];
  return new PlayerBusinessError(
    code.toLowerCase(),
    mapped?.[1] ?? "The Business Stockroom could not be loaded.",
    mapped?.[0] ?? 400,
  );
}

function isRow(value: unknown): value is Row {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function text(value: unknown, defaultValue = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : defaultValue;
}
function nullableText(value: unknown): string | null {
  const valueText = text(value);
  return valueText || null;
}
function number(value: unknown, defaultValue = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}
function integer(value: unknown, defaultValue = 0): number {
  return Math.trunc(number(value, defaultValue));
}

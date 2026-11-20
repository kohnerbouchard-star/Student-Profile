import type { PlayerMarketplaceSnapshotDto } from "../contracts/playerMarketplaceContracts.ts";
import {
  PlayerMarketplaceError,
  PlayerMarketplacePersistenceError,
} from "../contracts/playerMarketplaceContracts.ts";
import { SupabasePlayerMarketplaceRepository } from "./supabasePlayerMarketplaceRepository.ts";

export type Row = Record<string, unknown>;
type Response = {
  data: unknown;
  error: { code?: string; message: string } | null;
};
export const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const key = (prefix: string, n = 1) =>
  `${prefix}_${String(n).padStart(32, "0")}`;
export const GAME = id(1),
  ME = id(2),
  OTHER = id(3),
  NOW = "2026-07-21T00:00:00.000Z";
export const scope = { gameId: GAME, playerUuid: ME };
export const ok = (data: unknown): Response => ({ data, error: null });
export const fail = (code: string): Response => ({
  data: null,
  error: { code, message: `failure:${code}` },
});
export const SELECT = {
  policy:
    "marketplace_enabled,cross_country_trading_enabled,moderation_required,fee_rate,tax_rate,listing_duration_hours,purchase_reservation_minutes,dispute_window_days,disputes_enabled",
  listing:
    "id,public_id,seller_player_id,seller_country_code,store_item_id,item_key,quantity_initial,quantity_available,unit_price,currency_code,condition_label,status,version,expires_at,moderation_reason,created_at,updated_at",
  reservation:
    "id,public_id,listing_id,buyer_player_id,quantity,buyer_total,currency_code,status,version,expires_at,release_reason,created_at",
  order:
    "id,public_id,reservation_id,listing_id,buyer_player_id,seller_player_id,item_key,quantity,unit_price,subtotal,fee_amount,tax_amount,buyer_total,seller_proceeds,currency_code,status,version,completed_at,refunded_at,created_at",
  dispute:
    "id,public_id,order_id,opened_by_player_id,reason,status,version,resolution_note,opened_at,resolved_at",
};
// The fake records the actual public entrypoint's complete query chain, not helper calls.
export class Client {
  queries: unknown[][] = [];
  calls: { name: string; args: Row }[] = [];
  constructor(
    readonly reads: Response[] = [],
    readonly rpcs: Response[] = [],
  ) {}
  from(table: string) {
    const trace: unknown[] = [table];
    this.queries.push(trace);
    const response = this.reads.shift();
    if (!response) throw new Error(`Unexpected query ${table}`);
    const chain = {
      eq: (column: string, value: unknown) => {
        trace.push(["eq", column, value]);
        return chain;
      },
      in: (column: string, values: readonly unknown[]) => {
        trace.push(["in", column, values]);
        return chain;
      },
      order: (column: string, options?: { readonly ascending?: boolean }) => {
        trace.push(["order", column, options]);
        return chain;
      },
      limit: (value: number) => {
        trace.push(["limit", value]);
        return chain;
      },
      maybeSingle: () => {
        trace.push(["maybeSingle"]);
        return Promise.resolve(response);
      },
      then: <TResult1 = Response, TResult2 = never>(
        fulfilled?:
          | ((value: Response) => TResult1 | PromiseLike<TResult1>)
          | null,
        rejected?:
          | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
          | null,
      ) => Promise.resolve(response).then(fulfilled, rejected),
    };
    return {
      select: (columns: string) => {
        trace.push(["select", columns]);
        return chain;
      },
    };
  }
  rpc(name: string, args: Row) {
    this.calls.push({ name, args });
    if (name.startsWith("expire_")) {
      return Promise.resolve(this.rpcs.shift() ?? ok(0));
    }
    const response = this.rpcs.shift();
    if (!response) throw new Error(`Unexpected RPC ${name}`);
    return Promise.resolve(response);
  }
  repository() {
    return new SupabasePlayerMarketplaceRepository(this as never);
  }
}
export function listing(patch: Row = {}): Row {
  return {
    id: id(10),
    public_id: key("lst"),
    seller_player_id: OTHER,
    seller_country_code: "US",
    item_key: "book",
    quantity_available: 3,
    unit_price: "12.5",
    currency_code: " usd ",
    condition_label: "Used",
    status: "active",
    version: "2",
    expires_at: NOW,
    created_at: NOW,
    updated_at: NOW,
    ...patch,
  };
}
export function reservation(patch: Row = {}): Row {
  return {
    id: id(20),
    public_id: key("mpr"),
    listing_id: id(10),
    buyer_player_id: ME,
    quantity: "2",
    buyer_total: "26",
    currency_code: "USD",
    status: "settled",
    version: 2,
    expires_at: NOW,
    ...patch,
  };
}
export function order(patch: Row = {}): Row {
  return {
    id: id(30),
    public_id: key("ord"),
    reservation_id: id(20),
    listing_id: id(10),
    buyer_player_id: ME,
    seller_player_id: OTHER,
    item_key: "book",
    quantity: 2,
    unit_price: 12.5,
    subtotal: 25,
    fee_amount: 1,
    tax_amount: 0,
    buyer_total: 26,
    seller_proceeds: 24,
    currency_code: "USD",
    status: "completed",
    version: 3,
    completed_at: NOW,
    ...patch,
  };
}
function dispute(patch: Row = {}): Row {
  return {
    id: id(40),
    public_id: key("dsp"),
    order_id: id(30),
    reason: " Wrong item ",
    status: "open",
    version: 1,
    opened_at: NOW,
    ...patch,
  };
}
export function graph(
  patch: {
    listing?: Row;
    reservation?: Row;
    order?: Row;
    dispute?: Row;
    policy?: Row | null;
    players?: Row[];
    items?: Row[];
  } = {},
) {
  return new Client([
    ok(patch.policy ?? null),
    ok([listing(patch.listing)]),
    ok([reservation(patch.reservation)]),
    ok([order(patch.order)]),
    ok([]),
    ok([dispute(patch.dispute)]),
    ok(
      patch.players ??
        [{
          id: OTHER,
          display_name: " Seller ",
          player_identifier: "public-seller",
        }],
    ),
    ok(
      patch.items ??
        [{
          item_key: "book",
          name: " Book ",
          description: " A book ",
          category: "Books",
        }],
    ),
  ]);
}
export function empty(policy: Row | null = null) {
  return new Client([ok(policy), ok(null), ok(null), ok(null), ok(null)]);
}
export function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)}; expected ${JSON.stringify(expected)}`,
    );
  }
}
export async function rejects(
  run: () => Promise<unknown>,
  code = "marketplace_response_invalid",
  publicError = false,
) {
  try {
    await run();
  } catch (error) {
    if (publicError) {
      if (!(error instanceof PlayerMarketplaceError)) throw error;
      equal(error.code, code);
      equal(error.status, code === "player_marketplace_not_found" ? 404 : 409);
    } else {
      if (!(error instanceof PlayerMarketplacePersistenceError)) throw error;
      equal(error.sourceCode, code);
    }
    return;
  }
  throw new Error(`Expected ${code}`);
}
const eqGame = ["eq", "game_session_id", GAME];
export const newest = ["order", "created_at", { ascending: false }];
export function query(table: string, select: string, ...rest: unknown[]) {
  return [table, ["select", select], eqGame, ...rest];
}

export function assertPublicGraph(result: PlayerMarketplaceSnapshotDto) {
  equal(result.listings[0], {
    id: key("lst"),
    itemId: "book",
    name: "Book",
    description: "A book",
    category: "books",
    image: null,
    country: "us",
    condition: "Used",
    seller: "Seller",
    sellerReference: "public-seller",
    unitPrice: 12.5,
    currencyCode: "USD",
    quantity: 3,
    status: "active",
    version: 2,
    expiresAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    moderationReason: null,
    mine: false,
  });
  equal(result.reservations[0], {
    id: key("mpr"),
    listingId: key("lst"),
    quantity: 2,
    total: 26,
    currencyCode: "USD",
    status: "settled",
    version: 2,
    expiresAt: NOW,
    releaseReason: null,
  });
  equal(result.orders[0], {
    id: key("ord"),
    reservationId: key("mpr"),
    listingId: key("lst"),
    itemId: "book",
    itemName: "Book",
    quantity: 2,
    unitPrice: 12.5,
    subtotal: 25,
    feeAmount: 1,
    taxAmount: 0,
    total: 26,
    sellerProceeds: 24,
    currencyCode: "USD",
    status: "completed",
    version: 3,
    role: "buyer",
    completedAt: NOW,
    refundedAt: null,
  });
  equal(result.disputes[0], {
    id: key("dsp"),
    orderId: key("ord"),
    reason: "Wrong item",
    status: "open",
    version: 1,
    resolutionNote: null,
    openedAt: NOW,
    resolvedAt: null,
  });
  equal(result.summary, {
    listingCount: 1,
    activeSellers: 1,
    volume: 26,
  });
  if (/00000000-0000-4000-8000-/.test(JSON.stringify(result))) {
    throw new Error("Internal identity escaped");
  }
}

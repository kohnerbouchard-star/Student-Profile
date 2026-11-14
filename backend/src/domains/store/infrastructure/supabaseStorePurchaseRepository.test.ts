import {
  StorePurchasePersistenceError,
  SupabaseStorePurchaseRepository,
  toInventoryEventRecord,
  toInventoryHoldingRecord,
  toStorePurchaseQuoteRecord,
  toStorePurchaseRecord,
} from "./supabaseStorePurchaseRepository.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const input = {
  gameSessionId: "game",
  playerId: "player",
  itemId: "item",
  quantity: 3,
  nowIso: "2026-11-14T00:00:00.000Z",
};
const quote = {
  id: "quote",
  game_session_id: "game",
  player_id: "player",
  store_item_id: "item",
  quantity: 3,
  currency_code: "ECO",
  base_unit_price: "3.25",
  inflation_multiplier: "1.5",
  location_multiplier: "2",
  scarcity_multiplier: "0.5",
  discount_amount: "0",
  final_unit_price: "4.875",
  final_total_price: "14.625",
  pricing_version: "v1",
  status: "CREATED",
  created_at: "created",
  expires_at: "expires",
};
const pricing = {
  settlement_currency_code: "ECO",
  item_currency_code: "NRC",
  exchange_rate: "1.5",
  item_local_final_unit_price: "3.25",
  item_local_final_total_price: "9.75",
  base_unit_price: "3.25",
  inflation_multiplier: "1.5",
  location_multiplier: "2",
  scarcity_multiplier: "0.5",
  final_unit_price: "4.875",
  final_total_price: "14.625",
  pricing_version: "v1",
  expires_at: "expires",
};

Deno.test("purchase quote public mapper preserves the complete response and currency defaults", () => {
  eq(toStorePurchaseQuoteRecord(quote), {
    id: "quote",
    gameSessionId: "game",
    playerId: "player",
    storeItemId: "item",
    quantity: 3,
    pricing: {
      baseUnitPrice: 3.25,
      inflationMultiplier: 1.5,
      locationMultiplier: 2,
      scarcityMultiplier: 0.5,
      discountAmount: 0,
      finalUnitPrice: 4.875,
      finalTotalPrice: 14.625,
      currencyCode: "ECO",
      itemCurrencyCode: "ECO",
      playerCurrencyCode: "ECO",
      exchangeRate: 1,
      itemLocalFinalUnitPrice: 4.875,
      itemLocalFinalTotalPrice: 14.625,
      pricingVersion: "v1",
    },
    status: "CREATED",
    createdAt: "created",
    expiresAt: "expires",
    usedAt: null,
    cancelledAt: null,
  });
});

for (const value of [undefined, null, 0, "0", "", "bad", "Infinity", -2.5]) {
  Deno.test(`purchase quote public mapper retains Number and nullish semantics: ${String(value)}`, () => {
    const row = {
      ...quote,
      exchange_rate: value,
      item_local_final_unit_price: value,
      item_local_final_total_price: value,
      base_unit_price: value,
      item_currency_code: "",
      player_currency_code: null,
      used_at: "",
      cancelled_at: "cancelled",
    };
    const before = { ...row };
    const mapped = toStorePurchaseQuoteRecord(row);
    eq(mapped.pricing.exchangeRate, Number(value ?? 1));
    eq(
      mapped.pricing.itemLocalFinalUnitPrice,
      Number(value ?? quote.final_unit_price),
    );
    eq(
      mapped.pricing.itemLocalFinalTotalPrice,
      Number(value ?? quote.final_total_price),
    );
    eq(mapped.pricing.baseUnitPrice, Number(value));
    eq(mapped.pricing.itemCurrencyCode, "");
    eq(mapped.pricing.playerCurrencyCode, "ECO");
    eq([mapped.usedAt, mapped.cancelledAt], ["", "cancelled"]);
    eq(row, before);
  });
}

Deno.test("purchase receipt mapper preserves fields, empty strings and numeric conversion", () => {
  const row = {
    ...quote,
    quote_id: "",
    ledger_entry_id: "",
    idempotency_key: "idem",
    client_submitted_at: "",
    final_unit_price: "bad",
    status: "COMPLETED",
  };
  eq(toStorePurchaseRecord(row), {
    id: "quote",
    gameSessionId: "game",
    playerId: "player",
    storeItemId: "item",
    quoteId: "",
    quantity: 3,
    finalUnitPrice: NaN,
    finalTotalPrice: 14.625,
    currencyCode: "ECO",
    ledgerEntryId: "",
    idempotencyKey: "idem",
    status: "COMPLETED",
    clientSubmittedAt: "",
    createdAt: "created",
  });
  const defaults = toStorePurchaseRecord(quote);
  eq([defaults.quoteId, defaults.ledgerEntryId, defaults.clientSubmittedAt], [
    null,
    null,
    null,
  ]);
});

Deno.test("inventory public mappers preserve direct quantity and metadata identity", () => {
  const metadata = { nested: { value: 1 } };
  const row = {
    ...quote,
    quantity_owned: "3",
    quantity_reserved: 0,
    quantity_delta: "-2",
    updated_at: "updated",
    event_type: "PURCHASE",
    source_domain: "store",
    source_action: "buy",
    source_id: "",
    metadata,
  };
  eq(toInventoryHoldingRecord(row), {
    id: "quote",
    gameSessionId: "game",
    playerId: "player",
    storeItemId: "item",
    quantityOwned: "3",
    quantityReserved: 0,
    createdAt: "created",
    updatedAt: "updated",
  });
  eq(toInventoryEventRecord(row), {
    id: "quote",
    gameSessionId: "game",
    playerId: "player",
    storeItemId: "item",
    quantityDelta: "-2",
    eventType: "PURCHASE",
    sourceDomain: "store",
    sourceAction: "buy",
    sourceId: "",
    metadata,
    createdAt: "created",
  });
  if (toInventoryEventRecord(row).metadata !== metadata) {
    throw Error("Metadata was copied");
  }
  eq(
    toInventoryEventRecord({ ...row, metadata: null, source_id: null })
      .metadata,
    {},
  );
  eq(toInventoryEventRecord({ ...row, source_id: null }).sourceId, null);
});

Deno.test("purchase repository keeps dependent query order, selectors and quote write payload", async () => {
  const client = new Client([
    ok({ id: "assignment", country_profile_id: "country" }),
    ok({ id: "country", country_code: "NR", currency_code: " eco " }),
    ok([pricing]),
    ok(quote),
  ]);
  eq(
    await new SupabaseStorePurchaseRepository(client as never).createQuote(
      input,
    ),
    toStorePurchaseQuoteRecord(quote),
  );
  eq(client.calls.slice(0, 12), [
    ["from", "player_country_assignments"],
    ["select", "id,country_profile_id"],
    ["eq", "game_session_id", "game"],
    ["eq", "player_id", "player"],
    ["eq", "status", "active"],
    ["maybeSingle"],
    ["from", "country_profiles"],
    ["select", "id,country_code,currency_code"],
    ["eq", "id", "country"],
    ["single"],
    ["rpc", "resolve_store_quote_pricing_v2", {
      p_game_session_id: "game",
      p_store_item_id: "item",
      p_country_profile_id: "country",
      p_settlement_currency_code: "ECO",
      p_quantity: 3,
      p_effective_at: input.nowIso,
    }],
    ["from", "store_purchase_quotes"],
  ]);
  eq(client.calls[12], ["insert", {
    game_session_id: "game",
    player_id: "player",
    store_item_id: "item",
    quantity: 3,
    currency_code: "ECO",
    item_currency_code: "NRC",
    player_currency_code: "ECO",
    exchange_rate: 1.5,
    item_local_final_unit_price: 3.25,
    item_local_final_total_price: 9.75,
    base_unit_price: 3.25,
    inflation_multiplier: 1.5,
    location_multiplier: 2,
    scarcity_multiplier: 0.5,
    discount_amount: 0,
    final_unit_price: 4.875,
    final_total_price: 14.625,
    pricing_version: "v1",
    status: "CREATED",
    expires_at: "expires",
  }]);
  eq(client.calls[13], [
    "select",
    "id,game_session_id,player_id,store_item_id,quantity,currency_code,item_currency_code,player_currency_code,exchange_rate,item_local_final_unit_price,item_local_final_total_price,base_unit_price,inflation_multiplier,location_multiplier,scarcity_multiplier,discount_amount,final_unit_price,final_total_price,pricing_version,status,created_at,expires_at,used_at,cancelled_at",
  ]);
  eq(client.calls[14], ["single"]);
  eq(client.responses.length, 0);
});

const assignment = ok({ country_profile_id: "country" });
const country = ok({ id: "country", currency_code: "ECO" });
for (
  const [name, responses, code] of [
    [
      "assignment error",
      [fail("down")],
      "store_quote_country_assignment_lookup_failed",
    ],
    [
      "assignment absent",
      [ok(null)],
      "store_quote_country_assignment_not_found",
    ],
    [
      "country error",
      [assignment, fail("down")],
      "store_quote_country_currency_lookup_failed",
    ],
    [
      "country absent",
      [assignment, ok(null)],
      "store_quote_country_currency_lookup_failed",
    ],
    ["currency invalid", [
      assignment,
      ok({ id: "country", currency_code: "x" }),
    ], "store_quote_invalid_currency_code"],
    [
      "pricing empty",
      [assignment, country, ok([])],
      "store_quote_pricing_failed",
    ],
    [
      "pricing object",
      [assignment, country, ok(pricing)],
      "store_quote_pricing_failed",
    ],
    [
      "write error",
      [assignment, country, ok([pricing]), fail("down")],
      "store_quote_create_failed",
    ],
    [
      "write absent",
      [assignment, country, ok([pricing]), ok(null)],
      "store_quote_create_failed",
    ],
  ] as const
) {
  Deno.test(`purchase repository stops at ${name} with original typed error`, async () => {
    const client = new Client([...responses]);
    await rejects(
      () =>
        new SupabaseStorePurchaseRepository(client as never).createQuote(input),
      code,
    );
    eq(client.responses.length, 0);
  });
}

for (
  const [token, code] of [
    ["STORE_ITEM_NOT_FOUND", "store_quote_item_not_found"],
    ["COUNTRY_PROFILE_NOT_FOUND", "store_quote_country_currency_lookup_failed"],
    ["COUNTRY_SNAPSHOT_NOT_FOUND", "store_quote_country_snapshot_not_found"],
    ["STORE_QUOTE_CURRENCY_INVALID", "store_quote_invalid_currency_code"],
    ["UNKNOWN", "store_quote_pricing_failed"],
  ]
) {
  Deno.test(`purchase pricing error uses the first trimmed token: ${token}`, async () => {
    const client = new Client([
      assignment,
      country,
      fail(` \n ${token}\t details`),
    ]);
    await rejects(
      () =>
        new SupabaseStorePurchaseRepository(client as never).createQuote(input),
      code,
    );
    eq(client.calls.filter((call) => call[0] === "from").length, 2);
  });
}

Deno.test("purchase history keeps scope, default limit, exact shape and nullish item-name behavior", async () => {
  const client = new Client([
    ok([{ ...quote, store_items: { name: "" } }, {
      ...quote,
      store_items: null,
    }]),
  ]);
  const history = await new SupabaseStorePurchaseRepository(client as never)
    .listPlayerPurchases(input);
  eq(history[0], {
    purchaseId: "quote",
    itemId: "item",
    itemName: "",
    quantity: 3,
    finalTotalPrice: 14.625,
    currencyCode: "ECO",
    status: "CREATED",
    createdAt: "created",
  });
  eq(history[1].itemName, "Unknown item");
  eq(client.calls, [
    ["from", "store_purchases"],
    [
      "select",
      "id,store_item_id,quantity,final_total_price,currency_code,status,created_at,store_items(name)",
    ],
    ["eq", "game_session_id", "game"],
    ["eq", "player_id", "player"],
    ["order", "created_at", { ascending: false }],
    ["limit", 25],
    ["await"],
  ]);
});

Deno.test("purchase history keeps explicit zero limit, null data and typed failure", async () => {
  const client = new Client([ok(null)]);
  eq(
    await new SupabaseStorePurchaseRepository(client as never)
      .listPlayerPurchases({ ...input, limit: 0 }),
    [],
  );
  eq(client.calls.at(-2), ["limit", 0]);
  await rejects(
    () =>
      new SupabaseStorePurchaseRepository(new Client([fail("down")]) as never)
        .listPlayerPurchases(input),
    "store_purchase_history_failed",
  );
});

type Response = { data: unknown; error: { message: string } | null };
function ok(data: unknown): Response {
  return { data, error: null };
}
function fail(message: string): Response {
  return { data: null, error: { message } };
}
class Client {
  readonly calls: unknown[][] = [];
  constructor(readonly responses: Response[]) {}
  from(table: string) {
    this.calls.push(["from", table]);
    return this;
  }
  select(columns: string) {
    this.calls.push(["select", columns]);
    return this;
  }
  eq(column: string, value: unknown) {
    this.calls.push(["eq", column, value]);
    return this;
  }
  insert(value: unknown) {
    this.calls.push(["insert", value]);
    return this;
  }
  order(column: string, options: unknown) {
    this.calls.push(["order", column, options]);
    return this;
  }
  limit(value: number) {
    this.calls.push(["limit", value]);
    return this;
  }
  next() {
    const response = this.responses.shift();
    if (!response) throw Error("Unexpected query");
    return response;
  }
  single() {
    this.calls.push(["single"]);
    return Promise.resolve(this.next());
  }
  maybeSingle() {
    this.calls.push(["maybeSingle"]);
    return Promise.resolve(this.next());
  }
  rpc(name: string, args: unknown) {
    this.calls.push(["rpc", name, args]);
    return Promise.resolve(this.next());
  }
  then(resolve: (response: Response) => unknown) {
    this.calls.push(["await"]);
    return Promise.resolve(this.next()).then(resolve);
  }
}
async function rejects(run: () => Promise<unknown>, code: string) {
  try {
    await run();
  } catch (error) {
    if (!(error instanceof StorePurchasePersistenceError)) throw error;
    eq(error.code, code);
    eq(error.name, "StorePurchasePersistenceError");
    return;
  }
  throw Error(`Expected ${code}`);
}
function eq(actual: unknown, expected: unknown): void {
  if (Object.is(actual, expected)) return;
  if (
    actual && expected && typeof actual === "object" &&
    typeof expected === "object"
  ) {
    eq(
      Object.keys(actual).sort().join(","),
      Object.keys(expected).sort().join(","),
    );
    for (const key of Object.keys(expected)) {
      eq(
        (actual as Record<string, unknown>)[key],
        (expected as Record<string, unknown>)[key],
      );
    }
    return;
  }
  throw Error(`Expected ${String(expected)}, got ${String(actual)}`);
}

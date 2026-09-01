import { readPlayerBusinessRoutePath } from "./playerBusinessRoutePaths.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`Expected ${right}, received ${left}`);
}

const key = (prefix: string, digit: string) => `${prefix}_${digit.repeat(32)}`;

Deno.test("Business route authority owns every Player Business URL", () => {
  assertEquals(readPlayerBusinessRoutePath("/players/me/business"), {
    kind: "businessRead",
    resource: "overview",
  });
  assertEquals(readPlayerBusinessRoutePath("/players/me/business/stockroom"), {
    kind: "businessRead",
    resource: "stockroom",
  });
  assertEquals(readPlayerBusinessRoutePath("/players/me/business/recipes"), {
    kind: "businessRead",
    resource: "recipes",
  });
  assertEquals(readPlayerBusinessRoutePath("/players/me/business/equipment"), {
    kind: "businessRead",
    resource: "equipment",
  });
  assertEquals(readPlayerBusinessRoutePath("/players/me/business/treasury"), {
    kind: "businessTreasuryRead",
  });
  assertEquals(
    readPlayerBusinessRoutePath("/players/me/business/treasury/accounts"),
    { kind: "businessTreasuryAccountOpen" },
  );
  assertEquals(
    readPlayerBusinessRoutePath("/players/me/business/treasury/fx/quotes"),
    { kind: "businessTreasuryFxQuote" },
  );
  assertEquals(
    readPlayerBusinessRoutePath(
      "/players/me/business/treasury/fx/orders/standard",
    ),
    { kind: "businessTreasuryFxStandard" },
  );
  assertEquals(
    readPlayerBusinessRoutePath(
      "/players/me/business/treasury/fx/orders/instant",
    ),
    { kind: "businessTreasuryFxInstant" },
  );
  assertEquals(
    readPlayerBusinessRoutePath(
      `/players/me/business/treasury/fx/orders/${key("fxo", "9")}/cancel`,
    ),
    { kind: "businessTreasuryFxCancel", orderKey: key("fxo", "9") },
  );
  assertEquals(
    readPlayerBusinessRoutePath("/players/me/business/store/quotes"),
    { kind: "businessStoreQuote" },
  );
  assertEquals(
    readPlayerBusinessRoutePath("/players/me/business/store/purchases"),
    { kind: "businessStorePurchase" },
  );
  assertEquals(readPlayerBusinessRoutePath("/players/me/businesses"), {
    kind: "businessCreate",
    operation: "directCreate",
  });
  assertEquals(readPlayerBusinessRoutePath("/players/me/business/formations"), {
    kind: "businessCreate",
    operation: "formationPropose",
  });
  assertEquals(
    readPlayerBusinessRoutePath(
      `/players/me/business/formations/${key("bfp", "a")}/respond`,
    ),
    {
      kind: "businessCreate",
      operation: "formationRespond",
      formationKey: key("bfp", "a"),
    },
  );
  assertEquals(
    readPlayerBusinessRoutePath(
      `/players/me/business/formations/${key("bfp", "b")}/activate`,
    ),
    {
      kind: "businessCreate",
      operation: "formationActivate",
      formationKey: key("bfp", "b"),
    },
  );
  assertEquals(readPlayerBusinessRoutePath("/players/me/business/products"), {
    kind: "businessProductCreate",
  });
  assertEquals(
    readPlayerBusinessRoutePath("/players/me/business/inputs/purchases"),
    {
      kind: "businessInputPurchase",
    },
  );
  assertEquals(
    readPlayerBusinessRoutePath("/players/me/business/production-runs"),
    {
      kind: "businessProduction",
    },
  );
  assertEquals(
    readPlayerBusinessRoutePath(
      `/players/me/business/products/${key("bpr", "c")}/pricing`,
    ),
    { kind: "businessPrice", productKey: key("bpr", "c") },
  );
  assertEquals(
    readPlayerBusinessRoutePath("/players/me/business/employees/hire"),
    {
      kind: "businessHire",
    },
  );
  assertEquals(
    readPlayerBusinessRoutePath(
      `/players/me/business/employees/${key("emp", "d")}/terminate`,
    ),
    { kind: "businessTerminate", employeeKey: key("emp", "d") },
  );
  assertEquals(readPlayerBusinessRoutePath("/players/me/business/status"), {
    kind: "businessStatus",
  });
});

Deno.test("Business route authority recognizes Edge service prefixes", () => {
  assertEquals(
    readPlayerBusinessRoutePath("/player-api/players/me/business/stockroom"),
    {
      kind: "businessRead",
      resource: "stockroom",
    },
  );
  assertEquals(
    readPlayerBusinessRoutePath(
      "/functions/v1/classroom-api/players/me/business/recipes",
    ),
    {
      kind: "businessRead",
      resource: "recipes",
    },
  );
  assertEquals(
    readPlayerBusinessRoutePath(
      "/player-api/players/me/business/equipment",
    ),
    {
      kind: "businessRead",
      resource: "equipment",
    },
  );
  assertEquals(
    readPlayerBusinessRoutePath("/player-api/players/me/business/store/quotes"),
    { kind: "businessStoreQuote" },
  );
  assertEquals(
    readPlayerBusinessRoutePath(
      "/functions/v1/classroom-api/players/me/business/store/purchases",
    ),
    { kind: "businessStorePurchase" },
  );
  assertEquals(
    readPlayerBusinessRoutePath(
      "/player-api/players/me/business/treasury/fx/quotes",
    ),
    { kind: "businessTreasuryFxQuote" },
  );
  assertEquals(
    readPlayerBusinessRoutePath(
      `/functions/v1/classroom-api/players/me/business/treasury/fx/orders/${
        key("fxo", "7").toUpperCase()
      }/cancel`,
    ),
    { kind: "businessTreasuryFxCancel", orderKey: key("fxo", "7") },
  );
  assertEquals(
    readPlayerBusinessRoutePath(
      "/functions/v1/classroom-api/players/me/business",
    ),
    {
      kind: "businessRead",
      resource: "overview",
    },
  );
});

Deno.test("Business route authority rejects Banking and malformed URLs", () => {
  assertEquals(
    readPlayerBusinessRoutePath("/players/me/banking/transfers"),
    null,
  );
  assertEquals(readPlayerBusinessRoutePath("/players/me/banking/loans"), null);
  assertEquals(
    readPlayerBusinessRoutePath(
      "/players/me/business/formations/not-a-key/respond",
    ),
    null,
  );
  assertEquals(
    readPlayerBusinessRoutePath("/players/me/business/stockroom/extra"),
    null,
  );
  assertEquals(
    readPlayerBusinessRoutePath("/players/me/business/recipes/extra"),
    null,
  );
  assertEquals(
    readPlayerBusinessRoutePath("/players/me/business/equipment/extra"),
    null,
  );
  assertEquals(
    readPlayerBusinessRoutePath("/players/me/business/store/quotes/extra"),
    null,
  );
  assertEquals(
    readPlayerBusinessRoutePath("/players/me/business/store/purchases/extra"),
    null,
  );
  assertEquals(
    readPlayerBusinessRoutePath("/players/me/business/treasury/extra"),
    null,
  );
  assertEquals(
    readPlayerBusinessRoutePath(
      "/players/me/business/treasury/fx/orders/not-an-order/cancel",
    ),
    null,
  );
  assertEquals(
    readPlayerBusinessRoutePath(
      "/players/me/business/treasury/fx/orders/%E0%A4%A/cancel",
    ),
    null,
  );
  assertEquals(
    readPlayerBusinessRoutePath(
      `/players/me/business/treasury/fx/orders/${key("fxq", "9")}/cancel`,
    ),
    null,
  );
  assertEquals(readPlayerBusinessRoutePath("/games/game/business"), null);
});

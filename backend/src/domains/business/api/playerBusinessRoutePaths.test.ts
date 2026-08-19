import { readPlayerBusinessRoutePath } from "./playerBusinessRoutePaths.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`Expected ${right}, received ${left}`);
}

const key = (prefix: string, digit: string) => `${prefix}_${digit.repeat(32)}`;

Deno.test("Business route authority owns every Player Business URL", () => {
  assertEquals(readPlayerBusinessRoutePath("/players/me/business"), { kind: "businessRead" });
  assertEquals(readPlayerBusinessRoutePath("/players/me/businesses"), {
    kind: "businessCreate",
    operation: "directCreate",
  });
  assertEquals(readPlayerBusinessRoutePath("/players/me/business/formations"), {
    kind: "businessCreate",
    operation: "formationPropose",
  });
  assertEquals(
    readPlayerBusinessRoutePath(`/players/me/business/formations/${key("bfp", "a")}/respond`),
    { kind: "businessCreate", operation: "formationRespond", formationKey: key("bfp", "a") },
  );
  assertEquals(
    readPlayerBusinessRoutePath(`/players/me/business/formations/${key("bfp", "b")}/activate`),
    { kind: "businessCreate", operation: "formationActivate", formationKey: key("bfp", "b") },
  );
  assertEquals(readPlayerBusinessRoutePath("/players/me/business/products"), {
    kind: "businessProductCreate",
  });
  assertEquals(readPlayerBusinessRoutePath("/players/me/business/inputs/purchases"), {
    kind: "businessInputPurchase",
  });
  assertEquals(readPlayerBusinessRoutePath("/players/me/business/production-runs"), {
    kind: "businessProduction",
  });
  assertEquals(
    readPlayerBusinessRoutePath(`/players/me/business/products/${key("bpr", "c")}/pricing`),
    { kind: "businessPrice", productKey: key("bpr", "c") },
  );
  assertEquals(readPlayerBusinessRoutePath("/players/me/business/employees/hire"), {
    kind: "businessHire",
  });
  assertEquals(
    readPlayerBusinessRoutePath(`/players/me/business/employees/${key("emp", "d")}/terminate`),
    { kind: "businessTerminate", employeeKey: key("emp", "d") },
  );
  assertEquals(readPlayerBusinessRoutePath("/players/me/business/status"), {
    kind: "businessStatus",
  });
});

Deno.test("Business route authority rejects Banking and malformed URLs", () => {
  assertEquals(readPlayerBusinessRoutePath("/players/me/banking/transfers"), null);
  assertEquals(readPlayerBusinessRoutePath("/players/me/banking/loans"), null);
  assertEquals(readPlayerBusinessRoutePath("/players/me/business/formations/not-a-key/respond"), null);
  assertEquals(readPlayerBusinessRoutePath("/games/game/business"), null);
});

import { readPlayerBusinessBankingRoutePath } from "./playerBusinessBankingRoutePaths.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`Expected ${right}, received ${left}`);
}

const key = (prefix: string, digit: string) => `${prefix}_${digit.repeat(32)}`;

Deno.test("Player Business and Banking routes publish every reviewed operation", () => {
  assertEquals(readPlayerBusinessBankingRoutePath("/players/me/business"), {
    kind: "businessRead",
  });
  assertEquals(readPlayerBusinessBankingRoutePath("/players/me/businesses"), {
    kind: "businessCreate",
  });
  assertEquals(readPlayerBusinessBankingRoutePath("/players/me/business/products"), {
    kind: "businessProductCreate",
  });
  assertEquals(readPlayerBusinessBankingRoutePath("/players/me/business/inputs/purchases"), {
    kind: "businessInputPurchase",
  });
  assertEquals(readPlayerBusinessBankingRoutePath("/players/me/business/production-runs"), {
    kind: "businessProduction",
  });
  assertEquals(
    readPlayerBusinessBankingRoutePath(`/players/me/business/products/${key("bpr", "a")}/pricing`),
    { kind: "businessPrice", productKey: key("bpr", "a") },
  );
  assertEquals(readPlayerBusinessBankingRoutePath("/players/me/business/employees/hire"), {
    kind: "businessHire",
  });
  assertEquals(
    readPlayerBusinessBankingRoutePath(`/players/me/business/employees/${key("emp", "b")}/terminate`),
    { kind: "businessTerminate", employeeKey: key("emp", "b") },
  );
  assertEquals(readPlayerBusinessBankingRoutePath("/players/me/business/status"), {
    kind: "businessStatus",
  });
  assertEquals(readPlayerBusinessBankingRoutePath("/players/me/banking/transfers"), {
    kind: "playerTransfer",
  });
  assertEquals(readPlayerBusinessBankingRoutePath("/players/me/banking/savings/transfers"), {
    kind: "savingsTransfer",
  });
  assertEquals(readPlayerBusinessBankingRoutePath("/players/me/banking/loans"), {
    kind: "loansRead",
  });
  assertEquals(
    readPlayerBusinessBankingRoutePath(`/players/me/banking/loans/applications/${key("lop", "c")}`),
    { kind: "loanApply", offerKey: key("lop", "c") },
  );
  assertEquals(
    readPlayerBusinessBankingRoutePath(`/players/me/banking/loans/${key("lon", "d")}/payments`),
    { kind: "loanRepay", loanKey: key("lon", "d") },
  );
});

Deno.test("Player Business and Banking routes reject malformed and non-Player paths", () => {
  assertEquals(readPlayerBusinessBankingRoutePath("/games/game/business"), null);
  assertEquals(readPlayerBusinessBankingRoutePath("/players/me/business/products/not-a-key/pricing"), null);
  assertEquals(readPlayerBusinessBankingRoutePath(`/players/me/banking/loans/${key("lop", "e")}/payments`), null);
  assertEquals(readPlayerBusinessBankingRoutePath("/players/other/banking/transfers"), null);
});

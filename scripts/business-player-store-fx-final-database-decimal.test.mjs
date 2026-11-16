import assert from "node:assert/strict";
import test from "node:test";

import { scaledDatabaseDecimal } from "./business-player-store-fx-final-database-decimal.mjs";

test("database decimals ignore only fixed-scale zero padding beyond the currency minor unit", () => {
  assert.equal(
    scaledDatabaseDecimal("2500.000000000000000000", 2, "Balance"),
    250000n,
  );
  assert.equal(
    scaledDatabaseDecimal("12.340000000000000000", 2, "Balance"),
    1234n,
  );
  assert.equal(scaledDatabaseDecimal("12.000", 0, "Balance"), 12n);
});

test("database decimals reject non-zero precision beyond the currency minor unit", () => {
  assert.throws(
    () => scaledDatabaseDecimal("12.3401", 2, "Balance"),
    /Balance has invalid precision/u,
  );
  assert.throws(
    () => scaledDatabaseDecimal("12.001", 0, "Balance"),
    /Balance has invalid precision/u,
  );
});

test("database decimals reject malformed values and invalid precision metadata", () => {
  for (const value of ["-1", "01.00", "1e2", "", null]) {
    assert.throws(
      () => scaledDatabaseDecimal(value, 2, "Balance"),
      /Balance has invalid precision/u,
    );
  }
  assert.throws(
    () => scaledDatabaseDecimal("1.00", 19, "Balance"),
    /Balance has invalid precision/u,
  );
});

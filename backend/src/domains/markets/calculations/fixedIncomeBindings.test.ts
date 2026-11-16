import * as publicAnalytics from "./fixedIncomeAnalytics.ts";
import * as curves from "./fixedIncomeCurves.ts";
import * as policy from "./fixedIncomePolicy.ts";

declare const Deno: { test(name: string, run: () => void): void };

Deno.test("fixed-income public exports retain the owning function and policy identities", () => {
  const pairs = [
    [publicAnalytics.resolveFixedIncomeYield, curves.resolveFixedIncomeYield],
    [
      publicAnalytics.validateVersionedFixedIncomeCurve,
      curves.validateVersionedFixedIncomeCurve,
    ],
    [
      publicAnalytics.DEFAULT_FIXED_INCOME_CURVE_POLICY,
      curves.DEFAULT_FIXED_INCOME_CURVE_POLICY,
    ],
    [
      publicAnalytics.DEFAULT_FIXED_INCOME_YIELD_POLICY,
      policy.DEFAULT_FIXED_INCOME_YIELD_POLICY,
    ],
    [
      publicAnalytics.NEGATIVE_YIELD_REFERENCE_POLICY,
      policy.NEGATIVE_YIELD_REFERENCE_POLICY,
    ],
  ];
  for (const [publicBinding, ownerBinding] of pairs) {
    if (publicBinding !== ownerBinding) {
      throw new Error("Public binding identity changed.");
    }
  }
});

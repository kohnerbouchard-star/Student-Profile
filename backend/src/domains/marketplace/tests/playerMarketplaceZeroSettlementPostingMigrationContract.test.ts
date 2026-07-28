export {};

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: string): Promise<string>;
};

const PATH = "supabase/migrations/20260728033000_skip_zero_marketplace_settlement_postings_v1.sql";

Deno.test("Marketplace settlement omits zero fee and tax postings without changing policy rates", async () => {
  const sql = await Deno.readTextFile(PATH);
  for (const required of [
    "settle_marketplace_purchase_projection_legacy_v1",
    "'buyer_debit'",
    "'seller_credit'",
    "'fee_credit'::text",
    "'tax_credit'::text",
    "where optional_posting.posting_amount > 0",
    "MARKETPLACE_SETTLEMENT_POSTING_PATCH_INVALID",
    "from public, anon, authenticated, service_role",
  ]) {
    if (!sql.includes(required)) throw new Error(`Missing zero-posting settlement contract: ${required}`);
  }

  if (/alter\s+table\s+public\.marketplace_policies/i.test(sql)) {
    throw new Error("Zero-posting repair must not change Marketplace policy rates.");
  }
  if (/tax_rate\s*=\s*0\.05|tax_rate\s+numeric[^;]*default\s+0\.05/i.test(sql)) {
    throw new Error("Zero-posting repair must preserve zero tax as a valid policy choice.");
  }
  if (/drop\s+constraint[^;]*marketplace_postings_amount_nonzero/i.test(sql)) {
    throw new Error("Zero-posting repair must preserve the nonzero posting invariant.");
  }
});

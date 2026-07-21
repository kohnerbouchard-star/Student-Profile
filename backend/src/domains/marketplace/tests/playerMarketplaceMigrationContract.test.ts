export {};

declare const Deno: { test(name: string, run: () => void | Promise<void>): void; readTextFile(path: string): Promise<string> };
const MIGRATION = "supabase/migrations/20260721141000_add_player_marketplace_lifecycle_v2.sql";

Deno.test("Marketplace migration defines the complete lifecycle and immutable evidence", async () => {
  const sql = await Deno.readTextFile(MIGRATION);
  for (const required of [
    "'draft'", "'active'", "'moderation_hold'", "'sold_out'", "'cancelled'", "'expired'", "'rejected'",
    "marketplace_purchase_reservations", "'reserved'", "'settling'", "'settled'", "'released'",
    "create_marketplace_listing_public_v2", "activate_marketplace_listing_public_v1",
    "reserve_marketplace_purchase_public_v1", "settle_marketplace_purchase_public_v1",
    "cancel_marketplace_listing_public_v2", "open_marketplace_dispute_public_v2",
    "review_marketplace_admin_v2", "set_marketplace_policy_admin_v2",
    "marketplace_financial_postings", "marketplace_treasury_balances",
    "buyer_debit", "seller_credit", "fee_credit", "tax_credit",
    "buyer_refund_credit", "seller_refund_debit", "fee_refund_debit", "tax_refund_debit",
    "reject_marketplace_immutable_mutation_v1", "marketplace_audit_immutable",
    "marketplace_postings_immutable", "marketplace_receipts_immutable",
    "MARKETPLACE_STALE_VERSION", "MARKETPLACE_PURCHASE_RESERVATION_ACTIVE",
    "MARKETPLACE_PLAYER_SCOPE_INACTIVE", "MARKETPLACE_CROSS_COUNTRY_BLOCKED",
  ]) {
    if (!sql.includes(required)) throw new Error(`Marketplace migration is missing ${required}`);
  }
});

Deno.test("Marketplace settlement and refund posting groups are explicitly balanced", async () => {
  const sql = await Deno.readTextFile(MIGRATION);
  const balanceChecks = sql.match(/MARKETPLACE_POSTING_IMBALANCE/g)?.length ?? 0;
  if (balanceChecks < 2) throw new Error("Settlement and refund require independent balance checks.");
  if (!sql.includes("round(sum(amount), 4)")) throw new Error("Posting balance uses unbounded arithmetic.");
});

Deno.test("Marketplace browser RPCs remain service-role only", async () => {
  const sql = await Deno.readTextFile(MIGRATION);
  for (const fn of [
    "create_marketplace_listing_public_v2", "activate_marketplace_listing_public_v1",
    "reserve_marketplace_purchase_public_v1", "settle_marketplace_purchase_public_v1",
    "cancel_marketplace_listing_public_v2", "open_marketplace_dispute_public_v2",
  ]) {
    if (!sql.includes(`grant execute on function public.${fn}`)) throw new Error(`Missing service grant for ${fn}`);
    if (!sql.includes(`revoke all on function public.${fn}`)) throw new Error(`Missing public revoke for ${fn}`);
  }
});

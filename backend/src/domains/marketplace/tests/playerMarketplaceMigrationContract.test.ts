export {};

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: string): Promise<string>;
};

const REFERENCES = "supabase/migrations/20260721140000_add_marketplace_reference_scopes_v1.sql";
const LIFECYCLE = "supabase/migrations/20260721141000_add_player_marketplace_lifecycle_v2.sql";
const REPLAY = "supabase/migrations/20260721142000_harden_marketplace_resolution_replay_v1.sql";

Deno.test("Marketplace provisional migration sequence is forward-only and transaction wrapped", async () => {
  for (const path of [REFERENCES, LIFECYCLE, REPLAY]) {
    const sql = (await Deno.readTextFile(path)).trim().toLowerCase();
    if (!sql.startsWith("begin;")) throw new Error(`${path} must begin a transaction.`);
    if (!sql.endsWith("commit;")) throw new Error(`${path} must commit its transaction.`);
    if (/\bdrop\s+(?:table|column|schema)\b/.test(sql)) throw new Error(`${path} contains destructive DDL.`);
  }
});

Deno.test("Marketplace reference scopes preserve game-bound Store and Inventory lookups", async () => {
  const sql = await Deno.readTextFile(REFERENCES);
  for (const required of [
    "store_items_game_item_key_unique",
    "player_inventory_game_player_item_unique",
    "game_session_id",
    "player_id",
    "item_key",
  ]) {
    if (!sql.includes(required)) throw new Error(`Marketplace reference migration is missing ${required}`);
  }
});

Deno.test("Marketplace lifecycle defines atomic states, public identities, and immutable evidence", async () => {
  const sql = await Deno.readTextFile(LIFECYCLE);
  for (const required of [
    "create extension if not exists pgcrypto with schema extensions",
    "extensions.digest",
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
    "lst_", "mpr_", "ord_", "dsp_",
  ]) {
    if (!sql.includes(required)) throw new Error(`Marketplace migration is missing ${required}`);
  }
});

Deno.test("Marketplace settlement and refund posting groups are independently balanced", async () => {
  const sql = await Deno.readTextFile(LIFECYCLE);
  const balanceChecks = sql.match(/MARKETPLACE_POSTING_IMBALANCE/g)?.length ?? 0;
  if (balanceChecks < 2) throw new Error("Settlement and refund require independent balance checks.");
  if (!sql.includes("round(sum(amount), 4)")) throw new Error("Posting balance uses unbounded arithmetic.");
  for (const evidence of [
    "marketplace_orders_reservation_unique",
    "marketplace_financial_postings_reference_unique",
    "marketplace_receipts_reference_unique",
  ]) {
    if (!sql.includes(evidence)) throw new Error(`Exactly-once evidence is missing ${evidence}`);
  }
});

Deno.test("Marketplace browser and Admin RPCs remain service-role only", async () => {
  const sql = await Deno.readTextFile(LIFECYCLE);
  for (const fn of [
    "create_marketplace_listing_public_v2", "activate_marketplace_listing_public_v1",
    "reserve_marketplace_purchase_public_v1", "settle_marketplace_purchase_public_v1",
    "cancel_marketplace_listing_public_v2", "open_marketplace_dispute_public_v2",
    "review_marketplace_admin_v2", "set_marketplace_policy_admin_v2",
  ]) {
    if (!sql.includes(`grant execute on function public.${fn}`)) throw new Error(`Missing service grant for ${fn}`);
    if (!sql.includes(`revoke all on function public.${fn}`)) throw new Error(`Missing public revoke for ${fn}`);
  }
});

Deno.test("Marketplace strict Admin replay preserves exact terminal outcomes and rejects conflicts", async () => {
  const sql = await Deno.readTextFile(REPLAY);
  for (const required of [
    "review_marketplace_admin_strict_v1",
    "for update",
    "'resolved_buyer' and v_action = 'refund_buyer'",
    "'resolved_seller' and v_action = 'resolve_seller'",
    "'rejected' and v_action = 'reject'",
    "'replayed'::text",
    "MARKETPLACE_TERMINAL_RESOLUTION_CONFLICT",
    "review_marketplace_admin_v2",
    "revoke all on function public.review_marketplace_admin_strict_v1",
    "grant execute on function public.review_marketplace_admin_strict_v1",
  ]) {
    if (!sql.includes(required)) throw new Error(`Marketplace replay hardening is missing ${required}`);
  }
});

export {};

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: string): Promise<string>;
};

const PATH = "supabase/migrations/20260721143000_harden_marketplace_legacy_projection_conflicts_v1.sql";

Deno.test("Marketplace private projections use an explicit conflict policy and remain unreachable", async () => {
  const sql = await Deno.readTextFile(PATH);
  for (const required of [
    "#variable_conflict use_column",
    "pg_get_functiondef",
    "v_count <> 6",
    "create_marketplace_listing_projection_legacy_v2",
    "activate_marketplace_listing_projection_legacy_v1",
    "reserve_marketplace_purchase_projection_legacy_v1",
    "settle_marketplace_purchase_projection_legacy_v1",
    "cancel_marketplace_listing_projection_legacy_v2",
    "review_marketplace_admin_projection_legacy_v2",
    "from public, anon, authenticated, service_role",
  ]) {
    if (!sql.includes(required)) throw new Error(`Missing legacy projection hardening contract: ${required}`);
  }
  if (/alter\s+database/i.test(sql)) throw new Error("Conflict hardening must not change a database-wide setting.");
});

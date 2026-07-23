export {};

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: string): Promise<string>;
};

const RESTORE = "supabase/migrations/20260721142800_restore_marketplace_listing_reservation_wrapper_v1.sql";

Deno.test("Marketplace listing fixes preserve the authoritative reservation wrapper", async () => {
  const sql = await Deno.readTextFile(RESTORE);
  if (!sql.trim().startsWith("begin;") || !sql.trim().endsWith("commit;")) {
    throw new Error("Marketplace listing wrapper restoration must remain transaction wrapped.");
  }
  for (const required of [
    "create_marketplace_listing_projection_legacy_v2",
    "marketplace_reconcile_inventory_projection_v1",
    "marketplace_attach_listing_reservation_v1",
    "from public.store_items as si",
    "si.item_key = lower",
    "from public.inventory_holdings as ih",
    "from public.marketplace_listings as ml",
    "from public.inventory_reservations as ir",
    "grant execute on function public.create_marketplace_listing_public_v2",
  ]) {
    if (!sql.includes(required)) throw new Error(`Missing listing wrapper contract: ${required}`);
  }
  if (/set\s+quantity_reserved\s*=/.test(sql)) {
    throw new Error("The restored public wrapper must not mutate the reservation projection directly.");
  }
});

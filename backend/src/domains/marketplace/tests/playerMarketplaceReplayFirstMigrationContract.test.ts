export {};

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: string): Promise<string>;
};

const PATH = "supabase/migrations/20260728054000_replay_marketplace_purchase_before_resource_checks_v1.sql";

Deno.test("Marketplace purchase wrappers resolve exact replays before resource checks", async () => {
  const sql = await Deno.readTextFile(PATH);

  for (const required of [
    "buyer_idempotency_key = btrim(coalesce(p_idempotency_key, ''))",
    "reserve_marketplace_purchase_projection_legacy_v1",
    "reservation_id = v_reservation.id",
    "status in ('completed', 'disputed', 'refunded')",
    "settle_marketplace_purchase_projection_legacy_v1",
    "MARKETPLACE_RESERVATION_REPLAY_PATCH_INVALID",
    "MARKETPLACE_SETTLEMENT_REPLAY_PATCH_INVALID",
  ]) {
    if (!sql.includes(required)) throw new Error(`Missing replay-first Marketplace contract: ${required}`);
  }

  const reserveReplay = sql.indexOf("reserve_marketplace_purchase_projection_legacy_v1");
  const settleReplay = sql.indexOf("settle_marketplace_purchase_projection_legacy_v1");
  const reconciliation = sql.indexOf("marketplace_reconcile_inventory_projection_v1");

  if (reserveReplay < 0 || settleReplay < 0 || reconciliation < 0) {
    throw new Error("Replay-first Marketplace migration markers are incomplete.");
  }
  if (reserveReplay > reconciliation || settleReplay > reconciliation) {
    throw new Error("Exact purchase replays must resolve before inventory reconciliation.");
  }

  if (/alter\s+table\s+public\.marketplace_(policies|orders|purchase_reservations)/i.test(sql)) {
    throw new Error("Replay-first repair must not weaken Marketplace table contracts.");
  }
  if (/update\s+public\.(account_balances|inventory_holdings|marketplace_orders)/i.test(sql)) {
    throw new Error("Replay-first repair must not introduce direct economic mutations.");
  }
});

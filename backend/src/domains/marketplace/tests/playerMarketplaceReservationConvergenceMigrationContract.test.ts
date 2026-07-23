export {};

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: string): Promise<string>;
};

const LIFECYCLE = "supabase/migrations/20260721141000_add_player_marketplace_lifecycle_v2.sql";
const CONVERGENCE = "supabase/migrations/20260721142000_harden_marketplace_resolution_replay_v1.sql";

Deno.test("Marketplace keeps exactly three provisional migrations and layers convergence in the third file", async () => {
  const sql = await Deno.readTextFile(CONVERGENCE);
  assertIncludes(sql, "alter table public.inventory_reservations");
  assertIncludes(sql, "'marketplace_listing'");
  assertIncludes(sql, "inventory_reservations_marketplace_source_idx");
  assertIncludes(sql, "marketplace_inventory_projection_v1");
  assertIncludes(sql, "marketplace_reconcile_inventory_projection_v1");
  assertIncludes(sql, "marketplace_transition_listing_reservation_v1");
  assertIncludes(sql, "marketplace_assert_refund_inventory_available_v1");
  if (!sql.trim().startsWith("begin;") || !sql.trim().endsWith("commit;")) {
    throw new Error("Marketplace convergence migration must remain transaction wrapped.");
  }
});

Deno.test("Every reservation-sensitive public RPC is replaced by an authoritative wrapper", async () => {
  const sql = await Deno.readTextFile(CONVERGENCE);
  const replacements = [
    ["create_marketplace_listing_public_v2", "create_marketplace_listing_projection_legacy_v2"],
    ["activate_marketplace_listing_public_v1", "activate_marketplace_listing_projection_legacy_v1"],
    ["reserve_marketplace_purchase_public_v1", "reserve_marketplace_purchase_projection_legacy_v1"],
    ["settle_marketplace_purchase_public_v1", "settle_marketplace_purchase_projection_legacy_v1"],
    ["cancel_marketplace_listing_public_v2", "cancel_marketplace_listing_projection_legacy_v2"],
    ["review_marketplace_admin_v2", "review_marketplace_admin_projection_legacy_v2"],
  ] as const;

  for (const [publicName, legacyName] of replacements) {
    assertIncludes(sql, `rename to ${legacyName}`);
    const wrapper = `create or replace function public.${publicName}`;
    if (sql.lastIndexOf(wrapper) <= sql.indexOf(`rename to ${legacyName}`)) {
      throw new Error(`${publicName} was not recreated after private legacy rename.`);
    }
    assertIncludes(sql, `revoke all on function public.${legacyName}`);
  }

  assertIncludes(sql, "create or replace function public.expire_marketplace_purchase_reservations_v1");
  assertIncludes(sql, "create or replace function public.expire_marketplace_listings_v1");
});

Deno.test("Marketplace convergence covers create, activation, purchase, settlement, release, moderation, and refund paths", async () => {
  const sql = await Deno.readTextFile(CONVERGENCE);
  for (const required of [
    "marketplace_attach_listing_reservation_v1",
    "marketplace_assert_listing_reservation_v1",
    "'consume'",
    "'release'",
    "p_require_full",
    "MARKETPLACE_RESERVATION_PROJECTION_DRIFT",
    "MARKETPLACE_RESERVATION_OVER_RESERVED",
    "MARKETPLACE_RESERVATION_SCOPE_MISMATCH",
    "MARKETPLACE_RESERVATION_SOURCE_INVALID",
    "MARKETPLACE_RESERVATION_QUANTITY_UNAVAILABLE",
    "v_result.outcome = 'applied'",
    "v_result.outcome = 'insufficient_funds'",
    "v_result.status = 'rejected'",
    "v_action = 'refund_buyer'",
    "purchase_reservation_expired",
    "listing_expired",
  ]) {
    assertIncludes(sql, required);
  }
});

Deno.test("Legacy direct projection mutations cannot execute outside authoritative wrappers", async () => {
  const lifecycle = await Deno.readTextFile(LIFECYCLE);
  const convergence = await Deno.readTextFile(CONVERGENCE);
  const legacyDirectWrites = lifecycle.match(/set quantity_reserved\s*=|quantity_reserved\s*=\s*quantity_reserved\s*[-+]/g)?.length ?? 0;
  if (legacyDirectWrites < 5) {
    throw new Error("Expected the convergence audit to identify all historical projection writes.");
  }

  for (const legacy of [
    "create_marketplace_listing_projection_legacy_v2",
    "activate_marketplace_listing_projection_legacy_v1",
    "reserve_marketplace_purchase_projection_legacy_v1",
    "settle_marketplace_purchase_projection_legacy_v1",
    "cancel_marketplace_listing_projection_legacy_v2",
    "review_marketplace_admin_projection_legacy_v2",
  ]) {
    assertIncludes(convergence, `from public, anon, authenticated, service_role`);
    assertIncludes(convergence, legacy);
  }

  const reconcileCalls = convergence.match(/marketplace_reconcile_inventory_projection_v1/g)?.length ?? 0;
  const transitionCalls = convergence.match(/marketplace_transition_listing_reservation_v1/g)?.length ?? 0;
  if (reconcileCalls < 12 || transitionCalls < 6) {
    throw new Error(`Insufficient convergence coverage: reconcile=${reconcileCalls}, transition=${transitionCalls}`);
  }
});

Deno.test("Marketplace convergence preserves service-role-only public execution", async () => {
  const sql = await Deno.readTextFile(CONVERGENCE);
  for (const fn of [
    "create_marketplace_listing_public_v2",
    "activate_marketplace_listing_public_v1",
    "reserve_marketplace_purchase_public_v1",
    "settle_marketplace_purchase_public_v1",
    "cancel_marketplace_listing_public_v2",
    "review_marketplace_admin_v2",
    "review_marketplace_admin_strict_v1",
  ]) {
    assertIncludes(sql, `revoke all on function public.${fn}`);
    assertIncludes(sql, `grant execute on function public.${fn}`);
  }
});

function assertIncludes(value: string, expected: string): void {
  if (!value.includes(expected)) throw new Error(`Missing Marketplace convergence contract: ${expected}`);
}

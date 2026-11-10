// Disposable connected-acceptance setup only. Preserve every earlier journey's
// reservation and reject existing drift instead of silently repairing it.
export function marketplaceInventoryFixtureSql({ gameId, sellerId, itemId }) {
  for (const value of [gameId, sellerId, itemId]) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
      throw new Error("Marketplace inventory fixture requires database UUIDs.");
    }
  }
  return `
    do $marketplace_inventory_fixture$
    declare
      v_holding_id uuid;
    begin
      insert into public.inventory_holdings (
        game_session_id, player_id, store_item_id, quantity_owned, quantity_reserved
      ) values ('${gameId}', '${sellerId}', '${itemId}', 10, 0)
      on conflict on constraint inventory_holdings_scope_unique do nothing;

      select id into strict v_holding_id
      from public.inventory_holdings
      where game_session_id = '${gameId}'
        and player_id = '${sellerId}'
        and store_item_id = '${itemId}'
      for update;

      perform * from public.marketplace_reconcile_inventory_projection_v1(
        '${gameId}', '${sellerId}', v_holding_id, false
      );

      update public.inventory_holdings
      set quantity_owned = greatest(quantity_owned, quantity_reserved + 10)
      where id = v_holding_id;

      perform * from public.marketplace_reconcile_inventory_projection_v1(
        '${gameId}', '${sellerId}', v_holding_id, false
      );
    end
    $marketplace_inventory_fixture$;
  `;
}

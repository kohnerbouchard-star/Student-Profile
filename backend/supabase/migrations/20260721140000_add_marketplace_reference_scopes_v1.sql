begin;

create unique index if not exists store_items_marketplace_reference_scope_unique
  on public.store_items (game_session_id, id, item_key);

create unique index if not exists inventory_holdings_marketplace_reference_scope_unique
  on public.inventory_holdings (game_session_id, player_id, id, store_item_id);

commit;

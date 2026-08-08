-- Decouple shared inventory reservations from Store-offer identity V2.
-- Store provenance remains optional; canonical account/item context is authoritative.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create unique index if not exists inventory_holdings_game_id_unique
  on public.inventory_holdings(game_session_id, id);

alter table public.inventory_reservations
  drop constraint if exists inventory_reservations_game_session_id_player_id_inventory_fkey,
  drop constraint if exists inventory_reservations_game_session_id_store_item_id_item__fkey;

alter table public.inventory_reservations
  add constraint inventory_reservations_holding_scope_fk
    foreign key (game_session_id, inventory_holding_id)
    references public.inventory_holdings(game_session_id, id),
  add constraint inventory_reservations_store_provenance_scope_fk
    foreign key (game_session_id, store_item_id)
    references public.store_items(game_session_id, id);

comment on column public.inventory_reservations.item_key is
  'Compatibility/public source key. canonical_item_key and game_item_id are authoritative; store_item_id is optional acquisition provenance.';

commit;

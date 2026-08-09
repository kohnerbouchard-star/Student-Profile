-- Preserve Seed rollback semantics after canonical Store-stock projection V2.
-- History-free catalog rows may be deleted; any canonical journal history keeps
-- the Store provenance row intact so the legacy rollback path soft-archives it.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function economy_private.release_history_free_store_stock_projection_v2()
returns trigger
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
begin
  if old.inventory_account_id is null or old.game_item_id is null then
    return old;
  end if;

  -- Canonical journal history is not foreign-keyed to store_items. Raise the
  -- same SQLSTATE as a real FK dependency so the existing Seed rollback
  -- implementation preserves the Store row through its soft-rollback path.
  if exists (
    select 1
    from public.inventory_transaction_lines line
    where line.game_session_id = old.game_session_id
      and line.inventory_account_id = old.inventory_account_id
      and line.game_item_id = old.game_item_id
  ) then
    raise exception 'ECONOMIC_CORE_STORE_ROLLBACK_HISTORY_REQUIRED:%', old.item_key
      using errcode = '23503';
  end if;

  -- Remove only the synthetic Store-stock holding created from catalog state.
  -- If any other FK later blocks the Store DELETE, PostgreSQL rolls these
  -- trigger side effects back with that failed DELETE before the legacy rollback
  -- handler soft-archives the row.
  delete from public.inventory_holdings holding
  using public.inventory_accounts account, public.economic_parties party
  where holding.game_session_id = old.game_session_id
    and holding.player_id is null
    and holding.store_item_id = old.id
    and holding.inventory_account_id = old.inventory_account_id
    and holding.game_item_id = old.game_item_id
    and holding.quantity_reserved = 0
    and account.game_session_id = old.game_session_id
    and account.id = old.inventory_account_id
    and account.account_kind = 'store_stock'
    and account.location_key = 'store_item:' || old.id::text
    and party.game_session_id = old.game_session_id
    and party.id = account.party_id
    and party.party_kind = 'store'
    and party.system_key = 'store';

  -- A Store-stock account is scoped to one Store row by location_key. Remove it
  -- on a history-free hard rollback so repeated rollback/re-import cycles do not
  -- accumulate dead account shells. Any unexpected reference fails closed and
  -- sends the parent Store DELETE through the existing soft-rollback path.
  delete from public.inventory_accounts account
  where account.game_session_id = old.game_session_id
    and account.id = old.inventory_account_id
    and account.account_kind = 'store_stock'
    and account.location_key = 'store_item:' || old.id::text
    and not exists (
      select 1
      from public.inventory_holdings holding
      where holding.game_session_id = account.game_session_id
        and holding.inventory_account_id = account.id
    );

  return old;
end
$function$;

drop trigger if exists release_history_free_store_stock_projection_v2
  on public.store_items;
create trigger release_history_free_store_stock_projection_v2
before delete on public.store_items
for each row execute function economy_private.release_history_free_store_stock_projection_v2();

revoke all on function economy_private.release_history_free_store_stock_projection_v2()
  from public, anon, authenticated;
grant execute on function economy_private.release_history_free_store_stock_projection_v2()
  to service_role;

comment on function economy_private.release_history_free_store_stock_projection_v2() is
  'Allows history-free Seed Store rows to roll back after canonical stock projection while forcing journal-backed rows through the existing soft-rollback preservation path.';

commit;

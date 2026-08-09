-- Finalize history-free Seed Store rollback ordering V2.
-- The Store row itself references its canonical stock account, so account cleanup
-- must occur only after the Store DELETE has succeeded.

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
  -- If another Store FK blocks the parent DELETE, PostgreSQL rolls this trigger
  -- side effect back before the legacy rollback handler soft-archives the row.
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

  return old;
end
$function$;

create or replace function economy_private.cleanup_history_free_store_stock_account_v2()
returns trigger
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
begin
  if old.inventory_account_id is null then
    return old;
  end if;

  -- The Store row is now gone, so its exact per-offer stock account can be
  -- removed safely. Any unexpected reference fails closed: the whole Store
  -- DELETE rolls back and the existing Seed rollback handler soft-archives it.
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

drop trigger if exists cleanup_history_free_store_stock_account_v2
  on public.store_items;
create trigger cleanup_history_free_store_stock_account_v2
after delete on public.store_items
for each row execute function economy_private.cleanup_history_free_store_stock_account_v2();

revoke all on function economy_private.release_history_free_store_stock_projection_v2()
  from public, anon, authenticated;
revoke all on function economy_private.cleanup_history_free_store_stock_account_v2()
  from public, anon, authenticated;
grant execute on function economy_private.release_history_free_store_stock_projection_v2()
  to service_role;
grant execute on function economy_private.cleanup_history_free_store_stock_account_v2()
  to service_role;

comment on function economy_private.release_history_free_store_stock_projection_v2() is
  'Removes only history-free synthetic Store-stock holdings before a Seed Store hard rollback while preserving journal-backed provenance.';
comment on function economy_private.cleanup_history_free_store_stock_account_v2() is
  'Removes the exact per-Store stock account only after its history-free Store row has been deleted successfully.';

commit;

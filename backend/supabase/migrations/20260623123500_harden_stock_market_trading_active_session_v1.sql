-- Stock market trading active-session guard V1.
-- Prevents new stock orders from being created for expired, revoked, or inactive
-- player sessions. This keeps the V5 trading RPC aligned with player-session
-- access semantics without adding frontend, classroom-api, store, scheduler, or
-- remote deployment behavior.

create or replace function public.ensure_stock_order_active_player_session()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.player_sessions player_session
    where player_session.id = new.player_session_id
      and player_session.game_session_id = new.game_session_id
      and player_session.status = 'active'
      and player_session.revoked_at is null
      and player_session.expires_at > now()
  ) then
    raise exception 'STOCK_TRADING_PLAYER_SESSION_NOT_FOUND';
  end if;

  return new;
end;
$$;

comment on function public.ensure_stock_order_active_player_session() is
  'Rejects new stock orders unless the referenced player session is active, unrevoked, unexpired, and scoped to the same game session.';

revoke all on function public.ensure_stock_order_active_player_session() from public;
grant execute on function public.ensure_stock_order_active_player_session() to service_role;

drop trigger if exists ensure_stock_orders_active_player_session on public.stock_orders;

create trigger ensure_stock_orders_active_player_session
before insert on public.stock_orders
for each row
execute function public.ensure_stock_order_active_player_session();

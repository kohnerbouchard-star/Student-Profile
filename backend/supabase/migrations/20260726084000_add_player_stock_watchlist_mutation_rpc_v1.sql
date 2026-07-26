begin;

create or replace function public.set_player_stock_watchlist_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_ticker text,
  p_is_watchlisted boolean
)
returns table (
  game_session_id uuid,
  player_id uuid,
  stock_asset_id uuid,
  ticker text,
  is_watchlisted boolean,
  changed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_asset_id uuid;
  v_ticker text;
  v_changed_rows integer := 0;
begin
  if p_game_session_id is null
    or p_player_id is null
    or p_ticker is null
    or btrim(p_ticker) = ''
    or p_is_watchlisted is null then
    raise exception using
      errcode = '22023',
      message = 'player_stock_watchlist_invalid_request';
  end if;

  perform 1
  from public.players as player
  where player.game_session_id = p_game_session_id
    and player.id = p_player_id
    and player.status = 'active'
  for share;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'player_stock_watchlist_player_not_active';
  end if;

  select asset.id, asset.ticker
  into v_asset_id, v_ticker
  from public.game_session_stock_assets as asset
  where asset.game_session_id = p_game_session_id
    and upper(asset.ticker) = upper(btrim(p_ticker))
    and (not p_is_watchlisted or asset.is_active = true)
  order by asset.id
  limit 1
  for share;

  if v_asset_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'player_stock_watchlist_asset_not_available';
  end if;

  if p_is_watchlisted then
    insert into public.player_stock_watchlist (
      game_session_id,
      player_id,
      stock_asset_id
    )
    values (
      p_game_session_id,
      p_player_id,
      v_asset_id
    )
    on conflict (game_session_id, player_id, stock_asset_id) do nothing;
    get diagnostics v_changed_rows = row_count;
  else
    delete from public.player_stock_watchlist as watchlist
    where watchlist.game_session_id = p_game_session_id
      and watchlist.player_id = p_player_id
      and watchlist.stock_asset_id = v_asset_id;
    get diagnostics v_changed_rows = row_count;
  end if;

  return query
  select
    p_game_session_id,
    p_player_id,
    v_asset_id,
    v_ticker,
    p_is_watchlisted,
    v_changed_rows > 0;
end;
$$;

revoke all on function public.set_player_stock_watchlist_v1(
  uuid,
  uuid,
  text,
  boolean
) from public, anon, authenticated;

grant execute on function public.set_player_stock_watchlist_v1(
  uuid,
  uuid,
  text,
  boolean
) to service_role;

revoke insert, delete on table public.player_stock_watchlist from service_role;

grant select on table public.player_stock_watchlist to service_role;

comment on function public.set_player_stock_watchlist_v1(
  uuid,
  uuid,
  text,
  boolean
) is
  'Server-only idempotent watchlist mutation. Resolves one game-scoped ticker, validates an active player, and performs the write behind forced RLS.';

commit;

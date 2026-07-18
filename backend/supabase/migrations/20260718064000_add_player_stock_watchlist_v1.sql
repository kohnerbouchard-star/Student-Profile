begin;

create table public.player_stock_watchlist (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null,
  player_id uuid not null,
  stock_asset_id uuid not null,
  created_at timestamptz not null default now(),

  constraint player_stock_watchlist_player_scope_fk
    foreign key (game_session_id, player_id)
    references public.players (game_session_id, id)
    on delete cascade,
  constraint player_stock_watchlist_asset_scope_fk
    foreign key (game_session_id, stock_asset_id)
    references public.game_session_stock_assets (game_session_id, id)
    on delete cascade,
  constraint player_stock_watchlist_game_player_asset_unique
    unique (game_session_id, player_id, stock_asset_id)
);

create index player_stock_watchlist_player_created_idx
on public.player_stock_watchlist (
  game_session_id,
  player_id,
  created_at desc,
  id desc
);

create index player_stock_watchlist_asset_idx
on public.player_stock_watchlist (game_session_id, stock_asset_id);

create function public.ensure_player_stock_watchlist_active_scope_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  perform 1
  from public.players as player
  where player.game_session_id = new.game_session_id
    and player.id = new.player_id
    and player.status = 'active'
  for share;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'player_stock_watchlist_player_not_active';
  end if;

  perform 1
  from public.game_session_stock_assets as asset
  where asset.game_session_id = new.game_session_id
    and asset.id = new.stock_asset_id
    and asset.is_active = true
  for share;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'player_stock_watchlist_asset_not_available';
  end if;

  return new;
end;
$$;

create trigger ensure_player_stock_watchlist_active_scope
before insert
on public.player_stock_watchlist
for each row
execute function public.ensure_player_stock_watchlist_active_scope_v1();

alter table public.player_stock_watchlist enable row level security;
alter table public.player_stock_watchlist force row level security;

revoke all privileges on table public.player_stock_watchlist
from public, anon, authenticated;

grant select, insert, delete on table public.player_stock_watchlist
to service_role;

revoke all on function public.ensure_player_stock_watchlist_active_scope_v1()
from public, anon, authenticated;

comment on table public.player_stock_watchlist is
  'Server-managed player stock watchlist. Browser access is mediated through authenticated player-session Edge routes.';
comment on column public.player_stock_watchlist.game_session_id is
  'Game isolation boundary derived from the authenticated player session.';
comment on column public.player_stock_watchlist.player_id is
  'Internal player owner derived from the authenticated player session.';
comment on column public.player_stock_watchlist.stock_asset_id is
  'Per-game stock asset resolved from a public ticker by the Backend.';
comment on function public.ensure_player_stock_watchlist_active_scope_v1() is
  'Rejects inserts unless both the player and stock asset are active inside the same game session.';

commit;

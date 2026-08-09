-- Marketplace and redemption canonical-context compatibility V2.
-- Existing public workflows remain installed; these projections gain shared item,
-- account, and reservation authority without exposing internal UUIDs to clients.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

alter table public.marketplace_listings
  add column if not exists inventory_account_id uuid,
  add column if not exists game_item_id uuid,
  add column if not exists inventory_reservation_id uuid;

alter table public.marketplace_purchase_reservations
  add column if not exists game_item_id uuid;

alter table public.marketplace_orders
  add column if not exists game_item_id uuid;

alter table public.inventory_redemption_requests
  add column if not exists inventory_account_id uuid,
  add column if not exists game_item_id uuid,
  add column if not exists canonical_item_key text,
  add column if not exists inventory_reservation_id uuid;

update public.marketplace_listings ml
set
  inventory_account_id = h.inventory_account_id,
  game_item_id = h.game_item_id
from public.inventory_holdings h
where h.game_session_id = ml.game_session_id
  and h.id = ml.inventory_holding_id
  and (ml.inventory_account_id is null or ml.game_item_id is null);

update public.marketplace_purchase_reservations mpr
set game_item_id = ml.game_item_id
from public.marketplace_listings ml
where ml.game_session_id = mpr.game_session_id
  and ml.id = mpr.listing_id
  and mpr.game_item_id is null;

update public.marketplace_orders mo
set game_item_id = ml.game_item_id
from public.marketplace_listings ml
where ml.game_session_id = mo.game_session_id
  and ml.id = mo.listing_id
  and mo.game_item_id is null;

update public.inventory_redemption_requests rr
set
  inventory_account_id = h.inventory_account_id,
  game_item_id = h.game_item_id,
  canonical_item_key = gi.canonical_key
from public.inventory_holdings h
join public.game_items gi
  on gi.game_session_id = h.game_session_id
 and gi.id = h.game_item_id
where h.game_session_id = rr.game_session_id
  and h.id = rr.inventory_holding_id
  and (
    rr.inventory_account_id is null
    or rr.game_item_id is null
    or rr.canonical_item_key is null
  );

alter table public.marketplace_listings
  add constraint marketplace_listings_inventory_account_scope_fk
    foreign key (game_session_id, inventory_account_id)
    references public.inventory_accounts(game_session_id, id),
  add constraint marketplace_listings_game_item_scope_fk
    foreign key (game_session_id, game_item_id)
    references public.game_items(game_session_id, id),
  add constraint marketplace_listings_inventory_reservation_fk
    foreign key (inventory_reservation_id)
    references public.inventory_reservations(id);

alter table public.marketplace_purchase_reservations
  add constraint marketplace_purchase_reservations_game_item_scope_fk
    foreign key (game_session_id, game_item_id)
    references public.game_items(game_session_id, id);

alter table public.marketplace_orders
  add constraint marketplace_orders_game_item_scope_fk
    foreign key (game_session_id, game_item_id)
    references public.game_items(game_session_id, id);

alter table public.inventory_redemption_requests
  add constraint inventory_redemption_requests_inventory_account_scope_fk
    foreign key (game_session_id, inventory_account_id)
    references public.inventory_accounts(game_session_id, id),
  add constraint inventory_redemption_requests_game_item_scope_fk
    foreign key (game_session_id, game_item_id)
    references public.game_items(game_session_id, id),
  add constraint inventory_redemption_requests_inventory_reservation_fk
    foreign key (inventory_reservation_id)
    references public.inventory_reservations(id),
  add constraint inventory_redemption_requests_canonical_item_key_check
    check (canonical_item_key is null or canonical_item_key ~ '^[a-z0-9][a-z0-9._-]{0,159}$');

create or replace function economy_private.assign_marketplace_listing_context_v2()
returns trigger
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
declare
  v_holding public.inventory_holdings%rowtype;
  v_store_game_item_id uuid;
begin
  select h.* into v_holding
  from public.inventory_holdings h
  where h.game_session_id = new.game_session_id
    and h.id = new.inventory_holding_id
  for share;
  if not found
    or v_holding.player_id is distinct from new.seller_player_id
  then
    raise exception 'MARKETPLACE_HOLDING_SCOPE_INVALID' using errcode = 'P0001';
  end if;

  if new.store_item_id is not null then
    select si.game_item_id into v_store_game_item_id
    from public.store_items si
    where si.game_session_id = new.game_session_id
      and si.id = new.store_item_id;
    if not found or v_store_game_item_id is distinct from v_holding.game_item_id then
      raise exception 'MARKETPLACE_STORE_PROVENANCE_INVALID' using errcode = 'P0001';
    end if;
  end if;

  new.inventory_account_id := v_holding.inventory_account_id;
  new.game_item_id := v_holding.game_item_id;
  return new;
end
$function$;

create or replace function economy_private.assign_marketplace_purchase_context_v2()
returns trigger
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
declare
  v_listing public.marketplace_listings%rowtype;
begin
  select ml.* into v_listing
  from public.marketplace_listings ml
  where ml.game_session_id = new.game_session_id
    and ml.id = new.listing_id
  for share;
  if not found then
    raise exception 'MARKETPLACE_LISTING_SCOPE_INVALID' using errcode = 'P0001';
  end if;

  if new.seller_player_id is distinct from v_listing.seller_player_id then
    raise exception 'MARKETPLACE_SELLER_SCOPE_INVALID' using errcode = 'P0001';
  end if;

  new.game_item_id := v_listing.game_item_id;
  return new;
end
$function$;

create or replace function economy_private.assign_marketplace_order_context_v2()
returns trigger
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
declare
  v_listing public.marketplace_listings%rowtype;
  v_reservation public.marketplace_purchase_reservations%rowtype;
begin
  select ml.* into v_listing
  from public.marketplace_listings ml
  where ml.game_session_id = new.game_session_id
    and ml.id = new.listing_id
  for share;
  if not found then
    raise exception 'MARKETPLACE_LISTING_SCOPE_INVALID' using errcode = 'P0001';
  end if;

  select mpr.* into v_reservation
  from public.marketplace_purchase_reservations mpr
  where mpr.game_session_id = new.game_session_id
    and mpr.id = new.reservation_id
  for share;
  if not found
    or v_reservation.listing_id is distinct from v_listing.id
    or v_reservation.game_item_id is distinct from v_listing.game_item_id
  then
    raise exception 'MARKETPLACE_PURCHASE_SCOPE_INVALID' using errcode = 'P0001';
  end if;

  new.game_item_id := v_listing.game_item_id;
  return new;
end
$function$;

create or replace function economy_private.assign_redemption_context_v2()
returns trigger
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
declare
  v_holding public.inventory_holdings%rowtype;
  v_canonical_key text;
begin
  select h.* into v_holding
  from public.inventory_holdings h
  where h.game_session_id = new.game_session_id
    and h.id = new.inventory_holding_id
  for share;
  if not found
    or v_holding.player_id is distinct from new.player_id
  then
    raise exception 'INVENTORY_REDEMPTION_HOLDING_SCOPE_INVALID' using errcode = 'P0001';
  end if;

  if new.store_item_id is not null
    and v_holding.store_item_id is distinct from new.store_item_id
  then
    raise exception 'INVENTORY_REDEMPTION_STORE_PROVENANCE_INVALID' using errcode = 'P0001';
  end if;

  select gi.canonical_key into v_canonical_key
  from public.game_items gi
  where gi.game_session_id = new.game_session_id
    and gi.id = v_holding.game_item_id;
  if not found then
    raise exception 'INVENTORY_REDEMPTION_ITEM_SCOPE_INVALID' using errcode = 'P0001';
  end if;

  new.inventory_account_id := v_holding.inventory_account_id;
  new.game_item_id := v_holding.game_item_id;
  new.canonical_item_key := v_canonical_key;
  return new;
end
$function$;

create or replace function economy_private.mirror_redemption_reservation_v2()
returns trigger
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
declare
  v_reservation public.inventory_reservations%rowtype;
begin
  if new.status in ('pending', 'approved') then
    insert into public.inventory_reservations (
      game_session_id,
      player_id,
      inventory_holding_id,
      store_item_id,
      inventory_account_id,
      game_item_id,
      item_key,
      canonical_item_key,
      reason_type,
      source_id,
      quantity,
      status
    ) values (
      new.game_session_id,
      new.player_id,
      new.inventory_holding_id,
      new.store_item_id,
      new.inventory_account_id,
      new.game_item_id,
      new.item_key,
      new.canonical_item_key,
      'redemption',
      new.id,
      new.quantity,
      'active'
    )
    on conflict (
      game_session_id,
      player_id,
      inventory_holding_id,
      reason_type,
      source_id
    ) do update set
      quantity = excluded.quantity,
      status = 'active',
      released_at = null,
      consumed_at = null
    returning * into v_reservation;
  else
    select r.* into v_reservation
    from public.inventory_reservations r
    where r.game_session_id = new.game_session_id
      and r.player_id = new.player_id
      and r.inventory_holding_id = new.inventory_holding_id
      and r.reason_type = 'redemption'
      and r.source_id = new.id
    for update;

    if found then
      update public.inventory_reservations
      set
        status = case when new.status = 'fulfilled' then 'consumed' else 'released' end,
        consumed_at = case when new.status = 'fulfilled' then coalesce(new.fulfilled_at, now()) else null end,
        released_at = case when new.status = 'rejected' then coalesce(new.reviewed_at, now()) else null end
      where id = v_reservation.id
      returning * into v_reservation;
    end if;
  end if;

  if v_reservation.id is not null
    and new.inventory_reservation_id is distinct from v_reservation.id
  then
    update public.inventory_redemption_requests
    set inventory_reservation_id = v_reservation.id
    where id = new.id;
  end if;

  return new;
end
$function$;

create trigger assign_marketplace_listing_context_v2
before insert or update of game_session_id, seller_player_id, inventory_holding_id, store_item_id,
  inventory_account_id, game_item_id
on public.marketplace_listings
for each row execute function economy_private.assign_marketplace_listing_context_v2();

create trigger assign_marketplace_purchase_context_v2
before insert or update of game_session_id, listing_id, seller_player_id, game_item_id
on public.marketplace_purchase_reservations
for each row execute function economy_private.assign_marketplace_purchase_context_v2();

create trigger assign_marketplace_order_context_v2
before insert or update of game_session_id, listing_id, reservation_id, game_item_id
on public.marketplace_orders
for each row execute function economy_private.assign_marketplace_order_context_v2();

create trigger assign_redemption_context_v2
before insert or update of game_session_id, player_id, inventory_holding_id, store_item_id,
  inventory_account_id, game_item_id, canonical_item_key
on public.inventory_redemption_requests
for each row execute function economy_private.assign_redemption_context_v2();

create trigger mirror_redemption_reservation_v2
after insert or update of status, quantity
on public.inventory_redemption_requests
for each row execute function economy_private.mirror_redemption_reservation_v2();

-- Backfill shared reservations for any pre-existing redemption requests.
insert into public.inventory_reservations (
  game_session_id,
  player_id,
  inventory_holding_id,
  store_item_id,
  inventory_account_id,
  game_item_id,
  item_key,
  canonical_item_key,
  reason_type,
  source_id,
  quantity,
  status,
  consumed_at,
  released_at
)
select
  rr.game_session_id,
  rr.player_id,
  rr.inventory_holding_id,
  rr.store_item_id,
  rr.inventory_account_id,
  rr.game_item_id,
  rr.item_key,
  rr.canonical_item_key,
  'redemption',
  rr.id,
  rr.quantity,
  case when rr.status = 'fulfilled' then 'consumed' when rr.status = 'rejected' then 'released' else 'active' end,
  case when rr.status = 'fulfilled' then rr.fulfilled_at else null end,
  case when rr.status = 'rejected' then rr.reviewed_at else null end
from public.inventory_redemption_requests rr
where rr.inventory_account_id is not null
  and rr.game_item_id is not null
on conflict (
  game_session_id,
  player_id,
  inventory_holding_id,
  reason_type,
  source_id
) do nothing;

update public.inventory_redemption_requests rr
set inventory_reservation_id = r.id
from public.inventory_reservations r
where r.game_session_id = rr.game_session_id
  and r.player_id = rr.player_id
  and r.inventory_holding_id = rr.inventory_holding_id
  and r.reason_type = 'redemption'
  and r.source_id = rr.id
  and rr.inventory_reservation_id is null;

revoke all on function economy_private.assign_marketplace_listing_context_v2() from public, anon, authenticated;
revoke all on function economy_private.assign_marketplace_purchase_context_v2() from public, anon, authenticated;
revoke all on function economy_private.assign_marketplace_order_context_v2() from public, anon, authenticated;
revoke all on function economy_private.assign_redemption_context_v2() from public, anon, authenticated;
revoke all on function economy_private.mirror_redemption_reservation_v2() from public, anon, authenticated;
grant execute on function economy_private.assign_marketplace_listing_context_v2() to service_role;
grant execute on function economy_private.assign_marketplace_purchase_context_v2() to service_role;
grant execute on function economy_private.assign_marketplace_order_context_v2() to service_role;
grant execute on function economy_private.assign_redemption_context_v2() to service_role;
grant execute on function economy_private.mirror_redemption_reservation_v2() to service_role;

commit;

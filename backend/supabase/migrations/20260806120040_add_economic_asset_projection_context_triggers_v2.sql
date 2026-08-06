-- Economic asset projection context triggers V2.
-- Ordered, forward-only domain migration.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- Compatibility triggers. Legacy callers may omit canonical columns; the
-- database fills them without changing any public route or request contract.
-- ---------------------------------------------------------------------------

create or replace function economy_private.assign_inventory_holding_context_v2()
returns trigger
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
begin
  if new.inventory_account_id is null and new.player_id is not null then
    new.inventory_account_id := economy_private.ensure_player_inventory_account_v2(
      new.game_session_id,
      new.player_id
    );
  end if;

  if new.game_item_id is null and new.store_item_id is not null then
    select si.game_item_id into new.game_item_id
    from public.store_items si
    where si.game_session_id = new.game_session_id and si.id = new.store_item_id;
  end if;

  if new.game_item_id is null or new.inventory_account_id is null then
    raise exception 'ECONOMIC_CORE_HOLDING_CONTEXT_REQUIRED' using errcode = 'P0001';
  end if;

  new.version := greatest(coalesce(new.version, 1), 1);
  return new;
end
$function$;

create trigger assign_inventory_holding_context_v2
before insert or update of game_session_id, player_id, store_item_id, inventory_account_id, game_item_id
on public.inventory_holdings
for each row execute function economy_private.assign_inventory_holding_context_v2();

create or replace function economy_private.assign_inventory_event_context_v2()
returns trigger
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
begin
  if new.inventory_account_id is null and new.player_id is not null then
    new.inventory_account_id := economy_private.ensure_player_inventory_account_v2(
      new.game_session_id,
      new.player_id
    );
  end if;

  if new.game_item_id is null and new.store_item_id is not null then
    select si.game_item_id into new.game_item_id
    from public.store_items si
    where si.game_session_id = new.game_session_id and si.id = new.store_item_id;
  end if;

  if new.game_item_id is null or new.inventory_account_id is null then
    raise exception 'ECONOMIC_CORE_EVENT_CONTEXT_REQUIRED' using errcode = 'P0001';
  end if;

  return new;
end
$function$;

create trigger assign_inventory_event_context_v2
before insert or update of game_session_id, player_id, store_item_id, inventory_account_id, game_item_id
on public.inventory_events
for each row execute function economy_private.assign_inventory_event_context_v2();

create or replace function economy_private.assign_inventory_reservation_context_v2()
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
    and h.id = new.inventory_holding_id;
  if not found then
    raise exception 'ECONOMIC_CORE_RESERVATION_HOLDING_REQUIRED' using errcode = 'P0001';
  end if;

  if new.player_id is not null and v_holding.player_id is distinct from new.player_id then
    raise exception 'ECONOMIC_CORE_RESERVATION_PLAYER_SCOPE_MISMATCH' using errcode = 'P0001';
  end if;
  if new.store_item_id is not null and v_holding.store_item_id is distinct from new.store_item_id then
    raise exception 'ECONOMIC_CORE_RESERVATION_STORE_SCOPE_MISMATCH' using errcode = 'P0001';
  end if;
  if new.inventory_account_id is not null and v_holding.inventory_account_id is distinct from new.inventory_account_id then
    raise exception 'ECONOMIC_CORE_RESERVATION_ACCOUNT_SCOPE_MISMATCH' using errcode = 'P0001';
  end if;
  if new.game_item_id is not null and v_holding.game_item_id is distinct from new.game_item_id then
    raise exception 'ECONOMIC_CORE_RESERVATION_ITEM_SCOPE_MISMATCH' using errcode = 'P0001';
  end if;

  select gi.canonical_key into v_canonical_key
  from public.game_items gi
  where gi.game_session_id = new.game_session_id
    and gi.id = v_holding.game_item_id;
  if not found then
    raise exception 'ECONOMIC_CORE_RESERVATION_ITEM_REQUIRED' using errcode = 'P0001';
  end if;

  new.player_id := coalesce(new.player_id, v_holding.player_id);
  new.store_item_id := coalesce(new.store_item_id, v_holding.store_item_id);
  new.inventory_account_id := v_holding.inventory_account_id;
  new.game_item_id := v_holding.game_item_id;
  new.canonical_item_key := v_canonical_key;
  new.item_key := coalesce(nullif(btrim(new.item_key), ''), v_canonical_key);
  return new;
end
$function$;

create trigger assign_inventory_reservation_context_v2
before insert or update of game_session_id, player_id, inventory_holding_id, store_item_id,
  inventory_account_id, game_item_id, item_key, canonical_item_key
on public.inventory_reservations
for each row execute function economy_private.assign_inventory_reservation_context_v2();

create or replace function economy_private.assign_item_supply_context_v2()
returns trigger
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
begin
  if new.game_item_id is null then
    select gi.id into new.game_item_id
    from public.game_items gi
    where gi.game_session_id = new.game_session_id
      and gi.canonical_key = new.item_key
    limit 1;
  end if;
  if new.game_item_id is null then
    raise exception 'ECONOMIC_CORE_SUPPLY_ITEM_REQUIRED' using errcode = 'P0001';
  end if;
  return new;
end
$function$;

create trigger assign_item_supply_context_v2
before insert or update of game_session_id, item_key, game_item_id
on public.game_session_item_supply
for each row execute function economy_private.assign_item_supply_context_v2();

commit;

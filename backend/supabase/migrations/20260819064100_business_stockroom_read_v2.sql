-- Business V2 Phase 3A: canonical Business Stockroom read authority.
-- Reads the economic-asset warehouse projection only; no legacy Business inventory authority.

begin;

create or replace function public.resolve_player_business_v2(
  p_game_session_id uuid,
  p_player_id uuid
)
returns table (
  business_id uuid,
  business_key text,
  country_code text,
  currency_code text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
  v_row record;
begin
  if p_game_session_id is null then raise exception 'GAME_SESSION_REQUIRED'; end if;
  if p_player_id is null then raise exception 'PLAYER_REQUIRED'; end if;

  select count(*)::integer
  into v_count
  from public.business_entities b
  where b.game_session_id = p_game_session_id
    and b.status <> 'closed'
    and (
      exists (
        select 1
        from public.business_ownership_positions ownership
        where ownership.game_session_id = p_game_session_id
          and ownership.business_id = b.id
          and ownership.player_id = p_player_id
          and ownership.status = 'active'
          and ownership.ended_at is null
      )
      or (
        b.ownership_model_version = 1
        and b.owner_player_id = p_player_id
      )
    );

  if v_count = 0 then raise exception 'BUSINESS_NOT_FOUND'; end if;
  if v_count > 1 then raise exception 'BUSINESS_OWNERSHIP_AMBIGUOUS'; end if;

  select b.id, b.public_key, b.country_code, b.currency_code
  into v_row
  from public.business_entities b
  where b.game_session_id = p_game_session_id
    and b.status <> 'closed'
    and (
      exists (
        select 1
        from public.business_ownership_positions ownership
        where ownership.game_session_id = p_game_session_id
          and ownership.business_id = b.id
          and ownership.player_id = p_player_id
          and ownership.status = 'active'
          and ownership.ended_at is null
      )
      or (
        b.ownership_model_version = 1
        and b.owner_player_id = p_player_id
      )
    )
  limit 1;

  return query select v_row.id, v_row.public_key, v_row.country_code, v_row.currency_code;
end;
$$;

revoke all on function public.resolve_player_business_v2(uuid,uuid) from public, anon, authenticated;
grant execute on function public.resolve_player_business_v2(uuid,uuid) to service_role;

create or replace function public.read_owned_business_stockroom_v2(
  p_game_session_id uuid,
  p_player_id uuid
)
returns table (
  business_key text,
  account_key text,
  item_key text,
  canonical_key text,
  item_name text,
  item_class text,
  item_subtype text,
  quantity_owned numeric,
  quantity_reserved numeric,
  quantity_available numeric,
  average_unit_cost numeric,
  cost_currency_code text,
  holding_version bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_business record;
begin
  select * into v_business
  from public.resolve_player_business_v2(p_game_session_id, p_player_id);

  return query
  select
    v_business.business_key,
    account.public_key,
    item.public_key,
    item.canonical_key,
    item.name,
    item.item_class,
    item.subtype,
    holding.quantity_owned,
    holding.quantity_reserved,
    greatest(holding.quantity_owned - holding.quantity_reserved, 0),
    holding.average_unit_cost,
    holding.cost_currency_code,
    holding.version
  from public.economic_parties party
  join public.inventory_accounts account
    on account.game_session_id = party.game_session_id
   and account.party_id = party.id
   and account.account_kind = 'warehouse'
   and account.status = 'active'
   and account.location_key is null
  join public.inventory_holdings holding
    on holding.game_session_id = account.game_session_id
   and holding.inventory_account_id = account.id
  join public.game_items item
    on item.game_session_id = holding.game_session_id
   and item.id = holding.game_item_id
  where party.game_session_id = p_game_session_id
    and party.party_kind = 'business'
    and party.business_id = v_business.business_id
    and party.status = 'active'
    and holding.quantity_owned > 0
    and item.status = 'active'
  order by item.item_class, item.name, item.canonical_key;
end;
$$;

revoke all on function public.read_owned_business_stockroom_v2(uuid,uuid) from public, anon, authenticated;
grant execute on function public.read_owned_business_stockroom_v2(uuid,uuid) to service_role;

commit;

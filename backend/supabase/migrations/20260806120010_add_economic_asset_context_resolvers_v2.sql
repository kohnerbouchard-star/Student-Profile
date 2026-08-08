-- Economic asset account context resolvers V2.
-- Ordered, forward-only domain migration.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- Internal context resolvers. These are never browser-callable.
-- ---------------------------------------------------------------------------

create or replace function economy_private.ensure_player_inventory_account_v2(
  p_game_session_id uuid,
  p_player_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
declare
  v_party_id uuid;
  v_account_id uuid;
begin
  if not exists (
    select 1 from public.players p
    where p.game_session_id = p_game_session_id and p.id = p_player_id
  ) then
    raise exception 'ECONOMIC_CORE_PLAYER_NOT_FOUND' using errcode = 'P0001';
  end if;

  insert into public.economic_parties(game_session_id, party_kind, player_id, status)
  values (p_game_session_id, 'player', p_player_id, 'active')
  on conflict (game_session_id, player_id) where player_id is not null
  do update set status = case when public.economic_parties.status = 'closed' then 'closed' else 'active' end
  returning id into v_party_id;

  insert into public.inventory_accounts(game_session_id, party_id, account_kind, location_key, status)
  values (p_game_session_id, v_party_id, 'personal', null, 'active')
  on conflict (
    game_session_id,
    party_id,
    account_kind,
    (coalesce(location_key, ''))
  ) do update set status = case when public.inventory_accounts.status = 'closed' then 'closed' else 'active' end
  returning id into v_account_id;

  return v_account_id;
end
$function$;

create or replace function economy_private.ensure_business_inventory_account_v2(
  p_game_session_id uuid,
  p_business_id uuid,
  p_account_kind text
)
returns uuid
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
declare
  v_party_id uuid;
  v_account_id uuid;
begin
  if p_account_kind not in ('warehouse','work_in_progress','finished_goods') then
    raise exception 'ECONOMIC_CORE_BUSINESS_ACCOUNT_KIND_INVALID' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.business_entities b
    where b.game_session_id = p_game_session_id and b.id = p_business_id
  ) then
    raise exception 'ECONOMIC_CORE_BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  insert into public.economic_parties(game_session_id, party_kind, business_id, status)
  values (p_game_session_id, 'business', p_business_id, 'active')
  on conflict (game_session_id, business_id) where business_id is not null
  do update set status = case when public.economic_parties.status = 'closed' then 'closed' else 'active' end
  returning id into v_party_id;

  insert into public.inventory_accounts(game_session_id, party_id, account_kind, location_key, status)
  values (p_game_session_id, v_party_id, p_account_kind, null, 'active')
  on conflict (
    game_session_id,
    party_id,
    account_kind,
    (coalesce(location_key, ''))
  ) do update set status = case when public.inventory_accounts.status = 'closed' then 'closed' else 'active' end
  returning id into v_account_id;

  return v_account_id;
end
$function$;

create or replace function economy_private.ensure_system_inventory_account_v2(
  p_game_session_id uuid,
  p_party_kind text,
  p_system_key text,
  p_account_kind text,
  p_location_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
declare
  v_party_id uuid;
  v_account_id uuid;
begin
  if p_party_kind not in ('store','escrow','country','system') then
    raise exception 'ECONOMIC_CORE_SYSTEM_PARTY_KIND_INVALID' using errcode = 'P0001';
  end if;

  insert into public.economic_parties(game_session_id, party_kind, system_key, status)
  values (p_game_session_id, p_party_kind, lower(btrim(p_system_key)), 'active')
  on conflict (game_session_id, party_kind, system_key) where system_key is not null
  do update set status = case when public.economic_parties.status = 'closed' then 'closed' else 'active' end
  returning id into v_party_id;

  insert into public.inventory_accounts(game_session_id, party_id, account_kind, location_key, status)
  values (p_game_session_id, v_party_id, p_account_kind, nullif(btrim(coalesce(p_location_key, '')), ''), 'active')
  on conflict (
    game_session_id,
    party_id,
    account_kind,
    (coalesce(location_key, ''))
  ) do update set status = case when public.inventory_accounts.status = 'closed' then 'closed' else 'active' end
  returning id into v_account_id;

  return v_account_id;
end
$function$;

revoke all on function economy_private.ensure_player_inventory_account_v2(uuid, uuid) from public, anon, authenticated;
revoke all on function economy_private.ensure_business_inventory_account_v2(uuid, uuid, text) from public, anon, authenticated;
revoke all on function economy_private.ensure_system_inventory_account_v2(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function economy_private.ensure_player_inventory_account_v2(uuid, uuid) to service_role;
grant execute on function economy_private.ensure_business_inventory_account_v2(uuid, uuid, text) to service_role;
grant execute on function economy_private.ensure_system_inventory_account_v2(uuid, text, text, text, text) to service_role;

commit;

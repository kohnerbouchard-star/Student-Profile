-- Business V2 Phase 5A: canonical Business equipment capacity foundation.
-- Additive, forward-only, and intentionally excludes timed manufacturing and maintenance settlement.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- Canonical equipment-instance ownership compatibility
-- ---------------------------------------------------------------------------

alter table public.equipment_instances
  alter column player_id drop not null;

create unique index if not exists equipment_instances_scope_id_unique
  on public.equipment_instances(game_session_id, id);

alter table public.equipment_instances
  drop constraint if exists equipment_instances_owner_shape_v2;

alter table public.equipment_instances
  add constraint equipment_instances_owner_shape_v2 check (
    player_id is not null
    or equipped_slot is null
  ) not valid;

alter table public.equipment_instances
  validate constraint equipment_instances_owner_shape_v2;

create or replace function economy_private.assign_equipment_instance_context_v2()
returns trigger
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
declare
  v_account public.inventory_accounts%rowtype;
  v_party public.economic_parties%rowtype;
  v_item public.game_items%rowtype;
  v_definition public.physical_economy_item_definitions%rowtype;
  v_store_game_item_id uuid;
begin
  if new.game_session_id is null then
    raise exception 'ECONOMIC_CORE_EQUIPMENT_GAME_REQUIRED' using errcode = 'P0001';
  end if;

  if new.inventory_account_id is null then
    if new.player_id is null then
      raise exception 'ECONOMIC_CORE_EQUIPMENT_ACCOUNT_REQUIRED' using errcode = 'P0001';
    end if;
    new.inventory_account_id := economy_private.ensure_player_inventory_account_v2(
      new.game_session_id,
      new.player_id
    );
  end if;

  select account_row.*
  into v_account
  from public.inventory_accounts as account_row
  where account_row.game_session_id = new.game_session_id
    and account_row.id = new.inventory_account_id
    and account_row.status = 'active'
  for share;
  if not found then
    raise exception 'ECONOMIC_CORE_EQUIPMENT_ACCOUNT_INVALID' using errcode = 'P0001';
  end if;

  select party_row.*
  into v_party
  from public.economic_parties as party_row
  where party_row.game_session_id = new.game_session_id
    and party_row.id = v_account.party_id
    and party_row.status = 'active'
  for share;
  if not found then
    raise exception 'ECONOMIC_CORE_EQUIPMENT_PARTY_INVALID' using errcode = 'P0001';
  end if;

  if v_party.party_kind = 'player' then
    if v_account.account_kind <> 'personal'
      or v_party.player_id is null
      or (
        new.player_id is not null
        and new.player_id is distinct from v_party.player_id
      )
    then
      raise exception 'ECONOMIC_CORE_EQUIPMENT_PLAYER_SCOPE_INVALID' using errcode = 'P0001';
    end if;
    new.player_id := v_party.player_id;
  elsif v_party.party_kind = 'business' then
    if v_account.account_kind <> 'warehouse'
      or v_party.business_id is null
      or new.player_id is not null
      or new.equipped_slot is not null
    then
      raise exception 'ECONOMIC_CORE_EQUIPMENT_BUSINESS_SCOPE_INVALID' using errcode = 'P0001';
    end if;
    new.player_id := null;
    new.equipped_slot := null;
    new.equipped_at := null;
  else
    raise exception 'ECONOMIC_CORE_EQUIPMENT_OWNER_KIND_INVALID' using errcode = 'P0001';
  end if;

  if new.store_item_id is not null then
    select store_item.game_item_id
    into v_store_game_item_id
    from public.store_items as store_item
    where store_item.game_session_id = new.game_session_id
      and store_item.id = new.store_item_id;
    if not found then
      raise exception 'ECONOMIC_CORE_EQUIPMENT_STORE_PROVENANCE_INVALID' using errcode = 'P0001';
    end if;
  end if;

  if new.game_item_id is null then
    new.game_item_id := v_store_game_item_id;
  end if;

  select item_row.*
  into v_item
  from public.game_items as item_row
  where item_row.game_session_id = new.game_session_id
    and item_row.id = new.game_item_id
    and item_row.status = 'active'
  for share;
  if not found
    or v_item.item_class <> 'equipment'
    or not v_item.serialized
    or v_item.physical_item_definition_id is null
    or (
      v_store_game_item_id is not null
      and v_store_game_item_id is distinct from v_item.id
    )
  then
    raise exception 'ECONOMIC_CORE_EQUIPMENT_ITEM_SCOPE_INVALID' using errcode = 'P0001';
  end if;

  select definition_row.*
  into v_definition
  from public.physical_economy_item_definitions as definition_row
  where definition_row.id = v_item.physical_item_definition_id
    and definition_row.item_class = 'equipment'
    and definition_row.status = 'active'
  for share;
  if not found then
    raise exception 'ECONOMIC_CORE_EQUIPMENT_DEFINITION_INACTIVE' using errcode = 'P0001';
  end if;

  new.item_key := v_item.canonical_key;
  return new;
end
$function$;

comment on function economy_private.assign_equipment_instance_context_v2() is
  'Derives serialized equipment ownership from canonical inventory account and economic party. '
  'Player personal and Business warehouse ownership are supported; browser-authored owner outcomes are rejected.';

-- The existing trigger already targets this function. Recreate it to ensure its
-- column list includes the ownership fields after the compatibility cutover.
drop trigger if exists assign_equipment_instance_context_v2
  on public.equipment_instances;
create trigger assign_equipment_instance_context_v2
before insert or update of game_session_id, player_id, store_item_id, item_key,
  inventory_account_id, game_item_id, equipped_slot
on public.equipment_instances
for each row execute function economy_private.assign_equipment_instance_context_v2();

-- ---------------------------------------------------------------------------
-- Server-owned equipment capacity profiles
-- ---------------------------------------------------------------------------

create table if not exists public.business_equipment_capacity_profiles (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique default ('bcp_' || encode(gen_random_bytes(16), 'hex')),
  equipment_item_definition_id uuid not null
    references public.physical_economy_item_definitions(id) on delete restrict,
  base_capacity_minutes_per_period integer not null,
  capability_keys text[] not null,
  status text not null default 'active',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_equipment_capacity_profiles_public_key_check
    check (public_key ~ '^bcp_[0-9a-f]{32}$'),
  constraint business_equipment_capacity_profiles_capacity_check
    check (base_capacity_minutes_per_period between 1 and 100000),
  constraint business_equipment_capacity_profiles_capability_check
    check (cardinality(capability_keys) between 1 and 64),
  constraint business_equipment_capacity_profiles_status_check
    check (status in ('active','disabled','retired')),
  constraint business_equipment_capacity_profiles_version_check
    check (version > 0),
  constraint business_equipment_capacity_profiles_definition_unique
    unique (equipment_item_definition_id)
);

create trigger set_business_equipment_capacity_profiles_updated_at
before update on public.business_equipment_capacity_profiles
for each row execute function public.set_current_timestamp_updated_at();

alter table public.business_equipment_capacity_profiles enable row level security;
revoke all on table public.business_equipment_capacity_profiles from public, anon, authenticated;
grant select, insert, update, delete on table public.business_equipment_capacity_profiles to service_role;

create or replace function public.ensure_business_equipment_capacity_profile_v2(
  p_equipment_item_definition_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_definition public.physical_economy_item_definitions%rowtype;
  v_profile_id uuid;
  v_capacity integer;
  v_capabilities text[];
begin
  select definition_row.*
  into v_definition
  from public.physical_economy_item_definitions as definition_row
  where definition_row.id = p_equipment_item_definition_id
    and definition_row.item_class = 'equipment'
    and definition_row.status = 'active'
  for share;
  if not found then
    raise exception 'BUSINESS_EQUIPMENT_DEFINITION_NOT_ACTIVE' using errcode = 'P0001';
  end if;

  if coalesce(v_definition.metadata->>'businessCapacityMinutesPerPeriod', '') ~ '^[0-9]+$' then
    v_capacity := least(
      100000,
      greatest(1, (v_definition.metadata->>'businessCapacityMinutesPerPeriod')::integer)
    );
  else
    v_capacity := case v_definition.equipment_slot
      when 'operations' then 480
      when 'analysis' then 420
      when 'field' then 360
      else 360
    end;
  end if;

  select array_agg(capability order by capability)
  into v_capabilities
  from (
    select distinct lower(btrim(raw_capability)) as capability
    from unnest(
      array_append(
        array_append(
          coalesce(v_definition.tool_tags, '{}'::text[]),
          v_definition.item_key
        ),
        coalesce(v_definition.effect_code, '')
      )
    ) as raw(raw_capability)
    where lower(btrim(raw_capability)) ~ '^[a-z0-9][a-z0-9._-]{0,127}$'
  ) as normalized;

  if coalesce(cardinality(v_capabilities), 0) = 0 then
    raise exception 'BUSINESS_EQUIPMENT_CAPABILITY_MISSING' using errcode = 'P0001';
  end if;

  insert into public.business_equipment_capacity_profiles (
    equipment_item_definition_id,
    base_capacity_minutes_per_period,
    capability_keys,
    status
  ) values (
    v_definition.id,
    v_capacity,
    v_capabilities,
    'active'
  )
  on conflict on constraint business_equipment_capacity_profiles_definition_unique
  do nothing
  returning id into v_profile_id;

  if v_profile_id is null then
    select profile.id
    into v_profile_id
    from public.business_equipment_capacity_profiles as profile
    where profile.equipment_item_definition_id = v_definition.id
      and profile.status = 'active';
  end if;

  if v_profile_id is null then
    raise exception 'BUSINESS_EQUIPMENT_PROFILE_UNAVAILABLE' using errcode = 'P0001';
  end if;

  return v_profile_id;
end
$function$;

revoke all on function public.ensure_business_equipment_capacity_profile_v2(uuid)
  from public, anon, authenticated;
grant execute on function public.ensure_business_equipment_capacity_profile_v2(uuid)
  to service_role;

select public.ensure_business_equipment_capacity_profile_v2(definition.id)
from public.physical_economy_item_definitions as definition
where definition.item_class = 'equipment'
  and definition.status = 'active'
order by definition.item_key;

commit;

-- Business V2 Phase 5A: canonical Business equipment capacity foundation.
-- Additive, forward-only, and intentionally excludes timed manufacturing and maintenance settlement.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- Business materialization and installation authority
-- ---------------------------------------------------------------------------

create table if not exists public.business_equipment_installations (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique default ('bei_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  business_id uuid not null,
  equipment_instance_id uuid not null,
  capacity_profile_id uuid not null
    references public.business_equipment_capacity_profiles(id) on delete restrict,
  installed_by_player_id uuid not null,
  status text not null default 'installed',
  installed_at timestamptz not null default now(),
  offline_at timestamptz null,
  retired_at timestamptz null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_equipment_installations_public_key_check
    check (public_key ~ '^bei_[0-9a-f]{32}$'),
  constraint business_equipment_installations_business_scope_fk
    foreign key (game_session_id, business_id)
    references public.business_entities(game_session_id, id) on delete cascade,
  constraint business_equipment_installations_instance_scope_fk
    foreign key (game_session_id, equipment_instance_id)
    references public.equipment_instances(game_session_id, id) on delete restrict,
  constraint business_equipment_installations_player_scope_fk
    foreign key (game_session_id, installed_by_player_id)
    references public.players(game_session_id, id),
  constraint business_equipment_installations_status_check
    check (status in ('installed','offline','retired')),
  constraint business_equipment_installations_state_check check (
    (status = 'installed' and offline_at is null and retired_at is null)
    or (status = 'offline' and offline_at is not null and retired_at is null)
    or (status = 'retired' and retired_at is not null)
  ),
  constraint business_equipment_installations_version_check
    check (version > 0),
  constraint business_equipment_installations_instance_unique
    unique (game_session_id, equipment_instance_id),
  constraint business_equipment_installations_scope_id_unique
    unique (game_session_id, id)
);

create index if not exists business_equipment_installations_business_status_idx
  on public.business_equipment_installations(
    game_session_id, business_id, status, public_key
  );

create or replace function economy_private.guard_business_equipment_installation_v2()
returns trigger
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
declare
  v_instance public.equipment_instances%rowtype;
  v_account public.inventory_accounts%rowtype;
  v_party public.economic_parties%rowtype;
  v_item public.game_items%rowtype;
  v_profile public.business_equipment_capacity_profiles%rowtype;
begin
  select instance_row.*
  into v_instance
  from public.equipment_instances as instance_row
  where instance_row.game_session_id = new.game_session_id
    and instance_row.id = new.equipment_instance_id
  for share;
  if not found
    or v_instance.status <> 'active'
    or v_instance.player_id is not null
    or v_instance.equipped_slot is not null
  then
    raise exception 'BUSINESS_EQUIPMENT_INSTALLATION_INSTANCE_INVALID' using errcode = 'P0001';
  end if;

  select account_row.*
  into v_account
  from public.inventory_accounts as account_row
  where account_row.game_session_id = new.game_session_id
    and account_row.id = v_instance.inventory_account_id
    and account_row.account_kind = 'warehouse'
    and account_row.status = 'active'
  for share;
  if not found then
    raise exception 'BUSINESS_EQUIPMENT_INSTALLATION_ACCOUNT_INVALID' using errcode = 'P0001';
  end if;

  select party_row.*
  into v_party
  from public.economic_parties as party_row
  where party_row.game_session_id = new.game_session_id
    and party_row.id = v_account.party_id
    and party_row.party_kind = 'business'
    and party_row.business_id = new.business_id
    and party_row.status = 'active'
  for share;
  if not found then
    raise exception 'BUSINESS_EQUIPMENT_INSTALLATION_OWNER_INVALID' using errcode = 'P0001';
  end if;

  select item_row.*
  into v_item
  from public.game_items as item_row
  where item_row.game_session_id = new.game_session_id
    and item_row.id = v_instance.game_item_id
    and item_row.item_class = 'equipment'
    and item_row.serialized
    and item_row.status = 'active'
  for share;
  if not found or v_item.physical_item_definition_id is null then
    raise exception 'BUSINESS_EQUIPMENT_INSTALLATION_ITEM_INVALID' using errcode = 'P0001';
  end if;

  select profile_row.*
  into v_profile
  from public.business_equipment_capacity_profiles as profile_row
  where profile_row.id = new.capacity_profile_id
    and profile_row.equipment_item_definition_id = v_item.physical_item_definition_id
    and profile_row.status = 'active'
  for share;
  if not found then
    raise exception 'BUSINESS_EQUIPMENT_INSTALLATION_PROFILE_INVALID' using errcode = 'P0001';
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'installed'
      or new.offline_at is not null
      or new.retired_at is not null
    then
      raise exception 'BUSINESS_EQUIPMENT_INSTALLATION_INITIAL_STATE_INVALID' using errcode = 'P0001';
    end if;
  else
    if new.game_session_id is distinct from old.game_session_id
      or new.business_id is distinct from old.business_id
      or new.equipment_instance_id is distinct from old.equipment_instance_id
      or new.capacity_profile_id is distinct from old.capacity_profile_id
      or new.installed_by_player_id is distinct from old.installed_by_player_id
      or new.installed_at is distinct from old.installed_at
      or new.created_at is distinct from old.created_at
    then
      raise exception 'BUSINESS_EQUIPMENT_INSTALLATION_IDENTITY_IMMUTABLE' using errcode = '42501';
    end if;

    if old.status = 'retired' and new.status <> 'retired' then
      raise exception 'BUSINESS_EQUIPMENT_INSTALLATION_RETIRED' using errcode = 'P0001';
    end if;
    if old.status = 'installed' and new.status not in ('installed','offline','retired') then
      raise exception 'BUSINESS_EQUIPMENT_INSTALLATION_TRANSITION_INVALID' using errcode = 'P0001';
    end if;
    if old.status = 'offline' and new.status not in ('offline','installed','retired') then
      raise exception 'BUSINESS_EQUIPMENT_INSTALLATION_TRANSITION_INVALID' using errcode = 'P0001';
    end if;
  end if;

  return new;
end
$function$;

create trigger guard_business_equipment_installation_v2
before insert or update on public.business_equipment_installations
for each row execute function economy_private.guard_business_equipment_installation_v2();

create trigger set_business_equipment_installations_updated_at
before update on public.business_equipment_installations
for each row execute function public.set_current_timestamp_updated_at();

alter table public.business_equipment_installations enable row level security;
revoke all on table public.business_equipment_installations from public, anon, authenticated;
grant select, insert, update, delete on table public.business_equipment_installations to service_role;

commit;

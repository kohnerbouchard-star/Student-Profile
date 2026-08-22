-- Business V2 Phase 5A: canonical Business equipment ownership, installation,
-- finite capacity reservations, and public utilization reads.
--
-- Equipment identity remains public.equipment_instances + canonical game_items.
-- This migration generalizes unique equipment ownership from Player-only to
-- economic parties, then adds Business installation/reservation state without
-- creating a second equipment catalog or inventory authority.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- Canonical unique-equipment ownership generalized to economic parties.
-- ---------------------------------------------------------------------------

alter table public.equipment_instances
  add column if not exists owner_party_id uuid,
  add column if not exists capacity_minutes_per_cycle integer not null default 2400,
  add column if not exists operational_status text not null default 'operational';

update public.equipment_instances as equipment
set owner_party_id = account.party_id
from public.inventory_accounts as account
where account.game_session_id = equipment.game_session_id
  and account.id = equipment.inventory_account_id
  and equipment.owner_party_id is null;

do $block$
begin
  if exists (
    select 1
    from public.equipment_instances
    where owner_party_id is null
  ) then
    raise exception 'BUSINESS_EQUIPMENT_OWNER_BACKFILL_INCOMPLETE' using errcode = 'P0001';
  end if;
end
$block$;

alter table public.equipment_instances
  alter column owner_party_id set not null,
  alter column player_id drop not null,
  add constraint equipment_instances_owner_party_scope_fk
    foreign key (game_session_id, owner_party_id)
    references public.economic_parties(game_session_id, id),
  add constraint equipment_instances_capacity_minutes_check
    check (capacity_minutes_per_cycle between 1 and 10080),
  add constraint equipment_instances_operational_status_check
    check (operational_status in ('operational','maintenance','inoperable'));

create unique index if not exists equipment_instances_scope_id_unique
  on public.equipment_instances(game_session_id, id);
create index if not exists equipment_instances_owner_status_idx
  on public.equipment_instances(game_session_id, owner_party_id, status, operational_status);

-- Existing Player equipment operations continue to use player_id. Business-owned
-- equipment has player_id = null and uses a Business warehouse account instead.
create or replace function economy_private.assign_equipment_instance_context_v2()
returns trigger
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
declare
  v_item public.game_items%rowtype;
  v_store_game_item_id uuid;
  v_party public.economic_parties%rowtype;
  v_account public.inventory_accounts%rowtype;
begin
  if new.owner_party_id is null and new.inventory_account_id is not null then
    select account.party_id into new.owner_party_id
    from public.inventory_accounts as account
    where account.game_session_id = new.game_session_id
      and account.id = new.inventory_account_id;
  end if;

  if new.owner_party_id is null and new.player_id is not null then
    new.inventory_account_id := coalesce(
      new.inventory_account_id,
      economy_private.ensure_player_inventory_account_v2(new.game_session_id, new.player_id)
    );
    select account.party_id into new.owner_party_id
    from public.inventory_accounts as account
    where account.game_session_id = new.game_session_id
      and account.id = new.inventory_account_id;
  end if;

  select party.* into v_party
  from public.economic_parties as party
  where party.game_session_id = new.game_session_id
    and party.id = new.owner_party_id
    and party.status = 'active';
  if not found or v_party.party_kind not in ('player','business') then
    raise exception 'ECONOMIC_CORE_EQUIPMENT_OWNER_SCOPE_INVALID' using errcode = 'P0001';
  end if;

  if new.inventory_account_id is null then
    if v_party.party_kind = 'player' then
      new.inventory_account_id := economy_private.ensure_player_inventory_account_v2(
        new.game_session_id,
        v_party.player_id
      );
    else
      new.inventory_account_id := economy_private.ensure_business_inventory_account_v2(
        new.game_session_id,
        v_party.business_id,
        'warehouse'
      );
    end if;
  end if;

  select account.* into v_account
  from public.inventory_accounts as account
  where account.game_session_id = new.game_session_id
    and account.id = new.inventory_account_id
    and account.party_id = v_party.id
    and account.status = 'active';
  if not found then
    raise exception 'ECONOMIC_CORE_EQUIPMENT_ACCOUNT_SCOPE_INVALID' using errcode = 'P0001';
  end if;

  if v_party.party_kind = 'player' then
    if v_account.account_kind <> 'personal' then
      raise exception 'ECONOMIC_CORE_EQUIPMENT_ACCOUNT_KIND_INVALID' using errcode = 'P0001';
    end if;
    new.player_id := v_party.player_id;
  else
    if v_account.account_kind <> 'warehouse' then
      raise exception 'ECONOMIC_CORE_EQUIPMENT_ACCOUNT_KIND_INVALID' using errcode = 'P0001';
    end if;
    if new.equipped_slot is not null then
      raise exception 'BUSINESS_EQUIPMENT_PLAYER_SLOT_FORBIDDEN' using errcode = 'P0001';
    end if;
    new.player_id := null;
  end if;

  if new.store_item_id is not null then
    select store_item.game_item_id into v_store_game_item_id
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

  select item.* into v_item
  from public.game_items as item
  where item.game_session_id = new.game_session_id
    and item.id = new.game_item_id
    and item.item_class = 'equipment'
    and item.serialized = true;
  if not found
    or (v_store_game_item_id is not null and v_store_game_item_id is distinct from v_item.id)
  then
    raise exception 'ECONOMIC_CORE_EQUIPMENT_ITEM_SCOPE_INVALID' using errcode = 'P0001';
  end if;

  new.item_key := v_item.canonical_key;
  return new;
end
$function$;

drop trigger if exists assign_equipment_instance_context_v2 on public.equipment_instances;
create trigger assign_equipment_instance_context_v2
before insert or update of game_session_id, player_id, owner_party_id, store_item_id, item_key,
  inventory_account_id, game_item_id, equipped_slot
on public.equipment_instances
for each row execute function economy_private.assign_equipment_instance_context_v2();

-- ---------------------------------------------------------------------------
-- Business-specific manufacturing metadata over canonical recipes/equipment.
-- ---------------------------------------------------------------------------

create table public.business_recipe_equipment_requirements (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique default ('ber_' || encode(gen_random_bytes(16), 'hex')),
  recipe_definition_id uuid not null references public.physical_economy_recipe_definitions(id) on delete cascade,
  capability_key text not null,
  minimum_instances integer not null default 1,
  fixed_equipment_minutes_per_run integer not null default 0,
  equipment_minutes_per_unit integer not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_recipe_equipment_requirement_key_check check (public_key ~ '^ber_[0-9a-f]{32}$'),
  constraint business_recipe_equipment_capability_check check (capability_key ~ '^[a-z0-9][a-z0-9._-]{0,127}$'),
  constraint business_recipe_equipment_minimum_instances_check check (minimum_instances between 1 and 32),
  constraint business_recipe_equipment_minutes_check check (
    fixed_equipment_minutes_per_run >= 0
    and equipment_minutes_per_unit >= 0
    and (fixed_equipment_minutes_per_run + equipment_minutes_per_unit) > 0
  ),
  constraint business_recipe_equipment_status_check check (status in ('active','disabled')),
  constraint business_recipe_equipment_scope_unique unique (recipe_definition_id, capability_key)
);

create trigger set_business_recipe_equipment_requirements_updated_at
before update on public.business_recipe_equipment_requirements
for each row execute function public.set_current_timestamp_updated_at();

alter table public.business_recipe_equipment_requirements enable row level security;
revoke all on table public.business_recipe_equipment_requirements from public, anon, authenticated;
grant select, insert, update, delete on table public.business_recipe_equipment_requirements to service_role;

-- Canonical recipe required_tools already encode the approved capability list.
-- For the Phase 5 default policy, one equipment-minute requirement per output
-- unit is derived from canonical base recipe duration; Players author none of it.
insert into public.business_recipe_equipment_requirements (
  recipe_definition_id,
  capability_key,
  minimum_instances,
  fixed_equipment_minutes_per_run,
  equipment_minutes_per_unit,
  status
)
select
  recipe.id,
  lower(btrim(tool_key)),
  1,
  0,
  greatest(1, ceil(recipe.base_duration_seconds / 60.0)::integer),
  'active'
from public.physical_economy_recipe_definitions as recipe
cross join lateral unnest(recipe.required_tools) as required_tool(tool_key)
where btrim(tool_key) <> ''
  and lower(btrim(tool_key)) ~ '^[a-z0-9][a-z0-9._-]{0,127}$'
on conflict (recipe_definition_id, capability_key) do nothing;

-- ---------------------------------------------------------------------------
-- Business installation and finite reservation authority.
-- ---------------------------------------------------------------------------

create table public.business_equipment_installations (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique default ('bei_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  business_id uuid not null,
  equipment_instance_id uuid not null,
  installed_by_player_id uuid not null,
  status text not null default 'installed',
  installed_at timestamptz not null default now(),
  removed_at timestamptz,
  version bigint not null default 1,
  constraint business_equipment_installation_key_check check (public_key ~ '^bei_[0-9a-f]{32}$'),
  constraint business_equipment_installation_status_check check (status in ('installed','removed')),
  constraint business_equipment_installation_removed_check check (
    (status = 'installed' and removed_at is null)
    or (status = 'removed' and removed_at is not null)
  ),
  constraint business_equipment_installation_version_check check (version > 0),
  constraint business_equipment_installation_business_scope_fk
    foreign key (game_session_id, business_id)
    references public.business_entities(game_session_id, id) on delete cascade,
  constraint business_equipment_installation_equipment_scope_fk
    foreign key (game_session_id, equipment_instance_id)
    references public.equipment_instances(game_session_id, id) on delete restrict,
  constraint business_equipment_installation_player_scope_fk
    foreign key (game_session_id, installed_by_player_id)
    references public.players(game_session_id, id)
);

create unique index business_equipment_installation_active_unique
  on public.business_equipment_installations(game_session_id, equipment_instance_id)
  where status = 'installed';
create index business_equipment_installations_business_status_idx
  on public.business_equipment_installations(game_session_id, business_id, status, installed_at);

alter table public.business_equipment_installations enable row level security;
revoke all on table public.business_equipment_installations from public, anon, authenticated;
grant select, insert, update on table public.business_equipment_installations to service_role;

create table public.business_equipment_reservations (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique default ('eqr_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  business_id uuid not null,
  equipment_instance_id uuid not null,
  requirement_id uuid not null references public.business_recipe_equipment_requirements(id) on delete restrict,
  recipe_definition_id uuid not null references public.physical_economy_recipe_definitions(id) on delete restrict,
  production_run_id uuid,
  period_key text not null,
  intent_kind text not null default 'production',
  intent_ref text not null,
  reserved_minutes integer not null,
  status text not null default 'reserved',
  reserved_at timestamptz not null default now(),
  activated_at timestamptz,
  consumed_at timestamptz,
  released_at timestamptz,
  constraint business_equipment_reservation_key_check check (public_key ~ '^eqr_[0-9a-f]{32}$'),
  constraint business_equipment_reservation_period_check check (period_key ~ '^payroll:[1-9][0-9]*$'),
  constraint business_equipment_reservation_intent_kind_check check (intent_kind in ('production')),
  constraint business_equipment_reservation_intent_ref_check check (length(btrim(intent_ref)) between 8 and 160),
  constraint business_equipment_reservation_minutes_check check (reserved_minutes > 0),
  constraint business_equipment_reservation_status_check check (status in ('reserved','active','consumed','released')),
  constraint business_equipment_reservation_timestamps_check check (
    (status <> 'consumed' or consumed_at is not null)
    and (status <> 'released' or released_at is not null)
  ),
  constraint business_equipment_reservation_business_scope_fk
    foreign key (game_session_id, business_id)
    references public.business_entities(game_session_id, id) on delete cascade,
  constraint business_equipment_reservation_equipment_scope_fk
    foreign key (game_session_id, equipment_instance_id)
    references public.equipment_instances(game_session_id, id) on delete restrict,
  constraint business_equipment_reservation_production_scope_fk
    foreign key (game_session_id, production_run_id)
    references public.business_production_runs(game_session_id, id) on delete restrict,
  constraint business_equipment_reservation_intent_unique unique (
    game_session_id,
    business_id,
    equipment_instance_id,
    requirement_id,
    period_key,
    intent_kind,
    intent_ref
  )
);

create index business_equipment_reservations_equipment_period_idx
  on public.business_equipment_reservations(game_session_id, equipment_instance_id, period_key, status);
create index business_equipment_reservations_business_period_idx
  on public.business_equipment_reservations(game_session_id, business_id, period_key, status);

alter table public.business_equipment_reservations enable row level security;
revoke all on table public.business_equipment_reservations from public, anon, authenticated;
grant select, insert, update on table public.business_equipment_reservations to service_role;

create or replace function public.reserve_business_equipment_v2(
  p_game_session_id uuid,
  p_business_key text,
  p_equipment_key text,
  p_requirement_key text,
  p_period_key text,
  p_intent_ref text,
  p_reserved_minutes integer
)
returns table (
  reservation_key text,
  status text,
  reserved_minutes integer,
  replayed boolean
)
language plpgsql
security invoker
set search_path = public, economy_private, pg_temp
as $function$
declare
  v_business public.business_entities%rowtype;
  v_requirement public.business_recipe_equipment_requirements%rowtype;
  v_equipment public.equipment_instances%rowtype;
  v_definition public.physical_economy_item_definitions%rowtype;
  v_existing public.business_equipment_reservations%rowtype;
  v_used integer := 0;
  v_capability_match boolean := false;
begin
  if p_period_key !~ '^payroll:[1-9][0-9]*$'
    or length(btrim(coalesce(p_intent_ref, ''))) not between 8 and 160
    or p_reserved_minutes is null or p_reserved_minutes <= 0
  then
    raise exception 'BUSINESS_EQUIPMENT_RESERVATION_INVALID' using errcode = 'P0001';
  end if;

  select business.* into v_business
  from public.business_entities as business
  where business.game_session_id = p_game_session_id
    and business.public_key = lower(btrim(p_business_key))
    and business.status = 'active'
  for update;
  if not found then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  select requirement.* into v_requirement
  from public.business_recipe_equipment_requirements as requirement
  where requirement.public_key = lower(btrim(p_requirement_key))
    and requirement.status = 'active';
  if not found then
    raise exception 'BUSINESS_EQUIPMENT_REQUIREMENT_INVALID' using errcode = 'P0001';
  end if;

  select equipment.* into v_equipment
  from public.equipment_instances as equipment
  join public.economic_parties as party
    on party.game_session_id = equipment.game_session_id
   and party.id = equipment.owner_party_id
   and party.party_kind = 'business'
   and party.business_id = v_business.id
   and party.status = 'active'
  join public.business_equipment_installations as installation
    on installation.game_session_id = equipment.game_session_id
   and installation.business_id = v_business.id
   and installation.equipment_instance_id = equipment.id
   and installation.status = 'installed'
  where equipment.game_session_id = p_game_session_id
    and equipment.public_id = lower(btrim(p_equipment_key))
    and equipment.status = 'active'
    and equipment.operational_status = 'operational'
  for update of equipment;
  if not found then
    raise exception 'BUSINESS_EQUIPMENT_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  select definition.* into v_definition
  from public.game_items as item
  join public.physical_economy_item_definitions as definition
    on definition.id = item.physical_item_definition_id
  where item.game_session_id = p_game_session_id
    and item.id = v_equipment.game_item_id
    and item.status = 'active';
  if not found then
    raise exception 'BUSINESS_EQUIPMENT_DEFINITION_UNAVAILABLE' using errcode = 'P0001';
  end if;

  v_capability_match := lower(v_definition.item_key) = v_requirement.capability_key
    or exists (
      select 1
      from unnest(v_definition.tool_tags) as tag(value)
      where lower(btrim(tag.value)) = v_requirement.capability_key
    );
  if not v_capability_match then
    raise exception 'BUSINESS_EQUIPMENT_CAPABILITY_MISMATCH' using errcode = 'P0001';
  end if;

  select reservation.* into v_existing
  from public.business_equipment_reservations as reservation
  where reservation.game_session_id = p_game_session_id
    and reservation.business_id = v_business.id
    and reservation.equipment_instance_id = v_equipment.id
    and reservation.requirement_id = v_requirement.id
    and reservation.period_key = p_period_key
    and reservation.intent_kind = 'production'
    and reservation.intent_ref = btrim(p_intent_ref)
  for update;
  if found then
    if v_existing.reserved_minutes <> p_reserved_minutes then
      raise exception 'BUSINESS_EQUIPMENT_RESERVATION_CONFLICT' using errcode = 'P0001';
    end if;
    return query select v_existing.public_key, v_existing.status, v_existing.reserved_minutes, true;
    return;
  end if;

  select coalesce(sum(reservation.reserved_minutes), 0)::integer
  into v_used
  from public.business_equipment_reservations as reservation
  where reservation.game_session_id = p_game_session_id
    and reservation.equipment_instance_id = v_equipment.id
    and reservation.period_key = p_period_key
    and reservation.status in ('reserved','active','consumed');

  if v_used + p_reserved_minutes > v_equipment.capacity_minutes_per_cycle then
    raise exception 'BUSINESS_EQUIPMENT_CAPACITY_UNAVAILABLE' using errcode = 'P0001';
  end if;

  insert into public.business_equipment_reservations (
    game_session_id,
    business_id,
    equipment_instance_id,
    requirement_id,
    recipe_definition_id,
    period_key,
    intent_kind,
    intent_ref,
    reserved_minutes,
    status
  ) values (
    p_game_session_id,
    v_business.id,
    v_equipment.id,
    v_requirement.id,
    v_requirement.recipe_definition_id,
    p_period_key,
    'production',
    btrim(p_intent_ref),
    p_reserved_minutes,
    'reserved'
  ) returning * into v_existing;

  return query select v_existing.public_key, v_existing.status, v_existing.reserved_minutes, false;
end
$function$;

create or replace function public.consume_business_equipment_reservation_v2(
  p_game_session_id uuid,
  p_reservation_key text,
  p_production_run_key text
)
returns table (
  reservation_key text,
  status text,
  reserved_minutes integer,
  replayed boolean
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_reservation public.business_equipment_reservations%rowtype;
  v_run public.business_production_runs%rowtype;
begin
  select reservation.* into v_reservation
  from public.business_equipment_reservations as reservation
  where reservation.game_session_id = p_game_session_id
    and reservation.public_key = lower(btrim(p_reservation_key))
  for update;
  if not found then
    raise exception 'BUSINESS_EQUIPMENT_RESERVATION_NOT_FOUND' using errcode = 'P0001';
  end if;

  select run.* into v_run
  from public.business_production_runs as run
  where run.game_session_id = p_game_session_id
    and run.public_key = lower(btrim(p_production_run_key))
    and run.business_id = v_reservation.business_id
  for share;
  if not found then
    raise exception 'BUSINESS_EQUIPMENT_PRODUCTION_RUN_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_reservation.status = 'consumed' then
    if v_reservation.production_run_id is distinct from v_run.id then
      raise exception 'BUSINESS_EQUIPMENT_RESERVATION_CONSUMPTION_CONFLICT' using errcode = 'P0001';
    end if;
    return query select v_reservation.public_key, v_reservation.status, v_reservation.reserved_minutes, true;
    return;
  end if;
  if v_reservation.status = 'released' then
    raise exception 'BUSINESS_EQUIPMENT_RESERVATION_RELEASED' using errcode = 'P0001';
  end if;

  update public.business_equipment_reservations
  set
    status = 'consumed',
    production_run_id = v_run.id,
    consumed_at = statement_timestamp()
  where id = v_reservation.id
  returning * into v_reservation;

  return query select v_reservation.public_key, v_reservation.status, v_reservation.reserved_minutes, false;
end
$function$;

create or replace function public.release_business_equipment_reservation_v2(
  p_game_session_id uuid,
  p_reservation_key text
)
returns table (
  reservation_key text,
  status text,
  reserved_minutes integer,
  replayed boolean
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_reservation public.business_equipment_reservations%rowtype;
begin
  select reservation.* into v_reservation
  from public.business_equipment_reservations as reservation
  where reservation.game_session_id = p_game_session_id
    and reservation.public_key = lower(btrim(p_reservation_key))
  for update;
  if not found then
    raise exception 'BUSINESS_EQUIPMENT_RESERVATION_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_reservation.status = 'released' then
    return query select v_reservation.public_key, v_reservation.status, v_reservation.reserved_minutes, true;
    return;
  end if;
  if v_reservation.status = 'consumed' then
    raise exception 'BUSINESS_EQUIPMENT_RESERVATION_CONSUMED' using errcode = 'P0001';
  end if;

  update public.business_equipment_reservations
  set status = 'released', released_at = statement_timestamp()
  where id = v_reservation.id
  returning * into v_reservation;

  return query select v_reservation.public_key, v_reservation.status, v_reservation.reserved_minutes, false;
end
$function$;

revoke all on function public.reserve_business_equipment_v2(uuid,text,text,text,text,text,integer) from public, anon, authenticated;
revoke all on function public.consume_business_equipment_reservation_v2(uuid,text,text) from public, anon, authenticated;
revoke all on function public.release_business_equipment_reservation_v2(uuid,text) from public, anon, authenticated;
grant execute on function public.reserve_business_equipment_v2(uuid,text,text,text,text,text,integer) to service_role;
grant execute on function public.consume_business_equipment_reservation_v2(uuid,text,text) to service_role;
grant execute on function public.release_business_equipment_reservation_v2(uuid,text) to service_role;

-- ---------------------------------------------------------------------------
-- Player intent: contribute/install canonical equipment into an owned Business.
-- ---------------------------------------------------------------------------

create or replace function public.install_owned_business_equipment_v2(
  p_game_session_id uuid,
  p_player_id uuid,
  p_business_key text,
  p_equipment_key text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, economy_private, extensions, pg_temp
as $function$
declare
  v_business record;
  v_business_party public.economic_parties%rowtype;
  v_equipment public.equipment_instances%rowtype;
  v_owner public.economic_parties%rowtype;
  v_installation public.business_equipment_installations%rowtype;
  v_idempotency public.mutation_idempotency_keys%rowtype;
  v_source_account uuid;
  v_business_account uuid;
  v_hash text;
  v_post jsonb;
  v_response jsonb;
  v_now timestamptz := statement_timestamp();
begin
  if length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 160 then
    raise exception 'IDEMPOTENCY_KEY_INVALID' using errcode = 'P0001';
  end if;

  select * into v_business
  from public.resolve_player_business_v2(p_game_session_id, p_player_id);
  if lower(btrim(p_business_key)) <> v_business.business_key then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_hash := encode(extensions.digest(concat_ws('|', p_game_session_id, p_player_id, v_business.business_id, lower(btrim(p_equipment_key))), 'sha256'), 'hex');
  insert into public.mutation_idempotency_keys (
    game_session_id, player_id, route_key, idempotency_key, request_hash, status, expires_at
  ) values (
    p_game_session_id, p_player_id, 'players.me.business.equipment.install', p_idempotency_key,
    v_hash, 'STARTED', v_now + interval '7 days'
  ) on conflict on constraint mutation_idempotency_keys_scope_unique do nothing;

  select idem.* into v_idempotency
  from public.mutation_idempotency_keys as idem
  where idem.game_session_id = p_game_session_id
    and idem.player_id = p_player_id
    and idem.route_key = 'players.me.business.equipment.install'
    and idem.idempotency_key = p_idempotency_key
  for update;
  if not found then
    raise exception 'BUSINESS_EQUIPMENT_IDEMPOTENCY_UNAVAILABLE' using errcode = 'P0001';
  end if;
  if v_idempotency.request_hash <> v_hash then
    raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode = 'P0001';
  end if;
  if v_idempotency.status = 'COMPLETED' and v_idempotency.response_body is not null then
    return v_idempotency.response_body || jsonb_build_object('replayed', true);
  end if;

  select party.* into v_business_party
  from public.economic_parties as party
  where party.game_session_id = p_game_session_id
    and party.party_kind = 'business'
    and party.business_id = v_business.business_id
    and party.status = 'active'
  for share;
  if not found then
    raise exception 'BUSINESS_EQUIPMENT_PARTY_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select equipment.* into v_equipment
  from public.equipment_instances as equipment
  where equipment.game_session_id = p_game_session_id
    and equipment.public_id = lower(btrim(p_equipment_key))
    and equipment.status = 'active'
    and equipment.operational_status = 'operational'
  for update;
  if not found then
    raise exception 'BUSINESS_EQUIPMENT_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  select party.* into v_owner
  from public.economic_parties as party
  where party.game_session_id = p_game_session_id
    and party.id = v_equipment.owner_party_id
    and party.status = 'active'
  for share;
  if not found then
    raise exception 'BUSINESS_EQUIPMENT_OWNER_SCOPE_INVALID' using errcode = 'P0001';
  end if;

  if v_owner.party_kind = 'player' then
    if v_owner.player_id is distinct from p_player_id or v_equipment.equipped_slot is not null then
      raise exception 'BUSINESS_EQUIPMENT_PLAYER_OWNERSHIP_REQUIRED' using errcode = 'P0001';
    end if;

    v_source_account := v_equipment.inventory_account_id;
    v_business_account := economy_private.ensure_business_inventory_account_v2(
      p_game_session_id,
      v_business.business_id,
      'warehouse'
    );

    v_post := economy_private.post_inventory_transaction_v2(
      p_game_session_id,
      'transfer',
      'business',
      'equipment_install_transfer',
      v_business.business_id,
      p_idempotency_key || ':inventory',
      jsonb_build_object(
        'businessKey', v_business.business_key,
        'equipmentKey', v_equipment.public_id,
        'gameItemId', v_equipment.game_item_id
      ),
      jsonb_build_array(
        jsonb_build_object(
          'inventoryAccountId', v_source_account,
          'gameItemId', v_equipment.game_item_id,
          'playerId', p_player_id,
          'storeItemId', v_equipment.store_item_id,
          'quantityDelta', -1,
          'reservationDelta', 0,
          'eventType', 'ADJUSTED',
          'legacyEventQuantityDelta', -1,
          'eventMetadata', jsonb_build_object('reason', 'business_equipment_install')
        ),
        jsonb_build_object(
          'inventoryAccountId', v_business_account,
          'gameItemId', v_equipment.game_item_id,
          'quantityDelta', 1,
          'reservationDelta', 0,
          'metadata', jsonb_build_object('reason', 'business_equipment_install')
        )
      )
    );

    update public.equipment_instances
    set
      owner_party_id = v_business_party.id,
      player_id = null,
      inventory_account_id = v_business_account,
      equipped_slot = null,
      equipped_at = null
    where id = v_equipment.id
    returning * into v_equipment;
  elsif v_owner.party_kind = 'business' then
    if v_owner.business_id is distinct from v_business.business_id then
      raise exception 'BUSINESS_EQUIPMENT_OWNED_BY_OTHER_BUSINESS' using errcode = 'P0001';
    end if;
  else
    raise exception 'BUSINESS_EQUIPMENT_PLAYER_OWNERSHIP_REQUIRED' using errcode = 'P0001';
  end if;

  select installation.* into v_installation
  from public.business_equipment_installations as installation
  where installation.game_session_id = p_game_session_id
    and installation.business_id = v_business.business_id
    and installation.equipment_instance_id = v_equipment.id
    and installation.status = 'installed'
  for update;

  if not found then
    insert into public.business_equipment_installations (
      game_session_id, business_id, equipment_instance_id, installed_by_player_id, status
    ) values (
      p_game_session_id, v_business.business_id, v_equipment.id, p_player_id, 'installed'
    ) returning * into v_installation;
  end if;

  insert into public.audit_log (
    game_session_id, actor_type, actor_id, action, target_type, target_id, metadata
  ) values (
    p_game_session_id, 'player', p_player_id, 'business.equipment.installed',
    'business', v_business.business_id,
    jsonb_build_object(
      'businessKey', v_business.business_key,
      'equipmentKey', v_equipment.public_id,
      'installationKey', v_installation.public_key,
      'inventoryTransactionKey', v_post->>'transactionKey',
      'idempotencyKey', p_idempotency_key
    )
  );

  v_response := jsonb_build_object(
    'businessKey', v_business.business_key,
    'equipmentKey', v_equipment.public_id,
    'installationKey', v_installation.public_key,
    'status', v_installation.status,
    'capacityMinutes', v_equipment.capacity_minutes_per_cycle,
    'operationalStatus', v_equipment.operational_status,
    'installedAt', v_installation.installed_at,
    'replayed', false
  );

  update public.mutation_idempotency_keys
  set status = 'COMPLETED', result_type = 'business_equipment_installation', result_id = v_installation.id,
      response_body = v_response, completed_at = v_now
  where id = v_idempotency.id;

  return v_response;
end
$function$;

create or replace function public.uninstall_owned_business_equipment_v2(
  p_game_session_id uuid,
  p_player_id uuid,
  p_business_key text,
  p_equipment_key text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, extensions, pg_temp
as $function$
declare
  v_business record;
  v_equipment public.equipment_instances%rowtype;
  v_installation public.business_equipment_installations%rowtype;
  v_idempotency public.mutation_idempotency_keys%rowtype;
  v_hash text;
  v_response jsonb;
  v_now timestamptz := statement_timestamp();
begin
  if length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 160 then
    raise exception 'IDEMPOTENCY_KEY_INVALID' using errcode = 'P0001';
  end if;

  select * into v_business
  from public.resolve_player_business_v2(p_game_session_id, p_player_id);
  if lower(btrim(p_business_key)) <> v_business.business_key then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_hash := encode(extensions.digest(concat_ws('|', p_game_session_id, p_player_id, v_business.business_id, lower(btrim(p_equipment_key))), 'sha256'), 'hex');
  insert into public.mutation_idempotency_keys (
    game_session_id, player_id, route_key, idempotency_key, request_hash, status, expires_at
  ) values (
    p_game_session_id, p_player_id, 'players.me.business.equipment.uninstall', p_idempotency_key,
    v_hash, 'STARTED', v_now + interval '7 days'
  ) on conflict on constraint mutation_idempotency_keys_scope_unique do nothing;

  select idem.* into v_idempotency
  from public.mutation_idempotency_keys as idem
  where idem.game_session_id = p_game_session_id
    and idem.player_id = p_player_id
    and idem.route_key = 'players.me.business.equipment.uninstall'
    and idem.idempotency_key = p_idempotency_key
  for update;
  if not found then
    raise exception 'BUSINESS_EQUIPMENT_IDEMPOTENCY_UNAVAILABLE' using errcode = 'P0001';
  end if;
  if v_idempotency.request_hash <> v_hash then
    raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode = 'P0001';
  end if;
  if v_idempotency.status = 'COMPLETED' and v_idempotency.response_body is not null then
    return v_idempotency.response_body || jsonb_build_object('replayed', true);
  end if;

  select equipment.* into v_equipment
  from public.equipment_instances as equipment
  join public.economic_parties as party
    on party.game_session_id = equipment.game_session_id
   and party.id = equipment.owner_party_id
   and party.party_kind = 'business'
   and party.business_id = v_business.business_id
  where equipment.game_session_id = p_game_session_id
    and equipment.public_id = lower(btrim(p_equipment_key))
  for update of equipment;
  if not found then
    raise exception 'BUSINESS_EQUIPMENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  select installation.* into v_installation
  from public.business_equipment_installations as installation
  where installation.game_session_id = p_game_session_id
    and installation.business_id = v_business.business_id
    and installation.equipment_instance_id = v_equipment.id
    and installation.status = 'installed'
  for update;
  if not found then
    raise exception 'BUSINESS_EQUIPMENT_NOT_INSTALLED' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.business_equipment_reservations as reservation
    where reservation.game_session_id = p_game_session_id
      and reservation.business_id = v_business.business_id
      and reservation.equipment_instance_id = v_equipment.id
      and reservation.status in ('reserved','active')
  ) then
    raise exception 'BUSINESS_EQUIPMENT_RESERVATION_ACTIVE' using errcode = 'P0001';
  end if;

  update public.business_equipment_installations
  set status = 'removed', removed_at = v_now, version = version + 1
  where id = v_installation.id
  returning * into v_installation;

  insert into public.audit_log (
    game_session_id, actor_type, actor_id, action, target_type, target_id, metadata
  ) values (
    p_game_session_id, 'player', p_player_id, 'business.equipment.uninstalled',
    'business', v_business.business_id,
    jsonb_build_object(
      'businessKey', v_business.business_key,
      'equipmentKey', v_equipment.public_id,
      'installationKey', v_installation.public_key,
      'idempotencyKey', p_idempotency_key
    )
  );

  v_response := jsonb_build_object(
    'businessKey', v_business.business_key,
    'equipmentKey', v_equipment.public_id,
    'installationKey', v_installation.public_key,
    'status', v_installation.status,
    'removedAt', v_installation.removed_at,
    'replayed', false
  );

  update public.mutation_idempotency_keys
  set status = 'COMPLETED', result_type = 'business_equipment_installation', result_id = v_installation.id,
      response_body = v_response, completed_at = v_now
  where id = v_idempotency.id;

  return v_response;
end
$function$;

revoke all on function public.install_owned_business_equipment_v2(uuid,uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.uninstall_owned_business_equipment_v2(uuid,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.install_owned_business_equipment_v2(uuid,uuid,text,text,text) to service_role;
grant execute on function public.uninstall_owned_business_equipment_v2(uuid,uuid,text,text,text) to service_role;

-- ---------------------------------------------------------------------------
-- Public-key-only Business equipment read model.
-- ---------------------------------------------------------------------------

create or replace function public.read_owned_business_equipment_utilization_v2(
  p_game_session_id uuid,
  p_player_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_business record;
  v_business_party_id uuid;
  v_player_party_id uuid;
  v_period_key text;
  v_business_equipment jsonb := '[]'::jsonb;
  v_available_equipment jsonb := '[]'::jsonb;
begin
  select * into v_business
  from public.resolve_player_business_v2(p_game_session_id, p_player_id);

  select party.id into v_business_party_id
  from public.economic_parties as party
  where party.game_session_id = p_game_session_id
    and party.party_kind = 'business'
    and party.business_id = v_business.business_id
    and party.status = 'active';

  select party.id into v_player_party_id
  from public.economic_parties as party
  where party.game_session_id = p_game_session_id
    and party.party_kind = 'player'
    and party.player_id = p_player_id
    and party.status = 'active';

  v_period_key := public.current_business_payroll_period_key_v2(p_game_session_id, v_business.business_id);

  select coalesce(jsonb_agg(row_value order by row_value->>'name', row_value->>'equipmentKey'), '[]'::jsonb)
  into v_business_equipment
  from (
    select jsonb_build_object(
      'equipmentKey', equipment.public_id,
      'itemKey', item.canonical_key,
      'name', item.name,
      'operationalStatus', equipment.operational_status,
      'installed', installation.id is not null,
      'installationKey', installation.public_key,
      'capacityMinutes', equipment.capacity_minutes_per_cycle,
      'reservedMinutes', coalesce(usage.reserved_minutes, 0),
      'consumedMinutes', coalesce(usage.consumed_minutes, 0),
      'utilizedMinutes', coalesce(usage.reserved_minutes, 0) + coalesce(usage.consumed_minutes, 0),
      'availableMinutes', greatest(
        equipment.capacity_minutes_per_cycle - coalesce(usage.reserved_minutes, 0) - coalesce(usage.consumed_minutes, 0),
        0
      ),
      'utilizationBasisPoints', case
        when equipment.capacity_minutes_per_cycle <= 0 then 0
        else least(10000, floor(
          10000.0 * (coalesce(usage.reserved_minutes, 0) + coalesce(usage.consumed_minutes, 0))
          / equipment.capacity_minutes_per_cycle
        )::integer)
      end,
      'capabilities', to_jsonb(array(
        select distinct capability
        from unnest(array[lower(definition.item_key)] || coalesce(definition.tool_tags, '{}'::text[])) as capability
        where btrim(capability) <> ''
        order by capability
      ))
    ) as row_value
    from public.equipment_instances as equipment
    join public.game_items as item
      on item.game_session_id = equipment.game_session_id
     and item.id = equipment.game_item_id
    left join public.physical_economy_item_definitions as definition
      on definition.id = item.physical_item_definition_id
    left join public.business_equipment_installations as installation
      on installation.game_session_id = equipment.game_session_id
     and installation.business_id = v_business.business_id
     and installation.equipment_instance_id = equipment.id
     and installation.status = 'installed'
    left join lateral (
      select
        coalesce(sum(reservation.reserved_minutes) filter (where reservation.status in ('reserved','active')), 0)::integer as reserved_minutes,
        coalesce(sum(reservation.reserved_minutes) filter (where reservation.status = 'consumed'), 0)::integer as consumed_minutes
      from public.business_equipment_reservations as reservation
      where reservation.game_session_id = p_game_session_id
        and reservation.equipment_instance_id = equipment.id
        and reservation.period_key = v_period_key
        and reservation.status in ('reserved','active','consumed')
    ) as usage on true
    where equipment.game_session_id = p_game_session_id
      and equipment.owner_party_id = v_business_party_id
      and equipment.status = 'active'
  ) rows;

  if v_player_party_id is not null then
    select coalesce(jsonb_agg(row_value order by row_value->>'name', row_value->>'equipmentKey'), '[]'::jsonb)
    into v_available_equipment
    from (
      select jsonb_build_object(
        'equipmentKey', equipment.public_id,
        'itemKey', item.canonical_key,
        'name', item.name,
        'operationalStatus', equipment.operational_status,
        'allowedSlot', definition.equipment_slot,
        'capabilities', to_jsonb(array(
          select distinct capability
          from unnest(array[lower(definition.item_key)] || coalesce(definition.tool_tags, '{}'::text[])) as capability
          where btrim(capability) <> ''
          order by capability
        ))
      ) as row_value
      from public.equipment_instances as equipment
      join public.game_items as item
        on item.game_session_id = equipment.game_session_id
       and item.id = equipment.game_item_id
      left join public.physical_economy_item_definitions as definition
        on definition.id = item.physical_item_definition_id
      where equipment.game_session_id = p_game_session_id
        and equipment.owner_party_id = v_player_party_id
        and equipment.player_id = p_player_id
        and equipment.status = 'active'
        and equipment.operational_status = 'operational'
        and equipment.equipped_slot is null
    ) rows;
  end if;

  return jsonb_build_object(
    'businessKey', v_business.business_key,
    'periodKey', v_period_key,
    'generatedAt', statement_timestamp(),
    'equipment', v_business_equipment,
    'availableToInstall', v_available_equipment
  );
end
$function$;

revoke all on function public.read_owned_business_equipment_utilization_v2(uuid,uuid) from public, anon, authenticated;
grant execute on function public.read_owned_business_equipment_utilization_v2(uuid,uuid) to service_role;

commit;

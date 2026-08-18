-- Business equipment + timed production V2.
--
-- Productive equipment is configured against canonical game_items. Installation
-- consumes one canonical inventory unit into a durable productive-asset record;
-- production reserves BOM inputs in canonical WIP and due completion consumes
-- them before posting finished canonical goods.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- Keep starter recipe ownership synchronized for already-operational companies.
create or replace function public.sync_business_starter_recipes_v2()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if new.status <> 'closed' and new.formation_state = 'operational' then
    perform public.ensure_business_starter_recipe_unlocks_v2(
      new.game_session_id,
      new.id
    );
  end if;
  return new;
end
$function$;

drop trigger if exists sync_business_starter_recipes on public.business_entities;
create trigger sync_business_starter_recipes
after insert or update of status, formation_state, industry_code
on public.business_entities
for each row execute function public.sync_business_starter_recipes_v2();

select public.ensure_business_starter_recipe_unlocks_v2(
  business_row.game_session_id,
  business_row.id
)
from public.business_entities as business_row
where business_row.status <> 'closed'
  and business_row.formation_state = 'operational';

-- ---------------------------------------------------------------------------
-- Equipment definitions and installed productive assets
-- ---------------------------------------------------------------------------

create table if not exists public.business_equipment_profiles (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique default ('eqp_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  game_item_id uuid not null,
  capability_key text not null,
  capacity_units integer not null,
  maintenance_interval_hours integer not null default 168,
  maintenance_cost numeric(14,2) not null default 0,
  repair_cost_per_condition_point numeric(14,2) not null default 0,
  condition_decay_per_day numeric(10,4) not null default 1,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint business_equipment_profiles_public_key_check
    check (public_key ~ '^eqp_[0-9a-f]{32}$'),
  constraint business_equipment_profiles_item_scope_fk
    foreign key (game_session_id, game_item_id)
    references public.game_items(game_session_id, id) on delete restrict,
  constraint business_equipment_profiles_capability_check
    check (capability_key ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
  constraint business_equipment_profiles_capacity_check
    check (capacity_units between 1 and 1000000),
  constraint business_equipment_profiles_maintenance_interval_check
    check (maintenance_interval_hours between 1 and 8760),
  constraint business_equipment_profiles_maintenance_cost_check
    check (maintenance_cost between 0 and 10000000),
  constraint business_equipment_profiles_repair_cost_check
    check (repair_cost_per_condition_point between 0 and 10000000),
  constraint business_equipment_profiles_decay_check
    check (condition_decay_per_day between 0 and 25),
  constraint business_equipment_profiles_status_check
    check (status in ('active', 'disabled', 'retired')),
  constraint business_equipment_profiles_metadata_check
    check (jsonb_typeof(metadata) = 'object'),
  constraint business_equipment_profiles_unique
    unique (game_session_id, game_item_id, capability_key),
  constraint business_equipment_profiles_scope_id_unique
    unique (game_session_id, id)
);

create trigger set_business_equipment_profiles_updated_at
before update on public.business_equipment_profiles
for each row execute function public.set_current_timestamp_updated_at();

alter table public.business_equipment_profiles enable row level security;
revoke all on table public.business_equipment_profiles from public, anon, authenticated;
grant select, insert, update on table public.business_equipment_profiles to service_role;

create or replace function public.guard_business_equipment_profile_item_v2()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_item public.game_items%rowtype;
begin
  select item_row.* into v_item
  from public.game_items as item_row
  where item_row.game_session_id = new.game_session_id
    and item_row.id = new.game_item_id
    and item_row.status = 'active';
  if not found then
    raise exception 'BUSINESS_EQUIPMENT_CANONICAL_ITEM_REQUIRED' using errcode = 'P0001';
  end if;
  if v_item.source_kind = 'business_product' then
    raise exception 'BUSINESS_EQUIPMENT_PLAYER_AUTHORED_ITEM_PROHIBITED' using errcode = 'P0001';
  end if;
  return new;
end
$function$;

drop trigger if exists guard_business_equipment_profile_item on public.business_equipment_profiles;
create trigger guard_business_equipment_profile_item
before insert or update of game_session_id, game_item_id
on public.business_equipment_profiles
for each row execute function public.guard_business_equipment_profile_item_v2();

create table if not exists public.business_equipment_assets (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique default ('bea_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  business_id uuid not null,
  equipment_profile_id uuid not null,
  installed_by_player_id uuid not null,
  condition_score numeric(10,4) not null default 100,
  status text not null default 'active',
  installed_at timestamptz not null default now(),
  condition_measured_at timestamptz not null default now(),
  last_maintained_at timestamptz not null default now(),
  maintenance_due_at timestamptz not null,
  source_inventory_transaction_id uuid null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint business_equipment_assets_public_key_check
    check (public_key ~ '^bea_[0-9a-f]{32}$'),
  constraint business_equipment_assets_business_scope_fk
    foreign key (game_session_id, business_id)
    references public.business_entities(game_session_id, id) on delete restrict,
  constraint business_equipment_assets_profile_scope_fk
    foreign key (game_session_id, equipment_profile_id)
    references public.business_equipment_profiles(game_session_id, id) on delete restrict,
  constraint business_equipment_assets_player_scope_fk
    foreign key (game_session_id, installed_by_player_id)
    references public.players(game_session_id, id),
  constraint business_equipment_assets_condition_check
    check (condition_score between 0 and 100),
  constraint business_equipment_assets_status_check
    check (status in ('active', 'maintenance', 'broken', 'retired')),
  constraint business_equipment_assets_metadata_check
    check (jsonb_typeof(metadata) = 'object'),
  constraint business_equipment_assets_scope_id_unique unique (game_session_id, id)
);

create index if not exists business_equipment_assets_business_idx
  on public.business_equipment_assets(game_session_id, business_id, status, maintenance_due_at);

create trigger set_business_equipment_assets_updated_at
before update on public.business_equipment_assets
for each row execute function public.set_current_timestamp_updated_at();

alter table public.business_equipment_assets enable row level security;
revoke all on table public.business_equipment_assets from public, anon, authenticated;
grant select, insert, update on table public.business_equipment_assets to service_role;

create or replace function public.business_equipment_effective_condition_v2(
  p_asset_id uuid,
  p_as_of timestamptz default now()
)
returns numeric
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_asset public.business_equipment_assets%rowtype;
  v_profile public.business_equipment_profiles%rowtype;
  v_days numeric;
begin
  select asset_row.* into v_asset
  from public.business_equipment_assets as asset_row
  where asset_row.id = p_asset_id;
  if not found then
    raise exception 'BUSINESS_EQUIPMENT_ASSET_NOT_FOUND' using errcode = 'P0001';
  end if;
  select profile_row.* into v_profile
  from public.business_equipment_profiles as profile_row
  where profile_row.id = v_asset.equipment_profile_id;
  if not found then
    raise exception 'BUSINESS_EQUIPMENT_PROFILE_NOT_FOUND' using errcode = 'P0001';
  end if;
  v_days := greatest(
    0,
    extract(epoch from (p_as_of - v_asset.condition_measured_at)) / 86400.0
  );
  return greatest(
    0,
    round(v_asset.condition_score - v_days * v_profile.condition_decay_per_day, 4)
  );
end
$function$;

create or replace function public.install_business_equipment_v2(
  p_game_session_id uuid,
  p_player_id uuid,
  p_business_key text,
  p_equipment_profile_key text,
  p_idempotency_key text
)
returns table (
  asset_key text,
  status text,
  condition_score numeric,
  maintenance_due_at timestamptz,
  replayed boolean
)
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
declare
  v_business public.business_entities%rowtype;
  v_profile public.business_equipment_profiles%rowtype;
  v_asset public.business_equipment_assets%rowtype;
  v_warehouse uuid;
  v_inventory_tx uuid;
begin
  if length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 160 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = 'P0001';
  end if;
  select business_row.* into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.public_key = lower(btrim(p_business_key))
    and business_row.status <> 'closed'
    and business_row.formation_state = 'operational'
  for share;
  if not found then
    raise exception 'BUSINESS_NOT_FOUND_OR_NOT_OPERATIONAL' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.business_ownership_positions as position_row
    where position_row.game_session_id = p_game_session_id
      and position_row.business_id = v_business.id
      and position_row.player_id = p_player_id
      and position_row.status = 'active'
  ) then
    raise exception 'BUSINESS_OWNERSHIP_REQUIRED' using errcode = 'P0001';
  end if;

  select asset_row.* into v_asset
  from public.business_equipment_assets as asset_row
  where asset_row.game_session_id = p_game_session_id
    and asset_row.business_id = v_business.id
    and asset_row.installed_by_player_id = p_player_id
    and asset_row.metadata ->> 'idempotencyKey' = p_idempotency_key;
  if found then
    return query select
      v_asset.public_key,
      v_asset.status,
      public.business_equipment_effective_condition_v2(v_asset.id, now()),
      v_asset.maintenance_due_at,
      true;
    return;
  end if;

  select profile_row.* into v_profile
  from public.business_equipment_profiles as profile_row
  where profile_row.game_session_id = p_game_session_id
    and profile_row.public_key = lower(btrim(p_equipment_profile_key))
    and profile_row.status = 'active';
  if not found then
    raise exception 'BUSINESS_EQUIPMENT_PROFILE_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_warehouse := economy_private.ensure_business_inventory_account_v2(
    p_game_session_id,
    v_business.id,
    'warehouse'
  );
  select transaction_id into v_inventory_tx
  from economy_private.post_inventory_transaction_v2(
    p_game_session_id => p_game_session_id,
    p_game_item_id => v_profile.game_item_id,
    p_from_account_id => v_warehouse,
    p_to_account_id => null,
    p_quantity => 1,
    p_unit_cost => null,
    p_transaction_kind => 'consume',
    p_source_domain => 'business',
    p_source_action => 'equipment_install',
    p_source_id => v_profile.id,
    p_idempotency_key => 'equipment-install:' || p_idempotency_key,
    p_metadata => jsonb_build_object('business_id', v_business.id)
  );

  insert into public.business_equipment_assets(
    game_session_id,
    business_id,
    equipment_profile_id,
    installed_by_player_id,
    condition_score,
    status,
    maintenance_due_at,
    source_inventory_transaction_id,
    metadata
  ) values (
    p_game_session_id,
    v_business.id,
    v_profile.id,
    p_player_id,
    100,
    'active',
    now() + make_interval(hours => v_profile.maintenance_interval_hours),
    v_inventory_tx,
    jsonb_build_object('idempotencyKey', p_idempotency_key)
  ) returning * into v_asset;

  insert into public.business_activity_events(
    game_session_id,
    business_id,
    actor_type,
    actor_player_id,
    event_type,
    source_id,
    reason_code,
    metadata
  ) values (
    p_game_session_id,
    v_business.id,
    'player',
    p_player_id,
    'business.equipment.installed',
    v_asset.id,
    'equipment_installed',
    jsonb_build_object(
      'assetKey', v_asset.public_key,
      'equipmentProfileKey', v_profile.public_key,
      'capabilityKey', v_profile.capability_key,
      'capacityUnits', v_profile.capacity_units
    )
  );

  return query select
    v_asset.public_key,
    v_asset.status,
    v_asset.condition_score,
    v_asset.maintenance_due_at,
    false;
end
$function$;

create or replace function public.maintain_business_equipment_v2(
  p_game_session_id uuid,
  p_player_id uuid,
  p_business_key text,
  p_asset_key text,
  p_action text,
  p_idempotency_key text
)
returns table (
  asset_key text,
  status text,
  condition_score numeric,
  cost numeric,
  maintenance_due_at timestamptz,
  replayed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_business public.business_entities%rowtype;
  v_asset public.business_equipment_assets%rowtype;
  v_profile public.business_equipment_profiles%rowtype;
  v_effective numeric;
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_cost numeric;
  v_cash numeric;
begin
  if v_action not in ('maintain', 'repair') then
    raise exception 'BUSINESS_EQUIPMENT_ACTION_INVALID' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 160 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = 'P0001';
  end if;

  select business_row.* into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.public_key = lower(btrim(p_business_key))
    and business_row.status <> 'closed'
    and business_row.formation_state = 'operational'
  for share;
  if not found then
    raise exception 'BUSINESS_NOT_FOUND_OR_NOT_OPERATIONAL' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.business_ownership_positions as position_row
    where position_row.game_session_id = p_game_session_id
      and position_row.business_id = v_business.id
      and position_row.player_id = p_player_id
      and position_row.status = 'active'
  ) then
    raise exception 'BUSINESS_OWNERSHIP_REQUIRED' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.audit_log as audit_row
    where audit_row.game_session_id = p_game_session_id
      and audit_row.actor_id = p_player_id
      and audit_row.action = 'business.equipment.service'
      and audit_row.metadata ->> 'idempotency_key' = p_idempotency_key
  ) then
    select asset_row.* into v_asset
    from public.business_equipment_assets as asset_row
    where asset_row.game_session_id = p_game_session_id
      and asset_row.public_key = lower(btrim(p_asset_key));
    select profile_row.* into v_profile
    from public.business_equipment_profiles as profile_row
    where profile_row.id = v_asset.equipment_profile_id;
    return query select
      v_asset.public_key,
      v_asset.status,
      public.business_equipment_effective_condition_v2(v_asset.id, now()),
      0::numeric,
      v_asset.maintenance_due_at,
      true;
    return;
  end if;

  select asset_row.* into v_asset
  from public.business_equipment_assets as asset_row
  where asset_row.game_session_id = p_game_session_id
    and asset_row.business_id = v_business.id
    and asset_row.public_key = lower(btrim(p_asset_key))
    and asset_row.status in ('active', 'maintenance', 'broken')
  for update;
  if not found then
    raise exception 'BUSINESS_EQUIPMENT_ASSET_NOT_FOUND' using errcode = 'P0001';
  end if;
  select profile_row.* into v_profile
  from public.business_equipment_profiles as profile_row
  where profile_row.game_session_id = p_game_session_id
    and profile_row.id = v_asset.equipment_profile_id
    and profile_row.status = 'active';
  if not found then
    raise exception 'BUSINESS_EQUIPMENT_PROFILE_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_effective := public.business_equipment_effective_condition_v2(v_asset.id, now());
  v_cost := case
    when v_action = 'maintain' then v_profile.maintenance_cost
    else round(
      v_profile.maintenance_cost
      + greatest(0, 100 - v_effective) * v_profile.repair_cost_per_condition_point,
      2
    )
  end;
  v_cash := public.read_business_balance_v2(
    p_game_session_id,
    v_business.id,
    v_business.currency_code
  );
  if v_cash < v_cost then
    raise exception 'BUSINESS_EQUIPMENT_INSUFFICIENT_FUNDS' using errcode = 'P0001';
  end if;
  if v_cost > 0 then
    perform public.record_business_ledger_entry_v2(
      p_game_session_id,
      v_business.id,
      -v_cost,
      v_business.currency_code,
      'debit',
      'business',
      'equipment_service',
      v_asset.id,
      'player',
      p_player_id,
      jsonb_build_object('asset_key', v_asset.public_key, 'action', v_action)
    );
  end if;

  update public.business_equipment_assets
  set condition_score = case when v_action = 'repair' then 100 else greatest(85, v_effective) end,
      condition_measured_at = now(),
      status = 'active',
      last_maintained_at = now(),
      maintenance_due_at = now() + make_interval(hours => v_profile.maintenance_interval_hours)
  where id = v_asset.id
  returning * into v_asset;

  insert into public.audit_log(
    game_session_id,
    actor_type,
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  ) values (
    p_game_session_id,
    'player',
    p_player_id,
    'business.equipment.service',
    'business_equipment_asset',
    v_asset.id,
    jsonb_build_object(
      'idempotency_key', p_idempotency_key,
      'asset_key', v_asset.public_key,
      'service_action', v_action,
      'cost', v_cost
    )
  );

  insert into public.business_activity_events(
    game_session_id,
    business_id,
    actor_type,
    actor_player_id,
    event_type,
    source_id,
    reason_code,
    metadata
  ) values (
    p_game_session_id,
    v_business.id,
    'player',
    p_player_id,
    'business.equipment.serviced',
    v_asset.id,
    'equipment_serviced',
    jsonb_build_object(
      'assetKey', v_asset.public_key,
      'action', v_action,
      'cost', v_cost,
      'condition', v_asset.condition_score
    )
  );

  return query select
    v_asset.public_key,
    v_asset.status,
    v_asset.condition_score,
    v_cost,
    v_asset.maintenance_due_at,
    false;
end
$function$;

create or replace function public.business_equipment_capacity_v2(
  p_game_session_id uuid,
  p_business_id uuid,
  p_capability_key text,
  p_as_of timestamptz default now()
)
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_capacity numeric;
begin
  select coalesce(sum(
    profile_row.capacity_units
      * case
          when public.business_equipment_effective_condition_v2(asset_row.id, p_as_of) < 20 then 0
          when public.business_equipment_effective_condition_v2(asset_row.id, p_as_of) < 50 then 0.50
          when public.business_equipment_effective_condition_v2(asset_row.id, p_as_of) < 80 then 0.80
          else 1
        end
  ), 0)
  into v_capacity
  from public.business_equipment_assets as asset_row
  join public.business_equipment_profiles as profile_row
    on profile_row.game_session_id = asset_row.game_session_id
   and profile_row.id = asset_row.equipment_profile_id
  where asset_row.game_session_id = p_game_session_id
    and asset_row.business_id = p_business_id
    and asset_row.status = 'active'
    and profile_row.status = 'active'
    and profile_row.capability_key = lower(btrim(p_capability_key));
  return greatest(0, floor(v_capacity)::integer);
end
$function$;

-- Phase D replaces this implementation with authoritative workforce matching.
create or replace function public.business_recipe_workforce_ready_v2(
  p_game_session_id uuid,
  p_business_id uuid,
  p_recipe_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select not exists (
    select 1
    from public.business_recipe_workforce_requirements as requirement_row
    where requirement_row.game_session_id = p_game_session_id
      and requirement_row.recipe_id = p_recipe_id
      and requirement_row.minimum_headcount > 0
  )
$function$;

-- ---------------------------------------------------------------------------
-- Timed production jobs
-- ---------------------------------------------------------------------------

create table if not exists public.business_production_jobs_v2 (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique default ('prj_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  business_id uuid not null,
  recipe_id uuid not null,
  started_by_player_id uuid not null,
  requested_output_quantity integer not null,
  batch_count integer not null,
  reserved_capacity_units integer not null,
  status text not null default 'in_progress',
  started_at timestamptz not null default now(),
  completion_at timestamptz not null,
  completed_at timestamptz null,
  output_inventory_transaction_id uuid null,
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint business_production_jobs_v2_public_key_check check (public_key ~ '^prj_[0-9a-f]{32}$'),
  constraint business_production_jobs_v2_business_scope_fk
    foreign key (game_session_id, business_id)
    references public.business_entities(game_session_id, id) on delete restrict,
  constraint business_production_jobs_v2_recipe_scope_fk
    foreign key (game_session_id, recipe_id)
    references public.business_recipe_definitions(game_session_id, id) on delete restrict,
  constraint business_production_jobs_v2_player_scope_fk
    foreign key (game_session_id, started_by_player_id)
    references public.players(game_session_id, id),
  constraint business_production_jobs_v2_quantity_check check (requested_output_quantity > 0),
  constraint business_production_jobs_v2_batch_check check (batch_count > 0),
  constraint business_production_jobs_v2_capacity_check check (reserved_capacity_units > 0),
  constraint business_production_jobs_v2_status_check
    check (status in ('in_progress', 'completed', 'cancelled', 'failed')),
  constraint business_production_jobs_v2_time_check check (completion_at > started_at),
  constraint business_production_jobs_v2_completed_state_check check (
    (status = 'completed' and completed_at is not null and output_inventory_transaction_id is not null)
    or (status <> 'completed' and completed_at is null and output_inventory_transaction_id is null)
  ),
  constraint business_production_jobs_v2_idempotency_check
    check (length(btrim(idempotency_key)) between 8 and 160),
  constraint business_production_jobs_v2_metadata_check check (jsonb_typeof(metadata) = 'object'),
  constraint business_production_jobs_v2_idempotency_unique
    unique (game_session_id, business_id, started_by_player_id, idempotency_key),
  constraint business_production_jobs_v2_scope_id_unique unique (game_session_id, id)
);

create index if not exists business_production_jobs_v2_due_idx
  on public.business_production_jobs_v2(status, completion_at, game_session_id, business_id)
  where status = 'in_progress';
create index if not exists business_production_jobs_v2_business_idx
  on public.business_production_jobs_v2(game_session_id, business_id, started_at desc);

create trigger set_business_production_jobs_v2_updated_at
before update on public.business_production_jobs_v2
for each row execute function public.set_current_timestamp_updated_at();

alter table public.business_production_jobs_v2 enable row level security;
revoke all on table public.business_production_jobs_v2 from public, anon, authenticated;
grant select, insert, update on table public.business_production_jobs_v2 to service_role;

create table if not exists public.business_production_job_inputs_v2 (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  production_job_id uuid not null,
  game_item_id uuid not null,
  reserved_quantity numeric(14,4) not null,
  reservation_inventory_transaction_id uuid not null,
  consumption_inventory_transaction_id uuid null,
  created_at timestamptz not null default now(),
  constraint business_production_job_inputs_v2_job_scope_fk
    foreign key (game_session_id, production_job_id)
    references public.business_production_jobs_v2(game_session_id, id) on delete cascade,
  constraint business_production_job_inputs_v2_item_scope_fk
    foreign key (game_session_id, game_item_id)
    references public.game_items(game_session_id, id) on delete restrict,
  constraint business_production_job_inputs_v2_quantity_check check (reserved_quantity > 0),
  constraint business_production_job_inputs_v2_unique
    unique (game_session_id, production_job_id, game_item_id)
);

alter table public.business_production_job_inputs_v2 enable row level security;
revoke all on table public.business_production_job_inputs_v2 from public, anon, authenticated;
grant select, insert, update on table public.business_production_job_inputs_v2 to service_role;

create or replace function public.start_business_production_v2(
  p_game_session_id uuid,
  p_player_id uuid,
  p_business_key text,
  p_recipe_key text,
  p_quantity integer,
  p_idempotency_key text
)
returns table (
  job_key text,
  status text,
  output_item_key text,
  quantity integer,
  completion_at timestamptz,
  replayed boolean
)
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
declare
  v_business public.business_entities%rowtype;
  v_recipe public.business_recipe_definitions%rowtype;
  v_job public.business_production_jobs_v2%rowtype;
  v_output_item public.game_items%rowtype;
  v_batches integer;
  v_capacity_required integer;
  v_capacity_available integer;
  v_requirement record;
  v_input record;
  v_warehouse uuid;
  v_wip uuid;
  v_tx uuid;
  v_duration_multiplier numeric := 1;
  v_completion timestamptz;
begin
  if p_quantity is null or p_quantity <= 0 or p_quantity > 1000000 then
    raise exception 'BUSINESS_PRODUCTION_QUANTITY_INVALID' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 160 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = 'P0001';
  end if;

  select business_row.* into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.public_key = lower(btrim(p_business_key))
    and business_row.status <> 'closed'
    and business_row.formation_state = 'operational'
  for share;
  if not found then
    raise exception 'BUSINESS_NOT_FOUND_OR_NOT_OPERATIONAL' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.business_ownership_positions as position_row
    where position_row.game_session_id = p_game_session_id
      and position_row.business_id = v_business.id
      and position_row.player_id = p_player_id
      and position_row.status = 'active'
  ) then
    raise exception 'BUSINESS_OWNERSHIP_REQUIRED' using errcode = 'P0001';
  end if;

  select recipe_row.* into v_recipe
  from public.business_recipe_definitions as recipe_row
  where recipe_row.game_session_id = p_game_session_id
    and recipe_row.public_key = lower(btrim(p_recipe_key))
    and recipe_row.status = 'active';
  if not found then
    raise exception 'BUSINESS_RECIPE_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_recipe.industry_code <> v_business.industry_code then
    raise exception 'BUSINESS_RECIPE_INDUSTRY_MISMATCH' using errcode = 'P0001';
  end if;
  perform public.ensure_business_starter_recipe_unlocks_v2(p_game_session_id, v_business.id);
  if not exists (
    select 1 from public.business_recipe_unlocks as unlock_row
    where unlock_row.game_session_id = p_game_session_id
      and unlock_row.business_id = v_business.id
      and unlock_row.recipe_id = v_recipe.id
  ) then
    raise exception 'BUSINESS_RECIPE_UNLOCK_REQUIRED' using errcode = 'P0001';
  end if;
  if mod(p_quantity, v_recipe.batch_size) <> 0 then
    raise exception 'BUSINESS_PRODUCTION_BATCH_SIZE_REQUIRED' using errcode = 'P0001';
  end if;

  select job_row.* into v_job
  from public.business_production_jobs_v2 as job_row
  where job_row.game_session_id = p_game_session_id
    and job_row.business_id = v_business.id
    and job_row.started_by_player_id = p_player_id
    and job_row.idempotency_key = p_idempotency_key;
  if found then
    if v_job.recipe_id <> v_recipe.id or v_job.requested_output_quantity <> p_quantity then
      raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode = 'P0001';
    end if;
    select item_row.* into v_output_item from public.game_items as item_row where item_row.id = v_recipe.output_game_item_id;
    return query select
      v_job.public_key, v_job.status, v_output_item.public_key,
      v_job.requested_output_quantity, v_job.completion_at, true;
    return;
  end if;

  if not public.business_recipe_workforce_ready_v2(
    p_game_session_id,
    v_business.id,
    v_recipe.id
  ) then
    raise exception 'BUSINESS_PRODUCTION_WORKFORCE_REQUIREMENTS_NOT_MET' using errcode = 'P0001';
  end if;

  v_batches := p_quantity / v_recipe.batch_size;
  v_capacity_required := greatest(1, ceil(
    v_recipe.base_capacity_units * p_quantity::numeric / v_recipe.batch_size
  )::integer);

  for v_requirement in
    select requirement_row.*
    from public.business_recipe_equipment_requirements as requirement_row
    where requirement_row.game_session_id = p_game_session_id
      and requirement_row.recipe_id = v_recipe.id
  loop
    v_capacity_available := public.business_equipment_capacity_v2(
      p_game_session_id,
      v_business.id,
      v_requirement.capability_key,
      now()
    );
    if v_capacity_available < v_requirement.minimum_capacity then
      raise exception 'BUSINESS_PRODUCTION_EQUIPMENT_REQUIREMENTS_NOT_MET' using errcode = 'P0001';
    end if;
  end loop;

  if exists (
    select 1
    from public.business_recipe_equipment_requirements as requirement_row
    where requirement_row.game_session_id = p_game_session_id
      and requirement_row.recipe_id = v_recipe.id
  ) then
    select min(
      public.business_equipment_capacity_v2(
        p_game_session_id,
        v_business.id,
        requirement_row.capability_key,
        now()
      )::numeric / greatest(1, requirement_row.minimum_capacity)
    )
    into v_duration_multiplier
    from public.business_recipe_equipment_requirements as requirement_row
    where requirement_row.game_session_id = p_game_session_id
      and requirement_row.recipe_id = v_recipe.id;
    v_duration_multiplier := greatest(0.50, least(1.0, 1 / greatest(1, v_duration_multiplier)));
  else
    v_duration_multiplier := 1;
  end if;

  v_warehouse := economy_private.ensure_business_inventory_account_v2(
    p_game_session_id,
    v_business.id,
    'warehouse'
  );
  v_wip := economy_private.ensure_business_inventory_account_v2(
    p_game_session_id,
    v_business.id,
    'work_in_progress'
  );

  -- Every reservation is one canonical Inventory transaction. If any BOM input
  -- is insufficient, the raised Inventory-domain exception aborts this function
  -- and the entire PostgreSQL transaction, including earlier reservations.
  for v_input in
    select input_row.*
    from public.business_recipe_inputs as input_row
    where input_row.game_session_id = p_game_session_id
      and input_row.recipe_id = v_recipe.id
    order by input_row.game_item_id
  loop
    select transaction_id into v_tx
    from economy_private.post_inventory_transaction_v2(
      p_game_session_id => p_game_session_id,
      p_game_item_id => v_input.input_game_item_id,
      p_from_account_id => v_warehouse,
      p_to_account_id => v_wip,
      p_quantity => v_input.quantity_per_batch * v_batches,
      p_unit_cost => null,
      p_transaction_kind => 'transfer',
      p_source_domain => 'business',
      p_source_action => 'production_reserve',
      p_source_id => v_recipe.id,
      p_idempotency_key => 'production-reserve:' || p_idempotency_key || ':' || v_input.input_game_item_id::text,
      p_metadata => jsonb_build_object('business_id', v_business.id, 'recipe_key', v_recipe.public_key)
    );

    -- Job row is written after all reservations succeed; input rows are staged in
    -- a local temporary collection via metadata after job creation below.
  end loop;

  v_completion := now() + make_interval(
    secs => ceil(
      v_recipe.production_duration_minutes * 60 * v_batches * v_duration_multiplier
    )::integer
  );

  insert into public.business_production_jobs_v2(
    game_session_id,
    business_id,
    recipe_id,
    started_by_player_id,
    requested_output_quantity,
    batch_count,
    reserved_capacity_units,
    status,
    completion_at,
    idempotency_key,
    metadata
  ) values (
    p_game_session_id,
    v_business.id,
    v_recipe.id,
    p_player_id,
    p_quantity,
    v_batches,
    v_capacity_required,
    'in_progress',
    v_completion,
    p_idempotency_key,
    jsonb_build_object(
      'recipeKey', v_recipe.public_key,
      'durationMultiplier', v_duration_multiplier
    )
  ) returning * into v_job;

  -- Re-read the deterministic Inventory transaction for each reserved input and
  -- journal it to the production job. The canonical posting function is
  -- idempotent on the same reservation key.
  for v_input in
    select input_row.*
    from public.business_recipe_inputs as input_row
    where input_row.game_session_id = p_game_session_id
      and input_row.recipe_id = v_recipe.id
    order by input_row.game_item_id
  loop
    select transaction_id into v_tx
    from economy_private.post_inventory_transaction_v2(
      p_game_session_id => p_game_session_id,
      p_game_item_id => v_input.input_game_item_id,
      p_from_account_id => v_warehouse,
      p_to_account_id => v_wip,
      p_quantity => v_input.quantity_per_batch * v_batches,
      p_unit_cost => null,
      p_transaction_kind => 'transfer',
      p_source_domain => 'business',
      p_source_action => 'production_reserve',
      p_source_id => v_recipe.id,
      p_idempotency_key => 'production-reserve:' || p_idempotency_key || ':' || v_input.input_game_item_id::text,
      p_metadata => jsonb_build_object(
        'business_id', v_business.id,
        'recipe_key', v_recipe.public_key,
        'production_job_key', v_job.public_key
      )
    );
    insert into public.business_production_job_inputs_v2(
      game_session_id,
      production_job_id,
      game_item_id,
      reserved_quantity,
      reservation_inventory_transaction_id
    ) values (
      p_game_session_id,
      v_job.id,
      v_input.input_game_item_id,
      v_input.quantity_per_batch * v_batches,
      v_tx
    );
  end loop;

  select item_row.* into v_output_item
  from public.game_items as item_row
  where item_row.id = v_recipe.output_game_item_id;

  insert into public.business_activity_events(
    game_session_id,
    business_id,
    actor_type,
    actor_player_id,
    event_type,
    source_id,
    reason_code,
    metadata
  ) values (
    p_game_session_id,
    v_business.id,
    'player',
    p_player_id,
    'business.production.started',
    v_job.id,
    'production_started',
    jsonb_build_object(
      'jobKey', v_job.public_key,
      'recipeKey', v_recipe.public_key,
      'outputItemKey', v_output_item.public_key,
      'quantity', p_quantity,
      'completionAt', v_job.completion_at
    )
  );

  return query select
    v_job.public_key,
    v_job.status,
    v_output_item.public_key,
    v_job.requested_output_quantity,
    v_job.completion_at,
    false;
end
$function$;

create or replace function public.complete_due_business_production_v2(
  p_limit integer default 100
)
returns table (
  processed integer,
  completed integer,
  skipped integer
)
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
declare
  v_limit integer := least(1000, greatest(1, coalesce(p_limit, 100)));
  v_job public.business_production_jobs_v2%rowtype;
  v_recipe public.business_recipe_definitions%rowtype;
  v_input public.business_production_job_inputs_v2%rowtype;
  v_wip uuid;
  v_finished uuid;
  v_tx uuid;
  v_processed integer := 0;
  v_completed integer := 0;
  v_skipped integer := 0;
begin
  for v_job in
    select job_row.*
    from public.business_production_jobs_v2 as job_row
    join public.business_entities as business_row
      on business_row.game_session_id = job_row.game_session_id
     and business_row.id = job_row.business_id
    where job_row.status = 'in_progress'
      and job_row.completion_at <= now()
      and business_row.status <> 'closed'
      and business_row.formation_state = 'operational'
    order by job_row.completion_at, job_row.id
    limit v_limit
    for update of job_row skip locked
  loop
    v_processed := v_processed + 1;
    select recipe_row.* into v_recipe
    from public.business_recipe_definitions as recipe_row
    where recipe_row.game_session_id = v_job.game_session_id
      and recipe_row.id = v_job.recipe_id;
    if not found then
      update public.business_production_jobs_v2 set status = 'failed' where id = v_job.id;
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_wip := economy_private.ensure_business_inventory_account_v2(
      v_job.game_session_id,
      v_job.business_id,
      'work_in_progress'
    );
    v_finished := economy_private.ensure_business_inventory_account_v2(
      v_job.game_session_id,
      v_job.business_id,
      'finished_goods'
    );

    for v_input in
      select input_row.*
      from public.business_production_job_inputs_v2 as input_row
      where input_row.game_session_id = v_job.game_session_id
        and input_row.production_job_id = v_job.id
      order by input_row.game_item_id
      for update
    loop
      select transaction_id into v_tx
      from economy_private.post_inventory_transaction_v2(
        p_game_session_id => v_job.game_session_id,
        p_game_item_id => v_input.game_item_id,
        p_from_account_id => v_wip,
        p_to_account_id => null,
        p_quantity => v_input.reserved_quantity,
        p_unit_cost => null,
        p_transaction_kind => 'consume',
        p_source_domain => 'business',
        p_source_action => 'production_consume',
        p_source_id => v_job.id,
        p_idempotency_key => 'production-consume:' || v_job.public_key || ':' || v_input.game_item_id::text,
        p_metadata => jsonb_build_object('production_job_key', v_job.public_key)
      );
      update public.business_production_job_inputs_v2
      set consumption_inventory_transaction_id = v_tx
      where id = v_input.id;
    end loop;

    select transaction_id into v_tx
    from economy_private.post_inventory_transaction_v2(
      p_game_session_id => v_job.game_session_id,
      p_game_item_id => v_recipe.output_game_item_id,
      p_from_account_id => null,
      p_to_account_id => v_finished,
      p_quantity => v_job.requested_output_quantity,
      p_unit_cost => null,
      p_transaction_kind => 'produce',
      p_source_domain => 'business',
      p_source_action => 'production_complete',
      p_source_id => v_job.id,
      p_idempotency_key => 'production-output:' || v_job.public_key,
      p_metadata => jsonb_build_object('production_job_key', v_job.public_key)
    );

    update public.business_production_jobs_v2
    set status = 'completed',
        completed_at = now(),
        output_inventory_transaction_id = v_tx
    where id = v_job.id and status = 'in_progress';

    if found then
      v_completed := v_completed + 1;
      insert into public.business_activity_events(
        game_session_id,
        business_id,
        actor_type,
        event_type,
        source_id,
        reason_code,
        metadata
      ) values (
        v_job.game_session_id,
        v_job.business_id,
        'system',
        'business.production.completed',
        v_job.id,
        'production_completed',
        jsonb_build_object(
          'jobKey', v_job.public_key,
          'quantity', v_job.requested_output_quantity,
          'inventoryTransactionId', v_tx
        )
      );
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  return query select v_processed, v_completed, v_skipped;
end
$function$;

revoke all on function public.business_equipment_effective_condition_v2(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.business_equipment_effective_condition_v2(uuid, timestamptz) to service_role;
revoke all on function public.install_business_equipment_v2(uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.install_business_equipment_v2(uuid, uuid, text, text, text) to service_role;
revoke all on function public.maintain_business_equipment_v2(uuid, uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.maintain_business_equipment_v2(uuid, uuid, text, text, text, text) to service_role;
revoke all on function public.business_equipment_capacity_v2(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.business_equipment_capacity_v2(uuid, uuid, text, timestamptz) to service_role;
revoke all on function public.business_recipe_workforce_ready_v2(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.business_recipe_workforce_ready_v2(uuid, uuid, uuid) to service_role;
revoke all on function public.start_business_production_v2(uuid, uuid, text, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.start_business_production_v2(uuid, uuid, text, text, integer, text) to service_role;
revoke all on function public.complete_due_business_production_v2(integer)
  from public, anon, authenticated;
grant execute on function public.complete_due_business_production_v2(integer) to service_role;

commit;

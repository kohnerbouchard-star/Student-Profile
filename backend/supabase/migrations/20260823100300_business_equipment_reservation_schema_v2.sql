-- Business V2 Phase 5A: canonical Business equipment capacity foundation.
-- Additive, forward-only, and intentionally excludes timed manufacturing and maintenance settlement.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- Finite equipment-period reservations
-- ---------------------------------------------------------------------------

create unique index if not exists business_production_runs_scope_id_unique
  on public.business_production_runs(game_session_id, id);

create table if not exists public.business_equipment_reservations (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique default ('eqr_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  business_id uuid not null,
  installation_id uuid not null,
  requirement_id uuid not null
    references public.business_recipe_equipment_requirements(id) on delete restrict,
  production_run_id uuid null,
  period_key text not null,
  intent_ref text not null,
  reserved_minutes integer not null,
  status text not null default 'reserved',
  idempotency_key text not null,
  request_hash text not null,
  created_at timestamptz not null default now(),
  activated_at timestamptz null,
  consumed_at timestamptz null,
  released_at timestamptz null,
  constraint business_equipment_reservations_public_key_check
    check (public_key ~ '^eqr_[0-9a-f]{32}$'),
  constraint business_equipment_reservations_business_scope_fk
    foreign key (game_session_id, business_id)
    references public.business_entities(game_session_id, id) on delete cascade,
  constraint business_equipment_reservations_installation_scope_fk
    foreign key (game_session_id, installation_id)
    references public.business_equipment_installations(game_session_id, id) on delete restrict,
  constraint business_equipment_reservations_production_scope_fk
    foreign key (game_session_id, production_run_id)
    references public.business_production_runs(game_session_id, id) on delete restrict,
  constraint business_equipment_reservations_period_check
    check (period_key ~ '^equipment:[1-9][0-9]*$'),
  constraint business_equipment_reservations_intent_check
    check (intent_ref ~ '^[a-z0-9][a-z0-9._:-]{7,159}$'),
  constraint business_equipment_reservations_minutes_check
    check (reserved_minutes between 1 and 100000),
  constraint business_equipment_reservations_status_check
    check (status in ('reserved','active','consumed','released')),
  constraint business_equipment_reservations_idempotency_check
    check (length(btrim(idempotency_key)) between 8 and 160),
  constraint business_equipment_reservations_hash_check
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint business_equipment_reservations_state_check check (
    (status = 'reserved' and activated_at is null and consumed_at is null and released_at is null)
    or (status = 'active' and activated_at is not null and consumed_at is null and released_at is null)
    or (status = 'consumed' and consumed_at is not null and released_at is null)
    or (status = 'released' and released_at is not null and consumed_at is null)
  ),
  constraint business_equipment_reservations_intent_unique
    unique (game_session_id, installation_id, requirement_id, period_key, intent_ref),
  constraint business_equipment_reservations_idempotency_unique
    unique (game_session_id, business_id, installation_id, idempotency_key)
);

create or replace function economy_private.guard_business_equipment_reservation_v2()
returns trigger
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
declare
  v_installation public.business_equipment_installations%rowtype;
  v_profile public.business_equipment_capacity_profiles%rowtype;
  v_requirement public.business_recipe_equipment_requirements%rowtype;
  v_used_minutes integer := 0;
begin
  select installation_row.*
  into v_installation
  from public.business_equipment_installations as installation_row
  where installation_row.game_session_id = new.game_session_id
    and installation_row.id = new.installation_id
  for update;
  if not found
    or v_installation.business_id is distinct from new.business_id
  then
    raise exception 'BUSINESS_EQUIPMENT_RESERVATION_INSTALLATION_INVALID' using errcode = 'P0001';
  end if;

  select profile_row.*
  into v_profile
  from public.business_equipment_capacity_profiles as profile_row
  where profile_row.id = v_installation.capacity_profile_id
    and profile_row.status = 'active'
  for share;
  if not found then
    raise exception 'BUSINESS_EQUIPMENT_RESERVATION_PROFILE_INVALID' using errcode = 'P0001';
  end if;

  select requirement_row.*
  into v_requirement
  from public.business_recipe_equipment_requirements as requirement_row
  where requirement_row.id = new.requirement_id
    and requirement_row.status = 'active'
  for share;
  if not found
    or not (v_requirement.capability_key = any(v_profile.capability_keys))
  then
    raise exception 'BUSINESS_EQUIPMENT_RESERVATION_CAPABILITY_INVALID' using errcode = 'P0001';
  end if;

  if new.production_run_id is not null and not exists (
    select 1
    from public.business_production_runs as run_row
    where run_row.game_session_id = new.game_session_id
      and run_row.id = new.production_run_id
      and run_row.business_id = new.business_id
  ) then
    raise exception 'BUSINESS_EQUIPMENT_RESERVATION_RUN_INVALID' using errcode = 'P0001';
  end if;

  if tg_op = 'INSERT' then
    if v_installation.status <> 'installed'
      or new.status <> 'reserved'
      or new.production_run_id is not null
      or new.activated_at is not null
      or new.consumed_at is not null
      or new.released_at is not null
    then
      raise exception 'BUSINESS_EQUIPMENT_RESERVATION_INITIAL_STATE_INVALID' using errcode = 'P0001';
    end if;

    select coalesce(sum(existing.reserved_minutes), 0)::integer
    into v_used_minutes
    from public.business_equipment_reservations as existing
    where existing.game_session_id = new.game_session_id
      and existing.installation_id = new.installation_id
      and existing.period_key = new.period_key
      and existing.status in ('reserved','active','consumed');

    if v_used_minutes + new.reserved_minutes > v_profile.base_capacity_minutes_per_period then
      raise exception 'BUSINESS_EQUIPMENT_CAPACITY_UNAVAILABLE' using errcode = 'P0001';
    end if;
  else
    if new.game_session_id is distinct from old.game_session_id
      or new.business_id is distinct from old.business_id
      or new.installation_id is distinct from old.installation_id
      or new.requirement_id is distinct from old.requirement_id
      or new.period_key is distinct from old.period_key
      or new.intent_ref is distinct from old.intent_ref
      or new.reserved_minutes is distinct from old.reserved_minutes
      or new.idempotency_key is distinct from old.idempotency_key
      or new.request_hash is distinct from old.request_hash
      or new.created_at is distinct from old.created_at
    then
      raise exception 'BUSINESS_EQUIPMENT_RESERVATION_IDENTITY_IMMUTABLE' using errcode = '42501';
    end if;

    if old.status = 'reserved'
      and new.status not in ('reserved','active','consumed','released')
    then
      raise exception 'BUSINESS_EQUIPMENT_RESERVATION_TRANSITION_INVALID' using errcode = 'P0001';
    end if;
    if old.status = 'active'
      and new.status not in ('active','consumed','released')
    then
      raise exception 'BUSINESS_EQUIPMENT_RESERVATION_TRANSITION_INVALID' using errcode = 'P0001';
    end if;
    if old.status in ('consumed','released') and new.status <> old.status then
      raise exception 'BUSINESS_EQUIPMENT_RESERVATION_TERMINAL' using errcode = 'P0001';
    end if;
  end if;

  return new;
end
$function$;

create trigger guard_business_equipment_reservation_v2
before insert or update on public.business_equipment_reservations
for each row execute function economy_private.guard_business_equipment_reservation_v2();

create index if not exists business_equipment_reservations_capacity_idx
  on public.business_equipment_reservations(
    game_session_id, installation_id, period_key, status
  );
create index if not exists business_equipment_reservations_intent_idx
  on public.business_equipment_reservations(
    game_session_id, business_id, intent_ref, status
  );

alter table public.business_equipment_reservations enable row level security;
revoke all on table public.business_equipment_reservations from public, anon, authenticated;
grant select, insert, update, delete on table public.business_equipment_reservations to service_role;

commit;

-- Business V2 Phase 6A: server-owned timed manufacturing job foundation.
--
-- This migration adds the durable job/lifecycle authority required before the
-- live instant-production route can be retired. It intentionally does not expose
-- a Player job-creation mutation and does not settle materials or output yet.
-- Phase 6B must create jobs only after canonical material, labor, and equipment
-- reservations have been committed.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function public.derive_business_manufacturing_duration_seconds_v2(
  p_game_session_id uuid,
  p_business_id uuid,
  p_recipe_definition_id uuid,
  p_quantity integer,
  p_priority text
)
returns integer
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_business public.business_entities%rowtype;
  v_recipe public.physical_economy_recipe_definitions%rowtype;
  v_availability public.game_session_recipe_availability%rowtype;
  v_difficulty text := 'moderate';
  v_difficulty_multiplier numeric := 1;
  v_priority_multiplier numeric := 1;
  v_duration numeric;
begin
  if p_game_session_id is null
    or p_business_id is null
    or p_recipe_definition_id is null
    or p_quantity is null
    or p_quantity not between 1 and 10000
    or lower(btrim(coalesce(p_priority, ''))) not in ('standard','expedite')
  then
    raise exception 'BUSINESS_MANUFACTURING_DURATION_REQUEST_INVALID'
      using errcode = 'P0001';
  end if;

  select business_row.*
  into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.id = p_business_id
    and business_row.status = 'active';
  if not found then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  select recipe_row.*
  into v_recipe
  from public.physical_economy_recipe_definitions as recipe_row
  where recipe_row.id = p_recipe_definition_id
    and recipe_row.status = 'active';
  if not found then
    raise exception 'BUSINESS_MANUFACTURING_RECIPE_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.business_recipe_access as access_row
    where access_row.game_session_id = p_game_session_id
      and access_row.business_id = p_business_id
      and access_row.recipe_id = v_recipe.id
      and access_row.revoked_at is null
  ) then
    raise exception 'BUSINESS_MANUFACTURING_RECIPE_NOT_OWNED'
      using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.game_session_physical_economy_packs as pack_scope
    where pack_scope.game_session_id = p_game_session_id
      and pack_scope.pack_id = v_recipe.pack_id
      and pack_scope.status = 'active'
  ) then
    raise exception 'BUSINESS_MANUFACTURING_PACK_INACTIVE'
      using errcode = 'P0001';
  end if;

  select availability_row.*
  into v_availability
  from public.game_session_recipe_availability as availability_row
  where availability_row.game_session_id = p_game_session_id
    and availability_row.recipe_id = v_recipe.id
    and availability_row.enabled = true
    and availability_row.scarcity_band <> 'unavailable';
  if not found then
    raise exception 'BUSINESS_MANUFACTURING_RECIPE_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  if cardinality(v_availability.country_codes) > 0
    and not v_business.country_code = any(v_availability.country_codes)
  then
    raise exception 'BUSINESS_MANUFACTURING_RECIPE_COUNTRY_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  select coalesce(nullif(lower(policy.difficulty_preset), 'standard'), 'moderate')
  into v_difficulty
  from public.game_difficulty_policy_settings as policy
  where policy.game_session_id = p_game_session_id;
  if not found then
    select coalesce(nullif(lower(settings.difficulty_preset), 'standard'), 'moderate')
    into v_difficulty
    from public.game_settings as settings
    where settings.game_session_id = p_game_session_id;
  end if;
  v_difficulty := coalesce(v_difficulty, 'moderate');

  v_difficulty_multiplier := case v_difficulty
    when 'easy' then 0.8
    when 'hard' then 1.25
    when 'insane' then 1.5
    else 1
  end;
  v_priority_multiplier := case lower(btrim(p_priority))
    when 'expedite' then 0.75
    else 1
  end;

  v_duration := ceil(
    v_recipe.base_duration_seconds
    * p_quantity
    * v_difficulty_multiplier
    * greatest(v_availability.event_duration_multiplier, 0.01)
    * greatest(v_availability.route_disruption_multiplier, 0.01)
    * v_priority_multiplier
  );

  if v_duration < 1 or v_duration > 31536000 then
    raise exception 'BUSINESS_MANUFACTURING_DURATION_UNSUPPORTED'
      using errcode = 'P0001';
  end if;

  return v_duration::integer;
end
$function$;

revoke all on function public.derive_business_manufacturing_duration_seconds_v2(
  uuid, uuid, uuid, integer, text
) from public, anon, authenticated;
grant execute on function public.derive_business_manufacturing_duration_seconds_v2(
  uuid, uuid, uuid, integer, text
) to service_role;

create table public.business_manufacturing_jobs (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique
    default ('mfg_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null
    references public.game_sessions(id) on delete cascade,
  business_id uuid not null,
  product_id uuid not null,
  recipe_definition_id uuid not null
    references public.physical_economy_recipe_definitions(id) on delete restrict,
  output_game_item_id uuid not null,
  requested_by_player_id uuid not null,
  idempotency_key text not null,
  request_hash text not null,
  quantity integer not null,
  priority text not null default 'standard',
  status text not null default 'queued',
  resource_state text not null default 'reserved',
  duration_seconds integer not null,
  recipe_snapshot jsonb not null default '{}'::jsonb,
  queue_available_at timestamptz not null default statement_timestamp(),
  started_at timestamptz null,
  completes_at timestamptz null,
  completed_at timestamptz null,
  cancelled_at timestamptz null,
  failed_at timestamptz null,
  completion_attempt_count integer not null default 0,
  completion_max_attempts integer not null default 12,
  completion_next_attempt_at timestamptz not null default statement_timestamp(),
  completion_lease_token uuid null,
  completion_lease_expires_at timestamptz null,
  last_error_code text null,
  last_error_detail text null,
  version bigint not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint business_manufacturing_jobs_public_key_check
    check (public_key ~ '^mfg_[0-9a-f]{32}$'),
  constraint business_manufacturing_jobs_business_scope_fk
    foreign key (game_session_id, business_id)
    references public.business_entities(game_session_id, id) on delete cascade,
  constraint business_manufacturing_jobs_product_scope_fk
    foreign key (game_session_id, product_id)
    references public.business_products(game_session_id, id) on delete restrict,
  constraint business_manufacturing_jobs_output_scope_fk
    foreign key (game_session_id, output_game_item_id)
    references public.game_items(game_session_id, id) on delete restrict,
  constraint business_manufacturing_jobs_player_scope_fk
    foreign key (game_session_id, requested_by_player_id)
    references public.players(game_session_id, id) on delete restrict,
  constraint business_manufacturing_jobs_idempotency_check
    check (length(btrim(idempotency_key)) between 8 and 160),
  constraint business_manufacturing_jobs_request_hash_check
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint business_manufacturing_jobs_quantity_check
    check (quantity between 1 and 10000),
  constraint business_manufacturing_jobs_priority_check
    check (priority in ('standard','expedite')),
  constraint business_manufacturing_jobs_status_check
    check (status in ('queued','in_progress','completed','cancelled','failed')),
  constraint business_manufacturing_jobs_resource_state_check
    check (resource_state in ('reserved','consumed','released')),
  constraint business_manufacturing_jobs_duration_check
    check (duration_seconds between 1 and 31536000),
  constraint business_manufacturing_jobs_snapshot_check
    check (jsonb_typeof(recipe_snapshot) = 'object'),
  constraint business_manufacturing_jobs_attempt_check
    check (
      completion_attempt_count >= 0
      and completion_max_attempts between 1 and 50
      and completion_attempt_count <= completion_max_attempts
    ),
  constraint business_manufacturing_jobs_lease_pair_check
    check (
      (completion_lease_token is null and completion_lease_expires_at is null)
      or
      (completion_lease_token is not null and completion_lease_expires_at is not null)
    ),
  constraint business_manufacturing_jobs_error_code_check
    check (
      last_error_code is null
      or last_error_code ~ '^[a-z0-9][a-z0-9._:-]{0,127}$'
    ),
  constraint business_manufacturing_jobs_version_check
    check (version > 0),
  constraint business_manufacturing_jobs_lifecycle_check check (
    (
      status = 'queued'
      and resource_state = 'reserved'
      and started_at is null
      and completes_at is null
      and completed_at is null
      and cancelled_at is null
      and failed_at is null
      and completion_lease_token is null
      and completion_lease_expires_at is null
    )
    or
    (
      status = 'in_progress'
      and resource_state = 'reserved'
      and started_at is not null
      and completes_at is not null
      and completes_at > started_at
      and completed_at is null
      and cancelled_at is null
      and failed_at is null
    )
    or
    (
      status = 'completed'
      and resource_state = 'consumed'
      and started_at is not null
      and completes_at is not null
      and completed_at is not null
      and cancelled_at is null
      and failed_at is null
      and completion_lease_token is null
      and completion_lease_expires_at is null
    )
    or
    (
      status = 'cancelled'
      and resource_state = 'released'
      and completed_at is null
      and cancelled_at is not null
      and failed_at is null
      and completion_lease_token is null
      and completion_lease_expires_at is null
    )
    or
    (
      status = 'failed'
      and resource_state = 'released'
      and completed_at is null
      and cancelled_at is null
      and failed_at is not null
      and completion_lease_token is null
      and completion_lease_expires_at is null
    )
  ),
  constraint business_manufacturing_jobs_idempotency_unique
    unique (game_session_id, requested_by_player_id, idempotency_key),
  constraint business_manufacturing_jobs_scope_id_unique
    unique (game_session_id, id)
);

create index business_manufacturing_jobs_queue_idx
  on public.business_manufacturing_jobs(
    game_session_id, status, queue_available_at, public_key
  )
  where status = 'queued';
create index business_manufacturing_jobs_due_idx
  on public.business_manufacturing_jobs(
    game_session_id, status, completes_at, completion_next_attempt_at, public_key
  )
  where status = 'in_progress';
create index business_manufacturing_jobs_business_created_idx
  on public.business_manufacturing_jobs(
    game_session_id, business_id, created_at desc, public_key
  );

create table public.business_manufacturing_job_transitions (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null
    references public.game_sessions(id) on delete cascade,
  job_id uuid not null,
  from_status text null,
  to_status text not null,
  actor_type text not null,
  actor_id uuid null,
  action text not null,
  idempotency_key text not null,
  outcome jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default statement_timestamp(),
  constraint business_manufacturing_job_transitions_job_scope_fk
    foreign key (game_session_id, job_id)
    references public.business_manufacturing_jobs(game_session_id, id)
    on delete cascade,
  constraint business_manufacturing_job_transitions_from_status_check
    check (
      from_status is null
      or from_status in ('queued','in_progress','completed','cancelled','failed')
    ),
  constraint business_manufacturing_job_transitions_to_status_check
    check (to_status in ('queued','in_progress','completed','cancelled','failed')),
  constraint business_manufacturing_job_transitions_actor_check
    check (actor_type in ('player','staff_user','system')),
  constraint business_manufacturing_job_transitions_action_check
    check (action ~ '^[a-z][a-z0-9._-]{2,127}$'),
  constraint business_manufacturing_job_transitions_idempotency_check
    check (length(btrim(idempotency_key)) between 8 and 160),
  constraint business_manufacturing_job_transitions_outcome_check
    check (jsonb_typeof(outcome) = 'object'),
  constraint business_manufacturing_job_transitions_idempotency_unique
    unique (game_session_id, job_id, idempotency_key)
);

create index business_manufacturing_job_transitions_job_created_idx
  on public.business_manufacturing_job_transitions(
    game_session_id, job_id, created_at, id
  );

create or replace function economy_private.guard_business_manufacturing_job_v2()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, economy_private, extensions, pg_temp
as $function$
declare
  v_business public.business_entities%rowtype;
  v_product public.business_products%rowtype;
  v_recipe public.physical_economy_recipe_definitions%rowtype;
  v_output public.game_items%rowtype;
  v_duration integer;
  v_expected_hash text;
begin
  if tg_op = 'INSERT' then
    select business_row.*
    into v_business
    from public.business_entities as business_row
    where business_row.game_session_id = new.game_session_id
      and business_row.id = new.business_id
      and business_row.status = 'active'
      and (
        exists (
          select 1
          from public.business_ownership_positions as ownership
          where ownership.game_session_id = new.game_session_id
            and ownership.business_id = business_row.id
            and ownership.player_id = new.requested_by_player_id
            and ownership.status = 'active'
            and ownership.ended_at is null
        )
        or (
          business_row.ownership_model_version = 1
          and business_row.owner_player_id = new.requested_by_player_id
        )
      );
    if not found then
      raise exception 'BUSINESS_MANUFACTURING_OWNERSHIP_INVALID'
        using errcode = 'P0001';
    end if;

    select product_row.*
    into v_product
    from public.business_products as product_row
    where product_row.game_session_id = new.game_session_id
      and product_row.id = new.product_id
      and product_row.business_id = new.business_id
      and product_row.product_kind = 'physical_good'
      and product_row.output_game_item_id = new.output_game_item_id
      and product_row.status = 'active';
    if not found then
      raise exception 'BUSINESS_MANUFACTURING_PRODUCT_INVALID'
        using errcode = 'P0001';
    end if;

    select recipe_row.*
    into v_recipe
    from public.physical_economy_recipe_definitions as recipe_row
    where recipe_row.id = new.recipe_definition_id
      and recipe_row.status = 'active';
    if not found then
      raise exception 'BUSINESS_MANUFACTURING_RECIPE_UNAVAILABLE'
        using errcode = 'P0001';
    end if;

    if not exists (
      select 1
      from public.business_recipe_access as access_row
      where access_row.game_session_id = new.game_session_id
        and access_row.business_id = new.business_id
        and access_row.recipe_id = new.recipe_definition_id
        and access_row.revoked_at is null
    ) then
      raise exception 'BUSINESS_MANUFACTURING_RECIPE_NOT_OWNED'
        using errcode = 'P0001';
    end if;

    select item_row.*
    into v_output
    from public.game_items as item_row
    where item_row.game_session_id = new.game_session_id
      and item_row.id = new.output_game_item_id
      and item_row.status = 'active';
    if not found
      or not exists (
        select 1
        from public.physical_economy_recipe_outputs as recipe_output
        where recipe_output.recipe_id = new.recipe_definition_id
          and recipe_output.item_key = v_output.canonical_key
      )
    then
      raise exception 'BUSINESS_MANUFACTURING_OUTPUT_INVALID'
        using errcode = 'P0001';
    end if;

    if new.status <> 'queued'
      or new.resource_state <> 'reserved'
      or new.started_at is not null
      or new.completes_at is not null
      or new.completed_at is not null
      or new.cancelled_at is not null
      or new.failed_at is not null
      or new.completion_lease_token is not null
      or new.completion_lease_expires_at is not null
    then
      raise exception 'BUSINESS_MANUFACTURING_INITIAL_STATE_INVALID'
        using errcode = 'P0001';
    end if;

    v_duration := public.derive_business_manufacturing_duration_seconds_v2(
      new.game_session_id,
      new.business_id,
      new.recipe_definition_id,
      new.quantity,
      new.priority
    );
    new.duration_seconds := v_duration;
    new.recipe_snapshot := jsonb_build_object(
      'recipeKey', v_recipe.recipe_key,
      'recipePackId', v_recipe.pack_id,
      'outputItemKey', v_output.public_key,
      'outputCanonicalKey', v_output.canonical_key,
      'businessCountryCode', v_business.country_code,
      'businessCurrencyCode', v_business.currency_code,
      'quantity', new.quantity,
      'priority', new.priority,
      'durationSeconds', v_duration,
      'timingAuthority', 'server_v2',
      'resourceAuthority', 'canonical_reserved_v2',
      'durabilityEnabled', false,
      'repairEnabled', false
    );

    v_expected_hash := encode(
      extensions.digest(
        concat_ws(
          '|',
          new.game_session_id,
          new.requested_by_player_id,
          new.business_id,
          new.product_id,
          new.recipe_definition_id,
          new.output_game_item_id,
          new.quantity,
          new.priority
        ),
        'sha256'
      ),
      'hex'
    );
    if new.request_hash is distinct from v_expected_hash then
      raise exception 'BUSINESS_MANUFACTURING_REQUEST_HASH_INVALID'
        using errcode = 'P0001';
    end if;
  else
    if new.game_session_id is distinct from old.game_session_id
      or new.business_id is distinct from old.business_id
      or new.product_id is distinct from old.product_id
      or new.recipe_definition_id is distinct from old.recipe_definition_id
      or new.output_game_item_id is distinct from old.output_game_item_id
      or new.requested_by_player_id is distinct from old.requested_by_player_id
      or new.idempotency_key is distinct from old.idempotency_key
      or new.request_hash is distinct from old.request_hash
      or new.quantity is distinct from old.quantity
      or new.priority is distinct from old.priority
      or new.duration_seconds is distinct from old.duration_seconds
      or new.recipe_snapshot is distinct from old.recipe_snapshot
      or new.queue_available_at is distinct from old.queue_available_at
      or new.created_at is distinct from old.created_at
    then
      raise exception 'BUSINESS_MANUFACTURING_IDENTITY_IMMUTABLE'
        using errcode = '42501';
    end if;

    if old.status = 'queued'
      and new.status not in ('queued','in_progress','cancelled','failed')
    then
      raise exception 'BUSINESS_MANUFACTURING_TRANSITION_INVALID'
        using errcode = 'P0001';
    elsif old.status = 'in_progress'
      and new.status not in ('in_progress','completed','cancelled','failed')
    then
      raise exception 'BUSINESS_MANUFACTURING_TRANSITION_INVALID'
        using errcode = 'P0001';
    elsif old.status in ('completed','cancelled','failed')
      and new.status <> old.status
    then
      raise exception 'BUSINESS_MANUFACTURING_TERMINAL'
        using errcode = 'P0001';
    end if;

    new.version := old.version + 1;
  end if;

  return new;
end
$function$;

create trigger guard_business_manufacturing_job_v2
before insert or update on public.business_manufacturing_jobs
for each row execute function economy_private.guard_business_manufacturing_job_v2();

create trigger set_business_manufacturing_jobs_updated_at
before update on public.business_manufacturing_jobs
for each row execute function public.set_current_timestamp_updated_at();

create or replace function economy_private.guard_business_manufacturing_transition_v2()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, economy_private, pg_temp
as $function$
begin
  if tg_op = 'DELETE' or tg_op = 'UPDATE' then
    raise exception 'BUSINESS_MANUFACTURING_TRANSITION_IMMUTABLE'
      using errcode = '42501';
  end if;
  return new;
end
$function$;

create trigger guard_business_manufacturing_transition_v2
before update or delete on public.business_manufacturing_job_transitions
for each row execute function economy_private.guard_business_manufacturing_transition_v2();

alter table public.business_manufacturing_jobs enable row level security;
alter table public.business_manufacturing_jobs force row level security;
alter table public.business_manufacturing_job_transitions enable row level security;
alter table public.business_manufacturing_job_transitions force row level security;

revoke all on table public.business_manufacturing_jobs
  from public, anon, authenticated;
revoke all on table public.business_manufacturing_job_transitions
  from public, anon, authenticated;
grant select, insert, update on table public.business_manufacturing_jobs
  to service_role;
grant select, insert on table public.business_manufacturing_job_transitions
  to service_role;

comment on table public.business_manufacturing_jobs is
  'Phase 6 server-owned timed manufacturing lifecycle. Rows may be created only after canonical material, labor, and equipment reservations exist.';
comment on table public.business_manufacturing_job_transitions is
  'Append-only exact transition evidence for timed Business manufacturing jobs.';

commit;

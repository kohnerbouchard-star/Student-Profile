-- Canonical Business recipes and server-authoritative R&D V2.
--
-- Recipes reference existing game_items only. Research never creates a product;
-- it unlocks a canonical recipe for one Business. Completion is timestamp driven
-- and processed in bounded batches with SKIP LOCKED.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- Canonical recipe catalog
-- ---------------------------------------------------------------------------

create table if not exists public.business_recipe_definitions (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique default ('rcp_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  canonical_key text not null,
  output_game_item_id uuid not null,
  industry_code text not null,
  batch_size integer not null default 1,
  production_duration_minutes integer not null default 60,
  base_capacity_units integer not null default 100,
  research_fee numeric(14,2) not null default 0,
  research_duration_hours integer not null default 24,
  is_starter boolean not null default false,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint business_recipe_definitions_public_key_check
    check (public_key ~ '^rcp_[0-9a-f]{32}$'),
  constraint business_recipe_definitions_canonical_key_check
    check (canonical_key ~ '^[a-z0-9][a-z0-9._-]{0,159}$'),
  constraint business_recipe_definitions_output_scope_fk
    foreign key (game_session_id, output_game_item_id)
    references public.game_items(game_session_id, id) on delete restrict,
  constraint business_recipe_definitions_industry_check
    check (industry_code ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
  constraint business_recipe_definitions_batch_check
    check (batch_size between 1 and 100000),
  constraint business_recipe_definitions_duration_check
    check (production_duration_minutes between 1 and 10080),
  constraint business_recipe_definitions_capacity_check
    check (base_capacity_units between 1 and 1000000),
  constraint business_recipe_definitions_research_fee_check
    check (research_fee between 0 and 10000000),
  constraint business_recipe_definitions_research_duration_check
    check (research_duration_hours between 1 and 4320),
  constraint business_recipe_definitions_status_check
    check (status in ('active', 'disabled', 'retired')),
  constraint business_recipe_definitions_metadata_check
    check (jsonb_typeof(metadata) = 'object'),
  constraint business_recipe_definitions_version_check check (version > 0),
  constraint business_recipe_definitions_scope_unique unique (game_session_id, canonical_key),
  constraint business_recipe_definitions_output_unique unique (game_session_id, output_game_item_id),
  constraint business_recipe_definitions_scope_id_unique unique (game_session_id, id)
);

create index if not exists business_recipe_definitions_industry_idx
  on public.business_recipe_definitions(game_session_id, industry_code, status, is_starter, canonical_key);

create trigger set_business_recipe_definitions_updated_at
before update on public.business_recipe_definitions
for each row execute function public.set_current_timestamp_updated_at();

alter table public.business_recipe_definitions enable row level security;
revoke all on table public.business_recipe_definitions from public, anon, authenticated;
grant select, insert, update on table public.business_recipe_definitions to service_role;

create table if not exists public.business_recipe_inputs (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  recipe_id uuid not null,
  input_game_item_id uuid not null,
  quantity_per_batch numeric(14,4) not null,
  created_at timestamptz not null default now(),

  constraint business_recipe_inputs_recipe_scope_fk
    foreign key (game_session_id, recipe_id)
    references public.business_recipe_definitions(game_session_id, id) on delete cascade,
  constraint business_recipe_inputs_item_scope_fk
    foreign key (game_session_id, input_game_item_id)
    references public.game_items(game_session_id, id) on delete restrict,
  constraint business_recipe_inputs_quantity_check check (quantity_per_batch > 0),
  constraint business_recipe_inputs_unique unique (game_session_id, recipe_id, input_game_item_id)
);

create index if not exists business_recipe_inputs_item_idx
  on public.business_recipe_inputs(game_session_id, input_game_item_id, recipe_id);

alter table public.business_recipe_inputs enable row level security;
revoke all on table public.business_recipe_inputs from public, anon, authenticated;
grant select, insert, update, delete on table public.business_recipe_inputs to service_role;

create table if not exists public.business_recipe_prerequisites (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  recipe_id uuid not null,
  prerequisite_recipe_id uuid not null,
  created_at timestamptz not null default now(),

  constraint business_recipe_prerequisites_recipe_scope_fk
    foreign key (game_session_id, recipe_id)
    references public.business_recipe_definitions(game_session_id, id) on delete cascade,
  constraint business_recipe_prerequisites_required_scope_fk
    foreign key (game_session_id, prerequisite_recipe_id)
    references public.business_recipe_definitions(game_session_id, id) on delete cascade,
  constraint business_recipe_prerequisites_no_self check (recipe_id <> prerequisite_recipe_id),
  constraint business_recipe_prerequisites_unique
    unique (game_session_id, recipe_id, prerequisite_recipe_id)
);

alter table public.business_recipe_prerequisites enable row level security;
revoke all on table public.business_recipe_prerequisites from public, anon, authenticated;
grant select, insert, delete on table public.business_recipe_prerequisites to service_role;

create table if not exists public.business_recipe_equipment_requirements (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  recipe_id uuid not null,
  capability_key text not null,
  minimum_capacity integer not null default 1,
  created_at timestamptz not null default now(),

  constraint business_recipe_equipment_requirements_recipe_scope_fk
    foreign key (game_session_id, recipe_id)
    references public.business_recipe_definitions(game_session_id, id) on delete cascade,
  constraint business_recipe_equipment_requirements_capability_check
    check (capability_key ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
  constraint business_recipe_equipment_requirements_capacity_check
    check (minimum_capacity between 1 and 1000000),
  constraint business_recipe_equipment_requirements_unique
    unique (game_session_id, recipe_id, capability_key)
);

alter table public.business_recipe_equipment_requirements enable row level security;
revoke all on table public.business_recipe_equipment_requirements from public, anon, authenticated;
grant select, insert, update, delete on table public.business_recipe_equipment_requirements to service_role;

-- Workforce requirements are defined now so recipe data has one canonical BOM
-- shape. Phase D supplies the candidate/employee authority that satisfies them.
create table if not exists public.business_recipe_workforce_requirements (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  recipe_id uuid not null,
  role_key text not null,
  minimum_headcount integer not null default 1,
  minimum_skill numeric(10,4) not null default 0,
  created_at timestamptz not null default now(),

  constraint business_recipe_workforce_requirements_recipe_scope_fk
    foreign key (game_session_id, recipe_id)
    references public.business_recipe_definitions(game_session_id, id) on delete cascade,
  constraint business_recipe_workforce_requirements_role_check
    check (role_key ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
  constraint business_recipe_workforce_requirements_headcount_check
    check (minimum_headcount between 1 and 1000),
  constraint business_recipe_workforce_requirements_skill_check
    check (minimum_skill between 0 and 100),
  constraint business_recipe_workforce_requirements_unique
    unique (game_session_id, recipe_id, role_key)
);

alter table public.business_recipe_workforce_requirements enable row level security;
revoke all on table public.business_recipe_workforce_requirements from public, anon, authenticated;
grant select, insert, update, delete on table public.business_recipe_workforce_requirements to service_role;

-- Refuse legacy Player-authored Business products as recipe outputs. Existing
-- rows remain readable for compatibility but cannot enter the V2 recipe economy.
create or replace function public.guard_business_recipe_output_authority_v2()
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
    and item_row.id = new.output_game_item_id
    and item_row.status = 'active';
  if not found then
    raise exception 'BUSINESS_RECIPE_OUTPUT_ITEM_NOT_ACTIVE' using errcode = 'P0001';
  end if;
  if v_item.source_kind = 'business_product' then
    raise exception 'BUSINESS_RECIPE_PLAYER_AUTHORED_ITEM_PROHIBITED' using errcode = 'P0001';
  end if;
  if v_item.item_class not in ('finished_good', 'component', 'consumable', 'equipment') then
    raise exception 'BUSINESS_RECIPE_OUTPUT_ITEM_CLASS_INVALID' using errcode = 'P0001';
  end if;
  return new;
end
$function$;

create trigger guard_business_recipe_output_authority
before insert or update of game_session_id, output_game_item_id
on public.business_recipe_definitions
for each row execute function public.guard_business_recipe_output_authority_v2();

-- ---------------------------------------------------------------------------
-- Business recipe ownership
-- ---------------------------------------------------------------------------

create table if not exists public.business_recipe_unlocks (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique default ('run_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  business_id uuid not null,
  recipe_id uuid not null,
  unlock_source text not null,
  source_id uuid null,
  unlocked_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,

  constraint business_recipe_unlocks_public_key_check check (public_key ~ '^run_[0-9a-f]{32}$'),
  constraint business_recipe_unlocks_business_scope_fk
    foreign key (game_session_id, business_id)
    references public.business_entities(game_session_id, id) on delete cascade,
  constraint business_recipe_unlocks_recipe_scope_fk
    foreign key (game_session_id, recipe_id)
    references public.business_recipe_definitions(game_session_id, id) on delete restrict,
  constraint business_recipe_unlocks_source_check
    check (unlock_source in ('starter', 'research', 'admin', 'migration')),
  constraint business_recipe_unlocks_metadata_check check (jsonb_typeof(metadata) = 'object'),
  constraint business_recipe_unlocks_unique unique (game_session_id, business_id, recipe_id),
  constraint business_recipe_unlocks_scope_id_unique unique (game_session_id, id)
);

create index if not exists business_recipe_unlocks_business_idx
  on public.business_recipe_unlocks(game_session_id, business_id, unlocked_at desc);

alter table public.business_recipe_unlocks enable row level security;
revoke all on table public.business_recipe_unlocks from public, anon, authenticated;
grant select, insert on table public.business_recipe_unlocks to service_role;

create or replace function public.ensure_business_starter_recipe_unlocks_v2(
  p_game_session_id uuid,
  p_business_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_industry text;
  v_inserted integer := 0;
begin
  select business_row.industry_code into v_industry
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.id = p_business_id
    and business_row.status <> 'closed';
  if not found then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  insert into public.business_recipe_unlocks(
    game_session_id,
    business_id,
    recipe_id,
    unlock_source,
    metadata
  )
  select
    p_game_session_id,
    p_business_id,
    recipe_row.id,
    'starter',
    jsonb_build_object('industryCode', v_industry)
  from public.business_recipe_definitions as recipe_row
  where recipe_row.game_session_id = p_game_session_id
    and recipe_row.industry_code = v_industry
    and recipe_row.status = 'active'
    and recipe_row.is_starter = true
  on conflict (game_session_id, business_id, recipe_id) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end
$function$;

-- ---------------------------------------------------------------------------
-- R&D projects
-- ---------------------------------------------------------------------------

create table if not exists public.business_research_projects (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique default ('rnd_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  business_id uuid not null,
  recipe_id uuid not null,
  started_by_player_id uuid not null,
  status text not null default 'researching',
  fee_charged numeric(14,2) not null,
  base_duration_hours integer not null,
  duration_multiplier numeric(10,4) not null default 1,
  started_at timestamptz not null default now(),
  completion_at timestamptz not null,
  completed_at timestamptz null,
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint business_research_projects_public_key_check check (public_key ~ '^rnd_[0-9a-f]{32}$'),
  constraint business_research_projects_business_scope_fk
    foreign key (game_session_id, business_id)
    references public.business_entities(game_session_id, id) on delete cascade,
  constraint business_research_projects_recipe_scope_fk
    foreign key (game_session_id, recipe_id)
    references public.business_recipe_definitions(game_session_id, id) on delete restrict,
  constraint business_research_projects_player_scope_fk
    foreign key (game_session_id, started_by_player_id)
    references public.players(game_session_id, id),
  constraint business_research_projects_status_check
    check (status in ('researching', 'completed', 'cancelled')),
  constraint business_research_projects_fee_check check (fee_charged >= 0),
  constraint business_research_projects_duration_check check (base_duration_hours between 1 and 4320),
  constraint business_research_projects_multiplier_check check (duration_multiplier between 0.25 and 1.25),
  constraint business_research_projects_completion_check check (completion_at > started_at),
  constraint business_research_projects_completed_state_check check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed' and completed_at is null)
  ),
  constraint business_research_projects_idempotency_check
    check (length(btrim(idempotency_key)) between 8 and 160),
  constraint business_research_projects_metadata_check check (jsonb_typeof(metadata) = 'object'),
  constraint business_research_projects_idempotency_unique
    unique (game_session_id, business_id, started_by_player_id, idempotency_key),
  constraint business_research_projects_scope_id_unique unique (game_session_id, id)
);

create unique index if not exists business_research_projects_one_active_idx
  on public.business_research_projects(game_session_id, business_id)
  where status = 'researching';
create index if not exists business_research_projects_due_idx
  on public.business_research_projects(status, completion_at, game_session_id, business_id)
  where status = 'researching';

create trigger set_business_research_projects_updated_at
before update on public.business_research_projects
for each row execute function public.set_current_timestamp_updated_at();

alter table public.business_research_projects enable row level security;
revoke all on table public.business_research_projects from public, anon, authenticated;
grant select, insert, update on table public.business_research_projects to service_role;

-- Phase D replaces this bounded default with a workforce-derived modifier.
create or replace function public.business_research_duration_multiplier_v2(
  p_game_session_id uuid,
  p_business_id uuid,
  p_recipe_id uuid
)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select 1.0::numeric
$function$;

create or replace function public.start_business_research_v2(
  p_game_session_id uuid,
  p_player_id uuid,
  p_business_key text,
  p_recipe_key text,
  p_idempotency_key text
)
returns table (
  project_key text,
  status text,
  recipe_key text,
  fee_charged numeric,
  completion_at timestamptz,
  replayed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_business public.business_entities%rowtype;
  v_recipe public.business_recipe_definitions%rowtype;
  v_project public.business_research_projects%rowtype;
  v_multiplier numeric;
  v_cash numeric;
  v_completion timestamptz;
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

  select project_row.* into v_project
  from public.business_research_projects as project_row
  where project_row.game_session_id = p_game_session_id
    and project_row.business_id = v_business.id
    and project_row.started_by_player_id = p_player_id
    and project_row.idempotency_key = p_idempotency_key;
  if found then
    if v_project.recipe_id <> v_recipe.id then
      raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode = 'P0001';
    end if;
    return query select
      v_project.public_key,
      v_project.status,
      v_recipe.public_key,
      v_project.fee_charged,
      v_project.completion_at,
      true;
    return;
  end if;

  if exists (
    select 1 from public.business_recipe_unlocks as unlock_row
    where unlock_row.game_session_id = p_game_session_id
      and unlock_row.business_id = v_business.id
      and unlock_row.recipe_id = v_recipe.id
  ) then
    raise exception 'BUSINESS_RECIPE_ALREADY_UNLOCKED' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.business_research_projects as project_row
    where project_row.game_session_id = p_game_session_id
      and project_row.business_id = v_business.id
      and project_row.status = 'researching'
  ) then
    raise exception 'BUSINESS_RESEARCH_SLOT_OCCUPIED' using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from public.business_recipe_prerequisites as prerequisite_row
    where prerequisite_row.game_session_id = p_game_session_id
      and prerequisite_row.recipe_id = v_recipe.id
      and not exists (
        select 1
        from public.business_recipe_unlocks as unlock_row
        where unlock_row.game_session_id = p_game_session_id
          and unlock_row.business_id = v_business.id
          and unlock_row.recipe_id = prerequisite_row.prerequisite_recipe_id
      )
  ) then
    raise exception 'BUSINESS_RESEARCH_PREREQUISITES_MISSING' using errcode = 'P0001';
  end if;

  v_cash := public.read_business_balance_v2(p_game_session_id, v_business.id, v_business.currency_code);
  if v_cash < v_recipe.research_fee then
    raise exception 'BUSINESS_RESEARCH_INSUFFICIENT_FUNDS' using errcode = 'P0001';
  end if;

  v_multiplier := least(
    1.25,
    greatest(
      0.25,
      public.business_research_duration_multiplier_v2(
        p_game_session_id,
        v_business.id,
        v_recipe.id
      )
    )
  );
  v_completion := now() + make_interval(
    secs => ceil(v_recipe.research_duration_hours * 3600 * v_multiplier)::integer
  );

  if v_recipe.research_fee > 0 then
    perform public.record_business_ledger_entry_v2(
      p_game_session_id,
      v_business.id,
      -v_recipe.research_fee,
      v_business.currency_code,
      'debit',
      'business',
      'research_start',
      v_recipe.id,
      'player',
      p_player_id,
      jsonb_build_object('recipe_key', v_recipe.public_key)
    );
  end if;

  insert into public.business_research_projects(
    game_session_id,
    business_id,
    recipe_id,
    started_by_player_id,
    status,
    fee_charged,
    base_duration_hours,
    duration_multiplier,
    completion_at,
    idempotency_key,
    metadata
  ) values (
    p_game_session_id,
    v_business.id,
    v_recipe.id,
    p_player_id,
    'researching',
    v_recipe.research_fee,
    v_recipe.research_duration_hours,
    v_multiplier,
    v_completion,
    p_idempotency_key,
    jsonb_build_object(
      'recipeKey', v_recipe.public_key,
      'outputItemKey', (
        select item_row.public_key from public.game_items as item_row where item_row.id = v_recipe.output_game_item_id
      )
    )
  ) returning * into v_project;

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
    'business.research.started',
    v_project.id,
    'research_started',
    jsonb_build_object(
      'projectKey', v_project.public_key,
      'recipeKey', v_recipe.public_key,
      'fee', v_recipe.research_fee,
      'completionAt', v_project.completion_at
    )
  );

  return query select
    v_project.public_key,
    v_project.status,
    v_recipe.public_key,
    v_project.fee_charged,
    v_project.completion_at,
    false;
end
$function$;

create or replace function public.complete_due_business_research_v2(
  p_limit integer default 100
)
returns table (
  processed integer,
  completed integer,
  skipped integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_limit integer := least(1000, greatest(1, coalesce(p_limit, 100)));
  v_project public.business_research_projects%rowtype;
  v_processed integer := 0;
  v_completed integer := 0;
  v_skipped integer := 0;
begin
  for v_project in
    select project_row.*
    from public.business_research_projects as project_row
    join public.business_entities as business_row
      on business_row.game_session_id = project_row.game_session_id
     and business_row.id = project_row.business_id
    where project_row.status = 'researching'
      and project_row.completion_at <= now()
      and business_row.status <> 'closed'
      and business_row.formation_state = 'operational'
    order by project_row.completion_at, project_row.id
    limit v_limit
    for update of project_row skip locked
  loop
    v_processed := v_processed + 1;

    insert into public.business_recipe_unlocks(
      game_session_id,
      business_id,
      recipe_id,
      unlock_source,
      source_id,
      metadata
    ) values (
      v_project.game_session_id,
      v_project.business_id,
      v_project.recipe_id,
      'research',
      v_project.id,
      jsonb_build_object('researchProjectKey', v_project.public_key)
    ) on conflict (game_session_id, business_id, recipe_id) do nothing;

    update public.business_research_projects
    set status = 'completed', completed_at = now()
    where id = v_project.id and status = 'researching';

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
        v_project.game_session_id,
        v_project.business_id,
        'system',
        'business.research.completed',
        v_project.id,
        'research_completed',
        jsonb_build_object('projectKey', v_project.public_key)
      );
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  return query select v_processed, v_completed, v_skipped;
end
$function$;

revoke all on function public.ensure_business_starter_recipe_unlocks_v2(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.ensure_business_starter_recipe_unlocks_v2(uuid, uuid) to service_role;
revoke all on function public.business_research_duration_multiplier_v2(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.business_research_duration_multiplier_v2(uuid, uuid, uuid) to service_role;
revoke all on function public.start_business_research_v2(uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.start_business_research_v2(uuid, uuid, text, text, text) to service_role;
revoke all on function public.complete_due_business_research_v2(integer)
  from public, anon, authenticated;
grant execute on function public.complete_due_business_research_v2(integer) to service_role;

commit;

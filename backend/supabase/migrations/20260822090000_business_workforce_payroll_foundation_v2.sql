-- Business V2 Phase 4A: workforce capacity and payroll authority foundation.
--
-- This additive foundation does not cut over the current Player hiring,
-- production, or settlement paths. It establishes server-owned role and
-- candidate catalogs, canonical recipe labor requirements, finite employee
-- capacity reservations, and payroll evidence that is unique per Business and
-- period. Existing Business, recipe, ledger, and employee tables remain the
-- authority; no parallel company, inventory, balance, or employee model is
-- introduced.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create table public.business_workforce_role_definitions (
  id uuid primary key default gen_random_uuid(),
  public_key text not null default (
    'wfr_' || encode(gen_random_bytes(16), 'hex')
  ),
  role_key text not null,
  display_name text not null,
  description text null,
  labor_class text not null,
  default_labor_minutes_per_cycle integer not null,
  minimum_skill_basis_points integer not null default 0,
  status text not null default 'staged',
  metadata jsonb not null default '{}'::jsonb,
  version bigint not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),

  constraint business_workforce_roles_public_key_format
    check (public_key ~ '^wfr_[0-9a-f]{32}$'),
  constraint business_workforce_roles_public_key_unique unique (public_key),
  constraint business_workforce_roles_role_key_format
    check (role_key ~ '^workforce\.[a-z0-9][a-z0-9._-]{2,127}$'),
  constraint business_workforce_roles_role_key_unique unique (role_key),
  constraint business_workforce_roles_display_name_valid
    check (length(btrim(display_name)) between 2 and 120),
  constraint business_workforce_roles_description_valid
    check (
      description is null
      or length(btrim(description)) between 1 and 1000
    ),
  constraint business_workforce_roles_labor_class_valid
    check (
      labor_class in (
        'production',
        'logistics',
        'quality',
        'sales',
        'management',
        'administration',
        'technical'
      )
    ),
  constraint business_workforce_roles_capacity_valid
    check (default_labor_minutes_per_cycle between 1 and 1000000),
  constraint business_workforce_roles_skill_valid
    check (minimum_skill_basis_points between 0 and 10000),
  constraint business_workforce_roles_status_valid
    check (status in ('staged', 'active', 'disabled', 'retired')),
  constraint business_workforce_roles_metadata_object
    check (jsonb_typeof(metadata) = 'object'),
  constraint business_workforce_roles_version_valid check (version > 0)
);

create trigger set_business_workforce_roles_updated_at
before update on public.business_workforce_role_definitions
for each row execute function public.set_current_timestamp_updated_at();

create table public.business_workforce_candidates (
  id uuid primary key default gen_random_uuid(),
  public_key text not null default (
    'wfc_' || encode(gen_random_bytes(16), 'hex')
  ),
  game_session_id uuid not null
    references public.game_sessions(id) on delete cascade,
  candidate_player_id uuid null,
  role_definition_id uuid not null
    references public.business_workforce_role_definitions(id),
  display_label text not null,
  country_code text not null,
  currency_code text not null,
  wage_per_cycle numeric(14, 2) not null,
  labor_minutes_per_cycle integer not null,
  skill_basis_points integer not null,
  source_type text not null,
  source_key text not null,
  request_hash text not null,
  status text not null default 'available',
  availability_starts_at timestamptz not null default statement_timestamp(),
  availability_ends_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  version bigint not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),

  constraint business_workforce_candidates_player_scope_fk
    foreign key (game_session_id, candidate_player_id)
    references public.players(game_session_id, id),
  constraint business_workforce_candidates_public_key_format
    check (public_key ~ '^wfc_[0-9a-f]{32}$'),
  constraint business_workforce_candidates_public_key_unique
    unique (public_key),
  constraint business_workforce_candidates_scope_id_unique
    unique (game_session_id, id),
  constraint business_workforce_candidates_source_unique
    unique (game_session_id, source_type, source_key),
  constraint business_workforce_candidates_display_label_valid
    check (length(btrim(display_label)) between 2 and 160),
  constraint business_workforce_candidates_country_valid
    check (country_code ~ '^[A-Z0-9_]{2,16}$'),
  constraint business_workforce_candidates_currency_valid
    check (currency_code ~ '^[A-Z0-9_]{3,16}$'),
  constraint business_workforce_candidates_wage_valid
    check (wage_per_cycle > 0),
  constraint business_workforce_candidates_capacity_valid
    check (labor_minutes_per_cycle between 1 and 1000000),
  constraint business_workforce_candidates_skill_valid
    check (skill_basis_points between 0 and 10000),
  constraint business_workforce_candidates_source_type_valid
    check (
      source_type in (
        'system_generated',
        'admin_seed',
        'story_event',
        'migration_v2'
      )
    ),
  constraint business_workforce_candidates_source_key_valid
    check (
      source_key ~ '^[a-z0-9][a-z0-9._:-]{2,159}$'
    ),
  constraint business_workforce_candidates_request_hash_valid
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint business_workforce_candidates_status_valid
    check (
      status in (
        'available',
        'reserved',
        'hired',
        'withdrawn',
        'expired'
      )
    ),
  constraint business_workforce_candidates_availability_valid
    check (
      availability_ends_at is null
      or availability_ends_at > availability_starts_at
    ),
  constraint business_workforce_candidates_metadata_object
    check (jsonb_typeof(metadata) = 'object'),
  constraint business_workforce_candidates_version_valid check (version > 0)
);

create trigger set_business_workforce_candidates_updated_at
before update on public.business_workforce_candidates
for each row execute function public.set_current_timestamp_updated_at();

create index business_workforce_candidates_game_role_status_idx
  on public.business_workforce_candidates(
    game_session_id,
    role_definition_id,
    status,
    availability_starts_at
  );

create unique index business_workforce_candidates_player_role_available_unique
  on public.business_workforce_candidates(
    game_session_id,
    candidate_player_id,
    role_definition_id
  )
  where candidate_player_id is not null
    and status in ('available', 'reserved');

create table public.business_recipe_labor_requirements (
  id uuid primary key default gen_random_uuid(),
  public_key text not null default (
    'blr_' || encode(gen_random_bytes(16), 'hex')
  ),
  recipe_definition_id uuid not null
    references public.physical_economy_recipe_definitions(id) on delete cascade,
  role_definition_id uuid not null
    references public.business_workforce_role_definitions(id),
  fixed_labor_minutes_per_run integer not null default 0,
  labor_minutes_per_unit integer not null,
  minimum_headcount integer not null default 1,
  minimum_skill_basis_points integer not null default 0,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  version bigint not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),

  constraint business_recipe_labor_public_key_format
    check (public_key ~ '^blr_[0-9a-f]{32}$'),
  constraint business_recipe_labor_public_key_unique unique (public_key),
  constraint business_recipe_labor_scope_unique
    unique (recipe_definition_id, role_definition_id),
  constraint business_recipe_labor_fixed_minutes_valid
    check (fixed_labor_minutes_per_run between 0 and 1000000),
  constraint business_recipe_labor_unit_minutes_valid
    check (labor_minutes_per_unit between 1 and 1000000),
  constraint business_recipe_labor_headcount_valid
    check (minimum_headcount between 1 and 10000),
  constraint business_recipe_labor_skill_valid
    check (minimum_skill_basis_points between 0 and 10000),
  constraint business_recipe_labor_status_valid
    check (status in ('active', 'disabled', 'retired')),
  constraint business_recipe_labor_metadata_object
    check (jsonb_typeof(metadata) = 'object'),
  constraint business_recipe_labor_version_valid check (version > 0)
);

create trigger set_business_recipe_labor_updated_at
before update on public.business_recipe_labor_requirements
for each row execute function public.set_current_timestamp_updated_at();

create index business_recipe_labor_recipe_status_idx
  on public.business_recipe_labor_requirements(
    recipe_definition_id,
    status,
    role_definition_id
  );

create unique index if not exists business_employees_scope_id_unique
  on public.business_employees(game_session_id, id);

create unique index if not exists business_production_runs_scope_id_unique
  on public.business_production_runs(game_session_id, id);

alter table public.business_employees
  add column workforce_candidate_id uuid null,
  add column workforce_role_definition_id uuid null,
  add column labor_minutes_per_cycle integer null,
  add column skill_basis_points integer null,
  add column workforce_source_type text not null default 'historical_v1',
  add column workforce_version bigint not null default 1;

alter table public.business_employees
  add constraint business_employees_candidate_scope_fk
    foreign key (game_session_id, workforce_candidate_id)
    references public.business_workforce_candidates(game_session_id, id),
  add constraint business_employees_workforce_role_fk
    foreign key (workforce_role_definition_id)
    references public.business_workforce_role_definitions(id),
  add constraint business_employees_workforce_source_valid
    check (
      workforce_source_type in (
        'historical_v1',
        'candidate_v2',
        'migration_v2'
      )
    ),
  add constraint business_employees_labor_minutes_valid
    check (
      labor_minutes_per_cycle is null
      or labor_minutes_per_cycle between 1 and 1000000
    ),
  add constraint business_employees_skill_basis_points_valid
    check (
      skill_basis_points is null
      or skill_basis_points between 0 and 10000
    ),
  add constraint business_employees_workforce_version_valid
    check (workforce_version > 0),
  add constraint business_employees_canonical_workforce_valid
    check (
      workforce_source_type = 'historical_v1'
      or (
        workforce_candidate_id is not null
        and workforce_role_definition_id is not null
        and labor_minutes_per_cycle between 1 and 1000000
        and skill_basis_points between 0 and 10000
        and productivity_index = 1
      )
    );

create unique index business_employees_candidate_unique
  on public.business_employees(workforce_candidate_id)
  where workforce_candidate_id is not null;

create index business_employees_workforce_role_status_idx
  on public.business_employees(
    game_session_id,
    business_id,
    workforce_role_definition_id,
    status
  );

create table public.business_labor_reservations (
  id uuid primary key default gen_random_uuid(),
  public_key text not null default (
    'lrv_' || encode(gen_random_bytes(16), 'hex')
  ),
  game_session_id uuid not null
    references public.game_sessions(id) on delete cascade,
  business_id uuid not null,
  employee_id uuid not null,
  role_definition_id uuid not null
    references public.business_workforce_role_definitions(id),
  production_run_id uuid null,
  period_key text not null,
  reservation_kind text not null,
  source_reference_key text not null,
  reserved_minutes integer not null,
  idempotency_key text not null,
  request_hash text not null,
  status text not null default 'reserved',
  activated_at timestamptz null,
  consumed_at timestamptz null,
  released_at timestamptz null,
  release_reason text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),

  constraint business_labor_reservations_business_scope_fk
    foreign key (game_session_id, business_id)
    references public.business_entities(game_session_id, id),
  constraint business_labor_reservations_employee_scope_fk
    foreign key (game_session_id, employee_id)
    references public.business_employees(game_session_id, id),
  constraint business_labor_reservations_production_scope_fk
    foreign key (game_session_id, production_run_id)
    references public.business_production_runs(game_session_id, id),
  constraint business_labor_reservations_public_key_format
    check (public_key ~ '^lrv_[0-9a-f]{32}$'),
  constraint business_labor_reservations_public_key_unique
    unique (public_key),
  constraint business_labor_reservations_scope_id_unique
    unique (game_session_id, id),
  constraint business_labor_reservations_idempotency_unique
    unique (game_session_id, business_id, idempotency_key),
  constraint business_labor_reservations_source_unique
    unique (
      game_session_id,
      business_id,
      employee_id,
      period_key,
      reservation_kind,
      source_reference_key
    ),
  constraint business_labor_reservations_period_key_valid
    check (period_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
  constraint business_labor_reservations_kind_valid
    check (
      reservation_kind in (
        'production_job',
        'maintenance',
        'training',
        'admin_hold'
      )
    ),
  constraint business_labor_reservations_source_reference_valid
    check (
      source_reference_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'
    ),
  constraint business_labor_reservations_minutes_valid
    check (reserved_minutes between 1 and 1000000),
  constraint business_labor_reservations_idempotency_valid
    check (length(btrim(idempotency_key)) between 8 and 160),
  constraint business_labor_reservations_request_hash_valid
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint business_labor_reservations_status_valid
    check (
      status in (
        'reserved',
        'active',
        'consumed',
        'released',
        'cancelled'
      )
    ),
  constraint business_labor_reservations_release_reason_valid
    check (
      release_reason is null
      or length(btrim(release_reason)) between 2 and 500
    ),
  constraint business_labor_reservations_metadata_object
    check (jsonb_typeof(metadata) = 'object'),
  constraint business_labor_reservations_state_valid
    check (
      (
        status = 'reserved'
        and activated_at is null
        and consumed_at is null
        and released_at is null
      )
      or (
        status = 'active'
        and activated_at is not null
        and consumed_at is null
        and released_at is null
      )
      or (
        status = 'consumed'
        and consumed_at is not null
        and released_at is null
      )
      or (
        status in ('released', 'cancelled')
        and released_at is not null
        and consumed_at is null
      )
    )
);

create trigger set_business_labor_reservations_updated_at
before update on public.business_labor_reservations
for each row execute function public.set_current_timestamp_updated_at();

create index business_labor_reservations_employee_period_status_idx
  on public.business_labor_reservations(
    game_session_id,
    employee_id,
    period_key,
    status
  );

create index business_labor_reservations_production_status_idx
  on public.business_labor_reservations(
    game_session_id,
    production_run_id,
    status
  )
  where production_run_id is not null;

create table public.business_payroll_runs (
  id uuid primary key default gen_random_uuid(),
  public_key text not null default (
    'pyr_' || encode(gen_random_bytes(16), 'hex')
  ),
  game_session_id uuid not null
    references public.game_sessions(id) on delete cascade,
  business_id uuid not null,
  payroll_period_key text not null,
  currency_code text not null,
  employee_count integer not null default 0,
  gross_wages_due numeric(14, 2) not null default 0,
  gross_wages_paid numeric(14, 2) not null default 0,
  gross_wages_unpaid numeric(14, 2) not null default 0,
  status text not null default 'pending',
  source_type text not null,
  idempotency_key text not null,
  request_hash text not null,
  business_ledger_entry_id uuid null
    references public.ledger_entries(id),
  failure_code text null,
  started_at timestamptz not null default statement_timestamp(),
  completed_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  version bigint not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),

  constraint business_payroll_runs_business_scope_fk
    foreign key (game_session_id, business_id)
    references public.business_entities(game_session_id, id),
  constraint business_payroll_runs_public_key_format
    check (public_key ~ '^pyr_[0-9a-f]{32}$'),
  constraint business_payroll_runs_public_key_unique unique (public_key),
  constraint business_payroll_runs_scope_id_unique
    unique (game_session_id, id),
  constraint business_payroll_runs_period_unique
    unique (game_session_id, business_id, payroll_period_key),
  constraint business_payroll_runs_idempotency_unique
    unique (game_session_id, business_id, idempotency_key),
  constraint business_payroll_runs_period_key_valid
    check (
      payroll_period_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'
    ),
  constraint business_payroll_runs_currency_valid
    check (currency_code ~ '^[A-Z0-9_]{3,16}$'),
  constraint business_payroll_runs_employee_count_valid
    check (employee_count between 0 and 100000),
  constraint business_payroll_runs_amounts_valid
    check (
      gross_wages_due >= 0
      and gross_wages_paid >= 0
      and gross_wages_unpaid >= 0
      and gross_wages_due = gross_wages_paid + gross_wages_unpaid
    ),
  constraint business_payroll_runs_status_valid
    check (
      status in (
        'pending',
        'posting',
        'completed',
        'partially_paid',
        'unpaid',
        'cancelled'
      )
    ),
  constraint business_payroll_runs_source_type_valid
    check (
      source_type in (
        'scheduled_period',
        'admin_recovery',
        'migration_v2'
      )
    ),
  constraint business_payroll_runs_idempotency_valid
    check (length(btrim(idempotency_key)) between 8 and 160),
  constraint business_payroll_runs_request_hash_valid
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint business_payroll_runs_failure_code_valid
    check (
      failure_code is null
      or failure_code ~ '^[A-Z0-9_]{2,120}$'
    ),
  constraint business_payroll_runs_completion_state_valid
    check (
      (
        status in ('pending', 'posting')
        and completed_at is null
      )
      or (
        status in (
          'completed',
          'partially_paid',
          'unpaid',
          'cancelled'
        )
        and completed_at is not null
      )
    ),
  constraint business_payroll_runs_metadata_object
    check (jsonb_typeof(metadata) = 'object'),
  constraint business_payroll_runs_version_valid check (version > 0)
);

create trigger set_business_payroll_runs_updated_at
before update on public.business_payroll_runs
for each row execute function public.set_current_timestamp_updated_at();

create index business_payroll_runs_business_status_period_idx
  on public.business_payroll_runs(
    game_session_id,
    business_id,
    status,
    payroll_period_key
  );

create table public.business_payroll_entries (
  id uuid primary key default gen_random_uuid(),
  public_key text not null default (
    'pye_' || encode(gen_random_bytes(16), 'hex')
  ),
  game_session_id uuid not null
    references public.game_sessions(id) on delete cascade,
  payroll_run_id uuid not null,
  business_id uuid not null,
  employee_id uuid not null,
  employee_player_id uuid null,
  role_definition_id uuid not null
    references public.business_workforce_role_definitions(id),
  wage_due numeric(14, 2) not null,
  wage_paid numeric(14, 2) not null default 0,
  wage_unpaid numeric(14, 2) not null,
  currency_code text not null,
  status text not null default 'pending',
  business_ledger_entry_id uuid null
    references public.ledger_entries(id),
  employee_ledger_entry_id uuid null
    references public.ledger_entries(id),
  posted_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),

  constraint business_payroll_entries_run_scope_fk
    foreign key (game_session_id, payroll_run_id)
    references public.business_payroll_runs(game_session_id, id),
  constraint business_payroll_entries_business_scope_fk
    foreign key (game_session_id, business_id)
    references public.business_entities(game_session_id, id),
  constraint business_payroll_entries_employee_scope_fk
    foreign key (game_session_id, employee_id)
    references public.business_employees(game_session_id, id),
  constraint business_payroll_entries_player_scope_fk
    foreign key (game_session_id, employee_player_id)
    references public.players(game_session_id, id),
  constraint business_payroll_entries_public_key_format
    check (public_key ~ '^pye_[0-9a-f]{32}$'),
  constraint business_payroll_entries_public_key_unique unique (public_key),
  constraint business_payroll_entries_scope_unique
    unique (payroll_run_id, employee_id),
  constraint business_payroll_entries_amounts_valid
    check (
      wage_due >= 0
      and wage_paid >= 0
      and wage_unpaid >= 0
      and wage_due = wage_paid + wage_unpaid
    ),
  constraint business_payroll_entries_currency_valid
    check (currency_code ~ '^[A-Z0-9_]{3,16}$'),
  constraint business_payroll_entries_status_valid
    check (
      status in (
        'pending',
        'paid',
        'partially_paid',
        'unpaid',
        'void'
      )
    ),
  constraint business_payroll_entries_posting_state_valid
    check (
      (
        status = 'pending'
        and posted_at is null
      )
      or (
        status <> 'pending'
        and posted_at is not null
      )
    ),
  constraint business_payroll_entries_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create trigger set_business_payroll_entries_updated_at
before update on public.business_payroll_entries
for each row execute function public.set_current_timestamp_updated_at();

create index business_payroll_entries_business_status_idx
  on public.business_payroll_entries(
    game_session_id,
    business_id,
    status,
    created_at desc
  );

create index business_payroll_entries_employee_created_idx
  on public.business_payroll_entries(
    game_session_id,
    employee_id,
    created_at desc
  );

create or replace function public.upsert_business_workforce_role_v2(
  p_role_key text,
  p_display_name text,
  p_description text,
  p_labor_class text,
  p_default_labor_minutes_per_cycle integer,
  p_minimum_skill_basis_points integer,
  p_status text,
  p_metadata jsonb
)
returns table (
  workforce_role_key text,
  role_public_key text,
  role_version bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_role public.business_workforce_role_definitions%rowtype;
begin
  if p_role_key is null
    or p_role_key !~ '^workforce\.[a-z0-9][a-z0-9._-]{2,127}$'
  then
    raise exception 'BUSINESS_WORKFORCE_ROLE_KEY_INVALID'
      using errcode = 'P0001';
  end if;
  if p_display_name is null
    or length(btrim(p_display_name)) not between 2 and 120
  then
    raise exception 'BUSINESS_WORKFORCE_ROLE_NAME_INVALID'
      using errcode = 'P0001';
  end if;
  if p_description is not null
    and length(btrim(p_description)) not between 1 and 1000
  then
    raise exception 'BUSINESS_WORKFORCE_ROLE_DESCRIPTION_INVALID'
      using errcode = 'P0001';
  end if;
  if p_labor_class is null
    or p_labor_class not in (
      'production',
      'logistics',
      'quality',
      'sales',
      'management',
      'administration',
      'technical'
    )
  then
    raise exception 'BUSINESS_WORKFORCE_LABOR_CLASS_INVALID'
      using errcode = 'P0001';
  end if;
  if p_default_labor_minutes_per_cycle is null
    or p_default_labor_minutes_per_cycle not between 1 and 1000000
    or p_minimum_skill_basis_points is null
    or p_minimum_skill_basis_points not between 0 and 10000
  then
    raise exception 'BUSINESS_WORKFORCE_ROLE_CAPACITY_INVALID'
      using errcode = 'P0001';
  end if;
  if p_status is null
    or p_status not in ('staged', 'active', 'disabled', 'retired')
  then
    raise exception 'BUSINESS_WORKFORCE_ROLE_STATUS_INVALID'
      using errcode = 'P0001';
  end if;
  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'BUSINESS_WORKFORCE_ROLE_METADATA_INVALID'
      using errcode = 'P0001';
  end if;

  insert into public.business_workforce_role_definitions(
    role_key,
    display_name,
    description,
    labor_class,
    default_labor_minutes_per_cycle,
    minimum_skill_basis_points,
    status,
    metadata
  ) values (
    p_role_key,
    btrim(p_display_name),
    nullif(btrim(p_description), ''),
    p_labor_class,
    p_default_labor_minutes_per_cycle,
    p_minimum_skill_basis_points,
    p_status,
    p_metadata
  )
  on conflict (role_key) do update
  set
    display_name = excluded.display_name,
    description = excluded.description,
    labor_class = excluded.labor_class,
    default_labor_minutes_per_cycle =
      excluded.default_labor_minutes_per_cycle,
    minimum_skill_basis_points =
      excluded.minimum_skill_basis_points,
    status = excluded.status,
    metadata = excluded.metadata,
    version = public.business_workforce_role_definitions.version + 1,
    updated_at = statement_timestamp()
  returning * into v_role;

  return query select
    v_role.role_key,
    v_role.public_key,
    v_role.version;
end
$function$;

create or replace function public.create_business_workforce_candidate_v2(
  p_game_session_id uuid,
  p_role_key text,
  p_display_label text,
  p_country_code text,
  p_currency_code text,
  p_wage_per_cycle numeric,
  p_labor_minutes_per_cycle integer,
  p_skill_basis_points integer,
  p_source_type text,
  p_source_key text,
  p_candidate_player_id uuid,
  p_availability_starts_at timestamptz,
  p_availability_ends_at timestamptz,
  p_metadata jsonb
)
returns table (
  candidate_key text,
  workforce_role_key text,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_role public.business_workforce_role_definitions%rowtype;
  v_candidate public.business_workforce_candidates%rowtype;
  v_request_hash text;
begin
  if p_game_session_id is null then
    raise exception 'GAME_SESSION_REQUIRED' using errcode = 'P0001';
  end if;
  perform 1
  from public.game_sessions as game_row
  where game_row.id = p_game_session_id;
  if not found then
    raise exception 'GAME_SESSION_NOT_FOUND' using errcode = 'P0001';
  end if;

  select role_row.*
  into v_role
  from public.business_workforce_role_definitions as role_row
  where role_row.role_key = p_role_key
    and role_row.status = 'active';
  if not found then
    raise exception 'BUSINESS_WORKFORCE_ROLE_NOT_ACTIVE'
      using errcode = 'P0001';
  end if;

  if p_display_label is null
    or length(btrim(p_display_label)) not between 2 and 160
  then
    raise exception 'BUSINESS_WORKFORCE_CANDIDATE_LABEL_INVALID'
      using errcode = 'P0001';
  end if;
  if p_country_code is null
    or upper(btrim(p_country_code)) !~ '^[A-Z0-9_]{2,16}$'
  then
    raise exception 'BUSINESS_WORKFORCE_CANDIDATE_COUNTRY_INVALID'
      using errcode = 'P0001';
  end if;
  if p_currency_code is null
    or upper(btrim(p_currency_code)) !~ '^[A-Z0-9_]{3,16}$'
  then
    raise exception 'BUSINESS_WORKFORCE_CANDIDATE_CURRENCY_INVALID'
      using errcode = 'P0001';
  end if;
  if p_wage_per_cycle is null or p_wage_per_cycle <= 0 then
    raise exception 'BUSINESS_WORKFORCE_CANDIDATE_WAGE_INVALID'
      using errcode = 'P0001';
  end if;
  if p_labor_minutes_per_cycle is null
    or p_labor_minutes_per_cycle not between 1 and 1000000
    or p_skill_basis_points is null
    or p_skill_basis_points not between 0 and 10000
  then
    raise exception 'BUSINESS_WORKFORCE_CANDIDATE_CAPACITY_INVALID'
      using errcode = 'P0001';
  end if;
  if p_source_type is null
    or p_source_type not in (
      'system_generated',
      'admin_seed',
      'story_event',
      'migration_v2'
    )
  then
    raise exception 'BUSINESS_WORKFORCE_CANDIDATE_SOURCE_INVALID'
      using errcode = 'P0001';
  end if;
  if p_source_key is null
    or p_source_key !~ '^[a-z0-9][a-z0-9._:-]{2,159}$'
  then
    raise exception 'BUSINESS_WORKFORCE_CANDIDATE_SOURCE_KEY_INVALID'
      using errcode = 'P0001';
  end if;
  if p_availability_starts_at is null then
    raise exception 'BUSINESS_WORKFORCE_CANDIDATE_START_REQUIRED'
      using errcode = 'P0001';
  end if;
  if p_availability_ends_at is not null
    and p_availability_ends_at <= p_availability_starts_at
  then
    raise exception 'BUSINESS_WORKFORCE_CANDIDATE_WINDOW_INVALID'
      using errcode = 'P0001';
  end if;
  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'BUSINESS_WORKFORCE_CANDIDATE_METADATA_INVALID'
      using errcode = 'P0001';
  end if;

  v_request_hash := encode(
    digest(
      concat_ws(
        '|',
        p_game_session_id::text,
        p_role_key,
        btrim(p_display_label),
        upper(btrim(p_country_code)),
        upper(btrim(p_currency_code)),
        p_wage_per_cycle::text,
        p_labor_minutes_per_cycle::text,
        p_skill_basis_points::text,
        p_source_type,
        p_source_key,
        coalesce(p_candidate_player_id::text, ''),
        p_availability_starts_at::text,
        coalesce(p_availability_ends_at::text, ''),
        p_metadata::text
      ),
      'sha256'
    ),
    'hex'
  );

  insert into public.business_workforce_candidates(
    game_session_id,
    candidate_player_id,
    role_definition_id,
    display_label,
    country_code,
    currency_code,
    wage_per_cycle,
    labor_minutes_per_cycle,
    skill_basis_points,
    source_type,
    source_key,
    request_hash,
    availability_starts_at,
    availability_ends_at,
    metadata
  ) values (
    p_game_session_id,
    p_candidate_player_id,
    v_role.id,
    btrim(p_display_label),
    upper(btrim(p_country_code)),
    upper(btrim(p_currency_code)),
    p_wage_per_cycle,
    p_labor_minutes_per_cycle,
    p_skill_basis_points,
    p_source_type,
    p_source_key,
    v_request_hash,
    p_availability_starts_at,
    p_availability_ends_at,
    p_metadata
  )
  on conflict (game_session_id, source_type, source_key)
  do nothing
  returning * into v_candidate;

  if found then
    return query select
      v_candidate.public_key,
      v_role.role_key,
      false;
    return;
  end if;

  select candidate_row.*
  into v_candidate
  from public.business_workforce_candidates as candidate_row
  where candidate_row.game_session_id = p_game_session_id
    and candidate_row.source_type = p_source_type
    and candidate_row.source_key = p_source_key
  for update;
  if not found then
    raise exception 'BUSINESS_WORKFORCE_CANDIDATE_REPLAY_MISSING'
      using errcode = 'P0001';
  end if;
  if v_candidate.request_hash <> v_request_hash then
    raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode = 'P0001';
  end if;

  return query select
    v_candidate.public_key,
    v_role.role_key,
    true;
end
$function$;

create or replace function public.upsert_business_recipe_labor_requirement_v2(
  p_recipe_definition_id uuid,
  p_role_key text,
  p_fixed_labor_minutes_per_run integer,
  p_labor_minutes_per_unit integer,
  p_minimum_headcount integer,
  p_minimum_skill_basis_points integer,
  p_status text,
  p_metadata jsonb
)
returns table (
  requirement_key text,
  recipe_definition_id uuid,
  workforce_role_key text,
  requirement_version bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_role public.business_workforce_role_definitions%rowtype;
  v_requirement public.business_recipe_labor_requirements%rowtype;
begin
  perform 1
  from public.physical_economy_recipe_definitions as recipe_row
  where recipe_row.id = p_recipe_definition_id;
  if not found then
    raise exception 'BUSINESS_RECIPE_NOT_FOUND' using errcode = 'P0001';
  end if;

  select role_row.*
  into v_role
  from public.business_workforce_role_definitions as role_row
  where role_row.role_key = p_role_key
    and role_row.status in ('staged', 'active');
  if not found then
    raise exception 'BUSINESS_WORKFORCE_ROLE_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  if p_fixed_labor_minutes_per_run is null
    or p_fixed_labor_minutes_per_run not between 0 and 1000000
    or p_labor_minutes_per_unit is null
    or p_labor_minutes_per_unit not between 1 and 1000000
    or p_minimum_headcount is null
    or p_minimum_headcount not between 1 and 10000
    or p_minimum_skill_basis_points is null
    or p_minimum_skill_basis_points not between 0 and 10000
  then
    raise exception 'BUSINESS_RECIPE_LABOR_REQUIREMENT_INVALID'
      using errcode = 'P0001';
  end if;
  if p_status is null
    or p_status not in ('active', 'disabled', 'retired')
  then
    raise exception 'BUSINESS_RECIPE_LABOR_STATUS_INVALID'
      using errcode = 'P0001';
  end if;
  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'BUSINESS_RECIPE_LABOR_METADATA_INVALID'
      using errcode = 'P0001';
  end if;

  insert into public.business_recipe_labor_requirements(
    recipe_definition_id,
    role_definition_id,
    fixed_labor_minutes_per_run,
    labor_minutes_per_unit,
    minimum_headcount,
    minimum_skill_basis_points,
    status,
    metadata
  ) values (
    p_recipe_definition_id,
    v_role.id,
    p_fixed_labor_minutes_per_run,
    p_labor_minutes_per_unit,
    p_minimum_headcount,
    p_minimum_skill_basis_points,
    p_status,
    p_metadata
  )
  on conflict (recipe_definition_id, role_definition_id) do update
  set
    fixed_labor_minutes_per_run =
      excluded.fixed_labor_minutes_per_run,
    labor_minutes_per_unit = excluded.labor_minutes_per_unit,
    minimum_headcount = excluded.minimum_headcount,
    minimum_skill_basis_points =
      excluded.minimum_skill_basis_points,
    status = excluded.status,
    metadata = excluded.metadata,
    version = public.business_recipe_labor_requirements.version + 1,
    updated_at = statement_timestamp()
  returning * into v_requirement;

  return query select
    v_requirement.public_key,
    v_requirement.recipe_definition_id,
    v_role.role_key,
    v_requirement.version;
end
$function$;

create or replace function public.reserve_business_labor_v2(
  p_game_session_id uuid,
  p_business_key text,
  p_employee_key text,
  p_role_key text,
  p_period_key text,
  p_reserved_minutes integer,
  p_reservation_kind text,
  p_source_reference_key text,
  p_production_run_key text,
  p_idempotency_key text
)
returns table (
  reservation_key text,
  employee_key text,
  workforce_role_key text,
  period_key text,
  reserved_minutes integer,
  remaining_minutes integer,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_business public.business_entities%rowtype;
  v_employee public.business_employees%rowtype;
  v_role public.business_workforce_role_definitions%rowtype;
  v_reservation public.business_labor_reservations%rowtype;
  v_production_run_id uuid;
  v_used_minutes integer;
  v_remaining_minutes integer;
  v_request_hash text;
begin
  if p_game_session_id is null then
    raise exception 'GAME_SESSION_REQUIRED' using errcode = 'P0001';
  end if;
  if p_business_key is null
    or p_business_key !~ '^biz_[0-9a-f]{32}$'
  then
    raise exception 'BUSINESS_KEY_INVALID' using errcode = 'P0001';
  end if;
  if p_employee_key is null
    or p_employee_key !~ '^emp_[0-9a-f]{32}$'
  then
    raise exception 'BUSINESS_EMPLOYEE_KEY_INVALID'
      using errcode = 'P0001';
  end if;
  if p_role_key is null
    or p_role_key !~ '^workforce\.[a-z0-9][a-z0-9._-]{2,127}$'
  then
    raise exception 'BUSINESS_WORKFORCE_ROLE_KEY_INVALID'
      using errcode = 'P0001';
  end if;
  if p_period_key is null
    or p_period_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'
  then
    raise exception 'BUSINESS_LABOR_PERIOD_KEY_INVALID'
      using errcode = 'P0001';
  end if;
  if p_reserved_minutes is null
    or p_reserved_minutes not between 1 and 1000000
  then
    raise exception 'BUSINESS_LABOR_MINUTES_INVALID'
      using errcode = 'P0001';
  end if;
  if p_reservation_kind is null
    or p_reservation_kind not in (
      'production_job',
      'maintenance',
      'training',
      'admin_hold'
    )
  then
    raise exception 'BUSINESS_LABOR_RESERVATION_KIND_INVALID'
      using errcode = 'P0001';
  end if;
  if p_source_reference_key is null
    or p_source_reference_key
      !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'
  then
    raise exception 'BUSINESS_LABOR_SOURCE_REFERENCE_INVALID'
      using errcode = 'P0001';
  end if;
  if p_production_run_key is not null
    and btrim(p_production_run_key) <> ''
    and p_production_run_key !~ '^run_[0-9a-f]{32}$'
  then
    raise exception 'BUSINESS_PRODUCTION_RUN_KEY_INVALID'
      using errcode = 'P0001';
  end if;
  if p_idempotency_key is null
    or length(btrim(p_idempotency_key)) not between 8 and 160
  then
    raise exception 'IDEMPOTENCY_KEY_INVALID' using errcode = 'P0001';
  end if;

  select business_row.*
  into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.public_key = p_business_key
    and business_row.status in ('active', 'restructuring')
  for update;
  if not found then
    raise exception 'BUSINESS_NOT_ACTIVE' using errcode = 'P0001';
  end if;

  select employee_row.*
  into v_employee
  from public.business_employees as employee_row
  where employee_row.game_session_id = p_game_session_id
    and employee_row.business_id = v_business.id
    and employee_row.public_key = p_employee_key
    and employee_row.status = 'active'
  for update;
  if not found then
    raise exception 'BUSINESS_EMPLOYEE_NOT_ACTIVE'
      using errcode = 'P0001';
  end if;
  if v_employee.workforce_source_type = 'historical_v1'
    or v_employee.workforce_role_definition_id is null
    or v_employee.labor_minutes_per_cycle is null
    or v_employee.skill_basis_points is null
  then
    raise exception 'BUSINESS_EMPLOYEE_WORKFORCE_NOT_MIGRATED'
      using errcode = 'P0001';
  end if;

  select role_row.*
  into v_role
  from public.business_workforce_role_definitions as role_row
  where role_row.id = v_employee.workforce_role_definition_id
    and role_row.role_key = p_role_key
    and role_row.status = 'active';
  if not found then
    raise exception 'BUSINESS_EMPLOYEE_ROLE_MISMATCH'
      using errcode = 'P0001';
  end if;

  if p_production_run_key is not null
    and btrim(p_production_run_key) <> ''
  then
    select run_row.id
    into v_production_run_id
    from public.business_production_runs as run_row
    where run_row.game_session_id = p_game_session_id
      and run_row.business_id = v_business.id
      and run_row.public_key = p_production_run_key;
    if not found then
      raise exception 'BUSINESS_PRODUCTION_RUN_NOT_FOUND'
        using errcode = 'P0001';
    end if;
  end if;

  v_request_hash := encode(
    digest(
      concat_ws(
        '|',
        p_game_session_id::text,
        p_business_key,
        p_employee_key,
        p_role_key,
        p_period_key,
        p_reserved_minutes::text,
        p_reservation_kind,
        p_source_reference_key,
        coalesce(p_production_run_key, '')
      ),
      'sha256'
    ),
    'hex'
  );

  select reservation_row.*
  into v_reservation
  from public.business_labor_reservations as reservation_row
  where reservation_row.game_session_id = p_game_session_id
    and reservation_row.business_id = v_business.id
    and reservation_row.idempotency_key = btrim(p_idempotency_key)
  for update;
  if found then
    if v_reservation.request_hash <> v_request_hash then
      raise exception 'IDEMPOTENCY_KEY_CONFLICT'
        using errcode = 'P0001';
    end if;

    select coalesce(sum(reservation_row.reserved_minutes), 0)::integer
    into v_used_minutes
    from public.business_labor_reservations as reservation_row
    where reservation_row.game_session_id = p_game_session_id
      and reservation_row.employee_id = v_employee.id
      and reservation_row.period_key = p_period_key
      and reservation_row.status in (
        'reserved',
        'active',
        'consumed'
      );

    v_remaining_minutes :=
      greatest(v_employee.labor_minutes_per_cycle - v_used_minutes, 0);

    return query select
      v_reservation.public_key,
      v_employee.public_key,
      v_role.role_key,
      v_reservation.period_key,
      v_reservation.reserved_minutes,
      v_remaining_minutes,
      true;
    return;
  end if;

  select coalesce(sum(reservation_row.reserved_minutes), 0)::integer
  into v_used_minutes
  from public.business_labor_reservations as reservation_row
  where reservation_row.game_session_id = p_game_session_id
    and reservation_row.employee_id = v_employee.id
    and reservation_row.period_key = p_period_key
    and reservation_row.status in (
      'reserved',
      'active',
      'consumed'
    );

  if v_used_minutes + p_reserved_minutes
    > v_employee.labor_minutes_per_cycle
  then
    raise exception 'BUSINESS_LABOR_CAPACITY_EXCEEDED'
      using errcode = 'P0001';
  end if;

  insert into public.business_labor_reservations(
    game_session_id,
    business_id,
    employee_id,
    role_definition_id,
    production_run_id,
    period_key,
    reservation_kind,
    source_reference_key,
    reserved_minutes,
    idempotency_key,
    request_hash,
    metadata
  ) values (
    p_game_session_id,
    v_business.id,
    v_employee.id,
    v_role.id,
    v_production_run_id,
    p_period_key,
    p_reservation_kind,
    p_source_reference_key,
    p_reserved_minutes,
    btrim(p_idempotency_key),
    v_request_hash,
    jsonb_build_object(
      'businessKey', p_business_key,
      'employeeKey', p_employee_key,
      'roleKey', p_role_key,
      'sourceReferenceKey', p_source_reference_key,
      'productionRunKey', nullif(btrim(p_production_run_key), '')
    )
  )
  returning * into v_reservation;

  v_remaining_minutes :=
    v_employee.labor_minutes_per_cycle
    - v_used_minutes
    - p_reserved_minutes;

  return query select
    v_reservation.public_key,
    v_employee.public_key,
    v_role.role_key,
    v_reservation.period_key,
    v_reservation.reserved_minutes,
    v_remaining_minutes,
    false;
end
$function$;

create or replace function public.release_business_labor_reservation_v2(
  p_game_session_id uuid,
  p_business_key text,
  p_reservation_key text,
  p_release_reason text
)
returns table (
  reservation_key text,
  reservation_status text,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_business_id uuid;
  v_reservation public.business_labor_reservations%rowtype;
begin
  if p_game_session_id is null then
    raise exception 'GAME_SESSION_REQUIRED' using errcode = 'P0001';
  end if;
  if p_business_key is null
    or p_business_key !~ '^biz_[0-9a-f]{32}$'
  then
    raise exception 'BUSINESS_KEY_INVALID' using errcode = 'P0001';
  end if;
  if p_reservation_key is null
    or p_reservation_key !~ '^lrv_[0-9a-f]{32}$'
  then
    raise exception 'BUSINESS_LABOR_RESERVATION_KEY_INVALID'
      using errcode = 'P0001';
  end if;
  if p_release_reason is null
    or length(btrim(p_release_reason)) not between 2 and 500
  then
    raise exception 'BUSINESS_LABOR_RELEASE_REASON_INVALID'
      using errcode = 'P0001';
  end if;

  select business_row.id
  into v_business_id
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.public_key = p_business_key;
  if not found then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  select reservation_row.*
  into v_reservation
  from public.business_labor_reservations as reservation_row
  where reservation_row.game_session_id = p_game_session_id
    and reservation_row.business_id = v_business_id
    and reservation_row.public_key = p_reservation_key
  for update;
  if not found then
    raise exception 'BUSINESS_LABOR_RESERVATION_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  if v_reservation.status in ('released', 'cancelled') then
    return query select
      v_reservation.public_key,
      v_reservation.status,
      true;
    return;
  end if;
  if v_reservation.status = 'consumed' then
    raise exception 'BUSINESS_LABOR_RESERVATION_ALREADY_CONSUMED'
      using errcode = 'P0001';
  end if;

  update public.business_labor_reservations
  set
    status = 'released',
    released_at = statement_timestamp(),
    release_reason = btrim(p_release_reason),
    updated_at = statement_timestamp()
  where id = v_reservation.id
  returning * into v_reservation;

  return query select
    v_reservation.public_key,
    v_reservation.status,
    false;
end
$function$;

comment on table public.business_workforce_role_definitions is
  'Server-owned role catalog for finite Business labor capacity.';
comment on table public.business_workforce_candidates is
  'Game-scoped candidate offers generated by trusted services; browser clients never author wages, skill, or capacity.';
comment on table public.business_recipe_labor_requirements is
  'Role and labor-minute requirements attached to the canonical physical recipe definition.';
comment on column public.business_employees.workforce_source_type is
  'Historical rows remain historical_v1 until explicitly migrated; candidate_v2 rows must carry canonical role, capacity, and skill fields.';
comment on table public.business_labor_reservations is
  'Finite labor-minute reservations serialized by employee and period to prevent double booking.';
comment on table public.business_payroll_runs is
  'One payroll evidence row per Business and period, independent of whether any sale occurred.';
comment on table public.business_payroll_entries is
  'Per-employee payroll obligations and posting evidence for a canonical payroll run.';

alter table public.business_workforce_role_definitions
  enable row level security;
alter table public.business_workforce_role_definitions
  force row level security;
alter table public.business_workforce_candidates
  enable row level security;
alter table public.business_workforce_candidates
  force row level security;
alter table public.business_recipe_labor_requirements
  enable row level security;
alter table public.business_recipe_labor_requirements
  force row level security;
alter table public.business_labor_reservations
  enable row level security;
alter table public.business_labor_reservations
  force row level security;
alter table public.business_payroll_runs
  enable row level security;
alter table public.business_payroll_runs
  force row level security;
alter table public.business_payroll_entries
  enable row level security;
alter table public.business_payroll_entries
  force row level security;

revoke all on table public.business_workforce_role_definitions
  from public, anon, authenticated;
revoke all on table public.business_workforce_candidates
  from public, anon, authenticated;
revoke all on table public.business_recipe_labor_requirements
  from public, anon, authenticated;
revoke all on table public.business_labor_reservations
  from public, anon, authenticated;
revoke all on table public.business_payroll_runs
  from public, anon, authenticated;
revoke all on table public.business_payroll_entries
  from public, anon, authenticated;

grant select, insert, update, delete
  on table public.business_workforce_role_definitions
  to service_role;
grant select, insert, update, delete
  on table public.business_workforce_candidates
  to service_role;
grant select, insert, update, delete
  on table public.business_recipe_labor_requirements
  to service_role;
grant select, insert, update, delete
  on table public.business_labor_reservations
  to service_role;
grant select, insert, update, delete
  on table public.business_payroll_runs
  to service_role;
grant select, insert, update, delete
  on table public.business_payroll_entries
  to service_role;

revoke all on function public.upsert_business_workforce_role_v2(
  text, text, text, text, integer, integer, text, jsonb
) from public, anon, authenticated;
grant execute on function public.upsert_business_workforce_role_v2(
  text, text, text, text, integer, integer, text, jsonb
) to service_role;

revoke all on function public.create_business_workforce_candidate_v2(
  uuid, text, text, text, text, numeric, integer, integer,
  text, text, uuid, timestamptz, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.create_business_workforce_candidate_v2(
  uuid, text, text, text, text, numeric, integer, integer,
  text, text, uuid, timestamptz, timestamptz, jsonb
) to service_role;

revoke all on function public.upsert_business_recipe_labor_requirement_v2(
  uuid, text, integer, integer, integer, integer, text, jsonb
) from public, anon, authenticated;
grant execute on function public.upsert_business_recipe_labor_requirement_v2(
  uuid, text, integer, integer, integer, integer, text, jsonb
) to service_role;

revoke all on function public.reserve_business_labor_v2(
  uuid, text, text, text, text, integer, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.reserve_business_labor_v2(
  uuid, text, text, text, text, integer, text, text, text, text
) to service_role;

revoke all on function public.release_business_labor_reservation_v2(
  uuid, text, text, text
) from public, anon, authenticated;
grant execute on function public.release_business_labor_reservation_v2(
  uuid, text, text, text
) to service_role;

commit;

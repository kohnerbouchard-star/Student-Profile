-- Crafting jobs, reservations, equipment, effects, salvage, audit, and protected helpers.
-- Final controller-assigned Crafting migration identity.

create table if not exists public.crafting_jobs (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique default ('cft_' || replace(gen_random_uuid()::text,'-',''))
    check (public_id ~ '^cft_[0-9a-f]{32}$'),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  player_id uuid not null,
  recipe_id uuid not null references public.physical_economy_recipe_definitions(id),
  recipe_key text not null check (recipe_key ~ '^recipe\.[a-z0-9][a-z0-9._-]{2,127}$'),
  quantity integer not null check (quantity between 1 and 25),
  status text not null check (status in ('in_progress','completed','claimed','cancelled','failed')),
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{32}$'),
  difficulty_key text not null,
  country_code text,
  quality_band text not null default 'standard' check (quality_band in ('standard','refined','exceptional')),
  failure_rule text not null check (failure_rule in ('release_all','consume_approved')),
  recipe_snapshot jsonb not null check (jsonb_typeof(recipe_snapshot) = 'object'),
  started_at timestamptz not null default now(),
  completes_at timestamptz not null,
  completed_at timestamptz,
  claimed_at timestamptz,
  cancelled_at timestamptz,
  failed_at timestamptz,
  failure_code text,
  output_granted_at timestamptz,
  recovery_version integer not null default 0 check (recovery_version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_session_id, player_id, idempotency_key),
  foreign key (game_session_id, player_id) references public.players(game_session_id, id)
);

create index if not exists crafting_jobs_player_status_idx
  on public.crafting_jobs(game_session_id, player_id, status, completes_at);
create index if not exists crafting_jobs_admin_status_idx
  on public.crafting_jobs(game_session_id, status, created_at desc);

create table if not exists public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique default ('rsv_' || replace(gen_random_uuid()::text,'-',''))
    check (public_id ~ '^rsv_[0-9a-f]{32}$'),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  player_id uuid not null,
  inventory_holding_id uuid not null,
  store_item_id uuid not null,
  item_key text not null check (item_key ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  reason_type text not null check (reason_type in ('crafting_input','equipment_action')),
  source_id uuid not null,
  quantity integer not null check (quantity > 0),
  status text not null default 'active' check (status in ('active','consumed','released')),
  created_at timestamptz not null default now(),
  consumed_at timestamptz,
  released_at timestamptz,
  unique (game_session_id, player_id, inventory_holding_id, reason_type, source_id),
  foreign key (game_session_id, player_id, inventory_holding_id, store_item_id)
    references public.inventory_holdings(game_session_id, player_id, id, store_item_id),
  foreign key (game_session_id, store_item_id, item_key)
    references public.store_items(game_session_id, id, item_key)
);

create table if not exists public.crafting_job_inputs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.crafting_jobs(id) on delete cascade,
  reservation_id uuid not null unique references public.inventory_reservations(id),
  line_key text not null,
  requested_item_key text not null,
  resolved_item_key text not null,
  base_quantity integer not null check (base_quantity > 0),
  required_quantity integer not null check (required_quantity > 0),
  substitution_group text,
  substitution_ratio numeric(12,6) not null default 1 check (substitution_ratio > 0 and substitution_ratio <= 100),
  quality_penalty_basis_points integer not null default 0 check (quality_penalty_basis_points between 0 and 5000),
  consumed_quantity integer not null default 0 check (consumed_quantity >= 0),
  released_quantity integer not null default 0 check (released_quantity >= 0),
  unique (job_id, line_key)
);

create table if not exists public.crafting_job_outputs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.crafting_jobs(id) on delete cascade,
  line_key text not null,
  item_key text not null,
  quantity integer not null check (quantity > 0),
  output_kind text not null check (output_kind in ('stackable','equipment')),
  store_item_id uuid references public.store_items(id),
  granted_quantity integer not null default 0 check (granted_quantity >= 0),
  granted_at timestamptz,
  unique (job_id, line_key)
);

create table if not exists public.crafting_job_transitions (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  job_id uuid not null references public.crafting_jobs(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_type text not null check (actor_type in ('player','staff_user','system')),
  actor_id uuid,
  action text not null,
  idempotency_key text,
  outcome jsonb not null default '{}'::jsonb check (jsonb_typeof(outcome) = 'object'),
  transitioned_at timestamptz not null default now()
);

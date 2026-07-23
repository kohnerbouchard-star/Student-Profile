-- Equipment instances, consumable requests, effect grants, and effect history.
-- Final controller-assigned Crafting migration identity.

create table if not exists public.equipment_instances (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique default ('eqp_' || replace(gen_random_uuid()::text,'-',''))
    check (public_id ~ '^eqp_[0-9a-f]{32}$'),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  player_id uuid not null,
  store_item_id uuid not null,
  item_key text not null,
  status text not null default 'active' check (status in ('active','salvaged','reserved')),
  equipped_slot text check (equipped_slot is null or equipped_slot in ('field','utility','analysis','operations')),
  bonuses jsonb not null default '{}'::jsonb check (jsonb_typeof(bonuses) = 'object'),
  source_job_id uuid references public.crafting_jobs(id),
  created_at timestamptz not null default now(),
  equipped_at timestamptz,
  salvaged_at timestamptz,
  foreign key (game_session_id, player_id) references public.players(game_session_id, id),
  foreign key (game_session_id, store_item_id, item_key) references public.store_items(game_session_id, id, item_key)
);

create unique index if not exists equipment_player_slot_unique_idx
  on public.equipment_instances(game_session_id, player_id, equipped_slot)
  where equipped_slot is not null and status = 'active';

create table if not exists public.item_use_requests (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique default ('use_' || replace(gen_random_uuid()::text,'-',''))
    check (public_id ~ '^use_[0-9a-f]{32}$'),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  player_id uuid not null,
  store_item_id uuid not null,
  item_key text not null,
  effect_code text not null,
  target_key text,
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{32}$'),
  status text not null check (status in ('applied','rejected')),
  response_body jsonb not null default '{}'::jsonb check (jsonb_typeof(response_body) = 'object'),
  created_at timestamptz not null default now(),
  unique (game_session_id, player_id, idempotency_key),
  foreign key (game_session_id, player_id) references public.players(game_session_id, id),
  foreign key (game_session_id, store_item_id, item_key) references public.store_items(game_session_id, id, item_key)
);

create table if not exists public.item_effect_grants (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique default ('efx_' || replace(gen_random_uuid()::text,'-',''))
    check (public_id ~ '^efx_[0-9a-f]{32}$'),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  player_id uuid not null,
  effect_definition_id uuid not null references public.physical_economy_effect_definitions(id),
  effect_code text not null,
  scope text not null,
  target_key text,
  stack_count integer not null default 1 check (stack_count between 1 and 20),
  status text not null default 'active' check (status in ('active','expired','revoked')),
  active_from timestamptz not null default now(),
  active_until timestamptz,
  cooldown_until timestamptz,
  source_use_id uuid not null references public.item_use_requests(id),
  public_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(public_payload) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (game_session_id, player_id) references public.players(game_session_id, id)
);

create index if not exists item_effect_grants_player_active_idx
  on public.item_effect_grants(game_session_id, player_id, status, active_until);

create table if not exists public.item_effect_history (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  player_id uuid not null,
  effect_grant_id uuid references public.item_effect_grants(id),
  item_use_id uuid references public.item_use_requests(id),
  effect_code text not null,
  action text not null check (action in ('applied','refreshed','stacked','replaced','expired','revoked','rejected')),
  actor_type text not null check (actor_type in ('player','staff_user','system')),
  actor_id uuid,
  summary text not null check (length(btrim(summary)) between 1 and 500),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (game_session_id, player_id) references public.players(game_session_id, id)
);

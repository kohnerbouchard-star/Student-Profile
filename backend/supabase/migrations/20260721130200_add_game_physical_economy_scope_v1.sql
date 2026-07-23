-- Game-scoped physical economy activation, supply, and recipe unlock state.
-- Final controller-assigned Crafting migration identity.

create table if not exists public.game_session_physical_economy_packs (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  pack_id uuid not null references public.physical_economy_content_packs(id),
  status text not null default 'staged' check (status in ('staged','active','disabled','retired')),
  imported_by_staff_user_id uuid references public.staff_users(id),
  activated_by_staff_user_id uuid references public.staff_users(id),
  imported_at timestamptz not null default now(),
  activated_at timestamptz,
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  unique (game_session_id, pack_id)
);

create unique index if not exists game_session_physical_economy_one_active_idx
  on public.game_session_physical_economy_packs(game_session_id)
  where status = 'active';

create table if not exists public.game_session_recipe_availability (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  recipe_id uuid not null references public.physical_economy_recipe_definitions(id),
  enabled boolean not null default false,
  unlocked_by_default boolean not null default false,
  scarcity_band text not null default 'available' check (scarcity_band in ('abundant','available','constrained','scarce','unavailable')),
  country_codes text[] not null default '{}'::text[],
  event_duration_multiplier numeric(8,4) not null default 1 check (event_duration_multiplier between 0.5 and 4),
  route_disruption_multiplier numeric(8,4) not null default 1 check (route_disruption_multiplier between 0.5 and 4),
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  unique (game_session_id, recipe_id)
);

create table if not exists public.game_session_item_supply (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  item_key text not null check (item_key ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  country_code text not null default '*' check (country_code = '*' or country_code ~ '^[A-Z][A-Z0-9_]{2,31}$'),
  scarcity_band text not null default 'available' check (scarcity_band in ('abundant','available','constrained','scarce','unavailable')),
  available_quantity integer check (available_quantity is null or available_quantity >= 0),
  reserved_quantity integer not null default 0 check (reserved_quantity >= 0),
  event_multiplier numeric(8,4) not null default 1 check (event_multiplier between 0.5 and 4),
  route_multiplier numeric(8,4) not null default 1 check (route_multiplier between 0.5 and 4),
  source_event_key text,
  effective_at timestamptz not null default now(),
  expires_at timestamptz,
  version bigint not null default 1 check (version > 0),
  unique (game_session_id, item_key, country_code)
);

create table if not exists public.player_recipe_unlocks (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique default ('rul_' || replace(gen_random_uuid()::text,'-',''))
    check (public_id ~ '^rul_[0-9a-f]{32}$'),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  player_id uuid not null,
  recipe_id uuid not null references public.physical_economy_recipe_definitions(id),
  source_type text not null check (source_type in ('default','class','progression','contract','staff','event')),
  source_key text,
  unlocked_at timestamptz not null default now(),
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  unique (game_session_id, player_id, recipe_id),
  foreign key (game_session_id, player_id) references public.players(game_session_id, id)
);

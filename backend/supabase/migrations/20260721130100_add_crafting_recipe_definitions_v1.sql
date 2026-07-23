-- Crafting recipe, substitution, and salvage definitions.
-- Final controller-assigned Crafting migration identity.

create table if not exists public.physical_economy_recipe_definitions (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references public.physical_economy_content_packs(id) on delete cascade,
  recipe_key text not null check (recipe_key ~ '^recipe\.[a-z0-9][a-z0-9._-]{2,127}$'),
  name text not null check (length(btrim(name)) between 1 and 160),
  category text not null check (category ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  tier integer not null check (tier between 1 and 9),
  workshop_tier integer not null check (workshop_tier between 1 and 9),
  base_duration_seconds integer not null check (base_duration_seconds between 1 and 2592000),
  difficulty_profile text not null check (difficulty_profile ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  required_entitlements text[] not null default '{}'::text[],
  required_tools text[] not null default '{}'::text[],
  country_codes text[] not null default '{}'::text[],
  deterministic boolean not null default true check (deterministic = true),
  failure_rule text not null default 'release_all' check (failure_rule in ('release_all','consume_approved')),
  quality_rule text not null default 'fixed' check (quality_rule in ('fixed','difficulty_snapshot')),
  status text not null default 'staged' check (status in ('staged','active','disabled','regulated','retired')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  unique (pack_id, recipe_key)
);

create table if not exists public.physical_economy_recipe_inputs (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.physical_economy_recipe_definitions(id) on delete cascade,
  line_key text not null check (line_key ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  item_key text not null check (item_key ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  base_quantity integer not null check (base_quantity between 1 and 100000),
  scaling_class text not null check (scaling_class in ('elastic_common','fixed_identity','fixed_strategic','fixed')),
  role text not null default 'ingredient' check (role in ('ingredient','tool_charge','catalyst')),
  substitution_group text check (substitution_group is null or substitution_group ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  unique (recipe_id, line_key)
);

create table if not exists public.physical_economy_recipe_outputs (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.physical_economy_recipe_definitions(id) on delete cascade,
  line_key text not null check (line_key ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  item_key text not null check (item_key ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  quantity integer not null check (quantity between 1 and 100000),
  output_kind text not null check (output_kind in ('stackable','equipment')),
  unique (recipe_id, line_key)
);

create table if not exists public.physical_economy_substitution_options (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references public.physical_economy_content_packs(id) on delete cascade,
  group_key text not null check (group_key ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  item_key text not null check (item_key ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  ratio_numerator integer not null default 1 check (ratio_numerator between 1 and 100),
  ratio_denominator integer not null default 1 check (ratio_denominator between 1 and 100),
  quality_penalty_basis_points integer not null default 0 check (quality_penalty_basis_points between 0 and 5000),
  permit_key text,
  country_codes text[] not null default '{}'::text[],
  difficulty_keys text[] not null default '{}'::text[],
  enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  unique (pack_id, group_key, item_key)
);

create table if not exists public.physical_economy_salvage_rules (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references public.physical_economy_content_packs(id) on delete cascade,
  equipment_item_key text not null check (equipment_item_key ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  outputs jsonb not null check (jsonb_typeof(outputs) = 'array'),
  recovery_cap_basis_points integer not null check (recovery_cap_basis_points between 0 and 9000),
  recraft_cooldown_seconds integer not null default 0 check (recraft_cooldown_seconds between 0 and 2592000),
  enabled boolean not null default true,
  unique (pack_id, equipment_item_key)
);

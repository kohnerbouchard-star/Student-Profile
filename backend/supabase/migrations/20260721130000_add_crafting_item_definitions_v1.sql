-- Crafting schema, immutable helpers, and protected runtime tables.
-- Final controller-assigned Crafting migration identity.

-- Authoritative crafting, equipment, item-effect, and physical-economy runtime.
-- Definition/calibration records are imported from a versioned external seed pack.
-- Durability and repair are intentionally absent and disabled until PR #163 publishes an active maintenance contract.

create or replace function public.crafting_deterministic_basis_points_v1(p_seed text)
returns integer
language sql
immutable
strict
as $$
  select ((('x' || substr(md5(p_seed), 1, 8))::bit(32)::bigint % 10000 + 10000) % 10000)::integer
$$;

create table if not exists public.physical_economy_content_packs (
  id uuid primary key default gen_random_uuid(),
  pack_key text not null check (pack_key ~ '^[a-z0-9][a-z0-9._-]{2,127}$'),
  schema_version text not null check (length(btrim(schema_version)) between 3 and 128),
  content_version text not null check (length(btrim(content_version)) between 1 and 64),
  content_digest text not null check (content_digest ~ '^[a-f0-9]{64}$'),
  source_commit text not null check (source_commit ~ '^[a-f0-9]{40}$'),
  status text not null default 'staged' check (status in ('staged','active','retired')),
  imported_by_staff_user_id uuid references public.staff_users(id),
  imported_at timestamptz not null default now(),
  activated_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  unique (pack_key, content_version, content_digest)
);

create table if not exists public.physical_economy_item_definitions (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references public.physical_economy_content_packs(id) on delete cascade,
  item_key text not null check (item_key ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  name text not null check (length(btrim(name)) between 1 and 160),
  description text,
  item_class text not null check (item_class in ('material','component','equipment','consumable','blueprint','authorization')),
  subtype text not null default 'general' check (subtype ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  source_country_code text,
  currency_code text not null check (currency_code = upper(currency_code) and length(currency_code) between 3 and 16),
  stackable boolean not null,
  equipment_slot text check (equipment_slot is null or equipment_slot in ('field','utility','analysis','operations')),
  effect_code text check (effect_code is null or effect_code ~ '^[A-Z][A-Z0-9_]{2,95}$'),
  effect_enabled boolean not null default false,
  tool_tags text[] not null default '{}'::text[],
  scarcity_policy jsonb not null default '{}'::jsonb check (jsonb_typeof(scarcity_policy) = 'object'),
  availability_policy jsonb not null default '{}'::jsonb check (jsonb_typeof(availability_policy) = 'object'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  status text not null default 'staged' check (status in ('staged','active','disabled','retired')),
  created_at timestamptz not null default now(),
  unique (pack_id, item_key),
  check ((item_class = 'equipment') = (equipment_slot is not null)),
  check (not effect_enabled or item_class = 'consumable')
);

create table if not exists public.physical_economy_effect_definitions (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references public.physical_economy_content_packs(id) on delete cascade,
  effect_code text not null check (effect_code ~ '^[A-Z][A-Z0-9_]{2,95}$'),
  handler_code text not null check (handler_code ~ '^[a-z][a-z0-9_]{2,95}$'),
  effect_kind text not null check (effect_kind in ('temporary_modifier','entitlement','report','protection','crafting_modifier','disabled_repair')),
  scope text not null check (scope in ('player','crafting','shipment','contract','equipment','report')),
  duration_seconds integer not null default 0 check (duration_seconds between 0 and 2592000),
  stacking_rule text not null default 'nonstacking' check (stacking_rule in ('nonstacking','replace','refresh','max','add_bounded')),
  max_stacks integer not null default 1 check (max_stacks between 1 and 20),
  cooldown_seconds integer not null default 0 check (cooldown_seconds between 0 and 2592000),
  enabled boolean not null default false,
  public_summary text not null check (length(btrim(public_summary)) between 1 and 500),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  unique (pack_id, effect_code),
  check (effect_kind <> 'disabled_repair' or enabled = false)
);

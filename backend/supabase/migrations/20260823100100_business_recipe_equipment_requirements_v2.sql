-- Business V2 Phase 5A: canonical Business equipment capacity foundation.
-- Additive, forward-only, and intentionally excludes timed manufacturing and maintenance settlement.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- Canonical recipe equipment requirement metadata
-- ---------------------------------------------------------------------------

create table if not exists public.business_recipe_equipment_requirements (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique default ('beq_' || encode(gen_random_bytes(16), 'hex')),
  recipe_definition_id uuid not null
    references public.physical_economy_recipe_definitions(id) on delete cascade,
  capability_key text not null,
  fixed_equipment_minutes_per_run integer not null default 0,
  equipment_minutes_per_unit integer not null default 0,
  minimum_instance_count integer not null default 1,
  source_kind text not null default 'canonical_required_tool_v1',
  status text not null default 'active',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_recipe_equipment_requirements_public_key_check
    check (public_key ~ '^beq_[0-9a-f]{32}$'),
  constraint business_recipe_equipment_requirements_capability_check
    check (capability_key ~ '^[a-z0-9][a-z0-9._-]{0,127}$'),
  constraint business_recipe_equipment_requirements_minutes_check
    check (
      fixed_equipment_minutes_per_run >= 0
      and equipment_minutes_per_unit >= 0
      and fixed_equipment_minutes_per_run + equipment_minutes_per_unit > 0
    ),
  constraint business_recipe_equipment_requirements_count_check
    check (minimum_instance_count between 1 and 100),
  constraint business_recipe_equipment_requirements_source_check
    check (source_kind in ('canonical_required_tool_v1','trusted_override_v2')),
  constraint business_recipe_equipment_requirements_status_check
    check (status in ('active','disabled','retired')),
  constraint business_recipe_equipment_requirements_version_check
    check (version > 0),
  constraint business_recipe_equipment_requirements_scope_unique
    unique (recipe_definition_id, capability_key)
);

create trigger set_business_recipe_equipment_requirements_updated_at
before update on public.business_recipe_equipment_requirements
for each row execute function public.set_current_timestamp_updated_at();

alter table public.business_recipe_equipment_requirements enable row level security;
revoke all on table public.business_recipe_equipment_requirements from public, anon, authenticated;
grant select, insert, update, delete on table public.business_recipe_equipment_requirements to service_role;

create or replace function public.sync_business_recipe_equipment_requirements_v2(
  p_recipe_definition_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_recipe public.physical_economy_recipe_definitions%rowtype;
  v_capability text;
  v_active_count integer := 0;
  v_minutes integer;
begin
  select recipe_row.*
  into v_recipe
  from public.physical_economy_recipe_definitions as recipe_row
  where recipe_row.id = p_recipe_definition_id
    and recipe_row.status = 'active'
  for share;
  if not found then
    raise exception 'BUSINESS_EQUIPMENT_RECIPE_NOT_ACTIVE' using errcode = 'P0001';
  end if;

  v_minutes := greatest(1, ceil(v_recipe.base_duration_seconds / 60.0)::integer);

  update public.business_recipe_equipment_requirements as requirement
  set
    status = 'disabled',
    version = requirement.version + 1,
    updated_at = statement_timestamp()
  where requirement.recipe_definition_id = v_recipe.id
    and requirement.source_kind = 'canonical_required_tool_v1'
    and requirement.status = 'active'
    and not (
      requirement.capability_key = any(
        coalesce(
          array(
            select lower(btrim(tool_key))
            from unnest(v_recipe.required_tools) as tools(tool_key)
            where lower(btrim(tool_key)) ~ '^[a-z0-9][a-z0-9._-]{0,127}$'
          ),
          '{}'::text[]
        )
      )
    );

  for v_capability in
    select distinct lower(btrim(tool_key))
    from unnest(v_recipe.required_tools) as tools(tool_key)
    where lower(btrim(tool_key)) ~ '^[a-z0-9][a-z0-9._-]{0,127}$'
    order by lower(btrim(tool_key))
  loop
    insert into public.business_recipe_equipment_requirements (
      recipe_definition_id,
      capability_key,
      fixed_equipment_minutes_per_run,
      equipment_minutes_per_unit,
      minimum_instance_count,
      source_kind,
      status
    ) values (
      v_recipe.id,
      v_capability,
      0,
      v_minutes,
      1,
      'canonical_required_tool_v1',
      'active'
    )
    on conflict on constraint business_recipe_equipment_requirements_scope_unique
    do update set
      fixed_equipment_minutes_per_run = excluded.fixed_equipment_minutes_per_run,
      equipment_minutes_per_unit = excluded.equipment_minutes_per_unit,
      minimum_instance_count = excluded.minimum_instance_count,
      status = 'active',
      version = public.business_recipe_equipment_requirements.version + 1,
      updated_at = statement_timestamp();
    v_active_count := v_active_count + 1;
  end loop;

  return v_active_count;
end
$function$;

revoke all on function public.sync_business_recipe_equipment_requirements_v2(uuid)
  from public, anon, authenticated;
grant execute on function public.sync_business_recipe_equipment_requirements_v2(uuid)
  to service_role;

select public.sync_business_recipe_equipment_requirements_v2(recipe.id)
from public.physical_economy_recipe_definitions as recipe
where recipe.status = 'active'
order by recipe.recipe_key;

commit;

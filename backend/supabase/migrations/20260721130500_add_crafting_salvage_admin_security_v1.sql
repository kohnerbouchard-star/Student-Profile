-- Salvage jobs, Admin audit, RLS, and effect allowlist helpers.
-- Final controller-assigned Crafting migration identity.

create table if not exists public.equipment_salvage_jobs (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique default ('slv_' || replace(gen_random_uuid()::text,'-',''))
    check (public_id ~ '^slv_[0-9a-f]{32}$'),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  player_id uuid not null,
  equipment_instance_id uuid not null references public.equipment_instances(id),
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{32}$'),
  status text not null check (status in ('settled','failed')),
  outputs jsonb not null default '[]'::jsonb check (jsonb_typeof(outputs) = 'array'),
  settled_at timestamptz,
  failure_code text,
  created_at timestamptz not null default now(),
  unique (game_session_id, player_id, idempotency_key),
  foreign key (game_session_id, player_id) references public.players(game_session_id, id)
);

create table if not exists public.physical_economy_admin_events (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique default ('pea_' || replace(gen_random_uuid()::text,'-',''))
    check (public_id ~ '^pea_[0-9a-f]{32}$'),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  staff_user_id uuid not null references public.staff_users(id),
  action text not null,
  idempotency_key text not null,
  target_key text,
  outcome jsonb not null default '{}'::jsonb check (jsonb_typeof(outcome) = 'object'),
  created_at timestamptz not null default now(),
  unique (game_session_id, staff_user_id, action, idempotency_key)
);

comment on table public.physical_economy_content_packs is 'Versioned runtime import envelope. PR #163 remains definition/calibration authority.';
comment on table public.crafting_jobs is 'Server-authoritative, game-scoped crafting jobs with immutable recipe/difficulty snapshots.';
comment on table public.inventory_reservations is 'Reason-specific reservation source of truth. inventory_holdings.quantity_reserved remains the projection.';
comment on table public.equipment_instances is 'Unique equipment ownership and slots. Durability and repair are intentionally unsupported.';
comment on table public.item_effect_history is 'Append-only automated item-effect audit history.';

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'physical_economy_content_packs','physical_economy_item_definitions','physical_economy_effect_definitions',
    'physical_economy_recipe_definitions','physical_economy_recipe_inputs','physical_economy_recipe_outputs',
    'physical_economy_substitution_options','physical_economy_salvage_rules',
    'game_session_physical_economy_packs','game_session_recipe_availability','game_session_item_supply',
    'player_recipe_unlocks','crafting_jobs','inventory_reservations','crafting_job_inputs','crafting_job_outputs',
    'crafting_job_transitions','equipment_instances','item_use_requests','item_effect_grants','item_effect_history',
    'equipment_salvage_jobs','physical_economy_admin_events'
  ]
  loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('revoke all on table public.%I from anon, authenticated', v_table);
  end loop;
end $$;

create or replace function public.assert_player_crafting_mutation_allowed_v1(
  p_game_session_id uuid,
  p_player_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if not exists (
    select 1
    from public.players p
    join public.game_sessions g on g.id = p.game_session_id
    where p.game_session_id = p_game_session_id
      and p.id = p_player_id
      and p.status = 'active'
      and g.status = 'active'
      and g.lifecycle_state = 'active'
  ) then
    raise exception 'CRAFTING_PLAYER_SCOPE_INACTIVE' using errcode = 'P0001';
  end if;
end
$function$;

create or replace function public.physical_economy_safe_effect_handler_v1(p_effect_code text)
returns text
language sql immutable
set search_path = public, pg_temp
as $$
  select case upper(coalesce(p_effect_code,''))
    when 'POWER_SECURE_ANALYSIS' then 'grant_report_access'
    when 'CREATE_VERIFIED_LEDGER_SNAPSHOT' then 'grant_verified_snapshot'
    when 'PRESERVE_RESEARCH_SAMPLE' then 'grant_sample_protection'
    when 'RUN_WATER_TEST' then 'grant_water_test'
    when 'EXTEND_TRANSLATION_COVERAGE' then 'grant_translation_coverage'
    when 'CREATE_PUBLIC_BRIEFING' then 'grant_public_briefing'
    when 'PROTECT_SHIPMENT' then 'grant_shipment_protection'
    when 'IMPROVE_SALVAGE_CLASSIFICATION' then 'grant_salvage_classification'
    when 'REROUTE_ELIGIBLE_SHIPMENT' then 'grant_route_reroute'
    when 'ERASE_SENSITIVE_DATA' then 'grant_secure_erasure'
    else null
  end
$$;

create or replace function public.physical_economy_effect_kind_v1(p_effect_code text)
returns text
language sql immutable
set search_path = public, pg_temp
as $$
  select case
    when upper(coalesce(p_effect_code,'')) like '%REPAIR%'
      or upper(coalesce(p_effect_code,'')) like '%MAINTENANCE%'
      or upper(coalesce(p_effect_code,'')) like '%RESTORE_%EQUIPMENT%'
      or upper(coalesce(p_effect_code,'')) in (
        'CALIBRATE_SENSOR_EQUIPMENT','RESTORE_CRYOGENIC_COOLING','RESTORE_FABRICATOR_TOOLING',
        'SERVICE_HYDRAULIC_EQUIPMENT','APPLY_APPROVED_FIRMWARE_UPDATE','RESTORE_EQUIPMENT_CHARGES'
      ) then 'disabled_repair'
    when public.physical_economy_safe_effect_handler_v1(p_effect_code) is not null then 'temporary_modifier'
    else 'disabled_repair'
  end
$$;

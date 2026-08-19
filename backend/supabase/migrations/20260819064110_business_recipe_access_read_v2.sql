-- Business V2 Phase 2B: browser-safe read of Business-owned canonical recipe access.
-- Business owns only the access relation. Recipe identity and operating metadata remain
-- authoritative in the existing physical-economy recipe catalog.

begin;

create or replace function public.read_owned_business_recipes_v2(
  p_game_session_id uuid,
  p_player_id uuid
)
returns table (
  business_key text,
  access_key text,
  recipe_key text,
  recipe_name text,
  recipe_category text,
  recipe_tier integer,
  workshop_tier integer,
  base_duration_seconds integer,
  difficulty_profile text,
  description text,
  availability_enabled boolean,
  available_in_business_country boolean,
  available_now boolean,
  scarcity_band text,
  event_duration_multiplier numeric,
  route_disruption_multiplier numeric,
  source_type text,
  granted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_business record;
begin
  select * into v_business
  from public.resolve_player_business_v2(p_game_session_id, p_player_id);

  return query
  select
    v_business.business_key,
    access.public_key,
    recipe.recipe_key,
    recipe.name,
    recipe.category,
    recipe.tier,
    recipe.workshop_tier,
    recipe.base_duration_seconds,
    recipe.difficulty_profile,
    coalesce(nullif(btrim(recipe.metadata->>'description'), ''), 'Approved deterministic recipe.'),
    coalesce(availability.enabled, false),
    case
      when availability.recipe_id is null then false
      when cardinality(availability.country_codes) = 0 then true
      else v_business.country_code = any(availability.country_codes)
    end,
    coalesce(pack_scope.status = 'active', false)
      and coalesce(availability.enabled, false)
      and coalesce(availability.scarcity_band, 'unavailable') <> 'unavailable'
      and (
        availability.recipe_id is not null
        and (
          cardinality(availability.country_codes) = 0
          or v_business.country_code = any(availability.country_codes)
        )
      ),
    coalesce(availability.scarcity_band, 'unavailable'),
    coalesce(availability.event_duration_multiplier, 1),
    coalesce(availability.route_disruption_multiplier, 1),
    access.source_type,
    access.granted_at
  from public.business_recipe_access access
  join public.physical_economy_recipe_definitions recipe
    on recipe.id = access.recipe_id
   and recipe.status = 'active'
  left join public.game_session_recipe_availability availability
    on availability.game_session_id = access.game_session_id
   and availability.recipe_id = recipe.id
  left join public.game_session_physical_economy_packs pack_scope
    on pack_scope.game_session_id = access.game_session_id
   and pack_scope.pack_id = recipe.pack_id
   and pack_scope.status = 'active'
  where access.game_session_id = p_game_session_id
    and access.business_id = v_business.business_id
    and access.revoked_at is null
  order by recipe.category, recipe.tier, recipe.name, recipe.recipe_key;
end;
$$;

revoke all on function public.read_owned_business_recipes_v2(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.read_owned_business_recipes_v2(uuid,uuid)
  to service_role;

commit;

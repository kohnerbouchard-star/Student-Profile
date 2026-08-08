-- Crafting canonical read cutover V2.
-- Part 3 of 6 from the reviewed domain migration; ordered and forward-only.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- Crafting read: canonical game item + personal inventory account joins.
-- ---------------------------------------------------------------------------

create or replace function public.read_player_crafting_v1(
  p_game_session_id uuid,
  p_player_id uuid
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, economy_private, pg_temp
as $function$
declare
  v_pack_id uuid;
  v_difficulty text := 'standard';
  v_country text;
  v_player_account_id uuid;
  v_recipe_rows jsonb := '[]'::jsonb;
  v_jobs jsonb := '[]'::jsonb;
  v_equipment jsonb := '[]'::jsonb;
  v_effects jsonb := '[]'::jsonb;
  v_effect_history jsonb := '[]'::jsonb;
  v_material_slots_used integer := 0;
begin
  if not exists (
    select 1
    from public.players p
    join public.game_sessions g on g.id = p.game_session_id
    where p.game_session_id = p_game_session_id
      and p.id = p_player_id
      and p.status = 'active'
      and (
        (g.status = 'active' and g.lifecycle_state = 'active')
        or (g.status = 'disabled' and g.lifecycle_state = 'paused')
      )
  ) then
    raise exception 'CRAFTING_PLAYER_SCOPE_INACTIVE' using errcode = 'P0001';
  end if;

  select ia.id into v_player_account_id
  from public.economic_parties ep
  join public.inventory_accounts ia
    on ia.game_session_id = ep.game_session_id
   and ia.party_id = ep.id
   and ia.account_kind = 'personal'
   and ia.status = 'active'
  where ep.game_session_id = p_game_session_id
    and ep.player_id = p_player_id
    and ep.party_kind = 'player'
    and ep.status = 'active';
  if v_player_account_id is null then
    raise exception 'CRAFTING_PLAYER_INVENTORY_ACCOUNT_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select gp.pack_id into v_pack_id
  from public.game_session_physical_economy_packs gp
  where gp.game_session_id = p_game_session_id and gp.status = 'active';

  select coalesce(nullif(lower(d.difficulty_preset), 'standard'), 'moderate')
  into v_difficulty
  from public.game_difficulty_policy_settings d
  where d.game_session_id = p_game_session_id;
  if not found then
    select coalesce(nullif(lower(gs.difficulty_preset), 'standard'), 'moderate')
    into v_difficulty
    from public.game_settings gs
    where gs.game_session_id = p_game_session_id;
  end if;
  v_difficulty := coalesce(v_difficulty, 'moderate');

  select cp.country_code into v_country
  from public.player_country_assignments a
  join public.country_profiles cp on cp.id = a.country_profile_id
  where a.game_session_id = p_game_session_id
    and a.player_id = p_player_id
    and a.status = 'active'
  order by a.assigned_at desc
  limit 1;

  if v_pack_id is not null then
    select coalesce(jsonb_agg(recipe order by recipe->>'name'), '[]'::jsonb)
    into v_recipe_rows
    from (
      select jsonb_build_object(
        'id', r.recipe_key,
        'recipeKey', r.recipe_key,
        'name', r.name,
        'category', r.category,
        'tier', r.tier,
        'workshopTier', r.workshop_tier,
        'durationSeconds', ceil(
          r.base_duration_seconds
          * case v_difficulty when 'easy' then 0.8 when 'hard' then 1.25 when 'insane' then 1.5 else 1 end
          * a.event_duration_multiplier
          * a.route_disruption_multiplier
        )::integer,
        'duration', ceil(
          r.base_duration_seconds
          * case v_difficulty when 'easy' then 0.8 when 'hard' then 1.25 when 'insane' then 1.5 else 1 end
          * a.event_duration_multiplier
          * a.route_disruption_multiplier / 60.0
        )::integer || ' min',
        'description', coalesce(r.metadata->>'description', 'Approved deterministic recipe.'),
        'unlockStatus', case when a.unlocked_by_default or u.id is not null then 'Unlocked' else 'Locked' end,
        'enabled', a.enabled
          and a.scarcity_band <> 'unavailable'
          and (cardinality(a.country_codes) = 0 or v_country = any(a.country_codes)),
        'scarcityBand', a.scarcity_band,
        'requiredWorkshop', 'Tier ' || r.workshop_tier,
        'requiredTools', to_jsonb(r.required_tools),
        'requiredEntitlements', to_jsonb(r.required_entitlements),
        'ingredients', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'itemKey', i.item_key,
            'name', coalesce(gi.name, i.item_key),
            'required', ceil(
              i.base_quantity
              * case when i.scaling_class = 'elastic_common' then
                case v_difficulty when 'easy' then 0.9 when 'hard' then 1.15 when 'insane' then 1.3 else 1 end
                else 1
              end
            )::integer,
            'owned', greatest(0, coalesce(h.quantity_owned - h.quantity_reserved, 0)),
            'substitutionGroup', i.substitution_group,
            'role', i.role
          ) order by i.line_key), '[]'::jsonb)
          from public.physical_economy_recipe_inputs i
          left join public.game_items gi
            on gi.game_session_id = p_game_session_id
           and gi.canonical_key = i.item_key
           and gi.status = 'active'
          left join public.inventory_holdings h
            on h.game_session_id = p_game_session_id
           and h.inventory_account_id = v_player_account_id
           and h.game_item_id = gi.id
          where i.recipe_id = r.id
        ),
        'outputs', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'itemKey', o.item_key,
            'quantity', o.quantity,
            'outputKind', o.output_kind,
            'name', coalesce(gi.name, o.item_key)
          ) order by o.line_key), '[]'::jsonb)
          from public.physical_economy_recipe_outputs o
          left join public.game_items gi
            on gi.game_session_id = p_game_session_id
           and gi.canonical_key = o.item_key
          where o.recipe_id = r.id
        ),
        'outputQuantity', coalesce((
          select sum(o.quantity)
          from public.physical_economy_recipe_outputs o
          where o.recipe_id = r.id
        ), 0),
        'effect', coalesce((
          select string_agg(coalesce(gi.name, o.item_key), ', ' order by o.line_key)
          from public.physical_economy_recipe_outputs o
          left join public.game_items gi
            on gi.game_session_id = p_game_session_id
           and gi.canonical_key = o.item_key
          where o.recipe_id = r.id
        ), ''),
        'maxCraft', 25,
        'image', ''
      ) as recipe
      from public.physical_economy_recipe_definitions r
      join public.game_session_recipe_availability a
        on a.recipe_id = r.id and a.game_session_id = p_game_session_id
      left join public.player_recipe_unlocks u
        on u.game_session_id = p_game_session_id
       and u.player_id = p_player_id
       and u.recipe_id = r.id
       and u.revoked_at is null
      where r.pack_id = v_pack_id and r.status = 'active'
    ) q;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', j.public_id,
    'jobKey', j.public_id,
    'recipeKey', j.recipe_key,
    'name', r.name,
    'quantity', j.quantity,
    'status', j.status,
    'startedAt', j.started_at,
    'completesAt', j.completes_at,
    'remainingSeconds', greatest(0, extract(epoch from (j.completes_at - now()))::integer),
    'remaining', case when j.status = 'in_progress'
      then greatest(0, ceil(extract(epoch from (j.completes_at - now())) / 60.0))::integer || ' min'
      else j.status end,
    'progress', case when j.status = 'in_progress' then least(100, greatest(0,
      floor(100 * extract(epoch from (now() - j.started_at))
        / nullif(extract(epoch from (j.completes_at - j.started_at)), 0)))::integer)
      when j.status in ('completed', 'claimed') then 100 else 0 end,
    'qualityBand', j.quality_band,
    'canCancel', j.status = 'in_progress',
    'canClaim', j.status in ('in_progress', 'completed') and now() >= j.completes_at
  ) order by j.created_at desc), '[]'::jsonb)
  into v_jobs
  from public.crafting_jobs j
  join public.physical_economy_recipe_definitions r on r.id = j.recipe_id
  where j.game_session_id = p_game_session_id
    and j.player_id = p_player_id
    and j.created_at >= now() - interval '90 days';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.public_id,
    'equipmentKey', e.public_id,
    'itemKey', gi.canonical_key,
    'name', gi.name,
    'slot', e.equipped_slot,
    'allowedSlot', d.equipment_slot,
    'status', e.status,
    'bonuses', e.bonuses,
    'durabilitySupported', false,
    'repairSupported', false
  ) order by gi.name, e.created_at), '[]'::jsonb)
  into v_equipment
  from public.equipment_instances e
  join public.game_items gi
    on gi.game_session_id = e.game_session_id and gi.id = e.game_item_id
  left join public.physical_economy_item_definitions d
    on d.id = gi.physical_item_definition_id
  where e.game_session_id = p_game_session_id
    and e.player_id = p_player_id
    and e.inventory_account_id = v_player_account_id
    and e.status = 'active';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', g.public_id,
    'effectCode', g.effect_code,
    'scope', g.scope,
    'targetKey', g.target_key,
    'stackCount', g.stack_count,
    'status', case when g.status = 'active' and g.active_until is not null and g.active_until <= now()
      then 'expired' else g.status end,
    'activeFrom', g.active_from,
    'activeUntil', g.active_until,
    'cooldownUntil', g.cooldown_until,
    'summary', d.public_summary
  ) order by g.created_at desc), '[]'::jsonb)
  into v_effects
  from public.item_effect_grants g
  join public.physical_economy_effect_definitions d on d.id = g.effect_definition_id
  where g.game_session_id = p_game_session_id
    and g.player_id = p_player_id
    and g.status = 'active';

  select coalesce(jsonb_agg(jsonb_build_object(
    'effectCode', h.effect_code,
    'action', h.action,
    'summary', h.summary,
    'createdAt', h.created_at
  ) order by h.created_at desc), '[]'::jsonb)
  into v_effect_history
  from (
    select *
    from public.item_effect_history
    where game_session_id = p_game_session_id and player_id = p_player_id
    order by created_at desc
    limit 100
  ) h;

  select count(*)::integer into v_material_slots_used
  from public.inventory_holdings h
  where h.game_session_id = p_game_session_id
    and h.inventory_account_id = v_player_account_id
    and h.quantity_owned > 0;

  return jsonb_build_object(
    'schemaVersion', 2,
    'packActive', v_pack_id is not null,
    'durabilitySupported', false,
    'repairSupported', false,
    'workshopLevel', 'Tier 1',
    'workshopNote', 'Server-authoritative deterministic fabrication',
    'materialSlotsUsed', v_material_slots_used,
    'materialSlotsMax', 999,
    'difficulty', v_difficulty,
    'countryCode', v_country,
    'recipes', v_recipe_rows,
    'queue', v_jobs,
    'jobs', v_jobs,
    'equipment', v_equipment,
    'effects', v_effects,
    'effectHistory', v_effect_history
  );
end
$function$;

revoke all on function public.read_player_crafting_v1(uuid, uuid) from public, anon, authenticated;
grant execute on function public.read_player_crafting_v1(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------

commit;

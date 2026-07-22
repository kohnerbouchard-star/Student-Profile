-- Versioned PR #163 physical-economy import and activation controls.
-- Final controller-assigned Crafting migration identity.

create or replace function public.import_physical_economy_pack_v1(
  p_game_session_id uuid,
  p_staff_user_id uuid,
  p_pack jsonb,
  p_content_digest text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_schema text := p_pack->>'schemaVersion';
  v_pack_key text := lower(btrim(coalesce(p_pack->>'packKey','')));
  v_content_version text := btrim(coalesce(p_pack->>'contentVersion',''));
  v_source_commit text := lower(btrim(coalesce(p_pack->>'sourceCommit','')));
  v_pack public.physical_economy_content_packs%rowtype;
  v_item jsonb;
  v_recipe jsonb;
  v_line jsonb;
  v_effect_code text;
  v_effect_handler text;
  v_effect_kind text;
  v_recipe_id uuid;
  v_event public.physical_economy_admin_events%rowtype;
  v_item_count integer := 0;
  v_recipe_count integer := 0;
begin
  if p_game_session_id is null or p_staff_user_id is null
    or v_schema <> 'econovaria-physical-economy-runtime-pack-v1'
    or v_pack_key !~ '^[a-z0-9][a-z0-9._-]{2,127}$'
    or length(v_content_version) not between 1 and 64
    or v_source_commit !~ '^[a-f0-9]{40}$'
    or coalesce(p_content_digest,'') !~ '^[a-f0-9]{64}$'
    or coalesce(p_idempotency_key,'') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or jsonb_typeof(p_pack->'items') <> 'array'
    or jsonb_typeof(p_pack->'recipes') <> 'array'
  then
    raise exception 'PHYSICAL_ECONOMY_PACK_INVALID' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.game_sessions g
    join public.staff_users s on s.id = p_staff_user_id
    where g.id = p_game_session_id and g.owner_staff_user_id = p_staff_user_id
  ) then
    raise exception 'PHYSICAL_ECONOMY_STAFF_SCOPE_INVALID' using errcode = 'P0001';
  end if;

  select * into v_event from public.physical_economy_admin_events
  where game_session_id = p_game_session_id
    and staff_user_id = p_staff_user_id
    and action = 'pack.import'
    and idempotency_key = p_idempotency_key
  for update;

  if found then
    return v_event.outcome || jsonb_build_object('replayed', true);
  end if;

  insert into public.physical_economy_content_packs (
    pack_key,schema_version,content_version,content_digest,source_commit,status,imported_by_staff_user_id,metadata
  ) values (
    v_pack_key,v_schema,v_content_version,p_content_digest,v_source_commit,'staged',p_staff_user_id,
    jsonb_build_object(
      'definitionAuthority','PR #163',
      'durabilityEnabled',false,
      'repairEnabled',false,
      'activationAuthorization',coalesce(p_pack->'activationAuthorization','{}'::jsonb),
      'calibrationEvidence',coalesce(p_pack->'calibrationEvidence','{}'::jsonb),
      'sourceContracts',coalesce(p_pack->'sourceContracts','{}'::jsonb)
    )
  )
  on conflict (pack_key,content_version,content_digest) do update
    set metadata = public.physical_economy_content_packs.metadata || excluded.metadata
  returning * into v_pack;

  for v_item in select value from jsonb_array_elements(p_pack->'items')
  loop
    v_effect_code := nullif(upper(btrim(coalesce(v_item->>'effectCode',''))),'');
    v_effect_handler := public.physical_economy_safe_effect_handler_v1(v_effect_code);
    v_effect_kind := public.physical_economy_effect_kind_v1(v_effect_code);

    insert into public.physical_economy_item_definitions (
      pack_id,item_key,name,description,item_class,subtype,source_country_code,currency_code,
      stackable,equipment_slot,effect_code,effect_enabled,tool_tags,scarcity_policy,availability_policy,metadata,status
    ) values (
      v_pack.id,
      lower(v_item->>'itemKey'),
      v_item->>'name',
      nullif(v_item->>'description',''),
      lower(v_item->>'itemClass'),
      lower(coalesce(v_item->>'subtype','general')),
      nullif(upper(v_item->>'sourceCountryCode'),''),
      upper(v_item->>'currencyCode'),
      coalesce((v_item->>'stackable')::boolean, lower(v_item->>'itemClass') <> 'equipment'),
      nullif(lower(v_item->>'equipmentSlot'),''),
      v_effect_code,
      v_effect_handler is not null and coalesce((v_item->>'effectEnabled')::boolean,true),
      coalesce(array(select jsonb_array_elements_text(v_item->'toolTags')), '{}'::text[]),
      coalesce(v_item->'scarcityPolicy','{}'::jsonb),
      coalesce(v_item->'availabilityPolicy','{}'::jsonb),
      coalesce(v_item->'metadata','{}'::jsonb),
      'staged'
    )
    on conflict (pack_id,item_key) do update set
      name=excluded.name, description=excluded.description, item_class=excluded.item_class, subtype=excluded.subtype,
      source_country_code=excluded.source_country_code, currency_code=excluded.currency_code, stackable=excluded.stackable,
      equipment_slot=excluded.equipment_slot, effect_code=excluded.effect_code, effect_enabled=excluded.effect_enabled,
      tool_tags=excluded.tool_tags, scarcity_policy=excluded.scarcity_policy,
      availability_policy=excluded.availability_policy, metadata=excluded.metadata;

    insert into public.store_items (
      game_session_id,item_key,name,description,category,price,currency_code,stock_quantity,status,visibility,sort_order
    ) values (
      p_game_session_id,lower(v_item->>'itemKey'),v_item->>'name',
      coalesce(nullif(v_item->>'description',''),'Runtime item projected from the approved physical-economy pack.'),
      lower(v_item->>'itemClass'),0,upper(v_item->>'currencyCode'),0,'active','hidden',0
    )
    on conflict (game_session_id,item_key) do update set
      name=excluded.name,
      description=coalesce(public.store_items.description, excluded.description),
      category=excluded.category,
      updated_at=statement_timestamp();

    insert into public.game_session_item_supply (
      game_session_id,item_key,country_code,scarcity_band,available_quantity
    ) values (
      p_game_session_id,lower(v_item->>'itemKey'),'*',
      case lower(btrim(coalesce(v_item #>> '{scarcityPolicy,band}','available')))
        when 'low' then 'abundant'
        when 'available' then 'available'
        when 'moderate' then 'constrained'
        when 'high' then 'scarce'
        when 'strategic' then 'scarce'
        else 'unavailable'
      end,
      null
    )
    on conflict (game_session_id,item_key,country_code) do nothing;

    if v_effect_code is not null then
      insert into public.physical_economy_effect_definitions (
        pack_id,effect_code,handler_code,effect_kind,scope,duration_seconds,stacking_rule,max_stacks,
        cooldown_seconds,enabled,public_summary,metadata
      ) values (
        v_pack.id,v_effect_code,coalesce(v_effect_handler,'disabled_repair'),v_effect_kind,
        coalesce(nullif(lower(v_item #>> '{effect,scope}'),''),'player'),
        greatest(0,least(2592000,coalesce((v_item #>> '{effect,durationSeconds}')::integer,0))),
        coalesce(nullif(lower(v_item #>> '{effect,stackingRule}'),''),'nonstacking'),
        greatest(1,least(20,coalesce((v_item #>> '{effect,maxStacks}')::integer,1))),
        greatest(0,least(2592000,coalesce((v_item #>> '{effect,cooldownSeconds}')::integer,0))),
        v_effect_handler is not null and v_effect_kind <> 'disabled_repair',
        coalesce(nullif(v_item #>> '{effect,summary}',''), 'Approved bounded item effect.'),
        jsonb_build_object('itemKey',lower(v_item->>'itemKey'),'repairEnabled',false,'durabilityEnabled',false)
      )
      on conflict (pack_id,effect_code) do update set
        handler_code=excluded.handler_code,effect_kind=excluded.effect_kind,scope=excluded.scope,
        duration_seconds=excluded.duration_seconds,stacking_rule=excluded.stacking_rule,
        max_stacks=excluded.max_stacks,cooldown_seconds=excluded.cooldown_seconds,
        enabled=excluded.enabled,public_summary=excluded.public_summary,metadata=excluded.metadata;
    end if;

    v_item_count := v_item_count + 1;
  end loop;

  for v_recipe in select value from jsonb_array_elements(p_pack->'recipes')
  loop
    insert into public.physical_economy_recipe_definitions (
      pack_id,recipe_key,name,category,tier,workshop_tier,base_duration_seconds,difficulty_profile,
      required_entitlements,required_tools,country_codes,deterministic,failure_rule,quality_rule,status,metadata
    ) values (
      v_pack.id,lower(v_recipe->>'recipeKey'),v_recipe->>'name',lower(v_recipe->>'category'),
      (v_recipe->>'tier')::integer,(v_recipe->>'workshopTier')::integer,
      greatest(1,(v_recipe->>'baseDurationSeconds')::integer),lower(v_recipe->>'difficultyProfile'),
      coalesce(array(select jsonb_array_elements_text(v_recipe->'requiredEntitlements')), '{}'::text[]),
      coalesce(array(select jsonb_array_elements_text(v_recipe->'requiredTools')), '{}'::text[]),
      coalesce(array(select upper(jsonb_array_elements_text(v_recipe->'countryCodes'))), '{}'::text[]),
      true,coalesce(nullif(lower(v_recipe->>'failureRule'),''),'release_all'),
      coalesce(nullif(lower(v_recipe->>'qualityRule'),''),'fixed'),
      case when coalesce((v_recipe->>'regulated')::boolean,false) then 'regulated' else 'staged' end,
      coalesce(v_recipe->'metadata','{}'::jsonb)
    )
    on conflict (pack_id,recipe_key) do update set
      name=excluded.name,category=excluded.category,tier=excluded.tier,workshop_tier=excluded.workshop_tier,
      base_duration_seconds=excluded.base_duration_seconds,difficulty_profile=excluded.difficulty_profile,
      required_entitlements=excluded.required_entitlements,required_tools=excluded.required_tools,
      country_codes=excluded.country_codes,failure_rule=excluded.failure_rule,quality_rule=excluded.quality_rule,
      status=excluded.status,metadata=excluded.metadata
    returning id into v_recipe_id;

    delete from public.physical_economy_recipe_inputs where recipe_id = v_recipe_id;
    delete from public.physical_economy_recipe_outputs where recipe_id = v_recipe_id;

    for v_line in select value from jsonb_array_elements(v_recipe->'inputs')
    loop
      insert into public.physical_economy_recipe_inputs (
        recipe_id,line_key,item_key,base_quantity,scaling_class,role,substitution_group
      ) values (
        v_recipe_id,lower(v_line->>'lineKey'),lower(v_line->>'itemKey'),(v_line->>'baseQuantity')::integer,
        lower(v_line->>'scalingClass'),coalesce(nullif(lower(v_line->>'role'),''),'ingredient'),
        nullif(lower(v_line->>'substitutionGroup'),'')
      );
    end loop;

    for v_line in select value from jsonb_array_elements(v_recipe->'outputs')
    loop
      insert into public.physical_economy_recipe_outputs (
        recipe_id,line_key,item_key,quantity,output_kind
      ) values (
        v_recipe_id,lower(v_line->>'lineKey'),lower(v_line->>'itemKey'),(v_line->>'quantity')::integer,
        lower(v_line->>'outputKind')
      );
    end loop;

    insert into public.game_session_recipe_availability (
      game_session_id,recipe_id,enabled,unlocked_by_default,scarcity_band,country_codes
    ) values (
      p_game_session_id,v_recipe_id,false,
      (v_recipe->>'tier')::integer = 1 and not coalesce((v_recipe->>'regulated')::boolean,false),
      'available',
      coalesce(array(select upper(jsonb_array_elements_text(v_recipe->'countryCodes'))), '{}'::text[])
    )
    on conflict (game_session_id,recipe_id) do update set
      unlocked_by_default=excluded.unlocked_by_default,
      country_codes=excluded.country_codes,
      updated_at=statement_timestamp();

    v_recipe_count := v_recipe_count + 1;
  end loop;

  for v_line in select value from jsonb_array_elements(coalesce(p_pack->'substitutions','[]'::jsonb))
  loop
    insert into public.physical_economy_substitution_options (
      pack_id,group_key,item_key,ratio_numerator,ratio_denominator,quality_penalty_basis_points,
      permit_key,country_codes,difficulty_keys,enabled,metadata
    ) values (
      v_pack.id,lower(v_line->>'groupKey'),lower(v_line->>'itemKey'),
      coalesce((v_line->>'ratioNumerator')::integer,1),coalesce((v_line->>'ratioDenominator')::integer,1),
      coalesce((v_line->>'qualityPenaltyBasisPoints')::integer,0),nullif(v_line->>'permitKey',''),
      coalesce(array(select upper(jsonb_array_elements_text(v_line->'countryCodes'))), '{}'::text[]),
      coalesce(array(select lower(jsonb_array_elements_text(v_line->'difficultyKeys'))), '{}'::text[]),
      coalesce((v_line->>'enabled')::boolean,true),coalesce(v_line->'metadata','{}'::jsonb)
    )
    on conflict (pack_id,group_key,item_key) do update set
      ratio_numerator=excluded.ratio_numerator,ratio_denominator=excluded.ratio_denominator,
      quality_penalty_basis_points=excluded.quality_penalty_basis_points,permit_key=excluded.permit_key,
      country_codes=excluded.country_codes,difficulty_keys=excluded.difficulty_keys,
      enabled=excluded.enabled,metadata=excluded.metadata;
  end loop;

  for v_line in select value from jsonb_array_elements(coalesce(p_pack->'salvageRules','[]'::jsonb))
  loop
    insert into public.physical_economy_salvage_rules (
      pack_id,equipment_item_key,outputs,recovery_cap_basis_points,recraft_cooldown_seconds,enabled
    ) values (
      v_pack.id,lower(v_line->>'equipmentItemKey'),v_line->'outputs',
      (v_line->>'recoveryCapBasisPoints')::integer,
      coalesce((v_line->>'recraftCooldownSeconds')::integer,0),
      coalesce((v_line->>'enabled')::boolean,true)
    )
    on conflict (pack_id,equipment_item_key) do update set
      outputs=excluded.outputs,recovery_cap_basis_points=excluded.recovery_cap_basis_points,
      recraft_cooldown_seconds=excluded.recraft_cooldown_seconds,enabled=excluded.enabled;
  end loop;

  insert into public.game_session_physical_economy_packs (
    game_session_id,pack_id,status,imported_by_staff_user_id,settings
  ) values (
    p_game_session_id,v_pack.id,'staged',p_staff_user_id,
    jsonb_build_object('definitionAuthority','PR #163','durabilityEnabled',false,'repairEnabled',false)
  )
  on conflict (game_session_id,pack_id) do update set imported_at=statement_timestamp();

  insert into public.physical_economy_admin_events (
    game_session_id,staff_user_id,action,idempotency_key,target_key,outcome
  ) values (
    p_game_session_id,p_staff_user_id,'pack.import',p_idempotency_key,v_pack_key,
    jsonb_build_object(
      'packKey',v_pack_key,'contentVersion',v_content_version,'contentDigest',p_content_digest,
      'sourceCommit',v_source_commit,'itemCount',v_item_count,'recipeCount',v_recipe_count,
      'status','staged','durabilityEnabled',false,'repairEnabled',false,'replayed',false
    )
  ) returning * into v_event;

  insert into public.audit_log (
    game_session_id,actor_type,actor_id,action,target_type,target_id,metadata
  ) values (
    p_game_session_id,'staff_user',p_staff_user_id,'physical_economy.pack_imported',
    'physical_economy_content_pack',v_pack.id,v_event.outcome
  );

  return v_event.outcome;
end
$function$;

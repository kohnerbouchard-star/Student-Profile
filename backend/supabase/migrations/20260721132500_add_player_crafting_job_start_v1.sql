-- Atomic Player Crafting job creation and reservations.
-- Final controller-assigned Crafting migration identity.

create or replace function public.start_player_crafting_job_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_recipe_key text,
  p_quantity integer,
  p_substitutions jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_recipe public.physical_economy_recipe_definitions%rowtype;
  v_availability public.game_session_recipe_availability%rowtype;
  v_pack_id uuid;
  v_job public.crafting_jobs%rowtype;
  v_input public.physical_economy_recipe_inputs%rowtype;
  v_option public.physical_economy_substitution_options%rowtype;
  v_item_key text;
  v_store_item public.store_items%rowtype;
  v_holding public.inventory_holdings%rowtype;
  v_reservation_id uuid;
  v_required integer;
  v_ratio numeric := 1;
  v_penalty integer := 0;
  v_input_multiplier numeric := 1;
  v_duration_multiplier numeric := 1;
  v_difficulty text := 'moderate';
  v_country text;
  v_request_hash text;
  v_snapshot jsonb;
  v_quality_penalty integer := 0;
  v_quality_roll integer := 0;
  v_quality_score integer := 0;
  v_failure_basis_points integer := 0;
  v_failure_roll integer := 0;
  v_now timestamptz := statement_timestamp();
  v_output jsonb;
begin
  p_recipe_key := lower(btrim(coalesce(p_recipe_key,'')));
  p_substitutions := coalesce(p_substitutions,'{}'::jsonb);
  if p_game_session_id is null or p_player_id is null
    or p_recipe_key !~ '^recipe\.[a-z0-9][a-z0-9._-]{2,127}$'
    or p_quantity is null or p_quantity not between 1 and 25
    or jsonb_typeof(p_substitutions)<>'object'
    or coalesce(p_idempotency_key,'') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
  then raise exception 'CRAFTING_JOB_REQUEST_INVALID' using errcode='P0001'; end if;

  if not exists (
    select 1 from public.players p join public.game_sessions g on g.id=p.game_session_id
    where p.game_session_id=p_game_session_id and p.id=p_player_id and p.status='active'
      and g.status='active' and g.lifecycle_state='active'
  ) then raise exception 'CRAFTING_PLAYER_SCOPE_INACTIVE' using errcode='P0001'; end if;

  v_request_hash := md5(p_recipe_key||':'||p_quantity::text||':'||p_substitutions::text);

  select * into v_job from public.crafting_jobs
  where game_session_id=p_game_session_id and player_id=p_player_id
    and idempotency_key=p_idempotency_key for update;
  if found then
    if v_job.request_hash<>v_request_hash then raise exception 'CRAFTING_IDEMPOTENCY_CONFLICT' using errcode='P0001'; end if;
    return jsonb_build_object('outcome','replayed','jobKey',v_job.public_id,'status',v_job.status,
      'recipeKey',v_job.recipe_key,'quantity',v_job.quantity,'completesAt',v_job.completes_at,
      'committed',true,'refreshRequired',true);
  end if;

  select gp.pack_id into v_pack_id from public.game_session_physical_economy_packs gp
  where gp.game_session_id=p_game_session_id and gp.status='active';
  if v_pack_id is null then raise exception 'CRAFTING_PACK_INACTIVE' using errcode='P0001'; end if;

  select r.* into v_recipe
  from public.physical_economy_recipe_definitions r
  where r.pack_id=v_pack_id and r.recipe_key=p_recipe_key and r.status='active'
  for share;
  if not found then raise exception 'CRAFTING_RECIPE_UNAVAILABLE' using errcode='P0001'; end if;

  select a.* into v_availability
  from public.game_session_recipe_availability a
  where a.recipe_id=v_recipe.id and a.game_session_id=p_game_session_id
  for share;
  if not found or not v_availability.enabled or v_availability.scarcity_band='unavailable'
  then raise exception 'CRAFTING_RECIPE_UNAVAILABLE' using errcode='P0001'; end if;

  if not v_availability.unlocked_by_default and not exists (
    select 1 from public.player_recipe_unlocks u
    where u.game_session_id=p_game_session_id and u.player_id=p_player_id
      and u.recipe_id=v_recipe.id and u.revoked_at is null
  ) then raise exception 'CRAFTING_RECIPE_LOCKED' using errcode='P0001'; end if;

  if exists (
    select 1
    from public.physical_economy_recipe_outputs o
    join public.physical_economy_salvage_rules sr
      on sr.pack_id=v_pack_id and sr.equipment_item_key=o.item_key and sr.enabled
    join public.equipment_instances ei
      on ei.game_session_id=p_game_session_id and ei.player_id=p_player_id and ei.item_key=o.item_key
    join public.equipment_salvage_jobs sj
      on sj.equipment_instance_id=ei.id and sj.game_session_id=p_game_session_id
      and sj.player_id=p_player_id and sj.status='settled'
    where o.recipe_id=v_recipe.id
      and sj.settled_at + make_interval(secs=>sr.recraft_cooldown_seconds) > v_now
  ) then
    raise exception 'CRAFTING_RECRAFT_COOLDOWN_ACTIVE' using errcode='P0001';
  end if;

  select coalesce(nullif(lower(d.difficulty_preset),'standard'),'moderate')
  into v_difficulty from public.game_difficulty_policy_settings d where d.game_session_id=p_game_session_id;
  if not found then
    select coalesce(nullif(lower(gs.difficulty_preset),'standard'),'moderate')
    into v_difficulty from public.game_settings gs where gs.game_session_id=p_game_session_id;
  end if;
  v_difficulty:=coalesce(v_difficulty,'moderate');
  v_input_multiplier:=case v_difficulty when 'easy' then 0.9 when 'hard' then 1.15 when 'insane' then 1.3 else 1 end;
  v_duration_multiplier:=case v_difficulty when 'easy' then 0.8 when 'hard' then 1.25 when 'insane' then 1.5 else 1 end;

  select cp.country_code into v_country
  from public.player_country_assignments a join public.country_profiles cp on cp.id=a.country_profile_id
  where a.game_session_id=p_game_session_id and a.player_id=p_player_id and a.status='active'
  order by a.assigned_at desc limit 1;

  if cardinality(v_availability.country_codes)>0 and (v_country is null or not v_country=any(v_availability.country_codes))
  then raise exception 'CRAFTING_RECIPE_COUNTRY_UNAVAILABLE' using errcode='P0001'; end if;

  v_failure_basis_points:=case v_difficulty when 'hard' then 250 when 'insane' then 500 when 'moderate' then 100 else 0 end;
  v_failure_roll:=public.crafting_deterministic_basis_points_v1(
    p_game_session_id::text||':'||p_player_id::text||':'||p_idempotency_key||':failure'
  );
  v_quality_roll:=public.crafting_deterministic_basis_points_v1(
    p_game_session_id::text||':'||p_player_id::text||':'||p_idempotency_key||':quality'
  );

  v_snapshot:=jsonb_build_object(
    'packId',v_pack_id,'recipeKey',v_recipe.recipe_key,'recipeVersion',v_recipe.pack_id,
    'difficultyKey',v_difficulty,'countryCode',v_country,'quantity',p_quantity,
    'scarcityBand',v_availability.scarcity_band,'availabilityVersion',v_availability.version,
    'eventDurationMultiplier',v_availability.event_duration_multiplier,
    'routeDisruptionMultiplier',v_availability.route_disruption_multiplier,
    'substitutions',p_substitutions,
    'failureBasisPoints',v_failure_basis_points,'failureRoll',v_failure_roll,
    'qualityRoll',v_quality_roll,'durabilityEnabled',false,'repairEnabled',false
  );

  insert into public.crafting_jobs (
    game_session_id,player_id,recipe_id,recipe_key,quantity,status,idempotency_key,request_hash,
    difficulty_key,country_code,quality_band,failure_rule,recipe_snapshot,started_at,completes_at
  ) values (
    p_game_session_id,p_player_id,v_recipe.id,v_recipe.recipe_key,p_quantity,'in_progress',
    p_idempotency_key,v_request_hash,v_difficulty,v_country,'standard',v_recipe.failure_rule,v_snapshot,v_now,
    v_now + make_interval(secs=>ceil(v_recipe.base_duration_seconds*v_duration_multiplier*
      v_availability.event_duration_multiplier*v_availability.route_disruption_multiplier)::integer)
  ) returning * into v_job;

  for v_input in
    select * from public.physical_economy_recipe_inputs where recipe_id=v_recipe.id order by line_key
  loop
    v_item_key:=v_input.item_key;
    v_ratio:=1;
    v_penalty:=0;
    if v_input.substitution_group is not null and p_substitutions ? v_input.substitution_group then
      v_item_key:=lower(p_substitutions->>v_input.substitution_group);
      select * into v_option from public.physical_economy_substitution_options
      where pack_id=v_pack_id and group_key=v_input.substitution_group and item_key=v_item_key and enabled
        and (cardinality(country_codes)=0 or v_country=any(country_codes))
        and (cardinality(difficulty_keys)=0 or v_difficulty=any(difficulty_keys));
      if not found then raise exception 'CRAFTING_SUBSTITUTION_INVALID:%',v_input.substitution_group using errcode='P0001'; end if;
      v_ratio:=v_option.ratio_numerator::numeric/v_option.ratio_denominator;
      v_penalty:=v_option.quality_penalty_basis_points;
    end if;
    v_required:=ceil(v_input.base_quantity*p_quantity*
      case when v_input.scaling_class='elastic_common' then v_input_multiplier else 1 end*v_ratio)::integer;
    v_quality_penalty:=v_quality_penalty+v_penalty;

    select * into v_store_item from public.store_items
    where game_session_id=p_game_session_id and item_key=v_item_key and status='active' for share;
    if not found then raise exception 'CRAFTING_INPUT_ITEM_UNAVAILABLE:%',v_item_key using errcode='P0001'; end if;

    select * into v_holding from public.inventory_holdings
    where game_session_id=p_game_session_id and player_id=p_player_id and store_item_id=v_store_item.id
    for update;
    if not found or v_holding.quantity_owned-v_holding.quantity_reserved<v_required
    then raise exception 'CRAFTING_INPUT_QUANTITY_UNAVAILABLE:%:%',v_item_key,v_required using errcode='P0001'; end if;

    insert into public.inventory_reservations (
      game_session_id,player_id,inventory_holding_id,store_item_id,item_key,reason_type,source_id,quantity,status
    ) values (
      p_game_session_id,p_player_id,v_holding.id,v_store_item.id,v_store_item.item_key,
      'crafting_input',v_job.id,v_required,'active'
    ) returning id into v_reservation_id;

    insert into public.crafting_job_inputs (
      job_id,reservation_id,line_key,requested_item_key,resolved_item_key,base_quantity,required_quantity,
      substitution_group,substitution_ratio,quality_penalty_basis_points
    ) values (
      v_job.id,v_reservation_id,v_input.line_key,v_input.item_key,v_item_key,v_input.base_quantity,v_required,
      v_input.substitution_group,v_ratio,v_penalty
    );

    update public.inventory_holdings set quantity_reserved=quantity_reserved+v_required,updated_at=v_now
    where id=v_holding.id;

    insert into public.inventory_events (
      game_session_id,player_id,store_item_id,quantity_delta,event_type,source_domain,source_action,source_id,metadata
    ) values (
      p_game_session_id,p_player_id,v_store_item.id,-v_required,'RESERVED','crafting','job_started',v_job.id,
      jsonb_build_object('jobKey',v_job.public_id,'recipeKey',v_job.recipe_key,'itemKey',v_item_key,'quantity',v_required)
    );
  end loop;

  insert into public.crafting_job_outputs (job_id,line_key,item_key,quantity,output_kind)
  select v_job.id,o.line_key,o.item_key,o.quantity*p_quantity,o.output_kind
  from public.physical_economy_recipe_outputs o where o.recipe_id=v_recipe.id order by o.line_key;

  v_quality_score:=greatest(0,v_quality_roll-v_quality_penalty-
    case v_difficulty when 'insane' then 1500 when 'hard' then 750 else 0 end);
  update public.crafting_jobs set
    quality_band=case
      when v_recipe.quality_rule='difficulty_snapshot' and v_quality_score>=9500 then 'exceptional'
      when v_recipe.quality_rule='difficulty_snapshot' and v_quality_score>=7000 then 'refined'
      else 'standard'
    end,
    recipe_snapshot=recipe_snapshot||jsonb_build_object(
      'qualityPenaltyBasisPoints',v_quality_penalty,'qualityScore',v_quality_score
    )
  where id=v_job.id returning * into v_job;

  insert into public.crafting_job_transitions (
    game_session_id,job_id,from_status,to_status,actor_type,actor_id,action,idempotency_key,outcome
  ) values (
    p_game_session_id,v_job.id,null,'in_progress','player',p_player_id,'crafting.job_started',p_idempotency_key,
    jsonb_build_object('recipeKey',v_job.recipe_key,'quantity',v_job.quantity,'completesAt',v_job.completes_at)
  );

  insert into public.audit_log (
    game_session_id,actor_type,actor_id,action,target_type,target_id,metadata
  ) values (
    p_game_session_id,'player',p_player_id,'crafting.job_started','crafting_job',v_job.id,
    jsonb_build_object('jobKey',v_job.public_id,'recipeKey',v_job.recipe_key,'quantity',v_job.quantity)
  );

  return jsonb_build_object('outcome','created','jobKey',v_job.public_id,'status',v_job.status,
    'recipeKey',v_job.recipe_key,'quantity',v_job.quantity,'qualityBand',v_job.quality_band,
    'startedAt',v_job.started_at,'completesAt',v_job.completes_at,
    'committed',true,'refreshRequired',true);
end
$function$;

-- Phase 15 canonical routine convergence: current campaign, market and stock-read contracts.
-- Definitions are copied from their latest immutable repository migrations.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- Source: 20260816090100_seed_meridian_competing_models_v1.sql
create or replace function public.activate_meridian_competing_models_from_full_game_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if new.story_status='active' then
    perform public.initialize_meridian_competing_models_v1(new.game_session_id);
  end if;
  return new;
end;
$function$;

-- Source: 20260816090300_seed_meridian_fortune_during_war_v1.sql
create or replace function public.activate_meridian_fortune_during_war_from_full_game_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if new.story_status = 'active' then
    perform public.initialize_meridian_fortune_during_war_v1(new.game_session_id);
  end if;
  return new;
end;
$function$;

-- Source: 20260816090200_seed_meridian_outbreak_of_war_v1.sql
create or replace function public.activate_meridian_outbreak_of_war_from_full_game_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if new.story_status = 'active' then
    perform public.initialize_meridian_outbreak_of_war_v1(new.game_session_id);
  end if;

  return new;
end;
$function$;

-- Source: 20260816090400_seed_meridian_question_of_belonging_v1.sql
create or replace function public.activate_meridian_question_of_belonging_from_full_game_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if new.story_status='active' then
    perform public.initialize_meridian_question_of_belonging_v1(new.game_session_id);
  end if;
  return new;
end;
$function$;

-- Source: 20260816090500_seed_meridian_reckoning_v1.sql
create or replace function public.activate_meridian_reckoning_from_full_game_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if new.story_status='active' then
    perform public.initialize_meridian_reckoning_v1(new.game_session_id);
  end if;
  return new;
end;
$function$;

-- Source: 20260818121000_activate_campaign_runtime_provisioning_v3.sql
create or replace function public.apply_campaign_store_scarcity_v1(p_game_session_id uuid,p_idempotency_key text,p_definition_id text,p_item_keys text[],p_scarcity_band text,p_event_multiplier numeric,p_expires_at timestamptz,p_applied_at timestamptz default clock_timestamp()) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,extensions,pg_temp as $function$
declare v_request jsonb; v_digest text; v_receipt public.campaign_effect_application_receipts%rowtype; v_affected integer;
begin
 if p_game_session_id is null or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' or p_definition_id !~ '^[a-z0-9][a-z0-9._:-]{0,127}$' or coalesce(array_length(p_item_keys,1),0) not between 1 and 100 or p_scarcity_band not in ('abundant','available','constrained','scarce','unavailable') or p_event_multiplier not between 0.5 and 4 or p_applied_at is null then raise exception 'CAMPAIGN_SCARCITY_INVALID' using errcode='P0001'; end if;
 v_request:=jsonb_build_object('definitionId',p_definition_id,'itemKeys',to_jsonb(p_item_keys),'scarcityBand',p_scarcity_band,'eventMultiplier',p_event_multiplier,'expiresAt',p_expires_at); v_digest:=encode(extensions.digest(v_request::text,'sha256'),'hex');
 select * into v_receipt from public.campaign_effect_application_receipts where game_session_id=p_game_session_id and idempotency_key=p_idempotency_key for update;
 if found then if v_receipt.request_digest<>v_digest or v_receipt.effect_kind<>'set_store_scarcity' then raise exception 'CAMPAIGN_SCARCITY_IDEMPOTENCY_CONFLICT' using errcode='P0001'; end if; return jsonb_build_object('outcome','replayed','affectedItems',0); end if;
 if not exists(select 1 from public.game_sessions where id=p_game_session_id and status='active' and lifecycle_state='active' and provisioning_status='ready') then raise exception 'CAMPAIGN_SCARCITY_GAME_INVALID' using errcode='P0001'; end if;
 update public.game_session_item_supply as supply_row set scarcity_band=p_scarcity_band,event_multiplier=p_event_multiplier,source_event_key=p_definition_id,effective_at=p_applied_at,expires_at=p_expires_at,version=supply_row.version+1 where supply_row.game_session_id=p_game_session_id and supply_row.country_code='*' and supply_row.item_key=any(p_item_keys); get diagnostics v_affected=row_count;
 if v_affected<>cardinality(p_item_keys) then raise exception 'CAMPAIGN_SCARCITY_ITEM_MISSING' using errcode='P0001'; end if;
 insert into public.campaign_effect_application_receipts(game_session_id,idempotency_key,effect_kind,request_digest,applied_at) values(p_game_session_id,p_idempotency_key,'set_store_scarcity',v_digest,p_applied_at);
 return jsonb_build_object('outcome','applied','affectedItems',v_affected);
end;$function$;

-- Source: 20260813220712_stock_market_simulation_checkpoint_v3_and_fallback.sql
create or replace function public.capture_stock_market_checkpoint_v2(
  p_game_session_id uuid,
  p_checkpoint_kind text default 'manual'::text
)
returns table(
  checkpoint_id uuid, game_session_id uuid, tick_index integer, engine_version text,
  simulation_seed text, checkpoint_kind text, input_hash text, state_hash text,
  checkpoint_hash text, stock_count integer, economic_snapshot_count integer,
  event_count integer, regime_count integer, missing_tick_state_count integer,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_runtime private.stock_market_runtime_state%rowtype;
  v_input jsonb; v_state jsonb;
  v_input_hash text; v_state_hash text; v_checkpoint_hash text;
  v_stock_count integer; v_economic_count integer; v_event_count integer;
  v_regime_count integer; v_missing_tick_count integer;
  v_existing private.stock_market_simulation_checkpoints%rowtype;
begin
  if p_checkpoint_kind not in ('bootstrap','interval','event','wake','sleep','manual') then
    raise exception 'invalid checkpoint kind: %', p_checkpoint_kind using errcode = '22023';
  end if;

  select * into v_runtime from private.stock_market_runtime_state r where r.game_session_id = p_game_session_id;
  if not found then raise exception 'stock runtime state not found for game %', p_game_session_id using errcode = 'P0002'; end if;

  select c.* into v_existing
  from private.stock_market_simulation_checkpoints c
  where c.game_session_id = p_game_session_id
    and c.tick_index = v_runtime.current_tick_index
    and c.checkpoint_schema_version = 1;

  if found then
    return query select v_existing.id, v_existing.game_session_id, v_existing.tick_index,
      v_existing.engine_version, v_existing.simulation_seed, v_existing.checkpoint_kind,
      v_existing.input_hash, v_existing.state_hash, v_existing.checkpoint_hash,
      v_existing.stock_count, v_existing.economic_snapshot_count, v_existing.event_count,
      v_existing.regime_count, v_existing.missing_tick_state_count, v_existing.created_at;
    return;
  end if;

  with latest_economic as (
    select distinct on (x.country_profile_id) x.*
    from public.country_economic_snapshots x
    where x.game_session_id = p_game_session_id
      and x.effective_at <= coalesce(v_runtime.last_tick_at, now())
    order by x.country_profile_id, x.effective_at desc, x.snapshot_sequence desc, x.id
  ), active_events as (
    select e.* from public.stock_market_events e
    where e.game_session_id = p_game_session_id and e.is_active
      and e.created_tick <= v_runtime.current_tick_index
      and (e.expires_tick is null or e.expires_tick >= v_runtime.current_tick_index)
    order by e.created_tick, e.id
  ), active_regimes as (
    select r.* from public.stock_market_regimes r
    where r.game_session_id = p_game_session_id and r.is_active
      and r.starts_tick <= v_runtime.current_tick_index
      and (r.ends_tick is null or r.ends_tick >= v_runtime.current_tick_index)
    order by r.starts_tick, r.id
  )
  select jsonb_build_object(
    'schema_version',1,'game_session_id',p_game_session_id,'tick_index',v_runtime.current_tick_index,
    'engine_version',v_runtime.engine_version,'simulation_seed',v_runtime.simulation_seed,
    'simulation_time',v_runtime.last_tick_at,
    'economic_snapshots',coalesce((select jsonb_agg(to_jsonb(le) order by le.country_profile_id,le.snapshot_sequence) from latest_economic le),'[]'::jsonb),
    'market_events',coalesce((select jsonb_agg(to_jsonb(ae) order by ae.created_tick,ae.id) from active_events ae),'[]'::jsonb),
    'market_regimes',coalesce((select jsonb_agg(to_jsonb(ar) order by ar.starts_tick,ar.id) from active_regimes ar),'[]'::jsonb)
  ) into v_input;

  select jsonb_build_object('schema_version',1,'game_session_id',p_game_session_id,'tick_index',v_runtime.current_tick_index,
    'stocks',coalesce(jsonb_agg(jsonb_build_object(
      'game_stock_id',s.id,'stock_asset_id',s.template_id,'ticker',s.ticker,'current_price',s.current_price,
      'previous_close',s.previous_close,'open_price',s.open_price,'day_high',s.day_high,'day_low',s.day_low,
      'beta',s.beta,'liquidity',s.liquidity,'current_volatility',s.current_volatility,
      'long_run_volatility',s.long_run_volatility,'fair_value_anchor',s.fair_value_anchor,
      'recent_returns',s.recent_returns,'fundamentals',s.fundamentals,'country_exposure',s.country_exposure,
      'sector_exposure',s.sector_exposure,'commodity_exposure',s.commodity_exposure,
      'last_tick',case when t.id is null then null else jsonb_build_object(
        'tick_id',t.id,'tick_index',t.tick_index,'stock_asset_id',t.stock_asset_id,'ticker',t.ticker,
        'price',t.price,'previous_price',t.previous_price,'log_return',t.log_return,'change_pct',t.change_pct,
        'volume',t.volume,'current_volatility',t.current_volatility,'long_run_volatility',t.long_run_volatility,
        'explanation',t.explanation,'created_at',t.created_at) end
    ) order by s.id),'[]'::jsonb)), count(*)::integer,count(*) filter (where t.id is null)::integer
  into v_state,v_stock_count,v_missing_tick_count
  from public.game_session_stock_assets s
  left join public.stock_price_ticks t on t.game_session_id=s.game_session_id and t.stock_asset_id=s.id and t.tick_index=v_runtime.current_tick_index
  where s.game_session_id=p_game_session_id and s.is_active;

  v_economic_count:=jsonb_array_length(v_input->'economic_snapshots');
  v_event_count:=jsonb_array_length(v_input->'market_events');
  v_regime_count:=jsonb_array_length(v_input->'market_regimes');
  v_input_hash:=encode(extensions.digest(v_input::text,'sha256'),'hex');
  v_state_hash:=encode(extensions.digest(v_state::text,'sha256'),'hex');
  v_checkpoint_hash:=encode(extensions.digest(concat_ws('|','stock-checkpoint-v2',p_game_session_id::text,v_runtime.current_tick_index::text,v_runtime.engine_version,v_runtime.simulation_seed,v_input_hash,v_state_hash),'sha256'),'hex');

  insert into private.stock_market_simulation_checkpoints(
    game_session_id,tick_index,engine_version,simulation_seed,checkpoint_kind,checkpoint_schema_version,
    simulation_time,input_manifest,input_hash,state_manifest,state_hash,checkpoint_hash,stock_count,
    economic_snapshot_count,event_count,regime_count,missing_tick_state_count)
  values(p_game_session_id,v_runtime.current_tick_index,v_runtime.engine_version,v_runtime.simulation_seed,
    p_checkpoint_kind,1,v_runtime.last_tick_at,v_input,v_input_hash,v_state,v_state_hash,v_checkpoint_hash,
    v_stock_count,v_economic_count,v_event_count,v_regime_count,v_missing_tick_count)
  returning id, private.stock_market_simulation_checkpoints.created_at into checkpoint_id,created_at;

  game_session_id:=p_game_session_id; tick_index:=v_runtime.current_tick_index; engine_version:=v_runtime.engine_version;
  simulation_seed:=v_runtime.simulation_seed; checkpoint_kind:=p_checkpoint_kind; input_hash:=v_input_hash;
  state_hash:=v_state_hash; checkpoint_hash:=v_checkpoint_hash; stock_count:=v_stock_count;
  economic_snapshot_count:=v_economic_count; event_count:=v_event_count; regime_count:=v_regime_count;
  missing_tick_state_count:=v_missing_tick_count; return next;
end; $$;

-- Source: 20260818121500_add_campaign_runtime_scheduler_v1.sql
create or replace function public.configure_campaign_runtime_scheduler_v1(
  p_function_url text
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, private, vault, cron, net, extensions
as $function$
declare
  v_scheduler_name constant text := 'econovaria-campaign-runtime-scheduler-v1';
  v_function_url text := lower(btrim(coalesce(p_function_url, '')));
  v_token text;
  v_job_id bigint;
  v_command text;
begin
  if v_function_url !~ '^https://[a-z0-9]{20}[.]supabase[.]co/functions/v1/campaign-orchestrator$' then
    raise exception using errcode = '22023', message = 'invalid campaign runtime scheduler function URL';
  end if;

  select decrypted_secret
  into v_token
  from vault.decrypted_secrets
  where name = v_scheduler_name
  order by created_at desc
  limit 1;

  if v_token is null then
    v_token := encode(extensions.gen_random_bytes(32), 'hex');
    perform vault.create_secret(
      v_token,
      v_scheduler_name,
      'Internal token for the one-minute Econovaria campaign runtime scheduler.'
    );
  end if;

  insert into private.runtime_scheduler_tokens (scheduler_name, token_sha256)
  values (
    v_scheduler_name,
    encode(extensions.digest(v_token, 'sha256'), 'hex')
  )
  on conflict (scheduler_name) do update
    set token_sha256 = excluded.token_sha256,
        rotated_at = case
          when private.runtime_scheduler_tokens.token_sha256 <> excluded.token_sha256
            then clock_timestamp()
          else private.runtime_scheduler_tokens.rotated_at
        end;

  for v_job_id in
    select jobid
    from cron.job
    where jobname = v_scheduler_name
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  v_command := format(
    $command$
      select net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'content-type', 'application/json',
          'x-econovaria-scheduler-token', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'econovaria-campaign-runtime-scheduler-v1'
            order by created_at desc
            limit 1
          )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 20000
      );
    $command$,
    v_function_url
  );

  return cron.schedule(v_scheduler_name, '* * * * *', v_command);
end;
$function$;

-- Source: 20260816090700_harden_meridian_arrival_clock_gate_v1.sql
create or replace function public.enable_meridian_campaign_continuation_after_arrival_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_activation_id uuid;
  v_has_prior_arrival boolean := false;
  v_anchor_at timestamptz := coalesce(new.created_at, now());
begin
  if new.effect_type <> 'character_message'
    or coalesce(new.payload -> 'payload' ->> 'phase', '') <> 'arrival'
  then
    return new;
  end if;

  if exists (
    select 1
    from public.game_session_story_flags as flag_row
    where flag_row.game_session_id = new.game_session_id
      and flag_row.flag_key = 'meridian_arrival_clock_mode_v1'
      and flag_row.value = to_jsonb('grandfathered'::text)
  ) then
    return new;
  end if;

  select activation.id
  into v_activation_id
  from public.game_session_storylines as activation
  join public.storylines as storyline
    on storyline.id = activation.storyline_id
  where activation.game_session_id = new.game_session_id
    and activation.status in ('active', 'paused')
    and lower(storyline.key) = lower('econovaria_demo_act_1')
  limit 1
  for update of activation;

  if v_activation_id is null then
    return new;
  end if;

  select exists (
    select 1
    from public.player_story_impacts as prior
    where prior.game_session_id = new.game_session_id
      and prior.id <> new.id
      and prior.effect_type = 'character_message'
      and coalesce(prior.payload -> 'payload' ->> 'phase', '') = 'arrival'
  )
  into v_has_prior_arrival;

  if v_has_prior_arrival then
    return new;
  end if;

  update public.game_session_storylines
  set story_started_at = v_anchor_at,
      accumulated_pause_seconds = 0,
      paused_at = case when status = 'paused' then v_anchor_at else null end
  where id = v_activation_id;

  insert into public.game_session_story_flags (
    game_session_id,
    flag_key,
    value,
    source_story_event_id,
    created_at
  ) values (
    new.game_session_id,
    'meridian_arrival_clock_mode_v1',
    to_jsonb('arrival_anchored'::text),
    new.storyline_event_id,
    v_anchor_at
  )
  on conflict (game_session_id, flag_key) do update
  set value = excluded.value,
      source_story_event_id = excluded.source_story_event_id;

  -- Ensure every reusable definition exists. Stage 4-6 legacy initializers set
  -- their shared rows active, so all continuation keys are forced dormant again
  -- in this same transaction before the game-scoped overrides are written.
  perform public.initialize_meridian_customs_security_intrusion_v1(new.game_session_id);
  perform public.initialize_meridian_security_center_attack_v1(new.game_session_id);
  perform public.initialize_meridian_emergency_response_v1(new.game_session_id);
  perform public.initialize_meridian_competing_models_v1(new.game_session_id);
  perform public.initialize_meridian_outbreak_of_war_v1(new.game_session_id);
  perform public.initialize_meridian_fortune_during_war_v1(new.game_session_id);
  perform public.initialize_meridian_question_of_belonging_v1(new.game_session_id);
  perform public.initialize_meridian_reckoning_v1(new.game_session_id);
  perform public.initialize_meridian_local_friend_relationships_v1(new.game_session_id);

  update public.storyline_events as event_row
  set is_active = false
  from public.storylines as storyline
  where storyline.id = event_row.storyline_id
    and lower(storyline.key) = lower('econovaria_demo_act_1')
    and event_row.event_key in (
      'meridian_competing_models',
      'meridian_competing_models_recommendation_followup',
      'meridian_customs_security_intrusion',
      'meridian_security_center_attack',
      'meridian_emergency_response',
      'meridian_outbreak_of_war',
      'meridian_fortune_during_war',
      'meridian_question_of_belonging',
      'meridian_reckoning',
      'meridian_local_friend_introductions',
      'meridian_local_friend_fracture_reactions',
      'meridian_local_friend_wartime_reactions',
      'meridian_local_friend_belonging_reactions'
    );

  insert into public.game_session_story_event_overrides (
    game_session_id,
    storyline_event_id,
    enabled,
    source_player_story_impact_id,
    enabled_at,
    updated_at
  )
  select
    new.game_session_id,
    event_row.id,
    true,
    new.id,
    v_anchor_at,
    v_anchor_at
  from public.storyline_events as event_row
  join public.storylines as storyline
    on storyline.id = event_row.storyline_id
  where lower(storyline.key) = lower('econovaria_demo_act_1')
    and not event_row.is_active
    and event_row.event_key in (
      'meridian_competing_models',
      'meridian_competing_models_recommendation_followup',
      'meridian_customs_security_intrusion',
      'meridian_security_center_attack',
      'meridian_emergency_response',
      'meridian_outbreak_of_war',
      'meridian_fortune_during_war',
      'meridian_question_of_belonging',
      'meridian_reckoning',
      'meridian_local_friend_introductions',
      'meridian_local_friend_fracture_reactions',
      'meridian_local_friend_wartime_reactions',
      'meridian_local_friend_belonging_reactions'
    )
  on conflict (game_session_id, storyline_event_id) do update
  set enabled = true,
      source_player_story_impact_id = excluded.source_player_story_impact_id,
      enabled_at = least(
        public.game_session_story_event_overrides.enabled_at,
        excluded.enabled_at
      ),
      updated_at = excluded.updated_at;

  return new;
end;
$function$;

-- Source: 20260816090700_harden_meridian_arrival_clock_gate_v1.sql
create or replace function public.enable_relationship_followups_after_arrival_contact_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if new.effect_type = 'character_message'
    and coalesce(new.payload -> 'payload' ->> 'phase', '') = 'arrival'
  then
    if exists (
      select 1
      from public.game_session_story_flags as flag_row
      where flag_row.game_session_id = new.game_session_id
        and flag_row.flag_key = 'meridian_arrival_clock_mode_v1'
        and flag_row.value = to_jsonb('grandfathered'::text)
    ) then
      return new;
    end if;

    insert into public.game_session_story_event_overrides (
      game_session_id,
      storyline_event_id,
      enabled,
      source_player_story_impact_id,
      enabled_at,
      updated_at
    )
    select
      new.game_session_id,
      event_row.id,
      true,
      new.id,
      coalesce(new.created_at, now()),
      coalesce(new.created_at, now())
    from public.storyline_events as event_row
    join public.storylines as storyline_row
      on storyline_row.id = event_row.storyline_id
    where lower(storyline_row.key) = lower('econovaria_demo_act_1')
      and not event_row.is_active
      and (
        event_row.event_key like 'relationship_%_sponsor_followup'
        or event_row.event_key like 'meridian_fracture_%_sponsor_reaction'
      )
    on conflict (game_session_id, storyline_event_id) do update
    set enabled = true,
        source_player_story_impact_id = excluded.source_player_story_impact_id,
        enabled_at = least(
          public.game_session_story_event_overrides.enabled_at,
          excluded.enabled_at
        ),
        updated_at = excluded.updated_at;
  end if;

  return new;
end;
$function$;

-- Source: 20260818121000_activate_campaign_runtime_provisioning_v3.sql
create or replace function public.ensure_ready_game_campaign_v1() returns trigger language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $function$
begin perform public.initialize_default_campaign_for_game_v1(new.id,coalesce(new.started_at,clock_timestamp())); return new; end;$function$;

-- Source: 20260818121700_fix_game_provisioning_preflight_source_selection_v2.sql
create or replace function public.game_provisioning_preflight_v1(
  p_pack_id text default 'econovaria.beta-seed-pack.v1'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  v_release public.seed_content_releases%rowtype;
  v_stock_templates integer;
  v_game_stock_assets integer;
  v_contract_templates integer;
  v_game_contracts integer;
  v_store_items integer;
  v_world_locations integer;
  v_world_routes integer;
  v_world_countries integer;
  v_arrival_class_grants integer;
begin
  if not public.seed_content_request_is_privileged_v1() then
    raise exception 'GAME_PROVISIONING_SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;

  if p_pack_id is null or length(btrim(p_pack_id)) not between 1 and 128 then
    raise exception 'GAME_PROVISIONING_PACK_INVALID' using errcode = 'P0001';
  end if;

  select release_row.* into v_release
  from public.seed_content_releases as release_row
  where release_row.pack_id = btrim(p_pack_id)
    and release_row.status = 'applied_active'
    and release_row.target_environment in ('local', 'test', 'staging')
    and (
      select count(*)
      from public.seed_content_release_members as member_row
      where member_row.release_id = release_row.id
        and member_row.object_type = 'stock_template'
    ) = 240
    and (
      select count(*)
      from public.seed_content_release_members as member_row
      where member_row.release_id = release_row.id
        and member_row.object_type = 'game_stock_asset'
    ) = 240
    and (
      select count(*)
      from public.seed_content_release_members as member_row
      where member_row.release_id = release_row.id
        and member_row.object_type = 'contract_template'
    ) = 30
    and (
      select count(*)
      from public.seed_content_release_members as member_row
      where member_row.release_id = release_row.id
        and member_row.object_type = 'game_contract'
    ) = 30
    and (
      select count(*)
      from public.seed_content_release_members as member_row
      where member_row.release_id = release_row.id
        and member_row.object_type = 'store_item'
    ) = 50
    and exists (
      select 1
      from public.world_runtime_instances as runtime_row
      where runtime_row.game_session_id = release_row.game_session_id
        and runtime_row.revision = 0
    )
    and (
      select count(*) from public.world_location_states
      where game_session_id = release_row.game_session_id
    ) = 50
    and (
      select count(*) from public.world_route_states
      where game_session_id = release_row.game_session_id
    ) = 13
    and (
      select count(*) from public.world_country_runtime
      where game_session_id = release_row.game_session_id
    ) = 10
    and (
      select count(*) from public.arrival_class_grant_runtime
      where game_session_id = release_row.game_session_id
    ) = 8
  order by release_row.applied_at desc nulls last, release_row.created_at desc
  limit 1;

  if not found then
    raise exception 'GAME_PROVISIONING_CANONICAL_SOURCE_INCOMPLETE' using errcode = 'P0001';
  end if;

  select count(*)::integer into v_stock_templates
  from public.seed_content_release_members
  where release_id = v_release.id and object_type = 'stock_template';

  select count(*)::integer into v_game_stock_assets
  from public.seed_content_release_members
  where release_id = v_release.id and object_type = 'game_stock_asset';

  select count(*)::integer into v_contract_templates
  from public.seed_content_release_members
  where release_id = v_release.id and object_type = 'contract_template';

  select count(*)::integer into v_game_contracts
  from public.seed_content_release_members
  where release_id = v_release.id and object_type = 'game_contract';

  select count(*)::integer into v_store_items
  from public.seed_content_release_members
  where release_id = v_release.id and object_type = 'store_item';

  select count(*)::integer into v_world_locations
  from public.world_location_states
  where game_session_id = v_release.game_session_id;

  select count(*)::integer into v_world_routes
  from public.world_route_states
  where game_session_id = v_release.game_session_id;

  select count(*)::integer into v_world_countries
  from public.world_country_runtime
  where game_session_id = v_release.game_session_id;

  select count(*)::integer into v_arrival_class_grants
  from public.arrival_class_grant_runtime
  where game_session_id = v_release.game_session_id;

  return jsonb_build_object(
    'ready', true,
    'packId', v_release.pack_id,
    'packVersion', v_release.version,
    'packSha256', v_release.pack_sha256,
    'sourceGameSessionId', v_release.game_session_id,
    'counts', jsonb_build_object(
      'stockTemplates', v_stock_templates,
      'gameStockAssets', v_game_stock_assets,
      'contractTemplates', v_contract_templates,
      'gameContracts', v_game_contracts,
      'storeItems', v_store_items,
      'worldLocations', v_world_locations,
      'worldRoutes', v_world_routes,
      'worldCountries', v_world_countries,
      'arrivalClassGrants', v_arrival_class_grants
    )
  );
end;
$function$;

-- Source: 20260814084305_stock_market_read_cursor_history_v3.sql
create or replace function public.get_current_stock_market_tick_index_v2(p_game_session_id uuid)
returns integer
language sql
stable
security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
  select greatest(
    coalesce((select r.current_tick_index from private.stock_market_runtime_state r where r.game_session_id = p_game_session_id), 0),
    coalesce((select s.last_archived_tick_index from private.stock_tick_archive_state s where s.game_session_id = p_game_session_id), 0),
    coalesce((select t.tick_index from public.stock_price_ticks t where t.game_session_id = p_game_session_id order by t.tick_index desc limit 1), 0)
  )::integer;
$function$;

-- Source: 20260818121000_activate_campaign_runtime_provisioning_v3.sql
create or replace function public.initialize_default_campaign_for_game_v1(p_game_session_id uuid,p_scheduled_at timestamptz default clock_timestamp()) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $function$
declare v_game public.game_sessions%rowtype; v_program public.campaign_program_definitions%rowtype; v_initialized record;
begin
 if p_game_session_id is null or p_scheduled_at is null then raise exception 'CAMPAIGN_DEFAULT_INITIALIZATION_INVALID' using errcode='P0001'; end if;
 select * into v_game from public.game_sessions where id=p_game_session_id;
 if not found or v_game.status<>'active' or v_game.provisioning_status<>'ready' or nullif(btrim(coalesce(v_game.provisioning_pack_id,'')),'') is null or nullif(btrim(coalesce(v_game.provisioning_pack_version,'')),'') is null then raise exception 'CAMPAIGN_DEFAULT_GAME_NOT_READY' using errcode='P0001'; end if;
 select * into v_program from public.campaign_program_definitions where pack_id=v_game.provisioning_pack_id and pack_version=v_game.provisioning_pack_version and status='active' order by created_at desc limit 1;
 if not found then raise exception 'CAMPAIGN_DEFAULT_PROGRAM_MISSING' using errcode='P0001'; end if;
 select * into v_initialized from public.initialize_campaign_instance_v1(p_game_session_id,v_program.pack_id,v_program.pack_version,v_program.definition_id,v_program.definition_digest,p_scheduled_at,clock_timestamp());
 return jsonb_build_object('outcome',v_initialized.initialization_outcome,'campaignId',v_initialized.campaign_id,'status',v_initialized.status,'phase',v_initialized.current_phase,'revision',v_initialized.revision,'definitionId',v_program.definition_id,'definitionDigest',v_program.definition_digest);
end;$function$;

-- Source: 20260814083008_stock_tick_archive_stopped_game_drain_v2.sql
create or replace function public.list_stock_tick_archive_candidates_v2()
returns table(game_session_id uuid)
language sql
stable
security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
  select r.game_session_id
  from private.stock_market_runtime_state r
  join public.game_sessions gs on gs.id = r.game_session_id
  left join private.stock_tick_archive_state s on s.game_session_id = r.game_session_id
  where gs.data_purge_protected is not true
    and r.current_tick_index > coalesce(s.last_archived_tick_index, 0)
  order by r.game_session_id;
$function$;

-- Source: 20260818121000_activate_campaign_runtime_provisioning_v3.sql
create or replace function public.publish_campaign_market_event_v1(p_game_session_id uuid,p_idempotency_key text,p_headline text,p_explanation text,p_category text,p_scope text,p_target_key text,p_sentiment text,p_magnitude_basis_points integer,p_duration_ticks integer,p_published_at timestamptz default clock_timestamp()) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $function$
declare v_existing public.stock_market_events%rowtype; v_tick integer; v_magnitude numeric; v_inserted public.stock_market_events%rowtype;
begin
 if p_game_session_id is null or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' or length(btrim(coalesce(p_headline,''))) not between 1 and 300 or length(btrim(coalesce(p_explanation,''))) not between 1 and 4000 or p_category not in ('geopolitical','war_conflict','natural_disaster','supply_chain','resource_shock','policy','macro','sector','country','company','technology','infrastructure','energy','agriculture','finance') or p_scope not in ('global','country','sector','ticker') or p_sentiment not in ('positive','negative','neutral','mixed') or p_magnitude_basis_points not between -10000 and 10000 or p_duration_ticks not between 1 and 52 or p_published_at is null then raise exception 'CAMPAIGN_MARKET_EVENT_INVALID' using errcode='P0001'; end if;
 if p_scope='global' and nullif(btrim(coalesce(p_target_key,'')),'') is not null then raise exception 'CAMPAIGN_MARKET_EVENT_TARGET_INVALID' using errcode='P0001'; end if;
 if p_scope<>'global' and nullif(btrim(coalesce(p_target_key,'')),'') is null then raise exception 'CAMPAIGN_MARKET_EVENT_TARGET_INVALID' using errcode='P0001'; end if;
 select * into v_existing from public.stock_market_events where game_session_id=p_game_session_id and shock_id=p_idempotency_key;
 if found then return jsonb_build_object('outcome','replayed','shockId',v_existing.shock_id,'createdTick',v_existing.created_tick); end if;
 if not exists(select 1 from public.game_sessions where id=p_game_session_id and status='active' and lifecycle_state='active' and provisioning_status='ready') then raise exception 'CAMPAIGN_MARKET_EVENT_GAME_INVALID' using errcode='P0001'; end if;
 v_tick:=public.get_current_stock_market_tick_index_v2(p_game_session_id)+1; v_magnitude:=p_magnitude_basis_points::numeric/10000;
 insert into public.stock_market_events(game_session_id,shock_id,scope,target_key,magnitude,decay,confidence,volatility_impact,volume_impact,headline,explanation,created_tick,expires_tick,is_active,category,sentiment,source,visibility,metadata) values(p_game_session_id,p_idempotency_key,p_scope,nullif(btrim(coalesce(p_target_key,'')),''),v_magnitude,case when p_duration_ticks<=3 then 0.35 when p_duration_ticks<=6 then 0.22 else 0.14 end,0.90,least(abs(v_magnitude)*0.50,0.08),least(abs(v_magnitude)*4.00,0.75),btrim(p_headline),btrim(p_explanation),v_tick,v_tick+p_duration_ticks,true,p_category,p_sentiment,'system','public',jsonb_build_object('sourceType','campaign','campaignEffectKey',p_idempotency_key,'publishedAt',p_published_at)) returning * into v_inserted;
 return jsonb_build_object('outcome','applied','shockId',v_inserted.shock_id,'createdTick',v_inserted.created_tick,'magnitude',v_inserted.magnitude);
end;$function$;

-- Source: 20260818121000_activate_campaign_runtime_provisioning_v3.sql
create or replace function public.publish_campaign_notification_v1(p_game_session_id uuid,p_idempotency_key text,p_title text,p_summary text,p_priority text,p_display_mode text,p_notification_type text,p_published_at timestamptz default clock_timestamp()) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $function$
declare v_notification public.notifications%rowtype; v_inserted integer:=0; v_existing integer:=0;
begin
 if p_game_session_id is null or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' or length(btrim(coalesce(p_title,''))) not between 1 and 300 or length(btrim(coalesce(p_summary,''))) not between 1 and 4000 or length(btrim(coalesce(p_priority,''))) not between 1 and 32 or length(btrim(coalesce(p_display_mode,''))) not between 1 and 64 or length(btrim(coalesce(p_notification_type,''))) not between 1 and 64 or p_published_at is null then raise exception 'CAMPAIGN_NOTIFICATION_INVALID' using errcode='P0001'; end if;
 select * into v_notification from public.notifications where game_session_id=p_game_session_id and source_type='campaign' and source_id=p_idempotency_key and notification_type=p_notification_type;
 if not found then insert into public.notifications(game_session_id,source_type,source_id,notification_type,title,summary,priority,display_mode,payload,published_at) values(p_game_session_id,'campaign',p_idempotency_key,p_notification_type,btrim(p_title),btrim(p_summary),btrim(p_priority),btrim(p_display_mode),jsonb_build_object('campaignEffectKey',p_idempotency_key),p_published_at) returning * into v_notification; end if;
 with inserted as (insert into public.notification_deliveries(notification_id,game_session_id,player_id,delivered_at) select v_notification.id,p_game_session_id,player_row.id,p_published_at from public.players as player_row where player_row.game_session_id=p_game_session_id and player_row.status='active' on conflict(notification_id,player_id) do nothing returning id) select count(*)::integer into v_inserted from inserted;
 select count(*)::integer into v_existing from public.notification_deliveries where notification_id=v_notification.id and game_session_id=p_game_session_id;
 return jsonb_build_object('outcome',case when v_inserted=0 then 'replayed' else 'applied' end,'notificationId',v_notification.public_notification_id,'insertedDeliveries',v_inserted,'totalDeliveries',v_existing);
end;$function$;

-- Source: 20260814084305_stock_market_read_cursor_history_v3.sql
create or replace function public.read_latest_stock_market_ticks_for_game(
  p_game_session_id uuid,
  p_ticker text default null
)
returns table(
  game_session_id uuid,
  stock_asset_id uuid,
  tick_index integer,
  ticker text,
  price numeric,
  previous_price numeric,
  change_pct numeric,
  volume bigint,
  created_at timestamptz
)
language sql
stable
security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
  with resolved_tick as (
    select coalesce(
      (
        select r.current_tick_index
        from private.stock_market_runtime_state r
        where r.game_session_id = p_game_session_id
          and exists (
            select 1 from public.stock_price_ticks current_tick
            where current_tick.game_session_id = p_game_session_id
              and current_tick.tick_index = r.current_tick_index
          )
      ),
      (
        select fallback.tick_index
        from public.stock_price_ticks fallback
        where fallback.game_session_id = p_game_session_id
        order by fallback.tick_index desc
        limit 1
      )
    )::integer as tick_index
  )
  select
    tick.game_session_id,
    tick.stock_asset_id,
    tick.tick_index,
    tick.ticker,
    tick.price,
    tick.previous_price,
    tick.change_pct,
    tick.volume,
    tick.created_at
  from resolved_tick resolved
  join public.stock_price_ticks tick
    on tick.game_session_id = p_game_session_id
   and tick.tick_index = resolved.tick_index
  join public.game_session_stock_assets asset
    on asset.game_session_id = tick.game_session_id
   and asset.id = tick.stock_asset_id
   and asset.is_active = true
  where p_ticker is null or lower(asset.ticker) = lower(btrim(p_ticker))
  order by tick.stock_asset_id;
$function$;

-- Source: 20260814084305_stock_market_read_cursor_history_v3.sql
create or replace function public.read_stock_market_history_v2(
  p_game_session_id uuid,
  p_stock_asset_id uuid default null,
  p_ticker text default null,
  p_limit integer default 200
)
returns table(
  game_session_id uuid,
  stock_asset_id uuid,
  tick_index integer,
  ticker text,
  price numeric,
  previous_price numeric,
  change_pct numeric,
  volume bigint,
  created_at timestamptz,
  source_kind text,
  timeframe text,
  open numeric,
  high numeric,
  low numeric,
  close numeric,
  first_tick_index integer,
  last_tick_index integer
)
language plpgsql
stable
security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
declare
  v_limit integer;
  v_asset_id uuid;
  v_ticker text;
begin
  if p_game_session_id is null then raise exception 'STOCK_HISTORY_GAME_SESSION_REQUIRED'; end if;
  if p_stock_asset_id is null and nullif(btrim(coalesce(p_ticker, '')), '') is null then
    raise exception 'STOCK_HISTORY_ASSET_REQUIRED';
  end if;

  v_limit := greatest(1, least(coalesce(p_limit, 200), 1000));

  select asset.id, asset.ticker into v_asset_id, v_ticker
  from public.game_session_stock_assets asset
  where asset.game_session_id = p_game_session_id
    and asset.is_active = true
    and (p_stock_asset_id is null or asset.id = p_stock_asset_id)
    and (p_ticker is null or lower(asset.ticker) = lower(btrim(p_ticker)))
  order by asset.id
  limit 1;

  if v_asset_id is null then return; end if;

  return query
  with hot as materialized (
    select
      tick.game_session_id,
      tick.stock_asset_id,
      tick.tick_index,
      tick.ticker,
      tick.price,
      tick.previous_price,
      tick.change_pct,
      tick.volume,
      tick.created_at,
      'tick'::text as source_kind,
      'tick'::text as timeframe,
      tick.previous_price as open,
      greatest(tick.previous_price, tick.price) as high,
      least(tick.previous_price, tick.price) as low,
      tick.price as close,
      tick.tick_index as first_tick_index,
      tick.tick_index as last_tick_index
    from public.stock_price_ticks tick
    where tick.game_session_id = p_game_session_id
      and tick.stock_asset_id = v_asset_id
    order by tick.tick_index desc, tick.created_at desc
    limit v_limit
  ),
  hot_meta as (
    select count(*)::integer as point_count, min(h.tick_index)::integer as min_tick_index from hot h
  ),
  cold as (
    select
      candle.game_session_id,
      candle.stock_asset_id,
      candle.last_tick_index::integer as tick_index,
      v_ticker::text as ticker,
      candle.close::numeric as price,
      candle.open::numeric as previous_price,
      case when candle.open is null or candle.open = 0 then 0::numeric
        else round(((candle.close - candle.open) / candle.open) * 100, 6) end as change_pct,
      candle.volume::bigint as volume,
      candle.bucket_start as created_at,
      'candle'::text as source_kind,
      candle.timeframe::text as timeframe,
      candle.open::numeric as open,
      candle.high::numeric as high,
      candle.low::numeric as low,
      candle.close::numeric as close,
      candle.first_tick_index::integer as first_tick_index,
      candle.last_tick_index::integer as last_tick_index
    from public.stock_price_candles candle
    cross join hot_meta meta
    where candle.game_session_id = p_game_session_id
      and candle.stock_asset_id = v_asset_id
      and candle.timeframe = '5m'
      and (meta.min_tick_index is null or candle.last_tick_index < meta.min_tick_index)
    order by candle.last_tick_index desc, candle.bucket_start desc
    limit greatest(v_limit - (select point_count from hot_meta), 0)
  ),
  combined as (
    select * from hot
    union all
    select * from cold
  )
  select
    combined.game_session_id,
    combined.stock_asset_id,
    combined.tick_index,
    combined.ticker,
    combined.price,
    combined.previous_price,
    combined.change_pct,
    combined.volume,
    combined.created_at,
    combined.source_kind,
    combined.timeframe,
    combined.open,
    combined.high,
    combined.low,
    combined.close,
    combined.first_tick_index,
    combined.last_tick_index
  from combined
  order by combined.tick_index desc, combined.created_at desc
  limit v_limit;
end;
$function$;

-- Source: 20260818121000_activate_campaign_runtime_provisioning_v3.sql
create or replace function public.record_campaign_outcome_evidence_v1(p_game_session_id uuid,p_recovery_readiness_basis_points integer,p_evidence_digest text,p_observed_at timestamptz default clock_timestamp()) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $function$
declare v_revision bigint;
begin
 if p_game_session_id is null or p_recovery_readiness_basis_points not between 0 and 10000 or p_evidence_digest !~ '^sha256:[0-9a-f]{64}$' or p_observed_at is null then raise exception 'CAMPAIGN_OUTCOME_EVIDENCE_INVALID' using errcode='P0001'; end if;
 if not exists(select 1 from public.game_sessions where id=p_game_session_id and status='active' and provisioning_status='ready') then raise exception 'CAMPAIGN_OUTCOME_EVIDENCE_GAME_INVALID' using errcode='P0001'; end if;
 select coalesce(max(evidence_revision),0)+1 into v_revision from public.campaign_outcome_evidence_snapshots where game_session_id=p_game_session_id;
 insert into public.campaign_outcome_evidence_snapshots(game_session_id,evidence_revision,recovery_readiness_basis_points,evidence_digest,observed_at) values(p_game_session_id,v_revision,p_recovery_readiness_basis_points,p_evidence_digest,p_observed_at);
 return jsonb_build_object('gameSessionId',p_game_session_id,'evidenceRevision',v_revision,'recoveryReadinessBasisPoints',p_recovery_readiness_basis_points,'evidenceDigest',p_evidence_digest,'observedAt',p_observed_at);
end;$function$;

-- Sources: 20260721141000, 20260721142000, 20260721143000 and 20260728033000
create or replace function public.settle_marketplace_purchase_projection_legacy_v1(
  p_game_session_id uuid,
  p_buyer_player_id uuid,
  p_reservation_key text
)
returns table (
  outcome text, order_key text, reservation_key text, listing_key text,
  item_key text, quantity integer, buyer_total numeric, seller_proceeds numeric,
  fee_amount numeric, tax_amount numeric, currency_code text, status text,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_now timestamptz := now();
  v_reservation_key text := lower(btrim(coalesce(p_reservation_key, '')));
  v_reservation public.marketplace_purchase_reservations%rowtype;
  v_listing public.marketplace_listings%rowtype;
  v_order public.marketplace_orders%rowtype;
  v_buyer_balance public.account_balances%rowtype;
  v_seller_holding public.inventory_holdings%rowtype;
  v_buyer_holding public.inventory_holdings%rowtype;
  v_buyer_ledger record;
  v_seller_ledger record;
begin
  if p_game_session_id is null or p_buyer_player_id is null
    or v_reservation_key !~ '^mpr_[0-9a-f]{32}$'
  then raise exception 'MARKETPLACE_SETTLEMENT_INVALID' using errcode = 'P0001'; end if;

  perform 1 from public.players p join public.game_sessions g on g.id = p.game_session_id
  where p.game_session_id = p_game_session_id and p.id = p_buyer_player_id
    and p.status = 'active' and g.status = 'active';
  if not found then raise exception 'MARKETPLACE_PLAYER_SCOPE_INACTIVE' using errcode = 'P0001'; end if;

  select * into v_reservation from public.marketplace_purchase_reservations
  where game_session_id = p_game_session_id and buyer_player_id = p_buyer_player_id
    and public_id = v_reservation_key for update;
  if not found then raise exception 'MARKETPLACE_RESERVATION_NOT_FOUND' using errcode = 'P0001'; end if;

  select * into v_order from public.marketplace_orders
  where game_session_id = p_game_session_id and reservation_id = v_reservation.id for update;
  if found and v_order.status in ('completed', 'disputed', 'refunded') then
    return query select 'replayed', v_order.public_id, v_reservation.public_id,
      (select public_id from public.marketplace_listings where id = v_order.listing_id),
      v_order.item_key, v_order.quantity, v_order.buyer_total, v_order.seller_proceeds,
      v_order.fee_amount, v_order.tax_amount, v_order.currency_code,
      v_order.status, v_order.completed_at;
    return;
  end if;

  select * into v_listing from public.marketplace_listings
  where id = v_reservation.listing_id for update;

  if v_reservation.status in ('released', 'expired') then
    return query select 'released', null::text, v_reservation.public_id,
      v_listing.public_id, v_listing.item_key, v_reservation.quantity,
      v_reservation.buyer_total, v_reservation.seller_proceeds,
      v_reservation.fee_amount, v_reservation.tax_amount,
      v_reservation.currency_code, v_reservation.status, null::timestamptz;
    return;
  end if;

  if v_reservation.expires_at <= v_now then
    if v_listing.status = 'active' and v_listing.expires_at > v_now then
      update public.marketplace_listings
      set quantity_available = quantity_available + v_reservation.quantity,
          status = 'active', version = version + 1,
          updated_at = statement_timestamp()
      where id = v_listing.id returning * into v_listing;
    else
      update public.inventory_holdings
      set quantity_reserved = quantity_reserved - v_reservation.quantity,
          updated_at = statement_timestamp()
      where game_session_id = p_game_session_id
        and player_id = v_reservation.seller_player_id
        and id = v_listing.inventory_holding_id
        and quantity_reserved >= v_reservation.quantity;
      if not found then raise exception 'MARKETPLACE_RESERVATION_DRIFT' using errcode = 'P0001'; end if;
    end if;
    update public.marketplace_purchase_reservations
    set status = 'expired', version = version + 1,
        released_at = v_now, release_reason = 'reservation_expired'
    where id = v_reservation.id returning * into v_reservation;
    insert into public.marketplace_audit_events (
      game_session_id, listing_id, reservation_id, actor_type, action, metadata
    ) values (
      p_game_session_id, v_listing.id, v_reservation.id, 'system',
      'purchase_reservation_expired', jsonb_build_object('quantity', v_reservation.quantity)
    );
    return query select 'released', null::text, v_reservation.public_id,
      v_listing.public_id, v_listing.item_key, v_reservation.quantity,
      v_reservation.buyer_total, v_reservation.seller_proceeds,
      v_reservation.fee_amount, v_reservation.tax_amount,
      v_reservation.currency_code, v_reservation.status, null::timestamptz;
    return;
  end if;

  select * into v_seller_holding from public.inventory_holdings
  where game_session_id = p_game_session_id
    and player_id = v_reservation.seller_player_id
    and id = v_listing.inventory_holding_id
    and store_item_id = v_listing.store_item_id for update;
  if not found or v_seller_holding.quantity_owned < v_reservation.quantity
    or v_seller_holding.quantity_reserved < v_reservation.quantity
  then
    update public.marketplace_listings
    set status = 'moderation_hold', quantity_available = 0,
        version = version + 1, moderation_reason = 'Inventory reservation lost during settlement',
        updated_at = statement_timestamp()
    where id = v_listing.id returning * into v_listing;
    update public.marketplace_purchase_reservations
    set status = 'released', version = version + 1,
        released_at = v_now, release_reason = 'reservation_lost'
    where id = v_reservation.id returning * into v_reservation;
    insert into public.marketplace_audit_events (
      game_session_id, listing_id, reservation_id, actor_type, action, metadata
    ) values (
      p_game_session_id, v_listing.id, v_reservation.id, 'system',
      'purchase_reservation_lost', jsonb_build_object('quantity', v_reservation.quantity)
    );
    return query select 'reservation_lost', null::text, v_reservation.public_id,
      v_listing.public_id, v_listing.item_key, v_reservation.quantity,
      v_reservation.buyer_total, v_reservation.seller_proceeds,
      v_reservation.fee_amount, v_reservation.tax_amount,
      v_reservation.currency_code, v_reservation.status, null::timestamptz;
    return;
  end if;

  select * into v_buyer_balance from public.account_balances
  where game_session_id = p_game_session_id and player_id = p_buyer_player_id
    and account_type = 'cash' and currency_code = v_reservation.currency_code
  for update;
  if not found or v_buyer_balance.balance < v_reservation.buyer_total then
    if v_listing.status = 'active' and v_listing.expires_at > v_now then
      update public.marketplace_listings
      set quantity_available = quantity_available + v_reservation.quantity,
          status = 'active', version = version + 1,
          updated_at = statement_timestamp()
      where id = v_listing.id returning * into v_listing;
    else
      update public.inventory_holdings
      set quantity_reserved = quantity_reserved - v_reservation.quantity,
          updated_at = statement_timestamp()
      where id = v_seller_holding.id and quantity_reserved >= v_reservation.quantity;
    end if;
    update public.marketplace_purchase_reservations
    set status = 'released', version = version + 1,
        released_at = v_now, release_reason = 'insufficient_funds'
    where id = v_reservation.id returning * into v_reservation;
    insert into public.marketplace_audit_events (
      game_session_id, listing_id, reservation_id, actor_type, actor_id, action, metadata
    ) values (
      p_game_session_id, v_listing.id, v_reservation.id, 'player', p_buyer_player_id,
      'purchase_reservation_released', jsonb_build_object('reason', 'insufficient_funds')
    );
    return query select 'insufficient_funds', null::text, v_reservation.public_id,
      v_listing.public_id, v_listing.item_key, v_reservation.quantity,
      v_reservation.buyer_total, v_reservation.seller_proceeds,
      v_reservation.fee_amount, v_reservation.tax_amount,
      v_reservation.currency_code, v_reservation.status, null::timestamptz;
    return;
  end if;

  update public.marketplace_purchase_reservations
  set status = 'settling', version = version + 1, settling_at = v_now
  where id = v_reservation.id returning * into v_reservation;

  insert into public.marketplace_orders (
    game_session_id, reservation_id, listing_id, buyer_player_id, seller_player_id,
    store_item_id, item_key, quantity, unit_price, subtotal, fee_amount, tax_amount,
    buyer_total, seller_proceeds, currency_code
  ) values (
    p_game_session_id, v_reservation.id, v_listing.id, p_buyer_player_id,
    v_reservation.seller_player_id, v_listing.store_item_id, v_listing.item_key,
    v_reservation.quantity, v_reservation.unit_price, v_reservation.subtotal,
    v_reservation.fee_amount, v_reservation.tax_amount, v_reservation.buyer_total,
    v_reservation.seller_proceeds, v_reservation.currency_code
  ) returning * into v_order;

  select * into v_buyer_ledger from public.record_player_ledger_entry(
    p_game_session_id, p_buyer_player_id, 'cash', -v_reservation.buyer_total,
    v_reservation.currency_code, 'debit', 'marketplace', 'marketplace_purchase',
    v_order.id, 'player', p_buyer_player_id,
    jsonb_build_object('listingKey', v_listing.public_id, 'orderKey', v_order.public_id,
      'reservationKey', v_reservation.public_id)
  );
  select * into v_seller_ledger from public.record_player_ledger_entry(
    p_game_session_id, v_reservation.seller_player_id, 'cash', v_reservation.seller_proceeds,
    v_reservation.currency_code, 'credit', 'marketplace', 'marketplace_sale',
    v_order.id, 'player', p_buyer_player_id,
    jsonb_build_object('listingKey', v_listing.public_id, 'orderKey', v_order.public_id,
      'reservationKey', v_reservation.public_id)
  );

  insert into public.marketplace_treasury_balances (
    game_session_id, currency_code, fee_balance, tax_balance
  ) values (
    p_game_session_id, v_reservation.currency_code,
    v_reservation.fee_amount, v_reservation.tax_amount
  ) on conflict (game_session_id, currency_code) do update set
    fee_balance = public.marketplace_treasury_balances.fee_balance + excluded.fee_balance,
    tax_balance = public.marketplace_treasury_balances.tax_balance + excluded.tax_balance,
    updated_at = statement_timestamp();

  insert into public.marketplace_financial_postings (
    game_session_id, order_id, posting_group, posting_type, player_id, amount, currency_code
  ) values
    (p_game_session_id, v_order.id, 'settlement', 'buyer_debit', p_buyer_player_id,
      -v_reservation.buyer_total, v_reservation.currency_code),
    (p_game_session_id, v_order.id, 'settlement', 'seller_credit', v_reservation.seller_player_id,
      v_reservation.seller_proceeds, v_reservation.currency_code);

  insert into public.marketplace_financial_postings (
    game_session_id, order_id, posting_group, posting_type, player_id, amount, currency_code
  )
  select
    p_game_session_id,
    v_order.id,
    'settlement',
    optional_posting.posting_type,
    null,
    optional_posting.posting_amount,
    v_reservation.currency_code
  from (
    values
      ('fee_credit'::text, v_reservation.fee_amount),
      ('tax_credit'::text, v_reservation.tax_amount)
  ) as optional_posting(posting_type, posting_amount)
  where optional_posting.posting_amount > 0;

  if (
    select round(sum(amount), 4) from public.marketplace_financial_postings
    where order_id = v_order.id and posting_group = 'settlement'
  ) <> 0 then
    raise exception 'MARKETPLACE_POSTING_IMBALANCE' using errcode = 'P0001';
  end if;

  update public.inventory_holdings
  set quantity_owned = quantity_owned - v_reservation.quantity,
      quantity_reserved = quantity_reserved - v_reservation.quantity,
      updated_at = statement_timestamp()
  where id = v_seller_holding.id;

  insert into public.inventory_holdings (
    game_session_id, player_id, store_item_id, quantity_owned, quantity_reserved
  ) values (
    p_game_session_id, p_buyer_player_id, v_listing.store_item_id,
    v_reservation.quantity, 0
  ) on conflict on constraint inventory_holdings_scope_unique do update
    set quantity_owned = public.inventory_holdings.quantity_owned + excluded.quantity_owned,
        updated_at = statement_timestamp()
  returning * into v_buyer_holding;

  insert into public.inventory_events (
    game_session_id, player_id, store_item_id, quantity_delta, event_type,
    source_domain, source_action, source_id, metadata
  ) values
    (p_game_session_id, v_reservation.seller_player_id, v_listing.store_item_id,
      -v_reservation.quantity, 'MARKETPLACE_SOLD', 'marketplace', 'marketplace_sale',
      v_order.id, jsonb_build_object('listingKey', v_listing.public_id,
        'orderKey', v_order.public_id, 'reservationKey', v_reservation.public_id)),
    (p_game_session_id, p_buyer_player_id, v_listing.store_item_id,
      v_reservation.quantity, 'MARKETPLACE_PURCHASED', 'marketplace', 'marketplace_purchase',
      v_order.id, jsonb_build_object('listingKey', v_listing.public_id,
        'orderKey', v_order.public_id, 'reservationKey', v_reservation.public_id));

  update public.marketplace_orders
  set status = 'completed', version = version + 1,
      buyer_ledger_entry_id = v_buyer_ledger.ledger_entry_id,
      seller_ledger_entry_id = v_seller_ledger.ledger_entry_id,
      completed_at = v_now, updated_at = statement_timestamp()
  where id = v_order.id returning * into v_order;
  update public.marketplace_purchase_reservations
  set status = 'settled', version = version + 1, settled_at = v_now,
      updated_at = statement_timestamp()
  where id = v_reservation.id returning * into v_reservation;

  insert into public.marketplace_audit_events (
    game_session_id, listing_id, reservation_id, order_id,
    actor_type, actor_id, action, metadata
  ) values (
    p_game_session_id, v_listing.id, v_reservation.id, v_order.id,
    'player', p_buyer_player_id, 'order_settled',
    jsonb_build_object('quantity', v_order.quantity, 'buyerTotal', v_order.buyer_total,
      'sellerProceeds', v_order.seller_proceeds, 'feeAmount', v_order.fee_amount,
      'taxAmount', v_order.tax_amount)
  );

  return query select 'applied', v_order.public_id, v_reservation.public_id,
    v_listing.public_id, v_order.item_key, v_order.quantity, v_order.buyer_total,
    v_order.seller_proceeds, v_order.fee_amount, v_order.tax_amount,
    v_order.currency_code, v_order.status, v_order.completed_at;
end;
$$;

commit;

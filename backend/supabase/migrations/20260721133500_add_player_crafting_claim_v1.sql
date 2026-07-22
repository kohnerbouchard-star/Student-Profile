-- Exactly-once Player Crafting claim and deterministic output.
-- Final controller-assigned Crafting migration identity.

create or replace function public.claim_player_crafting_job_v1(
  p_game_session_id uuid,p_player_id uuid,p_job_public_id text,p_idempotency_key text
)
returns jsonb
language plpgsql security definer
set search_path=public,pg_temp
as $function$
declare
  v_job public.crafting_jobs%rowtype;
  v_res record;
  v_output record;
  v_store_item public.store_items%rowtype;
  v_holding public.inventory_holdings%rowtype;
  v_instance_id text;
  v_instances jsonb:='[]'::jsonb;
  v_now timestamptz:=statement_timestamp();
begin
  if coalesce(p_job_public_id,'') !~ '^cft_[0-9a-f]{32}$'
    or coalesce(p_idempotency_key,'') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
  then raise exception 'CRAFTING_CLAIM_INVALID' using errcode='P0001'; end if;
  select * into v_job from public.crafting_jobs
  where game_session_id=p_game_session_id and player_id=p_player_id and public_id=p_job_public_id for update;
  if not found then raise exception 'CRAFTING_JOB_NOT_FOUND' using errcode='P0001'; end if;
  if v_job.status='claimed' then
    return jsonb_build_object('outcome','replayed','jobKey',v_job.public_id,'status','claimed',
      'claimedAt',v_job.claimed_at,'equipment',v_instances,'committed',true,'refreshRequired',true);
  end if;
  if v_job.status='failed' then
    return jsonb_build_object('outcome','replayed','jobKey',v_job.public_id,'status','failed',
      'failureCode',v_job.failure_code,'committed',true,'refreshRequired',true);
  end if;

  perform public.assert_player_crafting_mutation_allowed_v1(p_game_session_id,p_player_id);

  if v_job.status='cancelled' then raise exception 'CRAFTING_JOB_NOT_CLAIMABLE' using errcode='P0001'; end if;
  if v_now<v_job.completes_at then raise exception 'CRAFTING_JOB_NOT_READY' using errcode='P0001'; end if;

  if coalesce((v_job.recipe_snapshot->>'failureRoll')::integer,10000) <
      coalesce((v_job.recipe_snapshot->>'failureBasisPoints')::integer,0) then
    for v_res in
      select r.* from public.inventory_reservations r
      where r.game_session_id=p_game_session_id and r.player_id=p_player_id
        and r.reason_type='crafting_input' and r.source_id=v_job.id and r.status='active'
      order by r.inventory_holding_id for update
    loop
      select * into v_holding from public.inventory_holdings where id=v_res.inventory_holding_id for update;
      if not found or v_holding.quantity_reserved<v_res.quantity or v_holding.quantity_owned<v_res.quantity
      then raise exception 'CRAFTING_RESERVATION_PROJECTION_INVALID' using errcode='P0001'; end if;
      if v_job.failure_rule='consume_approved' then
        update public.inventory_holdings set quantity_owned=quantity_owned-v_res.quantity,
          quantity_reserved=quantity_reserved-v_res.quantity,updated_at=v_now where id=v_holding.id;
        update public.inventory_reservations set status='consumed',consumed_at=v_now where id=v_res.id;
        update public.crafting_job_inputs set consumed_quantity=v_res.quantity where reservation_id=v_res.id;
      else
        update public.inventory_holdings set quantity_reserved=quantity_reserved-v_res.quantity,
          updated_at=v_now where id=v_holding.id;
        update public.inventory_reservations set status='released',released_at=v_now where id=v_res.id;
        update public.crafting_job_inputs set released_quantity=v_res.quantity where reservation_id=v_res.id;
      end if;
    end loop;
    update public.crafting_jobs set status='failed',failed_at=v_now,completed_at=v_now,
      failure_code='DETERMINISTIC_QUALITY_FAILURE',updated_at=v_now where id=v_job.id returning * into v_job;
    insert into public.crafting_job_transitions (
      game_session_id,job_id,from_status,to_status,actor_type,actor_id,action,idempotency_key,outcome
    ) values (
      p_game_session_id,v_job.id,'in_progress','failed','system',null,'crafting.job_failed',p_idempotency_key,
      jsonb_build_object('failureCode',v_job.failure_code,'failureRule',v_job.failure_rule)
    );
    insert into public.audit_log (
      game_session_id,actor_type,actor_id,action,target_type,target_id,metadata
    ) values (
      p_game_session_id,'system',null,'crafting.job_failed','crafting_job',v_job.id,
      jsonb_build_object('jobKey',v_job.public_id,'failureCode',v_job.failure_code,'failureRule',v_job.failure_rule)
    );
    return jsonb_build_object('outcome','failed','jobKey',v_job.public_id,'status','failed',
      'failureCode',v_job.failure_code,'failureRule',v_job.failure_rule,
      'committed',true,'refreshRequired',true);
  end if;

  for v_res in
    select r.* from public.inventory_reservations r
    where r.game_session_id=p_game_session_id and r.player_id=p_player_id
      and r.reason_type='crafting_input' and r.source_id=v_job.id and r.status='active'
    order by r.inventory_holding_id for update
  loop
    select * into v_holding from public.inventory_holdings where id=v_res.inventory_holding_id for update;
    if not found or v_holding.quantity_reserved<v_res.quantity or v_holding.quantity_owned<v_res.quantity
    then raise exception 'CRAFTING_RESERVATION_PROJECTION_INVALID' using errcode='P0001'; end if;
    update public.inventory_holdings set
      quantity_owned=quantity_owned-v_res.quantity,
      quantity_reserved=quantity_reserved-v_res.quantity,
      updated_at=v_now where id=v_holding.id;
    update public.inventory_reservations set status='consumed',consumed_at=v_now where id=v_res.id;
    update public.crafting_job_inputs set consumed_quantity=v_res.quantity where reservation_id=v_res.id;
    insert into public.inventory_events (
      game_session_id,player_id,store_item_id,quantity_delta,event_type,source_domain,source_action,source_id,metadata
    ) values (
      p_game_session_id,p_player_id,v_res.store_item_id,-v_res.quantity,'USED','crafting','job_claimed',v_job.id,
      jsonb_build_object('jobKey',v_job.public_id,'itemKey',v_res.item_key,'quantity',v_res.quantity)
    );
  end loop;

  for v_output in select * from public.crafting_job_outputs where job_id=v_job.id order by line_key for update
  loop
    if v_output.granted_at is not null then continue; end if;
    select * into v_store_item from public.store_items
    where game_session_id=p_game_session_id and item_key=v_output.item_key and status='active' for share;
    if not found then raise exception 'CRAFTING_OUTPUT_ITEM_UNAVAILABLE:%',v_output.item_key using errcode='P0001'; end if;
    insert into public.inventory_holdings (
      game_session_id,player_id,store_item_id,quantity_owned,quantity_reserved
    ) values (p_game_session_id,p_player_id,v_store_item.id,v_output.quantity,0)
    on conflict (game_session_id,player_id,store_item_id) do update set
      quantity_owned=public.inventory_holdings.quantity_owned+excluded.quantity_owned,
      updated_at=v_now;

    insert into public.inventory_events (
      game_session_id,player_id,store_item_id,quantity_delta,event_type,source_domain,source_action,source_id,metadata
    ) values (
      p_game_session_id,p_player_id,v_store_item.id,v_output.quantity,'ADJUSTED','crafting','output_granted',v_job.id,
      jsonb_build_object('jobKey',v_job.public_id,'itemKey',v_output.item_key,'quantity',v_output.quantity)
    );

    if v_output.output_kind='equipment' then
      for i in 1..v_output.quantity loop
        insert into public.equipment_instances (
          game_session_id,player_id,store_item_id,item_key,status,bonuses,source_job_id
        ) values (
          p_game_session_id,p_player_id,v_store_item.id,v_store_item.item_key,'active',
          coalesce((select d.metadata->'bonuses' from public.physical_economy_item_definitions d
                    join public.game_session_physical_economy_packs gp on gp.pack_id=d.pack_id
                    where gp.game_session_id=p_game_session_id and gp.status='active' and d.item_key=v_store_item.item_key),'{}'::jsonb),
          v_job.id
        ) returning public_id into v_instance_id;
        v_instances:=v_instances||jsonb_build_array(v_instance_id);
      end loop;
    end if;
    update public.crafting_job_outputs set store_item_id=v_store_item.id,
      granted_quantity=v_output.quantity,granted_at=v_now where id=v_output.id;
  end loop;

  update public.crafting_jobs set status='claimed',completed_at=coalesce(completed_at,v_now),
    claimed_at=v_now,output_granted_at=v_now,updated_at=v_now where id=v_job.id returning * into v_job;
  insert into public.crafting_job_transitions (
    game_session_id,job_id,from_status,to_status,actor_type,actor_id,action,idempotency_key,outcome
  ) values (
    p_game_session_id,v_job.id,'in_progress','claimed','player',p_player_id,'crafting.job_claimed',
    p_idempotency_key,jsonb_build_object('outputGranted',true,'equipment',v_instances)
  );
  insert into public.audit_log (
    game_session_id,actor_type,actor_id,action,target_type,target_id,metadata
  ) values (
    p_game_session_id,'player',p_player_id,'crafting.job_claimed','crafting_job',v_job.id,
    jsonb_build_object('jobKey',v_job.public_id,'recipeKey',v_job.recipe_key,'quantity',v_job.quantity)
  );
  return jsonb_build_object('outcome','claimed','jobKey',v_job.public_id,'status','claimed',
    'claimedAt',v_job.claimed_at,'qualityBand',v_job.quality_band,'equipment',v_instances,
    'committed',true,'refreshRequired',true);
end
$function$;

-- Player cancellation, exactly-once claims, and equipment slots.
-- Final controller-assigned Crafting migration identity.

create or replace function public.cancel_player_crafting_job_v1(
  p_game_session_id uuid,p_player_id uuid,p_job_public_id text,p_idempotency_key text
)
returns jsonb
language plpgsql security definer
set search_path=public,pg_temp
as $function$
declare
  v_job public.crafting_jobs%rowtype;
  v_res record;
  v_now timestamptz:=statement_timestamp();
begin
  if coalesce(p_job_public_id,'') !~ '^cft_[0-9a-f]{32}$'
    or coalesce(p_idempotency_key,'') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
  then raise exception 'CRAFTING_CANCEL_INVALID' using errcode='P0001'; end if;
  select * into v_job from public.crafting_jobs
  where game_session_id=p_game_session_id and player_id=p_player_id and public_id=p_job_public_id for update;
  if not found then raise exception 'CRAFTING_JOB_NOT_FOUND' using errcode='P0001'; end if;
  if v_job.status='cancelled' then
    return jsonb_build_object('outcome','replayed','jobKey',v_job.public_id,'status','cancelled',
      'committed',true,'refreshRequired',true);
  end if;

  perform public.assert_player_crafting_mutation_allowed_v1(p_game_session_id,p_player_id);

  if v_job.status<>'in_progress' then raise exception 'CRAFTING_JOB_NOT_CANCELLABLE' using errcode='P0001'; end if;

  for v_res in
    select r.* from public.inventory_reservations r
    where r.game_session_id=p_game_session_id and r.player_id=p_player_id
      and r.reason_type='crafting_input' and r.source_id=v_job.id and r.status='active'
    order by r.inventory_holding_id for update
  loop
    update public.inventory_holdings
    set quantity_reserved=quantity_reserved-v_res.quantity,updated_at=v_now
    where id=v_res.inventory_holding_id and quantity_reserved>=v_res.quantity;
    if not found then raise exception 'CRAFTING_RESERVATION_PROJECTION_INVALID' using errcode='P0001'; end if;
    update public.inventory_reservations set status='released',released_at=v_now where id=v_res.id;
    update public.crafting_job_inputs set released_quantity=v_res.quantity where reservation_id=v_res.id;
    insert into public.inventory_events (
      game_session_id,player_id,store_item_id,quantity_delta,event_type,source_domain,source_action,source_id,metadata
    ) values (
      p_game_session_id,p_player_id,v_res.store_item_id,v_res.quantity,'RELEASED','crafting','job_cancelled',v_job.id,
      jsonb_build_object('jobKey',v_job.public_id,'itemKey',v_res.item_key,'quantity',v_res.quantity)
    );
  end loop;

  update public.crafting_jobs set status='cancelled',cancelled_at=v_now,updated_at=v_now
  where id=v_job.id returning * into v_job;
  insert into public.crafting_job_transitions (
    game_session_id,job_id,from_status,to_status,actor_type,actor_id,action,idempotency_key,outcome
  ) values (
    p_game_session_id,v_job.id,'in_progress','cancelled','player',p_player_id,'crafting.job_cancelled',
    p_idempotency_key,jsonb_build_object('released',true)
  );
  return jsonb_build_object('outcome','cancelled','jobKey',v_job.public_id,'status',v_job.status,
    'committed',true,'refreshRequired',true);
end
$function$;

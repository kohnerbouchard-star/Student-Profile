-- Admin Crafting job recovery.
-- Final controller-assigned Crafting migration identity.

create or replace function public.recover_admin_crafting_job_v1(
  p_game_session_id uuid,p_staff_user_id uuid,p_job_public_id text,p_outcome text,p_reason text,p_idempotency_key text
)
returns jsonb
language plpgsql security definer
set search_path=public,pg_temp
as $function$
declare
  v_job public.crafting_jobs%rowtype;
  v_event public.physical_economy_admin_events%rowtype;
  v_res record;
  v_from_status text;
  v_now timestamptz:=statement_timestamp();
begin
  p_outcome:=lower(btrim(coalesce(p_outcome,'')));
  p_reason:=btrim(coalesce(p_reason,''));
  if p_outcome not in ('release_and_fail','requeue')
    or coalesce(p_job_public_id,'') !~ '^cft_[0-9a-f]{32}$'
    or length(p_reason) not between 3 and 1000
    or coalesce(p_idempotency_key,'') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
  then raise exception 'CRAFTING_RECOVERY_INVALID' using errcode='P0001'; end if;
  if not exists (select 1 from public.game_sessions where id=p_game_session_id and owner_staff_user_id=p_staff_user_id)
  then raise exception 'CRAFTING_ADMIN_SCOPE_INVALID' using errcode='P0001'; end if;

  select * into v_event from public.physical_economy_admin_events
  where game_session_id=p_game_session_id and staff_user_id=p_staff_user_id
    and action='job.recover' and idempotency_key=p_idempotency_key for update;
  if found then
    if v_event.target_key is distinct from p_job_public_id
      or coalesce(v_event.outcome->>'outcome','') is distinct from p_outcome
      or coalesce(v_event.outcome->>'reason','') is distinct from p_reason
    then
      raise exception 'CRAFTING_RECOVERY_IDEMPOTENCY_CONFLICT' using errcode='P0001';
    end if;
    return v_event.outcome||jsonb_build_object('replayed',true);
  end if;

  select * into v_job from public.crafting_jobs
  where game_session_id=p_game_session_id and public_id=p_job_public_id for update;
  if not found then raise exception 'CRAFTING_JOB_NOT_FOUND' using errcode='P0001'; end if;
  v_from_status:=v_job.status;

  if p_outcome='release_and_fail' then
    if v_job.status not in ('in_progress','completed','failed') or v_job.output_granted_at is not null
    then raise exception 'CRAFTING_RECOVERY_OUTCOME_UNSAFE' using errcode='P0001'; end if;
    for v_res in select * from public.inventory_reservations
      where game_session_id=p_game_session_id and reason_type='crafting_input'
        and source_id=v_job.id and status='active' order by inventory_holding_id for update
    loop
      update public.inventory_holdings set quantity_reserved=quantity_reserved-v_res.quantity,updated_at=v_now
      where id=v_res.inventory_holding_id and quantity_reserved>=v_res.quantity;
      if not found then raise exception 'CRAFTING_RESERVATION_PROJECTION_INVALID' using errcode='P0001'; end if;
      update public.inventory_reservations set status='released',released_at=v_now where id=v_res.id;
      update public.crafting_job_inputs set released_quantity=v_res.quantity where reservation_id=v_res.id;
      insert into public.inventory_events (
        game_session_id,player_id,store_item_id,quantity_delta,event_type,source_domain,source_action,source_id,metadata
      ) values (
        p_game_session_id,v_job.player_id,v_res.store_item_id,v_res.quantity,'RELEASED','crafting',
        'admin_recovery_release',v_job.id,jsonb_build_object('jobKey',v_job.public_id,'reason',p_reason)
      );
    end loop;
    update public.crafting_jobs set status='failed',failed_at=v_now,failure_code='ADMIN_RELEASED',
      recovery_version=recovery_version+1,updated_at=v_now where id=v_job.id returning * into v_job;
  else
    if v_job.status<>'failed' or v_job.output_granted_at is not null
      or not exists (
        select 1 from public.inventory_reservations where source_id=v_job.id and status='active'
      )
      or exists (
        select 1 from public.inventory_reservations where source_id=v_job.id and status<>'active'
      )
    then raise exception 'CRAFTING_RECOVERY_OUTCOME_UNSAFE' using errcode='P0001'; end if;
    update public.crafting_jobs set status='in_progress',failed_at=null,failure_code=null,
      completes_at=v_now+interval '1 minute',recovery_version=recovery_version+1,updated_at=v_now
      where id=v_job.id returning * into v_job;
  end if;

  insert into public.physical_economy_admin_events (
    game_session_id,staff_user_id,action,idempotency_key,target_key,outcome
  ) values (
    p_game_session_id,p_staff_user_id,'job.recover',p_idempotency_key,v_job.public_id,
    jsonb_build_object('jobKey',v_job.public_id,'outcome',p_outcome,'status',v_job.status,
      'reason',p_reason,'recoveryVersion',v_job.recovery_version,'replayed',false)
  ) returning * into v_event;
  insert into public.crafting_job_transitions (
    game_session_id,job_id,from_status,to_status,actor_type,actor_id,action,idempotency_key,outcome
  ) values (
    p_game_session_id,v_job.id,v_from_status,v_job.status,'staff_user',p_staff_user_id,'crafting.job_recovered',
    p_idempotency_key,v_event.outcome
  );
  insert into public.audit_log (
    game_session_id,actor_type,actor_id,action,target_type,target_id,metadata
  ) values (
    p_game_session_id,'staff_user',p_staff_user_id,'crafting.job_recovered','crafting_job',v_job.id,v_event.outcome
  );
  return v_event.outcome;
end
$function$;

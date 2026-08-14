begin;

create or replace function public.get_game_data_purge_registry_digest_v1()
returns table(registry_sha256 text, table_count bigint)
language sql stable security definer
set search_path=pg_catalog,private,extensions
as $$
  select encode(extensions.digest(string_agg(table_schema||'.'||table_name,E'\n' order by table_schema,table_name),'sha256'),'hex'),count(*)
  from private.game_data_purge_table_registry;
$$;

create or replace function public.get_game_data_purge_preflight_v1(p_request_id uuid)
returns jsonb
language plpgsql security definer
set search_path=pg_catalog,public,private,extensions
as $$
declare
  v_req private.game_data_purge_requests%rowtype;
  v_game public.game_sessions%rowtype;
  v_ent public.entitlements%rowtype;
  v_control private.game_data_purge_control%rowtype;
  v_registry_sha text;
  v_registry_count bigint;
  v_cross_refs bigint;
  v_now timestamptz:=clock_timestamp();
begin
  select * into v_req from private.game_data_purge_requests where id=p_request_id;
  if not found then raise exception 'PURGE_REQUEST_NOT_FOUND' using errcode='P0001'; end if;
  select * into v_game from public.game_sessions where id=v_req.game_session_id;
  select * into v_ent from public.entitlements where id=v_req.entitlement_id and game_session_id=v_req.game_session_id;
  select * into v_control from private.game_data_purge_control where singleton;
  select registry_sha256,table_count into v_registry_sha,v_registry_count from public.get_game_data_purge_registry_digest_v1();
  select count(*) into v_cross_refs
  from public.game_feature_activation_evidence e
  where e.source_game_session_id=v_req.game_session_id and e.game_session_id<>v_req.game_session_id;
  return jsonb_build_object(
    'requestId',v_req.id,'gameSessionId',v_req.game_session_id,'gameName',v_req.game_name_snapshot,
    'requestStatus',v_req.status,'purgeNotBefore',v_req.purge_not_before,'licenseExpiresAt',v_req.license_expires_at,
    'gameExists',v_game.id is not null,'purgeProtected',coalesce(v_game.data_purge_protected,false),
    'entitlementExpired',coalesce(v_ent.status='expired' and v_ent.license_expires_at<=v_now,false),
    'leverArmed',coalesce(v_control.arm_id is not null and v_control.armed_until>v_now,false),
    'armMatches',coalesce(v_req.confirmed_arm_id=v_control.arm_id,false),
    'registrySha256',v_registry_sha,'registryTableCount',v_registry_count,
    'crossGameBlockingReferences',v_cross_refs,
    'r2DeletedAt',v_req.r2_deleted_at
  );
end;
$$;

create or replace function public.claim_confirmed_game_data_purge_v1()
returns table(request_id uuid,game_session_id uuid,stage text)
language plpgsql security definer
set search_path=pg_catalog,public,private
as $$
declare v_req private.game_data_purge_requests%rowtype; v_control private.game_data_purge_control%rowtype; v_now timestamptz:=clock_timestamp(); v_cross_refs bigint;
begin
  select * into v_control from private.game_data_purge_control where singleton for update;
  if v_control.arm_id is null or v_control.armed_until is null or v_control.armed_until<=v_now then return; end if;
  select * into v_req
  from private.game_data_purge_requests
  where status in ('confirmed','r2_deleted')
    and confirmed_arm_id=v_control.arm_id
    and purge_not_before is not null and purge_not_before<=v_now
  order by confirmed_at nulls last,created_at
  for update skip locked limit 1;
  if not found then return; end if;
  if not exists(select 1 from public.game_sessions g where g.id=v_req.game_session_id and not g.data_purge_protected) then return; end if;
  if not exists(select 1 from public.entitlements e where e.id=v_req.entitlement_id and e.game_session_id=v_req.game_session_id and e.status='expired' and e.license_expires_at<=v_now) then return; end if;
  select count(*) into v_cross_refs from public.game_feature_activation_evidence e where e.source_game_session_id=v_req.game_session_id and e.game_session_id<>v_req.game_session_id;
  if v_cross_refs>0 then
    update private.game_data_purge_requests set last_error='cross_game_reference_blocked',updated_at=v_now where id=v_req.id;
    return;
  end if;
  request_id:=v_req.id; game_session_id:=v_req.game_session_id;
  if v_req.status='confirmed' then
    update private.game_data_purge_requests set status='r2_deleting',attempt_count=attempt_count+1,last_attempt_at=v_now,updated_at=v_now where id=v_req.id;
    stage:='r2';
  else
    update private.game_data_purge_requests set status='db_deleting',attempt_count=attempt_count+1,last_attempt_at=v_now,updated_at=v_now where id=v_req.id;
    stage:='db';
  end if;
  return next;
end;
$$;

create or replace function public.record_game_data_purge_r2_progress_v1(p_request_id uuid,p_r2_prefix text,p_deleted_objects bigint,p_deleted_bytes bigint,p_complete boolean)
returns jsonb
language plpgsql security definer
set search_path=pg_catalog,private
as $$
declare v_status text;
begin
  if p_deleted_objects<0 or p_deleted_bytes<0 or p_r2_prefix is null or length(p_r2_prefix)<10 then raise exception 'INVALID_PURGE_PROGRESS' using errcode='22023'; end if;
  v_status:=case when p_complete then 'r2_deleted' else 'confirmed' end;
  update private.game_data_purge_requests
  set status=v_status,r2_prefix=p_r2_prefix,
      r2_deleted_objects=r2_deleted_objects+p_deleted_objects,
      r2_deleted_bytes=r2_deleted_bytes+p_deleted_bytes,
      r2_deleted_at=case when p_complete then clock_timestamp() else r2_deleted_at end,
      last_error=null,updated_at=clock_timestamp()
  where id=p_request_id and status='r2_deleting';
  if not found then raise exception 'PURGE_REQUEST_STAGE_CONFLICT' using errcode='P0001'; end if;
  return jsonb_build_object('requestId',p_request_id,'status',v_status);
end;
$$;

create or replace function public.record_game_data_purge_failure_v1(p_request_id uuid,p_stage text,p_error text)
returns boolean
language plpgsql security definer
set search_path=pg_catalog,private
as $$
begin
  update private.game_data_purge_requests
  set status=case when p_stage='db' then 'r2_deleted' else 'confirmed' end,
      last_error=left(coalesce(p_error,'unknown purge failure'),1000),updated_at=clock_timestamp()
  where id=p_request_id and status in ('r2_deleting','db_deleting');
  return found;
end;
$$;

create or replace function public.record_game_data_purge_database_complete_v1(p_request_id uuid,p_deleted_rows jsonb)
returns jsonb
language plpgsql security definer
set search_path=pg_catalog,private
as $$
declare v_req private.game_data_purge_requests%rowtype; v_now timestamptz:=clock_timestamp();
begin
  if jsonb_typeof(coalesce(p_deleted_rows,'{}'::jsonb))<>'object' then raise exception 'INVALID_DELETED_ROWS' using errcode='22023'; end if;
  select * into v_req from private.game_data_purge_requests where id=p_request_id for update;
  if not found or v_req.status<>'db_deleting' then raise exception 'PURGE_REQUEST_STAGE_CONFLICT' using errcode='P0001'; end if;
  update private.game_data_purge_requests set status='completed',db_deleted_rows=coalesce(p_deleted_rows,'{}'::jsonb),db_deleted_at=v_now,completed_at=v_now,last_error=null,updated_at=v_now where id=p_request_id;
  update private.game_data_purge_control set arm_id=null,armed_until=null,armed_by_staff_user_id=null,disarmed_at=v_now,updated_at=v_now
  where singleton and arm_id=v_req.confirmed_arm_id;
  return jsonb_build_object('requestId',p_request_id,'status','completed','leverDisarmed',true);
end;
$$;

create or replace function public.set_game_license_expiration_v1(p_game_session_id uuid,p_actor_staff_user_id uuid,p_license_expires_at timestamptz)
returns jsonb
language plpgsql security definer
set search_path=pg_catalog,public,private
as $$
declare v_ent public.entitlements%rowtype; v_game public.game_sessions%rowtype; v_now timestamptz:=clock_timestamp();
begin
  perform private.assert_game_purge_authority_v1(p_actor_staff_user_id);
  if p_game_session_id is null or p_license_expires_at is null then raise exception 'LICENSE_EXPIRATION_REQUIRED' using errcode='22023'; end if;
  select * into v_game from public.game_sessions where id=p_game_session_id for update;
  if not found then raise exception 'GAME_NOT_FOUND' using errcode='P0001'; end if;
  if v_game.data_purge_protected then raise exception 'GAME_PURGE_PROTECTED' using errcode='P0001'; end if;
  select * into v_ent from public.entitlements where game_session_id=p_game_session_id for update;
  if not found then raise exception 'GAME_ENTITLEMENT_NOT_FOUND' using errcode='P0001'; end if;
  if exists(select 1 from private.game_data_purge_requests r where r.game_session_id=p_game_session_id and r.status in ('r2_deleting','r2_deleted','db_deleting')) then raise exception 'GAME_PURGE_ALREADY_EXECUTING' using errcode='P0001'; end if;
  update public.entitlements set license_expires_at=p_license_expires_at,status=case when p_license_expires_at<=v_now then 'expired' else 'active' end,
    expired_at=case when p_license_expires_at<=v_now then coalesce(expired_at,v_now) else null end,updated_at=v_now where id=v_ent.id;
  if p_license_expires_at<=v_now then
    update public.game_sessions set status=case when lifecycle_state in ('ended','archived') then 'archived' else 'disabled' end,
      lifecycle_state=case when lifecycle_state in ('ended','archived') then lifecycle_state else 'paused' end,
      paused_at=case when lifecycle_state in ('ended','archived') then paused_at else coalesce(paused_at,v_now) end,
      game_join_code_status='revoked',license_expired_at=coalesce(license_expired_at,v_now),lifecycle_version=lifecycle_version+1,updated_at=v_now where id=p_game_session_id;
    insert into private.game_data_purge_requests(game_session_id,game_name_snapshot,entitlement_id,license_expires_at,purge_not_before,status)
    values(p_game_session_id,v_game.name,v_ent.id,p_license_expires_at,p_license_expires_at+interval '7 days','eligible')
    on conflict do nothing;
  else
    update public.game_sessions set license_expired_at=null,updated_at=v_now where id=p_game_session_id;
    update private.game_data_purge_requests set status='cancelled',cancelled_by_staff_user_id=p_actor_staff_user_id,cancelled_at=v_now,updated_at=v_now,last_error='license_renewed_before_purge'
    where game_session_id=p_game_session_id and status in ('eligible','awaiting_confirmation','confirmed');
  end if;
  return jsonb_build_object('gameSessionId',p_game_session_id,'licenseExpiresAt',p_license_expires_at,'expired',p_license_expires_at<=v_now,'purgeEligibleAt',p_license_expires_at+interval '7 days');
end;
$$;

create or replace function public.configure_game_license_expiration_scheduler_v1()
returns bigint
language plpgsql security definer
set search_path=pg_catalog,public,cron
as $$
declare v_job_id bigint;
begin
  for v_job_id in select jobid from cron.job where jobname='econovaria-game-license-expiration-v1' loop perform cron.unschedule(v_job_id); end loop;
  return cron.schedule('econovaria-game-license-expiration-v1','17 * * * *','select * from public.run_due_game_license_expirations_v1(clock_timestamp());');
end;
$$;

create or replace function public.configure_game_data_purge_scheduler_v1(p_function_url text)
returns bigint
language plpgsql security definer
set search_path=pg_catalog,public,private,vault,cron,net,extensions
as $$
declare v_scheduler_name constant text:='econovaria-game-data-purge-scheduler-v1'; v_function_url text:=lower(btrim(coalesce(p_function_url,''))); v_token text; v_job_id bigint; v_command text;
begin
  if v_function_url !~ '^https://[a-z0-9]{20}[.]supabase[.]co/functions/v1/game-data-purger$' then raise exception 'INVALID_GAME_DATA_PURGE_FUNCTION_URL' using errcode='22023'; end if;
  select decrypted_secret into v_token from vault.decrypted_secrets where name=v_scheduler_name order by created_at desc limit 1;
  if v_token is null then v_token:=encode(extensions.gen_random_bytes(32),'hex'); perform vault.create_secret(v_token,v_scheduler_name,'Internal token for hard-confirmed Econovaria game data purge dispatcher.'); end if;
  insert into private.runtime_scheduler_tokens(scheduler_name,token_sha256)
  values(v_scheduler_name,encode(extensions.digest(v_token,'sha256'),'hex'))
  on conflict(scheduler_name) do update set token_sha256=excluded.token_sha256,rotated_at=case when private.runtime_scheduler_tokens.token_sha256<>excluded.token_sha256 then clock_timestamp() else private.runtime_scheduler_tokens.rotated_at end;
  for v_job_id in select jobid from cron.job where jobname=v_scheduler_name loop perform cron.unschedule(v_job_id); end loop;
  v_command:=format($cmd$select net.http_post(url := %L,headers := jsonb_build_object('content-type','application/json','x-econovaria-purge-scheduler-token',(select decrypted_secret from vault.decrypted_secrets where name='econovaria-game-data-purge-scheduler-v1' order by created_at desc limit 1)),body := '{}'::jsonb,timeout_milliseconds := 20000);$cmd$,v_function_url);
  return cron.schedule(v_scheduler_name,'*/5 * * * *',v_command);
end;
$$;

revoke all on function public.get_game_data_purge_registry_digest_v1() from public,anon,authenticated;
revoke all on function public.get_game_data_purge_preflight_v1(uuid) from public,anon,authenticated;
revoke all on function public.claim_confirmed_game_data_purge_v1() from public,anon,authenticated;
revoke all on function public.record_game_data_purge_r2_progress_v1(uuid,text,bigint,bigint,boolean) from public,anon,authenticated;
revoke all on function public.record_game_data_purge_failure_v1(uuid,text,text) from public,anon,authenticated;
revoke all on function public.record_game_data_purge_database_complete_v1(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.set_game_license_expiration_v1(uuid,uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.configure_game_license_expiration_scheduler_v1() from public,anon,authenticated;
revoke all on function public.configure_game_data_purge_scheduler_v1(text) from public,anon,authenticated;
grant execute on function public.get_game_data_purge_registry_digest_v1() to service_role;
grant execute on function public.get_game_data_purge_preflight_v1(uuid) to service_role;
grant execute on function public.claim_confirmed_game_data_purge_v1() to service_role;
grant execute on function public.record_game_data_purge_r2_progress_v1(uuid,text,bigint,bigint,boolean) to service_role;
grant execute on function public.record_game_data_purge_failure_v1(uuid,text,text) to service_role;
grant execute on function public.record_game_data_purge_database_complete_v1(uuid,jsonb) to service_role;
grant execute on function public.set_game_license_expiration_v1(uuid,uuid,timestamptz) to service_role;
grant execute on function public.configure_game_license_expiration_scheduler_v1() to service_role;
grant execute on function public.configure_game_data_purge_scheduler_v1(text) to service_role;

select public.configure_game_license_expiration_scheduler_v1();

commit;

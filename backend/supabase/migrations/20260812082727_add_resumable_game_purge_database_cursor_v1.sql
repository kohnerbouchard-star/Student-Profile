begin;

alter table private.game_data_purge_requests
  add column if not exists db_delete_cursor integer not null default 0 check(db_delete_cursor>=0),
  add column if not exists db_started_at timestamptz null;

create or replace function public.get_game_data_purge_preflight_v1(p_request_id uuid)
returns jsonb
language plpgsql security definer
set search_path=pg_catalog,public,private,extensions
as $$
declare
  v_req private.game_data_purge_requests%rowtype; v_game public.game_sessions%rowtype; v_ent public.entitlements%rowtype;
  v_control private.game_data_purge_control%rowtype; v_registry_sha text; v_registry_count bigint; v_cross_refs bigint; v_now timestamptz:=clock_timestamp();
begin
  select * into v_req from private.game_data_purge_requests where id=p_request_id;
  if not found then raise exception 'PURGE_REQUEST_NOT_FOUND' using errcode='P0001'; end if;
  select * into v_game from public.game_sessions where id=v_req.game_session_id;
  select * into v_ent from public.entitlements where id=v_req.entitlement_id and game_session_id=v_req.game_session_id;
  select * into v_control from private.game_data_purge_control where singleton;
  select registry_sha256,table_count into v_registry_sha,v_registry_count from public.get_game_data_purge_registry_digest_v1();
  select count(*) into v_cross_refs from public.game_feature_activation_evidence e where e.source_game_session_id=v_req.game_session_id and e.game_session_id<>v_req.game_session_id;
  return jsonb_build_object(
    'requestId',v_req.id,'gameSessionId',v_req.game_session_id,'gameName',v_req.game_name_snapshot,'requestStatus',v_req.status,
    'purgeNotBefore',v_req.purge_not_before,'licenseExpiresAt',v_req.license_expires_at,'gameExists',v_game.id is not null,
    'purgeProtected',coalesce(v_game.data_purge_protected,false),
    'entitlementExpired',coalesce(v_ent.status='expired' and v_ent.license_expires_at<=v_now,false),
    'leverArmed',coalesce(v_control.arm_id is not null and v_control.armed_until>v_now,false),
    'armMatches',coalesce(v_req.confirmed_arm_id=v_control.arm_id,false),'registrySha256',v_registry_sha,'registryTableCount',v_registry_count,
    'crossGameBlockingReferences',v_cross_refs,'r2DeletedAt',v_req.r2_deleted_at,'dbDeleteCursor',v_req.db_delete_cursor,'dbStartedAt',v_req.db_started_at,
    'deletedRows',v_req.db_deleted_rows
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
  select * into v_req from private.game_data_purge_requests
  where status in ('confirmed','r2_deleted') and confirmed_arm_id=v_control.arm_id and purge_not_before is not null and purge_not_before<=v_now
  order by confirmed_at nulls last,created_at for update skip locked limit 1;
  if not found then return; end if;
  if not exists(select 1 from public.game_sessions g where g.id=v_req.game_session_id and not g.data_purge_protected) then return; end if;
  if v_req.status='confirmed' or v_req.db_delete_cursor=0 then
    if not exists(select 1 from public.entitlements e where e.id=v_req.entitlement_id and e.game_session_id=v_req.game_session_id and e.status='expired' and e.license_expires_at<=v_now) then return; end if;
  end if;
  select count(*) into v_cross_refs from public.game_feature_activation_evidence e where e.source_game_session_id=v_req.game_session_id and e.game_session_id<>v_req.game_session_id;
  if v_cross_refs>0 then update private.game_data_purge_requests set last_error='cross_game_reference_blocked',updated_at=v_now where id=v_req.id; return; end if;
  request_id:=v_req.id; game_session_id:=v_req.game_session_id;
  if v_req.status='confirmed' then
    update private.game_data_purge_requests set status='r2_deleting',attempt_count=attempt_count+1,last_attempt_at=v_now,updated_at=v_now where id=v_req.id;
    stage:='r2';
  else
    update private.game_data_purge_requests set status='db_deleting',db_started_at=coalesce(db_started_at,v_now),attempt_count=attempt_count+1,last_attempt_at=v_now,updated_at=v_now where id=v_req.id;
    stage:='db';
  end if;
  return next;
end;
$$;

create or replace function public.record_game_data_purge_db_progress_v1(p_request_id uuid,p_next_cursor integer,p_batch_deleted_rows jsonb)
returns jsonb
language plpgsql security definer
set search_path=pg_catalog,private
as $$
declare v_existing jsonb; v_pair record; v_merged jsonb;
begin
  if p_next_cursor<0 or jsonb_typeof(coalesce(p_batch_deleted_rows,'{}'::jsonb))<>'object' then raise exception 'INVALID_DB_PURGE_PROGRESS' using errcode='22023'; end if;
  select db_deleted_rows into v_existing from private.game_data_purge_requests where id=p_request_id and status='db_deleting' for update;
  if not found then raise exception 'PURGE_REQUEST_STAGE_CONFLICT' using errcode='P0001'; end if;
  v_merged:=coalesce(v_existing,'{}'::jsonb);
  for v_pair in select key,value from jsonb_each(coalesce(p_batch_deleted_rows,'{}'::jsonb)) loop
    v_merged:=jsonb_set(v_merged,array[v_pair.key],to_jsonb(coalesce((v_merged->>v_pair.key)::bigint,0)+coalesce((v_pair.value#>>'{}')::bigint,0)),true);
  end loop;
  update private.game_data_purge_requests set status='r2_deleted',db_delete_cursor=p_next_cursor,db_deleted_rows=v_merged,last_error=null,updated_at=clock_timestamp() where id=p_request_id;
  return jsonb_build_object('requestId',p_request_id,'status','r2_deleted','dbDeleteCursor',p_next_cursor,'deletedRows',v_merged);
end;
$$;

revoke all on function public.record_game_data_purge_db_progress_v1(uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.record_game_data_purge_db_progress_v1(uuid,integer,jsonb) to service_role;

commit;

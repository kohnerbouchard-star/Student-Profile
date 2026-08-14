begin;

alter table private.game_data_purge_control add column if not exists arm_id uuid null;
alter table private.game_data_purge_requests add column if not exists purge_not_before timestamptz null;
alter table private.game_data_purge_requests add column if not exists confirmed_arm_id uuid null;
update private.game_data_purge_requests set purge_not_before=license_expires_at+interval '7 days' where purge_not_before is null;

create or replace function public.run_due_game_license_expirations_v1(p_now timestamptz default clock_timestamp())
returns table(game_session_id uuid,purge_request_id uuid)
language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare v_ent record; v_request_id uuid;
begin
  if p_now is null then raise exception 'CURRENT_TIME_REQUIRED' using errcode='22023'; end if;
  for v_ent in
    select e.id entitlement_id,e.game_session_id,e.license_expires_at,g.name,g.lifecycle_state,g.data_purge_protected
    from public.entitlements e join public.game_sessions g on g.id=e.game_session_id
    where e.status='active' and e.license_expires_at is not null and e.license_expires_at<=p_now
    order by e.license_expires_at,e.game_session_id for update of e,g skip locked
  loop
    update public.entitlements set status='expired',expired_at=coalesce(expired_at,p_now),updated_at=p_now where id=v_ent.entitlement_id;
    update public.game_sessions set
      status=case when lifecycle_state in ('ended','archived') then 'archived' else 'disabled' end,
      lifecycle_state=case when lifecycle_state in ('ended','archived') then lifecycle_state else 'paused' end,
      paused_at=case when lifecycle_state in ('ended','archived') then paused_at else coalesce(paused_at,p_now) end,
      game_join_code_status='revoked',license_expired_at=coalesce(license_expired_at,p_now),lifecycle_version=lifecycle_version+1,updated_at=p_now
    where id=v_ent.game_session_id;
    v_request_id:=null;
    if not v_ent.data_purge_protected then
      select r.id into v_request_id from private.game_data_purge_requests r where r.game_session_id=v_ent.game_session_id and r.status not in ('completed','cancelled','failed') limit 1;
      if v_request_id is null then
        insert into private.game_data_purge_requests(game_session_id,game_name_snapshot,entitlement_id,license_expires_at,purge_not_before,status)
        values(v_ent.game_session_id,v_ent.name,v_ent.entitlement_id,v_ent.license_expires_at,v_ent.license_expires_at+interval '7 days','eligible') returning id into v_request_id;
      end if;
    end if;
    game_session_id:=v_ent.game_session_id; purge_request_id:=v_request_id; return next;
  end loop;
end;
$$;

create or replace function public.arm_game_data_purge_v1(p_actor_staff_user_id uuid,p_confirmation_phrase text)
returns timestamptz
language plpgsql security definer set search_path=pg_catalog,public,private,extensions as $$
declare v_until timestamptz; v_arm_id uuid:=extensions.gen_random_uuid();
begin
  perform private.assert_game_purge_authority_v1(p_actor_staff_user_id);
  if p_confirmation_phrase is distinct from 'ARM GAME DATA PURGE FOR 2 HOURS' then raise exception 'PURGE_ARM_CONFIRMATION_MISMATCH' using errcode='P0001'; end if;
  v_until:=clock_timestamp()+interval '2 hours';
  update private.game_data_purge_control set arm_id=v_arm_id,armed_until=v_until,armed_by_staff_user_id=p_actor_staff_user_id,armed_at=clock_timestamp(),disarmed_at=null,updated_at=clock_timestamp() where singleton;
  return v_until;
end;
$$;

create or replace function public.disarm_game_data_purge_v1(p_actor_staff_user_id uuid)
returns boolean
language plpgsql security definer set search_path=pg_catalog,public,private as $$
begin
  perform private.assert_game_purge_authority_v1(p_actor_staff_user_id);
  update private.game_data_purge_control set arm_id=null,armed_until=null,armed_by_staff_user_id=null,disarmed_at=clock_timestamp(),updated_at=clock_timestamp() where singleton;
  return true;
end;
$$;

create or replace function public.issue_game_data_purge_confirmation_v1(p_game_session_id uuid,p_actor_staff_user_id uuid)
returns table(request_id uuid,game_name text,confirmation_phrase text,confirmation_not_before timestamptz,confirmation_expires_at timestamptz)
language plpgsql security definer set search_path=pg_catalog,public,private,extensions as $$
declare v_game public.game_sessions%rowtype; v_ent public.entitlements%rowtype; v_req private.game_data_purge_requests%rowtype; v_challenge text; v_phrase text; v_now timestamptz:=clock_timestamp();
begin
  perform private.assert_game_purge_authority_v1(p_actor_staff_user_id);
  select * into v_game from public.game_sessions where id=p_game_session_id for update;
  if not found then raise exception 'GAME_NOT_FOUND' using errcode='P0001'; end if;
  if v_game.data_purge_protected then raise exception 'GAME_PURGE_PROTECTED' using errcode='P0001'; end if;
  select * into v_ent from public.entitlements where game_session_id=p_game_session_id for update;
  if not found or v_ent.status<>'expired' or v_ent.license_expires_at is null or v_ent.license_expires_at>v_now then raise exception 'GAME_LICENSE_NOT_EXPIRED' using errcode='P0001'; end if;
  select * into v_req from private.game_data_purge_requests where game_session_id=p_game_session_id and status not in ('completed','cancelled','failed') order by created_at desc limit 1 for update;
  if not found then
    insert into private.game_data_purge_requests(game_session_id,game_name_snapshot,entitlement_id,license_expires_at,purge_not_before,status)
    values(p_game_session_id,v_game.name,v_ent.id,v_ent.license_expires_at,v_ent.license_expires_at+interval '7 days','eligible') returning * into v_req;
  end if;
  if v_req.purge_not_before is null then
    update private.game_data_purge_requests set purge_not_before=v_ent.license_expires_at+interval '7 days' where id=v_req.id returning * into v_req;
  end if;
  if v_now<v_req.purge_not_before then raise exception 'GAME_PURGE_GRACE_PERIOD_ACTIVE' using errcode='P0001',detail='Purge not eligible until '||v_req.purge_not_before::text; end if;
  if v_req.status in ('r2_deleting','r2_deleted','db_deleting') then raise exception 'GAME_PURGE_ALREADY_EXECUTING' using errcode='P0001'; end if;
  v_challenge:=encode(extensions.gen_random_bytes(8),'hex');
  v_phrase:='DELETE GAME '||p_game_session_id::text||' '||v_challenge;
  update private.game_data_purge_requests set status='awaiting_confirmation',confirmation_hash=encode(extensions.digest(v_phrase,'sha256'),'hex'),confirmation_issued_at=v_now,confirmation_not_before=v_now+interval '60 seconds',confirmation_expires_at=v_now+interval '30 minutes',confirmed_by_staff_user_id=null,confirmed_at=null,confirmed_arm_id=null,last_error=null,updated_at=v_now where id=v_req.id;
  request_id:=v_req.id; game_name:=v_game.name; confirmation_phrase:=v_phrase; confirmation_not_before:=v_now+interval '60 seconds'; confirmation_expires_at:=v_now+interval '30 minutes'; return next;
end;
$$;

create or replace function public.confirm_game_data_purge_v1(p_request_id uuid,p_actor_staff_user_id uuid,p_confirmation_phrase text)
returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,private,extensions as $$
declare v_req private.game_data_purge_requests%rowtype; v_game public.game_sessions%rowtype; v_ent public.entitlements%rowtype; v_control private.game_data_purge_control%rowtype; v_now timestamptz:=clock_timestamp();
begin
  perform private.assert_game_purge_authority_v1(p_actor_staff_user_id);
  select * into v_req from private.game_data_purge_requests where id=p_request_id for update;
  if not found or v_req.status<>'awaiting_confirmation' then raise exception 'PURGE_REQUEST_NOT_AWAITING_CONFIRMATION' using errcode='P0001'; end if;
  select * into v_control from private.game_data_purge_control where singleton;
  if v_control.arm_id is null or v_control.armed_until is null or v_control.armed_until<=v_now then raise exception 'GAME_DATA_PURGE_LEVER_NOT_ARMED' using errcode='P0001'; end if;
  if v_req.purge_not_before is null or v_now<v_req.purge_not_before then raise exception 'GAME_PURGE_GRACE_PERIOD_ACTIVE' using errcode='P0001'; end if;
  if v_now<v_req.confirmation_not_before then raise exception 'PURGE_CONFIRMATION_TOO_EARLY' using errcode='P0001'; end if;
  if v_now>v_req.confirmation_expires_at then raise exception 'PURGE_CONFIRMATION_EXPIRED' using errcode='P0001'; end if;
  if encode(extensions.digest(coalesce(p_confirmation_phrase,''),'sha256'),'hex')<>v_req.confirmation_hash then raise exception 'PURGE_CONFIRMATION_MISMATCH' using errcode='P0001'; end if;
  select * into v_game from public.game_sessions where id=v_req.game_session_id for update;
  if not found then raise exception 'GAME_NOT_FOUND' using errcode='P0001'; end if;
  if v_game.data_purge_protected then raise exception 'GAME_PURGE_PROTECTED' using errcode='P0001'; end if;
  select * into v_ent from public.entitlements where id=v_req.entitlement_id and game_session_id=v_req.game_session_id for update;
  if not found or v_ent.status<>'expired' or v_ent.license_expires_at is null or v_ent.license_expires_at>v_now then raise exception 'GAME_LICENSE_NOT_EXPIRED' using errcode='P0001'; end if;
  update private.game_data_purge_requests set status='confirmed',confirmed_by_staff_user_id=p_actor_staff_user_id,confirmed_at=v_now,confirmed_arm_id=v_control.arm_id,updated_at=v_now,last_error=null where id=p_request_id;
  return jsonb_build_object('requestId',p_request_id,'gameSessionId',v_req.game_session_id,'status','confirmed','armId',v_control.arm_id,'armedUntil',v_control.armed_until);
end;
$$;

commit;

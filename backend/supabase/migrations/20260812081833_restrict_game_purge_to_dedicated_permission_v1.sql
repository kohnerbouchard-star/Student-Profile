begin;

alter table public.staff_permission_grants
  drop constraint if exists staff_permission_grants_permission_check;
alter table public.staff_permission_grants
  add constraint staff_permission_grants_permission_check
  check (permission = any (array[
    'account.read','audit.read','attendance.manage','business.manage','contracts.manage','economy.adjust',
    'game.create','game.read','game.switch','game.update','game.purge','inventory.redeem','market.manage',
    'marketplace.moderate','messaging.moderate','players.manage','progression.review','settings.manage','store.manage','world.manage'
  ]::text[]));

insert into public.staff_permission_grants(staff_user_id,permission,granted_by_staff_user_id,reason)
select s.id,'game.purge',s.id,'Dedicated platform-operator authority for hard-confirmed expired-game data purges.'
from public.staff_users s
where lower(s.email)='kohnerbouchard@gmail.com' and s.status='active'
on conflict(staff_user_id,permission) do nothing;

create or replace function private.assert_game_purge_authority_v1(p_staff_user_id uuid)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
begin
  if not exists (
    select 1
    from public.staff_users s
    join public.staff_permission_grants g on g.staff_user_id=s.id and g.permission='game.purge'
    where s.id=p_staff_user_id and s.status='active' and s.role='game_admin'
  ) then
    raise exception 'GAME_PURGE_AUTHORITY_REQUIRED' using errcode='P0001';
  end if;
end;
$$;

create or replace function public.arm_game_data_purge_v1(p_actor_staff_user_id uuid,p_confirmation_phrase text)
returns timestamptz
language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare v_until timestamptz;
begin
  perform private.assert_game_purge_authority_v1(p_actor_staff_user_id);
  if p_confirmation_phrase is distinct from 'ARM GAME DATA PURGE FOR 2 HOURS' then raise exception 'PURGE_ARM_CONFIRMATION_MISMATCH' using errcode='P0001'; end if;
  v_until:=clock_timestamp()+interval '2 hours';
  update private.game_data_purge_control set armed_until=v_until,armed_by_staff_user_id=p_actor_staff_user_id,armed_at=clock_timestamp(),disarmed_at=null,updated_at=clock_timestamp() where singleton;
  return v_until;
end;
$$;

create or replace function public.disarm_game_data_purge_v1(p_actor_staff_user_id uuid)
returns boolean
language plpgsql security definer set search_path=pg_catalog,public,private as $$
begin
  perform private.assert_game_purge_authority_v1(p_actor_staff_user_id);
  update private.game_data_purge_control set armed_until=null,armed_by_staff_user_id=null,disarmed_at=clock_timestamp(),updated_at=clock_timestamp() where singleton;
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
  if not found then insert into private.game_data_purge_requests(game_session_id,game_name_snapshot,entitlement_id,license_expires_at,status) values(p_game_session_id,v_game.name,v_ent.id,v_ent.license_expires_at,'eligible') returning * into v_req; end if;
  if v_req.status in ('r2_deleting','r2_deleted','db_deleting') then raise exception 'GAME_PURGE_ALREADY_EXECUTING' using errcode='P0001'; end if;
  v_challenge:=encode(extensions.gen_random_bytes(8),'hex');
  v_phrase:='DELETE GAME '||p_game_session_id::text||' '||v_challenge;
  update private.game_data_purge_requests set status='awaiting_confirmation',confirmation_hash=encode(extensions.digest(v_phrase,'sha256'),'hex'),confirmation_issued_at=v_now,confirmation_not_before=v_now+interval '60 seconds',confirmation_expires_at=v_now+interval '30 minutes',confirmed_by_staff_user_id=null,confirmed_at=null,last_error=null,updated_at=v_now where id=v_req.id;
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
  if v_control.armed_until is null or v_control.armed_until<=v_now then raise exception 'GAME_DATA_PURGE_LEVER_NOT_ARMED' using errcode='P0001'; end if;
  if v_now<v_req.confirmation_not_before then raise exception 'PURGE_CONFIRMATION_TOO_EARLY' using errcode='P0001'; end if;
  if v_now>v_req.confirmation_expires_at then raise exception 'PURGE_CONFIRMATION_EXPIRED' using errcode='P0001'; end if;
  if encode(extensions.digest(coalesce(p_confirmation_phrase,''),'sha256'),'hex')<>v_req.confirmation_hash then raise exception 'PURGE_CONFIRMATION_MISMATCH' using errcode='P0001'; end if;
  select * into v_game from public.game_sessions where id=v_req.game_session_id for update;
  if not found then raise exception 'GAME_NOT_FOUND' using errcode='P0001'; end if;
  if v_game.data_purge_protected then raise exception 'GAME_PURGE_PROTECTED' using errcode='P0001'; end if;
  select * into v_ent from public.entitlements where id=v_req.entitlement_id and game_session_id=v_req.game_session_id for update;
  if not found or v_ent.status<>'expired' or v_ent.license_expires_at is null or v_ent.license_expires_at>v_now then raise exception 'GAME_LICENSE_NOT_EXPIRED' using errcode='P0001'; end if;
  update private.game_data_purge_requests set status='confirmed',confirmed_by_staff_user_id=p_actor_staff_user_id,confirmed_at=v_now,updated_at=v_now,last_error=null where id=p_request_id;
  return jsonb_build_object('requestId',p_request_id,'gameSessionId',v_req.game_session_id,'status','confirmed','armedUntil',v_control.armed_until);
end;
$$;

create or replace function public.cancel_game_data_purge_v1(p_request_id uuid,p_actor_staff_user_id uuid)
returns boolean
language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare v_req private.game_data_purge_requests%rowtype;
begin
  perform private.assert_game_purge_authority_v1(p_actor_staff_user_id);
  select * into v_req from private.game_data_purge_requests where id=p_request_id for update;
  if not found then return false; end if;
  if v_req.status in ('r2_deleting','r2_deleted','db_deleting','completed') then raise exception 'PURGE_REQUEST_CANNOT_BE_CANCELLED' using errcode='P0001'; end if;
  update private.game_data_purge_requests set status='cancelled',cancelled_by_staff_user_id=p_actor_staff_user_id,cancelled_at=clock_timestamp(),updated_at=clock_timestamp() where id=p_request_id;
  return true;
end;
$$;

commit;

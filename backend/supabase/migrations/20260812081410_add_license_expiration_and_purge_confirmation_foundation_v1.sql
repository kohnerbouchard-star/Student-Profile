begin;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;

alter table public.purchase_codes add column if not exists license_duration_days integer null;
alter table public.purchase_codes drop constraint if exists purchase_codes_license_duration_days_check;
alter table public.purchase_codes add constraint purchase_codes_license_duration_days_check check (license_duration_days is null or license_duration_days between 1 and 3650);

alter table public.entitlements add column if not exists license_expires_at timestamptz null;
alter table public.entitlements add column if not exists expired_at timestamptz null;
alter table public.game_sessions add column if not exists data_purge_protected boolean not null default false;
alter table public.game_sessions add column if not exists license_expired_at timestamptz null;

update public.game_sessions g set data_purge_protected=true
where g.data_purge_protected is not true and (
  g.name like '[SYSTEM] %' or exists (
    select 1 from public.staff_users s where s.id=g.owner_staff_user_id and lower(s.email) like '%@econovaria.internal'
  )
);

create table if not exists private.game_data_purge_control (
  singleton boolean primary key default true check(singleton),
  armed_until timestamptz null,
  armed_by_staff_user_id uuid null,
  armed_at timestamptz null,
  disarmed_at timestamptz null,
  updated_at timestamptz not null default clock_timestamp()
);
insert into private.game_data_purge_control(singleton) values(true) on conflict(singleton) do nothing;

create table if not exists private.game_data_purge_requests (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null,
  game_name_snapshot text not null,
  entitlement_id uuid not null,
  license_expires_at timestamptz not null,
  status text not null default 'eligible' check(status in ('eligible','awaiting_confirmation','confirmed','r2_deleting','r2_deleted','db_deleting','completed','cancelled','failed')),
  confirmation_hash text null check(confirmation_hash is null or confirmation_hash ~ '^[0-9a-f]{64}$'),
  confirmation_issued_at timestamptz null,
  confirmation_not_before timestamptz null,
  confirmation_expires_at timestamptz null,
  confirmed_by_staff_user_id uuid null,
  confirmed_at timestamptz null,
  cancelled_by_staff_user_id uuid null,
  cancelled_at timestamptz null,
  r2_prefix text null,
  r2_deleted_objects bigint not null default 0 check(r2_deleted_objects>=0),
  r2_deleted_bytes bigint not null default 0 check(r2_deleted_bytes>=0),
  r2_deleted_at timestamptz null,
  db_deleted_rows jsonb not null default '{}'::jsonb check(jsonb_typeof(db_deleted_rows)='object'),
  db_deleted_at timestamptz null,
  completed_at timestamptz null,
  attempt_count integer not null default 0 check(attempt_count>=0),
  last_attempt_at timestamptz null,
  last_error text null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create unique index if not exists game_data_purge_requests_one_open_per_game_idx on private.game_data_purge_requests(game_session_id) where status not in ('completed','cancelled','failed');
create index if not exists game_data_purge_requests_status_created_idx on private.game_data_purge_requests(status,created_at);

create table if not exists private.game_data_purge_table_registry (
  table_schema text not null,
  table_name text not null,
  registered_at timestamptz not null default clock_timestamp(),
  primary key(table_schema,table_name),
  check(table_schema in ('public','private')),
  check(table_name<>'game_sessions')
);
insert into private.game_data_purge_table_registry(table_schema,table_name)
select distinct c.table_schema,c.table_name
from information_schema.columns c join information_schema.tables t on t.table_schema=c.table_schema and t.table_name=c.table_name
where c.column_name='game_session_id' and c.table_schema in ('public','private') and t.table_type='BASE TABLE'
  and c.table_name<>'game_sessions' and c.table_name not in ('game_data_purge_requests','game_data_purge_table_registry')
on conflict do nothing;

alter table private.game_data_purge_control enable row level security;
alter table private.game_data_purge_control force row level security;
alter table private.game_data_purge_requests enable row level security;
alter table private.game_data_purge_requests force row level security;
alter table private.game_data_purge_table_registry enable row level security;
alter table private.game_data_purge_table_registry force row level security;
revoke all on private.game_data_purge_control from public,anon,authenticated,service_role;
revoke all on private.game_data_purge_requests from public,anon,authenticated,service_role;
revoke all on private.game_data_purge_table_registry from public,anon,authenticated,service_role;
grant select on private.game_data_purge_control to service_role;
grant select on private.game_data_purge_requests to service_role;
grant select on private.game_data_purge_table_registry to service_role;

create or replace function private.apply_entitlement_license_expiration_v1() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_days integer;
begin
  if new.license_expires_at is null then
    select p.license_duration_days into v_days from public.purchase_codes p where p.id=new.purchase_code_id;
    if v_days is not null then new.license_expires_at:=coalesce(new.created_at,clock_timestamp())+make_interval(days=>v_days); end if;
  end if;
  return new;
end; $$;
drop trigger if exists entitlements_apply_license_expiration_v1 on public.entitlements;
create trigger entitlements_apply_license_expiration_v1 before insert or update of purchase_code_id,license_expires_at on public.entitlements for each row execute function private.apply_entitlement_license_expiration_v1();

create or replace function private.assert_active_game_admin_v1(p_staff_user_id uuid) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if not exists(select 1 from public.staff_users s where s.id=p_staff_user_id and s.status='active' and s.role='game_admin') then
    raise exception 'ACTIVE_GAME_ADMIN_REQUIRED' using errcode='P0001';
  end if;
end; $$;

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
        insert into private.game_data_purge_requests(game_session_id,game_name_snapshot,entitlement_id,license_expires_at,status)
        values(v_ent.game_session_id,v_ent.name,v_ent.entitlement_id,v_ent.license_expires_at,'eligible') returning id into v_request_id;
      end if;
    end if;
    game_session_id:=v_ent.game_session_id; purge_request_id:=v_request_id; return next;
  end loop;
end; $$;

create or replace function public.arm_game_data_purge_v1(p_actor_staff_user_id uuid,p_confirmation_phrase text) returns timestamptz
language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare v_until timestamptz;
begin
  perform private.assert_active_game_admin_v1(p_actor_staff_user_id);
  if p_confirmation_phrase is distinct from 'ARM GAME DATA PURGE FOR 2 HOURS' then raise exception 'PURGE_ARM_CONFIRMATION_MISMATCH' using errcode='P0001'; end if;
  v_until:=clock_timestamp()+interval '2 hours';
  update private.game_data_purge_control set armed_until=v_until,armed_by_staff_user_id=p_actor_staff_user_id,armed_at=clock_timestamp(),disarmed_at=null,updated_at=clock_timestamp() where singleton;
  return v_until;
end; $$;

create or replace function public.disarm_game_data_purge_v1(p_actor_staff_user_id uuid) returns boolean
language plpgsql security definer set search_path=pg_catalog,public,private as $$
begin
  perform private.assert_active_game_admin_v1(p_actor_staff_user_id);
  update private.game_data_purge_control set armed_until=null,armed_by_staff_user_id=null,disarmed_at=clock_timestamp(),updated_at=clock_timestamp() where singleton;
  return true;
end; $$;

create or replace function public.issue_game_data_purge_confirmation_v1(p_game_session_id uuid,p_actor_staff_user_id uuid)
returns table(request_id uuid,game_name text,confirmation_phrase text,confirmation_not_before timestamptz,confirmation_expires_at timestamptz)
language plpgsql security definer set search_path=pg_catalog,public,private,extensions as $$
declare v_game public.game_sessions%rowtype; v_ent public.entitlements%rowtype; v_req private.game_data_purge_requests%rowtype; v_challenge text; v_phrase text; v_now timestamptz:=clock_timestamp();
begin
  perform private.assert_active_game_admin_v1(p_actor_staff_user_id);
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
end; $$;

create or replace function public.confirm_game_data_purge_v1(p_request_id uuid,p_actor_staff_user_id uuid,p_confirmation_phrase text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,private,extensions as $$
declare v_req private.game_data_purge_requests%rowtype; v_game public.game_sessions%rowtype; v_ent public.entitlements%rowtype; v_control private.game_data_purge_control%rowtype; v_now timestamptz:=clock_timestamp();
begin
  perform private.assert_active_game_admin_v1(p_actor_staff_user_id);
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
end; $$;

create or replace function public.cancel_game_data_purge_v1(p_request_id uuid,p_actor_staff_user_id uuid) returns boolean
language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare v_req private.game_data_purge_requests%rowtype;
begin
  perform private.assert_active_game_admin_v1(p_actor_staff_user_id);
  select * into v_req from private.game_data_purge_requests where id=p_request_id for update;
  if not found then return false; end if;
  if v_req.status in ('r2_deleting','r2_deleted','db_deleting','completed') then raise exception 'PURGE_REQUEST_CANNOT_BE_CANCELLED' using errcode='P0001'; end if;
  update private.game_data_purge_requests set status='cancelled',cancelled_by_staff_user_id=p_actor_staff_user_id,cancelled_at=clock_timestamp(),updated_at=clock_timestamp() where id=p_request_id;
  return true;
end; $$;

revoke all on function public.run_due_game_license_expirations_v1(timestamptz) from public,anon,authenticated;
revoke all on function public.arm_game_data_purge_v1(uuid,text) from public,anon,authenticated;
revoke all on function public.disarm_game_data_purge_v1(uuid) from public,anon,authenticated;
revoke all on function public.issue_game_data_purge_confirmation_v1(uuid,uuid) from public,anon,authenticated;
revoke all on function public.confirm_game_data_purge_v1(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.cancel_game_data_purge_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.run_due_game_license_expirations_v1(timestamptz) to service_role;
grant execute on function public.arm_game_data_purge_v1(uuid,text) to service_role;
grant execute on function public.disarm_game_data_purge_v1(uuid) to service_role;
grant execute on function public.issue_game_data_purge_confirmation_v1(uuid,uuid) to service_role;
grant execute on function public.confirm_game_data_purge_v1(uuid,uuid,text) to service_role;
grant execute on function public.cancel_game_data_purge_v1(uuid,uuid) to service_role;
commit;

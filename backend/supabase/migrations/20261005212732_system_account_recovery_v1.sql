begin;
-- System operator only. Application roles cannot approve or advance recovery.
create schema if not exists recovery_private;
revoke all on schema recovery_private from public, anon, authenticated;
create table recovery_private.attempts (
  id uuid primary key,
  project_ref text not null check(project_ref='eecvbssdvarfcykcfrny'),
  auth_user_id uuid not null references auth.users(id),
  source_commit text not null check(source_commit ~ '^[a-f0-9]{40}$'),
  operator_subject text not null check(length(operator_subject) between 1 and 200),
  evidence_ref text not null check(length(evidence_ref) between 8 and 160),
  phase text not null default 'restricted' check(phase in
    ('restricted','revoked','removed','ready','enrolling','completing','completed','cancelled')),
  restricted boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  removed_at timestamptz, expires_at timestamptz,
  grant_digest text unique check(grant_digest ~ '^[a-f0-9]{64}$'),
  session_id uuid, claimed_at timestamptz, primary_factor uuid, backup_factor uuid,
  primary_reserved boolean not null default false, backup_reserved boolean not null default false,
  initial_security_version bigint not null, prepared_security_version bigint, password_transition jsonb,
  check(primary_factor is null or backup_factor is null or primary_factor<>backup_factor),
  check(restricted or phase='completed')
);
create unique index one_restricted_recovery_per_user on recovery_private.attempts(auth_user_id) where restricted;
create table recovery_private.audit (
  id bigint generated always as identity primary key,
  attempt_id uuid not null references recovery_private.attempts(id), phase text not null,
  recorded_at timestamptz not null default clock_timestamp(), unique(attempt_id,phase)
);
create table recovery_private.outbox (
  attempt_id uuid not null references recovery_private.attempts(id),
  kind text not null check(kind in ('started','completed')), delivered_at timestamptz,
  primary key(attempt_id,kind)
);
alter table recovery_private.attempts enable row level security;
alter table recovery_private.audit enable row level security;
alter table recovery_private.outbox enable row level security;
revoke all on all tables in schema recovery_private from public, anon, authenticated, service_role;
revoke all on all sequences in schema recovery_private from public, anon, authenticated, service_role;

create function public.system_recovery_begin_v1(
  p_id uuid,p_user uuid,p_project text,p_source text,p_operator text,p_evidence text
) returns void language plpgsql security definer set search_path='' as $$
declare v_version bigint; r recovery_private.attempts;
begin
  select security_version into v_version from public.staff_users
    where supabase_auth_user_id=p_user and status='active' and mfa_required=true for update;
  if not found then raise exception 'recovery target unavailable'; end if;
  select * into r from recovery_private.attempts where id=p_id;
  if found then
    if (r.auth_user_id,r.project_ref,r.source_commit,r.operator_subject,r.evidence_ref)
      is distinct from (p_user,p_project,p_source,p_operator,p_evidence)
    then raise exception 'recovery identity mismatch'; end if;
    return;
  end if;
  insert into recovery_private.attempts(id,auth_user_id,project_ref,source_commit,operator_subject,evidence_ref,initial_security_version)
    values(p_id,p_user,p_project,p_source,p_operator,p_evidence,v_version);
  insert into recovery_private.audit(attempt_id,phase) values(p_id,'restricted');
  insert into recovery_private.outbox(attempt_id,kind) values(p_id,'started');
end $$;

create function public.system_recovery_advance_v1(
  p_id uuid,p_user uuid,p_source text,p_expected text,p_next text,
  p_digest text default null,p_expires timestamptz default null
) returns void language plpgsql security definer set search_path='' as $$
declare r recovery_private.attempts;
begin
  select * into strict r from recovery_private.attempts where id=p_id for update;
  if (r.auth_user_id,r.source_commit) is distinct from (p_user,p_source) then raise exception 'recovery identity mismatch'; end if;
  if r.phase=p_next then
    if p_next='ready' and (r.grant_digest,r.expires_at) is distinct from (p_digest,p_expires)
    then raise exception 'grant replay mismatch'; end if;
    return;
  end if;
  if p_expected is null or p_next is null or r.phase is distinct from p_expected or not (
    (p_expected,p_next) in (('restricted','revoked'),('revoked','removed'),('removed','ready'))
    or (p_next='cancelled' and p_expected<>'completed')
  ) then raise exception 'invalid recovery transition'; end if;
  if p_next in ('revoked','removed') and exists(select 1 from auth.sessions where user_id=p_user)
  then raise exception 'old sessions remain'; end if;
  if p_next='removed' and exists(select 1 from auth.mfa_factors where user_id=p_user and status='verified')
  then raise exception 'verified factors remain'; end if;
  if p_next='ready' and (p_digest is null or p_digest !~ '^[a-f0-9]{64}$' or p_expires is null
    or p_expires<=clock_timestamp() or p_expires>clock_timestamp()+interval '15 minutes')
  then raise exception 'invalid grant'; end if;
  update recovery_private.attempts set phase=p_next,
    removed_at=case when p_next='removed' then clock_timestamp() else removed_at end,
    grant_digest=case when p_next='ready' then p_digest else grant_digest end,
    expires_at=case when p_next='ready' then p_expires else expires_at end where id=p_id;
  insert into recovery_private.audit(attempt_id,phase) values(p_id,p_next);
end $$;

create function public.system_recovery_access_v1(p_user uuid,p_session uuid,p_digest text default null)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from auth.sessions s where s.id=p_session and s.user_id=p_user
    and (s.not_after is null or s.not_after>statement_timestamp()))
  and (not exists(select 1 from recovery_private.attempts r where r.auth_user_id=p_user and r.restricted)
    or exists(select 1 from recovery_private.attempts r where r.auth_user_id=p_user and r.restricted
      and r.phase in ('enrolling','completing') and r.session_id=p_session and r.grant_digest=p_digest
      and r.expires_at>statement_timestamp()));
$$;

create function public.system_recovery_claim_v1(p_user uuid,p_session uuid,p_digest text)
returns uuid language plpgsql security definer set search_path='' as $$
declare r recovery_private.attempts;
begin
  select * into strict r from recovery_private.attempts
    where auth_user_id=p_user and grant_digest=p_digest and restricted for update;
  if r.phase='enrolling' and r.session_id=p_session and r.expires_at>clock_timestamp()
    and public.system_recovery_access_v1(p_user,p_session,p_digest) then return r.id; end if;
  if r.phase<>'ready' or r.expires_at<=clock_timestamp() or not exists(
    select 1 from auth.sessions where id=p_session and user_id=p_user and created_at>r.removed_at
      and (not_after is null or not_after>clock_timestamp())
  ) then raise exception 'grant unavailable'; end if;
  update recovery_private.attempts set phase='enrolling',session_id=p_session,claimed_at=clock_timestamp() where id=r.id;
  insert into recovery_private.audit(attempt_id,phase) values(r.id,'enrolling');
  return r.id;
end $$;

create function public.system_recovery_context_v1(p_user uuid,p_session uuid,p_digest text)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',r.id,'source',r.source_commit,'phase',r.phase,
    'primary',r.primary_factor,'backup',r.backup_factor,
    'primaryReserved',r.primary_reserved,'backupReserved',r.backup_reserved,
    'primaryVerified',exists(select 1 from auth.mfa_factors where id=r.primary_factor and user_id=p_user and status='verified'),
    'backupVerified',exists(select 1 from auth.mfa_factors where id=r.backup_factor and user_id=p_user and status='verified'))
  from recovery_private.attempts r where r.auth_user_id=p_user and r.restricted
    and public.system_recovery_access_v1(p_user,p_session,p_digest)
    and r.session_id=p_session and r.grant_digest=p_digest;
$$;

-- Reservations are one-shot. Interrupted provider effects require operator reconciliation.
create function public.system_recovery_reserve_factor_v1(p_user uuid,p_session uuid,p_digest text,p_slot text)
returns void language plpgsql security definer set search_path='' as $$
declare r recovery_private.attempts;
begin
  select * into strict r from recovery_private.attempts where auth_user_id=p_user and restricted for update;
  if not public.system_recovery_access_v1(p_user,p_session,p_digest) or r.phase<>'enrolling'
    or p_slot is null or p_slot not in ('primary','backup')
    or (p_slot='primary' and (r.primary_reserved or exists(select 1 from auth.mfa_factors where user_id=p_user and status='verified')))
    or (p_slot='backup' and (r.backup_reserved or not exists(select 1 from auth.mfa_factors where id=r.primary_factor and user_id=p_user and status='verified')))
  then raise exception 'recovery enrollment unavailable'; end if;
  update recovery_private.attempts set
    primary_reserved=primary_reserved or p_slot='primary',
    backup_reserved=backup_reserved or p_slot='backup' where id=r.id;
  insert into recovery_private.audit(attempt_id,phase) values(r.id,p_slot||'_reserved');
end $$;

create function public.system_recovery_record_factor_v1(p_user uuid,p_session uuid,p_digest text,p_factor uuid,p_slot text)
returns void language plpgsql security definer set search_path='' as $$
declare r recovery_private.attempts; v_recorded uuid;
begin
  select * into strict r from recovery_private.attempts where auth_user_id=p_user and restricted for update;
  if not public.system_recovery_access_v1(p_user,p_session,p_digest) or r.phase<>'enrolling'
    or p_slot is null or p_slot not in ('primary','backup') then raise exception 'recovery unavailable'; end if;
  v_recorded:=case when p_slot='primary' then r.primary_factor else r.backup_factor end;
  if v_recorded=p_factor then return; end if;
  if not (case when p_slot='primary' then r.primary_reserved else r.backup_reserved end)
    or v_recorded is not null or not exists(select 1 from auth.mfa_factors f where f.id=p_factor
    and f.user_id=p_user and f.factor_type='totp' and f.status='unverified' and f.created_at>=r.claimed_at)
    or (p_slot='primary' and exists(select 1 from auth.mfa_factors where user_id=p_user and status='verified'))
    or (p_slot='backup' and (r.primary_factor is null or r.primary_factor=p_factor or not exists(
      select 1 from auth.mfa_factors where id=r.primary_factor and user_id=p_user and status='verified')))
  then raise exception 'factor does not belong to recovery'; end if;
  update recovery_private.attempts set
    primary_factor=case when p_slot='primary' then p_factor else primary_factor end,
    backup_factor=case when p_slot='backup' then p_factor else backup_factor end where id=r.id;
  insert into recovery_private.audit(attempt_id,phase) values(r.id,p_slot||'_recorded');
end $$;

create function public.system_recovery_prepare_completion_v1(p_user uuid,p_session uuid,p_digest text)
returns uuid language plpgsql security definer set search_path='' as $$
declare r recovery_private.attempts;
begin
  select * into strict r from recovery_private.attempts where auth_user_id=p_user and restricted for update;
  if not public.system_recovery_access_v1(p_user,p_session,p_digest) or r.phase<>'enrolling'
    or r.primary_factor is null or r.backup_factor is null
    or (select count(*) from auth.mfa_factors where user_id=p_user and status='verified'
      and id in (r.primary_factor,r.backup_factor))<>2
    or exists(select 1 from auth.mfa_factors where user_id=p_user and status='verified'
      and id not in (r.primary_factor,r.backup_factor))
  then raise exception 'recovery completion unavailable'; end if;
  update recovery_private.attempts set phase='completing', prepared_security_version=(select security_version from public.staff_users where supabase_auth_user_id=p_user) where id=r.id;
  insert into recovery_private.audit(attempt_id,phase) values(r.id,'completing');
  return r.id;
end $$;

-- Call only after the server confirms the provider password update. This wraps
-- the existing transition and durably associates its result with this attempt.
create function public.system_recovery_password_transition_v1(p_id uuid,p_user uuid,p_source text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r recovery_private.attempts; result jsonb;
begin
  select * into strict r from recovery_private.attempts where id=p_id for update;
  if (r.auth_user_id,r.source_commit) is distinct from (p_user,p_source)
    or r.phase<>'completing' or r.expires_at<=clock_timestamp()
    or exists(select 1 from auth.sessions where user_id=p_user)
  then raise exception 'password transition unavailable'; end if;
  if r.password_transition is not null then return r.password_transition; end if;
  if not exists(select 1 from public.staff_users where supabase_auth_user_id=p_user
    and security_version=r.prepared_security_version and mfa_required=true)
  then raise exception 'concurrent account security change'; end if;
  select to_jsonb(t) into strict result from public.complete_staff_password_reset_security_v2(p_user) t;
  update recovery_private.attempts set password_transition=result where id=p_id;
  insert into recovery_private.audit(attempt_id,phase) values(p_id,'password_transition');
  return result;
end $$;

create function public.system_recovery_complete_v1(p_id uuid,p_user uuid,p_source text)
returns void language plpgsql security definer set search_path='' as $$
declare r recovery_private.attempts;
begin
  select * into strict r from recovery_private.attempts where id=p_id for update;
  if (r.auth_user_id,r.source_commit) is distinct from (p_user,p_source) then raise exception 'recovery identity mismatch'; end if;
  if r.phase='completed' then return; end if;
  if r.phase<>'completing' or r.expires_at<=clock_timestamp() or r.password_transition is null or exists(select 1 from auth.sessions where user_id=p_user)
    or (select count(*) from auth.mfa_factors where user_id=p_user and status='verified'
      and id in (r.primary_factor,r.backup_factor))<>2
    or exists(select 1 from auth.mfa_factors where user_id=p_user and status='verified'
      and id not in (r.primary_factor,r.backup_factor))
    or not exists(select 1 from public.staff_users s join auth.users u on u.id=s.supabase_auth_user_id
      where u.id=p_user and s.status='active' and s.mfa_required=true
      and s.security_version=r.prepared_security_version+1
      and s.security_version=(r.password_transition->>'security_version')::bigint
      and (u.raw_app_meta_data->>'security_version')::bigint=s.security_version)
  then raise exception 'recovery security transition incomplete'; end if;
  update recovery_private.attempts set phase='completed',restricted=false,grant_digest=null where id=p_id;
  insert into recovery_private.audit(attempt_id,phase) values(p_id,'completed');
  insert into recovery_private.outbox(attempt_id,kind) values(p_id,'completed');
end $$;

do $$ declare f record; begin
  for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace
    and proname like 'system_recovery_%_v1' loop
    execute format('revoke all on function %s from public, anon, authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
commit;

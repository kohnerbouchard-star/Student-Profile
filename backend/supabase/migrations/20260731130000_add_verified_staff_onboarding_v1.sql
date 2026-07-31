begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

alter table public.staff_users
  add column if not exists email_verification_source text not null
    default 'legacy_autoconfirmed';

alter table public.staff_users
  drop constraint if exists staff_users_status_check,
  add constraint staff_users_status_check check (
    status in ('onboarding', 'active', 'suspended', 'disabled', 'compromised')
  ),
  drop constraint if exists staff_users_security_state_check,
  add constraint staff_users_security_state_check check (
    (status in ('onboarding', 'active') and suspended_at is null and compromised_at is null)
    or (status = 'suspended' and suspended_at is not null)
    or (status = 'disabled')
    or (status = 'compromised' and compromised_at is not null)
  ),
  drop constraint if exists staff_users_email_verification_source_check,
  add constraint staff_users_email_verification_source_check check (
    email_verification_source in (
      'legacy_autoconfirmed',
      'signup_confirmation',
      'verified_email_change'
    )
  );

comment on column public.staff_users.email_verification_source is
  'How mailbox ownership was established. Legacy auto-confirmed users remain usable but are distinguishable from confirmed signups.';

create table if not exists private.staff_signup_requests (
  id uuid primary key default gen_random_uuid(),
  email_key text not null,
  normalized_email text not null,
  display_name text not null,
  continuation_handle_hash text not null,
  supabase_auth_user_id uuid null references auth.users(id) on delete cascade,
  status text not null default 'initializing',
  expires_at timestamptz not null,
  resend_not_before timestamptz not null default clock_timestamp(),
  resend_count integer not null default 0,
  staff_user_id uuid null references public.staff_users(id) on delete set null,
  last_failure_code text null,
  email_verified_at timestamptz null,
  completed_at timestamptz null,
  cancelled_at timestamptz null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint staff_signup_requests_email_key_check check (
    email_key ~ '^[0-9a-f]{64}$'
  ),
  constraint staff_signup_requests_email_check check (
    length(normalized_email) between 3 and 320
    and normalized_email = lower(btrim(normalized_email))
    and normalized_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  ),
  constraint staff_signup_requests_display_name_check check (
    length(btrim(display_name)) between 1 and 120
  ),
  constraint staff_signup_requests_handle_hash_check check (
    continuation_handle_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint staff_signup_requests_status_check check (
    status in (
      'initializing',
      'pending_email_verification',
      'email_verified',
      'staff_identity_activated',
      'completed',
      'cancelled',
      'expired',
      'cleanup_required',
      'security_hold'
    )
  ),
  constraint staff_signup_requests_resend_count_check check (
    resend_count between 0 and 100
  ),
  constraint staff_signup_requests_expiry_check check (
    expires_at > created_at
  ),
  constraint staff_signup_requests_completion_check check (
    (status = 'completed' and completed_at is not null and staff_user_id is not null)
    or status <> 'completed'
  )
);

create unique index if not exists staff_signup_requests_active_email_uidx
  on private.staff_signup_requests (email_key)
  where status in (
    'initializing',
    'pending_email_verification',
    'email_verified',
    'staff_identity_activated'
  );

create unique index if not exists staff_signup_requests_auth_user_uidx
  on private.staff_signup_requests (supabase_auth_user_id)
  where supabase_auth_user_id is not null;

create unique index if not exists staff_signup_requests_handle_uidx
  on private.staff_signup_requests (continuation_handle_hash);

create index if not exists staff_signup_requests_expiry_idx
  on private.staff_signup_requests (status, expires_at);

alter table private.staff_signup_requests enable row level security;
alter table private.staff_signup_requests force row level security;
revoke all on table private.staff_signup_requests
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on table private.staff_signup_requests
  to service_role;

create or replace function public.claim_staff_signup_identity_v1(
  p_email_key text,
  p_normalized_email text,
  p_display_name text,
  p_continuation_handle_hash text,
  p_expires_at timestamptz
)
returns table (
  decision text,
  signup_request_id uuid,
  verification_expires_at timestamptz,
  send_verification boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_existing private.staff_signup_requests%rowtype;
  v_auth_user auth.users%rowtype;
  v_staff_user_id uuid;
begin
  if p_email_key !~ '^[0-9a-f]{64}$'
    or p_continuation_handle_hash !~ '^[0-9a-f]{64}$'
    or length(p_normalized_email) not between 3 and 320
    or p_normalized_email <> lower(btrim(p_normalized_email))
    or length(btrim(p_display_name)) not between 1 and 120
    or p_expires_at <= v_now
    or p_expires_at > v_now + interval '48 hours'
  then
    raise exception using errcode = '22023', message = 'invalid staff signup claim';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_email_key, 946313));

  update private.staff_signup_requests
  set status = 'expired', updated_at = v_now
  where email_key = p_email_key
    and status in (
      'initializing',
      'pending_email_verification',
      'email_verified',
      'staff_identity_activated'
    )
    and expires_at <= v_now;

  select staff.id
  into v_staff_user_id
  from public.staff_users as staff
  where lower(btrim(staff.email)) = p_normalized_email
  limit 1;

  if v_staff_user_id is not null then
    return query select
      'existing_verified_identity'::text,
      null::uuid,
      p_expires_at,
      false;
    return;
  end if;

  select auth_user.*
  into v_auth_user
  from auth.users as auth_user
  where lower(btrim(auth_user.email)) = p_normalized_email
  order by auth_user.created_at asc
  limit 1;

  select request_row.*
  into v_existing
  from private.staff_signup_requests as request_row
  where request_row.email_key = p_email_key
    and request_row.status in (
      'initializing',
      'pending_email_verification',
      'email_verified',
      'staff_identity_activated'
    )
  for update;

  if v_auth_user.id is not null and v_auth_user.email_confirmed_at is not null then
    return query select
      'existing_verified_identity'::text,
      null::uuid,
      p_expires_at,
      false;
    return;
  end if;

  if v_existing.id is not null then
    if v_now >= v_existing.resend_not_before
      and v_existing.status = 'pending_email_verification'
      and v_existing.resend_count < 20
    then
      update private.staff_signup_requests
      set
        resend_not_before = v_now + interval '60 seconds',
        resend_count = resend_count + 1,
        updated_at = v_now
      where id = v_existing.id;
      return query select
        'resume_pending'::text,
        v_existing.id,
        v_existing.expires_at,
        true;
    else
      return query select
        'resume_pending'::text,
        v_existing.id,
        v_existing.expires_at,
        false;
    end if;
    return;
  end if;

  if v_auth_user.id is not null then
    return query select
      'security_hold'::text,
      null::uuid,
      p_expires_at,
      false;
    return;
  end if;

  insert into private.staff_signup_requests (
    email_key,
    normalized_email,
    display_name,
    continuation_handle_hash,
    status,
    expires_at,
    resend_not_before,
    resend_count
  ) values (
    p_email_key,
    p_normalized_email,
    btrim(p_display_name),
    p_continuation_handle_hash,
    'initializing',
    p_expires_at,
    v_now + interval '60 seconds',
    1
  )
  returning id, expires_at
  into signup_request_id, verification_expires_at;

  decision := 'create_new';
  send_verification := true;
  return next;
end;
$$;

create or replace function public.attach_staff_signup_auth_user_v1(
  p_signup_request_id uuid,
  p_auth_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_request private.staff_signup_requests%rowtype;
  v_auth_email text;
begin
  select request_row.*
  into v_request
  from private.staff_signup_requests as request_row
  where request_row.id = p_signup_request_id
  for update;

  if v_request.id is null
    or v_request.status <> 'initializing'
    or v_request.expires_at <= clock_timestamp()
  then
    return false;
  end if;

  select lower(btrim(auth_user.email))
  into v_auth_email
  from auth.users as auth_user
  where auth_user.id = p_auth_user_id;

  if v_auth_email is null or v_auth_email <> v_request.normalized_email then
    return false;
  end if;

  update private.staff_signup_requests
  set
    supabase_auth_user_id = p_auth_user_id,
    status = 'pending_email_verification',
    updated_at = clock_timestamp()
  where id = v_request.id;

  return true;
end;
$$;

create or replace function public.claim_staff_signup_resend_v1(
  p_continuation_handle_hash text
)
returns table (
  normalized_email text,
  allowed boolean,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_request private.staff_signup_requests%rowtype;
begin
  if p_continuation_handle_hash !~ '^[0-9a-f]{64}$' then
    return query select ''::text, false, 60;
    return;
  end if;

  select request_row.*
  into v_request
  from private.staff_signup_requests as request_row
  where request_row.continuation_handle_hash = p_continuation_handle_hash
  for update;

  if v_request.id is null
    or v_request.status <> 'pending_email_verification'
    or v_request.expires_at <= v_now
    or v_request.resend_count >= 20
  then
    return query select ''::text, false, 60;
    return;
  end if;

  if v_request.resend_not_before > v_now then
    return query select
      ''::text,
      false,
      greatest(1, ceil(extract(epoch from (v_request.resend_not_before - v_now))))::integer;
    return;
  end if;

  update private.staff_signup_requests
  set
    resend_not_before = v_now + interval '60 seconds',
    resend_count = resend_count + 1,
    updated_at = v_now
  where id = v_request.id;

  return query select v_request.normalized_email, true, 60;
end;
$$;

create or replace function public.cancel_staff_signup_v1(
  p_continuation_handle_hash text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_auth_user_id uuid;
begin
  if p_continuation_handle_hash !~ '^[0-9a-f]{64}$' then
    return null;
  end if;

  update private.staff_signup_requests
  set
    status = 'cancelled',
    cancelled_at = clock_timestamp(),
    updated_at = clock_timestamp()
  where continuation_handle_hash = p_continuation_handle_hash
    and status in ('initializing', 'pending_email_verification')
  returning supabase_auth_user_id into v_auth_user_id;

  return v_auth_user_id;
end;
$$;

create or replace function public.activate_verified_staff_identity_v1(
  p_auth_user_id uuid
)
returns table (
  staff_user_id uuid,
  staff_email text,
  staff_display_name text,
  staff_status text,
  staff_role text,
  permission_version integer,
  security_version bigint,
  mfa_required boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_request private.staff_signup_requests%rowtype;
  v_auth_user auth.users%rowtype;
  v_staff public.staff_users%rowtype;
begin
  select auth_user.*
  into v_auth_user
  from auth.users as auth_user
  where auth_user.id = p_auth_user_id
  for update;

  if v_auth_user.id is null or v_auth_user.email_confirmed_at is null then
    return;
  end if;

  select request_row.*
  into v_request
  from private.staff_signup_requests as request_row
  where request_row.supabase_auth_user_id = p_auth_user_id
    and request_row.status in (
      'pending_email_verification',
      'email_verified',
      'staff_identity_activated'
    )
    and request_row.expires_at > v_now
  for update;

  if v_request.id is null
    or lower(btrim(v_auth_user.email)) <> v_request.normalized_email
  then
    return;
  end if;

  update private.staff_signup_requests
  set
    status = 'email_verified',
    email_verified_at = coalesce(email_verified_at, v_now),
    updated_at = v_now
  where id = v_request.id;

  select staff.*
  into v_staff
  from public.staff_users as staff
  where staff.supabase_auth_user_id = p_auth_user_id
  for update;

  if v_staff.id is null then
    insert into public.staff_users (
      supabase_auth_user_id,
      email,
      display_name,
      status,
      role,
      permission_version,
      security_version,
      mfa_required,
      email_verification_source
    ) values (
      p_auth_user_id,
      v_request.normalized_email,
      v_request.display_name,
      'onboarding',
      'game_admin',
      1,
      1,
      true,
      'signup_confirmation'
    )
    returning * into v_staff;
  end if;

  update private.staff_signup_requests
  set
    status = 'staff_identity_activated',
    staff_user_id = v_staff.id,
    updated_at = v_now
  where id = v_request.id;

  select staff.*
  into v_staff
  from public.staff_users as staff
  where staff.id = v_staff.id;

  return query select
    v_staff.id,
    v_staff.email,
    v_staff.display_name,
    v_staff.status,
    v_staff.role,
    v_staff.permission_version,
    v_staff.security_version,
    v_staff.mfa_required;
end;
$$;

create or replace function public.complete_staff_onboarding_v1(
  p_staff_user_id uuid,
  p_game_session_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if not exists (
    select 1
    from public.game_sessions as game
    where game.id = p_game_session_id
      and game.owner_staff_user_id = p_staff_user_id
      and game.status = 'active'
  ) then
    return false;
  end if;

  update public.staff_users
  set status = 'active', updated_at = clock_timestamp()
  where id = p_staff_user_id
    and status in ('onboarding', 'active');

  update private.staff_signup_requests
  set
    status = 'completed',
    completed_at = coalesce(completed_at, clock_timestamp()),
    updated_at = clock_timestamp()
  where staff_user_id = p_staff_user_id
    and status = 'staff_identity_activated';

  return exists (
    select 1 from public.staff_users
    where id = p_staff_user_id and status = 'active'
  );
end;
$$;

create or replace function public.claim_expired_staff_signup_cleanup_v1(
  p_limit integer default 100
)
returns table (
  signup_request_id uuid,
  supabase_auth_user_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  return query
  with claimed as (
    select request_row.id
    from private.staff_signup_requests as request_row
    where request_row.status in ('initializing', 'pending_email_verification')
      and request_row.expires_at <= clock_timestamp()
    order by request_row.expires_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  )
  update private.staff_signup_requests as request_row
  set status = 'expired', updated_at = clock_timestamp()
  from claimed
  where request_row.id = claimed.id
  returning request_row.id, request_row.supabase_auth_user_id;
end;
$$;

revoke all on function public.claim_staff_signup_identity_v1(text, text, text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.attach_staff_signup_auth_user_v1(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.claim_staff_signup_resend_v1(text)
  from public, anon, authenticated;
revoke all on function public.cancel_staff_signup_v1(text)
  from public, anon, authenticated;
revoke all on function public.activate_verified_staff_identity_v1(uuid)
  from public, anon, authenticated;
revoke all on function public.complete_staff_onboarding_v1(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.claim_expired_staff_signup_cleanup_v1(integer)
  from public, anon, authenticated;

grant execute on function public.claim_staff_signup_identity_v1(text, text, text, text, timestamptz)
  to service_role;
grant execute on function public.attach_staff_signup_auth_user_v1(uuid, uuid)
  to service_role;
grant execute on function public.claim_staff_signup_resend_v1(text)
  to service_role;
grant execute on function public.cancel_staff_signup_v1(text)
  to service_role;
grant execute on function public.activate_verified_staff_identity_v1(uuid)
  to service_role;
grant execute on function public.complete_staff_onboarding_v1(uuid, uuid)
  to service_role;
grant execute on function public.claim_expired_staff_signup_cleanup_v1(integer)
  to service_role;

comment on table private.staff_signup_requests is
  'Private, service-owned lifecycle for one verified administrator identity per normalized email. No license or game configuration is stored here.';
comment on function public.claim_staff_signup_identity_v1(text, text, text, text, timestamptz) is
  'Serializes anonymous signup by normalized email before any Supabase Auth user is created.';
comment on function public.activate_verified_staff_identity_v1(uuid) is
  'Creates the restricted onboarding staff identity only after Supabase reports confirmed mailbox ownership.';
comment on function public.complete_staff_onboarding_v1(uuid, uuid) is
  'Activates an onboarding administrator only after a successfully owned active game exists.';

commit;

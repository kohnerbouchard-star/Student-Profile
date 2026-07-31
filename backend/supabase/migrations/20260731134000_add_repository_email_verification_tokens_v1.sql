begin;

alter table private.staff_signup_requests
  add column if not exists verification_token_hash text null,
  add column if not exists verification_token_issued_at timestamptz null,
  add column if not exists verification_token_expires_at timestamptz null,
  add column if not exists verification_token_consumed_at timestamptz null,
  add column if not exists verification_delivery_version integer not null default 0;

alter table private.staff_signup_requests
  drop constraint if exists staff_signup_requests_verification_token_hash_check,
  add constraint staff_signup_requests_verification_token_hash_check check (
    verification_token_hash is null
    or verification_token_hash ~ '^[0-9a-f]{64}$'
  ),
  drop constraint if exists staff_signup_requests_verification_token_window_check,
  add constraint staff_signup_requests_verification_token_window_check check (
    (
      verification_token_hash is null
      and verification_token_issued_at is null
      and verification_token_expires_at is null
    ) or (
      verification_token_hash is not null
      and verification_token_issued_at is not null
      and verification_token_expires_at is not null
      and verification_token_expires_at > verification_token_issued_at
      and verification_token_expires_at <= expires_at
    )
  ),
  drop constraint if exists staff_signup_requests_verification_delivery_version_check,
  add constraint staff_signup_requests_verification_delivery_version_check check (
    verification_delivery_version between 0 and 100
  ),
  drop constraint if exists staff_signup_requests_verification_consumed_check,
  add constraint staff_signup_requests_verification_consumed_check check (
    verification_token_consumed_at is null
    or email_verified_at is not null
  );

create unique index if not exists staff_signup_requests_verification_token_uidx
  on private.staff_signup_requests (verification_token_hash)
  where verification_token_hash is not null;

create or replace function public.prepare_staff_signup_verification_delivery_v1(
  p_signup_request_id uuid,
  p_auth_user_id uuid,
  p_token_hash text,
  p_token_expires_at timestamptz
)
returns table (
  normalized_email text,
  delivery_version integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_request private.staff_signup_requests%rowtype;
  v_email_confirmed_at timestamptz;
begin
  if p_signup_request_id is null
    or p_auth_user_id is null
    or p_token_hash !~ '^[0-9a-f]{64}$'
    or p_token_expires_at <= v_now
    or p_token_expires_at > v_now + interval '24 hours'
  then
    return;
  end if;

  select request_row.*
  into v_request
  from private.staff_signup_requests as request_row
  where request_row.id = p_signup_request_id
    and request_row.supabase_auth_user_id = p_auth_user_id
    and request_row.status = 'pending_email_verification'
    and request_row.expires_at > v_now
  for update;

  if v_request.id is null or p_token_expires_at > v_request.expires_at then
    return;
  end if;

  select auth_user.email_confirmed_at
  into v_email_confirmed_at
  from auth.users as auth_user
  where auth_user.id = p_auth_user_id
    and lower(btrim(auth_user.email)) = v_request.normalized_email
  for update;

  if not found or v_email_confirmed_at is not null then
    return;
  end if;

  update private.staff_signup_requests
  set
    verification_token_hash = p_token_hash,
    verification_token_issued_at = v_now,
    verification_token_expires_at = p_token_expires_at,
    verification_token_consumed_at = null,
    verification_delivery_version = verification_delivery_version + 1,
    resend_not_before = greatest(resend_not_before, v_now + interval '60 seconds'),
    updated_at = v_now
  where id = v_request.id
  returning
    private.staff_signup_requests.normalized_email,
    private.staff_signup_requests.verification_delivery_version
  into normalized_email, delivery_version;

  return next;
end;
$$;

revoke all on function public.prepare_staff_signup_verification_delivery_v1(
  uuid, uuid, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.prepare_staff_signup_verification_delivery_v1(
  uuid, uuid, text, timestamptz
) to service_role;

drop function if exists public.claim_staff_signup_resend_v1(text);

create function public.claim_staff_signup_resend_v1(
  p_continuation_handle_hash text,
  p_token_hash text,
  p_token_expires_at timestamptz
)
returns table (
  normalized_email text,
  signup_request_id uuid,
  allowed boolean,
  retry_after_seconds integer,
  delivery_version integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_request private.staff_signup_requests%rowtype;
  v_email_confirmed_at timestamptz;
begin
  if p_continuation_handle_hash !~ '^[0-9a-f]{64}$'
    or p_token_hash !~ '^[0-9a-f]{64}$'
    or p_token_expires_at <= v_now
    or p_token_expires_at > v_now + interval '24 hours'
  then
    return;
  end if;

  select request_row.*
  into v_request
  from private.staff_signup_requests as request_row
  where request_row.continuation_handle_hash = p_continuation_handle_hash
    and request_row.status = 'pending_email_verification'
    and request_row.expires_at > v_now
  for update;

  if v_request.id is null or p_token_expires_at > v_request.expires_at then
    return;
  end if;

  select auth_user.email_confirmed_at
  into v_email_confirmed_at
  from auth.users as auth_user
  where auth_user.id = v_request.supabase_auth_user_id
    and lower(btrim(auth_user.email)) = v_request.normalized_email
  for update;

  if not found or v_email_confirmed_at is not null then
    return;
  end if;

  normalized_email := v_request.normalized_email;
  signup_request_id := v_request.id;
  delivery_version := v_request.verification_delivery_version;

  if v_now < v_request.resend_not_before or v_request.resend_count >= 20 then
    allowed := false;
    retry_after_seconds := greatest(
      1,
      ceil(extract(epoch from greatest(
        interval '1 second',
        v_request.resend_not_before - v_now
      )))::integer
    );
    return next;
    return;
  end if;

  update private.staff_signup_requests
  set
    verification_token_hash = p_token_hash,
    verification_token_issued_at = v_now,
    verification_token_expires_at = p_token_expires_at,
    verification_token_consumed_at = null,
    verification_delivery_version = verification_delivery_version + 1,
    resend_not_before = v_now + interval '60 seconds',
    resend_count = resend_count + 1,
    updated_at = v_now
  where id = v_request.id
  returning private.staff_signup_requests.verification_delivery_version
  into delivery_version;

  allowed := true;
  retry_after_seconds := 60;
  return next;
end;
$$;

revoke all on function public.claim_staff_signup_resend_v1(
  text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.claim_staff_signup_resend_v1(
  text, text, timestamptz
) to service_role;

create or replace function public.resolve_staff_signup_verification_token_v1(
  p_token_hash text
)
returns table (
  signup_request_id uuid,
  auth_user_id uuid,
  decision text
)
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_request private.staff_signup_requests%rowtype;
  v_email_confirmed_at timestamptz;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_token_hash, 631149));

  select request_row.*
  into v_request
  from private.staff_signup_requests as request_row
  where request_row.verification_token_hash = p_token_hash
    and request_row.status in ('pending_email_verification', 'email_verified')
    and request_row.expires_at > v_now
  for update;

  if v_request.id is null
    or v_request.verification_token_expires_at is null
    or v_request.verification_token_expires_at <= v_now
  then
    return;
  end if;

  select auth_user.email_confirmed_at
  into v_email_confirmed_at
  from auth.users as auth_user
  where auth_user.id = v_request.supabase_auth_user_id
    and lower(btrim(auth_user.email)) = v_request.normalized_email
  for update;

  if not found then
    return;
  end if;

  signup_request_id := v_request.id;
  auth_user_id := v_request.supabase_auth_user_id;

  if v_email_confirmed_at is not null then
    update private.staff_signup_requests
    set
      status = 'email_verified',
      email_verified_at = coalesce(email_verified_at, v_email_confirmed_at),
      verification_token_hash = null,
      verification_token_issued_at = null,
      verification_token_expires_at = null,
      verification_token_consumed_at = coalesce(verification_token_consumed_at, v_now),
      updated_at = v_now
    where id = v_request.id;
    decision := 'already_verified';
  else
    decision := 'confirm';
  end if;

  return next;
end;
$$;

revoke all on function public.resolve_staff_signup_verification_token_v1(text)
  from public, anon, authenticated;
grant execute on function public.resolve_staff_signup_verification_token_v1(text)
  to service_role;

create or replace function public.complete_staff_signup_email_verification_v1(
  p_signup_request_id uuid,
  p_auth_user_id uuid,
  p_token_hash text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_request private.staff_signup_requests%rowtype;
  v_email_confirmed_at timestamptz;
begin
  if p_signup_request_id is null
    or p_auth_user_id is null
    or p_token_hash !~ '^[0-9a-f]{64}$'
  then
    return false;
  end if;

  select request_row.*
  into v_request
  from private.staff_signup_requests as request_row
  where request_row.id = p_signup_request_id
    and request_row.supabase_auth_user_id = p_auth_user_id
    and request_row.status in ('pending_email_verification', 'email_verified')
  for update;

  if v_request.id is null then
    return false;
  end if;

  select auth_user.email_confirmed_at
  into v_email_confirmed_at
  from auth.users as auth_user
  where auth_user.id = p_auth_user_id
    and lower(btrim(auth_user.email)) = v_request.normalized_email
  for update;

  if not found or v_email_confirmed_at is null then
    return false;
  end if;

  if v_request.status = 'email_verified' then
    return true;
  end if;

  if v_request.verification_token_hash <> p_token_hash
    or v_request.verification_token_expires_at is null
    or v_request.verification_token_expires_at <= v_now
  then
    return false;
  end if;

  update private.staff_signup_requests
  set
    status = 'email_verified',
    email_verified_at = v_email_confirmed_at,
    verification_token_hash = null,
    verification_token_issued_at = null,
    verification_token_expires_at = null,
    verification_token_consumed_at = v_now,
    updated_at = v_now
  where id = v_request.id;

  return true;
end;
$$;

revoke all on function public.complete_staff_signup_email_verification_v1(
  uuid, uuid, text
) from public, anon, authenticated;
grant execute on function public.complete_staff_signup_email_verification_v1(
  uuid, uuid, text
) to service_role;

comment on column private.staff_signup_requests.verification_token_hash is
  'SHA-256 hash of the current repository-owned 256-bit mailbox-verification token. Raw tokens are never persisted.';
comment on function public.prepare_staff_signup_verification_delivery_v1(uuid, uuid, text, timestamptz) is
  'Binds the first repository-owned verification token to one unconfirmed Auth identity before transactional email delivery.';
comment on function public.claim_staff_signup_resend_v1(text, text, timestamptz) is
  'Rotates the verification token under continuation-handle authorization and a bounded resend cooldown.';
comment on function public.resolve_staff_signup_verification_token_v1(text) is
  'Validates a current verification token without confirming Auth; only the server-side confirmation function receives the Auth user ID.';
comment on function public.complete_staff_signup_email_verification_v1(uuid, uuid, text) is
  'Finalizes private signup state only after Supabase Auth reports the mailbox as confirmed.';

commit;

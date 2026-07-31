begin;

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

  perform public.cleanup_expired_staff_signup_identity_v1(p_email_key);
  perform pg_advisory_xact_lock(hashtextextended(p_email_key, 946313));

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
    return query select
      'resume_pending'::text,
      v_existing.id,
      v_existing.expires_at,
      false;
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

revoke all on function public.claim_staff_signup_identity_v1(
  text, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.claim_staff_signup_identity_v1(
  text, text, text, text, timestamptz
) to service_role;

drop function if exists public.claim_staff_signup_resend_v1(
  text, text, timestamptz
);

create function public.claim_staff_signup_resend_v1(
  p_continuation_handle_hash text,
  p_token_hash text,
  p_requested_token_expires_at timestamptz
)
returns table (
  normalized_email text,
  display_name text,
  signup_request_id uuid,
  allowed boolean,
  retry_after_seconds integer,
  delivery_version integer,
  token_expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_request private.staff_signup_requests%rowtype;
  v_email_confirmed_at timestamptz;
  v_token_expires_at timestamptz;
begin
  if p_continuation_handle_hash !~ '^[0-9a-f]{64}$'
    or p_token_hash !~ '^[0-9a-f]{64}$'
    or p_requested_token_expires_at <= v_now
    or p_requested_token_expires_at > v_now + interval '24 hours'
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

  if v_request.id is null then
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
  display_name := v_request.display_name;
  signup_request_id := v_request.id;
  delivery_version := v_request.verification_delivery_version;
  token_expires_at := least(p_requested_token_expires_at, v_request.expires_at);

  if v_now < v_request.resend_not_before or v_request.resend_count >= 20 then
    allowed := false;
    retry_after_seconds := greatest(
      1,
      ceil(extract(epoch from (v_request.resend_not_before - v_now)))::integer
    );
    return next;
    return;
  end if;

  v_token_expires_at := least(p_requested_token_expires_at, v_request.expires_at);
  if v_token_expires_at <= v_now then
    return;
  end if;

  update private.staff_signup_requests
  set
    verification_token_hash = p_token_hash,
    verification_token_issued_at = v_now,
    verification_token_expires_at = v_token_expires_at,
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
  token_expires_at := v_token_expires_at;
  return next;
end;
$$;

revoke all on function public.claim_staff_signup_resend_v1(
  text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.claim_staff_signup_resend_v1(
  text, text, timestamptz
) to service_role;

comment on function public.claim_staff_signup_identity_v1(
  text, text, text, text, timestamptz
) is
  'Serializes public signup. Duplicate pending submissions never rotate or resend verification; only the continuation-handle endpoint may do so.';
comment on function public.claim_staff_signup_resend_v1(
  text, text, timestamptz
) is
  'Rotates one repository-owned verification token under continuation-handle authorization and returns only bounded delivery metadata.';

commit;

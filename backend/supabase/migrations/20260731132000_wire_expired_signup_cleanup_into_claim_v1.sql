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

revoke all on function public.claim_staff_signup_identity_v1(text, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.claim_staff_signup_identity_v1(text, text, text, text, timestamptz)
  to service_role;

comment on function public.claim_staff_signup_identity_v1(text, text, text, text, timestamptz) is
  'Serializes signup by normalized email and atomically clears an expired unconfirmed identity before admitting a replacement request.';

commit;

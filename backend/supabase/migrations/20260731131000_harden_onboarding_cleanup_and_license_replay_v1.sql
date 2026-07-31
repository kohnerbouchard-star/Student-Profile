begin;

alter table public.entitlements
  add column if not exists redemption_request_key text null,
  add column if not exists redemption_request_fingerprint text null;

alter table public.entitlements
  drop constraint if exists entitlements_redemption_request_pair_check,
  add constraint entitlements_redemption_request_pair_check check (
    (redemption_request_key is null and redemption_request_fingerprint is null)
    or (
      redemption_request_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
      and redemption_request_fingerprint ~ '^[0-9a-f]{64}$'
    )
  );

create unique index if not exists entitlements_staff_redemption_request_uidx
  on public.entitlements (staff_user_id, redemption_request_key)
  where redemption_request_key is not null;

comment on column public.entitlements.redemption_request_key is
  'Server-validated idempotency key for one authenticated Staff game activation request.';
comment on column public.entitlements.redemption_request_fingerprint is
  'SHA-256 fingerprint binding the idempotency key to the purchase-code verifier, game name and game settings.';

create or replace function public.cleanup_expired_staff_signup_identity_v1(
  p_email_key text
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
  v_deleted_auth_user_id uuid;
begin
  if p_email_key !~ '^[0-9a-f]{64}$' then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_email_key, 946313));

  select request_row.*
  into v_request
  from private.staff_signup_requests as request_row
  where request_row.email_key = p_email_key
    and request_row.status in (
      'initializing',
      'pending_email_verification',
      'expired',
      'cleanup_required'
    )
    and request_row.expires_at <= v_now
  order by request_row.created_at asc
  limit 1
  for update;

  if v_request.id is null then
    return false;
  end if;

  if v_request.supabase_auth_user_id is null then
    delete from private.staff_signup_requests
    where id = v_request.id;
    return true;
  end if;

  select auth_user.email_confirmed_at
  into v_email_confirmed_at
  from auth.users as auth_user
  where auth_user.id = v_request.supabase_auth_user_id
  for update;

  if not found then
    delete from private.staff_signup_requests
    where id = v_request.id;
    return true;
  end if;

  if v_email_confirmed_at is not null then
    update private.staff_signup_requests
    set
      status = 'security_hold',
      email_verified_at = coalesce(email_verified_at, v_email_confirmed_at),
      last_failure_code = 'expired_after_email_confirmation',
      updated_at = v_now
    where id = v_request.id;
    return false;
  end if;

  delete from auth.users
  where id = v_request.supabase_auth_user_id
    and email_confirmed_at is null
  returning id into v_deleted_auth_user_id;

  return v_deleted_auth_user_id is not null;
end;
$$;

revoke all on function public.cleanup_expired_staff_signup_identity_v1(text)
  from public, anon, authenticated;
grant execute on function public.cleanup_expired_staff_signup_identity_v1(text)
  to service_role;

create or replace function public.cancel_staff_signup_v1(
  p_continuation_handle_hash text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_request private.staff_signup_requests%rowtype;
  v_email_confirmed_at timestamptz;
  v_deleted_auth_user_id uuid;
begin
  if p_continuation_handle_hash !~ '^[0-9a-f]{64}$' then
    return null;
  end if;

  select request_row.*
  into v_request
  from private.staff_signup_requests as request_row
  where request_row.continuation_handle_hash = p_continuation_handle_hash
    and request_row.status in ('initializing', 'pending_email_verification')
  for update;

  if v_request.id is null then
    return null;
  end if;

  if v_request.supabase_auth_user_id is null then
    delete from private.staff_signup_requests
    where id = v_request.id;
    return null;
  end if;

  select auth_user.email_confirmed_at
  into v_email_confirmed_at
  from auth.users as auth_user
  where auth_user.id = v_request.supabase_auth_user_id
  for update;

  if not found then
    delete from private.staff_signup_requests
    where id = v_request.id;
    return null;
  end if;

  if v_email_confirmed_at is not null then
    update private.staff_signup_requests
    set
      status = 'email_verified',
      email_verified_at = coalesce(email_verified_at, v_email_confirmed_at),
      updated_at = clock_timestamp()
    where id = v_request.id;
    return null;
  end if;

  delete from auth.users
  where id = v_request.supabase_auth_user_id
    and email_confirmed_at is null
  returning id into v_deleted_auth_user_id;

  return v_deleted_auth_user_id;
end;
$$;

revoke all on function public.cancel_staff_signup_v1(text)
  from public, anon, authenticated;
grant execute on function public.cancel_staff_signup_v1(text)
  to service_role;

create or replace function public.claim_expired_staff_signup_cleanup_v1(
  p_limit integer default 100
)
returns table (
  signup_request_id uuid,
  supabase_auth_user_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_request record;
  v_email_confirmed_at timestamptz;
begin
  for v_request in
    select
      request_row.id,
      request_row.email_key,
      request_row.supabase_auth_user_id
    from private.staff_signup_requests as request_row
    where request_row.status in (
      'initializing',
      'pending_email_verification',
      'expired',
      'cleanup_required'
    )
      and request_row.expires_at <= clock_timestamp()
    order by request_row.expires_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  loop
    if v_request.supabase_auth_user_id is null then
      delete from private.staff_signup_requests
      where id = v_request.id;
      return query select v_request.id, null::uuid;
      continue;
    end if;

    select auth_user.email_confirmed_at
    into v_email_confirmed_at
    from auth.users as auth_user
    where auth_user.id = v_request.supabase_auth_user_id
    for update;

    if not found then
      delete from private.staff_signup_requests
      where id = v_request.id;
      return query select v_request.id, v_request.supabase_auth_user_id;
      continue;
    end if;

    if v_email_confirmed_at is not null then
      update private.staff_signup_requests
      set
        status = 'security_hold',
        email_verified_at = coalesce(email_verified_at, v_email_confirmed_at),
        last_failure_code = 'expired_after_email_confirmation',
        updated_at = clock_timestamp()
      where id = v_request.id;
      continue;
    end if;

    delete from auth.users
    where id = v_request.supabase_auth_user_id
      and email_confirmed_at is null;
    return query select v_request.id, v_request.supabase_auth_user_id;
  end loop;
end;
$$;

revoke all on function public.claim_expired_staff_signup_cleanup_v1(integer)
  from public, anon, authenticated;
grant execute on function public.claim_expired_staff_signup_cleanup_v1(integer)
  to service_role;

create or replace function public.redeem_purchase_code_for_game(
  p_staff_user_id uuid,
  p_purchase_code_hash text,
  p_game_name text,
  p_game_settings jsonb default '{}'::jsonb,
  p_request_metadata jsonb default '{}'::jsonb
)
returns table (
  game_session_id uuid,
  entitlement_id uuid,
  purchase_code_id uuid,
  purchase_code_status text,
  redeemed_count integer,
  max_redemptions integer,
  activated_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  v_purchase_code public.purchase_codes%rowtype;
  v_entitlement public.entitlements%rowtype;
  v_provisioning jsonb;
  v_verification jsonb;
  v_game_session_id uuid;
  v_next_redeemed_count integer;
  v_next_status text;
  v_activated_at timestamptz := clock_timestamp();
  v_request_id text;
  v_request_fingerprint text;
  v_idempotency_key text;
  v_hash_parts text[];
  v_primary_hash text;
  v_legacy_hash text;
  v_hash_upgraded boolean := false;
begin
  perform public.game_provisioning_preflight_v1('econovaria.beta-seed-pack.v1');

  if p_staff_user_id is null then
    raise exception 'STAFF_USER_REQUIRED' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_purchase_code_hash, ''))) = 0 then
    raise exception 'PURCHASE_CODE_HASH_REQUIRED' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_game_name, ''))) = 0 then
    raise exception 'GAME_NAME_REQUIRED' using errcode = 'P0001';
  end if;
  if jsonb_typeof(coalesce(p_request_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'INVALID_REQUEST_METADATA' using errcode = 'P0001';
  end if;

  v_request_id := btrim(coalesce(p_request_metadata->>'request_id', ''));
  if v_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = 'P0001';
  end if;

  v_request_fingerprint := encode(
    extensions.digest(
      lower(btrim(p_purchase_code_hash)) || '|' ||
      btrim(p_game_name) || '|' ||
      coalesce(p_game_settings, '{}'::jsonb)::text,
      'sha256'
    ),
    'hex'
  );

  perform pg_advisory_xact_lock(hashtextextended(
    p_staff_user_id::text || '|' || v_request_id,
    731991
  ));

  select entitlement_row.*
  into v_entitlement
  from public.entitlements as entitlement_row
  where entitlement_row.staff_user_id = p_staff_user_id
    and entitlement_row.redemption_request_key = v_request_id
  limit 1;

  if v_entitlement.id is not null then
    if v_entitlement.redemption_request_fingerprint <> v_request_fingerprint then
      raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode = 'P0001';
    end if;

    select purchase_code_row.*
    into v_purchase_code
    from public.purchase_codes as purchase_code_row
    where purchase_code_row.id = v_entitlement.purchase_code_id;

    v_game_session_id := v_entitlement.game_session_id;
    v_verification := public.verify_provisioned_game_v1(
      v_game_session_id,
      p_staff_user_id
    );
    if coalesce((v_verification->>'ready')::boolean, false) is not true then
      raise exception 'GAME_PROVISIONING_VERIFICATION_FAILED' using errcode = 'P0001';
    end if;

    return query select
      v_game_session_id,
      v_entitlement.id,
      v_purchase_code.id,
      v_purchase_code.status,
      v_purchase_code.redeemed_count,
      v_purchase_code.max_redemptions,
      v_entitlement.created_at;
    return;
  end if;

  v_hash_parts := string_to_array(lower(btrim(p_purchase_code_hash)), '.');
  if array_length(v_hash_parts, 1) <> 3
    or v_hash_parts[1] <> 'v2'
    or v_hash_parts[2] !~ '^[0-9a-f]{64}$'
    or v_hash_parts[3] !~ '^[0-9a-f]{64}$'
  then
    raise exception 'PURCHASE_CODE_HASH_VERSION_UNSUPPORTED' using errcode = 'P0001';
  end if;
  v_primary_hash := v_hash_parts[2];
  v_legacy_hash := v_hash_parts[3];

  select purchase_code_row.* into v_purchase_code
  from public.purchase_codes as purchase_code_row
  where (
      purchase_code_row.code_hash_version = 'hmac-sha256-v2'
      and purchase_code_row.code_hash = v_primary_hash
    ) or (
      purchase_code_row.code_hash_version = 'sha256-v1'
      and purchase_code_row.code_hash = v_legacy_hash
    )
  order by case
    when purchase_code_row.code_hash_version = 'hmac-sha256-v2' then 0
    else 1
  end
  limit 1
  for update;

  if not found then
    raise exception 'PURCHASE_CODE_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_purchase_code.status = 'expired'
    or (v_purchase_code.expires_at is not null and v_purchase_code.expires_at <= v_activated_at)
  then
    raise exception 'PURCHASE_CODE_EXPIRED' using errcode = 'P0001';
  end if;
  if v_purchase_code.status = 'revoked' then
    raise exception 'PURCHASE_CODE_REVOKED' using errcode = 'P0001';
  end if;
  if v_purchase_code.status <> 'active'
    or v_purchase_code.redeemed_count >= v_purchase_code.max_redemptions
  then
    raise exception 'PURCHASE_CODE_EXHAUSTED' using errcode = 'P0001';
  end if;

  if v_purchase_code.code_hash_version = 'sha256-v1' then
    update public.purchase_codes as purchase_code_row
    set code_hash = v_primary_hash,
        code_hash_version = 'hmac-sha256-v2'
    where purchase_code_row.id = v_purchase_code.id
      and purchase_code_row.code_hash_version = 'sha256-v1'
      and purchase_code_row.code_hash = v_legacy_hash
    returning purchase_code_row.* into v_purchase_code;

    if not found then
      raise exception 'PURCHASE_CODE_HASH_UPGRADE_CONFLICT' using errcode = 'P0001';
    end if;
    v_hash_upgraded := true;
  end if;

  v_idempotency_key := 'license:' || encode(
    extensions.digest(
      p_staff_user_id::text || '|' || v_request_id,
      'sha256'
    ),
    'hex'
  );

  v_provisioning := public.create_provisioned_game_v2(
    p_staff_user_id,
    btrim(p_game_name),
    coalesce(p_game_settings, '{}'::jsonb),
    v_idempotency_key,
    'econovaria.beta-seed-pack.v1'
  );

  if coalesce(v_provisioning->>'outcome', '') in ('failed', 'failed_replay')
    or coalesce(v_provisioning->>'provisioningStatus', '') <> 'ready'
    or nullif(v_provisioning->>'gameSessionId', '') is null
  then
    raise exception 'GAME_PROVISIONING_FAILED' using errcode = 'P0001';
  end if;

  v_game_session_id := (v_provisioning->>'gameSessionId')::uuid;
  v_verification := public.verify_provisioned_game_v1(
    v_game_session_id,
    p_staff_user_id
  );

  if coalesce((v_verification->>'ready')::boolean, false) is not true then
    raise exception 'GAME_PROVISIONING_VERIFICATION_FAILED' using errcode = 'P0001';
  end if;

  v_next_redeemed_count := v_purchase_code.redeemed_count + 1;
  v_next_status := case
    when v_next_redeemed_count >= v_purchase_code.max_redemptions then 'exhausted'
    else 'active'
  end;

  update public.purchase_codes as purchase_code_row
  set redeemed_count = v_next_redeemed_count,
      status = v_next_status
  where purchase_code_row.id = v_purchase_code.id
    and purchase_code_row.status = 'active'
    and purchase_code_row.redeemed_count = v_purchase_code.redeemed_count
  returning purchase_code_row.* into v_purchase_code;

  if not found then
    raise exception 'PURCHASE_CODE_REDEMPTION_CONFLICT' using errcode = 'P0001';
  end if;

  insert into public.entitlements (
    purchase_code_id,
    staff_user_id,
    game_session_id,
    status,
    redemption_request_key,
    redemption_request_fingerprint
  ) values (
    v_purchase_code.id,
    p_staff_user_id,
    v_game_session_id,
    'active',
    v_request_id,
    v_request_fingerprint
  ) returning * into v_entitlement;

  insert into public.audit_log (
    game_session_id, actor_type, actor_id, action, target_type, target_id, metadata
  ) values (
    v_game_session_id,
    'staff_user',
    p_staff_user_id,
    'licensing.purchase_code_redeemed',
    'purchase_code',
    v_purchase_code.id,
    jsonb_build_object(
      'purchase_code_id', v_purchase_code.id,
      'entitlement_id', v_entitlement.id,
      'game_session_id', v_game_session_id,
      'purchase_code_status', v_purchase_code.status,
      'redeemed_count', v_purchase_code.redeemed_count,
      'max_redemptions', v_purchase_code.max_redemptions,
      'hash_version', v_purchase_code.code_hash_version,
      'hash_upgraded', v_hash_upgraded,
      'provisioning', v_verification,
      'request_id', v_request_id,
      'request_fingerprint', v_request_fingerprint,
      'request_source', coalesce(p_request_metadata->>'source', '')
    )
  );

  return query select
    v_game_session_id,
    v_entitlement.id,
    v_purchase_code.id,
    v_purchase_code.status,
    v_purchase_code.redeemed_count,
    v_purchase_code.max_redemptions,
    v_activated_at;
end;
$function$;

revoke all on function public.redeem_purchase_code_for_game(
  uuid, text, text, jsonb, jsonb
) from public, anon, authenticated;

grant execute on function public.redeem_purchase_code_for_game(
  uuid, text, text, jsonb, jsonb
) to service_role;

comment on function public.cleanup_expired_staff_signup_identity_v1(text) is
  'Atomically removes one expired, unconfirmed Auth identity for a normalized-email key; confirmed identities are preserved on security hold.';
comment on function public.cancel_staff_signup_v1(text) is
  'Atomically cancels and deletes only an unconfirmed pending Auth identity; a concurrently confirmed identity is preserved.';
comment on function public.claim_expired_staff_signup_cleanup_v1(integer) is
  'Claims and directly removes expired unconfirmed Auth identities with cascade cleanup while preserving confirmed identities.';
comment on function public.redeem_purchase_code_for_game(uuid, text, text, jsonb, jsonb) is
  'Atomically provisions and redeems one licensed game per Staff idempotency key; exact retries return the original entitlement without another redemption.';

commit;

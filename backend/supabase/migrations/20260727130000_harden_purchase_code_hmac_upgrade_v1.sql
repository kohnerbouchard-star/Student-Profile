-- Replace offline-guessable purchase-code SHA-256 storage with a versioned,
-- keyed HMAC verifier while preserving one-time compatibility for existing
-- codes. The application sends an authenticated v2 envelope containing the
-- primary HMAC digest and the legacy SHA-256 digest. Legacy rows are upgraded
-- atomically while locked for redemption; raw codes and legacy hashes are not
-- retained after the upgrade.

alter table public.purchase_codes
  add column if not exists code_hash_version text not null default 'sha256-v1';

alter table public.purchase_codes
  drop constraint if exists purchase_codes_code_hash_version_check;

alter table public.purchase_codes
  add constraint purchase_codes_code_hash_version_check
  check (code_hash_version in ('sha256-v1', 'hmac-sha256-v2'));

update public.purchase_codes
set code_hash_version = 'sha256-v1'
where code_hash_version is null
   or code_hash_version not in ('sha256-v1', 'hmac-sha256-v2');

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
  v_activated_at timestamptz := now();
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
      p_staff_user_id::text || '|' || v_purchase_code.id::text || '|' ||
      btrim(p_game_name) || '|' || coalesce(p_request_metadata, '{}'::jsonb)::text,
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
    purchase_code_id, staff_user_id, game_session_id, status
  ) values (
    v_purchase_code.id, p_staff_user_id, v_game_session_id, 'active'
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
      'request', coalesce(p_request_metadata, '{}'::jsonb)
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

comment on column public.purchase_codes.code_hash_version is
  'Verifier version for purchase-code digests. sha256-v1 rows are upgraded atomically to hmac-sha256-v2 during successful redemption.';

comment on function public.redeem_purchase_code_for_game(
  uuid, text, text, jsonb, jsonb
) is
  'Atomically redeems purchase codes using a versioned HMAC verifier envelope and upgrades legacy SHA-256 rows without retaining the legacy digest.';

-- Forward-only correction for the first-game licensing path.
--
-- redeem_purchase_code_for_game returns a column named redeemed_count. PL/pgSQL
-- therefore treats an unqualified redeemed_count reference inside the function
-- as ambiguous between the output variable and purchase_codes.redeemed_count.
-- Qualify every purchase-code read/write predicate while preserving the atomic
-- V2 provisioning, verification, entitlement, audit, and permission contracts.

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

  select purchase_code_row.* into v_purchase_code
  from public.purchase_codes as purchase_code_row
  where purchase_code_row.code_hash = btrim(p_purchase_code_hash)
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

comment on function public.redeem_purchase_code_for_game(
  uuid, text, text, jsonb, jsonb
) is
  'Atomically redeems a purchase code only after canonical V2 game provisioning and verification succeed; purchase-code predicates are explicitly qualified to avoid PL/pgSQL output-variable ambiguity.';

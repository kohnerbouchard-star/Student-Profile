-- Game country-economy initialization patch V1.
-- Moves country economy setup into game creation so player creation and store
-- pricing consume initialized state instead of discovering missing setup later.

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
set search_path = public, pg_temp
as $$
declare
  v_purchase_code public.purchase_codes%rowtype;
  v_game_session public.game_sessions%rowtype;
  v_entitlement public.entitlements%rowtype;
  v_difficulty_policy public.difficulty_policy_profiles%rowtype;
  v_settings jsonb := coalesce(p_game_settings, '{}'::jsonb);
  v_resolved_difficulty_preset text;
  v_next_redeemed_count integer;
  v_next_status text;
  v_activated_at timestamptz := now();
begin
  if p_staff_user_id is null then
    raise exception 'STAFF_USER_REQUIRED'
      using errcode = 'P0001';
  end if;

  if length(btrim(coalesce(p_purchase_code_hash, ''))) = 0 then
    raise exception 'PURCHASE_CODE_HASH_REQUIRED'
      using errcode = 'P0001';
  end if;

  if length(btrim(coalesce(p_game_name, ''))) = 0 then
    raise exception 'GAME_NAME_REQUIRED'
      using errcode = 'P0001';
  end if;

  if p_request_metadata is null or jsonb_typeof(p_request_metadata) <> 'object' then
    raise exception 'INVALID_REQUEST_METADATA'
      using errcode = 'P0001';
  end if;

  if p_game_settings is not null and jsonb_typeof(p_game_settings) <> 'object' then
    raise exception 'INVALID_GAME_SETTINGS'
      using errcode = 'P0001';
  end if;

  v_resolved_difficulty_preset := lower(
    coalesce(nullif(btrim(v_settings ->> 'difficulty_preset'), ''), 'standard')
  );

  if v_resolved_difficulty_preset = 'custom' then
    raise exception 'CUSTOM_DIFFICULTY_REQUIRES_ADVANCED_SETTINGS'
      using errcode = 'P0001';
  end if;

  select *
  into v_difficulty_policy
  from public.difficulty_policy_profiles dpp
  where dpp.preset_key = v_resolved_difficulty_preset
    and dpp.status = 'active'
  limit 1;

  if not found then
    raise exception 'DIFFICULTY_POLICY_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  select *
  into v_purchase_code
  from public.purchase_codes
  where code_hash = btrim(p_purchase_code_hash)
  for update;

  if not found then
    raise exception 'PURCHASE_CODE_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  if v_purchase_code.status = 'exhausted' then
    raise exception 'PURCHASE_CODE_EXHAUSTED'
      using errcode = 'P0001';
  end if;

  if v_purchase_code.status = 'expired' then
    raise exception 'PURCHASE_CODE_EXPIRED'
      using errcode = 'P0001';
  end if;

  if v_purchase_code.status = 'revoked' then
    raise exception 'PURCHASE_CODE_REVOKED'
      using errcode = 'P0001';
  end if;

  if v_purchase_code.status <> 'active' then
    raise exception 'PURCHASE_CODE_NOT_ACTIVE'
      using errcode = 'P0001';
  end if;

  if v_purchase_code.expires_at is not null
     and v_purchase_code.expires_at <= v_activated_at then
    raise exception 'PURCHASE_CODE_EXPIRED'
      using errcode = 'P0001';
  end if;

  if v_purchase_code.redeemed_count >= v_purchase_code.max_redemptions then
    raise exception 'PURCHASE_CODE_EXHAUSTED'
      using errcode = 'P0001';
  end if;

  v_next_redeemed_count := v_purchase_code.redeemed_count + 1;

  v_next_status := case
    when v_next_redeemed_count >= v_purchase_code.max_redemptions then 'exhausted'
    else 'active'
  end;

  update public.purchase_codes
  set
    redeemed_count = v_next_redeemed_count,
    status = v_next_status
  where public.purchase_codes.id = v_purchase_code.id
    and public.purchase_codes.status = 'active'
    and public.purchase_codes.redeemed_count = v_purchase_code.redeemed_count
  returning *
  into v_purchase_code;

  if not found then
    raise exception 'PURCHASE_CODE_REDEMPTION_CONFLICT'
      using errcode = 'P0001';
  end if;

  insert into public.game_sessions (
    owner_staff_user_id,
    name,
    status,
    game_join_code_hash,
    game_join_code_status
  )
  values (
    p_staff_user_id,
    btrim(p_game_name),
    'active',
    null,
    'pending'
  )
  returning *
  into v_game_session;

  insert into public.game_settings (
    game_session_id,
    difficulty_preset,
    attendance_window,
    business_market_window,
    stock_market_window,
    news_schedule
  )
  values (
    v_game_session.id,
    v_difficulty_policy.preset_key,
    case
      when jsonb_typeof(v_settings -> 'attendance_window') = 'object'
        then v_settings -> 'attendance_window'
      else '{}'::jsonb
    end,
    case
      when jsonb_typeof(v_settings -> 'business_market_window') = 'object'
        then v_settings -> 'business_market_window'
      else '{}'::jsonb
    end,
    case
      when jsonb_typeof(v_settings -> 'stock_market_window') = 'object'
        then v_settings -> 'stock_market_window'
      else '{}'::jsonb
    end,
    case
      when jsonb_typeof(v_settings -> 'news_schedule') = 'object'
        then v_settings -> 'news_schedule'
      else '{}'::jsonb
    end
  );

  insert into public.game_difficulty_policy_settings (
    game_session_id,
    difficulty_policy_profile_id,
    difficulty_preset,
    source,
    price_modifier,
    event_volatility_modifier,
    scarcity_modifier,
    income_modifier,
    trade_modifier,
    credit_modifier,
    status,
    metadata
  )
  values (
    v_game_session.id,
    v_difficulty_policy.id,
    v_difficulty_policy.preset_key,
    'preset',
    v_difficulty_policy.price_modifier,
    v_difficulty_policy.event_volatility_modifier,
    v_difficulty_policy.scarcity_modifier,
    v_difficulty_policy.income_modifier,
    v_difficulty_policy.trade_modifier,
    v_difficulty_policy.credit_modifier,
    'active',
    jsonb_build_object(
      'initializationSource', 'redeem_purchase_code_for_game',
      'difficultyPreset', v_difficulty_policy.preset_key,
      'source', 'preset'
    )
  );

  insert into public.game_country_economic_baseline_settings (
    game_session_id,
    source,
    status,
    metadata
  )
  values (
    v_game_session.id,
    'default',
    'active',
    jsonb_build_object(
      'initializationSource', 'redeem_purchase_code_for_game',
      'baselineSource', 'default'
    )
  );

  perform 1
  from public.initialize_country_economic_snapshots_for_game(
    v_game_session.id,
    v_activated_at,
    'Initial baseline',
    jsonb_build_object(
      'initializationSource', 'redeem_purchase_code_for_game',
      'reason', 'game_creation'
    ) || p_request_metadata
  );

  insert into public.entitlements (
    purchase_code_id,
    staff_user_id,
    game_session_id,
    status
  )
  values (
    v_purchase_code.id,
    p_staff_user_id,
    v_game_session.id,
    'active'
  )
  returning *
  into v_entitlement;

  insert into public.audit_log (
    game_session_id,
    actor_type,
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    v_game_session.id,
    'staff_user',
    p_staff_user_id,
    'licensing.purchase_code_redeemed',
    'purchase_code',
    v_purchase_code.id,
    jsonb_build_object(
      'purchase_code_id', v_purchase_code.id,
      'entitlement_id', v_entitlement.id,
      'game_session_id', v_game_session.id,
      'purchase_code_status', v_purchase_code.status,
      'redeemed_count', v_purchase_code.redeemed_count,
      'max_redemptions', v_purchase_code.max_redemptions,
      'difficulty_preset', v_difficulty_policy.preset_key,
      'country_economy_initialized', true,
      'request', coalesce(p_request_metadata, '{}'::jsonb)
    )
  );

  return query
  select
    v_game_session.id,
    v_entitlement.id,
    v_purchase_code.id,
    v_purchase_code.status,
    v_purchase_code.redeemed_count,
    v_purchase_code.max_redemptions,
    v_activated_at;
end;
$$;

comment on function public.redeem_purchase_code_for_game(uuid, text, text, jsonb, jsonb) is
  'Atomically redeems a purchase code, creates a game session, creates game settings, creates difficulty and country baseline settings, initializes country economic snapshots, creates an entitlement, and writes an audit log entry.';

revoke all on function public.redeem_purchase_code_for_game(uuid, text, jsonb, jsonb) from public;
revoke all on function public.redeem_purchase_code_for_game(uuid, text, text, jsonb, jsonb) from public;
grant execute on function public.redeem_purchase_code_for_game(uuid, text, text, jsonb, jsonb) to service_role;

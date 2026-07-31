\set ON_ERROR_STOP on

create temporary table license_redemption_probe_result (
  result jsonb not null
);

do $probe$
declare
  v_staff_id uuid;
  v_legacy_hash text := encode(
    extensions.digest(
      'ECON-LOCAL-LICENSE-ROLLBACK-PROBE',
      'sha256'
    ),
    'hex'
  );
  v_primary_hash text := encode(
    extensions.digest(
      'econovaria-purchase-code-v2|synthetic-local-rollback-probe',
      'sha256'
    ),
    'hex'
  );
  v_code_envelope text;
  v_hash_version text;
  v_redemption record;
  v_replay record;
  v_verification jsonb;
  v_result jsonb;
  v_request_metadata jsonb := jsonb_build_object(
    'request_id', 'license-redemption-rollback-probe-v1',
    'source', 'local-license-redemption-rollback-probe'
  );
begin
  v_code_envelope := 'v2.' || v_primary_hash || '.' || v_legacy_hash;

  select game_row.owner_staff_user_id into v_staff_id
  from public.seed_content_releases as release_row
  join public.game_sessions as game_row
    on game_row.id = release_row.game_session_id
  where release_row.pack_id = 'econovaria.beta-seed-pack.v1'
    and release_row.status = 'applied_active'
    and release_row.target_environment in ('local', 'test', 'staging')
  order by release_row.applied_at desc nulls last,
    release_row.created_at desc
  limit 1;

  if v_staff_id is null then
    raise exception 'LICENSE_PROBE_STAFF_MISSING';
  end if;

  begin
    insert into public.purchase_codes (
      code_hash, code_hash_version, status, max_redemptions, redeemed_count
    ) values (
      v_legacy_hash, 'sha256-v1', 'active', 1, 0
    );

    select * into v_redemption
    from public.redeem_purchase_code_for_game(
      v_staff_id,
      v_code_envelope,
      '[SYNTHETIC] License Redemption Rollback Probe',
      '{"difficulty_preset":"moderate","stock_market_window":{"timezone":"Asia/Seoul"}}'::jsonb,
      v_request_metadata
    );

    select * into v_replay
    from public.redeem_purchase_code_for_game(
      v_staff_id,
      v_code_envelope,
      '[SYNTHETIC] License Redemption Rollback Probe',
      '{"difficulty_preset":"moderate","stock_market_window":{"timezone":"Asia/Seoul"}}'::jsonb,
      v_request_metadata
    );

    select purchase_code_row.code_hash_version into v_hash_version
    from public.purchase_codes as purchase_code_row
    where purchase_code_row.id = v_redemption.purchase_code_id;

    v_verification := public.verify_provisioned_game_v1(
      v_redemption.game_session_id,
      v_staff_id
    );

    v_result := jsonb_build_object(
      'redeemed', true,
      'replayMatched',
        v_replay.game_session_id = v_redemption.game_session_id
        and v_replay.entitlement_id = v_redemption.entitlement_id
        and v_replay.purchase_code_id = v_redemption.purchase_code_id,
      'purchaseCodeStatus', v_redemption.purchase_code_status,
      'redeemedCount', v_redemption.redeemed_count,
      'maxRedemptions', v_redemption.max_redemptions,
      'hashVersion', v_hash_version,
      'gameReady', coalesce(
        (v_verification->>'ready')::boolean,
        false
      ),
      'counts', v_verification->'counts',
      'entitlementCreated', exists (
        select 1
        from public.entitlements as entitlement_row
        where entitlement_row.id = v_redemption.entitlement_id
          and entitlement_row.status = 'active'
      )
    );

    if v_redemption.purchase_code_status <> 'exhausted'
      or v_redemption.redeemed_count <> 1
      or v_hash_version <> 'hmac-sha256-v2'
      or v_replay.game_session_id <> v_redemption.game_session_id
      or v_replay.entitlement_id <> v_redemption.entitlement_id
      or v_replay.purchase_code_id <> v_redemption.purchase_code_id
      or coalesce(
        (v_verification->>'ready')::boolean,
        false
      ) is not true
      or coalesce(
        (v_verification #>> '{counts,marketAssets}')::integer,
        0
      ) <> 240
      or coalesce(
        (v_verification #>> '{counts,contracts}')::integer,
        0
      ) <> 30
      or coalesce(
        (v_verification #>> '{counts,storeItems}')::integer,
        0
      ) <> 50
    then
      raise exception 'LICENSE_REDEMPTION_PROBE_ASSERTION_FAILED';
    end if;

    raise exception 'LICENSE_REDEMPTION_PROBE_ROLLBACK'
      using errcode = 'ZX001';
  exception
    when sqlstate 'ZX001' then
      if exists (
        select 1
        from public.purchase_codes as purchase_code_row
        where purchase_code_row.code_hash in (v_primary_hash, v_legacy_hash)
      ) or exists (
        select 1
        from public.game_sessions as game_row
        where game_row.id = v_redemption.game_session_id
      ) or exists (
        select 1
        from public.entitlements as entitlement_row
        where entitlement_row.id = v_redemption.entitlement_id
      ) then
        raise exception 'LICENSE_REDEMPTION_ROLLBACK_RESIDUE';
      end if;

      insert into license_redemption_probe_result(result)
      values (v_result || jsonb_build_object('zeroResidue', true));
  end;
end;
$probe$;

select result::text as rollback_probe
from license_redemption_probe_result;

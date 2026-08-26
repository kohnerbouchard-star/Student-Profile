-- Player standard-FX submission and cancellation commands V1.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function public.submit_player_standard_fx_order_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_quote_key text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
declare
  v_quote public.fx_quotes%rowtype;
  v_existing public.fx_orders%rowtype;
  v_runtime private.fx_runtime_state%rowtype;
  v_source_account public.bank_accounts%rowtype;
  v_target_account public.bank_accounts%rowtype;
  v_cap public.fx_liquidity_cap_snapshots%rowtype;
  v_clearing_account_id uuid;
  v_reserve_account_id uuid;
  v_source_balance numeric(38, 18);
  v_clearing_balance numeric(38, 18);
  v_source_holds numeric(38, 18);
  v_clearing_holds numeric(38, 18);
  v_clearing_reserved numeric(38, 18);
  v_reserve_reserved numeric(38, 18);
  v_reserve_headroom numeric(38, 18);
  v_order_id uuid := extensions.gen_random_uuid();
  v_order_public_key text;
  v_request jsonb;
  v_request_hash text;
  v_hold_request jsonb;
  v_hold_hash text;
  v_payer_hold record;
  v_clearing_hold record;
  v_reserve_hold record;
  v_clearing_hold_id uuid;
  v_reserve_hold_id uuid;
  v_now timestamptz := clock_timestamp();
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
begin
  if p_game_session_id is null
     or p_player_id is null
     or coalesce(p_quote_key, '') !~ '^fxq_[0-9a-f]{32}$'
     or v_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$'
  then
    raise exception 'FX_ORDER_REQUEST_INVALID' using errcode = '22023';
  end if;

  v_request := jsonb_build_object(
    'version', 'player-standard-fx-order-v1',
    'gameSessionId', p_game_session_id,
    'playerId', p_player_id,
    'quoteKey', p_quote_key
  );
  v_request_hash := private.fx_digest_jsonb_v1(v_request);

  perform pg_advisory_xact_lock(hashtextextended(
    'player-standard-fx-order-v1:' || p_game_session_id::text || ':' ||
      p_player_id::text || ':' || v_idempotency_key,
    0
  ));

  select order_row.*
  into v_existing
  from public.fx_orders as order_row
  where order_row.game_session_id = p_game_session_id
    and order_row.player_id = p_player_id
    and order_row.idempotency_key = v_idempotency_key;
  if found then
    if v_existing.request_hash <> v_request_hash
       or v_existing.product <> 'standard'
    then
      raise exception 'FX_QUOTE_CONFLICT' using errcode = 'P0001';
    end if;
    return jsonb_build_object(
      'outcome', 'replayed',
      'order', private.fx_order_public_json_v1(v_existing.id)
    );
  end if;

  select quote_row.*
  into v_quote
  from public.fx_quotes as quote_row
  where quote_row.public_key = p_quote_key
    and quote_row.game_session_id = p_game_session_id
    and quote_row.player_id = p_player_id
  for update;
  if not found then
    raise exception 'FX_QUOTE_NOT_FOUND' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.fx_orders as order_row
    where order_row.quote_id = v_quote.id
  ) then
    raise exception 'FX_QUOTE_CONSUMED' using errcode = 'P0001';
  end if;
  if v_quote.product <> 'standard' then
    raise exception 'FX_QUOTE_PRODUCT_MISMATCH' using errcode = 'P0001';
  end if;
  if not v_quote.requires_fx then
    raise exception 'FX_SAME_CURRENCY_NOT_REQUIRED' using errcode = 'P0001';
  end if;
  if v_quote.expires_at <= v_now then
    raise exception 'FX_QUOTE_EXPIRED' using errcode = 'P0001';
  end if;

  select runtime.*
  into v_runtime
  from private.fx_runtime_state as runtime
  where runtime.game_session_id = p_game_session_id
    and runtime.cutover_status = 'ready'
  for share;
  if not found
     or v_runtime.current_fixing_id is distinct from v_quote.fixing_id
     or v_runtime.policy_version_id is distinct from v_quote.policy_version_id
     or v_runtime.next_due_at is null
     or v_runtime.next_due_at <= v_now
     or v_quote.settles_at is distinct from v_runtime.next_due_at
  then
    raise exception 'FX_RATE_VERSION_STALE' using errcode = 'P0001';
  end if;

  select account_row.*
  into v_source_account
  from public.bank_accounts as account_row
  join public.economic_parties as party_row
    on party_row.id = account_row.party_id
   and party_row.game_session_id = account_row.game_session_id
  where account_row.id = v_quote.source_account_id
    and account_row.game_session_id = p_game_session_id
    and account_row.account_kind = 'checking'
    and account_row.status = 'active'
    and party_row.party_kind = 'player'
    and party_row.player_id = p_player_id
    and party_row.status = 'active';
  if not found then
    raise exception 'BANK_ACCOUNT_NOT_FOUND' using errcode = 'P0001';
  end if;

  select account_row.*
  into v_target_account
  from public.bank_accounts as account_row
  join public.economic_parties as party_row
    on party_row.id = account_row.party_id
   and party_row.game_session_id = account_row.game_session_id
  where account_row.id = v_quote.target_account_id
    and account_row.game_session_id = p_game_session_id
    and account_row.account_kind = 'checking'
    and account_row.status = 'active'
    and party_row.party_kind = 'player'
    and party_row.player_id = p_player_id
    and party_row.status = 'active';
  if not found then
    raise exception 'BANK_ACCOUNT_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_source_account.currency_code <> v_quote.source_currency_code
     or v_target_account.currency_code <> v_quote.target_currency_code
  then
    raise exception 'FX_QUOTE_ACCOUNT_CONFLICT' using errcode = 'P0001';
  end if;

  select cap_row.*
  into v_cap
  from public.fx_liquidity_cap_snapshots as cap_row
  where cap_row.id = v_quote.target_cap_snapshot_id
    and cap_row.game_session_id = p_game_session_id
    and cap_row.fixing_id = v_quote.fixing_id
    and cap_row.currency_code = v_quote.target_currency_code;
  if not found then
    raise exception 'FX_LIQUIDITY_UNAVAILABLE' using errcode = 'P0001';
  end if;

  v_clearing_account_id := private.player_fx_system_account_v1(
    p_game_session_id,
    'fx.clearing-house',
    'fx_clearing',
    v_quote.target_currency_code
  );
  v_reserve_account_id := private.player_fx_system_account_v1(
    p_game_session_id,
    'fx.central-reserve',
    'fx_reserve',
    v_quote.target_currency_code
  );

  perform pg_advisory_xact_lock(hashtextextended(
    'banking-monetary-v1:' || p_game_session_id::text,
    0
  ));

  perform balance_row.id
  from public.account_balances as balance_row
  where balance_row.game_session_id = p_game_session_id
    and balance_row.bank_account_id in (
      v_source_account.id,
      v_clearing_account_id,
      v_reserve_account_id
    )
  order by balance_row.bank_account_id
  for update;

  select balance_row.balance
  into strict v_source_balance
  from public.account_balances as balance_row
  where balance_row.game_session_id = p_game_session_id
    and balance_row.bank_account_id = v_source_account.id;
  v_source_holds := private.active_bank_account_hold_amount_v1(
    p_game_session_id, v_source_account.id, '{}'::uuid[]
  );
  if v_source_balance - v_source_holds < v_quote.source_amount then
    raise exception 'FUNDING_INSUFFICIENT' using errcode = 'P0001';
  end if;

  select balance_row.balance
  into strict v_clearing_balance
  from public.account_balances as balance_row
  where balance_row.game_session_id = p_game_session_id
    and balance_row.bank_account_id = v_clearing_account_id;
  v_clearing_holds := private.active_bank_account_hold_amount_v1(
    p_game_session_id, v_clearing_account_id, '{}'::uuid[]
  );
  v_clearing_reserved := least(
    v_quote.target_amount,
    greatest(v_clearing_balance - v_clearing_holds, 0)
  );
  v_reserve_reserved := v_quote.target_amount - v_clearing_reserved;

  if v_reserve_reserved > 0 then
    v_reserve_headroom := private.fx_liquidity_headroom_v1(
      p_game_session_id,
      v_cap.id,
      v_reserve_account_id,
      '{}'::uuid[]
    );
    if v_reserve_headroom < v_reserve_reserved then
      raise exception 'FX_LIQUIDITY_UNAVAILABLE' using errcode = 'P0001';
    end if;
  end if;

  v_order_public_key := 'fxo_' || substr(private.bank_digest_text_v1(concat_ws(
    '|',
    'player-standard-fx-order-v1',
    p_game_session_id::text,
    p_player_id::text,
    v_idempotency_key
  )), 1, 32);

  v_hold_request := jsonb_build_object(
    'version', 'player-standard-fx-hold-v1',
    'orderKey', v_order_public_key,
    'role', 'payer_principal',
    'accountId', v_source_account.id,
    'amount', v_quote.source_amount::text
  );
  v_hold_hash := private.fx_digest_jsonb_v1(v_hold_request);
  select *
  into strict v_payer_hold
  from private.create_bank_account_hold_v1(
    p_game_session_id,
    v_source_account.id,
    v_quote.source_amount,
    'banking_fx',
    'standard_payer_reservation',
    v_order_id,
    'payer:' || v_idempotency_key,
    v_hold_hash,
    null,
    jsonb_build_object(
      'orderPublicKey', v_order_public_key,
      'role', 'payer_principal'
    )
  );

  if v_clearing_reserved > 0 then
    v_hold_request := jsonb_build_object(
      'version', 'player-standard-fx-hold-v1',
      'orderKey', v_order_public_key,
      'role', 'target_clearing',
      'accountId', v_clearing_account_id,
      'amount', v_clearing_reserved::text
    );
    v_hold_hash := private.fx_digest_jsonb_v1(v_hold_request);
    select *
    into strict v_clearing_hold
    from private.create_bank_account_hold_v1(
      p_game_session_id,
      v_clearing_account_id,
      v_clearing_reserved,
      'banking_fx',
      'standard_clearing_reservation',
      v_order_id,
      'clearing:' || v_idempotency_key,
      v_hold_hash,
      null,
      jsonb_build_object(
        'orderPublicKey', v_order_public_key,
        'role', 'target_clearing'
      )
    );
    v_clearing_hold_id := v_clearing_hold.hold_id;
  end if;

  if v_reserve_reserved > 0 then
    v_hold_request := jsonb_build_object(
      'version', 'player-standard-fx-hold-v1',
      'orderKey', v_order_public_key,
      'role', 'target_reserve',
      'accountId', v_reserve_account_id,
      'amount', v_reserve_reserved::text,
      'capSnapshotId', v_cap.id
    );
    v_hold_hash := private.fx_digest_jsonb_v1(v_hold_request);
    select *
    into strict v_reserve_hold
    from private.create_bank_account_hold_v1(
      p_game_session_id,
      v_reserve_account_id,
      v_reserve_reserved,
      'banking_fx',
      'standard_reserve_reservation',
      v_order_id,
      'reserve:' || v_idempotency_key,
      v_hold_hash,
      null,
      jsonb_build_object(
        'orderPublicKey', v_order_public_key,
        'role', 'target_reserve',
        'reserveAuthority', 'fx_liquidity_v1',
        'liquidityCapSnapshotId', v_cap.id
      )
    );
    v_reserve_hold_id := v_reserve_hold.hold_id;
  end if;

  insert into public.fx_orders(
    id,
    public_key,
    game_session_id,
    player_id,
    quote_id,
    product,
    payer_hold_id,
    clearing_hold_id,
    reserve_hold_id,
    source_amount,
    fee_amount,
    target_amount,
    clearing_reserved_amount,
    reserve_reserved_amount,
    settles_at,
    idempotency_key,
    request_hash,
    submitted_at
  ) values (
    v_order_id,
    v_order_public_key,
    p_game_session_id,
    p_player_id,
    v_quote.id,
    'standard',
    v_payer_hold.hold_id,
    v_clearing_hold_id,
    v_reserve_hold_id,
    v_quote.source_amount,
    0,
    v_quote.target_amount,
    v_clearing_reserved,
    v_reserve_reserved,
    v_quote.settles_at,
    v_idempotency_key,
    v_request_hash,
    v_now
  );

  insert into private.fx_order_runtime_state(
    order_id, game_session_id, status, updated_at
  ) values (
    v_order_id, p_game_session_id, 'pending', v_now
  );

  insert into public.fx_order_events(
    game_session_id,
    order_id,
    event_type,
    idempotency_key,
    request_hash,
    metadata,
    created_at
  ) values (
    p_game_session_id,
    v_order_id,
    'submitted',
    'submitted:' || v_order_public_key,
    v_request_hash,
    jsonb_build_object(
      'quotePublicKey', v_quote.public_key,
      'settlesAt', v_quote.settles_at,
      'clearingReservedAmount', v_clearing_reserved,
      'reserveReservedAmount', v_reserve_reserved
    ),
    v_now
  );

  if v_reserve_reserved > 0 then
    insert into public.fx_liquidity_events(
      game_session_id,
      cap_snapshot_id,
      hold_id,
      currency_code,
      event_kind,
      amount,
      idempotency_key,
      request_hash,
      metadata,
      created_at
    ) values (
      p_game_session_id,
      v_cap.id,
      v_reserve_hold_id,
      v_quote.target_currency_code,
      'facility_reserved',
      v_reserve_reserved,
      'facility-reserved:' || v_order_public_key,
      v_hold_hash,
      jsonb_build_object('orderPublicKey', v_order_public_key),
      v_now
    );
  end if;

  return jsonb_build_object(
    'outcome', 'applied',
    'order', private.fx_order_public_json_v1(v_order_id)
  );
end;
$function$;

revoke all on function public.submit_player_standard_fx_order_v1(
  uuid, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.submit_player_standard_fx_order_v1(
  uuid, uuid, text, text
) to service_role;

create or replace function public.cancel_player_standard_fx_order_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_order_key text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_order public.fx_orders%rowtype;
  v_runtime private.fx_order_runtime_state%rowtype;
  v_event public.fx_order_events%rowtype;
  v_request jsonb;
  v_request_hash text;
  v_release_hash text;
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_now timestamptz := clock_timestamp();
begin
  if p_game_session_id is null
     or p_player_id is null
     or coalesce(p_order_key, '') !~ '^fxo_[0-9a-f]{32}$'
     or v_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$'
  then
    raise exception 'FX_ORDER_CANCEL_REQUEST_INVALID' using errcode = '22023';
  end if;

  v_request := jsonb_build_object(
    'version', 'player-standard-fx-cancel-v1',
    'gameSessionId', p_game_session_id,
    'playerId', p_player_id,
    'orderKey', p_order_key
  );
  v_request_hash := private.fx_digest_jsonb_v1(v_request);

  perform pg_advisory_xact_lock(hashtextextended(
    'player-standard-fx-cancel-v1:' || p_game_session_id::text || ':' ||
      p_player_id::text || ':' || v_idempotency_key,
    0
  ));

  select order_row.*
  into v_order
  from public.fx_orders as order_row
  where order_row.public_key = p_order_key
    and order_row.game_session_id = p_game_session_id
    and order_row.player_id = p_player_id;
  if not found then
    raise exception 'FX_ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;

  select runtime.*
  into v_runtime
  from private.fx_order_runtime_state as runtime
  where runtime.order_id = v_order.id
    and runtime.game_session_id = p_game_session_id
  for update;
  if not found then
    raise exception 'FX_ORDER_STATE_NOT_FOUND' using errcode = 'P0001';
  end if;

  select event_row.*
  into v_event
  from public.fx_order_events as event_row
  where event_row.game_session_id = p_game_session_id
    and event_row.order_id = v_order.id
    and event_row.idempotency_key = v_idempotency_key;
  if found then
    if v_event.request_hash <> v_request_hash
       or v_event.event_type <> 'cancelled'
    then
      raise exception 'FX_QUOTE_CONFLICT' using errcode = 'P0001';
    end if;
    return jsonb_build_object(
      'outcome', 'replayed',
      'order', private.fx_order_public_json_v1(v_order.id)
    );
  end if;

  if v_order.product <> 'standard' or v_runtime.status <> 'pending' then
    raise exception 'FX_ORDER_CANCELLATION_NOT_ALLOWED' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'banking-monetary-v1:' || p_game_session_id::text,
    0
  ));

  v_release_hash := private.fx_digest_jsonb_v1(jsonb_build_object(
    'version', 'player-standard-fx-release-v1',
    'orderKey', v_order.public_key,
    'reason', 'cancelled'
  ));

  perform private.release_bank_account_hold_v1(
    p_game_session_id,
    v_order.payer_hold_id,
    'cancel-payer:' || v_idempotency_key,
    v_release_hash,
    'cancelled',
    jsonb_build_object('orderPublicKey', v_order.public_key)
  );
  if v_order.clearing_hold_id is not null then
    perform private.release_bank_account_hold_v1(
      p_game_session_id,
      v_order.clearing_hold_id,
      'cancel-clearing:' || v_idempotency_key,
      v_release_hash,
      'cancelled',
      jsonb_build_object('orderPublicKey', v_order.public_key)
    );
  end if;
  if v_order.reserve_hold_id is not null then
    perform private.release_bank_account_hold_v1(
      p_game_session_id,
      v_order.reserve_hold_id,
      'cancel-reserve:' || v_idempotency_key,
      v_release_hash,
      'cancelled',
      jsonb_build_object('orderPublicKey', v_order.public_key)
    );

    insert into public.fx_liquidity_events(
      game_session_id,
      cap_snapshot_id,
      hold_id,
      currency_code,
      event_kind,
      amount,
      idempotency_key,
      request_hash,
      metadata,
      created_at
    )
    select
      p_game_session_id,
      quote_row.target_cap_snapshot_id,
      v_order.reserve_hold_id,
      quote_row.target_currency_code,
      'facility_released',
      v_order.reserve_reserved_amount,
      'facility-released:' || v_order.public_key || ':cancelled',
      v_release_hash,
      jsonb_build_object('orderPublicKey', v_order.public_key),
      v_now
    from public.fx_quotes as quote_row
    where quote_row.id = v_order.quote_id;
  end if;

  update private.fx_order_runtime_state
  set status = 'cancelled',
      lease_token = null,
      lease_owner = null,
      lease_expires_at = null,
      terminal_at = v_now,
      last_error_code = null,
      updated_at = v_now
  where order_id = v_order.id;

  insert into public.fx_order_events(
    game_session_id,
    order_id,
    event_type,
    idempotency_key,
    request_hash,
    metadata,
    created_at
  ) values (
    p_game_session_id,
    v_order.id,
    'cancelled',
    v_idempotency_key,
    v_request_hash,
    jsonb_build_object('orderPublicKey', v_order.public_key),
    v_now
  );

  return jsonb_build_object(
    'outcome', 'applied',
    'order', private.fx_order_public_json_v1(v_order.id)
  );
end;
$function$;

revoke all on function public.cancel_player_standard_fx_order_v1(
  uuid, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.cancel_player_standard_fx_order_v1(
  uuid, uuid, text, text
) to service_role;

commit;

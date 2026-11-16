-- Atomic payment-versus-payment settlement and instant Player FX V1.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function private.settle_player_fx_order_v1(
  p_game_session_id uuid,
  p_order_id uuid,
  p_expected_runtime_status text,
  p_lease_token uuid,
  p_now timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
declare
  v_order public.fx_orders%rowtype;
  v_quote public.fx_quotes%rowtype;
  v_runtime private.fx_order_runtime_state%rowtype;
  v_source_account public.bank_accounts%rowtype;
  v_target_account public.bank_accounts%rowtype;
  v_source_clearing_id uuid;
  v_source_reserve_id uuid;
  v_source_fee_id uuid;
  v_target_clearing_id uuid;
  v_target_reserve_id uuid;
  v_source_cap public.fx_liquidity_cap_snapshots%rowtype;
  v_target_cap public.fx_liquidity_cap_snapshots%rowtype;
  v_source_balance numeric(38, 18);
  v_target_clearing_balance numeric(38, 18);
  v_source_clearing_balance numeric(38, 18);
  v_source_reserve_balance numeric(38, 18);
  v_source_holds numeric(38, 18);
  v_target_clearing_holds numeric(38, 18);
  v_source_clearing_holds numeric(38, 18);
  v_target_draw numeric(38, 18);
  v_source_repayment numeric(38, 18);
  v_target_available numeric(38, 18);
  v_repayment_available numeric(38, 18);
  v_consumed_hold_ids uuid[] := '{}'::uuid[];
  v_lines jsonb := '[]'::jsonb;
  v_manifest jsonb;
  v_transaction_hash text;
  v_post record;
  v_receipt_id uuid;
begin
  if p_game_session_id is null
     or p_order_id is null
     or p_now is null
     or p_expected_runtime_status not in ('pending', 'claimed')
  then
    raise exception 'FX_SETTLEMENT_REQUEST_INVALID' using errcode = '22023';
  end if;

  select order_row.*
  into v_order
  from public.fx_orders as order_row
  where order_row.id = p_order_id
    and order_row.game_session_id = p_game_session_id;
  if not found then
    raise exception 'FX_ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;

  select quote_row.*
  into v_quote
  from public.fx_quotes as quote_row
  where quote_row.id = v_order.quote_id
    and quote_row.game_session_id = p_game_session_id;
  if not found then
    raise exception 'FX_QUOTE_NOT_FOUND' using errcode = 'P0001';
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

  if exists (
    select 1
    from public.fx_settlement_receipts as receipt_row
    where receipt_row.game_session_id = p_game_session_id
      and receipt_row.order_id = v_order.id
  ) then
    return private.fx_order_public_json_v1(v_order.id);
  end if;

  if v_runtime.status <> p_expected_runtime_status then
    raise exception 'FX_ORDER_STATE_CONFLICT' using errcode = 'P0001';
  end if;
  if v_order.product = 'standard' then
    if p_expected_runtime_status <> 'claimed'
       or p_lease_token is null
       or v_runtime.lease_token is distinct from p_lease_token
       or v_runtime.lease_expires_at is null
       or v_runtime.lease_expires_at <= p_now
       or v_order.settles_at > p_now
    then
      raise exception 'FX_ORDER_LEASE_INVALID' using errcode = 'P0001';
    end if;
    v_consumed_hold_ids := array_remove(array[
      v_order.payer_hold_id,
      v_order.clearing_hold_id,
      v_order.reserve_hold_id
    ], null);
  elsif v_order.product = 'instant' then
    if p_expected_runtime_status <> 'pending' or p_lease_token is not null then
      raise exception 'FX_ORDER_STATE_CONFLICT' using errcode = 'P0001';
    end if;
  else
    raise exception 'FX_ORDER_PRODUCT_INVALID' using errcode = 'P0001';
  end if;

  if not v_quote.requires_fx
     or v_quote.source_currency_code = v_quote.target_currency_code
  then
    raise exception 'FX_SAME_CURRENCY_NOT_REQUIRED' using errcode = 'P0001';
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
    and party_row.player_id = v_order.player_id
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
    and party_row.player_id = v_order.player_id
    and party_row.status = 'active';
  if not found then
    raise exception 'BANK_ACCOUNT_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_source_clearing_id := private.player_fx_system_account_v1(
    p_game_session_id, 'fx.clearing-house', 'fx_clearing',
    v_quote.source_currency_code
  );
  v_source_reserve_id := private.player_fx_system_account_v1(
    p_game_session_id, 'fx.central-reserve', 'fx_reserve',
    v_quote.source_currency_code
  );
  v_source_fee_id := private.player_fx_system_account_v1(
    p_game_session_id, 'fx.fee-revenue', 'fx_fee_revenue',
    v_quote.source_currency_code
  );
  v_target_clearing_id := private.player_fx_system_account_v1(
    p_game_session_id, 'fx.clearing-house', 'fx_clearing',
    v_quote.target_currency_code
  );
  v_target_reserve_id := private.player_fx_system_account_v1(
    p_game_session_id, 'fx.central-reserve', 'fx_reserve',
    v_quote.target_currency_code
  );

  v_source_cap := private.player_fx_current_cap_v1(
    p_game_session_id, v_quote.source_currency_code
  );
  v_target_cap := private.player_fx_current_cap_v1(
    p_game_session_id, v_quote.target_currency_code
  );

  perform pg_advisory_xact_lock(hashtextextended(
    'banking-monetary-v1:' || p_game_session_id::text,
    0
  ));

  perform balance_row.id
  from public.account_balances as balance_row
  where balance_row.game_session_id = p_game_session_id
    and balance_row.bank_account_id = any(array[
      v_source_account.id,
      v_target_account.id,
      v_source_clearing_id,
      v_source_reserve_id,
      v_source_fee_id,
      v_target_clearing_id,
      v_target_reserve_id
    ])
  order by balance_row.bank_account_id
  for update;

  select balance_row.balance
  into strict v_source_balance
  from public.account_balances as balance_row
  where balance_row.bank_account_id = v_source_account.id;
  v_source_holds := private.active_bank_account_hold_amount_v1(
    p_game_session_id,
    v_source_account.id,
    v_consumed_hold_ids
  );
  if v_source_balance - v_source_holds
       < v_order.source_amount + v_order.fee_amount
  then
    raise exception 'FUNDING_INSUFFICIENT' using errcode = 'P0001';
  end if;

  select balance_row.balance
  into strict v_target_clearing_balance
  from public.account_balances as balance_row
  where balance_row.bank_account_id = v_target_clearing_id;
  v_target_clearing_holds := private.active_bank_account_hold_amount_v1(
    p_game_session_id,
    v_target_clearing_id,
    v_consumed_hold_ids
  );

  if v_order.product = 'standard' then
    v_target_draw := v_order.reserve_reserved_amount;
    if v_order.clearing_reserved_amount + v_target_draw
       <> v_order.target_amount
    then
      raise exception 'FX_ORDER_RESERVATION_CONFLICT' using errcode = 'P0001';
    end if;
  else
    v_target_available := greatest(
      v_target_clearing_balance - v_target_clearing_holds,
      0
    );
    v_target_draw := greatest(v_order.target_amount - v_target_available, 0);
    if v_target_draw > 0 and private.fx_liquidity_headroom_v1(
      p_game_session_id,
      v_target_cap.id,
      v_target_reserve_id,
      '{}'::uuid[]
    ) < v_target_draw then
      raise exception 'FX_LIQUIDITY_UNAVAILABLE' using errcode = 'P0001';
    end if;
  end if;

  select balance_row.balance
  into strict v_source_clearing_balance
  from public.account_balances as balance_row
  where balance_row.bank_account_id = v_source_clearing_id;
  select balance_row.balance
  into strict v_source_reserve_balance
  from public.account_balances as balance_row
  where balance_row.bank_account_id = v_source_reserve_id;
  v_source_clearing_holds := private.active_bank_account_hold_amount_v1(
    p_game_session_id,
    v_source_clearing_id,
    '{}'::uuid[]
  );
  v_repayment_available := greatest(
    v_source_clearing_balance
      + v_order.source_amount
      - v_source_clearing_holds
      - v_source_cap.operating_buffer_target,
    0
  );
  v_source_repayment := least(
    greatest(-v_source_reserve_balance, 0),
    v_repayment_available
  );

  v_lines := jsonb_build_array(
    jsonb_build_object(
      'bankAccountId', v_source_account.id,
      'amount', (-v_order.source_amount)::text,
      'entryType', 'debit',
      'metadata', jsonb_build_object('lineRole', 'payer_principal')
    ),
    jsonb_build_object(
      'bankAccountId', v_source_clearing_id,
      'amount', v_order.source_amount::text,
      'entryType', 'credit',
      'metadata', jsonb_build_object('lineRole', 'source_clearing_inflow')
    )
  );

  if v_order.fee_amount > 0 then
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'bankAccountId', v_source_account.id,
        'amount', (-v_order.fee_amount)::text,
        'entryType', 'debit',
        'metadata', jsonb_build_object('lineRole', 'instant_fee')
      ),
      jsonb_build_object(
        'bankAccountId', v_source_fee_id,
        'amount', v_order.fee_amount::text,
        'entryType', 'credit',
        'metadata', jsonb_build_object('lineRole', 'fee_revenue')
      )
    );
  end if;

  if v_target_draw > 0 then
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'bankAccountId', v_target_reserve_id,
        'amount', (-v_target_draw)::text,
        'entryType', 'debit',
        'metadata', jsonb_build_object('lineRole', 'target_reserve_draw')
      ),
      jsonb_build_object(
        'bankAccountId', v_target_clearing_id,
        'amount', v_target_draw::text,
        'entryType', 'credit',
        'metadata', jsonb_build_object('lineRole', 'target_facility_inflow')
      )
    );
  end if;

  v_lines := v_lines || jsonb_build_array(
    jsonb_build_object(
      'bankAccountId', v_target_clearing_id,
      'amount', (-v_order.target_amount)::text,
      'entryType', 'debit',
      'metadata', jsonb_build_object('lineRole', 'target_clearing_delivery')
    ),
    jsonb_build_object(
      'bankAccountId', v_target_account.id,
      'amount', v_order.target_amount::text,
      'entryType', 'credit',
      'metadata', jsonb_build_object('lineRole', 'recipient_credit')
    )
  );

  if v_source_repayment > 0 then
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'bankAccountId', v_source_clearing_id,
        'amount', (-v_source_repayment)::text,
        'entryType', 'debit',
        'metadata', jsonb_build_object('lineRole', 'source_reserve_repayment')
      ),
      jsonb_build_object(
        'bankAccountId', v_source_reserve_id,
        'amount', v_source_repayment::text,
        'entryType', 'credit',
        'metadata', jsonb_build_object('lineRole', 'reserve_repayment')
      )
    );
  end if;

  v_manifest := jsonb_build_object(
    'version', 'player-fx-settlement-v1',
    'gameSessionId', p_game_session_id,
    'orderPublicKey', v_order.public_key,
    'quotePublicKey', v_quote.public_key,
    'product', v_order.product,
    'sourceAmount', v_order.source_amount::text,
    'feeAmount', v_order.fee_amount::text,
    'targetAmount', v_order.target_amount::text,
    'targetReserveDrawAmount', v_target_draw::text,
    'sourceReserveRepaymentAmount', v_source_repayment::text,
    'acceptedFixingPublicKey', (
      select fixing_row.public_key
      from public.fx_fixings as fixing_row
      where fixing_row.id = v_quote.fixing_id
    ),
    'sourceCapSnapshotPublicKey', v_source_cap.public_key,
    'targetCapSnapshotPublicKey', v_target_cap.public_key
  );
  v_transaction_hash := private.fx_digest_jsonb_v1(v_manifest);

  select *
  into strict v_post
  from private.post_bank_transaction_v1(
    p_game_session_id,
    'fx_conversion',
    'banking_fx',
    case
      when v_order.product = 'instant' then 'instant_settlement'
      else 'standard_settlement'
    end,
    v_order.id,
    'settlement:' || v_order.public_key,
    v_transaction_hash,
    v_lines,
    'player',
    v_order.player_id,
    jsonb_build_object(
      'reserveAuthority', 'fx_liquidity_v1',
      'liquidityCapSnapshotId', v_target_cap.id,
      'orderPublicKey', v_order.public_key,
      'quotePublicKey', v_quote.public_key,
      'product', v_order.product
    ),
    v_consumed_hold_ids
  );

  insert into public.fx_settlement_receipts(
    game_session_id,
    order_id,
    bank_transaction_id,
    source_currency_code,
    target_currency_code,
    source_amount,
    fee_amount,
    target_amount,
    reserve_draw_amount,
    reserve_repayment_amount,
    fixing_id,
    settled_at,
    evidence_hash,
    created_at
  ) values (
    p_game_session_id,
    v_order.id,
    v_post.bank_transaction_id,
    v_quote.source_currency_code,
    v_quote.target_currency_code,
    v_order.source_amount,
    v_order.fee_amount,
    v_order.target_amount,
    v_target_draw,
    v_source_repayment,
    v_quote.fixing_id,
    p_now,
    v_transaction_hash,
    p_now
  ) returning id into v_receipt_id;

  if v_order.product = 'standard' and v_order.reserve_reserved_amount > 0 then
    insert into public.fx_liquidity_events(
      game_session_id,
      cap_snapshot_id,
      bank_transaction_id,
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
      v_quote.target_cap_snapshot_id,
      v_post.bank_transaction_id,
      v_order.reserve_hold_id,
      v_quote.target_currency_code,
      'facility_consumed',
      v_order.reserve_reserved_amount,
      'facility-consumed:' || v_order.public_key,
      v_transaction_hash,
      jsonb_build_object('orderPublicKey', v_order.public_key),
      p_now
    );
  end if;

  if v_target_draw > 0 then
    insert into public.fx_liquidity_events(
      game_session_id,
      cap_snapshot_id,
      bank_transaction_id,
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
      v_target_cap.id,
      v_post.bank_transaction_id,
      v_order.reserve_hold_id,
      v_quote.target_currency_code,
      'reserve_draw',
      v_target_draw,
      'reserve-draw:' || v_order.public_key,
      v_transaction_hash,
      jsonb_build_object('orderPublicKey', v_order.public_key),
      p_now
    );
  end if;

  if v_source_repayment > 0 then
    insert into public.fx_liquidity_events(
      game_session_id,
      cap_snapshot_id,
      bank_transaction_id,
      currency_code,
      event_kind,
      amount,
      idempotency_key,
      request_hash,
      metadata,
      created_at
    ) values (
      p_game_session_id,
      v_source_cap.id,
      v_post.bank_transaction_id,
      v_quote.source_currency_code,
      'reserve_repayment',
      v_source_repayment,
      'reserve-repayment:' || v_order.public_key,
      v_transaction_hash,
      jsonb_build_object('orderPublicKey', v_order.public_key),
      p_now
    );
  end if;

  update private.fx_order_runtime_state
  set status = 'settled',
      lease_token = null,
      lease_owner = null,
      lease_expires_at = null,
      terminal_at = p_now,
      last_error_code = null,
      updated_at = p_now
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
    'settled',
    'settled:' || v_order.public_key,
    v_transaction_hash,
    jsonb_build_object(
      'bankTransactionPublicKey', v_post.bank_transaction_public_key,
      'receiptPublicKey', (
        select receipt_row.public_key
        from public.fx_settlement_receipts as receipt_row
        where receipt_row.id = v_receipt_id
      )
    ),
    p_now
  );

  return private.fx_order_public_json_v1(v_order.id);
end;
$function$;

revoke all on function private.settle_player_fx_order_v1(
  uuid, uuid, text, uuid, timestamptz
) from public, anon, authenticated, service_role;

create or replace function public.execute_player_instant_fx_v1(
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
  v_order_id uuid := extensions.gen_random_uuid();
  v_order_public_key text;
  v_request jsonb;
  v_request_hash text;
  v_result jsonb;
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_now timestamptz := clock_timestamp();
begin
  if p_game_session_id is null
     or p_player_id is null
     or coalesce(p_quote_key, '') !~ '^fxq_[0-9a-f]{32}$'
     or v_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$'
  then
    raise exception 'FX_ORDER_REQUEST_INVALID' using errcode = '22023';
  end if;

  v_request := jsonb_build_object(
    'version', 'player-instant-fx-order-v1',
    'gameSessionId', p_game_session_id,
    'playerId', p_player_id,
    'quoteKey', p_quote_key
  );
  v_request_hash := private.fx_digest_jsonb_v1(v_request);

  perform pg_advisory_xact_lock(hashtextextended(
    'player-instant-fx-order-v1:' || p_game_session_id::text || ':' ||
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
       or v_existing.product <> 'instant'
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

  if exists (select 1 from public.fx_orders where quote_id = v_quote.id) then
    raise exception 'FX_QUOTE_CONSUMED' using errcode = 'P0001';
  end if;
  if v_quote.product <> 'instant' then
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
  then
    raise exception 'FX_RATE_VERSION_STALE' using errcode = 'P0001';
  end if;

  v_order_public_key := 'fxo_' || substr(private.bank_digest_text_v1(concat_ws(
    '|',
    'player-instant-fx-order-v1',
    p_game_session_id::text,
    p_player_id::text,
    v_idempotency_key
  )), 1, 32);

  insert into public.fx_orders(
    id,
    public_key,
    game_session_id,
    player_id,
    quote_id,
    product,
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
    'instant',
    v_quote.source_amount,
    v_quote.fee_amount,
    v_quote.target_amount,
    0,
    0,
    v_now,
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
    jsonb_build_object('quotePublicKey', v_quote.public_key),
    v_now
  );

  v_result := private.settle_player_fx_order_v1(
    p_game_session_id,
    v_order_id,
    'pending',
    null,
    v_now
  );

  return jsonb_build_object('outcome', 'applied', 'order', v_result);
end;
$function$;

revoke all on function public.execute_player_instant_fx_v1(
  uuid, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.execute_player_instant_fx_v1(
  uuid, uuid, text, text
) to service_role;

commit;

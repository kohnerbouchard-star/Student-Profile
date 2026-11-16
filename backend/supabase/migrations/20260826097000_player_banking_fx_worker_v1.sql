-- Leased standard-FX settlement worker and terminal failure authority V1.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function public.claim_due_standard_fx_orders_v1(
  p_worker_name text,
  p_limit integer default 10,
  p_lease_seconds integer default 60,
  p_now timestamptz default clock_timestamp()
)
returns table (
  game_session_id uuid,
  order_key text,
  lease_token uuid,
  settles_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
declare
  v_worker text := btrim(coalesce(p_worker_name, ''));
  v_candidate record;
  v_hold record;
  v_lease_token uuid;
  v_claim_hash text;
begin
  if length(v_worker) not between 1 and 120
     or p_limit is null or p_limit not between 1 and 50
     or p_lease_seconds is null or p_lease_seconds not between 15 and 300
     or p_now is null
  then
    raise exception 'FX_ORDER_CLAIM_REQUEST_INVALID' using errcode = '22023';
  end if;

  for v_candidate in
    select
      runtime.order_id,
      runtime.game_session_id,
      order_row.public_key,
      order_row.settles_at,
      order_row.payer_hold_id,
      order_row.clearing_hold_id,
      order_row.reserve_hold_id
    from private.fx_order_runtime_state as runtime
    join public.fx_orders as order_row
      on order_row.id = runtime.order_id
     and order_row.game_session_id = runtime.game_session_id
    where (
        runtime.status = 'pending'
        or (
          runtime.status = 'claimed'
          and runtime.lease_expires_at <= p_now
          and not exists (
            select 1
            from public.fx_settlement_receipts as receipt_row
            where receipt_row.order_id = runtime.order_id
              and receipt_row.game_session_id = runtime.game_session_id
          )
        )
      )
      and order_row.product = 'standard'
      and order_row.settles_at <= p_now
    order by order_row.settles_at, order_row.public_key
    for update of runtime skip locked
    limit p_limit
  loop
    v_lease_token := extensions.gen_random_uuid();
    v_claim_hash := private.fx_digest_jsonb_v1(jsonb_build_object(
      'version', 'standard-fx-order-claim-v1',
      'orderPublicKey', v_candidate.public_key,
      'workerName', v_worker,
      'leaseToken', v_lease_token,
      'leaseExpiresAt', p_now + make_interval(secs => p_lease_seconds)
    ));

    update private.fx_order_runtime_state
    set status = 'claimed',
        lease_token = v_lease_token,
        lease_owner = v_worker,
        lease_expires_at = p_now + make_interval(secs => p_lease_seconds),
        claimed_at = p_now,
        updated_at = p_now
    where order_id = v_candidate.order_id;

    for v_hold in
      select hold_row.id, hold_row.status
      from public.bank_account_holds as hold_row
      where hold_row.id = any(array_remove(array[
        v_candidate.payer_hold_id,
        v_candidate.clearing_hold_id,
        v_candidate.reserve_hold_id
      ], null))
      order by hold_row.id
    loop
      if v_hold.status = 'active' then
        perform private.claim_bank_account_hold_v1(
          v_candidate.game_session_id,
          v_hold.id,
          'claim:' || v_lease_token::text,
          v_claim_hash,
          jsonb_build_object(
            'orderPublicKey', v_candidate.public_key,
            'workerName', v_worker,
            'leaseToken', v_lease_token
          )
        );
      elsif v_hold.status <> 'claimed' then
        raise exception 'FX_ORDER_RESERVATION_CONFLICT' using errcode = 'P0001';
      end if;
    end loop;

    insert into public.fx_order_events(
      game_session_id,
      order_id,
      event_type,
      idempotency_key,
      request_hash,
      metadata,
      created_at
    ) values (
      v_candidate.game_session_id,
      v_candidate.order_id,
      'claimed',
      'claimed:' || v_lease_token::text,
      v_claim_hash,
      jsonb_build_object(
        'workerName', v_worker,
        'leaseToken', v_lease_token,
        'leaseExpiresAt', p_now + make_interval(secs => p_lease_seconds)
      ),
      p_now
    );

    return query select
      v_candidate.game_session_id,
      v_candidate.public_key,
      v_lease_token,
      v_candidate.settles_at;
  end loop;
end;
$function$;

revoke all on function public.claim_due_standard_fx_orders_v1(
  text, integer, integer, timestamptz
) from public, anon, authenticated;
grant execute on function public.claim_due_standard_fx_orders_v1(
  text, integer, integer, timestamptz
) to service_role;

create or replace function public.settle_standard_fx_order_v1(
  p_game_session_id uuid,
  p_order_key text,
  p_lease_token uuid,
  p_now timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_order_id uuid;
  v_had_receipt boolean;
  v_result jsonb;
begin
  if p_game_session_id is null
     or coalesce(p_order_key, '') !~ '^fxo_[0-9a-f]{32}$'
     or p_lease_token is null
     or p_now is null
  then
    raise exception 'FX_SETTLEMENT_REQUEST_INVALID' using errcode = '22023';
  end if;

  select order_row.id
  into v_order_id
  from public.fx_orders as order_row
  where order_row.game_session_id = p_game_session_id
    and order_row.public_key = p_order_key
    and order_row.product = 'standard';
  if not found then
    raise exception 'FX_ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;

  select exists (
    select 1
    from public.fx_settlement_receipts as receipt_row
    where receipt_row.game_session_id = p_game_session_id
      and receipt_row.order_id = v_order_id
  ) into v_had_receipt;

  v_result := private.settle_player_fx_order_v1(
    p_game_session_id,
    v_order_id,
    'claimed',
    p_lease_token,
    p_now
  );

  return jsonb_build_object(
    'outcome', case when v_had_receipt then 'replayed' else 'applied' end,
    'order', v_result
  );
end;
$function$;

revoke all on function public.settle_standard_fx_order_v1(
  uuid, text, uuid, timestamptz
) from public, anon, authenticated;
grant execute on function public.settle_standard_fx_order_v1(
  uuid, text, uuid, timestamptz
) to service_role;

create or replace function public.fail_standard_fx_order_v1(
  p_game_session_id uuid,
  p_order_key text,
  p_lease_token uuid,
  p_error_code text,
  p_now timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_order public.fx_orders%rowtype;
  v_quote public.fx_quotes%rowtype;
  v_runtime private.fx_order_runtime_state%rowtype;
  v_error_code text := upper(btrim(coalesce(p_error_code, '')));
  v_failure_hash text;
begin
  if p_game_session_id is null
     or coalesce(p_order_key, '') !~ '^fxo_[0-9a-f]{32}$'
     or p_lease_token is null
     or v_error_code !~ '^[A-Z][A-Z0-9_]{2,95}$'
     or p_now is null
  then
    raise exception 'FX_ORDER_FAILURE_REQUEST_INVALID' using errcode = '22023';
  end if;

  select order_row.*
  into v_order
  from public.fx_orders as order_row
  where order_row.game_session_id = p_game_session_id
    and order_row.public_key = p_order_key
    and order_row.product = 'standard';
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

  v_failure_hash := private.fx_digest_jsonb_v1(jsonb_build_object(
    'version', 'standard-fx-order-terminal-failure-v1',
    'orderPublicKey', v_order.public_key,
    'errorCode', v_error_code
  ));

  if v_runtime.status = 'failed' then
    if v_runtime.last_error_code is distinct from v_error_code then
      raise exception 'FX_ORDER_FAILURE_CONFLICT' using errcode = 'P0001';
    end if;
    return jsonb_build_object(
      'outcome', 'replayed',
      'order', private.fx_order_public_json_v1(v_order.id)
    );
  end if;

  if v_runtime.status <> 'claimed'
     or v_runtime.lease_token is distinct from p_lease_token
     or v_runtime.lease_expires_at is null
     or v_runtime.lease_expires_at <= p_now
     or exists (
       select 1
       from public.fx_settlement_receipts as receipt_row
       where receipt_row.game_session_id = p_game_session_id
         and receipt_row.order_id = v_order.id
     )
  then
    raise exception 'FX_ORDER_LEASE_INVALID' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'banking-monetary-v1:' || p_game_session_id::text,
    0
  ));

  perform private.release_bank_account_hold_v1(
    p_game_session_id,
    v_order.payer_hold_id,
    'failed-payer:' || v_order.public_key,
    v_failure_hash,
    'terminal_failed',
    jsonb_build_object(
      'orderPublicKey', v_order.public_key,
      'errorCode', v_error_code
    )
  );
  if v_order.clearing_hold_id is not null then
    perform private.release_bank_account_hold_v1(
      p_game_session_id,
      v_order.clearing_hold_id,
      'failed-clearing:' || v_order.public_key,
      v_failure_hash,
      'terminal_failed',
      jsonb_build_object(
        'orderPublicKey', v_order.public_key,
        'errorCode', v_error_code
      )
    );
  end if;
  if v_order.reserve_hold_id is not null then
    perform private.release_bank_account_hold_v1(
      p_game_session_id,
      v_order.reserve_hold_id,
      'failed-reserve:' || v_order.public_key,
      v_failure_hash,
      'terminal_failed',
      jsonb_build_object(
        'orderPublicKey', v_order.public_key,
        'errorCode', v_error_code
      )
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
    ) values (
      p_game_session_id,
      v_quote.target_cap_snapshot_id,
      v_order.reserve_hold_id,
      v_quote.target_currency_code,
      'facility_released',
      v_order.reserve_reserved_amount,
      'facility-released:' || v_order.public_key || ':terminal-failed',
      v_failure_hash,
      jsonb_build_object(
        'orderPublicKey', v_order.public_key,
        'errorCode', v_error_code
      ),
      p_now
    );
  end if;

  update private.fx_order_runtime_state
  set status = 'failed',
      lease_token = null,
      lease_owner = null,
      lease_expires_at = null,
      terminal_at = p_now,
      last_error_code = v_error_code,
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
    'failed',
    'failed:' || v_order.public_key,
    v_failure_hash,
    jsonb_build_object('errorCode', v_error_code),
    p_now
  );

  return jsonb_build_object(
    'outcome', 'applied',
    'order', private.fx_order_public_json_v1(v_order.id)
  );
end;
$function$;

revoke all on function public.fail_standard_fx_order_v1(
  uuid, text, uuid, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.fail_standard_fx_order_v1(
  uuid, text, uuid, text, timestamptz
) to service_role;

commit;

-- C3C deterministic-clock seam.
--
-- Production continues through the public service-only function and supplies
-- clock_timestamp(). The timestamp entrypoint is private and revoked from
-- browser/service roles so disposable database acceptance can exercise exact
-- market-open, expiry, and close boundaries without changing runtime authority.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '180s';

create or replace function private.settle_stock_buy_quote_at_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_quote_key text,
  p_idempotency_key text,
  p_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
declare
  v_quote_key text := lower(btrim(coalesce(p_quote_key, '')));
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_existing_order public.stock_orders%rowtype;
  v_existing_quote public.stock_buy_quotes%rowtype;
  v_quote_preview public.stock_buy_quotes%rowtype;
  v_quote public.stock_buy_quotes%rowtype;
  v_asset public.game_session_stock_assets%rowtype;
  v_latest_tick public.stock_price_ticks%rowtype;
  v_player_session public.player_sessions%rowtype;
  v_funding_quote public.purchase_funding_quotes%rowtype;
  v_liquidity_binding public.stock_market_liquidity_accounts%rowtype;
  v_liquidity_account public.bank_accounts%rowtype;
  v_liquidity_party public.economic_parties%rowtype;
  v_holding public.stock_holdings%rowtype;
  v_holding_exists boolean := false;
  v_holding_quantity_before numeric(20, 4) := 0;
  v_average_cost_before numeric(18, 4) := 0;
  v_holding_quantity_after numeric(20, 4);
  v_average_cost_after numeric(18, 4);
  v_order_id uuid := extensions.gen_random_uuid();
  v_trade_id uuid := extensions.gen_random_uuid();
  v_funding_idempotency text;
  v_funding_result jsonb;
  v_funding_receipt_key text;
  v_funding_receipt public.purchase_funding_receipts%rowtype;
  v_order public.stock_orders%rowtype;
  v_trade public.stock_trades%rowtype;
  v_now timestamptz := p_at;
  v_fail_stage text := lower(coalesce(
    current_setting('app.stock_buy_settlement_fail_stage', true),
    ''
  ));
begin
  if p_game_session_id is null
     or p_player_id is null
     or p_at is null
     or v_quote_key !~ '^sbq_[0-9a-f]{32}$'
     or v_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$'
  then
    raise exception 'STOCK_BUY_SETTLEMENT_REQUEST_INVALID' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(concat_ws(
    ':', 'stock-buy-settlement', p_game_session_id::text,
    p_player_id::text, v_idempotency_key
  ), 0));

  -- Resolve exact replay before market/session/price reinterpretation.
  select order_row.*
  into v_existing_order
  from public.stock_orders as order_row
  where order_row.game_session_id = p_game_session_id
    and order_row.player_id = p_player_id
    and order_row.idempotency_key = v_idempotency_key
    and order_row.side = 'buy'
    and order_row.settlement_evidence_family = 'c3';

  if found then
    select quote_row.*
    into v_existing_quote
    from public.stock_buy_quotes as quote_row
    where quote_row.id = v_existing_order.stock_buy_quote_id
      and quote_row.game_session_id = v_existing_order.game_session_id;

    if not found or v_existing_quote.public_key <> v_quote_key then
      raise exception 'STOCK_BUY_SETTLEMENT_IDEMPOTENCY_CONFLICT' using errcode = '23505';
    end if;

    return private.stock_buy_settlement_public_json_v1(v_existing_order.id, true);
  end if;

  select quote_row.*
  into v_quote_preview
  from public.stock_buy_quotes as quote_row
  where quote_row.game_session_id = p_game_session_id
    and quote_row.player_id = p_player_id
    and quote_row.public_key = v_quote_key;

  if not found then
    raise exception 'STOCK_BUY_SETTLEMENT_QUOTE_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- Different settlement keys attempting the same quote serialize here.
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(
    ':', 'stock-buy-quote-consume', p_game_session_id::text, v_quote_preview.id::text
  ), 0));

  select order_row.*
  into v_existing_order
  from public.stock_orders as order_row
  where order_row.game_session_id = p_game_session_id
    and order_row.stock_buy_quote_id = v_quote_preview.id
    and order_row.side = 'buy'
    and order_row.settlement_evidence_family = 'c3';

  if found then
    if v_existing_order.idempotency_key = v_idempotency_key then
      return private.stock_buy_settlement_public_json_v1(v_existing_order.id, true);
    end if;
    raise exception 'STOCK_BUY_SETTLEMENT_QUOTE_CONSUMED' using errcode = '23505';
  end if;

  -- Lock Stock price root, latest-tick evidence, then immutable Stock quote
  -- before entering C0/B2 monetary roots.
  select asset_row.*
  into v_asset
  from public.game_session_stock_assets as asset_row
  where asset_row.game_session_id = p_game_session_id
    and asset_row.id = v_quote_preview.stock_asset_id
  for update;

  if not found or not v_asset.is_active then
    raise exception 'STOCK_BUY_SETTLEMENT_ASSET_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select tick_row.*
  into v_latest_tick
  from public.stock_price_ticks as tick_row
  where tick_row.game_session_id = p_game_session_id
    and tick_row.stock_asset_id = v_asset.id
  order by tick_row.tick_index desc
  limit 1
  for share;

  if not found then
    raise exception 'STOCK_BUY_SETTLEMENT_TICK_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select quote_row.*
  into v_quote
  from public.stock_buy_quotes as quote_row
  where quote_row.game_session_id = p_game_session_id
    and quote_row.id = v_quote_preview.id
    and quote_row.player_id = p_player_id
  for update;

  if not found
     or v_quote.public_key <> v_quote_key
     or v_quote.stock_asset_id <> v_asset.id
     or v_quote.ticker <> v_asset.ticker
     or v_quote.listing_currency_code <> v_asset.listing_currency_code
  then
    raise exception 'STOCK_BUY_SETTLEMENT_QUOTE_SCOPE_INVALID' using errcode = 'P0001';
  end if;

  if v_quote.expires_at <= v_now then
    raise exception 'STOCK_BUY_SETTLEMENT_QUOTE_EXPIRED' using errcode = 'P0001';
  end if;

  if not public.is_stock_market_open_at(p_game_session_id, v_now) then
    raise exception 'STOCK_BUY_SETTLEMENT_MARKET_CLOSED' using errcode = 'P0001';
  end if;

  if v_asset.current_price is distinct from v_quote.quoted_price
     or v_latest_tick.price is distinct from v_quote.quoted_price
  then
    raise exception 'STOCK_BUY_SETTLEMENT_PRICE_CHANGED' using errcode = 'P0001';
  end if;

  if v_latest_tick.tick_index is distinct from v_quote.price_tick_index then
    raise exception 'STOCK_BUY_SETTLEMENT_TICK_CHANGED' using errcode = 'P0001';
  end if;

  perform 1
  from public.players as player_row
  where player_row.game_session_id = p_game_session_id
    and player_row.id = p_player_id
    and player_row.status = 'active'
  for share;
  if not found then
    raise exception 'STOCK_BUY_SETTLEMENT_PLAYER_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select session_row.*
  into v_player_session
  from public.player_sessions as session_row
  where session_row.game_session_id = p_game_session_id
    and session_row.player_id = p_player_id
    and session_row.status = 'active'
    and session_row.revoked_at is null
    and session_row.expires_at > v_now
  order by session_row.created_at desc
  limit 1
  for share;

  if not found then
    raise exception 'STOCK_BUY_SETTLEMENT_SESSION_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select funding_row.*
  into v_funding_quote
  from public.purchase_funding_quotes as funding_row
  where funding_row.game_session_id = p_game_session_id
    and funding_row.id = v_quote.funding_quote_id
    and funding_row.player_id = p_player_id;

  if not found
     or v_funding_quote.funding_context_kind <> 'stocks.immediate-buy'
     or v_funding_quote.funding_context_key <> v_quote.public_key
     or v_funding_quote.funding_context_hash <> v_quote.request_hash
     or v_funding_quote.target_currency_code <> v_quote.listing_currency_code
     or v_funding_quote.target_amount <> v_quote.gross_value
     or v_funding_quote.expires_at <> v_quote.expires_at
  then
    raise exception 'STOCK_BUY_SETTLEMENT_FUNDING_MISMATCH' using errcode = 'P0001';
  end if;

  if v_funding_quote.expires_at <= v_now then
    raise exception 'STOCK_BUY_SETTLEMENT_FUNDING_EXPIRED' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(concat_ws(
    ':', 'stock-buy-holding', p_game_session_id::text,
    p_player_id::text, v_asset.id::text
  ), 0));

  select holding_row.*
  into v_holding
  from public.stock_holdings as holding_row
  where holding_row.game_session_id = p_game_session_id
    and holding_row.player_id = p_player_id
    and holding_row.stock_asset_id = v_asset.id
  for update;

  v_holding_exists := found;
  if v_holding_exists then
    if v_holding.cost_currency_code <> v_quote.listing_currency_code
       or v_holding.reserved_quantity > v_holding.quantity
    then
      raise exception 'STOCK_BUY_SETTLEMENT_HOLDING_INVALID' using errcode = 'P0001';
    end if;
    v_holding_quantity_before := v_holding.quantity;
    v_average_cost_before := v_holding.average_cost;
  end if;

  v_holding_quantity_after := v_holding_quantity_before + v_quote.quantity;
  v_average_cost_after := round((
    (v_holding_quantity_before * v_average_cost_before)
      + (v_quote.quantity * v_quote.quoted_price)
  ) / v_holding_quantity_after, 4);

  perform private.ensure_stock_market_liquidity_account_v1(
    p_game_session_id,
    v_quote.listing_currency_code
  );

  select binding_row.*
  into v_liquidity_binding
  from public.stock_market_liquidity_accounts as binding_row
  where binding_row.game_session_id = p_game_session_id
    and binding_row.currency_code = v_quote.listing_currency_code;

  if not found then
    raise exception 'STOCK_BUY_SETTLEMENT_LIQUIDITY_BINDING_MISSING' using errcode = 'P0001';
  end if;

  select account_row.*
  into v_liquidity_account
  from public.bank_accounts as account_row
  where account_row.game_session_id = p_game_session_id
    and account_row.id = v_liquidity_binding.bank_account_id
    and account_row.account_kind = 'checking'
    and account_row.currency_code = v_quote.listing_currency_code
    and account_row.status = 'active';

  if not found then
    raise exception 'STOCK_BUY_SETTLEMENT_LIQUIDITY_ACCOUNT_INVALID' using errcode = 'P0001';
  end if;

  select party_row.*
  into v_liquidity_party
  from public.economic_parties as party_row
  where party_row.game_session_id = p_game_session_id
    and party_row.id = v_liquidity_account.party_id
    and party_row.party_kind = 'system'
    and party_row.system_key = 'stocks.market-liquidity'
    and party_row.status = 'active';

  if not found then
    raise exception 'STOCK_BUY_SETTLEMENT_LIQUIDITY_PARTY_INVALID' using errcode = 'P0001';
  end if;

  v_funding_idempotency := 'stocks-buy-settle:' || substr(encode(digest(
    convert_to(v_quote.public_key || ':' || v_idempotency_key, 'UTF8'), 'sha256'
  ), 'hex'), 1, 64);

  v_funding_result := private.compose_purchase_funding_v1(
    p_game_session_id,
    p_player_id,
    v_funding_quote.public_key,
    'stocks.immediate-buy',
    v_quote.public_key,
    v_quote.request_hash,
    v_liquidity_account.id,
    'stocks',
    'immediate_buy_funding',
    v_order_id,
    v_funding_idempotency,
    'player',
    p_player_id,
    v_now
  );

  v_funding_receipt_key := nullif(
    btrim(v_funding_result -> 'receipt' ->> 'receipt_key'),
    ''
  );

  select receipt_row.*
  into v_funding_receipt
  from public.purchase_funding_receipts as receipt_row
  where receipt_row.game_session_id = p_game_session_id
    and receipt_row.public_key = v_funding_receipt_key
    and receipt_row.player_id = p_player_id
    and receipt_row.quote_id = v_funding_quote.id
    and receipt_row.target_account_id = v_liquidity_account.id
    and receipt_row.funding_context_kind = 'stocks.immediate-buy'
    and receipt_row.funding_context_key = v_quote.public_key
    and receipt_row.funding_context_hash = v_quote.request_hash
    and receipt_row.target_currency_code = v_quote.listing_currency_code
    and receipt_row.target_amount = v_quote.gross_value
    and receipt_row.source_domain = 'stocks'
    and receipt_row.source_action = 'immediate_buy_funding'
    and receipt_row.source_id = v_order_id;

  if not found then
    raise exception 'STOCK_BUY_SETTLEMENT_RECEIPT_INVALID' using errcode = 'P0001';
  end if;

  if v_fail_stage = 'after_funding' then
    raise exception 'STOCK_BUY_SETTLEMENT_INJECTED_FAILURE:after_funding' using errcode = 'P0001';
  end if;

  if v_holding_exists then
    update public.stock_holdings
    set
      player_session_id = v_player_session.id,
      ticker = v_asset.ticker,
      quantity = v_holding_quantity_after,
      average_cost = v_average_cost_after
    where id = v_holding.id
      and game_session_id = p_game_session_id
    returning * into v_holding;
  else
    insert into public.stock_holdings(
      game_session_id,
      player_session_id,
      player_id,
      stock_asset_id,
      ticker,
      quantity,
      reserved_quantity,
      average_cost,
      realized_pnl,
      cost_currency_code
    ) values (
      p_game_session_id,
      v_player_session.id,
      p_player_id,
      v_asset.id,
      v_asset.ticker,
      v_holding_quantity_after,
      0,
      v_average_cost_after,
      0,
      v_quote.listing_currency_code
    )
    returning * into v_holding;
  end if;

  if v_holding.quantity <> v_holding_quantity_after
     or v_holding.average_cost <> v_average_cost_after
     or v_holding.cost_currency_code <> v_quote.listing_currency_code
  then
    raise exception 'STOCK_BUY_SETTLEMENT_HOLDING_POSTCONDITION_FAILED' using errcode = 'P0001';
  end if;

  if v_fail_stage = 'after_holding' then
    raise exception 'STOCK_BUY_SETTLEMENT_INJECTED_FAILURE:after_holding' using errcode = 'P0001';
  end if;

  insert into public.stock_orders(
    id, game_session_id, player_session_id, player_id, stock_asset_id, ticker,
    side, order_type, quantity, requested_price, execution_price, gross_value,
    status, rejection_reason, idempotency_key, cash_balance_after,
    cash_currency_code, holding_quantity_after, average_cost_after, created_at,
    filled_at, listing_currency_code, settlement_evidence_family,
    stock_buy_quote_id, price_tick_index, funding_quote_id, funding_receipt_id,
    funding_bank_transaction_id, market_liquidity_account_id,
    destination_bank_account_id, settlement_bank_transaction_id
  ) values (
    v_order_id, p_game_session_id, v_player_session.id, p_player_id, v_asset.id,
    v_asset.ticker, 'buy', 'market', v_quote.quantity, v_quote.quoted_price,
    v_quote.quoted_price, v_quote.gross_value, 'filled', null,
    v_idempotency_key, null, v_quote.listing_currency_code, v_holding.quantity,
    v_holding.average_cost, v_now, v_now, v_quote.listing_currency_code, 'c3',
    v_quote.id, v_quote.price_tick_index, v_funding_quote.id,
    v_funding_receipt.id, v_funding_receipt.bank_transaction_id,
    v_liquidity_account.id, null, null
  )
  returning * into v_order;

  if v_fail_stage = 'after_order' then
    raise exception 'STOCK_BUY_SETTLEMENT_INJECTED_FAILURE:after_order' using errcode = 'P0001';
  end if;

  insert into public.stock_trades(
    id, order_id, game_session_id, player_session_id, player_id, stock_asset_id,
    ticker, side, quantity, execution_price, gross_value, created_at,
    listing_currency_code, settlement_evidence_family, price_tick_index
  ) values (
    v_trade_id, v_order.id, p_game_session_id, v_player_session.id, p_player_id,
    v_asset.id, v_asset.ticker, 'buy', v_quote.quantity, v_quote.quoted_price,
    v_quote.gross_value, v_now, v_quote.listing_currency_code, 'c3',
    v_quote.price_tick_index
  )
  returning * into v_trade;

  if v_fail_stage = 'after_trade' then
    raise exception 'STOCK_BUY_SETTLEMENT_INJECTED_FAILURE:after_trade' using errcode = 'P0001';
  end if;

  if v_order.stock_buy_quote_id <> v_quote.id
     or v_order.funding_quote_id <> v_funding_quote.id
     or v_order.funding_receipt_id <> v_funding_receipt.id
     or v_order.funding_bank_transaction_id <> v_funding_receipt.bank_transaction_id
     or v_order.market_liquidity_account_id <> v_liquidity_account.id
     or v_order.price_tick_index <> v_quote.price_tick_index
     or v_order.execution_price <> v_quote.quoted_price
     or v_order.gross_value <> v_quote.gross_value
     or v_trade.order_id <> v_order.id
     or v_trade.price_tick_index <> v_order.price_tick_index
     or v_trade.execution_price <> v_order.execution_price
     or v_trade.gross_value <> v_order.gross_value
  then
    raise exception 'STOCK_BUY_SETTLEMENT_EVIDENCE_POSTCONDITION_FAILED' using errcode = 'P0001';
  end if;

  if v_fail_stage = 'after_evidence' then
    raise exception 'STOCK_BUY_SETTLEMENT_INJECTED_FAILURE:after_evidence' using errcode = 'P0001';
  end if;

  return private.stock_buy_settlement_public_json_v1(v_order.id, false);
end;
$function$;

revoke all on function private.settle_stock_buy_quote_at_v1(
  uuid, uuid, text, text, timestamptz
) from public, anon, authenticated, service_role;

create or replace function public.settle_stock_buy_quote_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_quote_key text,
  p_idempotency_key text
)
returns jsonb
language sql
volatile
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
  select private.settle_stock_buy_quote_at_v1(
    p_game_session_id,
    p_player_id,
    p_quote_key,
    p_idempotency_key,
    clock_timestamp()
  );
$function$;

revoke all on function public.settle_stock_buy_quote_v1(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.settle_stock_buy_quote_v1(uuid, uuid, text, text)
  to service_role;

commit;

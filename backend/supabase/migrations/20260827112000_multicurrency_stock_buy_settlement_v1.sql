-- Multi-currency Stock Market atomic immediate-buy settlement V1.
--
-- C3C only: consumes one immutable C3B Stock quote and its bound C0 funding
-- quote, composes exact funding into the canonical stocks.market-liquidity B2
-- account, updates the Player holding, and creates exactly one filled order and
-- trade in the same transaction. It does not activate sell settlement or alter
-- the Player API/UI, price engine, exchange calendar, or scheduler.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '180s';

alter table public.stock_orders
  add column stock_buy_quote_id uuid null;

alter table public.stock_orders
  add constraint stock_orders_stock_buy_quote_scope_fk
  foreign key (stock_buy_quote_id, game_session_id)
  references public.stock_buy_quotes(id, game_session_id) not valid;

alter table public.stock_orders
  validate constraint stock_orders_stock_buy_quote_scope_fk;

create unique index stock_orders_stock_buy_quote_unique
  on public.stock_orders(stock_buy_quote_id)
  where stock_buy_quote_id is not null;

create unique index stock_orders_c3_player_idempotency_unique
  on public.stock_orders(game_session_id, player_id, idempotency_key)
  where settlement_evidence_family = 'c3';

alter table public.stock_orders
  drop constraint stock_orders_settlement_evidence_shape_check;

alter table public.stock_orders
  add constraint stock_orders_settlement_evidence_shape_check
  check (
    (
      settlement_evidence_family = 'legacy'
      and stock_buy_quote_id is null
      and price_tick_index is null
      and funding_quote_id is null
      and funding_receipt_id is null
      and funding_bank_transaction_id is null
      and market_liquidity_account_id is null
      and destination_bank_account_id is null
      and settlement_bank_transaction_id is null
      and cash_balance_after is not null
    )
    or (
      settlement_evidence_family = 'c3'
      and status = 'filled'
      and cash_currency_code = listing_currency_code
      and cash_balance_after is null
      and price_tick_index is not null
      and price_tick_index >= 0
      and market_liquidity_account_id is not null
      and (
        (
          side = 'buy'
          and stock_buy_quote_id is not null
          and funding_quote_id is not null
          and funding_receipt_id is not null
          and funding_bank_transaction_id is not null
          and destination_bank_account_id is null
          and settlement_bank_transaction_id is null
        )
        or (
          side = 'sell'
          and stock_buy_quote_id is null
          and funding_quote_id is null
          and funding_receipt_id is null
          and funding_bank_transaction_id is null
          and destination_bank_account_id is not null
          and settlement_bank_transaction_id is not null
        )
      )
    )
  ) not valid;

alter table public.stock_orders
  validate constraint stock_orders_settlement_evidence_shape_check;

comment on column public.stock_orders.stock_buy_quote_id is
  'Immutable C3 immediate-buy quote consumed by this filled order. Unique non-null binding makes Stock quote consumption exactly once.';

create or replace function private.guard_stock_order_currency_evidence_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_expected_currency text;
begin
  select asset_row.listing_currency_code
  into v_expected_currency
  from public.game_session_stock_assets as asset_row
  where asset_row.id = new.stock_asset_id
    and asset_row.game_session_id = new.game_session_id;

  if not found then
    raise exception 'STOCK_ORDER_ASSET_NOT_FOUND' using errcode = '23503';
  end if;

  if nullif(btrim(coalesce(new.listing_currency_code, '')), '') is null then
    new.listing_currency_code := v_expected_currency;
  else
    new.listing_currency_code := upper(btrim(new.listing_currency_code));
  end if;

  if new.listing_currency_code <> v_expected_currency then
    raise exception 'STOCK_ORDER_LISTING_CURRENCY_MISMATCH' using errcode = 'P0001';
  end if;

  new.settlement_evidence_family := lower(
    btrim(coalesce(new.settlement_evidence_family, 'legacy'))
  );

  if tg_op = 'UPDATE' and (
    new.listing_currency_code is distinct from old.listing_currency_code
    or new.settlement_evidence_family is distinct from old.settlement_evidence_family
    or new.stock_buy_quote_id is distinct from old.stock_buy_quote_id
    or new.price_tick_index is distinct from old.price_tick_index
    or new.funding_quote_id is distinct from old.funding_quote_id
    or new.funding_receipt_id is distinct from old.funding_receipt_id
    or new.funding_bank_transaction_id is distinct from old.funding_bank_transaction_id
    or new.market_liquidity_account_id is distinct from old.market_liquidity_account_id
    or new.destination_bank_account_id is distinct from old.destination_bank_account_id
    or new.settlement_bank_transaction_id is distinct from old.settlement_bank_transaction_id
  ) then
    raise exception 'STOCK_ORDER_SETTLEMENT_EVIDENCE_IMMUTABLE'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

revoke all on function private.guard_stock_order_currency_evidence_v1()
  from public, anon, authenticated, service_role;

create or replace function private.stock_buy_settlement_public_json_v1(
  p_order_id uuid,
  p_replayed boolean
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
  select jsonb_build_object(
    'quote_key', quote_row.public_key,
    'ticker', order_row.ticker,
    'listing_currency_code', order_row.listing_currency_code,
    'quantity', order_row.quantity::text,
    'execution_price', order_row.execution_price::text,
    'price_tick_index', order_row.price_tick_index,
    'gross_value', order_row.gross_value::text,
    'holding_quantity_after', order_row.holding_quantity_after::text,
    'average_cost_after', order_row.average_cost_after::text,
    'filled_at', order_row.filled_at,
    'already_completed', p_replayed,
    'funding', private.purchase_funding_receipt_public_json_v1(
      order_row.funding_receipt_id
    )
  )
  from public.stock_orders as order_row
  join public.stock_buy_quotes as quote_row
    on quote_row.id = order_row.stock_buy_quote_id
   and quote_row.game_session_id = order_row.game_session_id
  join public.stock_trades as trade_row
    on trade_row.order_id = order_row.id
   and trade_row.game_session_id = order_row.game_session_id
  where order_row.id = p_order_id
    and order_row.side = 'buy'
    and order_row.status = 'filled'
    and order_row.settlement_evidence_family = 'c3'
    and order_row.funding_receipt_id is not null
    and trade_row.settlement_evidence_family = 'c3';
$function$;

revoke all on function private.stock_buy_settlement_public_json_v1(uuid, boolean)
  from public, anon, authenticated, service_role;

create or replace function public.settle_stock_buy_quote_v1(
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
  v_order_idempotency text;
  v_funding_idempotency text;
  v_funding_result jsonb;
  v_funding_receipt_key text;
  v_funding_receipt public.purchase_funding_receipts%rowtype;
  v_order public.stock_orders%rowtype;
  v_trade public.stock_trades%rowtype;
  v_now timestamptz := clock_timestamp();
  v_fail_stage text := lower(coalesce(
    current_setting('app.stock_buy_settlement_fail_stage', true),
    ''
  ));
begin
  if p_game_session_id is null
     or p_player_id is null
     or v_quote_key !~ '^sbq_[0-9a-f]{32}$'
     or v_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$'
  then
    raise exception 'STOCK_BUY_SETTLEMENT_REQUEST_INVALID' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(concat_ws(
    ':', 'stock-buy-settlement', p_game_session_id::text,
    p_player_id::text, v_idempotency_key
  ), 0));

  -- Replay is resolved before market/session/price reinterpretation.
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

    return private.stock_buy_settlement_public_json_v1(
      v_existing_order.id,
      true
    );
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

  -- A quote-wide advisory lock serializes different idempotency keys attempting
  -- to consume the same immutable Stock quote.
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
      return private.stock_buy_settlement_public_json_v1(
        v_existing_order.id,
        true
      );
    end if;
    raise exception 'STOCK_BUY_SETTLEMENT_QUOTE_CONSUMED' using errcode = '23505';
  end if;

  -- Stock price root first. The Stock quote is locked before any C0/B2 root.
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

  -- Serialize the logical Player/asset holding even if the row does not exist.
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

  -- The target B2 account is identity-only until the C0 composer posts money.
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

  v_order_idempotency := 'stocks.c3.buy:' || substr(encode(digest(
    convert_to(v_idempotency_key, 'UTF8'), 'sha256'
  ), 'hex'), 1, 64);

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
    id,
    game_session_id,
    player_session_id,
    player_id,
    stock_asset_id,
    ticker,
    side,
    order_type,
    quantity,
    requested_price,
    execution_price,
    gross_value,
    status,
    rejection_reason,
    idempotency_key,
    cash_balance_after,
    cash_currency_code,
    holding_quantity_after,
    average_cost_after,
    created_at,
    filled_at,
    listing_currency_code,
    settlement_evidence_family,
    stock_buy_quote_id,
    price_tick_index,
    funding_quote_id,
    funding_receipt_id,
    funding_bank_transaction_id,
    market_liquidity_account_id,
    destination_bank_account_id,
    settlement_bank_transaction_id
  ) values (
    v_order_id,
    p_game_session_id,
    v_player_session.id,
    p_player_id,
    v_asset.id,
    v_asset.ticker,
    'buy',
    'market',
    v_quote.quantity,
    v_quote.quoted_price,
    v_quote.quoted_price,
    v_quote.gross_value,
    'filled',
    null,
    v_idempotency_key,
    null,
    v_quote.listing_currency_code,
    v_holding.quantity,
    v_holding.average_cost,
    v_now,
    v_now,
    v_quote.listing_currency_code,
    'c3',
    v_quote.id,
    v_quote.price_tick_index,
    v_funding_quote.id,
    v_funding_receipt.id,
    v_funding_receipt.bank_transaction_id,
    v_liquidity_account.id,
    null,
    null
  )
  returning * into v_order;

  if v_fail_stage = 'after_order' then
    raise exception 'STOCK_BUY_SETTLEMENT_INJECTED_FAILURE:after_order' using errcode = 'P0001';
  end if;

  insert into public.stock_trades(
    id,
    order_id,
    game_session_id,
    player_session_id,
    player_id,
    stock_asset_id,
    ticker,
    side,
    quantity,
    execution_price,
    gross_value,
    created_at,
    listing_currency_code,
    settlement_evidence_family,
    price_tick_index
  ) values (
    v_trade_id,
    v_order.id,
    p_game_session_id,
    v_player_session.id,
    p_player_id,
    v_asset.id,
    v_asset.ticker,
    'buy',
    v_quote.quantity,
    v_quote.quoted_price,
    v_quote.gross_value,
    v_now,
    v_quote.listing_currency_code,
    'c3',
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

comment on function public.settle_stock_buy_quote_v1(uuid, uuid, text, text) is
  'Service-only C3C replay-first atomic immediate-buy settlement. Consumes one exact C3B Stock quote/C0 funding quote into canonical B2 market liquidity, one holding update, one filled order, and one trade.';

revoke all on function public.settle_stock_buy_quote_v1(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.settle_stock_buy_quote_v1(uuid, uuid, text, text)
  to service_role;

commit;

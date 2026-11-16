-- Multi-currency Stock Market atomic immediate-sell settlement V1.
-- C3D only: revalidates exact price/tick, debits unreserved shares once, moves
-- listing-currency proceeds from canonical stocks.market-liquidity to one Player
-- Checking account through B2, and writes one filled order/trade atomically.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '180s';

create or replace function private.stock_sell_settlement_public_json_v1(
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
    'ticker', o.ticker,
    'listing_currency_code', o.listing_currency_code,
    'quantity', o.quantity::text,
    'execution_price', o.execution_price::text,
    'price_tick_index', o.price_tick_index,
    'gross_value', o.gross_value::text,
    'holding_quantity_after', o.holding_quantity_after::text,
    'average_cost_after', o.average_cost_after::text,
    'filled_at', o.filled_at,
    'destination_account_key', a.public_key,
    'settlement_transaction_key', t.public_key,
    'already_completed', p_replayed
  )
  from public.stock_orders o
  join public.bank_accounts a
    on a.id = o.destination_bank_account_id
   and a.game_session_id = o.game_session_id
  join public.bank_transactions t
    on t.id = o.settlement_bank_transaction_id
   and t.game_session_id = o.game_session_id
  join public.stock_trades tr
    on tr.order_id = o.id
   and tr.game_session_id = o.game_session_id
  where o.id = p_order_id
    and o.side = 'sell'
    and o.status = 'filled'
    and o.settlement_evidence_family = 'c3'
    and tr.settlement_evidence_family = 'c3';
$function$;

revoke all on function private.stock_sell_settlement_public_json_v1(uuid, boolean)
  from public, anon, authenticated, service_role;

create or replace function private.settle_stock_sell_at_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_ticker text,
  p_quantity numeric,
  p_expected_price numeric,
  p_expected_tick_index bigint,
  p_destination_account_key text,
  p_idempotency_key text,
  p_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
declare
  v_ticker text := upper(btrim(coalesce(p_ticker, '')));
  v_destination_key text := lower(btrim(coalesce(p_destination_account_key, '')));
  v_idempotency text := btrim(coalesce(p_idempotency_key, ''));
  v_existing public.stock_orders%rowtype;
  v_asset public.game_session_stock_assets%rowtype;
  v_tick public.stock_price_ticks%rowtype;
  v_session public.player_sessions%rowtype;
  v_holding public.stock_holdings%rowtype;
  v_destination public.bank_accounts%rowtype;
  v_destination_party public.economic_parties%rowtype;
  v_binding public.stock_market_liquidity_accounts%rowtype;
  v_liquidity public.bank_accounts%rowtype;
  v_currency_precision integer;
  v_quantity_after numeric(20,4);
  v_realized_increment numeric(18,4);
  v_gross numeric(38,18);
  v_order_id uuid := extensions.gen_random_uuid();
  v_trade_id uuid := extensions.gen_random_uuid();
  v_transaction_id uuid;
  v_transaction public.bank_transactions%rowtype;
  v_request_hash text;
  v_bank_idempotency text;
  v_fail_stage text := lower(coalesce(current_setting('app.stock_sell_settlement_fail_stage', true), ''));
begin
  if p_game_session_id is null or p_player_id is null or p_at is null
     or v_ticker !~ '^[A-Z0-9._-]{1,24}$'
     or p_quantity is null or p_quantity <= 0 or p_quantity <> round(p_quantity, 4)
     or p_expected_price is null or p_expected_price <= 0
     or p_expected_tick_index is null or p_expected_tick_index < 0
     or v_destination_key !~ '^bac_[0-9a-f]{32}$'
     or v_idempotency !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$'
  then
    raise exception 'STOCK_SELL_SETTLEMENT_REQUEST_INVALID' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(concat_ws(':',
    'stock-sell-settlement', p_game_session_id::text, p_player_id::text, v_idempotency
  ), 0));

  -- Replay before any current-state reinterpretation.
  select o.* into v_existing
  from public.stock_orders o
  where o.game_session_id = p_game_session_id
    and o.player_id = p_player_id
    and o.idempotency_key = v_idempotency
    and o.side = 'sell'
    and o.settlement_evidence_family = 'c3';
  if found then
    if v_existing.ticker <> v_ticker
       or v_existing.quantity <> p_quantity
       or v_existing.requested_price <> p_expected_price
       or v_existing.price_tick_index <> p_expected_tick_index
       or not exists (
         select 1 from public.bank_accounts a
         where a.id = v_existing.destination_bank_account_id
           and a.game_session_id = p_game_session_id
           and a.public_key = v_destination_key
       )
    then
      raise exception 'STOCK_SELL_SETTLEMENT_IDEMPOTENCY_CONFLICT' using errcode = '23505';
    end if;
    return private.stock_sell_settlement_public_json_v1(v_existing.id, true);
  end if;

  select a.* into v_asset
  from public.game_session_stock_assets a
  where a.game_session_id = p_game_session_id
    and a.ticker = v_ticker
  for update;
  if not found or not v_asset.is_active then
    raise exception 'STOCK_SELL_SETTLEMENT_ASSET_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select t.* into v_tick
  from public.stock_price_ticks t
  where t.game_session_id = p_game_session_id
    and t.stock_asset_id = v_asset.id
  order by t.tick_index desc
  limit 1
  for share;
  if not found then
    raise exception 'STOCK_SELL_SETTLEMENT_TICK_UNAVAILABLE' using errcode = 'P0001';
  end if;

  if not public.is_stock_market_open_at(p_game_session_id, p_at) then
    raise exception 'STOCK_SELL_SETTLEMENT_MARKET_CLOSED' using errcode = 'P0001';
  end if;
  if v_asset.current_price is distinct from p_expected_price
     or v_tick.price is distinct from p_expected_price then
    raise exception 'STOCK_SELL_SETTLEMENT_PRICE_CHANGED' using errcode = 'P0001';
  end if;
  if v_tick.tick_index is distinct from p_expected_tick_index then
    raise exception 'STOCK_SELL_SETTLEMENT_TICK_CHANGED' using errcode = 'P0001';
  end if;

  perform 1 from public.players p
  where p.game_session_id = p_game_session_id
    and p.id = p_player_id and p.status = 'active'
  for share;
  if not found then
    raise exception 'STOCK_SELL_SETTLEMENT_PLAYER_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select s.* into v_session
  from public.player_sessions s
  where s.game_session_id = p_game_session_id
    and s.player_id = p_player_id
    and s.status = 'active' and s.revoked_at is null and s.expires_at > p_at
  order by s.created_at desc limit 1 for share;
  if not found then
    raise exception 'STOCK_SELL_SETTLEMENT_SESSION_UNAVAILABLE' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(concat_ws(':',
    'stock-holding', p_game_session_id::text, p_player_id::text, v_asset.id::text
  ), 0));
  select h.* into v_holding
  from public.stock_holdings h
  where h.game_session_id = p_game_session_id
    and h.player_id = p_player_id
    and h.stock_asset_id = v_asset.id
  for update;
  if not found
     or v_holding.cost_currency_code <> v_asset.listing_currency_code
     or v_holding.quantity - v_holding.reserved_quantity < p_quantity
  then
    raise exception 'STOCK_SELL_SETTLEMENT_SHARES_INSUFFICIENT' using errcode = 'P0001';
  end if;

  select a.* into v_destination
  from public.bank_accounts a
  join public.economic_parties ep
    on ep.id = a.party_id and ep.game_session_id = a.game_session_id
  where a.game_session_id = p_game_session_id
    and a.public_key = v_destination_key
    and a.account_kind = 'checking'
    and a.currency_code = v_asset.listing_currency_code
    and a.status = 'active'
    and ep.party_kind = 'player'
    and ep.player_id = p_player_id
    and ep.status = 'active'
  for update of a;
  if not found then
    raise exception 'STOCK_SELL_SETTLEMENT_DESTINATION_INVALID' using errcode = 'P0001';
  end if;

  perform private.ensure_stock_market_liquidity_account_v1(p_game_session_id, v_asset.listing_currency_code);
  select b.* into v_binding
  from public.stock_market_liquidity_accounts b
  where b.game_session_id = p_game_session_id
    and b.currency_code = v_asset.listing_currency_code;
  if not found then
    raise exception 'STOCK_SELL_SETTLEMENT_LIQUIDITY_BINDING_MISSING' using errcode = 'P0001';
  end if;
  select a.* into v_liquidity
  from public.bank_accounts a
  where a.game_session_id = p_game_session_id
    and a.id = v_binding.bank_account_id
    and a.account_kind = 'checking'
    and a.currency_code = v_asset.listing_currency_code
    and a.status = 'active'
  for update;
  if not found then
    raise exception 'STOCK_SELL_SETTLEMENT_LIQUIDITY_ACCOUNT_INVALID' using errcode = 'P0001';
  end if;

  select c.decimal_places into v_currency_precision
  from public.currencies c
  where c.code = v_asset.listing_currency_code and c.status = 'active';
  if not found then
    raise exception 'STOCK_SELL_SETTLEMENT_CURRENCY_INVALID' using errcode = 'P0001';
  end if;

  v_gross := round(p_quantity * p_expected_price, v_currency_precision);
  if v_gross <= 0 then
    raise exception 'STOCK_SELL_SETTLEMENT_GROSS_INVALID' using errcode = 'P0001';
  end if;
  v_quantity_after := v_holding.quantity - p_quantity;
  v_realized_increment := round((p_expected_price - v_holding.average_cost) * p_quantity, 4);

  v_request_hash := private.bank_digest_text_v1(concat_ws('|',
    'stocks-c3-sell-v1', p_game_session_id::text, p_player_id::text, v_asset.id::text,
    p_quantity::text, p_expected_price::text, p_expected_tick_index::text,
    v_destination.id::text, v_gross::text, v_idempotency
  ));
  v_bank_idempotency := 'stocks-sell-settle:' || substr(private.bank_digest_text_v1(v_idempotency), 1, 64);

  select x.bank_transaction_id into v_transaction_id
  from private.post_bank_transaction_v1(
    p_game_session_id,
    'stock_sell',
    'stocks',
    'immediate_sell_proceeds',
    v_order_id,
    v_bank_idempotency,
    v_request_hash,
    jsonb_build_array(
      jsonb_build_object('bankAccountId', v_liquidity.id, 'amount', (-v_gross)::text, 'entryType', 'debit', 'metadata', jsonb_build_object('role','market_liquidity')),
      jsonb_build_object('bankAccountId', v_destination.id, 'amount', v_gross::text, 'entryType', 'credit', 'metadata', jsonb_build_object('role','player_proceeds'))
    ),
    'player',
    p_player_id,
    jsonb_build_object('authority','stocks.c3.sell','ticker',v_asset.ticker,'tickIndex',p_expected_tick_index),
    '{}'::uuid[]
  ) x;

  select t.* into v_transaction
  from public.bank_transactions t
  where t.id = v_transaction_id and t.game_session_id = p_game_session_id;
  if not found then
    raise exception 'STOCK_SELL_SETTLEMENT_BANK_TRANSACTION_MISSING' using errcode = 'P0001';
  end if;

  if v_fail_stage = 'after_funding' then
    raise exception 'STOCK_SELL_SETTLEMENT_INJECTED_FAILURE:after_funding' using errcode = 'P0001';
  end if;

  update public.stock_holdings
  set player_session_id = v_session.id,
      quantity = v_quantity_after,
      realized_pnl = realized_pnl + v_realized_increment
  where id = v_holding.id and game_session_id = p_game_session_id
  returning * into v_holding;
  if v_holding.quantity <> v_quantity_after then
    raise exception 'STOCK_SELL_SETTLEMENT_HOLDING_POSTCONDITION_FAILED' using errcode = 'P0001';
  end if;

  if v_fail_stage = 'after_holding' then
    raise exception 'STOCK_SELL_SETTLEMENT_INJECTED_FAILURE:after_holding' using errcode = 'P0001';
  end if;

  insert into public.stock_orders(
    id, game_session_id, player_session_id, player_id, stock_asset_id, ticker,
    side, order_type, quantity, requested_price, execution_price, gross_value,
    status, rejection_reason, idempotency_key, cash_balance_after, cash_currency_code,
    holding_quantity_after, average_cost_after, created_at, filled_at,
    listing_currency_code, settlement_evidence_family, stock_buy_quote_id,
    price_tick_index, funding_quote_id, funding_receipt_id, funding_bank_transaction_id,
    market_liquidity_account_id, destination_bank_account_id, settlement_bank_transaction_id
  ) values (
    v_order_id, p_game_session_id, v_session.id, p_player_id, v_asset.id, v_asset.ticker,
    'sell', 'market', p_quantity, p_expected_price, p_expected_price, v_gross,
    'filled', null, v_idempotency, null, v_asset.listing_currency_code,
    v_holding.quantity, v_holding.average_cost, p_at, p_at,
    v_asset.listing_currency_code, 'c3', null,
    p_expected_tick_index, null, null, null,
    v_liquidity.id, v_destination.id, v_transaction.id
  ) returning * into v_existing;

  if v_fail_stage = 'after_order' then
    raise exception 'STOCK_SELL_SETTLEMENT_INJECTED_FAILURE:after_order' using errcode = 'P0001';
  end if;

  insert into public.stock_trades(
    id, order_id, game_session_id, player_session_id, player_id, stock_asset_id,
    ticker, side, quantity, execution_price, gross_value, created_at,
    listing_currency_code, settlement_evidence_family, price_tick_index
  ) values (
    v_trade_id, v_existing.id, p_game_session_id, v_session.id, p_player_id, v_asset.id,
    v_asset.ticker, 'sell', p_quantity, p_expected_price, v_gross, p_at,
    v_asset.listing_currency_code, 'c3', p_expected_tick_index
  );

  if v_fail_stage = 'after_trade' then
    raise exception 'STOCK_SELL_SETTLEMENT_INJECTED_FAILURE:after_trade' using errcode = 'P0001';
  end if;

  if v_existing.destination_bank_account_id <> v_destination.id
     or v_existing.market_liquidity_account_id <> v_liquidity.id
     or v_existing.settlement_bank_transaction_id <> v_transaction.id
     or v_existing.price_tick_index <> p_expected_tick_index
  then
    raise exception 'STOCK_SELL_SETTLEMENT_EVIDENCE_POSTCONDITION_FAILED' using errcode = 'P0001';
  end if;

  if v_fail_stage = 'after_evidence' then
    raise exception 'STOCK_SELL_SETTLEMENT_INJECTED_FAILURE:after_evidence' using errcode = 'P0001';
  end if;

  return private.stock_sell_settlement_public_json_v1(v_existing.id, false);
end;
$function$;

revoke all on function private.settle_stock_sell_at_v1(uuid,uuid,text,numeric,numeric,bigint,text,text,timestamptz)
  from public, anon, authenticated, service_role;

create or replace function public.settle_stock_sell_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_ticker text,
  p_quantity numeric,
  p_expected_price numeric,
  p_expected_tick_index bigint,
  p_destination_account_key text,
  p_idempotency_key text
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
  select private.settle_stock_sell_at_v1(
    p_game_session_id, p_player_id, p_ticker, p_quantity, p_expected_price,
    p_expected_tick_index, p_destination_account_key, p_idempotency_key,
    clock_timestamp()
  );
$function$;

comment on function public.settle_stock_sell_v1(uuid,uuid,text,numeric,numeric,bigint,text,text) is
  'Service-only C3D atomic immediate Stock sell settlement into one Player-owned listing-currency Checking account.';
revoke all on function public.settle_stock_sell_v1(uuid,uuid,text,numeric,numeric,bigint,text,text)
  from public, anon, authenticated;
grant execute on function public.settle_stock_sell_v1(uuid,uuid,text,numeric,numeric,bigint,text,text)
  to service_role;

commit;

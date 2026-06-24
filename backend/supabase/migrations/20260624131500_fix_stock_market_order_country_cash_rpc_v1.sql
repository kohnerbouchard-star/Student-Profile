-- Fix stock order execution to use player country cash currency.
-- Previous migration added the corrected logic to an unused function name.
-- This replaces the live RPC used by the Edge repository: execute_stock_market_order.

alter table public.stock_orders
alter column cash_currency_code drop default;

create or replace function public.execute_stock_market_order(
  p_game_session_id uuid,
  p_player_session_id uuid,
  p_stock_asset_id uuid,
  p_side text,
  p_quantity numeric,
  p_idempotency_key text
)
returns table (
  order_id uuid,
  game_session_id uuid,
  player_session_id uuid,
  player_id uuid,
  stock_asset_id uuid,
  ticker text,
  side text,
  quantity numeric,
  execution_price numeric,
  gross_value numeric,
  status text,
  rejection_reason text,
  cash_balance numeric,
  cash_currency_code text,
  holding_quantity numeric,
  average_cost numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_side text := lower(btrim(coalesce(p_side, '')));
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_player_session public.player_sessions%rowtype;
  v_asset record;
  v_cash_balance public.account_balances%rowtype;
  v_player_currency_code text;
  v_holding public.stock_holdings%rowtype;
  v_order public.stock_orders%rowtype;
  v_ledger record;
  v_existing_cash_balance numeric := 0;
  v_existing_holding_quantity numeric := 0;
  v_existing_average_cost numeric := 0;
  v_gross_value numeric;
  v_new_holding_quantity numeric;
  v_new_average_cost numeric;
  v_realized_pnl numeric := 0;
begin
  if p_game_session_id is null then
    raise exception 'STOCK_TRADING_GAME_SESSION_REQUIRED';
  end if;

  if p_player_session_id is null then
    raise exception 'STOCK_TRADING_PLAYER_SESSION_REQUIRED';
  end if;

  if p_stock_asset_id is null then
    raise exception 'STOCK_TRADING_STOCK_ASSET_REQUIRED';
  end if;

  if v_side not in ('buy', 'sell') then
    raise exception 'STOCK_TRADING_INVALID_SIDE';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'STOCK_TRADING_INVALID_QUANTITY';
  end if;

  if length(v_idempotency_key) = 0 then
    raise exception 'STOCK_TRADING_IDEMPOTENCY_KEY_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_game_session_id::text || ':' || p_player_session_id::text || ':' || v_idempotency_key,
      0
    )
  );

  select existing_order.*
  into v_order
  from public.stock_orders existing_order
  where existing_order.game_session_id = p_game_session_id
    and existing_order.player_session_id = p_player_session_id
    and existing_order.idempotency_key = v_idempotency_key;

  if found then
    order_id := v_order.id;
    game_session_id := v_order.game_session_id;
    player_session_id := v_order.player_session_id;
    player_id := v_order.player_id;
    stock_asset_id := v_order.stock_asset_id;
    ticker := v_order.ticker;
    side := v_order.side;
    quantity := v_order.quantity;
    execution_price := v_order.execution_price;
    gross_value := v_order.gross_value;
    status := v_order.status;
    rejection_reason := v_order.rejection_reason;
    cash_balance := v_order.cash_balance_after;
    cash_currency_code := v_order.cash_currency_code;
    holding_quantity := v_order.holding_quantity_after;
    average_cost := v_order.average_cost_after;
    return next;
    return;
  end if;

  if not exists (
    select 1
    from public.game_sessions session
    where session.id = p_game_session_id
  ) then
    raise exception 'STOCK_TRADING_GAME_SESSION_NOT_FOUND';
  end if;

  select player_session.*
  into v_player_session
  from public.player_sessions player_session
  where player_session.id = p_player_session_id
    and player_session.game_session_id = p_game_session_id;

  if not found then
    raise exception 'STOCK_TRADING_PLAYER_SESSION_NOT_FOUND';
  end if;

  select asset.id, asset.ticker, asset.current_price
  into v_asset
  from public.game_session_stock_assets asset
  where asset.game_session_id = p_game_session_id
    and asset.id = p_stock_asset_id
    and asset.is_active = true;

  if not found then
    raise exception 'STOCK_TRADING_STOCK_ASSET_NOT_FOUND';
  end if;

  select upper(btrim(country.currency_code))
  into v_player_currency_code
  from public.player_country_assignments assignment
  join public.country_profiles country
    on country.id = assignment.country_profile_id
  where assignment.game_session_id = p_game_session_id
    and assignment.player_id = v_player_session.player_id
    and assignment.status = 'active'
  order by assignment.assigned_at desc
  limit 1;

  if v_player_currency_code is null or length(v_player_currency_code) = 0 then
    raise exception 'STOCK_TRADING_PLAYER_CURRENCY_NOT_FOUND';
  end if;

  select balance.*
  into v_cash_balance
  from public.account_balances balance
  where balance.game_session_id = p_game_session_id
    and balance.player_id = v_player_session.player_id
    and balance.account_type = 'cash'
    and balance.currency_code = v_player_currency_code
  for update;

  if found then
    v_existing_cash_balance := v_cash_balance.balance;
  end if;

  v_gross_value := v_asset.current_price * p_quantity;

  select holding.*
  into v_holding
  from public.stock_holdings holding
  where holding.game_session_id = p_game_session_id
    and holding.player_id = v_player_session.player_id
    and holding.stock_asset_id = p_stock_asset_id
  for update;

  if found then
    v_existing_holding_quantity := v_holding.quantity;
    v_existing_average_cost := v_holding.average_cost;
  end if;

  if v_side = 'buy' then
    if v_existing_cash_balance < v_gross_value then
      insert into public.stock_orders (
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
        average_cost_after
      )
      values (
        p_game_session_id,
        p_player_session_id,
        v_player_session.player_id,
        p_stock_asset_id,
        v_asset.ticker,
        v_side,
        'market',
        p_quantity,
        null,
        v_asset.current_price,
        v_gross_value,
        'rejected',
        'insufficient_cash',
        v_idempotency_key,
        v_existing_cash_balance,
        v_player_currency_code,
        v_existing_holding_quantity,
        v_existing_average_cost
      )
      returning * into v_order;
    else
      insert into public.stock_holdings (
        game_session_id,
        player_session_id,
        player_id,
        stock_asset_id,
        ticker,
        quantity,
        reserved_quantity,
        average_cost,
        realized_pnl
      )
      values (
        p_game_session_id,
        p_player_session_id,
        v_player_session.player_id,
        p_stock_asset_id,
        v_asset.ticker,
        0,
        0,
        0,
        0
      )
      on conflict on constraint stock_holdings_scope_unique do nothing;

      select holding.*
      into v_holding
      from public.stock_holdings holding
      where holding.game_session_id = p_game_session_id
        and holding.player_id = v_player_session.player_id
        and holding.stock_asset_id = p_stock_asset_id
      for update;

      v_new_holding_quantity := v_holding.quantity + p_quantity;
      v_new_average_cost := (
        (v_holding.quantity * v_holding.average_cost) + v_gross_value
      ) / v_new_holding_quantity;

      insert into public.stock_orders (
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
        filled_at
      )
      values (
        p_game_session_id,
        p_player_session_id,
        v_player_session.player_id,
        p_stock_asset_id,
        v_asset.ticker,
        v_side,
        'market',
        p_quantity,
        null,
        v_asset.current_price,
        v_gross_value,
        'filled',
        null,
        v_idempotency_key,
        v_existing_cash_balance - v_gross_value,
        v_player_currency_code,
        v_new_holding_quantity,
        v_new_average_cost,
        now()
      )
      returning * into v_order;

      select *
      into v_ledger
      from public.record_player_ledger_entry(
        p_game_session_id,
        v_player_session.player_id,
        'cash',
        -v_gross_value,
        v_player_currency_code,
        'debit',
        'stocks',
        'stock_buy',
        v_order.id,
        'player',
        v_player_session.player_id,
        jsonb_build_object(
          'stock_asset_id', p_stock_asset_id,
          'ticker', v_asset.ticker,
          'quantity', p_quantity,
          'execution_price', v_asset.current_price,
          'gross_value', v_gross_value,
          'player_session_id', p_player_session_id
        )
      );

      if v_ledger.balance < 0 then
        raise exception 'STOCK_TRADING_NEGATIVE_CASH_BALANCE';
      end if;

      update public.stock_holdings holding
      set
        player_session_id = p_player_session_id,
        ticker = v_asset.ticker,
        quantity = v_new_holding_quantity,
        average_cost = v_new_average_cost
      where holding.id = v_holding.id
      returning * into v_holding;

      update public.stock_orders stock_order
      set
        cash_balance_after = v_ledger.balance,
        cash_currency_code = v_ledger.currency_code,
        holding_quantity_after = v_holding.quantity,
        average_cost_after = v_holding.average_cost
      where stock_order.id = v_order.id
      returning * into v_order;

      insert into public.stock_trades (
        order_id,
        game_session_id,
        player_session_id,
        player_id,
        stock_asset_id,
        ticker,
        side,
        quantity,
        execution_price,
        gross_value
      )
      values (
        v_order.id,
        p_game_session_id,
        p_player_session_id,
        v_player_session.player_id,
        p_stock_asset_id,
        v_asset.ticker,
        v_side,
        p_quantity,
        v_asset.current_price,
        v_gross_value
      );
    end if;
  else
    if v_existing_holding_quantity < p_quantity then
      insert into public.stock_orders (
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
        average_cost_after
      )
      values (
        p_game_session_id,
        p_player_session_id,
        v_player_session.player_id,
        p_stock_asset_id,
        v_asset.ticker,
        v_side,
        'market',
        p_quantity,
        null,
        v_asset.current_price,
        v_gross_value,
        'rejected',
        'insufficient_shares',
        v_idempotency_key,
        v_existing_cash_balance,
        v_player_currency_code,
        v_existing_holding_quantity,
        v_existing_average_cost
      )
      returning * into v_order;
    else
      v_new_holding_quantity := v_holding.quantity - p_quantity;
      v_new_average_cost := case
        when v_new_holding_quantity = 0 then 0
        else v_holding.average_cost
      end;
      v_realized_pnl := (v_asset.current_price - v_holding.average_cost) * p_quantity;

      insert into public.stock_orders (
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
        filled_at
      )
      values (
        p_game_session_id,
        p_player_session_id,
        v_player_session.player_id,
        p_stock_asset_id,
        v_asset.ticker,
        v_side,
        'market',
        p_quantity,
        null,
        v_asset.current_price,
        v_gross_value,
        'filled',
        null,
        v_idempotency_key,
        v_existing_cash_balance + v_gross_value,
        v_player_currency_code,
        v_new_holding_quantity,
        v_new_average_cost,
        now()
      )
      returning * into v_order;

      select *
      into v_ledger
      from public.record_player_ledger_entry(
        p_game_session_id,
        v_player_session.player_id,
        'cash',
        v_gross_value,
        v_player_currency_code,
        'credit',
        'stocks',
        'stock_sell',
        v_order.id,
        'player',
        v_player_session.player_id,
        jsonb_build_object(
          'stock_asset_id', p_stock_asset_id,
          'ticker', v_asset.ticker,
          'quantity', p_quantity,
          'execution_price', v_asset.current_price,
          'gross_value', v_gross_value,
          'realized_pnl', v_realized_pnl,
          'player_session_id', p_player_session_id
        )
      );

      update public.stock_holdings holding
      set
        player_session_id = p_player_session_id,
        ticker = v_asset.ticker,
        quantity = v_new_holding_quantity,
        average_cost = v_new_average_cost,
        realized_pnl = holding.realized_pnl + v_realized_pnl
      where holding.id = v_holding.id
      returning * into v_holding;

      update public.stock_orders stock_order
      set
        cash_balance_after = v_ledger.balance,
        cash_currency_code = v_ledger.currency_code,
        holding_quantity_after = v_holding.quantity,
        average_cost_after = v_holding.average_cost
      where stock_order.id = v_order.id
      returning * into v_order;

      insert into public.stock_trades (
        order_id,
        game_session_id,
        player_session_id,
        player_id,
        stock_asset_id,
        ticker,
        side,
        quantity,
        execution_price,
        gross_value
      )
      values (
        v_order.id,
        p_game_session_id,
        p_player_session_id,
        v_player_session.player_id,
        p_stock_asset_id,
        v_asset.ticker,
        v_side,
        p_quantity,
        v_asset.current_price,
        v_gross_value
      );
    end if;
  end if;

  order_id := v_order.id;
  game_session_id := v_order.game_session_id;
  player_session_id := v_order.player_session_id;
  player_id := v_order.player_id;
  stock_asset_id := v_order.stock_asset_id;
  ticker := v_order.ticker;
  side := v_order.side;
  quantity := v_order.quantity;
  execution_price := v_order.execution_price;
  gross_value := v_order.gross_value;
  status := v_order.status;
  rejection_reason := v_order.rejection_reason;
  cash_balance := v_order.cash_balance_after;
  cash_currency_code := v_order.cash_currency_code;
  holding_quantity := v_order.holding_quantity_after;
  average_cost := v_order.average_cost_after;

  return next;
end;
$$;
